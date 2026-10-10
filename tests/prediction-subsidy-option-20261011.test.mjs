import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {predictionSubsidyFixture} from './helpers/prediction-subsidy-fixture.mjs';
const context={window:{}};
vm.runInNewContext(readFileSync(new URL('../js/coin-prediction-model-v2033.js',import.meta.url),'utf8'),context);
const model=context.window.CoinPredictionModel;

test('지원금 선택 항목 합계는 CMS·기존 지원금을 표시하고 다른 선택지와 배팅 원본을 보존한다',()=>{
  const event={status:'OPEN',cms_subsidy:50000000000,treasury_subsidy:10000000000};
  const support={label:'지원금',total_bet:5000000},normal={label:'T1',total_bet:10000000};
  const before=JSON.stringify([event,support,normal]);
  assert.equal(model.optionFunding(event,support).total,60005000000);
  assert.equal(model.optionFunding(event,normal).total,10000000);
  assert.equal(model.optionFunding(event,{...support,label:'  지원금  '}).cms,50000000000);
  assert.equal(model.optionFunding(event,{...support,label:'지원금 승리'}).cms,0);
  assert.equal(model.optionFunding({...event,status:'VOID'},support).total,5000000);
  assert.equal(model.optionFunding({status:'OPEN'},support).total,5000000);
  assert.equal(JSON.stringify([event,support,normal]),before);
});

test('CMS 저장→양쪽 화면 합계→중복 요청→정산에서 지원금은 한 번만 계산한다',async t=>{
  const f=await predictionSubsidyFixture({postgres:true});t.after(()=>f.close());
  const event=await f.event({title:'T1 vs DC · 지원금 선택지 검수'});
  await f.run("INSERT INTO coin_prediction_options(event_id,label,sort_order) VALUES(?,'지원금',2)",event.id);
  const support=await f.one("SELECT * FROM coin_prediction_options WHERE event_id=? AND label='지원금'",event.id);
  for(const [user,optionId,amount] of [[3,event.options[0].id,10000000],[4,event.options[1].id,20000000],[5,support.id,5000000]]){
    assert.equal((await f.call('coin-prediction/bet',{user,body:{eventId:event.id,optionId:Number(optionId),amount,requestId:crypto.randomUUID()}})).status,200);
  }
  const snapshot=()=>f.all('SELECT user_id,option_id,amount FROM coin_prediction_bets WHERE event_id=? ORDER BY user_id',event.id);
  const before=await snapshot(),requestId=crypto.randomUUID();
  assert.equal((await f.add(event.id,50000000000,{requestId})).status,200);
  assert.equal((await f.add(event.id,50000000000,{requestId})).body.replayed,true);
  for(const path of ['admin/coin-prediction/state','coin-prediction/state']){
    const state=(await f.call(path,{user:path.startsWith('admin')?2:3})).body;
    const listed=state.events.find(e=>Number(e.id)===event.id),option=listed.options.find(o=>Number(o.id)===Number(support.id));
    assert.equal(model.optionFunding(listed,option).total,50005000000);
    assert.equal(Number(option.total_bet),5000000);
    assert.equal(Number(listed.total_pool),35000000);
    assert.equal(Number(listed.participant_count),3);
    if(!path.startsWith('admin'))assert.equal(model.estimate(listed,Number(event.options[0].id)).payout,50031500000);
  }
  assert.deepEqual(await snapshot(),before);
  assert.equal(Number((await f.one("SELECT COUNT(*) n FROM admin_logs WHERE action_type='COIN_PREDICTION_SUBSIDY'")).n),1);
  assert.equal((await f.call('admin/coin-prediction/action',{body:{eventId:event.id,action:'CLOSE'}})).status,200);
  assert.equal((await f.call('admin/coin-prediction/action',{body:{eventId:event.id,action:'SETTLE',optionId:Number(event.options[0].id)}})).status,200);
  assert.equal(Number((await f.one('SELECT payout FROM coin_prediction_bets WHERE event_id=? AND user_id=3',event.id)).payout),50031500000);
});
