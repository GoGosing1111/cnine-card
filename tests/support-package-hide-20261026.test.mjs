import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_CUBE,SUPPORT_PACKAGE_SALES_ENDS_AT,supportPackageSalesOpen} from '../shared/support-package-v1.mjs';

const midnight=Date.parse('2026-11-24T00:00:00+09:00');
test('the permanent sale has no end and stays open across the old cutoff',()=>{
 assert.equal(SUPPORT_PACKAGE_SALES_ENDS_AT,null);
 assert.equal(supportPackageSalesOpen(Date.parse('2026-11-03T00:00:00+09:00')),true);
 assert.equal(supportPackageSalesOpen(midnight-1),true);
 assert.equal(supportPackageSalesOpen(midnight),true);
 assert.equal(supportPackageSalesOpen(midnight+86400000),true);
});

for(const postgres of [false,true])test(`midnight keeps the package available, preserves pending payment and accepts new applications (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
 const f=await packageFixture({postgres});try{
  f.clock.now=midnight-1;await f.activate();
  const before=(await f.call('server-support/info',{user:2})).body;
  assert.equal(before.packageVisible,true);
  const requestId=crypto.randomUUID(),applied=await f.apply(2,requestId);assert.equal(applied.status,200);
  const beforeSupport=await f.one('SELECT value FROM app_meta WHERE key=?','server_support_v1:2');
  f.clock.now=midnight;
  const closed=(await f.call('server-support/info',{user:2})).body;
  assert.equal(closed.packageVisible,true);assert.equal(closed.seasonPassVisible,before.seasonPassVisible);
  const {resetsAt:beforeReset,...beforeApplication}=before.application,{resetsAt:afterReset,...afterApplication}=closed.application;
  assert.deepEqual(afterApplication,beforeApplication);assert.equal(afterReset,beforeReset+86400000);assert.equal(closed.subscription.active,true);
  const info=await f.call('server-support/package',{user:2});assert.equal(info.body.salesOpen,true);assert.equal(info.body.pending.id,applied.body.order.id);
  const writes=f.queries.filter(q=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)).length;
  const replay=await f.apply(2,requestId);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.order.id,applied.body.order.id);
  assert.equal(f.queries.filter(q=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)).length,writes);
  assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,1);
  const processId=crypto.randomUUID(),paid=await f.process(applied.body.order,'FULFILL',processId);
  assert.equal(paid.status,200);assert.deepEqual(paid.body.order.fulfillment.items,[...SUPPORT_PACKAGE.items.map(item=>item.code==='MASTER_STAR'?{...item,quantity:6_000_000_000}:item),{...SUPPORT_PACKAGE_CUBE,quantity:5}]);assert.equal(paid.body.order.fulfillment.coins,1500000000000000);
  assert.equal((await f.process(applied.body.order,'FULFILL',processId)).body.replayed,true);
  assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1500000000001234);
  assert.equal((await f.one('SELECT value FROM app_meta WHERE key=?','server_support_v1:2')).value,beforeSupport.value);
 }finally{await f.close();}
});

test('a new request waiting for its account lock succeeds across the former deadline',async()=>{
 const f=await packageFixture({postgres:true});try{
  f.clock.now=midnight-1;await f.activate();
  f.deps.withUserMutationLock=async(_env,_user,path,work)=>{assert.equal(path,'server-support/package/apply');f.clock.now=midnight;return work();};
  const result=await f.apply();assert.equal(result.status,200);assert.equal(result.body.order.status,'PENDING');
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),2);
  assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,1);
 }finally{await f.close();}
});
