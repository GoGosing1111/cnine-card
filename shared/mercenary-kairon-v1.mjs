import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

export const KAIRON_CODE='V-988';
const statsReferencePower=1123200,statScale=4400000/statsReferencePower;
export const KAIRON_COMBAT=Object.freeze({
 version:3,basePower:2350000,statsReferencePower,statScale,
 speedReferencePower:1080000,speedScale:6,actionCredit:6,motionPlaybackRate:2.6,
 link:Object.freeze({attackPercent:1830.4*statScale,hpPercent:1164.8*statScale,shieldPercent:686.4*statScale-60}),
 basicCapScale:2*statScale,basicDamageScale:2.5,areaDamageCapScale:5.5,damageTakenScale:.12,hardCounter:BERKAN_CODE
});
export const KAIRON_AREA_EVENT='MERCENARY_KAIRON_AREA';
export const KAIRON_AREA_MECHANIC='QUANTUM_BALLISTIC_STRIKE';
export const KAIRON_AREA_SKILL=Object.freeze({id:'MS-988',name:'양자 탄도 폭쇄',mechanic:KAIRON_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:96,cooldownTurns:2,cost:10})});
export const isKairon=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===KAIRON_CODE;
export const kaironActionCredit=actors=>actors.some(a=>isKairon(a)&&a.alive!==false&&a.hp>0)?KAIRON_COMBAT.actionCredit:1;
export function kaironIncomingDamage(target,incoming,source){
 if(!isKairon(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===KAIRON_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*KAIRON_COMBAT.damageTakenScale);
}
export const KAIRON_ART=Object.freeze({
 code:KAIRON_CODE,name:'카이론',title:'SSS 리미티드 · 흑탄의 집행관',rank:'SSS',edition:'LIMITED',
 role:'VANGUARD',position:'FRONT',artOnly:false,releaseStatus:'CRAFT_ONLY',acquisition:'CRAFT_ONLY',packAcquisitionEnabled:false,
 sourceArt:'assets/ui/project-v/mercenaries/kairon-20261014/source-art.png',
 sourceArtSha256:'5AFBA87D0291A4DAB69DCF45F5C0F2D57676A79ED472DED655062E2FBD36AF09',
 battleSprite:'assets/ui/project-v/mercenaries/kairon-20261014/idle.png',
 battleSpriteSha256:'95320B3BEAA782DE1217154A15427BA1B3E91DEE4CD23317EB0CE1E080FA90F1',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#e4eaf2',
 basePower:KAIRON_COMBAT.basePower,skills:Object.freeze([KAIRON_AREA_SKILL]),deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 2,350,000. 일반 공격 250%, 자연 행동 속도 6배, 아군 카드 행동당 추가 행동 6회분, 받는 피해 88% 경감. PVE 양자 탄도 폭쇄는 총 9,600% 피해를 생존 적 전체에 나눠 적용합니다. 에너지 10 · 재사용 2행동. PVP에서는 일반 공격을 사용합니다.'
});
export function kaironDeploymentSnapshot(){
 return {...KAIRON_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'RANGED',
  skills:[structuredClone(KAIRON_AREA_SKILL)],pendingSkillIds:[],kaironPolicyVersion:KAIRON_COMBAT.version,deploymentVersion:'20261124-kairon-2350k-v3'};
}
