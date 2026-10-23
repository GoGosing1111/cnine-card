import {PRIME_COMBAT,PRIME_PVE_BALANCE} from './mercenary-prime-requiem-v1.mjs';

// User-approved V15; dedicated grant only, no public acquisition route.
export const GENERAL_JOK_CODE='V-974';
export const GENERAL_JOK_AREA_EVENT='MERCENARY_GENERAL_JOK_AREA';
export const GENERAL_JOK_AREA_MECHANIC='GENERAL_JOK_GOLDEN_ARSENAL';
export const GENERAL_JOK_COMBAT=PRIME_COMBAT;
export const GENERAL_JOK_PVE_BALANCE=PRIME_PVE_BALANCE;
export const GENERAL_JOK_PLAYBACK_RATE=2;
export const GENERAL_JOK_BASIC_FORMS=Object.freeze([
 {id:'MS-950',name:'대물 관통탄',visualMode:'attack'},
 {id:'MS-951',name:'황금 낙인탄',visualMode:'critical'}
].map(s=>Object.freeze({...s,mechanic:'GENERAL_JOK_BASIC_FORM',target:'ENEMY',basicForm:true,
 balance:Object.freeze({damageRatio:1,cooldownTurns:0,cost:0})})));
export const GENERAL_JOK_AREA_SKILLS=Object.freeze([
 {id:'MS-952',name:'황금 함대 · 종결 포격',visualMode:'ultimate'},
 {id:'MS-953',name:'M777 야포단',visualMode:'artillery'},
 {id:'MS-954',name:'황금 파쇄탄',visualMode:'breaker'},
 {id:'MS-955',name:'초고속 철갑탄',visualMode:'sabotage'},
 {id:'MS-956',name:'공중 산개탄',visualMode:'airburst'},
 {id:'MS-957',name:'제압 사격',visualMode:'barrage'}
].map(s=>Object.freeze({...s,mechanic:GENERAL_JOK_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:GENERAL_JOK_PVE_BALANCE})));
export const isGeneralJok=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===GENERAL_JOK_CODE;
export const generalJokActionCredit=actors=>actors.some(a=>isGeneralJok(a)&&a.alive!==false&&a.hp>0)?GENERAL_JOK_COMBAT.actionCredit:1;
export const generalJokIncomingDamage=(target,incoming)=>isGeneralJok(target)?Math.floor(Math.max(0,Number(incoming)||0)*GENERAL_JOK_COMBAT.damageTakenScale):incoming;
export const GENERAL_JOK_ART=Object.freeze({
 code:GENERAL_JOK_CODE,name:'제너럴 족',title:'황금 함대의 총사령관',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/general-jok-20261023/source-art.png',
 sourceArtSha256:'2FC1C16D414920E1F8576DE5A32A15B5C1A3E1DDCD57C464F60BE63E31BF16B8',
 battleSprite:'assets/ui/project-v/mercenaries/general-jok-20261023/idle.png',
 battleSpriteSha256:'0FA82890AC46D11459D72F80F8DFF256C6E5B8D6FCF8EFC1BC362B0F2DBF7609',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#ffd16b',
 basePower:GENERAL_JOK_COMBAT.basePower,skills:Object.freeze([...GENERAL_JOK_BASIC_FORMS,...GENERAL_JOK_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 2,300,000. 프라임 레퀴엠과 동일한 공격·생존·속도·연계 기준. 개인 피해 80% 경감, 상태이상·반격 보호. 대물 관통탄과 단일 급소를 꿰뚫는 황금 낙인탄이 일반 공격마다 순환합니다. PVE에서는 황금 함대·M777 야포단·파쇄탄·철갑탄·산개탄·제압 사격을 순환하며, 공통 재사용 3행동·에너지 20으로 총 1,512% 피해를 적 전체에 나눠 한 번씩 적용합니다. 황금 C9 깃발과 전신 네온 아우라. 모션 재생 2배. 현재 획득 불가.'
});
export const generalJokCodexSkills=()=>GENERAL_JOK_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'대물 관통탄과 황금 낙인탄이 순환합니다. 기립 반동과 넉백, 머리 위 황금 원숭이 타격 표식. 피해는 일반 공격 한 번입니다.':'생존한 적 전체에 총 1,512% 피해를 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 대물 관통탄 → 황금 낙인탄':'PVE · 에너지 20 · 여섯 광역기 공통 재사용 3행동',
 counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function generalJokDeploymentSnapshot(){
 return {...GENERAL_JOK_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'RANGED',
 skills:structuredClone(GENERAL_JOK_AREA_SKILLS),pendingSkillIds:[],generalJokPolicyVersion:1,
 deploymentVersion:'20261023-general-jok-live-v15'};
}
