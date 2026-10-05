// Deterministic audit of the real server engine, no DB or live-account mutations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {buildIconFurReference,fur15ReferenceCards} from '../functions/_icon_fur_reference.js';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {createPvpBattleV2,createPveBattleV2,buildFighter} from '../functions/_battle_v2_preview.js';
const live=JSON.parse(fs.readFileSync(new URL('../tests/helpers/icon-fur15-reference-20261005.json',import.meta.url)));
const output=process.argv[2];assert.ok(output,'Pass a report JSON destination');
let battles=0;const start=performance.now();
const icon=(d,ref,mode='PVP')=>({id:d.cardId,title:d.name,grade:'ICON',power:180000,iconRole:{...iconRoleSnapshot({id:d.cardId,grade:'ICON'},defaultIconRoles(),mode),...(ref?{supremacy:ref}:{})}});
function contest(a,b,seeds=24,equipment=0){
 let wins=0,actions=0;for(let seed=1;seed<=seeds;seed++)for(const flip of [false,true]){
  const x=createPvpBattleV2({attackerCards:flip?b:a,defenderCards:flip?a:b,attackerEquipmentBonus:equipment,defenderEquipmentBonus:equipment,seed:510000+seed}).result;
  battles++;wins+=x.winner===(flip?'B':'A');actions+=x.actions;
  assert.ok(x.timeline.every(e=>e.damage==null||Number.isFinite(e.damage)));
 }return {wins,total:seeds*2,percent:Math.round(wins/(seeds*2)*10000)/100,averageActions:actions/(seeds*2)};
}
function singles(rows,battle,high,baseline){
 const ref=buildIconFurReference(rows,battle,high,'PVP'),furs=fur15ReferenceCards(rows,battle,high,'PVP');
 return {reference:ref,roles:ICON_ROLES.map(d=>{
  const matchups=furs.map(f=>({name:f.title,id:f.id,...contest([icon(d,ref)],[f]),...(baseline?{before:contest([icon(d,null)],[f])}:{})}));
  const total=matchups.reduce((s,x)=>s+x.total,0),wins=matchups.reduce((s,x)=>s+x.wins,0);
  const stats=buildFighter(icon(d,ref),0,'A'),statKeys=['maxHp','attack','defense','speed'];
  return {name:d.name,role:d.label,code:d.role,wins,total,percent:Math.round(wins/total*10000)/100,worstPercent:Math.min(...matchups.map(x=>x.percent)),...(baseline?{beforePercent:Math.round(matchups.reduce((s,x)=>s+x.before.wins,0)/total*10000)/100}:{}),stats:Object.fromEntries(statKeys.map(k=>[k,stats[k]])),matchups};
 })};
}
const current=singles(live.cards,live.battle,live.high,true);
const extremeRows=['ATTACK','DEFENSE','HP','SPEED'].map((type,i)=>({id:'stress-'+i,title:type,base_power:12345,power_type:'FIXED',attack_percent:45,defense_percent:45,hp_percent:45,speed_percent:27,[{ATTACK:'attack_percent',DEFENSE:'defense_percent',HP:'hp_percent',SPEED:'speed_percent'}[type]]:type==='SPEED'?300:500,is_active:1,scope_pve:1,scope_pvp:1,scope_captain:1}));
const high={enabled:true,steps:[{},{},{},{powerBonusPercent:1000000},{powerBonusPercent:1000000,uniqueBoostPercent:1000}]};
const stress=singles(extremeRows,live.battle,high,false);
const furs=fur15ReferenceCards(live.cards,live.battle,live.high,'PVP'),ref=current.reference;
const strong=[...new Set(['attack','defense','maxHp','speed'].map(k=>furs.reduce((best,c)=>buildFighter(c,0,'B',c.uniqueAbility)[k]>buildFighter(best,0,'B',best.uniqueAbility)[k]?c:best,furs[0])))];
const common=[{id:'common-s',grade:'SUPERSTAR',power:93200},{id:'common-z1',grade:'ZENITH',power:75625},{id:'common-z2',grade:'ZENITH',power:75625}];
const pairs=[];
for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){
 const a=[icon(ICON_ROLES[i],ref),icon(ICON_ROLES[j],ref),...common],opponents=[];
 for(let f=0;f<strong.length;f++)for(let g=f+1;g<strong.length;g++)for(const equipment of [0,5000000])opponents.push({fur:[strong[f].title,strong[g].title],equipment,...contest(a,[strong[f],strong[g],...common],16,equipment)});
 const total=opponents.reduce((s,x)=>s+x.total,0),wins=opponents.reduce((s,x)=>s+x.wins,0);
 pairs.push({roles:[ICON_ROLES[i].label,ICON_ROLES[j].label],wins,total,percent:Math.round(wins/total*10000)/100,worstPercent:Math.min(...opponents.map(x=>x.percent)),opponents});
}
// PvE uses the same monster/seeds/equipment, replacing only the first card.
const pveReference=buildIconFurReference(live.cards,live.battle,live.high,'PVE'),pveFurs=fur15ReferenceCards(live.cards,live.battle,live.high,'PVE');
const pve=ICON_ROLES.map(d=>{
 const run=c=>{let wins=0,damage=0,total=0;for(const power of [1000000,4000000,10000000])for(let seed=1;seed<=16;seed++){
  const x=createPveBattleV2({cards:[c,...common,{id:'common-ssr',grade:'SSR',power:30000}],monster:{id:'audit-boss',name:'Audit boss',power,is_boss:1},characterBonus:500000,seed:700000+seed}).result;
  battles++;total++;wins+=x.winner==='A';damage+=(x.final.B||[]).reduce((sum,f)=>sum+Math.max(0,f.maxHp-f.hp),0);
 }return {wins,total,damage};};
 const a=run(icon(d,pveReference,'PVE')),comparators=pveFurs.filter(c=>strong.some(s=>s.id===c.id)).map(c=>({name:c.title,...run(c)}));
 return {name:d.name,role:d.label,...a,comparators};
});
const report={source:live.source,sourceCheckedAt:live.checkedAt,policy:{roles:7,deckLimit:2,margin:1.2,comparison:'FUR +15 with highest current advancement; equal equipment, same common teammates, reversed PVP sides. Individual wins remain subject to role matchup and seed.'},seedRanges:{pvp:'510001..510024; pair 510001..510016',pve:'700001..700016'},current,stress,pairs,pve,battles,elapsedMs:Math.round(performance.now()-start)};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
for(const d of current.roles)assert.ok(d.percent>=95,d.name+' current floor');
for(const d of stress.roles)assert.ok(d.percent>=90,d.name+' stress floor');
for(const d of pairs)assert.ok(d.percent>=90,d.roles.join('/')+' two-card floor');
console.log(JSON.stringify({battles,elapsedMs:report.elapsedMs,current:current.roles.map(x=>({name:x.name,before:x.beforePercent,after:x.percent})),stress:stress.roles.map(x=>({name:x.name,percent:x.percent})),pairMinimum:Math.min(...pairs.map(x=>x.percent)),pve:pve.map(x=>({role:x.role,wins:x.wins,total:x.total,bestFurWins:Math.max(...x.comparators.map(c=>c.wins))}))}));

