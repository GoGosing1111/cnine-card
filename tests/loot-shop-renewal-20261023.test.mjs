import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_SHOP_DEFAULTS,createLootProductDraft,validateLootShopPolicy,lootPurchaseWindow,lootSaleState} from '../shared/loot-shop-policy-v1.mjs';
import {lootEditorISO,lootEditorTime} from '../admin/loot-shop-admin-v1.mjs';
import {filterLootProducts,inspectionMarkup,lootRewardMarkup} from '../js/loot-shop-presentation-v2.mjs';
import {saveLootShopPolicy,readLootShopPolicy,lootShopState,lootShopCatalog,purchaseLootProduct,openLootPack,pigCoinBalance} from '../functions/_loot_shop.js';
const id=()=>crypto.randomUUID();
const draft=type=>({...createLootProductDraft(type,type.toLowerCase()),enabled:true,price:25,accountLimit:2});
const put=async(f,p)=>{f.shopPolicy.products.push(p);await f.setShop(validateLootShopPolicy(f.shopPolicy));return p;};
const purchase=(f,p,requestId=id())=>purchaseLootProduct(f.env,f.user,{productId:p.id,requestId});
test('legacy snapshots are byte-compatible and new drafts never create automatic offers',()=>{
 assert.deepEqual(validateLootShopPolicy(LOOT_SHOP_DEFAULTS),LOOT_SHOP_DEFAULTS);
 assert.equal(LOOT_SHOP_DEFAULTS.products.length,6);
 for(const type of ['ITEM_BUNDLE','EQUIPMENT_DIRECT','CARD_CHOICE','MERCENARY_CUSTOM_PACK']){const p=createLootProductDraft(type,'draft');assert.equal(p.enabled,false);assert.equal(p.price,null);assert.equal(p.accountLimit,null);}
});
test('new merchandising settings reject malformed images, periods, items and weights',()=>{
 const policy=()=>({...structuredClone(LOOT_SHOP_DEFAULTS),products:[createLootProductDraft('ITEM_BUNDLE','bundle')]});
 for(const patch of [{image:'https://foreign.test/file.png'},{image:'/assets/../secret.png'},{limitPeriod:'HOURLY'},{category:'ALL'},{startsAt:'tomorrow'},{startsAt:'2026-02-30T00:00:00Z'},{startsAt:'2026-10-24T00:00:00Z',endsAt:'2026-10-23T00:00:00Z'},{items:[{code:'A',quantity:1},{code:'A',quantity:2}]},{items:[{code:'A',quantity:0}]},{items:[{code:'X'.repeat(81),quantity:1}]},{rankWeights:{C:-1}},{type:'toString'}]){const p=policy();Object.assign(p.products[0],patch);assert.throws(()=>validateLootShopPolicy(p));}
 const p=policy();Object.assign(p.products[0],{image:'/assets/items/pig-coin-v1.png',description:'소개',badge:'추천',limitPeriod:'WEEKLY',startsAt:'2026-10-23T00:00:00Z',endsAt:null,items:[{code:'MATERIAL',quantity:1000000}]});assert.equal(validateLootShopPolicy(p).products[0].startsAt,'2026-10-23T00:00:00.000Z');
});
test('KST daily, Monday weekly, month rollover and editor conversion agree',()=>{
 const at=Date.parse('2026-10-31T15:01:00Z');
 assert.deepEqual(lootPurchaseWindow('DAILY',at),{startsAt:'2026-10-31T15:00:00.000Z',resetsAt:'2026-11-01T15:00:00.000Z'});
 assert.deepEqual(lootPurchaseWindow('WEEKLY',at),{startsAt:'2026-10-25T15:00:00.000Z',resetsAt:'2026-11-01T15:00:00.000Z'});
 assert.deepEqual(lootPurchaseWindow('MONTHLY',at),{startsAt:'2026-10-31T15:00:00.000Z',resetsAt:'2026-11-30T15:00:00.000Z'});
 assert.equal(lootEditorISO('2026-11-01T00:01'),'2026-10-31T15:01:00.000Z');assert.equal(lootEditorTime(lootEditorISO('2026-11-01T00:01')),'2026-11-01T00:01');
 assert.equal(lootSaleState({enabled:true,startsAt:'2026-10-31T15:01:00Z'},at),'ACTIVE');assert.equal(lootSaleState({enabled:true,endsAt:'2026-10-31T15:01:00Z'},at),'ENDED');
});
test('store search, category, available filter, recommendation and escaped bundle contents',()=>{
 const products=[{...draft('ITEM_BUNDLE'),name:'재료 묶음',options:[{name:'별가루'}],sortOrder:0,canBuy:true},{...draft('EQUIPMENT_DIRECT'),name:'장비',featured:true,price:50,sortOrder:1,canBuy:false}];
 assert.equal(filterLootProducts(products)[0].name,'장비');assert.equal(filterLootProducts(products,{search:'별가루'})[0].name,'재료 묶음');assert.equal(filterLootProducts(products,{category:'EQUIPMENT'}).length,1);assert.equal(filterLootProducts(products,{available:true}).length,1);
 assert.match(lootRewardMarkup({kind:'BUNDLE',name:'<script>',items:[{name:'<img>',quantity:5}]}),/&lt;script&gt;/);
 assert.match(inspectionMarkup({...products[0],remaining:1,limitPeriod:'DAILY',saleState:'SCHEDULED',startsAt:'2099-01-01T00:00:00Z',canBuy:false},{salesEnabled:true,pigCoins:100}),/disabled>판매 시작 전/);
});
for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: bundle grants all quantities atomically, records unseen/logs and replays once`,async t=>{
  const f=await lootFixture(t,{postgres}),p=await put(f,{...draft('ITEM_BUNDLE'),items:[{code:'MASTER_STAR',quantity:3},{code:'VEHICLE_PART_TIRE',quantity:7}]}),requestId=id();
  f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>purchase(f,p,requestId));assert.equal(await pigCoinBalance(f.env,7),500);assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first()).quantity),100);
  f.fail('');const r=await purchase(f,p,requestId);assert.equal(r.reward.kind,'BUNDLE');assert.equal(r.reward.items.length,2);assert.equal(r.state.pigCoins,475);assert.equal(r.state.ownedPacks.length,0);assert.equal((await purchase(f,p,requestId)).replayed,true);
  const star=await f.p("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first();assert.equal(Number(star.quantity),103);assert.equal(Number(star.unseen_quantity),3);assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='VEHICLE_PART_TIRE'").first()).quantity),7);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs WHERE reference_id=?',requestId).first()).n),2);
 });
 test(`${label}: unavailable bundle and overflow cannot charge or partially grant`,async t=>{
  const f=await lootFixture(t,{postgres}),p=await put(f,{...draft('ITEM_BUNDLE'),items:[{code:'MASTER_STAR',quantity:2},{code:'VEHICLE_PART_TIRE',quantity:2}]});
  await f.p("UPDATE inventory_items SET is_active=0 WHERE code='VEHICLE_PART_TIRE'").run();await assert.rejects(()=>purchase(f,p));await f.p("UPDATE inventory_items SET is_active=1 WHERE code='VEHICLE_PART_TIRE'").run();
  await f.p("UPDATE cnine_user_inventory SET quantity=? WHERE user_id=7 AND item_code='MASTER_STAR'",Number.MAX_SAFE_INTEGER).run();await assert.rejects(()=>purchase(f,p));assert.equal(await pigCoinBalance(f.env,7),500);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM loot_shop_purchases_v1').first()).n),0);
 });
 test(`${label}: custom gear catalog and exact direct delivery respect public/active guards`,async t=>{
  const f=await lootFixture(t,{postgres});await f.p("INSERT INTO character_equipment_items(id,code,name,rarity) VALUES(909,'DIRECT','지정 장비','RARE')").run();const p=await put(f,{...draft('EQUIPMENT_DIRECT'),equipmentId:909});
  const catalog=await lootShopCatalog(f.env);assert.ok(catalog.equipment.some(g=>Number(g.id)===909));assert.ok(catalog.items.some(i=>i.code==='MASTER_STAR'));assert.ok(catalog.mercenaries.every(c=>Number(c.code.slice(2))<900));
  const r=await purchase(f,p);assert.equal(Number(r.reward.id),909);assert.equal(r.reward.kind,'EQUIPMENT');await f.p('UPDATE character_equipment_items SET is_public=0 WHERE id=909').run();await assert.rejects(()=>purchase(f,p));assert.equal(await pigCoinBalance(f.env,7),475);
 });
 test(`${label}: general card pack freezes candidates and preserves last-card stock on retry`,async t=>{
  const f=await lootFixture(t,{postgres}),p=await put(f,{...draft('CARD_CHOICE'),cardIds:['ss1','fur1']}),packId=id();await purchase(f,p,packId);
  p.cardIds=['ss1'];await f.setShop(f.shopPolicy);await f.p("UPDATE cards SET limited_total=1 WHERE id='fur1'").run();const body={packId,requestId:id(),cardId:'fur1'};f.fail('INSERT INTO user_cards');await assert.rejects(()=>openLootPack(f.env,f.user,body));f.fail('');const r=await openLootPack(f.env,f.user,body);assert.equal(r.reward.grade,'FUR');assert.equal((await openLootPack(f.env,f.user,body)).replayed,true);assert.equal(Number((await f.p("SELECT issued_count FROM cards WHERE id='fur1'").first()).issued_count),1);
 });
 test(`${label}: custom rank pack allows normal SSS, freezes retries and excludes limited candidates`,async t=>{
  const f=await lootFixture(t,{postgres}),merc=f.document.mercenaries.find(c=>c.rank==='SSS');assert.ok(merc);const p=await put(f,{...draft('MERCENARY_CUSTOM_PACK'),rankWeights:{C:0,B:0,A:0,S:0,SS:0,SSS:1},mercenaryCodes:[merc.code]}),packId=id();await purchase(f,p,packId);
  const body={packId,requestId:id()};f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>openLootPack(f.env,f.user,body,{randomInt:()=>0}));f.fail('');const r=await openLootPack(f.env,f.user,body,{randomInt:()=>{throw Error('reroll');}});assert.equal(r.reward.rank,'SSS');assert.equal(r.reward.code,merc.code);assert.equal((await openLootPack(f.env,f.user,body)).replayed,true);
  f.draw.cardRules.cardWeights[merc.code]=0;await f.setDraw(f.draw);await assert.rejects(()=>purchase(f,p));
  p.mercenaryCodes=['V-960'];await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,f.shopPolicy));
 });
 test(`${label}: period caps include historical purchases, isolate accounts and guard final slot`,async t=>{
  const f=await lootFixture(t,{postgres}),p=f.shopPolicy.products.find(p=>p.id==='f_body');p.limitPeriod='DAILY';p.accountLimit=2;await f.setShop(f.shopPolicy);const now=Date.now(),w=lootPurchaseWindow('DAILY',now);
  await f.p('INSERT INTO loot_shop_purchases_v1(request_id,user_id,product_id,price,product_json,created_at) VALUES(?,7,?,25,?,?),(?,7,?,25,?,?)','history-today',p.id,'{}',w.startsAt,'history-yesterday',p.id,'{}',new Date(Date.parse(w.startsAt)-1).toISOString()).run();
  let state=await lootShopState(f.env,f.user),product=state.products.find(x=>x.id===p.id);assert.equal(product.bought,1);assert.equal(product.lifetimeBought,2);assert.equal(product.remaining,1);
  const results=await Promise.allSettled([purchase(f,p),purchase(f,p)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await pigCoinBalance(f.env,7),475);assert.equal((await lootShopState(f.env,{id:8})).products.find(x=>x.id===p.id).bought,0);
  state=await lootShopState(f.env,f.user,{at:Date.parse(w.resetsAt)});assert.equal(state.products.find(x=>x.id===p.id).bought,0);assert.equal(state.products.find(x=>x.id===p.id).lifetimeBought,3);
  for(const period of ['WEEKLY','MONTHLY']){p.limitPeriod=period;await f.setShop(f.shopPolicy);const expected=(await f.p('SELECT COUNT(*) n FROM loot_shop_purchases_v1 WHERE user_id=7 AND product_id=? AND created_at>=? AND created_at<?',p.id,...Object.values(lootPurchaseWindow(period,now))).first()).n;assert.equal((await lootShopState(f.env,f.user)).products.find(x=>x.id===p.id).bought,Number(expected));}
 });
 test(`${label}: hidden, scheduled and expired offers cannot charge; owner revision and identities stay guarded`,async t=>{
  const f=await lootFixture(t,{postgres}),p=f.shopPolicy.products.find(x=>x.id==='f_body');p.visible=false;await f.setShop(f.shopPolicy);assert.ok(!(await lootShopState(f.env,f.user)).products.some(x=>x.id===p.id));await assert.rejects(()=>purchase(f,p));p.visible=true;p.startsAt='2099-01-01T00:00:00.000Z';await f.setShop(f.shopPolicy);await assert.rejects(()=>purchase(f,p));p.startsAt=null;p.endsAt='2020-01-01T00:00:00.000Z';await f.setShop(f.shopPolicy);await assert.rejects(()=>purchase(f,p));assert.equal(await pigCoinBalance(f.env,7),500);
  p.endsAt=null;const saved=await saveLootShopPolicy(f.env,f.user,f.shopPolicy);await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,f.shopPolicy),{code:'JOINT_POLICY_CONFLICT'});const changed=structuredClone(saved);changed.products.find(x=>x.id===p.id).type='EQUIPMENT_DIRECT';await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,changed));assert.deepEqual((await readLootShopPolicy(f.env)).policy,saved);
 });
}
