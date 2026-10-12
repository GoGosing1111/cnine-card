import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,assignedCityRole} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings,handleCityCms} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {defaultCityRoundRewards,validateCityRoundRewards,rankCityRoundCandidates} from '../shared/jokgak-city-round-rewards-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {settleCityRound} from '../functions/_jokgak_city_round.js';
import {prepareCityTopSettlement,CITY_TOP_CURSOR} from '../functions/_jokgak_city_top.js';
import {cityRoundRewardPolicyKey,cityRoundRewardReceiptKey} from '../functions/_jokgak_city_round_rewards.js';
import {claimCityMessageReward} from '../functions/_jokgak_city_message_reward.js';
async function settleAndClaim(env,now,options){
  const result=await settleCityRound(env,now,options);
  for(const row of (await env.DB.prepare("SELECT * FROM user_message_rewards WHERE reward_type='JOKGAK_CITY_REWARD' AND claimed_at IS NULL").all()).results)await claimCityMessageReward(env,{id:Number(row.user_id)},row,Number(row.message_id));
  return result;
}
const owner={id:80,role:'OWNER'};
const policy=f=>readCitySettings(f.env).then(x=>x.policy);
const save=(f,value)=>saveCitySettings(f.env,owner,value,f.now);
const count=async(f,table)=>Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n);
const balance=async(f,id)=>Number((await f.p('SELECT coin FROM users WHERE id=?',id).first()).coin);
const receipt=async(f,epoch)=>{const row=await f.p('SELECT value FROM app_meta WHERE key=?',cityRoundRewardReceiptKey(epoch)).first();return row?JSON.parse(row.value):null;};
async function cash(f,id,value){const key=cityLifeKey(id),life=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);life.wallets.ON.balance=value;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(life),key).run();}
const reset=f=>f.p("UPDATE jokgak_city_players_v1 SET next_action_at=0,protected_until=0,health=100,jailed_until=0,location='MARKET'").run();
async function fixture(t,pg,edit=()=>{}){
  const f=await cityFixture(t,pg),v=await policy(f);
  v.roundRewards.participation={enabled:true,minAttacks:3,coin:100,items:[{code:'CITY_TEST_ITEM',quantity:2}]};
  v.roundRewards.top5.enabled=true;v.roundRewards.top5.ranks.forEach((r,i)=>{r.coin=(5-i)*1000;});
  edit(v);await save(f,v);f.setTime(cityShift(f.now).endsAt+60000);return f;
}
test('round reward policy safely defaults OFF, validates qualification and all five ranks, and uses competition ties',()=>{
  const old=defaultCitySettings();delete old.roundRewards;assert.deepEqual(validateCitySettings(old).roundRewards,defaultCityRoundRewards());
  const bad=mutate=>{const v=defaultCityRoundRewards();mutate(v);assert.throws(()=>validateCityRoundRewards(v),/보상|순위|공격|코인|아이템/);};
  bad(v=>v.participation.minAttacks=-1);bad(v=>v.participation.minAttacks=1.5);bad(v=>v.participation.enabled=true);
  bad(v=>v.top5.ranks.pop());bad(v=>v.top5.ranks[0].rank=2);bad(v=>v.top5.ranks[0].coin=5000000000001);bad(v=>v.top5.enabled=true);
  bad(v=>v.top5.ranks[0].items=[{code:'X',quantity:1},{code:'X',quantity:2}]);bad(v=>v.participation.items=[null]);
  assert.deepEqual(rankCityRoundCandidates([9,8,8,7,6,6,5].map((cash,i)=>({id:i+1,cash}))).map(r=>r.rank),[1,2,2,4,5,5,7]);
});
for(const pg of [false,true]){const db=pg?'Postgres':'SQLite';
  test(db+': OWNER CMS saves thresholds and prizes, preserves existing settings/legacy edits and rejects stale or inactive-item settings',async t=>{
    const f=await cityFixture(t,pg),v=await policy(f),base=structuredClone(v);v.roundRewards.participation={enabled:true,minAttacks:7,coin:5000000000000,items:[]};v.roundRewards.top5.ranks[4].items=[{code:'CITY_TEST_ITEM',quantity:1}];v.roundRewards.top5.enabled=true;
    await assert.rejects(saveCitySettings(f.env,{id:1,role:'ADMIN'},v,f.now),/OWNER/);
    const saved=await save(f,v);assert.deepEqual(saved.roundRewards,v.roundRewards);for(const key of ['mode','career','roles','rewards','cash'])assert.deepEqual(saved[key],base[key]);
    const stale=structuredClone(v);await assert.rejects(save(f,stale),/다른 창/);
    const legacy=await policy(f);delete legacy.roundRewards;await save(f,legacy);assert.deepEqual((await policy(f)).roundRewards,v.roundRewards);
    const bad=await policy(f);bad.roundRewards.top5.ranks[4].items[0].code='OFF_ITEM';await assert.rejects(save(f,bad),/지급 가능한/);
    const response=await handleCityCms({path:'admin/jokgak-city',request:new Request('https://test/api/admin/jokgak-city'),env:f.env,user:owner,deps:{json:data=>data,now:()=>f.now}});assert.deepEqual(response.policy.roundRewards,v.roundRewards);
  });
  test(db+': only completed outgoing ON attacks count, retries/defense/arrest/TEST do not; participation and cash rank stack once',async t=>{
    const f=await fixture(t,pg);await f.join(1);await f.join(2);const epoch=cityShift(f.now).id;
    for(const winner of ['A','B','DRAW']){
      await reset(f);f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner}},mode:'PVP'});
      const body={requestId:crypto.randomUUID(),epoch,targetId:2};const attack=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);assert.equal(attack.cityMode,'ON');
      assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).replayed,true);
      if(winner==='A'){const {cityMode,...legacy}=attack;await f.p('UPDATE jokgak_city_actions_v1 SET result_json=? WHERE request_id=?',JSON.stringify(legacy),body.requestId).run();}
    }
    await assert.rejects(f.action(1,'attack',{targetId:2}),/대기|기다려|전황|보호/);
    let police;for(let id=3;id<=80;id++)if(await assignedCityRole(f.env,id,epoch)==='POLICE'){police=id;break;}
    await f.join(police);await reset(f);await f.p('UPDATE jokgak_city_players_v1 SET wanted=2 WHERE user_id=2').run();await f.action(police,'arrest',{targetId:2});
    const testMode=await policy(f);testMode.mode='TEST';testMode.testUserIds=[1,2];await save(f,testMode);await reset(f);await f.action(1,'attack',{targetId:2});const on=await policy(f);on.mode='ON';await save(f,on);
    await cash(f,1,100);await cash(f,2,999);await cash(f,police,50);await f.action(1,'leave');
    await settleAndClaim(f.env,cityShift(f.now).endsAt);const r=await receipt(f,epoch),one=r.recipients.find(r=>r.userId===1),two=r.recipients.find(r=>r.userId===2),officer=r.recipients.find(r=>r.userId===police);
    assert.equal(one.attacks,3);assert.deepEqual(one.kinds,['PARTICIPATION','TOP5']);assert.equal(one.coin,4100);assert.equal(one.rank,2);
    assert.equal(two.attacks,0);assert.deepEqual(two.kinds,['TOP5']);assert.equal(two.rank,1);assert.equal(officer.attacks,0);
    assert.equal(await balance(f,1),123456+4100);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first()).quantity),2);assert.equal(await count(f,'jokgak_city_actions_v1'),0);
    await settleAndClaim(f.env,cityShift(f.now).endsAt,{force:true});assert.equal(await balance(f,1),123456+4100);
  });
  test(db+': TOP5 includes cutoff ties, ignores attack minimum, excludes TEST/banned users and does not pay rank seven',async t=>{
    const f=await fixture(t,pg);const values=[90,80,80,70,60,60,50,999,1000];
    for(let id=1;id<=values.length;id++){await f.join(id);await cash(f,id,values[id-1]);}
    await f.p("UPDATE users SET status='BANNED' WHERE id=8").run();
    const rows=(await f.p('SELECT request_id,result_json FROM jokgak_city_actions_v1 WHERE user_id=9').all()).results;
    for(const row of rows)await f.p('UPDATE jokgak_city_actions_v1 SET result_json=? WHERE request_id=?',JSON.stringify({...JSON.parse(row.result_json),mode:'TEST'}),row.request_id).run();
    const shift=cityShift(f.now);await settleAndClaim(f.env,shift.endsAt);const r=await receipt(f,shift.id);
    assert.deepEqual(r.recipients.map(r=>[r.userId,r.rank,r.coin]),[[1,1,5000],[2,2,4000],[3,2,4000],[4,4,2000],[5,5,1000],[6,5,1000]]);
    for(const id of [7,8,9])assert.equal(await balance(f,id),123456);
  });
  test(db+': next-round rules freeze; mid-round edits cannot change prizes; OFF prevents unsettled payouts',async t=>{
    const f=await fixture(t,pg);await f.join(1);const shift=cityShift(f.now),v=await policy(f);v.roundRewards.top5.ranks[0].coin=9000;await save(f,v);
    await settleAndClaim(f.env,shift.endsAt);assert.equal(await balance(f,1),128456);
    f.setTime(shift.endsAt+60000);await f.join(1);const off=await policy(f);off.roundRewards.top5.enabled=false;off.roundRewards.participation.enabled=false;await save(f,off);
    await settleAndClaim(f.env,cityShift(f.now).endsAt);assert.equal(await balance(f,1),128456);
  });
  test(db+': no same-round enabling or historical backfill; participation threshold and rank switches work independently',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);const v=await policy(f);v.roundRewards.top5.enabled=true;v.roundRewards.top5.ranks[0].coin=500;await save(f,v);const first=cityShift(f.now);await settleAndClaim(f.env,first.endsAt);assert.equal(await balance(f,1),123456);
    f.setTime(first.endsAt+60000);await f.join(1);await f.p('DELETE FROM app_meta WHERE key=?',cityRoundRewardPolicyKey(cityShift(f.now).id)).run();await settleAndClaim(f.env,cityShift(f.now).endsAt);assert.equal(await balance(f,1),123456);
    const only=await fixture(t,pg,p=>{p.roundRewards.top5.enabled=false;p.roundRewards.participation.minAttacks=1;});await only.join(1);await only.join(2);await only.action(1,'attack',{targetId:2});await settleAndClaim(only.env,cityShift(only.now).endsAt);assert.equal(await balance(only,1),123556);assert.equal(await balance(only,2),123456);
  });
  test(db+': coin/items/receipt/expiry roll back together, and lost commit responses or stale plans cannot double pay',async t=>{
    const f=await fixture(t,pg,p=>{p.roundRewards.top5.ranks[0].items=[{code:'CITY_TEST_ITEM',quantity:2}];});await f.join(1);const shift=cityShift(f.now);
    for(const failure of ['INSERT INTO user_message_rewards','DELETE FROM jokgak_city_actions_v1']){
      f.fail(failure);await assert.rejects(settleAndClaim(f.env,shift.endsAt),/INJECTED/);f.fail('');
      assert.equal(await balance(f,1),123456);assert.equal(await count(f,'cnine_user_inventory'),0);assert.equal(await receipt(f,shift.id),null);assert.ok(await count(f,'jokgak_city_actions_v1')>0);assert.equal(Number((await f.p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first()).value),shift.id);
    }
    const stale=await prepareCityTopSettlement(f.env,cityShift(shift.endsAt));f.lost();await settleAndClaim(f.env,shift.endsAt);await assert.rejects(f.env.DB.batch(stale.statements),/constraint|guard/i);
    assert.equal(await balance(f,1),128456);assert.equal(await count(f,'coin_logs'),1);assert.equal(await count(f,'inventory_logs'),1);
  });
  test(db+': changed balances, new attacks, policy stop or inactive items invalidate a prepared payout atomically',async t=>{
    const f=await fixture(t,pg,p=>{p.roundRewards.top5.ranks[0].items=[{code:'CITY_TEST_ITEM',quantity:2}];});await f.join(1);await f.join(2);const shift=cityShift(f.now);
    const a=await prepareCityTopSettlement(f.env,cityShift(shift.endsAt));await f.action(1,'attack',{targetId:2});await assert.rejects(f.env.DB.batch(a.statements),/constraint|guard/i);
    const b=await prepareCityTopSettlement(f.env,cityShift(shift.endsAt));const off=await policy(f);off.mode='TEST';await save(f,off);await assert.rejects(f.env.DB.batch(b.statements),/constraint|guard/i);
    const on=await policy(f);on.mode='ON';await save(f,on);const c=await prepareCityTopSettlement(f.env,cityShift(shift.endsAt));await f.p("UPDATE inventory_items SET is_active=0 WHERE code='CITY_TEST_ITEM'").run();await assert.rejects(f.env.DB.batch(c.statements),/constraint|guard/i);assert.equal(await count(f,'coin_logs'),0);
  });
  test(db+': final passive income uses frozen career rates for the TOP5 order',async t=>{
    const f=await fixture(t,pg,p=>{p.career.enabled=true;p.career.startedAt=1;});for(const id of [1,2,3]){await f.join(id);await cash(f,id,10000);}
    const shift=cityShift(f.now),v=await policy(f),expected=[];
    for(const id of [1,2,3]){const role=await assignedCityRole(f.env,id,shift.id);expected.push({id,cash:10000+5*v.career.rates.find(x=>x.code===role).cash});}
    await settleAndClaim(f.env,shift.endsAt);const r=await receipt(f,shift.id);assert.deepEqual(r.recipients.map(x=>[x.userId,x.rank,x.cash]),rankCityRoundCandidates(expected).map(x=>[x.id,x.rank,x.cash]));
  });
}
