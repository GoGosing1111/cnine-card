import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const {_electron}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const [build,output]=process.argv.slice(2);
if(!build||!output)throw Error('Supply external client build and QA output directories');
await mkdir(output,{recursive:true});
const html=Buffer.from(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>숲켓몬 확인창 검수</title>
<script>window.actions=0;window.early=null;if(location.search.includes('early'))window.early=confirm('페이지 첫 스크립트 확인');</script>
<style>body{margin:0;background:#0c1422;color:#eef3fc;font:16px sans-serif;padding:48px}h1{font-size:28px}</style></head>
<body><h1>숲켓몬 확인창 검수</h1><p>운영 계정과 분리된 로컬 검수 화면입니다.</p></body></html>`);
const files=['/index.html','/mercenary-codex/index.html'].map(p=>({path:p,sha256:createHash('sha256').update(html).digest('hex'),bytes:html.length,essential:true}));
const manifest={schema:1,origin:'https://cnine-card.pages.dev',minimumClientVersion:'0.1.0',releaseId:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
const requests=[];
const server=createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;requests.push({path:p,method:req.method});
  res.setHeader('Content-Type',p.endsWith('.json')?'application/json':'text/html; charset=utf-8');
  if(p==='/client/windows/manifest.json')return res.end(JSON.stringify(manifest));
  if(files.some(f=>f.path===p))return res.end(html);
  res.statusCode=404;res.end('missing');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp(path.join(os.tmpdir(),'soop-client-dialogs-'));
let electron,game;
const errors=[],native=[],checks=[],stderr=[];
const watch=page=>{page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{native.push(dialog.type()+': '+dialog.message());void dialog.dismiss();});};
const closingKey=(page,key)=>page.keyboard.press(key).catch(error=>{if(!/Target page, context or browser has been closed/.test(error.message))throw error;});
async function openDialog(run,page=game){
  const ready=electron.waitForEvent('window',{timeout:12000});
  const result=page.evaluate(run);result.catch(()=>{});
  const dialog=await ready;watch(dialog);await dialog.locator('#dialogMessage').waitFor();
  await dialog.waitForFunction(()=>document.activeElement?.id==='cancel'||document.activeElement?.id==='accept'||document.activeElement?.id==='dialogInput');
  return {dialog,result};
}
async function layout(dialog,label){
  const bounds=await dialog.evaluate(()=>{
    const b=document.getElementById('accept').getBoundingClientRect(),scroll=document.querySelector('.message-scroll');
    return {width:innerWidth,height:innerHeight,buttonVisible:b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,scrolls:scroll.scrollHeight>scroll.clientHeight};
  });
  assert(bounds.buttonVisible,label+' action fits');assert(!bounds.overflow,label+' no horizontal overflow');return bounds;
}
async function captureDialog(name){
  // Capture the real native surface: CDP screenshot clips zoomed Electron windows.
  const capture=await electron.evaluate(async({BrowserWindow})=>{
    const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dialog.html'));
    for(let i=0;i<100&&!win.isVisible();i++)await new Promise(r=>setTimeout(r,20));
    if(!win.isVisible())throw Error('Dialog was not shown');
    await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const image=await win.webContents.capturePage();return {png:image.toPNG().toString('base64'),size:image.getSize()};
  });
  assert(capture.size.width>500&&capture.size.height>250,'native capture has the complete window');
  await writeFile(path.join(output,name),Buffer.from(capture.png,'base64'));
}
try{
  electron=await _electron.launch({executablePath:process.env.ELECTRON_PATH||path.join(build,'node_modules/electron/dist/electron.exe'),args:[build,'--mute-audio'],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:`http://127.0.0.1:${server.address().port}`},timeout:30000});
  electron.process().stderr.on('data',data=>stderr.push(String(data)));
  electron.on('window',watch);
  const launcher=await electron.firstWindow();watch(launcher);
  await launcher.waitForFunction(()=>['다운로드','게임 시작'].includes(document.getElementById('playLabel')?.textContent));
  if(await launcher.locator('#playLabel').textContent()==='다운로드'){
    await launcher.locator('#playButton').click();await launcher.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='게임 시작');
  }
  const ready=electron.waitForEvent('window');await launcher.locator('#playButton').click();game=await ready;await game.locator('h1').waitFor();
  await electron.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.webContents.setBackgroundThrottling(false);});
  const message='흰 정령의 자석 잠재력에 도전할까요?\n성공확률 5% · 성공/실패 시 잠재력 물약 1개 소모';
  let d=await openDialog(()=>{if(confirm('흰 정령의 자석 잠재력에 도전할까요?\n성공확률 5% · 성공/실패 시 잠재력 물약 1개 소모'))window.actions++;return window.actions;});
  assert.equal(await d.dialog.locator('#dialogMessage').textContent(),message);
  assert.equal(await d.dialog.evaluate(()=>document.activeElement.id),'cancel');
  await layout(d.dialog,'confirm');await captureDialog('confirm.png');
  let returned=false;void d.result.then(()=>{returned=true;});await new Promise(r=>setTimeout(r,100));assert.equal(returned,false,'caller still blocked before choice');
  await d.dialog.locator('#cancel').click();assert.equal(await d.result,0);checks.push('Cancel returns false synchronously; no follow-on action');
  d=await openDialog(()=>{if(confirm('보상을 받을까요?'))window.actions++;return window.actions;});await d.dialog.locator('#accept').click();assert.equal(await d.result,1);checks.push('Confirm executes exactly once');
  d=await openDialog(()=>confirm('닫기 취소'));await d.dialog.locator('#close').click();assert.equal(await d.result,false);
  d=await openDialog(()=>confirm('ESC 취소'));await closingKey(d.dialog,'Escape');assert.equal(await d.result,false);
  d=await openDialog(()=>confirm('기본 버튼 Enter'));await closingKey(d.dialog,'Enter');assert.equal(await d.result,false);
  d=await openDialog(()=>confirm('창 닫기 취소'));await d.dialog.close();assert.equal(await d.result,false);checks.push('X, Escape, default Enter and window close cancel');
  d=await openDialog(()=>{const result=alert('지급이 완료되었습니다.\n인벤토리에서 확인해 주세요.');return {result:typeof result,actions:window.actions};});
  assert.equal(await d.dialog.locator('#cancel').isVisible(),false);await captureDialog('alert.png');await d.dialog.locator('#accept').click();assert.deepEqual(await d.result,{result:'undefined',actions:1});checks.push('Alert blocks, acknowledges, and returns undefined');
  d=await openDialog(()=>prompt('선물 받을 닉네임을 입력하세요.','기본값'));
  assert.equal(await d.dialog.locator('#dialogInput').inputValue(),'기본값');await d.dialog.locator('#dialogInput').fill('나무늘봉순');await layout(d.dialog,'prompt');await captureDialog('prompt.png');await closingKey(d.dialog,'Enter');assert.equal(await d.result,'나무늘봉순');
  d=await openDialog(()=>prompt('빈 입력'));await d.dialog.locator('#accept').click();assert.equal(await d.result,'');
  d=await openDialog(()=>prompt('입력 취소','유지'));await d.dialog.locator('#cancel').click();assert.equal(await d.result,null);checks.push('Prompt preserves default, typed, empty and null results');
  d=await openDialog(()=>confirm('<img src=x onerror="window.injected=true">\n'+('긴 확인 문구와 수량 123,456 · '.repeat(200))));
  assert.equal(await d.dialog.locator('#dialogMessage img').count(),0);assert.equal(await d.dialog.evaluate(()=>window.injected),undefined);assert((await layout(d.dialog,'long text')).scrolls);
  await captureDialog('long-message.png');await d.dialog.locator('#cancel').click();await d.result;checks.push('Untrusted text is inert; long messages scroll above visible actions');
  // A game or launcher sender cannot supply a response for the independent dialog.
  d=await openDialog(()=>confirm('위조 응답 차단'));
  await electron.evaluate(({BrowserWindow,ipcMain})=>{for(const win of BrowserWindow.getAllWindows().filter(w=>!w.webContents.getURL().endsWith('/dialog.html'))){const sender=win.webContents;ipcMain.emit('game-dialog:result',{sender,senderFrame:sender.mainFrame},{accepted:true});}});
  assert.equal(await d.dialog.locator('#accept').isVisible(),true);await d.dialog.locator('#cancel').click();assert.equal(await d.result,false);
  const rejected=await electron.evaluate(({BrowserWindow,ipcMain})=>{
    const all=BrowserWindow.getAllWindows(),local=all.find(w=>w.webContents.getURL().startsWith('file:')).webContents,remote=all.find(w=>w.webContents.getURL().startsWith('https:')).webContents;
    return [{sender:local,senderFrame:local.mainFrame},{sender:remote,senderFrame:{}},{sender:remote,senderFrame:remote.mainFrame}].map((event,i)=>{ipcMain.emit('game:dialog',event,{kind:i===2?'unsupported':'confirm',message:'forged'});return event.returnValue;});
  });assert.deepEqual(rejected,[false,false,false]);checks.push('Wrong senders, frames and operations cannot open or accept dialogs');
  assert.deepEqual(await game.evaluate(()=>({node:typeof require,ipc:typeof ipcRenderer,launcher:typeof soopLauncher,dialog:typeof soopDialog})),{node:'undefined',ipc:'undefined',launcher:'undefined',dialog:'undefined'});
  // Preload must run before the first inline page script, including on new navigation.
  const earlyReady=electron.waitForEvent('window');const navigation=game.goto('https://cnine-card.pages.dev/mercenary-codex/?early=1');const early=await earlyReady;await early.locator('#cancel').click();await navigation;assert.equal(await game.evaluate(()=>window.early),false);checks.push('First inline script after navigation uses styled confirmation');
  const popupReady=electron.waitForEvent('window');await game.evaluate(()=>window.open('/?popup=1'));const popup=await popupReady;await popup.locator('h1').waitFor();
  d=await openDialog(()=>confirm('자식 창 확인'),popup);await d.dialog.locator('#accept').click();assert.equal(await d.result,true);checks.push('Allowed game popups use the same confirmation');
  d=await openDialog(()=>prompt('닫히는 창의 입력'),popup);
  const closedDialog=d.dialog.waitForEvent('close',{timeout:10000});
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('popup=1')).destroy());
  await d.result.then(value=>assert.equal(value,null),error=>assert.match(error.message,/closed|destroyed/));
  await closedDialog;assert(d.dialog.isClosed());checks.push('Closing the parent cancels and removes its pending dialog');
  await game.evaluate(()=>{const frame=document.createElement('iframe');frame.src='/mercenary-codex/?embedded=1';frame.name='embedded';document.body.append(frame);});
  await game.frameLocator('iframe[name="embedded"]').locator('h1').waitFor();const frame=game.frame({name:'embedded'});
  assert.deepEqual(await frame.evaluate(()=>({node:typeof require,process:typeof process,ipc:typeof ipcRenderer,launcher:typeof soopLauncher})),{node:'undefined',process:'undefined',ipc:'undefined',launcher:'undefined'});
  d=await openDialog(()=>confirm('콘텐츠 내부 프레임 확인'),frame);await d.dialog.locator('#cancel').click();assert.equal(await d.result,false);checks.push('Embedded content shares the UI with no Node or IPC exposure');
  await game.evaluate(()=>{const f=document.createElement('iframe');f.sandbox='allow-scripts allow-modals';f.srcdoc='<h1>Opaque frame</h1>';f.name='untrusted';document.body.append(f);});
  await game.frameLocator('iframe[name="untrusted"]').locator('h1').waitFor();
  const untrusted=await (await game.locator('iframe[name="untrusted"]').elementHandle()).contentFrame();assert.equal(await untrusted.evaluate(()=>confirm('외부 프레임 거부')),false);
  assert.equal(await untrusted.evaluate(()=>typeof require),'undefined');checks.push('Untrusted sandbox frames cannot open dialogs or reach Node');
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev')).showInactive());
  await game.evaluate(()=>window.actions=77);
  const reloadReady=electron.waitForEvent('window',{timeout:10000});
  // CDP keyboard injection does not emit Electron's before-input-event on all builds.
  await electron.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev'));win.show();win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode:'F5'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'F5'});});
  const reload=await reloadReady;await reload.locator('#dialogTitle').waitFor();assert.equal(await reload.locator('#accept').textContent(),'새로고침');await reload.locator('#cancel').click();assert.equal(await game.evaluate(()=>window.actions),77);checks.push('F5 uses shared UI and Cancel preserves the document');
  for(let i=0;i<10;i++)await game.keyboard.press('Control+=');
  d=await openDialog(()=>confirm('확대한 화면에서도\n확인 버튼과 내용이 잘 보이나요?'));
  const factors=await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),zoom:w.webContents.getZoomFactor()})));
  assert.equal(factors.find(w=>w.url.endsWith('/dialog.html')).zoom,2);assert.equal(factors.find(w=>w.url.endsWith('/renderer/index.html')).zoom,1);
  await layout(d.dialog,'200%');await captureDialog('confirm-large.png');await d.dialog.locator('#cancel').click();await d.result;await game.keyboard.press('Control+0');checks.push('Game display preference scales dialogs within monitor bounds');
  assert.deepEqual(native,[]);assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.path.startsWith('/api/')).length,0);
  await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,checks,errors,native,productionRequests:0,profile},null,2)+'\n');console.log(JSON.stringify({passed:true,checks}));
}catch(error){await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),checks,errors,native,stderr},null,2));throw error;}
finally{await electron?.close();await new Promise(resolve=>server.close(resolve));}
