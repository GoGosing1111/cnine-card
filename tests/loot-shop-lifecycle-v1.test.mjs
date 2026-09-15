import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';
import {lootShopState,saveLootShopPolicy,saveLootSourcePolicy,purchaseLootProduct,openLootPack,pigCoinBalance,readLootShopPolicy,LOOT_SHOP_KEY} from '../functions/_loot_shop.js';
const id=()=>crypto.randomUUID();
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: content CMS shares one policy, preserves products and other source rates, rejects stale/invalid/non-OWNER saves`,async t=>{
  const f=await lootFixture(t,{postgres});await f.setShop(structuredClone(LOOT_SHOP_DEFAULTS));let state=await readLootShopPolicy(f.env);
  for(const [i,code] of ['TERRITORY','CLAN','CORE_RAID'].entries()){
   const body={code,revision:state.policy.revision,enabled:true,amount:11+i,rewardsEnabled:true};const saved=await saveLootSourcePolicy(f.env,f.user,body);assert.equal(saved.sources.find(s=>s.code===code).amount,11+i);
   await assert.rejects(()=>saveLootSourcePolicy(f.env,f.user,body),{code:'JOINT_POLICY_CONFLICT'});state=await readLootShopPolicy(f.env);assert.deepEqual(state.policy.products,LOOT_SHOP_DEFAULTS.products);assert.equal(state.policy.salesEnabled,false);
  }
  assert.deepEqual(state.policy.sources.map(s=>s.amount),[11,12,13]);
  const body={code:'CLAN',revision:state.policy.revision,enabled:true,amount:null,rewardsEnabled:true};await assert.rejects(()=>saveLootSourcePolicy(f.env,f.user,body),{code:'JOINT_LOOT_CONFIG'});await assert.rejects(()=>saveLootSourcePolicy(f.env,{id:8,role:'ADMIN'},body),{code:'JOINT_PERMISSION'});
  await saveLootSourcePolicy(f.env,f.user,{...body,enabled:false,rewardsEnabled:false});state=await readLootShopPolicy(f.env);assert.equal(state.policy.rewardsEnabled,false);assert.equal(state.policy.sources[0].enabled,true);assert.equal(state.policy.sources[2].amount,13);
 });
 test(`${label}: first deployment reads OFF without storage; explicit CMS save prepares storage`,async t=>{
  const f=await lootFixture(t,{postgres});await f.p('DELETE FROM app_meta WHERE key=?',LOOT_SHOP_KEY).run();
  const ddl=['DROP TABLE pig_coin_wallets_v1','DROP TABLE pig_coin_ledger_v1','DROP TABLE loot_shop_purchases_v1','DROP TABLE loot_shop_packs_v1'];if(f.DB.execSchema)await f.DB.execSchema(ddl);else for(const s of ddl)await f.p(s).run();
  const before=await lootShopState(f.env,f.user);assert.equal(before.salesEnabled,false);assert.equal(before.rewardsEnabled,false);assert.equal(before.pigCoins,0);assert.ok(before.products.every(p=>!p.canBuy&&p.price===null));
  const saved=await saveLootShopPolicy(f.env,{...f.user,role:'OWNER'},structuredClone(LOOT_SHOP_DEFAULTS));assert.equal(saved.revision,1);assert.equal((await lootShopState(f.env,f.user)).pigCoins,0);assert.equal((await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results.length,0);
 });
 test(`${label}: simultaneous different purchase requests cannot exceed lifetime cap`,async t=>{
  const f=await lootFixture(t,{postgres});f.shopPolicy.products.find(p=>p.id==='f_body').accountLimit=1;await f.setShop(f.shopPolicy);
  const results=await Promise.allSettled(Array.from({length:3},()=>purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId:id()})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await pigCoinBalance(f.env,7),475);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=7 AND equipment_id=37').first()).n),1);
 });
 test(`${label}: last limited card cannot be granted to two pack owners`,async t=>{
  const f=await lootFixture(t,{postgres});await f.p("UPDATE cards SET limited_total=1 WHERE id='ss1'").run();const first=id(),second=id();
  await purchaseLootProduct(f.env,f.user,{productId:'superstar_choice',requestId:first});await purchaseLootProduct(f.env,{id:8},{productId:'superstar_choice',requestId:second});
  const results=await Promise.allSettled([openLootPack(f.env,f.user,{packId:first,requestId:id(),cardId:'ss1'}),openLootPack(f.env,{id:8},{packId:second,requestId:id(),cardId:'ss1'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(Number((await f.p("SELECT SUM(quantity) n FROM user_cards WHERE card_id='ss1'").first()).n),1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM loot_shop_packs_v1 WHERE opened_at IS NULL').first()).n),1);assert.equal(Number((await f.p('SELECT is_new FROM draw_logs').first()).is_new),1);
 });
 test(`${label}: changed product cancels an unpaid prepared purchase; CMS edits preserve purchase counts`,async t=>{
  const f=await lootFixture(t,{postgres}),requestId=id();f.fail('INSERT INTO user_equipment_instances');await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId}));f.fail('');
  f.shopPolicy.products.find(p=>p.id==='f_body').price=30;await f.setShop(f.shopPolicy);await assert.rejects(()=>purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId}),{terminal:true});assert.equal(await pigCoinBalance(f.env,7),500);
  await purchaseLootProduct(f.env,f.user,{productId:'f_body',requestId:id()});const next=structuredClone(f.shopPolicy);next.products.find(p=>p.id==='f_body').name='새 이름';const saved=await saveLootShopPolicy(f.env,{...f.user,role:'OWNER'},next);assert.equal(saved.revision,next.revision+1);assert.equal((await lootShopState(f.env,f.user)).products.find(p=>p.id==='f_body').bought,1);await assert.rejects(()=>saveLootShopPolicy(f.env,{...f.user,role:'OWNER'},next),{code:'JOINT_POLICY_CONFLICT'});
 });
}
