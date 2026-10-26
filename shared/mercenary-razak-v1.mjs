export const RAZAK_CODE='V-058';
export const RAZAK_EVENT='MERCENARY_RAZAK_ASSASSINATION';
export const RAZAK_MECHANIC='CURVED_BLADE_ASSASSINATION';
export const RAZAK_ROOT='assets/ui/project-v/mercenaries/razak-20261024/';
export const RAZAK_PLAYBACK_RATE=2;
// Explicit combat policy, independent of the unchanged visual playback rate.
// Every opponent uses the same policy; acquisition and ordinary SSS growth stay separate.
export const RAZAK_COMBAT=Object.freeze({
 version:4,basePower:1000000,statScale:2.4,speedScale:4,actionCredit:4,actionEnergy:10,
 link:Object.freeze({attackPercent:1400,hpPercent:800,shieldPercent:400}),
 damageTakenScale:.4,basicCapScale:1,pvpSkillCapScale:3,motionPlaybackRate:2
});
export const RAZAK_COMBAT_DESCRIPTION='기본 전투력 1,000,000의 SSS 기습 용병. 고유·장비 능력치 환산은 2.4배이며, 아군 일반 카드 평균 공격력의 1,400%를 최소 공격력, 평균 최대 체력의 800%를 최소 체력으로 사용합니다. 시작 방벽은 평균 최대 체력의 400%, 받는 피해 경감은 60%입니다. 자연 행동 속도 4배·아군 카드 1회 행동당 추가 4회 행동하며 자기 행동마다 에너지 10을 회복합니다. 기본 공격 피해 상한은 1배, PVP 암살 스킬 피해 상한은 3배입니다. 그림자 교차·무영 연살·월식 난무는 에너지 25와 공통 재사용 3행동을 사용하며, 월식 난무는 PVE 전용입니다. 기절·침묵·반격·중독에 면역은 없으며 성장의 피해 경감 관통이 적용됩니다. 모션 2배속·고정 대기, 블러드문팩 전용 일반 SSS·발행 한도 없음.';
export const RAZAK_SKILLS=Object.freeze([
 {id:'MS-061',name:'그림자 교차',visualMode:'cross',targetCount:1,target:'약화된 적 하나',ratio:4.4,effect:'약화된 적에게 순간 돌진해 쌍곡도를 교차합니다.'},
 {id:'MS-062',name:'무영 연살',visualMode:'flurry',targetCount:1,target:'후열 우선 적 하나',ratio:5.6,effect:'후열 핵심 적을 향해 낮은 베기·올려 베기·종결 참격을 이어갑니다.'},
 {id:'MS-063',name:'월식 난무',visualMode:'eclipse',targetCount:null,target:'적 전체 · PVE',pveOnly:true,ratio:7,effect:'적 진형에 진입해 거대한 원형 검격을 펼칩니다.'}
].map(({ratio,...s})=>Object.freeze({...s,role:'ASSASSIN',mechanic:RAZAK_MECHANIC,ready:true,
 balance:Object.freeze({damageRatio:ratio,cooldownTurns:3,cost:25}),
 trigger:'자기 행동 · 에너지 25 · 세 기술 공통 재사용 3행동'+(s.pveOnly?' · PVE 전용':''),
 effect:s.effect+` 한 시전의 총 ${Math.round(ratio*100)}% 피해를 실제 대상 수에 나누어 적용합니다.`,
 counterplay:'회피·방어·방벽·피해 경감·기절·침묵에 대응됩니다.',bossRule:'단일 보스도 같은 총 피해 예산을 사용합니다.',
 procRule:'대상당 서버 피해는 한 번입니다. 검격·잔상·2배속 재생은 추가 피해나 행동을 만들지 않습니다.'})));
export const RAZAK_ART=Object.freeze({
 code:RAZAK_CODE,name:'라자크',title:'쌍곡도의 암살자',rank:'SSS',edition:'STANDARD',
 nameStatus:'USER_CONFIRMED_20261024',rankStatus:'USER_ASSIGNED_RANK',position:'MIDDLE',role:'ASSASSIN',attackStyle:'MELEE',basicTarget:'약화된 전열 우선',
 artOnly:false,releaseStatus:'OWNER_PACK_CONTROLLED',acquisition:'BLOODMOON_PACK',acquisitionEnabled:false,packAcquisitionEnabled:true,deploymentEnabled:true,
 acquisitionDescription:'블러드문팩의 별도 일반 SSS 항목에서 획득합니다. 발행 한도 없음. 다른 팩·합성·제작·기적의 큐브에서는 획득할 수 없습니다.',
 sourceArt:RAZAK_ROOT+'source-art.png',sourceArtSha256:'2B9331D3A1A753234AF7E0AC7CCAA2764451DE6E843AE7A7912BFD5A298E8A06',
 battleSprite:RAZAK_ROOT+'idle.png',battleSpriteSha256:'7460D2757DBAB2F3AFEDEDE1ED1815EC47A6D4A1509A3CC3699287D980A4770E',
 thumbnailArt:RAZAK_ROOT+'art-320.webp',displayArt:RAZAK_ROOT+'art-640.webp',accent:'#d5bf85',
 battleSpriteViewport:Object.freeze({x:172,y:275,width:385,height:391,imageWidth:768,imageHeight:768}),
 basePower:RAZAK_COMBAT.basePower,skills:RAZAK_SKILLS,
 specialty:'쌍곡도 기습 · 이동 궤적을 따르는 잔상 · PVE 광역 참격',weakness:'집중 공격·방어·보호막·행동 제어에 취약',
 combatLinkDescription:RAZAK_COMBAT_DESCRIPTION
});
export const isRazak=a=>a?.isMercenary===true&&(a.code||a.cardId)===RAZAK_CODE;
export const razakActionCredit=actors=>actors.some(a=>isRazak(a)&&a.alive!==false&&a.hp>0)?RAZAK_COMBAT.actionCredit:1;
// Canonical damage calls this after hit caps and before shield/HP consumption.
// Growth mitigation bypass still applies afterwards; no target-specific immunity.
export const razakIncomingDamage=(target,incoming)=>isRazak(target)?Math.floor(Math.max(0,Number(incoming)||0)*RAZAK_COMBAT.damageTakenScale):incoming;
export function razakDeploymentSnapshot(){return {...RAZAK_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',basicTarget:'LOW_HP_ENEMY',skills:structuredClone(RAZAK_SKILLS),pendingSkillIds:[],deploymentVersion:'20261026-razak-tier-correction-v4'};}
