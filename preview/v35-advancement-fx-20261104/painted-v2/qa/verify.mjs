import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const variant of ['pc','mobile','enemy']){
  const context=await browser.newContext({viewport:variant==='mobile'?{width:390,height:844}:{width:1440,height:950}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:18804/');
  await page.waitForFunction(()=>window.advancementReview?.ready||window.advancementReview?.errors.length,{},{timeout:90000});
  if(!await page.evaluate(()=>advancementReview.ready))throw Error(JSON.stringify(await page.evaluate(()=>advancementReview.errors)));
  if(variant==='enemy')await page.selectOption('#direction','enemy');
  const result=await page.evaluate(async()=>{
   const api=advancementReview,{fx,engine}=api,checks={},clips=[],hp=()=>JSON.stringify([...engine.allies,...engine.enemies].map(a=>[a.id,a.hp,a.shield]));
   const before=hp();
   for(const item of api.catalog){
    const s=await api.play(item.id,{paused:true});if(!s)throw Error(item.id+' did not start');
    const frames=[];for(const t of [0,.08,.20,.34,.49]){api.seek(t);frames.push(s.audit());}
    api.seek(.20);const a=JSON.stringify(s.audit());await new Promise(r=>setTimeout(r,90));const b=JSON.stringify(s.audit());
    api.seek(.08);const reverse=s.audit();api.seek(.20);const seekSame=JSON.stringify(s.audit())===a;
    clips.push({id:item.id,duration:s.duration,frames,paused:a===b,seekRepeatable:seekSame,reverseFrame:reverse.frames[0].frame});
    checks[item.id+'_nonempty']=frames.some(f=>f.frames.some(s=>s.visible));
    checks[item.id+'_multipleFrames']=new Set(frames.flatMap(f=>f.frames.map(s=>s.frame))).size>=4;
    checks[item.id+'_pause']=a===b;checks[item.id+'_seek']=seekSame;
    api.cancel();checks[item.id+'_cleanup']=fx.audit().sprites===0;
   }
   checks.visualEventsPreserveHealthAndShield=hp()===before;
   const e=api.event('barrier'),one=await fx.play(e,{paused:true}),duplicate=await fx.play(e,{paused:true});
   checks.eventDeduplication=!!one&&duplicate===null;api.cancel();
   const late=fx.play(api.event('healer'),{paused:true});api.cancel();checks.cancelDuringLoad=(await late)===null;
   await api.play('berserker',{paused:true});await engine.setVisible(false);checks.hideCancelsEffects=fx.audit().sprites===0;await engine.setVisible(true);
   for(const rate of [.25,.5,2]){const s=await api.play('combo',{speed:rate,paused:true});checks['speed_'+rate]=s.timeline.timeScale()===rate;api.cancel();}
   const shot=await api.play('executioner',{paused:true});api.seek(.20);fx.setEnabled(false);checks.effectsOff=shot.audit().frames.every(f=>!f.visible);fx.setEnabled(true);checks.effectsOn=shot.audit().frames.some(f=>f.visible);api.cancel();
   const concurrent=await Promise.all(['vanguard','duelist','healer','guardian'].map(id=>api.play(id,{cancel:false,paused:true})));checks.concurrentFour=fx.audit().active===4;for(const s of concurrent)s.render(.2);api.cancel();checks.concurrentCleanup=fx.audit().sprites===0;
   checks.singleCanvas=document.querySelectorAll('canvas').length===1;
   checks.noHorizontalOverflow=document.documentElement.scrollWidth<=innerWidth;
   checks.noPageErrors=api.errors.length===0;
   return {checks,clips,audit:api.audit()};
  });
  for(const id of ['vanguard','barrier','healer','commander']){
   await page.evaluate(async id=>{await advancementReview.play(id,{paused:true});advancementReview.seek(.20);},id);
   await page.screenshot({path:dir+variant+'-'+id+'.png'});
   await page.evaluate(()=>advancementReview.cancel());
  }
  if(variant==='pc'){
   const combat=await page.evaluate(async()=>{
    const api=advancementReview,checks={};
    api.fx.setEnabled(false);const off=await api.attackWithFx('vanguard');api.cancel();
    api.fx.setEnabled(true);const on=await api.attackWithFx('vanguard');api.cancel();
    checks.realNormalAttackOffOneHit=off.ok&&off.hits===1;checks.realNormalAttackOnOneHit=on.ok&&on.hits===1;
    return {checks,off,on,impacts:api.impacts};
   });Object.assign(result.checks,combat.checks);result.combat=combat;
  }
  result.variant=variant;result.pageErrors=errors;reports.push(result);await context.close();
 }
 await fs.writeFile(dir+'verification.json',JSON.stringify({fixtureOnly:true,physicalDeviceTest:false,reports},null,2));
 const failed=reports.flatMap(r=>Object.entries(r.checks).filter(([,v])=>!v).map(([k])=>r.variant+':'+k));console.log({checks:reports.reduce((n,r)=>n+Object.keys(r.checks).length,0),failed,errors:reports.flatMap(r=>r.pageErrors)});if(failed.length)process.exitCode=1;
}finally{await browser.close();}
