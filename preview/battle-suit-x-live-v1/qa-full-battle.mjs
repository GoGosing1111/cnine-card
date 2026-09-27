import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport,speed] of [['desktop',{width:1440,height:1000},1],['mobile',{width:390,height:844},2]]){
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:8973/preview/battle-suit-x-live-v1/');
  await page.waitForFunction(()=>window.XBodyLiveReview,null,{timeout:60000});
  const result=await page.evaluate(async speed=>{
   const r=window.XBodyLiveReview,e=r.engine;e.previewSpeed=speed;e.paceScale=speed;
   const started=performance.now(),samples=[];
   const timer=setInterval(()=>samples.push({at:e.skillChipPlayback?.clock.time,index:e.skillChipPlayback?.index,queue:e.accountBattleUnitDamageQueue?.length,mode:e.accountBattleUnit?.swordAnimation?.mode,normalHits:e.accountBattleUnitDamageEventCount}),1000);
   const events=r.fixtures.multi.battleV2.result.timeline;
   const normal=events.filter(v=>v.type==='TURN'&&v.actorKind==='BATTLE_SUIT'&&!v.dodge),skill=events.filter(v=>v.type==='SKILL_CHIP_HIT');
   const expected={normalHits:normal.length,normalDamage:normal.reduce((n,v)=>n+v.damage+v.absorbed,0),skillHits:skill.length,skillDamage:skill.reduce((n,v)=>n+v.damage+v.absorbed,0)};
   let deadline,error=null;
   try{
    await r.skill({full:true});
    await Promise.race([r.done,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Full battle exceeded 120 seconds')),120000);})]);
    await e.stopAccountBattleUnitSustainedFire({drain:true});
   }catch(err){error=err.stack;}
   finally{clearInterval(timer);clearTimeout(deadline);}
   const actual=r.diagnostics();r.stop();
   return{speed,elapsedMs:Math.round(performance.now()-started),expected,actual,error,samples};
  },speed);
  results.push({name,errors,...result});console.log(JSON.stringify({name,errors,elapsedMs:result.elapsedMs,expected:result.expected,actual:result.actual,error:result.error},null,2));await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(new URL('qa/full-battle-report.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
if(results.some(r=>r.error||r.errors.length||r.actual.queue||r.actual.sword.effectsVisible||Object.keys(r.expected).some(k=>r.expected[k]!==r.actual[k])))process.exitCode=1;
