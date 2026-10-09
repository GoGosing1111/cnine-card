import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,assignedCityRole,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings,CITY_SETTINGS_KEY} from '../shared/jokgak-city-settings-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const owner={id:80,nickname:'도시 관리자',role:'OWNER'};
const policy=f=>readCitySettings(f.env).then(x=>x.policy);
const save=(f,p)=>saveCitySettings(f.env,owner,p,f.now);
const reset=f=>f.p('UPDATE jokgak_city_players_v1 SET next_action_at=0,protected_until=0,health=100,jailed_until=0').run();
async function configureReward(f,{mode='ON',event='ATTACK_WIN',actor=1,dailyLimit=2}={}){
  const value=await policy(f);value.mode=mode;value.testUserIds=[1,2,3];value.rewards={enabled:true,dailyLimit,sameTargetCooldownMs:60000};
  const role=await assignedCityRole(f.env,actor,cityShift(f.now).id),row=value.roles.find(r=>r.code===role).rewards.find(r=>r.event===event);assert.ok(row);
  row.coin=123;row.items=[{code:'CITY_TEST_ITEM',quantity:3}];return save(f,value);
}
test('city policy rejects invalid modes, malformed roles, zero total weights, duplicate/invalid rewards and excessive grants',()=>{
  const bad=mutate=>{const p=defaultCitySettings();mutate(p);assert.throws(()=>validateCitySettings(p));};
  bad(p=>p.mode='LIVE');bad(p=>p.testUserIds=[1,1]);bad(p=>p.roles.forEach(r=>r.weight=0));bad(p=>p.roles[0].maxHealth=0);
  bad(p=>p.roles[0].healAmount=100);bad(p=>p.roles[2].arrestMinWanted=0);bad(p=>p.roles[0].rewards[0].coin=100000001);
  bad(p=>p.roles[0].rewards[1].event='ATTACK_WIN');bad(p=>p.roles[0].rewards[0].items=[{code:'ITEM',quantity:-1}]);bad(p=>p.rewards.dailyLimit=1001);
  assert.equal(validateCitySettings(defaultCitySettings()).mode,'TEST');
});
for(const postgres of [false,true]){
  const prefix=postgres?'Postgres':'SQLite';
  test(prefix+': TEST permits only OWNER/listed users, hides other residents, blocks other targets and allows exit/read recovery',async t=>{
    const f=await cityFixture(t,postgres);f.users.set(80,owner);await f.p("UPDATE users SET role='OWNER' WHERE id=80").run();
    for(const id of [1,2,80])await f.join(id);
    const attack=await f.action(1,'attack',{targetId:2});
    const value=await policy(f);value.mode='TEST';value.testUserIds=[2];await save(f,value);
    await assert.rejects(cityStatus(f.env,f.users.get(1),'MARKET',0,f.now),/TEST/);
    const state=await cityStatus(f.env,owner,'MARKET',0,f.now);assert.deepEqual(state.people.map(p=>p.userId),[2,80]);assert.equal(state.mode,'TEST');assert.equal(state.liveRewards,false);assert.ok(!('testUserIds' in state));
    await assert.rejects(f.action(2,'attack',{targetId:1}),/운영 모드/);
    assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',{requestId:attack.requestId,epoch:attack.epoch,targetId:2})).replayed,true);
    assert.equal((await f.action(1,'leave')).mine.active,false);
    const off=await policy(f);off.mode='OFF';await save(f,off);await assert.rejects(cityStatus(f.env,owner,'MARKET',0,f.now),/중지/);
    assert.equal((await f.action(2,'leave')).mine.active,false);
    await f.p('DELETE FROM app_meta WHERE key=?',CITY_SETTINGS_KEY).run();assert.equal((await policy(f)).mode,'TEST');await assert.rejects(f.action(1,'join'),/TEST/);
  });
  test(prefix+': OWNER CMS uses same-origin JSON, exact account lookup, catalog validation and revision/audit atomicity',async t=>{
    const f=await cityFixture(t,postgres);let user=owner;
    const call=(path,body,origin='https://game.test',method=body?'PATCH':'GET')=>handleJokgakCity({path:path.split('?')[0],env:f.env,deps:{...f.deps,authenticate:async()=>user,json:(x,status=200)=>Response.json(x,{status})},request:new Request('https://game.test/api/'+path,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
    user=f.users.get(1);assert.equal((await call('admin/jokgak-city')).status,403);user=owner;
    const data=await (await call('admin/jokgak-city')).json();assert.equal(data.catalog.length,1);
    assert.equal((await (await call('admin/jokgak-city/test-users?q=2')).json()).users[0].id,2);
    assert.equal((await (await call('admin/jokgak-city/test-users?q='+encodeURIComponent('참가자'))).json()).users.length,0);
    assert.equal((await call('admin/jokgak-city',{policy:data.policy},'https://evil.test')).status,403);
    const invalid=structuredClone(data.policy);invalid.testUserIds=[999];assert.equal((await call('admin/jokgak-city',{policy:invalid})).status,400);
    invalid.testUserIds=[];invalid.roles[0].rewards[0].items=[{code:'OFF_ITEM',quantity:1}];assert.equal((await call('admin/jokgak-city',{policy:invalid})).status,400);
    f.fail('INSERT INTO admin_logs');await assert.rejects(save(f,data.policy),/INJECTED/);assert.equal((await policy(f)).revision,0);f.fail('');
    const next=await save(f,data.policy);assert.equal(next.revision,1);await assert.rejects(save(f,data.policy),/다른 창/);
    assert.equal((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n,1);
  });
  test(prefix+': losing identical CMS save cannot append an audit or overwrite another writer',async t=>{
    const f=await cityFixture(t,postgres),before=await policy(f),batch=f.env.DB.batch.bind(f.env.DB);let raced=false;
    f.env.DB.batch=async statements=>{
      if(!raced){raced=true;const other={...before,revision:1,enabled:true,writeToken:'OTHER_WRITER'};await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(other),CITY_SETTINGS_KEY).run();}
      return batch(statements);
    };
    await assert.rejects(save(f,before),/다른 창/);assert.equal((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n,0);
    assert.equal(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',CITY_SETTINGS_KEY).first()).value).writeToken,'OTHER_WRITER');
  });
  test(prefix+': role weights freeze per shift; next shift applies the new distribution and configured start location',async t=>{
    const f=await cityFixture(t,postgres),epoch=cityShift(f.now).id,original=await assignedCityRole(f.env,1,epoch),value=await policy(f);
    value.roles.forEach(r=>r.weight=r.code==='GANG'?20:0);value.roles.find(r=>r.code==='GANG').startLocation='DOCK';await save(f,value);
    assert.equal(await assignedCityRole(f.env,1,epoch),original);f.advance(21600000);
    for(const id of [1,2,3,4])assert.equal(await assignedCityRole(f.env,id,cityShift(f.now).id),'GANG');
    assert.equal((await f.action(1,'join')).mine.location,'DOCK');
  });
  test(prefix+': custom medical, police, health, damage and cooldown settings are enforced by server actions',async t=>{
    const f=await cityFixture(t,postgres),value=await policy(f),nurse=f.roles.NURSE,civil=f.roles.CITIZEN,police=f.roles.POLICE;
    Object.assign(value.roles.find(r=>r.code==='NURSE'),{healAmount:80,healCooldownMs:45000,selfHeal:false,attackEnabled:false,startLocation:'HOSPITAL'});
    Object.assign(value.roles.find(r=>r.code==='CITIZEN'),{maxHealth:90,regenPerMinute:0,defeatDamage:40,attackCooldownMs:22000,wantedPerAttack:3});
    Object.assign(value.roles.find(r=>r.code==='POLICE'),{inspectEnabled:false,arrestMinWanted:3,arrestMs:90000});await save(f,value);
    assert.equal((await f.action(nurse,'join')).mine.location,'HOSPITAL');await f.p("UPDATE jokgak_city_players_v1 SET location='MARKET' WHERE user_id=?",nurse).run();await f.join(civil);await f.join(police);
    await f.p('UPDATE jokgak_city_players_v1 SET health=50 WHERE user_id=?',civil).run();const healed=await f.action(nurse,'heal',{targetId:civil});assert.equal(healed.target.health,90);assert.equal(healed.target.maxHealth,90);assert.equal(healed.mine.nextActionAt,f.now+45000);
    await reset(f);await assert.rejects(f.action(nurse,'heal',{targetId:nurse}),/치료/);await assert.rejects(f.action(nurse,'attack',{targetId:civil}),/공격/);
    await assert.rejects(f.action(police,'inspect',{targetId:civil}),/검문/);await assert.rejects(f.action(police,'arrest',{targetId:civil}),/수배/);
    const won=await f.action(civil,'attack',{targetId:nurse});assert.equal(won.effects.damageToTarget,40);assert.equal(won.mine.wanted,3);assert.equal(won.mine.nextActionAt,f.now+22000);
    await reset(f);await f.p('UPDATE jokgak_city_players_v1 SET wanted=3 WHERE user_id=?',civil).run();const arrested=await f.action(police,'arrest',{targetId:civil});assert.equal(arrested.effects.jailMs,90000);assert.equal(arrested.target.jailedUntil,f.now+90000);
  });
  test(prefix+': live rewards commit once with action receipt, daily cap and same-target cooldown across roles/events',async t=>{
    const f=await cityFixture(t,postgres);await configureReward(f);for(const id of [1,2,3])await f.join(id);
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2},first=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);
    assert.equal(first.reward.status,'PAID');assert.equal(first.reward.remaining,1);assert.equal(first.reward.items[0].name,'도시 검수 재료');
    assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123579);assert.equal((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='CITY_TEST_ITEM'").first()).quantity,3);
    assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).replayed,true);await reset(f);
    assert.equal((await f.action(1,'attack',{targetId:2})).reward.status,'TARGET_COOLDOWN');await reset(f);
    assert.equal((await f.action(1,'attack',{targetId:3})).reward.status,'PAID');await reset(f);f.advance(61000);
    assert.equal((await f.action(1,'attack',{targetId:2})).reward.status,'DAILY_LIMIT');assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,2);
    f.setTime(Date.parse('2026-10-09T15:00:00Z'));await reset(f);const renewed=await policy(f);for(const r of renewed.roles){r.rewards[0].coin=123;r.rewards[0].items=[];}await save(f,renewed);
    assert.equal((await f.action(1,'attack',{targetId:2})).reward.status,'PAID');
  });
  test(prefix+': failed later writes roll back rewards/quotas and lost commit responses recover the paid receipt',async t=>{
    const f=await cityFixture(t,postgres);await configureReward(f);await f.join(1);await f.join(2);
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2};f.fail('INSERT INTO jokgak_city_notifications_v1');
    await assert.rejects(cityAction(f.env,f.deps,f.users.get(1),'attack',body),/INJECTED/);
    assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);assert.equal((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n,0);
    assert.equal((await f.p("SELECT COUNT(*) n FROM app_meta WHERE key LIKE 'jokgak_city_reward_day_v1:%'").first()).n,0);
    f.fail('');f.lost();const result=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);assert.equal(result.replayed,true);assert.equal(result.reward.paid,true);
    assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,1);assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_notifications_v1').first()).n,1);
  });
  test(prefix+': TEST rewards never pay after ON and concurrent policy closure cancels the whole prepared battle',async t=>{
    const f=await cityFixture(t,postgres);await configureReward(f,{mode:'TEST'});await f.join(1);await f.join(2);
    const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2};const result=await cityAction(f.env,f.deps,f.users.get(1),'attack',body);
    assert.equal(result.reward.status,'TEST_PREVIEW');assert.equal(result.reward.coin,123);assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);
    const on=await policy(f);on.mode='ON';await save(f,on);assert.equal((await cityAction(f.env,f.deps,f.users.get(1),'attack',body)).reward.paid,false);await reset(f);
    const simulate=f.deps.prepareCityBattle;f.deps.prepareCityBattle=async()=>{const off=await policy(f);off.mode='OFF';await save(f,off);return simulate();};
    await assert.rejects(f.action(1,'attack',{targetId:2}),/전황/);assert.equal((await f.p('SELECT coin FROM users WHERE id=1').first()).coin,123456);
    assert.equal((await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=2').first()).health,100);assert.equal((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n,0);
  });
}
test('OWNER city CMS and current client settings/rewards are wired into shipped pages',()=>{
  const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(read('admin/index.html'),/jokgak-city-admin-v1.mjs\?v=20261009-life1/);
  assert.match(read('functions/_jokgak_city.js'),/handleCityCms\(/);
  assert.match(read('js/jokgak-city-v1.js'),/state\?\.mode==='TEST'/);assert.match(read('js/jokgak-city-v1.js'),/rewardHtml\(data.reward\)/);
  for(const path of ['index.html','pve/legion-hunt/index.html','pve-v3/index.html','raid/lich-king/index.html'])assert.match(read(path),/jokgak-city-v1.js\?v=20261009-cms1/);
});
