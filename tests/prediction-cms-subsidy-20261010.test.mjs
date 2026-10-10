import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {predictionSubsidyFixture} from './helpers/prediction-subsidy-fixture.mjs';
const LIMIT=5000000000000;
const context={window:{}};vm.runInNewContext(readFileSync(new URL('../js/coin-prediction-model-v2033.js',import.meta.url),'utf8'),context);

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: CMS 지원금 권한·5조·거래·실제 배당/정산`,async t=>{
  const f=await predictionSubsidyFixture({postgres});t.after(()=>f.close());
  await t.test('ADMIN/OWNER 허용, 권한을 가진 하위 역할도 거부, 정수 입력·5조 누적 제한',async()=>{
    const e=await f.event(),body={eventId:e.id,amount:1,expectedTotal:0,note:'권한 확인',requestId:crypto.randomUUID()};
    for(const user of [3,4])assert.equal((await f.call('admin/coin-prediction/subsidy',{user,body})).status,403);
    for(const amount of [0,-1,.5,LIMIT+1,Number.MAX_SAFE_INTEGER+1,'100000000'])assert.equal((await f.add(e.id,amount)).status,400);
    assert.equal((await f.add(e.id,LIMIT-1)).status,200);
    assert.equal((await f.call('admin/coin-prediction/subsidy',{user:1,body:{...body,amount:1,expectedTotal:LIMIT-1}})).status,200);
    assert.equal((await f.add(e.id,1,{expectedTotal:LIMIT})).status,400);
    const state=await f.call('admin/coin-prediction/state');assert.equal(state.body.subsidyPolicy.canManage,true);assert.equal(state.body.subsidyPolicy.limit,LIMIT);
    assert.equal(state.body.events.find(x=>Number(x.id)===e.id).cms_subsidy,LIMIT);
    assert.equal(Boolean(state.body.events.find(x=>Number(x.id)===e.id).subsidy_locked),false);
    assert.equal((await f.call('admin/coin-prediction/state',{user:4})).body.subsidyPolicy.canManage,false);
  });
  await t.test('같은 요청은 한 번만 반영, 변조·오래된 금액·동시 요청은 재지급 없음',async()=>{
    const e=await f.event(),requestId=crypto.randomUUID();
    assert.equal((await f.add(e.id,100,{requestId})).status,200);
    assert.equal((await f.add(e.id,100,{requestId})).body.replayed,true);
    assert.equal((await f.add(e.id,101,{requestId})).status,409);
    assert.equal((await f.add(e.id,1,{expectedTotal:0})).status,409);
    const results=await Promise.all([f.add(e.id,200,{expectedTotal:100}),f.add(e.id,200,{expectedTotal:100})]);assert.equal(results.filter(x=>x.status===200).length,1);
    assert.equal(Number((await f.one('SELECT value FROM app_meta WHERE key=?','coin_prediction_cms_subsidy_v1:'+e.id)).value),300);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM admin_logs WHERE target_id=?',String(e.id))).n),2);
  });
  await t.test('감사 저장 실패는 지원금·영수증도 롤백, 커밋 응답 손실도 재시도 한 번',async()=>{
    const e=await f.event(),requestId=crypto.randomUUID();f.fail('INSERT INTO admin_logs');
    await assert.rejects(()=>f.add(e.id,100,{requestId}),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?','coin_prediction_cms_subsidy_v1:'+e.id),null);
    assert.equal(await f.one('SELECT value FROM app_meta WHERE key=?','coin_prediction_cms_subsidy_receipt_v1:2:'+requestId),null);
    f.loseReply();const result=await f.add(e.id,100,{requestId});assert.equal(result.status,200);assert.equal(result.body.replayed,true);
    assert.equal((await f.add(e.id,100,{requestId})).body.replayed,true);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM admin_logs WHERE target_id=?',String(e.id))).n),1);
  });
  await t.test('마감 후 정산 전 허용, 정산 잠금·부분 정산·종료 경기 차단',async()=>{
    const e=await f.event({status:'CLOSED'});assert.equal((await f.add(e.id,100)).status,200);
    await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','coin_prediction_lock_event_'+e.id,'locked|'+(Date.now()+60000));
    const locked=await f.add(e.id,1,{expectedTotal:100});assert.equal(locked.status,409);assert.equal(locked.body.code,'PREDICTION_SUBSIDY_BUSY');
    await f.run('DELETE FROM app_meta WHERE key=?','coin_prediction_lock_event_'+e.id);
    await f.run("INSERT INTO coin_prediction_bets(event_id,user_id,option_id,amount,status) VALUES(?,3,?,100000,'SETTLED')",e.id,e.options[0].id);
    assert.equal((await f.add(e.id,1,{expectedTotal:100})).status,409);
    const partial=await f.call('admin/coin-prediction/state?view=history');assert.equal(Boolean(partial.body.events.find(x=>Number(x.id)===e.id).subsidy_locked),true);
    for(const status of ['SETTLED','VOID','DRAFT']){await f.run('UPDATE coin_prediction_events SET status=? WHERE id=?',status,e.id);assert.equal((await f.add(e.id,1,{expectedTotal:100})).status,409);}
  });
  await t.test('5조 지원금과 10% 수수료를 실제 적중 비율로 정확히 지급',async()=>{
    const e=await f.event();
    for(const [user,amount] of [[3,100001],[5,200003]])assert.equal((await f.call('coin-prediction/bet',{user,body:{eventId:e.id,optionId:Number(e.options[0].id),amount,requestId:crypto.randomUUID()}})).status,200);
    assert.equal((await f.add(e.id,LIMIT)).status,200);
    const publicState=await f.call('coin-prediction/state',{user:3}),listed=publicState.body.events.find(x=>Number(x.id)===e.id);assert.equal(listed.total_subsidy,LIMIT);
    const expected=Number(5000000270003n*100001n/300004n);assert.equal(context.window.CoinPredictionModel.estimate(listed,Number(e.options[0].id)).payout,expected);
    await f.call('admin/coin-prediction/action',{body:{eventId:e.id,action:'CLOSE'}});
    assert.equal((await f.call('admin/coin-prediction/action',{body:{eventId:e.id,action:'SETTLE',optionId:Number(e.options[0].id)}})).status,200);
    assert.equal(Number((await f.one('SELECT payout FROM coin_prediction_bets WHERE event_id=? AND user_id=3',e.id)).payout),expected);
    assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=3')).coin),1000000000-100001+expected);
    assert.equal(Number((await f.one('SELECT balance FROM administration_treasury_v2030 WHERE id=1')).balance),1000);
  });
  await t.test('기존 지원금도 한도에 포함, 무효는 참여금만 환불하고 CMS 지원금을 금고에 넣지 않음',async()=>{
    const e=await f.event();await f.run("INSERT INTO administration_prediction_subsidies_v2030 VALUES(?,?,300,'ACTIVE',NULL)",'old-'+e.id,e.id);
    assert.equal((await f.add(e.id,LIMIT,{expectedTotal:300})).status,400);assert.equal((await f.add(e.id,LIMIT-300,{expectedTotal:300})).status,200);
    const before=Number((await f.one('SELECT coin FROM users WHERE id=3')).coin);
    await f.call('coin-prediction/bet',{user:3,body:{eventId:e.id,optionId:Number(e.options[0].id),amount:100000,requestId:crypto.randomUUID()}});
    assert.equal((await f.call('admin/coin-prediction/action',{body:{eventId:e.id,action:'VOID'}})).status,200);
    assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=3')).coin),before);
    assert.equal(Number((await f.one('SELECT balance FROM administration_treasury_v2030 WHERE id=1')).balance),1300);
    const state=await f.call('coin-prediction/state?view=history'),row=state.body.events.find(x=>Number(x.id)===e.id);assert.equal(row.cms_subsidy,0);assert.equal(row.total_subsidy,0);
  });
});
