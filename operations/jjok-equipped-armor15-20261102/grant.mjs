import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};

export const OPERATION_KEY='ops:jjok-equipped-armor15:20261102:v1',ACTION='OPS_EQUIPPED_ARMOR_LEVEL15',IDS=['303'];
export const TARGETS=[{userId:'303',nickname:'[C9]족쪽이'}];
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),PLAN_HASH=hash(plan);
const instanceIds=plan.targets.map(t=>t.instanceId);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;

export function validate(expected){
 assert.equal(expected,PLAN_HASH,'Pinned plan required');assert.equal(hash(plan),PLAN_HASH);
 assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(plan.authorization,'[C9]족쪽이 장착중인 방어구,장신구 다 15강으로 변경해');
 assert.deepEqual([plan.recipient.id,plan.recipient.nickname,plan.recipient.role,plan.recipient.status],['303','[C9]족쪽이','USER','ACTIVE']);
 assert.match(plan.recipient.identityHash,/^[a-f0-9]{64}$/);assert.equal(plan.scope,'CURRENT_CHARACTER_EQUIPPED_ARMOR_AND_ACCESSORY');
 assert.deepEqual(plan.targetSlots,['TOP','BOTTOM','SHOES','ACCESSORY']);assert.equal(plan.targetLevel,15);assert.equal(plan.cost,0);assert.equal(plan.automaticLoadout,false);assert.equal(plan.sendMessages,false);
 assert.deepEqual(plan.targets.map(t=>[t.slot,t.instanceId,t.equipmentId,t.code,t.beforeLevel,t.beforeRevision,t.afterLevel]),[
  ['TOP','3033292389','43','EMPEROR_TOP',14,21,15],
  ['BOTTOM','2205682905','44','EMPEROR_BOTTOM',10,6,15],
  ['SHOES','3032290095','45','EMPEROR_SHOES',10,4,15],
  ['ACCESSORY','2262205865','46','EMPEROR_DUAL_DISK',10,2,15]
 ]);assert(plan.targets.every(t=>t.hasForgeState));
}

export async function inspect(db){
 const fields={
  users:'SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=303',
  identities:'SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=303',
  equipmentLoadout:'SELECT * FROM user_equipment_loadout WHERE user_id=303 ORDER BY slot',
  equipped:`SELECT x.id::text,x.user_id::text,x.equipment_id::text,x.source_type,x.source_id,x.request_id,x.acquired_at,i.code,i.name,i.slot,i.is_active,i.is_public
    FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id JOIN character_equipment_items i ON i.id=x.equipment_id WHERE l.user_id=303 ORDER BY l.slot`,
  forge:'SELECT instance_id::text,user_id::text,level,revision FROM equipment_forge_states_v1 WHERE user_id=303 ORDER BY instance_id',
  equipmentCounts:'SELECT * FROM user_equipment_counts_v1 WHERE user_id=303 ORDER BY equipment_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=303 ORDER BY item_code',
  settings:"SELECT key,value FROM app_meta WHERE key LIKE 'equipment_polish_instance_v1:303:%' OR key LIKE 'mercenary_equipment%:303%' OR key IN ('equipment_forge_advanced_policy_v1','equipment_forge_runtime_v1','equipment_forge_settings_v1') ORDER BY key",
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=303',
  ranked:'SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=303'
 };
 const state=one(await q(db,`SELECT jsonb_build_object(${Object.entries(fields).map(([name,sql])=>`'${name}',${arr(sql)}`).join(',')}) AS data`)).data;
 state.identities=state.identities.map(row=>({identityHash:hash(row)}));
 state.logs=await q(db,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE target_id=$1 ORDER BY id',[OPERATION_KEY]);
 const previous=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);state.receipt=previous.length?parse(one(previous).value):null;
 return state;
}
export const protectedState=state=>({...state,forge:state.forge.filter(row=>!instanceIds.includes(row.instance_id)),sync:undefined,ranked:undefined,logs:undefined,receipt:undefined});
function validateSnapshot(state){
 const user=one(state.users);for(const key of ['id','nickname','role','status'])assert.equal(user[key],plan.recipient[key],'Recipient '+key+' changed');
 assert.equal(one(state.identities).identityHash,plan.recipient.identityHash,'Verified identity changed');
 assert.equal(state.receipt,null);assert.equal(state.logs.length,0,'Orphan operation audit');
 for(const target of plan.targets){
  const loadout=one(state.equipmentLoadout.filter(row=>row.slot===target.slot));assert.equal(String(loadout.instance_id),target.instanceId,'Equipped instance changed');
  const item=one(state.equipped.filter(row=>row.id===target.instanceId));assert.equal(item.user_id,'303');assert.equal(item.equipment_id,target.equipmentId);
  for(const key of ['code','name','slot'])assert.equal(item[key],target[key],'Equipment '+key+' changed');assert.equal(Number(item.is_active),1);assert.equal(Number(item.is_public),1);
  const forge=one(state.forge.filter(row=>row.instance_id===target.instanceId));assert.equal(forge.user_id,'303');assert.equal(forge.level,target.beforeLevel,'Enhancement level changed');assert.equal(forge.revision,target.beforeRevision,'Enhancement revision changed');
 }
}

export async function verify(db,receipt,{exact=false}={}){
 validate(PLAN_HASH);receipt??=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);assert.deepEqual(receipt.plan,plan);
 assert.equal(receipt.userId,'303');assert.equal(receipt.targetLevel,15);assert.equal(receipt.changedEquipment,4);assert.equal(receipt.protectedBeforeHash,receipt.protectedAfterHash);
 assert.deepEqual(receipt.changes,plan.targets.map(t=>({...t,afterRevision:t.beforeRevision+1})));
 if(receipt.auditId){const audit=one(await q(db,'SELECT id::text,admin_id::text,action_type,target_type,after_data FROM admin_logs WHERE target_id=$1',[OPERATION_KEY]));
  assert.equal(audit.id,receipt.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');const {auditId,...details}=receipt;assert.deepEqual(parse(audit.after_data),details);}
 if(exact){const state=await inspect(db);for(const change of receipt.changes){const row=one(state.forge.filter(row=>row.instance_id===change.instanceId));assert.equal(row.level,15);assert.equal(row.revision,change.afterRevision);const equipped=one(state.equipmentLoadout.filter(row=>row.slot===change.slot));assert.equal(String(equipped.instance_id),change.instanceId);}assert.equal(hash(protectedState(state)),receipt.protectedBeforeHash);}
 return{status:'VERIFIED',operationKey:OPERATION_KEY,userId:'303',nickname:'[C9]족쪽이',changedEquipment:4,targetLevel:15,auditId:receipt.auditId??null,completedAt:receipt.completedAt};
}

// Caller owns the transaction, live USER_LOCK, and database account lease.
export async function grant(db,{expectedPlanHash,leaseToken,lockDeadline}={}){
 validate(expectedPlanHash);
 const prior=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(prior.length){const receipt=parse(one(prior).value);return{replayed:true,receipt,verification:await verify(db,receipt)};}
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const again=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(again.length){const receipt=parse(one(again).value);return{replayed:true,receipt,verification:await verify(db,receipt)};}
 const checkLease=async()=>{assert(lockDeadline>Date.now()+5000,'Account lease expiring');one(await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=303 AND token=$1 AND action_path=$2 AND lease_until_ms>$3 FOR UPDATE',[leaseToken,OPERATION_KEY,Date.now()+5000]));};await checkLease();
 one(await q(db,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=303 FOR UPDATE'));
 one(await q(db,'SELECT id FROM users WHERE id=303 FOR UPDATE'));one(await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=303 FOR SHARE'));
 await q(db,'SELECT user_id FROM user_equipment_loadout WHERE user_id=303 ORDER BY slot FOR UPDATE');
 await q(db,'SELECT id FROM user_equipment_instances WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[instanceIds]);
 await q(db,'SELECT instance_id FROM equipment_forge_states_v1 WHERE user_id=303 ORDER BY instance_id FOR UPDATE');
 await q(db,'SELECT id FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[plan.targets.map(t=>t.equipmentId)]);
 await q(db,"SELECT key FROM app_meta WHERE key LIKE 'equipment_polish_instance_v1:303:%' OR key LIKE 'mercenary_equipment%:303%' OR key IN ('equipment_forge_advanced_policy_v1','equipment_forge_runtime_v1','equipment_forge_settings_v1') ORDER BY key FOR SHARE");
 const before=await inspect(db);validateSnapshot(before);
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));assert.equal(String(one(await q(db,'SELECT id FROM users WHERE nickname=$1',[plan.recipient.nickname])).id),'303');
 const updated=await q(db,`UPDATE equipment_forge_states_v1 AS f SET level=15,revision=f.revision+1
  FROM unnest($1::bigint[],$2::int[],$3::int[]) AS target(instance_id,before_level,before_revision)
  WHERE f.user_id=303 AND f.instance_id=target.instance_id AND f.level=target.before_level AND f.revision=target.before_revision
  RETURNING f.instance_id::text,f.user_id::text,f.level,f.revision`,[instanceIds,plan.targets.map(t=>t.beforeLevel),plan.targets.map(t=>t.beforeRevision)]);
 assert.equal(updated.length,4,'All four equipped pieces must update together');
 const after=await inspect(db);assert.deepEqual(protectedState(after),protectedState(before),'Unrelated account data changed');
 for(const t of plan.targets){const row=one(updated.filter(row=>row.instance_id===t.instanceId));assert.equal(row.level,15);assert.equal(row.revision,t.beforeRevision+1);}
 const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan,userId:'303',nickname:plan.recipient.nickname,targetLevel:15,changedEquipment:4,
  changes:plan.targets.map(t=>({...t,afterRevision:t.beforeRevision+1})),protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),completedAt:new Date().toISOString(),cost:0,messagesSent:0};
 await verify(db,receipt,{exact:true});
 receipt.auditId=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",
  [ACTION,OPERATION_KEY,JSON.stringify({userId:'303',equipment:plan.targets,protectedHash:receipt.protectedBeforeHash}),JSON.stringify(receipt),receipt.completedAt])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]));
 const verification=await verify(db,receipt,{exact:true});await checkLease();return{replayed:false,receipt,verification};
}
