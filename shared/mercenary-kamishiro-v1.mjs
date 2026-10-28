// Approved V7 assets and melee motion, 2026-10-28. Independent Prime budget snapshot.
export const KAMISHIRO_CODE='V-969';
export const KAMISHIRO_AREA_EVENT='MERCENARY_KAMISHIRO_AREA';
export const KAMISHIRO_AREA_MECHANIC='KAMISHIRO_CRIMSON_BLADE';
export const KAMISHIRO_PLAYBACK_RATE=3.75;
export const KAMISHIRO_COMBAT=Object.freeze({...{"version":1,"basePower":3000000,"statsReferencePower":1123200,"statScale":2.6709396204833866,"speedReferencePower":1080000,"speedScale":3.12,"actionCredit":3.12,"motionPlaybackRate":1,"effectPlaybackRate":1,"link":{"attackPercent":4888.887881332791,"hpPercent":3111.1104699390485,"shieldPercent":1773.3329554997968},"basicCapScale":5.341879240966773,"damageTakenScale":0.2,"basicDamageScale":1.5,"areaDamageCapScale":2},link:Object.freeze({"attackPercent":4888.887881332791,"hpPercent":3111.1104699390485,"shieldPercent":1773.3329554997968})});
export const KAMISHIRO_PVE_BALANCE=Object.freeze({"version":1,"damageRatio":30.24,"cooldownTurns":3,"cost":20});
export const KAMISHIRO_BASIC_FORMS=Object.freeze([
 {id:'MS-917',name:'흑염참',visualMode:'cleave'},
 {id:'MS-918',name:'혈선역참',visualMode:'rise'},
 {id:'MS-919',name:'암영돌파',visualMode:'thrust'}
].map(s=>Object.freeze({...s,mechanic:'KAMISHIRO_BASIC_FORM',target:'ENEMY',basicForm:true,balance:Object.freeze({damageRatio:KAMISHIRO_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const KAMISHIRO_AREA_SKILLS=Object.freeze([
 {id:'MS-920',name:'적월멸검',visualMode:'eclipse'},
 {id:'MS-921',name:'흑경난무',visualMode:'ruin'}
].map(s=>Object.freeze({...s,mechanic:KAMISHIRO_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:KAMISHIRO_PVE_BALANCE})));
export const isKamishiro=a=>a?.isMercenary===true&&(a.code||a.cardId)===KAMISHIRO_CODE;
export const kamishiroActionCredit=actors=>actors.some(a=>isKamishiro(a)&&a.alive!==false&&a.hp>0)?KAMISHIRO_COMBAT.actionCredit:1;
export const kamishiroIncomingDamage=(target,incoming)=>isKamishiro(target)?Math.floor(Math.max(0,Number(incoming)||0)*KAMISHIRO_COMBAT.damageTakenScale):incoming;
export const KAMISHIRO_ART=Object.freeze({
 code:KAMISHIRO_CODE,name:'카미시로(神代)',title:'흑경의 광전사',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/kamishiro-20261028/source-art.png',thumbnailArt:'assets/ui/project-v/mercenaries/kamishiro-20261028/source-art.png',sourceArtSha256:'689341af3e7b1353e7ee001bcafbcfa74d0f0e418fc1bf9bfa33fecd3f696c37',
 battleSprite:'assets/ui/project-v/mercenaries/kamishiro-20261028/body.png',battleSpriteSha256:'f671c9ea82032563d18321cedf42107290a4ea2d8a110083848fc8da9094dc2b',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#e51a36',
 basePower:KAMISHIRO_COMBAT.basePower,skills:Object.freeze([...KAMISHIRO_BASIC_FORMS,...KAMISHIRO_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 3,000,000. 프라임 레퀴엠과 같은 기본 공격·생존·속도·연계 기준. 개인 피해 80% 경감과 상태이상·반격 보호. 흑염참·혈선역참·암영돌파는 적에게 직접 접근해 1.5배 일반 공격 한 번을 적용하고 복귀합니다. PVE 적월멸검·흑경난무는 에너지 20·공통 재사용 3행동으로 총 3,024% 피해를 생존한 적에게 나눠 대상당 한 번 적용합니다. 붉은 네온·발밑 흑적 기운·모션 3.75배. 현재 획득 불가.'
});
export const kamishiroCodexSkills=()=>KAMISHIRO_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'적에게 직접 접근해 대검으로 타격한 뒤 복귀합니다. 강화된 일반 공격 한 번의 피해를 적용합니다.':'총 3,024% 피해를 생존한 적 전체에 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 흑염참 → 혈선역참 → 암영돌파':'PVE · 에너지 20 · 두 광역기 공통 재사용 3행동',counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function kamishiroDeploymentSnapshot(){return {...KAMISHIRO_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:structuredClone(KAMISHIRO_AREA_SKILLS),pendingSkillIds:[],kamishiroPolicyVersion:KAMISHIRO_COMBAT.version,deploymentVersion:'20261028-kamishiro-live-v1'};}
