import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('.',import.meta.url)),out=path.join(root,'qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()});});
  page.on('console',m=>{if(m.type()==='error')console.log('[browser]',m.text());});
  await page.goto('http://127.0.0.1:8822/preview/mercenary-black-moon-swordsman-ss-v1/',{waitUntil:'networkidle',timeout:60000});
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await page.waitForFunction(()=>window.BlackMoonPreview?.diagnostics().ready||document.getElementById('health')?.textContent.startsWith('시연 준비 실패'),null,{timeout:60000});
  if(!await page.evaluate(()=>!!window.BlackMoonPreview))throw Error(await page.locator('#health').textContent());
  await page.evaluate(()=>window.BlackMoonPreview.fx.pause());
  const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  await page.locator('.hero').screenshot({path:path.join(out,name+'-hero.png')});
  const contacts=[];
  for(const t of[.72,1.24,1.92]){
   await page.evaluate(t=>window.BlackMoonPreview.fx.seek(t),t);
   await page.waitForTimeout(60);
   contacts.push(await page.evaluate(()=>window.BlackMoonPreview.diagnostics()));
   await page.locator('.battle-viewport').screenshot({path:path.join(out,name+'-contact-'+t+'.png')});
  }
  await page.selectOption('#scenario','interrupt');await page.evaluate(()=>window.BlackMoonPreview.fx.seek(1.3));const interruption=await page.evaluate(()=>window.BlackMoonPreview.diagnostics());
  await page.selectOption('#scenario','lost');await page.evaluate(()=>window.BlackMoonPreview.fx.seek(1.92));const targetLost=await page.evaluate(()=>window.BlackMoonPreview.diagnostics());
  await page.selectOption('#scenario','normal');
  await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
  const speeds=[];
  for(const speed of[.25,.5,1,2]){
   const timing=await page.evaluate(async speed=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const f=window.BlackMoonPreview.fx;f.seek(0);f.setSpeed(speed);f.play();const start=performance.now();await new Promise(r=>setTimeout(r,500));f.pause();return{elapsed:f.time,wall:(performance.now()-start)/1000};},speed);
   await page.waitForTimeout(150);const b=await page.evaluate(()=>window.BlackMoonPreview.fx.time);speeds.push({speed,...timing,pauseStable:timing.elapsed===b});
  }
  await page.click('#cancel');const stopped=await page.evaluate(()=>window.BlackMoonPreview.diagnostics());
  await page.selectOption('#mode','idle');await page.locator('.battle-viewport').screenshot({path:path.join(out,name+'-idle.png')});
  results.push({name,overflow,errors,failed,contacts,interruption,targetLost,speeds,stopped});
  await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({name:r.name,overflow:r.overflow,errors:r.errors,failed:r.failed,speeds:r.speeds,interruption:r.interruption.cancelled,targetLost:r.targetLost.cancelled,stopped:r.stopped.visibleSprites})),null,2));
if(results.some(r=>r.errors.length||r.failed.length||r.overflow.scroll>r.overflow.client||!r.interruption.cancelled||!r.targetLost.cancelled||r.stopped.visibleSprites!==0||r.speeds.some(s=>!s.pauseStable||s.elapsed<=0)))process.exitCode=1;
