import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {runExpeditionV3,expeditionV3Status} from '../functions/_expedition_v3_runs.js';
import {readScrapyardSettings} from '../functions/_scrapyard.js';
import {runScrapyardV3} from '../functions/_scrapyard_v3_runs.js';
import {SCRAPYARD_REFORM_DIFFICULTIES,COW_REFORM_REWARDS} from '../shared/pve-reform-20261008.mjs';
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: three cow difficulties share attempts; frozen settlement survives a policy edit`,async t=>{
  const f=await jointFixture(t,{postgres});f.setPower(500000000);
  const original=(await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps)).policy;
  await f.setting('expedition_v3_cow_room',{...original,clearCoin:[...COW_REFORM_REWARDS],dailyCoinCap:18000000000});
  const state=await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps);assert.equal(state.difficulties.length,3);
  let total=0;for(let i=0;i<6;i++){
   const tier=state.difficulties[i%3],body={difficulty:tier.id,requestId:'reform-cow-'+i};
   const result=await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps);assert.equal(result.success,true);
   total+=tier.clearCoin;assert.equal(result.budget.coin,total);assert.equal(result.budget.attempts,i+1);
   const coin=await f.coin();assert.equal((await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps)).replayed,true);assert.equal(await f.coin(),coin);
  }
  await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',{difficulty:'ABYSS_PASTURE',requestId:'reform-cow-over'},f.deps),{code:'PVE_V3_DAILY_LIMIT'});
  await f.setting('expedition_v3_cow_room',original);
  assert.equal((await runExpeditionV3(f.env,f.user,'COW_ROOM',{difficulty:'ABYSS_PASTURE',requestId:'reform-cow-5'},f.deps)).replayed,true);
 });
 test(`${label}: pending 30億 reward remains frozen after CMS changes and resets`,async t=>{
  const f=await jointFixture(t,{postgres});f.setPower(500000000);const policy=(await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps)).policy;
  await f.setting('expedition_v3_cow_room',{...policy,clearCoin:[...COW_REFORM_REWARDS],dailyCoinCap:18000000000});
  const body={difficulty:'ABYSS_PASTURE',requestId:'reform-pending'};
  f.fail('INSERT INTO expedition_v3_progress_v1');await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps),{code:'PVE_V3_RESULT_PENDING'});f.fail('');
  await f.setting('expedition_v3_cow_room',policy);await f.p("UPDATE cow_room_portal_rolls_v1 SET state='MISSED' WHERE state='OPEN'").run();
  const result=await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps);assert.equal(result.budget.coin,3000000000);assert.equal(await f.coin(),3009750000);
 });
 test(`${label}: five scrapyard tiers settle their full rewards once with shared tickets and attempts`,async t=>{
  const f=await jointFixture(t,{postgres});f.setPower(500000000);f.deps.readSettings=env=>readScrapyardSettings(env,{fresh:true});
  await f.setting('scrapyard_settings_v1676',{mode:'ON',dailyRuns:30,difficulties:SCRAPYARD_REFORM_DIFFICULTIES});
  const settings=await readScrapyardSettings(f.env,{fresh:true});assert.equal(settings.difficulties.length,5);
  let expected=10000000;for(const [i,d] of settings.difficulties.entries()){
   const body={difficulty:d.id,requestId:'reform-scrap-'+i};const r=await runScrapyardV3(f.env,f.user,body,f.deps);assert.equal(r.success,true);expected+=d.clearCoin;
   assert.equal(await f.coin(),expected);assert.equal((await runScrapyardV3(f.env,f.user,body,f.deps)).replayed,true);assert.equal(await f.coin(),expected);
  }
  assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='SCRAPYARD_ENTRY_TICKET' AND user_id=7").first()).quantity),0);
 });
}
