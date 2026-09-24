import {CRYVERN_CODE,CRYVERN_NAME,CRYVERN_SKILL_ID,CRYVERN_POSITION,CRYVERN_BALANCE,CRYVERN_HASHES,CRYVERN_ASSETS,createCryvernSkill} from '../../../shared/mercenary-cryvern-v1.mjs';
import {validateMercenaryCms,expandMercenarySkillCatalog} from '../../../shared/mercenary-cms-model-v1.mjs';
export function cryvernRegistration(manifest){
 if(manifest.sourceArtInfo.sha256!==CRYVERN_HASHES.sourceArt||manifest.battleSpriteInfo.sha256!==CRYVERN_HASHES.battleSprite)throw Error('CRYVERN_APPROVED_ASSET_HASH');
 const card={code:CRYVERN_CODE,name:CRYVERN_NAME,title:'',rank:'SSS',rankStatus:'USER_ASSIGNED_RANK',nameStatus:'USER_ASSIGNED_NAME',
  role:'전위 돌격',weapon:'빙정 쌍검',outfit:'은백색 결정 갑옷',sourceArt:CRYVERN_ASSETS.sourceArt,sourceArtSha256:CRYVERN_HASHES.sourceArt,
  sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-22',catalogRelease:'LIVE_RELEASED',approvalBatch:'2026-09-24-cryvern-live',
  battleSprite:CRYVERN_ASSETS.battleSprite,battleSpriteSha256:CRYVERN_HASHES.battleSprite,battleSpriteStatus:'USER_APPROVED_BATTLE_SPRITE',
  battleSpriteFootAnchor:manifest.battleSpriteFootAnchor,accent:'#75dcff'};
 const definition=(id,name,role,target,mechanic,trigger,effect,counterplay,bossRule,visual,steps)=>({
  id,name,role,target,mechanic,trigger,effect,counterplay,bossRule,visual,steps,status:'DRAFT',runtimeEnabled:false,
  balance:{...CRYVERN_BALANCE},procRule:'추가 타격·반격은 새 스킬 발동이나 처치 초기화를 만들지 않습니다.'
 });
 const skill=createCryvernSkill(definition,(asset,motion,windup,impacts,duration,color)=>({asset,motion,windup,impacts,duration,color}));
 const cmsSkill=Object.fromEntries(['id','name','role','target','mechanic','trigger','effect','counterplay','bossRule','procRule','balance'].map(key=>[key,skill[key]]));
 Object.assign(cmsSkill,{review:'REVIEWED',notes:'2026-09-22 라그니엘보다 근소한 우위로 준비. 2026-09-24 라이브 승인.'});
 const mercenary={...CRYVERN_POSITION,name:CRYVERN_NAME,title:'',stats:{hp:null,attack:null,defense:null,speed:null},
  acquisition:{type:'DROP',source:'하이퍼팩 · SSS 당첨 후 크라이베른 선택 확률 0.1% (전체 확률은 CMS SSS 확률 × 0.001)',coinPrice:null,dropRate:null},
  growth:{maxLevel:null,hpPerLevel:null,attackPerLevel:null,defensePerLevel:null},review:'REVIEWED',notes:'사용자 이름·SSS 확정. 칭호 없음. 2026-09-24 라이브 승인.'};
 return {card,position:{...CRYVERN_POSITION},skill,cmsSkill,mercenary,assignment:{code:CRYVERN_CODE,skillIds:[CRYVERN_SKILL_ID]},
  attachment:{battleSpriteSha256:CRYVERN_HASHES.battleSprite,weaponKind:'SWORD',authoredFacing:1,weapon:{x:.78,y:.67},cast:{x:.5,y:.38},contact:{x:.5,y:.5}}};
}
// Pure, idempotent append. The caller's operating document is never overwritten.
export function prepareCryvernCandidate(seed,manifest){
 const r=cryvernRegistration(manifest),catalog=structuredClone(seed.catalog),defaults=structuredClone(seed.document);
 const existing=catalog.cards.find(c=>c.code===CRYVERN_CODE);
 if(existing&&(existing.sourceArtSha256!==CRYVERN_HASHES.sourceArt||existing.battleSpriteSha256!==CRYVERN_HASHES.battleSprite))throw Error('CRYVERN_CODE_COLLISION');
 if(!existing){
  if(catalog.skills.some(s=>s.id===CRYVERN_SKILL_ID))throw Error('CRYVERN_SKILL_ID_COLLISION');
  catalog.cards.push(r.card);catalog.skills.push(r.skill);
  defaults.mercenaries.push(r.mercenary);defaults.skills.push(r.cmsSkill);defaults.assignments.push(r.assignment);
 }
 validateMercenaryCms(defaults,catalog);
 return {registration:r,catalog,document:expandMercenarySkillCatalog(seed.document,defaults,catalog)};
}
export function appendCryvernRoster(roster,card){
 const value=structuredClone(roster),old=value.cards.find(c=>c.code===CRYVERN_CODE);
 if(old){if(old.sourceArtSha256!==card.sourceArtSha256||old.battleSpriteSha256!==card.battleSpriteSha256)throw Error('CRYVERN_CODE_COLLISION');return value;}
 value.cards.push(card);value.updatedAt='2026-09-22';
 for(const key of ['total','sourceArtReady','battleSpriteReady'])value.summary[key]++;
 return value;
}
