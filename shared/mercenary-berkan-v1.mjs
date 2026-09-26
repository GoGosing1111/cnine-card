import {CRYVERN_CODE,CRYVERN_BALANCE,cryvernSelectionWeights} from './mercenary-cryvern-v1.mjs';
// 2026-09-27: SSS registration, Cryvern rarity, motions and golden aura approved.
export const BERKAN_CODE='V-055',BERKAN_SKILL_ID='MS-055';
export const BERKAN_MECHANIC='GILDED_STARFALL';
export const BERKAN_BALANCE=Object.freeze({damageRatio:5.6,cooldownTurns:5,cost:35});
export const BERKAN_CAP_SCALE=1.7;
export const BERKAN_IMPACT=2.08;
export const BERKAN_POSITION=Object.freeze({code:BERKAN_CODE,rank:'SSS',position:'REAR',role:'SNIPER',basicTarget:'FRONT_ENEMY',skillTarget:'BACK_THREAT',specialty:'후열 우선 2명 동시 사격 · 제자리 흑금 화살',weakness:'회피·보호막·방어에 대응되며 제압 상태에서는 발동하지 않음',rationale:'사용자 지정 SSS 궁수. 달리기 대신 조준·발사·반동을 분리한 동작.'});
export function berkanSelectionWeights(codes,weights={}){
 if(!codes.includes(BERKAN_CODE)||Object.hasOwn(weights,BERKAN_CODE))return cryvernSelectionWeights(codes,weights);
 if(!codes.includes(CRYVERN_CODE))throw Error('BERKAN_REQUIRES_CRYVERN_IN_SSS_POOL');
 const effective=cryvernSelectionWeights(codes.filter(c=>c!==BERKAN_CODE),weights),weight=effective[CRYVERN_CODE]??1;
 if(!Number.isSafeInteger(weight)||weight<1)throw Error('INVALID_CRYVERN_WEIGHT');
 return {...effective,[BERKAN_CODE]:weight};
}
export function createBerkanSkill(definition,art){
 return definition(BERKAN_SKILL_ID,'흑금 낙성','SNIPER','BACK_THREAT',BERKAN_MECHANIC,
  '자원과 재사용 조건을 충족하면 후열 우선, 전투 시작 공격력 순으로 서로 다른 적 최대 2명을 지정합니다. 후열이 부족하면 전열로 채웁니다.',
  '한 번의 제자리 사격에서 흑금 화살 두 줄기가 동시에 명중합니다. 전체 피해 배율을 지정 대상 수로 나누며 각 대상은 한 번만 타격합니다.',
  '대상별 회피·방어·보호막·피해 경감이 적용됩니다. 사망·기절·침묵은 발동을 막고 대상이 없으면 자원을 소모하지 않습니다.',
  '적이 하나면 전체 피해 예산으로 한 번 타격합니다. 회피한 몫은 다른 적에게 옮기지 않으며 방어 무시·추가 행동은 없습니다.',
  art('berkan-gilded-starfall','GILDED_STARFALL',1.7,[2.08],4.6,'#edc878'),
  ['흑금 광휘 집중','활시위 당김 · 코어 압축','흑금 화살 · 낙성 파열','금빛 파편 · 잔광 소멸']);
}
// Upgrade the released single-target definition on existing CMS reads without
// database writes. Once upgraded, later operator balance/assignment edits win.
export function upgradeBerkanTwinSkill(document,defaults){
 const old=document?.skills?.find(s=>s.id===BERKAN_SKILL_ID);
 if(old?.mechanic!=='LOCKED_THREAT_SHOT')return document;
 const current=defaults.skills.find(s=>s.id===BERKAN_SKILL_ID);
 if(current?.mechanic!==BERKAN_MECHANIC)return document;
 const keys=['mechanic','trigger','effect','counterplay','bossRule','procRule'];
 const skill={...old,...Object.fromEntries(keys.map(k=>[k,current[k]])),balance:{...old.balance}};
 for(const key of Object.keys(BERKAN_BALANCE))if(old.balance[key]===CRYVERN_BALANCE[key])skill.balance[key]=BERKAN_BALANCE[key];
 return {...document,skills:document.skills.map(s=>s===old?skill:s)};
}
export function prepareBerkanDefaults(document){
 const card=document.mercenaries.find(c=>c.code===BERKAN_CODE);if(!card)return document;
 Object.assign(card,{name:'베르칸',rank:'SSS',review:'REVIEWED',acquisition:{type:'DROP',source:'하이퍼팩 · 크라이베른과 동일한 SSS 내 선택 가중치. SSS 등급 전체 확률은 CMS 운영값 유지.',coinPrice:null,dropRate:null}});
 const skill=document.skills.find(s=>s.id===BERKAN_SKILL_ID);if(!skill)throw Error('BERKAN_SKILL_MISSING');
 skill.balance={...BERKAN_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===BERKAN_CODE).skillIds=[BERKAN_SKILL_ID];
 return document;
}
export const BERKAN_SOURCE_ART='assets/ui/project-v/mercenaries/approved-20260927/berkan-source-art-v1.png';
export const BERKAN_BATTLE_SPRITE='assets/ui/project-v/characters/mercenary/berkan-sss-v1/berkan-sd-v1.png';
