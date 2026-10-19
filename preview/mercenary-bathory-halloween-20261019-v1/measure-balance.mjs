import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPvpBattleV2,createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {balanceFormations,balanceSnapshot,halloweenCodes} from '../../scripts/measure-ss-mercenary-balance-20261019.mjs';
import {BATHORY_CODE,BATHORY_COMBAT} from '../../shared/mercenary-bathory-v1.mjs';
const report={scope:'CANONICAL_SIMULATION_NOT_PLAYER_WIN_RATE',profile:BATHORY_COMBAT,seedsPerSide:8,formations:balanceFormations.map(f=>({id:f.id,level:f.level})),pvp:[],pve:[]};
for(const opponent of halloweenCodes){
 const row={opponent,total:0,wins:0,draws:0,formations:[]};
 for(const f of balanceFormations){
  const tally={id:f.id,total:0,wins:0,draws:0};
  for(let index=0;index<8;index++)for(const side of ['A','B']){
   const seed=createHash('sha256').update('Bathory:'+opponent+':'+f.id+':'+index).digest().readUInt32BE();
   const a=balanceSnapshot(BATHORY_CODE,f.level),b=balanceSnapshot(opponent,f.level);
   const result=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='B'?a:b,seed});
   for(const r of [row,tally]){r.total++;r.wins+=Number(result.result.winner===side);r.draws+=Number(!['A','B'].includes(result.result.winner));}
  }
  row.formations.push(tally);
 }
 row.winRate=row.wins/row.total;report.pvp.push(row);console.log(JSON.stringify({opponent,total:row.total,winRate:row.winRate}));
}
for(const code of [BATHORY_CODE,...halloweenCodes]){
 const rows=[];
 for(const f of [balanceFormations[1],balanceFormations[7]]){
  const row={id:f.id,total:0,clears:0,turns:0,damage:0};
  for(let i=0;i<4;i++){
   const b=createPveBattleV2({cards:f.cards,magicCards:f.magic,mercenary:balanceSnapshot(code,f.level),monster:{id:1,name:'검증',battle_power:f.level===1?5e9:5e10},seed:9771901+i*7919});
   row.total++;row.clears+=Number(b.result.winner==='A');row.turns+=b.result.timeline.filter(e=>e.type==='TURN').length;
   row.damage+=b.result.timeline.filter(e=>(e.sourceAttackerId||e.actorId)==='A:MERCENARY:'+code).reduce((n,e)=>n+(e.damage||0)+(e.absorbed||0),0);
  }
  row.averageTurns=row.turns/row.total;rows.push(row);
 }
 report.pve.push({code,rows});
}
report.totalPvp=report.pvp.reduce((n,r)=>n+r.total,0);report.totalPve=64;report.strongestHalloweenInMeasuredPvp=report.pvp.every(r=>r.winRate>.5);
await fs.writeFile(new URL('qa/balance-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totalPvp:report.totalPvp,totalPve:64,passes:report.strongestHalloweenInMeasuredPvp,pve:report.pve}));
if(!report.strongestHalloweenInMeasuredPvp)process.exitCode=1;
