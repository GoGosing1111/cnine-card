import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {settleCityRound} from '../functions/_jokgak_city_round.js';
import {prepareCityTopSettlement,CITY_TOP_CURSOR} from '../functions/_jokgak_city_top.js';
import {readCityTopHonors,readLichClearHonors,cityTopKey,lichClearKey} from '../functions/_milestone_trophies.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
const setCash=async(f,id,balance)=>{const key=cityLifeKey(id),l=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);l.wallets.ON.balance=balance;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),key).run();};
for(const pg of [false,true]){
 const db=pg?'Postgres':'SQLite';
 test(db+': final cash winners include leavers and tied first place; 25th award is permanent, exactly once and atomic with log expiry',async t=>{
  const f=await cityFixture(t,pg),ids=[f.roles.CITIZEN,f.roles.GANG,f.roles.DOCTOR];for(const id of ids)await f.join(id);
  await setCash(f,ids[0],25000);await setCash(f,ids[1],25000);await setCash(f,ids[2],24000);await f.action(ids[1],'leave');
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',cityTopKey(ids[0]),JSON.stringify({count:24,acquiredAt:null})).run();
  f.setTime(cityShift(f.now).endsAt);
  f.fail('DELETE FROM jokgak_city_actions_v1');await assert.rejects(settleCityRound(f.env,f.now),/INJECTED/);f.fail('');
  assert.equal((await readCityTopHonors(f.env,ids[0])).progress,24);assert.ok((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_actions_v1').first()).n>0);
  f.lost();await settleCityRound(f.env,f.now);await settleCityRound(f.env,f.now,{force:true});
  const won=await readCityTopHonors(f.env,ids[0]);assert.equal(won.progress,25);assert.equal(won.count,1);assert.equal(won.acquiredAt,new Date(f.now).toISOString());
  assert.equal((await readCityTopHonors(f.env,ids[1])).progress,1);assert.equal((await readCityTopHonors(f.env,ids[2])).progress,0);
  assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_actions_v1').first()).n,0);
  f.advance(6*3600000);await settleCityRound(f.env,f.now);assert.deepEqual(await readCityTopHonors(f.env,ids[0]),won,'empty shift cannot award inactive old participants again');
  await f.join(ids[0]);f.setTime(cityShift(f.now).endsAt);await settleCityRound(f.env,f.now);const again=await readCityTopHonors(f.env,ids[0]);assert.equal(again.progress,26);assert.equal(again.count,1);assert.equal(again.acquiredAt,won.acquiredAt);
 });
 test(db+': automatic income is projected at the closing instant; TEST and stale settlement plans cannot award',async t=>{
  const f=await cityFixture(t,pg);let policy=(await readCitySettings(f.env)).policy;policy.career.enabled=true;policy.career.startedAt=f.now;await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);
  const a=f.roles.CITIZEN,b=f.roles.DOCTOR;await f.join(a);await f.join(b);await setCash(f,a,11000);await setCash(f,b,10000);
  f.setTime(cityShift(f.now).endsAt);const stale=await prepareCityTopSettlement(f.env,cityShift(f.now));await settleCityRound(f.env,f.now);
  assert.equal((await readCityTopHonors(f.env,b)).progress,1,'higher legitimate offline wage wins');assert.equal((await readCityTopHonors(f.env,a)).progress,0);
  await assert.rejects(f.env.DB.batch(stale.statements),/constraint|guard/i);assert.equal((await readCityTopHonors(f.env,b)).progress,1);
  policy=(await readCitySettings(f.env)).policy;policy.mode='TEST';policy.testUserIds=[a];await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);await f.join(a);
  f.setTime(cityShift(f.now).endsAt);await settleCityRound(f.env,f.now);assert.equal((await readCityTopHonors(f.env,a)).progress,0);
  assert.equal(Number((await f.p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first()).value),cityShift(f.now).id);
 });
 test(db+': Lich 1000th clear counts without a payout and survives retry, late failure and leaving the completed room',async t=>{
  const h=await lichLiveFixture({postgres:pg});t.after(()=>h.close());const ready=await readyLichClear(h);
  await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)',lichClearKey(1),JSON.stringify({count:999,acquiredAt:null}));
  const stored=await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',ready.roomId),room=JSON.parse(stored.state_json);room.clearRewardPolicy.enabled=false;
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),ready.roomId);
  h.inject('INSERT INTO raid_lich_receipts_v1');assert.equal((await h.call('action',{body:ready.body})).status,503);h.inject('');assert.equal((await readLichClearHonors(h.env,1)).progress,999);
  const result=await h.call('action',{body:ready.body});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.state.status,'CLEAR');assert.equal(result.body.state.clearReward.granted,false);
  const trophy=await readLichClearHonors(h.env,1);assert.equal(trophy.count,1);assert.equal(trophy.progress,1000);assert.ok(trophy.acquiredAt);
  await h.call('action',{body:ready.body});await h.call('status?roomId='+ready.roomId,{user:2});assert.deepEqual(await readLichClearHonors(h.env,1),trophy);
  await h.call('leave',{user:2,body:{roomId:ready.roomId,requestId:crypto.randomUUID()}});assert.equal((await readLichClearHonors(h.env,2)).progress,1);
 });
 test(db+': city settlement rechecks new entrants and rejects an old join that reaches its transaction after closure',async t=>{
  const f=await cityFixture(t,pg),a=f.roles.CITIZEN,b=f.roles.DOCTOR;await f.join(a);await setCash(f,a,9000);
  const end=cityShift(f.now).endsAt,stale=await prepareCityTopSettlement(f.env,cityShift(end));
  await f.join(b);await assert.rejects(f.env.DB.batch(stale.statements),/constraint|guard/i);
  assert.equal((await readCityTopHonors(f.env,a)).progress,0);
  const c=[...f.users.keys()].find(id=>id!==a&&id!==b),batch=f.env.DB.batch.bind(f.env.DB);
  f.env.DB.batch=async statements=>{f.env.DB.batch=batch;await settleCityRound(f.env,end);return batch(statements);};
  await assert.rejects(f.action(c,'join'),/전황|교대/);
  assert.equal(await f.p('SELECT user_id FROM jokgak_city_players_v1 WHERE user_id=?',c).first(),null);
  assert.equal((await readCityTopHonors(f.env,b)).progress,1);assert.equal((await readCityTopHonors(f.env,a)).progress,0);
  assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_actions_v1').first()).n,0);
 });
 test(db+': a newly completed TEST Lich room cannot earn a permanent trophy count',async t=>{
  const h=await lichLiveFixture({postgres:pg});t.after(()=>h.close());
  const ready=await readyLichClear(h,{settings:{mode:'TEST',testUserIds:[2,3]}}),result=await h.call('action',{body:ready.body});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.state.status,'CLEAR');
  for(const id of [1,2,3])assert.equal((await readLichClearHonors(h.env,id)).progress,0);
 });
 test(db+': legacy official Lich clears use immutable participation proof, exclude TEST/failure/other users and seed the next lifetime count',async t=>{
  const h=await lichLiveFixture({postgres:pg});t.after(()=>h.close());await h.call('feature');await h.configure({mode:'ON'});
  const rows=[{id:'old-paid',releaseMode:'ON',members:[],petEssenceSettlement:{participantIds:['1']}},{id:'old-limited',releaseMode:'ON',members:[],clearRewardSettlement:{weeklyByUser:{1:{used:7}},grantedIds:[]}},{id:'old-disabled',releaseMode:'ON',members:[{id:'1'}]},{id:'test',releaseMode:'TEST',members:[{id:'1'}]},{id:'other',releaseMode:'ON',members:[{id:'3'}]},{id:'failed',releaseMode:'ON',members:[{id:'1'}]}];
  for(const r of rows)await h.run('INSERT INTO raid_lich_rooms_v1(room_id,host_id,host_name,status,state_json,created_at,expires_at) VALUES(?,1,?,?,?,?,?)',r.id,'legacy',r.id==='failed'?'FAILED':'CLEAR',JSON.stringify({...r,finishedAt:Date.now()-10000}),Date.now()-20000,Date.now());
  assert.equal((await readLichClearHonors(h.env,1)).progress,3);assert.equal((await readLichClearHonors(h.env,2)).progress,0);
  const ready=await readyLichClear(h);assert.equal((await h.call('action',{body:ready.body})).status,200);assert.equal((await readLichClearHonors(h.env,1)).progress,4);
 });
}
