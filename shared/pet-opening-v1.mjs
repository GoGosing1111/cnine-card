export const PET_SEAL='PET_SEAL_ORB',PET_ESSENCE='PET_ESSENCE';
export const PET_OPENING_KEY='pet_opening_settings_v1';
export const PET_ITEM_ART=Object.freeze({seal:'assets/items/pet-opening-v1/pet-seal-orb.webp',essence:'assets/items/pet-opening-v1/pet-essence.webp'});
export const defaultPetOpeningSettings=()=>({revision:0,enabled:false,essencePerOpen:10,maxBatch:100,pool:[]});
export function validatePetOpeningSettings(raw){
  const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  if(!raw||typeof raw.enabled!=='boolean'||!int(raw.revision,0,1e9)||!int(raw.essencePerOpen,1,1000000)||!int(raw.maxBatch,1,1000)||!Array.isArray(raw.pool)||raw.pool.length>100)
    throw Error('개봉 상태, 정수 소모량(1~1,000,000), 최대 개봉 수량(1~1,000)을 확인하세요.');
  const seen=new Set(),pool=raw.pool.map(row=>{
    if(!row||!/^PET-[A-Z0-9-]{1,28}$/.test(row.code)||seen.has(row.code)||!int(row.weight,1,1000000))throw Error('중복 없는 펫과 정수 가중치(1~1,000,000)를 입력하세요.');
    seen.add(row.code);return {code:row.code,weight:row.weight};
  });
  if(raw.enabled&&!pool.length)throw Error('개봉을 활성화하려면 획득 풀을 먼저 설정하세요.');
  return {revision:raw.revision,enabled:raw.enabled,essencePerOpen:raw.essencePerOpen,maxBatch:raw.maxBatch,pool};
}
export function petOpeningLimit(settings,balances){
  return Math.max(0,Math.min(settings.maxBatch,balances.seals,Math.floor(balances.essence/settings.essencePerOpen)));
}
