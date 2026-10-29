import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPvpBattleV2,createDuoBattleV2,buildFighter} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {applyMercenaryLevelStats} from '../shared/mercenary-level-v1.mjs';
import {mercenaryGrowthBasicCapScale,mercenaryGrowthOpeningGauge,mercenaryGrowthKeepsNaturalGauge} from '../shared/mercenary-growth-review-v2.mjs';
import {balanceSnapshot} from '../scripts/measure-ss-mercenary-balance-20261019.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

const f=JSON.parse(fs.readFileSync(new URL('./fixtures/mercenary-diim-growth-20261020.json',import.meta.url)));
const snapshot=(code,level)=>({...balanceSnapshot(code,level),combat:f.combat});
const options=level=>({attackerCards:f.A.cards,defenderCards:f.B.cards,attackerEquipmentBonus:f.A.equipmentBonus,defenderEquipmentBonus:f.B.equipmentBonus,
 attackerMagicCards:f.A.magicCards,defenderMagicCards:f.B.magicCards,attackerPet:f.A.pet,defenderPet:f.B.pet,
 attackerMercenary:snapshot('V-984',level),defenderMercenary:snapshot('V-057',4),seed:f.seed});
const battles=new Map([1,10,11].map(level=>[level,createPvpBattleV2(options(level))]));
const attack=(b,id)=>b.result.timeline.find(e=>e.type==='TURN'&&e.actorId==='A:MERCENARY:V-984'&&e.targetId===id);
test('Diim QA stays in the repository while its live battle modules still ship',()=>{
 for(const file of ['docs/mercenary-halloween-diim-level11-review-20261020.md','docs/mercenary-diim-growth-duo-20261020.md','tests/fixtures/mercenary-diim-growth-20261020.json']){
  assert.equal(isProductionFile(file),false);assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)));
 }
 for(const file of ['shared/mercenary-halloween-combat-v1.mjs','shared/mercenary-level-v1.mjs','shared/mercenary-combat-link-v2103.mjs','functions/_battle_v2_preview.js','functions/_mercenary_combat.js','functions/_ranked_duo_profiles.js','tests/fixtures/live.json'])assert.equal(isProductionFile(file),true);
});
test('Diim real capped basic damage still improves under common opponent growth',()=>{
 const low=battles.get(1),high=battles.get(11),target='B:0:CN-47AD4B47B6A7452C',a=attack(low,target),b=attack(high,target);
 assert.equal(a.damage+a.absorbed,500759);assert.ok(a.targetHpAfter>0);
 assert.ok(b.damage+b.absorbed>a.damage+a.absorbed);assert.equal(b.targetHpAfter,0);
 // Kangyun is Lv.4 here and now receives the same common growth correction.
 // The all-Lv.1 battle contract is covered by the roster baseline regression.
 assert.equal(low.result.winner,'B');
 assert.equal(low.teams.A.mercenaries[0].mercenaryLink.attackFloor,1233348);
});
test('the grown guard survives the first Kangyun cast aimed at it; refreshed barrier remains finite',()=>{
 const low=battles.get(1),high=battles.get(11);
 const hit=b=>b.result.timeline.find(e=>e.type==='MERCENARY_IMPERIAL_ARROW_VOLLEY'&&e.hits?.some(h=>h.targetId==='A:MERCENARY:V-984'&&!h.dodge))?.hits.find(h=>h.targetId==='A:MERCENARY:V-984');
 assert.equal(hit(low).targetHpAfter,0);assert.ok(hit(high).targetHpAfter>0);
 assert.equal(high.teams.A.mercenaries[0].maxHp,26379639);
 assert.equal(high.teams.A.mercenaries[0].mercenaryLink.openingShield,2994147);
 const castCount=b=>b.result.timeline.filter(e=>e.type==='MERCENARY_WINDUP'&&e.actorId==='A:MERCENARY:V-984').length;
 assert.ok(castCount(high)>castCount(low));
 assert.ok(high.result.actions<=83);assert.equal(high.result.reason,'ELIMINATION');
});
test('additional turns preserve learned initiative and natural turns still spend their gauge',()=>{
 const es=battles.get(11).result.timeline.filter(e=>e.type==='TURN'&&e.actorId==='A:MERCENARY:V-984');
 assert.ok(es.some(e=>e.actionClock==='MERCENARY_ADDITIONAL'&&e.actorGaugeAfter>0));
 // The legacy timeline labels every mercenary turn MERCENARY_ADDITIONAL.
 // Reserved turns retain the gauge; the following natural action spends it.
 assert.ok(es[0].actorGaugeAfter>90);assert.equal(es[1].actorGaugeAfter,es[0].actorGaugeAfter);
 assert.equal(es[2].actorGaugeAfter,0);
});
test('current PvP growth keeps Diim mastery idempotent and excludes level one/PvE',()=>{
 for(const [code,mode,level]of [['V-984','PVP',1],['V-984','PVE',11],['V-985','PVE',11]]){
  const actor=buildMercenaryFighter(snapshot(code,level),'A',mode,buildFighter),cards=tierCards(250000).map((c,i)=>buildFighter(c,i,'A',null,mode));
  applyMercenaryCombatLink([[...cards,actor]]);
  assert.equal(mercenaryGrowthBasicCapScale(actor),1);assert.equal(mercenaryGrowthOpeningGauge(actor),0);assert.equal(mercenaryGrowthKeepsNaturalGauge(actor),false);
  assert.equal(mercenaryDamageCapHp(actor),(actor.maxHp+actor.mercenaryLink.openingShield)/(actor.mercenaryLink.tierGuard||1));
 }
 for(const level of [6,11,16,20]){
  const actor=buildMercenaryFighter(snapshot('V-984',level),'A','PVP',buildFighter),cards=tierCards(250000).map((c,i)=>buildFighter(c,i,'A',null,'PVP'));
  applyMercenaryCombatLink([[...cards,actor]]);const once=structuredClone(actor);applyMercenaryLevelStats(actor);assert.deepEqual(actor,once);
  assert.ok(actor.gauge>0&&actor.gauge<=75);assert.ok(mercenaryGrowthBasicCapScale(actor)>1&&mercenaryGrowthBasicCapScale(actor)<=4);
  assert.ok(mercenaryDamageCapHp(actor)<actor.maxHp+actor.mercenaryLink.openingShield);
  const legacy={...actor,mercenaryLevel:{version:1,level}};assert.equal(mercenaryGrowthBasicCapScale(legacy),1);assert.equal(mercenaryGrowthOpeningGauge(legacy),0);
 }
});
test('duo uses the same growth rules separately for the two owners',()=>{
 const squads=(side,codes)=>codes.map(([code,level],i)=>({ownerId:side+i,ownerName:'Fixture',cards:tierCards(250000),mercenary:snapshot(code,level)}));
 const battle=createDuoBattleV2({attackerSquads:squads(1,[['V-984',11],['V-985',4]]),defenderSquads:squads(3,[['V-057',4],['V-981',4]]),seed:203001});
 const diim=battle.teams.A.mercenaries.find(m=>m.code==='V-984'),ally=battle.teams.A.mercenaries.find(m=>m.code==='V-985');
 assert.equal(diim.mercenaryLevel.level,11);assert.equal(diim.mercenaryLevelApplied,true);assert.equal(ally.mercenaryLevel.level,4);
 assert.equal(mercenaryGrowthKeepsNaturalGauge(ally),true);
 assert.ok(battle.result.timeline.some(e=>e.actorId===diim.id&&e.type==='MERCENARY_BUFF'&&e.amount>0));
 assert.ok(Number.isFinite(battle.result.actions));
});
