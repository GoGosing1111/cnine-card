import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {snapshot,scenarios} from './measure-prime-zero-revan-cardgu-20261102.mjs';

export function compareZeroPrime(){
 const rows=[];
 for(const level of [1,11,21])for(const gear of [0,100000000])for(const count of [1,5,12])for(const seed of [7919,8111,8191,8293]){
  const runs={};
  for(const variant of ['zeroBefore','zero','prime']){
   const code=variant==='prime'?'V-975':'V-976';
   const a=buildMercenaryFighter(snapshot(code,level,'PVE',gear),'A','PVE',buildFighter);
   if(variant==='zeroBefore')a.skills=a.skills.slice(0,2).map(s=>({...s,balance:{...s.balance,cost:35,cooldownTurns:5}}));
   const teamA=[...scenarios[1].cards.map((c,i)=>buildFighter(c,i,'A',null,'PVE')),a];
   const teamB=Array.from({length:count},(_,i)=>({...buildFighter({id:'target-'+i,power:1e7},i,'B',null,'PVE'),attack:1,hp:1e14,maxHp:1e14,shield:0,maxShield:0,isBoss:count===1}));
   const b=simulateBattleV2Preview({teamA,teamB,seed,maxActions:180});
   const attacks=b.timeline.filter(e=>e.actorId===a.id&&(e.type==='TURN'||e.type.endsWith('_AREA')));
   const area=attacks.filter(e=>e.type.endsWith('_AREA'));
   runs[variant]={damage:attacks.reduce((n,e)=>n+(e.damage||0)+(e.absorbed||0),0),areaDamage:area.reduce((n,e)=>n+(e.damage||0)+(e.absorbed||0),0),casts:area.length,actions:attacks.length,skillIds:[...new Set(area.map(e=>e.skillId))]};
  }
  rows.push({level,gear,count,seed,...runs});
 }
 const sum=key=>rows.reduce((n,r)=>n+r[key].damage,0);
 return{scope:'Identical server simulations, not live player win rates',conditions:{levels:[1,11,21],equipmentPower:[0,100000000],targets:[1,5,12],seeds:[7919,8111,8191,8293],maxActions:180,cards:'Identical five-card deck, no pets; targets survive to measure sustained output'},scenarios:rows.length,simulations:rows.length*3,zeroBeforeToPrime:sum('zeroBefore')/sum('prime'),zeroToPrime:sum('zero')/sum('prime'),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const data=compareZeroPrime();if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({...data,rows:undefined}));}
