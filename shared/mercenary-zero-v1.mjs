import {LEONEL_COMBAT} from './mercenary-leonel-v1.mjs';

// User-approved platinum blade wings; 3,000,000 power from 2026-10-25, acquisition OFF.
export const ZERO_CODE='V-976';
export const ZERO_AREA_EVENT='MERCENARY_ZERO_AREA';
export const ZERO_AREA_MECHANIC='PLATINUM_WINGS_SWORD_DOMAIN';
// Shared by Zero and Prime only; General Jok keeps his normal combat policy.
export const ZERO_PRIME_GENERAL_JOK_PRIORITY=Object.freeze({version:1,tierGuard:16,attackFloorScale:4,durabilityFloorScale:16,speedFloorScale:2});
export const ZERO_PRIME_GENERAL_JOK_DESCRIPTION=' PVP에서 상대 용병이 모두 제너럴 족이면 연계 공격 4배·연계 체력과 방벽 16배의 우위를 얻습니다. 상대의 성장·장비 적용 후 공격력의 최소 4배, 최대 체력·방벽의 최소 16배를 보장하며, 카드 연계 추가 행동을 포함한 상대 행동 속도의 최소 2배로 대응합니다. 이 우위는 전투 시작 시 고정됩니다.';
const powerScale=3000000/LEONEL_COMBAT.basePower;
export const ZERO_COMBAT=Object.freeze({...LEONEL_COMBAT,version:3,basePower:3000000,basicDamageScale:1.5,areaDamageCapScale:2,
 statScale:LEONEL_COMBAT.statScale*powerScale,basicCapScale:LEONEL_COMBAT.basicCapScale*powerScale,
 link:Object.freeze({attackPercent:LEONEL_COMBAT.link.attackPercent*powerScale,hpPercent:LEONEL_COMBAT.link.hpPercent*powerScale,
  shieldPercent:(LEONEL_COMBAT.link.shieldPercent+60)*powerScale-60}),motionPlaybackRate:1});
export const ZERO_AREA_SKILLS=Object.freeze([
 Object.freeze({id:'MS-976',name:'천검 포위',visualMode:'array',mechanic:ZERO_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:Object.freeze({damageRatio:30.24,cooldownTurns:5,cost:35})}),
 Object.freeze({id:'MS-975',name:'창천 종단',visualMode:'zenith',mechanic:ZERO_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:Object.freeze({damageRatio:30.24,cooldownTurns:5,cost:35})})
]);
export const ZERO_BASIC_FORMS=Object.freeze([
 {id:'MS-972',name:'청광 횡단',visualMode:'horizon'},
 {id:'MS-973',name:'섬광 연참',visualMode:'flurry'},
 {id:'MS-974',name:'용궤 검격',visualMode:'meteor'}
].map(s=>Object.freeze({...s,mechanic:'ZERO_BASIC_FORM',target:'ENEMY',basicForm:true,balance:Object.freeze({damageRatio:ZERO_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const isZero=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===ZERO_CODE;
export const zeroActionCredit=actors=>actors.some(a=>isZero(a)&&a.alive!==false&&a.hp>0)?ZERO_COMBAT.actionCredit:1;
export const zeroIncomingDamage=(target,incoming)=>isZero(target)?Math.floor(Math.max(0,Number(incoming)||0)*ZERO_COMBAT.damageTakenScale):incoming;
export const ZERO_ART=Object.freeze({
 code:ZERO_CODE,name:'제로',title:'백금 검익',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/zero-20261020/source-art.png',
 sourceArtSha256:'D9EBF2DD04DE55D7EBA230617BBE81B11C1EAF6E728D61BB32D892ECC82D0159',
 battleSprite:'assets/ui/project-v/mercenaries/zero-20261020/idle.png',
 battleSpriteSha256:'3D2A3CB1814FC75AB99FAD6E144468560EBF66D10FEAC6219B4F9CAC4DB231A9',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#a8ecff',
 basePower:ZERO_COMBAT.basePower,skills:Object.freeze([...ZERO_BASIC_FORMS,...ZERO_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 3,000,000. 공격·체력·방어·연계는 전투력에 비례하며 기존 속도와 행동 주기를 유지합니다. 개인 피해 80% 경감, 상태이상·반격 보호. 청광 횡단·섬광 연참·용궤 검격이 일반 공격마다 순환하며 피해가 기존의 1.5배입니다. PVE 천검 포위·창천 종단은 교대로 발동하며, 각 시전의 총 3,024% 피해를 생존한 적 전체에 나누어 적용합니다. 두 광역기는 에너지 35·재사용 5행동을 공유합니다. 백금 검익·흰 망토·흰 네온 윤곽. 현재 획득 불가.'+ZERO_PRIME_GENERAL_JOK_DESCRIPTION
});
export const zeroCodexSkills=()=>ZERO_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'일반 공격이 세 동작으로 순환합니다. 여러 검격도 기존의 1.5배로 강화한 일반 공격 한 번의 피해를 적용합니다.':'생존한 적 전체에 총 3,024% 피해를 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 청광 횡단 → 섬광 연참 → 용궤 검격':'PVE · 에너지 35 · 두 광역기 공통 재사용 5행동',
 counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function zeroDeploymentSnapshot(){
 return {...ZERO_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:structuredClone(ZERO_AREA_SKILLS),pendingSkillIds:[],zeroPolicyVersion:ZERO_COMBAT.version,deploymentVersion:'20261026-zero-skills-v3'};
}
