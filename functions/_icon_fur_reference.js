import {buildFighter} from './_battle_v2_preview.js';
import {UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS} from './_unique_advancement.js';
import {extendFurHighBreakthrough} from './_fur_enhancement_v2114.js';
import {ICON_SUPREMACY} from '../shared/icon-supremacy-v1.mjs';

const clamp=(v,lo,hi,fallback=0)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):fallback));
const statKeys={ATTACK:'attackPercent',DEFENSE:'defensePercent',SPEED:'speedPercent',HP:'hpPercent'};
const json=s=>{try{return JSON.parse(s||'{}')}catch{return {}}};
// Same persisted CMS fields, fallback and extended-step normalization as
// readBattleSettings/cardBattlePower. Parity is tested against those real helpers.
export function fur15ReferenceCards(rows,battle={},high={},scope='PVE'){
 const table=[0,1,2].map(i=>clamp(battle.highBreakthroughBonus?.FUR?.[i]??[1400,1900,2500][i],0,1000000));
 for(const step of extendFurHighBreakthrough({steps:[{},{},{}]},high).steps.slice(3))table.push(step.powerBonusPercent>0?step.powerBonusPercent:table.at(-1));
 const bonus=table[4]>0?table[4]:0;
 const savedBoost=high.steps?.[4]?.uniqueBoostPercent,previousBoost=Number(high.steps?.[2]?.uniqueBoostPercent);
 const boost=high.enabled===true?1+(savedBoost!=null&&Number.isFinite(Number(savedBoost))&&Number(savedBoost)>=0?Math.min(1000,Number(savedBoost)):previousBoost>0&&Number.isFinite(previousBoost)?Math.min(1000,previousBoost):100)/100:1;
 const scopeColumn=scope==='PVP'?'scope_pvp':scope==='CAPTAIN'?'scope_captain':'scope_pve';
 return rows.map(row=>{
  const base=Number(row.base_power)>0?Number(row.base_power):Math.max(0,Math.floor(Number(battle.powerByGrade?.FUR??3200)));
  const power=Math.floor(base*(1+bonus/100))+(String(row.id).toUpperCase()==='CN-0B48C6FF8F9B4AC5'?3000:0);
  const stats={};for(const [key,column,max] of [['attackPercent','attack_percent',500],['defensePercent','defense_percent',500],['hpPercent','hp_percent',500],['speedPercent','speed_percent',300]])stats[key]=Number((clamp(clamp(row[column],-90,max)*boost,-90,max)).toFixed(2));
  const active=Number(row.is_active)===1&&Number(row[scopeColumn])===1;
  // Determine the type before enhancement, exactly as card_unique_effects does.
  const raw=Object.fromEntries(Object.entries(statKeys).map(([type,key])=>[type,clamp(row[{attackPercent:'attack_percent',defensePercent:'defense_percent',hpPercent:'hp_percent',speedPercent:'speed_percent'}[key]],-90,key==='speedPercent'?300:500)]));
  const max=Math.max(...Object.values(raw)),type=active&&max>0?Object.keys(raw).find(k=>raw[k]===max):'NONE';
  const definition=Object.values(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS).find(d=>d.dominantType===type);
  return {id:String(row.id),title:row.title,grade:'FUR',power,breakthroughLevel:15,power_type:row.power_type||'NONE',
   uniqueAbility:active?{...stats,dominantType:type}:null,
   uniqueAdvancement:definition?{active:true,...definition,modifiers:{...definition.modifiers}}:null};
 });
}
export function buildIconFurReference(rows,battle,high,scope='PVE'){
 const cards=fur15ReferenceCards(rows,battle,high,scope);
 if(!cards.length)throw Error('ICON_FUR_REFERENCE_EMPTY');
 const result={version:ICON_SUPREMACY.version,power:Math.max(...cards.map(c=>c.power)),cardCount:cards.length};
 // Captain duels retain their separate attack/HP/percentage combat model.
 // Give that model the same grade hierarchy without replacing its rules.
 result.CAPTAIN={};
 for(const [key,stat,scaled] of [['attack','attackPercent',true],['maxHp','hpPercent',true],['defense','defensePercent',false],['speed','speedPercent',false]])result.CAPTAIN[key]={base:Math.max(...cards.map(c=>(scaled?c.power:100)*(1+Number(c.uniqueAbility?.[stat]||0)/100))),perPower:scaled?Math.max(...cards.map(c=>1+Number(c.uniqueAbility?.[stat]||0)/100)):0};
 for(const mode of ['PVE','PVP']){
  result[mode]={};const pairs=cards.map(c=>[buildFighter(c,0,'A',c.uniqueAbility,mode),buildFighter({...c,power:c.power+1000000},0,'A',c.uniqueAbility,mode)]);
  for(const key of ['maxHp','attack','defense','speed'])result[mode][key]={base:Math.max(...pairs.map(([f])=>f[key])),perPower:Math.max(...pairs.map(([f,g])=>(g[key]-f[key]+1)/1000000))};
 }
 return result;
}
export async function readIconFurReference(env,scope='PVE'){
 const [meta,catalog]=await Promise.all([
  env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('battle_settings_v1','fur_master_star_breakthrough_v1802')").all(),
  env.DB.prepare("SELECT c.id,c.title,c.power_type,c.base_power,e.attack_percent,e.defense_percent,e.hp_percent,e.speed_percent,e.scope_pve,e.scope_pvp,e.scope_captain,e.is_active FROM cards_effective_v1210 c LEFT JOIN card_unique_effects e ON e.card_id=c.id WHERE c.rarity='FUR'").all()
 ]);
 const settings=new Map((meta.results||[]).map(r=>[r.key,json(r.value)]));
 return buildIconFurReference(catalog.results||[],settings.get('battle_settings_v1'),settings.get('fur_master_star_breakthrough_v1802'),scope);
}
