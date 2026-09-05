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
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER,role TEXT,status TEXT);
CREATE TABLE coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO users VALUES(1,'운영 테스트',900000000000,'OWNER','ACTIVE'),(2,'유저 테스트',2000000000,'USER','ACTIVE');`);
const audit=[];
const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},first(){return db.prepare(sql).get(...args)||null;},all(){return{results:db.prepare(sql).all(...args)};},run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};},batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}}};
async function request(path,body,role='OWNER'){
  const request=new Request('https://prediction.test/api/'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json'}}:{})});
  const deps={authenticate:async()=>db.prepare('SELECT * FROM users WHERE id=?').get(role==='OWNER'?1:2),requirePermission:async()=>role==='OWNER',isAdminRole:u=>u.role==='OWNER',readBody:r=>r.json(),json:(data,status=200)=>Response.json(data,{status}),writeAdminLog:async(...args)=>audit.push(args.slice(2))};
  const response=await handleCoinPrediction({path:path.split('?')[0],request,env,deps});return{status:response.status,body:await response.json()};
}
await request('coin-prediction/state');
const close=new Date(Date.now()+86400000).toISOString();
for(let i=1;i<=29;i++){
  db.prepare("INSERT INTO coin_prediction_events(id,title,status,closes_at,total_pool) VALUES(?,?,'OPEN',?,30000000)").run(i,'테스트 경기 '+i,close);
  db.prepare('INSERT INTO coin_prediction_options(id,event_id,label,total_bet,bet_count) VALUES(?,?,?,10000000,1),(?,?,?,20000000,1)').run(i*10+1,i,'선택 A',i*10+2,i,'선택 B');
  if(i<29)db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(PREDICTION_CATEGORY_PREFIX+i,i<=20?'SOCCER':PREDICTION_CATEGORIES[(i-21)%PREDICTION_CATEGORIES.length]);
  if(i%2===0)db.prepare('INSERT INTO coin_prediction_bets(event_id,user_id,option_id,amount) VALUES(?,1,?,1000000)').run(i,i*10+1);
}

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
test('집계 전·단독 참여 0.9배·소수점·5억·OWNER 대형 금액 경계',()=>{
  const e={total_pool:0,options:[{id:1,total_bet:0}]};assert.equal(model.estimate(e,1).payout,null);assert.equal(model.estimate(e,1).odds,null);
  assert.equal(model.estimate(e,1,100000).payout,90000);assert.equal(model.estimate(e,1,100000).profit,-10000);
  for(const stake of [100000,500000000,125000000000]){
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
test('서버 카테고리 필터는 LIMIT 이전에 적용·12개 이상 페이지·범위 보정',async()=>{
  const first=await request('coin-prediction/state?view=active&category=SOCCER&page=1');assert.equal(first.status,200);assert.equal(first.body.events.length,12);assert.equal(first.body.navigation.total,22);assert.equal(first.body.navigation.totalPages,2);
  assert.ok(first.body.events.every(e=>e.category==='SOCCER'));assert.equal(first.body.navigation.categoryCounts.ALL,29);
  const second=await request('coin-prediction/state?category=SOCCER&page=99');assert.equal(second.body.navigation.page,2);assert.equal(second.body.events.length,10);
});
test('내 배팅 필터는 모든 페이지·종목에 적용, 미분류 기타 호환',async()=>{
  const mine=await request('coin-prediction/state?category=SOCCER&mine=1');assert.equal(mine.status,200);assert.equal(mine.body.navigation.total,11);assert.ok(mine.body.events.every(e=>e.myBet));
  const other=await request('coin-prediction/state?category=OTHER');assert.ok(other.body.events.some(e=>e.id===29));
  const nobody=await request('coin-prediction/state?mine=1',null,'USER');assert.equal(nobody.body.navigation.total,0);
});
test('CMS 등록 시 카테고리 저장·구 CMS 누락 입력은 기타·잘못된 값 거부',async()=>{
  const good=await request('admin/coin-prediction/event',{title:'분류 신규',category:'LOL',closesAt:close,options:['A','B']});assert.equal(good.status,200);
  assert.equal(db.prepare('SELECT value FROM app_meta WHERE key=?').get(PREDICTION_CATEGORY_PREFIX+good.body.id).value,'LOL');
  const legacy=await request('admin/coin-prediction/event',{title:'레거시 호환',closesAt:close,options:['A','B']});assert.equal(legacy.status,200);assert.equal(db.prepare('SELECT value FROM app_meta WHERE key=?').get(PREDICTION_CATEGORY_PREFIX+legacy.body.id).value,'OTHER');
  const invalid=await request('admin/coin-prediction/event',{title:'잘못된 종목',category:'NOT_REAL',closesAt:close,options:['A','B']});assert.equal(invalid.status,400);
});
test('CMS 기존 경기 분류 변경은 금액·배당·선택·수령 기록 불변, 권한 검사',async()=>{
  const before=JSON.stringify([db.prepare('SELECT * FROM coin_prediction_events WHERE id=2').get(),db.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=2').all(),db.prepare('SELECT * FROM coin_prediction_options WHERE event_id=2').all(),db.prepare('SELECT * FROM users').all()]);
  assert.equal((await request('admin/coin-prediction/category',{eventId:2,category:'LOL'},'USER')).status,403);
  assert.equal((await request('admin/coin-prediction/category',{eventId:2,category:'INVALID'})).status,400);
  assert.equal((await request('admin/coin-prediction/category',{eventId:999999,category:'LOL'})).status,404);
  assert.equal((await request('admin/coin-prediction/category',{eventId:2,category:'LOL'})).status,200);
  const after=JSON.stringify([db.prepare('SELECT * FROM coin_prediction_events WHERE id=2').get(),db.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=2').all(),db.prepare('SELECT * FROM coin_prediction_options WHERE event_id=2').all(),db.prepare('SELECT * FROM users').all()]);assert.equal(after,before);
  assert.ok(audit.some(x=>x[0]==='COIN_PREDICTION_CATEGORY'));
  const listed=await request('admin/coin-prediction/state?category=LOL');assert.ok(listed.body.events.some(e=>e.id===2));assert.ok(listed.body.events.every(e=>e.category==='LOL'));
});
test('필터 개편 이후 기존 배팅·같은 선택 추가·요청 재시도·상한 유지',async()=>{
  const payload={eventId:1,optionId:11,amount:1000000,requestId:'matchday-bet-2033'};
  const coinBefore=db.prepare('SELECT coin FROM users WHERE id=2').get().coin;
  assert.equal((await request('coin-prediction/bet',payload,'USER')).status,200);
  const replay=await request('coin-prediction/bet',payload,'USER');assert.equal(replay.body.replayed,true);
  assert.equal(db.prepare('SELECT coin FROM users WHERE id=2').get().coin,coinBefore-1000000);
  assert.equal((await request('coin-prediction/bet',{...payload,requestId:'different-option',optionId:12},'USER')).status,409);
  assert.equal((await request('coin-prediction/bet',{...payload,requestId:'over-event-limit',amount:500000000},'USER')).status,400);
  assert.equal((await request('coin-prediction/bet',{...payload,requestId:'additional-ok'},'USER')).status,200);
});
test('기존 마감·정산식·무효 환불 경로는 새 UI와 그대로 호환',async()=>{
  const created=await request('admin/coin-prediction/event',{title:'정산 검증',category:'BASEBALL',closesAt:close,options:['승','패']}),id=created.body.id;
  const option=db.prepare('SELECT id FROM coin_prediction_options WHERE event_id=? ORDER BY id').get(id).id;
  await request('coin-prediction/bet',{eventId:id,optionId:option,amount:1000000,requestId:'settlement-bet-2033'},'USER');
  assert.equal((await request('admin/coin-prediction/action',{eventId:id,action:'CLOSE'})).status,200);
  assert.equal((await request('admin/coin-prediction/action',{eventId:id,optionId:option,action:'SETTLE'})).status,200);
  assert.equal(db.prepare('SELECT payout FROM coin_prediction_bets WHERE event_id=? AND user_id=2').get(id).payout,900000);
  assert.equal((await request('admin/coin-prediction/action',{eventId:1,action:'VOID'})).status,200);
  const refunded=db.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=1 AND user_id=2').get();assert.equal(refunded.payout,refunded.amount);assert.equal(refunded.status,'REFUNDED');
  const history=await request('coin-prediction/state?view=history&category=SOCCER&mine=1',null,'USER');assert.ok(history.body.events.some(e=>e.id===1));assert.equal(history.body.navigation.historyRetentionHours,24);
});
test('개편 UI 리소스 격리·확정/예상 구분·접근성·폴링 수명 계약',()=>{
  const ui=read('js/coin-prediction-v2033.js'),css=read('css/coin-prediction-v2033.css'),app=read('js/app.js'),admin=read('admin/coin-prediction-admin-v1.js');
  for(const word of ['내 배팅만','적중 시 예상 수령액','원금 포함','실제 수령액','최초 선택','showModal','requestSequence!==sequence','settings?.pollSeconds'])assert.ok(ui.includes(word),word);
  assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('max-width:560px'));assert.ok(css.includes(':focus-visible'));
  assert.match(app,/styles:\['css\/coin-prediction-v2033\.css/);assert.match(app,/coin-prediction-model-v2033\.js.*coin-prediction-v2033\.js/);
  assert.match(admin,/admin\/coin-prediction\/category/);assert.match(admin,/cpAdminCategory/);
  assert.match(ui,/id="coinPredictionRoot"/,'V21 화면 경로 식별자를 유지한다');
  assert.doesNotMatch(ui,/cp3-event-image|event\.image_url|function imageUrl/,'레거시 경기 이미지가 있어도 렌더링하지 않는다');
  assert.doesNotMatch(css,/\.cp3-event-image/);
  assert.match(css,/\.cp3-event-head\{[^}]*grid-template-columns:minmax\(0,1fr\);/,'제목은 이미지 자리까지 사용한다');
  assert.doesNotMatch(ui,/battle-v3|Pixi|setBattlefield/);
});

test('스타 경기 CMS 등록·기존 분류 변경·유저/CMS 조회가 실제 SQL에 반영된다',async()=>{
  const created=await request('admin/coin-prediction/event',{title:'스타 신규 경기',category:'STARCRAFT',closesAt:close,options:['테란','저그']});
  assert.equal(created.status,200);const id=created.body.id;
  assert.equal(db.prepare('SELECT value FROM app_meta WHERE key=?').get(PREDICTION_CATEGORY_PREFIX+id).value,'STARCRAFT');
  const before=JSON.stringify([db.prepare('SELECT * FROM coin_prediction_events WHERE id=3').get(),db.prepare('SELECT * FROM coin_prediction_options WHERE event_id=3').all(),db.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=3').all(),db.prepare('SELECT * FROM users').all()]);
  assert.equal((await request('admin/coin-prediction/category',{eventId:3,category:'STARCRAFT'},'USER')).status,403);
  assert.equal((await request('admin/coin-prediction/category',{eventId:3,category:'STARCRAFT'})).status,200);
  assert.equal(JSON.stringify([db.prepare('SELECT * FROM coin_prediction_events WHERE id=3').get(),db.prepare('SELECT * FROM coin_prediction_options WHERE event_id=3').all(),db.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=3').all(),db.prepare('SELECT * FROM users').all()]),before);
  for(const path of ['coin-prediction/state','admin/coin-prediction/state']){
    const listed=await request(path+'?category=STARCRAFT');assert.equal(listed.status,200);assert.equal(listed.body.navigation.category,'STARCRAFT');
    assert.ok(listed.body.events.some(e=>e.id===id));assert.ok(listed.body.events.some(e=>e.id===3));assert.ok(listed.body.events.every(e=>e.category==='STARCRAFT'));
    assert.equal(listed.body.navigation.categoryCounts.STARCRAFT,listed.body.navigation.total);
    const other=await request(path+'?category=OTHER');assert.ok(other.body.events.every(e=>e.category==='OTHER'&&e.id!==id&&e.id!==3));
  }
});
