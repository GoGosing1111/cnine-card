import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings,CITY_SETTINGS_KEY} from '../shared/jokgak-city-settings-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {CITY_CASH_MAX} from '../shared/jokgak-city-cash-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const balances=async(f,mode='ON')=>Promise.all([1,2].map(async id=>(await life(f,id)).wallets[mode]?.balance));
const wallet=async(f,id,balance,mode='ON')=>{const v=await life(f,id);v.wallets[mode].balance=balance;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(v),cityLifeKey(id)).run();};
const reset=f=>f.p('UPDATE jokgak_city_players_v1 SET health=100,next_action_at=0,protected_until=0').run();
const policy=f=>readCitySettings(f.env).then(r=>r.policy);
const save=(f,p)=>saveCitySettings(f.env,{id:80,role:'OWNER'},p,f.now);
const body=(f,targetId=2)=>({requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId});
const attack=(f,b=body(f))=>cityAction(f.env,f.deps,f.users.get(1),'attack',b);

test('legacy saved cash settings gain approved 10% / 2,000 won without losing mode or prices; CMS rejects malformed theft',()=>{
  const old=defaultCitySettings();old.cash={startingCash:12345};old.mode='TEST';old.life.meal.price=456;
  const next=validateCitySettings(old);assert.deepEqual(next.cash,{startingCash:12345,theft:{enabled:true,percent:10,maxCash:2000}});assert.equal(next.mode,'TEST');assert.equal(next.life.meal.price,456);
  for(const theft of [null,[],{enabled:1,percent:10,maxCash:2000},{enabled:true,percent:10.5,maxCash:2000},{enabled:true,percent:101,maxCash:2000},{enabled:true,percent:10,maxCash:-1},{enabled:true,percent:10,maxCash:1000000001},{enabled:true,percent:10,maxCash:2000,amount:9999}])assert.throws(()=>validateCitySettings({...next,cash:{...next.cash,theft}}));
});
for(const pg of [false,true]){
  const db=pg?'Postgres':'SQLite';
  test(db+': attacker victory floors 10%, caps at 2,000, conserves cash including zero and winner limit',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);
    for(const [owned,expected,winning] of [[12349,1234,10000],[90000,2000,10000],[0,0,10000],[9,0,10000],[10000,17,CITY_CASH_MAX-17],[10000,0,CITY_CASH_MAX]]){
      await reset(f);await wallet(f,1,winning);await wallet(f,2,owned);
      const result=await attack(f);assert.equal(result.theft.amount,expected);assert.equal(result.theft.actorChange,expected);assert.equal(result.theft.winnerId,1);
      assert.deepEqual(await balances(f),[winning+expected,owned-expected]);assert.equal(result.target.cash,undefined);assert.equal('before' in result.theft,false);
    }
    assert.equal(Number((await f.p('SELECT SUM(coin) total FROM users WHERE id IN (1,2)').first()).total),246912);assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,0);
  });
  test(db+': defender victory transfers in reverse, draw/disabled do not transfer, police combat uses same policy',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);
    f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'B'}}});
    const loss=await attack(f);assert.equal(loss.theft.actorChange,-1000);assert.equal(loss.theft.winnerId,2);assert.deepEqual(await balances(f),[9000,11000]);
    const notice=JSON.parse((await f.p('SELECT summary_json FROM jokgak_city_notifications_v1 WHERE request_id=?',loss.requestId).first()).summary_json);assert.deepEqual(notice.theft,loss.theft);
    await reset(f);f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'DRAW'}}});assert.equal((await attack(f)).theft.status,'DRAW');assert.deepEqual(await balances(f),[9000,11000]);
    await reset(f);const p=await policy(f);p.cash.theft.enabled=false;await save(f,p);f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'A'}}});assert.equal((await attack(f)).theft.status,'DISABLED');assert.deepEqual(await balances(f),[9000,11000]);
    const on=await policy(f);on.cash.theft={enabled:true,percent:20,maxCash:500};await save(f,on);const police=f.roles.POLICE,civil=f.roles.CITIZEN;
    for(const id of [police,civil])if(!(await f.p('SELECT user_id FROM jokgak_city_players_v1 WHERE user_id=?',id).first()))await f.join(id);
    await reset(f);await f.p('UPDATE jokgak_city_players_v1 SET wanted=2 WHERE user_id=?',civil).run();const arrest=await f.action(police,'arrest',{targetId:civil});assert.equal(arrest.theft.amount,500);assert.equal(arrest.target.location,'POLICE');
  });
  test(db+': failed transaction rolls back BOTH wallets; lost commit and repeated request settle exactly once',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);const b=body(f);
    f.fail('INSERT INTO jokgak_city_notifications_v1');await assert.rejects(attack(f,b),/INJECTED/);assert.deepEqual(await balances(f),[10000,10000]);assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_actions_v1 WHERE action=\'attack\'').first()).n,0);
    f.fail('');f.lost();const result=await attack(f,b);assert.equal(result.replayed,true);assert.deepEqual(await balances(f),[11000,9000]);
    assert.deepEqual((await attack(f,b)).theft,result.theft);assert.deepEqual(await balances(f),[11000,9000]);assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_notifications_v1').first()).n,1);
  });
  test(db+': competing attack commits only once; stale cash and CMS policy changes reject whole battle',async t=>{
    const f=await cityFixture(t,pg);for(const id of [1,2,3])await f.join(id);const simulate=f.deps.prepareCityBattle;let raced=false;
    f.deps.prepareCityBattle=async()=>{if(!raced){raced=true;await f.action(3,'attack',{targetId:2});}return simulate();};
    await assert.rejects(attack(f),/전황/);assert.deepEqual(await balances(f),[10000,9000]);assert.equal((await life(f,3)).wallets.ON.balance,11000);
    await reset(f);f.deps.prepareCityBattle=async()=>{await wallet(f,2,8000);return simulate();};await assert.rejects(attack(f),/전황/);assert.deepEqual(await balances(f),[10000,8000]);
    f.deps.prepareCityBattle=async()=>{const p=await policy(f);p.cash.theft.percent=15;await save(f,p);return simulate();};await assert.rejects(attack(f),/전황/);assert.deepEqual(await balances(f),[10000,8000]);assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_notifications_v1').first()).n,1);
  });
  test(db+': TEST and ON transfer separate wallets; replay never moves TEST cash into ON; death preserves deduction',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);const p=await policy(f);p.mode='TEST';p.testUserIds=[1,2];await save(f,p);
    for(const id of [1,2])await cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
    await wallet(f,2,12349,'TEST');await f.p('UPDATE jokgak_city_players_v1 SET health=10 WHERE user_id=2').run();const b=body(f),result=await attack(f,b);
    assert.equal(result.theft.mode,'TEST');assert.equal(result.target.deadUntil,f.now+180000);assert.deepEqual(await balances(f,'TEST'),[11234,11115]);assert.deepEqual(await balances(f),[10000,10000]);
    f.advance(180000);const respawn=await cityStatus(f.env,f.users.get(2),'HOSPITAL',0,f.now);assert.equal(respawn.mine.cash,11115);assert.equal(respawn.mine.location,'HOSPITAL');
    const on=await policy(f);on.mode='ON';await save(f,on);assert.equal((await attack(f,b)).theft.mode,'TEST');assert.deepEqual(await balances(f),[10000,10000]);
  });
  test(db+': theft precedes role reward; other residents and defender receipt do not expose opponent wallet',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);const p=await policy(f);p.rewards.enabled=true;for(const role of p.roles)role.rewards.find(r=>r.event==='ATTACK_LOSE').cash=500;await save(f,p);
    f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'B'}}});const result=await attack(f);assert.equal(result.theft.amount,1000);assert.equal(result.reward.cash,500);assert.deepEqual(await balances(f),[9500,11000]);
    const status=await cityStatus(f.env,f.users.get(2),'MARKET',0,f.now);assert.ok(status.people.every(p=>!('cash' in p)&&!('bag' in p)));
    const response=await handleJokgakCity({path:'jokgak-city/result',request:new Request('https://game.test/api/jokgak-city/result?requestId='+result.requestId),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(2),json:(v,status=200)=>Response.json(v,{status})}});
    const receipt=await response.json();assert.equal(response.status,200);assert.equal(receipt.mine.cash,undefined);assert.equal(receipt.mine.bag,undefined);assert.equal(receipt.reward,null);assert.deepEqual(receipt.theft,result.theft);
  });
}
