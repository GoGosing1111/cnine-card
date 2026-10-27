// Approved 2026-10-27: independent snapshot of General Jok v3's current budget.
// Acquisition and account grants require their own policy; deployment is released.
export const CARDGU_CODE='V-970';
export const CARDGU_AREA_EVENT='MERCENARY_CARDGU_AREA';
export const CARDGU_AREA_MECHANIC='CARDGU_ROYAL_POKER';
export const CARDGU_PLAYBACK_RATE=2;
export const CARDGU_COMBAT=Object.freeze({version:1,basePower:2700000,
 statsReferencePower:1123200,statScale:2.403845658435048,speedReferencePower:1080000,
 speedScale:3.12,actionCredit:3.12,motionPlaybackRate:1,effectPlaybackRate:1,
 link:Object.freeze({attackPercent:4399.999093199512,hpPercent:2799.9994229451436,shieldPercent:1589.9996599498172}),
 basicCapScale:4.807691316870096,damageTakenScale:.2,basicDamageScale:1.5,areaDamageCapScale:2});
export const CARDGU_PVE_BALANCE=Object.freeze({version:1,damageRatio:30.24,cooldownTurns:3,cost:20});
export const CARDGU_BASIC_FORMS=Object.freeze([
 {id:'MS-922',name:'스페이드 관통',visualMode:'deal'},
 {id:'MS-923',name:'찢어진 에이스',visualMode:'rip'}
].map(s=>Object.freeze({...s,mechanic:'CARDGU_BASIC_FORM',target:'ENEMY',basicForm:true,
 balance:Object.freeze({damageRatio:CARDGU_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
export const CARDGU_AREA_SKILLS=Object.freeze([
 {id:'MS-924',name:'블랙 셔플',visualMode:'storm'},
 {id:'MS-925',name:'로열 브레이크',visualMode:'crown'}
].map(s=>Object.freeze({...s,mechanic:CARDGU_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:CARDGU_PVE_BALANCE})));
export const isCardgu=a=>a?.isMercenary===true&&(a.code||a.cardId)===CARDGU_CODE;
export const cardguActionCredit=actors=>actors.some(a=>isCardgu(a)&&a.alive!==false&&a.hp>0)?CARDGU_COMBAT.actionCredit:1;
export const cardguIncomingDamage=(target,incoming)=>isCardgu(target)?Math.floor(Math.max(0,Number(incoming)||0)*CARDGU_COMBAT.damageTakenScale):incoming;
export const CARDGU_ART=Object.freeze({
 code:CARDGU_CODE,name:'카드구',title:'검은 왕관의 카드 마법사',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/cardgu-20261027/source-art.png',
 thumbnailArt:'assets/ui/project-v/mercenaries/cardgu-20261027/source-art.png',
 sourceArtSha256:'5bc53d55e620e83928075e44d56290acc4c4ccea257cf65002106cc60fab2a8b',
 battleSprite:'assets/ui/project-v/mercenaries/cardgu-20261027/idle.png',
 battleSpriteSha256:'271e60ab0bd0df4a5dd363e616ed2b7bb3e262053df462eb359e8f529ac6a767',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#ffd16b',
 basePower:CARDGU_COMBAT.basePower,skills:Object.freeze([...CARDGU_BASIC_FORMS,...CARDGU_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 2,700,000. 제너럴 족과 같은 공격·체력·방어·속도·연계 기준입니다. 개인 피해 80% 경감과 상태이상·반격 보호. 스페이드 관통과 찢어진 에이스가 일반 공격마다 순환하며 1.5배 피해를 한 번 적용합니다. PVE 블랙 셔플·로열 브레이크는 에너지 20·공통 재사용 3행동으로 시전당 총 3,024% 피해를 생존한 적 전체에 나눠 한 번씩 적용합니다. 전신 카드 아우라·회전 카드 24장·황금 네온, 모션 2배. 현재 획득 불가.'
});
export const cardguCodexSkills=()=>CARDGU_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',
 effect:s.basicForm?'관통 카드와 반으로 찢어진 에이스가 순환하며 강화된 일반 공격 한 번의 피해를 적용합니다.':'총 3,024% 피해를 생존한 적 전체에 나누어 대상당 한 번 적용합니다.',
 trigger:s.basicForm?'일반 공격 · 스페이드 관통 → 찢어진 에이스':'PVE · 에너지 20 · 두 광역기 공통 재사용 3행동',
 counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 행동당 한 번 적용'}));
export function cardguDeploymentSnapshot(){return {...CARDGU_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'CAST',
 skills:structuredClone(CARDGU_AREA_SKILLS),pendingSkillIds:[],cardguPolicyVersion:CARDGU_COMBAT.version,deploymentVersion:'20261027-cardgu-live-v1'};}
