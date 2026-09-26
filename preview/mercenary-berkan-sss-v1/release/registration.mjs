import {CRYVERN_CODE,CRYVERN_BALANCE} from '../../../shared/mercenary-cryvern-v1.mjs';
import {validateMercenaryCms} from '../../../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw,mercenaryGradePools,mercenaryCardChances} from '../../../shared/mercenary-draw-policy-v1.mjs';
import {BERKAN_CODE,BERKAN_SKILL_ID,berkanSelectionWeights} from '../../../shared/mercenary-berkan-v1.mjs';
export {BERKAN_CODE,BERKAN_SKILL_ID,berkanSelectionWeights};
export const HASHES=Object.freeze({sourceArt:'E782A14D37A115ABA29D46F13D2443DBF5761A7DD99DCDA816B9908BA896507D',battleSprite:'79D144E33E1113C82787A93E6AD49BE3583A8DA1BA8DAAF91037020EC31D6101'});
export function berkanRegistration(manifest){
 if(manifest.sourceArtInfo.sha256!==HASHES.sourceArt||manifest.battleSpriteInfo.sha256!==HASHES.battleSprite)throw Error('BERKAN_ASSET_HASH');
 const position={code:BERKAN_CODE,rank:'SSS',position:'REAR',role:'SNIPER',basicTarget:'FRONT_ENEMY',skillTarget:'BACK_THREAT',specialty:'후열 핵심을 겨누는 흑금 화살 · 제자리 원거리 사격',weakness:'회피·호위·보호막·방어에 대응되며 제압 상태에서는 발동하지 않음',rationale:'사용자 지정 SSS 궁수. 달리기 대신 조준·발사·반동을 분리한 동작.'};
 const card={code:BERKAN_CODE,name:'베르칸',title:'흑금의 궁수',rank:'SSS',rankStatus:'USER_ASSIGNED_RANK',nameStatus:'USER_ASSIGNED_NAME',role:'후열 궁수',weapon:'흑금 장궁',outfit:'흑금 판금 갑옷',sourceArt:manifest.sourceArt,sourceArtSha256:HASHES.sourceArt,sourceArtStatus:'USER_SUPPLIED_SOURCE_ART',catalogRelease:'USER_APPROVED_LIVE',battleSprite:manifest.battleSprite,battleSpriteSha256:HASHES.battleSprite,battleSpriteStatus:'USER_APPROVED_LIVE',battleSpriteFootAnchor:manifest.battleSpriteFootAnchor,accent:'#edc878'};
 const skill={id:BERKAN_SKILL_ID,name:'흑금 낙성',role:'SNIPER',target:'BACK_THREAT',mechanic:'LOCKED_THREAT_SHOT',
  trigger:'살아 있는 후열 중 전투 시작 공격력이 가장 높은 적을 고정하고 현재 행동에서 조준과 사격을 완료합니다.',
  effect:'흑금 활에 힘을 응축해 고정 표적을 한 발로 타격합니다. 후열이 없으면 전열 단일을 겨눕니다.',
  counterplay:'회피·방어·보호막·호위·피해 경감이 적용됩니다. 사망·기절·침묵은 발동을 막고 표적 상실 시 취소합니다.',
  bossRule:'보스에게도 같은 단일 피해 예산입니다. 관통·파편은 시각 표현이며 방어 무시·추가 피해·추가 행동을 만들지 않습니다.',
  procRule:'광원·오라·파편은 피해와 발동 자원을 만들지 않습니다. 기존 서버 단일 저격 판정을 재사용합니다.',
  balance:{...CRYVERN_BALANCE},status:'DRAFT',runtimeEnabled:false,
  visual:{asset:'berkan-gilded-starfall',motion:'GILDED_STARFALL',windup:1.7,impacts:[2.08],duration:4.6,color:'#edc878'},
  steps:['흑금 광휘 집중','활시위 당김 · 코어 압축','관통 화살 · 낙성 파열','금빛 파편 · 잔광 소멸']};
 const cmsSkill=Object.fromEntries(['id','name','role','target','mechanic','trigger','effect','counterplay','bossRule','procRule','balance'].map(key=>[key,skill[key]]));
 Object.assign(cmsSkill,{review:'REVIEWED',notes:'신규 SSS 베르칸 전용 시안. 기존 크라이베른 피해 배율·비용·재사용 값을 초기 제안으로 복사. 2026-09-27 모션·오라 확정 및 운영 연결 승인.'});
 const mercenary={...position,name:'베르칸',title:'흑금의 궁수',stats:{hp:null,attack:null,defense:null,speed:null},acquisition:{type:'DROP',source:'하이퍼팩 · 현재 크라이베른과 동일한 SSS 내 가중치. SSS 등급 전체 확률 유지.',coinPrice:null,dropRate:null},growth:{maxLevel:null,hpPerLevel:null,attackPerLevel:null,defensePerLevel:null},review:'REVIEWED',notes:'사용자 이름·SSS 등급·크라이베른과 동일 희귀도 지정. 원화 보존. 모션·오라·스킬 연출 사용자 확정.'};
 return {card,position,skill,cmsSkill,mercenary,assignment:{code:BERKAN_CODE,skillIds:[BERKAN_SKILL_ID]},proposedAssignment:{code:BERKAN_CODE,skillIds:[BERKAN_SKILL_ID]}};
}
export function prepareBerkanCandidate(seed,manifest){
 const r=berkanRegistration(manifest),catalog=structuredClone(seed.catalog),document=structuredClone(seed.document);
 const existing=catalog.cards.find(c=>c.code===BERKAN_CODE);
 if(existing){if(existing.sourceArtSha256!==HASHES.sourceArt||existing.battleSpriteSha256!==HASHES.battleSprite)throw Error('BERKAN_CODE_COLLISION');return {registration:r,catalog,document:validateMercenaryCms(document,catalog)};}
 if(catalog.skills.some(s=>s.id===BERKAN_SKILL_ID))throw Error('BERKAN_SKILL_COLLISION');
 catalog.cards.push(r.card);catalog.skills.push(r.skill);document.mercenaries.push(r.mercenary);document.skills.push(r.cmsSkill);document.assignments.push(r.assignment);
 return {registration:r,catalog,document:validateMercenaryCms(document,catalog)};
}
// Evaluated against the saved CMS policy at release, never a guessed rate.
// Preserve every old relative weight and the SSS outcome ppm; add equal weight.
export function planBerkanDraw(policy,candidate){
 const before=validateMercenaryDraw(policy),codes=candidate.catalog.cards.map(c=>c.code),pools=mercenaryGradePools(candidate.document.mercenaries,codes);
 const proposed=validateMercenaryDraw({...before,cardRules:{...before.cardRules,cardWeights:berkanSelectionWeights(pools.SSS,before.cardRules.cardWeights)}},{catalogCodes:codes});
 const chances=mercenaryCardChances(proposed.outcomes.find(x=>x.id==='CARD_SSS').chancePpm,pools.SSS,proposed.cardRules);
 return {policy:proposed,chances,berkan:chances.find(c=>c.code===BERKAN_CODE),cryvern:chances.find(c=>c.code===CRYVERN_CODE)};
}
