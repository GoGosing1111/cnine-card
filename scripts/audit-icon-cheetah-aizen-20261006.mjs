// Read-only local audit: production catalog snapshot -> authoritative preparation/engine.
// No production credentials, account data, writes or reward requests are used here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {ICON_ROLES,defaultIconRoles} from '../shared/icon-roles-v1.mjs';
import {ICON_SUPREMACY} from '../shared/icon-supremacy-v1.mjs';
import {fur15ReferenceCards} from '../functions/_icon_fur_reference.js';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {iconFurFixture,canonicalPower} from '../tests/helpers/icon-fur15-fixture.mjs';

const [input,output]=process.argv.slice(2);
assert.ok(input&&output,'Usage: node scripts/audit-icon-cheetah-aizen-20261006.mjs <snapshot.json> <report.json>');
const live=JSON.parse(fs.readFileSync(input)),start=performance.now();
assert.equal(live.battle.engine.mode,'V2_PUBLIC');
assert.deepEqual(live.publicRoles.balance,ICON_SUPREMACY);
assert.deepEqual(live.publicRoles.document,live.iconSettings?.document||defaultIconRoles());
assert.equal(live.uniqueSettings.enabled,true);
assert.equal(live.advancementSettings.mode,'ON');
const targetIds=['CN-5D0E2E4D58C9416F','CN-47AD4B47B6A7452C'];
const modes=['PVP','PVE'],statKeys=['maxHp','attack','defense','speed'];
const gearValues=[0,5000000],seedCount=32;
const seed=i=>(Math.imul(i,2654435761)+610006)>>>0;
const common=[{id:'audit-common-superstar',grade:'SUPERSTAR',power:93200},{id:'audit-common-zenith-1',grade:'ZENITH',power:75625},{id:'audit-common-zenith-2',grade:'ZENITH',power:75625},{id:'audit-common-ssr',grade:'SSR',power:30000}];
const fixture=iconFurFixture({rows:live.cards,battle:live.battle,high:live.high});
fixture.save('card_unique_effect_settings_v1',live.uniqueSettings);
fixture.save('card_unique_advancement_settings_v1937_release',live.advancementSettings);
fixture.save('icon_role_settings_v1',{revision:live.publicRoles.revision,document:live.publicRoles.document,audit:[]});
// Preserve actual effect metadata rather than silently replacing it with defaults.
for(const row of live.cards)fixture.db.prepare('UPDATE card_unique_effects SET effect_name=?,effect_description=?,effect_type=?,trigger_type=?,effect_value=?,trigger_chance=?,max_activations=? WHERE card_id=?').run(row.effect_name||'',row.effect_description||'',row.effect_type||'NONE',row.trigger_type||'PASSIVE',Number(row.effect_value)||0,Number(row.trigger_chance??100),Number(row.max_activations)||1,row.id);
const prepared={},stats={};
try {
  assert.deepEqual(fur15ReferenceCards(live.cards,live.battle,live.high).map(c=>c.power),await canonicalPower(live.cards,live.battle,live.high));
  for(const mode of modes){
    const furBase=fur15ReferenceCards(live.cards,live.battle,live.high,mode).map(({uniqueAbility,uniqueAdvancement,...card})=>card);
    const iconBase=ICON_ROLES.map(def=>{
      const catalog=live.icons.find(c=>c.id===def.cardId);assert.ok(catalog,def.name+' catalog');
      return {id:catalog.id,title:catalog.title,grade:'ICON',power:Number(catalog.base_power)};
    });
    const bases=[furBase,...iconBase.map(card=>[card])];
    const states=await cardUniqueDeckStates(fixture.env,bases.map(cards=>({user:{id:1,role:'USER'},cards})),mode,{fresh:true,batched:true});
    // Match the real ranked/PVE adapter: raw card power plus server-owned snapshots.
    const cards=bases.flatMap((base,i)=>base.map(card=>{
      const server=states[i].cards.find(c=>c.id===card.id);assert.ok(server);
      return {...card,uniqueAbility:server.uniqueAbility||null,uniqueAdvancement:server.uniqueAdvancement||null,iconRole:server.iconRole||null};
    }));
    const icons=cards.filter(c=>c.grade==='ICON'),furs=cards.filter(c=>c.grade==='FUR');
    assert.ok(icons.every(c=>c.iconRole?.supremacy?.cardCount===live.cards.length));
    prepared[mode]={icons,furs,targets:targetIds.map(id=>{const card=furs.find(c=>c.id===id);assert.ok(card);return card;})};
    stats[mode]={icons:[],targets:[]};
    for(const card of [...icons,...prepared[mode].targets]){
      const f=buildFighter(card,0,'A',card.uniqueAbility,mode);
      stats[mode][card.grade==='ICON'?'icons':'targets'].push({id:card.id,name:card.title,role:f.iconRoleLabel||f.typeLabel,collectionPower:card.power,battlePower:f.power,advancement:card.uniqueAdvancement?.classCode||null,unique:card.uniqueAbility,stats:Object.fromEntries([...statKeys,'shield','gauge'].map(k=>[k,f[k]]))});
    }
    // The guaranteed floor is per card at equal allocated equipment, before external buffs.
    for(const equipmentShare of [0,100000,1000000,5000000])for(const card of icons){
      const a=buildFighter({...card,equipmentShare,effectivePower:card.power+equipmentShare},0,'A',null,mode);
      for(const fur of furs){
        const b=buildFighter({...fur,equipmentShare,effectivePower:fur.power+equipmentShare},0,'B',fur.uniqueAbility,mode);
        for(const key of statKeys)assert.ok(a[key]>=Math.ceil(b[key]*ICON_SUPREMACY.margin),card.title+' floor '+fur.title+' '+mode+' '+key);
      }
    }
  }
  assert.ok(fixture.queries.every(q=>/^\s*SELECT /i.test(q)),'server preparation must be read only');
} finally {fixture.close();}

let battles=0;
const singleHealerBonus=live.battle.engine.singleHealerBonus;
const percent=(wins,total)=>Math.round(wins/total*10000)/100;
function contest(a,b,equipment){
  let wins=0,actions=0,skillBattles=0;
  const losses=[];
  for(let i=1;i<=seedCount;i++)for(const flip of [false,true]){
    const result=createPvpBattleV2({attackerCards:flip?b:a,defenderCards:flip?a:b,attackerEquipmentBonus:equipment,defenderEquipmentBonus:equipment,singleHealerBonus,seed:seed(i)}).result;
    battles++;const won=result.winner===(flip?'B':'A');wins+=won;actions+=result.actions;
    if(!won)losses.push({seed:seed(i),iconSide:flip?'B':'A',winner:result.winner});
    skillBattles+=result.timeline.some(e=>e.type==='ICON_SKILL');
    assert.ok(result.timeline.every(e=>e.damage==null||Number.isFinite(e.damage)));
  }
  return {wins,total:seedCount*2,percent:percent(wins,seedCount*2),averageActions:Math.round(actions/(seedCount*2)*100)/100,skillBattles,losses};
}
const single=[],teams=[],pairs=[];
for(const card of prepared.PVP.icons)for(const opponent of prepared.PVP.targets)for(const equipment of gearValues){
  single.push({icon:card.title,opponent:opponent.title,equipment,...contest([card],[opponent],equipment)});
  for(const slot of [0,4]){
    const deck=c=>{const cards=[...common];cards.splice(slot,0,c);return cards;};
    teams.push({icon:card.title,opponent:opponent.title,equipment,slot,...contest(deck(card),deck(opponent),equipment)});
  }
}
for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)for(const equipment of gearValues)for(const reverse of [false,true]){
  const duo=[prepared.PVP.icons[i],prepared.PVP.icons[j]],opponents=[...prepared.PVP.targets];
  if(reverse){duo.reverse();opponents.reverse();}
  pairs.push({icons:duo.map(c=>c.title),opponents:opponents.map(c=>c.title),equipment,...contest([...duo,...common.slice(0,3)],[...opponents,...common.slice(0,3)],equipment)});
}
const pve=[];
for(const card of [...prepared.PVE.icons,...prepared.PVE.targets])for(const equipment of gearValues)for(const bossPower of [1000000,4000000,10000000]){
  let wins=0,damage=0,actions=0,skillBattles=0;
  for(let i=1;i<=seedCount;i++){
    const x=createPveBattleV2({cards:[card,...common],characterBonus:equipment,singleHealerBonus,monster:{id:'audit-boss',name:'동일 조건 비교 보스',power:bossPower,is_boss:1},seed:seed(i)}).result;
    battles++;wins+=x.winner==='A';actions+=x.actions;
    damage+=(x.final.B||[]).reduce((s,f)=>s+Math.max(0,f.maxHp-f.hp),0);
    skillBattles+=x.timeline.some(e=>e.type==='ICON_SKILL');
    assert.ok(x.timeline.every(e=>e.damage==null||Number.isFinite(e.damage)));
  }
  pve.push({card:card.title,grade:card.grade,equipment,bossPower,wins,total:seedCount,percent:percent(wins,seedCount),averageDamage:Math.round(damage/seedCount),averageActions:Math.round(actions/seedCount*100)/100,skillBattles});
}
const aggregate=rows=>{const wins=rows.reduce((s,r)=>s+r.wins,0),total=rows.reduce((s,r)=>s+r.total,0);return {wins,total,percent:percent(wins,total),worstScenario:Math.min(...rows.map(r=>r.percent))};};
const summary={single:aggregate(single),teams:aggregate(teams),pairs:aggregate(pairs),byIcon:prepared.PVP.icons.map(c=>({name:c.title,single:aggregate(single.filter(r=>r.icon===c.title)),teams:aggregate(teams.filter(r=>r.icon===c.title))})),pve:prepared.PVE.icons.map(c=>({name:c.title,...aggregate(pve.filter(r=>r.card===c.title))})),pveFur:prepared.PVE.targets.map(c=>({name:c.title,...aggregate(pve.filter(r=>r.card===c.title))}))};
const report={checkedAt:new Date().toISOString(),sourceCheckedAt:live.checkedAt,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),policy:{comparison:'All seven ICONs vs Cheetah and Aizen FUR +15, fully advanced, actual live role tuning, equal total equipment, swapped attacker/defender; real server preparation and battle engine.',statFloor:'20% above all 20 FUR +15 starting stats at equal allocated equipment before external buffs; not a universal win guarantee.',commonTeammates:'Identical synthetic neutral reference teammates to isolate the compared slots; not specific player accounts.',magicMercenaryAvatarSynergy:'Absent on both sides in the controlled comparison.',seedCount,seeds:'(imul(i,2654435761)+610006)>>>0, i=1..32',gearValues,teamSlots:[0,4],pairFormations:'All 21 ICON pairs; reversed pair positions on both sides; identical three remaining cards',pve:'Same 5-card reference team, same 3 bosses, same equipment and seeds, only first card replaced',dbWrites:0},common,stats,single,teams,pairs,pve,summary,battles,elapsedMs:Math.round(performance.now()-start)};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles,elapsedMs:report.elapsedMs,summary},null,2));
