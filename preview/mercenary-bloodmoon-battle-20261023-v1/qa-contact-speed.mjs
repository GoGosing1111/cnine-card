import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {reviewFingerprint} from './review-fingerprint.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),report={dateKST:'2026-10-23',baseline,cases:[],errors:[]},file=p=>fileURLToPath(new URL(p,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const [screen,viewport]of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:8467/preview/mercenary-bloodmoon-battle-20261023-v1/');await page.waitForFunction(()=>window.BloodmoonPreview?.fx);
  if(!baseline){assert.equal(await page.locator('#speed').inputValue(),'2');assert.equal(await page.evaluate(()=>window.BloodmoonPreview.fx.speed),2);}
  for(const slug of ['joeun','diim','claws','dagger']){
   await page.locator('[data-character='+slug+']').click();await page.waitForFunction(s=>window.BloodmoonPreview.fx?.character.slug===s,slug);
   const row=await page.evaluate(()=>{
    const f=window.BloodmoonPreview.fx,actions=[];
    for(const action of ['attack','skill']){
     f.setAction(action);const before=[];
     for(const fraction of [.1,.3,.5,.7,.9,.999]){f.seek(f.plan.contact*fraction);const d=f.diagnostics();before.push({fraction,time:f.time,visibleEffects:d.visibleEffects,pose:d.pose,distance:d.contactDistance,travel:f.state.travel,tinted:f.targets.some((t,i)=>t.fullBodySprite.tint!==f.targetDefaults[i].tint)});}
     f.seek(f.plan.contact);const hit=f.diagnostics();f.seek(f.plan.duration);const end=f.diagnostics();
     actions.push({action,before,hit:{distance:hit.contactDistance,visibleEffects:hit.visibleEffects,pose:hit.pose},endEffects:end.visibleEffects});
    }
    return {slug:f.character.slug,actions};
   });report.cases.push({screen,...row});
   if(!baseline)for(const a of row.actions){for(const state of a.before){assert.equal(state.visibleEffects,0,`${screen}/${slug}/${a.action}: early effects`);assert.equal(state.tinted,false);if(state.travel>.01&&state.travel<.99){assert.equal(state.pose.sheet,'basic');assert([2,3].includes(state.pose.frame),'Approach must use movement pose');}}assert(a.hit.distance<1);assert(a.hit.visibleEffects>0);assert.equal(a.endEffects,0);}
   if(slug==='diim'&&!baseline){
    await page.evaluate(()=>{const f=window.BloodmoonPreview.fx;f.setAction('skill');f.seek(f.plan.contact*.6);});await page.locator('#viewport').screenshot({path:file('qa/'+screen+'-diim-approach.png')});
    await page.evaluate(()=>{const f=window.BloodmoonPreview.fx;f.seek(f.plan.contact);});await page.locator('#viewport').screenshot({path:file('qa/'+screen+'-diim-contact.png')});
   }
  }
  if(!baseline){
   await page.locator('[data-character=bongsoon]').click();await page.waitForFunction(()=>window.BloodmoonPreview.fx?.character.slug==='bongsoon');
   await page.evaluate(()=>{const f=window.BloodmoonPreview.fx;f.setAction('idle');f.seek(0);});await page.locator('#viewport').screenshot({path:file('qa/'+screen+'-bongsoon-feet-fixed.png')});
   const speed=await page.evaluate(async()=>{const f=window.BloodmoonPreview.fx;f.setAction('dash');f.seek(0);const start=performance.now();f.play();await new Promise(resolve=>{const tick=()=>f.playing?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);});return {speed:f.speed,wallSeconds:(performance.now()-start)/1000,duration:f.plan.duration,effects:f.diagnostics().visibleEffects};});
   assert.equal(speed.speed,2);assert(speed.wallSeconds>=.15&&speed.wallSeconds<.38,`${screen}: expected 0.21s dash at 2x, got ${speed.wallSeconds}`);assert.equal(speed.effects,0);report.cases.push({screen,speed});
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.status=baseline?'BASELINE_RECORDED':'PASS';report.reviewFingerprint=await reviewFingerprint();
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{
 await fs.writeFile(file(baseline?'qa/contact-before.json':'qa/contact-speed.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,earlyEffects:report.cases.flatMap(c=>c.actions??[]).flatMap(a=>a.before).filter(s=>s.visibleEffects>0).length,failure:report.failure}));await browser.close();
}
