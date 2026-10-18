import {KAIRON_AREA_SKILL} from './mercenary-kairon-v1.mjs';
import {JINMU_COMBAT} from './mercenary-jinmu-v1.mjs';

// Approved 2026-10-18: upgraded Jinmu combat parity; keep the original artillery budget.
export const SHIRANUI_CODE='V-987';
export const SHIRANUI_OWNER_ID=1;
export const SHIRANUI_COMBAT=JINMU_COMBAT;
export const SHIRANUI_AREA_EVENT='MERCENARY_SHIRANUI_AREA';
export const SHIRANUI_AREA_MECHANIC='SPECTRAL_ARTILLERY_BARRAGE';
export const SHIRANUI_AREA_SKILL=Object.freeze({id:'MS-987',name:'망령 포대',mechanic:SHIRANUI_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:KAIRON_AREA_SKILL.balance});
export const isShiranui=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===SHIRANUI_CODE;
export const shiranuiAccountAllowed=(userId,code)=>code!==SHIRANUI_CODE||Number(userId)===SHIRANUI_OWNER_ID;
export const shiranuiActionCredit=actors=>actors.some(a=>isShiranui(a)&&a.alive!==false&&a.hp>0)?SHIRANUI_COMBAT.actionCredit:1;
export function shiranuiIncomingDamage(target,incoming,source){
 if(!isShiranui(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===SHIRANUI_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*SHIRANUI_COMBAT.damageTakenScale);
}
export const SHIRANUI_ART=Object.freeze({
 code:SHIRANUI_CODE,name:'시라누이',title:'SSS 리미티드 · 不知火',rank:'SSS',edition:'LIMITED',
 role:'VANGUARD',position:'FRONT',artOnly:false,releaseStatus:'EXCLUSIVE_RELEASED',exclusiveGrant:true,excludedFromLimitedCount:true,
 sourceArt:'assets/ui/project-v/mercenaries/shiranui-20261015/source-art.png',
 sourceArtSha256:'3B67B37E9E3AB1E017552C6D6864C0469056EDC1332C2555C9F4CC6F5E3FFE65',
 battleSprite:'assets/ui/project-v/mercenaries/shiranui-20261015/idle.png',
 battleSpriteSha256:'07309373C5453D0389238D63A46FFA721DAD22A3E43441D6F532FE76A6265057',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#dce1ea',
 basePower:SHIRANUI_COMBAT.basePower,skills:Object.freeze([SHIRANUI_AREA_SKILL]),acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'시라누이 · 지정 계정 전용 SSS 리미티드. 일반 획득 불가. 기본 전투력 1,617,408. 상향된 천룡검황 진무와 기본·연계 공격력·체력·전체 방벽·기본 피해 상한·피해 경감·공격속도·추가 행동이 동일합니다. 망령 군기 아래 AR 연발 사격을 사용하며, PVE 망령 포대는 적 전체에 총 560% 피해를 나눠 한 번씩 적용합니다(에너지 35 · 재사용 5행동). 연발·해골·포격은 추가 피해나 상태이상을 부여하지 않습니다.'
});
export function shiranuiDeploymentSnapshot(){
 return {...SHIRANUI_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'RANGED',
  skills:[structuredClone(SHIRANUI_AREA_SKILL)],pendingSkillIds:[],shiranuiPolicyVersion:SHIRANUI_COMBAT.version,deploymentVersion:'20261018-shiranui-balance-v2'};
}
