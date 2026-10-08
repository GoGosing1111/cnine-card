import test from 'node:test';
import assert from 'node:assert/strict';
import * as current from '../functions/_battle_v2_preview.js';
import {comparisonArgs,comparisonCards,baselineModule,mercenaryCodes} from '../scripts/measure-apocalypse-grade-balance-20261008.mjs';
const before=await baselineModule();

test('Alucard: upgrading the same lower/nurse deck to ICON and SSS no longer accelerates its defeat',()=>{
 const low=comparisonArgs({equipment:3000000,suit:7000000,seed:7919});
 assert.equal(before.createPveBattleV2(low).result.winner,'A');
 for(const icons of [[1],[2],[6]])for(const mercenary of ['V-046','V-049']){
  const args=comparisonArgs({icons,mercenary,equipment:3000000,suit:7000000,seed:7919});
  const old=before.createPveBattleV2(args),fixed=current.createPveBattleV2(args);
  assert.equal(old.result.winner,'B','the production regression is reproducible');
  assert.equal(fixed.result.winner,'A');assert.ok(fixed.result.final.B.every(c=>c.hp===0));
  assert.ok(fixed.result.damageBreakdown.battleSuit>old.result.damageBreakdown.battleSuit,'the independent suit receives time to act');
  assert.deepEqual(current.createPveBattleV2(args),fixed,'same input reproduces the same canonical battle');
 }
});

function cadenceArgs({speed=100000,bossSpeed=1,forced=4,apocalypse=true}={}){
 const teamA=Array.from({length:5},(_,i)=>({...current.buildFighter({id:'clock-'+i,power:100000},i,'A',null,'PVE'),hp:1e12,maxHp:1e12,attack:1,speed}));
 const boss={...current.buildMonsterFighter({id:75,battle_power:1000000,is_boss:1,pve_difficulty:apocalypse?'APOCALYPSE':'NORMAL',pve_attack_count:2}),hp:1e12,maxHp:1e12,shield:0,maxShield:0,attack:1,speed:bossSpeed,statCapsUnlocked:true};
 return {teamA,teamB:[boss],forcedMonsterEvery:forced,maxActions:160,seed:123};
}
test('fast cards do not fund faster forced Apocalypse turns; multi-hit casts and actor turns remain bounded',()=>{
 for(const forced of [2,4,6]){
  const args=cadenceArgs({forced}),old=before.simulateBattleV2Preview(args),fixed=current.simulateBattleV2Preview(args);
  const starts=r=>r.timeline.filter(e=>e.type==='MONSTER_MULTI_ATTACK_READY');
  const rows=starts(fixed);assert.ok(rows.length>=2);assert.ok(rows.length<starts(old).length);
  for(let i=1;i<rows.length;i++)assert.ok(rows[i].at-rows[i-1].at>=forced*.001-.001001,'rounded timestamps retain the minimum burst interval');
  const turns=fixed.timeline.filter(e=>e.type==='TURN');
  for(const a of args.teamA)assert.ok(turns.some(e=>e.actorId===a.id),'no card starvation');
  assert.equal(turns.filter(e=>e.actorId.startsWith('B:')).length,rows.length*2,'configured two-hit bursts retained');
  assert.equal(fixed.actions,160);
 }
});

test('natural monster turns are not rate limited and normal hunts retain their exact schedules',()=>{
 const natural=cadenceArgs({speed:100,bossSpeed:1000000});
 assert.deepEqual(current.simulateBattleV2Preview(natural),before.simulateBattleV2Preview(natural));
 for(const speed of [300,100000,500000]){
  const normal=cadenceArgs({speed,apocalypse:false});
  assert.deepEqual(current.simulateBattleV2Preview(normal),before.simulateBattleV2Preview(normal));
 }
});

test('PVP, ordinary PVE and SS limited / Valter policies keep their production results',()=>{
 for(const mercenary of [...mercenaryCodes,'V-992','V-996'])for(const seed of [7919,23757]){
  const args=comparisonArgs({icons:[1,3],mercenary,equipment:3000000,suit:7000000,seed});
  // V-992 is intentionally unreleased: the prior SS-limited preparation policy
  // owns its fighter, but this Apocalypse scheduling fix must not rebalance PVP.
  if(['V-992','V-996'].includes(mercenary))args.mercenary={...comparisonArgs().mercenary,code:mercenary,rank:mercenary==='V-996'?'SSS':'SS',skills:[]};
  const normal={...args,monster:{...args.monster,pve_difficulty:'NORMAL'}};
  assert.deepEqual(current.createPveBattleV2(normal),before.createPveBattleV2(normal));
  const pvp={attackerCards:args.cards,defenderCards:comparisonCards(),attackerMercenary:args.mercenary,defenderMercenary:comparisonArgs().mercenary,attackerEquipmentBonus:3000000,defenderEquipmentBonus:3000000,seed};
  assert.deepEqual(current.createPvpBattleV2(pvp),before.createPvpBattleV2(pvp));
 }
});

test('the four nurses retain the same heal cap, budget and actual healing at equal rank',()=>{
 const snapshots=['V-051','V-052','V-053','V-054'].map(mercenary=>current.createPveBattleV2(comparisonArgs({mercenary,icons:[1],equipment:3000000,suit:7000000,seed:7919})));
 const metrics=snapshots.map(b=>{
  const heals=b.result.timeline.filter(e=>e.type==='MERCENARY_GROUP_HEAL');assert.ok(heals.length);
  for(const e of heals){assert.ok(e.amount<=e.budget);for(const h of e.heals)assert.ok(h.amount<=Math.floor(h.targetMaxHp*.15));}
  return {winner:b.result.winner,amount:heals.reduce((n,e)=>n+e.amount,0),casts:heals.length};
 });
 for(const value of metrics)assert.deepEqual(value,metrics[0]);
});
