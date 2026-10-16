import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.DEFENSE_MERCENARY_QA_OUTPUT||'../defense-mercenary-qa');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const errors=[],failed=[],cases=[];
try{
 for(const code of ['V-996','V-987','V-999','V-989'])await h.db.batch([{sql:'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count) VALUES(1,?,1,0)',args:[code]}]);
 const options=await h.api(1,'defense/options');assert.equal(options.status,200);
 for(const codes of [['V-996','V-987'],['V-055','V-049'],['V-989','V-999'],['V-004','V-051']]){
  assert.ok(codes.every(code=>options.mercenaries.some(c=>c.code===code)),JSON.stringify(options));
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(loadout=>{localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_defense_loadout_v1:1',JSON.stringify(loadout));localStorage.setItem('cnine_battle_sound','OFF');},{mercenaries:codes,card:options.cards[0].code});
  await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error'&&m.text().includes('[Defense V3]'))errors.push(m.text());});p.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
  await p.goto(h.origin+'/defense/');await p.locator('#practice:enabled').waitFor();await p.locator('#practice').click();
  await p.locator('#ready').click();await p.locator('#start:enabled').click();
  await p.waitForFunction(()=>CoopDefenseReview.snapshot()?.units.length>0);
  const roomId=await p.evaluate(()=>CoopDefenseReview.diagnostics().roomId);
  let r=await h.room(roomId);r.players.forEach(x=>{x.bot=false;x.growth.readyWave=-1;});r.phase='PREP';r.phaseUntil=r.time+120000;r.serverAt=Date.now();await h.room(roomId,r);
  await p.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.mercenaries?.every(a=>a.prepared),null,{timeout:120000});await p.locator('#loading').waitFor({state:'hidden'});
  await p.waitForTimeout(700);await p.screenshot({path:path.join(out,codes.join('-')+'-idle-desktop.png'),fullPage:true});
  const before=await p.evaluate(()=>CoopDefenseReview.diagnostics().engine);assert.equal(before.rendererCount,1);assert.deepEqual(before.presentationErrors,[]);
  for(const a of before.mercenaries.filter(a=>a.id.startsWith('1:')))assert.ok(a.fullBodyHeight!==245&&a.bodyHeight>=260);
  r=await h.room(roomId);r.phase='WAVE';r.wave=1;r.spawnQueue=['RIVET'];r.spawnAt=r.time+120000;r.serverAt=Date.now();r.units.forEach(u=>{u.nextAttack=0;u.hp=Math.round(u.maxHp*.65);});
  r.enemies=Array.from({length:6},(_,i)=>({id:'qa-target-'+i,lane:i%2,x:1650+i*20,y:r.units.find(u=>u.lane===i%2).y,hp:100000,maxHp:100000,attack:0,speed:0,armor:0,type:'NORMAL',archetype:'RIVET',range:150,nextAttack:r.time+120000}));
  await h.room(roomId,r);
  await p.waitForFunction(()=>CoopDefenseReview.diagnostics().engine.mercenaries.filter(a=>a.id.startsWith('1:')).some(a=>a.played>0),null,{timeout:30000});
  await p.waitForTimeout(1200);await p.screenshot({path:path.join(out,codes.join('-')+'-skill-desktop.png'),fullPage:true});
  await p.setViewportSize({width:390,height:844});await p.locator('[data-view="0"]').click();await p.waitForTimeout(600);await p.screenshot({path:path.join(out,codes.join('-')+'-mobile.png'),fullPage:true});
  const after=await p.evaluate(()=>({engine:CoopDefenseReview.diagnostics().engine,events:CoopDefenseReview.snapshot().events}));
  assert.deepEqual(after.engine.presentationErrors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  let persisted=await h.room(roomId);assert.ok(persisted.events.some(e=>e.type.startsWith('MERCENARY_')));assert.ok(persisted.players[0].stats.damage>0);
  cases.push({codes,before,after:after.engine,skillEvents:[...new Set(persisted.events.filter(e=>e.type.startsWith('MERCENARY_')).map(e=>e.type))]});
  if(codes[0]==='V-996'){
   await p.locator('#move-buttons [data-lane="1"]').click();
   await p.waitForFunction(()=>CoopDefenseReview.diagnostics().engine.supportTeleport.active>0);
   const during=await p.evaluate(()=>CoopDefenseReview.diagnostics().engine.mercenaries.find(a=>a.id==='1:0'));
   assert.equal(during.paused,true);assert.equal(during.activeTimelines,0);
   await p.waitForFunction(()=>!CoopDefenseReview.snapshot().units.find(u=>u.id==='1:0').move);
   await p.locator('[data-view="1"]').click();await p.waitForFunction(()=>!CoopDefenseReview.diagnostics().engine.mercenaries.find(a=>a.id==='1:0').paused);
   await p.reload();await p.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().engine?.mercenaries.every(a=>a.prepared),null,{timeout:60000});await p.locator('#loading').waitFor({state:'hidden'});
   assert.equal((await p.evaluate(()=>CoopDefenseReview.diagnostics().engine)).rendererCount,1);
   persisted=await h.room(roomId);
  }
  persisted.phase='DEFEAT';persisted.completedAt=persisted.time;persisted.serverAt=Date.now();await h.room(roomId,persisted);
  await p.waitForFunction(()=>CoopDefenseReview.diagnostics().engine.mercenaries.every(a=>a.paused&&a.activeTimelines===0&&a.queued===0));
  await p.locator('#return-lobby').click();await p.locator('#practice').waitFor();
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,cases,errors,failed},null,2));console.log(JSON.stringify({ok:true,out,cases:cases.map(c=>({codes:c.codes,skillEvents:c.skillEvents,actors:c.after.mercenaries}))}));
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log(JSON.stringify({errors,failed}));throw error;}
finally{await browser.close();await h.dispose();}
