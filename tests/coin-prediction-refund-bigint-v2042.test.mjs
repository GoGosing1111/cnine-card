import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {predictionPayoutStatements} from '../functions/_coin_prediction.js';

function fixture(amount){
  const db=new DatabaseSync(':memory:'),sources=[];
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER);
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE coin_prediction_bets(event_id INTEGER,user_id INTEGER,amount INTEGER,payout INTEGER DEFAULT 0,status TEXT DEFAULT 'ACTIVE',settled_at TEXT,updated_at TEXT,PRIMARY KEY(event_id,user_id));
    INSERT INTO users VALUES(1,1000);`);
  db.prepare('INSERT INTO coin_prediction_bets(event_id,user_id,amount) VALUES(1,1,?)').run(amount);
  let fail=false;
  const env={DB:{prepare(source){sources.push(source);return{bind(...values){return{run(){if(fail&&source.startsWith('UPDATE coin_prediction_bets'))throw new Error('INJECTED_FAILURE');return db.prepare(source).run(...values)}}}}},batch(statements){db.exec('BEGIN');try{for(const s of statements)s.run();db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}}}};
  return {db,env,sources,setFailure:value=>{fail=value}};
}

for(const amount of [2147483647,2147483648,10000000000,125000000000]){
  test(`환불 ${amount}: 지갑·로그·수령 상태 일치 및 중복 재시도 차단`,()=>{
    const {db,env,sources}=fixture(amount);
    try{
      const settle=()=>env.DB.batch(predictionPayoutStatements(env,{eventId:1,userId:1,payout:amount,voided:true}));
      settle();settle();
      assert.equal(db.prepare('SELECT coin FROM users').get().coin,1000+amount);
      const logs=db.prepare('SELECT * FROM coin_logs').all();assert.equal(logs.length,1);assert.equal(logs[0].change_amount,amount);assert.equal(logs[0].balance_after,1000+amount);
      const bet=db.prepare('SELECT * FROM coin_prediction_bets').get();assert.equal(bet.payout,amount);assert.equal(bet.status,'REFUNDED');
      assert.ok(sources.every(sql=>! /\?\s*>\s*0/.test(sql)),'PostgreSQL int4 추론을 유발하는 금액 비교 금지');
      assert.ok(sources.filter(sql=>sql.startsWith('INSERT INTO coin_logs')).every(sql=>sql.includes("status='ACTIVE'")));
    }finally{db.close()}
  });
}

test('큰 금액의 일반 정산과 미적중 0원 정산도 정상 처리',()=>{
  for(const payout of [10000000000,0]){
    const {db,env}=fixture(500000000);
    try{
      env.DB.batch(predictionPayoutStatements(env,{eventId:1,userId:1,payout}));
      assert.equal(db.prepare('SELECT coin FROM users').get().coin,1000+payout);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_logs').get().n,payout>0?1:0);
      const bet=db.prepare('SELECT * FROM coin_prediction_bets').get();assert.equal(bet.payout,payout);assert.equal(bet.status,'SETTLED');
    }finally{db.close()}
  }
});

test('환불 마지막 쓰기 실패 시 지갑·로그까지 롤백하고 재시도는 한 번만 지급',()=>{
  const {db,env,setFailure}=fixture(10000000000);
  try{
    const settle=()=>env.DB.batch(predictionPayoutStatements(env,{eventId:1,userId:1,payout:10000000000,voided:true}));
    setFailure(true);assert.throws(settle,/INJECTED_FAILURE/);
    assert.equal(db.prepare('SELECT coin FROM users').get().coin,1000);assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_logs').get().n,0);
    assert.equal(db.prepare('SELECT status FROM coin_prediction_bets').get().status,'ACTIVE');
    setFailure(false);settle();settle();assert.equal(db.prepare('SELECT coin FROM users').get().coin,10000001000);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_logs').get().n,1);
  }finally{db.close()}
});

test('음수·소수·안전 정수 초과 지급액은 SQL 실행 전에 거부',()=>{
  const env={DB:{prepare(){throw new Error('SQL must not run')}}};
  for(const payout of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>predictionPayoutStatements(env,{eventId:1,userId:1,payout}),/허용 범위/);
});
