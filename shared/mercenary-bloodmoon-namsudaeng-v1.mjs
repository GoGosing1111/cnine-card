import {HALLOWEEN_COMBAT} from './mercenary-halloween-combat-v1.mjs';

export const NAMSUDAENG_CODE='V-965';
export const NAMSUDAENG_EVENT='MERCENARY_BLOODMOON_ARROW';
export const NAMSUDAENG_MECHANIC='BLOODMOON_ARCHERY';
export const NAMSUDAENG_ROOT='assets/ui/project-v/mercenaries/bloodmoon-namsudaeng-20261024/';
export const NAMSUDAENG_PLAYBACK_RATE=2;
export const NAMSUDAENG_SKILLS=Object.freeze([
 {id:'MS-947',name:'적월 관통',visualMode:'pierce',targetCount:1,target:'적 하나',effect:'응축한 화살로 적 하나를 관통합니다.'},
 {id:'MS-948',name:'혈월 연사',visualMode:'volley',targetCount:3,target:'최대 3명',effect:'서로 다른 적 최대 3명에게 세 발을 나누어 발사합니다.'},
 {id:'MS-949',name:'월식 화살비',visualMode:'rain',targetCount:null,target:'적 전체',effect:'상공의 화살이 적 진형 전체로 쏟아집니다.'}
].map(s=>Object.freeze({...s,mechanic:NAMSUDAENG_MECHANIC,ready:true,
 balance:Object.freeze({damageRatio:14.4,cooldownTurns:2,cost:20}),
 trigger:'자기 행동 · 에너지 20 · 세 기술 공통 재사용 2행동',
 effect:s.effect+' 한 시전의 총 1,440% 피해를 실제 대상 수에 나누어 적용합니다.',
 counterplay:'회피·방어·보호막·행동 제어의 영향을 받습니다.',bossRule:'보스도 같은 총 피해 예산을 사용합니다.',
 procRule:'서버 피해는 대상당 한 번이며 연출 화살은 추가 피해·비용·행동을 만들지 않습니다.'})));
// Existing Bloodmoon display power and the established seasonal ranged role.
// No SSS-limited immunities, opponent-dependent bonuses or account exceptions.
export const NAMSUDAENG_COMBAT=Object.freeze({...HALLOWEEN_COMBAT['V-981'],code:NAMSUDAENG_CODE,
 basePower:356400,role:'MARKSMAN',skill:NAMSUDAENG_SKILLS[0],skills:NAMSUDAENG_SKILLS});
// Keep the established PVE profile. The authoritative battle mode selects PVP.
export const NAMSUDAENG_PVP_COMBAT=Object.freeze({...NAMSUDAENG_COMBAT,
 scale:8.1,speedScale:3.15,actionCredit:3.75,pvpSkillCapScale:3.25,basicCapScale:1.7,
 link:Object.freeze({attackPercent:1782,hpPercent:2268,shieldPercent:1215})});
export const NAMSUDAENG_DESCRIPTION='블러드문 SS 리미티드. 기본 전투력 356,400. 후열 궁수이며 표시·성장 등급 SS, 전투 등급 보정은 일반 SSS 기준입니다. PVE 자연 행동 속도 2.25배·아군 카드 1행동당 2.25회 추가 행동, PVP 자연 행동 속도 3.15배·추가 행동 3.75회이며 PVP 연계 공격·체력·방벽과 피해 상한이 강화됩니다. 자기 행동마다 에너지 10을 회복합니다. 적월 관통·혈월 연사·월식 화살비는 순환하며 총 1,440% 피해 예산·에너지 20·공통 재사용 2행동을 사용합니다. 기본 공격은 한 발이며 승인 모션은 2배속, 대기 몸체는 고정입니다. 블러드문팩 전용이며 판매 상태와 잔여 수량은 상점에서 확인하세요.';
export const NAMSUDAENG_ART=Object.freeze({
 code:NAMSUDAENG_CODE,name:'블러드문 남수댕',nameStatus:'USER_CONFIRMED_20261024',title:'혈월의 궁수',
 rank:'SS',rankStatus:'USER_DESIGNATED',edition:'LIMITED',season:'BLOODMOON',role:'MARKSMAN',position:'REAR',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_PACK_PENDING',acquisition:'BLOODMOON_PACK',acquisitionEnabled:false,
 packAcquisitionEnabled:true,packOpeningEnabled:false,deploymentEnabled:true,serverLimit:40,
 acquisitionPackId:'mercenary-bloodmoon-ss-limited',acquisitionPackName:'블러드문팩',
 sourceArt:NAMSUDAENG_ROOT+'source-art.png',sourceArtSha256:'FA4375975E256F84E6C4CDB877B69C239805DA303B1233EBF71B7A6F5F32D9D8',
 battleSprite:NAMSUDAENG_ROOT+'idle.png',battleSpriteSha256:'F92F48030F9AE6CB7C888F0F70F3CE4FD963BD4225C32651762003E0761BEAA6',
 thumbnailArt:NAMSUDAENG_ROOT+'art-320.webp',displayArt:NAMSUDAENG_ROOT+'art-640.webp',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 frameSha256:'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#eb4164',
 basePower:NAMSUDAENG_COMBAT.basePower,skills:NAMSUDAENG_SKILLS,combatLinkDescription:NAMSUDAENG_DESCRIPTION,
 battleSpriteViewport:{"x":209,"y":276,"width":261,"height":375,"imageWidth":768,"imageHeight":768},
 visualApproval:'USER_APPROVED_20261024',approvalRecord:NAMSUDAENG_ROOT+'live-approval.json',resourceStatus:'BATTLE_RELEASED'
});
export const isBloodmoonNamsudaeng=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===NAMSUDAENG_CODE;
export function namsudaengDeploymentSnapshot(){return {...NAMSUDAENG_ART,position:'BACK',actorKind:'MERCENARY',
 level:1,statMode:'RANK_FIXED',attackStyle:'RANGED',skills:structuredClone(NAMSUDAENG_SKILLS),pendingSkillIds:[],
 deploymentVersion:'20261024-bloodmoon-namsudaeng-live-v1'};}
