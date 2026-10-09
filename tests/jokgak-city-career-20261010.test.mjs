import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,cityOrganization,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
const hour=3600000,status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const saveLife=(f,id,l)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();
async function enable(f){const {policy}=await readCitySettings(f.env);policy.career.enabled=true;await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);}
test('career defaults use approved role wages and reject forged, fractional or malformed economic settings',()=>{
 const p=defaultCitySettings();assert.deepEqual(p.career.rates.map(r=>r.cash),[2000,1000,3000,2500,4000,2500,1500]);
 for(const change of [p=>p.career.resetCash=-1,p=>p.career.rates[0].cash=.5,p=>p.career.rates[1].code='CITIZEN',p=>p.career.jobs[0].cash=1e9,p=>p.career.jobs[0].durationMs=0,p=>p.career.police.ranks[1].merit=0]){const q=structuredClone(p);change(q);assert.throws(()=>validateCitySettings(q));}
});
for(const pg of [false,true]){const prefix=pg?'Postgres':'SQLite';
 test(prefix+': automatic income includes outside/offline full hours, never pays twice and CMS wage changes wait for the next shift',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await enable(f);await f.join(id);await f.action(id,'leave');f.advance(hour-1);
  assert.equal((await status(f,id)).mine.cash,10000);f.advance(1);assert.equal((await status(f,id)).mine.cash,12000);assert.equal((await status(f,id)).mine.cash,12000);
  const p=(await readCitySettings(f.env)).policy;p.career.rates.forEach(r=>r.cash=777);await saveCitySettings(f.env,{id:80,role:'OWNER'},p,f.now);assert.equal((await status(f,id)).mine.career.incomePerHour,2000);
  f.setTime(cityShift(f.now).endsAt+hour);const next=(await status(f,id)).mine;assert.equal(next.active,false);assert.equal(next.cash,10777);assert.equal(next.career.income,777);await f.action(id,'join');assert.equal((await status(f,id)).mine.cash,10777);
 });
 test(prefix+': first activation preserves current assets; a new shift resets cash, weapons, items, employment and merit, separately per mode',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await f.join(id);await f.action(id,'buyWeapon',{product:'PIPE'});f.advance(5000);await f.action(id,'equipWeapon',{product:'PIPE'});
  let l=await life(f,id);l.bags.ON.LUNCHBOX=3;l.wallets.TEST={balance:123,initialCash:10000,openedAt:f.now};l.bags.TEST.VITAMIN=2;await saveLife(f,id,l);await enable(f);
  assert.equal((await status(f,id)).mine.cash,8000);assert.equal((await status(f,id)).mine.weapon.code,'PIPE');
  l=await life(f,id);l.careers.ON.employed=true;l.careers.ON.merit=9;await saveLife(f,id,l);f.setTime(cityShift(f.now).endsAt);
  const m=(await status(f,id)).mine;assert.equal(m.cash,10000);assert.deepEqual(m.ownedWeapons,[]);assert.equal(m.weapon.code,null);assert.deepEqual(m.bag,{});assert.equal(m.career.employed,false);assert.equal(m.career.merit,0);
  l=await life(f,id);assert.equal(l.wallets.TEST.balance,123);assert.deepEqual(l.bags.TEST,{VITAMIN:2});assert.equal((await status(f,id)).mine.cash,10000);
  // Replaying a previous purchase may return its receipt, but cannot restore gear.
  assert.deepEqual((await life(f,id)).armory.ON.owned,[]);
 });
 test(prefix+': sleeping across many shifts settles only the current shift, and first-time participation receives no backpay',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await enable(f);await f.join(id);await f.action(id,'leave');f.setTime(cityShift(f.now).endsAt+3*86400000+2*hour);
  const m=(await status(f,id)).mine;assert.equal(m.cash,10000+m.career.incomePerHour*2);assert.equal(m.career.income,m.career.incomePerHour*2);
  await f.join(79);assert.equal((await status(f,79)).mine.cash,10000);assert.equal((await status(f,79)).mine.career.income,0);
 });
 test(prefix+': jobs require the right role, place and employment; completed work pays once and advances police rank',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.POLICE;await enable(f);await f.join(id);
  await assert.rejects(f.action(id,'employment'),/근무처/);await assert.rejects(f.action(id,'workStart',{product:'CLINIC'}),/직업/);await f.action(id,'move',{location:'POLICE'});await assert.rejects(f.action(id,'workStart',{product:'PATROL'}),/취직/);
  const before=(await status(f,id)).mine.role;await f.action(id,'employment');assert.equal((await status(f,id)).mine.role,before);const start=await f.action(id,'workStart',{product:'PATROL'});assert.equal(start.work.cash,900);await assert.rejects(f.action(id,'workFinish'),/시간/);f.advance(300000);
  const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id};f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(cityAction(f.env,f.deps,f.users.get(id),'workFinish',body),/INJECTED/);f.fail('');assert.equal((await life(f,id)).wallets.ON.balance,10000);
  f.lost();const paid=await cityAction(f.env,f.deps,f.users.get(id),'workFinish',body);assert.equal(paid.replayed,true);assert.equal(paid.work.cash.change,900);assert.equal(paid.mine.cash,10900);assert.equal(paid.mine.career.merit,1);await cityAction(f.env,f.deps,f.users.get(id),'workFinish',body);assert.equal((await life(f,id)).wallets.ON.balance,10900);await assert.rejects(f.action(id,'workFinish'),/대기|진행 중/);
  for(let n=0;n<2;n++){f.advance(60000);await f.action(id,'workStart',{product:'PATROL'});f.advance(300000);await f.action(id,'workFinish');}assert.equal((await status(f,id)).mine.policeRank.name,'경장');
  const org=await cityOrganization(f.env,f.users.get(id),0,f.now);assert.equal(org.people.find(p=>p.userId===id).rank.name,'경장');assert.deepEqual(Object.keys(org.people[0]).sort(),['nickname','rank','userId']);
 });
 test(prefix+': movement and combat cancel work; first strikes remove own protection while defenders receive the configured shield',async t=>{
  const f=await cityFixture(t,pg),a=f.roles.CITIZEN,b=f.roles.GANG;await enable(f);await f.join(a);await f.join(b);await f.action(a,'workStart',{product:'DELIVERY'});await f.action(a,'move',{location:'POST'});assert.equal((await status(f,a)).mine.career.work,null);f.advance(5000);await f.action(a,'move',{location:'MARKET'});await f.action(a,'workStart',{product:'DELIVERY'});await f.action(b,'workStart',{product:'DELIVERY'});
  await f.p('UPDATE jokgak_city_players_v1 SET protected_until=? WHERE user_id=?',f.now+30000,a).run();
  f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(f.action(a,'attack',{targetId:b}),/INJECTED/);f.fail('');assert.ok((await status(f,a)).mine.protectedUntil>f.now);assert.ok((await status(f,a)).mine.career.work);
  const hit=await f.action(a,'attack',{targetId:b});assert.equal(hit.mine.protectedUntil,0);assert.equal(hit.target.protectedUntil,f.now+30000);assert.equal(hit.mine.career.work,null);assert.equal((await status(f,b)).mine.career.work,null);assert.equal('career' in hit.target,false);assert.equal('career' in (await status(f,a)).people[0],false);
  await assert.rejects(f.action(a,'attack',{targetId:b}),/기다려/);f.advance(15000);await assert.rejects(f.action(a,'attack',{targetId:b}),/보호/);
 });
 test(prefix+': salary/reset and purchases share CAS rollback; a lost salary commit never double credits',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await enable(f);await f.join(id);f.advance(hour);f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(f.action(id,'buyWeapon',{product:'PIPE'}),/INJECTED/);f.fail('');assert.equal((await life(f,id)).wallets.ON.balance,10000);
  f.lost();await assert.rejects(status(f,id),/LOST_COMMIT/);assert.equal((await status(f,id)).mine.cash,12000);const bought=await f.action(id,'buyWeapon',{product:'PIPE'});assert.equal(bought.mine.cash,10000);
  f.setTime(cityShift(f.now).endsAt);f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(f.action(id,'buyWeapon',{product:'PISTOL'}),/INJECTED/);f.fail('');assert.deepEqual((await life(f,id)).armory.ON.owned,['PIPE']);assert.equal((await f.action(id,'buyWeapon',{product:'PISTOL'})).mine.cash,2000);assert.deepEqual((await life(f,id)).armory.ON.owned,['PISTOL']);
 });
}
test('a stale in-flight fight cannot overwrite the reset after a parallel shift sync',async t=>{
 const f=await cityFixture(t),id=f.roles.CITIZEN,target=f.roles.GANG;await enable(f);await f.join(id);await f.join(target);
 f.deps.prepareCityBattle=async()=>{f.setTime(cityShift(f.now).endsAt);await status(f,id);return {battleV2:{result:{winner:'A'}}};};
 await assert.rejects(f.action(id,'attack',{targetId:target}),/교대/);assert.equal((await status(f,id)).mine.cash,10000);
});
test('arrest clears the initiating officer shield and credits merit once; leaving cancels work and a late shift cannot start new work',async t=>{
 const f=await cityFixture(t),a=f.roles.POLICE,b=f.roles.GANG;await enable(f);await f.join(a);await f.join(b);await f.p('UPDATE jokgak_city_players_v1 SET wanted=2 WHERE user_id=?',b).run();await f.p('UPDATE jokgak_city_players_v1 SET protected_until=? WHERE user_id=?',f.now+30000,a).run();
 const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:b};const arrested=await cityAction(f.env,f.deps,f.users.get(a),'arrest',body);assert.equal(arrested.mine.protectedUntil,0);assert.equal(arrested.mine.career.merit,2);await cityAction(f.env,f.deps,f.users.get(a),'arrest',body);assert.equal((await status(f,a)).mine.career.merit,2);
 f.advance(15000);await f.action(a,'workStart',{product:'DELIVERY'});await f.action(a,'leave');assert.equal((await status(f,a)).mine.career.work,null);f.advance(60000);await f.action(a,'join');await f.action(a,'move',{location:'MARKET'});f.setTime(cityShift(f.now).endsAt-60000);await assert.rejects(f.action(a,'workStart',{product:'DELIVERY'}),/시간이 부족/);
});
