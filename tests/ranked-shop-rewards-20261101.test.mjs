import test from 'node:test';import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';
import {lootShopState,purchaseLootProduct,openLootPack,handleRankedShop,LOOT_SHOP_KEY,saveLootShopPolicy} from '../functions/_ranked_shop.js';
import {lootShopState as pigState,openLootPack as pigOpen,pigCoinBalance} from '../functions/_loot_shop.js';
import {rankedCoinBalance,deliverRankedPvpCoins} from '../functions/_ranked_coin.js';
import {rankedTierReward,RANKED_TIER_IDS,RANKED_REWARD_VERSION,withRankedTierRewards,validateRankedShopPolicy} from '../shared/ranked-shop-policy-v1.mjs';
import {DUO_WEEKLY_POLICY_KEY} from '../shared/ranked-duo-weekly-v3.mjs';
import {ensureJointAtomicSchema} from '../functions/_joint_atomic.js';

async function shop(t,postgres){
 const f=await lootFixture(t,{postgres});
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('RANKED_COIN','랭크전 코인','SPECIAL','assets/items/ranked-coin-20261101.webp')").run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'RANKED_COIN',3000,3000),(8,'RANKED_COIN',3000,3000)").run();
 const policy=validateRankedShopPolicy({...f.shopPolicy});await f.setting(LOOT_SHOP_KEY,policy);
 return {...f,rankedPolicy:policy};
}
const request=(productId,quantity=1)=>({requestId:crypto.randomUUID(),productId,quantity});
const count=async(f,sql,...args)=>Number(Object.values(await f.p(sql,...args).first())[0]);

test('all eight reward tiers halve ordinary coins and truncate indivisible ranked coins',()=>{
 assert.deepEqual(RANKED_TIER_IDS.map(id=>rankedTierReward(id).rankedCoins),[3000,1500,750,375,187,93,46,23]);
 assert.deepEqual(RANKED_TIER_IDS.map(id=>rankedTierReward(id).coin),[50e12,25e12,12.5e12,6.25e12,3.125e12,1.5625e12,.78125e12,.390625e12]);
 assert.equal(rankedTierReward('bronze','DUO').coin,234375000000);assert.equal(rankedTierReward('challenger','DUO').coin,30e12);
});
for(const postgres of [false,'pipeline']){
 test(`${postgres||'SQLite'} ranked purchases use only ranked coins, preserve pig limits, isolate packs and replay once`,async t=>{
  const f=await shop(t,postgres),before=await pigState(f.env,f.user,{at:1793491200000}),body=request('superstar_choice');
  const result=await purchaseLootProduct(f.env,f.user,body);assert.equal(result.totalPrice,25);assert.equal(await rankedCoinBalance(f.env,7),2975);assert.equal(await pigCoinBalance(f.env,7),500);
  assert.deepEqual(await pigState(f.env,f.user,{at:1793491200000}),before);assert.equal(result.state.ownedPacks.length,1);
  assert.equal((await purchaseLootProduct(f.env,f.user,body)).replayed,true);assert.equal(await rankedCoinBalance(f.env,7),2975);
  const pack=result.state.ownedPacks[0];assert.match(pack.id,/^ranked:/);
  await assert.rejects(()=>pigOpen(f.env,f.user,{requestId:crypto.randomUUID(),packId:pack.id,cardId:'ss1'}),/팩/);
  const open={requestId:crypto.randomUUID(),packId:pack.id,cardId:'ss1'};await openLootPack(f.env,f.user,open);assert.equal((await openLootPack(f.env,f.user,open)).replayed,true);
  assert.equal(await count(f,'SELECT quantity FROM user_cards WHERE user_id=7 AND card_id=?','ss1'),1);
 });
 test(`${postgres||'SQLite'} bulk exchange rolls back currency, rewards and receipts on a grant failure; safe retry`,async t=>{
  const f=await shop(t,postgres),body=request('f_body',2);f.fail('INSERT INTO user_equipment_instances');
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,body));assert.equal(await rankedCoinBalance(f.env,7),3000);assert.equal(await count(f,'SELECT COUNT(*) FROM loot_shop_purchases_v1'),0);
  assert.equal(await count(f,'SELECT COUNT(*) FROM inventory_logs'),0);f.fail('');await purchaseLootProduct(f.env,f.user,body);await purchaseLootProduct(f.env,f.user,body);
  assert.equal(await rankedCoinBalance(f.env,7),2950);assert.equal(await count(f,'SELECT COUNT(*) FROM user_equipment_instances'),2);
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request('f_body')));assert.equal(await rankedCoinBalance(f.env,7),2950);
 });
 test(`${postgres||'SQLite'} authentication, owner-only settings and insufficient rank currency are enforced`,async t=>{
  const f=await shop(t,postgres);await f.p("UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0 WHERE item_code='RANKED_COIN'").run();
  await assert.rejects(()=>purchaseLootProduct(f.env,f.user,request('f_body')),/랭크전 코인/);assert.equal(await pigCoinBalance(f.env,7),500);
  const deps={...f.deps,authenticate:async r=>{const u=await f.deps.authenticate(r);return u?.id===8?{...u,role:'USER'}:u;}};
  const call=(route,token)=>handleRankedShop({path:route,env:f.env,deps,request:new Request('https://game.test/api/'+route,{headers:token?{authorization:token}:{}})});
  assert.equal((await call('ranked-shop/state')).status,401);assert.equal((await call('admin/ranked-shop','Bearer local-account-8')).status,403);
  const bad=structuredClone(f.rankedPolicy);bad.products=[{...bad.products[0],type:'ITEM_BUNDLE',items:[{code:'RANKED_COIN',quantity:100}]}];assert.throws(()=>validateRankedShopPolicy(bad),/상점 보상/);
 });
 test(`${postgres||'SQLite'} PVP settlement grants rank currency once, rollback on ledger failure and no legacy backfill`,async t=>{
  const f=await shop(t,postgres);const ddl=["CREATE TABLE pvp_season_settlement_ranks(settlement_id BIGINT,user_id BIGINT,tier_id TEXT,final_rank BIGINT)","CREATE TABLE pvp_season_settlement_deliveries(settlement_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,status TEXT,UNIQUE(settlement_id,user_id,reward_type))"];
  if(f.DB.execSchema)await f.DB.execSchema(ddl);else for(const sql of ddl)await f.p(sql).run();
  await f.p("INSERT INTO pvp_season_settlement_ranks VALUES(1,7,'challenger',1),(1,8,'platinum',21)").run();
  assert.equal(await deliverRankedPvpCoins(f.env,1,{}),0);assert.equal(await rankedCoinBalance(f.env,7),3000);
  const settings={rankedRewardVersion:RANKED_REWARD_VERSION,tierRewardsEnabled:true};f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>deliverRankedPvpCoins(f.env,1,settings));f.fail('');
  assert.equal(await count(f,'SELECT COUNT(*) FROM pvp_season_settlement_deliveries'),0);assert.equal(await rankedCoinBalance(f.env,7),3000);
  assert.equal(await deliverRankedPvpCoins(f.env,1,settings),0);assert.equal(await deliverRankedPvpCoins(f.env,1,settings),0);
  assert.equal(await rankedCoinBalance(f.env,7),6000);assert.equal(await rankedCoinBalance(f.env,8),3187);assert.equal(await count(f,'SELECT COUNT(*) FROM inventory_logs'),2);
 });
}
test('duo season settlement commits ordinary coins and ranked coins atomically, retries once and keeps next-season policy',async t=>{
 const f=await weeklyFixture(t,{postgres:'pipeline'});await ensureJointAtomicSchema(f.env);
 const ddl=["CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active BIGINT DEFAULT 1)","CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,updated_at TEXT,PRIMARY KEY(user_id,item_code))","CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)"];
 await f.env.DB.execSchema(ddl);await f.p("INSERT INTO inventory_items(code) VALUES('RANKED_COIN')").run();
 const policy=withRankedTierRewards(f.policy,'DUO');await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),DUO_WEEKLY_POLICY_KEY).run();
 await f.active();assert.equal((await f.season()).config.challenger.rewardRankedCoins,3000);
 f.advance(7*day);await f.tick();f.fail('INSERT INTO inventory_logs');await assert.rejects(f.tick);f.fail('');
 assert.equal(await count(f,'SELECT COUNT(*) FROM ranked_duo_rewards_v3'),0);assert.equal(await count(f,'SELECT SUM(coin) FROM users'),0);
 await f.tick();for(const id of [2,3,4,5]){assert.equal(await rankedCoinBalance(f.env,id),3000);assert.equal(await count(f,'SELECT coin FROM users WHERE id=?',id),30e12);}
 await f.tick();f.advance(1200);await f.tick();assert.equal((await f.season()).config.challenger.rewardRankedCoins,3000);assert.equal(await count(f,'SELECT COUNT(*) FROM inventory_logs'),4);
 const history=(await f.call('ranked-duo/rewards',{user:2})).data.rewards[0];assert.equal(history.rankedCoins,3000);assert.equal(history.coin,30e12);
});
