export const RAZAK_CODE='V-058';
export const RAZAK_EVENT='MERCENARY_RAZAK_ASSASSINATION';
export const RAZAK_MECHANIC='CURVED_BLADE_ASSASSINATION';
export const RAZAK_ROOT='assets/ui/project-v/mercenaries/razak-20261024/';
export const RAZAK_PLAYBACK_RATE=2;
// Base power uses the ordinary SSS stat conversion and linkage. Animation speed
// does not grant more actions, damage rolls, immunities or energy.
export const RAZAK_COMBAT=Object.freeze({basePower:800000,motionPlaybackRate:2,version:1});
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
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',acquisitionEnabled:false,packAcquisitionEnabled:false,deploymentEnabled:true,
 acquisitionDescription:'현재 획득 불가. 팩·합성·제작·기적의 큐브에서 획득할 수 없습니다.',
 sourceArt:RAZAK_ROOT+'source-art.png',sourceArtSha256:'2B9331D3A1A753234AF7E0AC7CCAA2764451DE6E843AE7A7912BFD5A298E8A06',
 battleSprite:RAZAK_ROOT+'idle.png',battleSpriteSha256:'7460D2757DBAB2F3AFEDEDE1ED1815EC47A6D4A1509A3CC3699287D980A4770E',
 thumbnailArt:RAZAK_ROOT+'art-320.webp',displayArt:RAZAK_ROOT+'art-640.webp',accent:'#d5bf85',
 battleSpriteViewport:Object.freeze({x:172,y:275,width:385,height:391,imageWidth:768,imageHeight:768}),
 basePower:RAZAK_COMBAT.basePower,skills:RAZAK_SKILLS,
 specialty:'쌍곡도 기습 · 이동 궤적을 따르는 잔상 · PVE 광역 참격',weakness:'집중 공격·방어·보호막·행동 제어에 취약',
 combatLinkDescription:'기본 전투력 800,000의 SSS 기습 용병. 일반 SSS의 능력치 환산·전력 연계·행동 규칙을 따릅니다. 그림자 교차·무영 연살·월식 난무는 에너지 25와 공통 재사용 3행동을 사용하며, 월식 난무는 PVE 전용입니다. 빠른 암살 모션은 2배속이며 대기 몸체는 고정됩니다. 현재 획득 불가.'
});
export const isRazak=a=>a?.isMercenary===true&&(a.code||a.cardId)===RAZAK_CODE;
export function razakDeploymentSnapshot(){return {...RAZAK_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',basicTarget:'LOW_HP_ENEMY',skills:structuredClone(RAZAK_SKILLS),pendingSkillIds:[],deploymentVersion:'20261024-razak-v1'};}
