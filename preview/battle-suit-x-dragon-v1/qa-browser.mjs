import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/',import.meta.url));await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()});});
  await page.goto('http://127.0.0.1:8973/preview/battle-suit-x-dragon-v1/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.XBodyDragonPreview||document.getElementById('status').textContent.startsWith('준비 실패'),null,{timeout:60000});
  if(!await page.evaluate(()=>!!window.XBodyDragonPreview))throw Error(await page.locator('#status').textContent());
  const snapshots=[];
  for(const at of[.62,1.08,1.64,2.18,2.30,2.42,3.15,4.3]){
   await page.evaluate(at=>window.XBodyDragonPreview.fx.seek(at),at);await page.waitForTimeout(90);
   snapshots.push(await page.evaluate(()=>window.XBodyDragonPreview.diagnostics()));
   await page.locator('.battle-viewport').screenshot({path:dir+name+'-dragon-'+at+'.png'});
  }
  const timing=await page.evaluate(async()=>{
   const r=window.XBodyDragonPreview,f=r.fx,report=[];
   for(const speed of[.25,1,2]){f.seek(0);f.setSpeed(speed);f.play();await new Promise(r=>setTimeout(r,350));f.pause();const a=f.time;await new Promise(r=>setTimeout(r,100));report.push({speed,advance:a,pauseStable:a===f.time});}
   f.cancel();const stopped=f.diagnostics();r.select('skill',false);r.fx.seek(2.18);const comparison=r.diagnostics();r.select('dragon',false);
   r.fx.seek(.80);r.fx.setEffects(false);
   return{speeds:report,stopped,comparison,effectsOff:!r.fx.front.visible&&!r.fx.back.visible};
  });
  await page.locator('.battle-viewport').screenshot({path:dir+name+'-body-only.png'});
  await page.evaluate(()=>{const f=window.XBodyDragonPreview.fx;f.setEffects(true);f.seek(1.64);});
  await page.screenshot({path:dir+name+'-page.png',fullPage:true});
  const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  await page.evaluate(()=>window.XBodyDragonPreview.dispose());
  results.push({name,errors,failures,overflow,snapshots,...timing});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(dir+'browser-report.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({name:r.name,errors:r.errors,failures:r.failures,overflow:r.overflow,speeds:r.speeds,stopped:r.stopped,comparison:r.comparison,effectsOff:r.effectsOff})),null,2));
if(results.some(r=>r.errors.length||r.failures.length||r.overflow.scroll>r.overflow.width||r.stopped.registeredTimelines||r.stopped.visibleEffects||r.stopped.visibleGhosts||!r.effectsOff||r.speeds.some(s=>s.advance<=0||!s.pauseStable)||r.snapshots.some(s=>s.targetCount!==5||new Set(s.targets.map(t=>Math.round(t.ground.x)+','+Math.round(t.ground.y))).size!==5||s.regularAllies!==5||s.groundError!==0)))process.exitCode=1;
