export const REVAN_CODE='V-971';
export const REVAN_VERSION='20261027-revan-general-jok-v2';
export const REVAN_PLAYBACK_RATE=2;
export const REVAN_AREA_EVENT='MERCENARY_REVAN_AREA';
export const REVAN_AREA_MECHANIC='REVAN_BLACK_RED_RUPTURE';
// Snapshot General Jok's current combat numbers; later balance changes remain independent.
export const REVAN_COMBAT=Object.freeze({
 version:2,basePower:2700000,statsReferencePower:1123200,statScale:2.403845658435048,
 speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,
 motionPlaybackRate:REVAN_PLAYBACK_RATE,effectPlaybackRate:REVAN_PLAYBACK_RATE,
 link:Object.freeze({attackPercent:4399.999093199512,hpPercent:2799.9994229451436,shieldPercent:1589.9996599498172}),
 basicCapScale:4.807691316870096,damageTakenScale:.2,basicDamageScale:1.5,areaDamageCapScale:2
});
export const REVAN_PVE_BALANCE=Object.freeze({damageRatio:30.24,cooldownTurns:3,cost:20});
export const REVAN_BASIC_FORMS=Object.freeze([
 {id:'MS-927',name:'단죄',visualMode:'danjoe'},
 {id:'MS-928',name:'흑월',visualMode:'heukwol'}
].map(s=>Object.freeze({...s,mechanic:'REVAN_BASIC_FORM',target:'ENEMY',basicForm:true,
 balance:Object.freeze({damageRatio:REVAN_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const REVAN_AREA_FORMS=Object.freeze([{id:'MS-929',name:'종언',visualMode:'jongeon'},{id:'MS-926',name:'멸참',visualMode:'myeol'}].map(s=>Object.freeze({...s,mechanic:REVAN_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,sharedCooldown:'MS-929',balance:REVAN_PVE_BALANCE})));
// Both area techniques alternate on General Jok's shared energy/cooldown budget.
export const REVAN_AREA_SKILL=Object.freeze({...REVAN_AREA_FORMS[0],presentationVariants:REVAN_AREA_FORMS});
export const isRevan=a=>a?.isMercenary===true&&(a.code||a.cardId)===REVAN_CODE;
export const revanActionCredit=actors=>actors.some(a=>isRevan(a)&&a.alive!==false&&a.hp>0)?REVAN_COMBAT.actionCredit:1;
export function revanIncomingDamage(target,incoming,source){
 if(!isRevan(target))return incoming;
 return Math.floor(Math.max(0,Number(incoming)||0)*REVAN_COMBAT.damageTakenScale);
}
export const REVAN_ART=Object.freeze({
 code:REVAN_CODE,name:'레반',title:'검은 단죄',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/reaper-mask-20261027/source-art-approved-v9.png',
 thumbnailArt:'assets/ui/project-v/mercenaries/reaper-mask-20261027/source-art-approved-v9.png',
 sourceArtSha256:'BB9E25AA8E9E0A838672085A0A43F1643269CA4D6AAB91F8458016FFE6ED2AD5',
 battleSprite:'assets/ui/project-v/mercenaries/revan-20261027/assets/body-ready-v1.png',
 battleSpriteSha256:'6EF692D0BAEA52C056C6B831C4CE8EF571C969265D19AD9C33A6707E74E420A4',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#e93248',
 basePower:REVAN_COMBAT.basePower,skills:Object.freeze([...REVAN_BASIC_FORMS,...REVAN_AREA_FORMS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 2,700,000. 제너럴 족 기준의 공격·생존·행동·연계·피해 상한을 사용합니다. 아군 카드 행동당 3.12회 추가 행동, 개인 피해 80% 경감, 상태이상·반격 보호. 단죄와 흑월은 단일 공격마다 순환하며 기존 일반 공격의 1.5배 피해를 한 번 적용합니다. PVE 종언·멸참은 번갈아 총 3,024% 피해를 생존한 적 전체에 나누어 적용합니다(에너지 20 · 공통 재사용 3행동). 검은 연무·붉은 균열 아우라와 고정 대검. 모션 2배속. 현재 일반 획득 불가.'
});
export const revanCodexSkills=()=>REVAN_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?(s.visualMode==='danjoe'?'전진 대검 베기로 적 한 명에게 기존 일반 공격의 1.5배 피해를 한 번 적용합니다.':'올려 베기와 내려찍기로 적 한 명을 공격합니다. 두 참격은 기존 일반 공격의 1.5배 피해를 한 번 적용합니다.'):(s.visualMode==='myeol'?'대검을 횡으로 휘둘러 거대한 검기로 적진 전체를 가릅니다. ':'대검을 내려찍어 전장 전체를 파열합니다. ')+'총 3,024% 피해를 나누어 대상당 한 번 적용하며 두 광역기를 번갈아 사용합니다.',
 trigger:s.basicForm?'일반 공격 · 단죄 → 흑월 순환':'PVE · 에너지 20 · 종언/멸참 공통 재사용 3행동',
 counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용 · 모션 2배속은 행동·피해 횟수를 늘리지 않습니다.'}));
export function revanDeploymentSnapshot(){return {...REVAN_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',
 skills:[structuredClone(REVAN_AREA_SKILL)],pendingSkillIds:[],revanPolicyVersion:REVAN_COMBAT.version,deploymentVersion:REVAN_VERSION};}
