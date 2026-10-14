import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
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
 if(pathname==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
 if(pathname==='/api/echo'){const chunks=[];for await(const b of req)chunks.push(b);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({authorization:req.headers.authorization,cookie:req.headers.cookie,body:Buffer.concat(chunks).toString()}));}
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
 const before=requests.length;
 await page.locator('#playButton').click();
 let game;for(let n=0;n<100;n++){game=electron.windows().find(p=>p!==page);if(game)break;await new Promise(r=>setTimeout(r,50));}
 assert(game,'game window opened');game.setDefaultTimeout(15000);game.on('pageerror',e=>errors.push(e.message));
 await game.waitForFunction(()=>window.fixtureReady===true);
 assert.deepEqual(await game.evaluate(()=>({require:typeof require,process:typeof process,bridge:typeof window.soopLauncher})),{require:'undefined',process:'undefined',bridge:'undefined'});
 const echo=await game.evaluate(()=>window.echo);assert.equal(echo.authorization,'Bearer qa-token');assert.deepEqual(JSON.parse(echo.body),{test:'no-production-write'});
 assert.match(await game.evaluate(()=>document.cookie),/qa-cookie=kept/);
 assert.equal(await game.evaluate(()=>location.origin),'https://cnine-card.pages.dev');
 assert.equal(await game.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)),0);
 const response=await game.evaluate(async()=>{const r=await fetch('/js/fixture.js?v=other');return {disk:r.headers.get('X-Soopketmon-Resource'),text:await r.text()};});assert.equal(response.disk,'disk');
 await game.locator('img').evaluate(img=>img.decode());
 const firstDownloads=requests.filter(r=>Object.hasOwn(bodies,r.path)).length;assert.equal(firstDownloads,3);
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev')).close());
 await page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='게임 시작');
 await page.locator('[data-panel=resources]').click();
 await page.locator('#repairButton').click();await page.waitForFunction(()=>document.getElementById('statusDescription')?.textContent.includes('복구를 마쳤습니다'));
 assert.equal(requests.filter(r=>Object.hasOwn(bodies,r.path)).length,firstDownloads);
 await page.locator('#playButton').click();
 for(let n=0;n<100;n++){game=electron.windows().find(p=>p!==page);if(game)break;await new Promise(r=>setTimeout(r,50));}
 await game.waitForFunction(()=>window.fixtureReady===true);await game.locator('img').evaluate(img=>img.decode());
 assert.equal(requests.filter(r=>Object.hasOwn(bodies,r.path)).length,firstDownloads,'repeat game launch uses all cached static files');
 assert.equal(requests.filter(r=>r.path==='/api/echo').length,2,'API is sent online each game session');
 assert.deepEqual(errors,[]);
 await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,profile,staticDownloads:firstDownloads,repeatStaticDownloads:0,apiRequests:2,authorizationBodyAndSessionCookieVerified:true,remoteNodeAndBridgeDisabled:true,serviceWorkers:0,errors},null,2));
 console.log('Windows launcher browser checks passed.');
}catch(error){console.error(error);await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),requests,errors},null,2));throw error;}
finally{await electron.close();await new Promise(resolve=>server.close(resolve));}
