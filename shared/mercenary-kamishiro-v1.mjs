// Approved V7 assets/motion preserved. 2026-10-29: independent Jokro 2.2m budget.
export const KAMISHIRO_CODE='V-969';
export const KAMISHIRO_AREA_EVENT='MERCENARY_KAMISHIRO_AREA';
export const KAMISHIRO_AREA_MECHANIC='KAMISHIRO_CRIMSON_BLADE';
export const KAMISHIRO_PLAYBACK_RATE=3.75;
const powerScale=2200000/1940890;
export const KAMISHIRO_COMBAT=Object.freeze({version:2,basePower:2200000,
 statsReferencePower:1123200,statScale:1.728*powerScale,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:1,effectPlaybackRate:1,
 link:Object.freeze({attackPercent:3162.9312*powerScale,hpPercent:2012.7744*powerScale,shieldPercent:(1126.0992+60)*powerScale-60}),
 basicCapScale:3.456*powerScale,damageTakenScale:.2,basicDamageScale:1,areaDamageCapScale:1});
export const KAMISHIRO_PVE_BALANCE=Object.freeze({version:2,damageRatio:15.12,cooldownTurns:5,cost:35});
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
 combatLinkDescription:'기본 전투력 2,200,000. 족로와 같은 기본 공격·체력·방벽·기본 피해 상한·속도·연계 기준. 아군 카드 행동당 3.12회 추가 행동, 개인 피해 80% 경감과 상태이상·반격 보호. 흑염참·혈선역참·암영돌파는 적에게 직접 접근해 일반 공격 한 번을 적용하고 복귀합니다. PVE 적월멸검·흑경난무는 에너지 35·공통 재사용 5행동으로 총 1,512% 피해를 생존한 적에게 나눠 대상당 한 번 적용합니다. 붉은 네온·발밑 흑적 기운·모션 3.75배. 현재 획득 불가.'
});
export const kamishiroCodexSkills=()=>KAMISHIRO_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'적에게 직접 접근해 대검으로 타격한 뒤 복귀합니다. 일반 공격 한 번의 피해를 적용합니다.':'총 1,512% 피해를 생존한 적 전체에 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 흑염참 → 혈선역참 → 암영돌파':'PVE · 에너지 35 · 두 광역기 공통 재사용 5행동',counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function kamishiroDeploymentSnapshot(){return {...KAMISHIRO_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:structuredClone(KAMISHIRO_AREA_SKILLS),pendingSkillIds:[],kamishiroPolicyVersion:KAMISHIRO_COMBAT.version,deploymentVersion:'20261029-kamishiro-220-v2'};}
