import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionSubsidyFixture} from './helpers/prediction-subsidy-fixture.mjs';
import {ensureJointAtomicSchema} from '../functions/_joint_atomic.js';
import {packageCoinKey,readPackageCoinAccounting,packageCoinGuardStatements,requirePredictionCoins} from '../functions/_package_coin_accounting.js';

const LARGE='50001400006005009',PACKAGE=100000000000000;
const exactWallet=f=>f.one('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=2').then(row=>row.coin);

test('ADMIN and ordinary accounts above Number precision can load prediction; bets and refunds keep every coin',async()=>{
 const f=await predictionSubsidyFixture({postgres:true});
 try{
  const event=await f.event();
  await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id IN (2,3)',LARGE);
  for(const [path,user] of [['admin/coin-prediction/state',2],['coin-prediction/state',2],['coin-prediction/state',3]]){
   const response=await f.call(path,{user});
   assert.equal(response.status,200,JSON.stringify(response));
   assert.ok(response.body.events.some(row=>Number(row.id)===event.id));
   assert.equal(response.body.totalWalletCoin,Number(LARGE));
   assert.equal(response.body.packageCoin,0);
  }
  assert.equal(await exactWallet(f),LARGE);
  assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',packageCoinKey(2)),null);
  const requestId=crypto.randomUUID(),body={eventId:event.id,optionId:event.options[0].id,amount:300000000000,requestId};
  const bet=await f.call('coin-prediction/bet',{user:2,body});
  assert.equal(bet.status,200,JSON.stringify(bet));
  assert.equal(await exactWallet(f),(BigInt(LARGE)-BigInt(body.amount)).toString());
  const replay=await f.call('coin-prediction/bet',{user:2,body});
  assert.equal(replay.body.replayed,true);
  assert.equal(await exactWallet(f),(BigInt(LARGE)-BigInt(body.amount)).toString());
  await f.api.settleCoinPrediction(f.env,event.id,0,true);
  assert.equal(await exactWallet(f),LARGE);
  const logs=await f.all('SELECT CAST(balance_after AS TEXT) AS balance_after FROM coin_logs WHERE user_id=2 ORDER BY id');
  assert.deepEqual(logs.map(row=>row.balance_after),[(BigInt(LARGE)-BigInt(body.amount)).toString(),LARGE]);
 }finally{await f.close();}
});

test('a one-coin concurrent change in a large wallet aborts the entire debit; a fresh snapshot succeeds',async()=>{
 const f=await predictionSubsidyFixture({postgres:true});
 try{
  await ensureJointAtomicSchema(f.env);
  await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=2',LARGE);
  const before=await readPackageCoinAccounting(f.env,2);
  await f.run('UPDATE users SET coin=coin-1 WHERE id=2');
  const changed=await exactWallet(f);
  assert.equal(Number(changed),Number(LARGE),'the one-coin difference is invisible to Number');
  await assert.rejects(f.env.DB.batch([
   ...packageCoinGuardStatements(f.env,2,before),
   f.env.DB.prepare('UPDATE users SET coin=coin-100000 WHERE id=2')
  ]));
  assert.equal(await exactWallet(f),changed);
  assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?',packageCoinKey(2)),null);
  const fresh=await readPackageCoinAccounting(f.env,2);
  await f.env.DB.batch([...packageCoinGuardStatements(f.env,2,fresh),f.env.DB.prepare('UPDATE users SET coin=coin-100000 WHERE id=2')]);
  assert.equal(await exactWallet(f),(BigInt(changed)-100000n).toString());
 }finally{await f.close();}
});

test('large ordinary ledger entries preserve package restrictions and exact affordability',async()=>{
 const f=await predictionSubsidyFixture({postgres:true});
 try{
  const state={version:1,revision:1,cursor:0,restricted:PACKAGE,auctionReserved:{},precredited:null};
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',packageCoinKey(2),JSON.stringify(state));
  await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=2',LARGE);
  await f.run('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(2,CAST(? AS BIGINT),CAST(? AS BIGINT),?)',LARGE,LARGE,'기존 일반 코인 지급');
  const large=await readPackageCoinAccounting(f.env,2);
  assert.equal(large.totalExact,LARGE);
  assert.equal(large.restricted,PACKAGE);
  assert.equal(large.availableExact,(BigInt(LARGE)-BigInt(PACKAGE)).toString());
  await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=2',String(BigInt(Number.MAX_SAFE_INTEGER)+1n));
  const nearLimit=await readPackageCoinAccounting(f.env,2),available=Number(nearLimit.availableExact);
  assert.doesNotThrow(()=>requirePredictionCoins(nearLimit,available));
  assert.throws(()=>requirePredictionCoins(nearLimit,available+1),error=>error.code==='PREDICTION_PACKAGE_COIN');
  await f.run('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(2,CAST(? AS BIGINT),0,?)','-50000000000000001','기존 일반 콘텐츠 소비');
  assert.equal((await readPackageCoinAccounting(f.env,2)).restricted,0);
  await f.run('UPDATE users SET coin=-1 WHERE id=2');
  await assert.rejects(readPackageCoinAccounting(f.env,2),/Invalid coin wallet/);
 }finally{await f.close();}
});
