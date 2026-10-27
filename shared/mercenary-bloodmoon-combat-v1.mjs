// Owned Bloodmoon balance; Joeun's restraint and combat efficiency updated 2026-10-27.
export const BLOODMOON_COMBAT_VERSION='20261027-joeun-balance-v2';
const rows=[
 ['V-960','bongsoon','BACK','RANGED','RANGED','적월 섬멸탄','DISTRIBUTED_CORAL_VOLLEY',8.1,3.05,3.75,3.25,1.7,14.4,2],
 ['V-961','joeun','FRONT','VANGUARD','MELEE','홍련의 속박','REPEAT_OFFENDER_RESTRAINT',7.9,3.1,3.75,3.2,1.7,13.2,1],
 ['V-962','diim','FRONT','VANGUARD','MELEE','적월 단죄','WOUNDED_MOON_DRAW',7.7,2.95,3.5,3.1,1.7,11.6,1],
 ['V-963','claws','FRONT','VANGUARD','MELEE','혈조 교차참','TWO_BEAT_FOLLOWUP',8.15,3.05,3.75,3.3,1.7,26.4,1],
 ['V-964','dagger','FRONT','VANGUARD','MELEE','월영 급습','INTERRUPT_WINDUP',7.9,3.15,3.75,3.2,1.65,11.8,1]
];
export const BLOODMOON_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,slug,position,role,attackStyle,name,mechanic,scale,speedScale,actionCredit,pvpSkillCapScale,basicCapScale,damageRatio,cooldownTurns])=>[code,Object.freeze({
 code,slug,position,role,attackStyle,basePower:356400,scale,speedScale,actionCredit,actionEnergy:10,pvpSkillCapScale,basicCapScale,pveSkillMinimumDamage:false,
 link:Object.freeze({attackPercent:Math.round(220*scale*100)/100,hpPercent:Math.round(280*scale*100)/100,shieldPercent:Math.round(150*scale*100)/100}),
 skill:Object.freeze({id:'MS-'+code.slice(2),name,mechanic,ready:true,balance:Object.freeze({damageRatio,cooldownTurns,cost:20})})
})])));
export const bloodmoonCombatDescription=code=>{
 const p=BLOODMOON_COMBAT[code];return p?`기본 전투력 356,400. 표시·성장 등급은 SS이며 전투 등급 보정은 일반 SSS 기준입니다. 자연 행동 속도 ${p.speedScale}배·아군 카드 1행동당 ${p.actionCredit}회 추가 행동, 자기 행동마다 에너지 10 회복. ${p.skill.name} 총 ${Math.round(p.skill.balance.damageRatio*100).toLocaleString('ko-KR')}% · 에너지 20 · 재사용 ${p.skill.balance.cooldownTurns}행동. ${code==='V-961'?'홍련의 속박 적중 즉시 대상의 기본 공격을 25% 약화합니다. 위반 표식 2개가 쌓인 대상에게 다시 적중하면 표식을 소모해 다음 공격 스킬 피해도 25% 줄입니다. ':''}보유 즉시 PVE·PVP 편성 가능. 대기 고정·모션 2배속. 블러드문팩 판매 상태와 잔여 수량은 상점에서 확인하세요.`:'';
};
