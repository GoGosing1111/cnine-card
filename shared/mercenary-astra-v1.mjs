export const ASTRA_CODE='V-059';
export const ASTRA_EVENT='MERCENARY_ASTRA_MECHANICAL_STRIKE';
export const ASTRA_MECHANIC='ASTRA_MECHANICAL_STRIKE';
export const ASTRA_ROOT='assets/ui/project-v/mercenaries/astra-20261115/';
export const ASTRA_COMBAT=Object.freeze({version:1,basePower:1250000,statsReferencePower:1250000,speedReferencePower:1250000,
 statScale:2.4,speedScale:4,actionCredit:4,actionEnergy:10,basicCapScale:1.25,pvpSkillCapScale:3.75,damageTakenScale:.35,
 link:Object.freeze({attackPercent:1750,hpPercent:1000,shieldPercent:500}),pvpPriorityTierGuard:16});
export const ASTRA_SKILLS=Object.freeze([
 {id:'MS-1101',name:'쌍드론 협공',visualMode:'skill_drone',targetCount:1,targetRule:'weakest',target:'약화된 적 하나',ratio:5.5,effect:'두 기의 메카닉 드론이 전방에 나타나 문장을 새긴 목표에 결정탄을 발사합니다.'},
 {id:'MS-1102',name:'기갑 포탑 집중사격',visualMode:'skill_siege',targetCount:1,targetRule:'back',target:'후열 우선 적 하나',ratio:7,effect:'전방 자율 포탑이 중장갑 에너지탄을 연사해 표식이 남은 목표를 폭발시킵니다.'},
 {id:'MS-1103',name:'블루기어 포트리스',visualMode:'skill_fortress',targetCount:null,targetRule:'all',target:'적 전체 · PVE',pveOnly:true,ratio:8.75,effect:'대형 포트리스를 소환해 적 전체에 블루기어 문장을 전개하고 광역 레일 포격을 가합니다.'}
].map(({ratio,...s})=>Object.freeze({...s,role:'SNIPER',mechanic:ASTRA_MECHANIC,ready:true,
 balance:Object.freeze({damageRatio:ratio,cooldownTurns:3,cost:25}),
 effect:s.effect+' 한 시전의 총 '+Math.round(ratio*100)+'% 피해를 실제 대상 수에 나누어 적용합니다.',
 trigger:'자기 행동 · 에너지 25 · 세 기술 공통 재사용 3행동'+(s.pveOnly?' · PVE 전용':''),
 counterplay:'기절·침묵·회피·방어·방벽과 피해 경감에 대응됩니다.',bossRule:'단일 보스도 같은 총 피해 예산을 사용합니다.',
 procRule:'대상당 서버 피해는 한 번입니다. 소환수·탄환·폭발은 추가 피해나 독립 행동을 만들지 않습니다.'})));
export const ASTRA_DESCRIPTION='기본 전투력 1,250,000의 SSS 메카닉 지휘관. 고유·장비 능력치 환산 2.4배, 자연 행동 속도 4배, 아군 카드 행동당 추가 행동 4회와 자기 행동당 에너지 10을 적용합니다. 아군 카드 평균 공격력의 1,750%를 최소 공격력, 평균 최대 체력의 1,000%를 최소 체력으로 사용하며 시작 방벽은 500%, 받는 피해 경감은 65%입니다. 기본 공격 피해 상한 1.25배, PVP 스킬 피해 상한 3.75배. 세 스킬은 에너지 25·공통 재사용 3행동이며 포트리스는 PVE 전용입니다. 상대 용병이 모두 블루기어 외 SS 리미티드 또는 신궁 강윤이면 라자크와 같은 전투 시작 우위를 적용합니다. 기절·침묵·반격·중독 면역은 없고 성장의 피해 경감 관통을 적용합니다. 블루기어팩 전용 일반 SSS이며 발행 한도는 없습니다.';
export const ASTRA_ART=Object.freeze({code:ASTRA_CODE,name:'아스트라',title:'블루기어 메카닉 지휘관',rank:'SSS',edition:'STANDARD',season:'BLUE_GEAR',
 position:'MIDDLE',role:'SNIPER',attackStyle:'RANGED',basicTarget:'LOW_HP_ENEMY',artOnly:false,releaseStatus:'OWNER_PACK_CONTROLLED',deploymentEnabled:true,
 nameStatus:'USER_DELEGATED_20261115',rankStatus:'USER_ASSIGNED_RANK',basePower:ASTRA_COMBAT.basePower,
 acquisition:'BLUE_GEAR_PACK',acquisitionEnabled:false,packAcquisitionEnabled:true,acquisitionPackId:'mercenary-blue-gear',acquisitionPackName:'블루기어팩',stockPolicy:'UNLIMITED',
 acquisitionDescription:'11월 20일 0시부터 블루기어팩의 별도 일반 SSS 항목에서 획득합니다. 발행 한도 없음. 다른 팩·일반 추첨·합성·제작·기적의 큐브에서는 획득하지 않습니다.',
 sourceArt:ASTRA_ROOT+'source-art.png',displayArt:ASTRA_ROOT+'art-640.webp',thumbnailArt:ASTRA_ROOT+'art-320.webp',battleSprite:ASTRA_ROOT+'guard.webp',accent:'#59adff',
 skills:ASTRA_SKILLS,specialty:'전방 메카닉 소환 · 장총 협동 사격 · 문장 레일 포격',weakness:'기절·침묵과 집중 공격',combatLinkDescription:ASTRA_DESCRIPTION});
export const isAstra=a=>a?.isMercenary===true&&(a.code||a.cardId)===ASTRA_CODE;
export const astraActionCredit=actors=>actors.some(a=>isAstra(a)&&a.alive!==false&&a.hp>0)?ASTRA_COMBAT.actionCredit:1;
export function astraDeploymentSnapshot(){return {...ASTRA_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',skills:structuredClone(ASTRA_SKILLS),pendingSkillIds:[],deploymentVersion:'astra-20261115-v1'};}
