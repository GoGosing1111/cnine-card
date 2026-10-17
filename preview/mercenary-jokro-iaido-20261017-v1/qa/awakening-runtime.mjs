import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('./',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true}),report={date:new Date().toISOString(),checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:8893/preview/mercenary-jokro-iaido-20261017-v1/?mode=awakening',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.JokroPreview?.diagnostics().ready,null,{timeout:25000});
 const d=()=>page.evaluate(()=>window.JokroPreview.diagnostics()),seek=t=>page.evaluate(t=>{const p=window.JokroPreview;p.fx.seek(t);p.engine.app.renderer.render(p.engine.app.stage);},t);
 const select=async mode=>{await page.locator('[data-mode="'+mode+'"]').click();await page.evaluate(()=>window.JokroPreview.fx.pause());};
 for(const viewport of [{width:1440,height:1080},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(200);await select('awakening');
  for(const t of [1.9,2.12,2.32,2.82,4.4,5.6]){
   await seek(t);const s=await d();assert.equal(s.illustrationCutIn,false);assert.equal(s.regularAllies,5);assert.equal(s.regularEnemies,5);assert.equal(s.mercenaryInRegularArray,false);
   assert.equal(s.awakening.splitVisible,t>=2.12&&t<3.28);assert.equal(s.awakening.snapshotAlive,s.awakening.splitVisible);assert.ok(s.dialogue.visible&&s.dialogue.text.length>5);
   if([2.32,2.82].includes(t))await page.locator('.theater').screenshot({path:root+(viewport.width>500?'desktop':'mobile')+'-awakening-'+t+'.png'});
  }
  await seek(2.4);const captures=(await d()).awakening.captures;await seek(2.5);assert.equal((await d()).awakening.captures,captures);await seek(1);assert.equal((await d()).awakening.snapshotAlive,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  const boxes=await page.locator('#limited-dialogue').evaluate(e=>{const q=e.querySelector('p').getBoundingClientRect(),r=e.getBoundingClientRect();return {inside:q.left>=r.left&&q.right<=r.right&&q.bottom<=r.bottom,height:r.height};});assert.ok(boxes.inside);
  await page.screenshot({path:root+(viewport.width>500?'desktop':'mobile')+'-awakening-page.png',fullPage:true});report.checks.push({viewport:viewport.width,splitAndCleanup:'PASS',dialogueBounds:boxes});
 }
 await select('ultimate');for(const t of [.5,1.2,2.08]){await seek(t);assert.equal((await d()).illustrationCutIn,false);assert.equal(await page.evaluate(()=>!!window.JokroPreview.fx.assets.cutin),false);}report.checks.push({oldUltimateWithoutCutIn:'PASS'});
 const texts=new Set(),heights=new Set();for(let i=0;i<6;i++){await select('awakening');const text=(await d()).dialogue.text;texts.add(text);await seek(5.6);assert.equal((await d()).dialogue.text,text);await page.locator('#cancel').click();assert.equal((await d()).dialogue.text,text);heights.add(await page.locator('#limited-dialogue').evaluate(e=>e.getBoundingClientRect().height));}assert.equal(texts.size,5);assert.equal(heights.size,1);report.checks.push({persistentDialogueCycle:'PASS',lines:texts.size});
 for(const scenario of ['interrupt','lost']){await page.selectOption('#scenario',scenario);await seek(2.8);const s=await d();assert.ok(s.cancelled);assert.equal(s.awakening.snapshotAlive,false);assert.equal(s.awakening.visibleSprites,0);assert.equal(s.visibleSprites,0);}await page.selectOption('#scenario','normal');report.checks.push({interruptAndTargetLoss:'PASS'});
 await page.locator('#motion-only').check();await seek(2.8);assert.equal((await d()).awakening.visibleSprites,0);assert.equal((await d()).awakening.snapshotAlive,false);await page.locator('#motion-only').uncheck();
 await page.locator('#reduced').check();await seek(2.8);assert.equal((await d()).awakening.splitVisible,false);assert.ok((await d()).awakening.visibleSprites>0);await page.locator('#reduced').uncheck();report.checks.push({motionOnlyAndReducedMotion:'PASS'});
 await seek(2.4);await page.setViewportSize({width:1440,height:1080});await page.waitForTimeout(200);assert.equal((await d()).awakening.snapshotAlive,true);const t=(await d()).time;await page.waitForTimeout(200);assert.equal((await d()).time,t);report.checks.push({resizeAndPausedClock:'PASS'});
 const final=await page.evaluate(()=>{const p=window.JokroPreview,a=p.fx.awakening;p.dispose();return {snapshot:a.snapshot,layerDestroyed:a.layer.destroyed,fxDestroyed:p.fx.destroyed};});assert.deepEqual(final,{snapshot:null,layerDestroyed:true,fxDestroyed:true});report.checks.push({dispose:'PASS'});
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await fs.writeFile(root+'awakening-runtime-report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(report));
