import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {BLACKCROWN_COMBAT} from '../shared/mercenary-blackcrown-combat-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {balanceFormations, balanceSnapshot} from './measure-ss-mercenary-balance-20261019.mjs';

export const blackcrownBalanceFormations = [
 ...balanceFormations,
 {...balanceFormations[1],id:'mercenary-equipment-level11',level:11,mercenaryEquipmentPower:1e7},
 {...balanceFormations[1],id:'mercenary-equipment-level21',level:21,mercenaryEquipmentPower:1e8},
];
const tally=()=>({wins:0,losses:0,draws:0,total:0});
const add=(r,winner,side)=>{r.total++;r[winner===side?'wins':['A','B'].includes(winner)?'losses':'draws']++;};
const finish=r=>{
 const p=r.wins/r.total,z=1.96,n=r.total,d=1+z*z/n,c=(p+z*z/(2*n))/d,m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 return {...r,winRate:p,wilson95:[c-m,c+m]};
};
export function measureBlackcrownBalance({count=16,start=31001,codes=Object.keys(BLACKCROWN_COMBAT),onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1||codes.some(code=>!BLACKCROWN_COMBAT[code]))throw Error('Invalid simulation scope');
 const started=Date.now(),summaries=[];
 for(const code of codes){
  const row={code,name:balanceSnapshot(code).name,...tally(),sides:{A:tally(),B:tally()},opponents:{},formations:{}};
  for(let o=960;o<=965;o++){
   const other='V-'+o,opponent=row.opponents[other]=tally();
   for(const f of blackcrownBalanceFormations){
    const formation=row.formations[f.id]??=tally();
    const snapshot=c=>({...balanceSnapshot(c,f.level),...(f.mercenaryEquipmentPower?{equipment:{schemaVersion:1,mode:'PVP',power:f.mercenaryEquipmentPower}}:{})});
    const a=snapshot(code),b=snapshot(other);
    for(let i=start;i<start+count;i++){
     // Shared scenario seeds permit paired before/after comparisons. The final
     // validation range is disjoint from calibration; both sides use each seed.
     const seed=createHash('sha256').update(`blackcrown-60:${other}:${f.id}:${i}`).digest().readUInt32BE(0);
     for(const side of ['A','B']){
      const winner=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,
       attackerMercenary:side==='A'?a:b,defenderMercenary:side==='A'?b:a,seed}).result.winner;
      for(const r of [row,row.sides[side],opponent,formation])add(r,winner,side);
     }
    }
   }
  }
  const result={...finish(row),sides:Object.fromEntries(Object.entries(row.sides).map(([k,v])=>[k,finish(v)])),opponents:Object.fromEntries(Object.entries(row.opponents).map(([k,v])=>[k,finish(v)])),formations:Object.fromEntries(Object.entries(row.formations).map(([k,v])=>[k,finish(v)]))};
  summaries.push(result);onProgress({code,name:row.name,winRate:result.winRate,total:row.total,draws:row.draws,elapsedMs:Date.now()-started});
 }
 return {scope:'CANONICAL_SERVER_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',targetWinRate:.60,acceptanceBand:[.58,.62],count,start,
  conditions:'Identical five-card teams, magic, card equipment, mercenary level and mercenary equipment. Six Bloodmoon opponents and eleven equally weighted conditions; mirrored A/B seeds. Draws are not wins.',
  formations:blackcrownBalanceFormations.map(({id,level,mercenaryEquipmentPower=0})=>({id,level,mercenaryEquipmentPower})),
  profiles:BLACKCROWN_COMBAT,profileSha256:createHash('sha256').update(JSON.stringify(BLACKCROWN_COMBAT)).digest('hex'),
  summaries,total:summaries.reduce((n,r)=>n+r.total,0),elapsedMs:Date.now()-started};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=(key,defaultValue)=>{const i=args.indexOf(key);return i<0?defaultValue:args[i+1];};
 const result=measureBlackcrownBalance({count:Number(arg('--count',16)),start:Number(arg('--start',31001)),codes:arg('--codes',Object.keys(BLACKCROWN_COMBAT).join(',')).split(','),onProgress:r=>console.log(JSON.stringify(r))});
 const out=arg('--out',null);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify({total:result.total,elapsedMs:result.elapsedMs}));
}
