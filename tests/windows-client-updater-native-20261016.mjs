import {cp,mkdir,mkdtemp,readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {_electron}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const [sourceBuild,output]=process.argv.slice(2);
if(!sourceBuild||!output)throw Error('Supply external dependency build and QA output directory');
await mkdir(output,{recursive:true});
const root=await mkdtemp(path.join(os.tmpdir(),'soop-update-native-')),profile=path.join(root,'profile');
const inside=file=>{const p=path.resolve(file);assert(p.startsWith(root+path.sep));return p;};
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const waitFor=async(fn,label)=>{for(let i=0;i<300;i++){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+label);};
const run=(file,args,cwd=root)=>new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd,windowsHide:true,stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(file+' exit '+code)));});
const registry=guid=>spawnSync('reg.exe',['query','HKCU\\Software\\'+guid],{windowsHide:true,encoding:'utf8'});
const productionGuid='c69fcbf2-955f-5c48-8ff1-55c03889cb40',productionBefore=registry(productionGuid);
const guid=randomUUID(),id='kr.yakcode.soopketmon.updateqa.'+guid,exe='SoopketmonUpdateQA';
const versions=['0.1.5','0.1.6'],html=Buffer.from('<!doctype html><meta charset="utf-8"><h1>자동 업데이트 격리 검수</h1><a href="/popup.html" target="_blank" id="popup">새 창</a>');
const files=[{path:'/index.html',sha256:createHash('sha256').update(html).digest('hex'),bytes:html.length,essential:true}];
const manifest={schema:1,origin:'https://cnine-card.pages.dev',minimumClientVersion:'0.1.0',releaseId:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
let mode='offline',newBuild,metadata,installer,downloadRequests=0;
const server=createServer(async(req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
  if(p==='/index.html'||p==='/popup.html'){res.setHeader('Content-Type','text/html');return res.end(html);}
  if(p==='/updates/latest.yml'&&mode!=='offline'){res.setHeader('Content-Type','text/yaml');return res.end(metadata);}
  if(p.endsWith('.exe')&&mode!=='offline'){
    downloadRequests++;res.setHeader('Content-Type','application/octet-stream');
    if(mode==='corrupt')return res.end('invalid installer bytes');
    res.setHeader('Content-Length',(await stat(installer)).size);return createReadStream(installer).pipe(res);
  }
  res.writeHead(404);res.end('unavailable');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let electron,installed=false,target=inside(path.join(root,'한글 설치 폴더',exe));
const errors=[],checks=[],stderr=[];
try{
  for(const version of versions){
    const build=inside(path.join(root,version));await mkdir(build,{recursive:true});
    // Only these QA copies replace production identity, transport and userData.
    // No production build accepts a packaged-app QA environment override.
    for(const name of ['main.mjs','preload.cjs','game-preload.cjs','lib','renderer','package.json','build-resources'])await cp(path.join(sourceBuild,name),path.join(build,name),{recursive:true});
    const config=JSON.parse(await readFile(path.join(build,'package.json'),'utf8'));
    config.name='soopketmon-updateqa-'+guid;config.productName='Soopketmon Update QA';config.version=version;
    config.build.appId=id;config.build.productName=config.productName;config.build.artifactName='UpdateQA-${version}-${arch}.${ext}';config.build.win.executableName=exe;
    config.build.publish={provider:'generic',url:origin+'/updates/'};
    config.build.nsis={...config.build.nsis,guid,createDesktopShortcut:false,createStartMenuShortcut:false,shortcutName:config.productName};
    await writeFile(path.join(build,'package.json'),JSON.stringify(config,null,2));
    const lock=JSON.parse(await readFile(path.join(sourceBuild,'package-lock.json'),'utf8'));
    lock.name=config.name;lock.version=version;lock.packages[''].name=config.name;lock.packages[''].version=version;
    await writeFile(path.join(build,'package-lock.json'),JSON.stringify(lock,null,2));
    let main=await readFile(path.join(build,'main.mjs'),'utf8');
    main=main.replace("const qa=!app.isPackaged && process.env.SOOPKETMON_QA==='1';",`const qa=true;process.env.SOOPKETMON_QA_ROOT=${JSON.stringify(profile)};process.env.SOOPKETMON_QA_SERVER=${JSON.stringify(origin)};`);
    main+=`\n// QA-only automatic restart receipt; never shipped.\napp.whenReady().then(async()=>{if(app.getVersion()!=='0.1.6')return;await new Promise(r=>setTimeout(r,1500));const fs=await import('node:fs/promises');await fs.writeFile(${JSON.stringify(path.join(root,'restarted.json'))},JSON.stringify({version:app.getVersion(),executable:app.getPath('exe'),userData:app.getPath('userData'),cookies:await session.fromPartition('persist:soopketmon-game-v1').cookies.get({name:'update-qa-session'})}));app.quit();});\n`;
    await writeFile(path.join(build,'main.mjs'),main);
    // npm/electron-builder cannot reliably enumerate transitive dependencies
    // through a Windows node_modules junction. Install the locked runtime tree.
    await run(process.execPath,[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],build);
    await run(process.execPath,[path.join(sourceBuild,'node_modules/electron-builder/out/cli/cli.js'),'--win','nsis','--x64','--publish','never','--config.electronDist='+path.join(sourceBuild,'node_modules/electron/dist')],build);
    if(version===versions[1])newBuild=build;
  }
  metadata=await readFile(path.join(newBuild,'release/latest.yml'),'utf8');installer=path.join(newBuild,'release/UpdateQA-0.1.6-x64.exe');
  await run(path.join(root,'0.1.5/release/UpdateQA-0.1.5-x64.exe'),['/S','/D='+target]);installed=true;
  assert.equal(registry(guid).status,0);
  const oldHash=await hash(path.join(target,'resources/app.asar'));const newHash=await hash(path.join(newBuild,'release/win-unpacked/resources/app.asar'));
  assert.notEqual(oldHash,newHash);
  electron=await _electron.launch({executablePath:path.join(target,exe+'.exe'),args:[],timeout:30000});
  electron.process().stderr.on('data',data=>stderr.push(String(data)));
  const page=await electron.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.waitForFunction(async()=>{const s=await window.soopLauncher.getState();return s.clientUpdate?.status==='error'&&s.phase==='available';});checks.push('offline update feed leaves game available');
  await page.locator('#playButton').click();await page.waitForFunction(()=>document.getElementById('playLabel').textContent==='게임 시작');
  mode='corrupt';await page.locator('#checkButton').click();
  await page.waitForFunction(async()=>(await window.soopLauncher.getState()).clientUpdate?.status==='error');
  assert(downloadRequests>0);assert.equal(await hash(path.join(target,'resources/app.asar')),oldHash);checks.push('real updater rejects mismatched SHA-512 without replacing app');
  mode='valid';await page.locator('#checkButton').click();
  await page.waitForFunction(async()=>(await window.soopLauncher.getState()).clientUpdate?.status==='ready',{},{timeout:60000});
  assert.equal(await hash(path.join(target,'resources/app.asar')),oldHash);checks.push('download waits for explicit restart');
  await electron.evaluate(async({session})=>{const s=session.fromPartition('persist:soopketmon-game-v1');await s.cookies.set({url:'https://cnine-card.pages.dev',name:'update-qa-session',value:'preserved',secure:true,httpOnly:true,expirationDate:Date.now()/1000+86400});await s.cookies.flushStore();});
  await page.locator('#playButton').click();
  await waitFor(()=>electron.windows().length===2,'game opens');const game=electron.windows().find(w=>w!==page);await game.locator('h1').waitFor();
  await game.keyboard.press('Control+=');
  await waitFor(async()=>{try{return JSON.parse(await readFile(path.join(profile,'game-display-v1.json'),'utf8')).zoomFactor===1.1;}catch{return false;}},'zoom persists');
  const denied=await page.evaluate(()=>window.soopLauncher.command('restart-client').then(()=>false,e=>e.message));assert.match(denied,/게임 창을 모두 닫고/);
  await game.locator('#popup').click();await waitFor(()=>electron.windows().length===3,'popup opens');
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('?source=windows-client')).close());
  await page.waitForFunction(async()=>(await window.soopLauncher.getState()).gameOpen===true);
  assert.match(await page.evaluate(()=>window.soopLauncher.command('restart-client').then(()=>'',e=>e.message)),/게임 창을 모두 닫고/);checks.push('game and surviving popup both prevent installation');
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().startsWith('https://')).forEach(w=>w.close()));
  await page.waitForFunction(()=>!document.getElementById('restartClientButton').disabled);
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(950,680);w.showInactive();});
  await page.screenshot({path:path.join(output,'update-ready.png')});
  const activeBefore=await readFile(path.join(profile,'resources-v1/active.json'),'utf8');
  const displayBefore=await readFile(path.join(profile,'game-display-v1.json'),'utf8');
  await page.locator('#restartClientButton').click();
  await waitFor(async()=>{try{return JSON.parse(await readFile(path.join(root,'restarted.json'),'utf8')).version==='0.1.6';}catch{return false;}},'NSIS installs and launches new version');
  const restarted=JSON.parse(await readFile(path.join(root,'restarted.json'),'utf8'));
  assert.equal(restarted.executable.toLowerCase(),path.join(target,exe+'.exe').toLowerCase());assert.equal(restarted.userData,profile);
  assert.equal(restarted.cookies[0]?.value,'preserved');assert.equal(await hash(path.join(target,'resources/app.asar')),newHash);
  assert.equal(await readFile(path.join(profile,'game-display-v1.json'),'utf8'),displayBefore);
  assert.equal(await readFile(path.join(profile,'resources-v1/active.json'),'utf8'),activeBefore);
  checks.push('real silent NSIS update and automatic restart','custom Unicode install path preserved','login cookie, display preference and resource cache preserved');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,root,versions,checks,downloadRequests,oldHash,newHash,restarted,productionRegistrationUnchanged:true,errors},null,2)+'\n');
  console.log('Windows launcher real automatic update PASS');
}catch(error){await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),root,mode,checks,errors,stderr},null,2));throw error;}
finally{
  await electron?.close().catch(()=>{});
  if(installed){const uninstaller=(await readdir(target)).find(n=>/^Uninstall.*\.exe$/i.test(n));if(uninstaller)await run(inside(path.join(target,uninstaller)),['/S','--currentuser']);}
  const productionAfter=registry(productionGuid);assert.equal(productionAfter.status,productionBefore.status);assert.equal(productionAfter.stdout,productionBefore.stdout,'production registration unchanged');
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
