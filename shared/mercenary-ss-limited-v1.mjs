// SS is the collection/growth rank. These seven limited fighters compete in
// the ordinary SSS combat tier; release/acquisition flags remain separate.
export const SS_LIMITED_BALANCE_VERSION=1;
export const SS_LIMITED_TARGET=Object.freeze({minWinRate:.48,maxWinRate:.50,referenceTier:'SSS',excludes:Object.freeze(['V-996'])});
const rows=[
 ['V-990','BACK','SNIPER','RANGED','빙결 저격','LOCKED_THREAT_SHOT',1.633],
 ['V-991','BACK','SNIPER','RANGED','청광 레일포','OBSERVED_SHIELD_BREAK',1.3438],
 ['V-992','BACK','CASTER','CAST','자수정 나선','RIFT_MARK_DETONATION',1.0845],
 ['V-993','BACK','RANGED','RANGED','황금 석궁','DISTRIBUTED_CORAL_VOLLEY',1.4883],
 ['V-994','BACK','CASTER','CAST','월광 결정','TIDAL_BARRAGE',1.3438],
 ['V-997','FRONT','VANGUARD','MELEE','리미티드 낫 베기','WOUNDED_MOON_DRAW',1.367],
 ['V-998','BACK','RANGED','RANGED','리미티드 연속 사격','TWO_BEAT_FOLLOWUP',1.3321]
];
export const SS_LIMITED_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,position,role,attackStyle,name,mechanic,scale])=>[code,Object.freeze({
 code,position,role,attackStyle,scale,basePower:180000,
 link:Object.freeze({attackPercent:220*scale,shieldPercent:150*scale,hpPercent:280*scale}),
 skill:Object.freeze({id:'MS-'+code.slice(2),name,mechanic,balance:Object.freeze({damageRatio:5.6,cooldownTurns:5,cost:35})})
})])));
export const ssLimitedProfile=actor=>actor?.isMercenary===true&&Object.hasOwn(SS_LIMITED_COMBAT,actor.code||actor.cardId)?SS_LIMITED_COMBAT[actor.code||actor.cardId]:null;
// Use exact catalog identities; a client-supplied tier/edition/name cannot opt in.
export const mercenaryCombatRank=actor=>ssLimitedProfile(actor)?'SSS':actor?.rank;
