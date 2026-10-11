import fs from 'node:fs';
import path from 'node:path';
import fixture from '../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {jinmuDeploymentSnapshot} from '../shared/mercenary-jinmu-v1.mjs';
import {JINMU_COMBAT} from '../shared/mercenary-jinmu-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards,tierDecks} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

const h={...jinmuDeploymentSnapshot(),combat:fixture.combat};
const roster=[...fixture.roster,...LIMITED_MERCENARIES.map(c=>limitedDeploymentSnapshot(c.code)).filter(Boolean)].map(c=>({...c,combat:fixture.combat}));
const cases=[],started=Date.now();
for(const opponent of roster){
 const rows=[];
 for(const power of [1e5,2e7,1e9])for(const [deck,types]of Object.entries(tierDecks)){
  const count=opponent.code==='V-999'?32:4,cards=tierCards(power,types),row={power,deck,wins:0,losses:0,draws:0,total:0,bySide:{A:{wins:0,total:0},B:{wins:0,total:0}}};
  for(const side of ['A','B'])for(let i=0;i<count;i++){
   const result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?h:opponent,defenderMercenary:side==='B'?h:opponent,seed:(510001+i)*7919}).result;
   row.total++;row.bySide[side].total++;
   if(result.winner===side){row.wins++;row.bySide[side].wins++;}else if(['A','B'].includes(result.winner))row.losses++;else row.draws++;
  }
  rows.push({...row,winRate:row.wins/row.total});
 }
 const sum=rows.reduce((a,r)=>({wins:a.wins+r.wins,losses:a.losses+r.losses,draws:a.draws+r.draws,total:a.total+r.total}),{wins:0,losses:0,draws:0,total:0});
 cases.push({code:opponent.code,name:opponent.name,rank:opponent.rank,...sum,winRate:sum.wins/sum.total,cases:rows});
 if(opponent.code==='V-999'||cases.length%10===0)console.log(JSON.stringify({completed:cases.length,opponents:roster.length,latest:opponent.code,winRate:sum.wins/sum.total,elapsedSeconds:(Date.now()-started)/1000}));
}
const pve=[];
for(const snapshot of [h,{...limitedDeploymentSnapshot('V-999'),combat:fixture.combat}]){
 const rows=[];
 for(const [deck,types]of Object.entries(tierDecks))for(const monsterPower of [4e9,8e9,1.6e10]){
  const row={deck,monsterPower,wins:0,total:8,damage:0,actions:0};
  for(let i=0;i<8;i++){
   const result=createPveBattleV2({cards:tierCards(2e7,types),mercenary:snapshot,monster:{id:1,battle_power:monsterPower},seed:(520001+i)*7919}).result;
   row.wins+=Number(result.winner==='A');row.damage+=result.damageBreakdown.mercenary||0;row.actions+=result.mercenaryActions||0;
  }
  rows.push({...row,averageDamage:row.damage/row.total,averageActions:row.actions/row.total});
 }
 pve.push({code:snapshot.code,cases:rows});
}
const report={date:'2026-10-12',scope:'CANONICAL_SERVER_EQUAL_DECK_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',cmsRevision:fixture.cmsRevision,policy:JINMU_COMBAT,
 publicAcquisitionChanged:false,exclusiveOwnerGrant:true,formationChanged:true,sourceArtPixelsChanged:false,opponents:roster.length,total:cases.reduce((n,r)=>n+r.total,0),rows:cases,pve,elapsedSeconds:(Date.now()-started)/1000};
const out='docs/qa/jinmu-supremacy-20261012/comparison.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,total:report.total,seconds:report.elapsedSeconds,helios:cases.find(c=>c.code==='V-999'),belowHalf:cases.filter(c=>c.winRate<.5).map(c=>({code:c.code,rate:c.winRate}))}));
