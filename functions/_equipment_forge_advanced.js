import {FORGE_ADVANCED_KEY,forgeAdvancedDraft,validateForgeAdvanced,forgeAdvancedReadiness,FORGE_SCROLL_ITEMS} from '../shared/equipment-forge-advanced-v1.mjs';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {ensureForgeScrollCatalog} from './_forge_scroll_catalog.js';
export async function readForgeAdvancedPolicy(DB){
 const row=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FORGE_ADVANCED_KEY).first();
 return row?validateForgeAdvanced(JSON.parse(row.value)):forgeAdvancedDraft();
}
export const readForgeAdvancedForLevels=(DB,rows,field='level')=>rows.some(row=>Number(row[field])>10)?readForgeAdvancedPolicy(DB):null;
export async function forgeAdvancedAdminState(env){
 await ensureForgeScrollCatalog(env);
 const policy=await readForgeAdvancedPolicy(env.DB);
 return {policy,readiness:forgeAdvancedReadiness(policy),items:FORGE_SCROLL_ITEMS,saveScope:'ADVANCED_LIVE',maxLevel:15};
}
export async function saveForgeAdvancedPolicy(env,user,raw){
 if(user.role!=='OWNER')throw jointError('FORGE_PERMISSION','OWNER만 고급 강화 정책을 관리할 수 있습니다.',403);
 const next=validateForgeAdvanced(raw),stored=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FORGE_ADVANCED_KEY).first(),previous=stored?validateForgeAdvanced(JSON.parse(stored.value)):forgeAdvancedDraft();
 if(next.revision!==previous.revision)throw jointError('FORGE_POLICY_CONFLICT','다른 창에서 고급 강화 설정을 변경했습니다. 새로고침 후 확인하세요.',409);
 for(let i=0;i<5;i++)if(previous.steps[i].powerBonusPercent!==null&&next.steps[i].powerBonusPercent===null)
  throw jointError('FORGE_ADVANCED_POWER','보유 장비 전투력을 보존하기 위해 설정된 증가율은 비울 수 없습니다. 비용·확률을 비우면 해당 단계 도전을 잠글 수 있습니다.',409);
 await ensureForgeScrollCatalog(env);
 const active=(await env.DB.prepare('SELECT code,is_active FROM inventory_items WHERE code IN (?,?)').bind(...FORGE_SCROLL_ITEMS.map(item=>item.code)).all()).results;
 if(forgeAdvancedReadiness(next).some(row=>row.ready)&&FORGE_SCROLL_ITEMS.some(item=>!active.some(row=>row.code===item.code&&Number(row.is_active)===1)))throw jointError('FORGE_MATERIAL_CONFIG','무기·방어구 강화주문서를 활성 상태로 등록하세요.',409);
 next.revision++;
 const DB=env.DB,encoded=JSON.stringify(next),token=crypto.randomUUID(),before=stored?.value??null;
 const same=before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
 try{await DB.batch([
  jointGuard(DB,token,same,before===null?[FORGE_ADVANCED_KEY]:[FORGE_ADVANCED_KEY,before]),
  DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(FORGE_ADVANCED_KEY,encoded),
  DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'EQUIPMENT_FORGE_ADVANCED_POLICY','APP_META',?,?,?)").bind(user.id,FORGE_ADVANCED_KEY,before,encoded),
  jointGuardEnd(DB,token)
 ]);}catch(error){const current=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FORGE_ADVANCED_KEY).first();if(current?.value===encoded)return forgeAdvancedAdminState(env);if((current?.value??null)!==before)throw jointError('FORGE_POLICY_CONFLICT','다른 창에서 고급 강화 설정을 변경했습니다. 다시 불러오세요.',409);throw error;}
 return forgeAdvancedAdminState(env);
}
