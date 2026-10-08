import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {buildTowerV3Battle} from '../functions/_tower_v3.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {comparisonCards} from './measure-apocalypse-grade-balance-20261008.mjs';
import {isSsRearPveMercenary,ssRearPveSnapshot} from '../shared/mercenary-ss-rear-pve-v1.mjs';
import fixture from '../tests/fixtures/ss-rear-pve-20261008.json' with {type:'json'};

export {fixture};
export const scenarios=[
 ...fixture.monsters.map(monster=>({mode:'APOCALYPSE',id:monster.id,name:monster.name,monster,equipment:['75','76'].includes(monster.id)?[1000000,3000000,6000000]:[30000000,60000000,120000000]})),
 ...fixture.tower.map(floor=>({mode:'TOWER',id:String(floor.tier),name:floor.tier+'층',floor,equipment:({50:[300000,1000000,3000000],70:[3000000,6000000,12000000],90:[15000000,30000000,60000000],100:[30000000,60000000,120000000]})[floor.tier]})),
 ...fixture.legion.map(difficulty=>({mode:'LEGION',id:difficulty.id,name:difficulty.id,difficulty,equipment:({normal:[100000,300000,1000000],hard:[300000,600000,1000000],nightmare:[600000,1000000,3000000],inferno:[1000000,3000000,6000000]})[difficulty.id]}))
];
export function snapshot({code,equipment,formation='HP2',suit=0,adjusted=false}){
 const source=fixture.roster.find(m=>m.code===code),mercenary=source?structuredClone(source):null;
 if(mercenary){delete mercenary.pveRearCadence;if(adjusted)Object.assign(mercenary,ssRearPveSnapshot(mercenary));}
 const cards=comparisonCards([],formation);
 return {cards,mercenary,cardSupportBonus:equipment,battleSuit:suit?{code:'BATTLE_SUIT_S',pvePower:suit}:null,
  characterBonus:{},magicCards:[],singleHealerBonus:fixture.singleHealerBonus,
  power:{cards:cards.reduce((s,c)=>s+c.power,0),equipment,battleSuit:suit},source:'CONTROLLED_SIMULATION'};
}
export function runBattle(scenario,loadout,seed){
 if(scenario.mode==='TOWER')return buildTowerV3Battle({snapshot:loadout,tier:scenario.floor.tier,operatingFloor:scenario.floor,seed}).battleV2.result;
 if(scenario.mode==='LEGION'){
  const session=createHuntSession({snapshot:loadout,difficulty:scenario.id,dropPolicy:scenario.difficulty,seed,random:()=>.5});
  return {...session.payload.battleV2.result,winner:session.exportState().outcome.winner};
 }
 return createPveBattleV2({cards:loadout.cards,characterBonus:loadout.cardSupportBonus,mercenary:loadout.mercenary,battleSuit:loadout.battleSuit,
  singleHealerBonus:loadout.singleHealerBonus,monster:scenario.monster,seed,bossUltimatePercent:0,bossUltimateCapPercent:500}).result;
}
export function metrics(result){
 const events=result.timeline.filter(e=>e.actorKind==='MERCENARY');
 return {wins:Number(result.winner==='A'),healing:events.filter(e=>e.type==='MERCENARY_GROUP_HEAL').reduce((n,e)=>n+Number(e.amount||0),0),
  mercenaryDamage:events.reduce((n,e)=>n+Number(e.damage||0)+Number(e.absorbed||0)+(e.impacts||[]).reduce((s,h)=>s+Number(h.damage||0)+Number(h.absorbed||0),0),0),
  mercenaryBasics:events.filter(e=>e.type==='TURN').length,mercenaryCasts:events.filter(e=>e.type==='MERCENARY_WINDUP').length,
  cardSurvivors:result.final.A.filter(c=>!c.isMercenary&&!c.isBattleSuit&&c.hp>0).length,
  kills:result.timeline.filter(e=>e.type==='KO'&&e.targetId?.startsWith('B:')).length};
}
export async function measure({count=2,start=1001,equipment=null,formations=['HP2','HP0'],suits=[0],codes=fixture.roster.map(m=>m.code).concat('NONE'),adjusted=false,onProgress=()=>{}}={}){
 const rows=[];
 for(const scenario of scenarios)for(const gear of equipment||scenario.equipment)for(const formation of formations)for(const suit of suits)for(const code of codes){
  const loadout=snapshot({code,equipment:gear,formation,suit,adjusted}),totals={};
  for(let i=0;i<count;i++)for(const [key,value]of Object.entries(metrics(runBattle(scenario,loadout,Math.imul(start+i,7919)>>>0))))totals[key]=(totals[key]||0)+value;
  const merc=loadout.mercenary,group=!merc?'NONE':isSsRearPveMercenary(merc)?merc.role==='SUPPORT'?'SS_NURSE':'SS_RANGED':merc.rank;
  rows.push({mode:scenario.mode,scenario:scenario.id,equipment:gear,formation,suit,code,group,total:count,...totals});
  if(rows.length%132===0)onProgress({rows:rows.length,battles:rows.length*count});
 }
 return {capturedAt:fixture.capturedAt,measuredAt:new Date().toISOString(),adjusted,count,start,total:rows.length*count,rows};
}
export function summarize(report){
 const groups={};for(const r of report.rows){const g=groups[r.mode+'/'+r.group]||={total:0,wins:0,healing:0,mercenaryDamage:0,mercenaryBasics:0,mercenaryCasts:0};
  for(const key of Object.keys(g))g[key]+=r[key];}
 return Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,{...g,winPercent:Math.round(g.wins/g.total*10000)/100,
  meanHealing:Math.round(g.healing/g.total),meanMercenaryDamage:Math.round(g.mercenaryDamage/g.total),meanMercenaryBasics:Math.round(g.mercenaryBasics/g.total*100)/100,meanMercenaryCasts:Math.round(g.mercenaryCasts/g.total*100)/100}]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const get=(k,d)=>{const at=process.argv.indexOf(k);return at<0?d:process.argv[at+1];};
 const gear=get('--equipment','auto'),options={count:Number(get('--count',2)),start:Number(get('--start',1001)),equipment:gear==='auto'?null:gear.split(',').map(Number),formations:get('--formations','HP2,HP0').split(','),suits:get('--suits','0').split(',').map(Number)};
 const phase=get('--phase','before'),out=get('--out','../ss-rear-'+phase+'.json');
 const signature=createHash('sha256').update(JSON.stringify({fixture,options})).digest('hex');
 const report=await measure({...options,adjusted:phase==='after',onProgress:p=>console.log(JSON.stringify({phase,...p}))});
 fs.writeFileSync(out,JSON.stringify({signature,options,summary:summarize(report),...report},null,2)+'\n');
 console.log(JSON.stringify({phase,total:report.total,summary:summarize(report)},null,2));
}
