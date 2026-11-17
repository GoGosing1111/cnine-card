import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptLichSnapshot,withLichInputDeadline,retryLichRequest} from '../raid/lich-king/request-retry.mjs';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {tickLichRoom} from '../functions/_raid_lich_king.js';

test('later read time cannot restore a consumed attack or older boss HP',()=>{
  const accepted={id:'six',revision:41,eventSeq:200,serverNow:1000};
  assert.equal(acceptLichSnapshot(accepted,{...accepted,revision:40,serverNow:1100}),false);
  assert.equal(acceptLichSnapshot(accepted,{...accepted,eventSeq:199,serverNow:1100}),false);
  assert.equal(acceptLichSnapshot(accepted,{...accepted,serverNow:999}),false);
  assert.equal(acceptLichSnapshot(accepted,{...accepted,revision:42,eventSeq:201,serverNow:999}),true);
  assert.equal(acceptLichSnapshot(accepted,{...accepted,serverNow:1100}),true);
  assert.equal(acceptLichSnapshot(accepted,{...accepted,id:'another',revision:0,eventSeq:0}),true);
});

test('real action/read overlap returns an older token with a later clock; it must not undo the accepted attack',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  const roomId=await h.party();
  for(const id of [1,2,3])await h.command('ready',{roomId,ready:true},id);
  await h.command('start',{roomId});
  const room=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json),now=Date.now();
  room.round=5;room.step='TRANSITION';room.challenge.deadline=now;room.clock=now;room.endsAt=now+60000;tickLichRoom(room,now);
  room.step='EXPOSED';room.challenge.deadline=now+12000;room.boss.hp=Math.round(room.boss.maxHp*.1);
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
  const state=(await h.call('status?roomId='+roomId)).body.state;
  const control=state.controls.find(c=>c.action==='STRIKE');
  let release,arrived;const hold=new Promise(r=>release=r),arrival=new Promise(r=>arrived=r),batch=h.env.DB.batch.bind(h.env.DB);
  h.env.DB.batch=async statements=>{arrived();await hold;return batch(statements);};
  const action=h.command('action',{roomId,challengeId:state.challenge.id,action:'STRIKE',stepToken:control.token});
  await arrival;await new Promise(r=>setTimeout(r,5));
  const stale=(await h.call('status?roomId='+roomId)).body.state;
  release();const accepted=(await action).body.state;
  assert.ok(stale.serverNow>accepted.serverNow,'read happened during the pending commit');
  assert.ok(stale.revision<accepted.revision);assert.ok(stale.bossHp>accepted.bossHp);
  assert.notEqual(stale.controls.find(c=>c.action==='STRIKE').token,accepted.controls.find(c=>c.action==='STRIKE').token);
  assert.equal(acceptLichSnapshot(accepted,stale),false);
});

test('a missing response releases the input within the short budget and ignores late success',async()=>{
  let finish,signal,applied=0;
  const pending=withLichInputDeadline(s=>{signal=s;return new Promise(r=>finish=r);},{timeoutMs:20}).then(()=>applied++);
  await assert.rejects(pending,{code:'LICH_INPUT_TIMEOUT',status:408,retryable:true});
  assert.equal(signal.aborted,true);
  finish({ok:true});await new Promise(r=>setImmediate(r));assert.equal(applied,0);
});

test('deadline covers all contention retries, not a fresh timeout on every attempt',async()=>{
  let attempts=0;
  await assert.rejects(withLichInputDeadline(signal=>retryLichRequest(async()=>{
    attempts++;throw Object.assign(Error('busy'),{status:409,code:'JOINT_LOCK_BUSY'});
  },{signal}),{timeoutMs:20}),{code:'LICH_INPUT_TIMEOUT'});
  await new Promise(r=>setTimeout(r,140));assert.equal(attempts,1);
});

test('normal success, gameplay rejection and leaving the raid keep their original outcome',async()=>{
  assert.deepEqual(await withLichInputDeadline(async()=>({ok:true})),{ok:true});
  await assert.rejects(withLichInputDeadline(async()=>{throw Object.assign(Error('late'),{code:'TOO_LATE'});}),{code:'TOO_LATE'});
  const lifecycle=new AbortController();let inputSignal;
  const pending=withLichInputDeadline(signal=>{inputSignal=signal;return new Promise(()=>{});},{signal:lifecycle.signal});
  await new Promise(r=>setImmediate(r));lifecycle.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(inputSignal.aborted,true);
  let called=false;await assert.rejects(withLichInputDeadline(()=>{called=true;},{signal:lifecycle.signal}),{name:'AbortError'});assert.equal(called,false);
});

test('a soft input deadline accepts the still-live request result once and never resumes refused retries',async()=>{
 const lifecycle=new AbortController();let finish,budgetSignal;const late=[];
 await assert.rejects(withLichInputDeadline(signal=>{
  budgetSignal=signal;return retryLichRequest(()=>new Promise(r=>finish=r),{signal});
 },{signal:lifecycle.signal,timeoutMs:20,onLateResult:r=>late.push(r)}),{code:'LICH_INPUT_TIMEOUT'});
 assert(budgetSignal.aborted);assert(!lifecycle.signal.aborted,'request lifetime remains attached to the screen');
 finish({state:{status:'CLEAR'}});await new Promise(r=>setImmediate(r));assert.deepEqual(late,[{state:{status:'CLEAR'}}]);
 let reject,attempts=0;
 await assert.rejects(withLichInputDeadline(signal=>retryLichRequest(()=>{attempts++;return new Promise((_,r)=>reject=r);},{signal}),{timeoutMs:20,onLateResult:()=>assert.fail('no late success')}),{code:'LICH_INPUT_TIMEOUT'});
 reject(Object.assign(Error('busy'),{status:409,code:'JOINT_LOCK_BUSY'}));await new Promise(r=>setTimeout(r,150));assert.equal(attempts,1);
});

test('leaving after the soft deadline suppresses the late response',async()=>{
 const lifecycle=new AbortController();let finish,applied=0;
 await assert.rejects(withLichInputDeadline(()=>new Promise(r=>finish=r),{signal:lifecycle.signal,timeoutMs:20,onLateResult:()=>applied++}),{code:'LICH_INPUT_TIMEOUT'});
 lifecycle.abort();finish({ok:true});await new Promise(r=>setImmediate(r));assert.equal(applied,0);
});
