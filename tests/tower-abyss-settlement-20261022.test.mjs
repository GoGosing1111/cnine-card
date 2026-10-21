import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {TOWER_ABYSS_PROTOCOL,towerAbyssFinish} from '../functions/_tower_abyss.js';
const request=(path,body,id=7)=>new Request('https://game.example/api/'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer local-account-${id}`,origin:'https://game.example','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const call=(tower,path,body,id)=>tower.handle(path,request(path,body,id));
for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'} tower: server deadline, pending recovery, immutable encounter and exactly-once settlement`,async t=>{
  const f=await jointFixture(t,{postgres}),tower=await operatingTowerFixture(f,{floorNo:69,maxFloor:120,rewardCoin:75000000000});
  const body={requestId:'tower-abyss-live-0001',floorNo:69,protocol:TOWER_ABYSS_PROTOCOL},before=await f.coin();
  assert.equal((await call(tower,'tower/fight',body)).status,409);
  assert.equal((await call(tower,'tower/start',{...body,protocol:'OLD'})).status,409);
  const r=await call(tower,'tower/start',body);assert.equal(r.status,200);const start=await r.json();
  assert.equal(start.result,'WIN');assert.equal(start.reward,0);assert.equal(await f.coin(),before);assert.equal(start.settlement.status,'PENDING');
  assert.equal((await f.p('SELECT current_floor FROM tower_user_progress WHERE user_id=7').first()).current_floor,69);
  assert.ok(start.settlement.notBefore>start.settlement.startedAt);
  const early=await call(tower,'tower/finish',{requestId:body.requestId,result:'WIN',reward:999999999999});assert.equal(early.status,409);assert.equal((await early.json()).code,'TOWER_PLAYBACK_PENDING');
  f.setPower(1);await f.p('UPDATE tower_floor_ranges SET reward_coin=1,power_override=999999999').run();
  const retry=await(await call(tower,'tower/start',body)).json();assert.deepEqual(retry.battleV2,start.battleV2);
  const another=await(await call(tower,'tower/start',{...body,requestId:'tower-abyss-other-002'})).json();assert.equal(another.requestId,body.requestId);
  const pending=await(await call(tower,'tower/pending')).json();assert.equal(pending.pending.requestId,body.requestId);
  assert.equal((await(await call(tower,'tower/pending',null,8)).json()).pending,null);
  assert.equal((await call(tower,'tower/finish',{requestId:body.requestId},8)).status,404);
  f.setClock(start.settlement.notBefore);
  const finished=await(await call(tower,'tower/finish',{requestId:body.requestId})).json();assert.equal(finished.reward,75000000000);assert.equal(finished.settlement.status,'COMPLETED');assert.equal(await f.coin(),before+75000000000);
  const again=await(await call(tower,'tower/finish',{requestId:body.requestId})).json();assert.equal(again.reward,finished.reward);assert.equal(await f.coin(),before+75000000000);
  assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs WHERE user_id=7').first()).n),1);
  assert.equal(Number((await f.p('SELECT current_floor FROM tower_user_progress WHERE user_id=7').first()).current_floor),70);
  assert.equal((await(await call(tower,'tower/pending')).json()).pending,null);
 });
 test(`${postgres?'PostgreSQL':'SQLite'} tower: defeat and interruption do not grant or reroll; transaction failure is recoverable`,async t=>{
  const f=await jointFixture(t,{postgres});f.setPower(1000);
  const tower=await operatingTowerFixture(f,{floorNo:10,monsterPower:50000000}),body={requestId:'tower-abyss-loss-0001',floorNo:10,protocol:TOWER_ABYSS_PROTOCOL};
  const start=await(await call(tower,'tower/start',body)).json();assert.equal(start.result,'LOSE');f.setClock(start.settlement.notBefore);
  f.fail('INSERT INTO tower_clear_history');assert.equal((await call(tower,'tower/finish',{requestId:body.requestId})).status,503);f.fail('');
  assert.equal((await(await call(tower,'tower/pending')).json()).pending.settlement.status,'PENDING');
  const done=await(await call(tower,'tower/finish',{requestId:body.requestId})).json();assert.equal(done.reward,0);assert.equal(done.nextFloor,10);
  assert.equal(Number((await f.p('SELECT highest_floor FROM tower_user_progress WHERE user_id=7').first()).highest_floor),9);
 });
}
test('PostgreSQL tower: coin/progression/EXP roll back together and concurrent settlement cannot double-credit',async t=>{
 const f=await jointFixture(t,{postgres:true}),tower=await operatingTowerFixture(f,{rewardCoin:400000000000});
 await f.pg.exec('CREATE TABLE high_grade_reroll_drop_receipts(user_id bigint,content_code text,reference_id text,won bigint,PRIMARY KEY(user_id,content_code,reference_id))');
 await f.p('INSERT INTO inventory_items(code,name) VALUES(?,?)','HIGH_GRADE_REROLL_TICKET','격리 검수').run();await f.setting('high_grade_reroll_settings_v1',{dropRates:{TOWER:100}});
 const body={requestId:'tower-abyss-atomic-01',floorNo:1,protocol:TOWER_ABYSS_PROTOCOL},before=await f.coin(),s=await(await call(tower,'tower/start',body)).json();f.setClock(s.settlement.notBefore);
 f.fail('INSERT INTO coin_logs');assert.equal((await call(tower,'tower/finish',{requestId:body.requestId})).status,503);f.fail('');assert.equal(await f.coin(),before);
 const replies=await Promise.all([call(tower,'tower/finish',{requestId:body.requestId}),call(tower,'tower/finish',{requestId:body.requestId})]);assert.ok(replies.every(r=>r.status===200));assert.equal(await f.coin(),before+400000000000);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM account_rank_receipts_v1 WHERE user_id=7').first()).n),1);
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='HIGH_GRADE_REROLL_TICKET'").first()).quantity),1);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM high_grade_reroll_drop_receipts').first()).n),1);
});
test('Tower: lost start/settlement acknowledgements recover the same compressed encounter',async t=>{
 const f=await jointFixture(t),tower=await operatingTowerFixture(f,{rewardCoin:400000000000}),before=await f.coin();
 const body={requestId:'tower-abyss-lost-ack-01',floorNo:1,protocol:TOWER_ABYSS_PROTOCOL};
 f.DB.afterCommit=async statements=>{if(statements.some(s=>s.source.includes('INSERT INTO joint_operations_v1'))){f.DB.afterCommit=null;throw Error('LOST_START_ACK');}};
 const start=await(await call(tower,'tower/start',body)).json();assert.equal(start.settlement.status,'PENDING');
 const saved=JSON.parse((await f.p('SELECT plan_json FROM joint_operations_v1 WHERE kind=?','TOWER_ABYSS').first()).plan_json);assert.ok(saved.responseGzip);assert.equal(saved.response,undefined);
 f.setClock(start.settlement.notBefore);
 f.DB.afterCommit=async statements=>{if(statements.some(s=>s.source.includes('INSERT INTO coin_logs'))){f.DB.afterCommit=null;throw Error('LOST_SETTLEMENT_ACK');}};
 const done=await(await call(tower,'tower/finish',{requestId:body.requestId})).json();assert.equal(done.settlement.status,'COMPLETED');assert.equal(await f.coin(),before+400000000000);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM tower_clear_history').first()).n),1);
});
test('Tower: failed secondary grant resumes after the committed core without repeating earlier grants',async t=>{
 const f=await jointFixture(t),tower=await operatingTowerFixture(f,{rewardCoin:400000000000}),before=await f.coin();
 const body={requestId:'tower-abyss-extras-01',floorNo:1,protocol:TOWER_ABYSS_PROTOCOL};
 const start=await(await call(tower,'tower/start',body)).json();f.setClock(start.settlement.notBefore);
 let magic=0,equipment=0,black=0;const deps={magicReward:async()=>{magic++;return {amount:3};},equipmentReward:async()=>{equipment++;if(equipment===1)throw Error('TEMPORARY_GRANT_FAILURE');return {item:'isolated'};},blackMiracleReward:async()=>{black++;return null;}};
 await assert.rejects(towerAbyssFinish(f.env,f.user,body,deps,{now:f.deps.now}),/TEMPORARY_GRANT_FAILURE/);
 assert.equal(await f.coin(),before+400000000000);assert.equal((await(await call(tower,'tower/pending')).json()).pending.settlement.status,'PENDING');
 const done=await towerAbyssFinish(f.env,f.user,body,deps,{now:f.deps.now});assert.equal(done.settlement.status,'COMPLETED');assert.deepEqual([magic,equipment,black],[1,2,1]);assert.equal(await f.coin(),before+400000000000);
 assert.equal((await(await call(tower,'tower/pending')).json()).pending,null);
});
test('Tower: an administrative progress change cancels the stale battle without rewards or a stuck active slot',async t=>{
 const f=await jointFixture(t,{postgres:true}),tower=await operatingTowerFixture(f),before=await f.coin();
 const body={requestId:'tower-abyss-reset-01',floorNo:1,protocol:TOWER_ABYSS_PROTOCOL};
 const start=await(await call(tower,'tower/start',body)).json();f.setClock(start.settlement.notBefore);await tower.setFloor(2);
 const cancelled=await call(tower,'tower/finish',body);assert.equal(cancelled.status,409);assert.equal((await cancelled.json()).code,'TOWER_FLOOR_CHANGED');assert.equal(await f.coin(),before);
 assert.equal((await(await call(tower,'tower/pending')).json()).pending,null);
 assert.equal((await call(tower,'tower/start',body)).status,409);
 const fresh=await call(tower,'tower/start',{...body,requestId:'tower-abyss-after-reset',floorNo:2});assert.equal(fresh.status,200);
});
