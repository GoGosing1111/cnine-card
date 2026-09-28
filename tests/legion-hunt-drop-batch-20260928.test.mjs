import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: one bounded reveal batch persists simultaneous kills once and reuses receipts`,async()=>{
 const f=await legionFixture({postgres});try{
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},
   timeLimit:1000,eventTimes:Array(12).fill(100),timeline:Array.from({length:12},(_,i)=>({seq:i+1,combatAtMs:100,huntKill:true})),outcome:{}},{now:options.now}),{payload:{}});
  await f.configure();const id=(await f.call('legion-hunt/start',{difficulty:'normal'})).body.id;
  await f.call('legion-hunt/begin',{id});f.clock.now+=101;
  for(const seqs of [[],[1,1],[2,1],[1,2.5],Array.from({length:25},(_,i)=>i+1),[1,13]]){
   const bad=await f.call('legion-hunt/reveal',{id,seqs});assert.ok(bad.status>=400);
  }
  const saved=async()=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:1').first()).value).state;
  assert.equal((await saved()).observed.length,0,'invalid batches do not partly advance or roll');
  const seqs=Array.from({length:12},(_,i)=>i+1);
  f.fail('UPDATE app_meta');assert.equal((await f.call('legion-hunt/reveal',{id,seqs})).status,503);f.fail('');
  assert.equal((await saved()).observed.length,0,'failed persistence rolls back the whole batch');
  f.resetQueries();const first=await f.call('legion-hunt/reveal',{id,seqs});assert.equal(first.status,200);
  assert.equal(f.queries.length,3,'one policy read, one session read, one session write for twelve deaths');
  const retry=await f.call('legion-hunt/reveal',{id,seqs});assert.deepEqual(retry.body,first.body);
  assert.equal((await saved()).observed.length,12);assert.equal(first.body.drops.length,12);
  assert.deepEqual((await f.call('legion-hunt/reveal',{id,seq:1})).body.drop,first.body.drops[0],'older single-reveal clients remain compatible');
  const drop=first.body.drops.find(Boolean);assert.ok(drop);
  const claim={id,dropId:drop.id,token:drop.token,...drop.position};
  const picked=await f.call('legion-hunt/claim',claim);assert.equal(picked.status,200);
  assert.deepEqual((await f.call('legion-hunt/claim',claim)).body,picked.body);
 }finally{await f.close();}
});
test('simultaneous client deaths become one request and stale sessions cannot publish drops',async()=>{
 const source=fs.readFileSync('preview/sustained-hunt-v2/app.js','utf8'),calls=[],added=[];
 const context={epoch:1,session:'run',playing:true,finishing:false,pendingReveals:[],reveals:Promise.resolve(),
  setTimeout:fn=>queueMicrotask(fn),request:async(action,body)=>{calls.push({action,body});return {drops:body.seqs.map(seq=>({id:String(seq)})),serverNow:1};},
  engine:{groundDrops:{add:async drop=>added.push(drop.id)}},message(){},errorText:e=>e.message};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function queueDropReveal('),source.indexOf('  function buttons(')),context);
 for(let seq=1;seq<=12;seq++)context.queueDropReveal(seq);
 await vm.runInContext('reveals',context);
 assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0].body.seqs),Array.from({length:12},(_,i)=>i+1));assert.equal(added.length,12);
 context.queueDropReveal(13);context.epoch++;await vm.runInContext('reveals',context);assert.equal(calls.length,1);
});
