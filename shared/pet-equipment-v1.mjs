import {isPetCode} from './companion-loadout-v2.mjs';
export const PET_EQUIPMENT_RULES=Object.freeze({slots:1,regularCardSlot:false,mercenarySlot:false,combatActor:false,phase:'BATTLE_START',frequency:'ONCE_PER_BATTLE'});
export const PET_LOADOUT_MODES=Object.freeze(['PVE','PVP']);

// A single-slot save predates mode selection. Both modes inherit it until the
// first explicit edit stores both slots atomically, including an empty slot.
export function petSlotForMode(state,mode){
  if(!PET_LOADOUT_MODES.includes(mode))throw Error('PvE 또는 PvP 편성을 선택하세요.');
  if(mode==='PVP'&&state?.pvp)return state.pvp;
  return {petCode:state?.petCode??null,revision:state?.pveRevision??state?.revision??0};
}
export function validatePetLoadoutRecord(state){
  const validSlot=slot=>slot&&(slot.petCode===null||isPetCode(slot.petCode))&&Number.isSafeInteger(slot.revision)&&slot.revision>=0;
  if(!validSlot(state)||!Array.isArray(state.audit)||state.audit.length>50)throw Error('Invalid pet loadout');
  if(Object.hasOwn(state,'pvp')||Object.hasOwn(state,'pveRevision')){
    if(!validSlot(state.pvp)||!Number.isSafeInteger(state.pveRevision)||state.pveRevision<0||
      Math.max(state.pveRevision,state.pvp.revision)!==state.revision)throw Error('Invalid pet mode loadout');
  }
}
export const petReviewKey=ownerId=>{
  if(!Number.isSafeInteger(Number(ownerId))||Number(ownerId)<=0)throw Error('OWNER 계정을 확인해 주세요.');
  return `pet_equipment_review_v1:${Number(ownerId)}`;
};
export function validatePetEquipmentSave(raw){
  const hasMode=raw!=null&&Object.hasOwn(raw,'mode');
  const fields=hasMode?'expectedRevision,mode,petCmsRevision,petCode,requestId':'expectedRevision,petCmsRevision,petCode,requestId';
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!==fields||hasMode&&!PET_LOADOUT_MODES.includes(raw.mode)||
    !Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0||raw.expectedRevision>=2147483646||!Number.isSafeInteger(raw.petCmsRevision)||raw.petCmsRevision<0||
    typeof raw.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(raw.requestId)||raw.petCode!==null&&!isPetCode(raw.petCode))throw Error('장착할 펫과 현재 저장 버전을 확인해 주세요.');
  return {petCode:raw.petCode,expectedRevision:raw.expectedRevision,petCmsRevision:raw.petCmsRevision,requestId:raw.requestId,...(hasMode?{mode:raw.mode}:{})};
}
export function validateOwnedPetSelection(petCode,{catalog=[],ownedCodes=[]}={}){
  if(petCode===null)return;
  if(!catalog.some(row=>row.code===petCode))throw Error('등록된 펫을 선택해 주세요.');
  if(!ownedCodes.includes(petCode))throw Error('보유한 펫만 장착할 수 있습니다.');
}
