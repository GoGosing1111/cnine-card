// User approved Mangisa SS, the horizontal AK SD and Golden Orchid Volley.
export const MANGISA_CODE='V-045';
export const MANGISA_SKILL_ID='MS-045';
export const MANGISA_MECHANIC='GOLDEN_ORCHID_VOLLEY';
export const MANGISA_BALANCE=Object.freeze({damageRatio:4,cooldownTurns:5,cost:25});
export const MANGISA_SHOTS=Object.freeze([.42,.56,.70,.84,.98,1.23]);
export const MANGISA_IMPACTS=Object.freeze(MANGISA_SHOTS.map(t=>Number((t+.075).toFixed(3))));
export const MANGISA_PVP_SCALE=1;
export const MANGISA_DURATION=2.85;
export const MANGISA_PRIMARY_SHARES=Object.freeze([.11,.11,.11,.11,.11,.25]);
export const MANGISA_SPLASH_SHARE=.25;
export function createMangisaSkill(definition,art){
 return definition(MANGISA_SKILL_ID,'금란 연사','MARKSMAN','FRONT_ENEMY',MANGISA_MECHANIC,
  '자원과 재사용 대기 조건을 충족하면 현재 행동에서 바로 조준하고 발사합니다.',
  '화이트 골드 AK로 주 대상에게 6연사합니다. 총 피해 예산의 80%를 주 대상에게, 마지막 탄의 확산으로 주변 적 최대 2명에게 각각 25%를 가합니다.',
  '회피·보호막·피해 경감은 적용됩니다. 앞선 탄이 빗나가도 계속 발사합니다. 주 대상이 먼저 쓰러지면 남은 탄은 같은 행동에서 다음 적에게 이어 발사합니다. 시전자 제압 시에만 남은 탄이 취소됩니다.',
  '보스도 단일 대상 몫 80%만 적용합니다. 최대 HP 비례·방어 무시·기절·추가 행동은 없습니다. 한 행동의 피해 상한을 각 탄과 확산에 나누어 사용합니다.',
  art('golden-orchid-volley',MANGISA_MECHANIC,.35,[...MANGISA_IMPACTS],MANGISA_DURATION,'#f3c475'),
  ['수평 조준','빠른 6연사','마지막 개화탄 · 최대 3명','꽃잎과 금빛 파편 소멸']);
}
export function prepareMangisaDefaults(document){
 const card=document.mercenaries.find(c=>c.code===MANGISA_CODE);
 if(!card)return document;
 card.review='REVIEWED';card.acquisition={type:'DROP',source:'하이퍼팩 · SS 등급 내 균등 확률',coinPrice:null,dropRate:null};
 const skill=document.skills.find(s=>s.id===MANGISA_SKILL_ID);
 skill.balance={...MANGISA_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===MANGISA_CODE).skillIds=[MANGISA_SKILL_ID];
 return document;
}
// Translate server outcomes into visual cues, never calculate a battle result.
export function mangisaVisualPlan(event){
 const ids=event.targetIds||[],impacts=event.impacts||[],events=[];
 for(const impact of impacts){
  const targetIndex=ids.indexOf(impact.targetId);if(targetIndex<0)continue;
  const target=`E${targetIndex+1}`,shot=impact.shotIndex;
  if(impact.kind==='PRIMARY')events.push({kind:'SHOT',at:MANGISA_SHOTS[shot],shot});
  if(!impact.dodge)events.push({kind:impact.kind==='PRIMARY'?'HIT':'SPLASH',at:impact.at,shot,target,ratio:0});
 }
 // A killed primary ends the volley. Keep landed sparks until their normal end.
 return {events,mode:event.battleMode||'PVE',duration:MANGISA_DURATION,budget:0,authoritative:true,targetCount:ids.length};
}
