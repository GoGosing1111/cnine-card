import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const { _electron }=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const build=process.argv[2],output=process.argv[3];if(!build||!output)throw new Error('Supply build directory and QA output directory');
await mkdir(output,{recursive:true});
const bodies={
 '/index.html':Buffer.from('<!doctype html><html><head><meta charset="utf-8"><title>격리 클라이언트 검수</title></head><body><h1 id="fixture">클라이언트 연결 검수</h1><img src="/assets/test.png"><script src="/js/fixture.js"></script></body></html>'),
 '/js/fixture.js':Buffer.from("document.cookie='qa-cookie=kept; Secure; SameSite=Lax';window.fixture=(async()=>{const r=await fetch('/api/echo',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer qa-token'},body:JSON.stringify({test:'no-production-write'})});window.echo=await r.json();window.fixtureReady=true;})();"),
 '/assets/test.png':await readFile(path.join(build,'renderer/assets/icon.png'))
};
const files=Object.entries(bodies).map(([p,b])=>({path:p,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length,essential:!p.startsWith('/assets')}));
const manifest={schema:1,origin:'https://cnine-card.pages.dev',minimumClientVersion:'0.1.0',releaseId:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
const requests=[];
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requests.push({path:pathname,method:req.method});
 // Only the QA transport maps the real HTTPS origin to a local HTTP fixture.
 if(req.headers.origin==='https://cnine-card.pages.dev'){
   res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
   res.setHeader('Access-Control-Allow-Headers','content-type,authorization');
   res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
   res.setHeader('Access-Control-Allow-Credentials','true');
 }
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(pathname==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
 if(pathname==='/api/echo'){const chunks=[];for await(const b of req)chunks.push(b);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({authorization:req.headers.authorization,cookie:req.headers.cookie,origin:req.headers.origin,body:Buffer.concat(chunks).toString()}));}
 if(bodies[pathname])return res.end(bodies[pathname]);res.statusCode=404;res.end('missing');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp(path.join(os.tmpdir(),'soop-client-browser-'));
const electron=await _electron.launch({executablePath:path.join(build,'node_modules/electron/dist/electron.exe'),args:[build],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:`http://127.0.0.1:${server.address().port}`},timeout:30000});
const errors=[];
try {
 const page=await electron.firstWindow();page.setDefaultTimeout(15000);await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='다운로드');

 await page.locator('#playButton').click();await page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='게임 시작');
 const screens=[];
 for(const [width,height] of [[1120,760],[950,680]]){
  await electron.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);
  for(const panel of ['game','resources','help']){
   await page.locator('[data-panel='+panel+']').click();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const metrics=await page.evaluate(()=>{const b=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {width:innerWidth,height:innerHeight,bodyOverflow:document.documentElement.scrollWidth>innerWidth,title:b('.title-art'),hero:b('.hero'),account:b('.hero-account'),play:b('#playButton'),stage:b('.stage')};});
   const shot=await electron.evaluate(async({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('file:'));await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});return (await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64');});
   await writeFile(path.join(output,width+'x'+height+'-'+panel+'.png'),Buffer.from(shot,'base64'));
   await writeFile(path.join(output,'latest-metrics.json'),JSON.stringify({width,height,panel,metrics},null,2));
   assert.equal(metrics.bodyOverflow,false,'Launcher horizontal overflow');assert(metrics.play.width>=44&&metrics.play.height>=44);assert(metrics.play.bottom<=metrics.height);
   if(panel==='game'){assert(metrics.title.right<=metrics.width,'Title clipped');assert(metrics.account.bottom<=metrics.hero.bottom,'Hero copy clipped');}
   screens.push({width,height,panel,metrics});
  }
 }
 await fsWriteScreens();
 async function fsWriteScreens(){await writeFile(path.join(output,'screens.json'),JSON.stringify(screens,null,2));}
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,scope:'Final purple panel visual checks',profile,errors},null,2));
}finally{await electron.close();await new Promise(resolve=>server.close(resolve));}
