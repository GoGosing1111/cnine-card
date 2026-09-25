// 2026-09-26: user approved SS, rare acquisition, strongest ranged role and live assets/skill.
export const SNIPER_ORIKKUNG_CODE='V-050';
export const SNIPER_ORIKKUNG_SKILL_ID='MS-050';
export const SNIPER_ORIKKUNG_MECHANIC='EMERALD_ANTIMATERIEL';
export const SNIPER_ORIKKUNG_NAME='저격 오리꿍';
export const SNIPER_ORIKKUNG_BALANCE=Object.freeze({damageRatio:7.2,cooldownTurns:2,cost:25});
export const SNIPER_ORIKKUNG_CAP_SCALE=1.65;
export const SNIPER_ORIKKUNG_SS_PERCENT=1;
export const SNIPER_ORIKKUNG_SHOTS=Object.freeze([.52]);
export const SNIPER_ORIKKUNG_TRAVEL=.08;
export const SNIPER_ORIKKUNG_IMPACTS=Object.freeze([.60]);
export const SNIPER_ORIKKUNG_DURATION=2.4;
export const SNIPER_ORIKKUNG_POSITION=Object.freeze({
 code:SNIPER_ORIKKUNG_CODE,rank:'SS',position:'REAR',role:'SNIPER',basicTarget:'FRONT_ENEMY',skillTarget:'BACK_THREAT',
 specialty:'원거리 최상위 단일 화력 · 적 후열 핵심 저격',weakness:'회피·보호막·호위에 대응되며 근접 기습과 제압에 취약',
 rationale:'사용자 지정 최강 원거리 포지션. 한 행동 대물 저격과 짧은 재사용 주기로 후열 위협을 제거한다.'
});
// Preserve all old relative odds. An explicit later CMS weight always wins.
export function sniperOrikkungSelectionWeights(codes,weights){
 if(!codes.includes(SNIPER_ORIKKUNG_CODE)||Object.hasOwn(weights,SNIPER_ORIKKUNG_CODE))return weights;
 const others=codes.filter(code=>code!==SNIPER_ORIKKUNG_CODE);if(!others.length)return weights;
 const gcd=(a,b)=>{while(b){const r=a%b;a=b;b=r;}return a;};
 const divisor=others.map(code=>weights[code]??1).reduce(gcd);
 const total=others.reduce((n,code)=>n+(weights[code]??1)/divisor,0);
 if(!Number.isSafeInteger(total)||total<1||total*100>0xffffffff)throw Error('SNIPER_ORIKKUNG_WEIGHTS_REQUIRE_CMS');
 return {...weights,...Object.fromEntries(others.map(code=>[code,(weights[code]??1)/divisor*99])),[SNIPER_ORIKKUNG_CODE]:total};
}
export function createSniperOrikkungSkill(definition,art){
 return definition(SNIPER_ORIKKUNG_SKILL_ID,'에메랄드 대물저격','SNIPER','BACK_THREAT',SNIPER_ORIKKUNG_MECHANIC,
  '자원과 재사용 대기 조건을 충족하면 현재 행동에서 조준과 사격을 완료합니다.',
  '적 후열 중 전투 시작 공격력이 가장 높은 적을 강력한 대물탄 한 발로 저격합니다. 후열이 없으면 전열을 겨눕니다.',
  '회피·방어·보호막·호위·피해 경감이 적용됩니다. 사망·기절·침묵은 발동을 막고 대상이 없으면 자원을 소모하지 않습니다.',
  '보스에게도 같은 단일 피해 예산입니다. 방어 무시·즉사·최대 HP 비례·추가 행동은 없으며 파편 연출은 추가 피해를 만들지 않습니다.',
  art('emerald-antimateriel',SNIPER_ORIKKUNG_MECHANIC,.3,[...SNIPER_ORIKKUNG_IMPACTS],SNIPER_ORIKKUNG_DURATION,'#8ce5ba'),
  ['수평 정밀 조준','대물탄 발사 · 반동','장갑 충돌 · 파편 확산','볼트 재장전 · 연무 소멸']);
}
export function prepareSniperOrikkungDefaults(document){
 const card=document.mercenaries.find(c=>c.code===SNIPER_ORIKKUNG_CODE);if(!card)return document;
 Object.assign(card,{name:SNIPER_ORIKKUNG_NAME,rank:'SS',review:'REVIEWED',
  acquisition:{type:'DROP',source:'하이퍼팩 · SS 당첨 후 저격 오리꿍 1% (전체 확률은 CMS SS 확률 × 0.01)',coinPrice:null,dropRate:null}});
 const skill=document.skills.find(s=>s.id===SNIPER_ORIKKUNG_SKILL_ID);if(!skill)throw Error('SNIPER_ORIKKUNG_SKILL_MISSING');
 skill.balance={...SNIPER_ORIKKUNG_BALANCE};skill.review='REVIEWED';
 document.assignments.find(a=>a.code===SNIPER_ORIKKUNG_CODE).skillIds=[SNIPER_ORIKKUNG_SKILL_ID];
 return document;
}
export function sniperOrikkungPoseAt(time,{basic=false}={}){
 const rate=basic?1.8:1,t=time*rate;
 if(t<.18||t>=1.8)return 0;
 if(t<.52)return 1;
 if(t<.72)return 2;
 if(t<1.12)return 3;
 if(t<1.46)return 4;
 return 5;
}
export function sniperOrikkungVisualPlan({basic=false,dodge=false}={}){
 const rate=basic?1.8:1,events=[{kind:'SHOT',at:SNIPER_ORIKKUNG_SHOTS[0]/rate,shot:0}];
 if(!dodge)events.push({kind:'HIT',at:SNIPER_ORIKKUNG_IMPACTS[0]/rate,shot:0,target:'E1',ratio:0});
 return {events,basic,duration:basic?1.25:SNIPER_ORIKKUNG_DURATION,budget:0,authoritative:true,targetCount:1,damageAuthority:'SERVER_ONLY'};
}
