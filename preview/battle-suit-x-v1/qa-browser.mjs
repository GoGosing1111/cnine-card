import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/',import.meta.url));await fs.mkdir(dir,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
  await page.goto('http://127.0.0.1:8973/preview/battle-suit-x-v1/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.XBodyPreview||document.getElementById('status').textContent.startsWith('준비 실패'),null,{timeout:60000});
  if(!await page.evaluate(()=>!!window.XBodyPreview))throw Error(await page.locator('#status').textContent());
  const snapshots=[];
  for(const [mode,at]of [['dash',.38],['attack',.37],['skill',.37],['skill',.64],['skill',.91],['skill',1.18],['skill',1.43],['skill',1.80],['skill',2.18],['skill',2.40]]){
   await page.evaluate(({mode,at})=>{const f=window.XBodyPreview.fx;f.setMode(mode);f.seek(at);},{mode,at});await page.waitForTimeout(100);
   snapshots.push(await page.evaluate(()=>window.XBodyPreview.diagnostics()));await page.locator('.battle-viewport').screenshot({path:dir+name+'-'+mode+'-'+at+'.png'});
  }
  const timing=await page.evaluate(async()=>{
   const f=window.XBodyPreview.fx,report=[];f.setMode('skill');
   for(const speed of[.25,1,2]){f.seek(0);f.setSpeed(speed);f.play();await new Promise(r=>setTimeout(r,280));f.pause();const a=f.time;await new Promise(r=>setTimeout(r,80));report.push({speed,advance:a,pauseStable:a===f.time});}
   f.cancel();return{speeds:report,stopped:f.diagnostics()};
  });
  await page.evaluate(()=>{window.XBodyPreview.fx.setMode('skill');window.XBodyPreview.fx.seek(2.40);});
  await page.screenshot({path:dir+name+'-page.png',fullPage:true});
  const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  results.push({name,errors,failures,overflow,snapshots,...timing});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(dir+'browser-report.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.map(r=>({name:r.name,errors:r.errors,failures:r.failures,overflow:r.overflow,speeds:r.speeds,stopped:r.stopped})),null,2));
if(results.some(r=>r.errors.length||r.failures.length||r.overflow.scroll>r.overflow.width||r.stopped.registeredTimelines||r.stopped.visibleEffects||r.stopped.visibleGhosts||r.speeds.some(s=>s.advance<=0||!s.pauseStable)||r.snapshots.filter(s=>s.mode==='attack'||s.mode==='skill'&&[.37,.64,.91,1.18,1.43,2.18].includes(s.time)).some(s=>!s.bladeContact.intersects||s.groundError>1e-8||s.bladeContact.u>.85||s.airborne)))process.exitCode=1;
