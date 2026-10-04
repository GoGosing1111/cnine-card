import test from 'node:test';
import assert from 'node:assert/strict';
import {createApocalypseRequestQueue} from '../js/apocalypse-challenge-v1.mjs';

const locked=()=>Object.assign(new Error('same account is busy'),{code:'USER_ACTION_IN_PROGRESS',status:409});
test('a pending heartbeat completes before claim; rejected lock acquisition retries the same receipt',async()=>{
  let releasePulse,active=0,maxActive=0,claims=0,settlements=0;
  const events=[],delays=[],body={runToken:'same-memory-nonce',played:true};
  const queue=createApocalypseRequestQueue(async(action,id,data)=>{
    active++;maxActive=Math.max(maxActive,active);events.push({action,id,data});
    try{
      if(action==='pulse')await new Promise(resolve=>{releasePulse=resolve});
      if(action==='claim'&&++claims<3)throw locked();
      if(action==='claim')settlements++;
      return {status:action==='claim'?'CLAIMED':'ANSWERED'};
    }finally{active--}
  },{pause:async ms=>{delays.push(ms)}});
  const pulse=queue.send('pulse','attempt-1',{runToken:body.runToken});
  await Promise.resolve();
  const claim=queue.send('claim','attempt-1',body);
  await Promise.resolve();
  assert.equal(queue.busy,true);assert.deepEqual(events.map(e=>e.action),['pulse']);
  releasePulse();await pulse;
  assert.equal((await claim).status,'CLAIMED');assert.equal(maxActive,1);assert.equal(settlements,1);
  assert.equal(claims,3);assert.equal(delays.length,2);assert.equal(queue.busy,false);
  for(const event of events.filter(e=>e.action==='claim')){assert.equal(event.id,'attempt-1');assert.equal(event.data,body)}
});

test('leaving the battle cancels both a waiting retry and a queued claim',async()=>{
  let left=false,calls=0;
  const queue=createApocalypseRequestQueue(async()=>{calls++;throw locked()},{pause:async()=>{left=true}});
  const ensure=()=>{if(left)throw Error('battle abandoned')};
  const first=queue.send('pulse','attempt-2',{},ensure),second=queue.send('claim','attempt-2',{played:true},ensure);
  const results=await Promise.allSettled([first,second]);
  for(const result of results){assert.equal(result.status,'rejected');assert.match(result.reason.message,/abandoned/)}
  assert.equal(calls,1);assert.equal(queue.busy,false);
});

test('persistent locks are bounded; validation and network errors are never blindly replayed',async()=>{
  let calls=0,pauses=0;
  const queue=createApocalypseRequestQueue(async()=>{calls++;throw locked()},{pause:async()=>{pauses++}});
  await assert.rejects(queue.send('claim','attempt-3'),{code:'USER_ACTION_IN_PROGRESS'});
  assert.equal(calls,7);assert.equal(pauses,6);assert.equal(queue.busy,false);
  for(const error of [Object.assign(Error('wrong nonce'),{code:'INVALID_RUN_TOKEN'}),new TypeError('Failed to fetch')]){
    let count=0;
    const q=createApocalypseRequestQueue(async()=>{count++;throw error},{pause:async()=>assert.fail('must not retry')});
    await assert.rejects(q.send('claim','attempt-4'),e=>e===error);assert.equal(count,1);
  }
});

test('a failed foreground action does not poison subsequent status recovery',async()=>{
  const queue=createApocalypseRequestQueue(async action=>{if(action==='answer')throw Error('connection lost');return {status:'ANSWERED'}});
  await assert.rejects(queue.send('answer','attempt-5'));
  assert.equal((await queue.send('status','attempt-5')).status,'ANSWERED');
});
