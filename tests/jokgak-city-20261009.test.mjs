import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cityShift,cityHealth,CITY_ROLES,CITY_RULES} from '../shared/jokgak-city-v1.mjs';
import {cityAction,cityStatus,assignedCityRole,handleJokgakCity} from '../functions/_jokgak_city.js';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';

test('KST role shifts change exactly at 00, 06, 12, 18; health is bounded and reset only across shifts',()=>{
  for(const hour of [0,6,12,18]){const ms=Date.parse(`2026-10-09T${String(hour).padStart(2,'0')}:00:00+09:00`);assert.equal(cityShift(ms).startsAt,ms);assert.equal(cityShift(ms-1).endsAt,ms);assert.equal(cityShift(ms).endsAt-ms,21600000);}
  const now=Date.now(),row={epoch:cityShift(now).id,health:95,health_at:now-120000};assert.equal(cityHealth(row,now),100);assert.equal(cityHealth({...row,health:0,health_at:now},now),0);
});
for(const pg of [false,true]){
  const prefix=pg?'Postgres':'SQLite';
  test(prefix+': roster pagination is bounded, active-only and public role is stable across refresh/rejoin',async t=>{
    const f=await cityFixture(t,pg);assert.equal(Object.keys(f.roles).length,7);
    for(let id=1;id<=13;id++)await f.join(id);
    const original=await assignedCityRole(f.env,1,cityShift(f.now).id);
    let state=await cityStatus(f.env,f.users.get(1),'MARKET',0,f.now);assert.equal(state.people.length,10);assert.equal(state.nextCursor,10);
    state=await cityStatus(f.env,f.users.get(1),'MARKET',10,f.now);assert.equal(state.people.length,3);assert.equal(state.nextCursor,null);
    await f.p("UPDATE users SET status='BANNED' WHERE id=13").run();state=await cityStatus(f.env,f.users.get(1),'MARKET',10,f.now);assert.equal(state.people.length,2);
    await f.p('UPDATE jokgak_city_players_v1 SET wanted=3,health=50 WHERE user_id=1').run();
    await f.action(1,'leave');await assert.rejects(f.action(1,'join'),/60초/);f.advance(60000);await f.action(1,'join');state=await cityStatus(f.env,f.users.get(1),'HOME',0,f.now);assert.equal(state.mine.role,original);assert.equal(state.mine.wanted,3);assert.equal(state.mine.health,55);
  });
  test(prefix+': attack, health and target notification commit once; receipt is owner-bound and survives a shift',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);
    const requestId=crypto.randomUUID(),body={requestId,epoch:cityShift(f.now).id,targetId:2};const first=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);
    assert.equal(first.target.health,75);assert.equal(first.mine.wanted,1);assert.equal(first.result,'WIN');
    assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).replayed,true);
    f.advance(21600000);assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).replayed,true);
    assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_notifications_v1').first()).n,1);
    await assert.rejects(cityAction(f.env,f.deps,f.users.get(3),'attack',body),/접근/);
    await assert.rejects(cityAction(f.env,f.deps,f.users.get(1),'heal',body),/다른 행동/);
    assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);
  });
  test(prefix+': role checks, medical caps, self-heal, police inspection and arrest are server-authoritative',async t=>{
    const f=await cityFixture(t,pg),police=f.roles.POLICE,nurse=f.roles.NURSE,doctor=f.roles.DOCTOR,civil=f.roles.CITIZEN;
    for(const id of [police,nurse,doctor,civil])await f.join(id);
    await f.p('UPDATE jokgak_city_players_v1 SET health=65,wanted=2 WHERE user_id=?',civil).run();
    await assert.rejects(f.action(civil,'heal',{targetId:civil}),/간호사/);
    assert.equal((await f.action(nurse,'heal',{targetId:civil})).target.health,90);
    assert.equal((await f.action(doctor,'heal',{targetId:civil})).target.health,100);
    await assert.rejects(f.action(doctor,'heal',{targetId:civil}),/기다려/);
    const inspect=await f.action(police,'inspect',{targetId:civil});assert.equal(inspect.inspection.cards.length,5);assert.equal(inspect.inspection.wanted,2);
    f.advance(10000);const result=await f.action(police,'arrest',{targetId:civil});assert.equal(result.target.location,'POLICE');assert.equal(result.target.jailedUntil,f.now+60000);assert.equal(result.target.wanted,0);
    await assert.rejects(f.action(civil,'move',{location:'HOME'}),/구금/);f.advance(60000);await f.action(civil,'move',{location:'HOME'});
    await f.p('UPDATE jokgak_city_players_v1 SET health=20 WHERE user_id=?',nurse).run();assert.equal((await f.action(nurse,'heal',{targetId:nurse})).mine.health,50);
  });
  test(prefix+': moving target and new epoch cancel prepared combat atomically; protected targets reject dogpiles',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);await f.join(3);
    const simulate=f.deps.prepareCityBattle;
    f.deps.prepareCityBattle=async()=>{await f.p("UPDATE jokgak_city_players_v1 SET location='HOME',revision=revision+1 WHERE user_id=2").run();return simulate();};
    await assert.rejects(f.action(1,'attack',{targetId:2}),/전황/);
    assert.equal((await f.p('SELECT wanted FROM jokgak_city_players_v1 WHERE user_id=1').first()).wanted,0);
    assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_notifications_v1').first()).n,0);
    await f.p("UPDATE jokgak_city_players_v1 SET location='MARKET' WHERE user_id=2").run();
    f.deps.prepareCityBattle=async()=>{f.advance(21600000);return simulate();};await assert.rejects(f.action(1,'attack',{targetId:2}),/교대/);
    f.deps.prepareCityBattle=simulate;await f.action(1,'attack',{targetId:2});await assert.rejects(f.action(3,'attack',{targetId:2}),/보호/);
  });
  test(prefix+': failed notification rolls back health and receipts; lost commit response recovers exact receipt',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2};
    f.fail('INSERT INTO jokgak_city_notifications_v1');await assert.rejects(cityAction(f.env,f.deps,f.users.get(1),'attack',body),/INJECTED/);
    assert.equal((await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=2').first()).health,100);
    f.fail('');f.lost();const result=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);assert.equal(result.replayed,true);assert.equal(result.target.health,75);
  });
  test(prefix+': handler rejects cross-site, forged winner/role, stale roles, bad targets and other-user alerts',async t=>{
    const f=await cityFixture(t,pg);await f.join(1);await f.join(2);await f.action(1,'attack',{targetId:2});
    const deps={...f.deps,authenticate:async()=>f.users.get(1),json:(data,status=200)=>Response.json(data,{status})};
    const request=(path,body,origin='https://game.test')=>handleJokgakCity({path:'jokgak-city/'+path.split('?')[0],request:new Request('https://game.test/api/jokgak-city/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',origin}:{},body:body?JSON.stringify(body):undefined}),env:f.env,deps});
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2};
    assert.equal((await request('attack',body,'https://evil.test')).status,403);
    assert.equal((await request('attack',{...body,winner:'A'})).status,400);
    assert.equal((await request('attack',{...body,role:'POLICE'})).status,400);
    const alerts=await (await request('notifications')).json();assert.equal(alerts.items.length,0);
    const targetNotice=await f.p('SELECT id FROM jokgak_city_notifications_v1 WHERE user_id=2').first();await request('ack',{ids:[targetNotice.id]});assert.equal((await f.p('SELECT read_at FROM jokgak_city_notifications_v1 WHERE user_id=2').first()).read_at,0);
    const status=await request('status?location=UNKNOWN');assert.equal(status.status,400);
  });
}
test('live routing, preview isolation, notifications, city backdrop and PVP dependencies are connected',()=>{
  const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(read('index.html'),/js\/jokgak-city-v1.js/);assert.match(read('js/app.js'),/jokgakCity:\(\)=>window.JokgakCity.view/);assert.match(read('js/app.js'),/JokgakCity\?\.bind/);
  assert.match(read('functions/api/[[path]].js'),/handleJokgakCity\(\{path,request,env/);assert.match(read('js/adventure-navigation-standalone.js'),/jokgak-city-v1.js/);
  const client=read('js/jokgak-city-v1.js');assert.match(client,/aria-modal','false/);assert.match(client,/window.CityPreview/);assert.match(client,/playPvpBattleV2Live/);assert.match(client,/document.hidden/);
  assert.match(read('preview/project-v-v3/source/battle/BattleEngine.js'),/jokgakCityBattlefield&&mode==='PVP'/);
  const combat=read('functions/_jokgak_city_battle.js');for(const token of ['pvpDeckSnapshot(env,defender.id,true)','releasedMercenarySnapshot','loadPetBattleSnapshot','magicBattleLoadout','cardUniqueDeckStates','evaluateDeckSynergies','userEquipmentBonuses','createPvpBattleV2'])assert.ok(combat.includes(token),token);
  assert.equal(CITY_ROLES.length,7);assert.equal(CITY_RULES.pageSize,10);
});
