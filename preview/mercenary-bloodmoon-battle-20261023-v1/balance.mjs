// Prepared under the user's 2026-10-23 direction: above Halloween SS limited.
// Preview aliases are NOT catalog assignments. This module has no live imports.
export const BLOODMOON_BALANCE_VERSION=1;
export const BLOODMOON_BASE_POWER=356400;
export const RELEASE=Object.freeze({rank:null,namesPending:['claws','dagger'],acquisitionEnabled:false,deploymentEnabled:false,visualApproval:'USER_REVIEW_PENDING'});
const rows=[
 ['bongsoon','V-960','나무늘봉순','BACK','RANGED','RANGED','적월 섬멸탄','DISTRIBUTED_CORAL_VOLLEY',8.1,3.05,3.75,3.25,1.7,14.4,2,'세 차례 탄막을 나누어 발사합니다.'],
 ['joeun','V-961','조은','FRONT','VANGUARD','MELEE','홍련의 속박','REPEAT_OFFENDER_RESTRAINT',7.4,2.9,3.5,3.1,1.7,11.6,1,'행동을 거듭한 적을 채찍으로 공격하고 조건 충족 시 다음 공격을 약화합니다.'],
 ['diim','V-962','디임','FRONT','VANGUARD','MELEE','적월 단죄','WOUNDED_MOON_DRAW',7.7,2.95,3.5,3.1,1.7,11.6,1,'잃은 체력이 많은 적을 큰 낫으로 마무리합니다.'],
 ['claws','V-963','독자 캐릭터 A','FRONT','VANGUARD','MELEE','혈조 교차참','TWO_BEAT_FOLLOWUP',8.15,3.05,3.75,3.3,1.7,26.4,1,'양손 클로의 교차 공격을 두 행동에 나누어 이어갑니다.'],
 ['dagger','V-964','독자 캐릭터 B','FRONT','VANGUARD','MELEE','월영 급습','INTERRUPT_WINDUP',7.9,3.15,3.75,3.2,1.65,11.8,1,'단검으로 급습해 적의 준비 중인 기술을 중단합니다. 보스와 제어 면역은 중단되지 않습니다.']
];
export const BLOODMOON_COMBAT=Object.freeze(Object.fromEntries(rows.map(([slug,code,name,position,role,attackStyle,skillName,mechanic,scale,speedScale,actionCredit,pvpSkillCapScale,basicCapScale,damageRatio,cooldownTurns,effect])=>[code,Object.freeze({
 version:BLOODMOON_BALANCE_VERSION,slug,code,codeStatus:'PREVIEW_ALIAS_NOT_ASSIGNED',name,rank:null,position,role,attackStyle,basePower:BLOODMOON_BASE_POWER,
 scale,speedScale,actionCredit,actionEnergy:10,pvpSkillCapScale,basicCapScale,pveSkillMinimumDamage:false,
 link:Object.freeze({attackPercent:Math.round(220*scale*100)/100,hpPercent:Math.round(280*scale*100)/100,shieldPercent:Math.round(150*scale*100)/100}),
 skill:Object.freeze({id:'BM-'+slug.toUpperCase(),name:skillName,nameStatus:'WORKING_LABEL',mechanic,effect,target:'적 표적',ready:true,
  trigger:'기존 서버의 에너지·재사용·행동 조건',counterplay:'기존 회피·방어·보호막·제어 면역 적용',procRule:'연출 프레임은 추가 피해·행동·비용을 발생시키지 않습니다.',
  balance:Object.freeze({damageRatio,cooldownTurns,cost:20})}),
 acquisitionEnabled:false,deploymentEnabled:false
})])));
export const bloodmoonBySlug=slug=>Object.values(BLOODMOON_COMBAT).find(p=>p.slug===slug);
