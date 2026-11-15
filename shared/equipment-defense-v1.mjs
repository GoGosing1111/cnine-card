import {ASCENDANT_EQUIPMENT,ASCENDANT_EQUIPMENT_SETS} from './mercenary-ascendant-equipment-v1.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT} from './mercenary-unique-equipment-v1.mjs';
import {EQUIPMENT_SET_PARTS} from './equipment-set-visual-v1.mjs';

// PvE only. The extra guard reaches direct/percentage boss attacks as well as
// basic attacks, without replacing the existing PvE armor curve or PvP rules.
export const EQUIPMENT_DEFENSE_VERSION='20261115-v2';
const policy=(id,name,tier,required,perPiece,complete)=>Object.freeze({id,name,tier,required,modes:['PVE'],perPiece:Object.freeze(perPiece),complete:Object.freeze(complete)});
export const EQUIPMENT_DEFENSE_SETS=Object.freeze([
 policy('ARDEN','아르덴',0,4,{defensePercent:25,pveGuardPercent:5},{defensePercent:100,pveGuardPercent:40}),
 ...ASCENDANT_EQUIPMENT_SETS.map(s=>policy(s.setId,s.name,s.tier,5,{defensePercent:5,pveGuardPercent:2},{defensePercent:25+s.tier*15,pveGuardPercent:10+s.tier*4})),
 ...[1,2,3].map(t=>policy('MERC_UNIQUE_'+t,UNIQUE_MERCENARY_EQUIPMENT.find(i=>i.tier===t).family,t,5,{defensePercent:20+t*10,pveGuardPercent:4+t},{defensePercent:[200,250,350][t-1],pveGuardPercent:[40,42,45][t-1]}))
]);
const byId=new Map(EQUIPMENT_DEFENSE_SETS.map(s=>[s.id,s]));
const byCode=new Map([
 ...Object.entries(EQUIPMENT_SET_PARTS.ARDEN).map(([slot,code])=>[code,{slot,set:byId.get('ARDEN')}]),
 ...ASCENDANT_EQUIPMENT.map(i=>[i.code,{slot:i.slot,set:byId.get(i.setId)}]),
 ...UNIQUE_MERCENARY_EQUIPMENT.map(i=>[i.code,{slot:i.slot,set:byId.get('MERC_UNIQUE_'+i.tier)}])
]);
export const equipmentDefenseDefinition=code=>byCode.get(code)?.set??null;
export function equipmentDefenseFromRows(rows=[],mode='PVE'){
 const effects={},sets=[];
 if(mode!=='PVE'||!Array.isArray(rows))return {effects,sets};
 const slots=new Map(),instances=new Map(),invalidInstances=new Set();
 for(const row of rows){
  const def=byCode.get(row?.code);if(!def||def.slot!==row.slot)continue;
  const id=row.instanceId??row.instance_id??row.id;
  if(id!=null){const key=String(id);if(instances.has(key)&&instances.get(key)!==row.slot)invalidInstances.add(key);instances.set(key,row.slot);}
  const previous=slots.get(row.slot);
  slots.set(row.slot,previous===undefined||previous?.code===row.code&&String(previous.id)===String(id)?{code:row.code,id,def}:null);
 }
 const counts=new Map();
 for(const item of slots.values())if(item&&!invalidInstances.has(String(item.id)))counts.set(item.def.set,(counts.get(item.def.set)||0)+1);
 for(const [set,count]of counts){
  const complete=count===set.required,values={};
  for(const key of ['defensePercent','pveGuardPercent']){values[key]=set.perPiece[key]*count+(complete?set.complete[key]:0);effects[key]=(effects[key]||0)+values[key];}
  sets.push({...set,count,active:complete,effects:values});
 }
 return {effects,sets};
}
// Independent character and personal mercenary protection multiply; never add
// two damage reductions into immunity. Call only once per canonical damage packet.
export function combinePveGuard(a=0,b=0){
 const bounded=x=>Number.isFinite(Number(x))?Math.max(0,Math.min(95,Number(x))):0;
 return Math.round((100-(100-bounded(a))*(100-bounded(b))/100)*10000)/10000;
}
export function equipmentGuardMultiplier(target){
 if(target.battleMode!=='PVE'||target.isMonster||target.isBattleSuit)return 1;
 const value=Number(target.equipmentEffects?.pveGuardPercent)||0;
 return 1-Math.max(0,Math.min(95,Number.isFinite(value)?value:0))/100;
}
