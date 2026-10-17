import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true}),report={date:new Date().toISOString(),scope:'Final eruption-v2 and visual review only; previously passed runtime checks retained.',errors:[],checks:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:8893/preview/mercenary-jokro-iaido-20261017-v1/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.JokroPreview?.diagnostics().ready);
 for(const viewport of [{width:1440,height:1080},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(200);const label=viewport.width>500?'desktop':'mobile';
  await page.locator('[data-mode="ultimate"]').click();
  const checked=await page.evaluate(()=>{const{fx,manifest,engine}=window.JokroPreview;fx.pause();let samples=0;
   for(const t of [1.44,1.7,2.08,2.4,3,3.7,4.3]){fx.seek(t);for(const f of fx.activeFrames.filter(f=>f.key==='eruption')){const s=manifest.effects.eruption,a=s.frames[f.frame].anchor,b=s.visibleBounds,k=f.size/s.sourceCell.width;
    if(f.anchor.x+(b.left-a.x*s.cellSize)*k<35.9||f.anchor.x+(b.right-a.x*s.cellSize)*k>engine.scene.width-35.9||f.anchor.y+(b.top-a.y*s.cellSize)*k<35.9||f.anchor.y+(b.bottom-a.y*s.cellSize)*k>engine.scene.height-35.9)throw Error('Eruption viewport bounds');samples++;}}
   fx.seek(2.08);return {samples,source:manifest.effects.eruption.source.file};});
  assert.equal(checked.source,'assets/sources/eruption-v2.png');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  await page.locator('.battle-viewport').screenshot({path:root+'qa/'+label+'-ultimate.png'});await page.screenshot({path:root+'qa/'+label+'-page.png',fullPage:true});report.checks.push({viewport:viewport.width,...checked});
 }
 await page.setViewportSize({width:1440,height:1080});await page.waitForTimeout(200);
 await page.locator('[data-mode="attack"]').click();await page.locator('#motion-only').check();
 await page.evaluate(()=>{window.JokroPreview.fx.seek(.79);window.JokroPreview.engine.app.renderer.render(window.JokroPreview.engine.app.stage);});
 await page.locator('.battle-viewport').screenshot({path:root+'qa/katana-contact.png'});
 await page.locator('[data-mode="aura"]').click();await page.evaluate(()=>window.JokroPreview.fx.seek(0));await page.locator('.battle-viewport').screenshot({path:root+'qa/locked-ready.png'});
 await page.locator('#motion-only').uncheck();await page.locator('.battle-viewport').screenshot({path:root+'qa/desktop-aura.png'});
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.status='PASS';await page.evaluate(()=>window.JokroPreview.dispose());
}finally{await fs.writeFile(root+'qa/final-review.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(report));
