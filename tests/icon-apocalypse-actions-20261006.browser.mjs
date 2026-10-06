// Main app + shipped V3 bundle, with the loopback Apocalypse fixture server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8984',out=process.env.ICON_QA_OUT;
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.ok(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/review/?screen=battle');
  await page.locator('#battleStart, #pveV2GoHunt').first().waitFor({timeout:30000});
  if(await page.locator('#pveV2GoHunt').count())await page.locator('#pveV2GoHunt').click();
  await page.locator('[data-monster-tab="APOCALYPSE"]').click();await page.locator('#battleStart').click();
  await page.locator('.apocalypse-dodge').waitFor({timeout:60000});
  await page.evaluate(async()=>{
   const engine=await window.ProjectVPixiBattle.mount(),joeun=engine.characters.find(c=>c.cardId==='CN-1C000004');
   if(!joeun)throw Error('ICON Joeun missing from actual battlefield');
   window.__iconObserved={states:[],heals:[],popup:false};
   const set=joeun.setState.bind(joeun);joeun.setState=function(state){window.__iconObserved.states.push(state);return set(state);};
   const sync=engine.syncTargetHp.bind(engine);engine.syncTargetHp=function(target,hp){if(hp>target.hp)window.__iconObserved.heals.push({id:target.cardId,before:target.hp,after:hp});return sync(target,hp);};
   window.__iconPoll=setInterval(()=>{if(engine.pools.damage.inUse.values().some(label=>label.roleTag.text==='HEAL'&&label.numberLabel.text.startsWith('+')))window.__iconObserved.popup=true;},16);
  });
  await page.locator('.apocalypse-dodge .is-safe').click();
  await page.waitForFunction(()=>window.__iconObserved.popup,null,{timeout:90000});
  await page.screenshot({path:path.join(out,width+'-joeun-heal.png')});
  await page.locator('#pveResultConfirm').waitFor({timeout:120000});
  const state=await (await fetch(origin+'/qa-state.json')).json();
  assert.equal(state.states.at(-1).status,'CLAIMED');assert.equal(state.states.at(-1).settlement,'WIN');
  const observation=await page.evaluate(()=>{clearInterval(window.__iconPoll);return {...window.__iconObserved,diagnostics:window.ProjectVPixiBattle.diagnostics().iconRoles,runtime:window.ProjectVPixiBattle.runtimeVersion};});
  assert.ok(observation.states.includes('ATTACK'),'Joeun visibly enters attack/cast animation');assert.ok(observation.heals.length>0);assert.equal(observation.popup,true);
  assert.equal(observation.diagnostics.metrics.appliedRows,observation.diagnostics.metrics.serverRows);
  assert.ok(observation.diagnostics.metrics.roles.includes('SUPPORT'));assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,width+'-apocalypse-clear.png')});
  reports.push({width,mode:'PVE',settlement:'WIN',observation,errors});console.log(JSON.stringify({width,mode:'PVE',settlement:'WIN',attackStates:observation.states.filter(s=>s==='ATTACK').length,heals:observation.heals.length,popup:observation.popup}));
  await page.locator('#pveResultConfirm').click();
  if(width===390){
   await page.evaluate(async()=>{
    const data=await fetch('/api/pvp/fight',{method:'POST',body:'{}'}).then(r=>r.json());
    await window.ensureFeatureResources('battleV2');const modal=document.querySelector('#modal'),live=window.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName:'ICON 조은 검수',opponentName:'회귀 상대'});
    window.__pvpDone=false;window.playPvpBattleV2Live({...live,modal,data}).then(()=>{window.__pvpDone=true;});
   });
   await page.waitForFunction(()=>window.__pvpDone,null,{timeout:120000});
   assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'390-pvp-complete.png')});
   const diagnostic=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics().iconRoles);assert.equal(diagnostic.metrics.appliedRows,diagnostic.metrics.serverRows);
   reports.push({width,mode:'PVP',complete:true,diagnostic,errors});console.log('PVP main wrapper playback completed.');
  }
  await page.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(reports,null,2));
}finally{await browser.close();}
