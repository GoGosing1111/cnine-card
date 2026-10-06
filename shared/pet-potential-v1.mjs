export const PET_POTENTIAL_POTION='PET_POTENTIAL_POTION';
export const PET_POTENTIAL_SETTINGS_KEY='pet_potential_settings_v1';
export const PET_POTENTIAL_ART='assets/items/pet-opening-v1/potential-potion.svg';
export const PET_MAGNET='MAGNET';
export const petCollectionKey=userId=>'pet_collection_v1:'+Number(userId);
export const petLoadoutKey=userId=>'pet_loadout_v1:'+Number(userId);
export const petPotentialKey=userId=>'pet_potentials_v1:'+Number(userId);
export function defaultPetPotentialSettings(){return {version:1,revision:0,enabled:false,successPpm:null};}
export function validatePetPotentialSettings(raw){
  if(!raw||Object.keys(raw).sort().join(',')!=='enabled,revision,successPpm,version'||raw.version!==1||!Number.isSafeInteger(raw.revision)||raw.revision<0||typeof raw.enabled!=='boolean'||
    raw.successPpm!==null&&(!Number.isSafeInteger(raw.successPpm)||raw.successPpm<0||raw.successPpm>1000000)||raw.enabled&&raw.successPpm===null)throw Error('성공확률을 0~100%로 설정한 뒤 잠재력 도전을 켜 주세요.');
  return {...raw};
}
