import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,assignedCityRole} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {buildCityTeam,createCityBattle} from '../functions/_jokgak_city_battle.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {ssLimitedSnapshot} from '../scripts/measure-ss-limited-balance-20261008.mjs';
const status=(f,id,place='MARKET')=>cityStatus(f.env,f.users.get(id),place,0,f.now);
const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const saveLife=(f,id,value)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(value),cityLifeKey(id)).run();
test('legacy policies gain approved prices/facilities without changing other saved fields, and invalid weapons are rejected',()=>{
 const old=defaultCitySettings();delete old.arsenal;delete old.facilities;old.roles.find(r=>r.code==='POLICE').maxHealth=100;
 const p=validateCitySettings(old);assert.deepEqual(p.arsenal.weapons.map(w=>w.price),[2000,8000,20000]);assert.equal(p.roles.find(r=>r.code==='POLICE').maxHealth,100);
 for(const change of [p=>p.arsenal.weapons[0].price=0,p=>p.arsenal.weapons[1].power=p.arsenal.basePower,p=>p.arsenal.weapons[0].code='FORGED',p=>p.facilities.motel.stayMs=900001,p=>p.roles[0].maxHealth=1001]){const p=defaultCitySettings();change(p);assert.throws(()=>validateCitySettings(p));}
});
for(const pg of [false,true]){
 const label=pg?'Postgres':'SQLite';
 test(label+': exit/rejoin and CMS weight changes cannot reroll a role before the common shift',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await f.join(id);const before=(await status(f,id)).mine.role;await f.action(id,'leave');
  const {policy}=await readCitySettings(f.env);policy.roles.forEach(r=>r.weight=r.code==='GANG'?1:0);await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);
  f.advance(policy.rules.rejoinCooldownMs);await f.action(id,'join');assert.equal((await status(f,id)).mine.role,before);assert.equal(await assignedCityRole(f.env,id,cityShift(f.now).id),before);
  f.advance(cityShift(f.now).endsAt-f.now);assert.equal((await status(f,id)).mine.role,'GANG');
 });
 test(label+': paid weapons require the market and ownership, equip explicitly, survive rejoin, and keep TEST/ON separate',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await f.join(id,'HOME');await assert.rejects(f.action(id,'buyWeapon',{product:'PIPE'}),/시장/);await assert.rejects(f.action(id,'equipWeapon',{product:'RIFLE'}),/보유/);
  await f.action(id,'move',{location:'MARKET'});const bought=await f.action(id,'buyWeapon',{product:'PIPE'});assert.equal(bought.mine.cash,8000);assert.equal(bought.mine.weapon.code,null);assert.deepEqual(bought.mine.ownedWeapons,['PIPE']);f.advance(5000);
  await assert.rejects(f.action(id,'buyWeapon',{product:'PIPE'}),/이미/);const eq=await f.action(id,'equipWeapon',{product:'PIPE'});assert.equal(eq.mine.cityPower,200000);await f.action(id,'leave');f.advance(60000);assert.equal((await f.action(id,'join')).mine.weapon.code,'PIPE');
  const p=(await readCitySettings(f.env)).policy;p.mode='TEST';p.testUserIds=[id];await saveCitySettings(f.env,{id:80,role:'OWNER'},p,f.now);assert.deepEqual((await status(f,id)).mine.ownedWeapons,[]);await assert.rejects(f.action(id,'equipWeapon',{product:'PIPE'}),/보유/);
  assert.equal((await life(f,id)).wallets.ON.balance,8000);assert.deepEqual((await life(f,id)).armory.ON,{owned:['PIPE'],equipped:'PIPE'});
 });
 test(label+': purchase CAS rolls back cash and ownership on failure and recovers a lost response exactly once',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await f.join(id);const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,product:'PISTOL'};
  f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(cityAction(f.env,f.deps,f.users.get(id),'buyWeapon',body),/INJECTED/);f.fail('');assert.equal((await life(f,id)).wallets.ON.balance,10000);assert.deepEqual((await life(f,id)).armory.ON.owned,[]);
  f.lost();const first=await cityAction(f.env,f.deps,f.users.get(id),'buyWeapon',body);assert.equal(first.replayed,true);assert.equal(first.mine.cash,2000);assert.equal((await cityAction(f.env,f.deps,f.users.get(id),'buyWeapon',body)).mine.cash,2000);f.advance(5000);await assert.rejects(f.action(id,'buyWeapon',{product:'RIFLE'}),/부족/);
 });
 test(label+': combat and inspection use server-owned weapons and hide the other inventory',async t=>{
  const f=await cityFixture(t,pg),a=f.roles.POLICE,b=f.roles.GANG;await f.join(a);await f.join(b);await f.action(a,'buyWeapon',{product:'PIPE'});f.advance(5000);await f.action(a,'equipWeapon',{product:'PIPE'});
  f.deps.prepareCityBattle=async(_env,_deps,_a,_b,context)=>{assert.equal(context.attacker.cityPower,200000);assert.equal(context.defender.cityPower,100000);return {battleV2:{result:{winner:'A'}}};};
  const result=await f.action(a,'attack',{targetId:b});assert.ok(!('ownedWeapons' in result.target));assert.ok(!('cash' in result.target));f.advance(30000);
  const inspected=await f.action(a,'inspect',{targetId:b});assert.equal(inspected.inspection.cardPower,100000);assert.equal(inspected.inspection.weaponName,'맨손');
 });
 test(label+': motel gives a private untargetable room, blocks outgoing combat and cannot be extended by refresh or re-entry',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN,enemy=f.roles.GANG;await f.join(id,'MOTEL');await f.join(enemy,'MOTEL');const rest=await f.action(id,'rest'),end=f.now+900000;assert.equal(rest.mine.restUntil,end);assert.equal(rest.mine.motelNextAt,end+3600000);
  await assert.rejects(f.action(enemy,'attack',{targetId:id}),/휴식/);await assert.rejects(f.action(id,'attack',{targetId:enemy}),/객실/);await assert.rejects(f.action(id,'rest'),/객실/);assert.ok(!(await status(f,enemy,'MOTEL')).people.some(p=>p.userId===id));
  f.advance(300000);assert.equal((await status(f,id,'MOTEL')).mine.restUntil,end);await f.action(id,'checkout');const cooldown=f.now+3600000;assert.equal((await status(f,id)).mine.motelNextAt,cooldown);await f.action(id,'leave');f.advance(60000);await f.action(id,'join');await f.action(id,'move',{location:'MOTEL'});await assert.rejects(f.action(id,'rest'),/재이용/);
  f.advance(cooldown-f.now);await f.action(id,'rest');f.advance(900000);const done=(await status(f,id,'MOTEL')).mine;assert.equal(done.restUntil,0);assert.equal(done.location,'HOME');assert.equal(done.motelNextAt,f.now+3600000);
 });
 test(label+': hospital discharges after five minutes without timer resets, while doctor and nurse may remain',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;for(const n of [id,f.roles.NURSE,f.roles.DOCTOR])await f.join(n,'HOSPITAL');
  const start=(await status(f,id,'HOSPITAL')).mine.hospitalLeaveAt;assert.equal(start,f.now+300000);f.advance(120000);assert.equal((await status(f,id,'HOSPITAL')).mine.hospitalLeaveAt,start);
  const value=await life(f,id);value.wellness=20;await saveLife(f,id,value);f.advance(180000);const after=(await status(f,id,'HOSPITAL')).mine;assert.notEqual(after.location,'HOSPITAL');assert.notEqual(after.location,'MOTEL');assert.equal(after.hospitalRequired,false);assert.equal((await status(f,id)).mine.location,after.location);
  for(const n of [f.roles.NURSE,f.roles.DOCTOR]){const s=(await status(f,n,'HOSPITAL')).mine;assert.equal(s.location,'HOSPITAL');assert.equal(s.hospitalLeaveAt,0);assert.equal(s.hospitalStaff,true);}
 });
 test(label+': police HP 150 persists through combat and the three-minute death wait is outside the hospital five-minute stay',async t=>{
  const f=await cityFixture(t,pg),police=f.roles.POLICE,id=f.roles.CITIZEN;await f.join(police);await f.join(id);assert.equal((await status(f,police)).mine.health,150);f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'B'}}});assert.equal((await f.action(police,'attack',{targetId:id})).mine.health,125);
  await f.p('UPDATE jokgak_city_players_v1 SET health=10,protected_until=0,next_action_at=0 WHERE user_id=?',id).run();f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'A'}}});f.advance(30000);const killed=await f.action(police,'attack',{targetId:id});assert.equal(killed.target.health,0);f.advance(180000);const revived=(await status(f,id,'HOSPITAL')).mine;assert.equal(revived.location,'HOSPITAL');assert.equal(revived.hospitalLeaveAt,f.now+300000);assert.equal(revived.health,100);
  const stored=await life(f,id);stored.death.resolved=false;await saveLife(f,id,stored);f.advance(301000);assert.notEqual((await status(f,id,'HOSPITAL')).mine.location,'HOSPITAL','offline return cannot restart the five-minute admission');
 });
}
const cards=power=>Array.from({length:5},(_,i)=>({id:String(i),name:'카드 '+i,power,type:['ATTACK','DEFENSE','SPEED','HP','NONE'][i],rarity:'SSS',breakthrough_level:99,equipmentShare:1e12,effectivePower:1e12,uniqueAdvancement:{modifiers:{maxHpPercent:9999}}}));
test('city team normalizes account cards and mercenary growth; the same weapon produces the same whole-team power',()=>{
 const merc=ssLimitedSnapshot('V-990'),rich={...merc,level:100,mercenaryLevel:{version:1,level:100,breakthroughMask:0,bonuses:[]}},before=structuredClone(rich);
 assert.deepEqual(buildCityTeam(cards(1),merc,'A',200000),buildCityTeam(cards(1e12),rich,'A',200000));assert.deepEqual(rich,before);
 const battle=createCityBattle({attackerCards:cards(1),defenderCards:cards(1e12),attackerMercenary:merc,defenderMercenary:rich,attackerPower:200000,defenderPower:200000});
 assert.equal(battle.teams.A.summary.power,200000);assert.equal(battle.teams.B.summary.power,200000);assert.equal(battle.teams.A.summary.attack,battle.teams.B.summary.attack);assert.ok(!battle.teams.A.mercenaries[0].mercenaryLink);assert.equal(battle.rules.accountGrowthApplied,false);
});
test('a weapon determines strength over raw account power in both attack and defense, without changing ordinary PVP',()=>{
 let armedWins=0;for(const side of ['A','B'])for(let seed=1;seed<=32;seed++){
  const r=createCityBattle({attackerCards:cards(side==='A'?1:1e12),defenderCards:cards(side==='B'?1:1e12),attackerPower:side==='A'?200000:100000,defenderPower:side==='B'?200000:100000,seed});if(r.result.winner===side)armedWins++;
 }
 assert.ok(armedWins>=60,armedWins+' / 64');
 const ordinary=createPvpBattleV2({attackerCards:cards(1000).map(({id,name,power})=>({id,name,power})),defenderCards:cards(1000000).map(({id,name,power})=>({id,name,power}))});
 assert.ok(ordinary.teams.B.summary.power>ordinary.teams.A.summary.power*100,'ordinary PVP still uses account power');
});
