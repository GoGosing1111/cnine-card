import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge} from './helpers/forge-held-runtime.mjs';
import {FORGE_ADVANCED_FIELDS,FORGE_ADVANCED_KEY,FORGE_SCROLL_ITEMS,forgeAdvancedDraft,validateForgeAdvanced} from '../shared/equipment-forge-advanced-v1.mjs';
import {FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {forgeInputNumber} from '../shared/equipment-forge-cms-v1.mjs';
import {saveForgeAdvancedPolicy,readForgeAdvancedPolicy} from '../functions/_equipment_forge_advanced.js';
const amounts=[100000001,500000000,1000000000,3000000000,Number.MAX_SAFE_INTEGER];
const policy=()=>{const p=forgeAdvancedDraft();for(const [i,s]of p.steps.entries())Object.assign(s,{successPpm:500000,maintainPpm:250000,destroyPpm:250000,coinCost:100,itemQuantity:amounts[i],scrollQuantity:1,protectionQuantity:0,powerBonusPercent:160+i*40});return p;};
const request=f=>({requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId});

test('+11 through +15 accept master-star costs above 100 million without rounding and retain integer validation',()=>{
 const p=policy();assert.deepEqual(validateForgeAdvanced(p).steps.map(s=>s.itemQuantity),amounts);
 assert.equal(FORGE_ADVANCED_FIELDS.find(([key])=>key==='itemQuantity')[3],Number.MAX_SAFE_INTEGER);
 for(const amount of amounts)assert.equal(forgeInputNumber(String(amount)),amount);
 for(const value of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'100000001']){const invalid=policy();invalid.steps[0].itemQuantity=value;assert.throws(()=>validateForgeAdvanced(invalid),{code:'FORGE_ADVANCED_POLICY'});}
 const empty=policy();empty.steps[0].itemQuantity=null;assert.equal(validateForgeAdvanced(empty).steps[0].itemQuantity,null);
});

for(const postgres of [false,true]){
 test((postgres?'PostgreSQL':'SQLite')+': large advanced costs round-trip through CMS without changing +1~+10; exact debit, atomic rollback and replay',async t=>{
  const f=await forgeFixture(t,{postgres}),legacy=(await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_RUNTIME_KEY).first()).value;
  const saved=await saveForgeAdvancedPolicy(f.env,f.user,policy());assert.equal(saved.policy.revision,1);
  assert.deepEqual((await readForgeAdvancedPolicy(f.DB)).steps.map(s=>s.itemQuantity),amounts);
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_RUNTIME_KEY).first()).value,legacy);
  await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,10,1)',f.instanceId).run();
  await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,10)',FORGE_SCROLL_ITEMS[0].code).run();
  await f.p('UPDATE cnine_user_inventory SET quantity=5000000000 WHERE user_id=7 AND item_code=?','MASTER_STAR').run();
  let expected=5000000000;
  for(const [i,code]of ['TEST_WEAPON','EMPEROR_TOP'].entries()){
   await f.p('UPDATE character_equipment_items SET code=? WHERE id=1',code).run();
   const q=await forgeQuote(f.env,f.user,request(f)),cost=amounts[i]*(i===0?1:2);assert.equal(q.cost.itemQuantity,cost);
   const body={requestId:crypto.randomUUID(),quoteId:q.quoteId};
   f.fail('INSERT INTO equipment_forge_states_v1');await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0}));f.fail('');assert.equal(await f.qty('MASTER_STAR'),expected);
   const result=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('Stored outcome must be reused');}});expected-=cost;
   assert.equal(result.itemQuantity,cost);assert.equal(result.level,11+i);assert.equal(await f.qty('MASTER_STAR'),expected);
   assert.equal((await executeForge(f.env,f.user,body,'ENHANCE')).replayed,true);assert.equal(await f.qty('MASTER_STAR'),expected);
  }
  assert.equal(await f.qty(FORGE_SCROLL_ITEMS[0].code),8);assert.equal(await f.coin(),9999800);
 });

 test((postgres?'PostgreSQL':'SQLite')+': doubling beyond the safe integer range is refused before a quote or debit',async t=>{
  const f=await forgeFixture(t,{postgres}),p=policy();p.steps[0].itemQuantity=Number.MAX_SAFE_INTEGER;await saveForgeAdvancedPolicy(f.env,f.user,p);
  await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,10,1)',f.instanceId).run();
  const regular=await forgeQuote(f.env,f.user,request(f));assert.equal(regular.cost.itemQuantity,Number.MAX_SAFE_INTEGER);
  await f.p("UPDATE character_equipment_items SET code='EMPEROR_TOP' WHERE id=1").run();const input=request(f);
  await assert.rejects(()=>forgeQuote(f.env,f.user,input),{code:'FORGE_POLICY_PENDING'});
  assert.equal(await f.p('SELECT quote_id FROM equipment_forge_quotes_v1 WHERE quote_id=?',input.requestId).first(),null);
  assert.equal(await f.qty('MASTER_STAR'),100);assert.equal(await f.coin(),10000000);
  assert.equal(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_ADVANCED_KEY).first()).value).steps[0].itemQuantity,Number.MAX_SAFE_INTEGER);
 });
}
