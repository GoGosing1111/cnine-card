import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {balanceFormations,balanceSnapshot,halloweenCodes} from '../../scripts/measure-ss-mercenary-balance-20261019.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),out=path.join(dir,'qa/balance-engine.mjs');
let patched=0;
await build({entryPoints:[path.join(dir,'balance-entry.mjs')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:out,plugins:[{name:'preview-only-bloodmoon-policy',setup(b){
 b.onLoad({filter:/mercenary-ss-limited-v1\.mjs$/},async args=>{
  const source=await fs.readFile(args.path,'utf8'),needle='export const ssLimitedProfile=';
  if(source.split(needle).length!==2)throw Error('Canonical policy changed; inspect before measuring');patched++;
  return {contents:`import {BLOODMOON_COMBAT} from ${JSON.stringify(path.join(dir,'balance.mjs').replaceAll('\\','/'))};\n`+source.replace(needle,'const originalSSLimitedProfile=')+'\nexport const ssLimitedProfile=actor=>(actor?.isMercenary===true&&BLOODMOON_COMBAT[actor.code||actor.cardId])||originalSSLimitedProfile(actor);\n',loader:'js'};
 });
}}]});
if(patched!==1)throw Error('Expected exactly one preview policy adapter');
const {createPvpBattleV2,createPveBattleV2,BLOODMOON_COMBAT,BATHORY_COMBAT,HALLOWEEN_COMBAT}=await import(pathToFileURL(out));
const count=Number(process.env.BLOODMOON_SEEDS||8),only=process.argv.includes('--bathory-only'),opponents=only?['V-977']:['V-977',...halloweenCodes];
function candidate(profile,level){const base=balanceSnapshot('V-977',level);return {...base,...profile,rank:'SS',rankIsSimulationOnly:true,statMode:'RANK_FIXED',actorKind:'MERCENARY',skills:[profile.skill],combat:base.combat,mercenaryLevel:base.mercenaryLevel,level:1};}
const report={dateKST:'2026-10-23',scope:'CANONICAL_SERVER_SIMULATION_WITH_PREVIEW_ONLY_POLICY_ADAPTER',rank:'SS simulation parity only; actual rarity unassigned',notes:'Identical five cards, equipment, magic, mercenary growth on both sides; mirrored positions and fixed seeds. No account/opponent/winner-specific buffs. This is not a live-player win-rate claim.',seedCount:count,formations:balanceFormations.map(({id,level})=>({id,level})),profiles:BLOODMOON_COMBAT,references:{bathory:BATHORY_COMBAT,halloween:HALLOWEEN_COMBAT},pvp:[],pve:[]};
for(const p of Object.values(BLOODMOON_COMBAT))for(const opponent of opponents){
 const row={slug:p.slug,opponent,wins:0,draws:0,total:0,formations:[]};
 for(const f of balanceFormations){
  const tally={id:f.id,wins:0,draws:0,total:0};
  for(let i=0;i<count;i++)for(const side of ['A','B']){
   const seed=createHash('sha256').update(`bloodmoon-v1:${p.code}:${opponent}:${f.id}:${i}`).digest().readUInt32BE(0),a=candidate(p,f.level),b=balanceSnapshot(opponent,f.level);
   const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='B'?a:b,seed});
   for(const r of [row,tally]){r.total++;r.wins+=Number(battle.result.winner===side);r.draws+=Number(!['A','B'].includes(battle.result.winner));}
  }row.formations.push({...tally,winRate:tally.wins/tally.total});
 }row.winRate=row.wins/row.total;report.pvp.push(row);console.log(JSON.stringify({slug:p.slug,opponent,winRate:row.winRate,total:row.total}));
}
if(!only)for(const p of [...Object.values(BLOODMOON_COMBAT),BATHORY_COMBAT,...Object.values(HALLOWEEN_COMBAT)])for(const f of [balanceFormations[1],balanceFormations[7]]){
 const row={code:p.code,slug:p.slug||p.code,formation:f.id,total:0,clears:0,turns:0,damage:0,casts:0};
 for(let i=0;i<4;i++){
  const b=createPveBattleV2({cards:f.cards,magicCards:f.magic,mercenary:p.slug?candidate(p,f.level):balanceSnapshot(p.code,f.level),monster:{id:1,name:'혈월 비교 표적',battle_power:f.level===1?5e9:5e10},seed:10231001+i*7919});row.total++;row.clears+=Number(b.result.winner==='A');row.turns+=b.result.timeline.filter(e=>e.type==='TURN').length;
  for(const e of b.result.timeline.filter(e=>(e.sourceAttackerId||e.actorId)===`A:MERCENARY:${p.code}`)){
   row.damage+=Array.isArray(e.impacts||e.hits)?(e.impacts||e.hits).reduce((n,h)=>n+(h.damage||0)+(h.absorbed||0),0):(e.damage||0)+(e.absorbed||0);row.casts+=Number(e.type==='MERCENARY_WINDUP'&&!e.continuation);
  }
 }report.pve.push({...row,averageTurns:row.turns/row.total,averageDamage:row.damage/row.total});
}
report.totalPvp=report.pvp.reduce((n,r)=>n+r.total,0);report.totalPve=report.pve.reduce((n,r)=>n+r.total,0);report.everyMatchupAboveHalf=report.pvp.every(r=>r.winRate>.5);
report.profileSha256=createHash('sha256').update(await fs.readFile(path.join(dir,'balance.mjs'))).digest('hex');
await fs.writeFile(path.join(dir,'qa',only?'balance-bathory.json':'balance-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totalPvp:report.totalPvp,totalPve:report.totalPve,pass:report.everyMatchupAboveHalf}));
if(!report.everyMatchupAboveHalf)process.exitCode=1;
