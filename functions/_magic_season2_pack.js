import {magicSeason2PackDraft} from '../shared/magic-pack-seasons-v1.mjs';
import {readRuntimeData,cacheRuntimeData,invalidateRuntimeData} from './_runtime_data_cache.js';

export const MAGIC_S2_PACK_SETTINGS_KEY='magic_season2_pack_settings_v1';
const CACHE_KEY='magic:season2-pack-draft';
export async function magicSeason2PackSettings(env,{fresh=true}={}){
 const cached=!fresh&&readRuntimeData(env,CACHE_KEY);if(cached)return cached;
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MAGIC_S2_PACK_SETTINGS_KEY).first();
 let draft;
 try{draft=magicSeason2PackDraft(row?.value?JSON.parse(row.value):{});}catch{draft=magicSeason2PackDraft();}
 return cacheRuntimeData(env,CACHE_KEY,draft,30000);
}
export function invalidateMagicSeason2PackCache(env){invalidateRuntimeData(env,CACHE_KEY);}
