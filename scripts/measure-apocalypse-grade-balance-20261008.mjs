import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import live from '../tests/fixtures/apocalypse-grade-balance-20261008.json' with {type:'json'};
import prior from '../tests/helpers/icon-apocalypse-20261006.json' with {type:'json'};
import mercenaries from '../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};

export const reference=live;
export const mercenaryCodes=['V-051','V-021','V-046','V-049','V-055'];
export function iconCard(def){
 const row=live.cards.find(c=>c.id===def.cardId),card={id:def.cardId,title:def.name,grade:'ICON',power:Number(row.base_power)};
 return {...card,iconRole:{...iconRoleSnapshot(card,live.roles.document,'PVE',live.roles.revision),supremacy:structuredClone(live.reference)}};
}
export function comparisonCards(iconIndexes=[],formation='HP2'){
 const cards=structuredClone(prior.lowArgs.cards.slice(0,4));
 // Two distinct synthetic ZENITH references isolate the upgraded slots without
 // pretending these controlled formations are any player's saved loadout.
 cards[2].id='grade-audit-zenith-hp';
 cards.push({id:'grade-audit-zenith-speed',title:'통제 속도형',grade:'ZENITH',power:75625,power_type:'SPEED',uniqueAbility:{dominantType:'SPEED',attackPercent:16,defensePercent:16,hpPercent:16,speedPercent:48}});
 if(formation==='HP1')cards[2]={...structuredClone(cards[4]),id:'grade-audit-zenith-speed-2'};
 if(formation==='HP0')for(const slot of [1,2])cards[slot]={id:'grade-audit-zenith-attack-'+slot,title:'통제 공격형',grade:'ZENITH',power:75625,power_type:'ATTACK',uniqueAbility:{dominantType:'ATTACK',attackPercent:48,defensePercent:16,hpPercent:16,speedPercent:0}};
 for(const [i,index] of iconIndexes.entries())cards[[2,4][i]]=iconCard(ICON_ROLES[index]);
 return cards;
}
export function comparisonArgs({icons=[],formation='HP2',mercenary='V-051',equipment=3000000,suit=0,seed=1,magicCards=[]}={}){
 return {cards:comparisonCards(icons,formation),characterBonus:equipment,battleSuit:suit?{code:suit===7000000?'BATTLE_SUIT_H':'BATTLE_SUIT_S',pvePower:suit}:null,
  mercenary:mercenary?{...structuredClone(mercenaries.roster.find(c=>c.code===mercenary)),combat:structuredClone(mercenaries.combat)}:null,
  magicCards,monster:structuredClone(live.monster),singleHealerBonus:structuredClone(live.battle.engine.singleHealerBonus),bossUltimatePercent:0,bossUltimateCapPercent:500,seed};
}
export function battleMetrics(battle){
 const r=battle.result,m=r.final.mercenaries?.A?.[0];
 return {wins:Number(r.winner==='A'),bossHp:r.final.B[0].hp/r.final.B[0].maxHp,remainingEnemies:r.final.B.filter(c=>c.hp>0).length,
  cardSurvivors:r.final.A.filter(c=>c.hp>0).length,mercenaryHp:m?m.hp/m.maxHp:0,
  healing:r.timeline.filter(e=>e.type==='MERCENARY_GROUP_HEAL').reduce((n,e)=>n+e.amount,0),
  suitDamage:r.damageBreakdown.battleSuit,actions:r.actions,
  mercenaryDamage:r.timeline.filter(e=>e.actorKind==='MERCENARY').reduce((n,e)=>n+Number(e.damage||0)+Number(e.absorbed||0)+(e.impacts||[]).reduce((s,h)=>s+Number(h.damage||0)+Number(h.absorbed||0),0),0)};
}
export async function measure({count=16,start=1,pairs=false,formations=['HP2'],equipment=[1000000,3000000,6000000,9000000],suits=[0,7000000,12500000],engine=createPveBattleV2,onProgress=()=>{}}={}){
 const variants=[{label:'하위 카드',icons:[]}];
 for(let i=0;i<7;i++)variants.push({label:ICON_ROLES[i].name,icons:[i]});
 if(pairs)for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)variants.push({label:ICON_ROLES[i].name+' + '+ICON_ROLES[j].name,icons:[i,j]});
 const rows=[];
 for(const formation of formations)for(const gear of equipment)for(const suit of suits)for(const v of variants)for(const mercenary of mercenaryCodes){
  const args=comparisonArgs({icons:v.icons,formation,mercenary,equipment:gear,suit}),sums={};
  for(let i=0;i<count;i++){
   const metrics=battleMetrics(engine({...args,seed:Math.imul(start+i,7919)>>>0}));
   for(const [key,value] of Object.entries(metrics))sums[key]=(sums[key]||0)+value;
  }
  rows.push({formation,equipment:gear,suit,icons:v.icons.map(i=>ICON_ROLES[i].code),label:v.label,mercenary,total:count,...sums,winRate:sums.wins/count});
  if(rows.length%500===0)onProgress({scenarios:rows.length,battles:rows.length*count});
 }
 return {capturedAt:live.capturedAt,measuredAt:new Date().toISOString(),boss:live.monster.name,method:'Canonical PVE engine, same gear/suit/magic/seeds, only stated card/mercenary substitutions; no account, reward or winner mutation. Controlled simulations, not live-player rates.',count,start,rows,total:rows.reduce((n,r)=>n+r.total,0)};
}
export async function baselineModule(ref='5d688704'){
 const file='functions/_battle_v2_preview.js',text=execFileSync('git',['show',ref+':'+file],{encoding:'utf8'});
 const source=text.replace(/from '(\.\.?\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,new URL('../'+file,import.meta.url)).href}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
export const baselineEngine=async ref=>(await baselineModule(ref)).createPveBattleV2;
export function summarize(report){
 const groups={};
 for(const row of report.rows){
  const tier=row.mercenary==='V-051'?'SS 간호사':'SSS';
  const key=row.icons.length+' ICON / '+tier,g=groups[key]||={wins:0,total:0};g.wins+=row.wins;g.total+=row.total;
 }
 return Object.fromEntries(Object.entries(groups).map(([key,v])=>[key,{...v,percent:Math.round(v.wins/v.total*10000)/100}]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const get=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]};
 const options={count:Number(get('--count',16)),start:Number(get('--start',1)),pairs:process.argv.includes('--pairs'),formations:get('--formations','HP2').split(',')};
 if(process.argv.includes('--compare')){
  const ref=get('--base','5d688704'),cache=get('--before-cache',null);
  const signature=JSON.stringify({ref,options,fixture:live,measurement:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex')});
  let before;
  if(cache&&fs.existsSync(cache)){const saved=JSON.parse(fs.readFileSync(cache));if(saved.signature!==signature)throw Error('Baseline cache input changed');before=saved.report;}
  else {before=await measure({...options,engine:await baselineEngine(ref),onProgress:r=>console.log(JSON.stringify({phase:'before',...r}))});if(cache)fs.writeFileSync(cache,JSON.stringify({signature,report:before}));}
  const after=await measure({...options,onProgress:r=>console.log(JSON.stringify({phase:'after',...r}))});
  const report={sourceCommit:ref,engineSha256:createHash('sha256').update(fs.readFileSync(new URL('../functions/_battle_v2_preview.js',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),options,summary:{before:summarize(before),after:summarize(after)},before,after,total:before.total+after.total};
  fs.writeFileSync(get('--out','../apocalypse-grade-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({total:report.total,summary:report.summary},null,2));
  process.exit(0);
 }
 const report=await measure(options);
 const output=get('--out','../apocalypse-grade-baseline.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 const summary={};for(const row of report.rows){const key=row.label+'/'+row.mercenary;const a=summary[key]||={wins:0,total:0};a.wins+=row.wins;a.total+=row.total;}
 console.log(JSON.stringify({total:report.total,summary:Object.fromEntries(Object.entries(summary).map(([key,v])=>[key,Math.round(v.wins/v.total*10000)/100]))},null,2));
}
