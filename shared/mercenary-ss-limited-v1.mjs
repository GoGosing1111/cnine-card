// SS is the collection/growth rank. These seven limited fighters compete in
// the ordinary SSS combat tier; release/acquisition flags remain separate.
export const SS_LIMITED_BALANCE_VERSION=4;
export const SS_LIMITED_TARGET=Object.freeze({minWinRate:.85,maxWinRate:.925,referenceTier:'SSS',excludes:Object.freeze(['V-996','V-999']),matchups:Object.freeze({
 'V-021':Object.freeze({min:1,max:1}), 'V-046':Object.freeze({min:1,max:1}),
 'V-049':Object.freeze({min:.70,max:.85}), 'V-055':Object.freeze({min:.70,max:.85})
})});
// Equal-condition validation: no losses to Omega/Ragniel, competitive upper-SSS
// matchups. Bands are implementation acceptance criteria, not live win quotas.
// These server-owned entry modifiers
// affect only SS limited linkage; they never inspect an account, RNG or winner.
export const SS_LIMITED_PVP_LINK_SCALES=Object.freeze(Object.fromEntries([
 ['V-990',3,3,.1588,.1009],['V-991',3,3,.124,.3958],['V-992',3,3,.1588,.5518],
 ['V-993',3,3,.205,.205],['V-994',3,3,.1356,.3958],['V-997',3,3,.2975,.3438],['V-998',3,3,.1356,.205]
].map(([code,omega,ragniel,cryvern,berkan])=>[code,Object.freeze({'V-021':omega,'V-046':ragniel,'V-049':cryvern,'V-055':berkan})])));
// Two reserved actions per allied card action, and doubled natural speed.
// Per-action energy sustains multi-action skills without counting visual hits.
export const SS_LIMITED_TEMPO=Object.freeze({speedScale:2,actionCredit:2});
const rows=[
 ['V-990','BACK','SNIPER','RANGED','빙결 저격','LOCKED_THREAT_SHOT',2.04125],
 ['V-991','BACK','SNIPER','RANGED','청광 레일포','OBSERVED_SHIELD_BREAK',1.6575],
 ['V-992','BACK','CASTER','CAST','자수정 나선','RIFT_MARK_DETONATION',1.355625],
 ['V-993','BACK','RANGED','RANGED','황금 석궁','DISTRIBUTED_CORAL_VOLLEY',1.81875],
 ['V-994','BACK','CASTER','CAST','월광 결정','TIDAL_BARRAGE',1.6575],
 ['V-997','FRONT','VANGUARD','MELEE','리미티드 낫 베기','WOUNDED_MOON_DRAW',1.70875],
 ['V-998','BACK','RANGED','RANGED','리미티드 연속 사격','TWO_BEAT_FOLLOWUP',1.6275]
];
export const SS_LIMITED_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,position,role,attackStyle,name,mechanic,scale])=>[code,Object.freeze({
 code,position,role,attackStyle,scale,basePower:180000,actionEnergy:10,pvpSkillCapScale:1.5,
 link:Object.freeze({attackPercent:220*scale,shieldPercent:150*scale,hpPercent:280*scale}),
 skill:Object.freeze({id:'MS-'+code.slice(2),name,mechanic,balance:Object.freeze({damageRatio:5.6,cooldownTurns:2,cost:20})})
})])));
export const ssLimitedProfile=actor=>actor?.isMercenary===true&&Object.hasOwn(SS_LIMITED_COMBAT,actor.code||actor.cardId)?SS_LIMITED_COMBAT[actor.code||actor.cardId]:null;
export function ssLimitedPvpLinkScale(actor,teams){
 const profile=ssLimitedProfile(actor);
 if(!profile||actor.battleMode!=='PVP'||actor.statMode!=='RANK_FIXED')return 1;
 const opponents=teams.flat().filter(other=>other.side!==actor.side&&other.isMercenary&&other.statMode==='RANK_FIXED'&&other.battleMode==='PVP'&&other.alive!==false&&other.hp>0);
 if(!opponents.length)return 1;
 // A duo uses the arithmetic mean of its opposing lineup; other mercenaries
 // contribute the unchanged 1x rule. Freeze once before any combat actions.
 const row=SS_LIMITED_PVP_LINK_SCALES[profile.code];
 return opponents.reduce((sum,other)=>sum+(Object.hasOwn(row,other.code)?row[other.code]:1),0)/opponents.length;
}
export const ssLimitedActionCredit=actors=>actors.some(a=>ssLimitedProfile(a)&&a.statMode==='RANK_FIXED'&&a.alive!==false&&a.hp>0)?SS_LIMITED_TEMPO.actionCredit:1;
export const ssLimitedCombatDescription=code=>Object.hasOwn(SS_LIMITED_COMBAT,code)?'표시 등급은 SS이며 전투 등급 보정은 일반 SSS 기준입니다. PVE·PVP 모두 아군 일반 카드 1회 행동당 용병이 2회 추가 행동하며 자연 행동 속도에도 2배를 적용합니다. 자기 행동 시작마다 에너지 10을 회복하고, 스킬 비용은 20·재사용 대기는 자기 2행동입니다. 연속 스킬은 후속타를 마친 뒤 다시 시전하며 추가 비용은 없습니다. PVP 스킬 피해 상한은 기존의 1.5배입니다. 일반 SSS 상대의 연계 공격·체력·방벽은 상대 구성에 따라 보정하며 듀오는 상대 구성의 평균을 적용합니다. SSS 리미티드는 이 비교 기준에서 제외합니다.':'';
// Use exact catalog identities; a client-supplied tier/edition/name cannot opt in.
export const mercenaryCombatRank=actor=>ssLimitedProfile(actor)?'SSS':actor?.rank;
