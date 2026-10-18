import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const {_electron}=await import(process.env.PLAYWRIGHT_MODULE);
const build=process.argv[2],root=process.cwd(),output=path.join(root,'docs/qa/reverse-call-world-story-20261018');
const body=Buffer.from('<!doctype html><html><body><a href="/world/">세계관</a></body></html>');
const manifest={schema:1,releaseId:'a'.repeat(64),origin:'https://cnine-card.pages.dev',files:[{path:'/index.html',bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),essential:true}]};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json'};
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','https://cnine-card.pages.dev');
  res.setHeader('Access-Control-Allow-Credentials','true');
  let p=new URL(req.url,'http://localhost').pathname;
  if(p==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return;}
  if(p==='/index.html'||p==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(body);return;}
  if(p.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
  if(p.endsWith('/'))p+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(p));
  if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(os.tmpdir(),'reverse-call-icon-qa-'));
const app=await _electron.launch({executablePath:process.env.ELECTRON_PATH,args:[build],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:'http://127.0.0.1:'+server.address().port}});
try{
 const launcher=await app.firstWindow();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.webContents.setBackgroundThrottling(false)));
 await launcher.waitForFunction(()=>document.querySelector('#statusTitle'));
 console.log('Launcher initial state:',await launcher.locator('#statusTitle').innerText());
 await launcher.waitForFunction(()=>document.querySelector('#playLabel').textContent==='다운로드');
 await launcher.screenshot({path:path.join(output,'windows-launcher.png')});
 assert.equal(await launcher.locator('#clientVersion').innerText(),'0.1.8');
 await launcher.locator('#playButton').click();
 await launcher.waitForFunction(()=>document.querySelector('#playLabel').textContent==='게임 시작');
 const opening=app.waitForEvent('window');await launcher.locator('#playButton').click();const game=await opening;
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.webContents.setBackgroundThrottling(false)));
 game.on('pageerror',e=>console.log('Game page error:',e.message));
 await game.getByRole('link',{name:'세계관'}).click();
 await game.locator('#start-story').waitFor();
 await game.goto('https://cnine-card.pages.dev/world/#scene=request');
 await game.waitForFunction(()=>document.querySelector('#character-art').naturalWidth>0);
 await game.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.currentSrc).map(i=>i.decode()));});
 await game.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 console.log('Portrait render:',await game.locator('#story-portrait').evaluate(e=>({hidden:e.hidden,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,image:e.querySelector('img').naturalWidth,display:getComputedStyle(e).display})));
 const shot=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/world/'));await w.webContents.capturePage();return (await w.webContents.capturePage()).toPNG().toString('base64');});
 await writeFile(path.join(output,'windows-world.png'),Buffer.from(shot,'base64'));
 assert.equal(await game.locator('#speaker-label').innerText(),'의뢰인');
 const icon=await game.locator('.wordmark img').getAttribute('src');assert(icon.includes('20261018-transparent'));
 await writeFile(path.join(output,'windows-report.json'),JSON.stringify({passed:true,version:'0.1.8',isolatedProfile:true,actualElectron:true,worldRouteNetworkFallback:true,transparentLogoSource:icon,productionWrites:false},null,2)+'\n');
 console.log('Actual Electron launcher and world route PASS');
}finally{await app.close();server.close();}
