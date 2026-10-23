import {JOKRO_COMBAT,JOKRO_AREA_SKILL} from './mercenary-jokro-v1.mjs';

// User-approved Eunseol: live SSS LIMITED, acquisition locked, no account grants.
export const EUNSEOL_CODE='V-973';
export const EUNSEOL_AREA_EVENT='MERCENARY_EUNSEOL_AREA';
export const EUNSEOL_AREA_MECHANIC='EUNSEOL_WHITE_TIGER_SWORD';
export const EUNSEOL_COMBAT=JOKRO_COMBAT;
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
 acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 1,940,890. 족로와 동일한 공격·체력·방벽·행동 속도·연계 기준. 개인 피해 80% 경감, 상태이상·반격 보호, 베르칸 피해 면역. PVE 백호 검술은 설백월참·백호천류·만월검역 연출을 순환하며 총 1,512% 피해를 생존한 적 전체에 나눠 대상당 한 번 적용합니다. 에너지 35 · 공통 재사용 5행동. PVP에서는 일반 공격을 사용합니다. 대기 자세 고정·전신 아우라·모션 2배속. 현재 획득 불가.'
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
