import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {HALLOWEEN_COMBAT} from '../shared/mercenary-halloween-combat-v1.mjs';
import {SS_LIMITED_COMBAT} from '../shared/mercenary-ss-limited-v1.mjs';
import {ssLimitedFormations} from './measure-ss-limited-balance-20261008.mjs';

export function measureHalloween({count=16,start=36101,onProgress=()=>{}}={}){
 const formations=[ssLimitedFormations[0],ssLimitedFormations.find(f=>f.id.startsWith('basic-20000000-')),ssLimitedFormations.find(f=>f.id.startsWith('basic-2000000000-')),ssLimitedFormations.find(f=>f.group==='EQUIPPED'),ssLimitedFormations.at(-1)];
 const rows=[];
 for(const code of Object.keys(HALLOWEEN_COMBAT)){
  const opponents=[];
  for(const other of [...Object.keys(SS_LIMITED_COMBAT),'V-996','V-999','V-989']){
   let wins=0,draws=0,total=0;const sides={A:{wins:0,total:0},B:{wins:0,total:0}};
   for(const f of formations)for(const side of ['A','B'])for(let i=0;i<count;i++){
    const current=limitedDeploymentSnapshot(code),opponent=limitedDeploymentSnapshot(other);
    const winner=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,
     attackerMercenary:side==='A'?current:opponent,defenderMercenary:side==='B'?current:opponent,seed:(start+i)*7919}).result.winner;
    total++;sides[side].total++;if(winner===side){wins++;sides[side].wins++;}else if(!['A','B'].includes(winner))draws++;
   }
   opponents.push({code:other,wins,draws,total,winRate:wins/total,sides});
  }
  const old=opponents.filter(o=>Object.hasOwn(SS_LIMITED_COMBAT,o.code)),wins=old.reduce((n,o)=>n+o.wins,0),total=old.reduce((n,o)=>n+o.total,0);
  const row={code,wins,total,winRate:wins/total,opponents};rows.push(row);onProgress({code,wins,total,winRate:row.winRate,opponents:opponents.map(o=>({code:o.code,winRate:o.winRate}))});
 }
 return {date:'2026-10-17',scope:'CANONICAL_SIMULATION_NOT_LIVE_WIN_RATE',count,start,formations:formations.map(f=>f.id),policySha256:createHash('sha256').update(JSON.stringify(HALLOWEEN_COMBAT)).digest('hex'),existingPolicySha256:createHash('sha256').update(JSON.stringify(SS_LIMITED_COMBAT)).digest('hex'),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=measureHalloween({onProgress:r=>console.log(JSON.stringify(r))});
 fs.writeFileSync('docs/halloween-limited-balance-20261017.json',JSON.stringify(report,null,2)+'\n');
}
