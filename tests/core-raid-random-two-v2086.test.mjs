import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_MECHANIC_POOL,selectCoreMechanics,coreMechanicEvents,coreMechanicPlans,verifyScreenMechanic,MECHANICS} from '../shared/core-raid-mechanics-v2086.js';
import {createCoreRaidChallenge,evaluateCoreRaidQte,validCoreRaidSubmission,coreRaidAttemptOutcome,applyCoreRaidBalanceGate} from '../functions/_raid_core_protocol.js';
import {coreTraces,mechanicTrace} from './helpers/core-mechanic-traces.mjs';
import {v3Harness} from './helpers/v3-raid-renderer-harness.mjs';

test('server random attempts cover all 20 ordered pairs, exactly two distinct mechanics per attempt',()=>{
 const pairs=new Set();
 for(let seed=0;seed<500;seed++){
  const pair=selectCoreMechanics(seed);
  assert.equal(pair.length,2);assert.equal(new Set(pair).size,2);
  assert.ok(pair.every(kind=>CORE_MECHANIC_POOL.includes(kind)));
  assert.deepEqual(pair,selectCoreMechanics(seed));pairs.add(pair.join(','));
 }
 assert.equal(pairs.size,20);
});
test('all ordered pairs are server verified; only selected mechanics affect outcome and scoring',()=>{
 for(const first of CORE_MECHANIC_POOL)for(const second of CORE_MECHANIC_POOL){
  if(first===second)continue;
  const c=createCoreRaidChallenge({attemptId:'TEST',roomId:'ROOM',userId:1});
  c.mechanics=[first,second].map((kind,seed)=>({kind,seed,windowMs:MECHANICS[kind]?.windowMs||5500}));
  const good=coreTraces(c),qte=evaluateCoreRaidQte(c,good);
  assert.equal(validCoreRaidSubmission(c,good),true,first+second);
  assert.equal(qte.allSuccess,true);assert.equal(qte.mechanics.length,2);
  assert.ok(qte.suppressionScore>=100&&qte.suppressionScore<=120);
  assert.deepEqual(coreMechanicEvents(c).map(e=>e.qteId),[first,second]);
  good.mechanics.UNSELECTED={success:false};assert.equal(evaluateCoreRaidQte(c,good).allSuccess,true);
  for(const plan of c.mechanics){
   const interrupted=structuredClone(good);delete interrupted.mechanics[plan.kind];
   assert.equal(validCoreRaidSubmission(c,interrupted),false);
   const timeout=structuredClone(good);timeout.mechanics[plan.kind]=mechanicTrace(plan,c,false);
   assert.equal(validCoreRaidSubmission(c,timeout),true);
   assert.equal(evaluateCoreRaidQte(c,timeout).allSuccess,false);
  }
 }
});
test('forged screen success, pointer positions, safe flags and connections are ignored',()=>{
 for(const kind of ['CENTER','CIRCUIT','SHELTER']){
  const plan={kind,seed:1,windowMs:MECHANICS[kind].windowMs};
  const failed={...mechanicTrace(plan,{},false),success:true,perfect:true,rounds:Array(3).fill({grade:'PERFECT',correct:true,safe:true})};
  assert.equal(verifyScreenMechanic(plan,failed).success,false);
  const good=mechanicTrace(plan,{});
  for(const mutation of [r=>r.cancelled=true,r=>r.durationMs=NaN,r=>r.durationMs=1,r=>r.trace[0].at=1,r=>r.trace.push({action:'MOVE',cell:99,at:0})]){
   const altered=structuredClone(good);mutation(altered);assert.equal(verifyScreenMechanic(plan,altered).valid,false);
  }
 }
 const center={kind:'CENTER',seed:0,windowMs:11000};
 assert.equal(verifyScreenMechanic(center,{trace:[{action:'START',at:0},...[450,451,452].map(at=>({action:'STOP',at}))],durationMs:452}).valid,false);
 const circuit={kind:'CIRCUIT',seed:0,windowMs:14000},dup=mechanicTrace(circuit,{});dup.trace.push(...dup.trace.slice(1,3).map(r=>({...r,at:600})));
 assert.equal(verifyScreenMechanic(circuit,dup).valid,false);
 const shelter={kind:'SHELTER',seed:0,windowMs:10800},late=mechanicTrace(shelter,{});late.trace[1].at=3000;
 assert.equal(verifyScreenMechanic(shelter,late).valid,false,'a late touch cannot dodge an already resolved blast');
});
test('legacy pending challenge keeps its original pair and valid input can still resolve',()=>{
 const old={sequence:['UP','LEFT'],sequenceWindowMs:5500,mashTarget:10,mashWindowMs:5000};
 assert.deepEqual(coreMechanicPlans(old).map(p=>p.kind),['SEQUENCE','MASH']);
 assert.equal(validCoreRaidSubmission(old,coreTraces(old)),true);
 assert.equal(validCoreRaidSubmission(old,{}),false);
 assert.equal(validCoreRaidSubmission(old,{sequence:{inputs:[],durationMs:0},mash:{presses:[],durationMs:0}}),false);
});
test('malformed stored pair cannot emit a single or duplicate mechanic',()=>{
 const c=createCoreRaidChallenge({attemptId:'MALFORMED'});
 c.mechanics=[c.mechanics[0],c.mechanics[0]];assert.deepEqual(coreMechanicPlans(c),[]);
 assert.equal(evaluateCoreRaidQte(c,{}).allSuccess,false);
 c.mechanicVersion=9999;assert.equal(validCoreRaidSubmission(c,{}),false);
});
test('reported defeat is reproducible as overload despite combat and QTE success; real combat loss remains authoritative',()=>{
 const outcome=coreRaidAttemptOutcome({serverWinner:'A',qte:{allSuccess:true},contribution:{coreProgress:24}});
 const result=applyCoreRaidBalanceGate({room:{coreTarget:360,coreScores:{BREAK:248,BLOCK:134,STABILIZE:240}},operation:'BREAK',outcome,settings:{coreBalanceTolerancePercent:34,coreImbalanceDamage:100}});
 assert.equal(result.engineSuccess,true);assert.equal(result.mechanicSuccess,true);assert.equal(result.success,false);
 assert.equal(result.failureReason,'CORE_OVERLOAD');assert.equal(result.partyHpDamage,100);
 assert.equal(result.projectedBalance.spread,138);assert.equal(result.projectedBalance.tolerance,123);
 assert.deepEqual(result.projectedBalance.recommendedOperations,['BLOCK']);
 assert.equal(coreRaidAttemptOutcome({serverWinner:'B',qte:{allSuccess:true}}).failureReason,'CORE_BATTLE_DEFEAT');
});

test('V3 ordinary and timed playback abort incomplete QTEs without playing the loss branch',async()=>{
 for(const timed of [false,true])for(const fault of ['missing','cancelled','throws','empty']){
  const h=v3Harness(),timeline=[{type:'RAID_QTE_CENTER',qteId:'CENTER',windowMs:11000},{type:'RAID_QTE_MASH',qteId:'MASH',windowMs:5000},{type:'BOSS_ULTIMATE',qteCondition:'ANY_FAILURE',hits:[]}];
  if(timed)timeline[0].combatClock='V3_COMBAT_MS_V1';
  const onInteractiveEvent=fault==='missing'?undefined:fault==='throws'?async()=>{throw Error('broken module');}:async()=>fault==='empty'?undefined:{success:false,cancelled:true};
  const renderer=await h.create({data:{battleV2:{result:{timeline}}},onInteractiveEvent});
  await assert.rejects(()=>renderer.play());assert.ok(!h.calls.includes('BOSS_ULTIMATE'),fault+' '+timed);
 }
});
test('V3 failure branch runs only after two completed mechanics and ignores a successful partial pair',async()=>{
 const h=v3Harness();let count=0;
 const renderer=await h.create({data:{battleV2:{result:{timeline:[
  {type:'RAID_QTE_CENTER',qteId:'CENTER'},
  {type:'RAID_CORE_BREAK',qteCondition:'ALL_SUCCESS'},
  {type:'RAID_QTE_CIRCUIT',qteId:'CIRCUIT'},
  {type:'BOSS_ULTIMATE',qteCondition:'ANY_FAILURE',hits:[]}
 ]}}},onInteractiveEvent:async()=>({success:++count===1,cancelled:false})});
 assert.equal(await renderer.play(),true);assert.equal(count,2);
 assert.ok(!h.calls.includes('RAID_CORE_BREAK'));assert.ok(h.calls.includes('BOSS_ULTIMATE'));
});
