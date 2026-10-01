// Scoped playback regression: the approved artwork and authored timeline stay unchanged.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('./qa/v15/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?v=15',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.CrimsonKnightPreview?.diagnostics().ready);
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());
  const labels=await page.locator('#speed option').allTextContents();
  assert.deepEqual(labels,['0.30×','0.60×','1.20× (기본)','2.40×']);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  assert.equal(overflow,false);
  const speeds=[];
  for(const speed of [.25,.5,1,2]){
   await page.selectOption('#speed',String(speed));
   const state=await page.evaluate(async()=>{
    const f=window.CrimsonKnightPreview.fx;f.seek(0);f.play();
    const start=performance.now();await new Promise(r=>setTimeout(r,700));f.pause();
    const elapsed=f.time,wall=(performance.now()-start)/1000;
    await new Promise(r=>setTimeout(r,80));
    return {elapsed,wall,rate:f.playbackRate,timelineRate:f.timeline.timeScale(),pausedStable:f.time===elapsed};
   });
   assert.ok(Math.abs(state.rate-speed*1.2)<1e-8);assert.equal(state.timelineRate,state.rate);
   assert.ok(Math.abs(state.elapsed/state.wall-state.rate)<Math.max(.08,state.rate*.15));
   assert.equal(state.pausedStable,true);speeds.push({speed,...state});
  }
  await page.selectOption('#speed','1');
  await page.check('#sound');
  await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx;f.seek(0);f.setSpeed(.25);f.play();});
  await page.waitForFunction(()=>window.CrimsonKnightPreview.fx.audio.scheduled.length>0);
  assert.ok(await page.evaluate(()=>window.CrimsonKnightPreview.fx.audio.scheduled.every(c=>c.speed===.3)));
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.setSpeed(1));
  await page.waitForFunction(()=>window.CrimsonKnightPreview.fx.audio.scheduled.some(c=>c.speed===1.2));
  // Sound toggled during playback must use the same effective rate as a fresh play.
  await page.uncheck('#sound');await page.check('#sound');
  await page.waitForFunction(()=>window.CrimsonKnightPreview.fx.audio.scheduled.length>0);
  const audio=await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx;return {cues:f.audio.scheduled,nodeRates:[...f.audio.nodes].map(n=>n.playbackRate.value),error:f.audio.error??null};});
  assert.ok(audio.cues.every(c=>c.speed===1.2));assert.ok(audio.nodeRates.every(r=>Math.abs(r-1.2)<1e-6));assert.equal(audio.error,null);
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());await page.uncheck('#sound');
  await page.check('#motion-only');await page.uncheck('#motion-only');await page.selectOption('#mode','attack');
  const impact=await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx;f.seek(1.98);return {pose:f.sample.pose,rate:f.timeline.timeScale(),effects:f.activeFrames};});
  const swing=await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx;return [1.85,1.90,1.98,2.12,2.19,2.20,3.15].map(t=>{f.seek(t);return {time:t,pose:f.sample.pose,textureMatches:f.merc.fullBodySprite.texture===f.assets.motion[f.sample.pose.key][f.sample.pose.frame]};});});
  assert.deepEqual(swing.map(s=>s.pose),[{key:'twohandLift',frame:3},{key:'twohandStrike',frame:0},{key:'twohandStrike',frame:1},{key:'twohandStrike',frame:3},{key:'twohandStrike',frame:3},{key:'twohandReturn',frame:0},{key:'idle',frame:0}]);assert.ok(swing.every(s=>s.textureMatches));
  assert.equal(impact.pose.key,'twohandStrike');assert.equal(impact.pose.frame,1);assert.equal(impact.rate,1.2);assert.ok(impact.effects.length>0);
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.seek(3.15));
  assert.equal(await page.evaluate(()=>window.CrimsonKnightPreview.fx.sample.pose.key),'idle');
  await page.locator('.controls').screenshot({path:new URL(`${name}-controls.png`,out).pathname.replace(/^\/(?=[A-Za-z]:)/,'')});
  let showcase=null;
  if(name==='desktop'){
   await page.click('#showcase');const start=Date.now();
   await page.waitForFunction(()=>window.CrimsonKnightPreview.showcase.completed,null,{timeout:30000});
   showcase=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());showcase.wallSeconds=(Date.now()-start)/1000;
   assert.ok(Math.abs(showcase.wallSeconds-23)<1.5);assert.equal(showcase.pose.key,'idle');assert.equal(showcase.visibleSprites,0);assert.equal(showcase.registeredTimelines,0);
  }
  await page.click('#showcase');await page.click('#cancel');
  const stopped=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());
  assert.equal(stopped.showcase.active,false);assert.equal(stopped.registeredTimelines,0);assert.equal(stopped.visibleSprites,0);assert.equal(stopped.pose.key,'idle');
  assert.deepEqual(errors,[]);results.push({name,labels,overflow,speeds,audio,swing,impact,showcase,stopped,errors});
  await page.evaluate(()=>window.CrimsonKnightPreview.dispose());await page.close();
 }
}finally{await browser.close();await fs.writeFile(new URL('speed-report.json',out),JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify({passed:true,viewports:results.map(r=>r.name),showcaseWallSeconds:results[0].showcase.wallSeconds,errors:results.flatMap(r=>r.errors)}));
