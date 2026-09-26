import {CRYVERN_CODE} from '../../../shared/mercenary-cryvern-v1.mjs';
import {MERCENARY_SKILLS} from '../../../shared/mercenary-skills-v1.mjs';
import {validateMercenaryCms} from '../../../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw,mercenaryGradePools,mercenaryCardChances} from '../../../shared/mercenary-draw-policy-v1.mjs';
import {BERKAN_CODE,BERKAN_SKILL_ID,BERKAN_BALANCE,BERKAN_POSITION,berkanSelectionWeights,BERKAN_SOURCE_ART,BERKAN_BATTLE_SPRITE} from '../../../shared/mercenary-berkan-v1.mjs';
export {BERKAN_CODE,BERKAN_SKILL_ID,berkanSelectionWeights};
export const HASHES=Object.freeze({sourceArt:'E782A14D37A115ABA29D46F13D2443DBF5761A7DD99DCDA816B9908BA896507D',battleSprite:'79D144E33E1113C82787A93E6AD49BE3583A8DA1BA8DAAF91037020EC31D6101'});
export function berkanRegistration(manifest){
 if(manifest.sourceArtInfo.sha256!==HASHES.sourceArt||manifest.battleSpriteInfo.sha256!==HASHES.battleSprite)throw Error('BERKAN_ASSET_HASH');
 const position={...BERKAN_POSITION};
 const card={code:BERKAN_CODE,name:'베르칸',title:'흑금의 궁수',rank:'SSS',rankStatus:'USER_ASSIGNED_RANK',nameStatus:'USER_ASSIGNED_NAME',role:'후열 궁수',weapon:'흑금 장궁',outfit:'흑금 판금 갑옷',sourceArt:BERKAN_SOURCE_ART,sourceArtSha256:HASHES.sourceArt,sourceArtStatus:'USER_SUPPLIED_SOURCE_ART',catalogRelease:'USER_APPROVED_LIVE',battleSprite:BERKAN_BATTLE_SPRITE,battleSpriteSha256:HASHES.battleSprite,battleSpriteStatus:'USER_APPROVED_LIVE',battleSpriteFootAnchor:manifest.battleSpriteFootAnchor,accent:'#edc878'};
 const skill={...structuredClone(MERCENARY_SKILLS.find(s=>s.id===BERKAN_SKILL_ID)),balance:{...BERKAN_BALANCE}};
 const cmsSkill=Object.fromEntries(['id','name','role','target','mechanic','trigger','effect','counterplay','bossRule','procRule','balance'].map(key=>[key,skill[key]]));
 Object.assign(cmsSkill,{review:'REVIEWED',notes:'2026-09-27 사용자 승인: 후열 우선 2명 동시 사격, 크라이베른 동급~소폭 아래로 조정. 원화·모션·오라 유지.'});
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
