// Deterministic local battles only. No account mutations or production battle requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ICON_ROLES} from '../shared/icon-roles-v1.mjs';
import {buffDocument,PATCHES} from './ops/icon-support-defense-buff-20261006.mjs';
import {iconFurFixture} from '../tests/helpers/icon-fur15-fixture.mjs';
import {fur15ReferenceCards} from '../functions/_icon_fur_reference.js';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';

const dir=new URL('../preview/icon-support-defense-buff-20261006/',import.meta.url);
const live=JSON.parse(fs.readFileSync(new URL('live-before.json',dir))),documents={before:live.publicRoles.document,after:buffDocument(live.publicRoles.document)};
const targets=ICON_ROLES.filter(d=>PATCHES[d.code]),prepared={},start=performance.now(),seedCount=32;
for(const [variant,document] of Object.entries(documents)){
 const f=iconFurFixture({rows:live.cards,battle:live.battle,high:live.high});
 try{
  f.save('icon_role_settings_v1',{revision:live.publicRoles.revision+(variant==='after'?1:0),document,audit:[]});
  f.save('card_unique_effect_settings_v1',live.uniqueSettings);f.save('card_unique_advancement_settings_v1937_release',live.advancementSettings);
  for(const row of live.cards)f.db.prepare('UPDATE card_unique_effects SET effect_name=?,effect_description=?,effect_type=?,trigger_type=?,effect_value=?,trigger_chance=?,max_activations=? WHERE card_id=?').run(row.effect_name||'',row.effect_description||'',row.effect_type||'NONE',row.trigger_type||'PASSIVE',Number(row.effect_value)||0,Number(row.trigger_chance??100),Number(row.max_activations)||1,row.id);
  prepared[variant]={};
  for(const mode of ['PVP','PVE']){
   const fur=fur15ReferenceCards(live.cards,live.battle,live.high,mode).map(({uniqueAbility,uniqueAdvancement,...card})=>card);
   const icons=ICON_ROLES.map(d=>({id:d.cardId,title:d.name,grade:'ICON',power:Number(live.icons.find(c=>c.id===d.cardId).base_power)}));
   const base=[...fur,...icons],states=await cardUniqueDeckStates(f.env,base.map(c=>({user:{id:1,role:'USER'},cards:[c]})),mode,{fresh:true,batched:true});
   prepared[variant][mode]=base.map((c,i)=>({...c,uniqueAbility:states[i].cards[0].uniqueAbility,uniqueAdvancement:states[i].cards[0].uniqueAdvancement,iconRole:states[i].cards[0].iconRole}));
  }
 }finally{f.close();}
}
const seed=i=>(Math.imul(i,2654435761)+610606)>>>0,round=n=>Math.round(n*100)/100;
const aggregate=rows=>{
 const out={battles:0,wins:0,casts:0,healing:0,ward:0,guard:0,storedDamage:0,teamSurvivors:0,teamHpRatio:0};
 for(const r of rows)for(const key of Object.keys(out))out[key]+=r[key];
 return {...out,winPercent:round(out.wins/out.battles*100),averageCasts:round(out.casts/out.battles),averageHealing:Math.round(out.healing/out.battles),averageWard:Math.round(out.ward/out.battles),averageGuard:Math.round(out.guard/out.battles),averageTeamSurvivors:round(out.teamSurvivors/out.battles)};
};
function metrics(result,side,id){
 const actorId=result.final[side].find(c=>c.cardId===id)?.id;assert.ok(actorId);
 const events=result.timeline.filter(e=>e.actorId===actorId),skills=events.filter(e=>e.type==='ICON_SKILL');
 assert.ok(result.actions<=83);assert.ok(result.iconRoles.every(s=>s.casts<=6&&s.healRemaining>=0&&s.guardRemaining>=0));
 assert.ok([...result.final.A,...result.final.B].every(c=>Number.isFinite(c.hp)&&c.hp>=0&&c.hp<=c.maxHp&&c.shield>=0));
 return {battles:1,wins:Number(result.winner===side),casts:skills.length,healing:skills.reduce((n,e)=>n+(e.targets||[]).reduce((m,t)=>m+(t.amount||0),0),0),ward:events.filter(e=>e.status==='WARD').reduce((n,e)=>n+e.amount,0),guard:events.filter(e=>e.type==='ICON_GUARD').reduce((n,e)=>n+e.redirected,0),storedDamage:skills.reduce((n,e)=>n+(e.storedDamage||0),0),teamSurvivors:result.final[side].filter(c=>c.hp>0).length,teamHpRatio:result.final[side].reduce((n,c)=>n+c.hp/c.maxHp,0)};
}
const neutral=[{id:'same-superstar',grade:'SUPERSTAR',power:93200},{id:'same-zenith',grade:'ZENITH',power:75625},{id:'same-neutral',grade:'ZENITH',power:75625}];
const furIds=['CN-5D0E2E4D58C9416F','CN-47AD4B47B6A7452C'];
const teammateMode=process.argv[2]==='fur15'?'fur15':'mixed',commonIds=[];
for(const stat of ['maxHp','attack','speed']){
 const choices=prepared.before.PVP.filter(c=>c.grade==='FUR'&&!furIds.includes(c.id)&&!commonIds.includes(c.id));
 choices.sort((a,b)=>buildFighter(b,0,'A',b.uniqueAbility,'PVP')[stat]-buildFighter(a,0,'A',a.uniqueAbility,'PVP')[stat]);commonIds.push(choices[0].id);
}
const common=base=>teammateMode==='fur15'?commonIds.map(id=>base.find(c=>c.id===id)):neutral;
const results=[];
for(const def of targets)for(const opponent of [...ICON_ROLES.filter(d=>d.cardId!==def.cardId),...furIds.map(id=>({cardId:id,name:live.cards.find(c=>c.id===id).title}))]){
 const partner=ICON_ROLES.find(d=>d.cardId!==def.cardId&&d.cardId!==opponent.cardId);
 for(const equipment of [0,5000000])for(const slot of [0,4])for(const variant of ['before','after']){
  const base=prepared[variant].PVP,control=prepared[variant].PVP;
  const deck=(c,p)=>{const rows=[p,...common(control)];rows.splice(slot,0,c);return rows;};
  const a=deck(base.find(c=>c.id===def.cardId),base.find(c=>c.id===partner.cardId)),b=deck(control.find(c=>c.id===opponent.cardId),control.find(c=>c.id===partner.cardId));
  const rows=[];for(let i=1;i<=seedCount;i++)for(const flip of [false,true]){
   const result=createPvpBattleV2({attackerCards:flip?b:a,defenderCards:flip?a:b,attackerEquipmentBonus:equipment,defenderEquipmentBonus:equipment,singleHealerBonus:live.battle.engine.singleHealerBonus,seed:seed(i)}).result;
   rows.push(metrics(result,flip?'B':'A',def.cardId));
  }
  results.push({kind:furIds.includes(opponent.cardId)?'PVP_FUR':'PVP_ICON',target:def.name,opponent:opponent.name,variant,equipment,slot,...aggregate(rows)});
 }
}
for(const def of targets)for(const equipment of [0,5000000])for(const slot of [0,4])for(const power of [1000000,4000000,10000000])for(const variant of ['before','after']){
 const base=prepared[variant].PVE,rows=[],deck=[base.find(c=>c.id==='CN-1C000002'),...common(base)];deck.splice(slot,0,base.find(c=>c.id===def.cardId));
 for(let i=1;i<=seedCount;i++){
  const result=createPveBattleV2({cards:deck,characterBonus:equipment,singleHealerBonus:live.battle.engine.singleHealerBonus,monster:{id:'same-boss',name:'고정 비교 보스',power,is_boss:1},seed:seed(i)}).result;
  rows.push(metrics(result,'A',def.cardId));
 }
 results.push({kind:'PVE',target:def.name,variant,equipment,slot,power,...aggregate(rows)});
}
const summary=targets.flatMap(def=>['PVP_ICON','PVP_FUR','PVE'].map(kind=>({target:def.name,kind,before:aggregate(results.filter(r=>r.target===def.name&&r.kind===kind&&r.variant==='before')),after:aggregate(results.filter(r=>r.target===def.name&&r.kind===kind&&r.variant==='after'))})));
const pair=[];
for(const variant of ['before','after'])for(const equipment of [0,5000000])for(const reverse of [false,true])for(const enemyIds of [['CN-1C000001','CN-1C000002'],['CN-1C000003','CN-1C000005'],furIds]){
 const base=prepared[variant].PVP,ownIds=targets.map(d=>d.cardId);if(reverse)ownIds.reverse();
 const a=[...ownIds.map(id=>base.find(c=>c.id===id)),...common(base)],b=[...enemyIds.map(id=>base.find(c=>c.id===id)),...common(base)],rows=[];
 for(let i=1;i<=seedCount;i++)for(const flip of [false,true]){
  const result=createPvpBattleV2({attackerCards:flip?b:a,defenderCards:flip?a:b,attackerEquipmentBonus:equipment,defenderEquipmentBonus:equipment,singleHealerBonus:live.battle.engine.singleHealerBonus,seed:seed(i)}).result;
  const side=flip?'B':'A',support=metrics(result,side,'CN-1C000004'),guardian=metrics(result,side,'CN-1C000006');
  rows.push({...support,guard:guardian.guard,ward:guardian.ward,storedDamage:guardian.storedDamage,casts:support.casts+guardian.casts});
 }
 pair.push({variant,equipment,reverse,enemyIds,...aggregate(rows)});
}
const pairSummary=Object.fromEntries(['before','after'].map(v=>[v,aggregate(pair.filter(r=>r.variant===v))]));
const report={checkedAt:new Date().toISOString(),sourceCheckedAt:live.checkedAt,method:'Real cardUniqueDeckStates and battle engine; fixed seeds and equal equipment/common teammates; before/after settings applied to both teams; two ICON limit; PVP sides reversed, target in slot 1/5; no account mutations. Diagnostic sample, not a live win-rate forecast.',teammateMode,commonTeammates:common(prepared.before.PVP).map(c=>({id:c.id,name:c.title||c.id,grade:c.grade})),seedCount,documents,summary,pairSummary,results,pair,battles:[...results,...pair].reduce((n,r)=>n+r.battles,0),elapsedMs:Math.round(performance.now()-start)};
fs.writeFileSync(new URL(teammateMode==='fur15'?'balance-report-fur15.json':'balance-report.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({battles:report.battles,elapsedMs:report.elapsedMs,teammateMode,summary:summary.map(r=>({target:r.target,kind:r.kind,beforeWin:r.before.winPercent,afterWin:r.after.winPercent,beforeHeal:r.before.averageHealing,afterHeal:r.after.averageHealing,beforeGuard:r.before.averageGuard,afterGuard:r.after.averageGuard})),pair:{before:pairSummary.before.winPercent,after:pairSummary.after.winPercent}},null,2));
