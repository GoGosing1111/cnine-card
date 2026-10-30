import test from 'node:test';import assert from 'node:assert/strict';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import reference from './fixtures/blackcrown-sss-reference-20261027.json' with {type:'json'};
import {BLACKCROWN_PACK} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {blackcrownOnceKey} from '../functions/_mercenary_blackcrown_once.js';
import {createBlackcrownPackService} from '../functions/_mercenary_blackcrown_opening.js';
import {readBlackcrownPackState} from '../functions/_mercenary_blackcrown_pack.js';
import {prepareSettings} from '../scripts/ops/blackcrown-rates-opening-20261030.mjs';
const entitlement=(userId=1)=>({version:1,status:'ARMED',remaining:1,userId,packId:BLACKCROWN_PACK.id,mercenaryCode:'V-971',actorId:1,operationId:'test-revan-once'});
async function setup(t){const f=await blackcrownFixture(t,{randomInt:n=>n-1});Object.assign(f.settings,prepareSettings(reference.blackcrown.settings,reference.bloodmoon.settings).settings,{mode:'ON'});await f.configure();await f.pg.exec('UPDATE users SET coin=1000000000000000 WHERE id IN (1,2)');await f.setting(blackcrownOnceKey(1),entitlement());return f;}
const once=async f=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',blackcrownOnceKey(1)).first()).value);
for(const count of [1,10,66666])test(`Revan exactly once in ${count} draws, normal debit and stock, retry/other account unaffected`,async t=>{
 const f=await setup(t),before=await f.coin(),body=f.body(count);if(count===66666)body.budget='100000000000000';
 assert.equal((await f.state()).oneTimeReward.name,'레반');const result=await f.service.open(f.env,f.user,body);
 assert.equal(result.draws.filter(r=>r.guaranteed&&r.mercenaryCode==='V-971').length,1);assert.equal(result.draws[0].quantity,1);assert.equal(await f.coin(),before-result.coinCost);assert.equal((await once(f)).status,'CONSUMED');assert.equal((await f.state()).oneTimeReward,null);
 assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-971'").first()).issued),1);
 const replay=await f.service.open(f.env,f.user,body);assert(replay.replayed);assert.equal(await f.coin(),before-result.coinCost);
 assert(!(await f.service.open(f.env,f.user,f.body(1))).draws.some(r=>r.guaranteed));assert(!(await f.service.open(f.env,{id:2},f.body(1))).draws.some(r=>r.guaranteed));
});
test('no funds and sold-out entitlement never charge or consume; existing ownership odds unchanged',async t=>{
 const f=await setup(t);await f.own('V-950');await f.own('V-951');const state=await f.state();assert.equal(state.ssProbabilityDivisor,2);assert.equal(state.effectiveCardPercents['V-950'],'0.0002');
 await f.pg.exec('UPDATE users SET coin=0 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,f.body()),/코인이 부족/);assert.equal((await once(f)).status,'ARMED');
 await f.pg.exec("UPDATE users SET coin=1000000000000000 WHERE id=1; UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-971'");const before=await f.coin();await assert.rejects(f.service.open(f.env,f.user,f.body()),/확정 보상/);assert.equal(await f.coin(),before);assert.equal((await once(f)).status,'ARMED');
});
test('stock race preserves the armed award and cancels before payment',async t=>{
 const f=await setup(t);let reads=0;const service=createBlackcrownPackService({randomInt:n=>n-1,readState:async(env,options)=>{if(++reads===2)await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-971'");return readBlackcrownPackState(env,options);}}),before=await f.coin();
 await assert.rejects(service.open(f.env,f.user,f.body()),/확정 보상 재고/);assert.equal(await f.coin(),before);assert.equal((await once(f)).status,'ARMED');
});
test('mid-transaction failure rolls back award, stock and debit; retry consumes once',async t=>{
 const f=await setup(t),before=await f.coin(),body=f.body(),batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=stmts=>batch([...stmts,f.p("INSERT INTO app_meta(key,value) VALUES('forced-failure','x')"),f.p("INSERT INTO app_meta(key,value) VALUES('forced-failure','x')")]);
 await assert.rejects(f.service.open(f.env,f.user,body));assert.equal(await f.coin(),before);assert.equal((await once(f)).status,'ARMED');assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-971'").first()).issued),0);
 f.env.DB.batch=batch;assert((await f.service.open(f.env,f.user,body)).draws[0].guaranteed);assert.equal((await once(f)).status,'CONSUMED');
});
test('client supplied guarantee fields are rejected',async t=>{const f=await setup(t);await assert.rejects(f.service.open(f.env,f.user,{...f.body(),firstLimitedCode:'V-971'}));assert.equal((await once(f)).status,'ARMED');});
