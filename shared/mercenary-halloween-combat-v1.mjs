// Owner requested Halloween SS above the existing SS limited tier (2026-10-17).
// Collection rank and five-copy seasonal stock are independent of combat power.
export const HALLOWEEN_COMBAT_VERSION=1;
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
export const HALLOWEEN_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,position,role,attackStyle,name,mechanic,effect])=>{const scale=position==='FRONT'&&role==='VANGUARD'?4:role==='GUARD'?2.45:3;return [code,Object.freeze({
 code,position,role,attackStyle,basePower:216000,scale,speedScale:2.25,actionCredit:2.25,actionEnergy:10,pvpSkillCapScale:1.8,
 link:Object.freeze({attackPercent:220*scale,shieldPercent:150*scale,hpPercent:280*scale}),
 skill:Object.freeze({id:'MS-'+code.slice(2),name,mechanic,effect,target:mechanic==='FRONT_SHARED_BARRIER'?'아군 전열':'적 표적',
  trigger:'에너지와 재사용 조건을 충족한 자기 행동',counterplay:'회피·방어·보호막 및 행동 순서의 영향을 받습니다.',bossRule:'동일한 피해·보호막 규칙을 사용합니다.',procRule:'후속타는 새 비용 없이 처리하며 추가 시전을 재귀 발동하지 않습니다.',ready:true,
  balance:Object.freeze({damageRatio:6.72,cooldownTurns:2,cost:20})})
})];})));
export const halloweenCombatDescription=code=>Object.hasOwn(HALLOWEEN_COMBAT,code)?`할로윈 SS 리미티드 · 기본 전투력 216,000(기존 SS 리미티드 대비 20% 증가). 표시·성장 등급은 SS, 전투 등급 보정은 일반 SSS 기준입니다. 연계 공격 ${HALLOWEEN_COMBAT[code].link.attackPercent}%·체력 ${HALLOWEEN_COMBAT[code].link.hpPercent}%·전용 방벽 ${HALLOWEEN_COMBAT[code].link.shieldPercent}%. 자연 행동 속도 2.25배, 아군 카드 4행동마다 용병 9회 추가 행동. 자기 행동마다 에너지 10 회복, 스킬 효과 672%·비용 20·재사용 2행동이며 다단 기술은 후속타까지 나누어 적용합니다. PVP 스킬 상한 보정은 1.8배입니다.${code==='V-984'?` 성야의 방패는 PVP에서 부여량이 ${Math.round((1-HALLOWEEN_DIIM_PVP_BARRIER.amountScale)*100)}% 감소하여 공격력 ${(HALLOWEEN_COMBAT[code].skill.balance.damageRatio*HALLOWEEN_DIIM_PVP_BARRIER.amountScale*100).toFixed(1)}%를 전열에 나눠 부여합니다. 시작 방벽과 PVE의 672% 방벽은 유지됩니다.`:''}`:'';
