import test from 'node:test';import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_SHOP_DEFAULTS,validateLootShopPolicy,lootEquipmentMatchesProduct} from '../shared/loot-shop-policy-v1.mjs';
import {lootShopAsset,inspectionMarkup} from '../js/loot-shop-v1.mjs';
import {pigCoinBalance,purchaseLootProduct,openLootPack,pigCoinRewardStatements,lootShopState,lootShopCatalog,saveLootShopPolicy,readLootShopPolicy,handleLootShop,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
const id=()=>crypto.randomUUID();
test('unconfigured economy stays OFF; prices, caps and weights must be explicit',()=>{assert.equal(validateLootShopPolicy(LOOT_SHOP_DEFAULTS).salesEnabled,false);for(const value of [0,-1,4,1.5,'2']){const p=structuredClone(LOOT_SHOP_DEFAULTS);p.products[0].accountLimit=value;assert.throws(()=>validateLootShopPolicy(p));}const p=structuredClone(LOOT_SHOP_DEFAULTS);p.products[0].enabled=true;assert.throws(()=>validateLootShopPolicy(p));});
test('only FUR choice permits a lifetime cap of ten; other products retain three',()=>{
 for(const product of LOOT_SHOP_DEFAULTS.products){
  const max=product.type==='FUR_CHOICE'?10:3;
  for(let limit=1;limit<=max;limit++){const policy=structuredClone(LOOT_SHOP_DEFAULTS);policy.products.find(p=>p.id===product.id).accountLimit=limit;assert.equal(validateLootShopPolicy(policy).products.find(p=>p.id===product.id).accountLimit,limit);}
  for(const value of [0,-1,max+1,1.5,'10']){const policy=structuredClone(LOOT_SHOP_DEFAULTS);policy.products.find(p=>p.id===product.id).accountLimit=value;assert.throws(()=>validateLootShopPolicy(policy),{code:'JOINT_LOOT_CONFIG'});}
 }
});
test('choice art resolves trusted repository originals locally and rejects foreign URLs',()=>{
 const original='/assets/NEWCARD/chulgu-aizen-v1.png';
 assert.equal(lootShopAsset('https://raw.githubusercontent.com/GoGosing1111/cnine-card/0cb5a008449fd8ff666228e91c67d08e45f2b2d4'+original),original);
 assert.equal(lootShopAsset('https://raw.githubusercontent.com/GoGosing1111/cnine-card/main'+original+'?v=1'),original);
 for(const value of [original,original.slice(1)])assert.equal(lootShopAsset(value),original);
 for(const value of ['',null,'javascript:alert(1)','data:image/png;base64,abc','https://example.com'+original,'//example.com'+original,'https://raw.githubusercontent.com/other/cnine-card/main'+original,'https://raw.githubusercontent.com/GoGosing1111/other/main'+original,'https://raw.githubusercontent.com/GoGosing1111/cnine-card/main/private.png'])assert.equal(lootShopAsset(value),'');
});
for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: CMS lists actual MYTHIC Mystic equipment and preserves explicit selection on save`,async t=>{
  const f=await lootFixture(t,{postgres});
  for(const [itemId,name,rarity,active,publicFlag] of [
   [901,'미스틱 레깅스','MYTHIC',1,1],[902,'미스틱 슈즈','MYTHIC',1,1],
   [903,'미스틱 슈트','MYTHIC',1,1],[904,'미스틱 듀얼디스크','MYTHIC',1,1],
   [905,'엠퍼러 슈트','MYTHIC',1,1],[906,'소버린 SKS','MYTHIC',1,1],
   [907,'미스틱 비공개','MYTHIC',1,0],[908,'미스틱 비활성','MYTHIC',0,1],
   [909,'미스틱 잘못된 등급','MYSTIC',1,1]
  ])await f.p('INSERT INTO character_equipment_items(id,code,name,rarity,is_active,is_public) VALUES(?,?,?,?,?,?)',itemId,'EQ_'+itemId,name,rarity,active,publicFlag).run();
  const catalog=await lootShopCatalog(f.env);
  assert.deepEqual(catalog.equipment.map(g=>Number(g.id)).sort((a,b)=>a-b),[37,900,901,902,903,904]);
  assert.deepEqual(catalog.equipment.filter(g=>lootEquipmentMatchesProduct(g,'MYSTIC_EQUIPMENT')).map(g=>Number(g.id)).sort((a,b)=>a-b),[900,901,902,903,904]);
  assert.deepEqual(catalog.equipment.filter(g=>lootEquipmentMatchesProduct(g,'F_BODY')).map(g=>Number(g.id)),[37]);
  const before=structuredClone(f.shopPolicy),draft=structuredClone(before);
  draft.products.find(p=>p.type==='MYSTIC_EQUIPMENT').equipmentId=904;
  await saveLootShopPolicy(f.env,f.user,draft);
  const saved=(await readLootShopPolicy(f.env)).policy;
  assert.deepEqual(saved,{...draft,revision:before.revision+1});
  assert.equal((await lootShopState(f.env,f.user)).products.find(p=>p.type==='MYSTIC_EQUIPMENT').canBuy,true);
  for(const equipmentId of [37,905,906,907,908,909]){
   const invalid=structuredClone(saved);invalid.products.find(p=>p.type==='MYSTIC_EQUIPMENT').equipmentId=equipmentId;
   await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,invalid),{code:'JOINT_LOOT_UNAVAILABLE'});
  }
  assert.deepEqual((await readLootShopPolicy(f.env)).policy,saved);
 });
 test(`${label}: Mystic purchase grants MYTHIC gear atomically and blocks unavailable gear`,async t=>{
  const f=await lootFixture(t,{postgres}),body={productId:'mystic_equipment',requestId:id()};
  f.fail('INSERT INTO user_equipment_instances');
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body));
  assert.equal(await pigCoinBalance(f.env,7),500);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM loot_shop_purchases_v1').first()).n),0);
  f.fail('');
  const result=await purchaseLootProduct(f.env,f.user,body);
  assert.equal(result.state.pigCoins,475);
  assert.equal((await purchaseLootProduct(f.env,f.user,body)).replayed,true);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=7 AND equipment_id=900').first()).n),1);
  await f.p('UPDATE character_equipment_items SET is_public=0 WHERE id=900').run();
  assert.equal((await lootShopState(f.env,f.user)).products.find(p=>p.id===body.productId).canBuy,false);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{...body,requestId:id()}));
  assert.equal(await pigCoinBalance(f.env,7),475);
 });
 test(`${label}: raising FUR cap from three to ten preserves purchases and atomically guards the last slot`,async t=>{
  const f=await lootFixture(t,{postgres}),productId='fur_choice',oldPack=id();
  f.shopPolicy.products.find(p=>p.id===productId).accountLimit=3;await f.setShop(f.shopPolicy);
  for(let i=0;i<3;i++)await purchaseLootProduct(f.env,f.user,{productId,requestId:i===0?oldPack:id()});
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId,requestId:id()}));
  const before=structuredClone(f.shopPolicy),next=structuredClone(before);next.products.find(p=>p.id===productId).accountLimit=10;
  await saveLootShopPolicy(f.env,f.user,next);
  const saved=(await readLootShopPolicy(f.env)).policy;assert.deepEqual(saved,{...next,revision:before.revision+1});
  const state=await lootShopState(f.env,f.user),product=state.products.find(p=>p.id===productId);
  assert.equal(product.bought,3);assert.equal(product.remaining,7);assert.equal(product.canBuy,true);assert.equal(state.ownedPacks.length,3);
  const markup=inspectionMarkup(product,state);assert.match(markup,/10회/);assert.match(markup,/7회/);assert.equal((markup.match(/<i class="used"><\/i>/g)||[]).length,3);
  for(let i=3;i<9;i++)await purchaseLootProduct(f.env,f.user,{productId,requestId:id()});
  const bodies=Array.from({length:2},()=>({productId,requestId:id()})),results=await Promise.allSettled(bodies.map(body=>purchaseLootProduct(f.env,f.user,body)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await purchaseLootProduct(f.env,f.user,bodies[results.findIndex(r=>r.status==='fulfilled')])).replayed,true);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId,requestId:id()}));
  const full=await lootShopState(f.env,f.user),sold=full.products.find(p=>p.id===productId);
  assert.equal(sold.bought,10);assert.equal(sold.remaining,0);assert.equal(sold.canBuy,false);assert.equal(full.ownedPacks.length,10);assert.equal(full.pigCoins,250);
  assert.equal((await lootShopState(f.env,{id:8})).products.find(p=>p.id===productId).remaining,10);
  const body={packId:oldPack,requestId:id(),cardId:'fur1'};assert.equal((await openLootPack(f.env,f.user,body)).reward.id,'fur1');assert.equal((await openLootPack(f.env,f.user,body)).replayed,true);
  assert.equal((await lootShopState(f.env,f.user)).products.find(p=>p.id===productId).bought,10);
 });
 test(`${label}: lifetime cap, replay and account isolation`,async t=>{const f=await lootFixture(t,{postgres}),requestId=id(),body={productId:'f_body',requestId};const a=await purchaseLootProduct(f.env,f.user,body);assert.equal(a.state.pigCoins,475);assert.equal((await purchaseLootProduct(f.env,f.user,body)).replayed,true);assert.equal(await pigCoinBalance(f.env,7),475);await assert.rejects(()=>purchaseLootProduct(f.env,{id:8},body),{code:'JOINT_REQUEST_CONFLICT'});await purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId:id()});await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId:id()}));assert.equal(await pigCoinBalance(f.env,7),450);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=7 AND equipment_id=37').first()).n),2);});
 test(`${label}: failed delivery rolls back debit, purchase count, and ledger`,async t=>{const f=await lootFixture(t,{postgres}),body={productId:'f_body',requestId:id()};f.fail('INSERT INTO user_equipment_instances');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body));assert.equal(await pigCoinBalance(f.env,7),500);assert.equal((await f.p('SELECT * FROM loot_shop_purchases_v1').all()).results.length,0);assert.equal((await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results.length,0);f.fail('');assert.equal((await purchaseLootProduct(f.env,f.user,body)).state.pigCoins,475);});
 test(`${label}: false entitlement predicate grants zero coins; each content pays only once`,async t=>{const f=await lootFixture(t,{postgres});for(const source of ['TERRITORY','CLAN','CORE_RAID']){await f.DB.batch(await pigCoinRewardStatements(f.env,{userId:7,source,referenceId:'round-1',guardSql:'1=0',rewardSql:()=>({sql:'?',bindings:[30]})}));assert.equal(await pigCoinBalance(f.env,7),500+['TERRITORY','CLAN','CORE_RAID'].indexOf(source)*30);for(let i=0;i<2;i++)await f.DB.batch(await pigCoinRewardStatements(f.env,{userId:7,source,referenceId:'round-1',guardSql:'1=1',rewardSql:()=>({sql:'?',bindings:[30]})}));}assert.equal(await pigCoinBalance(f.env,7),590);f.shopPolicy.rewardsEnabled=false;await f.setShop(f.shopPolicy);assert.deepEqual(await pigCoinRewardStatements(f.env,{userId:7,source:'TERRITORY',referenceId:'round-2',guardSql:'1=1'}),[]);});
 test(`${label}: choice pack selects eligible card, preserves pack on failure and never double opens`,async t=>{const f=await lootFixture(t,{postgres}),packId=id();await purchaseLootProduct(f.env,f.user,{productId:'superstar_choice',requestId:packId});await assert.rejects(()=>openLootPack(f.env,f.user,{packId,requestId:id(),cardId:'fur1'}));const body={packId,requestId:id(),cardId:'ss1'};f.fail('INSERT INTO user_cards');await assert.rejects(()=>openLootPack(f.env,f.user,body));assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,1);f.fail('');const r=await openLootPack(f.env,f.user,body);assert.equal(r.reward.id,'ss1');await openLootPack(f.env,f.user,body);assert.equal(Number((await f.p("SELECT quantity FROM user_cards WHERE user_id=7 AND card_id='ss1'").first()).quantity),1);await assert.rejects(()=>openLootPack(f.env,f.user,{...body,requestId:id()}));});
 test(`${label}: mercenary packs always grant one A/S card and freeze rolls for retry`,async t=>{const f=await lootFixture(t,{postgres}),packId=id();await purchaseLootProduct(f.env,f.user,{productId:'mercenary_pack',requestId:packId});const body={packId,requestId:id()};f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>openLootPack(f.env,f.user,body,{randomInt:()=>0}));f.fail('');const r=await openLootPack(f.env,f.user,body,{randomInt:()=>{throw Error('reroll');}});assert.equal(r.reward.rank,'A');assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,0);assert.equal((await openLootPack(f.env,f.user,body)).replayed,true);});
 test(`${label}: OFF, insufficient balance, inactive equipment, and stale CMS edits reject safely`,async t=>{const f=await lootFixture(t,{postgres});await f.p('UPDATE pig_coin_wallets_v1 SET balance=0 WHERE user_id=7').run();await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId:id()}));await f.p('UPDATE pig_coin_wallets_v1 SET balance=500 WHERE user_id=7').run();await f.p('UPDATE character_equipment_items SET is_active=0 WHERE id=37').run();await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId:id()}));f.shopPolicy.salesEnabled=false;await f.setShop(f.shopPolicy);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId:'fur_choice',requestId:id()}));await assert.rejects(()=>saveLootShopPolicy(f.env,{id:8,role:'USER'},f.shopPolicy),{code:'JOINT_PERMISSION'});assert.equal(await pigCoinBalance(f.env,7),500);});
}
test('route requires login, OWNER for CMS, same-origin JSON and exact fields',async t=>{const f=await lootFixture(t),req=(path,options={})=>new Request(`https://game.test/api/${path}`,options);let r=await handleLootShop({path:'loot-shop/state',request:req('loot-shop/state'),env:f.env,deps:f.deps});assert.equal(r.status,401);r=await handleLootShop({path:'loot-shop/purchase',request:req('loot-shop/purchase',{method:'POST',headers:{authorization:'Bearer local-account-7','content-type':'application/json'},body:'{}'}),env:f.env,deps:f.deps});assert.equal(r.status,403);});
