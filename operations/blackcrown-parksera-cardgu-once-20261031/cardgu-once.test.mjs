import test from 'node:test';
import assert from 'node:assert/strict';
import {blackcrownFixture} from '../../tmp/duo-settlement-recovery-20261027/tests/helpers/blackcrown-pack-fixture.mjs';
import reference from '../../tmp/duo-settlement-recovery-20261027/tests/fixtures/blackcrown-sss-reference-20261027.json' with {type:'json'};
import {BLACKCROWN_PACK} from '../../tmp/duo-settlement-recovery-20261027/shared/mercenary-blackcrown-pack-v1.mjs';
import {blackcrownOnceKey} from '../../tmp/duo-settlement-recovery-20261027/functions/_mercenary_blackcrown_once.js';
import {prepareSettings} from '../../tmp/duo-settlement-recovery-20261027/scripts/ops/blackcrown-rates-opening-20261030.mjs';
const CODE='V-970',OP='test-parksera-cardgu-once';
async function setup(t){
 const f=await blackcrownFixture(t,{randomInt:n=>n-1});Object.assign(f.settings,prepareSettings(reference.blackcrown.settings,reference.bloodmoon.settings).settings,{mode:'ON'});await f.configure();
 await f.pg.exec('UPDATE users SET coin=1000000000000000 WHERE id IN (1,2)');
 await f.setting(blackcrownOnceKey(1),{version:1,status:'ARMED',remaining:1,userId:1,packId:BLACKCROWN_PACK.id,mercenaryCode:CODE,actorId:1,operationId:OP});return f;
}
const once=async f=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',blackcrownOnceKey(1)).first()).value);
for(const count of [1,10,66666])test(`Cardgu once in ${count} normal draws; debit, stock, retry and other account`,async t=>{
 const f=await setup(t),before=await f.coin(),body=f.body(count);if(count===66666)body.budget='100000000000000';
 assert.equal((await f.state()).oneTimeReward.name,'카드구');const result=await f.service.open(f.env,f.user,body);
 assert.equal(result.draws.filter(r=>r.guaranteed&&r.mercenaryCode===CODE).length,1);assert.equal(result.draws[0].quantity,1);assert.equal(await f.coin(),before-result.coinCost);
 assert.equal((await once(f)).status,'CONSUMED');assert.equal((await once(f)).remaining,0);assert.equal((await f.state()).oneTimeReward,null);
 assert.equal(Number((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?',CODE).first()).issued),1);
 const replay=await f.service.open(f.env,f.user,body);assert(replay.replayed);assert.equal(await f.coin(),before-result.coinCost);
 assert(!(await f.service.open(f.env,f.user,f.body(1))).draws.some(r=>r.guaranteed));assert(!(await f.service.open(f.env,{id:2},f.body(1))).draws.some(r=>r.guaranteed));
});
test('failed opening retains Cardgu entitlement; retry succeeds once after rollback',async t=>{
 const f=await setup(t);await f.pg.exec('UPDATE users SET coin=0 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,f.body()),/코인이 부족/);assert.equal((await once(f)).status,'ARMED');
 await f.pg.exec("UPDATE users SET coin=1000000000000000 WHERE id=1; UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-970'");const before=await f.coin();
 await assert.rejects(f.service.open(f.env,f.user,f.body()),/카드 발행 수량/);assert.equal(await f.coin(),before);assert.equal((await once(f)).status,'ARMED');
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=0 WHERE code='V-970'");
 const body=f.body(),batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=stmts=>batch([...stmts,f.p("INSERT INTO app_meta(key,value) VALUES('test-duplicate','x')"),f.p("INSERT INTO app_meta(key,value) VALUES('test-duplicate','x')")]);
 await assert.rejects(f.service.open(f.env,f.user,body));assert.equal(await f.coin(),before);assert.equal((await once(f)).status,'ARMED');assert.equal(Number((await f.p('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=?',CODE).first()).issued),0);
 f.env.DB.batch=batch;assert((await f.service.open(f.env,f.user,body)).draws[0].guaranteed);assert.equal((await once(f)).status,'CONSUMED');assert((await f.service.open(f.env,f.user,body)).replayed);
});
