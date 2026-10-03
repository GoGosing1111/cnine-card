import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenarySkillCapActions} from '../functions/_mercenary_combat.js';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {CRYVERN_BALANCE,CRYVERN_PVP_BASIC_DAMAGE_SCALE,CRYVERN_PVP_SKILL_CAP_SCALE,cryvernPvpBasicDamageScale,cryvernCrownCapScale} from '../shared/mercenary-cryvern-v1.mjs';

function harness({code='V-049',mode='PVP',regular=false,ownerId}={}){
 const actor=regular?buildFighter({id:'V-049',power:180000,type:'ATTACK'},0,'A',null,mode):buildMercenaryFighter(candidate(code),'A',mode,buildFighter);
 if(ownerId)actor.ownerId=ownerId;
 const target={...buildFighter({id:'target',power:2e7},0,'B',null,mode),hp:1e6,maxHp:1e6,shield:0,actions:0},protector={...target,id:'protector'},calls=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:[target,protector]},hit(){throw Error('No additional hit or random roll');},damage(t,n){calls.push({id:t.id,amount:n});t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit(){},clock:()=>0});
 return {actor,target,protector,runtime,calls};
}
test('Cryvern PVP basic and crown budgets apply to solo and either duo owner with the same resources',()=>{
 assert.equal(CRYVERN_PVP_BASIC_DAMAGE_SCALE,1.165);assert.equal(CRYVERN_PVP_SKILL_CAP_SCALE,1.6);
 assert.deepEqual(CRYVERN_BALANCE,{damageRatio:5.88,cooldownTurns:5,cost:35});
 for(const ownerId of [undefined,11,22]){
  const h=harness({ownerId}),before=structuredClone(h.actor);
  assert.equal(cryvernPvpBasicDamageScale(h.actor),1.165);assert.equal(mercenarySkillCapActions(h.actor,h.actor.skills[0],false),1.6);
  for(const n of [0,1,10001,600000])assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,n),Math.floor(n*1.165));
  assert.deepEqual(h.actor,before);assert.equal(h.calls.length,0);
 }
});
test('PVE, ordinary cards and other mercenaries cannot inherit the Cryvern bonus',()=>{
 for(const cfg of [{mode:'PVE'},{code:'V-046'},{regular:true}]){
  const h=harness(cfg);assert.equal(cryvernPvpBasicDamageScale(h.actor),1);assert.equal(cryvernCrownCapScale(h.actor),1.3);
  for(const n of [0,.5,10001,600000])assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,n),n);
 }
 const h=harness({code:'V-055'});assert.equal(cryvernPvpBasicDamageScale(h.actor),1);
 assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,10000),5000);assert.equal(mercenarySkillCapActions(h.actor,h.actor.skills[0],false),1.865);
 assert.equal(cryvernPvpBasicDamageScale(null),1);assert.equal(cryvernCrownCapScale(null),1.3);
});
test('guard and interception divide the amplified basic budget once without bypass or duplicate transfer',()=>{
 const h=harness();h.runtime.buffs.set(h.target.id,{intercept:{actor:h.protector,skill:{id:'MS-001',name:'보호',mechanic:'INTERCEPT_ONE_HIT'},percent:40,expires:2}});
 const remaining=h.runtime.beforeBasicDamage(h.actor,h.target,10000);
 assert.equal(remaining,6990);assert.deepEqual(h.calls,[{id:'protector',amount:4660}]);assert.equal(remaining+h.calls[0].amount,11650);
 assert.equal(h.actor.damageDealt,4660);assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,10000),11650);assert.equal(h.calls.length,1);
 const ward=harness();ward.runtime.buffs.set(ward.target.id,{standfast:{actor:ward.protector,skill:{id:'MS-005',name:'수호',mechanic:'FRONT_STAND_FAST'},percent:25,budget:1e6,expires:2}});
 assert.equal(ward.runtime.beforeBasicDamage(ward.actor,ward.target,10000),8738);
});
test('the real solo and duo engines replay deterministically with fixed crown targets and five cards per owner',()=>{
 const cards=tierCards(2e7),cryvern=candidate('V-049'),berkan=candidate('V-055'),ragniel=candidate('V-046');
 const solo={attackerCards:cards,defenderCards:cards,attackerMercenary:cryvern,defenderMercenary:berkan,seed:171001*7919};
 const squad=(ownerId,mercenary)=>({ownerId,ownerName:'검수',cards,mercenary,equipmentBonus:154300});
 const duo={attackerSquads:[squad(11,cryvern),squad(22,cryvern)],defenderSquads:[squad(33,berkan),squad(44,ragniel)],seed:171001*7919};
 for(const [make,input,count] of [[createPvpBattleV2,solo,1],[createDuoBattleV2,duo,2]]){
  const before=structuredClone(input),battle=make(input);assert.deepEqual(input,before);assert.deepEqual(make(input),battle);
  assert.equal(battle.teams.A.cards.length,5*count);assert.equal(battle.teams.A.mercenaries.length,count);
  const events=battle.result.timeline.filter(e=>e.type==='MERCENARY_CRYSTAL_CROWN');assert.ok(events.length);
  for(const e of events){assert.ok(e.targetIds.length<=2);for(const i of e.impacts){assert.ok(e.targetIds.includes(i.targetId));assert.ok(Number.isFinite(i.damage)&&i.damage>=0);}}
 }
});
