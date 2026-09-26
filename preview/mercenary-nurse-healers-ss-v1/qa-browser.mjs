import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const root=fileURLToPath(new URL('.',import.meta.url)),out=path.join(root,'qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()})});
  await page.goto('http://127.0.0.1:8831/preview/mercenary-nurse-healers-ss-v1/',{waitUntil:'networkidle',timeout:60000});
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await page.waitForFunction(()=>window.NurseHealerPreview?.diagnostics().ready,null,{timeout:60000});
  const selected=[];
  for(const code of ['V-051','V-052','V-053','V-054']){
   await page.click('[data-code="'+code+'"]');
   await page.waitForFunction(code=>window.NurseHealerPreview?.diagnostics().selectedCode===code&&window.NurseHealerPreview?.diagnostics().ready,code);
   await page.locator('#sd').evaluate(img=>img.decode());
   await page.locator('#background').click();
   await page.locator('.sd-stage').screenshot({path:path.join(out,name+'-'+code+'-sd-light.png')});
   await page.locator('#background').click();
   selected.push(await page.evaluate(()=>({name:document.getElementById('name').textContent,...window.NurseHealerPreview.diagnostics()})));
  }
  await page.click('[data-code="V-051"]');await page.waitForFunction(()=>window.NurseHealerPreview.diagnostics().selectedCode==='V-051'&&window.NurseHealerPreview.diagnostics().ready);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,name+'-overview.png')});
  const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  await page.locator('.battle-viewport').scrollIntoViewIfNeeded();
  const frames=[];
  for(const t of [.25,.72,.88,1.52,2.6]){
   await page.evaluate(t=>window.NurseHealerPreview.fx.seek(t),t);
   frames.push(await page.evaluate(()=>window.NurseHealerPreview.diagnostics()));
   if(t===.88)await page.locator('.battle-viewport').screenshot({path:path.join(out,name+'-healing-contact.png')});
  }
  const speeds=[];
  for(const speed of [.25,.5,1,2]){
   const timing=await page.evaluate(async speed=>{const f=window.NurseHealerPreview.fx;f.seek(0);f.setSpeed(speed);f.play();const start=performance.now();await new Promise(r=>setTimeout(r,400));f.pause();return {elapsed:f.time,wall:(performance.now()-start)/1000}},speed);
   await page.waitForTimeout(120);const later=await page.evaluate(()=>window.NurseHealerPreview.fx.time);speeds.push({speed,...timing,pauseStable:timing.elapsed===later});
  }
  await page.click('#restart');await page.waitForTimeout(100);const restarted=await page.evaluate(()=>window.NurseHealerPreview.diagnostics());
  await page.click('#cancel');const stopped=await page.evaluate(()=>window.NurseHealerPreview.diagnostics());
  await page.evaluate(()=>document.querySelector('details').open=true);
  await page.locator('details').scrollIntoViewIfNeeded();await page.locator('.frames img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  await page.locator('.all-art').screenshot({path:path.join(out,name+'-four-portraits.png')});
  const disposed=await page.evaluate(()=>{const p=window.NurseHealerPreview;p.dispose();return p.diagnostics()});
  results.push({name,overflow,errors,failed,selected,frames,speeds,restarted,stopped,disposed});
  assert.equal(errors.length,0);assert.equal(failed.length,0);assert.equal(overflow.scroll,overflow.client);
  assert.ok(selected.every(s=>s.skillId==='NURSE_WHITE_OATH'&&s.regularCards===5&&!s.mercenaryInRegularArray&&s.canvasCount===1));
  assert.equal(frames.find(s=>s.time===.88).activeFrame,7);assert.equal(frames.at(-1).visibleSprites,0);
  assert.ok(speeds.every(s=>s.pauseStable&&s.elapsed>0&&Math.abs(s.elapsed-s.wall*s.speed)<.18));
  assert.ok(restarted.playing);assert.equal(stopped.visibleSprites,0);assert.equal(stopped.ownedTimelines,0);assert.equal(stopped.registeredTimelines,0);
  assert.equal(disposed.destroyed,true);assert.equal(disposed.visibleSprites,0);assert.equal(disposed.registeredTimelines,0);
  await page.close();
 }
}finally{await browser.close();await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(results,null,2)+'\n')}
console.log(JSON.stringify(results.map(r=>({name:r.name,overflow:r.overflow,errors:r.errors,failed:r.failed,characters:r.selected.map(c=>c.name),speeds:r.speeds,stopped:r.stopped.visibleSprites,disposed:r.disposed.destroyed})),null,2));
