// SS is the collection/growth rank. These seven limited fighters compete in
// the ordinary SSS combat tier; release/acquisition flags remain separate.
export const SS_LIMITED_BALANCE_VERSION=2;
export const SS_LIMITED_TARGET=Object.freeze({minWinRate:.48,maxWinRate:.50,referenceTier:'SSS',excludes:Object.freeze(['V-996','V-999'])});
// Mean ordinary SSS cadence: Omega-X/Ragniel/Cryvern 1, Berkan 1.25.
// Apply to natural speed and reserved turns equally in PVE/PVP. This is
// seventeen actions per sixteen allied card actions, not extra skill hits.
export const SS_LIMITED_TEMPO=Object.freeze({speedScale:1.0625,actionCredit:1.0625});
const rows=[
 ['V-990','BACK','SNIPER','RANGED','빙결 저격','LOCKED_THREAT_SHOT',1.633],
 ['V-991','BACK','SNIPER','RANGED','청광 레일포','OBSERVED_SHIELD_BREAK',1.326],
 ['V-992','BACK','CASTER','CAST','자수정 나선','RIFT_MARK_DETONATION',1.0845],
 ['V-993','BACK','RANGED','RANGED','황금 석궁','DISTRIBUTED_CORAL_VOLLEY',1.455],
 ['V-994','BACK','CASTER','CAST','월광 결정','TIDAL_BARRAGE',1.326],
 ['V-997','FRONT','VANGUARD','MELEE','리미티드 낫 베기','WOUNDED_MOON_DRAW',1.367],
 ['V-998','BACK','RANGED','RANGED','리미티드 연속 사격','TWO_BEAT_FOLLOWUP',1.302]
];
export const SS_LIMITED_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,position,role,attackStyle,name,mechanic,scale])=>[code,Object.freeze({
 code,position,role,attackStyle,scale,basePower:180000,
 link:Object.freeze({attackPercent:220*scale,shieldPercent:150*scale,hpPercent:280*scale}),
 skill:Object.freeze({id:'MS-'+code.slice(2),name,mechanic,balance:Object.freeze({damageRatio:5.6,cooldownTurns:5,cost:35})})
})])));
export const ssLimitedProfile=actor=>actor?.isMercenary===true&&Object.hasOwn(SS_LIMITED_COMBAT,actor.code||actor.cardId)?SS_LIMITED_COMBAT[actor.code||actor.cardId]:null;
export const ssLimitedActionCredit=actors=>actors.some(a=>ssLimitedProfile(a)&&a.statMode==='RANK_FIXED'&&a.alive!==false&&a.hp>0)?SS_LIMITED_TEMPO.actionCredit:1;
export const ssLimitedCombatDescription=code=>Object.hasOwn(SS_LIMITED_COMBAT,code)?'표시 등급은 SS이며 전투 성능과 등급 보정은 일반 SSS 기준입니다. PVE·PVP 모두 일반 SSS 4종의 평균 행동 속도를 적용해 아군 일반 카드 16회 행동당 용병이 17회 추가 행동합니다. 스킬 비용은 에너지 35, 재사용 대기는 용병 자신의 5행동입니다. SSS 리미티드는 이 비교 기준에서 제외합니다.':'';
// Use exact catalog identities; a client-supplied tier/edition/name cannot opt in.
export const mercenaryCombatRank=actor=>ssLimitedProfile(actor)?'SSS':actor?.rank;
