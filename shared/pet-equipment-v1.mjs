import {isPetCode} from './companion-loadout-v2.mjs';
export const PET_EQUIPMENT_RULES=Object.freeze({slots:1,regularCardSlot:false,mercenarySlot:false,combatActor:false,phase:'BATTLE_START',frequency:'ONCE_PER_BATTLE'});
export const petReviewKey=ownerId=>{
  if(!Number.isSafeInteger(Number(ownerId))||Number(ownerId)<=0)throw Error('OWNER 계정을 확인해 주세요.');
  return `pet_equipment_review_v1:${Number(ownerId)}`;
};
export function validatePetEquipmentSave(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='expectedRevision,petCmsRevision,petCode,requestId'||
    !Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0||raw.expectedRevision>=2147483646||!Number.isSafeInteger(raw.petCmsRevision)||raw.petCmsRevision<0||
    typeof raw.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(raw.requestId)||raw.petCode!==null&&!isPetCode(raw.petCode))throw Error('장착할 펫과 현재 저장 버전을 확인해 주세요.');
  return {petCode:raw.petCode,expectedRevision:raw.expectedRevision,petCmsRevision:raw.petCmsRevision,requestId:raw.requestId};
}
export function validateOwnedPetSelection(petCode,{catalog=[],ownedCodes=[]}={}){
  if(petCode===null)return;
  if(!catalog.some(row=>row.code===petCode))throw Error('등록된 펫을 선택해 주세요.');
  if(!ownedCodes.includes(petCode))throw Error('보유한 펫만 장착할 수 있습니다.');
}
