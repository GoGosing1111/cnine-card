// Approved V2 presentation and live release, 2026-10-18. Acquisition is deferred.
export const LEONEL_CODE='V-978';
export const LEONEL_AREA_EVENT='MERCENARY_LEONEL_AREA';
export const LEONEL_AREA_MECHANIC='SWORD_APEX_FRONTLINE_SEVER';
export const LEONEL_AREA_SKILL=Object.freeze({id:'MS-978',name:'검극 · 전선 단절',mechanic:LEONEL_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:15.12,cooldownTurns:5,cost:35})});
const powerScale=2300000/1940890;
export const LEONEL_COMBAT=Object.freeze({
 version:1,basePower:2300000,statsReferencePower:1123200,statScale:1.728*powerScale,
 speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,
 motionPlaybackRate:2,effectPlaybackRate:1,
 link:Object.freeze({attackPercent:3162.9312*powerScale,hpPercent:2012.7744*powerScale,shieldPercent:(1126.0992+60)*powerScale-60}),
 basicCapScale:3.456*powerScale,damageTakenScale:.2
});
export const isLeonel=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===LEONEL_CODE;
export const leonelActionCredit=actors=>actors.some(a=>isLeonel(a)&&a.alive!==false&&a.hp>0)?LEONEL_COMBAT.actionCredit:1;
export const leonelIncomingDamage=(target,incoming)=>isLeonel(target)?Math.floor(Math.max(0,Number(incoming)||0)*LEONEL_COMBAT.damageTakenScale):incoming;
export const LEONEL_ART=Object.freeze({
 code:LEONEL_CODE,name:'레오넬',title:'백은의 서약',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/leonel-20261018/source-art.png',
 sourceArtSha256:'43D4C211FF58BFF672E8614AA50FCD8F6C5099C667DD2F4C42C44BDE75AB2E00',
 battleSprite:'assets/ui/project-v/mercenaries/leonel-20261018/idle.png',
 battleSpriteSha256:'AB6D401C93CCBECE50912CDADDCFC6F0D099BD720A6149729AF275F28CA53683',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#c6b6ff',
 basePower:LEONEL_COMBAT.basePower,skills:Object.freeze([LEONEL_AREA_SKILL]),acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 2,300,000. 인간계 최강의 검사로서 백은일섬·절명삼연과 검극 · 전선 단절을 펼칩니다. 개인 피해 80% 경감, 상태이상·반격 보호. PVE 광역기는 생존한 적 전체에 총 1,512% 피해를 나눠 한 번씩 적용합니다(에너지 35 · 재사용 5행동). 공격 동작 2배, 스킬 이펙트는 원래 속도입니다. 획득 잠금 · 획득 방법은 추후 지정됩니다.'
});
export function leonelDeploymentSnapshot(){
 return {...LEONEL_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:[structuredClone(LEONEL_AREA_SKILL)],pendingSkillIds:[],
  leonelPolicyVersion:LEONEL_COMBAT.version,deploymentVersion:'20261018-leonel-live-v1'};
}
