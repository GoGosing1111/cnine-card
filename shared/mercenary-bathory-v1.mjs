// User approved production release on 2026-10-19; acquisition is pack-controlled.
export const BATHORY_CODE='V-977';
export const BATHORY_SERVER_LIMIT=20;
export const BATHORY_RESOURCE_ROOT='preview/mercenary-bathory-halloween-20261019-v1/';
export const BATHORY_CATALOG_ROOT='assets/ui/project-v/mercenaries/bathory-halloween-20261019/';
export const BATHORY_SKILL=Object.freeze({
 id:'MS-977',name:'핏빛 만찬',mechanic:'WOUNDED_MOON_DRAW',target:'적 표적',
 effect:'붉은 눈으로 약해진 적을 포착하고 대검으로 베어냅니다. 잃은 체력에 따라 피해가 증가합니다.',
 trigger:'에너지와 재사용 조건을 충족한 자기 행동',counterplay:'회피·방어·보호막 및 행동 순서의 영향을 받습니다.',
 bossRule:'동일한 피해·보호막 규칙을 사용합니다.',procRule:'두 시각적 검격은 한 번의 서버 피해를 표현하며 추가 비용이나 재귀 시전을 만들지 않습니다.',
 ready:true,balance:Object.freeze({damageRatio:10.08,cooldownTurns:1,cost:20})
});
export const BATHORY_COMBAT=Object.freeze({
 version:1,code:BATHORY_CODE,position:'FRONT',role:'VANGUARD',attackStyle:'MELEE',basePower:297000,
 scale:6.6,speedScale:2.75,actionCredit:3.25,actionEnergy:10,pvpSkillCapScale:2.7,basicCapScale:1.5,pveSkillMinimumDamage:false,
 link:Object.freeze({attackPercent:1452,hpPercent:1848,shieldPercent:990}),skill:BATHORY_SKILL
});
export const BATHORY_DESCRIPTION='SS 할로윈 리미티드 · 서버 전체 20장 한정. 기본 전투력 297,000. 전열 대검형으로 핏빛 만찬 1,008%·비용 20·재사용 1행동을 사용하며 대상의 잃은 체력에 따라 피해가 증가합니다. 자연 행동 속도 2.75배, 아군 카드 4행동마다 용병 13회 추가 행동, 자기 행동마다 에너지 10 회복. 연계 공격 1,452%·체력 1,848%·방벽 990%. PVP 스킬 상한 2.7배·기본 공격 상한 1.5배. 표시·성장 등급은 SS, 전투 등급 보정은 일반 SSS 기준입니다.';
export const BATHORY_ART=Object.freeze({
 code:BATHORY_CODE,name:'바토리',title:'핏빛 만찬',rank:'SS',rankStatus:'CONFIRMED_BY_USER',edition:'LIMITED',season:'HALLOWEEN',role:'VANGUARD',position:'FRONT',
 artOnly:true,releaseStatus:'OWNER_PACK_CONTROLLED',sourceArt:BATHORY_CATALOG_ROOT+'source-art.png',
 sourceArtSha256:'BA3F9BA6F60B0B90EEA9E27B66ADA65C3C329DED136DC115D4A449290235E761',
 battleSprite:BATHORY_CATALOG_ROOT+'sd.png',
 battleSpriteSha256:'FD33330B76A8381ED76E0E33144FE3E8835DC74C2ED0C5D941F2C63C7A411906',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',frameSha256:'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#e94d70',basePower:BATHORY_COMBAT.basePower,
 skills:Object.freeze([BATHORY_SKILL]),acquisitionEnabled:false,packAcquisitionEnabled:true,deploymentEnabled:true,
 acquisitionPackId:'mercenary-halloween-ss-limited',acquisitionPackName:'할로윈 리미티드 용병팩',serverLimit:BATHORY_SERVER_LIMIT,
 thumbnailArt:BATHORY_CATALOG_ROOT+'art-320.webp',displayArt:BATHORY_CATALOG_ROOT+'art-640.webp',
 resourceStatus:'USER_APPROVED_FOR_RELEASE',sourceApprovalRecord:BATHORY_RESOURCE_ROOT+'release-plan.json',combatLinkDescription:BATHORY_DESCRIPTION
});
export function bathoryDeploymentSnapshot(){return{...BATHORY_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:[structuredClone(BATHORY_SKILL)],pendingSkillIds:[],bathoryPolicyVersion:1,deploymentVersion:'20261019-bathory-v1'};}
