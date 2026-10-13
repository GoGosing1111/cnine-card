import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {UserMutationLock} from '../workers/user-lock/src/index.js';
import {retryLichRequest} from '../raid/lich-king/request-retry.mjs';

test('live account lock rejects overlapping role changes as retryable, then commits the same request once',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  const roomId=await h.party(),lock=new UserMutationLock({});
  const callLock=(action,body)=>lock.fetch(new Request('https://lock/'+action,{method:'POST',body:JSON.stringify(body)})).then(r=>r.json());
  h.deps.withUserMutationLock=async(_env,userId,path,work)=>{
    const token=crypto.randomUUID();
    if(!(await callLock('acquire',{token,actionPath:path,leaseMs:20000})).acquired)
      throw Object.assign(Error('같은 계정의 요청을 처리 중입니다. 잠시 후 다시 확인하세요.'),{status:409,code:'JOINT_LOCK_BUSY'});
    try{return await work();}finally{await callLock('release',{token});}
  };
  await callLock('acquire',{token:'previous-action',actionPath:'raid/lich/action',leaseMs:20000});
  const requestId=h.uid(),body={roomId,targetId:'1',role:'WARDEN',requestId};
  const blocked=await h.call('assign',{body});
  assert.equal(blocked.status,409);assert.equal(blocked.body.code,'JOINT_LOCK_BUSY');
  assert.equal(blocked.body.retryable,true,'temporary contention is not a final failed input');
  assert.ok(blocked.body.retryAfterMs>0&&blocked.body.retryAfterMs<=600);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_lich_receipts_v1 WHERE request_id=?','1:'+requestId)).n),0);
  await callLock('release',{token:'previous-action'});
  const success=await h.call('assign',{body}),replay=await h.call('assign',{body});
  assert.equal(success.status,200);assert.equal(success.body.state.me.role,'WARDEN');
  assert.equal(replay.body.state.revision,success.body.state.revision);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_lich_receipts_v1 WHERE request_id=?','1:'+requestId)).n),1);
  assert.equal((await h.command('assign',{roomId,targetId:'1',role:'RESCUE'},2)).body.retryable,false,'permissions must not become retryable');
});

test('temporary refusals retry the exact same receipt and input, including an older server without a retry hint',async()=>{
  const body={requestId:crypto.randomUUID(),action:'INTERRUPT',stepToken:'unchanged'},sent=[];
  const result=await retryLichRequest(async()=>{
    sent.push(structuredClone(body));
    if(sent.length<3)throw Object.assign(Error('busy'),{status:409,code:sent.length===1?'JOINT_LOCK_BUSY':'LICH_BUSY',retryable:false});
    return {ok:true};
  });
  assert.equal(result.ok,true);assert.deepEqual(sent,[body,body,body]);
});

test('persistent contention is bounded and keeps the request retryable',async()=>{
  let attempts=0;
  await assert.rejects(retryLichRequest(async()=>{attempts++;throw Object.assign(Error('busy'),{status:409,code:'JOINT_LOCK_BUSY'});}),{code:'JOINT_LOCK_BUSY',retryable:true});
  assert.equal(attempts,5);
});

test('permissions, stale steps, deadlines, resources, network errors and unknown conflicts are not auto-replayed',async()=>{
  for(const [status,code]of [[403,'LICH_HOST_ONLY'],[409,'STALE_STEP'],[409,'TOO_LATE'],[409,'LICH_TICKET_REQUIRED'],[409,'OTHER_CONFLICT'],[429,'RATE_LIMIT'],[503,'LICH_RETRYABLE'],[0,'NETWORK_ERROR']]){
    let attempts=0;
    await assert.rejects(retryLichRequest(async()=>{attempts++;throw Object.assign(Error(code),{status,code});}),{code});
    assert.equal(attempts,1,code);
  }
});

test('leaving the screen cancels backoff without sending another action',async()=>{
  const lifecycle=new AbortController();let attempts=0;
  const result=retryLichRequest(async()=>{attempts++;queueMicrotask(()=>lifecycle.abort());throw Object.assign(Error('busy'),{status:409,code:'JOINT_LOCK_BUSY'});},{signal:lifecycle.signal});
  await assert.rejects(result,{name:'AbortError'});assert.equal(attempts,1);
});

test('a completed, reassigned or expired mechanic stops its queued retry',async()=>{
  let current=true,attempts=0,checks=0;
  await assert.rejects(retryLichRequest(async()=>{attempts++;throw Object.assign(Error('busy'),{status:409,code:'JOINT_LOCK_BUSY'});},{canRetry:()=>{checks++;if(checks>1)current=false;return current;}}),{code:'LICH_INPUT_SUPERSEDED'});
  assert.equal(attempts,1);assert.equal(checks,2);
});
