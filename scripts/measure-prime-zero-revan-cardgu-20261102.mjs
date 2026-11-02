import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {scenarios,roster} from './measure-razak-balance-20261026.mjs';
import input from '../docs/qa/prime-zero-revan-cardgu-20261102/live-input.json' with {type:'json'};
export {scenarios};
export const snapshot=(code,level=1,mode='PVP',gear=0)=>{const base=limitedDeploymentSnapshot(code)||roster.find(r=>r.code===code);if(!base)throw Error('UNKNOWN_MERCENARY '+code);return {...structuredClone(base),combat:input.combat,equipment:{schemaVersion:1,mode,power:gear},mercenaryLevel:{version:2,level,policyRevision:input.policyRevision,breakthroughMask:[5,10,15,20].reduce((m,t,i)=>m|(t<level?1<<i:0),0),growth:input.growth}};};
const tally=()=>({wins:0,losses:0,draws:0,total:0});
const add=(r,w,s)=>{r.total++;r[w===s?'wins':['A','B'].includes(w)?'losses':'draws']++;};
const finish=r=>{const p=r.wins/r.total,n=r.total,z=1.96,d=1+z*z/n,c=(p+z*z/(2*n))/d,m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return {...r,winRate:p,wilson95:[c-m,c+m]};};
export function measure({count=16,start=1,companions=['single'],codes=['V-975','V-976'],opponents=['V-971','V-970'],caseIds=null,onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1||!companions.length||!codes.length||!opponents.length)throw Error('INVALID_MEASUREMENT_SCOPE');
 const rows=[],began=Date.now();
 for(const code of codes)for(const opponent of opponents)for(const companion of companions){
  const row={code,opponent,companion,...tally(),sides:{A:tally(),B:tally()},scenarios:[]};
  for(const f of scenarios.filter(f=>!caseIds||caseIds.includes(f.id))){
   const r={id:f.id,level:f.level,gear:f.gear,...tally()};
   const own=[snapshot(code,f.level,'PVP',f.gear)],other=[snapshot(opponent,f.level,'PVP',f.gear)];
   if(companion!=='single'){own.push(snapshot(companion,f.level,'PVP',f.gear));other.push(snapshot(companion,f.level,'PVP',f.gear));}
   for(let i=start;i<start+count;i++)for(const side of ['A','B']){
    const seed=createHash('sha256').update(`prime-zero-blackcrown:${companion}:${f.id}:${i}`).digest().readUInt32BE(0);
    const b=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenaries:side==='A'?own:other,defenderMercenaries:side==='B'?own:other,seed});
    for(const t of [r,row,row.sides[side]])add(t,b.result.winner,side);
   }
   row.scenarios.push(finish(r));
  }
  const result={...finish(row),sides:Object.fromEntries(Object.entries(row.sides).map(([k,v])=>[k,finish(v)]))};rows.push(result);
  onProgress({code,opponent,companion,total:row.total,winRate:result.winRate,elapsedMs:Date.now()-began});
 }
 return {scope:'CANONICAL_SERVER_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',minimumWinRate:.60,upperCap:null,userDirection:'Preserve higher win rates; buff Prime and Zero to the strongest tier.',count,start,seedMethod:'SHA256(prime-zero-blackcrown:companion:scenario:index); same seeds for both sides and all four matchups',conditions:'Identical five-card deck, magic, mercenary level, breakthrough and equipment; identical SS companion where present; no pets. Draws are not wins. Calibration and holdout use disjoint index ranges.',input,rows,total:rows.reduce((n,r)=>n+r.total,0),elapsedMs:Date.now()-began};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
 const result=measure({count:Number(arg('--count',16)),start:Number(arg('--start',1)),companions:arg('--companions','single').split(','),codes:arg('--codes','V-975,V-976').split(','),opponents:arg('--opponents','V-971,V-970').split(','),caseIds:arg('--cases',null)?.split(','),onProgress:r=>console.log(JSON.stringify(r))});
 const out=arg('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({total:result.total,elapsedMs:result.elapsedMs}));
}
