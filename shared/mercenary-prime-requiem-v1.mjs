import {ZERO_COMBAT} from './mercenary-zero-v1.mjs';

// User-approved V7 appearance, Zero parity, acquisition locked, 2026-10-21.
export const PRIME_CODE='V-975';
export const PRIME_AREA_EVENT='MERCENARY_PRIME_REQUIEM_AREA';
export const PRIME_AREA_MECHANIC='CRIMSON_ECLIPSE_BERSERKER';
export const PRIME_COMBAT=ZERO_COMBAT;
export const PRIME_PLAYBACK_RATE=2;
// PVE skill cadence is independent of the unchanged Zero-equivalent base stats.
export const PRIME_PVE_BALANCE=Object.freeze({version:3,damageRatio:30.24,cooldownTurns:3,cost:20});
export const PRIME_BASIC_FORMS=Object.freeze([
 {id:'MS-960',name:'혈섬 돌진',visualMode:'blood-dash'},
 {id:'MS-961',name:'혈영 연참',visualMode:'blood-echo'},
 {id:'MS-962',name:'혈검 난무',visualMode:'blood-frenzy'}
].map(s=>Object.freeze({...s,mechanic:'PRIME_REQUIEM_BASIC_FORM',target:'ENEMY',basicForm:true,
 balance:Object.freeze({damageRatio:PRIME_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const PRIME_AREA_SKILLS=Object.freeze([
 {id:'MS-963',name:'혈호 강림',visualMode:'blood-tiger'},
 {id:'MS-964',name:'혈영섬 · 참형',visualMode:'blood-execution'},
 {id:'MS-965',name:'혈천개벽',visualMode:'blood-cataclysm'},
 {id:'MS-966',name:'적월 무간참',visualMode:'blood-moonfall'}
].map(s=>Object.freeze({...s,mechanic:PRIME_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:PRIME_PVE_BALANCE})));
export const isPrime=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===PRIME_CODE;
export const primeActionCredit=actors=>actors.some(a=>isPrime(a)&&a.alive!==false&&a.hp>0)?PRIME_COMBAT.actionCredit:1;
export const primeIncomingDamage=(target,incoming)=>isPrime(target)?Math.floor(Math.max(0,Number(incoming)||0)*PRIME_COMBAT.damageTakenScale):incoming;
export const PRIME_ART=Object.freeze({
 code:PRIME_CODE,name:'프라임 레퀴엠',title:'적월의 광전사',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/prime-requiem-20261021/source-art.png',
 sourceArtSha256:'B2D1C5DF8553370EC9FF90D72E27562C404C24DCECF33935BB74F0EDC13D2FDC',
 battleSprite:'assets/ui/project-v/mercenaries/prime-requiem-20261021/idle.png',
 battleSpriteSha256:'EA00ECB24265DCF168F139361FF09D538486048A384A3BFF872E174479116830',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#ff163e',
 basePower:PRIME_COMBAT.basePower,skills:Object.freeze([...PRIME_BASIC_FORMS,...PRIME_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 3,000,000. 제로와 동일한 공격·생존·속도·연계 기준. 개인 피해 80% 경감, 상태이상·반격 보호. 혈섬 돌진·혈영 연참·혈검 난무가 일반 공격마다 순환하며 피해가 기존의 1.5배입니다. PVE 광역기 네 동작은 공통 재사용 3행동·에너지 20을 사용하며, 시전당 총 3,024% 피해를 생존한 적에게 나누어 한 번씩 적용합니다. 부서진 적월·흑염·붉은 네온. 현재 획득 불가.'
});
export const primeCodexSkills=()=>PRIME_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'일반 공격이 세 동작으로 순환합니다. 여러 검격도 기존의 1.5배로 강화한 일반 공격 한 번의 피해를 적용합니다.':'생존한 적 전체에 총 3,024% 피해를 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 혈섬 돌진 → 혈영 연참 → 혈검 난무':'PVE · 에너지 20 · 네 광역기 공통 재사용 3행동',
 counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function primeDeploymentSnapshot(){
 return {...PRIME_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',
 skills:structuredClone(PRIME_AREA_SKILLS),pendingSkillIds:[],primePolicyVersion:PRIME_COMBAT.version,primePvePolicyVersion:PRIME_PVE_BALANCE.version,
 deploymentVersion:'20261026-prime-requiem-skills-v3'};
}
