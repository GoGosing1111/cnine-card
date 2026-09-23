import {readReleasedForgePolicy} from './_equipment_forge_release.js';
import {EQUIPMENT_FORGE_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {readForgeSettings} from './_equipment_forge_public.js';
import {forgeRuntimeDraft,validateForgePolicy,FORGE_RUNTIME_KEY,forgePower,FORGE_ENHANCEMENT_MATERIAL} from '../shared/equipment-forge-policy-v1.mjs';
import {EQUIPMENT_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {jointError} from './_joint_request.js';import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {ensureJointTransactionSchema,saveJointPolicyDraft,jointRequestId,jointHash,runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';
import {readForgePreparationInventory} from './_equipment_forge_preparation.js';
import {assertForgeMaterials} from './_equipment_forge_cms.js';
import {forgeResourceShortage} from '../shared/equipment-forge-resources-v1.mjs';
export const FORGE_TRANSACTION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS equipment_forge_states_v1(instance_id BIGINT PRIMARY KEY,user_id BIGINT NOT NULL,level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 10),revision INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS equipment_forge_quotes_v1(quote_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,input_hash TEXT NOT NULL,kind TEXT NOT NULL,plan_json TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_by TEXT)`,
 `CREATE TABLE IF NOT EXISTS equipment_forge_destroyed_v1(record_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,original_instance_id TEXT NOT NULL,equipment_id BIGINT NOT NULL,level INTEGER NOT NULL,revision INTEGER NOT NULL,item_json TEXT NOT NULL,destroyed_at TEXT NOT NULL,restored_instance_id TEXT,restore_request_id TEXT)`,
 `CREATE INDEX IF NOT EXISTS equipment_forge_destroyed_user_v1 ON equipment_forge_destroyed_v1(user_id,destroyed_at)`
];
export async function ensureForgeTransactionSchema(env){await ensureJointTransactionSchema(env);if(env.DB.execSchema)await env.DB.execSchema(FORGE_TRANSACTION_SCHEMA);else for(const s of FORGE_TRANSACTION_SCHEMA)await env.DB.prepare(s).run();}
export async function readForgeRuntime(env,{draft=false}={}){
 const release=draft?null:await readReleasedForgePolicy(env);
 if(release){const settings=EQUIPMENT_FORGE_RELEASE_ENABLED?(await readForgeSettings(env)).settings:null;return {...validateForgePolicy({...release,mode:'TEST'}),mode:settings&&(!settings.publicVisible||settings.executionMode!=='ON')?'OFF':'ON',approved:true};}
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FORGE_RUNTIME_KEY).first();return row?validateForgePolicy(JSON.parse(row.value)):forgeRuntimeDraft();
}
export async function saveForgeRuntime(env,user,policy){
 if(user.role!=='OWNER')throw jointError('FORGE_PERMISSION','OWNER만 정책을 저장할 수 있습니다.',403);
 const next=validateForgePolicy(policy),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FORGE_RUNTIME_KEY).first(),before=row?JSON.parse(row.value):forgeRuntimeDraft();if(next.revision!==before.revision)throw jointError('FORGE_POLICY_CONFLICT','다른 창에서 정책을 변경했습니다.',409);next.revision++;
 await assertForgeMaterials(env,next);
 return saveJointPolicyDraft(env,user,FORGE_RUNTIME_KEY,row?.value??null,next);
}
const allow=(policy,user)=>{if(policy.mode==='OFF'||policy.mode==='TEST'&&user.role!=='OWNER')throw jointError('FORGE_OFF','장비 강화·복구를 준비 중입니다.',423);};
function requireEnhancementCost(cost){if(cost?.itemCode!==FORGE_ENHANCEMENT_MATERIAL||!Number.isSafeInteger(cost.itemQuantity)||cost.itemQuantity<1||!Number.isSafeInteger(cost.coinCost)||cost.coinCost<1)throw jointError('FORGE_POLICY_PENDING','강화 단계별 코인·마스터의 별 비용을 설정하세요.',409);}
const id=value=>{if(typeof value!=='string'||!/^\d{1,19}$/.test(value)||BigInt(value)<1n||BigInt(value)>9223372036854775807n)throw jointError('FORGE_INSTANCE','장비 번호를 확인하세요.');return value;};
async function owned(env,user,instanceId){
 const row=await env.DB.prepare(`SELECT x.*,i.code,i.name,i.slot,i.rarity,i.subtype,i.image_url,i.total_power,i.pve_power,i.pvp_power,COALESCE(s.level,0) AS level,COALESCE(s.revision,0) AS revision FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id WHERE x.id=? AND x.user_id=? AND i.is_active=1 AND i.is_public=1`).bind(id(instanceId),user.id).first();
 if(!row||!EQUIPMENT_POWER_STANDARD.supportedSlots.includes(row.slot))throw jointError('FORGE_NOT_OWNED','강화할 수 있는 내 장비를 선택하세요.',404);
 return {instanceId:String(row.id),equipmentId:String(row.equipment_id),name:row.name,code:row.code,slot:row.slot,grade:row.rarity,subtype:row.subtype,image:row.image_url,level:Number(row.level),revision:Number(row.revision),basePower:{total:Number(row.total_power),pve:Number(row.pve_power),pvp:Number(row.pvp_power)}};
}
async function destroyed(env,user,recordId){const row=await env.DB.prepare('SELECT * FROM equipment_forge_destroyed_v1 WHERE record_id=? AND user_id=?').bind(jointRequestId(recordId),user.id).first();if(!row||row.restored_instance_id)throw jointError('FORGE_RECORD','복구할 수 있는 내 파괴 기록을 선택하세요.',404);return {...row,item:JSON.parse(row.item_json)};}
export async function forgeQuote(env,user,body,{now=Date.now()}={}){
 const quoteId=jointRequestId(body.requestId),kind=body.kind,protectedAttempt=body.useProtection??false;if(!['ENHANCE','RESTORE'].includes(kind)||typeof protectedAttempt!=='boolean')throw jointError('FORGE_QUOTE','강화 또는 복구를 선택하세요.');
 const key=kind==='ENHANCE'?id(body.instanceId):jointRequestId(body.recordId),input={kind,key,protectedAttempt},hash=await jointHash(input),DB=env.DB;
 const prior=await DB.prepare('SELECT * FROM equipment_forge_quotes_v1 WHERE quote_id=?').bind(quoteId).first();
 if(prior){if(Number(prior.user_id)!==Number(user.id)||prior.input_hash!==hash)throw jointError('FORGE_QUOTE_CONFLICT','같은 견적 번호에 다른 내용이 있습니다.',409);return {...JSON.parse(prior.plan_json),quoteId,expiresAt:prior.expires_at,consumed:Boolean(prior.consumed_by)};}
 const policy=await readForgeRuntime(env);allow(policy,user);let item,cost,recordId=null,restoreDeadline=null;
 if(kind==='ENHANCE'){item=await owned(env,user,key);if(item.level>=10)throw jointError('FORGE_MAX_LEVEL','최대 +10 장비입니다.',409);cost=policy.steps[item.level];requireEnhancementCost(cost);if([cost.successPpm,cost.maintainPpm,cost.destroyPpm,cost.coinCost].some(v=>v===null))throw jointError('FORGE_POLICY_PENDING','해당 단계의 확률·비용이 미설정입니다.',409);if(protectedAttempt&&(!policy.protection.itemCode||policy.protection.consume==='UNSET'||cost.protectionQuantity===null))throw jointError('FORGE_PROTECTION_PENDING','보호권 소모 정책이 미설정입니다.',409);}
 else{const record=await destroyed(env,user,key);recordId=key;item=record.item;cost=policy.restoration;if(!cost.enabled)throw jointError('FORGE_RESTORE_OFF','복구 정책을 준비 중입니다.',423);if(cost.expiresHours>0){restoreDeadline=Date.parse(record.destroyed_at)+cost.expiresHours*3600000;if(now>restoreDeadline)throw jointError('FORGE_RESTORE_EXPIRED','복구 가능 기간이 지났습니다.',409);}if(protectedAttempt)throw jointError('FORGE_QUOTE','복구에는 강화 보호권을 사용하지 않습니다.');}
 if(protectedAttempt&&cost.protectionQuantity===0)throw jointError('FORGE_PROTECTION_UNAVAILABLE','이 단계에서는 보호권을 사용할 수 없습니다.',409);
 if(cost.itemCode){const material=await DB.prepare('SELECT name,image_url FROM inventory_items WHERE code=? AND is_active=1').bind(cost.itemCode).first();if(!material)throw jointError('FORGE_MATERIAL_CONFIG','사용 가능한 재료를 설정하세요.',409);cost={...cost,itemName:material.name,itemImage:material.image_url||''};}
 if(protectedAttempt&&!await DB.prepare('SELECT code FROM inventory_items WHERE code=? AND is_active=1').bind(policy.protection.itemCode).first())throw jointError('FORGE_MATERIAL_CONFIG','보호권이 미등록 또는 비활성 상태입니다.',409);
 const expiresAt=new Date(Math.min(now+policy.quoteSeconds*1000,restoreDeadline??Infinity)).toISOString(),plan={kind,item,recordId,cost,protectedAttempt,protection:policy.protection,policyVersion:policy.version,policyRevision:policy.revision};
 // Retries of a timed-out quote use the SAME ID; concurrent tabs must receive
 // the single stored snapshot, not a unique-key failure or a different plan.
 await DB.prepare('INSERT INTO equipment_forge_quotes_v1(quote_id,user_id,input_hash,kind,plan_json,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(quote_id) DO NOTHING').bind(quoteId,user.id,hash,kind,JSON.stringify(plan),expiresAt).run();
 const stored=await DB.prepare('SELECT * FROM equipment_forge_quotes_v1 WHERE quote_id=?').bind(quoteId).first();
 if(!stored||Number(stored.user_id)!==Number(user.id)||stored.input_hash!==hash)throw jointError('FORGE_QUOTE_CONFLICT','같은 견적 번호에 다른 내용이 있습니다.',409);
 return {...JSON.parse(stored.plan_json),quoteId,expiresAt:stored.expires_at,consumed:Boolean(stored.consumed_by)};
}
async function quotePlan(env,user,quoteId,kind,now){
 const row=await env.DB.prepare('SELECT * FROM equipment_forge_quotes_v1 WHERE quote_id=? AND user_id=? AND kind=?').bind(jointRequestId(quoteId),user.id,kind).first();if(!row)throw jointError('FORGE_QUOTE','내 견적을 다시 받아 주세요.',404);if(row.consumed_by)throw jointError('FORGE_QUOTE_CONFLICT','이미 사용한 견적입니다.',409);if(Date.parse(row.expires_at)<now)throw jointError('FORGE_QUOTE_EXPIRED','견적이 만료됐습니다. 다시 확인하세요.',409);return JSON.parse(row.plan_json);
}
export async function executeForge(env,user,body,kind,{randomInt=mercenaryRandomInt,now=Date.now()}={}){
 const quoteId=jointRequestId(body.quoteId),requestId=jointRequestId(body.requestId);
 const r=await runJointOperation(env,user,{requestId,kind:`FORGE_${kind}`,input:{quoteId},prepare:async()=>{
   allow(await readForgeRuntime(env),user);const plan=await quotePlan(env,user,quoteId,kind,now);if(kind==='ENHANCE')requireEnhancementCost(plan.cost);
   const coins=Number((await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()).coin);
   if(coins<plan.cost.coinCost)throw jointError('FORGE_FUNDS',forgeResourceShortage('코인',plan.cost.coinCost,coins,'코인'),409);
   for(const [code,quantity,name,unit]of[
    [plan.cost.itemCode,plan.cost.itemQuantity,plan.cost.itemCode===FORGE_ENHANCEMENT_MATERIAL?'마스터의 별':plan.cost.itemName||'복구 재료','개'],
    ...(plan.protectedAttempt?[[plan.protection.itemCode,plan.cost.protectionQuantity,'장비 보호권','장']]:[])
   ])if(code){const row=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,code).first(),owned=Number(row?.quantity||0);if(owned<quantity)throw jointError('FORGE_MATERIAL',forgeResourceShortage(name,quantity,owned,unit),409);}
   let rolled='RESTORED',outcome=rolled;if(kind==='ENHANCE'){const current=await owned(env,user,plan.item.instanceId);if(current.revision!==plan.item.revision||current.level!==plan.item.level)throw jointError('FORGE_STALE','장비가 변경됐습니다. 견적을 다시 받으세요.',409);
     const n=randomInt(1000000);if(!Number.isSafeInteger(n)||n<0||n>=1000000)throw Error('INVALID_FORGE_RANDOM');rolled=n<plan.cost.successPpm?'SUCCESS':n<plan.cost.successPpm+plan.cost.maintainPpm?'MAINTAIN':'DESTROY';outcome=rolled==='DESTROY'&&plan.protectedAttempt?'PROTECTED':rolled;
   }else await destroyed(env,user,plan.recordId);
   const nextLevel=kind==='RESTORE'?(plan.cost.levelMode==='PREVIOUS'?plan.item.level:0):outcome==='SUCCESS'?plan.item.level+1:plan.item.level;
   return {...plan,quoteId,rolled,outcome,nextLevel};
 },statements:async plan=>{
   if(kind==='ENHANCE')requireEnhancementCost(plan.cost);
   allow(await readForgeRuntime(env),user);const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
   if(kind==='ENHANCE'){let current;try{current=await owned(env,user,plan.item.instanceId);}catch(error){if(error.code==='FORGE_NOT_OWNED')throw Object.assign(jointError('FORGE_STALE','장비가 변경됐습니다. 최신 목록에서 다시 선택하세요.',409),{terminal:true});throw error;}if(current.revision!==plan.item.revision||current.level!==plan.item.level)throw Object.assign(jointError('FORGE_STALE','장비 단계가 변경됐습니다. 견적을 다시 받으세요.',409),{terminal:true});}
   else{try{await destroyed(env,user,plan.recordId);}catch(error){if(error.code==='FORGE_RECORD')error.terminal=true;throw error;}}
   const list=[jointGuard(DB,token,'EXISTS(SELECT 1 FROM equipment_forge_quotes_v1 WHERE quote_id=? AND user_id=? AND consumed_by IS NULL)',[quoteId,user.id])];
   list.push(...jointCoinDebit(DB,user.id,plan.cost.coinCost,`장비 ${kind==='RESTORE'?'복구':'강화'} ${requestId}`));if(plan.cost.itemCode)list.push(...jointInventoryChange(DB,user.id,plan.cost.itemCode,-plan.cost.itemQuantity,'장비 강화·복구',requestId));
   if(kind==='ENHANCE'){
     list.push(p(`UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id WHERE x.id=? AND x.user_id=? AND x.equipment_id=? AND i.is_active=1 AND i.is_public=1 AND COALESCE(s.level,0)=? AND COALESCE(s.revision,0)=?) THEN 1 ELSE 0 END WHERE token=?`,plan.item.instanceId,user.id,plan.item.equipmentId,plan.item.level,plan.item.revision,token));
     if(plan.protectedAttempt){list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?) THEN 1 ELSE 0 END WHERE token=?',user.id,plan.protection.itemCode,plan.cost.protectionQuantity,token));if(plan.protection.consume==='ON_ATTEMPT'||plan.rolled==='DESTROY')list.push(...jointInventoryChange(DB,user.id,plan.protection.itemCode,-plan.cost.protectionQuantity,'장비 보호',requestId));}
     if(plan.outcome==='DESTROY'){
       list.push(p('INSERT INTO equipment_forge_destroyed_v1(record_id,user_id,original_instance_id,equipment_id,level,revision,item_json,destroyed_at) VALUES(?,?,?,?,?,?,?,?)',requestId,user.id,plan.item.instanceId,plan.item.equipmentId,plan.item.level,plan.item.revision,JSON.stringify(plan.item),new Date(now).toISOString()),
        p('DELETE FROM user_equipment_loadout WHERE user_id=? AND instance_id=?',user.id,plan.item.instanceId),p('DELETE FROM equipment_forge_states_v1 WHERE user_id=? AND instance_id=?',user.id,plan.item.instanceId),p('DELETE FROM user_equipment_instances WHERE id=? AND user_id=?',plan.item.instanceId,user.id));
     }else list.push(p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,?,?,?) ON CONFLICT(instance_id) DO UPDATE SET level=excluded.level,revision=excluded.revision',plan.item.instanceId,user.id,plan.nextLevel,plan.item.revision+1));
   }else{
     list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM equipment_forge_destroyed_v1 d JOIN character_equipment_items i ON i.id=d.equipment_id WHERE d.record_id=? AND d.user_id=? AND d.restored_instance_id IS NULL AND i.is_active=1 AND i.is_public=1) THEN 1 ELSE 0 END WHERE token=?',plan.recordId,user.id,token));
     // Production instances are very large and request_id is NOT globally
     // unique/indexed. Carry the inserted ID through RETURNING, never search
     // millions of owned rows or build a new full-table index during release.
     if(DB.dialect==='postgres')list.push(p(`WITH restored AS (
       INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
       SELECT user_id,equipment_id,'FORGE_RESTORE',record_id,? FROM equipment_forge_destroyed_v1
       WHERE record_id=? AND user_id=? AND restored_instance_id IS NULL RETURNING id,user_id
     ), restored_state AS (
       INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) SELECT id,user_id,?,1 FROM restored RETURNING instance_id
     ) UPDATE equipment_forge_destroyed_v1 SET restored_instance_id=CAST(restored_state.instance_id AS TEXT),restore_request_id=?
       FROM restored_state WHERE record_id=? AND user_id=? AND restored_instance_id IS NULL`,requestId,plan.recordId,user.id,plan.nextLevel,requestId,plan.recordId,user.id));
     else list.push(
       p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT user_id,equipment_id,'FORGE_RESTORE',record_id,? FROM equipment_forge_destroyed_v1 WHERE record_id=? AND user_id=? AND restored_instance_id IS NULL",requestId,plan.recordId,user.id),
       p("INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) SELECT id,user_id,?,1 FROM user_equipment_instances WHERE request_id=? AND user_id=? AND source_type='FORGE_RESTORE' AND source_id=?",plan.nextLevel,requestId,user.id,plan.recordId),
       p("UPDATE equipment_forge_destroyed_v1 SET restored_instance_id=(SELECT CAST(id AS TEXT) FROM user_equipment_instances WHERE request_id=? AND user_id=? AND source_type='FORGE_RESTORE' AND source_id=?),restore_request_id=? WHERE record_id=? AND user_id=? AND restored_instance_id IS NULL",requestId,user.id,plan.recordId,requestId,plan.recordId,user.id));
     list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM equipment_forge_destroyed_v1 WHERE record_id=? AND user_id=? AND restore_request_id=? AND restored_instance_id IS NOT NULL) THEN 1 ELSE 0 END WHERE token=?',plan.recordId,user.id,requestId,token));
   }
   list.push(p('UPDATE equipment_forge_quotes_v1 SET consumed_by=? WHERE quote_id=? AND user_id=? AND consumed_by IS NULL',requestId,quoteId,user.id),jointGuardEnd(DB,token));return list;
 }});return forgeReceipt(env,user,requestId,kind,r.replayed);
}
export async function forgeReceipt(env,user,requestId,kind,replayed=true){
 if(!['ENHANCE','RESTORE'].includes(kind))throw jointError('FORGE_KIND','기록 종류를 확인하세요.');const op=await readJointOperation(env,user.id,requestId,`FORGE_${kind}`);if(op.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
 let instanceId=op.plan.item.instanceId;if(kind==='RESTORE')instanceId=(await env.DB.prepare('SELECT restored_instance_id FROM equipment_forge_destroyed_v1 WHERE record_id=? AND user_id=?').bind(op.plan.recordId,user.id).first()).restored_instance_id;
 return {requestId,status:'COMPLETED',kind,replayed,instanceId,item:op.plan.item,recordId:op.plan.outcome==='DESTROY'?requestId:op.plan.recordId,outcome:op.plan.outcome,rolled:op.plan.rolled,level:op.plan.nextLevel,coinCost:op.plan.cost.coinCost,itemCode:op.plan.cost.itemCode,itemQuantity:op.plan.cost.itemQuantity,policyVersion:op.plan.policyVersion,power:forgePower(op.plan.item.basePower.total,op.plan.nextLevel)};
}
export async function forgeAccountState(env,user,options){
 const [inventory,policy,wallet,records,history]=await Promise.all([readForgePreparationInventory(env.DB,user.id,{...options,includeEnhancement:true}),readForgeRuntime(env),env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first(),env.DB.prepare('SELECT * FROM equipment_forge_destroyed_v1 WHERE user_id=? ORDER BY destroyed_at DESC LIMIT 60').bind(user.id).all(),env.DB.prepare("SELECT request_id,kind,status,plan_json,created_at FROM joint_operations_v1 WHERE user_id=? AND kind IN('FORGE_ENHANCE','FORGE_RESTORE') ORDER BY created_at DESC LIMIT 30").bind(user.id).all()]);
 const available=policy.mode==='ON'||policy.mode==='TEST'&&user.role==='OWNER',items=inventory.items;
 const stars=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,FORGE_ENHANCEMENT_MATERIAL).first();
 const protection=policy.protection.itemCode?await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,policy.protection.itemCode).first():null;
 return {...inventory,items,mode:'ACCOUNT',publicVisible:true,executionMode:policy.mode,canEnhance:available,canRestore:available&&policy.restoration.enabled,notice:available?'장비를 선택하고 확률·비용을 확인하세요.':'강화 공동 업데이트를 준비 중입니다.',policy,wallet:{coins:String(wallet.coin),masterStars:Number(stars?.quantity||0),protection:policy.protection.itemCode?Number(protection?.quantity||0):null},records:records.results.map(r=>({...JSON.parse(r.item_json),recordId:r.record_id,destroyedAt:r.destroyed_at,restoredInstanceId:r.restored_instance_id})),history:history.results.map(r=>({requestId:r.request_id,kind:r.kind,status:r.status,createdAt:r.created_at,...(r.status==='COMPLETED'?{outcome:JSON.parse(r.plan_json).outcome}:{} )}))};
}
export async function forgeEquipmentBonus(env,userId){
 const rows=(await env.DB.prepare(`SELECT i.total_power,i.pve_power,i.pvp_power,s.level FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id JOIN character_equipment_items i ON i.id=x.equipment_id JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id WHERE l.user_id=? AND i.is_active=1 AND i.slot IN('WEAPON','TOP','BOTTOM','SHOES','ACCESSORY') AND s.level>0`).bind(userId).all()).results;
 return rows.reduce((sum,row)=>{const p=forgePower(Number(row.total_power),Number(row.level));sum.pve+=p.pve-Number(row.pve_power);sum.pvp+=p.pvp-Number(row.pvp_power);return sum;},{pve:0,pvp:0});
}
export async function forgeEquipmentBonuses(env,userIds){
 if(!userIds.length)return new Map();const ids=[...new Set(userIds.map(Number))];if(ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw jointError('FORGE_USERS','계정 범위를 확인하세요.');
 const rows=(await env.DB.prepare(`SELECT l.user_id,i.total_power,i.pve_power,i.pvp_power,s.level FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id JOIN character_equipment_items i ON i.id=x.equipment_id JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id WHERE l.user_id IN (${ids.map(()=>'?').join(',')}) AND i.is_active=1 AND i.slot IN('WEAPON','TOP','BOTTOM','SHOES','ACCESSORY') AND s.level>0`).bind(...ids).all()).results;
 const result=new Map();for(const row of rows){const id=Number(row.user_id),sum=result.get(id)||{pve:0,pvp:0},power=forgePower(Number(row.total_power),Number(row.level));sum.pve+=power.pve-Number(row.pve_power);sum.pvp+=power.pvp-Number(row.pvp_power);result.set(id,sum);}return result;
}
