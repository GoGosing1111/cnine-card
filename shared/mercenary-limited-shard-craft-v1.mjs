import {limitedDeploymentSnapshot} from './mercenary-limited-deployment-v1.mjs';

export const LIMITED_CRAFT_SHARD='MERCENARY_SSS_LIMITED_SHARD';
export const LIMITED_CRAFT_SCOPE='SSS_LIMITED_SHARD';
export const LIMITED_CRAFT_STOCK_STEP=5;
export const LIMITED_CRAFT_STOCK_MAX=1000000;
// Explicitly approved roster. New catalog entries do not acquire a recipe automatically.
export const LIMITED_SHARD_CRAFTS=Object.freeze([
 'V-996','V-999','V-989','V-988','V-987','V-979','V-978','V-976','V-975','V-974','V-973','V-972'
].map((code,index)=>{
 const art=limitedDeploymentSnapshot(code);
 if(art?.rank!=='SSS'||art.edition!=='LIMITED')throw Error('SSS 리미티드 제작 대상을 확인하세요.');
 return Object.freeze({code,art,power:art.basePower,key:`mercenary_limited_shard_craft_v1:${code}`,
  recipeCode:`WORKSHOP_SSS_LIMITED_SHARD_${code.replace('-','_')}`,prefix:`SSS_LIMITED_SHARD_${code.replace('-','_')}`,
  scope:LIMITED_CRAFT_SCOPE,requiredMaterial:LIMITED_CRAFT_SHARD,limit:LIMITED_CRAFT_STOCK_STEP,
  draftId:-10000-Number(code.slice(2)),name:`${art.name} · SSS 리미티드 조각 제작`,
  description:'SSS 리미티드 조각 전용 제작 · 일반 조각 제작·팩·직접 지급과 발행 수량 별도',
  sort:1100+index,masterStarMax:100000000});
}));
export const isLimitedShardCraft=definition=>definition?.scope===LIMITED_CRAFT_SCOPE;
