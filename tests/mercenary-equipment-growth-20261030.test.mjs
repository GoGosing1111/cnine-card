import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedSnapshot} from './helpers/mercenary-rank-growth-20261029.mjs';
import {ASCENDANT_EQUIPMENT,ascendantEquipmentEffects} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {mercenaryGrowthStatPreview,mercenaryGrowthSummary} from '../shared/mercenary-growth-review-v2.mjs';
import {applyMercenaryLevelStats} from '../shared/mercenary-level-v1.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {simulateRankedSeries} from '../shared/ranked-series-v1.mjs';

const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'성장 장비 회귀',rarity:'FUR',power:1000000,power_type:'ATTACK'}));
const geared=(mode,tier=8,level=21,enhancement=0,code='V-972',count=5)=>{
 const items=ASCENDANT_EQUIPMENT.filter(i=>i.tier===tier).slice(0,count).map(i=>{
  const power=enhancement?forgePower(i.totalPower,enhancement):{pve:i.pvePower,pvp:i.pvpPower};
  return {...i,level:enhancement,pvePower:power.pve,pvpPower:power.pvp};
 });
 return {...structuredClone(rankedSnapshot(code,level)),equipment:{schemaVersion:1,mode,revision:1,items,power:items.reduce((sum,i)=>sum+i[mode==='PVE'?'pvePower':'pvpPower'],0),effects:ascendantEquipmentEffects(items.map(i=>i.code),mode).effects}};
};
const build=(snapshot,mode)=>buildMercenaryFighter(snapshot,'A',mode,buildFighter);
const summary=()=>{const g=rankedSnapshot('V-972',21).mercenaryLevel;return mercenaryGrowthSummary(g.growth,g);};

test('growth preserves fractional equipment speed until the existing final floor',()=>{
 const base={hp:1000,attack:500,defense:100,speed:150791.30000000002},growth=summary(),result=mercenaryGrowthStatPreview(base,growth);
 assert.deepEqual(result.before,base);
 assert.equal(result.after.speed,Math.floor(base.speed*(1+growth.total.speedPercent/100)));
 const edge=mercenaryGrowthStatPreview({...base,speed:10.9},{total:{hpPercent:0,attackPercent:0,defensePercent:0,speedPercent:100}});
 assert.equal(edge.after.speed,21,'do not floor or round equipment speed before growth');
 assert.equal(mercenaryGrowthStatPreview({...base,speed:0},growth).after.speed,0);
});

test('fractional speed support retains invalid-stat, overflow and growth-policy rejection',()=>{
 const base={hp:1000,attack:500,defense:100,speed:100},growth=summary();
 for(const key of Object.keys(base))for(const value of [-1,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>mercenaryGrowthStatPreview({...base,[key]:value},growth),{code:'MERCENARY_LEVEL_CONFIG'});
 for(const key of ['hp','attack','defense'])assert.throws(()=>mercenaryGrowthStatPreview({...base,[key]:1.5},growth),{code:'MERCENARY_LEVEL_CONFIG'});
 assert.throws(()=>mercenaryGrowthStatPreview({...base,speed:Number.MAX_SAFE_INTEGER},{total:{hpPercent:0,attackPercent:0,defensePercent:0,speedPercent:100}}),{code:'MERCENARY_LEVEL_CONFIG'});
 const bad=geared('PVP');bad.mercenaryLevel.growth.perLevel.speedPercent=6;
 assert.throws(()=>applyMercenaryLevelStats(build(bad,'PVP')),{code:'MERCENARY_LEVEL_CONFIG'});
});

test('all ten 5-piece tiers combine with levels 1/6/16/21 in PVE and PVP exactly once',()=>{
 let fractional=0;
 for(const mode of ['PVE','PVP'])for(let tier=1;tier<=10;tier++)for(const level of [1,6,16,21]){
  const s=geared(mode,tier,level),a=build(s,mode),speed=a.speed,growth=mercenaryGrowthSummary(s.mercenaryLevel.growth,s.mercenaryLevel);
  fractional+=Number(!Number.isInteger(speed));
  const effects=structuredClone(a.equipmentEffects),power=a.power;
  applyMercenaryLevelStats(a);
  assert.equal(a.speed,Math.floor(speed*(1+growth.total.speedPercent/100)),`${mode} tier ${tier} level ${level}`);
  assert.equal(a.mercenaryGrowthBaseSpeed,speed);assert.equal(a.level,level);assert.deepEqual(a.equipmentEffects,effects);assert.equal(a.power,power);
  for(const value of [a.maxHp,a.attack,a.defense,a.speed])assert(Number.isSafeInteger(value)&&value>0);
  const once=structuredClone(a);applyMercenaryLevelStats(a);assert.deepEqual(a,once);
 }
 assert(fractional>0,'must exercise the pre-fix failure');
});

test('8th-tier +10 equipment with awakened Omega Lv.21 completes real PVE/PVP battle construction',()=>{
 for(const mode of ['PVE','PVP']){
  const s=geared(mode,8,21,10),a=build(s,mode);assert(!Number.isInteger(a.speed));
  const battle=mode==='PVE'?createPveBattleV2({cards,mercenary:s,monster:{id:1,name:'검수',battle_power:1e10},seed:17}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:s,defenderMercenary:rankedSnapshot('V-058',21),seed:17});
  const m=battle.teams.A.mercenaries[0];assert.equal(m.level,21);assert(m.mercenaryLevelApplied);assert.equal(m.equipmentEffects.speedPercent,10);assert.equal(m.equipmentEffects.shieldPercent,22);assert(battle.result.timeline.length>0);assert(['A','B','DRAW'].includes(battle.result.winner));
 }
});

test('duo owner with the full set and growth can enter and resolve battle',()=>{
 const squad=(ownerId,mercenary)=>({ownerId,cards:cards.map((c,i)=>({...c,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i]})),mercenary});
 const b=createDuoBattleV2({attackerSquads:[squad(7,geared('PVP',8,21,10)),squad(8,rankedSnapshot('V-058',16))],defenderSquads:[squad(9,rankedSnapshot('V-058',21)),squad(10,rankedSnapshot('V-979',5))],seed:17});
 const own=b.teams.A.mercenaries.find(m=>m.ownerId===7);assert(own.mercenaryLevelApplied);assert.equal(own.equipmentEffects.speedPercent,10);assert(b.result.timeline.length>0);
 assert(!b.teams.A.mercenaries.find(m=>m.ownerId===8).equipmentEffects);
});

test('ranked series resolves equipped grown mercenaries across round boundaries',()=>{
 const series=simulateRankedSeries({createBattle:createPvpBattleV2,options:{attackerCards:cards,defenderCards:cards},attackerMercenaries:['V-972','V-999','V-058'].map(code=>geared('PVP',8,21,10,code)),defenderMercenaries:['V-979','V-996','V-058'].map(code=>rankedSnapshot(code,5)),seed:17});
 assert(series.rounds.length>=2);assert.equal(Math.max(series.score.A,series.score.B),2);
 for(const round of series.rounds){const m=round.battleV2.teams.A.mercenaries[0];assert(m.mercenaryLevelApplied);assert.equal(m.equipmentEffects.speedPercent,10);assert(round.battleV2.result.timeline.length>0);}
});

test('no-gear and 2/4-piece integer inputs preserve the prior arithmetic',()=>{
 for(const mode of ['PVE','PVP'])for(const count of [0,2,4])for(const code of ['V-972','V-058']){
  const s=geared(mode,8,21,0,code,count),a=build(s,mode),g=mercenaryGrowthSummary(s.mercenaryLevel.growth,s.mercenaryLevel);
  const before={hp:a.maxHp,attack:a.attack,defense:a.defense,speed:a.speed};assert(Object.values(before).every(Number.isSafeInteger));
  const expected=Object.fromEntries(Object.entries(before).map(([key,n])=>[key,Math.floor(n*(1+g.total[key+'Percent']/100))]));
  applyMercenaryLevelStats(a);assert.deepEqual({hp:a.maxHp,attack:a.attack,defense:a.defense,speed:a.speed},expected);
 }
});
