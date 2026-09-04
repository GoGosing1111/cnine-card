import assert from 'node:assert/strict';
import test from 'node:test';

import {APOCALYPSE_RULES,createPveBattleV2} from '../functions/_battle_v2_preview.js';

// V1990: 아포칼립스 = 최종 난이도. 마법카드(강탈의 성배 등)로 우회 불가, 배틀슈트가 있어야 깨진다.
const TYPES=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'];
const deck=(cardPower)=>TYPES.map((type,index)=>({id:`APO-${index+1}`,title:`APO ${index+1}`,rarity:'FUR',power_type:type,power:cardPower}));
const apocalypseBoss=(basePower)=>({
  id:71,name:'검증 아포 보스',battle_power:basePower,is_boss:1,pve_difficulty:'APOCALYPSE',
  pve_hp_percent:260,pve_attack_percent:220,pve_defense_percent:190,pve_speed_percent:160,pve_shield_percent:40,
  pve_attack_count:2,pve_forced_action_every:4
});
const siphonCards=[1,2,3,4,5].map(slotNo=>({id:`GRAIL-${slotNo}`,code:'V2_SHIELD_SIPHON',name:'강탈의 성배',slotNo,effectType:'SHIELD_SIPHON',effectValue:60,triggerChance:20,maxActivations:2,enhancementLevel:4}));
const suit=(pvePower,weapon='EQ_1785427638137')=>({code:'BATTLE_SUIT_02',name:'배틀슈트 02',pvePower,weapon:{code:weapon}});

function winRate(options,seeds=24){
  let wins=0;
  for(let seed=1;seed<=seeds;seed+=1){
    const battle=createPveBattleV2({...options,bossUltimatePercent:28,seed});
    if(battle.result.winner==='A')wins+=1;
  }
  return wins/seeds;
}

test('apocalypse exposes its final-difficulty rules',()=>{
  const battle=createPveBattleV2({cards:deck(400000),monster:apocalypseBoss(2000000),seed:1});
  assert.equal(battle.rules.apocalypseRules.floorGain,APOCALYPSE_RULES.floorGain);
  assert.equal(battle.rules.apocalypseRules.magicEffectCap,'ONE_FLOORED_HIT_PER_ACTIVATION');
  assert.equal(battle.rules.apocalypseRules.battleSuitPierce,'SHIELD_IGNORING_MAXHP_PERCENT_PER_SHOT');
  assert.equal(APOCALYPSE_RULES.suitFirepower,2);
  assert.equal(APOCALYPSE_RULES.suitFirepowerGateExponent,3);
  const normal=createPveBattleV2({cards:deck(400000),monster:{id:1,name:'일반',battle_power:2000000,is_boss:1},seed:1});
  assert.equal(normal.rules.apocalypseRules,null,'non-apocalypse battles carry no apocalypse rules');
});

test('강탈의 성배 cannot strip an apocalypse boss shield beyond one floored hit per activation',()=>{
  const cards=deck(400000);
  const siphons=[];
  let boss=null;
  for(let seed=1;seed<=40&&siphons.length<6;seed+=1){
    const battle=createPveBattleV2({cards,magicCards:siphonCards,monster:apocalypseBoss(2000000),seed});
    boss=battle.teams.B.cards[0];
    siphons.push(...battle.result.timeline.filter(event=>event.type==='MAGIC_CARD'&&event.effectType==='SHIELD_SIPHON'));
  }
  const floorCap=boss.maxHp*0.016*APOCALYPSE_RULES.floorGain*APOCALYPSE_RULES.magicCapHits;
  assert.ok(siphons.length>0,'fixture must activate the grail');
  assert.ok(siphons.every(event=>Number(event.shieldStolen||0)<=floorCap+1),'stolen shield per activation must be capped to one floored hit');
  // 비-아포 보스는 종전대로 현재 보호막의 60% 를 빼앗는다.
  const normalSiphons=[];
  for(let seed=1;seed<=40&&normalSiphons.length<6;seed+=1){
    const normal=createPveBattleV2({cards,magicCards:siphonCards,monster:{id:2,name:'일반 실드 보스',battle_power:2000000,is_boss:1,pve_shield_percent:40},seed});
    normalSiphons.push(...normal.result.timeline.filter(event=>event.type==='MAGIC_CARD'&&event.effectType==='SHIELD_SIPHON'));
  }
  assert.ok(normalSiphons.some(event=>Number(event.shieldStolen||0)>floorCap*3),'non-apocalypse siphon must keep its full 60% steal');
});

test('battle suit shots pierce the apocalypse shield with shield-ignoring HP damage',()=>{
  const battle=createPveBattleV2({cards:deck(400000),battleSuit:suit(300000),monster:apocalypseBoss(2000000),seed:3});
  const actorId=battle.teams.A.supports[0].id;
  const shots=battle.result.timeline.filter(event=>event.type==='TURN'&&event.actorId===actorId&&!event.dodge);
  assert.ok(shots.length>20,'battle suit must keep firing through the apocalypse fight');
  const pierced=shots.filter(event=>Number(event.apocalypsePierce||0)>0);
  assert.ok(pierced.length>=shots.length*.9,'nearly every shot must carry pierce damage');
  const shieldedPierce=shots.find(event=>Number(event.targetShieldAfter||0)>0&&Number(event.apocalypsePierce||0)>0);
  assert.ok(shieldedPierce,'pierce must reduce HP while the boss shield is still up');
  const normal=createPveBattleV2({cards:deck(400000),battleSuit:suit(300000),monster:{id:2,name:'일반',battle_power:2000000,is_boss:1},seed:3});
  const normalActor=normal.teams.A.supports[0].id;
  assert.ok(normal.result.timeline.filter(event=>event.type==='TURN'&&event.actorId===normalActor).every(event=>!event.apocalypsePierce),'pierce is apocalypse-only');
});

test('apocalypse gate: suit ≥15% of base power clears at deck ≈ base, cards alone need ≈ ×1.6, the grail no longer trivialises',()=>{
  for(const base of [1000000,2000000]){
    const monster=apocalypseBoss(base);
    const at=(ratio,extra={})=>winRate({cards:deck(Math.round(base*ratio/5)),monster,...extra});
    assert.equal(at(1.0),0,`base ${base}: deck ×1.0 without suit must lose`);
    assert.ok(at(1.2)<=0.1,`base ${base}: deck ×1.2 without suit must still lose`);
    assert.ok(at(1.7)>=0.6,`base ${base}: deck ×1.7 without suit can win`);
    assert.ok(at(1.0,{magicCards:siphonCards})<=0.1,`base ${base}: five grails at deck ×1.0 must not clear`);
    assert.ok(at(1.0,{battleSuit:suit(base*.15)})>=0.6,`base ${base}: deck ×1.0 + suit 15% must clear most runs`);
    assert.ok(at(1.2,{battleSuit:suit(base*.15)})>=0.9,`base ${base}: deck ×1.2 + suit 15% clears`);
    assert.ok(at(0.7,{battleSuit:suit(base*.15)})<=0.2,`base ${base}: a weak deck cannot be carried by the suit alone`);
    assert.ok(at(1.0,{battleSuit:suit(base*.15,'EQ_1785961300455')})>=0.6,`base ${base}: sniper cadence keeps the same pierce firepower`);
  }
});
