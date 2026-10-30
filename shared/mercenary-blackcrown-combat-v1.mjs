export const BLACKCROWN_COMBAT_VERSION='blackcrown-balance-60-20261031-v1';
export const BLACKCROWN_MECHANIC='BLACKCROWN_AUTHORED_CAST';
export const BLACKCROWN_EVENT='MERCENARY_BLACKCROWN_CAST';
export const BLACKCROWN_PLAYBACK_RATE=2;
// Independently owned tuning: 60% mean wins versus the six Bloodmoon SS units
// in mirrored, equal-condition server simulations. No opponent/account/seed
// lookup or outcome override. Reference codes record the original archetypes.
// Both skills still share one energy/cooldown budget and divide total damage.
const rows=[
 ['V-950','heeya','V-960',['흑관 관통','흑우 탄막'],[1,3],3.6409,4.4766],
 ['V-951','bongsoon','V-960',['녹옥 저격','녹옥 관통'],[1,2],3.4616,4.2561],
 ['V-952','joeun','V-960',['왕관 점사','흑관 파쇄'],[3,1],4.5821,4.875],
 ['V-953','diim','V-962',['자월 연격','월영 회수'],[1,1],4.72,5.6],
 ['V-954','sudaeng','V-960',['황금화관','흑염 결계'],[1,3],3.6409,4.4766],
 ['V-955','orikkung','V-960',['왕관 산탄','크라운 일제탄'],[1,3],3.6409,4.4766]
];
export const BLACKCROWN_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,slug,referenceCode,names,counts,speedScale,actionCredit],index)=>{
 const melee=referenceCode==='V-962',scale=melee?8.855:9.315;
 const baseline={position:melee?'FRONT':'BACK',role:melee?'VANGUARD':'RANGED',attackStyle:melee?'MELEE':'RANGED',
  basePower:356400,scale,speedScale,actionCredit,actionEnergy:10,pvpSkillCapScale:melee?3.565:3.7375,basicCapScale:1.955,pveSkillMinimumDamage:false,
  link:Object.freeze({attackPercent:Math.round(220*scale*100)/100,hpPercent:Math.round(280*scale*100)/100,shieldPercent:Math.round(150*scale*100)/100})};
 const balance=Object.freeze({damageRatio:melee?13.34:16.56,cooldownTurns:melee?1:2,cost:20});
 const skills=names.map((name,i)=>Object.freeze({id:'MS-'+(930+index*2+i),name,mechanic:BLACKCROWN_MECHANIC,
  visualMode:i?'skill2':'skill',targetCount:counts[i],target:`적 ${counts[i]}명`,ready:true,codexOnly:false,
  balance,
  trigger:`자기 행동 · 에너지 20 · 두 스킬 공통 재사용 ${balance.cooldownTurns}행동`,
  counterplay:'회피·방어·보호막과 기절·침묵에 대응됩니다.',bossRule:'서버의 보스·피해 상한 규칙 적용',
  procRule:'한 시전의 총 피해를 실제 대상에게 나눠 적용 · 대상마다 피해 1회'}));
 return [code,Object.freeze({...baseline,code,slug,referenceCode,skills:Object.freeze(skills),skill:skills[0],version:BLACKCROWN_COMBAT_VERSION})];
})));
export const blackcrownProfile=actor=>actor?.isMercenary===true&&Object.hasOwn(BLACKCROWN_COMBAT,actor.code||actor.cardId)?BLACKCROWN_COMBAT[actor.code||actor.cardId]:null;
export const isBlackcrown=actor=>Boolean(blackcrownProfile(actor));
export const blackcrownSkill=(actor,skill)=>blackcrownProfile(actor)?.skills.find(s=>s.id===skill?.id&&s.mechanic===skill?.mechanic)??null;
export const blackcrownCombatDescription=code=>{
 const p=BLACKCROWN_COMBAT[code];
 return p?`기본 전투력 356,400 · 블랙크라운 전용 전투 보정. 표시·성장 등급 SS, 전투 등급 보정 일반 SSS. 자연 행동 속도 ${p.speedScale}배·아군 카드 1행동당 ${p.actionCredit}회 추가 행동·자기 행동 에너지 10 회복. 각 스킬 총 ${Math.round(p.skill.balance.damageRatio*100).toLocaleString('ko-KR')}%를 실제 대상에게 분배하며 에너지 20·공통 재사용 ${p.skill.balance.cooldownTurns}행동. 보유 즉시 PVE·PVP 편성 가능. 적을 향한 고정 대기·모션 2배속.`:'';
};
