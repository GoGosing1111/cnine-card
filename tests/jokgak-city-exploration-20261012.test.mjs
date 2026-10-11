import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityStatus,dischargeCityHospital,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {citySearchPool,citySearchRoll,CITY_FOUND_WEAPONS,CITY_ARMORS} from '../shared/jokgak-city-exploration-v1.mjs';
import {buildCityTeam,createCityBattle,prepareCityBattle} from '../functions/_jokgak_city_battle.js';
import {runCityRotationSchedule} from '../workers/clan-draft/src/city-rotation.js';
const status=(f,id,location='HOME')=>cityStatus(f.env,f.users.get(id),location,0,f.now);
const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const saveLife=(f,id,l)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();
async function configure(f,mutate){const p=(await readCitySettings(f.env)).policy;mutate(p);return saveCitySettings(f.env,{id:80,role:'OWNER'},p,f.now);}
async function initialPolicy(f,mutate){const p=(await readCitySettings(f.env)).policy;mutate(p);await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",JSON.stringify(p)).run();}
const only=(p,location,code)=>{const a=p.exploration.areas.find(a=>a.location===location);a.emptyWeight=code?0:1;a.drops.forEach(d=>d.weight=d.code===code?1:0);};

test('legacy policies gain 7 exploration weapons and 6 armors, while original shop prices and ON mode stay intact',()=>{
 const p=defaultCitySettings();delete p.exploration;p.mode='ON';p.facilities.hospital.maxStayMs=300000;
 const next=validateCitySettings(p);assert.equal(next.exploration.weapons.length,7);assert.equal(next.exploration.armors.length,6);assert.equal(next.exploration.areas.length,9);assert.equal(next.facilities.hospital.maxStayMs,180000);assert.equal(next.mode,'ON');assert.deepEqual(next.arsenal.weapons.map(w=>w.price),[2000,8000,20000]);
 for(const mutate of [p=>p.exploration.cooldownMs=0,p=>p.exploration.armors[0].power=-1,p=>p.exploration.areas[0].drops[0].code='FORGED',p=>p.exploration.areas[0].emptyWeight=.1,p=>p.career.police.ranks[1].powerPercent=51,p=>p.career.police.ranks[1].incomePercent=101]){
  const p=defaultCitySettings();mutate(p);assert.throws(()=>validateCitySettings(p));
 }
 const pool=citySearchPool(next,'HOME');assert.equal(citySearchRoll(pool,0),null);assert.equal(citySearchRoll(pool,.3),'BAT');assert.equal(citySearchRoll(pool,.65),'JACKET');assert.equal(citySearchRoll(pool,.999999),'CROSSBOW');
 assert.equal(citySearchPool(next,'HOSPITAL'),null);assert.equal(citySearchPool(next,'MOTEL'),null);
});

for(const pg of [false,true]){
 const db=pg?'Postgres':'SQLite';
 test(db+': exploration is current-area only; rolls, ownership and cooldown persist atomically, including lost responses and duplicates',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await initialPolicy(f,p=>only(p,'HOME','BAT'));await f.join(id,'HOME');
  const before=await life(f,id),body={requestId:'search-replay-'+db,location:'HOME'};
  await assert.rejects(f.action(id,'explore',{location:'DOCK'}),/현재 머무는/);
  await assert.rejects(f.action(id,'explore',{location:'HOME',product:'SNIPER'}),/상품/);
  f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(f.action(id,'explore',body),/INJECTED/);f.fail('');
  assert.deepEqual((await life(f,id)).armory,before.armory);assert.equal((await life(f,id)).exploration.ON.nextAt,0);
  f.lost();const found=await f.action(id,'explore',body);assert.equal(found.replayed,true);assert.equal(found.exploration.item.code,'BAT');assert.equal(found.exploration.outcome,'FOUND');assert.equal(found.mine.weapon.code,null);assert.equal(found.mine.cash,10000);
  assert.deepEqual((await f.action(id,'explore',body)).exploration,found.exploration);
  await assert.rejects(f.action(id,'explore',{location:'HOME'}),/다음 탐색/);
  await f.action(id,'equipWeapon',{product:'BAT'});assert.equal((await status(f,id)).mine.cityPower,175000);
  await assert.rejects(f.action(id,'buyWeapon',{product:'BAT'}),/탐색/);
  f.advance(60000);const duplicate=await f.action(id,'explore',{location:'HOME'});assert.equal(duplicate.exploration.outcome,'DUPLICATE');assert.deepEqual(duplicate.mine.ownedWeapons,['BAT']);
  assert.equal((await f.p('SELECT coin FROM users WHERE id=?',id).first()).coin,123456);
 });
 test(db+': armor adds power once, private inventory stays private, failed/empty/parallel searches cannot multiply loot',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN,other=f.roles.GANG;await initialPolicy(f,p=>only(p,'HOME','JACKET'));await f.join(id,'HOME');await f.join(other,'HOME');
  const results=await Promise.allSettled([f.action(id,'explore',{location:'HOME'}),f.action(id,'explore',{location:'HOME'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual((await life(f,id)).exploration.ON.ownedArmor,['JACKET']);
  const equipped=await f.action(id,'equipArmor',{product:'JACKET'});assert.equal(equipped.mine.cityPower,120000);assert.equal(equipped.mine.armor.power,20000);
  const otherView=(await status(f,other)).people.find(p=>p.userId===id);assert.equal(otherView.cityPower,120000);assert.equal(otherView.ownedArmors,undefined);assert.equal(otherView.ownedWeapons,undefined);assert.equal(otherView.hospitalTransfer,undefined);
  await assert.rejects(f.action(id,'equipArmor',{product:'PLATE'}),/보유/);
  await f.action(id,'unequipArmor');assert.equal((await status(f,id)).mine.cityPower,100000);
  await configure(f,p=>only(p,'HOME',null));f.advance(60000);const empty=await f.action(id,'explore',{location:'HOME'});assert.equal(empty.exploration.outcome,'EMPTY');assert.equal(empty.mine.exploreNextAt,f.now+60000);
 });
 test(db+': search restrictions and TEST/ON round inventories cannot be bypassed through leaving, jobs or policy toggles',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await initialPolicy(f,p=>{only(p,'HOME','JACKET');p.career.enabled=true;p.career.startedAt=f.now;});await f.join(id,'HOME');
  await f.action(id,'workStart',{product:'HOME_PACK'});await assert.rejects(f.action(id,'explore',{location:'HOME'}),/근무/);await f.action(id,'workCancel');
  await f.action(id,'explore',{location:'HOME'});await f.action(id,'equipArmor',{product:'JACKET'});await f.action(id,'leave');f.advance(60000);await f.action(id,'join');assert.deepEqual((await status(f,id)).mine.ownedArmors,['JACKET']);
  await configure(f,p=>{p.mode='TEST';p.testUserIds=[id];});assert.deepEqual((await status(f,id)).mine.ownedArmors,[]);
  await configure(f,p=>p.mode='ON');assert.deepEqual((await status(f,id)).mine.ownedArmors,['JACKET']);
  await configure(f,p=>p.exploration.enabled=false);await assert.rejects(f.action(id,'explore',{location:'HOME'}),/현재 탐색/);
  const next=cityShift(f.now).endsAt;f.setTime(next);const rotated=(await status(f,id)).mine;assert.equal(rotated.active,false);assert.deepEqual(rotated.ownedArmors,[]);assert.equal(rotated.exploreNextAt,0);assert.equal(rotated.cityPower,100000);
 });
 test(db+': minute scheduler moves offline ordinary hospital occupants at 3 minutes, retains medical staff and returns one stable current-round popup',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN,medics=[f.roles.DOCTOR,f.roles.NURSE];
  for(const n of [id,...medics]){await f.join(n,'HOSPITAL');await status(f,n,'HOSPITAL');}
  f.advance(179999);assert.equal((await dischargeCityHospital(f.env,{now:f.now})).moved,0);f.advance(1);
  let closed=0;await runCityRotationSchedule(f.env,{now:f.now,openDatabase:async()=>({db:f.env.DB,close:async()=>closed++})});assert.equal(closed,1);
  const moved=(await f.p('SELECT location FROM jokgak_city_players_v1 WHERE user_id=?',id).first()).location;assert.ok(!['HOSPITAL','MOTEL'].includes(moved));
  for(const n of medics)assert.equal((await f.p('SELECT location FROM jokgak_city_players_v1 WHERE user_id=?',n).first()).location,'HOSPITAL');
  const m=(await status(f,id,moved)).mine,transfer=m.hospitalTransfer;assert.equal(transfer.to,moved);assert.equal((await status(f,id,moved)).mine.hospitalTransfer.id,transfer.id);
  const response=await handleJokgakCity({env:f.env,path:'jokgak-city/notifications',request:new Request('https://city.test/api/jokgak-city/notifications'),deps:{...f.deps,authenticate:async()=>f.users.get(id),json:(x,status=200)=>Response.json(x,{status})}});
  assert.deepEqual((await response.json()).mine.hospitalTransfer,transfer);
  f.setTime(cityShift(f.now).endsAt);assert.equal((await status(f,id)).mine.hospitalTransfer,null);
 });
 test(db+': police arrests promote once and immediately increase city power, future salary and hourly income; old round snapshots remain unchanged',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.POLICE,target=f.roles.CITIZEN;
  await initialPolicy(f,p=>{p.career.enabled=true;p.career.startedAt=f.now;});await f.join(id);await f.join(target);
  for(let i=0;i<2;i++){await f.p("UPDATE jokgak_city_players_v1 SET wanted=2,jailed_until=0,protected_until=0,health=100,location='MARKET' WHERE user_id=?",target).run();const body={targetId:target,requestId:'arrest-promotion-'+db+'-'+i};await f.action(id,'arrest',body);await f.action(id,'arrest',body);f.advance(60000);}
  let m=(await status(f,id)).mine;assert.equal(m.policeRank.code,'CORPORAL');assert.equal(m.policeRank.merit,4);assert.equal(m.cityPower,105000);assert.equal(m.career.incomePerHour,3300);
  await f.action(id,'move',{location:'POLICE'});await f.action(id,'employment');const work=await f.action(id,'workStart',{product:'PATROL'});assert.equal(work.work.cash,3300);
  f.advance(300000);const paid=await f.action(id,'workFinish',{requestId:'promoted-wage-'+db});assert.equal(paid.work.cash.change,3300);assert.equal((await f.action(id,'workFinish',{requestId:'promoted-wage-'+db})).replayed,true);
  const before=(await status(f,id)).mine.cash;f.advance(3600000);m=(await status(f,id)).mine;assert.equal(m.cash,before+3300);
  await configure(f,p=>p.career.police.ranks[1].powerPercent=25);assert.equal((await status(f,id)).mine.cityPower,105000);
 });
}
const cards=(rich=false)=>Array.from({length:5},(_,i)=>({id:String(i),name:'카드 '+i,rarity:rich?'ZENITH':'NORMAL',power:rich?1e14:1,type:rich?'HEAL':'NONE',breakthrough_level:rich?100:0,uniqueAbility:rich?{dominantType:'HEAL'}:null,iconRole:rich?'COMMANDER':null}));
test('existing round without promotion fields keeps zero bonuses; the next round adopts new CMS defaults',async t=>{
 const f=await cityFixture(t),id=f.roles.POLICE;await initialPolicy(f,p=>{p.career.enabled=true;p.career.startedAt=f.now;});
 const p=(await readCitySettings(f.env)).policy,legacy=structuredClone(p.career);
 legacy.police.ranks.forEach(r=>{delete r.powerPercent;delete r.incomePercent;});
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','jokgak_city_career_policy_v1:ON:'+cityShift(f.now).id,JSON.stringify(legacy)).run();
 await f.join(id);let l=await life(f,id);l.careers.ON.merit=15;await saveLife(f,id,l);
 const current=await status(f,id);assert.equal(current.mine.cityPower,100000);assert.equal(current.mine.career.incomePerHour,3000);assert.equal(current.career.police.ranks[3].powerPercent,0);
 f.setTime(cityShift(f.now).endsAt);const next=await status(f,id);assert.equal(next.career.police.ranks[3].powerPercent,15);assert.equal(next.career.police.ranks[3].incomePercent,30);
});
test('city combat ignores ranked growth, card types and every mercenary identity; equal equipment has equal stats and seed results',async()=>{
 const low=cards(),high=cards(true),merc={code:'V-999',rank:'SSS',power:1e15,skills:[{power:1e20}]};
 const stats=f=>f.map(({power,maxHp,attack,defense,speed,type,shield})=>({power,maxHp,attack,defense,speed,type,shield}));
 assert.deepEqual(stats(buildCityTeam(low,null,'A',250000)),stats(buildCityTeam(high,merc,'A',250000)));
 let wins=0;for(let seed=1;seed<=80;seed++){
  const a=createCityBattle({attackerCards:low,defenderCards:high,attackerMercenary:merc,attackerPower:250000,defenderPower:250000,seed});
  const b=createCityBattle({attackerCards:high,defenderCards:low,defenderMercenary:merc,attackerPower:250000,defenderPower:250000,seed});
  assert.equal(a.result.winner,b.result.winner);if(a.result.winner==='A')wins++;
 }
 assert.ok(wins>=20&&wins<=60,'equal equipment must not consistently favor attacker: '+wins);
 const battle=await prepareCityBattle({}, {pvpDeckSnapshot:async()=>high,battleSettings:()=>{throw Error('ranked policy must not be read');},cardUniqueDeckStates:()=>{throw Error('account uniques must not be read');}}, {id:1},{id:2},{attacker:{cityPower:275000},defender:{cityPower:100000},policy:defaultCitySettings()});
 assert.equal(battle.battleV2.teams.A.cards.length,5);assert.deepEqual(battle.battleV2.teams.A.mercenaries,[]);assert.equal(battle.attackerPower,275000);
 assert.equal(CITY_FOUND_WEAPONS.length+3,10);assert.equal(CITY_ARMORS.length,6);
});
