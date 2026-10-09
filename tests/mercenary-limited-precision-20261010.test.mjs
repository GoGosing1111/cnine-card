import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {parseLimitedPercent,formatLimitedPercent,isLimitedRate,limitedRateUnits,LIMITED_RATE_TOTAL} from '../shared/mercenary-limited-rates-v1.mjs';
import {limitedPolicyDraft,validateLimitedPolicy,readLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs';
import {limitedPackDraft,validateLimitedPack,limitedPackReadiness,LIMITED_PACK} from '../shared/mercenary-limited-pack-v1.mjs';
import {limitedPackRandomInt,pickLimitedBatch,readLimitedPackState,saveLimitedPack,createLimitedPackService,handleLimitedPack} from '../functions/_mercenary_limited_pack.js';

function fine(policy,pack){
 policy.rankRatesPpm={SS:parseLimitedPercent('0.00000001'),SSS:parseLimitedPercent('0.00000002')};policy.cardWeights['V-996']=1;
 pack.normalRankRatesPpm={C:0,B:0,A:0,S:0,SS:0,SSS:0};
 pack.extraRewards.forEach(r=>r.chancePpm=r.id==='NONE'?parseLimitedPercent('99.99999997'):0);
 return {policy,pack};
}
test('eight decimal percent values survive exact parse, JSON storage and display without rounding',()=>{
 for(const [text,ppm,tickets]of [['0',0,0],['0.00000001',.0001,1],['0.00000002',.0002,2],['0.000001',.01,100],['0.0001',1,10000],['0.005',50,500000],['12.34567891',123456.7891,1234567891],['99.99999999',999999.9999,9999999999],['100',1000000,10000000000]]){
  assert.equal(parseLimitedPercent(text),ppm);assert.equal(limitedRateUnits(ppm),tickets);assert.equal(isLimitedRate(ppm),true);assert.equal(formatLimitedPercent(JSON.parse(JSON.stringify(ppm))),text);
 }
 for(const text of ['-1','0.000000001','100.00000001','1e-8','NaN','Infinity','','01','1,0'])assert.equal(parseLimitedPercent(text),null,text);
 for(const n of [-1,.00001,1000000.0001,NaN,Infinity,'0.0001',null])assert.equal(isLimitedRate(n),false);
 const legacy=limitedPolicyDraft();legacy.rankRatesPpm={SS:50,SSS:5};assert.deepEqual(readLimitedPolicy(legacy),legacy);
 assert.equal(formatLimitedPercent(parseLimitedPercent('100.00000000')),'100');
});
test('all categories validate at the same precision and a one-ticket total error blocks opening',()=>{
 const {policy,pack}=fine(limitedPolicyDraft(),limitedPackDraft());pack.prices={single:100,ten:900};for(const code of Object.keys(pack.stockLimits))pack.stockLimits[code]=100;
 assert.deepEqual(validateLimitedPolicy(policy),policy);assert.deepEqual(validateLimitedPack(pack),pack);assert.equal(limitedPackReadiness(pack,policy).ready,true);
 pack.normalRankRatesPpm.C=.0001;
 assert.equal(limitedPackReadiness(pack,policy).ready,false);assert.equal(formatLimitedPercent(limitedPackReadiness(pack,policy).totalPpm),'100.00000001');
 pack.extraRewards.find(r=>r.id==='NONE').chancePpm=parseLimitedPercent('99.99999996');
 assert.equal(limitedPackReadiness(pack,policy,[],[{rank:'C',weight:1}]).ready,true);
 for(const n of [.00001,-1,1000000.0001,NaN]){
  const p=structuredClone(policy);p.rankRatesPpm.SS=n;assert.throws(()=>validateLimitedPolicy(p));
  const s=structuredClone(pack);s.extraRewards[0].chancePpm=n;assert.throws(()=>validateLimitedPack(s));
 }
});
test('40-bit crypto sampling rejects modulo bias and reaches first and last fine tickets',()=>{
 const max=LIMITED_RATE_TOTAL,range=2**40,limit=Math.floor(range/max)*max;
 for(const ticket of [0,1,max-1,limit-1]){
  let calls=0;const values=[range-1,ticket];
  const result=limitedPackRandomInt(max,bytes=>{const n=values[calls++];bytes[0]=Math.floor(n/2**32);bytes[1]=n%2**32;return bytes;});
  assert.equal(result,ticket%max);assert.equal(calls,2);
 }
 for(const max of [0,-1,1.1,LIMITED_RATE_TOTAL+1,NaN])assert.throws(()=>limitedPackRandomInt(max));
});
test('one-ticket SS/SSS intervals and zero-rate exclusion match the exact displayed percentages',async t=>{
 const f=await limitedFixture(t);fine(f.policy,f.packSettings);await f.configure();const state=await readLimitedPackState(f.env);
 assert.equal(state.readiness.ready,true);assert.equal(state.readiness.totalPpm,1000000);
 for(const [ticket,outcome]of [[0,'LIMITED_SS'],[1,'LIMITED_SSS'],[2,'LIMITED_SSS'],[3,'NONE'],[LIMITED_RATE_TOTAL-1,'NONE']]){
  let calls=0;const bounds=[];const [draw]=pickLimitedBatch(state,1,max=>{bounds.push(max);return calls++===0?ticket:0;});
  assert.equal(bounds[0],LIMITED_RATE_TOTAL);assert.equal(draw.outcomeId,outcome);
 }
 for(const bad of [-1,.5,LIMITED_RATE_TOTAL,NaN])assert.throws(()=>pickLimitedBatch(state,1,()=>bad),/Invalid random/);
 state.policy.rankRatesPpm.SS=0;state.packSettings.extraRewards.find(r=>r.id==='NONE').chancePpm=parseLimitedPercent('99.99999998');
 assert.equal(pickLimitedBatch(state,1,()=>0)[0].outcomeId,'LIMITED_SSS');
});
test('fine CMS values save atomically, reload exactly, stay visible through config, and grants retry once',async t=>{
 const f=await limitedFixture(t);await f.configure();const before=await readLimitedPackState(f.env),{policy,pack}=fine(structuredClone(before.policy),structuredClone(before.packSettings));
 const body={expectedRevision:before.revision,expectedPackRevision:before.packRevision,policy,packSettings:pack,requestId:crypto.randomUUID(),reason:'최소 확률 저장 및 추첨 검사'};
 f.fail('INSERT INTO admin_logs');await assert.rejects(saveLimitedPack(f.env,f.user,body),/INJECTED/);f.fail('');
 assert.deepEqual((await readLimitedPackState(f.env)).policy,before.policy);
 const saved=await saveLimitedPack(f.env,f.user,body);assert.equal(saved.userOpeningEnabled,true);assert.equal(saved.policy.rankRatesPpm.SS,.0001);assert.equal(saved.policy.rankRatesPpm.SSS,.0002);
 assert.equal((await saveLimitedPack(f.env,f.user,body)).replayed,true);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n),1);
 const deps={authenticate:async()=>({id:2}),json:(body,status=200)=>({body,status})};
 const config=await handleLimitedPack({path:LIMITED_PACK.featurePath,request:new Request('https://qa.test/api/'+LIMITED_PACK.featurePath),env:f.env,deps});
 assert.equal(config.status,200);assert.deepEqual(config.body.policy.rankRatesPpm,policy.rankRatesPpm);assert.equal(formatLimitedPercent(config.body.policy.rankRatesPpm.SS),'0.00000001');
 const publicPatch=await handleLimitedPack({path:LIMITED_PACK.featurePath,request:new Request('https://qa.test/api/'+LIMITED_PACK.featurePath,{method:'PATCH',body:JSON.stringify(body)}),env:f.env,deps});assert.equal(publicPatch.status,405);
 let rolls=0;const service=createLimitedPackService({randomInt:()=>{rolls++;return 0;}}),request={requestId:crypto.randomUUID(),count:10,expectedRevision:saved.packRevision,expectedPolicyRevision:saved.revision};
 f.fail('INSERT INTO coin_logs');await assert.rejects(service.open(f.env,f.user,request),/INJECTED/);f.fail('');
 assert.equal(await f.coin(),1000000);assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-990'").first()).issued,0);
 const rollsBefore=rolls;f.loseAck();const receipt=await service.open(f.env,f.user,request);assert.equal(rolls,rollsBefore);assert.equal(receipt.draws.length,10);assert.equal(await f.coin(),999100);
 assert.deepEqual(receipt.draws.map(r=>r.serial),[1,2,3,4,5,6,7,8,9,10]);assert.equal((await service.open(f.env,f.user,request)).replayed,true);assert.equal(rolls,rollsBefore);assert.equal(await f.coin(),999100);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
