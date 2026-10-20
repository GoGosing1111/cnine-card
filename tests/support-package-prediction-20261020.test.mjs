import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionSubsidyFixture} from './helpers/prediction-subsidy-fixture.mjs';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {ensureJointAtomicSchema} from '../functions/_joint_atomic.js';
import {packageCoinKey,readPackageCoinAccounting,packageCoinGuardStatements} from '../functions/_package_coin_accounting.js';
import {sendPackageNotice} from '../scripts/ops/support-package-notice-core.mjs';
import {PACKAGE_NOTICE_CAMPAIGN,PACKAGE_NOTICE_RECEIPT} from '../shared/support-package-notice-v1.mjs';
const PACKAGE=100000000000000;
async function change(f,user,amount,reason){
 await f.env.DB.batch([
  f.env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,user),
  f.env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(amount,reason,user)
 ]);
}
async function grant(f,user,amount=PACKAGE){
 await ensureJointAtomicSchema(f.env);const snapshot=await readPackageCoinAccounting(f.env,user),orderId=user+'_'+crypto.randomUUID(),DB=f.env.DB;
 await DB.batch([...packageCoinGuardStatements(f.env,user,snapshot,{grant:amount,orderId}),
  DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,user),
  DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(amount,'시즌패스 패키지 구매 '+orderId,user)]);
}
for(const postgres of [false,true])test(`package principal cannot be bet, even by OWNER; valid bets and refunds preserve origin (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
 const f=await predictionSubsidyFixture({postgres});try{
  const event=await f.event(),bet=(user,amount,requestId=crypto.randomUUID())=>f.call('coin-prediction/bet',{user,body:{eventId:event.id,optionId:event.options[0].id,amount,requestId}});
  for(const user of [1,3]){
   await grant(f,user);const s=(await f.call('coin-prediction/state',{user})).body;
   assert.equal(s.walletCoin,1000000000);assert.equal(s.packageCoin,PACKAGE);assert.equal(s.totalWalletCoin,PACKAGE+1000000000);
   const denied=await bet(user,1000000001);assert.equal(denied.status,409);assert.equal(denied.body.code,'PREDICTION_PACKAGE_COIN');
   assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_prediction_receipts WHERE user_id=?',user)).n),0);
   const rid=crypto.randomUUID(),paid=await bet(user,1000000000,rid);assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.body.state.walletCoin,0);
   assert.equal((await bet(user,1000000000,rid)).body.replayed,true);assert.equal((await readPackageCoinAccounting(f.env,user)).restricted,PACKAGE);
   assert.equal((await bet(user,100000)).status,409);
  }
  await f.api.settleCoinPrediction(f.env,event.id,null,true);
  for(const user of [1,3]){const s=await readPackageCoinAccounting(f.env,user);assert.equal(s.restricted,PACKAGE);assert.equal(s.available,1000000000);}
 }finally{await f.close();}
});
test('ordinary spending, earned coins, repeated packages and auction refunds retain the correct balance',async()=>{
 const f=await predictionSubsidyFixture({postgres:true});try{
  await grant(f,3);await change(f,3,-30000000000000,'장비 제작');await change(f,3,5000000,'PVE 클리어');
  let s=await readPackageCoinAccounting(f.env,3);assert.equal(s.restricted,70000000000000);assert.equal(s.available,1005000000);
  await change(f,3,-40000000000000,'경매 #42 누적 입찰');s=await readPackageCoinAccounting(f.env,3);assert.equal(s.restricted,30000000000000);assert.equal(s.available,1005000000);
  await change(f,3,40000000000000,'경매 #42 유찰·차순위 환급');s=await readPackageCoinAccounting(f.env,3);assert.equal(s.restricted,70000000000000);assert.equal(s.available,1005000000);
  await grant(f,3);s=await readPackageCoinAccounting(f.env,3);assert.equal(s.restricted,170000000000000);assert.equal(s.available,1005000000);assert.equal(s.state.precredited,null);
  const e=await f.event(),b=await f.call('coin-prediction/bet',{user:3,body:{eventId:e.id,optionId:e.options[0].id,amount:1005000000,requestId:crypto.randomUUID()}});assert.equal(b.status,200,JSON.stringify(b));assert.equal(b.body.state.walletCoin,0);
 }finally{await f.close();}
});
test('stale balance and ledger snapshots fail atomically; retry never double debits',async()=>{
 const f=await predictionSubsidyFixture({postgres:true});try{
  await grant(f,3);const e=await f.event(),body={eventId:e.id,optionId:e.options[0].id,amount:1000000000,requestId:crypto.randomUUID()},before=await f.one('SELECT value FROM app_meta WHERE key=?',packageCoinKey(3));
  const batch=f.env.DB.batch.bind(f.env.DB);let inject=true;
  f.env.DB.batch=async statements=>{if(inject){inject=false;await change({...f,env:{DB:{...f.env.DB,batch,prepare:f.env.DB.prepare.bind(f.env.DB)}}},3,100000,'전투 보상');}return batch(statements);};
  const stale=await f.call('coin-prediction/bet',{user:3,body});assert.equal(stale.status,503);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM coin_prediction_bets')).n),0);
  assert.equal((await f.one('SELECT value FROM app_meta WHERE key=?',packageCoinKey(3))).value,before.value);
  f.env.DB.batch=batch;const retry=await f.call('coin-prediction/bet',{user:3,body});assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.body.state.walletCoin,100000);
  assert.equal((await f.call('coin-prediction/bet',{user:3,body})).body.replayed,true);
  f.fail('INSERT INTO coin_logs');const failed=await f.call('coin-prediction/bet',{user:3,body:{...body,amount:100000,requestId:crypto.randomUUID()}});assert.equal(failed.status,503);f.fail(null);assert.equal((await readPackageCoinAccounting(f.env,3)).available,100000);
 }finally{await f.close();}
});
test('legacy 50-trillion grants are protected; missing debit log cannot release restricted funds',async()=>{
 const f=await predictionSubsidyFixture({postgres:true});try{
  await change(f,3,50000000000000,'시즌패스 패키지 구매 3_legacy');await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','support_package_order_v1:3_legacy',JSON.stringify({status:'FULFILLED'}));
  let s=await readPackageCoinAccounting(f.env,3);assert.equal(s.restricted,50000000000000);assert.equal(s.available,1000000000);
  await f.run('UPDATE users SET coin=coin-10000000000000 WHERE id=3');s=await readPackageCoinAccounting(f.env,3);assert.equal(s.available,0);
  await f.run("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,-10000000000000,coin,'일반 구매' FROM users WHERE id=3");s=await readPackageCoinAccounting(f.env,3);assert.equal(s.available,1000000000);assert.equal(s.restricted,40000000000000);
 }finally{await f.close();}
});
test('the announcement is atomic, deletes only on its recipient read and never resends after deletion',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();f.fail('INSERT INTO admin_logs');await assert.rejects(()=>sendPackageNotice(f.env,{now:f.clock.now}));f.fail(null);
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),0);assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',PACKAGE_NOTICE_RECEIPT),null);
  const sent=await sendPackageNotice(f.env,{now:f.clock.now});assert.deepEqual(sent.recipientIds,[2]);assert.match(sent.body,/100조/);
  const inbox=await f.messages(2),notice=inbox.body.messages[0];assert.equal(notice.deleteOnRead,true);assert.equal(Number(notice.is_read),0);
  await f.run("INSERT INTO user_messages(id,user_id,title,body,message_type,campaign_key,is_read,created_at) VALUES(100,2,'기존 메시지','보존','SYSTEM','ordinary',0,?)",new Date(f.clock.now).toISOString());
  const read=(id,user=2)=>f.handle(new Request('https://support.test/api/messages',{method:'PATCH',headers:{authorization:'Bearer qa-'+user,'content-type':'application/json'},body:JSON.stringify({id})}));
  await read(notice.id,3);assert.ok(await f.one('SELECT id FROM user_messages WHERE id=?',notice.id));
  assert.equal((await (await read(notice.id)).json()).messageDeleted,true);assert.equal(await f.one('SELECT id FROM user_messages WHERE id=?',notice.id),null);
  await read(notice.id);await read(100);assert.equal(Number((await f.one('SELECT is_read FROM user_messages WHERE id=100')).is_read),1);
  const retry=await sendPackageNotice(f.env,{now:f.clock.now});assert.equal(retry.replayed,true);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages WHERE campaign_key=?',PACKAGE_NOTICE_CAMPAIGN)).n),0);
  const normal=(await f.messages(2)).body.messages[0];assert.equal(normal.deleteOnRead,false);
 }finally{await f.close();}
});
