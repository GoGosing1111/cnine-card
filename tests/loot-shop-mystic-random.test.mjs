import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {jointHash} from '../functions/_joint_transactions.js';
import {purchaseLootProduct,lootShopState,readLootShopPolicy,pigCoinBalance,handleLootShop} from '../functions/_loot_shop.js';
import {LOOT_MYSTIC_NAMES,LOOT_SHOP_DEFAULTS,validateLootShopPolicy} from '../shared/loot-shop-policy-v1.mjs';
import {inspectionMarkup,lootProductOptionsMarkup,lootRewardMarkup} from '../js/loot-shop-v1.mjs';

const request=()=>({productId:'mystic_equipment',requestId:crypto.randomUUID()});
const noRoll=()=>{throw Error('MUST NOT REROLL');};
const count=async(f,table)=>Number((await f.p(`SELECT COUNT(*) n FROM ${table}`).first()).n);
async function assertNoPayment(f){
 assert.equal(await pigCoinBalance(f.env,7),500);
 for(const table of ['loot_shop_purchases_v1','pig_coin_ledger_v1','user_equipment_instances'])assert.equal(await count(f,table),0);
}
test('Mystic no longer needs a selected equipment; fixed F-body still does',()=>{
 const policy=structuredClone(LOOT_SHOP_DEFAULTS),m=policy.products.find(p=>p.type==='MYSTIC_EQUIPMENT');
 Object.assign(m,{enabled:true,price:25,accountLimit:3});
 assert.equal(validateLootShopPolicy(policy).products.find(p=>p.id===m.id).equipmentId,null);
 Object.assign(policy.products.find(p=>p.type==='F_BODY'),{enabled:true,price:25,accountLimit:3});
 assert.throws(()=>validateLootShopPolicy(policy),{code:'JOINT_LOOT_CONFIG'});
});
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: all four equal integer outcomes grant exactly one item and disclose 25%`,async t=>{
  const f=await lootFixture(t,{postgres}),rawBefore=await readLootShopPolicy(f.env);
  const state=await lootShopState(f.env,f.user),m=state.products.find(p=>p.type==='MYSTIC_EQUIPMENT');
  assert.deepEqual(m.options.map(p=>p.name),LOOT_MYSTIC_NAMES);
  assert.ok(m.options.every(p=>p.chancePercent===25));
  assert.match(inspectionMarkup(m,state),/4종 각 25%/);
  assert.match(inspectionMarkup(m,state),/꽝 없음/);
  const contents=lootProductOptionsMarkup(m);
  for(const name of LOOT_MYSTIC_NAMES)assert.ok(contents.includes(name));
  assert.equal((contents.match(/ · 25%/g)||[]).length,4);
  assert.match(contents,/보유한 장비도 나올 수/);
  for(let roll=0;roll<4;roll++){
   const user={id:roll<2?7:8},body=request();let rolls=0;
   const result=await purchaseLootProduct(f.env,user,body,{randomInt:max=>{assert.equal(max,4);rolls++;return roll;}});
   assert.equal(rolls,1);assert.equal(result.reward.name,LOOT_MYSTIC_NAMES[roll]);
   assert.equal(Number(result.reward.id),900+roll);assert.equal(result.reward.kind,'EQUIPMENT');assert.equal(result.reward.quantity,1);
   assert.equal(Number((await f.p('SELECT equipment_id FROM user_equipment_instances WHERE request_id=?',body.requestId).first()).equipment_id),900+roll);
   const receipt=JSON.parse((await f.p('SELECT product_json FROM loot_shop_purchases_v1 WHERE request_id=?',body.requestId).first()).product_json);
   assert.deepEqual(receipt.equipmentReward,result.reward);
   const replay=await purchaseLootProduct(f.env,user,body,{randomInt:noRoll});
   assert.equal(replay.replayed,true);assert.deepEqual(replay.reward,result.reward);
   assert.match(lootRewardMarkup(result.reward),/장비 1개/);assert.doesNotMatch(lootRewardMarkup(result.reward),/카드 1장|undefined/);
  }
  assert.equal(await count(f,'user_equipment_instances'),4);assert.equal(await count(f,'loot_shop_packs_v1'),0);
  assert.equal(await pigCoinBalance(f.env,7),450);assert.equal(await pigCoinBalance(f.env,8),450);
  assert.deepEqual(await readLootShopPolicy(f.env),rawBefore);
 });
 test(`${label}: invalid random values never record or debit a purchase`,async t=>{
  const f=await lootFixture(t,{postgres});
  for(const value of [-1,4,1.5,NaN,undefined,'1'])await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request(),{randomInt:()=>value}),{code:'JOINT_LOOT_UNAVAILABLE'});
  await assertNoPayment(f);assert.equal(await count(f,'joint_operations_v1'),0);
 });
 test(`${label}: hidden, inactive, missing, wrong rarity or duplicate candidates fail closed; a fifth Mystic never enters`,async t=>{
  const f=await lootFixture(t,{postgres});
  await f.p("INSERT INTO character_equipment_items(id,code,name,rarity) VALUES(904,'EXTRA','미스틱 신규 장비','MYTHIC'),(905,'FOREIGN','엠퍼러 슈트','MYTHIC')").run();
  assert.equal((await lootShopState(f.env,f.user)).products.find(p=>p.type==='MYSTIC_EQUIPMENT').options.length,4);
  for(const [column,value,restore] of [['is_public',0,1],['is_active',0,1],['rarity','MYSTIC','MYTHIC'],['name','미스틱 다른 장비',LOOT_MYSTIC_NAMES[0]]]){
   await f.p(`UPDATE character_equipment_items SET ${column}=? WHERE id=900`,value).run();
   assert.equal((await lootShopState(f.env,f.user)).products.find(p=>p.type==='MYSTIC_EQUIPMENT').canBuy,false);
   await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request(),{randomInt:noRoll}),{code:'JOINT_LOOT_UNAVAILABLE'});
   await assertNoPayment(f);await f.p(`UPDATE character_equipment_items SET ${column}=? WHERE id=900`,restore).run();
  }
  await f.p('UPDATE character_equipment_items SET name=? WHERE id=904',LOOT_MYSTIC_NAMES[0]).run();
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request(),{randomInt:noRoll}),{code:'JOINT_LOOT_UNAVAILABLE'});await assertNoPayment(f);
 });
 test(`${label}: a failed grant freezes its roll and the whole pool is checked again inside the debit transaction`,async t=>{
  const f=await lootFixture(t,{postgres}),body=request();
  f.fail('INSERT INTO user_equipment_instances');
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:()=>3}));await assertNoPayment(f);f.fail('');
  // Change a NON-winning item after the plan was persisted: do not shrink odds.
  await f.p('UPDATE character_equipment_items SET is_public=0 WHERE id=900').run();
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll}));await assertNoPayment(f);
  assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'PENDING');
  await f.p('UPDATE character_equipment_items SET is_public=1 WHERE id=900').run();
  const result=await purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll});
  assert.equal(Number(result.reward.id),903);assert.equal(await pigCoinBalance(f.env,7),475);assert.equal(await count(f,'user_equipment_instances'),1);
 });
 test(`${label}: replacing a frozen catalog identity cannot grant a different item`,async t=>{
  const f=await lootFixture(t,{postgres}),body=request();f.fail('INSERT INTO user_equipment_instances');
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:()=>0}));f.fail('');
  await f.p("UPDATE character_equipment_items SET code='REPLACED' WHERE id=900").run();
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll}));await assertNoPayment(f);
 });
 test(`${label}: a lost commit acknowledgement succeeds and repeated requests never pay or grant twice`,async t=>{
  const f=await lootFixture(t,{postgres}),body=request(),batch=f.DB.batch.bind(f.DB);let loseAck=true;
  f.DB.batch=async list=>{const result=await batch(list);if(loseAck){loseAck=false;throw Error('ACK_LOST');}return result;};
  const first=await purchaseLootProduct(f.env,f.user,body,{randomInt:()=>2});
  assert.equal(first.reward.name,LOOT_MYSTIC_NAMES[2]);
  assert.equal((await purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll})).replayed,true);
  assert.equal(await pigCoinBalance(f.env,7),475);assert.equal(await count(f,'user_equipment_instances'),1);assert.equal(await count(f,'pig_coin_ledger_v1'),1);
 });
 test(`${label}: same request concurrency freezes one result and last-slot races cannot bypass the cap`,async t=>{
  const f=await lootFixture(t,{postgres}),body=request();let roll=0;
  const replies=await Promise.all([0,1].map(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:()=>roll++})));
  assert.deepEqual(replies[0].reward,replies[1].reward);assert.equal(await count(f,'user_equipment_instances'),1);
  const results=await Promise.allSettled([0,1,2].map(value=>purchaseLootProduct(f.env,f.user,request(),{randomInt:()=>value})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await count(f,'user_equipment_instances'),2);assert.equal(await pigCoinBalance(f.env,7),450);
  const state=await lootShopState(f.env,f.user),m=state.products.find(p=>p.type==='MYSTIC_EQUIPMENT');
  assert.equal(m.bought,2);assert.equal(m.remaining,0);assert.equal(m.canBuy,false);
 });
 test(`${label}: legacy pending fixed purchases and completed receipts never turn into another random grant`,async t=>{
  const f=await lootFixture(t,{postgres}),body=request(),product=(await readLootShopPolicy(f.env)).policy.products.find(p=>p.id===body.productId);
  await f.p("INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,7,'LOOT_PURCHASE',?,?,'PENDING',?)",body.requestId,await jointHash({kind:'LOOT_PURCHASE',input:{productId:body.productId}}),JSON.stringify({product}),new Date().toISOString()).run();
  const legacy=await purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll});assert.equal(legacy.reward,undefined);
  assert.equal(Number((await f.p('SELECT equipment_id FROM user_equipment_instances WHERE request_id=?',body.requestId).first()).equipment_id),900);
  assert.equal((await purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll})).replayed,true);
  assert.equal(await count(f,'user_equipment_instances'),1);assert.equal(await pigCoinBalance(f.env,7),475);
  const next=await purchaseLootProduct(f.env,f.user,request(),{randomInt:()=>3});assert.equal(Number(next.reward.id),903);
 });
 test(`${label}: pending random purchase honors sales OFF, rejects changed policy and cannot cross accounts`,async t=>{
  const f=await lootFixture(t,{postgres}),body=request();f.fail('INSERT INTO user_equipment_instances');
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:()=>1}));f.fail('');
  await assert.rejects(()=>purchaseLootProduct(f.env,{id:8},body,{randomInt:noRoll}),{code:'JOINT_REQUEST_CONFLICT'});
  f.shopPolicy.salesEnabled=false;await f.setShop(f.shopPolicy);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll}));await assertNoPayment(f);
  f.shopPolicy.salesEnabled=true;f.shopPolicy.products.find(p=>p.type==='MYSTIC_EQUIPMENT').price=30;await f.setShop(f.shopPolicy);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body,{randomInt:noRoll}),{terminal:true});await assertNoPayment(f);
  assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');
 });
}
test('purchase route rejects client-selected reward and uses server randomness with exact-field validation',async t=>{
 const f=await lootFixture(t),body={...request(),equipmentId:903};
 const response=await handleLootShop({path:'loot-shop/purchase',env:f.env,deps:f.deps,request:new Request('https://game.test/api/loot-shop/purchase',{method:'POST',headers:{origin:'https://game.test',authorization:'Bearer local-account-7','content-type':'application/json'},body:JSON.stringify(body)})});
 assert.equal(response.status,400);await assertNoPayment(f);
});
