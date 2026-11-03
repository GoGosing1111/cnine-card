import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleCoinPrediction } from '../functions/_coin_prediction.js';
import { PREDICTION_CATEGORIES,PREDICTION_CATEGORY_PREFIX,predictionFilterSql } from '../functions/_coin_prediction_categories.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(read('js/coin-prediction-model-v2033.js'),context);
const model=context.window.CoinPredictionModel;
test('카테고리 7종은 유저/CMS/서버가 동일하고 스타는 기타 바로 앞이며 SQL은 바인딩한다',()=>{
  assert.deepEqual(Array.from(model.categories,c=>c.code),Array.from(PREDICTION_CATEGORIES));
  assert.deepEqual(Array.from(model.categories.slice(-2),c=>[c.code,c.label]),[['STARCRAFT','스타'],['OTHER','기타']]);
  assert.equal(model.category('unknown').code,'OTHER');
  const filters=predictionFilterSql({category:"SOCCER' OR 1=1 --",mine:true},2);
  assert.deepEqual(filters.binds,['OTHER',2]);assert.ok(!filters.sql.includes('OR 1=1'));
});
test('공통 풀 10%·지원금·원금 포함·순이익 계산',()=>{
  const e={total_pool:30000000,treasury_subsidy:3000000,fee_percent:10,options:[{id:1,total_bet:10000000}],myBet:{option_id:1,amount:1000000,status:'ACTIVE'}};
  const r=model.estimate(e,1);assert.equal(r.odds,3);assert.equal(r.payout,3000000);assert.equal(r.profit,2000000);
  const extra=model.estimate(e,1,1000000);assert.equal(extra.pool,31000000);assert.equal(extra.optionPool,11000000);assert.equal(extra.stake,2000000);assert.equal(extra.payout,Math.floor(30900000*2000000/11000000));
  assert.equal(model.estimate(e,2),null);
});
test('집계 전·단독 참여 0.9배·소수점·50억·OWNER 대형 금액 경계',()=>{
  const e={total_pool:0,options:[{id:1,total_bet:0}]};assert.equal(model.estimate(e,1).payout,null);assert.equal(model.estimate(e,1).odds,null);
  assert.equal(model.estimate(e,1,100000).payout,90000);assert.equal(model.estimate(e,1,100000).profit,-10000);
  for(const stake of [100000,2000000000,5000000000,125000000000]){
    const event={total_pool:stake*3+1,treasury_subsidy:333333,fee_percent:10,options:[{id:1,total_bet:stake+3}],myBet:{option_id:1,amount:stake,status:'ACTIVE'}};
    assert.equal(model.estimate(event,1).payout,Math.floor((Math.floor(event.total_pool*(100-10)/100)+333333)*stake/(stake+3)));
  }
});
test('정산·미적중·VOID 환불은 예상 대신 실제 payout을 표시한다',()=>{
  const event={status:'SETTLED',options:[{id:1,total_bet:9000000}],total_pool:15000000,myBet:{option_id:1,amount:1000000,payout:1456789,status:'SETTLED'}};
  assert.equal(model.outcome(event).payout,1456789);assert.equal(model.outcome(event).final,true);
  event.myBet.payout=0;assert.equal(model.outcome(event).won,false);assert.equal(model.outcome(event).profit,-1000000);
  event.status='VOID';event.myBet.status='REFUNDED';event.myBet.payout=1000000;
  assert.equal(model.outcome(event).refunded,true);assert.equal(model.outcome(event).profit,0);
});
test('개편 UI 리소스 격리·확정/예상 구분·접근성·폴링 수명 계약',()=>{
  const ui=read('js/coin-prediction-v2033.js'),css=read('css/coin-prediction-v2033.css'),app=read('js/app.js'),admin=read('admin/coin-prediction-admin-v1.js');
  for(const word of ['내 배팅만','적중 시 예상 수령액','원금 포함','실제 수령액','최초 선택','showModal','requestSequence!==sequence','settings?.pollSeconds'])assert.ok(ui.includes(word),word);
  assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('max-width:560px'));assert.ok(css.includes(':focus-visible'));
  assert.doesNotMatch(app,/styles:\['css\/coin-prediction-v2033\.css/);assert.doesNotMatch(app,/coin-prediction-model-v2033\.js.*coin-prediction-v2033\.js/);
  assert.match(admin,/admin\/coin-prediction\/category/);assert.match(admin,/cpAdminCategory/);
  assert.match(ui,/id="coinPredictionRoot"/,'V21 화면 경로 식별자를 유지한다');
  assert.doesNotMatch(ui,/cp3-event-image|event\.image_url|function imageUrl/,'레거시 경기 이미지가 있어도 렌더링하지 않는다');
  assert.doesNotMatch(css,/\.cp3-event-image/);
  assert.match(css,/\.cp3-event-head\{[^}]*grid-template-columns:minmax\(0,1fr\);/,'제목은 이미지 자리까지 사용한다');
  assert.doesNotMatch(ui,/battle-v3|Pixi|setBattlefield/);
});

// The archived estimates/renderer remain available as source, but November 3
// retirement supersedes registration, betting, filtering and all settlements.
test('all former prediction entry points return 410 before auth, schema or settlement and preserve existing history',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER);INSERT INTO users VALUES(1,900000000000),(2,2000000000);
   CREATE TABLE coin_prediction_events(id INTEGER PRIMARY KEY,status TEXT,total_pool INTEGER);INSERT INTO coin_prediction_events VALUES(1,'OPEN',30000000),(2,'SETTLED',50000000);
   CREATE TABLE coin_prediction_bets(event_id INTEGER,user_id INTEGER,amount INTEGER,payout INTEGER,status TEXT);INSERT INTO coin_prediction_bets VALUES(1,2,1000000,0,'ACTIVE'),(2,2,1000000,2500000,'SETTLED');`);
  const snapshot=()=>['users','coin_prediction_events','coin_prediction_bets'].map(table=>db.prepare('SELECT * FROM '+table).all());
  const before=snapshot(),forbidden=new Proxy({},{get(){throw Error('Retired prediction accessed runtime/auth/database');}});
  for(const path of ['coin-prediction/state','coin-prediction/bet','admin/coin-prediction/state','admin/coin-prediction/event','admin/coin-prediction/category','admin/coin-prediction/action','admin/coin-prediction/settings']){
   for(const method of ['GET','POST']){
    const request=new Request('https://qa.test/api/'+path+'?view=history&category=SOCCER&mine=1&page=99',{method,...(method==='POST'?{body:JSON.stringify({eventId:1,action:'VOID',amount:300000000000,requestId:'old-request'})}:{})});
    const response=await handleCoinPrediction({path,request,env:forbidden,deps:{...Object.fromEntries(['authenticate','requirePermission','readBody','writeAdminLog'].map(name=>[name,()=>{throw Error(name)}])),json:(body,status)=>Response.json(body,{status})}});
    assert.equal(response.status,410);assert.equal((await response.json()).code,'COIN_PREDICTION_RETIRED');
   }
  }
  assert.deepEqual(snapshot(),before);
 }finally{db.close();}
});
