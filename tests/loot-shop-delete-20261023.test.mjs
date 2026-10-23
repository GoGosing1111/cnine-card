import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_SHOP_DEFAULTS,createLootProductDraft,validateLootShopPolicy,upgradeLootShopPolicy} from '../shared/loot-shop-policy-v1.mjs';
import {saveLootShopPolicy,saveLootSourcePolicy,readLootShopPolicy,lootShopState,lootPackOptions,purchaseLootProduct,openLootPack,pigCoinBalance,handleLootShop} from '../functions/_loot_shop.js';
const id=()=>crypto.randomUUID();
const remove=async(f,...productIds)=>{const {policy}=await readLootShopPolicy(f.env);policy.products=policy.products.filter(p=>!productIds.includes(p.id));if(!policy.products.some(p=>p.enabled))policy.salesEnabled=false;return saveLootShopPolicy(f.env,f.user,policy);};
const count=async(f,table)=>Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n);

test('deletion metadata preserves legacy snapshots, validates IDs and does not consume product slots',()=>{
 assert.deepEqual(validateLootShopPolicy(LOOT_SHOP_DEFAULTS),LOOT_SHOP_DEFAULTS);
 const p={...structuredClone(LOOT_SHOP_DEFAULTS),retiredProductIds:Array.from({length:501},(_,i)=>'retired_'+i),products:Array.from({length:100},(_,i)=>createLootProductDraft('ITEM_BUNDLE','active_'+i))};
 assert.equal(validateLootShopPolicy(p).products.length,100);
 for(const invalid of [null,'bad',['dup','dup'],['BAD'],[null],['x'],['x'.repeat(71)]])assert.throws(()=>validateLootShopPolicy({...p,retiredProductIds:invalid}),{code:'JOINT_LOOT_CONFIG'});
 assert.throws(()=>validateLootShopPolicy({...p,retiredProductIds:['active_0']}),{code:'JOINT_LOOT_CONFIG'});
 assert.throws(()=>validateLootShopPolicy({...p,products:[...p.products,createLootProductDraft('ITEM_BUNDLE','extra')]}),{code:'JOINT_LOOT_CONFIG'});
});

for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(label+': saved product deletion hides offers, preserves payment history and replays completed purchases once',async t=>{
  const f=await lootFixture(t,{postgres}),body={productId:'f_body',requestId:id()};
  const bought=await purchaseLootProduct(f.env,f.user,body),before=await f.p('SELECT * FROM loot_shop_purchases_v1 WHERE request_id=?',body.requestId).first();
  const saved=await remove(f,'f_body');assert.deepEqual(saved.retiredProductIds,['f_body']);
  assert.ok(!(await lootShopState(f.env,f.user)).products.some(p=>p.id==='f_body'));
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{...body,requestId:id()}),{code:'JOINT_LOOT_UNAVAILABLE'});
  const replay=await purchaseLootProduct(f.env,f.user,body);assert.equal(replay.replayed,true);assert.deepEqual(replay.product,bought.product);
  assert.deepEqual(await f.p('SELECT * FROM loot_shop_purchases_v1 WHERE request_id=?',body.requestId).first(),before);
  assert.equal(await pigCoinBalance(f.env,7),475);assert.equal(await count(f,'pig_coin_ledger_v1'),1);assert.equal(await count(f,'user_equipment_instances'),1);
  const audit=await f.p("SELECT after_data FROM admin_logs WHERE target_id='loot_shop_policy_v1' ORDER BY id DESC LIMIT 1").first();assert.deepEqual(JSON.parse(audit.after_data),saved);
 });
 test(label+': purchased selection and mercenary packs still open exactly once after listing deletion',async t=>{
  const f=await lootFixture(t,{postgres});
  const bought=[];for(const productId of ['superstar_choice','mercenary_ss_pack']){const body={productId,requestId:id()};await purchaseLootProduct(f.env,f.user,body);bought.push(body);}
  const snapshots=(await f.p('SELECT id,product_json FROM loot_shop_packs_v1 ORDER BY id').all()).results;
  await remove(f,...bought.map(b=>b.productId));assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,2);
  assert.deepEqual((await f.p('SELECT id,product_json FROM loot_shop_packs_v1 ORDER BY id').all()).results,snapshots);
  assert.equal((await lootPackOptions(f.env,f.user,bought[0].requestId)).cards[0].id,'ss1');
  for(const [i,purchase] of bought.entries()){const body={packId:purchase.requestId,requestId:id(),...(i===0?{cardId:'ss1'}:{})};const opened=await openLootPack(f.env,f.user,body,{randomInt:()=>0});const replay=await openLootPack(f.env,f.user,body,{randomInt:()=>{throw Error('REROLL');}});assert.equal(replay.replayed,true);assert.deepEqual(replay.reward,opened.reward);}
  assert.equal((await lootShopState(f.env,f.user)).ownedPacks.length,0);assert.equal(await pigCoinBalance(f.env,7),450);
  assert.equal(await count(f,'loot_shop_purchases_v1'),2);assert.equal(await count(f,'pig_coin_ledger_v1'),2);assert.equal(Number((await f.p("SELECT quantity FROM user_cards WHERE user_id=7 AND card_id='ss1'").first()).quantity),1);
 });
 test(label+': unpaid prepared purchases are cancelled after deletion without debit or reward',async t=>{
  const f=await lootFixture(t,{postgres}),body={productId:'f_body',requestId:id()};f.fail('INSERT INTO user_equipment_instances');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body));f.fail('');
  await remove(f,'f_body');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body),{code:'JOINT_LOOT_UNAVAILABLE',terminal:true});
  assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body),{code:'JOINT_OPERATION_SUPERSEDED'});
  assert.equal(await pigCoinBalance(f.env,7),500);for(const table of ['pig_coin_ledger_v1','loot_shop_purchases_v1','user_equipment_instances'])assert.equal(await count(f,table),0);
 });
 test(label+': deletion committed before a prepared payment batch causes atomic rollback',async t=>{
  const f=await lootFixture(t,{postgres}),body={productId:'f_body',requestId:id()},batch=f.DB.batch.bind(f.DB);let intercept=true;
  f.DB.batch=async list=>{if(intercept){intercept=false;await remove(f,'f_body');}return batch(list);};
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body));assert.equal(intercept,false);
  assert.equal(await pigCoinBalance(f.env,7),500);for(const table of ['pig_coin_ledger_v1','loot_shop_purchases_v1','user_equipment_instances'])assert.equal(await count(f,table),0);
  assert.ok(!(await readLootShopPolicy(f.env)).policy.products.some(p=>p.id==='f_body'));
 });
 test(label+': server owns retired IDs; omitted, cleared or forged metadata cannot reactivate or reserve IDs',async t=>{
  const f=await lootFixture(t,{postgres}),old=f.shopPolicy.products.find(p=>p.id==='f_body');let saved=await remove(f,'f_body');
  for(const mutation of ['omit','clear','forge']){const next=structuredClone(saved);if(mutation==='omit')delete next.retiredProductIds;else next.retiredProductIds=mutation==='clear'?[]:['forged_id'];saved=await saveLootShopPolicy(f.env,f.user,next);assert.deepEqual(saved.retiredProductIds,['f_body']);}
  for(const metadata of [undefined,[],['forged_id']]){const next={...structuredClone(saved),products:[...saved.products,old]};if(metadata===undefined)delete next.retiredProductIds;else next.retiredProductIds=metadata;await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,next),{code:'JOINT_LOOT_CONFIG'});}
  const next=structuredClone(saved);next.products.push(createLootProductDraft('ITEM_BUNDLE','forged_id'));saved=await saveLootShopPolicy(f.env,f.user,next);assert.ok(saved.products.some(p=>p.id==='forged_id'));assert.deepEqual(saved.retiredProductIds,['f_body']);
  const source=saved.sources.find(s=>s.code==='CLAN');await saveLootSourcePolicy(f.env,f.user,{revision:saved.revision,code:'CLAN',source,rewardsEnabled:saved.rewardsEnabled});assert.deepEqual((await readLootShopPolicy(f.env)).policy.retiredProductIds,['f_body']);
 });
 test(label+': deleted legacy SS packs never reappear, while pre-deletion installs still receive their draft',async t=>{
  const f=await lootFixture(t,{postgres}),old=structuredClone(f.shopPolicy);old.products=old.products.filter(p=>p.id!=='mercenary_ss_pack');assert.ok(upgradeLootShopPolicy(old).products.some(p=>p.id==='mercenary_ss_pack'));
  const saved=await remove(f,'mercenary_ss_pack');assert.deepEqual(saved.retiredProductIds,['mercenary_ss_pack']);
  for(let n=0;n<3;n++){const current=(await readLootShopPolicy(f.env)).policy;assert.ok(!current.products.some(p=>p.type==='MERCENARY_SS_PACK'));assert.deepEqual(upgradeLootShopPolicy(current),current);}
  const source=saved.sources.find(s=>s.code==='TERRITORY');await saveLootSourcePolicy(f.env,f.user,{revision:saved.revision,code:'TERRITORY',source,rewardsEnabled:saved.rewardsEnabled});assert.ok(!(await readLootShopPolicy(f.env)).policy.products.some(p=>p.id==='mercenary_ss_pack'));
 });
 test(label+': deletion requires OWNER, rejects stale settings and preserves product kinds',async t=>{
  const f=await lootFixture(t,{postgres}),next=structuredClone(f.shopPolicy);next.products=next.products.filter(p=>p.id!=='f_body');
  for(const role of ['USER','ADMIN'])await assert.rejects(()=>saveLootShopPolicy(f.env,{id:8,role},next),{code:'JOINT_PERMISSION'});
  const saved=await saveLootShopPolicy(f.env,f.user,next);await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,next),{code:'JOINT_POLICY_CONFLICT'});
  const changed=structuredClone(saved);Object.assign(changed.products.find(p=>p.id==='fur_choice'),{enabled:false,type:'CARD_CHOICE'});await assert.rejects(()=>saveLootShopPolicy(f.env,f.user,changed),{code:'JOINT_LOOT_UNAVAILABLE'});assert.deepEqual((await readLootShopPolicy(f.env)).policy,saved);
 });
 test(label+': PATCH can delete every listing with sales OFF without changing rewards or wallets',async t=>{
  const f=await lootFixture(t,{postgres}),policy={...structuredClone(f.shopPolicy),products:[],salesEnabled:false};
  const response=await handleLootShop({path:'admin/loot-shop',env:f.env,deps:f.deps,request:new Request('https://game.test/api/admin/loot-shop',{method:'PATCH',headers:{origin:'https://game.test',authorization:'Bearer local-account-7','content-type':'application/json'},body:JSON.stringify({policy})})});
  assert.equal(response.status,200);const saved=(await response.json()).policy;assert.equal(saved.products.length,0);assert.equal(saved.salesEnabled,false);assert.deepEqual(saved.retiredProductIds,f.shopPolicy.products.map(p=>p.id));assert.deepEqual(saved.sources,f.shopPolicy.sources);assert.equal(saved.rewardsEnabled,true);
  assert.equal((await lootShopState(f.env,f.user)).products.length,0);assert.equal(await pigCoinBalance(f.env,7),500);assert.equal(await count(f,'pig_coin_ledger_v1'),0);
 });
}
