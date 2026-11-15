import test from 'node:test';import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_NOVEMBER6,SUPPORT_PACKAGE_BONUS_CODE,SUPPORT_PACKAGE_LEGACY_BONUS_CODE,supportPackageBonus,supportPackageBonusState,supportPackageBonusKey,supportPackageWithBonus,supportPackageOrderProduct,SUPPORT_PACKAGE_SALES_ENDS_AT,supportPackageSalesOpen} from '../shared/support-package-v1.mjs';
const oldKey=supportPackageBonusKey(2,SUPPORT_PACKAGE_LEGACY_BONUS_CODE),newKey=supportPackageBonusKey(2),read=async(f,key=newKey)=>{const r=await f.one('SELECT value FROM app_meta WHERE key=?',key);return r?JSON.parse(r.value):null;};

test('new campaign resets every prior count and keeps immutable old products and deadlines',()=>{
 assert.notEqual(oldKey,newKey);assert.notEqual(SUPPORT_PACKAGE.bonusPolicy,SUPPORT_PACKAGE_NOVEMBER6.bonusPolicy);
 assert.deepEqual(supportPackageBonusState(),{version:1,policyCode:SUPPORT_PACKAGE_BONUS_CODE,paidPurchases:0,totalBonusCoins:'0'});
 assert.equal(supportPackageWithBonus(SUPPORT_PACKAGE).purchaseBonus.coins,'1000000000000000');
 assert.equal(supportPackageWithBonus(SUPPORT_PACKAGE_NOVEMBER6).purchaseBonus.coins,'200000000000000');
 assert.equal(supportPackageBonus(0,5).coins,'20000000000000000');assert.equal(supportPackageBonus(0,10).coins,'28000000000000000');assert.equal(supportPackageBonus(10,100).coins,'0');
 assert.deepEqual(supportPackageOrderProduct({product:SUPPORT_PACKAGE_NOVEMBER6,status:'FULFILLED'}),SUPPORT_PACKAGE_NOVEMBER6);
 assert.throws(()=>supportPackageBonusState({version:1,policyCode:SUPPORT_PACKAGE_LEGACY_BONUS_CODE,paidPurchases:5,totalBonusCoins:'4100000000000000'}));
 assert(supportPackageSalesOpen(Date.parse('2026-11-18T23:59:59.999+09:00')));assert(!supportPackageSalesOpen(SUPPORT_PACKAGE_SALES_ENDS_AT));
});

test('all prior purchase counts display zero; first new payment, bulk, rollback and replay leave old history untouched',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();
  for(const count of [0,1,2,3,4,5,9,10,30,100]){
   const old={version:1,policyCode:SUPPORT_PACKAGE_LEGACY_BONUS_CODE,paidPurchases:count,totalBonusCoins:supportPackageBonus(count,0,SUPPORT_PACKAGE_LEGACY_BONUS_CODE).totalEarnedCoins,lastOrderId:'preserved-history'};
   await f.run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',oldKey,JSON.stringify(old));
   const info=await f.call('server-support/package',{user:2});assert.equal(info.status,200);assert.equal(info.body.bonusProgress.paidPurchases,0);assert.equal(info.body.bonusProgress.totalBonusCoins,'0');assert.deepEqual(await read(f,oldKey),old);assert.equal(await read(f),null);
  }
  const old=await read(f,oldKey),order=(await f.apply()).body.order,quote=(await f.call('admin/server-support/package')).body.pending[0].quotedFulfillment;
  assert.equal(quote.purchaseBonus.coins,'1000000000000000');assert.equal(quote.coins,1500000000000000);
  f.fail('INSERT INTO admin_logs');assert.equal((await f.process(order)).status,503);f.fail(null);assert.equal(await read(f),null);assert.deepEqual(await read(f,oldKey),old);
  const id=crypto.randomUUID(),paid=await f.process(order,'FULFILL',id);assert.equal(paid.status,200);assert.deepEqual(paid.body.order.fulfillment,quote);assert.equal((await read(f)).paidPurchases,1);assert((await f.process(order,'FULFILL',id)).body.replayed);
  const bulk=(await f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),quantity:4}})).body.order;
  assert.equal((await f.process(bulk)).body.order.fulfillment.purchaseBonus.coins,'19000000000000000');assert.equal((await read(f)).totalBonusCoins,'20000000000000000');assert.deepEqual(await read(f,oldKey),old);
  assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,'22500000000001234');
  assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE item_code='ARDEN_ENERGY'")).quantity),250);
  assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE item_code='MERCENARY_SSS_LIMITED_SHARD'")).quantity),125);
  assert.equal(Number((await f.one("SELECT COUNT(*) n FROM cnine_user_inventory WHERE item_code='SUIT_CORE_7'")).n),0);
  assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key='ops:support-package-xbody-guarantee-notice:20261106:v1'")).n),0);
 }finally{await f.close();}
});

