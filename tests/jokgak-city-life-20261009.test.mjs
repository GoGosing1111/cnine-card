import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {cityLifeKey,newCityLife,CITY_DEATH_MS} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const owner={id:80,role:'OWNER'};
const settings=f=>readCitySettings(f.env).then(r=>r.policy);
const status=(f,id,location='HOSPITAL')=>cityStatus(f.env,f.users.get(id),location,0,f.now);
const life=async(f,id,patch={})=>{const key=cityLifeKey(id),before=await f.p('SELECT value FROM app_meta WHERE key=?',key).first(),next={...(before?JSON.parse(before.value):newCityLife(f.now)),...patch};await f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(next)).run();return next;};
const coins=async(f,id=1)=>Number((await f.p('SELECT coin FROM users WHERE id=?',id).first()).coin);
const request=(f,id,action,body)=>handleJokgakCity({path:'jokgak-city/'+action,env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(id),json:(x,status=200)=>Response.json(x,{status})},request:new Request('https://game.test/api/jokgak-city/'+action,{method:body?'POST':'GET',...(body?{headers:{origin:'https://game.test','content-type':'application/json'},body:JSON.stringify(body)}:{})})});
test('life policy validates rates, products, positive recoveries and preserves legacy settings',()=>{
  for(const mutate of [p=>p.life.hungerPerHour=-1,p=>p.life.hospitalThreshold=100,p=>p.life.meal.price=-1,p=>p.life.supplies[0].code='FORGED',p=>p.life.supplies[1].wellness=101,p=>p.life.treatment={enabled:true,price:0,health:0,wellness:0}]){const p=defaultCitySettings();mutate(p);assert.throws(()=>validateCitySettings(p));}
  const legacy=defaultCitySettings();delete legacy.life;assert.equal(validateCitySettings(legacy).life.meal.hunger,60);assert.equal(CITY_DEATH_MS,180000);
});
for(const pg of [false,true]){
  const db=pg?'Postgres':'SQLite';
  test(db+': lethal defender loss stores killer and 3-minute deadline; leave, regeneration and shift cannot bypass death',async t=>{
    const f=await cityFixture(t,pg);f.setTime(Date.parse('2026-10-09T02:59:00Z'));await f.join(1);await f.join(2);
    await f.p('UPDATE jokgak_city_players_v1 SET health=10 WHERE user_id=2').run();
    const result=await f.action(1,'attack',{targetId:2}),deadline=f.now+180000;
    assert.equal(result.target.deadUntil,deadline);assert.equal(result.target.health,0);assert.equal(result.target.location,'HOSPITAL');assert.equal(result.target.death.killerName,'참가자 1');
    const notification=JSON.parse((await f.p('SELECT summary_json FROM jokgak_city_notifications_v1 WHERE user_id=2').first()).summary_json);assert.equal(notification.deadUntil,deadline);
    f.advance(70000);assert.equal((await status(f,2)).mine.health,0);await assert.rejects(f.action(2,'move',{location:'HOME'}),/사망/);await f.action(2,'leave');await assert.rejects(f.action(2,'join'),/사망/);
    f.advance(109999);assert.equal((await status(f,2)).mine.deadUntil,deadline);f.advance(1);const revived=(await status(f,2)).mine;
    assert.equal(revived.deadUntil,0);assert.equal(revived.health,revived.maxHealth);assert.equal(revived.wellness,100);assert.equal(revived.location,'HOSPITAL');assert.equal(revived.death.killerId,1);
    assert.equal((await f.action(2,'join')).mine.location,'HOSPITAL');
    const replay=await cityAction(f.env,f.deps,f.users.get(1),'attack',{requestId:result.requestId,epoch:result.epoch,targetId:2});assert.equal(replay.replayed,true);assert.equal(replay.target.deadUntil,deadline);
  });
  test(db+': attacker death uses defending killer; medical actions cannot revive early; fatal arrest goes to hospital',async t=>{
    const f=await cityFixture(t,pg),nurse=f.roles.NURSE,police=f.roles.POLICE;
    for(const id of [...new Set([1,2,nurse,police])])await f.join(id);
    await f.p('UPDATE jokgak_city_players_v1 SET health=10 WHERE user_id=1').run();f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'B'}}});
    const lose=await f.action(1,'attack',{targetId:2});assert.equal(lose.mine.death.killerId,2);assert.equal(lose.mine.deadUntil,f.now+180000);
    await f.p("UPDATE jokgak_city_players_v1 SET location='HOSPITAL' WHERE user_id=?",nurse).run();await assert.rejects(f.action(nurse,'heal',{targetId:1}),/사망/);
    f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'A'}}});await f.p('UPDATE jokgak_city_players_v1 SET health=10,wanted=3,protected_until=0 WHERE user_id=2').run();
    const arrested=await f.action(police,'arrest',{targetId:2});assert.equal(arrested.target.deadUntil,f.now+180000);assert.equal(arrested.target.jailedUntil,0);assert.equal(arrested.target.location,'HOSPITAL');
  });
  test(db+': hunger and wellness decay by server time, freeze while outside, and critical health relocates to hospital',async t=>{
    const f=await cityFixture(t,pg),p=await settings(f);Object.assign(p.life,{hungerPerHour:20,wellnessPerHour:10,starvingWellnessPerHour:30});await saveCitySettings(f.env,owner,p,f.now);await f.join(1);
    f.advance(3600000);let me=(await status(f,1)).mine;assert.equal(me.hunger,80);assert.equal(me.wellness,90);
    await f.action(1,'leave');f.advance(3600000);await f.action(1,'join');me=(await status(f,1)).mine;assert.equal(me.hunger,80);assert.equal(me.wellness,90);
    await life(f,1,{hunger:0,wellness:30,at:f.now});f.advance(600000);me=(await status(f,1)).mine;assert.equal(me.hospitalRequired,true);assert.equal(me.location,'HOSPITAL');
    assert.equal((await f.p('SELECT location FROM jokgak_city_players_v1 WHERE user_id=1').first()).location,'HOSPITAL');await assert.rejects(f.action(1,'move',{location:'RESTAURANT'}),/병원/);
    const before=await coins(f),treated=await f.action(1,'treat');assert.equal(treated.mine.hospitalRequired,false);assert.equal(treated.mine.wellness,100);assert.equal(await coins(f),before);assert.equal(treated.mine.cash,8000);
    f.advance(5000);assert.equal((await f.action(1,'move',{location:'RESTAURANT'})).mine.location,'RESTAURANT');
  });
  test(db+': restaurant restores needs once, enforces place/full checks and includes cash charge in receipt',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await life(f,1,{hunger:10,wellness:70});await assert.rejects(f.action(1,'eat'),/식당/);
    await f.action(1,'move',{location:'RESTAURANT'});const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id},result=await cityAction(f.env,f.deps,f.users.get(1),'eat',body);
    assert.equal(result.mine.hunger,70);assert.equal(result.mine.wellness,80);assert.equal(result.service.paid,true);assert.equal(await coins(f),123456);assert.equal((await status(f,1)).mine.cash,9000);
    assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'eat',body)).replayed,true);assert.equal(await coins(f),123456);assert.equal((await status(f,1)).mine.cash,9000);f.advance(5000);await life(f,1,{hunger:100,wellness:100});await assert.rejects(f.action(1,'eat'),/가득/);assert.equal(await coins(f),123456);assert.equal((await status(f,1)).mine.cash,9000);
  });
  test(db+': purchases and carried use are atomic, bounded and retry-safe including lost commits',async t=>{
    const f=await cityFixture(t,pg);await f.join(1,'SHOP');await life(f,1,{hunger:20});
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,product:'LUNCHBOX'};
    f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(cityAction(f.env,f.deps,f.users.get(1),'buy',body),/INJECTED/);assert.equal(await coins(f),123456);assert.deepEqual((await status(f,1)).mine.bag,{});
    f.fail('');f.lost();const bought=await cityAction(f.env,f.deps,f.users.get(1),'buy',body);assert.equal(bought.replayed,true);assert.equal(bought.mine.bag.LUNCHBOX,1);assert.equal(await coins(f),123456);assert.equal((await status(f,1)).mine.cash,8500);
    f.advance(5000);await f.action(1,'move',{location:'HOME'});const used=await f.action(1,'use',{product:'LUNCHBOX'});assert.equal(used.mine.hunger,55);assert.equal(used.mine.bag.LUNCHBOX,0);f.advance(5000);await assert.rejects(f.action(1,'use',{product:'LUNCHBOX'}),/소지품/);assert.equal(await coins(f),123456);assert.equal((await status(f,1)).mine.cash,8500);
    await life(f,1,{bags:{TEST:{},ON:{LUNCHBOX:99}}});await f.action(1,'move',{location:'SHOP'});await assert.rejects(f.action(1,'buy',{product:'LUNCHBOX'}),/99/);
  });
  test(db+': TEST services never touch real currency and cannot transfer test inventory to ON',async t=>{
    const f=await cityFixture(t,pg),p=await settings(f);p.mode='TEST';p.testUserIds=[1];await saveCitySettings(f.env,owner,p,f.now);await f.join(1,'SHOP');
    const buy=await f.action(1,'buy',{product:'VITAMIN'});assert.equal(buy.service.test,true);assert.equal(buy.service.paid,false);assert.equal(await coins(f),123456);
    f.advance(5000);await life(f,1,{wellness:40});await f.action(1,'move',{location:'HOSPITAL'});await f.action(1,'treat');assert.equal(await coins(f),123456);
    const on=await settings(f);on.mode='ON';await saveCitySettings(f.env,owner,on,f.now);assert.deepEqual((await status(f,1)).mine.bag,{});f.advance(5000);await assert.rejects(f.action(1,'use',{product:'VITAMIN'}),/소지품/);assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,0);
  });
  test(db+': balance races, policy races and failed death notifications roll back complete actions',async t=>{
    const f=await cityFixture(t,pg);await f.join(1,'SHOP');const batch=f.env.DB.batch.bind(f.env.DB);let raced=false;
    f.env.DB.batch=async statements=>{if(!raced){raced=true;const cashLife=await life(f,1);cashLife.wallets.ON.balance=0;await life(f,1,cashLife);}return batch(statements);};
    await assert.rejects(f.action(1,'buy',{product:'FIRST_AID'}),/전황/);assert.equal((await status(f,1)).mine.cash,0);assert.equal(await coins(f),123456);assert.deepEqual((await status(f,1)).mine.bag,{});f.env.DB.batch=batch;
    await f.p("UPDATE jokgak_city_players_v1 SET location='MARKET' WHERE user_id=1").run();await f.join(2);await f.p('UPDATE jokgak_city_players_v1 SET health=10 WHERE user_id=2').run();f.fail('INSERT INTO jokgak_city_notifications_v1');
    await assert.rejects(f.action(1,'attack',{targetId:2}),/INJECTED/);f.fail('');assert.equal((await status(f,2)).mine.deadUntil,0);assert.equal((await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=2').first()).health,10);
  });
  test(db+': notification polling returns death status and completes hospital respawn; forged survival inputs are rejected',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);await f.p('UPDATE jokgak_city_players_v1 SET health=10 WHERE user_id=2').run();await f.action(1,'attack',{targetId:2});
    let notifications=await (await request(f,2,'notifications')).json();assert.equal(notifications.mine.deadUntil,f.now+180000);assert.equal(notifications.mine.death.killerId,1);
    f.advance(180000);notifications=await (await request(f,2,'notifications')).json();assert.equal(notifications.mine.deadUntil,0);assert.equal(notifications.mine.location,'HOSPITAL');assert.equal(notifications.mine.health,100);
    const forged={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,health:100};assert.equal((await request(f,2,'treat',forged)).status,400);
    assert.equal((await request(f,2,'use',{requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,product:'INVENTED'})).status,409);
  });
}
