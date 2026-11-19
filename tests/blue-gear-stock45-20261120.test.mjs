import test from 'node:test';import assert from 'node:assert/strict';
import {blueGearState,BLUE_GEAR_PACK_KEY,BLUE_GEAR_STOCK_PREFIX,BLUE_GEAR_DRAW_POLICY as policy} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {createBlueGearPackService} from '../functions/_mercenary_blue_gear_pack.js';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
const doc={revision:5,openingAt:'2026-11-19T15:00:00.000Z',settings:{prices:{single:2250000000,ten:22500000000},missRatePpm:800000,normalRankRatesPpm:{C:104500,B:30000,A:30000,S:30000,SS:4700,SSS:800},cardRatesPpm:{'V-701':70.3125,'V-702':70.3125,'V-703':70.3125,'V-704':70.3125,'V-705':70.3125,'V-976':1,'V-967':1,'V-059':400},normalSssRatePpm:999246.4375,stockLimits:{'V-701':45,'V-702':45,'V-703':45,'V-704':45,'V-705':45,'V-976':3,'V-967':3}}};
const stock=()=>Object.entries(doc.settings.stockLimits).map(([code,stock_limit])=>({code:BLUE_GEAR_STOCK_PREFIX+code,stock_limit,issued:code.startsWith('V-70')?25:1}));
const normals=Object.keys(doc.settings.normalRankRatesPpm).map(rank=>({code:'QA-'+rank,rank,weight:1}));
test('five exhausted 25-copy SS pools gain exactly 20 each; probabilities, existing issues and SSS remain intact',()=>{
 const before=structuredClone(doc);before.revision=4;for(const code of policy.ssCodes)before.settings.stockLimits[code]=25;
 const rows=stock(),oldRows=rows.map(r=>({...r,stock_limit:before.settings.stockLimits[r.code.slice(BLUE_GEAR_STOCK_PREFIX.length)]}));
 const old=blueGearState(before,oldRows,normals,doc.openingAt),next=blueGearState(doc,rows,normals,doc.openingAt);
 assert.equal(old.stock.filter(s=>policy.ssCodes.includes(s.code)).reduce((n,s)=>n+s.remaining,0),0);
 assert.equal(next.stock.filter(s=>policy.ssCodes.includes(s.code)).reduce((n,s)=>n+s.remaining,0),100);assert(next.userOpeningEnabled);
 for(const code of policy.ssCodes){const row=next.stock.find(s=>s.code===code);assert.equal(row.issued,25);assert.equal(row.limit,45);assert.equal(row.remaining,20);assert.equal(next.effectiveCardPercents[code],'0.000005625');}
 for(const code of ['V-976','V-967'])assert.deepEqual(next.stock.find(s=>s.code===code),old.stock.find(s=>s.code===code));
 const unchanged=settings=>{const {stockLimits,...other}=settings;return other;};assert.deepEqual(unchanged(before.settings),unchanged(doc.settings));
 const mismatched=blueGearState(doc,oldRows,normals,doc.openingAt);assert.equal(mismatched.userOpeningEnabled,false);assert.equal(mismatched.readiness.ready,false);
});
test('45th SS issue rolls back on failure, retries once and blocks a 46th issue without touching SSS',async t=>{
 const f=await limitedFixture(t);await f.configure({enabled:false});await f.setting(BLUE_GEAR_PACK_KEY,{...doc,openingAt:'2000-11-20T00:00:00Z'});
 for(const r of stock())await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,?,?)',r.code,r.stock_limit,r.code===BLUE_GEAR_STOCK_PREFIX+'V-701'?44:r.issued).run();
 await f.pg.exec('UPDATE users SET coin=3000000000000 WHERE id IN (1,2)');let stage=0;const svc=createBlueGearPackService({randomInt:n=>n===10000000000?(stage++%2===0?1992000000:0):0});
 const body={requestId:crypto.randomUUID(),expectedRevision:5,count:1},initial=await f.coin(),issued=async()=>Number((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?',BLUE_GEAR_STOCK_PREFIX+'V-701').first()).issued);
 await assert.rejects(svc.open(f.env,f.user,{...body,requestId:crypto.randomUUID(),expectedRevision:4}),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert.equal(await f.coin(),initial);
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(svc.open(f.env,f.user,body));f.fail('');assert.equal(await f.coin(),initial);assert.equal(await issued(),44);
 const receipt=await svc.open(f.env,f.user,body);assert.equal(receipt.draws[0].mercenaryCode,'V-701');assert.equal(receipt.draws[0].serial,45);assert.equal(receipt.draws[0].stockLimit,45);assert.equal(await issued(),45);assert.equal(await f.coin(),initial-2250000000);
 assert((await svc.open(f.env,f.user,body)).replayed);assert.equal(await f.coin(),initial-2250000000);assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs WHERE user_id=1').first()).n,1);
 const exhausted=await svc.open(f.env,{...f.user,id:2},{...body,requestId:crypto.randomUUID()});assert.notEqual(exhausted.draws[0].mercenaryCode,'V-701');assert.equal(await issued(),45);
 for(const code of ['V-976','V-967']){const row=await f.p('SELECT stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=?',BLUE_GEAR_STOCK_PREFIX+code).first();assert.equal(Number(row.stock_limit),3);assert.equal(Number(row.issued),1);}
});
