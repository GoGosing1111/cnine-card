export const HAKUYA_CODE='V-967';
export const HAKUYA_VERSION='20261108-hakuya-tempo-v3';
export const HAKUYA_PLAYBACK_RATE=2;
export const HAKUYA_AREA_EVENT='MERCENARY_HAKUYA_AREA';
export const HAKUYA_AREA_MECHANIC='HAKUYA_SWORD_SOVEREIGN';
// Revan's damage and durability form the baseline. Hakuya has its own action rate.
export const HAKUYA_COMBAT=Object.freeze({
 version:3,basePower:2700000,statsReferencePower:1123200,statScale:2.403845658435048,
 speedReferencePower:1080000,speedScale:4.5,actionCredit:4.5,
 motionPlaybackRate:HAKUYA_PLAYBACK_RATE,effectPlaybackRate:HAKUYA_PLAYBACK_RATE,
 link:Object.freeze({attackPercent:4399.999093199512,hpPercent:2799.9994229451436,shieldPercent:1589.9996599498172}),
 basicCapScale:4.807691316870096,damageTakenScale:.2,basicDamageScale:1.5,areaDamageCapScale:2
});
export const HAKUYA_PVE_BALANCE=Object.freeze({damageRatio:30.24,cooldownTurns:2,cost:10});
export const HAKUYA_BASIC_FORMS=Object.freeze([
 {id:'MS-909',name:'절광발도',visualMode:'skill_flash'},
 {id:'MS-910',name:'삼첩관통',visualMode:'skill_thrust'}
].map(s=>Object.freeze({...s,mechanic:'HAKUYA_BASIC_FORM',target:'ENEMY',basicForm:true,
 balance:Object.freeze({damageRatio:HAKUYA_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const HAKUYA_AREA_FORMS=Object.freeze([{id:'MS-911',name:'회천검압',visualMode:'skill_wheel'},{id:'MS-912',name:'만검낙성',visualMode:'skill_rain'}].map(s=>Object.freeze({...s,mechanic:HAKUYA_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,sharedCooldown:'MS-911',balance:HAKUYA_PVE_BALANCE})));
// One server skill alternates the two forms on the same cooldown.
export const HAKUYA_AREA_SKILL=Object.freeze({...HAKUYA_AREA_FORMS[0],presentationVariants:HAKUYA_AREA_FORMS});
export const isHakuya=a=>a?.isMercenary===true&&(a.code||a.cardId)===HAKUYA_CODE;
export const hakuyaActionCredit=actors=>actors.some(a=>isHakuya(a)&&a.alive!==false&&a.hp>0)?HAKUYA_COMBAT.actionCredit:1;
export function hakuyaIncomingDamage(target,incoming,source){
 if(!isHakuya(target))return incoming;
 return Math.floor(Math.max(0,Number(incoming)||0)*HAKUYA_COMBAT.damageTakenScale);
}
export const HAKUYA_ART=Object.freeze({
 code:HAKUYA_CODE,name:'하쿠야 신',title:'흑백의 검성',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/hakuya-shin-20261105/source-art-approved.png',
 thumbnailArt:'assets/ui/project-v/mercenaries/hakuya-shin-20261105/source-art-approved.png',
 sourceArtSha256:'813D9D05B870848B1C9A0B00345F37720D57354C67A8DA368010C72AA0AAD604',
 battleSprite:'assets/ui/project-v/mercenaries/hakuya-shin-20261105/body-ready.png',
 battleSpriteSha256:'3590B08DDC7FFF6EC4E3DC6E05E81F2CF29D95DEA987C0EC990283E2956A1BB1',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#e8e9ec',
 basePower:HAKUYA_COMBAT.basePower,skills:Object.freeze([...HAKUYA_BASIC_FORMS,...HAKUYA_AREA_FORMS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:`기본 전투력 2,700,000. 레반과 같은 공격·생존·연계·피해 상한. 자연 행동 속도는 ${HAKUYA_COMBAT.speedScale}배이며, 아군 카드 행동당 추가 행동 ${HAKUYA_COMBAT.actionCredit}회분을 얻습니다. 개인 피해 80% 경감·상태이상·반격 보호. 절광발도와 삼첩관통은 일반 공격마다 순환하며 1.5배 피해를 한 번 적용합니다. PVE 회천검압·만검낙성은 번갈아 총 3,024% 피해를 생존한 적 전체에 나누어 적용합니다. 두 광역기는 각각 에너지 ${HAKUYA_PVE_BALANCE.cost}을 소모하며 재사용 대기시간 ${HAKUYA_PVE_BALANCE.cooldownTurns}행동을 공유합니다. 흑백 검기 아우라·Spine 액션 2배속. 운영자 지정 지급 전용.`
});
export const hakuyaCodexSkills=()=>HAKUYA_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?(s.visualMode==='skill_flash'?'발도와 반전 검격으로 적 한 명에게 일반 공격의 1.5배 피해를 한 번 적용합니다.':'세 겹의 관통 검기로 적 한 명에게 일반 공격의 1.5배 피해를 한 번 적용합니다.'):(s.visualMode==='skill_wheel'?'회전 검압을 넓게 방출합니다. ':'거대한 검우를 적진에 낙하시킵니다. ')+'총 3,024% 피해를 나누어 대상당 한 번 적용하며 두 광역기를 번갈아 사용합니다.',
 trigger:s.basicForm?'일반 공격 · 절광발도 → 삼첩관통 순환':`PVE · 에너지 ${s.balance.cost} · 회천검압/만검낙성 공통 재사용 ${s.balance.cooldownTurns}행동`,
 counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용 · 모션 2배속은 행동·피해 횟수를 늘리지 않습니다.'}));
export function hakuyaDeploymentSnapshot(){return {...HAKUYA_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',
 skills:[structuredClone(HAKUYA_AREA_SKILL)],pendingSkillIds:[],hakuyaPolicyVersion:HAKUYA_COMBAT.version,deploymentVersion:HAKUYA_VERSION};}
