import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import {reviewFingerprint} from './review-fingerprint.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),file=p=>fileURLToPath(new URL(p,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report={dateKST:'2026-10-23',errors:[],requests:[],cases:[]};
try{
 for(const [screen,viewport]of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push({screen,error:e.message}));page.on('response',r=>{if(r.status()>=400)report.requests.push({screen,status:r.status(),url:r.url()});});
  await page.goto('http://127.0.0.1:8467/preview/mercenary-bloodmoon-battle-20261023-v1/');
  try{await page.waitForFunction(()=>window.BloodmoonPreview?.fx,{timeout:60000});}catch(e){await page.screenshot({path:file('qa/'+screen+'-failure.png'),fullPage:true});console.log(JSON.stringify(report));throw e;}
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  const rapid=await page.evaluate(async()=>{const r=window.BloodmoonPreview;await Promise.all(['diim','bongsoon','claws','joeun','bongsoon'].map(s=>r.select(s)));return r.diagnostics();});
  assert.equal(rapid.currentSlug,'bongsoon');assert.equal(rapid.effectLayers,1);assert.equal(rapid.ownTimelines,1);
  for(const slug of ['bongsoon','joeun','diim','claws','dagger']){
   await page.locator('[data-character='+slug+']').click();await page.waitForFunction(s=>window.BloodmoonPreview?.fx?.character.slug===s,slug);
   const row={screen,slug,actions:[],overflow};
   for(const action of ['idle','dash','attack','skill','hit','defeat']){
    const state=await page.evaluate(({action})=>{const r=window.BloodmoonPreview,f=r.fx;f.setAction(action);f.seek(action==='skill'?1.72:action==='attack'?.44:action==='defeat'?1.1:.22);return f.diagnostics();},{action});
    assert.equal(state.regularAllies,5);assert.equal(state.mercenaryInRegularArray,false);assert.equal(state.effectLayers,1);assert.equal(state.ownTimelines,1);assert(Math.abs(state.spriteScale.x-state.spriteScale.y)<1e-8);if(state.expectedSheetScale!==null)assert(Math.abs(state.spriteScale.x-state.expectedSheetScale)<1e-8);
    for(const b of state.effectBounds)assert(b.x>=-1&&b.y>=-1&&b.x+b.width<=state.viewport.width+1&&b.y+b.height<=state.viewport.height+1,`${screen}/${slug}/${action}: effect clips viewport`);
    if(slug!=='bongsoon'&&['attack','skill'].includes(action))assert(state.contactDistance<1,'Melee weapon must reach its target');row.actions.push(state);
    if(['idle','skill','defeat'].includes(action))await page.locator('#viewport').screenshot({path:file(`qa/${screen}-${slug}-${action}.png`)});
   }
   row.control=await page.evaluate(async()=>{const f=window.BloodmoonPreview.fx;f.setAction('skill');f.seek(.7);f.setSpeed(.25);f.play();await new Promise(r=>setTimeout(r,180));f.pause();const before=f.time;await new Promise(r=>setTimeout(r,160));const pauseStable=Math.abs(before-f.time)<.001;f.seek(1.72);const contact=f.diagnostics();f.cancel();return {pauseStable,contact,cancel:f.diagnostics()};});
   assert(row.control.pauseStable);assert.equal(row.control.cancel.registeredTimelines,0);assert.equal(row.control.cancel.visibleEffects,0);report.cases.push(row);
  }
  await page.locator('[data-character=dagger]').click();await page.waitForFunction(()=>window.BloodmoonPreview.fx?.character.slug==='dagger');await page.evaluate(()=>{const f=window.BloodmoonPreview.fx;f.setAction('idle');f.seek(0);});
  await page.screenshot({path:file('qa/'+screen+'-page.png'),fullPage:true});
  await page.evaluate(()=>{const f=window.BloodmoonPreview.fx;f.setSpeed(1);f.setAction('skill');f.seek(0);f.play();});await page.waitForTimeout(3800);assert.equal(await page.evaluate(()=>window.BloodmoonPreview.fx.playing),false);
  const cleanup=await page.evaluate(()=>{const r=window.BloodmoonPreview,e=r.engine;r.dispose();return {disposed:r.diagnostics().disposed,ownTimelines:r.fx?.timeline?1:0,layers:e.effectLayer?.children?.filter(c=>c.label==='BloodmoonSkillFX').length||0};});assert(cleanup.disposed);assert.equal(cleanup.ownTimelines,0);assert.equal(cleanup.layers,0);await page.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.status='PASS';report.reviewFingerprint=await reviewFingerprint();
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await fs.writeFile(file('qa/browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,errors:report.errors,requests:report.requests,failure:report.failure}));await browser.close();}
