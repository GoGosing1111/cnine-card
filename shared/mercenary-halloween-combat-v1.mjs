// Owner requested Halloween SS above the existing SS limited tier (2026-10-17).
// Collection rank and seasonal stock are independent of combat power.
export const HALLOWEEN_COMBAT_VERSION=4;
// 2026-10-19 follow-up: modest +10% power and intrinsic/link stats, below Kangyun.
export const HALLOWEEN_BASE_POWER=237600;
// 2026-10-18: reduce only Diim's renewed PvP barrier, preserving opening
// linkage, basic attacks, cadence and the original PvE skill budget.
export const HALLOWEEN_DIIM_PVP_BARRIER=Object.freeze({version:1,amountScale:.6});
export const halloweenBarrierScale=actor=>actor?.isMercenary===true&&actor.code==='V-984'&&actor.battleMode==='PVP'?HALLOWEEN_DIIM_PVP_BARRIER.amountScale:1;
const rows=[
 ['V-980','FRONT','VANGUARD','MELEE','카니발 브레이크','WOUNDED_MOON_DRAW','약해진 적 하나를 몽둥이로 강타합니다. 대상의 잃은 체력에 따라 피해가 증가합니다.'],
 ['V-981','BACK','RANGED','RANGED','유령 탄막','DISTRIBUTED_CORAL_VOLLEY','적 진형에 세 차례의 유령 탄막을 나누어 발사합니다.'],
 ['V-982','BACK','CASTER','CAST','잭오랜턴 행진','TIDAL_BARRAGE','호박불 행렬을 전방 표적에게 쏟아붓습니다.'],
 ['V-983','BACK','CASTER','CAST','호박 유령서','RIFT_MARK_DETONATION','유령서의 표식을 새기고 다음 행동에 폭발시킵니다.'],
 ['V-984','FRONT','GUARD','MELEE','성야의 방패','FRONT_SHARED_BARRIER','아군 전열에 성야의 방벽을 나누어 부여합니다. 방벽 사용 후 기본 공격을 계속합니다.'],
 ['V-985','BACK','RANGED','RANGED','박쥐 별무리','TWO_BEAT_FOLLOWUP','박쥐 별을 던지고 다음 행동에 후속타를 이어갑니다.'],
 ['V-986','FRONT','VANGUARD','MELEE','월하 화접','WOUNDED_MOON_DRAW','꽃나비 검기로 약해진 적을 벱니다. 대상의 잃은 체력에 따라 피해가 증가합니다.']
];
// Intrinsic role tuning only: no opponent, account or winner-based adjustment.
const balanceByCode={
 'V-980':{scale:5.28,speedScale:2.5,actionCredit:3,pvpSkillCapScale:2.4,basicCapScale:1.35,pvpIncomingDamageScale:.85,damageRatio:8.4,cooldownTurns:2},
 'V-981':{scale:3.3,pvpSkillCapScale:1.8,damageRatio:6.72,cooldownTurns:2},
 'V-982':{scale:3.465,pvpSkillCapScale:2.2,damageRatio:7.56,cooldownTurns:2},
 'V-983':{scale:3.08,pvpSkillCapScale:1.6,damageRatio:6.72,cooldownTurns:3},
 'V-984':{scale:2.42,pvpSkillCapScale:1.8,damageRatio:6.72,cooldownTurns:2},
 'V-985':{scale:3.19,pvpSkillCapScale:1.75,damageRatio:6.72,cooldownTurns:2},
 'V-986':{scale:5.17,pvpSkillCapScale:2.15,damageRatio:6.72,cooldownTurns:1}
};
export const HALLOWEEN_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,position,role,attackStyle,name,mechanic,effect])=>{const {scale,speedScale=2.25,actionCredit=2.25,pvpSkillCapScale,basicCapScale=1,pvpIncomingDamageScale,damageRatio,cooldownTurns}=balanceByCode[code];return [code,Object.freeze({
 code,position,role,attackStyle,basePower:HALLOWEEN_BASE_POWER,scale,speedScale,actionCredit,actionEnergy:10,pvpSkillCapScale,basicCapScale,
 ...(pvpIncomingDamageScale===undefined?{}:{pvpIncomingDamageScale}),
 link:Object.freeze({attackPercent:Number((220*scale).toFixed(2)),shieldPercent:Number((150*scale).toFixed(2)),hpPercent:Number((280*scale).toFixed(2))}),
 skill:Object.freeze({id:'MS-'+code.slice(2),name,mechanic,effect,target:mechanic==='FRONT_SHARED_BARRIER'?'아군 전열':'적 표적',
  trigger:'에너지와 재사용 조건을 충족한 자기 행동',counterplay:'회피·방어·보호막 및 행동 순서의 영향을 받습니다.',bossRule:'동일한 피해·보호막 규칙을 사용합니다.',procRule:'후속타는 새 비용 없이 처리하며 추가 시전을 재귀 발동하지 않습니다.',ready:true,
  balance:Object.freeze({damageRatio,cooldownTurns,cost:20})})
})];})));
// Intrinsic PvP durability, independent of the opponent, account or outcome.
// Apply before growth mitigation bypass and before damage reaches HP/shields.
export function halloweenIncomingDamage(actor,damage){
 return actor?.isMercenary===true&&actor.code==='V-980'&&actor.statMode==='RANK_FIXED'&&actor.battleMode==='PVP'
  ?damage*HALLOWEEN_COMBAT['V-980'].pvpIncomingDamageScale:damage;
}
export function halloweenCombatDescription(code){
 const p=HALLOWEEN_COMBAT[code];if(!p)return '';
 const percent=Number((p.skill.balance.damageRatio*100).toFixed(2));
 const basic=p.basicCapScale>1?` 기본 공격 상한은 ${p.basicCapScale}배입니다.`:'';
 const guard=p.pvpIncomingDamageScale?` PVP에서 받는 피해가 ${Math.round((1-p.pvpIncomingDamageScale)*100)}% 감소합니다. 방벽과 HP에 피해를 나누기 전에 적용하며, 상대 용병의 성장에 따른 피해 감소 관통은 기존 규칙을 따릅니다. PVE에는 적용하지 않습니다.`:'';
 const barrier=code==='V-984'?` 성야의 방패는 PVP에서 부여량이 ${Math.round((1-HALLOWEEN_DIIM_PVP_BARRIER.amountScale)*100)}% 감소하여 공격력 ${(percent*HALLOWEEN_DIIM_PVP_BARRIER.amountScale).toFixed(1)}%를 전열에 나눠 부여합니다. 시작 방벽에는 이 감소를 적용하지 않으며 PVE는 ${percent}% 방벽을 부여합니다.`:'';
 return `할로윈 SS 리미티드 · 기본 전투력 ${p.basePower.toLocaleString('en-US')}(기존 SS 리미티드 대비 32% 증가). 표시·성장 등급은 SS, 전투 등급 보정은 일반 SSS 기준입니다. 연계 공격 ${p.link.attackPercent}%·체력 ${p.link.hpPercent}%·전용 방벽 ${p.link.shieldPercent}%. 자연 행동 속도 ${p.speedScale}배, 아군 카드 4행동마다 용병 ${p.actionCredit*4}회 추가 행동. 자기 행동마다 에너지 ${p.actionEnergy} 회복, 스킬 효과 ${percent}%·비용 ${p.skill.balance.cost}·재사용 ${p.skill.balance.cooldownTurns}행동이며 다단 기술은 후속타까지 나누어 적용합니다. PVP 스킬 상한 보정은 ${p.pvpSkillCapScale}배입니다.${basic}${barrier}${guard}`;
}
