import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,LIMITED_SHARD} from '../shared/support-package-v1.mjs';
import {ensureLimitedShardCatalog} from '../functions/_support_package.js';
import {ensureEmperorEnergyCatalog} from '../functions/_emperor_energy.js';
for(const postgres of [false,true]){
 test(`package purchase, owner popup feed and exactly-once atomic delivery (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
  const f=await packageFixture({postgres});try{
   assert.equal((await f.call('server-support/info',{user:2})).body.packageVisible,false);
   assert.equal((await f.apply()).status,403);
   await f.activate();assert.equal((await f.call('server-support/info',{user:2})).body.packageVisible,true);
   const info=await f.call('server-support/package',{user:2});assert.equal(info.status,200);assert.equal(info.body.product.priceWon,49800);
   const item=await f.one('SELECT * FROM inventory_items WHERE code=?',LIMITED_SHARD.code);assert.equal(item.category,'MATERIAL');assert.equal(item.rarity,'SSS');assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1234);
   const id=crypto.randomUUID(),applied=await f.apply(2,id);assert.equal(applied.status,200,JSON.stringify(applied.body));const order=applied.body.order;
   assert.equal(order.product.coins,200000000000000);assert.equal(applied.body.messageExpired,false);
   assert.equal((await f.apply(2,id)).body.replayed,true);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),2);
   const reissued=await f.apply();assert.equal(reissued.body.order.id,order.id);assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),1);
   const alerts=await f.call('admin/server-support/package/alerts');assert.equal(alerts.body.pending.length,1);assert.equal(alerts.body.pending[0].nickname,'후원 검수 계정');
   for(const user of [2,3])assert.equal((await f.call('admin/server-support/package/alerts',{user})).status,403);
   assert.equal((await f.call('admin/server-support/package',{user:3})).status,403);
   const beforePass=await f.one('SELECT value FROM app_meta WHERE key=?','server_support_v1:2');
   const rid=crypto.randomUUID(),paid=await f.process(order,'FULFILL',rid);assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.order.status,'FULFILLED');
   assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200000000001234);
   for(const i of SUPPORT_PACKAGE.items){const owned=await f.one('SELECT * FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',i.code);assert.equal(Number(owned.quantity),i.quantity);assert.equal(Number(owned.unseen_quantity),i.quantity);}
   assert.equal((await f.process(order,'FULFILL',rid)).body.replayed,true);assert.equal((await f.process(order)).status,409);
   assert.equal((await f.process(order,'REJECT',rid)).status,409);
   assert.equal((await f.one('SELECT value FROM app_meta WHERE key=?','server_support_v1:2')).value,beforePass.value);
   assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,0);
   assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),1);
   assert.equal(Number((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n),2);
   const next=await f.apply();assert.notEqual(next.body.order.id,order.id);
   assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),2);
   const rejected=await f.process(next.body.order,'REJECT');assert.equal(rejected.status,200);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200000000001234);
  }finally{await f.close();}
 });
 test(`package eligibility, tampering and rollback (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
  const f=await packageFixture({postgres});try{
   await f.activate();
   for(const user of [1,3,4,5,6])assert.notEqual((await f.apply(user)).status,200);
   assert.equal((await f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),coins:1}})).status,400);
   await f.save({...f.document(),enabled:false});assert.equal((await f.apply()).status,403);await f.save();
   f.fail('INSERT INTO user_messages');assert.equal((await f.apply()).status,503);f.fail(null);
   assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,0);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),0);
   const applied=await f.apply(),order=applied.body.order;
   f.fail('INSERT INTO inventory_logs');assert.equal((await f.process(order)).status,503);f.fail(null);
   assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1234);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,1);
   f.clock.now=order.eligibleUntil+1;assert.equal((await f.call('server-support/info',{user:2})).body.packageVisible,false);assert.equal((await f.apply()).status,403);
   // A payment for an eligible existing order can still be fulfilled after pass expiry.
   assert.equal((await f.process(order)).status,200);
  }finally{await f.close();}
 });
}
test('package bank message expiry, privacy, overflow and catalog isolation',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();await f.run("INSERT INTO inventory_items(code,name,category,is_active) VALUES('MERCENARY_SSS_CARD_SHARD','기존 일반 조각','MATERIAL',1)");
  await ensureLimitedShardCatalog(f.env);await ensureLimitedShardCatalog(f.env);
  assert.equal((await f.one("SELECT name FROM inventory_items WHERE code='MERCENARY_SSS_CARD_SHARD'")).name,'기존 일반 조각');
  const id=crypto.randomUUID(),a=await f.apply(2,id);f.clock.now+=300001;
  assert.equal((await f.apply(2,id)).body.messageExpired,true);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages WHERE user_id=2')).n),1);
  const inbox=await f.messages(2);assert.equal(inbox.body.messages.length,0);const owner=await f.messages(1);assert.equal(owner.body.messages.length,1);assert.match(owner.body.messages[0].title,/패키지 구매 접수/);
  const foreign={...a.body.order,id:'20_'+crypto.randomUUID(),userId:20,nickname:'노출 금지'};await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','support_package_order_v1:'+foreign.id,JSON.stringify(foreign));assert.equal((await f.call('server-support/package',{user:2})).body.recent.length,1);
  await f.run('UPDATE users SET coin=? WHERE id=2',Number.MAX_SAFE_INTEGER);assert.equal((await f.process(a.body.order)).status,503);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,1);
 }finally{await f.close();}
});
test('competing owner confirmations and duplicate applications cannot repeat a grant or alert',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();await ensureLimitedShardCatalog(f.env);await ensureEmperorEnergyCatalog(f.env);
  const batch=f.DB.batch.bind(f.DB);let entered=false,competitor;
  f.DB.batch=async statements=>{if(!entered){entered=true;competitor=await f.apply();}return batch(statements);};
  const stale=await f.apply();assert.equal(competitor.status,200);assert.equal(stale.status,409);assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),1);
  entered=false;const order=competitor.body.order;
  f.DB.batch=async statements=>{if(!entered){entered=true;competitor=await f.process(order);}return batch(statements);};
  const staleConfirm=await f.process(order);assert.equal(competitor.status,200);assert.equal(staleConfirm.status,409);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200000000001234);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n),2);
 }finally{await f.close();}
});
