import assert from 'node:assert/strict';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';

const cards=[
  {id:'P1',title:'P1',power:23100,uniqueAbility:{attackPercent:5,defensePercent:8,hpPercent:17,speedPercent:0,dominantType:'HP'}},
  {id:'P2',title:'P2',power:23320,uniqueAbility:{attackPercent:6,defensePercent:14,hpPercent:10,speedPercent:0,dominantType:'DEFENSE'}},
  {id:'F1',title:'F1',power:20064,uniqueAbility:{attackPercent:14,defensePercent:7,hpPercent:9,speedPercent:0,dominantType:'ATTACK'}},
  {id:'Z1',title:'Z1',power:32065,uniqueAbility:{attackPercent:6,defensePercent:7,hpPercent:8,speedPercent:17,dominantType:'SPEED'}},
  {id:'FK',title:'FK',power:26780,uniqueAbility:{attackPercent:30,defensePercent:30,hpPercent:0,speedPercent:50,dominantType:'SPEED'}}
];
const monster={id:45,name:'조로',battle_power:272212,is_boss:1,pve_hp_percent:150,pve_attack_percent:125,pve_defense_percent:125,pve_speed_percent:110};
const run=(characterBonus,seed)=>createPveBattleV2({cards,characterBonus,monster,seed,ultimateDamage:105814,bossUltimatePercent:105,bossUltimateCapPercent:105,singleHealerBonus:{enabled:true,teamHpPercent:8,healPercent:10,crisisThresholdPercent:40,crisisHealPercent:16,pvpMaxActivations:4,pveMaxActivations:6}});

const weak=run(0,1),strong=run(275492,1);
const weakUlt=weak.result.timeline.find(event=>event.type==='BOSS_ULTIMATE');
const strongUlt=strong.result.timeline.find(event=>event.type==='BOSS_ULTIMATE');
assert.ok(weakUlt.hits.every(hit=>hit.effectiveDamagePercent===105&&hit.supportMitigationPercent===0));
assert.ok(strongUlt.hits.every(hit=>hit.effectiveDamagePercent<40&&hit.supportMitigationPercent>60));
assert.ok(strongUlt.hits.every(hit=>hit.targetHpAfter>0),'endgame support power must survive Zoro opening ultimate');
const strongWins=Array.from({length:100},(_,i)=>run(275492,i+1).result.winner==='A').filter(Boolean).length;
assert.ok(strongWins>=95,`expected stable endgame clear, got ${strongWins}/100 wins`);
console.log(`pve support-power ultimate checks passed (${strongWins}/100 Zoro clears)`);
