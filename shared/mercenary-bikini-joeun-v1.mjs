export const BIKINI_JOEUN_CODE='V-047';
export const BIKINI_JOEUN_SKILL_ID='MS-047';
export const BIKINI_JOEUN_MECHANIC='LAVENDER_RICOCHET';
export const BIKINI_JOEUN_BALANCE=Object.freeze({damageRatio:4.2,cooldownTurns:5,cost:25});
export const BIKINI_JOEUN_SHOTS=Object.freeze([.42,.56,.70,.84,.98,1.23]);
export const BIKINI_JOEUN_TRAVEL=.075;
export const BIKINI_JOEUN_IMPACTS=Object.freeze(BIKINI_JOEUN_SHOTS.map(t=>Number((t+BIKINI_JOEUN_TRAVEL).toFixed(3))));
export const BIKINI_JOEUN_DURATION=2.85;
export function createBikiniJoeunSkill(definition,art){
 return definition(BIKINI_JOEUN_SKILL_ID,'라벤더 리코셰','MARKSMAN','FRONT_ENEMY',BIKINI_JOEUN_MECHANIC,
  '자원과 재사용 대기 조건을 충족하면 현재 행동에서 바로 사격합니다.',
  '적 전열 한 명을 향해 경기관총을 6연사합니다. 마지막 탄의 보랏빛 파열과 함께 단일 집중 사격 피해가 적용됩니다.',
  '회피·보호막·피해 경감이 적용됩니다. 시전자 사망·기절·침묵은 발동을 막으며, 표적이 없으면 비용을 소모하지 않습니다.',
  '보스에도 같은 단일 피해 예산을 적용합니다. 방어 무시·최대 HP 비례·추가 행동은 없으며 탄환 연출이 추가 피해를 만들지 않습니다.',
  art('lavender-ricochet',BIKINI_JOEUN_MECHANIC,.35,[...BIKINI_JOEUN_IMPACTS],BIKINI_JOEUN_DURATION,'#c4a5ef'),
  ['수평 조준','반동을 제어하는 6연사','마지막 탄의 라벤더 파열','연무와 잔광 소멸']);
}
export function prepareBikiniJoeunDefaults(document){
 const card=document.mercenaries.find(c=>c.code===BIKINI_JOEUN_CODE);if(!card)return document;
 card.review='REVIEWED';card.acquisition={type:'DROP',source:'하이퍼팩 · SS 등급 내 균등 확률',coinPrice:null,dropRate:null};
 const skill=document.skills.find(s=>s.id===BIKINI_JOEUN_SKILL_ID);skill.balance={...BIKINI_JOEUN_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===BIKINI_JOEUN_CODE).skillIds=[BIKINI_JOEUN_SKILL_ID];return document;
}
export function bikiniJoeunPoseAt(time,{basic=false}={}){
 if(basic){if(time<.42||time>=.76)return 0;return time<.49?1:time<.60?2:5;}
 if(time<.35||time>=1.82)return 0;
 if(time>=1.06&&time<1.23)return 3;
 if(time>=1.23&&time<1.36)return 4;
 if(time>=1.36)return 5;
 const shot=BIKINI_JOEUN_SHOTS.slice(0,5).filter(t=>t<=time).at(-1);
 return shot===undefined?0:time-shot<.055?1:2;
}
// Visual cues only: one authoritative server contact regardless of tracer count.
export function bikiniJoeunVisualPlan({basic=false,dodge=false}={}){
 const shots=basic?BIKINI_JOEUN_SHOTS.slice(0,1):BIKINI_JOEUN_SHOTS,events=[];
 shots.forEach((at,shot)=>{events.push({kind:'SHOT',at,shot});if(!dodge)events.push({kind:'HIT',at:BIKINI_JOEUN_IMPACTS[shot],shot,target:'E1',ratio:0});});
 return {events,basic,duration:basic?.9:BIKINI_JOEUN_DURATION,budget:0,authoritative:true,targetCount:1,damageAuthority:'SERVER_ONLY'};
}
