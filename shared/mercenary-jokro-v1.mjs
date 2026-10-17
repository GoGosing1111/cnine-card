import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// User release 2026-10-18: closed acquisition, one designated account, Jinmu upgrade.
export const JOKRO_CODE='V-979';
export const JOKRO_OWNER_ID=1;
export const JOKRO_AREA_EVENT='MERCENARY_JOKRO_AREA';
export const JOKRO_AREA_MECHANIC='AZURE_DRAGON_SKY_CLEAVE';
export const JOKRO_AREA_SKILL=Object.freeze({id:'MS-979',name:'청룡단천',mechanic:JOKRO_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:12.6,cooldownTurns:5,cost:35})});
export const JOKRO_COMBAT=Object.freeze({
 version:1,basePower:1617408,statsReferencePower:1123200,statScale:1.44,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,
 motionPlaybackRate:2,effectPlaybackRate:1,
 // Include the common +60% front shield before increasing the whole shield by 20%.
 link:Object.freeze({attackPercent:2635.776,hpPercent:1677.312,shieldPercent:928.416}),
 basicCapScale:2.88,damageTakenScale:.2,hardCounter:BERKAN_CODE
});
export const isJokro=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===JOKRO_CODE;
export const jokroAccountAllowed=(userId,code)=>code!==JOKRO_CODE||Number(userId)===JOKRO_OWNER_ID;
export const jokroActionCredit=actors=>actors.some(a=>isJokro(a)&&a.alive!==false&&a.hp>0)?JOKRO_COMBAT.actionCredit:1;
export function jokroIncomingDamage(target,incoming,source){
 if(!isJokro(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===JOKRO_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*JOKRO_COMBAT.damageTakenScale);
}
export const JOKRO_ART=Object.freeze({
 code:JOKRO_CODE,name:'족로',title:'SSS 리미티드 · 청룡의 발도',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'EXCLUSIVE_RELEASED',exclusiveGrant:true,excludedFromLimitedCount:true,
 sourceArt:'assets/ui/project-v/mercenaries/jokro-20261018/source-art.png',
 sourceArtSha256:'82297D41E879DAB7DF179345875EBF329A3E825BB20BD76C68BFBE91667DFBDB',
 battleSprite:'assets/ui/project-v/mercenaries/jokro-20261018/idle.png',
 battleSpriteSha256:'A1ECEAED8C5C5C427B6F3FB374E6B03EF0B10BEFAC64207CA24A26070DFB127D',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#66ffc2',
 basePower:JOKRO_COMBAT.basePower,skills:Object.freeze([JOKRO_AREA_SKILL]),acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'족로 · 지정 계정 전용 SSS 리미티드. 일반 획득 불가. 같은 편성·장비 기준 진무보다 기본·연계 공격력·체력·전용 방벽이 20% 높으며 전투 행동 속도는 동일합니다. 개인 피해 80% 경감, 상태이상·반격 보호, 베르칸 피해 면역. PVE 청룡단천은 생존한 적 전체에 총 1,260% 피해를 나눠 한 번씩 적용합니다(에너지 35 · 재사용 5행동). 발도 동작은 2배속, 이펙트는 원래 길이를 유지합니다.'
});
export function jokroDeploymentSnapshot(){
 return {...JOKRO_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:[structuredClone(JOKRO_AREA_SKILL)],pendingSkillIds:[],
  jokroPolicyVersion:1,deploymentVersion:'20261018-jokro-live-v1'};
}
