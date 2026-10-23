import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_PURCHASE_MAX_QUANTITY,lootPurchaseMaximum,createLootProductDraft,lootPurchaseWindow,validateLootShopPolicy} from '../shared/loot-shop-policy-v1.mjs';
import {purchaseLootProduct,openLootPack,pigCoinBalance,lootShopState,handleLootShop,saveLootShopPolicy,readLootShopPolicy} from '../functions/_loot_shop.js';
import {inspectionMarkup,lootRewardMarkup} from '../js/loot-shop-presentation-v2.mjs';
const id=()=>crypto.randomUUID(),body=(productId='f_body',quantity=3)=>({productId,quantity,requestId:id()});
const noRoll=()=>{throw Error('unexpected reroll');};
const count=async(f,table)=>Number((await f.p(`SELECT COUNT(*) n FROM ${table}`).first()).n);
async function fixture(t,postgres){const f=await lootFixture(t,{postgres});for(const p of f.shopPolicy.products)p.accountLimit=10;await f.setShop(f.shopPolicy);return f;}
async function noPayment(f){assert.equal(await pigCoinBalance(f.env,7),500);for(const table of ['loot_shop_purchases_v1','pig_coin_ledger_v1','user_equipment_instances','loot_shop_packs_v1'])assert.equal(await count(f,table),0,table);}
async function add(f,type,fields){const p={...createLootProductDraft(type,type.toLowerCase()),enabled:true,price:25,accountLimit:100,...fields};f.shopPolicy.products.push(p);await f.setShop(validateLootShopPolicy(f.shopPolicy));return p;}

test('quantity controls cap by price, remaining limit and 100; disclose total and result counts',()=>{
 const p={...createLootProductDraft('F_BODY','f_body'),canBuy:true,price:25,remaining:1000,enabled:true};
 assert.equal(LOOT_PURCHASE_MAX_QUANTITY,100);assert.equal(lootPurchaseMaximum(p,100000),100);assert.equal(lootPurchaseMaximum(p,99),3);assert.equal(lootPurchaseMaximum({...p,remaining:2},1000),2);assert.equal(lootPurchaseMaximum({...p,canBuy:false},1000),0);assert.equal(lootPurchaseMaximum(p,24),0);
 const html=inspectionMarkup(p,{pigCoins:100,salesEnabled:true},3);assert.match(html,/max="4"/);assert.match(html,/value="3"/);assert.match(html,/data-total-cost>75/);assert.match(html,/3개 교환하기/);
 const result=lootRewardMarkup({kind:'EQUIPMENT_BATCH',name:'<장비>',items:[{name:'<슈트>',quantity:3}]});assert.match(result,/장비 보관함/);assert.match(result,/× 3/);assert.match(result,/&lt;슈트&gt;/);
});
for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: invalid quantities never prepare, charge or grant`,async t=>{
  const f=await fixture(t,postgres);for(const quantity of [0,-1,101,1.5,'3',null,true,NaN,Infinity,{},[]])await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body('f_body',quantity)),{code:'JOINT_LOOT_QUANTITY'});
  await noPayment(f);assert.equal(await count(f,'joint_operations_v1'),0);
 });
 test(`${label}: bulk gear charges once, counts every unit and repeats without double delivery`,async t=>{
  const f=await fixture(t,postgres),request=body();const r=await purchaseLootProduct(f.env,f.user,request);
  assert.equal(r.quantity,3);assert.equal(r.totalPrice,75);assert.equal(r.state.pigCoins,425);assert.equal(r.reward.kind,'EQUIPMENT_BATCH');assert.equal(r.reward.items[0].quantity,3);assert.equal(await count(f,'user_equipment_instances'),3);assert.equal(await count(f,'pig_coin_ledger_v1'),1);assert.equal(await count(f,'loot_shop_purchases_v1'),3);
  const rows=(await f.p('SELECT request_id FROM user_equipment_instances').all()).results;assert.deepEqual(rows.map(r=>r.request_id).sort(),[1,2,3].map(n=>request.requestId+':'+n));
  assert.equal(r.state.products.find(p=>p.id==='f_body').bought,3);assert.equal((await purchaseLootProduct(f.env,f.user,request)).replayed,true);assert.equal(await pigCoinBalance(f.env,7),425);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{...request,quantity:2}),{code:'JOINT_REQUEST_CONFLICT'});await assert.rejects(()=>purchaseLootProduct(f.env,{id:8},request),{code:'JOINT_REQUEST_CONFLICT'});
 });
 test(`${label}: old omitted quantity and explicit one replay the same receipt`,async t=>{
  const f=await fixture(t,postgres),request={productId:'f_body',requestId:id()},r=await purchaseLootProduct(f.env,f.user,request);assert.equal(r.quantity,1);assert.equal((await purchaseLootProduct(f.env,f.user,{...request,quantity:1})).replayed,true);assert.equal((await f.p('SELECT request_id FROM user_equipment_instances').first()).request_id,request.requestId);assert.equal(await pigCoinBalance(f.env,7),475);
  f.fail('INSERT INTO user_equipment_instances');const pending={productId:'f_body',requestId:id()};await assert.rejects(()=>purchaseLootProduct(f.env,f.user,pending));f.fail('');assert.equal((await purchaseLootProduct(f.env,f.user,{...pending,quantity:1})).quantity,1);
 });
 test(`${label}: 100 direct equipment instances complete in one transaction`,async t=>{
  const f=await fixture(t,postgres),p=await add(f,'EQUIPMENT_DIRECT',{equipmentId:37,price:1});const r=await purchaseLootProduct(f.env,f.user,body(p.id,100));assert.equal(r.state.pigCoins,400);assert.equal(r.reward.items[0].quantity,100);assert.equal(await count(f,'user_equipment_instances'),100);assert.equal(await count(f,'pig_coin_ledger_v1'),1);assert.equal(r.state.products.find(x=>x.id===p.id).remaining,0);
 });
 test(`${label}: all pack types remain separately owned and openable`,async t=>{
  const f=await fixture(t,postgres);await add(f,'CARD_CHOICE',{cardIds:['ss1','fur1']});await add(f,'MERCENARY_CUSTOM_PACK',{mercenaryCodes:[f.document.mercenaries[0].code],rankWeights:{C:0,B:0,A:1,S:0,SS:0,SSS:0}});
  const types=['superstar_choice','fur_choice','mercenary_pack','mercenary_ss_pack','card_choice','mercenary_custom_pack'];
  for(const productId of types){const request=body(productId,2),r=await purchaseLootProduct(f.env,f.user,request),packs=r.state.ownedPacks.filter(p=>p.product.id===productId);assert.equal(packs.length,2);assert.equal(new Set(packs.map(p=>p.id)).size,2);
   for(const pack of packs)await openLootPack(f.env,f.user,{packId:pack.id,requestId:id(),...(pack.product.type.endsWith('_CHOICE')?{cardId:productId==='fur_choice'?'fur1':'ss1'}:{})},{randomInt:()=>0});
  }
  assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,0);assert.equal(await pigCoinBalance(f.env,7),200);assert.equal(await count(f,'loot_shop_purchases_v1'),12);
 });
 test(`${label}: bundle amounts multiply once, including unseen counts and logs`,async t=>{
  const f=await fixture(t,postgres),p=await add(f,'ITEM_BUNDLE',{items:[{code:'MASTER_STAR',quantity:3},{code:'VEHICLE_PART_TIRE',quantity:7}]}),request=body(p.id,4);
  f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request));await noPayment(f);f.fail('');
  const r=await purchaseLootProduct(f.env,f.user,request);assert.deepEqual(r.reward.items.map(i=>i.quantity),[12,28]);const star=await f.p("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first();assert.equal(Number(star.quantity),112);assert.equal(Number(star.unseen_quantity),12);assert.equal(await count(f,'inventory_logs'),2);assert.equal((await purchaseLootProduct(f.env,f.user,request)).replayed,true);assert.equal(await count(f,'inventory_logs'),2);
 });
 test(`${label}: second gear failure rolls back all units and retry preserves every independent roll`,async t=>{
  const f=await fixture(t,postgres),request=body('mystic_equipment',4),batch=f.DB.batch.bind(f.DB);let roll=0,fail=true;
  f.DB.batch=async list=>{if(fail){const indices=list.map((s,i)=>s.sql?.startsWith('INSERT INTO user_equipment_instances')?i:-1).filter(i=>i>=0);assert.equal(indices.length,4);list.splice(indices[1],0,f.p('INSERT INTO missing_bulk_test_table(x) VALUES(1)'));}return batch(list);};
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request,{randomInt:()=>roll++}));await noPayment(f);assert.equal(roll,4);fail=false;
  // The frozen full pool is checked even if an unchanged item would win.
  await f.p('UPDATE character_equipment_items SET is_public=0 WHERE id=900').run();await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request,{randomInt:noRoll}));await noPayment(f);await f.p('UPDATE character_equipment_items SET is_public=1 WHERE id=900').run();
  const r=await purchaseLootProduct(f.env,f.user,request,{randomInt:noRoll});assert.deepEqual(r.reward.items.map(i=>Number(i.id)),[900,901,902,903]);assert.equal(await count(f,'user_equipment_instances'),4);assert.equal(await pigCoinBalance(f.env,7),400);
 });
 test(`${label}: lost acknowledgement and concurrent duplicate requests charge only once`,async t=>{
  const f=await fixture(t,postgres),request=body(),batch=f.DB.batch.bind(f.DB);let lose=true;f.DB.batch=async list=>{const r=await batch(list);if(lose){lose=false;throw Error('ACK_LOST');}return r;};
  const results=await Promise.all([purchaseLootProduct(f.env,f.user,request),purchaseLootProduct(f.env,f.user,request)]);assert.equal(results.length,2);assert.equal(await pigCoinBalance(f.env,7),425);assert.equal(await count(f,'pig_coin_ledger_v1'),1);assert.equal(await count(f,'user_equipment_instances'),3);
 });
 test(`${label}: competing bulk purchases cannot overdraw wallet or remaining daily limit`,async t=>{
  const f=await fixture(t,postgres),p=f.shopPolicy.products.find(p=>p.id==='f_body');p.accountLimit=5;p.limitPeriod='DAILY';await f.setShop(f.shopPolicy);
  const results=await Promise.allSettled([purchaseLootProduct(f.env,f.user,body()),purchaseLootProduct(f.env,f.user,body())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count(f,'loot_shop_purchases_v1'),3);assert.equal(await pigCoinBalance(f.env,7),425);
  let state=await lootShopState(f.env,f.user);assert.equal(state.products.find(p=>p.id==='f_body').remaining,2);const at=Date.parse(lootPurchaseWindow('DAILY').resetsAt);state=await lootShopState(f.env,f.user,{at});assert.equal(state.products.find(p=>p.id==='f_body').bought,0);assert.equal(state.products.find(p=>p.id==='f_body').lifetimeBought,3);
  p.accountLimit=100;p.price=100;await f.setShop(f.shopPolicy);const walletRace=await Promise.allSettled([purchaseLootProduct(f.env,f.user,body()),purchaseLootProduct(f.env,f.user,body())]);assert.equal(walletRace.filter(r=>r.status==='fulfilled').length,1);assert.equal(await pigCoinBalance(f.env,7),125);
 });
 test(`${label}: excessive quantity, insufficient balance and inventory overflow never partly deliver`,async t=>{
  const f=await fixture(t,postgres);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body('f_body',11)));await noPayment(f);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body('f_body',21)));await noPayment(f);
  const p=await add(f,'ITEM_BUNDLE',{items:[{code:'MASTER_STAR',quantity:3},{code:'VEHICLE_PART_TIRE',quantity:1}]});await f.p("UPDATE cnine_user_inventory SET quantity=? WHERE user_id=7 AND item_code='MASTER_STAR'",Number.MAX_SAFE_INTEGER-5).run();await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body(p.id,2)));await noPayment(f);assert.equal(await count(f,'inventory_logs'),0);
 });
 test(`${label}: pending bulk order cannot purchase deleted product, completed replay remains valid`,async t=>{
  const f=await fixture(t,postgres),done=body('f_body',2);await purchaseLootProduct(f.env,f.user,done);const request=body('f_body',3);f.fail('INSERT INTO user_equipment_instances');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request));f.fail('');const policy=(await readLootShopPolicy(f.env)).policy;policy.products=policy.products.filter(p=>p.id!=='f_body');await saveLootShopPolicy(f.env,f.user,policy);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request));assert.equal((await purchaseLootProduct(f.env,f.user,done)).replayed,true);assert.equal(await pigCoinBalance(f.env,7),450);assert.equal(await count(f,'user_equipment_instances'),2);
 });
 test(`${label}: authenticated route accepts quantity and rejects client-supplied totals`,async t=>{
  const f=await fixture(t,postgres),call=data=>handleLootShop({path:'loot-shop/purchase',env:f.env,deps:f.deps,request:new Request('https://game.test/api/loot-shop/purchase',{method:'POST',headers:{origin:'https://game.test',authorization:'Bearer local-account-7','content-type':'application/json'},body:JSON.stringify(data)})});
  assert.equal((await call({...body(),totalPrice:1})).status,400);assert.equal((await call(body('f_body','3'))).status,400);const response=await call(body());assert.equal(response.status,200);assert.equal((await response.json()).quantity,3);assert.equal(await pigCoinBalance(f.env,7),425);
 });
}
