import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {lichWeeklyReward,lichRewardWeek} from '../functions/_raid_lich_rewards.js';
import {prepareMadaraRewards} from '../functions/_raid_madara_rewards.js';
import {ensureLootShopSchema,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';

for(const postgres of [false,true]){
 test('Isgen 2000 eok + 100 pig coins + 5 essence: atomic, replay-safe and limited to three '+postgres,async t=>{
  const h=await lichLiveFixture({postgres});t.after(()=>h.close());await ensureLootShopSchema(h.env);
  for(let i=1;i<=4;i++){
   const {roomId,body}=await readyLichClear(h,{settings:{coinReward:200000000000,masterStarReward:0,pigCoinReward:100,petEssenceReward:5}});
   if(i===1){h.inject('UPDATE pig_coin_wallets_v1');const failed=await h.call('action',{body});assert.equal(failed.status,503);h.inject('');assert.equal((await lichWeeklyReward(h.env,1)).used,0);assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);assert.equal((await h.one('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1')),null);assert.equal((await h.one('SELECT status FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).status,'ACTIVE');}
   const paid=await h.call('action',{body});assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.state.clearReward.granted,i<=3);
   if(i<=3){assert.equal(paid.body.state.clearReward.pigCoins,100);assert.equal(paid.body.state.clearReward.coin,200000000000);}
   assert.equal((await h.call('action',{body})).status,200);
  }
  for(const uid of [1,2,3]){assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',uid)).coin),600000000000);assert.equal(Number((await h.one('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?',uid)).balance),300);assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='PET_ESSENCE'",uid)).quantity),15);assert.equal(await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'",uid),null);}
  assert.equal(Number((await h.one("SELECT COUNT(*) n FROM pig_coin_ledger_v1 WHERE source='LICH_RAID'")).n),9);
 });
 test('Varsen 2000 eok + 100 pig coins + 5 essence + 2m stars: atomic and old five-clear rooms obey current three '+postgres,async t=>{
  const h=await madaraLiveFixture({postgres});t.after(()=>h.close());await h.configure({mode:'ON',rewardsEnabled:true,weeklyRewardLimit:3,pigCoinReward:100});await ensureLootShopSchema(h.env);
  const make=i=>({id:'new-reward-'+i,status:'CLEAR',releaseMode:'ON',finishedAt:Date.now(),members:[{id:'1'},{id:'2'}],rewardPolicy:{enabled:true,coin:200000000000,masterStars:2000000,petEssence:5,pigCoins:100,weeklyLimit:5}});
  for(let i=1;i<=4;i++){
   const room=make(i),plan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},room);
   if(i===1){h.inject('UPDATE pig_coin_wallets_v1');await assert.rejects(h.env.DB.batch(plan.statements));h.inject('');assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);assert.equal(await h.one('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1'),null);}
   if(plan.statements.length)await h.env.DB.batch(plan.statements);assert.equal(room.clearRewards['1'].granted,i<=3);assert.equal(room.clearRewards['1'].weeklyReward.limit,3);assert.equal((await prepareMadaraRewards(h.env,{status:'ACTIVE'},room)).statements.length,0);
  }
  for(const uid of [1,2]){assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',uid)).coin),600000000000);assert.equal(Number((await h.one('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?',uid)).balance),300);assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'",uid)).quantity),6000000);}
  const next=make(5);next.finishedAt=Date.parse(lichRewardWeek().resetsAt);const plan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},next);assert.equal(next.clearRewards['1'].granted,true);assert.equal(next.clearRewards['1'].weeklyReward.used,1);
 });
 test('Core 1000 eok + 100 pig coins and one unchanged selected reward settle together '+postgres,async t=>{
  const f=await coreRewardFixture(postgres?'postgres':'sqlite');t.after(()=>f.close());await ensureLootShopSchema(f.env);
  const loot=structuredClone(LOOT_SHOP_DEFAULTS);loot.rewardsEnabled=true;Object.assign(loot.sources.find(s=>s.code==='CORE_RAID'),{enabled:true,amount:100,weeklyLimit:300});
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',LOOT_SHOP_KEY,JSON.stringify(loot));
  const cfg=JSON.parse((await f.row('SELECT value FROM app_meta WHERE key=?','raid_core_protocol_settings_v2024')).value);cfg.rewardCoin=100000000000;await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(cfg),'raid_core_protocol_settings_v2024');
  const opened=await f.open(),offer={...opened.body,roomId:f.roomId};assert.equal(opened.status,200,JSON.stringify(opened.body));
  f.fail('UPDATE pig_coin_wallets_v1');assert.equal((await f.claim(offer)).status,503);f.fail('');
  assert.equal(await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1'),null);
  const paid=await f.claim(offer);assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.reward.coin,100000000000);assert.equal(paid.body.pigCoins,100);assert.equal(paid.body.weeklyReward.limit,3);assert.equal(paid.body.choiceReward.quantity,2);
  const again=await f.claim(offer);assert.equal(again.status,200);assert.equal(again.body.replayed,true);assert.equal(Number((await f.row('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1')).balance),100);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM pig_coin_ledger_v1')).n),1);
 });
}

for(const postgres of [false,true])test('Varsen settings changed during settlement cannot commit a stale quota '+postgres,async t=>{
 const h=await madaraLiveFixture({postgres});t.after(()=>h.close());await h.configure({mode:'ON',rewardsEnabled:true,weeklyRewardLimit:5});
 const room={id:'STALE-LIMIT',status:'CLEAR',releaseMode:'ON',finishedAt:Date.now(),members:[{id:'1'}],rewardPolicy:{enabled:true,coin:123,masterStars:0,petEssence:0,weeklyLimit:5}};
 const plan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},room);await h.configure({weeklyRewardLimit:3});await assert.rejects(h.env.DB.batch(plan.statements));
 assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);assert.equal(await h.one("SELECT value FROM app_meta WHERE key LIKE 'raid_madara_weekly_v1:%'"),null);
});
