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
const html=Buffer.from(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>화면 크기 검수</title>
 <style>body{margin:0;background:#101725;color:#eef4ff;font:18px sans-serif}main{padding:48px;min-height:3000px}h1{font-size:32px}.card{padding:24px;background:#1c2a42;border-radius:12px;max-width:600px}a{color:#c7ff82}</style>
 <main><h1>숲켓몬 글씨 크기</h1><div class="card">Ctrl + 마우스 휠로 화면 크기를 조절합니다.<p>Ctrl + 0 · 기본 크기로 복원</p><a href="/mercenary-codex/">화면 이동</a></div></main></html>`);
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
const profile=await mkdtemp(path.join(os.tmpdir(),'soop-client-zoom-'));
let electron,launcher,game;
const errors=[],checks=[];
const zoom=()=>electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev'))?.webContents.getZoomFactor());
async function expectZoom(expected,label){
 let actual;for(let n=0;n<50;n++){actual=await zoom();if(Math.abs(actual-expected)<0.0001){checks.push(label);return;}await new Promise(r=>setTimeout(r,50));}
 assert.fail(`${label}: expected zoom ${expected}, got ${actual}`);
}
async function wheel(delta,{control=false}={}){
 await game.mouse.move(350,250);
 if(control)await game.keyboard.down('Control');
 try{await game.mouse.wheel(0,delta);}finally{if(control)await game.keyboard.up('Control');}
}
async function start(){
 electron=await _electron.launch({executablePath:path.join(build,'node_modules/electron/dist/electron.exe'),args:[build,'--mute-audio'],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:`http://127.0.0.1:${server.address().port}`},timeout:30000});
 launcher=await electron.firstWindow();launcher.setDefaultTimeout(15000);
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await launcher.waitForFunction(()=>['다운로드','게임 시작'].includes(document.getElementById('playLabel')?.textContent));
 if(await launcher.locator('#playLabel').textContent()==='다운로드'){
  await launcher.locator('#playButton').click();await launcher.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='게임 시작');
 }
 const ready=electron.waitForEvent('window');await launcher.locator('#playButton').click();game=await ready;
 await electron.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.webContents.setBackgroundThrottling(false);});
 game.setDefaultTimeout(15000);game.on('pageerror',e=>errors.push(e.message));await game.locator('h1').waitFor();
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev')).showInactive());
}
try{
 await start();await expectZoom(1,'default 100%');
 await game.screenshot({path:path.join(output,'100-percent.png')});
 await wheel(240);await game.waitForFunction(()=>scrollY>0);await expectZoom(1,'ordinary wheel scrolls without zoom');
 await game.evaluate(()=>scrollTo(0,0));
 const initialDpr=await game.evaluate(()=>devicePixelRatio);
 await wheel(-120,{control:true});await expectZoom(1.1,'Ctrl+wheel up enlarges one step');
 await game.waitForFunction(()=>Math.abs(scrollY)<1);
 assert.ok((await game.evaluate(()=>devicePixelRatio))>initialDpr,'Chromium actually scales rendered content');
 await wheel(120,{control:true});await expectZoom(1,'Ctrl+wheel down reduces one step');
 await game.evaluate(()=>window.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,cancelable:true})));
 await game.waitForTimeout(80);await expectZoom(1,'untrusted page-generated wheel is ignored');
 await electron.evaluate(({BrowserWindow,ipcMain})=>{
  const windows=BrowserWindow.getAllWindows(),local=windows.find(w=>w.webContents.getURL().startsWith('file:')).webContents;
  const remote=windows.find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev')).webContents;
  ipcMain.emit('game:zoom',{sender:local,senderFrame:local.mainFrame},'in');
  ipcMain.emit('game:zoom',{sender:remote,senderFrame:{}},'in');
  ipcMain.emit('game:zoom',{sender:remote,senderFrame:remote.mainFrame},'invalid');
 });
 await expectZoom(1,'wrong sender, frame and command are ignored');
 await game.keyboard.press('Control+=');await expectZoom(1.1,'Ctrl+plus shortcut');
 await game.keyboard.press('Control+-');await expectZoom(1,'Ctrl+minus shortcut');
 await game.keyboard.press('Control+0');await expectZoom(1,'Ctrl+0 reset');
 for(let i=0;i<15;i++)await game.keyboard.press('Control+=');await expectZoom(2,'maximum 200%');
 await wheel(-120,{control:true});await expectZoom(2,'wheel respects maximum');
 for(let i=0;i<20;i++)await game.keyboard.press('Control+-');await expectZoom(.5,'minimum 50%');
 await wheel(120,{control:true});await expectZoom(.5,'wheel respects minimum');
 await game.keyboard.press('Control+0');await expectZoom(1,'reset from minimum');
 for(let i=0;i<5;i++)await game.keyboard.press('Control+=');await expectZoom(1.5,'150% selection');
 await game.screenshot({path:path.join(output,'150-percent.png')});
 await game.locator('a').click();await game.waitForURL('**/mercenary-codex/');await expectZoom(1.5,'navigation keeps zoom');
 await game.reload();await game.locator('h1').waitFor();await expectZoom(1.5,'reload keeps zoom');
 const popupReady=electron.waitForEvent('window');await game.evaluate(()=>window.open('/?zoomPopup=1'));
 const popup=await popupReady;await popup.locator('h1').waitFor();
 assert.ok(Math.abs(await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('zoomPopup=1')).webContents.getZoomFactor())-1.5)<.0001);
 await popup.keyboard.press('Control+-');await expectZoom(1.4,'allowed child window shares controls and size');
 await popup.close();await game.keyboard.press('Control+=');await expectZoom(1.5,'main window stays synchronized');
 assert.deepEqual(await game.evaluate(()=>({require:typeof require,process:typeof process,launcher:typeof soopLauncher})),{require:'undefined',process:'undefined',launcher:'undefined'});
 await electron.close();electron=null;
 await start();await expectZoom(1.5,'full application restart restores zoom');
 await game.keyboard.press('Control+0');await expectZoom(1,'reset after restart');
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev')).close());
 await launcher.locator('[data-panel=help]').click();
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(950,680));
 const bounds=await launcher.evaluate(()=>{const p=document.getElementById('playButton').getBoundingClientRect(),v=document.getElementById('helpPanel');return {playVisible:p.bottom<=innerHeight&&p.right<=innerWidth,overflow:v.scrollWidth>v.clientWidth,text:v.textContent};});
 assert(bounds.playVisible);assert.equal(bounds.overflow,false);assert.match(bounds.text,/Ctrl/);
 await launcher.screenshot({path:path.join(output,'launcher-help.png')});
 assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.path.startsWith('/api/')).length,0);
 await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,profile,checks,minimumLauncher:bounds,errors,productionRequests:0},null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks,errors,productionRequests:0}));
}catch(error){await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),checks,errors},null,2));throw error;}
finally{await electron?.close();await new Promise(resolve=>server.close(resolve));}
