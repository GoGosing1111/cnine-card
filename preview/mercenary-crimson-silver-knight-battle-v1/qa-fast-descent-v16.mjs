import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {OVERHEAD,OVERHEAD_MODES} from './skill.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('./qa/v16/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?v=16',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.CrimsonKnightPreview?.diagnostics().ready);
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());
  assert.equal(await page.evaluate(()=>window.CrimsonKnightPreview.manifest.version),16);assert.ok((await page.locator('iframe').getAttribute('src')).endsWith('?v=16'));
  const modes=[];
  for(const mode of OVERHEAD_MODES){
   await page.selectOption('#mode',mode);
   const frames=await page.evaluate(times=>{const f=window.CrimsonKnightPreview.fx;return times.map(time=>{f.seek(time);return {time,pose:f.sample.pose,textureMatches:f.merc.fullBodySprite.texture===f.assets.motion[f.sample.pose.key][f.sample.pose.frame],auraMatches:f.diagnostics().aura.textureMatchesPose};});},[1.63,1.70,1.74,OVERHEAD.contact,1.86,1.88,2.83]);
   assert.deepEqual(frames.map(f=>f.pose),[{key:'twohandLift',frame:2},{key:'twohandLift',frame:3},{key:'twohandStrike',frame:0},{key:'twohandStrike',frame:1},{key:'twohandStrike',frame:3},{key:'twohandReturn',frame:0},{key:'idle',frame:0}]);assert.ok(frames.every(f=>f.textureMatches&&f.auraMatches));
   const hit=await page.evaluate(t=>{const f=window.CrimsonKnightPreview.fx;f.seek(t);return {rate:f.timeline.timeScale(),contacts:f.plan.contacts,effects:f.activeFrames,ward:f.guardPlacement(),foot:f.diagnostics().actorFoot};},OVERHEAD.contact);
   assert.equal(hit.rate,1.2);assert.deepEqual(hit.contacts,[OVERHEAD.contact]);assert.ok(hit.effects.length>0);
   if(mode==='guard'){const ward=hit.effects.find(f=>f.key==='guard');assert.ok(ward);assert.ok(Math.abs(ward.anchor.y-hit.ward.point.y)<.01);}
   if(mode==='ultimate')await page.locator('.battle-viewport').screenshot({path:fileURLToPath(new URL(name+'-impact.png',out))});
   modes.push({mode,frames,hit});
  }
  await page.check('#sound');await page.evaluate(()=>{const f=window.CrimsonKnightPreview.fx;f.seek(0);f.play();});await page.waitForFunction(()=>window.CrimsonKnightPreview.fx.audio.scheduled.length>0);
  const audio=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics().audio);assert.equal(audio.error,null);assert.ok(audio.scheduled.every(c=>c.speed===1.2));assert.equal(audio.scheduled.find(c=>c.key==='ultimate').contact,OVERHEAD.contact);
  await page.evaluate(()=>window.CrimsonKnightPreview.fx.pause());const paused=await page.evaluate(()=>window.CrimsonKnightPreview.fx.time);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.CrimsonKnightPreview.fx.time),paused);await page.uncheck('#sound');
  let showcase=null;
  if(name==='desktop'){
   await page.click('#showcase');const start=Date.now();await page.waitForFunction(()=>window.CrimsonKnightPreview.showcase.completed,null,{timeout:30000});showcase=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());showcase.wallSeconds=(Date.now()-start)/1000;
   assert.ok(Math.abs(showcase.wallSeconds-23)<1.5);assert.equal(showcase.pose.key,'idle');assert.equal(showcase.registeredTimelines,0);assert.equal(showcase.visibleSprites,0);
  }
  await page.click('#showcase');await page.click('#cancel');const stopped=await page.evaluate(()=>window.CrimsonKnightPreview.diagnostics());assert.equal(stopped.showcase.active,false);assert.equal(stopped.registeredTimelines,0);assert.equal(stopped.visibleSprites,0);assert.equal(stopped.pose.key,'idle');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);
  results.push({name,modes,audio,pauseStable:true,showcase,stopped,overflow,errors});await page.evaluate(()=>window.CrimsonKnightPreview.dispose());await page.close();
 }
}finally{await browser.close();await fs.writeFile(new URL('browser-report.json',out),JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify({passed:true,viewports:results.map(r=>r.name),modesEach:OVERHEAD_MODES,showcaseSeconds:results[0].showcase.wallSeconds,errors:results.flatMap(r=>r.errors)}));
