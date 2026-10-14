import {BERKAN_BALANCE,BERKAN_TEMPO,BERKAN_PVP_BASIC_DAMAGE_SCALE,BERKAN_PVP_SKILL_CAP_SCALE,BERKAN_CAP_SCALE,berkanPlaybackRate} from './mercenary-berkan-v1.mjs';
// 2026-10-15: use Berkan's combat policy; keep Azant's identity and authored art.
export const AZANT_CODE='V-056';
export const AZANT_VOLLEY_SKILL='MS-057',AZANT_AREA_SKILL='MS-058';
export const AZANT_VOLLEY_MECHANIC='SAPPHIRE_CRYSTAL_VOLLEY',AZANT_AREA_MECHANIC='SAPPHIRE_DESCENT';
export const AZANT_VOLLEY_EVENT='MERCENARY_AZANT_VOLLEY',AZANT_AREA_EVENT='MERCENARY_AZANT_AREA';
export const AZANT_BALANCE=BERKAN_BALANCE;
export const AZANT_COMBAT=Object.freeze({version:'azant-berkan-parity-20261015-v1',speedScale:BERKAN_TEMPO.speedScale,actionCredit:BERKAN_TEMPO.actionCredit,pvpSkillCapScale:BERKAN_PVP_SKILL_CAP_SCALE,pveVolleyCapScale:BERKAN_CAP_SCALE,pvpBasicDamageScale:BERKAN_PVP_BASIC_DAMAGE_SCALE});
export const isAzant=actor=>!!actor?.isMercenary&&actor.code===AZANT_CODE;
export const azantActionCredit=actors=>actors.some(a=>isAzant(a)&&a.statMode==='RANK_FIXED')?AZANT_COMBAT.actionCredit:1;
export const azantPvpBasicDamageScale=actor=>isAzant(actor)&&actor.battleMode==='PVP'?AZANT_COMBAT.pvpBasicDamageScale:1;
export const azantVolleyCapScale=actor=>isAzant(actor)&&actor.battleMode==='PVP'?AZANT_COMBAT.pvpSkillCapScale:AZANT_COMBAT.pveVolleyCapScale;
export const azantPlaybackRate=berkanPlaybackRate;
export const AZANT_SOURCE_ART='assets/ui/project-v/mercenaries/approved-20261014/azant-source-art-v1.png';
export const AZANT_BATTLE_SPRITE='assets/ui/project-v/characters/mercenary/azant-sss-v1/azant-sd-v3.png';
export const AZANT_POSITION=Object.freeze({code:AZANT_CODE,rank:'SSS',position:'REAR',role:'CONTROLLER',basicTarget:'FRONT_ENEMY',skillTarget:'BACK_THREAT',specialty:'후열 우선 결정창 포격 · PVE 포격·청옥 강림 교대',weakness:'회피·보호막·방어에 대응되며 기절·침묵 중에는 스킬을 사용하지 않음',rationale:'승인된 지팡이와 안정된 대기 자세를 사용하는 SSS 마법사. 이동 공격 없이 후열에서 마법을 시전.'});
export function createAzantSkills(definition,art){
 const counter='대상별 회피·방어·보호막·피해 경감이 적용됩니다. 사망·기절·침묵 중에는 발동하지 않고, 대상이 없으면 자원을 소모하지 않습니다.';
 const budget='전체 피해 예산을 지정 대상 수로 나누어 각각 한 번 판정합니다. 회피한 몫은 재분배하지 않으며 연출의 결정·폭발은 추가 피해를 만들지 않습니다.';
 return [
  definition(AZANT_VOLLEY_SKILL,'결정창 포격','CONTROLLER','BACK_THREAT',AZANT_VOLLEY_MECHANIC,
   'PVE·PVP에서 자원과 재사용 조건을 충족하면 후열 우선, 전투 시작 공격력 순으로 서로 다른 적 최대 2명을 지정합니다. 후열이 부족하면 전열로 채웁니다.',
   '제자리에서 삼중 마법진을 열고 여섯 발의 결정창을 연속 발사합니다. '+budget,counter,budget,
   art('azant-crystal-volley',AZANT_VOLLEY_MECHANIC,.8,[1.45],4.9,'#7bdcff'),['마력 응축','삼중 마법진','여섯 결정창 · 연속 폭쇄','마력 회수']),
  definition(AZANT_AREA_SKILL,'청옥 강림','CONTROLLER','ALL_ENEMIES',AZANT_AREA_MECHANIC,
   'PVE에서 자원과 재사용 조건을 충족하면 살아 있는 적 전원을 지정합니다. PVP에서는 사용하지 않습니다.',
   '삼중 천공 봉인에서 거대한 결정을 내리고 청옥 폭쇄를 일으킵니다. '+budget,counter,budget,
   art('azant-sapphire-descent',AZANT_AREA_MECHANIC,1.65,[4.1],7.8,'#7bdcff'),['날개 · 마력 개방','삼중 천공 봉인','결정 강림','청옥 폭쇄 · 잔향'])
 ];
}
// Upgrade the released front-only text/target on reads. Preserve operator
// balances, assignments, names and notes, and leave later edited targets alone.
export function upgradeAzantBerkanParity(document,defaults){
 const old=document?.skills?.find(s=>s.id===AZANT_VOLLEY_SKILL);
 if(old?.mechanic!==AZANT_VOLLEY_MECHANIC||old.target!=='FRONT_GROUP')return document;
 const current=defaults.skills.find(s=>s.id===AZANT_VOLLEY_SKILL);if(current?.target!=='BACK_THREAT')return document;
 return {...document,skills:document.skills.map(s=>s===old?{...s,target:current.target,trigger:current.trigger}:s),
  mercenaries:document.mercenaries.map(c=>c.code===AZANT_CODE&&c.skillTarget==='FRONT_GROUP'?{...c,skillTarget:'BACK_THREAT',specialty:AZANT_POSITION.specialty}:c)};
}
export function prepareAzantDefaults(document){
 const card=document.mercenaries.find(c=>c.code===AZANT_CODE);if(!card)return document;
 Object.assign(card,{...AZANT_POSITION,name:'아잔트',title:'',rank:'SSS',review:'REVIEWED',acquisition:{type:'DROP',source:'기존 용병팩·합성 SSS 풀. 등급 확률과 카드별 선택 가중치는 CMS 운영 설정을 따릅니다.',coinPrice:null,dropRate:null}});
 for(const id of [AZANT_VOLLEY_SKILL,AZANT_AREA_SKILL]){const skill=document.skills.find(s=>s.id===id);if(!skill)throw Error('AZANT_SKILL_MISSING');skill.balance={...AZANT_BALANCE};skill.review='REVIEWED';}
 document.assignments.find(a=>a.code===AZANT_CODE).skillIds=[AZANT_VOLLEY_SKILL,AZANT_AREA_SKILL];
 return document;
}
export const AZANT_BATTLE_SPRITE_SHA256='8CAC9E219FA4C8BA0A9800243AD18C3D42269DA9B7D176D64A6D91BB1792016B';
