// SS is the collection/growth rank. These seven limited fighters compete in
// the ordinary SSS combat tier; release/acquisition flags remain separate.
export const SS_LIMITED_BALANCE_VERSION=3;
export const SS_LIMITED_TARGET=Object.freeze({minWinRate:.525,maxWinRate:.575,referenceTier:'SSS',excludes:Object.freeze(['V-996','V-999']),matchups:Object.freeze({
 'V-021':Object.freeze({min:.55,max:.60}), 'V-046':Object.freeze({min:.55,max:.60}),
 'V-049':Object.freeze({min:.50,max:.55}), 'V-055':Object.freeze({min:.50,max:.55})
})});
// User-requested ordinary SSS matchup bands. These server-owned entry modifiers
// affect only SS limited linkage; they never inspect an account, RNG or winner.
export const SS_LIMITED_PVP_LINK_SCALES=Object.freeze(Object.fromEntries([
 ['V-990',0.9342,1.1734,1.273,0.8851],['V-991',0.8118,1.0389,1.1525,1.836],['V-992',0.8772,1.0536,1.1559,1.2146],
 ['V-993',0.8935,1.1096,1.3122,1.3236],['V-994',0.8118,1.0389,1.1525,1.836],['V-997',0.8352,1.0488,1.0787,2.5235],['V-998',0.8396,1.0536,1.1833,2.0231]
].map(([code,omega,ragniel,cryvern,berkan])=>[code,Object.freeze({'V-021':omega,'V-046':ragniel,'V-049':cryvern,'V-055':berkan})])));
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
export const ssLimitedCombatDescription=code=>Object.hasOwn(SS_LIMITED_COMBAT,code)?'표시 등급은 SS이며 전투 성능과 등급 보정은 일반 SSS 기준입니다. PVE·PVP 모두 일반 SSS 4종의 평균 행동 속도를 적용해 아군 일반 카드 16회 행동당 용병이 17회 추가 행동합니다. 일반 SSS를 상대하는 PVP는 상대 구성에 따라 연계 공격·체력·방벽을 보정하며 듀오는 상대 구성의 평균을 적용합니다. 스킬 비용은 에너지 35, 재사용 대기는 용병 자신의 5행동입니다. SSS 리미티드는 이 비교 기준에서 제외합니다.':'';
// Use exact catalog identities; a client-supplied tier/edition/name cannot opt in.
export const mercenaryCombatRank=actor=>ssLimitedProfile(actor)?'SSS':actor?.rank;
