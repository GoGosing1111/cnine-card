import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {_electron}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const [build,manifestPath,output]=process.argv.slice(2);
if(!build||!manifestPath||!output)throw Error('Supply external client build, source manifest, and QA output paths');
await mkdir(output,{recursive:true});
const fixture='http://127.0.0.1:8962';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const boot=Buffer.from(await (await fetch(fixture+'/index.html')).arrayBuffer());
const entry=manifest.files.find(f=>f.path==='/index.html');entry.bytes=boot.length;entry.sha256=createHash('sha256').update(boot).digest('hex');
manifest.releaseId=createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
const requests=[];
const server=createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,fixture);requests.push({path:url.pathname,method:req.method});
 if(url.pathname==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
 if(url.pathname==='/index.html'){res.setHeader('Content-Type','text/html');return res.end(boot);}
 const chunks=[];for await(const b of req)chunks.push(b);
 const r=await fetch(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual'});
 res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await r.arrayBuffer()));
 }catch(e){res.statusCode=500;res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp(path.join(os.tmpdir(),'soop-client-game-'));
const electron=await _electron.launch({executablePath:path.join(build,'node_modules/electron/dist/electron.exe'),args:[build,'--mute-audio'],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:`http://127.0.0.1:${server.address().port}`},timeout:30000});
let page,game;const errors=[],dialogs=[],failures=[];
try{
 page=await electron.firstWindow();page.setDefaultTimeout(20000);await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 // Check Electron's native fetch redirect response against a public read only URL.
 const redirect=await electron.evaluate(async({session})=>{const r=await fetch('https://cnine-card.pages.dev/index.html?desktopProbe=1',{redirect:'manual'});await r.body?.cancel();return {status:r.status,location:r.headers.get('location')};});
 assert.equal(redirect.status,308);assert(redirect.location?.startsWith('/'));console.log('Native Pages redirect supported');
 await page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='다운로드');
 await page.locator('#playButton').click();
 await page.waitForFunction(()=>['게임 시작','다시 확인'].includes(document.getElementById('playLabel')?.textContent),null,{timeout:120000});
 assert.equal(await page.locator('#playLabel').textContent(),'게임 시작',await page.locator('#statusDescription').textContent());
 console.log('Full game required resources ready: '+manifest.files.filter(f=>f.essential).length);
 await page.screenshot({path:path.join(output,'launcher-ready.png')});
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(950,680));
 await page.locator('[data-panel=help]').click();await page.waitForTimeout(220);
 const bounds=await page.evaluate(()=>{const p=document.getElementById('playButton').getBoundingClientRect(),v=document.getElementById('helpPanel');return {playVisible:p.bottom<=innerHeight&&p.right<=innerWidth,overflow:v.scrollWidth>v.clientWidth};});
 assert(bounds.playVisible);assert.equal(bounds.overflow,false);await page.screenshot({path:path.join(output,'launcher-minimum-help.png')});
 await page.locator('[data-panel=game]').click();await page.waitForTimeout(220);
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));
 await page.locator('#playButton').click();
 for(let n=0;n<100;n++){game=electron.windows().find(p=>p!==page);if(game)break;await new Promise(r=>setTimeout(r,50));}
 assert(game);game.setDefaultTimeout(20000);game.on('pageerror',e=>errors.push(e.message));game.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});game.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()});});
 await game.waitForURL('https://cnine-card.pages.dev/?source=windows-client',{waitUntil:'load',timeout:60000});
 await game.goto('https://cnine-card.pages.dev/?screen=battle&source=windows-client',{waitUntil:'domcontentloaded'});
 await game.waitForFunction(()=>!!window.CNineCoreRaidBridge);
 await game.locator('#pveRaidHubView').waitFor({state:'attached'});await game.locator('[data-pve-mode="raid"]').click();
 await game.evaluate(async()=>{await CoreProtocolRaidV1924.openActive();});
 await game.waitForFunction(()=>document.getElementById('coreRaidTab')?.hidden===false);await game.locator('#coreRaidTab').click();
 await game.locator('[data-core-action="battle"]').waitFor({state:'visible'});await game.locator('[data-core-action="battle"]').click();
 await game.waitForFunction(()=>document.querySelector('#modal canvas')&&!document.getElementById('modal').classList.contains('battle-v3-preparing'),null,{timeout:60000});
 await game.locator('#modal canvas').waitFor({state:'visible',timeout:30000});
 const state=await game.evaluate(()=>({origin:location.origin,engine:ProjectVPixiBattle.runtimeVersion,ready:FEATURE_RESOURCE_MANIFEST.battleV2.ready(),status:document.querySelector('#pvBattleStatus')?.textContent,diagnostics:ProjectVPixiBattle.diagnostics()}));
 await game.screenshot({path:path.join(output,'native-core-raid.png')});
 assert(state.ready);assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);assert.equal(requests.filter(r=>r.path==='/api/raid/core/battle').length,1);
 await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,profile,state,redirect,minimumWindow:bounds,localApiRequests:requests.filter(r=>r.path.startsWith('/api/')).length,battleRequests:1,downloadedObjects:requests.filter(r=>!r.path.startsWith('/api/')).length,errors,dialogs,failures},null,2));
 console.log('Native client real V3 core raid passed');
}catch(e){console.error(e);if(page)await page.screenshot({path:path.join(output,'launcher-failure.png')}).catch(()=>{});if(game)await game.screenshot({path:path.join(output,'game-failure.png')}).catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(e.stack),errors,dialogs,failures,requests},null,2));throw e;}
finally{await electron.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
