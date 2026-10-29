import {REGION_EQUIPMENT,REGION_EQUIPMENT_SLOTS,regionalEquipment} from './legion-regions-v1.mjs';
import {ASCENDANT_EQUIPMENT,ASCENDANT_EQUIPMENT_SETS,ascendantEquipment,ascendantEquipmentEffects,ascendantSet} from './mercenary-ascendant-equipment-v1.mjs';

export const MERCENARY_EQUIPMENT_SLOTS=REGION_EQUIPMENT_SLOTS;
export const MERCENARY_EQUIPMENT_CATALOG=Object.freeze([...REGION_EQUIPMENT,...ASCENDANT_EQUIPMENT]);
export const MERCENARY_EQUIPMENT_CODES=MERCENARY_EQUIPMENT_CATALOG.map(item=>item.code);
// Compile-time catalog identifiers only; never interpolate request values here.
export const MERCENARY_EQUIPMENT_SQL_CODES=MERCENARY_EQUIPMENT_CODES.map(code=>`'${code}'`).join(',');
export const mercenaryEquipmentDefinition=code=>regionalEquipment(code)||ascendantEquipment(code);
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
export function mercenaryPvpEquipmentEffects(equipment){
 if(equipment?.schemaVersion!==1||equipment.mode!=='PVP')return {};
 // Only the newly authorized set policy enters PVP; ordinary polish and old
 // region unique/set effects cannot leak through a copied effects payload.
 const codes=(equipment.items||[]).filter(item=>ascendantEquipment(item.code)?.slot===item.slot).map(item=>item.code);
 return ascendantEquipmentEffects(codes,'PVP').effects;
}
