import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {balanceFormations,balanceSnapshot,balanceFingerprint,halloweenCodes} from './measure-ss-mercenary-balance-20261019.mjs';

const fixtureUrl=new URL('../docs/qa/halloween-bongsoon-ranked-20261019/representative-fixtures.json',import.meta.url);
const tally=()=>({total:0,wins:0,draws:0,casts:0,zeroCast:0,skillDamage:0});
const finish=r=>({...r,losses:r.total-r.wins-r.draws,winRate:r.wins/r.total,castsPerBattle:r.casts/r.total,zeroCastRate:r.zeroCast/r.total});

// Audit-derived role layouts are representative matched inputs, not historical
// replays: final HP/buffs, account identities, pets and magic are not copied.
export function measureBongsoonRanked({count=24,start=191001,onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1)throw Error('Invalid seeds');
 const {fixtures}=JSON.parse(fs.readFileSync(fixtureUrl,'utf8'));
 const scenarios=[...balanceFormations,...fixtures.flatMap(f=>[1,3,5].map(level=>({...f,id:`${f.id}-level${level}`,level})))];
 const rows=[];
 for(const code of [...halloweenCodes.filter(c=>c!=='V-980'),'V-057']){
  const total=tally(),formations=[];
  for(const f of scenarios){const row=tally(),am=balanceSnapshot('V-980',f.level),bm=balanceSnapshot(code,f.level);
   for(let index=start;index<start+count;index++)for(const side of ['A','B']){
    const seed=createHash('sha256').update(`bongsoon-ranked:${code}:${f.id}:${index}`).digest().readUInt32BE(0);
    const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,
     attackerEquipmentBonus:f.equipment||0,defenderEquipmentBonus:f.equipment||0,
     attackerMercenary:side==='A'?am:bm,defenderMercenary:side==='B'?am:bm,seed});
    const events=battle.result.timeline.filter(e=>e.actorId===`${side}:MERCENARY:V-980`);
    const casts=events.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation).length;
    const skillDamage=events.filter(e=>e.type==='MERCENARY_HIT').reduce((n,e)=>n+(e.damage||0)+(e.absorbed||0),0);
    const v={total:1,wins:Number(battle.result.winner===side),draws:Number(!['A','B'].includes(battle.result.winner)),casts,zeroCast:Number(casts===0),skillDamage};
    for(const r of [row,total])for(const [k,n]of Object.entries(v))r[k]+=n;
   }
   formations.push({id:f.id,group:f.group,level:f.level,...finish(row)});
  }
  rows.push({opponent:code,...finish(total),formations});onProgress({opponent:code,...finish(total)});
 }
 return {policyFingerprint:balanceFingerprint(),count,start,total:rows.reduce((n,r)=>n+r.total,0),
  conditions:'V-980 compared to six Halloween peers and Kangyun. Same cards, magic, equipment and mercenary level, mirrored A/B. Nine existing baseline scenarios plus four ranked role layouts at levels 1/3/5. Representative layouts omit magic/pets/avatar/mercenary equipment and are not historical replay.',rows};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const report=measureBongsoonRanked({count:Number(value('--count',24)),start:Number(value('--start',191001)),onProgress:r=>console.log(JSON.stringify(r))});
 const out=value('--out',null);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({total:report.total,policyFingerprint:report.policyFingerprint}));
}
