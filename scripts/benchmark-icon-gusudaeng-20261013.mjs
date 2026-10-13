// Paired diagnostic simulations of the real battle engine. No live battles,
// rewards, accounts or RNG outcomes are mutated by this benchmark.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {buildIconFurReference,fur15ReferenceCards} from '../functions/_icon_fur_reference.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';

const [input,output,overrides='{}']=process.argv.slice(2);assert.ok(input&&output,'input and report paths required');
const live=JSON.parse(fs.readFileSync(input)),tuning=JSON.parse(overrides.startsWith('@')?fs.readFileSync(overrides.slice(1),'utf8'):overrides),document=structuredClone(live.roles.document);
Object.assign(document.cards.find(c=>c.code==='ICON-GUSUDAENG').tuning,tuning);
const seeds=Number(process.env.ICON_BALANCE_SEEDS||24),gusu=ICON_ROLES.find(c=>c.code==='ICON-GUSUDAENG'),support=ICON_ROLES.find(c=>c.role==='SUPPORT');
const start=performance.now(),references={},commons={};let battles=0;
for(const mode of ['PVE','PVP']){
 references[mode]=buildIconFurReference(live.cards,live.battle,live.high,mode);
 const active=new Set(live.cards.filter(c=>Number(c.card_active)===1).map(c=>c.id)),furs=fur15ReferenceCards(live.cards,live.battle,live.high,mode).filter(c=>active.has(c.id));
 const strength=(c,k)=>buildFighter(c,0,'A',c.uniqueAbility,mode)[k];
 const tank=furs.toSorted((a,b)=>strength(b,'maxHp')-strength(a,'maxHp'))[0],attack=furs.filter(c=>c.id!==tank.id).toSorted((a,b)=>strength(b,'attack')-strength(a,'attack'))[0];
 commons[mode]=[tank,attack,{id:'QA-SUPERSTAR',title:'동일 슈퍼스타',grade:'SUPERSTAR',power:93200},{id:'QA-ZENITH',title:'동일 제니스',grade:'ZENITH',power:75625}];
}
const icon=(def,mode)=>({id:def.cardId,title:def.name,grade:'ICON',power:180000,iconRole:{...iconRoleSnapshot({id:def.cardId,grade:'ICON'},document,mode,live.roles.revision),supremacy:references[mode]}});
function party(def,mode,slot=4,partner=false){const rows=structuredClone(commons[mode]);if(partner)rows[3]=icon(support,mode);rows.splice(slot,0,icon(def,mode));return rows;}
const round=n=>Math.round(n*10000)/10000;
function stats(result,side,def){
 const actor=result.final[side].find(c=>c.cardId===def.cardId),events=result.timeline.filter(e=>e.actorId===actor.id),echoes=events.filter(e=>e.type==='ICON_ECHO');
 // Public fighters intentionally omit damageDealt. Read authoritative damage
 // events, not simulated estimates; TURN.hits is a breakdown, not extra damage.
 const enemy=side==='A'?'B:':'A:',amount=e=>(e.damage||0)+(e.absorbed||0);
 const damage=e=>e.type==='ICON_SKILL'?(e.hits||[]).filter(h=>h.targetId.startsWith(enemy)).reduce((n,h)=>n+amount(h),0):String(e.targetId||'').startsWith(enemy)?amount(e):0;
 const actorDamage=events.reduce((n,e)=>n+damage(e),0),total=result.timeline.filter(e=>String(e.actorId||'').startsWith(side+':')).reduce((n,e)=>n+damage(e),0);
 assert.ok(Number.isFinite(actorDamage)&&Number.isFinite(total));
 return {actorDamage,teamDamage:total,damageShare:total?actorDamage/total:0,echoDamage:echoes.reduce((n,e)=>n+amount(e),0),echoes:echoes.length,casts:events.filter(e=>e.type==='ICON_SKILL').length,actions:result.actions};
}
const pvp=[];
for(const partner of [false,true])for(const def of ICON_ROLES.filter(c=>c!==gusu&&(!partner||c!==support))){
 const groups=[];
 for(const equipment of [0,5000000])for(const slot of [0,4]){
  let wins=0,echoDamage=0,casts=0,deadBeforeCast=0,total=0;
  for(let seed=1;seed<=seeds;seed++)for(const reverse of [false,true]){
   const a=party(gusu,'PVP',slot,partner),b=party(def,'PVP',slot,partner);
   const r=createPvpBattleV2({attackerCards:reverse?b:a,defenderCards:reverse?a:b,attackerEquipmentBonus:equipment,defenderEquipmentBonus:equipment,seed:131000+seed}).result,side=reverse?'B':'A';
   const s=stats(r,side,gusu);wins+=r.winner===side;echoDamage+=s.echoDamage;casts+=s.casts;deadBeforeCast+=s.casts===0;total++;battles++;
   assert.ok([...r.final.A,...r.final.B].every(c=>Number.isFinite(c.hp)&&c.hp>=0&&c.hp<=c.maxHp));
  }
  groups.push({equipment,slot,total,wins,winPercent:round(wins/total*100),averageEchoDamage:round(echoDamage/total),averageCasts:round(casts/total),noCastBattles:deadBeforeCast});
 }
 const total=groups.reduce((n,g)=>n+g.total,0),wins=groups.reduce((n,g)=>n+g.wins,0);
 pvp.push({opponent:def.code,name:def.name,partner:partner?support.code:null,total,wins,winPercent:round(wins/total*100),groups});
}
const pve=[];
for(const def of ICON_ROLES){const groups=[];
 for(const equipment of [0,5000000])for(const multiplier of [4,10,25,50,100]){
  let wins=0,teamDamage=0,actorDamage=0,echoDamage=0,casts=0,actions=0,total=0,bossDamageFraction=0,clearActions=0;
  const power=Math.round((references.PVE.power+equipment/5)*multiplier);
  for(let seed=1;seed<=seeds;seed++){
   const r=createPveBattleV2({cards:party(def,'PVE'),characterBonus:equipment,monster:{id:'QA-BOSS',name:'동일 조건 단일 보스',battle_power:power,is_boss:1},seed:132000+seed}).result,s=stats(r,'A',def),boss=r.final.B[0],cleared=boss.hp===0;
   assert.equal(boss.power,power);assert.equal(r.winner==='A',cleared);assert.ok(Math.abs(s.teamDamage-(boss.maxHp-boss.hp))<=1,'PVE timeline damage must reconcile with actual HP loss');
   wins+=cleared;clearActions+=cleared?r.actions:0;bossDamageFraction+=(boss.maxHp-boss.hp)/boss.maxHp;teamDamage+=s.teamDamage;actorDamage+=s.actorDamage;echoDamage+=s.echoDamage;casts+=s.casts;actions+=s.actions;total++;battles++;
  }
  groups.push({equipment,power,multiplier,total,wins,winPercent:round(wins/total*100),averageBossDamagePercent:round(bossDamageFraction/total*100),averageClearActions:wins?round(clearActions/wins):null,averageTeamDamage:round(teamDamage/total),averageActorDamage:round(actorDamage/total),averageEchoDamage:round(echoDamage/total),averageCasts:round(casts/total),averageActions:round(actions/total)});
 }
 pve.push({code:def.code,name:def.name,groups});
}
const report={checkedAt:new Date().toISOString(),liveInput:input,liveCheckedAt:live.checkedAt,method:'Production server engine and live FUR+15 stat reference. Same four/three teammates, one/two ICONs, same equipment, front/rear and reversed PVP sides. Controlled comparison, not observed ranked win rates. No mercenaries, pets, magic or suits in the baseline.',seedsPerScenario:seeds,seedRanges:{pvp:[131001,131000+seeds],pve:[132001,132000+seeds]},gusudaengTuning:document.cards.find(c=>c.code===gusu.code).tuning,commons,references,pvp,pve,battles,elapsedMs:Math.round(performance.now()-start)};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:output,battles,elapsedMs:report.elapsedMs,pvp:pvp.map(({name,partner,winPercent})=>({name,partner,winPercent})),pve:pve.map(({name,groups})=>({name,wins:groups.reduce((n,g)=>n+g.wins,0),total:groups.reduce((n,g)=>n+g.total,0),damage:Math.round(groups.reduce((n,g)=>n+g.averageTeamDamage,0)),casts:round(groups.reduce((n,g)=>n+g.averageCasts,0)/groups.length)}))}));
