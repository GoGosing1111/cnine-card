import {BLOODMOON_COMBAT} from './mercenary-bloodmoon-combat-v1.mjs';

export const BLACKCROWN_COMBAT_VERSION='blackcrown-live-20261027-v1';
export const BLACKCROWN_MECHANIC='BLACKCROWN_AUTHORED_CAST';
export const BLACKCROWN_EVENT='MERCENARY_BLACKCROWN_CAST';
export const BLACKCROWN_PLAYBACK_RATE=2;
// Current Bloodmoon SS ranged/duelist baselines. Two alternate skills share
// one energy/cooldown budget; extra projectiles never multiply a cast's damage.
const rows=[
 ['V-950','heeya','V-960',['흑관 관통','흑우 탄막'],[1,3]],
 ['V-951','bongsoon','V-960',['녹옥 저격','녹옥 관통'],[1,2]],
 ['V-952','joeun','V-960',['왕관 점사','흑관 파쇄'],[3,1]],
 ['V-953','diim','V-962',['자월 연격','월영 회수'],[1,1]],
 ['V-954','sudaeng','V-960',['황금화관','흑염 결계'],[1,3]],
 ['V-955','orikkung','V-960',['왕관 산탄','크라운 일제탄'],[1,3]]
];
export const BLACKCROWN_COMBAT=Object.freeze(Object.fromEntries(rows.map(([code,slug,referenceCode,names,counts],index)=>{
 const reference=BLOODMOON_COMBAT[referenceCode];
 const {skill:referenceSkill,...baseline}=reference;
 const skills=names.map((name,i)=>Object.freeze({id:'MS-'+(930+index*2+i),name,mechanic:BLACKCROWN_MECHANIC,
  visualMode:i?'skill2':'skill',targetCount:counts[i],target:`적 ${counts[i]}명`,ready:true,codexOnly:false,
  balance:Object.freeze({...referenceSkill.balance}),
  trigger:`자기 행동 · 에너지 20 · 두 스킬 공통 재사용 ${referenceSkill.balance.cooldownTurns}행동`,
  counterplay:'회피·방어·보호막과 기절·침묵에 대응됩니다.',bossRule:'서버의 보스·피해 상한 규칙 적용',
  procRule:'한 시전의 총 피해를 실제 대상에게 나눠 적용 · 대상마다 피해 1회'}));
 return [code,Object.freeze({...baseline,code,slug,referenceCode,skills:Object.freeze(skills),skill:skills[0],version:BLACKCROWN_COMBAT_VERSION})];
})));
export const blackcrownProfile=actor=>actor?.isMercenary===true&&Object.hasOwn(BLACKCROWN_COMBAT,actor.code||actor.cardId)?BLACKCROWN_COMBAT[actor.code||actor.cardId]:null;
export const isBlackcrown=actor=>Boolean(blackcrownProfile(actor));
export const blackcrownSkill=(actor,skill)=>blackcrownProfile(actor)?.skills.find(s=>s.id===skill?.id&&s.mechanic===skill?.mechanic)??null;
export const blackcrownCombatDescription=code=>{
 const p=BLACKCROWN_COMBAT[code];
 return p?`기본 전투력 356,400 · 블러드문 SS ${p.referenceCode==='V-962'?'디임':'봉순'} 기준. 표시·성장 등급 SS, 전투 등급 보정 일반 SSS. 자연 행동 속도 ${p.speedScale}배·아군 카드 1행동당 ${p.actionCredit}회 추가 행동·자기 행동 에너지 10 회복. 각 스킬 총 ${Math.round(p.skill.balance.damageRatio*100).toLocaleString('ko-KR')}%를 실제 대상에게 분배하며 에너지 20·공통 재사용 ${p.skill.balance.cooldownTurns}행동. 보유 즉시 PVE·PVP 편성 가능. 적을 향한 고정 대기·모션 2배속.`:'';
};
