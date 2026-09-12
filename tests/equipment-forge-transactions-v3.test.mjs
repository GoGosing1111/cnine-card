import test from 'node:test';import assert from 'node:assert/strict';import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge,forgeReceipt,forgeEquipmentBonus,forgeEquipmentBonuses,forgeAccountState,saveForgeRuntime} from '../functions/_equipment_forge_transactions.js';
import {forgePower,FORGE_RUNTIME_KEY,validateForgePolicy} from '../shared/equipment-forge-policy-v1.mjs';
import {handleForgeRuntime,handleForgeRuntimeReady} from '../functions/_equipment_forge_routes.js';
const rid=()=>crypto.randomUUID(),quote=async(f,extra={})=>forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId,...extra});
test('approved +10 power and 10% minimum cannot drift',()=>{assert.deepEqual(forgePower(580000,10),{total:1276000,pve:1148400,pvp:127600});});
test('joint hold falls through to the existing read-only forge without DB access',async()=>{assert.equal(await handleForgeRuntime({path:'character/equipment/forge/enhance',request:new Request('https://game.test'),env:new Proxy({},{get(){throw Error('DB touched');}}),deps:{}}),null);});
for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: lost commit acknowledgement and concurrent authenticated requests charge only once`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f),body={requestId:rid(),quoteId:q.quoteId},batch=f.DB.batch.bind(f.DB);let lost=true;
  f.DB.batch=async list=>{const result=await batch(list);if(lost){lost=false;throw Error('LOST_ACK');}return result;};
  await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0});await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>{throw Error('reroll');}});assert.equal(await f.coin(),9999900);
  assert.deepEqual((await forgeEquipmentBonuses(f.env,[7,8])).get(7),await forgeEquipmentBonus(f.env,7));
  const next=await quote(f),path='character/equipment/forge/enhance';f.deps.forgeRandomInt=()=>0;
  const call=()=>handleForgeRuntimeReady({path,env:f.env,deps:f.deps,request:new Request(`https://game.test/api/${path}`,{method:'POST',headers:{authorization:'Bearer local-account-7',origin:'https://game.test','content-type':'application/json'},body:JSON.stringify({requestId:rid(),quoteId:next.quoteId})})});
  assert.deepEqual((await Promise.all([call(),call()])).map(r=>r.status).sort(),[200,409]);assert.equal(await f.coin(),9999800);
 });
 test(`${label}: superseded pending operations terminate, and draft policy writes include an atomic audit`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f),body={requestId:rid(),quoteId:q.quoteId};f.fail('INSERT INTO equipment_forge_states_v1');await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0}));f.fail('');
  const other=await quote(f);await executeForge(f.env,f.user,{requestId:rid(),quoteId:other.quoteId},'ENHANCE',{randomInt:()=>0});
  await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE'),{code:'FORGE_STALE'});assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');assert.equal(await f.coin(),9999900);
  const changed=structuredClone(f.policy);changed.quoteSeconds=180;await saveForgeRuntime(f.env,f.user,changed);assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='V3_JOINT_POLICY_DRAFT'").first()).n),1);
 });
 test(`${label}: success/maintain receipts are atomic, replayable and invalidate stale quotes`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f),stale=await quote(f),body={requestId:rid(),quoteId:q.quoteId};
  const r=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0});assert.equal(r.outcome,'SUCCESS');assert.equal(r.level,1);assert.equal(await f.coin(),9999900);assert.equal(await f.qty('MASTER_STAR'),98);assert.deepEqual(await forgeEquipmentBonus(f.env,7),{pve:540,pvp:60});
  const retry=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('reroll');}});assert.equal(retry.replayed,true);assert.equal(await f.coin(),9999900);
  await assert.rejects(()=>executeForge(f.env,f.user,{requestId:rid(),quoteId:stale.quoteId},'ENHANCE'),{code:'FORGE_STALE'});
  const m=await quote(f);assert.equal((await executeForge(f.env,f.user,{requestId:rid(),quoteId:m.quoteId},'ENHANCE',{randomInt:()=>600000})).outcome,'MAINTAIN');assert.equal((await forgeAccountState(f.env,f.user)).items[0].enhancement.level,1);
 });
 test(`${label}: destruction removes the exact equipped instance; restore creates one owned instance once`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f),body={requestId:rid(),quoteId:q.quoteId};
  const d=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>999999});assert.equal(d.outcome,'DESTROY');assert.equal((await f.p('SELECT * FROM user_equipment_instances WHERE user_id=7').all()).results.length,0);assert.equal((await f.p('SELECT * FROM user_equipment_loadout WHERE user_id=7').all()).results.length,0);
  assert.equal((await forgeAccountState(f.env,f.user)).records.length,1);const restore=await forgeQuote(f.env,f.user,{requestId:rid(),kind:'RESTORE',recordId:d.recordId}),rb={requestId:rid(),quoteId:restore.quoteId};
  const r=await executeForge(f.env,f.user,rb,'RESTORE');assert.equal(r.outcome,'RESTORED');assert.equal((await forgeAccountState(f.env,f.user)).items.length,1);assert.equal(await f.coin(),9999400);
  await executeForge(f.env,f.user,rb,'RESTORE');assert.equal((await forgeAccountState(f.env,f.user)).items.length,1);assert.equal(await f.coin(),9999400);
  await assert.rejects(()=>forgeReceipt(f.env,{id:8},body.requestId,'ENHANCE'),{code:'JOINT_NOT_FOUND'});
 });
 test(`${label}: protection only consumes under configured policy and preserves level and loadout`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f,{useProtection:true});const result=await executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},'ENHANCE',{randomInt:()=>999999});assert.equal(result.outcome,'PROTECTED');assert.equal(result.rolled,'DESTROY');assert.equal(await f.qty('FORGE_TEST_PROTECTION'),99);assert.equal((await forgeAccountState(f.env,f.user)).items[0].equipped,true);assert.equal((await forgeAccountState(f.env,f.user)).records.length,0);
  const success=await quote(f,{useProtection:true});await executeForge(f.env,f.user,{requestId:rid(),quoteId:success.quoteId},'ENHANCE',{randomInt:()=>0});assert.equal(await f.qty('FORGE_TEST_PROTECTION'),99);
 });
 test(`${label}: failed destruction rolls all payment/state back and retries the original roll after CMS changes`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f),body={requestId:rid(),quoteId:q.quoteId};f.fail('DELETE FROM user_equipment_instances');await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>999999}));assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);assert.equal((await forgeAccountState(f.env,f.user)).records.length,0);
  const changed=structuredClone(f.policy);changed.steps[0].coinCost=9000;await f.setting(FORGE_RUNTIME_KEY,changed);f.fail('');const r=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('reroll');}});assert.equal(r.outcome,'DESTROY');assert.equal(await f.coin(),9999900);
 });
 test(`${label}: expiry, missing ownership, unconfigured and invalid policies fail without spending`,async t=>{
  const f=await forgeFixture(t,{postgres}),q=await quote(f);await assert.rejects(()=>executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},'ENHANCE',{now:Date.parse(q.expiresAt)+1}),{code:'FORGE_QUOTE_EXPIRED'});
  await assert.rejects(()=>forgeQuote(f.env,{id:8,role:'OWNER'},{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId}),{code:'FORGE_NOT_OWNED'});
  await assert.rejects(()=>saveForgeRuntime(f.env,f.user,{...f.policy,mode:'ON'}),{code:'FORGE_POLICY'});const invalid=structuredClone(f.policy);invalid.steps[0].successPpm=99999;assert.throws(()=>validateForgePolicy(invalid),{code:'FORGE_POLICY'});
  const path='character/equipment/forge/enhance',response=await handleForgeRuntimeReady({path,request:new Request(`https://game.test/api/${path}`,{method:'POST',headers:{authorization:'Bearer local-account-7',origin:'https://game.test','content-type':'application/json'},body:JSON.stringify({requestId:rid(),quoteId:q.quoteId,outcome:'SUCCESS',userId:8})}),env:f.env,deps:f.deps});assert.equal(response.status,400);assert.equal(await f.coin(),10000000);
 });
}
