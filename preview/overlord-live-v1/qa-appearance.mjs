import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:8996/preview/overlord-live-v1/');
  await page.waitForFunction(()=>window.OverlordLiveReview,null,{timeout:60000});
  const idle=await page.evaluate(()=>{
   const r=window.OverlordLiveReview,u=r.engine.accountBattleUnit,s=u.swordAnimation;
   const snap=()=>[u.bodySprite.anchor.x,u.bodySprite.anchor.y,u.bodySprite.scale.x,u.bodySprite.scale.y,u.view.x,u.view.y,u.view.scale.x,u.view.scale.y,u.root.x,u.root.y];
   const first=snap();s.ambient?.pause().time(1.7);return{first,second:snap(),title:s.diagnostics().title,aura:s.diagnostics().aura};
  });
  await page.screenshot({path:new URL('qa/'+name+'-idle.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')});
  const safety=await page.evaluate(async()=>{
   const r=window.OverlordLiveReview,e=r.engine,s=e.accountBattleUnit.swordAnimation,t=e.enemies.find(a=>a.root.visible),old=t.id;
   const receipt={target:t,options:{authoritative:true,damage:123,targetId:old}};
   let hits=0,done=s.play(s.takeBatch([receipt]),rows=>hits+=rows.length);s.timeline.pause().time(.38);t.id='replacement-overlord-test';s.timeline.time(1.5);await done;
   const replacementNoDamage=hits===0;t.id=old;
   done=s.play(s.takeBatch([receipt]),rows=>hits+=rows.length);s.timeline.pause().time(.2);s.cancel();const canceled=await done;
   return{replacementNoDamage,canceled,sword:s.diagnostics(),timelines:e.simpleTimelines.size};
  });
  report.push({name,idle,safety,errors});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(new URL('qa/appearance-safety.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.map(r=>({name:r.name,idleFixed:JSON.stringify(r.idle.first)===JSON.stringify(r.idle.second),title:r.idle.title,safety:r.safety,errors:r.errors}))));
if(report.some(r=>r.errors.length||JSON.stringify(r.idle.first)!==JSON.stringify(r.idle.second)||!r.safety.replacementNoDamage||r.safety.canceled!==false||r.safety.sword.effectsVisible||r.safety.timelines!==0))process.exitCode=1;

