import {HELIOS_KING_BASE_COMBAT} from './mercenary-helios-king-v1.mjs';

export const HEUKMU_CODE='V-968';
export const HEUKMU_AREA_EVENT='MERCENARY_HEUKMU_AREA';
export const HEUKMU_AREA_MECHANIC='HEUKMU_BLACK_DRAGON';
export const HEUKMU_PLAYBACK_RATE=2;
export const HEUKMU_COMBAT=Object.freeze({
 ...HELIOS_KING_BASE_COMBAT,version:3,speedScale:4.5,actionCredit:4.5,areaDamageCapScale:2.75
});
export const HEUKMU_PVE_BALANCE=Object.freeze({version:3,damageRatio:41.58,cooldownTurns:2,cost:10});
export const HEUKMU_APOCALYPSE=Object.freeze({damageBonusPercent:25,damageReductionPercent:25});
const apocalypseDescription=`아포칼립스 보스에게 주는 피해가 ${HEUKMU_APOCALYPSE.damageBonusPercent}% 증가하고, 그 보스에게 흑무가 받는 피해가 추가로 ${HEUKMU_APOCALYPSE.damageReductionPercent}% 감소합니다.`;
export const HEUKMU_BASIC_FORMS=Object.freeze([
 {id:'MS-913',name:'흑룡일섬',visualMode:'attack'},
 {id:'MS-914',name:'암월십자',visualMode:'cross'}
].map(s=>Object.freeze({...s,mechanic:'HEUKMU_BASIC_FORM',target:'ENEMY',basicForm:true,balance:Object.freeze({damageRatio:HEUKMU_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const HEUKMU_AREA_SKILLS=Object.freeze([
 {id:'MS-915',name:'흑룡천겁',visualMode:'cast'},
 {id:'MS-916',name:'암월멸검',visualMode:'ultimate'}
].map(s=>Object.freeze({...s,mechanic:HEUKMU_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:HEUKMU_PVE_BALANCE})));
export const isHeukmu=a=>a?.isMercenary===true&&(a.code||a.cardId)===HEUKMU_CODE;
export const heukmuActionCredit=actors=>actors.some(a=>isHeukmu(a)&&a.alive!==false&&a.hp>0)?HEUKMU_COMBAT.actionCredit:1;
export function heukmuIncomingDamage(target,incoming,source){
 if(!isHeukmu(target))return incoming;
 const bossGuard=target.battleMode==='PVE'&&source?.isApocalypseHuntBoss?1-HEUKMU_APOCALYPSE.damageReductionPercent/100:1;
 return Math.floor(Math.max(0,Number(incoming)||0)*HEUKMU_COMBAT.damageTakenScale*bossGuard);
}
export const HEUKMU_ART=Object.freeze({
 code:HEUKMU_CODE,name:'흑무',title:'암월의 흑룡검제',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/heukmu-20261029/source-art.png',thumbnailArt:'assets/ui/project-v/mercenaries/heukmu-20261029/source-art.png',sourceArtSha256:'15f842cdd208cc2a066d6c15955595f88d1f58d7eddfb95c8b8550ec7d7f4194',
 battleSprite:'assets/ui/project-v/mercenaries/heukmu-20261029/assets/battle-idle-v11.png',battleSpriteSha256:'ded596f1b30048f8f983bd5d1b7cd2890353002de142e2fe5d2422c8929e3859',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#c039ff',
 basePower:HEUKMU_COMBAT.basePower,skills:Object.freeze([...HEUKMU_BASIC_FORMS,...HEUKMU_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:`기본 전투력 3,500,000. 공수 균형형 · 아포칼립스 보스 특화. ${apocalypseDescription} 평소 받는 피해는 80% 감소합니다. 흑룡일섬·암월십자는 적 하나에 165% 피해를 주고, PVE 흑룡천겁·암월멸검은 총 4,158% 피해를 생존한 적에게 나눕니다. 두 광역기는 에너지 10을 쓰고 재사용 2행동을 공유합니다. 자연 행동 속도 4.5배, 아군 카드 행동당 추가 행동 4.5회분. 상태이상·반격 보호.`
});
export const heukmuCodexSkills=()=>HEUKMU_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'적에게 직접 접근해 대검으로 165% 피해를 한 번 주고 복귀합니다.':'총 4,158% 피해를 생존한 적에게 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 흑룡일섬 → 암월십자':`PVE · 에너지 ${s.balance.cost} · 두 광역기 공통 재사용 ${s.balance.cooldownTurns}행동`,counterplay:'방어·보호막에 대응됩니다.',bossRule:apocalypseDescription,procRule:'한 행동당 한 번 적용'}));
export function heukmuDeploymentSnapshot(){return {...HEUKMU_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:structuredClone(HEUKMU_AREA_SKILLS),pendingSkillIds:[],heukmuPolicyVersion:HEUKMU_COMBAT.version,deploymentVersion:'20261128-heukmu-apocalypse-v3'};}
