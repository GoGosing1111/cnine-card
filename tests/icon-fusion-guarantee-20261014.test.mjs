import test from 'node:test';import assert from 'node:assert/strict';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {runIconFusion,iconFusionOverview,iconFusionGuaranteeKey} from '../functions/_icon_fusion.js';
const grant=f=>f.setting(iconFusionGuaranteeKey(7),{userId:7,grantId:'qa-one-time',remaining:1});
const read=async f=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',iconFusionGuaranteeKey(7)).first()).value);
for(const postgres of [false,true]){
 test(`${postgres?'PG':'SQLite'}: one success only, ordinary costs, replay and account isolation`,async t=>{
  const f=await iconFusionFixture(t,{postgres});await grant(f);
  assert.equal((await iconFusionOverview(f.env,f.user)).policy.successRate,100);
  assert.equal((await iconFusionOverview(f.env,{id:8})).policy.successRate,10);
  const body=f.body(),r=await runIconFusion(f.env,f.user,body,{randomInt(){throw Error('guaranteed request must not roll');}});
  assert.equal(r.success,true);assert.equal(r.policy.successRate,100);assert.equal((await read(f)).remaining,0);assert.equal((await read(f)).consumedRequestId,body.requestId);
  const after=await f.snapshot();assert.equal(after.coin,1000000000000);assert.equal(after.stars,10000000);
  assert.equal((await runIconFusion(f.env,f.user,body)).replayed,true);assert.deepEqual(await f.snapshot(),after);
  assert.equal((await iconFusionOverview(f.env,f.user)).policy.successRate,10);
  await f.p("UPDATE user_cards SET breakthrough_level=13 WHERE card_id IN ('CN-SUPER','CN-FUR')").run();
  assert.equal((await runIconFusion(f.env,f.user,f.body(),{randomInt:()=>999999})).success,false);
 });
 test(`${postgres?'PG':'SQLite'}: validation and transaction failure preserve the chance; retry consumes once`,async t=>{
  const f=await iconFusionFixture(t,{postgres});await grant(f);const body=f.body(),before=await f.snapshot();
  await assert.rejects(()=>runIconFusion(f.env,f.user,{...body,furId:'missing'}));assert.equal((await read(f)).remaining,1);
  f.fail('INSERT INTO user_cards');await assert.rejects(()=>runIconFusion(f.env,f.user,body));f.fail('');
  assert.deepEqual(await f.snapshot(),before);assert.equal((await read(f)).remaining,1);
  assert.equal((await runIconFusion(f.env,f.user,body)).success,true);assert.equal((await read(f)).remaining,0);
 });
 test(`${postgres?'PG':'SQLite'}: stale guarantee cannot bypass atomic claim`,async t=>{
  const f=await iconFusionFixture(t,{postgres});await grant(f);const before=await f.snapshot(),batch=f.DB.batch.bind(f.DB);
  f.DB.batch=async statements=>{if(statements.some(s=>s.source?.includes("SET status='COMPLETED'")))await f.setting(iconFusionGuaranteeKey(7),{userId:7,grantId:'qa-one-time',remaining:0});return batch(statements);};
  await assert.rejects(()=>runIconFusion(f.env,f.user,f.body()));assert.deepEqual(await f.snapshot(),before);
 });
}
