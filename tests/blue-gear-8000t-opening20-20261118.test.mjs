import test from 'node:test';import assert from 'node:assert/strict';
import {blueGearState,BLUE_GEAR_OPENS_AT,BLUE_GEAR_PACK_KEY,BLUE_GEAR_STOCK_PREFIX,BLUE_GEAR_DRAW_POLICY as policy} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {pickBlackcrownBatch} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {pickBlackcrownBulk} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {createBlueGearPackService} from '../functions/_mercenary_blue_gear_pack.js';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
const doc={revision:3,openingAt:'2026-11-20T11:00:00.000Z',settings:{prices:{single:2250000000,ten:22500000000},missRatePpm:800000,normalRankRatesPpm:{C:104500,B:30000,A:30000,S:30000,SS:4700,SSS:800},cardRatesPpm:{'V-701':70.3125,'V-702':70.3125,'V-703':70.3125,'V-704':70.3125,'V-705':70.3125,'V-976':1,'V-967':1,'V-059':400},normalSssRatePpm:999246.4375,stockLimits:{'V-701':10,'V-702':10,'V-703':10,'V-704':10,'V-705':10,'V-976':3,'V-967':3}}};
const stock=()=>Object.entries(doc.settings.stockLimits).map(([code,stock_limit])=>({code:BLUE_GEAR_STOCK_PREFIX+code,stock_limit,issued:0}));
const normals=Object.keys(doc.settings.normalRankRatesPpm).map(rank=>({code:'QA-'+rank,name:'일반',rank,weight:1}));
const state=(owned=[],rows=stock(),time=doc.openingAt)=>blueGearState(doc,rows,normals,time,owned);
test('8000 trillion first-SS mean uses exact fractional rates and preserves later ownership penalties',()=>{
 assert.equal(BLUE_GEAR_OPENS_AT,doc.openingAt);
 const zero=state();for(const code of policy.ssCodes)assert.equal(zero.effectiveCardPercents[code],'0.000005625');
 assert.equal(zero.effectiveCardPercents['V-059'],'0.000032');for(const code of ['V-976','V-967'])assert.equal(zero.effectiveCardPercents[code],'0.00000008');
 assert.equal(Object.values(doc.settings.cardRatesPpm).reduce((s,n)=>s+n,doc.settings.normalSssRatePpm),1000000);
 const costs=[8000,10000,80000/3,80000,320000];
 for(let n=0;n<5;n++){const s=state(policy.ssCodes.slice(0,n)),p=policy.ssCodes.reduce((v,c)=>v+Number(s.effectiveCardPercents[c])/100,0);assert(Math.abs(doc.settings.prices.single/p/1e12-costs[n])<1e-7);}
});
test('single and bulk exact integer boundaries, owned exclusion and probability gate',()=>{
 for(const draw of [(s,r)=>pickBlackcrownBatch(s,1,r,policy)[0],(s,r)=>{const x=pickBlackcrownBulk(s,1,r,policy);return x.draws[0]||x.normalDraws[0];}]){
  for(let i=0;i<5;i++)for(const ticket of [i*703125,(i+1)*703125-1]){const q=[1992000000,ticket];assert.equal(draw(state(),()=>q.shift()).mercenaryCode,policy.ssCodes[i]);assert.equal(q.length,0);}
  for(const [ticket,code] of [[3515625,'V-976'],[3525625,'V-967'],[3535625,'V-059'],[7535625,'QA-SSS']]){const q=[1992000000,ticket,0];assert.equal(draw(state(),()=>q.shift()).mercenaryCode,code);}
  let q=[1992000000,0,0];assert.equal(draw(state(['V-701']),()=>q.shift()).mercenaryCode,'QA-SSS');
  for(const [gate,expected]of [[15,'V-703'],[16,'QA-SSS']]){q=[1992000000,1406250,gate,0];assert.equal(draw(state(['V-701','V-702']),()=>q.shift()).mercenaryCode,expected);}
 }
});
test('November 20 at 20:00 KST is the exact opening boundary; previous midnight stays closed',()=>{
 for(const time of ['2026-11-19T15:00:00.000Z','2026-11-20T10:59:59.999Z'])assert.equal(state([],stock(),time).userOpeningEnabled,false);
 assert.equal(state().userOpeningEnabled,true);
 const sold=stock();sold[0].issued=10;assert.equal(state([],sold).effectiveCardPercents['V-701'],'0');assert.equal(state([],sold).effectiveCardPercents['V-702'],'0.000005625');
});
test('production opening service denies old revision and future schedule without debit, then supports idempotent payment',async t=>{
 const f=await limitedFixture(t);await f.configure({enabled:false});await f.setting(BLUE_GEAR_PACK_KEY,{...doc,openingAt:'2199-11-20T11:00:00.000Z'});
 for(const r of stock())await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',r.code,r.stock_limit).run();
 await f.pg.exec('UPDATE users SET coin=3000000000000 WHERE id=1');const initial=await f.coin();
 let i=0;const svc=createBlueGearPackService({randomInt:n=>n===10000000000?(i++%2===0?1992000000:0):0});
 const body={requestId:crypto.randomUUID(),count:1,expectedRevision:3};
 await assert.rejects(svc.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLACKCROWN_CLOSED'&&e.message.includes('20시'));assert.equal(await f.coin(),initial);
 await f.setting(BLUE_GEAR_PACK_KEY,{...doc,openingAt:'2000-11-20T11:00:00.000Z'});
 await assert.rejects(svc.open(f.env,f.user,{...body,requestId:crypto.randomUUID(),expectedRevision:2}),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert.equal(await f.coin(),initial);
 const result=await svc.open(f.env,f.user,body);assert.equal(result.draws[0].mercenaryCode,'V-701');assert.equal(result.coinCost,2250000000);
 const balance=await f.coin();assert.equal(balance,initial-2250000000);assert.equal((await svc.open(f.env,f.user,body)).replayed,true);assert.equal(await f.coin(),balance);
});
