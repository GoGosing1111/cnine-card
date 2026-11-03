import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {handleBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {BLOODMOON_PACK} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {pickBloodmoonSsOnceCode} from '../functions/_mercenary_bloodmoon_once.js';
import {bloodmoonFixture} from './helpers/bloodmoon-unique-fixture.mjs';
import {BLOODMOON_CODES} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {bloodmoonAcceptSs,bloodmoonPersonalOdds} from '../shared/mercenary-bloodmoon-ownership-v1.mjs';
import {pickBloodmoonBatch,BLOODMOON_PACK_KEY} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {pickBloodmoonBulk,bloodmoonBulkQuote} from '../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {changeMercenaryStockSchedule,processMercenaryStockSchedules,readMercenaryStockSchedules} from '../functions/_mercenary_stock_schedule.js';
const ss=rows=>rows.filter(r=>BLOODMOON_CODES.includes(r.mercenaryCode));
const issued=async(f,code='V-960')=>Number((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?',code).first()).issued);
const copies=async(f,code='V-960')=>Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=?',code).first())?.total_copies||0);
const logs=async f=>Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n);

test('feature uses the authenticated account; old unpaid odds plans cancel without a debit',async t=>{
 const f=await bloodmoonFixture(t);await f.own('V-961');await f.own('V-962');
 const response=await handleBloodmoonPack({path:BLOODMOON_PACK.featurePath,request:new Request('https://fixture.test'),env:f.env,deps:{authenticate:async()=>f.user,json:body=>body}});
 assert.equal(response.personalOddsKnown,true);assert.equal(response.ssProbabilityDivisor,2);assert.equal(response.effectiveCardPercents['V-960'],'50');
 const body=f.body(),coin=await f.coin();f.fail('INSERT INTO coin_logs');await assert.rejects(()=>f.service.open(f.env,f.user,body));f.fail('');
 const op=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first(),plan=JSON.parse(op.plan_json);delete plan.ownershipPolicy;
 await f.p('UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=?',JSON.stringify(plan),body.requestId).run();
 await assert.rejects(()=>f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLOODMOON_CHANGED');assert.equal(await f.coin(),coin);assert.equal(await logs(f),0);
});

test('a historical SS guarantee never selects an owned SS; SSS and Prime material stay independent',async t=>{
 const f=await bloodmoonFixture(t);await f.own('V-960');const state=await f.state();assert.equal(pickBloodmoonSsOnceCode(state,()=>0),null);
 for(const code of ['V-973','V-974','V-975','V-978']){state.settings.cardRatesPpm[code]=1;assert.equal(pickBloodmoonSsOnceCode(state,()=>0,{mercenaryCode:code}),code);}
});

test('each owned SS rejects every ticket; unowned SS keep the exact existing reduction',()=>{
 for(const target of BLOODMOON_CODES){
  for(let n=0;n<6;n++){
   const owned=new Set(BLOODMOON_CODES.filter(c=>c!==target).slice(0,n));
   assert.equal(Array.from({length:32},(_,ticket)=>bloodmoonAcceptSs(target,owned,()=>ticket)).filter(Boolean).length,32/2**Math.max(0,n-1));
   owned.add(target);assert.equal(bloodmoonAcceptSs(target,owned,()=>{throw Error('Owned cards must not roll again');}),false);
  }
 }
 for(const code of ['V-978','V-974','V-058'])assert(bloodmoonAcceptSs(code,new Set(BLOODMOON_CODES),()=>31));
});

test('personal odds zero owned SS and preserve unowned/SSS intervals and exact total',async t=>{
 const f=await bloodmoonFixture(t),state=await f.state();
 state.settings.cardRatesPpm={...state.settings.cardRatesPpm,'V-960':400000,'V-961':200000,'V-962':100000,'V-978':100000,'V-974':100000,'V-058':100000};
 const result=bloodmoonPersonalOdds(state.settings,state.stock,['V-960','V-961']);
 assert.equal(result.ownershipRule.duplicatesAllowed,false);assert.equal(result.effectiveCardPercents['V-960'],'0');assert.equal(result.effectiveCardPercents['V-961'],'0');
 assert.equal(result.effectiveCardPercents['V-962'],'5');for(const code of ['V-978','V-974','V-058'])assert.equal(result.effectiveCardPercents[code],'10');
 assert.equal(result.effectiveNormalSssPercent,'65');assert.equal(Object.values(result.effectiveCardPercents).reduce((a,b)=>a+Number(b),Number(result.effectiveNormalSssPercent)),100);
 assert.equal(bloodmoonPersonalOdds(state.settings,state.stock,BLOODMOON_CODES).effectiveNormalSssPercent,'70');
});

for(const count of [1,10,100])test(`${count} draws cannot duplicate an owned SS or consume its stock`,async t=>{
 const f=await bloodmoonFixture(t);await f.own('V-960',3);const before=await f.coin(),body=f.body(count);if(count===100)body.budget='9000';
 const receipt=await f.service.open(f.env,f.user,body);
 assert.equal(ss(receipt.draws).length,0);assert.equal(await copies(f),3);assert.equal(await issued(f),0);assert.equal(await f.coin(),before-receipt.coinCost);
 assert.equal((await f.state()).effectiveCardPercents['V-960'],'0');
 const replay=await f.service.open(f.env,f.user,body);assert(replay.replayed);assert.deepEqual(replay.draws,receipt.draws);assert.equal(await logs(f),1);
});

test('fresh 10-draw and bulk openings acquire at most one of a type; future openings exclude it',async t=>{
 const f=await bloodmoonFixture(t),before=await f.coin();
 const receipt=await f.service.open(f.env,f.user,f.body(10));assert.equal(ss(receipt.draws).length,1);assert.equal(await copies(f),1);assert.equal(await issued(f),1);
 const bulk=await f.service.open(f.env,f.user,{...f.body(100),budget:'9000'});assert.equal(ss(bulk.draws).length,0);assert.equal(await copies(f),1);assert.equal(await issued(f),1);
 assert.equal(await f.coin(),before-9900);assert.equal(await logs(f),2);
});

test('each of six SS can be won once in the same batch and bulk, then all owned odds are zero',async t=>{
 const f=await bloodmoonFixture(t),state=await f.state(),units=1000000;
 state.settings.cardRatesPpm={...state.settings.cardRatesPpm,...Object.fromEntries(BLOODMOON_CODES.map((code,i)=>[code,i===5?166670:166666]))};
 const draw=bulk=>{let stage=0,slot=0;const random=max=>max===32?0:max===1?0:max===units*10000?(stage++%2===0?0:Math.min(slot++,5)*1666660000):0;return bulk?pickBloodmoonBulk(state,10,random):{draws:pickBloodmoonBatch(state,10,random)};};
 for(const bulk of [false,true]){const result=draw(bulk),found=ss(result.draws).map(r=>r.mercenaryCode);assert.equal(found.length,6);assert.equal(new Set(found).size,6);}
 const all=bloodmoonPersonalOdds(state.settings,state.stock,BLOODMOON_CODES);assert(BLOODMOON_CODES.every(c=>all.effectiveCardPercents[c]==='0'));assert.equal(all.effectiveNormalSssPercent,'100');
});

test('100조 66,666 draw lottery stays in memory with one SS per type and exact totals',async t=>{
 const f=await bloodmoonFixture(t),state=await f.state();state.settings.prices={single:1500000000,ten:15000000000};
 const quote=bloodmoonBulkQuote(state.settings.prices,'100000000000000'),queries=f.stats.queries,start=performance.now();
 const result=pickBloodmoonBulk(state,quote.count,()=>0);assert.equal(quote.count,66666);assert.equal(ss(result.draws).length,1);assert.equal(result.normalDraws.reduce((a,r)=>a+r.quantity,0)+result.draws.length+result.missCount,quote.count);assert.equal(f.stats.queries,queries);
 t.diagnostic(JSON.stringify({count:quote.count,elapsedMs:Math.round(performance.now()-start),additionalQueries:0,ss:result.draws.length}));
});

for(const bulk of [false,true])test(`old pending ${bulk?'bulk':'ten'} plan with repeated SS cancels without payment`,async t=>{
 const f=await bloodmoonFixture(t),body={...f.body(bulk?100:10),...(bulk?{budget:'9000'}:{})},before=await f.coin();
 f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED_FAILURE/);f.fail('');
 const op=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first(),plan=JSON.parse(op.plan_json);
 if(bulk){plan.draws.push({...plan.draws[0],drawIndex:1});plan.normalDraws[0].quantity--;}else plan.draws[1]={...plan.draws[0]};
 await f.p('UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=?',JSON.stringify(plan),body.requestId).run();
 await assert.rejects(f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLOODMOON_DUPLICATE_SS');assert.equal(await f.coin(),before);assert.equal(await copies(f),0);assert.equal(await issued(f),0);assert.equal(await logs(f),0);
 assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');
});

test('ownership arriving between planning and commit fails the atomic guard without debit or stock consumption',async t=>{
 const f=await bloodmoonFixture(t),before=await f.coin(),batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO coin_logs'))){injected=true;await f.own('V-960');}return batch(list);};
 await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_BLOODMOON_CHANGED');assert(injected);assert.equal(await copies(f),1);assert.equal(await issued(f),0);assert.equal(await f.coin(),before);assert.equal(await logs(f),0);
});

test('concurrent request IDs cannot consume a second SS or double-charge a completed request',async t=>{
 const f=await bloodmoonFixture(t),body=f.body(),before=await f.coin();
 const outcomes=await Promise.allSettled([f.service.open(f.env,f.user,body),f.service.open(f.env,f.user,f.body())]);
 assert(outcomes.some(r=>r.status==='fulfilled'));assert.equal(await copies(f),1);assert.equal(await issued(f),1);
 const complete=outcomes.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.equal(complete.reduce((sum,r)=>sum+ss(r.draws).length,0),1);assert.equal(await f.coin(),before-complete.length*100);
});

test('failed payment rolls back the sole SS and lost commit acknowledgement replays it once',async t=>{
 const f=await bloodmoonFixture(t),body=f.body(10),before=await f.coin();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body));f.fail('');assert.equal(await copies(f),0);assert.equal(await issued(f),0);assert.equal(await f.coin(),before);
 f.loseAck();const receipt=await f.service.open(f.env,f.user,body);assert.equal(ss(receipt.draws).length,1);const retry=await f.service.open(f.env,f.user,body);assert(retry.replayed);assert.deepEqual(retry.draws,receipt.draws);assert.equal(await copies(f),1);assert.equal(await issued(f),1);assert.equal(await logs(f),1);
});
