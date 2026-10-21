import test from 'node:test';
import assert from 'node:assert/strict';
import {sealStarFixture} from './helpers/seal-star-fixture.mjs';
import {ensureRankRewardFixture} from './helpers/rank-reward-schema.mjs';
import {configureSealDragonHard,OPERATION_KEY,BOSS_STAGE} from '../scripts/ops/seal-dragon-hard-20261022.mjs';
const table='seal_battle_dragon_events_v20261022';
let serial=0;
async function fixture(dialect){
 const f=await sealStarFixture(dialect);
 await ensureRankRewardFixture(f.env);
 // Real D1/PG batch transactions serialize; the in-memory SQLite shim yields
 // between statements, so queue only batches to model the database contract.
 if(dialect==='sqlite'){const batch=f.DB.batch.bind(f.DB);let tail=Promise.resolve();f.DB.batch=items=>{const p=tail.then(()=>batch(items));tail=p.catch(()=>{});return p;};}
 const settings=f.api.cleanSettings({...f.settings,format:'SEALS_BOSS',minRewardAttempts:4,
  targets:{attack:100,guard:100,purify:100},dailyAttempts:30,lowestRoleBonusPercent:0,
  bossStage:{name:'봉인룡 네르가온',hp:25000,battlePower:10000},clearReward:{coin:500,shards:3,masterStar:7}});
 await f.api.saveSettings(f.env,settings);
 f.round=await f.api.adminStart(f.env,settings,f.owner);
 f.hit=(role,extra={},user='USER')=>f.request('seal-battle/participate',{
  requestId:`seal-dragon-test-${++serial}`,eventId:f.round.id,phase:role==='BOSS'?'BOSS':'SEALS',role,...extra},user);
 f.progress=()=>f.row('SELECT * FROM seal_battle_user_progress WHERE event_id=? AND user_id=2',f.round.id);
 f.open=async()=>{for(const role of ['ATTACK','GUARD','PURIFY'])assert.equal((await f.hit(role)).status,200);};
 return f;
}
test('postgres: hard difficulty operation is dry by default and cannot reset later CMS edits',async()=>{
 const f=await sealStarFixture('postgres');try{
  await f.client.query("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
  const before=JSON.parse((await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value);
  const round=await f.row('SELECT * FROM seal_battle_events WHERE id=?',f.event.id);
  assert.equal((await configureSealDragonHard(f.client,{expectedSettings:before})).committed,false);
  assert.deepEqual(JSON.parse((await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value),before);
  const audits=Number((await f.row('SELECT COUNT(*) AS n FROM admin_logs')).n);
  await assert.rejects(configureSealDragonHard(f.client,{commit:true,expectedSettings:{}}),/CMS settings changed/);
  const result=await configureSealDragonHard(f.client,{commit:true,expectedSettings:before});assert.equal(result.committed,true);
  const next=JSON.parse((await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value);
  assert.deepEqual(next,{...before,format:'SEALS_BOSS',bossStage:BOSS_STAGE});
  assert.deepEqual(await f.row('SELECT * FROM seal_battle_events WHERE id=?',f.event.id),round);
  await f.run("UPDATE app_meta SET value=? WHERE key='seal_battle_settings_v1'",JSON.stringify({...next,bossStage:{...BOSS_STAGE,hp:20000000000}}));
  assert.equal((await configureSealDragonHard(f.client,{commit:true})).replayed,true);
  assert.equal(JSON.parse((await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value).bossStage.hp,20000000000);
  assert.equal(Number((await f.row('SELECT COUNT(*) AS n FROM admin_logs')).n),audits+1);
  assert(await f.row('SELECT value FROM app_meta WHERE key=?',OPERATION_KEY));
 }finally{await f.close();}
});
for(const dialect of ['sqlite','postgres']){
 test(`${dialect}: last seal opens once, boss damage clips, combined attempts unlock one clear reward`,async()=>{
  const f=await fixture(dialect);try{
   assert.equal(f.round.phase,'SEALS');
   assert.equal((await f.hit('BOSS')).status,409);
   await f.open();
   let state=await f.api.statusPayload(f.env,f.deps,f.user);
   assert.equal(state.event.status,'ACTIVE');assert.equal(state.event.phase,'BOSS');assert.equal(state.event.bossStage.hp,25000);
   assert.equal(state.clearReward.eligible,false);
   assert.equal((await f.request('seal-battle/clear-reward',{eventId:f.round.id},'USER')).status,409);
   const before=await f.progress();assert.equal((await f.hit('PURIFY')).status,409);assert.equal((await f.progress()).attempt_charges,before.attempt_charges);
   const a=await f.hit('BOSS');assert.equal(a.status,200);assert.equal(a.body.contribution,20000);assert.equal(a.body.bossHpAfter,5000);assert.equal(a.body.bossDefeated,false);
   const id='seal-dragon-final-'+serial;const b=await f.hit('BOSS',{requestId:id});assert.equal(b.status,200);assert.equal(b.body.contribution,5000);assert.equal(b.body.bossHpBefore,5000);assert.equal(b.body.bossHpAfter,0);assert.equal(b.body.bossDefeated,true);
   assert.equal(b.body.state.event.status,'CLEARED');assert.equal(b.body.state.progress.bossContribution,25000);assert.equal(b.body.state.progress.totalAttempts,5);
   assert.equal(b.body.state.progress.totalContribution,25300);assert.equal(b.body.state.clearReward.eligible,true);
   const paid=await f.row('SELECT coin FROM users WHERE id=2'),charges=(await f.progress()).attempt_charges;
   const replay=await f.hit('BOSS',{requestId:id});assert.equal(replay.body.replayed,true);assert.equal(replay.body.bossHpBefore,5000);assert.equal((await f.row('SELECT coin FROM users WHERE id=2')).coin,paid.coin);assert.equal((await f.progress()).attempt_charges,charges);
   assert.equal(Number((await f.row('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=2')).total_ticks),5*100*600,'each seal and boss attack awards base 100 EXP; replay awards none');
   assert.equal((await f.request('seal-battle/clear-reward',{eventId:f.round.id},'USER')).status,200);
   assert.equal((await f.request('seal-battle/clear-reward',{eventId:f.round.id},'USER')).status,409);
   assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).quantity),7);
   assert.equal((await f.request('seal-battle/rank-reward',{eventId:f.round.id},'USER')).status,410);
  }finally{await f.close();}
 });
 test(`${dialect}: concurrent final seal and boss never charge or pay a losing stale request`,async()=>{
  const f=await fixture(dialect);try{
   await f.hit('ATTACK');await f.hit('GUARD');
   const seals=await Promise.all([f.hit('PURIFY'),f.hit('PURIFY',{},'OWNER')]);
   assert.deepEqual(seals.map(x=>x.status).sort(),[200,409]);assert.equal(seals.filter(x=>x.body.bossOpened).length,1);
   await f.run(`UPDATE ${table} SET hp_remaining=100 WHERE event_id=?`,f.round.id);
   const bosses=await Promise.all([f.hit('BOSS'),f.hit('BOSS',{},'OWNER')]);
   assert.deepEqual(bosses.map(x=>x.status).sort(),[200,409]);assert.equal(bosses.filter(x=>x.body.bossDefeated).length,1);
   assert.equal(Number((await f.row('SELECT SUM(total_attempts) AS n FROM seal_battle_user_progress WHERE event_id=?',f.round.id)).n),4);
   assert.equal(Number((await f.row("SELECT COUNT(*) AS n FROM seal_battle_action_receipts WHERE event_id=? AND status='DONE'",f.round.id)).n),4);
   assert.equal(Number((await f.row(`SELECT hp_remaining FROM ${table} WHERE event_id=?`,f.round.id)).hp_remaining),0);
  }finally{await f.close();}
 });
 test(`${dialect}: rollback and lost COMMIT reply keep charge, ledger and progress atomic`,async()=>{
  const f=await fixture(dialect);try{
   f.fail('UPDATE users SET coin=coin+');const bad=await f.hit('ATTACK');assert.equal(bad.status,500);f.fail('');
   assert.equal((await f.progress()).total_attempts,0);assert.equal((await f.progress()).attempt_charges,30);
   assert.equal(Number((await f.row('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=2'))?.total_ticks||0),0);
   assert.equal(Number((await f.row('SELECT attack_progress FROM seal_battle_events WHERE id=?',f.round.id)).attack_progress),0);
   // Trigger after the actual transaction, not schema/rank setup.
   const batch=f.DB.batch.bind(f.DB);let lose=true;
   f.DB.batch=async items=>{const out=await batch(items);if(lose&&items.some(s=>String(s.sql||s.source).includes("status='AUTHORIZED',deck_power"))){lose=false;throw Error('LOST_COMMIT_REPLY');}return out;};
   const good=await f.hit('ATTACK');assert.equal(good.status,200);assert.equal(good.body.replayed,true);assert.equal((await f.progress()).total_attempts,1);assert.equal((await f.progress()).attempt_charges,29);
   assert.equal(Number((await f.row('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=2')).total_ticks),100*600);
   assert.equal(Number((await f.row("SELECT COUNT(*) AS n FROM coin_logs WHERE user_id=2 AND reason='SEAL_BATTLE_ATTEMPT'")).n),1);
  }finally{await f.close();}
 });
 test(`${dialect}: config locks start, snapshots survive edits, expiration and END cannot clear a living dragon`,async()=>{
  const f=await fixture(dialect);try{
   await f.request('admin/seal-battle/settings',{bossStage:{hp:null,battlePower:null}});
   const blocked=await f.request('admin/seal-battle/event',{action:'START'});assert.equal(blocked.status,400);assert.equal(blocked.body.code,'SEAL_BOSS_UNCONFIGURED');
   assert.equal((await f.row('SELECT status FROM seal_battle_events WHERE id=?',f.round.id)).status,'ACTIVE');
   assert.equal(Number((await f.row(`SELECT hp_max FROM ${table} WHERE event_id=?`,f.round.id)).hp_max),25000);
   await f.open();await f.run("UPDATE seal_battle_events SET ends_at='2000-01-01T00:00:00Z' WHERE id=?",f.round.id);
   const state=await f.api.statusPayload(f.env,f.deps,f.user);assert.equal(state.event.status,'FAILED');assert.equal(state.clearReward.eligible,false);
   const restored=f.api.cleanSettings({...f.settings,format:'SEALS_BOSS',bossStage:{hp:100,battlePower:1}});await f.api.saveSettings(f.env,restored);f.round=await f.api.adminStart(f.env,restored,f.owner);
   await f.run('UPDATE seal_battle_events SET attack_progress=attack_target,guard_progress=guard_target,purify_progress=purify_target WHERE id=?',f.round.id);
   const ended=await f.request('admin/seal-battle/event',{action:'END'});assert.equal(ended.body.overview.event.status,'FAILED');
  }finally{await f.close();}
 });
}
