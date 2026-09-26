import {CRYVERN_CODE,CRYVERN_BALANCE,cryvernSelectionWeights} from './mercenary-cryvern-v1.mjs';
// 2026-09-27: SSS registration, Cryvern rarity, motions and golden aura approved.
export const BERKAN_CODE='V-055',BERKAN_SKILL_ID='MS-055';
export const BERKAN_BALANCE=Object.freeze({...CRYVERN_BALANCE});
export const BERKAN_CAP_SCALE=1.3;
export const BERKAN_POSITION=Object.freeze({code:BERKAN_CODE,rank:'SSS',position:'REAR',role:'SNIPER',basicTarget:'FRONT_ENEMY',skillTarget:'BACK_THREAT',specialty:'후열 핵심을 겨누는 흑금 화살 · 제자리 원거리 사격',weakness:'회피·호위·보호막·방어에 대응되며 제압 상태에서는 발동하지 않음',rationale:'사용자 지정 SSS 궁수. 달리기 대신 조준·발사·반동을 분리한 동작.'});
export function berkanSelectionWeights(codes,weights={}){
 if(!codes.includes(BERKAN_CODE)||Object.hasOwn(weights,BERKAN_CODE))return cryvernSelectionWeights(codes,weights);
 if(!codes.includes(CRYVERN_CODE))throw Error('BERKAN_REQUIRES_CRYVERN_IN_SSS_POOL');
 const effective=cryvernSelectionWeights(codes.filter(c=>c!==BERKAN_CODE),weights),weight=effective[CRYVERN_CODE]??1;
 if(!Number.isSafeInteger(weight)||weight<1)throw Error('INVALID_CRYVERN_WEIGHT');
 return {...effective,[BERKAN_CODE]:weight};
}
export function createBerkanSkill(definition,art){
 return definition(BERKAN_SKILL_ID,'흑금 낙성','SNIPER','BACK_THREAT','LOCKED_THREAT_SHOT',
  '자원과 재사용 조건을 충족하면 적 후열 중 전투 시작 공격력이 가장 높은 적을 고정하고 현재 행동에서 사격합니다.',
  '흑금 장궁에 힘을 응축해 후열 핵심을 화살 한 발로 타격합니다. 후열이 없으면 전열 단일을 겨눕니다.',
  '회피·방어·보호막·호위·피해 경감이 적용됩니다. 사망·기절·침묵은 발동을 막고 대상이 없으면 자원을 소모하지 않습니다.',
  '보스에게도 같은 단일 피해 예산입니다. 파편·오라·잔광은 시각 표현이며 방어 무시·추가 피해·추가 행동을 만들지 않습니다.',
  art('berkan-gilded-starfall','GILDED_STARFALL',1.7,[2.08],4.6,'#edc878'),
  ['흑금 광휘 집중','활시위 당김 · 코어 압축','흑금 화살 · 낙성 파열','금빛 파편 · 잔광 소멸']);
}
export function prepareBerkanDefaults(document){
 const card=document.mercenaries.find(c=>c.code===BERKAN_CODE);if(!card)return document;
 Object.assign(card,{name:'베르칸',rank:'SSS',review:'REVIEWED',acquisition:{type:'DROP',source:'하이퍼팩 · 크라이베른과 동일한 SSS 내 선택 가중치. SSS 등급 전체 확률은 CMS 운영값 유지.',coinPrice:null,dropRate:null}});
 const skill=document.skills.find(s=>s.id===BERKAN_SKILL_ID);if(!skill)throw Error('BERKAN_SKILL_MISSING');
 skill.balance={...BERKAN_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===BERKAN_CODE).skillIds=[BERKAN_SKILL_ID];
 return document;
}
