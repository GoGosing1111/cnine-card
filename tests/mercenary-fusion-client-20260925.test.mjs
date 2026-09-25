import test from 'node:test';
import assert from 'node:assert/strict';
import {createFusionClient,fusionPendingKey,readFusionPending,validateFusionReceipt} from '../mercenary-codex/fusion/client.mjs';

const materials=Array(8).fill('V-004'),key=fusionPendingKey(7);
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const completed=requestId=>({requestId,status:'COMPLETED',consumed:[{code:'V-004',quantity:8,totalBefore:9,duplicatesBefore:8}],result:{mercenaryCode:'V-021',inputRank:'SS',resultRank:'SSS',promoted:true,quantity:1,name:'오메가-X',totalCopiesAfter:1,duplicatesAfter:0}});
const error=code=>Object.assign(Error(code),{code});
const client=(store,request,extra={})=>createFusionClient({accountId:7,token:'account-7',storage:store,currentToken:()=> 'account-7',request,locks:null,...extra});
test('persist before POST; simultaneous clicks share one ID and one request',async()=>{
  const store=storage();let posts=0,release;
  const c=client(store,async(path,options)=>{posts++;assert.equal(path,'mercenaries/v3/fusion');assert.deepEqual(JSON.parse(store.getItem(key)),options.body);await new Promise(r=>release=r);return completed(options.body.requestId);});
  const first=c.run(materials),second=c.run(materials);assert.equal(first,second);
  await new Promise(r=>setTimeout(r,0));release();const result=await first;assert.equal(posts,1);
  assert.equal(c.pending().requestId,result.requestId,'completion stays recoverable until the result is shown');
  c.acknowledge('different-request');assert.ok(c.pending());c.acknowledge(result.requestId);assert.equal(c.pending(),null);
});
test('lost POST response recovers completed receipt after reopen with zero new POSTs',async()=>{
  const store=storage();let committed;
  await assert.rejects(client(store,async(_path,options)=>{committed=completed(options.body.requestId);throw error('JOINT_RESPONSE_INVALID');}).run(materials));
  const pending=readFusionPending(store,key);assert.equal(pending.requestId,committed.requestId);
  const requests=[],reopened=client(store,async(path,options)=>{requests.push({path,options});return committed;});
  assert.deepEqual(await reopened.run(undefined,{submit:false}),committed);assert.equal(requests.length,1);assert.equal(requests[0].options.method,undefined);
});
test('PENDING and missing receipt keep the original ID; automatic recovery never POSTs',async()=>{
  for(const found of [true,false]){
    const store=storage(),p={requestId:crypto.randomUUID(),materials};store.setItem(key,JSON.stringify(p));const writes=[];
    const c=client(store,async(path,options)=>{if(path.includes('/receipt')){if(!found)throw error('JOINT_NOT_FOUND');return {requestId:p.requestId,status:'PENDING'};}writes.push(options.body);return completed(options.body.requestId);});
    await c.run(undefined,{submit:false});assert.equal(writes.length,0);assert.deepEqual(c.pending(),p);
    assert.equal((await c.run()).status,'COMPLETED');assert.deepEqual(writes,[p]);
  }
});
test('unavailable storage prevents spending; malformed pending cannot be silently discarded',async()=>{
  const store=storage();let requests=0;const request=async()=>{requests++;};
  await assert.rejects(client({...store,setItem(){throw Error('quota');}},request).run(materials),{code:'FUSION_STORAGE'});
  store.setItem(key,'{broken');await assert.rejects(client(store,request).run(materials),{code:'FUSION_PENDING_INVALID'});assert.equal(store.getItem(key),'{broken');assert.equal(requests,0);
});
test('uncertain/auth/lock outcomes preserve the receipt ID; definitive cancellation clears it',async()=>{
  for(const code of ['JOINT_RESPONSE_INVALID','JOINT_REQUEST_CONFLICT','MERCENARY_FUSION_AUTH','USER_MUTATION_BUSY','MERCENARY_FUSION_RECEIPT']){
    const store=storage(),c=client(store,async()=>{throw error(code);});await assert.rejects(c.run(materials));assert.ok(c.pending());
  }
  for(const code of ['MERCENARY_FUSION_DUPLICATES','MERCENARY_FUSION_INVENTORY_CHANGED','JOINT_OPERATION_SUPERSEDED']){
    const store=storage(),p={requestId:crypto.randomUUID(),materials};store.setItem(key,JSON.stringify(p));
    const c=client(store,async()=>{throw error(code);});await assert.rejects(c.run());assert.equal(c.pending(),null);
  }
});
test('session change and close reject late completion without losing a possibly committed request',async()=>{
  for(const change of ['token','close']){
    const store=storage(),controller=new AbortController();let current='account-7';
    const c=client(store,async(_path,options)=>{if(change==='token')current='account-8';else controller.abort();return completed(options.body.requestId);},{currentToken:()=>current,signal:controller.signal});
    await assert.rejects(c.run(materials),change==='token'?{code:'FUSION_SESSION_CHANGED'}:{name:'AbortError'});assert.ok(c.pending());
  }
});
test('cross-tab Web Lock prevents a second submission while the first response is pending',async()=>{
  let held=false,release,posts=0;const store=storage(),locks={async request(_key,_options,work){if(held)return work(null);held=true;try{return await work({name:key});}finally{held=false;}}};
  const request=async(_path,options)=>{posts++;await new Promise(r=>release=r);return completed(options.body.requestId);};
  const first=client(store,request,{locks}).run(materials);await new Promise(r=>setTimeout(r,0));
  await assert.rejects(client(store,request,{locks}).run(materials),{code:'FUSION_BUSY'});release();await first;assert.equal(posts,1);
});
test('invalid receipts and wrong-account state never authorize new spending',async()=>{
  const id=crypto.randomUUID(),good=completed(id);assert.deepEqual(validateFusionReceipt(good,id),good);
  for(const bad of [{...good,requestId:'other'},{...good,consumed:[]},{...good,consumed:[null]},{...good,result:{...good.result,quantity:2}},{...good,result:{...good.result,resultRank:'S'}}])assert.throws(()=>validateFusionReceipt(bad,id),{code:'FUSION_RESPONSE_INVALID'});
  const store=storage(),c=client(store,async()=>({...good,requestId:'other'}));await assert.rejects(c.run(materials),{code:'FUSION_RESPONSE_INVALID'});assert.ok(c.pending());
  await assert.rejects(client(storage(),async()=>({accountId:8,cards:[]})).state(),{code:'FUSION_STATE'});
});
test('hung response and transport abort both leave a recoverable ID with a bounded Korean error',async t=>{
  const timer=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timer(fn,Math.min(ms,10),...args));
  for(const request of [()=>new Promise(()=>{}),async()=>{throw new DOMException('aborted','AbortError');}]){
    const c=client(storage(),request);await assert.rejects(c.run(materials),{code:'FUSION_TIMEOUT'});assert.ok(c.pending());
  }
});
