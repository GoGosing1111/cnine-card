import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {reviewFingerprint} from './review-fingerprint.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),report={dateKST:'2026-10-23',mode:baseline?'BEFORE_FIX':'REGRESSION',cases:[],projectileCases:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 for(const [screen,viewport]of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:8467/preview/mercenary-bloodmoon-battle-20261023-v1/');await page.waitForFunction(()=>window.BloodmoonPreview?.fx);
  for(const slug of ['bongsoon','joeun','diim','claws','dagger']){
   await page.locator('[data-character='+slug+']').click();await page.waitForFunction(s=>window.BloodmoonPreview?.fx?.character.slug===s,slug);
   await page.waitForTimeout(150);
   const states=await page.evaluate(()=>{
    const f=window.BloodmoonPreview.fx,a=f.actor,c=f.character;
    const measure=label=>{const s=a.fullBodySprite,o=s.toGlobal({x:0,y:0}),v=s.toGlobal({x:0,y:c.bodyPixels*(f.bodyPixelDensity??1)});return {label,bodyScreenPixels:Math.hypot(v.x-o.x,v.y-o.y),spriteScale:s.scale.x,artPixelDensity:f.bodyPixelDensity??1,rootScale:a.root.scale.x,viewScale:a.view.scale.y};};
    f.setAction('idle');f.seek(.2);const rows=[measure('idle')];
    for(const action of ['dash','attack','skill','hit','defeat']){
     f.setAction(action);f.seek(0);rows.push(measure(action+':start'));
     f.seek(f.plan.duration*.5);rows.push(measure(action+':middle'));
     f.seek(f.plan.duration);rows.push(measure(action+':end'));
     f.cancel();rows.push(measure(action+':cancel'));
    }
    return rows;
   });
   const reference=states[0].bodyScreenPixels;for(const s of states)s.ratio=s.bodyScreenPixels/reference;
   const row={screen,slug,states,minRatio:Math.min(...states.map(s=>s.ratio)),maxRatio:Math.max(...states.map(s=>s.ratio))};report.cases.push(row);
   if(!baseline)for(const s of states)assert(Math.abs(s.ratio-1)<.001,`${screen}/${slug}/${s.label}: size ratio ${s.ratio}`);
   if(!baseline){
    row.idle=await page.evaluate(async()=>{
     const f=window.BloodmoonPreview.fx,s=f.actor.fullBodySprite;f.setAction('idle');
     const measure=()=>{const foot=s.toGlobal({x:0,y:0});return {time:f.time,frame:f.state.pose.frame,foot:{x:foot.x,y:foot.y},scale:{x:s.scale.x,y:s.scale.y}};};
     const rows=[0,.35,.7,1.05,1.4].map(time=>{f.seek(time);return measure();});
     f.seek(0);f.setSpeed(1);f.play();
     for(let i=0;i<16;i++){await new Promise(resolve=>setTimeout(resolve,100));rows.push(measure());}
     f.pause();return rows;
    });
    for(const pose of row.idle){assert.equal(pose.frame,0);assert.deepEqual(pose.foot,row.idle[0].foot);assert.deepEqual(pose.scale,row.idle[0].scale);}
   }
  }
  if(!baseline){
   await page.locator('[data-character=bongsoon]').click();await page.waitForFunction(()=>window.BloodmoonPreview.fx?.character.slug==='bongsoon');
   for(const action of ['attack','skill']){
    const result=await page.evaluate(action=>{
     const f=window.BloodmoonPreview.fx;f.setAction(action);const samples=[],launch=action==='skill'?.24:.18;
     for(let index=0;index<f.plan.projectileCount;index++)for(const progress of [0,.25,.5,.75,.999,1]){
      const time=launch+index*.07+progress*.12;f.seek(time);
      const diagnostic=f.diagnostics();samples.push({index,progress,time,shot:diagnostic.projectiles.find(p=>p.index===index),earlyImpacts:f.state.impacts.filter(p=>p.index===index&&progress<1).length});
     }
     f.seek(f.plan.duration);const end=f.diagnostics();f.setAction(action);f.seek(launch+.06);f.cancel();const cancel=f.diagnostics();
     return {action,duration:f.plan.duration,contact:f.plan.contact,count:f.plan.projectileCount,samples,endEffects:end.visibleEffects,cancelEffects:cancel.visibleEffects,cancelTimelines:cancel.registeredTimelines};
    },action);
    assert.equal(result.count,action==='skill'?3:1);assert(result.contact<=.36);assert.equal(result.endEffects,0);assert.equal(result.cancelEffects,0);assert.equal(result.cancelTimelines,0);
    for(let index=0;index<result.count;index++){
     const shots=result.samples.filter(s=>s.index===index),first=shots[0].shot;assert(first);
     for(const {progress,shot,earlyImpacts}of shots){
      assert(shot,`${screen}/${action}/${index}: missing projectile`);assert.equal(shot.flightSeconds,.12);assert.equal(earlyImpacts,0);
      assert.deepEqual(shot.origin,first.origin);assert.deepEqual(shot.target,first.target);
      const dx=shot.target.x-shot.origin.x,dy=shot.target.y-shot.origin.y,length=Math.hypot(dx,dy);
      const x=shot.point.x-shot.origin.x,y=shot.point.y-shot.origin.y;
      assert(length>1);assert(Math.abs(x*dy-y*dx)/length<1e-6,`${screen}/${action}/${index}: curved flight`);
      assert(Math.abs((x*dx+y*dy)/(length*length)-progress)<1e-6,`${screen}/${action}/${index}: nonuniform flight`);
      if(progress<1){assert.equal(shot.stage,'travel');assert(Math.abs(shot.rotation-Math.atan2(dy,dx))<1e-9);}else assert.equal(shot.stage,'impact');
     }
    }
    report.projectileCases.push({screen,...result});
   }
   // Actual GSAP playback must also settle at the canonical size, not only seeking.
   const completion=await page.evaluate(async()=>{
    const f=window.BloodmoonPreview.fx,s=f.actor.fullBodySprite,measure=()=>{const a=s.toGlobal({x:0,y:0}),b=s.toGlobal({x:0,y:f.character.bodyPixels*(f.bodyPixelDensity??1)});return Math.hypot(a.x-b.x,a.y-b.y);};
    f.setAction('idle');f.seek(.2);const before=measure();f.setAction('skill');f.setSpeed(1);f.play();await new Promise(resolve=>setTimeout(resolve,1450));
    return {sizeRatio:measure()/before,playing:f.playing,effects:f.diagnostics().visibleEffects,registeredTimelines:f.diagnostics().registeredTimelines};
   });
   assert(Math.abs(completion.sizeRatio-1)<.001);assert.equal(completion.playing,false);assert.equal(completion.effects,0);assert.equal(completion.registeredTimelines,0);
   report.projectileCases.at(-1).realTimeCompletion=completion;
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.status=baseline?'BASELINE_RECORDED':'PASS';report.reviewFingerprint=await reviewFingerprint();
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{
 await fs.writeFile(fileURLToPath(new URL(baseline?'qa/scale-before.json':'qa/motion-regression.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,cases:report.cases.map(({screen,slug,minRatio,maxRatio})=>({screen,slug,minRatio,maxRatio})),projectileCases:report.projectileCases.map(({screen,action,count,contact})=>({screen,action,count,contact})),failure:report.failure}));await browser.close();
}
