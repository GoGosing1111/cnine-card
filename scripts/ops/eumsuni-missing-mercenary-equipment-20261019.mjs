import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {REGION_EQUIPMENT} from '../../shared/legion-regions-v1.mjs';

export const OPERATION_KEY='ops:eumsuni-missing-mercenary-equipment:20261019:v1';
export const TARGET=Object.freeze({id:65,nickname:'음순이'});
export const AUTHORIZATION='음순이 계정에 용병장비 빠진거있으면 다지급해';
const codes=REGION_EQUIPMENT.map(x=>x.code);
const gearKeys=['PVE','PVP'].map(mode=>`mercenary_equipment_v1:${TARGET.id}:${mode}`);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const itemShape=rows=>rows.map(({cached_quantity,actual_quantity,...x})=>x);
const expected=REGION_EQUIPMENT.map((x,index)=>({id:String(87+index),code:x.code,name:x.name,slot:x.slot,rarity:x.rarity,is_active:'1',is_public:'1'}));

export async function inspectEquipmentGrant(db){
 const users=await q(db,'SELECT id,nickname,status,role FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const items=await q(db,`SELECT i.id,i.code,i.name,i.slot,i.rarity,i.is_active,i.is_public,COALESCE(c.quantity,0) AS cached_quantity,
  (SELECT COUNT(*) FROM user_equipment_instances x WHERE x.user_id=$1 AND x.equipment_id=i.id) AS actual_quantity
  FROM character_equipment_items i LEFT JOIN user_equipment_counts_v1 c ON c.equipment_id=i.id AND c.user_id=$1
  WHERE i.code=ANY($2::text[]) ORDER BY i.id`,[TARGET.id,codes]);
 const instances=await q(db,`SELECT x.*,s.level,s.revision,s.user_id AS forge_user_id FROM user_equipment_instances x
  JOIN character_equipment_items i ON i.id=x.equipment_id LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id
  WHERE x.user_id=$1 AND i.code=ANY($2::text[]) ORDER BY x.id`,[TARGET.id,codes]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,items,instances,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

function validateState(state){
 const user=one(state.users);assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 assert.deepEqual(itemShape(state.items),expected,'Reviewed live mercenary equipment catalog changed');
 for(const item of state.items){assert.equal(String(item.cached_quantity),String(item.actual_quantity),'Inventory count mismatch');assert(BigInt(item.actual_quantity)>=0n);}
}

async function protectedDigest(db){
 const data={};
 data.wallet=await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]);
 for(const [name,table,order] of [['loadout','user_equipment_loadout','slot'],['items','cnine_user_inventory','item_code'],['mercenaries','user_mercenary_cards_v1','mercenary_code'],['growth','user_mercenary_growth_v1','mercenary_code']])
  data[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 data.otherEquipment=await q(db,'SELECT * FROM user_equipment_counts_v1 WHERE user_id=$1 AND equipment_id<>ALL($2::bigint[]) ORDER BY equipment_id',[TARGET.id,expected.map(x=>x.id)]);
 data.equipmentMeta=await q(db,"SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) OR key LIKE $2 ORDER BY key",[gearKeys,`equipment_polish_instance_v1:${TARGET.id}:%`]);
 return digest(data);
}

export async function verifyEquipmentGrant(db){
 const state=await inspectEquipmentGrant(db);validateState(state);const r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.authorization,AUTHORIZATION);assert.deepEqual(r.target,TARGET);
 assert.equal(r.protectedBefore,r.protectedAfter);assert.equal(r.quantity,r.items.length);assert.equal(r.quantityPerType,1);
 const grants=state.instances.filter(x=>x.request_id?.startsWith(OPERATION_KEY+':'));
 assert.equal(grants.length,r.quantity,'Unexpected operation grant count');
 for(const item of r.items){
  const x=one(grants.filter(x=>String(x.id)===item.instanceId));assert.equal(Number(x.user_id),TARGET.id);assert.equal(String(x.equipment_id),item.equipmentId);
  assert.equal(x.source_type,'ADMIN');assert.equal(x.source_id,'1');assert.equal(x.request_id,`${OPERATION_KEY}:${item.equipmentId}`);assert.equal(x.acquired_at,r.completedAt);
 }
 const audit=one(await q(db,'SELECT admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_MISSING_MERCENARY_EQUIPMENT_GRANT');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt:r,ownedTypes:state.items.filter(x=>BigInt(x.actual_quantity)>0n).length,totalTypes:state.items.length,missing:state.items.filter(x=>BigInt(x.actual_quantity)===0n).map(x=>x.code)};
}

// One-account operator grant only; caller holds the live durable-object and database leases.
// Adds one base-level instance per unowned catalog type; no existing instance is modified.
export async function grantMissingEquipment(db,{dryRun=false,lockDeadline,lockToken}={}){
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');assert.ok(lockToken);
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  const lease=one(await q(db,'SELECT token,lease_until_ms FROM user_mutation_locks_v1520 WHERE user_id=$1 FOR UPDATE',[TARGET.id]));
  assert.equal(lease.token,lockToken);assert.equal(Number(lease.lease_until_ms),lockDeadline);
  await q(db,'SELECT id FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id FOR SHARE',[codes]);
  const before=await inspectEquipmentGrant(db);validateState(before);
  if(before.receipt){const verified=await verifyEquipmentGrant(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:true};}
  assert.equal(before.instances.filter(x=>x.request_id?.startsWith(OPERATION_KEY+':')).length,0,'Orphan grant needs inspection');
  const owner=one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  assert.equal(one(await q(db,"SELECT value FROM app_meta WHERE key='equipment_counts_v1_ready'")).value,'1');
  const missing=before.items.filter(x=>BigInt(x.actual_quantity)===0n),protectedBefore=await protectedDigest(db),now=new Date().toISOString();
  const inserted=missing.length?await q(db,`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id,acquired_at)
   SELECT $1,i.id,'ADMIN',$3,$4||':'||i.id::text,$5 FROM character_equipment_items i WHERE i.id=ANY($2::bigint[])
   AND NOT EXISTS(SELECT 1 FROM user_equipment_instances x WHERE x.user_id=$1 AND x.equipment_id=i.id)
   ORDER BY i.id RETURNING id,equipment_id`,[TARGET.id,missing.map(x=>x.id),String(owner.id),OPERATION_KEY,now]):[];
  assert.deepEqual(inserted.map(x=>String(x.equipment_id)).sort(),missing.map(x=>String(x.id)).sort(),'Partial equipment insert');
  const after=await inspectEquipmentGrant(db);validateState(after);
  for(const item of after.items){const old=before.items.find(x=>x.id===item.id);assert.equal(BigInt(item.actual_quantity),BigInt(old.actual_quantity)+(BigInt(old.actual_quantity)===0n?1n:0n));}
  assert.deepEqual(after.instances.filter(x=>!x.request_id?.startsWith(OPERATION_KEY+':')),before.instances,'Existing equipment or enhancement changed');
  assert(after.instances.filter(x=>x.request_id?.startsWith(OPERATION_KEY+':')).every(x=>x.level===null&&x.revision===null),'New equipment must be base level');
  const protectedAfter=await protectedDigest(db);assert.equal(protectedAfter,protectedBefore,'Unrelated account state changed');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,target:TARGET,completedAt:now,
   quantity:inserted.length,quantityPerType:1,enhancementLevel:0,cost:0,automaticLoadout:false,totalTypes:after.items.length,
   ownedTypesBefore:before.items.filter(x=>BigInt(x.actual_quantity)>0n).length,ownedTypesAfter:after.items.filter(x=>BigInt(x.actual_quantity)>0n).length,
   items:missing.map(item=>({equipmentId:String(item.id),code:item.code,name:item.name,slot:item.slot,quantity:1,instanceId:String(inserted.find(x=>String(x.equipment_id)===item.id).id)})),
   countsBefore:before.items.map(x=>({code:x.code,quantity:String(x.actual_quantity)})),countsAfter:after.items.map(x=>({code:x.code,quantity:String(x.actual_quantity)})),protectedBefore,protectedAfter};
  const audit=one(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
   [owner.id,'OPS_MISSING_MERCENARY_EQUIPMENT_GRANT','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,counts:receipt.countsBefore}),JSON.stringify(receipt)]));
  receipt.adminLogId=String(audit.id);await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  const verified=await verifyEquipmentGrant(db);assert.equal(verified.missing.length,0);assert(lockDeadline>Date.now()+5000,'Account lease expired');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
