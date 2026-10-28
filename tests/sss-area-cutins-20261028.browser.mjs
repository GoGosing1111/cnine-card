import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base=process.env.SSS_REVIEW_BASE||'http://127.0.0.1:8929';
const out=process.env.SSS_QA_OUT||'C:/Users/User/Downloads/upload/cnine-card/operations/sss-area-cutins-20261028/browser';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1}),page=await context.newPage();
  const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
  await page.goto(base+'/preview/sss-area-cutscenes-20261028/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>sssReview.ready||sssReview.error,{timeout:60000});assert.equal(await page.evaluate(()=>sssReview.error),undefined);
  const profiles=await page.evaluate(()=>sssReview.PROFILES.map(p=>({code:p.code,skills:p.skills,theme:p.dialogue.theme})));
  for(const p of profiles){
   await page.evaluate(code=>sssReview.choose(code),p.code);
   await page.evaluate(()=>{
    const e=sssReview.engine,original=e.syncTargetHp,timeline=e.timeline;window.qa={hp:[],cutins:0};
    e.syncTargetHp=function(t,hp,...rest){if(hp<99)qa.hp.push({id:t.id,hp});return original.call(this,t,hp,...rest);};
    e.timeline=function(...args){if(e.activeMercenaryAreaCutin)qa.cutins++;return timeline.apply(this,args);};
   });
   const first=await page.evaluate(()=>{window.qaRun=sssReview.play();return true;});assert(first);
   await page.waitForFunction(()=>!!sssReview.engine.activeMercenaryAreaCutin,{timeout:10000});
   await page.waitForTimeout(300);await page.evaluate(()=>sssReview.pause());
   const paused=await page.evaluate(()=>({time:sssReview.engine.activeMercenaryAreaCutin?.clock.time,damage:qa.hp.length,line:document.querySelector('.jinmu-dialogue-lines>p').textContent,code:document.querySelector('.jinmu-dialogue-rail').dataset.speaker,theme:document.querySelector('.jinmu-dialogue-rail').dataset.theme,frame:getComputedStyle(document.querySelector('.jinmu-dialogue-frame')).borderImageSource,rail:document.querySelector('.jinmu-dialogue-rail').getBoundingClientRect().toJSON(),copy:document.querySelector('.jinmu-dialogue-copy').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.equal(paused.code,p.code);assert.equal(paused.damage,0);assert(!paused.overflow);assert(paused.line.includes(p.skills[0].line));
   assert.equal(paused.theme,p.theme);assert(paused.frame.includes('/sss-area-dialogue-20261028/'+p.theme.slice(4)+'-frame.webp'));assert(paused.copy.y>paused.rail.y&&paused.copy.bottom<paused.rail.bottom);
   await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>sssReview.engine.activeMercenaryAreaCutin?.clock.time),paused.time);
   await page.screenshot({path:path.join(out,width+'-'+p.code+'-cutin.png'),fullPage:true});
   await page.evaluate(()=>sssReview.pause());assert.equal(await page.evaluate(()=>window.qaRun),true);
   const firstResult=await page.evaluate(()=>({hp:[...qa.hp],cutins:qa.cutins,last:sssReview.engine.lastMercenaryPlayback,overlay:!!sssReview.engine.activeMercenaryAreaCutin}));
   assert.equal(firstResult.cutins,1);assert.equal(firstResult.hp.length,12);assert.equal(new Set(firstResult.hp.map(h=>h.id)).size,12);assert(!firstResult.overlay);
   const indices=width===1440?p.skills.map((_,i)=>i):[p.skills.length-1];const subsequent=[];
   for(const i of indices){
    const result=await page.evaluate(async i=>{sssReview.setSkill(i);qa.hp=[];await sssReview.play();return {hp:[...qa.hp],cutins:qa.cutins,last:sssReview.engine.lastMercenaryPlayback,line:document.querySelector('.jinmu-dialogue-lines>p').textContent};},i);
    assert.equal(result.cutins,1);assert.equal(result.hp.length,12);assert.equal(result.last.mode,p.skills[i].visualMode);assert(result.line.includes(p.skills[i].line));subsequent.push({mode:result.last.mode,damageApplications:result.hp.length,cutins:result.cutins});
   }
   const lifecycle=await page.evaluate(async()=>{const e=sssReview.engine;await e.setVisible(false);await e.setVisible(true);qa.hp=[];await sssReview.play();return {cutins:qa.cutins,damage:qa.hp.length,overlay:!!e.activeMercenaryAreaCutin,lines:document.querySelectorAll('.jinmu-dialogue-rail').length};});
   assert.equal(lifecycle.cutins,1);assert.equal(lifecycle.damage,12);assert.equal(lifecycle.overlay,false);assert.equal(lifecycle.lines,1);
   reports.push({width,code:p.code,paused,firstResult,subsequent,lifecycle});console.log('PASS '+width+' '+p.code+' — one cut-in, native dialogue, 12 targets once per cast');
  }
  // A fresh battle restores the allowance; cancelling during the strip never
  // applies the deferred skill, and resuming the same battle does not replay it.
  await page.evaluate(()=>sssReview.choose('V-975'));
  await page.evaluate(()=>{window.cancelRun=sssReview.play();});await page.waitForFunction(()=>!!sssReview.engine.activeMercenaryAreaCutin);
  await page.evaluate(()=>sssReview.stop());assert.equal(await page.evaluate(()=>window.cancelRun),false);
  const cancelled=await page.evaluate(async()=>{await sssReview.play();return {shown:sssReview.engine.mercenaryAreaPresentation.shown.size,status:sssReview.engine.lastMercenaryAreaCutin.status,overlay:!!sssReview.engine.activeMercenaryAreaCutin};});
  assert.equal(cancelled.shown,1);assert.equal(cancelled.status,'CANCELLED');assert(!cancelled.overlay);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({ok:true,reports,productionAccountWrites:0},null,2));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,reports},null,2));throw error;}finally{await browser.close();}
