import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {BERKAN_PVP_BASIC_DAMAGE_SCALE,berkanPvpBasicDamageScale} from '../shared/mercenary-berkan-v1.mjs';

function harness({code='V-055',mode='PVP',regular=false,ownerId}={}){
 const actor=regular?buildFighter({id:'V-055',power:180000,type:'ATTACK'},0,'A',null,mode):buildMercenaryFighter(candidate(code),'A',mode,buildFighter);
 if(ownerId)actor.ownerId=ownerId;
 const target={...buildFighter({id:'target',power:2e7},0,'B',null,mode),hp:1e6,maxHp:1e6,shield:0,actions:0},protector={...target,id:'protector'},damageCalls=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:[target,protector]},hit(){throw Error('Basic adjustment must not reroll a hit');},damage(t,n){damageCalls.push({id:t.id,amount:n});t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit(){},clock:()=>0});
 return {actor,target,protector,runtime,damageCalls};
}
test('PVP Berkan basics reduce already-capped damage once for solo and duo without changing actor stats or resources',()=>{
 assert.equal(BERKAN_PVP_BASIC_DAMAGE_SCALE,.50);
 for(const ownerId of [undefined,11,22]){const h=harness({ownerId}),before=structuredClone(h.actor);
  for(const amount of [0,1,10001,600000])assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,amount),Math.floor(amount*.50));
  assert.deepEqual(h.actor,before);assert.equal(h.damageCalls.length,0);
 }
});
test('PVE Berkan, other SSS mercenaries and ordinary cards keep exact prior damage',()=>{
 for(const config of [{mode:'PVE'},{code:'V-049'},{code:'V-046'},{regular:true}]){const h=harness(config);assert.equal(berkanPvpBasicDamageScale(h.actor),1);for(const amount of [0,.5,10001,600000])assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,amount),amount);}
 assert.equal(berkanPvpBasicDamageScale(null),1);
});
test('interception consumes the reduced damage budget without a second reduction or duplicate transfer',()=>{
 const h=harness();h.runtime.buffs.set(h.target.id,{intercept:{actor:h.protector,skill:{id:'MS-001',name:'보호',mechanic:'INTERCEPT_ONE_HIT'},percent:40,expires:2}});
 const remaining=h.runtime.beforeBasicDamage(h.actor,h.target,10000);
 assert.equal(remaining,3000);assert.deepEqual(h.damageCalls,[{id:'protector',amount:2000}]);assert.equal(remaining+h.damageCalls[0].amount,5000);assert.equal(h.actor.damageDealt,2000);
 assert.equal(h.runtime.beforeBasicDamage(h.actor,h.target,10000),5000);assert.equal(h.damageCalls.length,1);
});
