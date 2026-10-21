import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryPityFixture,seedLegacyFailures} from './helpers/mercenary-pity-fixture.mjs';
import {planMercenaryBreakthrough,mercenaryLevelDraft} from '../shared/mercenary-level-v1.mjs';
import {mercenaryBreakthroughPity} from '../shared/mercenary-breakthrough-pity-v1.mjs';
import {readMercenaryBreakthroughHistory,mercenaryPityFromHistory} from '../functions/_mercenary_level_pity.js';
import {runPreparedMercenaryLevel,mercenaryLevelReceipt} from '../functions/_mercenary_level.js';
import {readMercenaryLevelState} from '../functions/_mercenary_level_policy.js';
import {jointHash} from '../functions/_joint_transactions.js';

const request=(revision,code='V-049')=>({requestId:crypto.randomUUID(),mercenaryCode:code,revision});
const failRoll={randomInt:()=>999999};
const pity=async(f,code='V-049',user=7)=>mercenaryPityFromHistory(await readMercenaryBreakthroughHistory(f.env,user),code,await readMercenaryLevelState(f.env,user,code));

test('exact 10/20 failed-attempt boundary; base 10% chance and XP cost stay unchanged',()=>{
 const policy=mercenaryLevelDraft();policy.mode='ON';Object.keys(policy.xpPerCard).forEach(k=>policy.xpPerCard[k]=100);policy.levels.forEach(r=>r.requiredXp=300);policy.milestones.forEach(r=>Object.assign(r,{successChancePpm:100000,bonus:{type:'ATTACK_PERCENT',value:1}}));
 for(const [index,level]of [5,10,15,20].entries()){
  const threshold=level===20?20:10,state={level,experience:300,breakthroughMask:(1<<index)-1,revision:0};
  for(const failures of [0,threshold-1,threshold,37]){
   const r=planMercenaryBreakthrough({policy,state,target:{code:'V-049'},roll:999999,pityFailures:failures});
   assert.equal(r.success,failures>=threshold);assert.equal(r.pity.failuresAfter,r.success?0:failures+1);assert.equal(r.after.experience,0);assert.equal(r.milestone.successChancePpm,100000);
   assert.equal(r.pity.effectiveChancePpm,r.success?1000000:100000);
  }
  assert.equal(planMercenaryBreakthrough({policy,state,target:{code:'V-049'},roll:99999}).success,true);
  assert.equal(planMercenaryBreakthrough({policy,state,target:{code:'V-049'},roll:100000}).success,false);
  assert.throws(()=>planMercenaryBreakthrough({policy,state:{...state,experience:299},target:{code:'V-049'},roll:0,pityFailures:threshold}),{code:'MERCENARY_LEVEL_NOT_READY'});
 }
});

for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(`${engine}: legacy failures are retroactive for each milestone, and guarantee commits only once`,async t=>{
  const f=await mercenaryPityFixture(t,postgres),beforeCoin=await f.coin();
  for(const [level,count]of [[5,10],[10,10],[15,37],[20,20]]){
   const {state}=await seedLegacyFailures(f,{level,count,startRevision:level*100});
   const status=await f.call('state');assert.equal(status.status,200);const card=status.body.cards.find(c=>c.code==='V-049');assert.deepEqual(card.breakthroughPity,mercenaryBreakthroughPity(level,count));
   const body=request(state.revision),r=await runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',failRoll);
   assert.equal(r.result.success,true);assert.equal(r.result.pity.guaranteed,true);assert.equal(r.result.pity.failuresBefore,count);assert.equal(r.result.after.experience,0);
   const replay=await runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',{randomInt:()=>assert.fail('completed receipt rerolled')});assert.deepEqual(replay.result,r.result);assert.equal(replay.replayed,true);
   assert.equal((await pity(f))?.failures??0,0);assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-049'),r.result.after);
  }
  assert.equal(await f.coin(),beforeCoin);assert.equal(Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-049'").first()).total_copies),201);
 });
 test(`${engine}: tenth failure, XP refill and guaranteed eleventh attempt preserve counters and materials`,async t=>{
  const f=await mercenaryPityFixture(t,postgres),{state}=await seedLegacyFailures(f,{count:9});
  const tenth=await runPreparedMercenaryLevel(f.env,f.user,request(state.revision),'BREAKTHROUGH',failRoll);assert.equal(tenth.result.success,false);assert.equal(tenth.result.pity.failuresAfter,10);assert.equal((await pity(f)).guaranteed,true);
  await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,request(tenth.result.after.revision),'BREAKTHROUGH',failRoll),{code:'MERCENARY_LEVEL_NOT_READY'});
  const train=await runPreparedMercenaryLevel(f.env,f.user,{...request(tenth.result.after.revision),materials:[{code:'V-049',quantity:1}]},'TRAIN');assert.equal((await pity(f)).failures,10);
  const [a,b]=await Promise.all([f.deps.withUserMutationLock(f.env,7,'test',()=>runPreparedMercenaryLevel(f.env,f.user,request(train.result.after.revision),'BREAKTHROUGH',failRoll)),f.deps.withUserMutationLock(f.env,7,'test',()=>runPreparedMercenaryLevel(f.env,f.user,request(train.result.after.revision),'BREAKTHROUGH',failRoll)).then(x=>x,e=>e)]);
  assert.equal(a.result.success,true);assert.equal(b.code,'MERCENARY_LEVEL_CONFLICT');assert.equal((await pity(f)).failures,0);assert.equal((await pity(f)).level,10);
  assert.equal(Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-049'").first()).total_copies),200);
 });
 test(`${engine}: rollback, cancelled/pending/test requests, other users and mercenaries cannot inflate pity`,async t=>{
  const f=await mercenaryPityFixture(t,postgres),{state}=await seedLegacyFailures(f,{count:9});
  await seedLegacyFailures(f,{code:'V-055',count:30});await seedLegacyFailures(f,{userId:8,count:30});
  await seedLegacyFailures(f,{count:2,status:'PENDING',startRevision:100});await seedLegacyFailures(f,{count:2,status:'CANCELLED',startRevision:200});await seedLegacyFailures(f,{count:2,mode:'TEST',startRevision:300});await f.setState('V-049',state);
  assert.equal((await pity(f)).failures,9);
  const body=request(state.revision);f.fail("UPDATE joint_operations_v1 SET status='COMPLETED'");await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',failRoll));f.fail('');
  assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-049'),state);assert.equal((await pity(f)).failures,9);
  const retry=await runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',{randomInt:()=>assert.fail('pending result rerolled')});assert.equal(retry.result.pity.failuresAfter,10);assert.equal((await pity(f)).failures,10);
  const forged=await f.call('breakthrough',{...request(retry.result.after.revision),pityFailures:999});assert.equal(forged.status,400);assert.equal(forged.body.code,'JOINT_BODY');
 });
 test(`${engine}: old completed receipts stay frozen; pre-release pending failure cannot bypass new guarantee`,async t=>{
  const f=await mercenaryPityFixture(t,postgres),{state,plans}=await seedLegacyFailures(f,{count:10});
  const old=await mercenaryLevelReceipt(f.env,f.user,plans[0].requestId);assert.equal(old.result.success,false);assert.equal(old.result.pity,undefined);
  const body=request(state.revision),input={action:'BREAKTHROUGH',mercenaryCode:'V-049',revision:state.revision};
  const plan={...plans[0].plan,result:planMercenaryBreakthrough({policy:f.policy,state,target:{code:'V-049'},roll:999999})};delete plan.result.pity;
  await f.p('INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,?,?,?,?,?,?)',body.requestId,7,'MERCENARY_LEVEL_V1',await jointHash({kind:'MERCENARY_LEVEL_V1',input}),JSON.stringify(plan),'PENDING',plan.createdAt).run();
  await assert.rejects(()=>runPreparedMercenaryLevel(f.env,f.user,body,'BREAKTHROUGH',failRoll),{code:'MERCENARY_LEVEL_CONFLICT'});
  assert.deepEqual(await readMercenaryLevelState(f.env,7,'V-049'),state);assert.equal((await pity(f)).failures,10);
  assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');
  const r=await runPreparedMercenaryLevel(f.env,f.user,request(state.revision),'BREAKTHROUGH',failRoll);assert.equal(r.result.success,true);assert.equal(r.result.pity.guaranteed,true);
 });
}

test('history uses receipt revision, deduplicates IDs, resets after success and ignores later snapshots',async t=>{
 const f=await mercenaryPityFixture(t),{state,plans}=await seedLegacyFailures(f,{count:3});
 const middle=structuredClone(plans[1]);middle.plan.result=planMercenaryBreakthrough({policy:f.policy,state:middle.plan.result.before,target:{code:'V-049'},roll:0});
 const history=[plans[2],plans[0],middle,plans[2]];
 assert.equal(mercenaryPityFromHistory(history,'V-049',state).failures,1);
 assert.equal(mercenaryPityFromHistory(history,'V-049',{...state,revision:1}).failures,1);
 assert.equal(mercenaryPityFromHistory(history,'V-055',state).failures,0);
 const bad=structuredClone(plans[0]);bad.plan.result.after.revision=100;bad.plan.result.before.revision=1;
 assert.throws(()=>mercenaryPityFromHistory([bad],'V-049',{...state,revision:101}),{code:'MERCENARY_LEVEL_HISTORY'});
});
