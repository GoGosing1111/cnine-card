import {PRIME_COMBAT} from './mercenary-prime-requiem-v1.mjs';
import {PRIME_ZERO_PVP,ZERO_PRIME_GENERAL_JOK_PRIORITY} from './mercenary-zero-v1.mjs';

// Balance preparation only. V-966 is separate from the released Helios V-999.
// No catalog, acquisition or deployment registry is enabled by this module.
export const HELIOS_KING_CODE='V-966';
export const HELIOS_KING_AREA_EVENT='MERCENARY_HELIOS_KING_AREA';
export const HELIOS_KING_AREA_MECHANIC='HELIOS_KING_ROYAL_ARSENAL';
const powerScale=3500000/PRIME_COMBAT.basePower;
export const HELIOS_KING_COMBAT=Object.freeze({
 ...PRIME_COMBAT,version:1,basePower:3500000,basicDamageScale:1.65,
 statScale:PRIME_COMBAT.statScale*powerScale,
 basicCapScale:PRIME_COMBAT.basicCapScale*powerScale,
 link:Object.freeze({
  attackPercent:PRIME_COMBAT.link.attackPercent*powerScale,
  hpPercent:PRIME_COMBAT.link.hpPercent*powerScale,
  shieldPercent:(PRIME_COMBAT.link.shieldPercent+60)*powerScale-60
 }),motionPlaybackRate:1,effectPlaybackRate:1
});
export const HELIOS_KING_PVP=Object.freeze({...PRIME_ZERO_PVP,version:'20261106-helios-king-pvp-v1'});
export const HELIOS_KING_GENERAL_JOK_PRIORITY=Object.freeze({
 ...ZERO_PRIME_GENERAL_JOK_PRIORITY,
 attackFloorScale:ZERO_PRIME_GENERAL_JOK_PRIORITY.attackFloorScale*powerScale,
 durabilityFloorScale:ZERO_PRIME_GENERAL_JOK_PRIORITY.durabilityFloorScale*powerScale
});
export const HELIOS_KING_PVE_BALANCE=Object.freeze({version:1,cooldownTurns:3,cost:20});
export const HELIOS_KING_BASIC_FORMS=Object.freeze([
 {id:'MS-905',name:'왕검 사출',visualMode:'royal_swords'},
 {id:'MS-906',name:'천창 관통',visualMode:'sovereign_lance'}
].map(s=>Object.freeze({...s,mechanic:'HELIOS_KING_BASIC_FORM',target:'ENEMY',basicForm:true,
 balance:Object.freeze({damageRatio:HELIOS_KING_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const HELIOS_KING_AREA_SKILLS=Object.freeze([
 {id:'MS-907',name:'왕의 군세',visualMode:'kings_arsenal',damageRatio:37.8,damageCapScale:2.5},
 {id:'MS-908',name:'천검 강림',visualMode:'heavenly_descent',damageRatio:45.36,damageCapScale:3}
].map(({damageRatio,...s})=>Object.freeze({...s,mechanic:HELIOS_KING_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({...HELIOS_KING_PVE_BALANCE,damageRatio})})));
export const isHeliosKing=a=>a?.isMercenary===true&&(a.code||a.cardId)===HELIOS_KING_CODE;
export const heliosKingActionCredit=actors=>actors.some(a=>isHeliosKing(a)&&a.alive!==false&&a.hp>0)?HELIOS_KING_COMBAT.actionCredit:1;
export const heliosKingIncomingDamage=(target,incoming)=>isHeliosKing(target)?Math.floor(Math.max(0,Number(incoming)||0)*HELIOS_KING_COMBAT.damageTakenScale):incoming;
export const HELIOS_KING_ART=Object.freeze({
 code:HELIOS_KING_CODE,name:'헬리오스 킹',title:'황금 왕권',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:true,releaseStatus:'BALANCE_PREPARED_NOT_RELEASED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/approved-20261103/helios-king-source-art-approved-v1.png',
 sourceArtSha256:'401bf907f1cfb1913eab358148ec9d2847bfaf46b65c00488c57efd23058253c',
 battleSprite:'preview/v35-helios-king-20261106/layers/art/body-v1.png',
 basePower:HELIOS_KING_COMBAT.basePower,skills:Object.freeze([...HELIOS_KING_BASIC_FORMS,...HELIOS_KING_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:false,
 combatLinkDescription:'기본 전투력 3,500,000. 프라임 레퀴엠보다 공격·체력·방어·연계 예산이 16.67% 높습니다. 왕검 사출·천창 관통은 165% 일반 공격으로 순환합니다. 왕의 군세는 총 3,780%, 천검 강림은 총 4,536% 피해를 생존한 적에게 나누어 대상당 한 번 적용합니다. PVE 광역기 두 개가 에너지 20·재사용 3행동을 공유합니다. 개인 피해 80% 경감·상태이상·반격 보호·행동 3.12배. PVP는 일반 공격을 사용하며 프라임의 공격 30%·체력/방벽 500% 보정과 제너럴 족 상대 우위 정책을 계승합니다. 제작본 밸런스이며 운영 미등록.'
});
export function heliosKingPreviewSnapshot(){
 return {...HELIOS_KING_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',
  skills:structuredClone(HELIOS_KING_AREA_SKILLS),pendingSkillIds:[],heliosKingPolicyVersion:HELIOS_KING_COMBAT.version,
  deploymentVersion:'20261106-helios-king-350-preview-v1'};
}
