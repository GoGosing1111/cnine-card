import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_SALES_ENDS_AT,supportPackageSalesOpen} from '../shared/support-package-v1.mjs';

test('package sales close at 2026-10-27 00:00 KST, not noon or the preceding midnight',()=>{
 assert.equal(new Date(SUPPORT_PACKAGE_SALES_ENDS_AT).toISOString(),'2026-10-26T15:00:00.000Z');
 assert.equal(supportPackageSalesOpen(SUPPORT_PACKAGE_SALES_ENDS_AT-1),true);
 assert.equal(supportPackageSalesOpen(SUPPORT_PACKAGE_SALES_ENDS_AT),false);
 assert.equal(supportPackageSalesOpen(SUPPORT_PACKAGE_SALES_ENDS_AT+86400000),false);
});

for(const postgres of [false,true])test(`midnight hides only the package, rejects new applications and preserves pending payment (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
 const f=await packageFixture({postgres});try{
  f.clock.now=SUPPORT_PACKAGE_SALES_ENDS_AT-1;await f.activate();
  const before=(await f.call('server-support/info',{user:2})).body;
  assert.equal(before.packageVisible,true);
  const requestId=crypto.randomUUID(),applied=await f.apply(2,requestId);assert.equal(applied.status,200);
  const beforeSupport=await f.one('SELECT value FROM app_meta WHERE key=?','server_support_v1:2');
  f.clock.now=SUPPORT_PACKAGE_SALES_ENDS_AT;
  const closed=(await f.call('server-support/info',{user:2})).body;
  assert.equal(closed.packageVisible,false);assert.equal(closed.seasonPassVisible,before.seasonPassVisible);
  const {resetsAt:beforeReset,...beforeApplication}=before.application,{resetsAt:afterReset,...afterApplication}=closed.application;
  assert.deepEqual(afterApplication,beforeApplication);assert.equal(afterReset,beforeReset+86400000);assert.equal(closed.subscription.active,true);
  const info=await f.call('server-support/package',{user:2});assert.equal(info.body.salesOpen,false);assert.equal(info.body.pending.id,applied.body.order.id);
  const writes=f.queries.filter(q=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)).length;
  const denied=await f.apply();assert.equal(denied.status,410);assert.equal(denied.body.code,'SUPPORT_PACKAGE_CLOSED');
  const replay=await f.apply(2,requestId);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.order.id,applied.body.order.id);
  assert.equal(f.queries.filter(q=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)).length,writes);
  assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,1);
  const processId=crypto.randomUUID(),paid=await f.process(applied.body.order,'FULFILL',processId);
  assert.equal(paid.status,200);assert.deepEqual(paid.body.order.fulfillment,SUPPORT_PACKAGE);
  assert.equal((await f.process(applied.body.order,'FULFILL',processId)).body.replayed,true);
  assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200000000001234);
  assert.equal((await f.one('SELECT value FROM app_meta WHERE key=?','server_support_v1:2')).value,beforeSupport.value);
 }finally{await f.close();}
});

test('a new request waiting for its account lock is rejected if the deadline passes',async()=>{
 const f=await packageFixture({postgres:true});try{
  f.clock.now=SUPPORT_PACKAGE_SALES_ENDS_AT-1;await f.activate();
  f.deps.withUserMutationLock=async(_env,_user,path,work)=>{assert.equal(path,'server-support/package/apply');f.clock.now=SUPPORT_PACKAGE_SALES_ENDS_AT;return work();};
  const result=await f.apply();assert.equal(result.status,410);assert.equal(result.body.code,'SUPPORT_PACKAGE_CLOSED');
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),0);
  assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,0);
 }finally{await f.close();}
});
