import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// Direct grants: original owner, Inception and Bichon (2026-10-20 approvals).
// The recalled Heeya grant remains invalid. Authenticated Halloween pack
// recipients may also use one of four separate public copies.
// Keep this identity out of the ordinary and old limited acquisition pools.
export const JINMU_CODE='V-989';
export const JINMU_PACK_SERVER_LIMIT=4;
export const JINMU_OWNER_ID=1;
export const JINMU_AREA_EVENT='MERCENARY_JINMU_AREA';
export const JINMU_AREA_MECHANIC='HEAVENLY_DRAGON_DESCENT';
export const JINMU_AREA_SKILL=Object.freeze({
 id:'MS-989',name:'천룡강림',mechanic:JINMU_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:6.72,cooldownTurns:5,cost:35})
});
export const JINMU_COMBAT=Object.freeze({
 version:2,basePower:1617408,statsReferencePower:1123200,statScale:1.44,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2.6,
 // +20% linked attack/HP and complete opening shield versus unchanged Kairon.
 // The shared 60% front-row shield is included before applying the increase.
 link:Object.freeze({attackPercent:2635.776,hpPercent:1677.312,shieldPercent:928.416}),
 basicCapScale:2.88,damageTakenScale:.25,hardCounter:BERKAN_CODE
});
export const isJinmu=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===JINMU_CODE;
export const jinmuAccountAllowed=(userId,code,hasPackIssue=false)=>code!==JINMU_CODE||Number(userId)===JINMU_OWNER_ID||Number(userId)===2||Number(userId)===5663||hasPackIssue===true;
export const jinmuActionCredit=actors=>actors.some(a=>isJinmu(a)&&a.alive!==false&&a.hp>0)?JINMU_COMBAT.actionCredit:1;
export function jinmuIncomingDamage(target,incoming,source){
 if(!isJinmu(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===JINMU_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*JINMU_COMBAT.damageTakenScale);
}
export const JINMU_COMBAT_DESCRIPTION='천룡검황 진무 · 기본 전투력 1,617,408. 같은 편성·장비 기준 카이론보다 기본·연계 공격력·체력·전체 방벽과 기본 피해 상한이 20% 높으며 공격속도·추가 행동·모션 속도는 동일합니다. 개인 피해 75% 경감과 상태이상·반격 대응, 베르칸 피해 면역을 지닙니다. PVE 천룡강림은 적 전체에 총 672% 피해를 나눠 한 번씩 적용합니다(에너지 35 · 재사용 5행동). 할로윈팩 서버 4장 한정입니다. 기존 지정 계정 전용 지급분은 팩 발행 수량에서 제외됩니다.';
export const JINMU_ART=Object.freeze({
 code:JINMU_CODE,name:'천룡검황 진무',title:'SSS 리미티드 · 천룡의 주인',rank:'SSS',edition:'LIMITED',
 role:'LIMITED',position:null,artOnly:true,releaseStatus:'EXCLUSIVE_RELEASED',exclusiveGrant:true,excludedFromLimitedCount:true,
 sourceArt:'assets/ui/project-v/mercenaries/jinmu-20261012/source-art.png',
 sourceArtSha256:'263725DD2B2B568CF5091B864BEA537161F6D7A4D3123DB0E9A2A0D040CFF21B',
 battleSprite:'assets/ui/project-v/mercenaries/jinmu-20261012/idle.png',
 battleSpriteSha256:'690F2CA540DF6F210FBE619316AB3E30F3361A247E3DF6216DA1FED8CFA168A2',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),
 accent:'#e8bf6c',basePower:null,skills:Object.freeze([]),acquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:JINMU_COMBAT_DESCRIPTION
});
export function jinmuDeploymentSnapshot(){
 return {...JINMU_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',basePower:JINMU_COMBAT.basePower,
  position:'FRONT',role:'VANGUARD',attackStyle:'MELEE',skills:[structuredClone(JINMU_AREA_SKILL)],pendingSkillIds:[],
  jinmuPolicyVersion:JINMU_COMBAT.version,deploymentVersion:'20261018-jinmu-balance-v2'};
}
