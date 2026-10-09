import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,assignedCityRole} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings,CITY_SETTINGS_KEY} from '../shared/jokgak-city-settings-v1.mjs';
import {cityLifeKey,newCityLife,readCityLife} from '../shared/jokgak-city-life-v1.mjs';
import {changeCityCash,CITY_CASH_MAX} from '../shared/jokgak-city-cash-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const owner={id:80,role:'OWNER'};
const policy=f=>readCitySettings(f.env).then(r=>r.policy);
const save=(f,p)=>saveCitySettings(f.env,owner,p,f.now);
const status=(f,id=1)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const life=async(f,id=1)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const writeLife=(f,value,id=1)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(value),cityLifeKey(id)).run();
const reset=f=>f.p('UPDATE jokgak_city_players_v1 SET next_action_at=0,protected_until=0,health=100').run();
async function rewardPolicy(f,{mode='ON',cash=500,coin=0}={}){
  const p=await policy(f);p.cash.theft.enabled=false; // Isolate minted role rewards; transfers are covered in the theft suite.
  p.mode=mode;p.testUserIds=[1,2,3];p.rewards={enabled:true,dailyLimit:2,sameTargetCooldownMs:60000};
  const role=await assignedCityRole(f.env,1,cityShift(f.now).id),row=p.roles.find(r=>r.code===role).rewards.find(r=>r.event==='ATTACK_WIN');
  Object.assign(row,{cash,coin,items:coin?[{code:'CITY_TEST_ITEM',quantity:2}]:[]});await save(f,p);
}
test('cash settings upgrade legacy policy, reject malformed balances and enforce bounds',()=>{
  const p=defaultCitySettings();delete p.cash;for(const r of p.roles)for(const reward of r.rewards)delete reward.cash;
  const upgraded=validateCitySettings(p);assert.equal(upgraded.cash.startingCash,10000);assert.equal(upgraded.roles[0].rewards[0].cash,0);
  for(const invalid of [-1,1.5,1000000001,null])assert.throws(()=>validateCitySettings({...p,cash:{startingCash:invalid}}));
  p.roles[0].rewards[0].cash=100000001;assert.throws(()=>validateCitySettings(p));
  const value=newCityLife(1),on={...upgraded,mode:'ON'};assert.equal(changeCityCash(value,on,-10000).after,0);assert.throws(()=>changeCityCash(value,on,-1),/부족/);
  value.wallets.ON.balance=CITY_CASH_MAX;assert.throws(()=>changeCityCash(value,on,1),/한도/);
  for(const wallet of [false,[],{balance:-1,initialCash:10000,openedAt:1},{balance:1.5,initialCash:10000,openedAt:1}])assert.throws(()=>readCityLife(JSON.stringify({...value,wallets:{TEST:null,ON:wallet}}),1));
});
for(const pg of [false,true]){
  const db=pg?'Postgres':'SQLite';
  test(db+': initial cash is once per mode, survives spend/rejoin/shift and does not refill after CMS edits',async t=>{
    const f=await cityFixture(t,pg);await f.join(1,'SHOP');assert.equal((await status(f)).mine.cash,10000);
    await f.action(1,'buy',{product:'LUNCHBOX'});assert.equal((await status(f)).mine.cash,8500);
    const p=await policy(f);p.cash.startingCash=25000;await save(f,p);await f.action(1,'leave');f.advance(p.rules.rejoinCooldownMs+1);await f.action(1,'join');assert.equal((await status(f)).mine.cash,8500);
    f.advance(21600000);assert.equal((await status(f)).mine.cash,8500);assert.equal((await life(f)).wallets.ON.initialCash,10000);
    const testPolicy=await policy(f);testPolicy.mode='TEST';testPolicy.testUserIds=[1,2];await save(f,testPolicy);assert.equal((await status(f)).mine.cash,25000);
    await f.p("UPDATE jokgak_city_players_v1 SET location='SHOP' WHERE user_id=1").run();await f.action(1,'buy',{product:'VITAMIN'});assert.equal((await status(f)).mine.cash,23500);
    const back=await policy(f);back.mode='ON';await save(f,back);assert.equal((await status(f)).mine.cash,8500);assert.deepEqual((await status(f)).mine.bag,{LUNCHBOX:1});
    assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,0);
  });
  test(db+': legacy wallet initialization is persistent, guarded by CMS revision, and zero is not recredited',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);const old=await life(f);delete old.wallets;await writeLife(f,old);
    const batch=f.env.DB.batch.bind(f.env.DB);let raced=false;
    f.env.DB.batch=async statements=>{if(!raced){raced=true;const p=await policy(f);p.cash.startingCash=4000;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(p),CITY_SETTINGS_KEY).run();}return batch(statements);};
    await assert.rejects(status(f),/변경/);assert.equal((await life(f)).wallets,undefined);f.env.DB.batch=batch;
    assert.equal((await status(f)).mine.cash,4000);const current=await life(f);current.wallets.ON.balance=0;await writeLife(f,current);assert.equal((await status(f)).mine.cash,0);
    await f.p("UPDATE jokgak_city_players_v1 SET location='SHOP' WHERE user_id=1").run();const before=await life(f);await assert.rejects(f.action(1,'buy',{product:'LUNCHBOX'}),/현금이 부족/);assert.deepEqual(await life(f),before);
  });
  test(db+': cash-only and mixed rewards are atomic, retry-safe, capped and private in public residents',async t=>{
    const f=await cityFixture(t,pg);await rewardPolicy(f);for(const id of [1,2,3])await f.join(id);
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2};f.fail('INSERT INTO jokgak_city_notifications_v1');
    await assert.rejects(cityAction(f.env,f.deps,f.users.get(1),'attack',body),/INJECTED/);assert.equal((await status(f)).mine.cash,10000);f.fail('');f.lost();
    const first=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);assert.equal(first.replayed,true);assert.equal(first.mine.cash,10500);assert.equal(first.reward.cashReceipt.after,10500);assert.equal(first.target.cash,undefined);
    assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).mine.cash,10500);assert.ok((await status(f)).people.every(p=>!('cash' in p)&&!('bag' in p)));
    await reset(f);assert.equal((await f.action(1,'attack',{targetId:2})).reward.status,'TARGET_COOLDOWN');assert.equal((await status(f)).mine.cash,10500);
    await rewardPolicy(f,{cash:700,coin:123});await reset(f);const mixed=await f.action(1,'attack',{targetId:3});assert.equal(mixed.mine.cash,11200);assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123579);assert.equal((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first()).quantity,2);
    await reset(f);f.advance(61000);assert.equal((await f.action(1,'attack',{targetId:2})).reward.status,'DAILY_LIMIT');assert.equal((await status(f)).mine.cash,11200);
    assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,1);
  });
  test(db+': TEST cash rewards stay in TEST across death and cannot be collected into ON by replay',async t=>{
    const f=await cityFixture(t,pg);await rewardPolicy(f,{mode:'TEST',cash:600,coin:123});await f.join(1);await f.join(2);
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2},result=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);
    assert.equal(result.reward.status,'TEST_PREVIEW');assert.equal(result.mine.cash,10600);assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);
    await reset(f);await f.p('UPDATE jokgak_city_players_v1 SET health=10 WHERE user_id=1').run();await f.action(2,'attack',{targetId:1});f.advance(180000);assert.equal((await status(f)).mine.cash,10600);
    const p=await policy(f);p.mode='ON';await save(f,p);assert.equal((await status(f)).mine.cash,10000);assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).reward.cashReceipt.mode,'TEST');assert.equal((await status(f)).mine.cash,10000);
    assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,0);
  });
}
