import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await monsterDefenseFixture(),out=path.resolve(process.env.QA_OUT||'docs/qa/monster-defense-rewards-20261020');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],failed=[],checks=[],uid=()=>crypto.randomUUID();
async function open(user,width){
 const context=await browser.newContext({viewport:{width,height:width<700?844:1000},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);
 await context.addInitScript(id=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_admin_token','local-qa-'+id);localStorage.setItem('cnine_battle_sound','OFF');},user);
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failed.push({status:r.status(),path:new URL(r.url()).pathname});});return p;
}
async function shot(p,name,locator){
 console.log('Screenshot',name);
 await p.evaluate(()=>Promise.race([Promise.all([document.fonts.ready,...[...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode().catch(()=>{}))]),new Promise(r=>setTimeout(r,5000))]));
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page fits width');
 if(locator)await locator.screenshot({path:path.join(out,name+'.png')});else await p.screenshot({path:path.join(out,name+'.png')});
}
async function cms(p){await p.route('**/api/admin/mercenaries/opening',r=>r.fulfill({json:{mode:'OFF',ready:false,rankCounts:{},blockers:[]}}));await p.goto(h.origin+'/admin/');await p.locator('#nav [data-view=monster-defense]').click();const root=p.locator('#view-monster-defense');await root.locator('[data-save]:enabled').waitFor();return root;}
async function finalWave(roomId){const r=await h.room(roomId);r.phase='WAVE';r.wave=r.encounter.waves;r.enemies=[];r.spawnQueue=[];r.serverAt=Date.now()-300;await h.room(roomId,r);}
try{
 const pc=await open(1,1440),root=await cms(pc);
 assert.equal(await root.locator('[name=mode]').inputValue(),'TEST');assert.equal(await root.locator('[data-coin]').count(),5);
 assert.equal(await root.locator('[data-rewards-enabled]').isChecked(),false);
 await root.locator('[name=mode]').selectOption('ON');await root.locator('[data-rewards-enabled]').check();
 for(const [i,d]of ['GUIDE','NORMAL','HARD','NIGHTMARE','CATACLYSM'].entries()){
  const tier=root.locator('[data-reward="'+d+'"]');await tier.locator('[data-coin]').fill(String((i+1)*100000000000));await tier.locator('[data-stars]').fill(String((i+1)*10));
  await tier.locator('[data-item-add]').click();await tier.locator('[data-item-row] select').selectOption('PET_ESSENCE');await tier.locator('[data-item-min]').fill(String(i+2));await tier.locator('[data-item-max]').fill(String(i+2));
 }
 assert.equal(await root.locator('[data-rewards-enabled]').isChecked(),true,'adding items preserves unsaved toggle');
 const guide=root.locator('[data-reward=GUIDE]');await guide.locator('[data-item-add]').click();await guide.locator('[data-item-row] select').last().selectOption('EMPEROR_ENERGY');await guide.locator('[data-item-min]').last().fill('5');await guide.locator('[data-item-max]').last().fill('5');
 await root.locator('[data-save]').click();await pc.waitForFunction(()=>document.querySelector('#view-monster-defense [data-status]')?.textContent.startsWith('저장 완료'));
 await root.locator('[data-reload]').click();await root.locator('[data-save]:enabled').waitFor();assert.equal(await root.locator('[name=mode]').inputValue(),'ON');assert.equal(await guide.locator('[data-item-row]').count(),2);
 await shot(pc,'01-desktop-cms-rewards',root.locator('.md-rewards'));
 checks.push('OWNER CMS saves and reloads ON, five independent coin/star/item amounts, multiple items and unsaved toggle');
 const mobile=await open(1,390),mr=await cms(mobile);await mr.locator('.md-rewards').scrollIntoViewIfNeeded();
 await shot(mobile,'02-mobile-cms-rewards',mr.locator('.md-rewards'));
 assert.equal(await mr.locator('.md-rewards').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'mobile reward controls fit');
 const mt=mr.locator('[data-reward=GUIDE]');await mt.locator('[data-item-remove]').last().tap();await mr.locator('[data-save]').tap();await mobile.waitForFunction(()=>document.querySelector('#view-monster-defense [data-status]')?.textContent.startsWith('저장 완료'));
 assert.equal((await h.api(1,'admin/defense/settings')).settings.difficulties[0].clearReward.items.length,1);checks.push('390px touch CMS removes item and persists exact configuration');
 const lobby=await open(4,1440);await lobby.goto(h.origin+'/defense/');await lobby.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().roster.mercenaries>0);
 await lobby.locator('.mission-rewards summary').click();assert.match(await lobby.locator('#clear-reward-preview').textContent(),/200,000,000,000.*20.*3/);await shot(lobby,'03-desktop-lobby-rewards');
 await lobby.locator('[data-difficulty=CATACLYSM]').click();assert.match(await lobby.locator('#clear-reward-preview').textContent(),/500,000,000,000.*50.*6/);
 const ml=await open(3,390);await ml.goto(h.origin+'/defense/');await ml.waitForFunction(()=>window.CoopDefenseReview?.diagnostics().roster.mercenaries>0);await ml.locator('.mission-rewards summary').tap();await shot(ml,'04-mobile-lobby-rewards');checks.push('desktop/mobile ON entry and selected difficulty reward preview');
 // Real server-owned room, loadouts, START, final-wave advance and automatic receipt.
 const a=await h.api(4,'defense/create',{capacity:2,difficulty:'HARD',loadout:defenseOwnedLoadout(),requestId:uid()});const b=await h.api(3,'defense/join',{roomId:a.roomId,loadout:defenseOwnedLoadout(),requestId:uid()});
 for(const s of [a,b])assert.equal((await h.ready(s)).status,200);assert.equal((await h.live(a,'command',{requestId:uid(),command:{type:'START'}})).status,200);
 await finalWave(a.roomId);await h.live(a,'state');
 await lobby.reload();await ml.reload();
 for(const p of [lobby,ml]){await p.locator('#result').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('#result-reward-status')?.textContent.includes('지급되었습니다'));assert.match(await p.locator('#result-reward-items').textContent(),/300,000,000,000.*30.*4/);}
 await shot(lobby,'05-desktop-clear-reward');await shot(ml,'06-mobile-clear-reward');
 await ml.reload();await ml.locator('#result').waitFor({state:'visible'});assert.equal((await h.db.batch([{sql:'SELECT COUNT(*) n FROM coin_logs'}]))[0].results[0].n,2);checks.push('actual server victory pays both participants, shows receipt on PC/mobile and does not repay on reload');
 await lobby.locator('#return-lobby').click();await lobby.locator('#lobby').waitFor({state:'visible'});const practice=await h.api(4,'defense/create',{capacity:2,difficulty:'GUIDE',practice:true,loadout:defenseOwnedLoadout(),requestId:uid()});await h.ready(practice);assert.equal((await h.live(practice,'command',{requestId:uid(),command:{type:'START'}})).status,200);await finalWave(practice.roomId);await h.live(practice,'state');
 await lobby.reload();await lobby.locator('#result').waitFor({state:'visible'});assert.match(await lobby.locator('#result-reward-status').textContent(),/혼자 연습/);assert.equal(await lobby.locator('#result-reward-items li').count(),0);await shot(lobby,'07-practice-no-reward');checks.push('practice result explicitly displays no account reward');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:true,checks,errors,failed,productionWrites:0},null,2)+'\n');console.log(JSON.stringify({ok:true,out,checks}));
}catch(e){for(const [i,c]of contexts.entries())for(const p of c.pages())await p.screenshot({path:path.join(out,`failure-${i}.png`)}).catch(()=>{});console.error({errors,failed});throw e;}
finally{await browser.close();await h.dispose();}
