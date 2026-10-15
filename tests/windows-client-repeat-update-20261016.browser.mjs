import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {_electron}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const [build,output]=process.argv.slice(2);if(!build||!output)throw new Error('Supply build directory and QA output directory');
await mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const bodies={
 '/index.html':Buffer.from('<!doctype html><meta charset="utf-8"><h1>변경 파일 검수</h1><img src="/assets/test.png"><script src="/js/fixture.js"></script>'),
 '/js/fixture.js':Buffer.from('window.fixtureVersion=1;'),
 '/assets/test.png':await readFile(path.join(build,'renderer/assets/icon.png'))
};
const makeManifest=()=>{const files=Object.entries(bodies).map(([p,b])=>({path:p,sha256:hash(b),bytes:b.length,essential:!p.startsWith('/assets')}));return {schema:1,origin:'https://cnine-card.pages.dev',minimumClientVersion:'0.1.0',releaseId:hash(JSON.stringify(files)),files};};
let manifest=makeManifest();const requests=[],checks=[];
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requests.push({path:pathname,method:req.method});
 if(pathname==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
 if(bodies[pathname]){res.setHeader('Content-Length',bodies[pathname].length);return res.end(bodies[pathname]);}
 res.statusCode=404;res.end('missing');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp(path.join(os.tmpdir(),'soop-repeat-update-'));
const electron=await _electron.launch({executablePath:path.join(build,'node_modules/electron/dist/electron.exe'),args:[build],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:`http://127.0.0.1:${server.address().port}`},timeout:30000});
const errors=[];let page;
const downloads=()=>requests.filter(r=>Object.hasOwn(bodies,r.path));
try{
 page=await electron.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='다운로드');
 await page.evaluate(()=>{window.states=[];window.soopLauncher.onState(s=>window.states.push(s));});
 const states=()=>page.evaluate(()=>window.states);
 const reset=()=>page.evaluate(()=>{window.states=[];});
 const ready=()=>page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='게임 시작');
 const play=async version=>{
  await reset();const opened=electron.waitForEvent('window',{predicate:p=>p!==page});await page.locator('#playButton').click();
  const game=await opened;
  game.on('pageerror',e=>errors.push(e.message));await game.waitForFunction(v=>window.fixtureVersion===v,version);
  await game.locator('img').evaluate(img=>img.decode());
  assert.equal((await states()).some(s=>s.phase==='downloading'),false,'ready launch skips installation phase');
  return game;
 };
 const closeGame=async()=>{await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().startsWith('https:')).forEach(w=>w.close()));await ready();};
 await page.locator('#playButton').click();await ready();
 assert.equal(downloads().length,2);await play(1);assert.equal(downloads().length,3);await closeGame();
 await play(1);assert.equal(downloads().length,3);await closeGame();
 checks.push({case:'unchanged repeat start',resourceDownloads:0,installationPhase:false});
 // A new optional asset changes the release ID but must not require an install.
 bodies['/assets/unused.png']=Buffer.from('unused optional asset');manifest=makeManifest();await reset();
 await page.evaluate(()=>window.soopLauncher.command('check'));await ready();
 assert.equal((await states()).some(s=>['available','downloading'].includes(s.phase)),false);
 assert.equal((await page.evaluate(()=>window.soopLauncher.getState())).releaseId,manifest.releaseId.slice(0,12));
 assert.equal(downloads().length,3);assert.match(await page.locator('#progressText').innerText(),/추가 다운로드 없음/);
 await play(1);assert.equal(downloads().length,3);await closeGame();
 checks.push({case:'optional-only release',resourceDownloads:0,installationPhase:false});
 bodies['/js/fixture.js']=Buffer.from('window.fixtureVersion=2;');manifest=makeManifest();await reset();
 await page.evaluate(()=>window.soopLauncher.command('check'));
 await page.waitForFunction(()=>document.getElementById('playLabel')?.textContent==='다운로드');
 let state=await page.evaluate(()=>window.soopLauncher.getState());assert.equal(state.plan.downloadBytes,bodies['/js/fixture.js'].length);
 await page.locator('#playButton').click();await ready();
 const progress=(await states()).filter(s=>s.progress).at(-1).progress;
 assert.equal(progress.downloadTotal,bodies['/js/fixture.js'].length);assert.equal(progress.transferred,progress.downloadTotal);
 assert.equal(downloads().length,4);await play(2);assert.equal(downloads().length,4);await closeGame();
 checks.push({case:'one changed essential file',resourceDownloads:1,downloadBytes:progress.transferred,allCheckedBytes:progress.total});
 // A manual integrity repair still repairs a same-length corrupted essential.
 const scriptEntry=manifest.files.find(f=>f.path==='/js/fixture.js');
 await writeFile(path.join(profile,'resources-v1/objects',scriptEntry.sha256),Buffer.alloc(scriptEntry.bytes,120));
 await reset();await page.locator('[data-panel=resources]').click();await page.locator('#repairButton').click();
 await page.waitForFunction(()=>document.getElementById('statusDescription')?.textContent.includes('복구를 마쳤습니다'));
 assert.equal(downloads().length,5);state=(await states()).filter(s=>s.progress).at(-1).progress;
 assert.equal(state.downloadTotal,scriptEntry.bytes);assert.equal(state.transferred,scriptEntry.bytes);
 await play(2);assert.equal(downloads().length,5);await closeGame();
 checks.push({case:'same-length corruption repair',resourceDownloads:1,downloadBytes:state.transferred});
 await page.screenshot({path:path.join(output,'no-update.png')});assert.deepEqual(errors,[]);
 await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,checks,staticDownloads:downloads().length,productionRequests:0,errors},null,2));
 console.log('Windows repeat-update checks passed: '+checks.length);
}catch(error){await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),checks,requests,errors},null,2));throw error;}
finally{await electron.close();await new Promise(resolve=>server.close(resolve));}
