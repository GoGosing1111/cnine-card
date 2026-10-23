import test from 'node:test';
import assert from 'node:assert/strict';
import {cityCombatMatchup,cityCombatDamage} from '../shared/jokgak-city-counter-v1.mjs';
import {CITY_ROLES,cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {createCityBattle,prepareCityBattle} from '../functions/_jokgak_city_battle.js';
import {cityStatus} from '../functions/_jokgak_city.js';
import {processCitySupply} from '../functions/_jokgak_city_supply.js';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';

const cards=Array.from({length:5},(_,i)=>({id:String(i+1),name:'도시 검산 '+i,title:'',rarity:'SS',power:1e12,type:'HEAL'}));
const state=role=>({role,cityPower:role==='POLICE'?690000:600000,policePowerBonus:role==='POLICE'?90000:0});
test('all 49 role pairings: only a real gang/police matchup alters power or city damage',()=>{
 for(const a of CITY_ROLES)for(const b of CITY_ROLES){
  const attacker=Object.freeze(state(a.code)),defender=Object.freeze(state(b.code)),m=cityCombatMatchup(attacker,defender);
  const active=[a.code,b.code].includes('GANG')&&[a.code,b.code].includes('POLICE');
  assert.equal(m.attackerPower,active?(a.code==='GANG'?780000:600000):attacker.cityPower);
  assert.equal(m.defenderPower,active?(b.code==='GANG'?780000:600000):defender.cityPower);
  assert.equal(!!m.counter,active);
  assert.equal(cityCombatDamage(attacker,defender,25),a.code==='GANG'&&b.code==='POLICE'?40:25);
 }
 assert.deepEqual(cityCombatMatchup(undefined,undefined),{attackerPower:100000,defenderPower:100000,counter:null});
 const fakePolice={...state('CITIZEN'),disguise:{active:{role:'POLICE'}}};
 assert.equal(cityCombatMatchup(state('GANG'),fakePolice).counter,null);
 const fakeGang={...state('CITIZEN'),disguise:{active:{role:'GANG'}}};
 assert.equal(cityCombatMatchup(fakeGang,state('POLICE')).counter,null);
 const hiddenGang={...state('GANG'),disguise:{active:{role:'POLICE'}}};
 assert.equal(cityCombatMatchup(hiddenGang,state('POLICE')).attackerPower,780000);
 assert.equal(cityCombatDamage(hiddenGang,state('POLICE'),25),40);
});
test('all rank power levels and both directions reach the actual normalized battle, without persistent changes',async()=>{
 for(const rankPercent of [0,5,10,15,50])for(const reverse of [false,true]){
  const gang=state('GANG'),police={...state('POLICE'),cityPower:600000*(100+rankPercent)/100,policePowerBonus:600000*rankPercent/100};
  const [attacker,defender]=reverse?[police,gang]:[gang,police],before=JSON.stringify([attacker,defender]);
  const battle=await prepareCityBattle({}, {pvpDeckSnapshot:async()=>cards},{id:1},{id:2},{attacker,defender});
  assert.equal(battle.attackerPower,reverse?600000:780000);assert.equal(battle.defenderPower,reverse?780000:600000);
  assert.deepEqual(battle.battleV2.rules.weaponPower,{A:battle.attackerPower,B:battle.defenderPower});
  assert.equal(battle.battleV2.teams.A.cards.reduce((sum,c)=>sum+c.power,0),battle.attackerPower);
  assert.equal(battle.battleV2.rules.cityGangCounter.policeRankPowerIgnored,police.policePowerBonus);
  assert.equal(battle.battleV2.result.winner,reverse?'B':'A');assert.equal(JSON.stringify([attacker,defender]),before);
 }
});
test('controlled equal-equipment simulation: gang strongly counters the highest rank on attack and defense',t=>{
 let gangWins=0,total=0;
 for(let seed=1;seed<=200;seed++)for(const reverse of [false,true]){
  const matchup=cityCombatMatchup(...(reverse?[state('POLICE'),state('GANG')]:[state('GANG'),state('POLICE')]));
  const b=createCityBattle({attackerCards:cards,defenderCards:cards,...matchup,seed});
  total++;if(b.result.winner===(reverse?'B':'A'))gangWins++;
 }
 assert.equal(gangWins,total);t.diagnostic(JSON.stringify({scenario:'equal equipment, 200 seeds, both directions; not live statistics',gangWins,total}));
});

const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const saveLife=(f,id,l)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();
const status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
async function setup(t,pg){
 const f=await cityFixture(t,pg),row=await f.p("SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1'").first(),p=JSON.parse(row.value);
 p.career.enabled=true;p.career.startedAt=f.now;p.roles.forEach(r=>r.regenPerMinute=0);
 await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",JSON.stringify(p)).run();
 for(const id of [f.roles.GANG,f.roles.POLICE,f.roles.CITIZEN])await f.join(id);
 const l=await life(f,f.roles.POLICE);l.careers.ON.merit=15;await saveLife(f,f.roles.POLICE,l);
 f.deps.pvpDeckSnapshot=async()=>cards;f.deps.prepareCityBattle=prepareCityBattle;return f;
}
async function ready(f,location='MARKET'){
 for(const role of ['GANG','POLICE','CITIZEN']){
  const id=f.roles[role];await f.p('UPDATE jokgak_city_players_v1 SET location=?,health=?,health_at=?,wanted=2,jailed_until=0,next_action_at=0,protected_until=0 WHERE user_id=?',location,role==='POLICE'?150:100,f.now,id).run();
 }
}
for(const pg of [false,true]){
 const db=pg?'Postgres':'SQLite';
 test(db+': real attack/defense/arrest/supply use the counter; receipts, normal stats and wages stay consistent',async t=>{
  const f=await setup(t,pg),g=f.roles.GANG,p=f.roles.POLICE,c=f.roles.CITIZEN;
  for(const [actor,target,kind,side] of [[g,p,'attack','A'],[p,g,'attack','B'],[p,g,'arrest','B']]){
   await ready(f);const requestId=crypto.randomUUID(),r=await f.action(actor,kind,{targetId:target,requestId});
   assert.equal(r.battleV2.result.winner,side);
   assert.equal(r.effects.damageToMine,side==='B'?40:0);assert.equal(r.effects.damageToTarget,side==='A'?40:0);
   assert.equal(r.effects.jailMs,0);assert.equal((await status(f,p)).mine.health,110);
   const replay=await f.action(actor,kind,{targetId:target,requestId});assert.equal(replay.replayed,true);
   assert.equal(JSON.stringify(replay.battleV2),JSON.stringify(r.battleV2));assert.equal((await status(f,p)).mine.health,110);
   assert.equal((await status(f,p)).mine.cityPower,115000);assert.equal((await status(f,g)).mine.cityPower,100000);
   assert.equal((await status(f,p)).mine.policeRank.merit,15);assert.equal((await status(f,p)).mine.career.incomePerHour,3900);
  }
  // The same endpoint against another real role retains its original rank and damage.
  await ready(f);const normal=await f.action(p,'attack',{targetId:c});
  assert.equal(normal.attackerPower,115000);assert.equal(normal.defenderPower,100000);
  assert.equal(normal.battleV2.rules.cityGangCounter,undefined);
  assert.equal(normal.effects.damageToMine+normal.effects.damageToTarget,25);
  const supplies=await processCitySupply(f.env,{now:f.now}),drop=supplies.records[0].drop;f.setTime(drop.dropsAt+1000);
  await ready(f,drop.location);await f.action(p,'claimSupply',{dropId:drop.id});
  const taken=await f.action(g,'attackSupply',{targetId:p,dropId:drop.id});
  assert.equal(taken.effects.damageToTarget,40);assert.equal(taken.supply.kind,'TAKEN');assert.equal(taken.supply.holder.userId,g);
  assert.equal(taken.theft,null);assert.equal(taken.bounty,null);assert.equal(taken.reward.status,'NONE');
  await ready(f,drop.location);const held=await f.action(p,'attackSupply',{targetId:g,dropId:drop.id});
  assert.equal(held.effects.damageToMine,40);assert.equal(held.supply.kind,'DEFENDED');assert.equal(held.supply.holder.userId,g);
 });
 test(db+': failure rollback, lost response, draw, and arrest death keep existing receipt and bounty rules',async t=>{
  const f=await setup(t,pg),g=f.roles.GANG,p=f.roles.POLICE;await ready(f);
  const requestId=crypto.randomUUID();f.fail('INSERT INTO jokgak_city_actions_v1');
  await assert.rejects(f.action(g,'attack',{targetId:p,requestId}),/INJECTED_FAILURE/);f.fail('');
  assert.equal((await status(f,p)).mine.health,150);
  f.lost();const recovered=await f.action(g,'attack',{targetId:p,requestId});assert.equal(recovered.replayed,true);
  assert.equal((await status(f,p)).mine.health,110);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE request_id=?',requestId).first()).n),1);
  await ready(f);f.deps.prepareCityBattle=async(...args)=>{const r=await prepareCityBattle(...args);r.battleV2.result.winner='DRAW';return r;};
  const draw=await f.action(g,'attack',{targetId:p});assert.equal(draw.effects.damageToTarget,0);assert.equal(draw.effects.damageToMine,0);
  f.deps.prepareCityBattle=prepareCityBattle;await ready(f);await f.p('UPDATE jokgak_city_players_v1 SET health=40 WHERE user_id=?',p).run();
  const defended=await f.action(p,'arrest',{targetId:g});assert.equal(defended.effects.damageToMine,40);assert.equal(defended.mine.health,0);
  assert.equal(defended.bounty,null);assert.equal((await status(f,g)).mine.cityKills,0);assert.equal(defended.effects.jailMs,0);
 });
}
