import test from 'node:test';import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE_500T_BOGO,supportPackageBonusKey} from '../shared/support-package-v1.mjs';
import {PACKAGE_GUARANTEE_NOTICE as N,packageGuaranteeNoticeKey} from '../functions/_support_package_guarantee_notice.js';
const apply=(f,quantity=1)=>f.call('server-support/package/apply',{user:2,body:{quantity,requestId:crypto.randomUUID()}});
const messages=f=>f.all('SELECT * FROM user_messages WHERE user_id=2 AND campaign_key=?',N.campaignKey);
const state=async f=>{const r=await f.one('SELECT value FROM app_meta WHERE key=?',packageGuaranteeNoticeKey(2));return r?JSON.parse(r.value):null;};
const pay=async(f,quantity=1)=>{const a=await apply(f,quantity);assert.equal(a.status,200,JSON.stringify(a.body));const r=await f.process(a.body.order);assert.equal(r.status,200,JSON.stringify(r.body));return r;};

for(const postgres of [false,true])test(`four paid units excluded, fifth sends once with payment; replay, later purchase and read/delete do not resend (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
 const f=await packageFixture({postgres});try{
  f.clock.now=Date.parse('2026-11-06T21:00:00+09:00');await f.activate();
  await pay(f,4);assert.equal((await messages(f)).length,0);assert.equal(await state(f),null);
  const a=await apply(f);assert.equal((await messages(f)).length,0);
  const requestId=crypto.randomUUID(),paid=await f.process(a.body.order,'FULFILL',requestId);assert.equal(paid.status,200);
  const [m]=await messages(f);assert.equal(m.title,N.title);assert.equal(m.body,N.body);assert.equal(m.message_type,'SYSTEM');assert.equal(Number(m.is_read),0);assert.equal((await state(f)).paidWon,'249000');
  const inbox=await f.messages();assert.equal(inbox.status,200);assert(JSON.stringify(inbox.body).includes(N.title));
  const start=f.queries.length;assert.equal((await f.process(a.body.order,'FULFILL',requestId)).body.replayed,true);assert(!f.queries.slice(start).some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)));
  const durable=await state(f);await f.run("UPDATE user_messages SET is_read=1,hidden_at='read' WHERE campaign_key=?",N.campaignKey);await pay(f);assert.equal((await messages(f)).length,1);assert.equal((await messages(f))[0].hidden_at,'read');assert.deepEqual(await state(f),durable);
  await f.run('DELETE FROM user_messages WHERE campaign_key=?',N.campaignKey);await pay(f);assert.equal((await messages(f)).length,0);assert.deepEqual(await state(f),durable);
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_message_rewards')).n),0);
 }finally{await f.close();}
});

test('bulk first payment qualifies immediately, old products and rejected applications never send',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const rejected=(await apply(f,10)).body.order;assert.equal((await f.process(rejected,'REJECT')).status,200);assert.equal((await messages(f)).length,0);
  const old={...(await apply(f,10)).body.order,product:SUPPORT_PACKAGE_500T_BOGO};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(old),'support_package_order_v1:'+old.id);assert.equal((await f.process(old)).status,200);assert.equal((await messages(f)).length,0);
  await pay(f,10);assert.equal((await messages(f)).length,1);assert.equal((await state(f)).paidWon,'498000');
 }finally{await f.close();}
});

test('prior manual recipients remain suppressed even when their original message has been deleted',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const manual={status:'COMPLETED',operationKey:N.campaignKey,productCode:N.productCode,title:N.title,body:N.body,recipientIds:['2'],messageIds:['999']};
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',N.campaignKey,JSON.stringify(manual));await pay(f,5);await pay(f,5);
  assert.equal((await messages(f)).length,0);assert.equal(await state(f),null);assert.equal((await f.one('SELECT value FROM app_meta WHERE key=?',N.campaignKey)).value,JSON.stringify(manual));
 }finally{await f.close();}
});

test('an existing notice is adopted without changing its read/hidden state',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();await f.run("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,is_read,hidden_at) VALUES(2,'ADMIN',?,?,'SYSTEM',?,1,'hidden')",N.title,N.body,N.campaignKey);
  await pay(f,5);assert.equal((await messages(f)).length,1);assert.equal((await messages(f))[0].hidden_at,'hidden');assert.equal((await state(f)).source,'EXISTING_MESSAGE');
 }finally{await f.close();}
});

test('notice insert, durable receipt, and later audit failures roll back payment, counter, inventory, notice and receipt together',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const order=(await apply(f,5)).body.order;
  for(const failure of ['INSERT INTO user_messages','INSERT INTO admin_logs']){
   f.fail(failure);const failed=await f.process(order);f.fail(null);assert.equal(failed.status,503);assert.equal((await messages(f)).length,0);assert.equal(await state(f),null);
   assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,'1234');assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',supportPackageBonusKey(2)),null);
   assert.equal(Number((await f.one('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_logs')).n),0);
   assert.equal(JSON.parse((await f.one('SELECT value FROM app_meta WHERE key=?','support_package_order_v1:'+order.id)).value).status,'PENDING');
  }
  const prepare=f.DB.prepare.bind(f.DB);
  f.DB.prepare=sql=>{const s=prepare(sql);if(sql==='INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)'){const bind=s.bind.bind(s);s.bind=(...args)=>args[0]===packageGuaranteeNoticeKey(2)?prepare('SELECT 1/0'):bind(...args);}return s;};
  assert.equal((await f.process(order)).status,503);f.DB.prepare=prepare;assert.equal((await messages(f)).length,0);assert.equal(await state(f),null);assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,'1234');
  assert.equal((await f.process(order)).status,200);assert.equal((await messages(f)).length,1);assert.equal((await state(f)).paidPurchases,5);
 }finally{await f.close();}
});

test('competing payment confirmations commit one notice and one purchase',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const order=(await apply(f,5)).body.order;f.fail('INSERT INTO coin_logs');assert.equal((await f.process(order)).status,503);f.fail(null);
  const batch=f.DB.batch.bind(f.DB);let entered=false,competitor;f.DB.batch=async statements=>{if(!entered){entered=true;competitor=await f.process(order);}return batch(statements);};
  const stale=await f.process(order);f.DB.batch=batch;assert.equal(competitor.status,200);assert.equal(stale.status,409);assert.equal((await messages(f)).length,1);assert.equal((await state(f)).paidPurchases,5);
 }finally{await f.close();}
});
