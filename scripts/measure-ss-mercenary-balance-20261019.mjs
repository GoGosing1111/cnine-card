import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {HALLOWEEN_COMBAT,HALLOWEEN_DIIM_PVP_BARRIER} from '../shared/mercenary-halloween-combat-v1.mjs';
import {SS_LIMITED_COMBAT} from '../shared/mercenary-ss-limited-v1.mjs';
import {IMPERIAL_ARCHER_COMBAT,IMPERIAL_ARCHER_SKILLS,imperialArcherCandidate} from '../shared/mercenary-kangyun-v1.mjs';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_GROWTH_LAUNCH_PROFILE as growth} from '../shared/mercenary-growth-launch-20261016.mjs';
import {ssLimitedFormations} from './measure-ss-limited-balance-20261008.mjs';
import {tierCards} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

export const halloweenCodes=Object.keys(HALLOWEEN_COMBAT);
export const ssCodes=[...halloweenCodes,...Object.keys(SS_LIMITED_COMBAT)];
export const balanceFormations=[
 ...['basic-10000-balanced','basic-20000000-balanced','basic-2000000000-balanced','basic-20000000-attack','basic-20000000-defense','basic-20000000-speed'].map(id=>({...ssLimitedFormations.find(f=>f.id===id),level:1})),
 {...ssLimitedFormations.find(f=>f.group==='EQUIPPED'),level:5},
 {...ssLimitedFormations.at(-1),level:10},
 {id:'level20-balanced-250000',group:'GROWTH',cards:tierCards(250000),magic:[],level:20}
];
export const balanceFingerprint=()=>createHash('sha256').update(JSON.stringify({HALLOWEEN_COMBAT,HALLOWEEN_DIIM_PVP_BARRIER,IMPERIAL_ARCHER_COMBAT,IMPERIAL_ARCHER_SKILLS})).digest('hex');
export function balanceSnapshot(code,level=1){
 const base=code==='V-057'?imperialArcherCandidate(combat):{...limitedDeploymentSnapshot(code),combat};
 const breakthroughMask=[5,10,15,20].reduce((mask,l,i)=>mask|(l<level||l===20&&level===20?1<<i:0),0);
 return {...base,mercenaryLevel:{version:2,level,policyRevision:1,breakthroughMask,growth}};
}
const tally=()=>({wins:0,draws:0,total:0});
const add=(r,winner,side)=>{r.total++;r.wins+=Number(winner===side);r.draws+=Number(!['A','B'].includes(winner));};
const finish=r=>{const n=r.total,p=r.wins/n,z=1.96,d=1+z*z/n,c=(p+z*z/(2*n))/d,m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return {...r,losses:n-r.wins-r.draws,winRate:p,wilson95:[c-m,c+m]};};
export function measureBalance({count=12,start=19001,scope='all',onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1)throw Error('Invalid seeds');
 const pairs=[];
 if(scope!=='kangyun')for(const [i,a]of halloweenCodes.entries())for(const b of halloweenCodes.slice(i+1))pairs.push([a,b]);
 if(scope!=='halloween')for(const code of ssCodes)pairs.push(['V-057',code]);
 const summaries=Object.fromEntries(['V-057',...halloweenCodes].map(code=>[code,{code,name:balanceSnapshot(code).name,...tally(),sides:{A:tally(),B:tally()},opponents:{},formations:{}}]));
 const rows=[];
 for(const [a,b]of pairs){
  const match={a,b,...tally(),formations:[],samples:[]};
  for(const f of balanceFormations){const row={id:f.id,level:f.level,...tally()};
   const am=balanceSnapshot(a,f.level),bm=balanceSnapshot(b,f.level);
   for(let index=start;index<start+count;index++)for(const side of ['A','B']){
    const seed=createHash('sha256').update(`${a}:${b}:${f.id}:${f.level}:${index}`).digest().readUInt32BE(0);
    const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,
     attackerMercenary:side==='A'?am:bm,defenderMercenary:side==='B'?am:bm,seed});
    const winner=battle.result.winner;add(row,winner,side);add(match,winner,side);
    for(const [code,other,s]of [[a,b,side],[b,a,side==='A'?'B':'A']]){
     if(!summaries[code]||code!=='V-057'&&other==='V-057')continue;
     const r=summaries[code];add(r,winner,s);add(r.sides[s],winner,s);add(r.opponents[other]??=tally(),winner,s);add(r.formations[f.id]??=tally(),winner,s);
    }
    if(index===start&&side==='A'&&f===balanceFormations[1]){
     const events=battle.result.timeline;
     match.samples.push({seed,winner,events:events.length,skills:Object.fromEntries([a,b].map(code=>{const es=events.filter(e=>e.actorId?.endsWith(code)&&e.type?.startsWith('MERCENARY_'));return [code,{casts:es.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation).length,types:[...new Set(es.map(e=>e.type))],damage:es.reduce((n,e)=>n+(e.damage||0)+(e.absorbed||0)+(e.hits||[]).reduce((m,h)=>m+(h.damage||0)+(h.absorbed||0),0),0)}];}))});
    }
   }
   match.formations.push({...row,...finish(row)});
  }
  rows.push({...match,...finish(match)});onProgress({a,b,winRate:match.wins/match.total,draws:match.draws,total:match.total});
 }
 return {date:'2026-10-19',scope:'CANONICAL_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',seedMethod:'SHA256(unordered pair, formation, level, index), mirrored A/B',count,start,
  policyFingerprint:balanceFingerprint(),policies:{halloween:HALLOWEEN_COMBAT,diim:HALLOWEEN_DIIM_PVP_BARRIER,kangyun:IMPERIAL_ARCHER_COMBAT,kangyunSkills:IMPERIAL_ARCHER_SKILLS},
  conditions:'Identical cards, card equipment, magic and mercenary level on both sides. Nine equally weighted formation/growth scenarios; no account identity or opponent-specific tuning.',
  formations:balanceFormations.map(({id,group,level})=>({id,group,level})),total:rows.reduce((n,r)=>n+r.total,0),
  summaries:Object.values(summaries).filter(r=>r.total).map(r=>({...r,...finish(r),sides:Object.fromEntries(Object.entries(r.sides).map(([k,v])=>[k,finish(v)])),opponents:Object.fromEntries(Object.entries(r.opponents).map(([k,v])=>[k,finish(v)])),formations:Object.fromEntries(Object.entries(r.formations).map(([k,v])=>[k,finish(v)]))})),matches:rows};
}
export function measurePveBalance(){
 const cases=[{id:'entry',power:250000,boss:2e6,level:1},{id:'high',power:2e7,boss:5e9,level:1},{id:'grown',power:2e7,boss:5e10,level:10}],rows=[];
 for(const code of ['V-057',...ssCodes])for(const c of cases){
  const row={code,scenario:c.id,total:0,clears:0,damage:0,shieldGranted:0,casts:0,turns:0,skillTypes:new Set()};
  for(let i=0;i<8;i++){
   const b=createPveBattleV2({cards:tierCards(c.power),mercenary:balanceSnapshot(code,c.level),monster:{id:1,name:'QA',battle_power:c.boss},seed:1901901+i*7919});
   row.total++;row.clears+=Number(b.result.winner==='A');row.turns+=b.result.timeline.filter(e=>e.type==='TURN').length;
   for(const e of b.result.timeline.filter(e=>(e.sourceAttackerId||e.actorId)===`A:MERCENARY:${code}`)){
    row.damage+=Array.isArray(e.impacts||e.hits)?(e.impacts||e.hits).reduce((n,h)=>n+(h.damage||0)+(h.absorbed||0),0):(e.damage||0)+(e.absorbed||0);
    if(e.type==='MERCENARY_BUFF'&&e.effect==='SHIELD')row.shieldGranted+=e.amount||0;
    if(e.type==='MERCENARY_WINDUP'&&!e.continuation)row.casts++;
    if(e.type?.startsWith('MERCENARY_'))row.skillTypes.add(e.type);
   }
  }
  rows.push({...row,skillTypes:[...row.skillTypes],averageDamage:row.damage/row.total,averageTurns:row.turns/row.total});
 }
 return {scope:'CANONICAL_PVE_SIMULATION_NOT_LIVE_PLAYER_STATISTICS',policyFingerprint:balanceFingerprint(),cases,count:8,total:rows.reduce((n,r)=>n+r.total,0),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),v=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
 const report=args.includes('--pve')?measurePveBalance():measureBalance({count:Number(v('--count',12)),start:Number(v('--start',19001)),scope:v('--scope','all'),onProgress:r=>console.log(JSON.stringify(r))});
 const out=v('--out',null);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({total:report.total,summary:report.summaries?.map(({code,name,winRate,draws,total,opponents})=>({code,name,winRate,draws,total,opponents:Object.fromEntries(Object.entries(opponents).map(([k,v])=>[k,v.winRate]))}))||report.rows.map(({code,scenario,clears,averageDamage,averageTurns,casts})=>({code,scenario,clears,averageDamage,averageTurns,casts}))}));
}
