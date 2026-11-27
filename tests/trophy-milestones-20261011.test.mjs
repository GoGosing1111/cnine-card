import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {readLichClearHonors,lichClearKey} from '../functions/_milestone_trophies.js';
for(const pg of [false,true]){
 const db=pg?'Postgres':'SQLite';
 test(db+': Lich 200th clear counts without a payout and survives retry, late failure and leaving the completed room',async t=>{
  const h=await lichLiveFixture({postgres:pg});t.after(()=>h.close());const ready=await readyLichClear(h);
  await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)',lichClearKey(1),JSON.stringify({count:199,acquiredAt:null}));
  const stored=await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',ready.roomId),room=JSON.parse(stored.state_json);room.clearRewardPolicy.enabled=false;
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),ready.roomId);
  h.inject('INSERT INTO raid_lich_receipts_v1');assert.equal((await h.call('action',{body:ready.body})).status,503);h.inject('');assert.equal((await readLichClearHonors(h.env,1)).progress,199);
  const result=await h.call('action',{body:ready.body});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.state.status,'CLEAR');assert.equal(result.body.state.clearReward.granted,false);
  const trophy=await readLichClearHonors(h.env,1);assert.equal(trophy.count,1);assert.equal(trophy.progress,200);assert.ok(trophy.acquiredAt);
  await h.call('action',{body:ready.body});await h.call('status?roomId='+ready.roomId,{user:2});assert.deepEqual(await readLichClearHonors(h.env,1),trophy);
  await h.call('leave',{user:2,body:{roomId:ready.roomId,requestId:crypto.randomUUID()}});assert.equal((await readLichClearHonors(h.env,2)).progress,1);
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
