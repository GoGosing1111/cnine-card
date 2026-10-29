import test from 'node:test';
import assert from 'node:assert/strict';
import {createPvpBattleV2,createPveBattleV2,createDuoBattleV2,buildFighter} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {applyMercenaryLevelStats} from '../shared/mercenary-level-v1.mjs';
import {mercenaryGrowthBasicCapScale,mercenaryGrowthOpeningGauge,MERCENARY_PVP_GROWTH_COMBAT,MERCENARY_PVP_GROWTH_DESCRIPTION} from '../shared/mercenary-growth-review-v2.mjs';
import {growthProbe,snapshot,cards} from '../scripts/measure-mercenary-growth-roster-20261020.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';

const probe=await growthProbe();
const at=(code,level)=>snapshot(code,level,{finalBreakthrough:false});
function fighter(code,level,mode='PVP'){
 const actor=buildMercenaryFighter(at(code,level),'A',mode,buildFighter);
 applyMercenaryCombatLink([[...cards.map((c,i)=>buildFighter(c,i,'A',null,mode)),actor]]);
 return actor;
}
test('high-level basic cap keeps progressing through 19, 20 and the final 21 breakthrough',()=>{
 for(const code of ['V-001','V-042','V-057','V-984','V-996','V-989','V-999']){
  const actors=[16,18,19,20,21].map(level=>fighter(code,level));
  assert.deepEqual(actors.map(mercenaryGrowthBasicCapScale),[Math.sqrt(8.5),3,Math.sqrt(9.25),Math.sqrt(9.5),Math.sqrt(11)]);
  for(const actor of actors){assert.equal(mercenaryGrowthOpeningGauge(actor),75);const once=structuredClone(actor);applyMercenaryLevelStats(actor);assert.deepEqual(actor,once);}
  const target={...buildFighter(cards[1],1,'B',null,'PVP'),defense:0};
  const hit=a=>probe.engine.hitResult({...a,attack:1e12},target,()=>.5,1,false,{basicAttack:true,damageCapScale:2}).damage;
  const hits=actors.map(hit);
  for(let i=1;i<hits.length;i++)assert(hits[i]>hits[i-1],code+' hit progression');
  assert(Math.abs(hits[4]/hits[3]-Math.sqrt(11/9.5))<.00001,code+' final breakthrough damage');
  assert(Math.abs(hits[4]/hits[0]-Math.sqrt(11/8.5))<.00001,code+' 16 to 21 damage');
 }
});
test('the upper bound cannot amplify early, non-growing, legacy, PvE, skill or counter packets',()=>{
 const actor={...fighter('V-999',21),attack:1e12},target={...buildFighter(cards[1],1,'B',null,'PVP'),defense:0};
 const hit=(a,options={},counter=false)=>probe.engine.hitResult(a,target,()=>.5,1,counter,{damageCapScale:2,...options}).damage;
 const plain={...actor,mercenaryLevelApplied:false};
 assert.equal(hit(actor),hit(plain));assert.equal(hit(actor,{basicAttack:true},true),hit(plain,{basicAttack:true},true));
 for(const change of [{isMercenary:false},{statMode:'LEGACY'},{battleMode:'PVE'},{mercenaryLevelApplied:false},{mercenaryLevel:{version:1,level:21}}])assert.equal(mercenaryGrowthBasicCapScale({...actor,...change}),1);
 const over={...actor,mercenaryGrowth:{...actor.mercenaryGrowth,total:{...actor.mercenaryGrowth.total,attackPercent:1e9}}};
 assert.equal(mercenaryGrowthBasicCapScale(over),4);
 assert.equal(mercenaryGrowthBasicCapScale(fighter('V-999',1)),1);
 assert.equal(mercenaryGrowthBasicCapScale(fighter('V-999',18)),3);
 assert.equal(mercenaryGrowthBasicCapScale(fighter('V-999',21,'PVE')),1);
});
test('outgoing cap changes do not raise durability, initiative or base stats',()=>{
 const actor=fighter('V-999',21);
 assert.deepEqual(MERCENARY_PVP_GROWTH_COMBAT,{version:2,maxBasicCapScale:4,maxDurabilityCapScale:3,maxOpeningGauge:75});
 assert.equal(mercenaryDamageCapHp(actor),(actor.maxHp/3+actor.mercenaryLink.openingShield)/(actor.mercenaryLink.tierGuard||1));
 assert.equal(actor.gauge,75);
 assert.deepEqual(actor.mercenaryGrowth.total,{hpPercent:900,attackPercent:1000,defensePercent:180,speedPercent:28,skillPowerPercent:20,mitigationBypassPercent:50,actionCatchupPercent:70,actionCreditPercent:75});
});
test('current PvP and owner-local duo snapshots apply 16/20/21 independently without rewriting input',()=>{
 const squads=(owner,levels)=>levels.map((level,i)=>({ownerId:owner+i,ownerName:'검수',cards,mercenary:at('V-999',level)}));
 const inputs={attackerSquads:squads(1,[16,21]),defenderSquads:squads(3,[20,21]),seed:82011},original=structuredClone(inputs);
 const duo=createDuoBattleV2(inputs);assert.deepEqual(inputs,original);assert.equal(duo.result.reason,'ELIMINATION');
 assert.deepEqual([...duo.teams.A.mercenaries,...duo.teams.B.mercenaries].map(a=>[a.ownerId,a.level,mercenaryGrowthBasicCapScale(a)]),[[1,16,Math.sqrt(8.5)],[2,21,Math.sqrt(11)],[3,20,Math.sqrt(9.5)],[4,21,Math.sqrt(11)]]);
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:at('V-999',21),defenderMercenary:at('V-996',20),seed:82013});
 assert.equal(pvp.result.reason,'ELIMINATION');assert.equal(mercenaryGrowthBasicCapScale(pvp.teams.A.mercenaries[0]),Math.sqrt(11));
 const pve=createPveBattleV2({cards,mercenary:at('V-999',21),monster:{id:1,battle_power:5e8,isBoss:true},seed:82017});
 assert.equal(mercenaryGrowthBasicCapScale(pve.teams.A.mercenaries[0]),1);assert(pve.result.timeline.some(e=>e.type==='MERCENARY_HELIOS_AREA'));
});
test('public codex explains the new basic ceiling while keeping the separate defensive cap',()=>{
 const doc=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61});
 assert.match(MERCENARY_PVP_GROWTH_DESCRIPTION,/최대 4배/);assert.match(MERCENARY_PVP_GROWTH_DESCRIPTION,/최대 3배 보정/);
 for(const code of ['V-001','V-984','V-996','V-999']){
  const card=doc.cards.find(c=>c.code===code);assert.equal(card.combatLinkDescription.split(MERCENARY_PVP_GROWTH_DESCRIPTION).length,2,code);
 }
});
