import {isPetCode} from './companion-loadout-v2.mjs';

export const PET_CMS_KEY='pet_cms_preparation_v1';
export const PET_CMS_MAX_BYTES=131072;
export const PET_CMS_LOCKS=Object.freeze({visibility:'LIVE',battleEnabled:true,acquisitionEnabled:false});
export const PET_BUFF_TYPES=Object.freeze({ATTACK_PERCENT:'공격력 증가',DEFENSE_PERCENT:'방어력 증가',MAX_HP_PERCENT:'최대 HP 증가',SPEED_PERCENT:'속도 증가',START_SHIELD_PERCENT:'시작 보호막'});
export const PET_BUFF_TARGETS=Object.freeze({REGULAR_CARDS:'일반 카드',MERCENARIES:'용병',ALL_ALLIES:'카드 + 용병'});
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,list)=>plain(value)&&Object.keys(value).sort().join(',')===list.split(',').sort().join(',');
export const isPetSpritePath=value=>typeof value==='string'&&/^\/?assets\/[A-Za-z0-9_./-]+\.(?:png|webp)$/i.test(value)&&!value.includes('..');
export function emptyPetCmsDocument(){return {version:1,...PET_CMS_LOCKS,pets:[]};}
export function emptyPetDraft(code='PET-001'){return {code,name:'새 펫',sourceArt:'',battleSprite:'',enabled:false,modes:['PVE','PVP'],target:'ALL_ALLIES',buffs:[{type:'ATTACK_PERCENT',percent:null}],notes:''};}
export function validatePetDefinition(raw){
  if(raw&&Object.hasOwn(raw,'liveEnabled')){
    if(typeof raw.liveEnabled!=='boolean')throw Error('펫 실전 사용 여부를 확인해 주세요.');
    const {liveEnabled,...definition}=raw;return {...validatePetDefinition(definition),liveEnabled};
  }
  if(!(keys(raw,'code,name,battleSprite,enabled,modes,target,buffs,notes')||keys(raw,'code,name,sourceArt,battleSprite,enabled,modes,target,buffs,notes'))||!isPetCode(raw.code)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>40)throw Error('펫 코드와 이름을 확인해 주세요.');
  if(raw.sourceArt!==undefined&&(typeof raw.sourceArt!=='string'||raw.sourceArt!==''&&!isPetSpritePath(raw.sourceArt)))throw Error('일러스트는 assets 폴더의 PNG 또는 WebP 경로로 등록해 주세요.');
  if(typeof raw.battleSprite!=='string'||raw.battleSprite!==''&&!isPetSpritePath(raw.battleSprite))throw Error('SD는 assets 폴더의 PNG 또는 WebP 경로로 등록해 주세요.');
  if(typeof raw.enabled!=='boolean'||!Object.hasOwn(PET_BUFF_TARGETS,raw.target)||!Array.isArray(raw.modes)||raw.modes.length<1||raw.modes.length>2||new Set(raw.modes).size!==raw.modes.length||raw.modes.some(mode=>!['PVE','PVP'].includes(mode)))throw Error('펫 시연 여부·대상·전투 모드를 확인해 주세요.');
  if(!Array.isArray(raw.buffs)||raw.buffs.length<1||raw.buffs.length>5||new Set(raw.buffs.map(buff=>buff?.type)).size!==raw.buffs.length)throw Error('서로 다른 버프를 1~5개 설정해 주세요.');
  const buffs=raw.buffs.map(buff=>{
    if(!keys(buff,'type,percent')||!Object.hasOwn(PET_BUFF_TYPES,buff.type)||buff.percent!==null&&(!Number.isFinite(buff.percent)||buff.percent<0||buff.percent>1000))throw Error('버프 수치는 미정 또는 0~1000% 이내 숫자여야 합니다.');
    return {type:buff.type,percent:buff.percent};
  });
  if(typeof raw.notes!=='string'||raw.notes.length>1200)throw Error('운영 메모는 1,200자 이내로 입력해 주세요.');
  return {code:raw.code,name:raw.name.trim(),...(raw.sourceArt!==undefined?{sourceArt:raw.sourceArt.replace(/^\//,'')}:{}),battleSprite:raw.battleSprite.replace(/^\//,''),enabled:raw.enabled,modes:['PVE','PVP'].filter(mode=>raw.modes.includes(mode)),target:raw.target,buffs,notes:raw.notes};
}
export function validatePetCmsDocument(raw,{allowLegacy=false}={}){
  if(!keys(raw,'version,visibility,battleEnabled,acquisitionEnabled,pets')||raw.version!==1||!Array.isArray(raw.pets)||raw.pets.length>100)throw Error('펫 CMS 문서 형식을 확인해 주세요.');
  const legacy=allowLegacy&&raw.visibility==='CMS_ONLY'&&raw.battleEnabled===false&&raw.acquisitionEnabled===false;
  for(const [key,value]of Object.entries(PET_CMS_LOCKS))if(!legacy&&raw[key]!==value)throw Error('펫 운영 설정이 변경됐습니다. CMS를 새로고침해 주세요.');
  const pets=raw.pets.map(validatePetDefinition);
  if(new Set(pets.map(pet=>pet.code)).size!==pets.length)throw Error('중복된 펫 코드가 있습니다.');
  return {...emptyPetCmsDocument(),pets};
}
export function petReadiness(raw,mode='PVE'){
  const pet=validatePetDefinition(raw),reasons=[];
  if(!pet.enabled)reasons.push('시연 사용을 켜 주세요.');
  if(!pet.battleSprite)reasons.push('전투 SD를 등록해 주세요.');
  if(!pet.modes.includes(mode))reasons.push('해당 전투 모드를 설정해 주세요.');
  if(pet.buffs.some(buff=>buff.percent===null))reasons.push('버프 수치를 설정해 주세요.');
  return {ok:reasons.length===0,reasons,pet};
}
export function validatePetCmsSave(raw){
  if(!keys(raw,'document,expectedRevision,requestId')||!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0||raw.expectedRevision>=2147483646||typeof raw.requestId!=='string'||!/^[A-Za-z0-9-]{16,100}$/.test(raw.requestId))throw Error('저장 요청 ID와 현재 버전을 확인해 주세요.');
  return {document:validatePetCmsDocument(raw.document),expectedRevision:raw.expectedRevision,requestId:raw.requestId};
}
