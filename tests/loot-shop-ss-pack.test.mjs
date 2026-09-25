import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_SHOP_DEFAULTS,validateLootShopPolicy,upgradeLootShopPolicy} from '../shared/loot-shop-policy-v1.mjs';
import {readLootShopPolicy,saveLootShopPolicy,lootShopCatalog,lootShopState,lootPackOptions,purchaseLootProduct,openLootPack,pigCoinBalance,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
import {inspectionMarkup,lootProductOptionsMarkup} from '../js/loot-shop-v1.mjs';
const type='MERCENARY_SS_PACK',productId='mercenary_ss_pack',id=()=>crypto.randomUUID();
const ss=policy=>policy.products.find(p=>p.type===type);

test('SS purchase cap is unset by default and accepts an explicit owner-defined integer beyond three',()=>{
 const draft=structuredClone(LOOT_SHOP_DEFAULTS);assert.equal(ss(draft).accountLimit,null);assert.equal(ss(draft).enabled,false);assert.equal(ss(draft).price,null);assert.deepEqual(ss(draft).mercenaryCodes,[]);
 for(const limit of [1,4,37,10000,2147483647]){ss(draft).accountLimit=limit;assert.equal(ss(validateLootShopPolicy(draft)).accountLimit,limit);}
 for(const value of [0,-1,1.5,'4',2147483648,NaN]){ss(draft).accountLimit=value;assert.throws(()=>validateLootShopPolicy(draft));}
 ss(draft).enabled=true;ss(draft).accountLimit=null;ss(draft).price=25;ss(draft).mercenaryCodes=['V-003'];assert.throws(()=>validateLootShopPolicy(draft),/가격과 구매 횟수/);
 ss(draft).accountLimit=7;ss(draft).price=null;assert.throws(()=>validateLootShopPolicy(draft),/가격과 구매 횟수/);
 ss(draft).price=25;ss(draft).mercenaryCodes=[];assert.throws(()=>validateLootShopPolicy(draft),/SS등급 용병 후보/);
});

test('existing SS product configuration is never reset or duplicated by policy upgrade',()=>{
 const draft=structuredClone(LOOT_SHOP_DEFAULTS);Object.assign(ss(draft),{id:'my_ss_pack',enabled:true,accountLimit:37,price:123,mercenaryCodes:['V-003']});
 assert.deepEqual(upgradeLootShopPolicy(draft),draft);
});

test('SS shop discloses its guaranteed grade and renders large manual caps without unbounded dot allocation',()=>{
 const product={...ss(LOOT_SHOP_DEFAULTS),enabled:true,accountLimit:2147483647,remaining:2147483646,bought:1,price:25,canBuy:true,options:[{name:'검수 SS',rank:'SS',image:'assets/items/pig-coin-v1.png'}]};
 const html=inspectionMarkup(product,{salesEnabled:true,pigCoins:500});assert.match(html,/SS등급 용병 1장 확정/);assert.match(html,/2,147,483,647회/);assert.doesNotMatch(html,/loot-limit-dots|A·S등급/);assert.ok(html.length<10000);
 const options=lootProductOptionsMarkup(product);assert.match(options,/SS등급 100%/);assert.match(options,/균등 추첨/);assert.doesNotMatch(options,/NaN|A등급|S등급 50/);
});

for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: an existing saved shop gains only an inactive SS draft and reads do not rewrite live settings`,async t=>{
  const f=await lootFixture(t,{postgres}),old=structuredClone(f.shopPolicy);old.products=old.products.filter(p=>p.type!==type);old.revision=17;await f.setShop(old);
  const {policy,raw}=await readLootShopPolicy(f.env);assert.deepEqual(JSON.parse(raw),old);assert.deepEqual(policy.products.filter(p=>p.type!==type),old.products);assert.equal(policy.revision,17);assert.equal(ss(policy).accountLimit,null);assert.equal(ss(policy).enabled,false);
  const state=await lootShopState(f.env,f.user);assert.equal(ss(state).canBuy,false);assert.equal(ss(state).remaining,null);assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',LOOT_SHOP_KEY).first()).value),old);
  Object.assign(ss(policy),{enabled:true,price:25,accountLimit:7,mercenaryCodes:f.document.mercenaries.slice(2,4).map(c=>c.code)});
  const saved=await saveLootShopPolicy(f.env,f.user,policy);assert.equal(saved.revision,18);assert.equal(ss((await readLootShopPolicy(f.env)).policy).accountLimit,7);assert.deepEqual(saved.products.filter(p=>p.type!==type),old.products);
 });
 test(`${label}: CMS offers SS candidates, rejects non-SS selections and leaves the pool explicitly selected`,async t=>{
  const f=await lootFixture(t,{postgres});f.document.mercenaries[4].rank='SSS';await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
  const catalog=await lootShopCatalog(f.env);assert.ok(catalog.mercenaries.some(c=>c.rank==='SS'));assert.ok(catalog.mercenaries.every(c=>['A','S','SS'].includes(c.rank)));
  for(const code of [f.document.mercenaries[0].code,f.document.mercenaries[4].code,'V-999']){
   const bad=structuredClone(f.shopPolicy);ss(bad).mercenaryCodes.push(code);await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,bad),/모두 SS등급/);
  }
  const draft=structuredClone(f.shopPolicy);ss(draft).mercenaryCodes=[f.document.mercenaries[2].code];ss(draft).accountLimit=12;
  await assert.rejects(()=>saveLootShopPolicy(f.env,{id:8,role:'ADMIN'},draft),{code:'JOINT_PERMISSION'});await saveLootShopPolicy(f.env,f.user,draft);
  assert.deepEqual(ss((await lootShopState(f.env,f.user))).options.map(c=>c.code),ss(draft).mercenaryCodes);
 });
 test(`${label}: manual lifetime cap guards concurrent last purchases, survives edits and replays without a second debit`,async t=>{
  const f=await lootFixture(t,{postgres});ss(f.shopPolicy).accountLimit=4;await f.setShop(f.shopPolicy);
  for(let i=0;i<3;i++)await purchaseLootProduct(f.env,f.user,{productId,requestId:id()});
  const bodies=[{productId,requestId:id()},{productId,requestId:id()}],results=await Promise.allSettled(bodies.map(body=>purchaseLootProduct(f.env,f.user,body)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await purchaseLootProduct(f.env,f.user,bodies[results.findIndex(r=>r.status==='fulfilled')])).replayed,true);
  let state=await lootShopState(f.env,f.user);assert.equal(ss(state).bought,4);assert.equal(ss(state).remaining,0);assert.equal(state.pigCoins,400);assert.equal(state.ownedPacks.length,4);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId,requestId:id()}));
  let draft=(await readLootShopPolicy(f.env)).policy;ss(draft).accountLimit=2;await saveLootShopPolicy(f.env,f.user,draft);state=await lootShopState(f.env,f.user);assert.equal(ss(state).bought,4);assert.equal(ss(state).remaining,0);assert.equal(ss(state).canBuy,false);
  draft=(await readLootShopPolicy(f.env)).policy;ss(draft).accountLimit=6;await saveLootShopPolicy(f.env,f.user,draft);assert.equal(ss(await lootShopState(f.env,f.user)).remaining,2);assert.equal(ss(await lootShopState(f.env,{id:8})).remaining,6);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM pig_coin_ledger_v1 WHERE source='SHOP'").first()).n),4);
 });
 test(`${label}: SS pack delivery and opening roll back atomically and reuse frozen awards on retry`,async t=>{
  const f=await lootFixture(t,{postgres}),packId=id(),purchase={productId,requestId:packId};f.fail('INSERT INTO loot_shop_packs_v1');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,purchase));assert.equal(await pigCoinBalance(f.env,7),500);
  for(const table of ['loot_shop_purchases_v1','loot_shop_packs_v1','pig_coin_ledger_v1'])assert.equal(Number((await f.p(`SELECT COUNT(*) n FROM ${table}`).first()).n),0);
  f.fail('');await purchaseLootProduct(f.env,f.user,purchase);assert.equal((await purchaseLootProduct(f.env,f.user,purchase)).replayed,true);assert.equal(await pigCoinBalance(f.env,7),475);
  const options=await lootPackOptions(f.env,f.user,packId);assert.equal(options.mercenaries.length,2);assert.ok(options.mercenaries.every(c=>c.rank==='SS'));
  const body={packId,requestId:id()};await assert.rejects(()=>openLootPack(f.env,f.user,{...body,requestId:id(),cardId:'ss1'}));
  f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>openLootPack(f.env,f.user,body,{randomInt:max=>{assert.equal(max,2);return 1;}}));assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_mercenary_cards_v1').first()).n),0);
  f.fail('');const opened=await openLootPack(f.env,f.user,body,{randomInt:()=>{throw Error('must not reroll');}});assert.equal(opened.reward.rank,'SS');assert.equal(opened.reward.code,f.document.mercenaries[3].code);assert.equal((await openLootPack(f.env,f.user,body)).replayed,true);
  await assert.rejects(()=>openLootPack(f.env,f.user,{packId,requestId:id()}));assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',opened.reward.code).first()).total_copies),1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),1);
 });
 test(`${label}: an SS rank change blocks an unopened pack and further payment without granting another grade`,async t=>{
  const f=await lootFixture(t,{postgres}),packId=id();await purchaseLootProduct(f.env,f.user,{productId,requestId:packId});f.document.mercenaries[2].rank='SSS';await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
  assert.equal(ss(await lootShopState(f.env,f.user)).canBuy,false);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId,requestId:id()}));await assert.rejects(()=>openLootPack(f.env,f.user,{packId,requestId:id()}));assert.equal(await pigCoinBalance(f.env,7),475);assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,1);
 });
}
