import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/BattleEngine.js',import.meta.url),'utf8');
const method=source.slice(source.indexOf('  waitForAccountBattleUnitDamageQueueDrain('),source.indexOf('  async stopAccountBattleUnitSustainedFire('));
function fixture({count=0,firing=false}={}){
  let now=0,sequence=0;const tasks=[];
  const sandbox={performance:{now:()=>now},setTimeout(fn,ms){tasks.push({fn,at:now+ms,sequence:sequence++});},Boolean,Number,Math};
  vm.runInNewContext(`class Engine {${method}};globalThis.Engine=Engine;`,sandbox);
  const run={active:true,shots:0};
  const engine=Object.assign(new sandbox.Engine(),{visible:true,playbackEpoch:1,accountBattleUnitFireRun:run,accountBattleUnitDamageQueue:Array.from({length:count},(_,i)=>({id:i,targetId:`enemy-${i%2}`})),accountBattleUnit:{fireTimeline:firing?{}:null},accountBattleUnitSustainedShotCount:0,accountBattleUnitDamageEventCount:0});
  const schedule=(at,fn)=>tasks.push({at,fn,sequence:sequence++});
  async function untilDone(promise,max=30000){
    let value,done=false;promise.then(v=>{value=v;done=true;});
    await Promise.resolve();
    while(!done&&tasks.length){tasks.sort((a,b)=>a.at-b.at||a.sequence-b.sequence);const task=tasks.shift();assert(task.at<=max,'drain must remain bounded');now=task.at;task.fn();await Promise.resolve();}
    assert(done,'drain must settle');return {value,elapsed:now};
  }
  return {engine,run,schedule,untilDone};
}

test('sixteen alternating Z-BODY targets finish their 640ms attacks beyond six seconds without a false interruption',async()=>{
  const f=fixture({count:16,firing:true}),original=f.engine.accountBattleUnitDamageQueue.slice(),receipts=[];
  for(let i=0;i<16;i++)f.schedule((i+1)*640,()=>{receipts.push(f.engine.accountBattleUnitDamageQueue.shift());f.run.shots++;f.engine.accountBattleUnitSustainedShotCount++;if(i===15)f.engine.accountBattleUnit.fireTimeline=null;});
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));
  assert.equal(result.value,true);assert(result.elapsed>=10240);assert.deepEqual(receipts,original,'all server receipts stay ordered and keep their exact target');assert.equal(f.engine.accountBattleUnitDamageQueue.length,0);
});

test('a genuinely stuck queue still fails after six seconds without discarding receipts',async()=>{
  const f=fixture({count:2,firing:true}),original=f.engine.accountBattleUnitDamageQueue.slice();
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));
  assert.equal(result.value,false);assert.equal(result.elapsed,6000);assert.deepEqual(f.engine.accountBattleUnitDamageQueue,original);
});

test('one successful attack does not hide a later stall',async()=>{
  const f=fixture({count:2,firing:true});
  f.schedule(4000,()=>{f.engine.accountBattleUnitDamageQueue.shift();f.engine.accountBattleUnitSustainedShotCount++;});
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));
  assert.equal(result.value,false);assert.equal(result.elapsed,10000);assert.equal(f.engine.accountBattleUnitDamageQueue.length,1);
});

test('adding receipts without landing an attack cannot extend the stall deadline',async()=>{
  const f=fixture({count:1,firing:true});
  for(let i=1;i<6;i++)f.schedule(i*1000,()=>f.engine.accountBattleUnitDamageQueue.push({id:i}));
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));
  assert.equal(result.value,false);assert.equal(result.elapsed,6000);assert.equal(f.engine.accountBattleUnitDamageQueue.length,6);
});

test('an in-flight last attack remains a barrier after its queue entry has been removed',async()=>{
  const f=fixture({firing:true});f.schedule(900,()=>{f.engine.accountBattleUnit.fireTimeline=null;});
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));assert.equal(result.value,true);assert(result.elapsed>=900);
});

test('explicit user pause does not exhaust the active attack stall budget',async()=>{
  const f=fixture({count:1,firing:true});f.engine.accountBattleUnitIsPaused=()=>true;
  f.schedule(8000,()=>{f.engine.accountBattleUnitIsPaused=()=>false;});
  f.schedule(8500,()=>{f.engine.accountBattleUnitDamageQueue.shift();f.engine.accountBattleUnit.fireTimeline=null;});
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));assert.equal(result.value,true);assert(result.elapsed>=8500);
});

test('cancellation releases the old generation without consuming a new generation queue',async()=>{
  const f=fixture({count:1,firing:true});f.schedule(120,()=>{f.engine.playbackEpoch++;f.engine.accountBattleUnitDamageQueue=[{id:'new'}];});
  const result=await f.untilDone(f.engine.waitForAccountBattleUnitDamageQueueDrain(6000));assert.equal(result.value,true);assert.deepEqual(f.engine.accountBattleUnitDamageQueue,[{id:'new'}]);
});
