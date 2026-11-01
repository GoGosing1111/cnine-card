import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PAIRS,fixture,plan,reviewBattle} from '../tests/helpers/tower-expansion-20261102.mjs';
import {towerExpansionHash} from './ops/tower-121-150-policy-20261102.mjs';
const output=path.resolve(process.argv[2]||'docs/qa/tower-121-150-20261102');
const summary=[],coverage=[];let battles=0;
for(const codes of PAIRS)for(const power of [250000,1000000])for(const level of [16,21])for(const count of [1,2]){
 const floors=[];
 for(const floor of [120,121,130,140,150]){
  let wins=0,time=0,remaining=0,defeated=0;
  for(let seed=1;seed<=8;seed++){
   const b=reviewBattle({codes,power,level,count,floor,seed});battles++;
   const ms=b.battleV2.teams.A.mercenaries;assert.equal(ms.length,count);assert(ms.every(m=>m.level===level&&m.mercenaryLevelApplied));
   wins+=Number(b.success);time+=b.elapsedCombatMs;remaining+=b.guardianHpPercent;defeated+=b.defeated;
  }
  floors.push({floor,battles:8,wins,averageCombatMs:Math.round(time/8),averageGuardianHpPercent:remaining/8,averageDefeated:defeated/8});
 }
 summary.push({codes,names:codes.map(code=>fixture.snapshots.find(s=>s.code===code).name),cardPower:power,level,count,floors});
}
for(const codes of PAIRS)for(const power of [250000,1000000])for(const floor of plan.floors){
 const b=reviewBattle({codes,power,floor:floor.floor,seed:1502026});battles++;
 assert.equal(b.continuousEncounter.total,28);assert.equal(new Set(b.continuousEncounter.instances.map(m=>m.id)).size,28);
 assert(b.continuousEncounter.instances.every(m=>m.battleSprite&&Number.isFinite(m.maxHp)));
 assert.equal(b.unlockStep,b.success?1:0);
 const final=b.battleV2.result.timeline.at(-1);assert.equal(final.winner,b.success?'A':'B');
 coverage.push({codes,cardPower:power,floor:floor.floor,success:b.success,combatMs:b.elapsedCombatMs});
}
const result={status:'LOCAL_SIMULATION_COMPLETE_NOT_LIVE_PLAYER_WIN_RATE',battles,baselineAt:fixture.checkedAt,planHash:towerExpansionHash(plan),
 assumptions:{cards:5,cardPowers:[250000,1000000],equipment:0,pet:null,magicCards:0,mercenaryEquipment:0,levels:[16,21],counts:[1,2],randomSeeds:8},
 limitation:'Fixed controlled decks; skill composition and equipment remain decisive. Level 21 is not a universal clear guarantee.',summary,coverage};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'balance.json'),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(path.join(output,'floor-plan.json'),JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({battles,newFloors:coverage.length,planHash:result.planHash,level21Pairs:summary.filter(s=>s.level===21&&s.count===2).map(s=>({names:s.names,power:s.cardPower,wins:s.floors.map(r=>[r.floor,r.wins])})),output}));
