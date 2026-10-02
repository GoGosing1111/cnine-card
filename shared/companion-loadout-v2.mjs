import {isMercenaryRank} from './mercenary-ranks-v1.mjs';

export const COMPANION_PREPARATION_REVIEW = '__companionPreparationReviewV2';
export const COMPANION_RELEASE = Object.freeze({dualMercenaries:false,pets:false,petAcquisition:false});
export const COMPANION_FORMATION_RULES = Object.freeze({version:2,regularCardSlots:5,mercenarySlots:2,petSlots:1,maxCombatUnits:7,uniqueMercenaryRanks:true,petCombatActor:false});
const mercenaryCode = value => typeof value === 'string' && /^V-\d{3}$/.test(value.trim().toUpperCase()) ? value.trim().toUpperCase() : null;
export const isPetCode = value => typeof value === 'string' && /^PET-[A-Z0-9-]{1,28}$/.test(value);

export function validatePreparedMercenaries(rows) {
  if(!Array.isArray(rows)||rows.length>2)throw Error('용병은 최대 2명까지 편성할 수 있습니다.');
  const codes=new Set(),ranks=new Set();
  for(const row of rows){
    if(!row||mercenaryCode(row.code)!==row.code||!isMercenaryRank(row.rank))throw Error('용병 코드와 확정된 등급을 확인해 주세요.');
    if(codes.has(row.code))throw Error('같은 용병을 중복 배치할 수 없습니다.');
    if(ranks.has(row.rank))throw Error('같은 등급의 용병은 함께 배치할 수 없습니다.');
    codes.add(row.code);ranks.add(row.rank);
  }
  return rows;
}

// Catalog ranks and ownership come from the server, never the submitted loadout.
export function validateCompanionLoadout(input={}, {mercenaries=[],pets=[],ownedMercenaryCodes=[],ownedPetCodes=[],review=false}={}) {
  const errors=[];
  const object=input&&typeof input==='object'&&!Array.isArray(input);
  if(!object||Object.keys(input).some(key=>!['cardIds','mercenaryCodes','petCode'].includes(key)))errors.push('편성 요청 형식을 확인해 주세요.');
  const cardIds=Array.isArray(input?.cardIds)?input.cardIds.map(value=>typeof value==='string'||Number.isSafeInteger(value)?String(value).trim():''):[];
  if(cardIds.length!==5||cardIds.some(id=>!id))errors.push('일반 카드는 정확히 5장이어야 합니다.');
  if(new Set(cardIds).size!==cardIds.length)errors.push('일반 카드를 중복 배치할 수 없습니다.');
  if(cardIds.some(id=>/^V-\d{3}$/i.test(id)||/^PET-/i.test(id)))errors.push('용병과 펫은 일반 카드 슬롯에 배치할 수 없습니다.');
  const supplied=input?.mercenaryCodes;
  if(!Array.isArray(supplied)||supplied.length>2)errors.push('용병 전용 슬롯은 최대 2개입니다.');
  const codes=(Array.isArray(supplied)?supplied:[]).filter(value=>value!==null&&value!=='').map(value=>mercenaryCode(value));
  if(codes.some(code=>!code))errors.push('용병 코드는 V-000 형식이어야 합니다.');
  const rows=codes.map(code=>mercenaries.find(row=>row.code===code));
  if(rows.some(row=>!row))errors.push('등록된 용병만 배치할 수 있습니다.');
  else try{validatePreparedMercenaries(rows);}catch(error){errors.push(error.message);}
  if(!review&&codes.some(code=>!ownedMercenaryCodes.includes(code)))errors.push('보유한 용병만 배치할 수 있습니다.');
  const petCode=input?.petCode===null||input?.petCode===undefined||input?.petCode===''?null:input.petCode;
  const pet=petCode===null?null:pets.find(row=>row.code===petCode);
  if(petCode!==null&&(!isPetCode(petCode)||!pet))errors.push('등록된 펫을 선택해 주세요.');
  if(!review&&petCode!==null&&!ownedPetCodes.includes(petCode))errors.push('보유한 펫만 배치할 수 있습니다.');
  return {ok:errors.length===0,errors,loadout:{cardIds,mercenaryCodes:codes.filter(Boolean),petCode},
    regularCardCount:cardIds.length,mercenaryCount:codes.length,combatUnitCount:cardIds.length+codes.length,
    mercenaries:rows.filter(Boolean),pet};
}

export function preparedFormation(loadout) {
  return {cards:loadout.cardIds.map((cardId,index)=>({slotIndex:index+1,cardId})),
    mercenaries:loadout.mercenaryCodes.map((code,index)=>({slotIndex:index+6,code})),
    pet:loadout.petCode?{code:loadout.petCode,slotType:'OPENING_SUPPORT',occupiesCombatSlot:false}:null};
}

// Migration preview only: this does not write or truncate the old saved deck.
export function legacyCompanionLoadout({cardIds=[],mercenaryCode:code=null}={}) {
  return {cardIds:[...cardIds],mercenaryCodes:code?[code]:[],petCode:null};
}
