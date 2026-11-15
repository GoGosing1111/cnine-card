import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_500T_BOGO,SUPPORT_PACKAGE_SALES_ENDS_AT,supportPackageSalesOpen,supportPackageOrderProduct} from '../shared/support-package-v1.mjs';
import {supportPackageBonus,supportPackageBonusKey} from '../shared/support-package-v1.mjs';
import {readPackageCoinAccounting} from '../functions/_package_coin_accounting.js';
const expectedItems={MASTER_STAR:1000000000,ARDEN_ENERGY:50,WEAPON_ENHANCEMENT_SCROLL:10,ARMOR_ENHANCEMENT_SCROLL:10,MERCENARY_SSS_LIMITED_SHARD:25,PET_SEAL_ORB:50,PET_ESSENCE:500};
const items=p=>Object.fromEntries(p.items.map(i=>[i.code,i.quantity]));
const apply=(f,quantity=1)=>f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),quantity}});
const state=async f=>{const row=await f.one('SELECT value FROM app_meta WHERE key=?',supportPackageBonusKey(2));return row?JSON.parse(row.value):null;};
const balance=async f=>(await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin;

test('49,800-won 1+1 TOTALS are exact integers; only the refreshed product earns bonuses; November 19 midnight is exclusive',()=>{
 assert.equal(SUPPORT_PACKAGE.priceWon,49800);assert.equal(SUPPORT_PACKAGE.coins,500000000000000);assert.equal(SUPPORT_PACKAGE.eventLabel,'1+1 이벤트');assert.equal(SUPPORT_PACKAGE.packageQuantity,2);assert.deepEqual(items(SUPPORT_PACKAGE),expectedItems);
 assert.equal(new Date(SUPPORT_PACKAGE_SALES_ENDS_AT).toISOString(),'2026-11-18T15:00:00.000Z');
 assert(supportPackageSalesOpen(Date.parse('2026-11-18T23:59:59.999+09:00')));assert(!supportPackageSalesOpen(SUPPORT_PACKAGE_SALES_ENDS_AT));
 assert.equal(SUPPORT_PACKAGE_500T_BOGO.code,'SEASON_PASS_PACKAGE_20261101_500T');assert.equal(SUPPORT_PACKAGE_500T_BOGO.bonusPolicy,undefined);
 assert.deepEqual(items(SUPPORT_PACKAGE_500T_BOGO),{EMPEROR_ENERGY:400,MERCENARY_SSS_LIMITED_SHARD:10,WEAPON_ENHANCEMENT_SCROLL:10,ARMOR_ENHANCEMENT_SCROLL:10});
 assert.equal(supportPackageOrderProduct({product:{...SUPPORT_PACKAGE,coins:1000},quantity:1}),null);
});

test('milestones add once: 5 purchases = 20,000T bonus; 10 = 28,000T; 11 through 100 earn no repeated tier',()=>{
 for(const [count,expected] of [[0,'0'],[1,'1000000000000000'],[2,'3000000000000000'],[3,'6000000000000000'],[4,'12000000000000000'],[5,'20000000000000000'],[9,'20000000000000000'],[10,'28000000000000000'],[100,'28000000000000000']])assert.equal(supportPackageBonus(0,count).coins,expected);
 assert.equal(supportPackageBonus(4,6).coins,'16000000000000000');assert.equal(supportPackageBonus(10,100).coins,'0');
 for(const [p,q] of [[-1,1],[1.5,1],[0,101],[Number.MAX_SAFE_INTEGER,1]])assert.throws(()=>supportPackageBonus(p,q));
});

for(const postgres of [false,true])test(`successive 1..10 paid purchases match exact cumulative money and inventory, rejection/replay never advance count (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
 const f=await packageFixture({postgres});try{
  f.clock.now=Date.parse('2026-11-06T20:00:00+09:00');await f.activate();
  const expected=[1500,4000,7500,14000,22500,23000,23500,24000,24500,33000];
  const stopAt=postgres?10:5;
  for(let n=1;n<=stopAt;n++){
   const applied=await apply(f);assert.equal(applied.status,200,JSON.stringify(applied.body));const order=applied.body.order;
   assert.equal((await state(f))?.paidPurchases??0,n-1);
   const quote=(await f.call('admin/server-support/package')).body.pending[0].quotedFulfillment;
   const id=crypto.randomUUID(),paid=await f.process(order,'FULFILL',id);assert.equal(paid.status,200,JSON.stringify(paid.body));assert.deepEqual(paid.body.order.fulfillment,quote);
   assert.equal(await balance(f),(BigInt(expected[n-1])*1000000000000n+1234n).toString());assert.equal((await state(f)).paidPurchases,n);
   for(const [code,count] of Object.entries(expectedItems))assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',code)).quantity),count*n);
   const start=f.queries.length,replay=await f.process(order,'FULFILL',id);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.order,paid.body.order);assert(!f.queries.slice(start).some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)));
   assert.equal((await f.process(order)).status,409);
  }
  const before=await state(f),money=await balance(f),rejected=(await apply(f)).body.order;
  assert.equal((await f.process(rejected,'REJECT')).status,200);assert.deepEqual(await state(f),before);assert.equal(await balance(f),money);
  const accounting=await readPackageCoinAccounting(f.env,2);assert.equal(accounting.availableExact,'1234');assert.equal(accounting.restrictedExact,(BigInt(money)-1234n).toString());
 }finally{await f.close();}
});

test('100 purchases pay 78,000 trillion exactly into an odd balance above MAX_SAFE_INTEGER and give 2,500 shards/1,000 of each scroll',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=2','10000000000000001');
  const order=(await apply(f,100)).body.order,r=await f.process(order);assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.order.fulfillment.coins,'78000000000000000');assert.equal(await balance(f),'88000000000000001');assert.equal((await state(f)).paidPurchases,100);
  for(const [code,count] of Object.entries(expectedItems))assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',code)).quantity),count*100);
  const second=await f.process((await apply(f,1)).body.order);assert.equal(second.status,200);assert.equal(second.body.order.fulfillment.purchaseBonus.coins,'0');assert.equal(await balance(f),'88500000000000001');
 }finally{await f.close();}
});

test('wallet, bonus count, inventory, ledgers and receipt roll back together when later inventory/audit writes fail',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const order=(await apply(f,10)).body.order;
  for(const failure of ['INSERT INTO inventory_logs','INSERT INTO admin_logs']){
   f.fail(failure);const failed=await f.process(order);f.fail(null);assert.equal(failed.status,503);assert.equal(await state(f),null);assert.equal(await balance(f),'1234');
   assert.equal(Number((await f.one('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),0);
   assert.equal(JSON.parse((await f.one('SELECT value FROM app_meta WHERE key=?','support_package_order_v1:'+order.id)).value).status,'PENDING');
  }
  assert.equal((await f.process(order)).status,200);assert.equal(await balance(f),'33000000000001234');assert.equal((await state(f)).paidPurchases,10);
 }finally{await f.close();}
});

test('old 500T pending bulk order preserves old materials and contributes zero new purchase milestones',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const old={...(await apply(f,5)).body.order,product:SUPPORT_PACKAGE_500T_BOGO};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(old),'support_package_order_v1:'+old.id);
  const r=await f.process(old);assert.equal(r.status,200);assert.deepEqual(r.body.order.product,SUPPORT_PACKAGE_500T_BOGO);assert.equal(r.body.order.fulfillment.coins,2500000000000000);assert.equal(r.body.order.fulfillment.purchaseBonus,undefined);assert.equal(await state(f),null);
  assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='EMPEROR_ENERGY'")).quantity),2000);
  const next=await f.process((await apply(f)).body.order);assert.equal(next.status,200);assert.equal(next.body.order.fulfillment.coins,1500000000000000);assert.equal((await state(f)).paidPurchases,1);
 }finally{await f.close();}
});

test('counter compare-and-swap protects simultaneous confirmation; a forged or inconsistent counter fails closed',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const order=(await apply(f,5)).body.order;
  // Prime independent catalogs before injecting at the actual payment batch.
  f.fail('INSERT INTO coin_logs');assert.equal((await f.process(order)).status,503);f.fail(null);
  const batch=f.DB.batch.bind(f.DB);let entered=false,competitor;
  f.DB.batch=async statements=>{if(!entered){entered=true;competitor=await f.process(order);}return batch(statements);};
  const stale=await f.process(order);f.DB.batch=batch;assert.equal(competitor.status,200);assert.equal(stale.status,409);assert.equal((await state(f)).paidPurchases,5);assert.equal(await balance(f),'22500000000001234');
  const bad={...(await state(f)),paidPurchases:0};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(bad),supportPackageBonusKey(2));
  const writes=f.queries.length,denied=await apply(f);assert.equal(denied.status,409);assert.equal(denied.body.code,'SUPPORT_PACKAGE_BONUS_STATE');assert(!f.queries.slice(writes).some(q=>/INSERT INTO (coin_logs|cnine_user_inventory)/.test(q)));
 }finally{await f.close();}
});
