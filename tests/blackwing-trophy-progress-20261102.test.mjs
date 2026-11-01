import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardFixture,readyBlackwingClear,members} from './helpers/blackwing-rewards-fixture.mjs';
import {readBlackwingTrophy} from '../functions/_trophy_renewal.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: all six departures preserve clear time, trophies and paid/weekly-limit receipts`,async t=>{
 const h=await rewardFixture({postgres});t.after(()=>h.close());
 const launchedAt=new Date(Date.now()-1000).toISOString();
 const read=()=>h.one('SELECT state_json,status,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',currentRoom);
 const economy=async()=>({
  users:await h.all('SELECT id,coin FROM users ORDER BY id'),
  items:await h.all('SELECT user_id,item_code,quantity,unseen_quantity FROM cnine_user_inventory ORDER BY user_id,item_code'),
  coins:await h.all('SELECT * FROM coin_logs ORDER BY user_id,reason'),
  meta:await h.all('SELECT key,value FROM app_meta ORDER BY key'),
  pig:await h.all('SELECT * FROM pig_coin_ledger_v1 ORDER BY user_id,reference_id')
 });
 let currentRoom;
 for(let i=1;i<=2;i++){
  const {roomId,actor,body}=await readyBlackwingClear(h,{rewardOverrides:{weeklyRewardLimit:1}});currentRoom=roomId;
  const cleared=await h.call('action',{user:actor,body});assert.equal(cleared.status,200);
  const before=JSON.parse((await read()).state_json),paid=await economy();
  assert.equal(before.clearRewards['1'].status,i===1?'GRANTED':'WEEKLY_LIMIT');
  assert.equal((await readBlackwingTrophy(h.env,1,launchedAt)).progress,i);
  let lastRequest;
  for(const [index,[uid]] of members.entries()){
   const request={roomId,requestId:h.uid()};
   if(index===members.length-1){
    const beforeFailure=await read();h.inject('INSERT INTO raid_blackwing_receipts');
    assert.equal((await h.call('leave',{user:Number(uid),body:request})).status,503);h.inject('');
    assert.deepEqual(await read(),beforeFailure);lastRequest={user:Number(uid),body:request};
   }
   assert.equal((await h.call('leave',{user:Number(uid),body:request})).status,200);
   const after=await read(),state=JSON.parse(after.state_json);
   assert.equal(after.status,'CLEAR');assert.equal(state.status,'CLEAR');assert.equal(state.finishedAt,before.finishedAt);
   assert.deepEqual(state.clearRewards,before.clearRewards);
   for(const [id]of members)assert.equal((await readBlackwingTrophy(h.env,Number(id),launchedAt)).progress,i);
  }
  const completed=await read();assert(JSON.parse(completed.state_json).members.every(m=>m.left));
  assert.equal((await h.call('leave',lastRequest)).status,200);assert.deepEqual(await read(),completed);
  assert.equal((await h.call('action',{user:actor,body})).status,200);assert.deepEqual(await read(),completed);
  assert.deepEqual(await economy(),paid);
 }
 // Empty recruitment still cancels; leaving an active raid remains a failure.
 const lobby=await h.command('create');assert.equal((await h.command('leave',{roomId:lobby.body.roomId})).status,200);
 assert.equal((await h.one('SELECT status FROM raid_blackwing_rooms_v1 WHERE room_id=?',lobby.body.roomId)).status,'CANCELLED');
 const active=await readyBlackwingClear(h);currentRoom=active.roomId;
 let failure;
 for(const [uid]of members){
  assert.equal((await h.command('leave',{roomId:currentRoom},Number(uid))).status,200);
  const row=await read(),state=JSON.parse(row.state_json);failure??={finishedAt:state.finishedAt,failure:state.failure};
  assert.equal(row.status,'FAILED');assert.equal(state.finishedAt,failure.finishedAt);assert.deepEqual(state.failure,failure.failure);
 }
 assert.equal((await readBlackwingTrophy(h.env,1,launchedAt)).progress,2);
});
