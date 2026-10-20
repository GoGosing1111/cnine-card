import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
import {DEFENSE_RULES} from '../shared/monster-defense-v1.mjs';
const id=()=>crypto.randomUUID();
const create=(difficulty='NORMAL',extra={})=>({capacity:2,difficulty,loadout:defenseOwnedLoadout(),requestId:id(),...extra});
async function enable(h){const s=(await h.api(1,'admin/defense/settings')).settings;s.mode='ON';s.rewardsEnabled=true;s.difficulties.forEach((d,i)=>d.clearReward={coin:100*(i+1),masterStars:i+1,items:[{code:'PET_ESSENCE',quantity:3}]});const r=await h.api(1,'admin/defense/settings',{settings:s,requestId:id()});assert.equal(r.status,200);return r.settings;}
async function start(h,a,b){for(const s of [a,b])assert.equal((await h.ready(s)).status,200);assert.equal((await h.live(a,'command',{requestId:id(),command:{type:'START'}})).status,200);}
async function finalWave(h,roomId){const r=await h.room(roomId);r.phase='WAVE';r.wave=r.encounter.waves;r.enemies=[];r.spawnQueue=[];r.serverAt=Date.now()-300;await h.room(roomId,r);}

test('real ON API opens ordinary accounts, isolates TEST rooms, freezes CMS amounts, settles offline and replays safely',async()=>{
 const h=await monsterDefenseFixture();try{
  const old=await h.api(1,'defense/create',create());assert.equal(old.status,200);
  const cfg=await enable(h);assert.equal((await h.api(4,'defense/feature')).accessible,true);
  assert.equal((await h.api(4,'defense/rooms')).rooms.length,0);
  assert.equal((await h.api(4,'defense/join',{roomId:old.roomId,loadout:defenseOwnedLoadout(),requestId:id()})).status,409);
  assert.equal((await h.api(4,'defense/create',{...create(),rewardPolicy:{coin:999999}})).status,400);
  const a=await h.api(4,'defense/create',create()),b=await h.api(2,'defense/join',{roomId:a.roomId,loadout:defenseOwnedLoadout(),requestId:id()});assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.snapshot.rewardsEnabled,true);
  const list=await h.api(3,'defense/rooms');assert.deepEqual(list.rooms.map(r=>r.id),[a.roomId]);
  await start(h,a,b);cfg.difficulties[1].clearReward.coin=900;assert.equal((await h.api(1,'admin/defense/settings',{settings:cfg,requestId:id()})).status,200);
  await finalWave(h,a.roomId);await new Promise(r=>setTimeout(r,1300));
  let stored=await h.room(a.roomId);assert.equal(stored.phase,'VICTORY');assert.equal(stored.clearRewards[4].coin,200);assert.equal(stored.clearRewards[2].granted,true);
  const money=await h.db.batch([{sql:'SELECT id,coin FROM users ORDER BY id'},{sql:'SELECT COUNT(*) n FROM coin_logs'}]);assert.equal(money[0].results.find(r=>r.id===4).coin,12345878);assert.equal(money[1].results[0].n,2);
  stored.clearRewards=null;await h.room(a.roomId,stored);assert.equal((await h.room(a.roomId)).clearRewards[4].coin,200,'lost DO acknowledgement reuses DB receipt');
  assert.equal((await h.db.batch([{sql:'SELECT COUNT(*) n FROM coin_logs'}]))[0].results[0].n,2);
  const resumed=await h.api(4,'defense/session',{roomId:a.roomId});assert.equal(resumed.snapshot.clearRewards[4].granted,true);
  await h.api(4,'defense/leave',{});const practice=await h.api(4,'defense/create',create('GUIDE',{practice:true}));assert.equal(practice.snapshot.rewardsEnabled,false);
  const invalid=(await h.api(1,'admin/defense/settings')).settings;invalid.difficulties[0].clearReward.items=[{code:'NOT_REGISTERED',quantity:1}];assert.equal((await h.api(1,'admin/defense/settings',{settings:invalid,requestId:id()})).status,400);
 }finally{await h.dispose();}
});

test('failed terminal payout survives room expiry and retries atomically from the server alarm',async()=>{
 const h=await monsterDefenseFixture();try{
  await enable(h);const a=await h.api(2,'defense/create',create('HARD')),b=await h.api(3,'defense/join',{roomId:a.roomId,loadout:defenseOwnedLoadout(),requestId:id()});await start(h,a,b);
  await h.db.batch([{sql:"CREATE TRIGGER qa_defense_fail BEFORE INSERT ON inventory_logs BEGIN SELECT RAISE(ABORT,'temporary reward failure'); END"}]);
  await finalWave(h,a.roomId);await h.live(a,'state');let stored=await h.room(a.roomId);assert.equal(stored.phase,'VICTORY');assert.equal(stored.clearRewards,undefined);
  const before=await h.db.batch([{sql:'SELECT coin FROM users'},{sql:'SELECT COUNT(*) n FROM coin_logs'}]);assert(before[0].results.every(r=>r.coin===12345678));assert.equal(before[1].results[0].n,0);
  stored.createdAt=Date.now()-DEFENSE_RULES.roomMs-1000;stored.startedAt=stored.createdAt+1000;await h.room(a.roomId,stored);
  let r=await fetch(h.origin+'/__qa/defense-alarm/'+a.roomId);assert.equal((await r.json()).phase,'VICTORY','expiry must retain failed victory, not change it to defeat or delete it');
  await h.db.batch([{sql:'DROP TRIGGER qa_defense_fail'}]);r=await fetch(h.origin+'/__qa/defense-alarm/'+a.roomId);assert.equal(await r.json(),null,'paid expired room may be cleaned up');
  const after=await h.db.batch([{sql:'SELECT id,coin FROM users ORDER BY id'},{sql:'SELECT COUNT(*) n FROM coin_logs'},{sql:"SELECT value FROM app_meta WHERE key LIKE 'monster_defense_reward_receipt_v1:%'"}]);assert.equal(after[0].results.find(r=>r.id===2).coin,12345978);assert.equal(after[1].results[0].n,2);assert.equal(after[2].results.length,1);
 }finally{await h.dispose();}
});
