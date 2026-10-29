import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';
import {RANKS} from './account-ranks-v1.mjs';

// 2026-10-29: independent snapshot of Jokro's 2.2m band; rank access stays unchanged.
export const SHIRANUI_CODE='V-987';
export const SHIRANUI_MIN_ACCOUNT_LEVEL=RANKS.find(r=>r.code==='LIEUTENANT_GENERAL').min;
export const SHIRANUI_REQUIREMENT=`중장(Lv.${SHIRANUI_MIN_ACCOUNT_LEVEL}) 이상`;
const powerScale=2200000/1940890;
export const SHIRANUI_COMBAT=Object.freeze({version:3,basePower:2200000,
 statsReferencePower:1123200,statScale:1.728*powerScale,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2.6,
 link:Object.freeze({attackPercent:3162.9312*powerScale,hpPercent:2012.7744*powerScale,shieldPercent:(1126.0992+60)*powerScale-60}),
 basicCapScale:3.456*powerScale,damageTakenScale:.2,hardCounter:BERKAN_CODE});
export const SHIRANUI_AREA_EVENT='MERCENARY_SHIRANUI_AREA';
export const SHIRANUI_AREA_MECHANIC='SPECTRAL_ARTILLERY_BARRAGE';
export const SHIRANUI_AREA_SKILL=Object.freeze({id:'MS-987',name:'망령 포대',mechanic:SHIRANUI_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:Object.freeze({damageRatio:15.12,cooldownTurns:5,cost:35})});
export const isShiranui=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===SHIRANUI_CODE;
export const shiranuiDeploymentAllowed=(code,accountLevel)=>code!==SHIRANUI_CODE||Number(accountLevel)>=SHIRANUI_MIN_ACCOUNT_LEVEL;
export const shiranuiActionCredit=actors=>actors.some(a=>isShiranui(a)&&a.alive!==false&&a.hp>0)?SHIRANUI_COMBAT.actionCredit:1;
export function shiranuiIncomingDamage(target,incoming,source){
 if(!isShiranui(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===SHIRANUI_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*SHIRANUI_COMBAT.damageTakenScale);
}
export const SHIRANUI_ART=Object.freeze({
 code:SHIRANUI_CODE,name:'시라누이',title:'SSS 리미티드 · 不知火',rank:'SSS',edition:'LIMITED',
 role:'VANGUARD',position:'FRONT',artOnly:false,releaseStatus:'RANK_REWARD_RELEASED',exclusiveGrant:false,excludedFromLimitedCount:false,
 acquisition:'ACCOUNT_RANK_REWARD',acquisitionDescription:`중장(Lv.${SHIRANUI_MIN_ACCOUNT_LEVEL}) 달성 시 계정당 1회 메시지로 시라누이 1장 지급`,minimumAccountLevel:SHIRANUI_MIN_ACCOUNT_LEVEL,deploymentRequirement:SHIRANUI_REQUIREMENT,
 sourceArt:'assets/ui/project-v/mercenaries/shiranui-20261015/source-art.png',
 sourceArtSha256:'3B67B37E9E3AB1E017552C6D6864C0469056EDC1332C2555C9F4CC6F5E3FFE65',
 battleSprite:'assets/ui/project-v/mercenaries/shiranui-20261015/idle.png',
 battleSpriteSha256:'07309373C5453D0389238D63A46FFA721DAD22A3E43441D6F532FE76A6265057',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#dce1ea',
 basePower:SHIRANUI_COMBAT.basePower,skills:Object.freeze([SHIRANUI_AREA_SKILL]),acquisitionEnabled:true,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'시라누이 · 중장(Lv.235) 달성 보상 SSS 리미티드. 계정당 1회 메시지 지급, 중장 이상 편성 가능. 기본 전투력 2,200,000. 족로와 같은 기본·연계 공격력·체력·전체 방벽·기본 피해 상한, 개인 피해 80% 경감과 아군 카드 행동당 3.12회 추가 행동을 적용합니다. 망령 군기 아래 AR 연발 사격을 사용하며, PVE 망령 포대는 적 전체에 총 1,512% 피해를 나눠 한 번씩 적용합니다(에너지 35 · 재사용 5행동). 연발·해골·포격은 추가 피해나 상태이상을 부여하지 않습니다.'
});
export function shiranuiDeploymentSnapshot(){
 return {...SHIRANUI_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'RANGED',
  skills:[structuredClone(SHIRANUI_AREA_SKILL)],pendingSkillIds:[],shiranuiPolicyVersion:SHIRANUI_COMBAT.version,deploymentVersion:'20261029-shiranui-220-v3'};
}
