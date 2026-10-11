import {REGION_EQUIPMENT,REGION_EQUIPMENT_SLOTS,regionalEquipment} from './legion-regions-v1.mjs';

export const MERCENARY_EQUIPMENT_SLOTS=REGION_EQUIPMENT_SLOTS;
export const MERCENARY_EQUIPMENT_CODES=REGION_EQUIPMENT.map(item=>item.code);
// Compile-time catalog identifiers only; never interpolate request values here.
export const MERCENARY_EQUIPMENT_SQL_CODES=MERCENARY_EQUIPMENT_CODES.map(code=>`'${code}'`).join(',');
export const isMercenaryEquipment=code=>Boolean(regionalEquipment(code));
export const mercenaryEquipmentImage=code=>{
  return regionalEquipment(code)?.image||null;
};
export function mercenaryEquipmentPower(snapshot,mode=snapshot?.equipment?.mode){
  const equipment=snapshot?.equipment;
  if(!equipment||equipment.schemaVersion!==1||equipment.mode!==mode)return 0;
  const power=equipment.power;
  return Number.isSafeInteger(power)&&power>=0&&power<=100000000?power:0;
}
