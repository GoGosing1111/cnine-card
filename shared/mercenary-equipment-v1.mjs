import {REGION_EQUIPMENT,REGION_EQUIPMENT_SLOTS} from './legion-regions-v1.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT} from './mercenary-unique-equipment-v1.mjs';
import {ASCENDANT_EQUIPMENT,ASCENDANT_EQUIPMENT_SETS,ascendantEquipment,ascendantEquipmentEffects,ascendantSet} from './mercenary-ascendant-equipment-v1.mjs';
import {POLISH_EFFECT_KEYS} from './equipment-combat-growth-v1.mjs';

export const MERCENARY_EQUIPMENT_SLOTS=REGION_EQUIPMENT_SLOTS;
export const MERCENARY_EQUIPMENT_CATALOG=Object.freeze([...REGION_EQUIPMENT,...ASCENDANT_EQUIPMENT,...UNIQUE_MERCENARY_EQUIPMENT]);
export const MERCENARY_EQUIPMENT_CODES=MERCENARY_EQUIPMENT_CATALOG.map(item=>item.code);
// Compile-time catalog identifiers only; never interpolate request values here.
export const MERCENARY_EQUIPMENT_SQL_CODES=MERCENARY_EQUIPMENT_CODES.map(code=>`'${code}'`).join(',');
const definitions=new Map(MERCENARY_EQUIPMENT_CATALOG.map(gear=>[gear.code,gear]));
export const mercenaryEquipmentDefinition=code=>definitions.get(code)||null;
export const isMercenaryEquipment=code=>Boolean(mercenaryEquipmentDefinition(code));
export {ASCENDANT_EQUIPMENT_SETS,ascendantEquipmentEffects,ascendantSet};
export const mercenaryEquipmentImage=code=>{
  return mercenaryEquipmentDefinition(code)?.image||null;
};
export function mercenaryEquipmentPower(snapshot,mode=snapshot?.equipment?.mode){
  const equipment=snapshot?.equipment;
  if(!equipment||equipment.schemaVersion!==1||equipment.mode!==mode)return 0;
  const power=equipment.power;
  return Number.isSafeInteger(power)&&power>=0&&power<=100000000?power:0;
}
export function mercenaryEquipmentPolishEffects(equipment){
 if(equipment?.schemaVersion!==1||!['PVE','PVP'].includes(equipment.mode))return {};
 const effects={},instances=new Set(),slots=new Set();
 for(const item of equipment.items||[]){
  const s=item.polish;if(!s?.attempts)continue;
  if(definitions.get(item.code)?.slot!==item.slot||s.schemaVersion!==1||String(s.instanceId)!==String(item.instanceId)||
    !Number.isInteger(s.attempts)||s.attempts<1||s.attempts>100||
    !Array.isArray(s.levels)||s.levels.length!==5||s.levels.some(n=>!Number.isInteger(n)||n<0||n>100)||s.levels.reduce((a,b)=>a+b,0)!==s.attempts||
    !Array.isArray(s.values)||s.values.length!==5||s.values.some(n=>!Number.isFinite(n)||n<0||n>10000)||
    instances.has(String(item.instanceId))||slots.has(item.slot))return {};
  instances.add(String(item.instanceId));slots.add(item.slot);
  s.values.forEach((value,i)=>{if(value)effects[POLISH_EFFECT_KEYS[i]]=(effects[POLISH_EFFECT_KEYS[i]]||0)+value;});
 }
 return effects;
}
export function mercenaryPvpEquipmentEffects(equipment){
 if(equipment?.schemaVersion!==1||equipment.mode!=='PVP')return {};
 // Rebuild authorized bonuses from the selected mercenary's actual gear.
 // A copied combined effects payload cannot grant unrelated set bonuses.
 const codes=(equipment.items||[]).filter(item=>ascendantEquipment(item.code)?.slot===item.slot).map(item=>item.code);
 const effects=ascendantEquipmentEffects(codes,'PVP').effects;
 for(const [key,value] of Object.entries(mercenaryEquipmentPolishEffects(equipment)))effects[key]=(effects[key]||0)+value;
 return effects;
}
