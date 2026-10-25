import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {RAZAK_COMBAT,RAZAK_SKILLS,razakDeploymentSnapshot} from '../shared/mercenary-razak-v1.mjs';
import {ssLimitedFormations} from './measure-ss-limited-balance-20261008.mjs';
import live from '../docs/qa/razak-balance-20261026/live-input.json' with {type:'json'};

export const scenarios=[
 ...['basic-10000-balanced','basic-20000000-balanced','basic-2000000000-balanced','basic-20000000-attack','basic-20000000-defense','basic-20000000-speed'].map(id=>({...ssLimitedFormations.find(f=>f.id===id),level:1,gear:0})),
 ...[6,11,16,21].map(level=>({...ssLimitedFormations.find(f=>f.id==='basic-20000000-balanced'),id:`growth-${level}`,level,gear:0})),
 ...[1,11,21].map((level,i)=>({...ssLimitedFormations.filter(f=>f.group==='EQUIPPED')[i],id:`equipped-${level}`,level,gear:1000000}))
];
export const roster=live.roster;
export function snapshot(code,level=1,mode='PVP',gear=0){
 const base=code==='V-058'?razakDeploymentSnapshot():roster.find(c=>c.code===code);
 if(!base)throw Error(`Unknown fighter ${code}`);
 return {...structuredClone(base),combat:live.combat,equipment:{schemaVersion:1,mode,power:gear},mercenaryLevel:{version:2,level,policyRevision:live.policyRevision,breakthroughMask:[5,10,15,20].reduce((m,t,i)=>m|(t<level?1<<i:0),0),growth:live.growth}};
}
const tally=()=>({wins:0,draws:0,total:0});
const add=(r,winner,side)=>{r.total++;r.wins+=Number(winner===side);r.draws+=Number(!['A','B'].includes(winner));};
const finish=r=>({...r,losses:r.total-r.wins-r.draws,winRate:r.wins/r.total});
const stats=m=>Object.fromEntries(['code','rank','basePower','maxHp','attack','defense','speed','shield','mercenaryLink'].map(k=>[k,m[k]]));
export function measure({count=8,start=26001,codes=null,caseIds=null,onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1)throw Error('Invalid seeds');
 const opponents=roster.filter(c=>c.code!=='V-058'&&(!codes||codes.includes(c.code))),cases=scenarios.filter(f=>!caseIds||caseIds.includes(f.id));
 if(!opponents.length||!cases.length)throw Error('Empty measurement');
 const rows=[];
 for(const opponent of opponents){const row={code:opponent.code,name:opponent.name,rank:opponent.rank,edition:opponent.edition,...tally(),sides:{A:tally(),B:tally()},scenarios:[]};
  for(const f of cases){const r={id:f.id,level:f.level,gear:f.gear,...tally(),razakCasts:0,razakBasicTurns:0,razakSurvivals:0};
   for(let i=start;i<start+count;i++)for(const side of ['A','B']){
    const seed=createHash('sha256').update(`razak-balance:${opponent.code}:${f.id}:${i}`).digest().readUInt32BE(0);
    const a=snapshot('V-058',f.level,'PVP',f.gear),b=snapshot(opponent.code,f.level,'PVP',f.gear);
    const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='A'?b:a,seed});
    add(r,battle.result.winner,side);add(row,battle.result.winner,side);add(row.sides[side],battle.result.winner,side);
    const end=battle.result.final.mercenaries[side][0];r.razakBasicTurns+=battle.result.timeline.filter(e=>e.type==='TURN'&&e.actorId===`${side}:MERCENARY:V-058`).length;r.razakSurvivals+=Number(end.hp>0);
    r.razakCasts+=battle.result.timeline.filter(e=>e.type==='MERCENARY_RAZAK_ASSASSINATION'&&e.actorId===`${side}:MERCENARY:V-058`).length;
    if(i===start&&side==='A')r.opening={razak:stats(battle.teams.A.mercenaries[0]),opponent:stats(battle.teams.B.mercenaries[0])};
   }
   row.scenarios.push({...finish(r),averageRazakBasicTurns:r.razakBasicTurns/r.total,averageRazakCasts:r.razakCasts/r.total});
  }
  rows.push({...finish(row),sides:Object.fromEntries(Object.entries(row.sides).map(([k,r])=>[k,finish(r)]))});onProgress({code:row.code,name:row.name,winRate:row.wins/row.total,total:row.total});
 }
 return {scope:'CANONICAL_TEAM_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',checkedAt:new Date().toISOString(),liveInputCheckedAt:live.checkedAt,cmsRevision:live.cmsRevision,settingsHash:live.settingsHash,policy:{combat:RAZAK_COMBAT,skills:RAZAK_SKILLS},policyFingerprint:createHash('sha256').update(JSON.stringify({RAZAK_COMBAT,RAZAK_SKILLS})).digest('hex'),conditions:'Identical five-card decks, card equipment, magic, mercenary equipment and levels; both attacker/defender sides per seed. No pets. All opponents use captured live CMS snapshots and canonical server policies. Team victories, not standalone mercenary duels.',count,start,seedMethod:'SHA256(razak-balance:opponent:scenario:index), mirrored A/B',scenarios:cases.map(({id,level,gear})=>({id,level,gear})),total:rows.reduce((n,r)=>n+r.total,0),rows};
}
export function measurePve(){return [1,11,21].flatMap(level=>[2e6,5e9,5e10].map(power=>{
 const cards=scenarios[1].cards,results=[];
 for(let i=0;i<8;i++){
  const b=createPveBattleV2({cards,mercenary:snapshot('V-058',level,'PVE',1000000),monster:{id:1,name:'QA',battle_power:power},seed:260000+i*7919});
  results.push({winner:b.result.winner,casts:b.result.timeline.filter(e=>e.type==='MERCENARY_RAZAK_ASSASSINATION').map(e=>({skillId:e.skillId,damage:e.damage,hits:e.hits})),mercenary:b.result.final.mercenaries?.A});
 }
 return {level,bossPower:power,results};
}));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
 const report=args.includes('--pve')?measurePve():measure({count:Number(arg('--count',8)),start:Number(arg('--start',26001)),codes:arg('--codes',null)?.split(','),caseIds:arg('--cases',null)?.split(','),onProgress:r=>console.log(JSON.stringify(r))});
 const out=arg('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({total:report.total||72,out}));
}
