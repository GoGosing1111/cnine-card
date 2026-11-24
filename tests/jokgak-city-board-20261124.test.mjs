import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus} from '../functions/_jokgak_city.js';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityShiftIncident} from '../shared/jokgak-city-board-v1.mjs';

const status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const call=(f,id,action,requestId)=>cityAction(f.env,f.deps,f.users.get(id),action,{requestId,epoch:cityShift(f.now).id});
const go=async(f,id,location)=>{f.advance(6000);await f.action(id,'move',{location});};

for (const pg of [false,true]) {
  const engine=pg?'PostgreSQL':'SQLite';
  test(engine+' deliveries, meal ticket, shift goal and atomic replay',async t=>{
    const f=await cityFixture(t,pg), id=1;
    await f.join(id,'DOCK');
    await f.action(id,'chooseGoal',{product:'DELIVERY'});
    await assert.rejects(f.action(id,'chooseGoal',{product:'CARE'}),/목표/);
    await f.action(id,'acceptDelivery',{product:'FOOD'});
    await assert.rejects(f.action(id,'finishDelivery'),/납품처/);
    await f.action(id,'pickupDelivery');
    await assert.rejects(f.action(id,'pickupDelivery'),/한 번/);
    await go(f,id,'RESTAURANT');
    const first=crypto.randomUUID();
    f.fail('INSERT INTO jokgak_city_actions_v1');
    await assert.rejects(call(f,id,'finishDelivery',first),/INJECTED/);
    f.fail('');
    assert.equal((await status(f,id)).board.personal.contract.pickedUp,true);
    f.lost();const food=await call(f,id,'finishDelivery',first);
    assert.equal(food.mine.cash,10400);
    assert.equal((await call(f,id,'finishDelivery',first)).mine.cash,10400);
    await assert.rejects(f.action(id,'acceptDelivery',{product:'FOOD'}),/의뢰/);
    await assert.rejects(f.action(id,'redeemTicket'),/가득/);
    const key=cityLifeKey(id),life=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);
    life.hunger=15;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(life),key).run();
    const meal=await f.action(id,'redeemTicket');assert.equal(meal.service.price,0);assert.equal(meal.mine.hunger,75);
    f.advance(6000);await assert.rejects(f.action(id,'redeemTicket'),/식권/);
    await f.action(id,'acceptDelivery',{product:'MEDICAL'});await go(f,id,'SHOP');await f.action(id,'pickupDelivery');
    await go(f,id,'HOSPITAL');const finish=crypto.randomUUID(),med=await call(f,id,'finishDelivery',finish);
    assert.equal(med.goalReward.change,600);assert.equal(med.mine.cash,11800);
    assert.equal((await call(f,id,'finishDelivery',finish)).replayed,true);
    const view=await status(f,id);assert.equal(view.board.personal.progress,2);assert.deepEqual(view.board.personal.completed,['FOOD','MEDICAL']);
    f.setTime(cityShift(f.now).endsAt+1000);await f.action(id,'join');const fresh=await status(f,id);
    assert.deepEqual(fresh.board.personal.completed,[]);assert.equal(fresh.board.personal.goal,null);
  });

  test(engine+' competing district contributions preserve both personal and shared state',async t=>{
    const f=await cityFixture(t,pg),police=f.roles.POLICE,medic=f.roles.DOCTOR;
    const {site}=cityShiftIncident(cityShift(f.now).id);
    await f.join(police,site);await f.join(medic,site);
    const write=f.env.DB.batch.bind(f.env.DB);
    let raced=false;
    f.env.DB.batch=async statements=>{
      if(!raced){raced=true;await f.action(medic,'helpEvent');}
      return write(statements);
    };
    const request=crypto.randomUUID();
    await assert.rejects(call(f,police,'helpEvent',request),/전황/);
    f.env.DB.batch=write;
    const loser=await status(f,police);
    assert.equal(loser.board.points,1);assert.equal(loser.board.personal.contributed,0);
    await call(f,police,'helpEvent',request);await call(f,police,'helpEvent',request);
    assert.equal((await status(f,medic)).board.points,2);
    assert.equal((await status(f,police)).board.personal.contributed,1);
  });

  test(engine+' existing exploration and paid work count once toward the chosen goal',async t=>{
    const f=await cityFixture(t,pg),id=f.roles.CITIZEN,police=f.roles.POLICE;
    const {policy}=await readCitySettings(f.env);policy.career.enabled=true;
    await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);
    await f.join(id,'HOME');await f.action(id,'chooseGoal',{product:'EXPLORE'});
    await f.action(id,'explore',{location:'HOME'});await assert.rejects(f.action(id,'explore',{location:'HOME'}),/대기|다시|탐색/);
    f.advance(60001);
    const found=await f.action(id,'explore',{location:'HOME'});assert.equal(found.goalReward.change,600);
    await f.join(police,'POLICE');await f.action(police,'chooseGoal',{product:'ORDER'});await f.action(police,'employment');
    for(let n=0;n<2;n++){
      const started=await f.action(police,'workStart',{product:'PATROL'});f.setTime(started.mine.career.work.endsAt);
      const paid=await f.action(police,'workFinish');assert.equal(paid.goalReward?.change,n===1?600:undefined);
      f.setTime(paid.mine.career.nextWorkAt+1);
    }
    assert.equal((await status(f,police)).board.personal.progress,2);
  });

  test(engine+' contributions by role, shared completion, settlement retries and mode isolation',async t=>{
    const f=await cityFixture(t,pg), citizen=f.roles.CITIZEN,police=f.roles.POLICE,medic=f.roles.DOCTOR;
    const incident=cityShiftIncident(cityShift(f.now).id);
    await f.join(citizen,incident.depot);await f.join(police,incident.site);await f.join(medic,incident.site);
    await f.action(police,'chooseGoal',{product:'ORDER'});await f.action(medic,'chooseGoal',{product:'CARE'});
    await f.action(citizen,'collectEventCargo');await assert.rejects(f.action(citizen,'collectEventCargo'),/물자/);
    await go(f,citizen,incident.site);await f.action(citizen,'helpEvent');await assert.rejects(f.action(citizen,'helpEvent'),/물자/);
    await assert.rejects(f.action(police,'claimEvent'),/해결 후/);
    const first=crypto.randomUUID();f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(call(f,police,'helpEvent',first),/INJECTED/);
    f.fail('');assert.equal((await status(f,police)).board.points,1);await f.action(police,'helpEvent');
    await assert.rejects(f.action(police,'helpEvent'),/1분/);await f.action(medic,'helpEvent');f.advance(60001);
    const a=await f.action(police,'helpEvent'),b=await f.action(medic,'helpEvent');assert.equal(a.goalReward.change,600);assert.equal(b.goalReward.change,600);
    await go(f,citizen,incident.depot);await f.action(citizen,'collectEventCargo');await go(f,citizen,incident.site);await f.action(citizen,'helpEvent');
    assert.equal((await status(f,medic)).board.points,6);await assert.rejects(f.action(medic,'helpEvent'),/추가/);
    for(const id of [citizen,police,medic]){const token=crypto.randomUUID();const x=await call(f,id,'claimEvent',token);assert.equal(x.boardAction.cash.change,700);
      assert.equal((await call(f,id,'claimEvent',token)).mine.cash,x.mine.cash);await assert.rejects(f.action(id,'claimEvent'),/한 번/);}
    const config=(await f.p("SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1'").first()).value;
    await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",JSON.stringify({...JSON.parse(config),mode:'TEST',testUserIds:[citizen]})).run();
    const other=await status(f,citizen);assert.equal(other.board.points,0);assert.equal(other.board.personal.contributed,0);assert.equal(other.board.personal.claimed,false);
  });
}
