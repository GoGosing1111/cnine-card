// User-approved V11 Heukmu. Independent 4m budget, SSS LIMITED acquisition locked.
export const HEUKMU_CODE='V-968';
export const HEUKMU_AREA_EVENT='MERCENARY_HEUKMU_AREA';
export const HEUKMU_AREA_MECHANIC='HEUKMU_BLACK_DRAGON';
export const HEUKMU_PLAYBACK_RATE=2;
const statScale=4000000/1123200;
export const HEUKMU_COMBAT=Object.freeze({version:1,basePower:4000000,statsReferencePower:1123200,statScale,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:1,effectPlaybackRate:1,link:Object.freeze({attackPercent:1830.4*statScale,hpPercent:1164.8*statScale,shieldPercent:686.4*statScale-60}),basicCapScale:2*statScale,damageTakenScale:.2,basicDamageScale:1,areaDamageCapScale:1});
export const HEUKMU_PVE_BALANCE=Object.freeze({version:2,damageRatio:15.12,cooldownTurns:5,cost:35});
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
export const heukmuIncomingDamage=(target,incoming)=>isHeukmu(target)?Math.floor(Math.max(0,Number(incoming)||0)*HEUKMU_COMBAT.damageTakenScale):incoming;
export const HEUKMU_ART=Object.freeze({
 code:HEUKMU_CODE,name:'흑무',title:'암월의 흑룡검제',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/heukmu-20261029/source-art.png',thumbnailArt:'assets/ui/project-v/mercenaries/heukmu-20261029/source-art.png',sourceArtSha256:'15f842cdd208cc2a066d6c15955595f88d1f58d7eddfb95c8b8550ec7d7f4194',
 battleSprite:'assets/ui/project-v/mercenaries/heukmu-20261029/assets/battle-idle-v11.png',battleSpriteSha256:'ded596f1b30048f8f983bd5d1b7cd2890353002de142e2fe5d2422c8929e3859',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#c039ff',
 basePower:HEUKMU_COMBAT.basePower,skills:Object.freeze([...HEUKMU_BASIC_FORMS,...HEUKMU_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 4,000,000. 흑룡의 검과 암월의 힘을 사용하는 SSS 리미티드. 아군 카드 행동당 3.12회 추가 행동, 개인 피해 80% 경감과 상태이상·반격 보호. 흑룡일섬·암월십자는 적에게 직접 접근해 일반 공격 한 번을 적용하고 복귀합니다. PVE 흑룡천겁·암월멸검은 에너지 35·공통 재사용 5행동으로 총 1,512% 피해를 생존한 적에게 나눠 대상당 한 번 적용합니다. 보라색 윤곽·고정 발판·흑룡 대기 아우라·모션 2배. 현재 획득 불가.'
});
export const heukmuCodexSkills=()=>HEUKMU_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'적에게 직접 접근해 대검으로 타격한 뒤 복귀합니다. 일반 공격 한 번의 피해를 적용합니다.':'총 1,512% 피해를 생존한 적 전체에 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 흑룡일섬 → 암월십자':'PVE · 에너지 35 · 두 광역기 공통 재사용 5행동',counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function heukmuDeploymentSnapshot(){return {...HEUKMU_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:structuredClone(HEUKMU_AREA_SKILLS),pendingSkillIds:[],heukmuPolicyVersion:HEUKMU_COMBAT.version,deploymentVersion:'20261029-heukmu-400-v1'};}
