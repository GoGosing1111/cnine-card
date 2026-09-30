import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge} from './helpers/forge-held-runtime.mjs';
import {forgeStarQuantity,isForgeDoubleStarEquipment} from '../shared/equipment-forge-policy-v1.mjs';

const targetCodes=['EMPEROR_TOP','EMPEROR_BOTTOM','EMPEROR_SHOES','EMPEROR_DUAL_DISK','EQ_1788486929132','EQ_1788486888336'];
const rid=()=>crypto.randomUUID();
const quote=f=>forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId});

test('only the four Emperor pieces and two Eastern weapons double Master Stars at every step',()=>{
 for(const code of targetCodes){assert.equal(isForgeDoubleStarEquipment(code),true);for(const base of [10000,30000,50000,70000,90000,110000,150000])assert.equal(forgeStarQuantity(code,base),base*2);}
 for(const code of ['TEST_WEAPON','EMPEROR_HELM','EQ_1788486929133','東方軍火商(동방무기상)']){assert.equal(isForgeDoubleStarEquipment(code),false);assert.equal(forgeStarQuantity(code,10000),10000);}
});

for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: Emperor quote, rollback and replay use the doubled debit`,async t=>{
  const f=await forgeFixture(t,{postgres});await f.p('UPDATE character_equipment_items SET code=? WHERE id=1','EMPEROR_TOP').run();
  const q=await quote(f),body={requestId:rid(),quoteId:q.quoteId};
  assert.equal(q.cost.itemQuantity,4);assert.equal(q.cost.coinCost,100);assert.equal(q.cost.successPpm,500000);
  f.fail('INSERT INTO equipment_forge_states_v1');await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0}));
  assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);
  f.fail('');const receipt=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('must reuse original roll');}});
  assert.equal(receipt.itemQuantity,4);assert.equal(receipt.level,1);assert.equal(await f.coin(),9999900);assert.equal(await f.qty('MASTER_STAR'),96);
  const retry=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('must not reroll');}});
  assert.equal(retry.replayed,true);assert.equal(retry.itemQuantity,4);assert.equal(await f.qty('MASTER_STAR'),96);
 });
 test(`${label}: old Eastern quote cannot spend at the former price; a fresh quote works`,async t=>{
  const f=await forgeFixture(t,{postgres});await f.p('UPDATE character_equipment_items SET code=? WHERE id=1','EQ_1788486888336').run();
  const old=await quote(f),stored=await f.p('SELECT plan_json FROM equipment_forge_quotes_v1 WHERE quote_id=?',old.quoteId).first(),plan=JSON.parse(stored.plan_json);
  assert.equal(old.cost.itemQuantity,4);plan.cost.itemQuantity=2;
  await f.p('UPDATE equipment_forge_quotes_v1 SET plan_json=? WHERE quote_id=?',JSON.stringify(plan),old.quoteId).run();
  await assert.rejects(()=>executeForge(f.env,f.user,{requestId:rid(),quoteId:old.quoteId},'ENHANCE',{randomInt:()=>0}),{code:'FORGE_QUOTE_EXPIRED'});
  assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);
  const fresh=await quote(f),body={requestId:rid(),quoteId:fresh.quoteId};
  assert.equal(fresh.cost.itemQuantity,4);
  await f.p("UPDATE cnine_user_inventory SET quantity=3 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0}),{code:'FORGE_MATERIAL'});
  assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),3);
  await f.p("UPDATE cnine_user_inventory SET quantity=100 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  const receipt=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0});
  assert.equal(receipt.itemQuantity,4);assert.equal(await f.qty('MASTER_STAR'),96);
 });
}
