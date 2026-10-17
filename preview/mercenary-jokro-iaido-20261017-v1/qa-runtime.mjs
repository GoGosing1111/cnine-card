import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({channel:'chrome',headless:true});
const report={date:new Date().toISOString(),errors:[],checks:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:8893/preview/mercenary-jokro-iaido-20261017-v1/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.JokroPreview?.diagnostics().ready);
 const d=()=>page.evaluate(()=>window.JokroPreview.diagnostics());
 const select=async mode=>{await page.locator('[data-mode="'+mode+'"]').click();await page.evaluate(()=>window.JokroPreview.fx.pause());};
 for(const viewport of [{width:1440,height:1080},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(180);
  for(const mode of ['aura','dash','attack','skill','ultimate','hit','defeat']){
   await select(mode);
   const result=await page.evaluate(()=>{
    const {fx,engine,manifest}=window.JokroPreview;let clips=0,maxSprites=0;
    for(let n=0;n<=40;n++){
     fx.seek(fx.plan.duration*n/40);maxSprites=Math.max(maxSprites,fx.used);
     for(const f of fx.activeFrames){const s=manifest.effects[f.key],a=s.frames[f.frame].anchor,b=s.visibleBounds,k=f.size/s.sourceCell.width;
      const bounds={left:f.anchor.x+(b.left-a.x*s.cellSize)*k,right:f.anchor.x+(b.right-a.x*s.cellSize)*k,top:f.anchor.y+(b.top-a.y*s.cellSize)*k,bottom:f.anchor.y+(b.bottom-a.y*s.cellSize)*k};
      if(bounds.left<35.9||bounds.right>engine.scene.width-35.9||bounds.top<35.9||bounds.bottom>engine.scene.height-35.9)clips++;
     }
     if(fx.auraBack.visible&&[...fx.auraSprites,...fx.dragonSprites].some(s=>s.alpha!==1))throw Error('Aura opacity is not solid');
    }
    return {clips,maxSprites,scene:engine.scene,regularAllies:engine.allies.length,regularEnemies:engine.enemies.length,fullScreenOverlay:!!fx.dim||!!fx.flash};
   });
   assert.equal(result.clips,0,mode+' visible effect bounds');assert.equal(result.fullScreenOverlay,false);assert.equal(result.regularAllies,5);assert.equal(result.regularEnemies,5);assert.ok(result.maxSprites<140);
   report.checks.push({viewport:viewport.width,mode,...result});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 }
 await select('ultimate');await page.evaluate(()=>window.JokroPreview.fx.seek(2.08));
 await page.locator('.battle-viewport').screenshot({path:root+'qa/mobile-ultimate.png'});await page.screenshot({path:root+'qa/mobile-page.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1080});await page.waitForTimeout(180);
 for(const [mode,t]of [['aura',1.5],['attack',.79],['skill',1.5],['ultimate',2.08]]){await select(mode);await page.evaluate(t=>window.JokroPreview.fx.seek(t),t);await page.locator('.battle-viewport').screenshot({path:root+'qa/desktop-'+mode+'.png'});}
 await page.screenshot({path:root+'qa/desktop-page.png',fullPage:true});
 const first=await d();await page.waitForTimeout(220);assert.equal((await d()).time,first.time);report.checks.push({pausedClock:'PASS'});
 for(const speed of [.5,2]){await page.evaluate(speed=>{const f=window.JokroPreview.fx;f.seek(0);f.setSpeed(speed);f.play();},speed);const start=(await d()).time;await page.waitForTimeout(400);const end=await d();assert.ok(Math.abs(end.time-start-.4*speed)<.24,'Playback speed');await page.evaluate(()=>window.JokroPreview.fx.pause());}
 report.checks.push({playbackRates:[.5,2],result:'PASS'});
 for(const scenario of ['interrupt','lost']){await page.selectOption('#scenario',scenario);await page.evaluate(()=>window.JokroPreview.fx.seek(2.3));const state=await d();assert.equal(state.cancelled,true);assert.equal(state.visibleSprites,0);assert.equal(state.activeFrames.length,0);assert.equal(state.audio.scheduled.length,0);report.checks.push({scenario,result:'PASS'});}
 await page.selectOption('#scenario','normal');await page.locator('#motion-only').check();await page.evaluate(()=>window.JokroPreview.fx.seek(2.08));const motion=await d();assert.equal(motion.visibleSprites,0);assert.equal(motion.auraVisible,false);await page.locator('.battle-viewport').screenshot({path:root+'qa/motion-only.png'});await page.locator('#motion-only').uncheck();
 await page.locator('#reduced').check();await page.evaluate(()=>window.JokroPreview.fx.seek(2.12));assert.ok(await page.evaluate(()=>{const c=window.JokroPreview.engine.camera;return c.container.x===c.base.x&&c.container.y===c.base.y&&c.container.rotation===0;}));await page.locator('#reduced').uncheck();report.checks.push({motionOnly:'PASS',reducedMotion:'PASS'});
 await page.locator('#sound').check();await page.evaluate(()=>{const f=window.JokroPreview.fx;f.setSpeed(1);f.seek(0);f.play();});await page.waitForFunction(()=>window.JokroPreview.diagnostics().audio.scheduled.length===3);const audio=(await d()).audio;assert.equal(audio.error,null);assert.deepEqual(audio.scheduled.map(c=>c.contact),[1.2,2.08,2.52]);await page.locator('#cancel').click();assert.equal((await d()).audio.scheduled.length,0);await page.locator('#sound').uncheck();report.checks.push({audioSchedule:audio.scheduled,cancelledAudio:'PASS'});
 await page.selectOption('#speed','2');await page.locator('#showcase').click();await page.waitForFunction(()=>window.JokroPreview.queue.completed,null,{timeout:20000});assert.equal((await d()).pose.key,'defeat');assert.equal((await d()).auraVisible,false);assert.equal((await d()).registeredTimelines,0);report.checks.push({fullShowcase:'PASS'});
 for(let i=0;i<6;i++){await select('ultimate');await page.locator('#cancel').click();assert.equal((await d()).registeredTimelines,0);assert.equal((await d()).effectLayers,1);}
 const disposed=await page.evaluate(()=>{const p=window.JokroPreview,f=p.fx;p.dispose();return {destroyed:f.destroyed,timeline:f.timeline,pool:f.pool.length,audioContext:f.audio.context};});assert.deepEqual(disposed,{destroyed:true,timeline:null,pool:0,audioContext:null});report.checks.push({replayCleanup:'PASS',dispose:'PASS'});
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await fs.writeFile(root+'qa/runtime-report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,errors:report.errors}));
