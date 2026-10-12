import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,buildMonsterFighter,buildBattleSuitFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {createBattleSuitCombatSchedule,Z_BODY_AREA_SKILL} from '../shared/z-body-area-skill.mjs';
import {X_BODY_AREA_SKILL} from '../shared/x-body-area-skill.mjs';
import {OVERLORD_AREA_SKILL} from '../shared/overlord-suit-v1.mjs';
import {SX_AREA_SKILL} from '../shared/sx-suit-v1.mjs';

const cases=[['BATTLE_SUIT_Z_BODY',Z_BODY_AREA_SKILL],['BATTLE_SUIT_X_BODY',X_BODY_AREA_SKILL],['BATTLE_SUIT_OVERLORD',OVERLORD_AREA_SKILL],['BATTLE_SUIT_SX',SX_AREA_SKILL]];
const chips=['SKILL_CHIP_ROCKET_LAUNCHER','SKILL_CHIP_HELICOPTER_AIRSTRIKE','SKILL_CHIP_OCTA_SEEKER'];
for(const [index,[code,skill]] of cases.entries()){
 test(code+' opens immediately and repeats only at 40s boundaries, independently of equipped chips',()=>{
  const schedule=createBattleSuitCombatSchedule(chips,...cases.map((_,i)=>i===index)),casts=[];
  while(schedule.peek()?.atMs<=80000)casts.push(schedule.take());
  assert.equal(skill.openingDelayMs,0);assert.equal(skill.intervalMs,40000);
  const own=casts.filter(e=>e.chip.code===skill.code);
  assert.deepEqual(own.map(e=>[e.atMs,e.activation]),[[0,1],[40000,2],[80000,3]]);
  for(const [chip,interval,opening] of [[chips[0],3000,3000],[chips[1],15000,15000],[chips[2],10000,0]]){
   assert.deepEqual(casts.filter(e=>e.chip.code===chip).map(e=>e.atMs),Array.from({length:Math.floor((80000-opening)/interval)+1},(_,i)=>opening+i*interval));
  }
 });
 test(code+' server receipts open before support attacks and retain all five impacts on each living enemy',()=>{
  const a=['HP','DEFENSE','ATTACK','SPEED','DEFENSE'].map((power_type,i)=>({...buildFighter({id:String(i),power_type,power:3000000},i,'A',null,'PVE'),hp:1e12,maxHp:1e12,attack:1,speed:200}));
  const b=Array.from({length:5},(_,i)=>({...buildMonsterFighter({id:i+1,battle_power:50000000,is_boss:1}),id:'B:'+i+':MONSTER:'+i,hp:1e12,maxHp:1e12,shield:1e14,maxShield:1e14,attack:1,speed:200}));
  const result=simulateBattleV2Preview({teamA:[...a,buildBattleSuitFighter({code,pvePower:50000000})],teamB:b,maxActions:6000,maxCombatDurationMs:85000,seed:2011});
  const own=result.timeline.filter(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===skill.code);
  assert.deepEqual(own.map(e=>e.combatAtMs),[0,40000,80000]);
  assert.equal(new Set(own.map(e=>e.castId)).size,3);
  assert.ok(result.timeline.indexOf(own[0])<result.timeline.findIndex(e=>e.damageSource==='BATTLE_SUIT_INDEPENDENT'));
  for(const cast of own){
   assert.equal(cast.intervalMs,40000);assert.equal(cast.targetIds.length,5);
   for(const target of cast.targets){
    const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId&&e.targetId===target.targetId);
    assert.equal(hits.length,5);
    assert.deepEqual(hits.map(e=>e.combatAtMs),skill.impactOffsetsMs.map(ms=>ms+cast.combatAtMs));
    assert.equal(hits.reduce((n,e)=>n+e.damage+e.absorbed,0),target.calculatedDamage);
   }
  }
 });
}
