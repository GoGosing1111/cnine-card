import test from 'node:test';
import assert from 'node:assert/strict';
import {sealStarFixture} from './helpers/seal-star-fixture.mjs';

for(const dialect of ['sqlite','postgres'])test(`${dialect}: retired rank awards reject old rounds, concurrent/retried claims and stale CMS with no balance/receipt writes`,async()=>{
 const f=await sealStarFixture(dialect);
 try{
  const legacy={enabled:true,rewardOnFailure:true,tiers:[{startRank:1,endRank:999,coin:12500000000,equipmentBox:2}]};
  await f.run("UPDATE seal_battle_events SET status='CLEARED',rank_rewards_json=?",JSON.stringify(legacy));
  await f.run("INSERT INTO seal_battle_rank_claims(event_id,user_id,final_rank,total_contribution,reward_json,status) VALUES(?,2,1,1000,?,'COMPLETED')",f.event.id,JSON.stringify(legacy.tiers[0]));
  const before={wallet:await f.row('SELECT * FROM users WHERE id=2'),claim:await f.row('SELECT * FROM seal_battle_rank_claims'),round:await f.row('SELECT rank_rewards_json FROM seal_battle_events WHERE id=?',f.event.id)};
  const claim=()=>f.request('seal-battle/rank-reward',{eventId:f.event.id},'USER');
  const results=await Promise.all([claim(),claim(),claim()]);
  for(const r of results){assert.equal(r.status,410);assert.equal(r.body.code,'SEAL_RANK_REWARDS_RETIRED');}
  assert.equal((await claim()).status,410);
  assert.deepEqual(await f.row('SELECT * FROM users WHERE id=2'),before.wallet);
  assert.deepEqual(await f.row('SELECT * FROM seal_battle_rank_claims'),before.claim);
  assert.deepEqual(await f.row('SELECT rank_rewards_json FROM seal_battle_events WHERE id=?',f.event.id),before.round);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),0);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM inventory_logs')).n),0);
  const saved=await f.request('admin/seal-battle/settings',{rankRewards:legacy});
  assert.equal(saved.status,200);assert.deepEqual(saved.body.settings.rankRewards,{enabled:false,rewardOnFailure:false,tiers:[]});
  const state=await f.api.statusPayload(f.env,f.deps,f.user);assert.equal(state.rankReward,null);assert.equal(state.pendingRankReward,null);assert.equal(state.event.rankRewards.enabled,false);assert.equal(state.event.clearReward.masterStar,200000);
 }finally{await f.close();}
});
