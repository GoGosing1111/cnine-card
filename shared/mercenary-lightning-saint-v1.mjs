import {RYUJIN_COMBAT} from './mercenary-ryujin-v1.mjs';

export const SAINT_CODE='V-957';
export const SAINT_EVENT='MERCENARY_LIGHTNING_SAINT_STRIKE';
export const SAINT_MECHANIC='LIGHTNING_GREATSWORD';
const basePower=4_500_000;
export const SAINT_COMBAT=Object.freeze({
  basePower,statsReferencePower:RYUJIN_COMBAT.statsReferencePower,statScale:basePower/RYUJIN_COMBAT.statsReferencePower,
  speedReferencePower:RYUJIN_COMBAT.speedReferencePower,speedScale:RYUJIN_COMBAT.speedScale,
  actionCredit:RYUJIN_COMBAT.actionCredit,link:RYUJIN_COMBAT.link,basicDamageScale:RYUJIN_COMBAT.basicDamageScale,
  basicCapScale:RYUJIN_COMBAT.basicCapScale*basePower/RYUJIN_COMBAT.basePower,
});
export const isLightningSaint=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===SAINT_CODE;
export const saintActionCredit=actors=>actors.some(a=>isLightningSaint(a)&&a.alive!==false&&a.hp>0)?SAINT_COMBAT.actionCredit:1;

const artRoot='assets/ui/project-v/mercenaries/lightning-saint-20261125/';
export const SAINT_SKILLS=Object.freeze([
  ['MS-1380', 'cleave', '대검 내려베기', 'ENEMY', 54, 792, [288]],
  ['MS-1381', 'cyclone', '원형 연참', 'ALL_ENEMIES', 64, 2240, [280, 556, 832, 1108, 1384, 1660]],
  ['MS-1382', 'rush', '섬전질주', 'ALL_ENEMIES', 66, 3320, [312, 800, 1288, 1776, 2264, 2752]],
  ['MS-1383', 'cross', '교차뇌광', 'ALL_ENEMIES', 68, 1936, [296, 656, 1000, 1232, 1424]],
  ['MS-1384', 'orbit', '환검추격', 'ENEMY', 69, 2440, [416, 976, 1120, 1264, 1408, 1552, 1696, 1984]],
  ['MS-1385', 'wave', '연쇄검파', 'ALL_ENEMIES', 66, 2120, [256, 552, 848, 1144, 1584]],
  ['MS-1386', 'wings', '뇌익검진', 'ALL_ENEMIES', 76, 4800, [512, 1168, 2432, 2576, 2720, 2864, 3008, 3152, 3296, 3440, 3920, 4320]],
  ['MS-1387', 'rain', '천검낙뢰', 'ALL_ENEMIES', 78, 3520, [472, 944, 1136, 1328, 1520, 1712, 1904, 2096, 2288, 2464, 2936]],
  ['MS-1388', 'prison', '검뢰결계', 'ALL_ENEMIES', 72, 3184, [544, 1024, 1296, 1568, 1840, 2112, 2504]],
  ['MS-1389', 'pursuit', '잔영난무', 'ENEMY', 84, 6832, [288, 768, 1144, 1648, 2048, 2560, 3000, 3384, 3920, 4376, 4920, 5464, 6072]],
  ['MS-1390', 'horizon', '뇌천일섬', 'ALL_ENEMIES', 90, 5032, [544, 1096, 1720, 2456, 2688, 2864, 3216, 4024, 4208]]
].map(([id,key,name,target,damageRatio,durationMs,contactsMs])=>Object.freeze({
  id,key,name,target,mechanic:SAINT_MECHANIC,role:'VANGUARD',ready:true,durationMs,contactsMs:Object.freeze(contactsMs),
  targetRule:target==='ALL_ENEMIES'?'all':'single',
  balance:Object.freeze({damageRatio,cooldownTurns:2,cost:10})
})));
export const SAINT_PVP_RATIO=.08;
export const SAINT_ART=Object.freeze({
  code:SAINT_CODE,name:'하츠',title:'',titleStatus:'DEFERRED_BY_USER',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
  sourceArt:artRoot+'illustration.png',thumbnailArt:artRoot+'portrait.webp',battleSprite:artRoot+'guard.webp',
  frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
  artWindow:{left:5.957,top:5.794,width:88.086,height:88.086},accent:'#ffd34a',basePower,artOnly:false,
  releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',acquisitionEnabled:false,
  packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
  combatLinkDescription:'기본 전투력 4,500,000. 단일기 3종과 광역기 8종을 순환합니다. 광역기는 시전 시 생존한 적 전체에 총 피해를 나누고, 각 검격에서 방어와 보호막을 적용합니다.',
  skills:SAINT_SKILLS
});
export function saintDeploymentSnapshot(){
  return {...SAINT_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',
    skills:structuredClone(SAINT_SKILLS),pendingSkillIds:[],deploymentVersion:'lightning-saint-20261125-v1'};
}
export const saintCodexSkills=()=>SAINT_SKILLS.map(s=>({...s,
  target:s.targetRule==='all'?'적 전체':'적 1명',
  effect:`총 ${s.contactsMs.length}타. PvE 계수 ${s.balance.damageRatio*100}%, PvP 계수 ${Math.round(s.balance.damageRatio*SAINT_PVP_RATIO*100)}%. ${s.targetRule==='all'?'생존한 적 전체에 총 피해를 분배합니다.':'선택한 적에게 집중합니다.'}`,
  trigger:'에너지 10 · 스킬 공통 재사용 2행동',bossRule:'보스 포함',counterplay:'방어·회피·보호막 적용',procRule:'서버가 정한 적중 시점마다 피해를 한 번씩 적용합니다.'
}));
