import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=fileURLToPath(new URL('qa/',import.meta.url));await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const [name,viewport]of[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  if(process.argv.includes('--desktop')&&name!=='desktop')continue;
  let phase='load';const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],failures=[];
  page.on('pageerror',e=>errors.push(phase+': '+e.stack));page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()});});
  await page.goto((process.env.SX_QA_BASE||'http://127.0.0.1:8983')+'/preview/sx-live-v1/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.SXLiveReview,null,{timeout:60000});
  const snapshot=()=>page.evaluate(()=>window.SXLiveReview.diagnostics());
  const normal=[];
  for(const mode of['attack','skill']){
   phase=mode;const expected=await page.evaluate(mode=>window.SXLiveReview.normal(mode),mode);
   await page.evaluate(()=>window.SXLiveReview.done);
   normal.push({mode,expected,...await snapshot()});
  }
  const area=[];
  for(const kind of['single','multi']){
   phase=kind;await page.evaluate(async kind=>{const r=window.SXLiveReview;await r.reset(kind);await r.skill({holdAt:2.38});},kind);
   await page.screenshot({path:dir+name+'-'+kind+'-impact.png'});
   const contact=await snapshot();
   await page.evaluate(async()=>{const r=window.SXLiveReview;r.pause(false);r.engine.paceScale=2;r.engine.skillChipPlayback.timeline.play();await r.done;});
   area.push({kind,contact,complete:await snapshot()});
  }
  await page.evaluate(async()=>{const r=window.SXLiveReview;await r.skill({holdAt:1.64});r.stop();});
  const stopped=await snapshot();
  phase='pvp';const pvp=await page.evaluate(async()=>{
   const r=window.SXLiveReview,p=structuredClone(r.fixtures.single);p.mode='PVP';p.battleV2.mode='PVP';
   await r.engine.configureAccountBattleUnit(p);return{active:r.engine.accountBattleUnitEnabled,sword:!!r.engine.accountBattleUnit?.swordAnimation};
  });
  results.push({name,errors,failures,normal,area,stopped,pvp});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(dir+'browser-report.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({name:r.name,errors:r.errors,failures:r.failures,normal:r.normal.map(n=>({mode:n.mode,expected:n.expected,actual:n.normalDamage})),area:r.area.map(a=>({kind:a.kind,expected:a.complete.expectedDamage,actual:a.complete.skillDamage,hits:a.complete.skillHits,error:a.complete.error})),stopped:r.stopped.sword,pvp:r.pvp})),null,2));
if(results.some(r=>r.errors.length||r.failures.length||r.pvp.active||r.pvp.sword||r.stopped.sword.effectsVisible||r.normal.some(n=>n.normalDamage!==n.expected)||r.area.some(a=>a.complete.error||a.complete.skillHits!==a.complete.expectedHits||a.complete.skillDamage!==a.complete.expectedDamage)))process.exitCode=1;
