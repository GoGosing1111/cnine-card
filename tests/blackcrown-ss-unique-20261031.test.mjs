import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {BLACKCROWN_CODES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {blackcrownAcceptSs,blackcrownPersonalOdds} from '../shared/mercenary-blackcrown-ownership-v1.mjs';
import {pickBlackcrownBatch,BLACKCROWN_PACK_KEY} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {pickBlackcrownBulk,blackcrownBulkQuote} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {changeMercenaryStockSchedule,processMercenaryStockSchedules,readMercenaryStockSchedules} from '../functions/_mercenary_blackcrown_stock_schedule.js';
const ss=rows=>rows.filter(r=>BLACKCROWN_CODES.includes(r.mercenaryCode));
const issued=async(f,code='V-950')=>Number((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?',code).first()).issued);
const copies=async(f,code='V-950')=>Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=?',code).first())?.total_copies||0);
const logs=async f=>Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n);

test('each owned SS rejects every ticket; unowned SS keep the exact existing reduction',()=>{
 for(const target of BLACKCROWN_CODES){
  for(let n=0;n<6;n++){
   const owned=new Set(BLACKCROWN_CODES.filter(c=>c!==target).slice(0,n));
   assert.equal(Array.from({length:32},(_,ticket)=>blackcrownAcceptSs(target,owned,()=>ticket)).filter(Boolean).length,32/2**Math.max(0,n-1));
   owned.add(target);assert.equal(blackcrownAcceptSs(target,owned,()=>{throw Error('Owned cards must not roll again');}),false);
  }
 }
 for(const code of ['V-970','V-971','V-058'])assert(blackcrownAcceptSs(code,new Set(BLACKCROWN_CODES),()=>31));
});

test('personal odds zero owned SS and preserve unowned/SSS intervals and exact total',async t=>{
 const f=await blackcrownFixture(t),state=await f.state();
 state.settings.cardRatesPpm={...state.settings.cardRatesPpm,'V-950':400000,'V-951':200000,'V-952':100000,'V-970':100000,'V-971':100000,'V-058':100000};
 const result=blackcrownPersonalOdds(state.settings,state.stock,['V-950','V-951']);
 assert.equal(result.ownershipRule.duplicatesAllowed,false);assert.equal(result.effectiveCardPercents['V-950'],'0');assert.equal(result.effectiveCardPercents['V-951'],'0');
 assert.equal(result.effectiveCardPercents['V-952'],'5');for(const code of ['V-970','V-971','V-058'])assert.equal(result.effectiveCardPercents[code],'10');
 assert.equal(result.effectiveNormalSssPercent,'65');assert.equal(Object.values(result.effectiveCardPercents).reduce((a,b)=>a+Number(b),Number(result.effectiveNormalSssPercent)),100);
 assert.equal(blackcrownPersonalOdds(state.settings,state.stock,BLACKCROWN_CODES).effectiveNormalSssPercent,'70');
});

for(const count of [1,10,100])test(`${count} draws cannot duplicate an owned SS or consume its stock`,async t=>{
 const f=await blackcrownFixture(t);await f.own('V-950',3);const before=await f.coin(),body=f.body(count);if(count===100)body.budget='9000';
 const receipt=await f.service.open(f.env,f.user,body);
 assert.equal(ss(receipt.draws).length,0);assert.equal(await copies(f),3);assert.equal(await issued(f),0);assert.equal(await f.coin(),before-receipt.coinCost);
 assert.equal((await f.state()).effectiveCardPercents['V-950'],'0');
 const replay=await f.service.open(f.env,f.user,body);assert(replay.replayed);assert.deepEqual(replay.draws,receipt.draws);assert.equal(await logs(f),1);
});

test('fresh 10-draw and bulk openings acquire at most one of a type; future openings exclude it',async t=>{
 const f=await blackcrownFixture(t),before=await f.coin();
 const receipt=await f.service.open(f.env,f.user,f.body(10));assert.equal(ss(receipt.draws).length,1);assert.equal(await copies(f),1);assert.equal(await issued(f),1);
 const bulk=await f.service.open(f.env,f.user,{...f.body(100),budget:'9000'});assert.equal(ss(bulk.draws).length,0);assert.equal(await copies(f),1);assert.equal(await issued(f),1);
 assert.equal(await f.coin(),before-9900);assert.equal(await logs(f),2);
});

test('each of six SS can be won once in the same batch and bulk, then all owned odds are zero',async t=>{
 const f=await blackcrownFixture(t),state=await f.state(),units=1000000;
 state.settings.cardRatesPpm={...state.settings.cardRatesPpm,...Object.fromEntries(BLACKCROWN_CODES.map((code,i)=>[code,i===5?166670:166666]))};
 const draw=bulk=>{let stage=0,slot=0;const random=max=>max===32?0:max===1?0:max===units*10000?(stage++%2===0?0:Math.min(slot++,5)*1666660000):0;return bulk?pickBlackcrownBulk(state,10,random):{draws:pickBlackcrownBatch(state,10,random)};};
 for(const bulk of [false,true]){const result=draw(bulk),found=ss(result.draws).map(r=>r.mercenaryCode);assert.equal(found.length,6);assert.equal(new Set(found).size,6);}
 const all=blackcrownPersonalOdds(state.settings,state.stock,BLACKCROWN_CODES);assert(BLACKCROWN_CODES.every(c=>all.effectiveCardPercents[c]==='0'));assert.equal(all.effectiveNormalSssPercent,'100');
});

test('100조 66,666 draw lottery stays in memory with one SS per type and exact totals',async t=>{
 const f=await blackcrownFixture(t),state=await f.state();state.settings.prices={single:1500000000,ten:15000000000};
 const quote=blackcrownBulkQuote(state.settings.prices,'100000000000000'),queries=f.stats.queries,start=performance.now();
 const result=pickBlackcrownBulk(state,quote.count,()=>0);assert.equal(quote.count,66666);assert.equal(ss(result.draws).length,1);assert.equal(result.normalDraws.reduce((a,r)=>a+r.quantity,0)+result.draws.length+result.missCount,quote.count);assert.equal(f.stats.queries,queries);
 t.diagnostic(JSON.stringify({count:quote.count,elapsedMs:Math.round(performance.now()-start),additionalQueries:0,ss:result.draws.length}));
});

for(const bulk of [false,true])test(`old pending ${bulk?'bulk':'ten'} plan with repeated SS cancels without payment`,async t=>{
 const f=await blackcrownFixture(t),body={...f.body(bulk?100:10),...(bulk?{budget:'9000'}:{})},before=await f.coin();
 f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED_FAILURE/);f.fail('');
 const op=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first(),plan=JSON.parse(op.plan_json);
 if(bulk){plan.draws.push({...plan.draws[0],drawIndex:1});plan.normalDraws[0].quantity--;}else plan.draws[1]={...plan.draws[0]};
 await f.p('UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=?',JSON.stringify(plan),body.requestId).run();
 await assert.rejects(f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLACKCROWN_DUPLICATE_SS');assert.equal(await f.coin(),before);assert.equal(await copies(f),0);assert.equal(await issued(f),0);assert.equal(await logs(f),0);
 assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');
});

test('ownership arriving between planning and commit fails the atomic guard without debit or stock consumption',async t=>{
 const f=await blackcrownFixture(t),before=await f.coin(),batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO coin_logs'))){injected=true;await f.own('V-950');}return batch(list);};
 await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert(injected);assert.equal(await copies(f),1);assert.equal(await issued(f),0);assert.equal(await f.coin(),before);assert.equal(await logs(f),0);
});

test('concurrent request IDs cannot consume a second SS or double-charge a completed request',async t=>{
 const f=await blackcrownFixture(t),body=f.body(),before=await f.coin();
 const outcomes=await Promise.allSettled([f.service.open(f.env,f.user,body),f.service.open(f.env,f.user,f.body())]);
 assert(outcomes.some(r=>r.status==='fulfilled'));assert.equal(await copies(f),1);assert.equal(await issued(f),1);
 const complete=outcomes.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.equal(complete.reduce((sum,r)=>sum+ss(r.draws).length,0),1);assert.equal(await f.coin(),before-complete.length*100);
});

test('failed payment rolls back the sole SS and lost commit acknowledgement replays it once',async t=>{
 const f=await blackcrownFixture(t),body=f.body(10),before=await f.coin();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body));f.fail('');assert.equal(await copies(f),0);assert.equal(await issued(f),0);assert.equal(await f.coin(),before);
 f.loseAck();const receipt=await f.service.open(f.env,f.user,body);assert.equal(ss(receipt.draws).length,1);const retry=await f.service.open(f.env,f.user,body);assert(retry.replayed);assert.deepEqual(retry.draws,receipt.draws);assert.equal(await copies(f),1);assert.equal(await issued(f),1);assert.equal(await logs(f),1);
});

test('six-card +15 refill applies once at its boundary, preserves issued and the separate SSS limits',async t=>{
 const f=await blackcrownFixture(t);for(const code of BLACKCROWN_CODES){f.settings.stockLimits[code]=25;await f.p('UPDATE mercenary_limited_stock_v1 SET stock_limit=25,issued=25 WHERE code=?',code).run();}await f.configure();
 const executeAt=new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),request={action:'SCHEDULE_STOCK',requestId:crypto.randomUUID(),executeAt,changes:BLACKCROWN_CODES.map(code=>({code,quantity:15})),reason:'10월31일22시 SS6종 각15장 예약 검수'};
 const raw=(await f.p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first()).value;
 await changeMercenaryStockSchedule(f.env,f.user,request);assert((await changeMercenaryStockSchedule(f.env,f.user,request)).replayed);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(executeAt)-1})).applied,0);assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first()).value,raw);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(executeAt)})).applied,1);assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(executeAt)})).applied,0);
 const state=await f.state();for(const code of BLACKCROWN_CODES){const stock=state.stock.find(s=>s.code===code);assert.equal(stock.limit,40);assert.equal(stock.issued,25);assert.equal(stock.remaining,15);}
 for(const code of ['V-970','V-971'])assert.equal(state.stock.find(s=>s.code===code).limit,5);
 assert.equal((await readMercenaryStockSchedules(f.env)).document.schedules.filter(s=>s.status==='APPLIED').length,1);assert.equal(await logs(f),0);
});
