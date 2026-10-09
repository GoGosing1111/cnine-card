import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {measureSSLimitedBalance,ssLimitedSnapshot,sssReferences} from './measure-ss-limited-balance-20261008.mjs';
import {SS_LIMITED_COMBAT,SS_LIMITED_TEMPO,SS_LIMITED_TARGET,SS_LIMITED_BALANCE_VERSION} from '../shared/mercenary-ss-limited-v1.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards,tierDecks} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

export const policyFingerprint=()=>createHash('sha256').update(JSON.stringify({profiles:SS_LIMITED_COMBAT,tempo:SS_LIMITED_TEMPO})).digest('hex');
export function measureMercenaryTempo(snapshot,mode='PVP'){
 const actor=buildMercenaryFighter(snapshot,'A',mode,buildFighter),ally=buildFighter({id:'clock',power:2e7},0,'A',null,mode);
 const opponents=Array.from({length:3},(_,i)=>({...buildFighter({id:'target-'+i,power:1e9},i,'B',null,mode),hp:1e12,maxHp:1e12}));
 const teams={A:[ally,actor],B:opponents},cadence=mercenaryTurnCadence(teams),counts=[];
 for(let i=0;i<64;i++){
  cadence.acted(ally);let extra=0,pending;
  while((pending=cadence.pending())){if(++extra>2)throw Error('UNBOUNDED_CADENCE');cadence.acted(pending);}
  counts.push(extra);
 }
 const casts=[],runtime=mercenaryCombat({teams,hit:()=>({damage:100,dodge:false}),damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},clock:()=>0,
  emit:(type,event)=>{if(type==='MERCENARY_WINDUP'&&!event.continuation)casts.push({action:actor.actions,skillId:event.skillId,energyAfter:event.energyAfter});}});
 let basics=0;
 for(let action=1;action<=64;action++){actor.actions=action;if(!runtime.beforeAction(actor)){basics++;runtime.afterBasic(actor,opponents[0],true);}}
 return {code:actor.code,name:actor.name,rank:actor.rank,mode,speed:actor.speed,alliedCardActions:64,reservedActions:counts.reduce((a,b)=>a+b,0),counts,
  energyMax:actor.combat.energyMax,energyPerBasic:actor.combat.energyPerBasic,skills:actor.skills.map(s=>({id:s.id,...s.balance})),casts,basics,energyAfter:runtime.state(actor).energy};
}
export function measureSSLimitedPve({count=16,start=170001}={}){
 const snapshots=[...Object.keys(SS_LIMITED_COMBAT).map(ssLimitedSnapshot),...sssReferences],rows=[];
 for(const snapshot of snapshots){const cases=[];
  for(const [deck,types]of Object.entries(tierDecks))for(const monsterPower of [4e9,8e9,1.6e10]){
   let wins=0,actions=0,damage=0;
   for(let i=start;i<start+count;i++){
    const battle=createPveBattleV2({cards:tierCards(2e7,types),mercenary:snapshot,monster:{id:1,battle_power:monsterPower},seed:i*7919});
    wins+=Number(battle.result.winner==='A');actions+=battle.result.mercenaryActions||0;damage+=battle.result.damageBreakdown.mercenary||0;
   }
   cases.push({deck,monsterPower,wins,total:count,winRate:wins/count,averageActions:actions/count,averageDamage:damage/count});
  }
  const wins=cases.reduce((n,c)=>n+c.wins,0),total=cases.reduce((n,c)=>n+c.total,0);
  rows.push({code:snapshot.code,name:snapshot.name,group:Object.hasOwn(SS_LIMITED_COMBAT,snapshot.code)?'SS_LIMITED':'ORDINARY_SSS',wins,total,winRate:wins/total,cases});
 }
 return {scope:'CONTROLLED_PVE_SAME_DECK_12_SCENARIOS_NOT_ALL_CONTENT',count,start,rows,total:rows.reduce((n,r)=>n+r.total,0)};
}
export function measureSSLimitedTempoBalance(options={}){
 const report=measureSSLimitedBalance(options);
 return {...report,date:'2026-10-09',scope:'CANONICAL_SERVER_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',policyVersion:SS_LIMITED_BALANCE_VERSION,
  policyFingerprint:policyFingerprint(),tempo:{...SS_LIMITED_TEMPO},excludes:[...SS_LIMITED_TARGET.excludes],
  actionComparison:[...Object.keys(SS_LIMITED_COMBAT).map(ssLimitedSnapshot),...sssReferences].flatMap(s=>['PVE','PVP'].map(mode=>measureMercenaryTempo(s,mode)))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const report=measureSSLimitedTempoBalance({count:Number(value('--count',64)),start:Number(value('--start',130001)),seedStarts:args.includes('--final')?{'V-991':150001,'V-994':150001,'V-993':160001,'V-998':160001}:{},codes:value('--codes',Object.keys(SS_LIMITED_COMBAT).join(',')).split(','),
  onProgress:r=>console.log(JSON.stringify({code:r.code,name:r.name,scale:r.scale,wins:r.wins,total:r.total,winRate:r.winRate}))});
 if(args.includes('--pve'))report.pve=measureSSLimitedPve();
 const out=value('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,pveTotal:report.pve?.total,policyFingerprint:report.policyFingerprint}));
}
