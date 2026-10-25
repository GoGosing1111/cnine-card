import {JOKRO_AREA_SKILL} from './mercenary-jokro-v1.mjs';
import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// 2026-10-25: owned Eunseol may deploy in PVE and PVP; its area skill remains PVE-only.
export const EUNSEOL_CODE='V-973';
export const MERCENARY_DEPLOYMENT_MODE_VERSION='20261025-eunseol-bloodmoon-deployment';
export const PVE_ONLY_MERCENARY_CODES=Object.freeze([]);
export const mercenaryModeAllowed=(code,mode)=>!PVE_ONLY_MERCENARY_CODES.includes(code)||mode==='PVE';
export const MERCENARY_PVE_ONLY_REASON='이 용병은 PVE에만 편성할 수 있습니다.';

export const EUNSEOL_AREA_EVENT='MERCENARY_EUNSEOL_AREA';
export const EUNSEOL_AREA_MECHANIC='EUNSEOL_WHITE_TIGER_SWORD';
// Preserve the 2026-10-23 approved balance independently of later Jokro buffs.
export const EUNSEOL_COMBAT=Object.freeze({
 version:2,basePower:1940890,statsReferencePower:1123200,statScale:1.728,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,
 motionPlaybackRate:2,effectPlaybackRate:1,
 // Include the common +60% front shield before increasing the whole shield by 20%.
 link:Object.freeze({attackPercent:3162.9312,hpPercent:2012.7744,shieldPercent:1126.0992}),
 basicCapScale:3.456,damageTakenScale:.2,hardCounter:BERKAN_CODE
});
export const EUNSEOL_PLAYBACK_RATE=2;
export const EUNSEOL_AREA_VARIANTS=Object.freeze([
 {visualMode:'moon',name:'설백월참'},
 {visualMode:'tiger',name:'백호천류'},
 {visualMode:'domain',name:'만월검역'}
].map(Object.freeze));
// Three visual forms share this one server skill, energy cost and cooldown.
export const EUNSEOL_AREA_SKILL=Object.freeze({id:'MS-958',name:'백호 검술',mechanic:EUNSEOL_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:JOKRO_AREA_SKILL.balance,presentationVariants:EUNSEOL_AREA_VARIANTS});
export const isEunseol=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===EUNSEOL_CODE;
export const eunseolActionCredit=actors=>actors.some(a=>isEunseol(a)&&a.alive!==false&&a.hp>0)?EUNSEOL_COMBAT.actionCredit:1;
export function eunseolIncomingDamage(target,incoming,source){
 if(!isEunseol(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===EUNSEOL_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*EUNSEOL_COMBAT.damageTakenScale);
}
export const EUNSEOL_ART=Object.freeze({
 code:EUNSEOL_CODE,name:'은설',title:'백호의 검희',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/eunseol-20261023/source-art.png',
 sourceArtSha256:'6AA7E0309223ACDDC02CFAF0830EE45F39FFBA3F5736002B38071749A0E1A3FE',
 battleSprite:'assets/ui/project-v/mercenaries/eunseol-20261023/idle.png',
 battleSpriteSha256:'77AAF16CA9415CC218E4A074690B58AA9AECB597902C3CB32F1074491B1E2184',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#c3acff',
 basePower:EUNSEOL_COMBAT.basePower,skills:Object.freeze([EUNSEOL_AREA_SKILL]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,deploymentModes:Object.freeze(['PVE','PVP']),
 combatLinkDescription:'기본 전투력 1,940,890. 아군 카드 행동당 3.12회 추가 행동. 개인 피해 80% 경감, 상태이상·반격 보호, 베르칸 피해 면역. PVE 백호 검술은 설백월참·백호천류·만월검역 연출을 순환하며 총 1,512% 피해를 생존한 적 전체에 나눠 대상당 한 번 적용합니다. 에너지 35 · 공통 재사용 5행동. 보유 시 PVE·PVP에 편성할 수 있으며 백호 검술의 광역 효과는 PVE에서만 발동합니다. 대기 자세 고정·전신 아우라·모션 2배속.'
});
export const eunseolCodexSkills=()=>EUNSEOL_ART.skills.map(s=>({...s,ready:true,target:'적 전체',
 effect:'설백월참·백호천류·만월검역 연출이 순환하며 생존한 적 전체에 총 1,512% 피해를 나누어 대상당 한 번 적용합니다.',
 trigger:'PVE · 에너지 35 · 세 연출 공통 재사용 5행동',counterplay:'방어·보호막에 대응됩니다.',
 bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용 · PVP 광역 발동 없음'}));
export function eunseolDeploymentSnapshot(){
 return {...EUNSEOL_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',
 skills:[structuredClone(EUNSEOL_AREA_SKILL)],pendingSkillIds:[],eunseolPolicyVersion:1,
 deploymentVersion:'20261023-eunseol-live-v1'};
}
