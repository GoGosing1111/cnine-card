import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildTowerV3Battle,TOWER_V3_DRAFT} from '../functions/_tower_v3.js';
import {towerAbyssPower,TOWER_ABYSS_BALANCE_VERSION} from './ops/tower-abyss-policy-20261022.mjs';
// Input is a private read-only capture of saved player loadouts. Output contains
// only aggregate metrics and no account IDs, names or full player snapshots.
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Private capture and aggregate output paths required');
const source=fs.readFileSync(input),population=JSON.parse(source),rows=[];
const groups={entry:population.snapshots.filter(s=>s.highest<70),upper:population.snapshots.filter(s=>s.highest>=70&&s.highest<100),completed:population.snapshots.filter(s=>s.highest>=100)};
const samples=[30,50,60,70,80,90,100,105,110,115,120],seeds=[220301,220307,220313,220319,220327,220337,220351,220367];
for(const floor of samples)for(const [group,players]of Object.entries(groups))for(const growth of (floor>=100&&group==='completed'?['current','mercenary+2','equipment+25%']:['current'])){
 const results=[];
 for(const player of players)for(const seed of seeds){
  const snapshot=structuredClone(player.snapshot);
  if(growth==='mercenary+2'&&snapshot.mercenary?.mercenaryLevel){
   const level=Math.min(20,Number(snapshot.mercenary.level)+2),breakthroughMask=[5,10,15,20].reduce((n,m,i)=>n|((m<level||m===20&&level===20)?1<<i:0),0);
   snapshot.mercenary.level=level;snapshot.mercenary.mercenaryLevel={...snapshot.mercenary.mercenaryLevel,level,breakthroughMask};
  }
  if(growth==='equipment+25%')snapshot.cardSupportBonus=Math.round(snapshot.cardSupportBonus*1.25);
  const old=population.floors.find(r=>Number(r.start_floor)===Math.min(floor,100));
  const boss=floor%10===0,monsterId=Number(floor>100?(boss?69:68):old.monster_id),ultimate=boss?Number(old.ultimate_tower_damage_percent||0):0;
  const start=performance.now();
  const b=buildTowerV3Battle({snapshot,tier:floor,seed,config:{...TOWER_V3_DRAFT,maxTier:120,powerGrowth:1.001,rulesVersion:TOWER_ABYSS_BALANCE_VERSION},operatingFloor:{id:monsterId,name:'수호자',image:'',power:towerAbyssPower(floor)},bossUltimatePercent:ultimate});
  results.push({win:Number(b.success),elapsed:b.elapsedCombatMs,hp:b.guardianHpPercent,ms:performance.now()-start,bytes:Buffer.byteLength(JSON.stringify(b))});
 }
 const avg=key=>Math.round(results.reduce((n,r)=>n+r[key],0)/Math.max(1,results.length)*100)/100;
 const wins=results.reduce((n,r)=>n+r.win,0),row={floor,power:towerAbyssPower(floor),group,growth,players:players.length,trials:results.length,wins,winPercent:Math.round(wins/Math.max(1,results.length)*10000)/100,meanCombatMs:avg('elapsed'),meanGuardianHpPercent:avg('hp'),meanComputeMs:avg('ms'),maxPayloadBytes:Math.max(...results.map(r=>r.bytes))};rows.push(row);
}
const report={capturedAt:population.capturedAt,measuredAt:new Date().toISOString(),candidateCount:population.candidateCount,sampleCount:population.snapshots.length,groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),seeds,inputSha256:createHash('sha256').update(source).digest('hex'),method:'Current saved PvE loadouts of active ordinary accounts; 32 evenly spaced across tower progress plus every active 100-floor completer / mercenary level 10+ owner, de-duplicated. Extra levels/equipment are controlled hypothetical changes. This is a simulation, not live clear rates.',rows};
fs.mkdirSync(new URL('../docs/qa/tower-abyss-growth-20261022/',import.meta.url),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({samples:report.sampleCount,total:rows.reduce((n,r)=>n+r.trials,0),upper:rows.filter(r=>r.group!=='entry'&&[70,80,100,110,120].includes(r.floor))}));
