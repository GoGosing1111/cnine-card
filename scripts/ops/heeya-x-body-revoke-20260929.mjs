import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const KEY='ops:heeya-x-body-revoke:20260929:v1';
export const TARGET=4977,CODE='BATTLE_SUIT_X_BODY';

export async function inspect(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE nickname=$1 ORDER BY id LIMIT 2',['하이희야♡']);
 assert.equal(users.length,1);assert.equal(Number(users[0].id),TARGET);assert.equal(users[0].status,'ACTIVE');
 const catalog=await q('SELECT id,code,name,slot,is_active FROM character_equipment_items WHERE code=$1',[CODE]);
 assert.equal(catalog.length,1);assert.equal(Number(catalog[0].id),49);assert.equal(catalog[0].slot,'BATTLE_SUIT');
 const meta=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[[KEY,'equipment_counts_v1_ready']]);
 assert.equal(meta.find(x=>x.key==='equipment_counts_v1_ready')?.value,'1');
 const instances=await q('SELECT * FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=$2 ORDER BY id LIMIT 21',[TARGET,catalog[0].id]);
 const counts=await q('SELECT equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=$1 ORDER BY equipment_id',[TARGET]);
 const loadout=await q('SELECT * FROM user_equipment_loadout WHERE user_id=$1 ORDER BY slot',[TARGET]);
 const forge=await q('SELECT * FROM equipment_forge_states_v1 WHERE user_id=$1 AND instance_id=ANY($2::bigint[]) ORDER BY instance_id',[TARGET,instances.map(x=>x.id)]);
 const chips=await q('SELECT * FROM user_skill_chip_loadout_v2046 WHERE user_id=$1 ORDER BY slot_no',[TARGET]);
 return {user:users[0],catalog,instances,counts,loadout,forge,chips,receipt:meta.find(x=>x.key===KEY)?.value??null};
}

// One-time account operation. Caller additionally holds the production USER_LOCK.
export async function apply(client,reviewed,{dryRun=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows,token=randomUUID();
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
  const nowMs=Date.now(),lease=await q(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
   VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,
   lease_until_ms=excluded.lease_until_ms,updated_at=excluded.updated_at WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[TARGET,token,KEY,nowMs+60000,nowMs]);
  assert.equal(lease.length,1,'Account operation in progress');
  const [user]=await q('SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[TARGET]);
  assert.equal(user?.nickname,'하이희야♡');assert.equal(user.status,'ACTIVE');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
  if(saved){
   const receipt=JSON.parse(saved.value);assert.equal(receipt.operationKey,KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.userId,TARGET);
   await q('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[TARGET,token]);
   await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,replayed:true,dryRun};
  }
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Missing authorized operator');
  await q('SELECT id FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=49 ORDER BY id FOR UPDATE',[TARGET]);
  const before=await inspect(client);
  for(const name of ['catalog','instances','forge'])assert.deepEqual(before[name],reviewed[name],`Reviewed ${name} changed`);
  assert.equal(before.instances.length,1,'Expected the single reviewed X-BODY');
  assert.equal(Number(before.counts.find(x=>Number(x.equipment_id)===49)?.quantity),1,'Ownership count mismatch');
  const ids=before.instances.map(x=>x.id),related=row=>ids.some(id=>String(id)===String(row.instance_id));
  const cleared=await q('DELETE FROM user_equipment_loadout WHERE user_id=$1 AND instance_id=ANY($2::bigint[]) RETURNING slot',[TARGET,ids]);
  await q('DELETE FROM equipment_forge_states_v1 WHERE user_id=$1 AND instance_id=ANY($2::bigint[])',[TARGET,ids]);
  const removed=await q('DELETE FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=49 AND id=ANY($2::bigint[]) RETURNING id',[TARGET,ids]);
  assert.equal(removed.length,1,'Expected exactly one X-BODY removal');
  const after=await inspect(client);
  assert.equal(after.instances.length,0);assert.equal(Number(after.counts.find(x=>Number(x.equipment_id)===49)?.quantity??0),0,'Count trigger mismatch');
  assert.deepEqual(after.counts.filter(x=>Number(x.equipment_id)!==49),before.counts.filter(x=>Number(x.equipment_id)!==49),'Other equipment counts changed');
  assert.deepEqual(after.loadout,before.loadout.filter(x=>!related(x)),'Unrelated loadout changed');
  assert.deepEqual(after.chips,before.chips,'Skill chips changed');assert.deepEqual(after.user,before.user,'Account balances changed');assert.equal(after.forge.length,0);
  const now=new Date().toISOString(),receipt={status:'COMPLETED',operationKey:KEY,actor:'SYSTEM_OPS',userId:TARGET,nickname:'하이희야♡',itemCode:CODE,quantity:1,removedInstanceIds:ids.map(String),remainingQuantity:0,clearedSlots:cleared.map(x=>x.slot),balancesPreserved:true,otherEquipmentPreserved:true,skillChipsPreserved:true,completedAt:now};
  const [audit]=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_X_BODY_REVOKE','USER',$2,$3,$4,$5) RETURNING id`,[owner.id,String(TARGET),JSON.stringify({operationKey:KEY,instances:before.instances,loadout:before.loadout.filter(related),forge:before.forge}),JSON.stringify({...receipt,authorization:'하이희야♡계정에 X바디 회수해'}),now]);
  assert.ok(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),now])).length,1);
  assert.equal((await q('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 RETURNING user_id',[TARGET,token])).length,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verify(client){
 const state=await inspect(client),receipt=JSON.parse(state.receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.equal(receipt.userId,TARGET);
 const ids=receipt.removedInstanceIds;
 assert(state.instances.every(x=>!ids.includes(String(x.id))),'Removed instance still owned');
 assert(state.loadout.every(x=>!ids.includes(String(x.instance_id))),'Removed instance still equipped');
 const {rows:audit}=await client.query("SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=$1 AND action_type='OPS_X_BODY_REVOKE' AND target_id=$2",[receipt.adminLogId,String(TARGET)]);
 assert.equal(audit.length,1);assert.equal(JSON.parse(audit[0].after_data).operationKey,KEY);
 return {verified:true,receipt,currentXQuantity:Number(state.counts.find(x=>Number(x.equipment_id)===49)?.quantity??0),battleSuitInstanceId:state.loadout.find(x=>x.slot==='BATTLE_SUIT')?.instance_id??null,skillChips:state.chips.map(x=>({slot:x.slot_no,code:x.item_code}))};
}
