import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedMercenaryDraw,validateMercenaryDraw,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {handleMercenaryDrawCms} from '../functions/_mercenary_draw_cms.js';
import {openMercenaryCards} from '../functions/_mercenary_account.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';

const codes=seed.catalog.cards.map(c=>c.code);
const roster=codes.map(code=>({code,rank:['V-021','V-046'].includes(code)?'SSS':'C'}));
function policy(sss=1){
 const p=suggestedMercenaryDraw();
 for(const row of p.outcomes)row.chancePpm=row.id==='CARD_SSS'?sss:row.id==='NONE'?1000000-sss:0;
 p.cardRules.cardWeights={'V-021':9,'V-046':1};return p;
}
const cms=(f,body)=>handleMercenaryDrawCms({env:f.env,path:'admin/mercenaries/draw',request:new Request('https://qa.test/api/admin/mercenaries/draw',{method:body?'PATCH':'GET',...(body?{body:JSON.stringify(body)}:{})}),deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});

test('SSS has one of a million grade tickets, then nine Omega tickets and one Ragniel ticket',()=>{
 const p=policy(),actual=[];
 for(let ticket=0;ticket<10;ticket++){
  const bounds=[];actual.push(pickMercenaryDraw({policy:p,mercenaries:roster,randomInt:max=>{bounds.push(max);return bounds.length===1?0:ticket;}}).mercenaryCode);
  assert.deepEqual(bounds,[1000000,10]);
 }
 assert.deepEqual(actual,[...Array(9).fill('V-021'),'V-046']);
 for(const gradeTicket of [1,999999])assert.equal(pickMercenaryDraw({policy:p,mercenaries:roster,randomInt:max=>{assert.equal(max,1000000);return gradeTicket;}}).outcomeId,'NONE');
 const odds=mercenaryCardChances(1,['V-021','V-046'],p.cardRules);
 assert.deepEqual(odds.map(r=>r.withinRankPercent),[90,10]);
 assert.deepEqual(odds.map(r=>r.percent),[0.00009,0.00001]);
 assert.ok(Math.abs(odds.reduce((n,r)=>n+r.percent,0)-0.0001)<1e-15);
 assert.equal(0.00005/odds[1].percent,5);
});

test('legacy uniform policies preserve outcomes; equal or missing weights retain equal card chances',()=>{
 for(const legacy of [undefined,{sameRankSelection:'UNIFORM',ownershipWeighting:'NONE',duplicateHandling:'COUNT_EXTRA_COPIES'}]){
  const p=policy();if(legacy)p.cardRules=legacy;else delete p.cardRules;
  const normalized=validateMercenaryDraw(p,{catalogCodes:codes});
  assert.deepEqual(normalized.outcomes,p.outcomes);assert.deepEqual(normalized.cardRules.cardWeights,{});
  const bounds=[];const chosen=pickMercenaryDraw({policy:p,mercenaries:roster,randomInt:max=>{bounds.push(max);return bounds.length===1?0:1;}});
  assert.equal(chosen.mercenaryCode,'V-046');assert.deepEqual(bounds,[1000000,2]);
 }
 const p=policy();p.cardRules.cardWeights={'V-021':5,'V-046':5};
 assert.deepEqual(mercenaryCardChances(1,['V-021','V-046'],p.cardRules).map(r=>r.percent),[0.00005,0.00005]);
});

test('weights do not use ownership or legacy per-card acquisition rates; malformed weights fail closed',()=>{
 const p=policy();const changed=roster.map(c=>({...c,owned:true,duplicateCount:999,acquisition:{dropRate:c.code==='V-046'?100:0}}));
 assert.equal(pickMercenaryDraw({policy:p,mercenaries:changed,randomInt:max=>max===1000000?0:8}).mercenaryCode,'V-021');
 for(const weights of [null,[],{'V-046':0},{'V-046':-1},{'V-046':1.5},{'V-046':1000001},{'V-046':'1'},{'V-999':1},{constructor:1},JSON.parse('{"__proto__":1}')]){
  const bad=policy();bad.cardRules.cardWeights=weights;assert.throws(()=>validateMercenaryDraw(bad,{catalogCodes:codes}),/가중치/);
 }
});

for(const postgres of [false,true]){
 const name=postgres?'PostgreSQL':'SQLite';
 test(`${name}: CMS saves and audits weights, rejects unknown codes, protects revisions and replays exactly once`,async t=>{
  const f=await mercenaryFixture(t,{postgres}),before=await cms(f),next=structuredClone(before.body.policy);
  next.cardRules.cardWeights={'V-021':9,'V-046':1};
  const body={policy:next,expectedRevision:before.body.revision,requestId:crypto.randomUUID(),reason:'라그니엘 가중치를 오메가보다 낮춤'};
  const bad=structuredClone(body);bad.policy.cardRules.cardWeights['V-999']=1;
  assert.equal((await cms(f,bad)).status,400);
  const saved=await cms(f,body);assert.equal(saved.status,200);assert.deepEqual(saved.body.policy.cardRules.cardWeights,next.cardRules.cardWeights);
  assert.deepEqual(saved.body.policy.outcomes,before.body.policy.outcomes);
  assert.equal((await cms(f,body)).body.replayed,true);
  assert.equal((await cms(f,{...body,requestId:crypto.randomUUID()})).body.code,'REVISION_CONFLICT');
  const audit=await f.p('SELECT before_json,after_json FROM mercenary_draw_audit_v1 WHERE request_id=?',body.requestId).first();
  assert.deepEqual(JSON.parse(audit.before_json).cardRules.cardWeights,{});
  assert.deepEqual(JSON.parse(audit.after_json).cardRules.cardWeights,{'V-021':9,'V-046':1});
  assert.equal(await f.coin(),10000000);
 });
 test(`${name}: weighted ten-pack grants 9:1, duplicate counts and payment once; later weights cannot reroll receipts`,async t=>{
  const f=await mercenaryFixture(t,{postgres});await f.setDraw(policy(1000000));
  const request={requestId:crypto.randomUUID(),count:10};let ticket=0;
  const result=await openMercenaryCards(f.env,f.user,request,{randomInt:max=>max===1000000?0:ticket++*999});
  assert.deepEqual(result.draws.map(r=>r.mercenaryCode),[...Array(9).fill('V-021'),'V-046']);
  assert.equal(result.draws[8].duplicateCount,8);assert.equal(result.draws[9].duplicate,false);assert.equal(await f.coin(),9990000);
  const changed=policy(1000000);changed.cardRules.cardWeights={'V-021':1,'V-046':99};await f.setDraw(changed);
  const replay=await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Must not reroll');}});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.draws,result.draws);assert.equal(await f.coin(),9990000);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),10);
 });
 test(`${name}: a failed weighted grant leaves coins and ownership unchanged and recovers its stored result after policy change`,async t=>{
  const f=await mercenaryFixture(t,{postgres});await f.setDraw(policy(1000000));
  const request={requestId:crypto.randomUUID(),count:1};f.fail('INSERT INTO mercenary_card_acquisitions_v1');
  await assert.rejects(()=>openMercenaryCards(f.env,f.user,request,{randomInt:max=>max===1000000?0:8991}));
  assert.equal(await f.coin(),10000000);assert.equal((await f.p('SELECT * FROM user_mercenary_cards_v1').all()).results.length,0);
  await f.setDraw(policy(0));f.fail('');
  const recovered=await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Must not reroll stored draw');}});
  assert.equal(recovered.draws[0].mercenaryCode,'V-046');assert.equal(await f.coin(),9999000);
 });
}
