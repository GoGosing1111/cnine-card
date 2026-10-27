import {validatePreparedMercenaries} from './companion-loadout-v2.mjs';
export const mercenaryLoadoutCodes=slot=>slot?.mercenaryCodes|| (slot?.mercenaryCode?[slot.mercenaryCode]:[]);
export function replaceMercenarySlot(slot,index,code,owned){
 if(!Number.isInteger(index)||index<0||index>1)throw Error('용병 슬롯을 확인하세요.');
 const codes=[...mercenaryLoadoutCodes(slot)];codes[index]=code;
 const selected=codes.filter(Boolean);validatePreparedMercenaries(selected.map(c=>owned.find(m=>m.code===c)));
 return selected;
}
