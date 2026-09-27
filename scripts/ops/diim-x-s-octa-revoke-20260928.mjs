import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const KEY='ops:diim-x-s-octa-revoke:20260928:v1';
export const TARGET=4773;
export const CHIP='SKILL_CHIP_OCTA_SEEKER';
export async function inspect(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const users=await q("SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE REPLACE(TRIM(nickname),' ','')='진짜디임' ORDER BY id LIMIT 2");
 assert.equal(users.length,1);assert.equal(Number(users[0].id),TARGET);assert.equal(users[0].nickname,'진짜디임');assert.equal(users[0].status,'ACTIVE');
 const meta=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[[KEY,'equipment_counts_v1_ready']]);
 assert.equal(meta.find(x=>x.key==='equipment_counts_v1_ready')?.value,'1');
 const catalog=await q("SELECT id,code,name,slot,is_active FROM character_equipment_items WHERE code IN ('BATTLE_SUIT_X_BODY','BATTLE_SUIT_S_BODY') ORDER BY id");
 assert.equal(catalog.length,2);
 const ids=catalog.map(x=>x.id);
 const counts=await q('SELECT equipment_id,quantity FROM user_equipment_counts_v1 WHERE user_id=$1 AND equipment_id=ANY($2::bigint[]) ORDER BY equipment_id',[TARGET,ids]);
 for(const row of counts)assert.ok(Number(row.quantity)<=20,'Unexpected suit quantity');
 const instances=await q('SELECT * FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=ANY($2::bigint[]) ORDER BY id LIMIT 41',[TARGET,ids]);
 const loadout=await q('SELECT * FROM user_equipment_loadout WHERE user_id=$1 ORDER BY slot',[TARGET]);
 const forge=await q('SELECT * FROM equipment_forge_states_v1 WHERE user_id=$1 AND instance_id=ANY($2::bigint[]) ORDER BY instance_id',[TARGET,instances.map(x=>x.id)]);
 const inventory=await q('SELECT * FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[TARGET,CHIP]);
 const chips=await q('SELECT * FROM user_skill_chip_loadout_v2046 WHERE user_id=$1 ORDER BY slot_no',[TARGET]);
 return {user:users[0],catalog,counts,instances,loadout,forge,inventory,chips,receipt:meta.find(x=>x.key===KEY)?.value??null};
}
// Explicit one-time account operation, never imported by game routes.
export async function apply(client,reviewed,{dryRun=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const token=randomUUID();
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
  const nowMs=Date.now();
  const lease=await q(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
   VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,
   action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=excluded.updated_at
   WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[TARGET,token,KEY,nowMs+60000,nowMs]);
  assert.equal(lease.length,1,'Account operation in progress');
  const [user]=await q('SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[TARGET]);
  assert.equal(user?.nickname,'진짜디임');assert.equal(user.status,'ACTIVE');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
  if(saved){
   const receipt=JSON.parse(saved.value);assert.equal(receipt.operationKey,KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.userId,TARGET);
   await q('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[TARGET,token]);
   await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,replayed:true,dryRun};
  }
  await q('SELECT id FROM user_equipment_instances WHERE user_id=$1 AND id=ANY($2::bigint[]) ORDER BY id FOR UPDATE',[TARGET,reviewed.instances.map(x=>x.id)]);
  await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET,CHIP]);
  const before=await inspect(client);
  for(const key of ['catalog','counts','instances','loadout','forge','inventory','chips'])assert.deepEqual(before[key],reviewed[key],`Reviewed ${key} changed`);
  const x=before.catalog.find(x=>x.code==='BATTLE_SUIT_X_BODY'),s=before.catalog.find(x=>x.code==='BATTLE_SUIT_S_BODY');
  assert.equal(Number(x.id),49);assert.equal(Number(s.id),47);assert.equal(Number(s.is_active),1);
  const xInstances=before.instances.filter(i=>i.equipment_id===x.id),sInstances=before.instances.filter(i=>i.equipment_id===s.id);
  assert.equal(xInstances.length,1);assert.ok(sInstances.length>0);
  const suit=before.loadout.find(l=>l.slot==='BATTLE_SUIT');
  assert.ok(sInstances.some(i=>i.id===suit?.instance_id),'Existing S-BODY must be equipped');
  assert.equal(Number(before.inventory[0]?.quantity),1,'Expected the single granted chip');
  const xIds=xInstances.map(i=>i.id);
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  assert.equal((await q('SELECT id FROM inventory_logs WHERE user_id=$1 AND reference_id=$2',[TARGET,KEY])).length,0,'Orphan operation ledger');
  await q('DELETE FROM user_equipment_loadout WHERE user_id=$1 AND instance_id=ANY($2::bigint[])',[TARGET,xIds]);
  await q('DELETE FROM equipment_forge_states_v1 WHERE user_id=$1 AND instance_id=ANY($2::bigint[])',[TARGET,xIds]);
  const removed=await q('DELETE FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=$2 AND id=ANY($3::bigint[]) RETURNING id',[TARGET,x.id,xIds]);
  assert.equal(removed.length,1,'X-BODY removal missing');
  const cleared=await q('DELETE FROM user_skill_chip_loadout_v2046 WHERE user_id=$1 AND item_code=$2 RETURNING slot_no',[TARGET,CHIP]);
  const now=new Date().toISOString();
  const inventory=await q('UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=GREATEST(0,LEAST(unseen_quantity,quantity-1)),updated_at=$3 WHERE user_id=$1 AND item_code=$2 AND quantity=1 RETURNING quantity,unseen_quantity',[TARGET,CHIP,now]);
  assert.equal(inventory.length,1,'Chip removal missing');assert.equal(Number(inventory[0].quantity),0);assert.equal(Number(inventory[0].unseen_quantity),0);
  const [ledger]=await q(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   VALUES($1,$2,-1,0,$3,'SYSTEM_REVOKE',$4,$5,$6) RETURNING id`,[TARGET,CHIP,'사용자 지시: 진짜디임 X슈트 및 8방향 유도탄 회수, 기존 S슈트 장착 유지',KEY,owner.id,now]);assert.ok(ledger);
  const after=await inspect(client);
  assert.equal(Number(after.counts.find(c=>c.equipment_id===x.id)?.quantity??0),0,'X-BODY count trigger failed');
  assert.deepEqual(after.counts.find(c=>c.equipment_id===s.id),before.counts.find(c=>c.equipment_id===s.id));
  assert.deepEqual(after.instances,sInstances);assert.deepEqual(after.loadout,before.loadout);assert.deepEqual(after.user,before.user);
  assert.deepEqual(after.forge,before.forge.filter(f=>!xIds.includes(f.instance_id)));
  assert.deepEqual(after.chips,before.chips.filter(c=>c.item_code!==CHIP));
  const receipt={status:'COMPLETED',operationKey:KEY,userId:TARGET,nickname:'진짜디임',removedXIds:xIds,suitInstanceId:suit.instance_id,
   revokedChip:CHIP,revokedQuantity:1,clearedSlots:cleared.map(x=>Number(x.slot_no)),inventoryLogId:String(ledger.id),completedAt:now};
  const [audit]=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_SUIT_AND_SKILL_CHIP_REVOKE','USER',$2,$3,$4,$5) RETURNING id`,[owner.id,String(TARGET),JSON.stringify({operationKey:KEY,...before}),JSON.stringify({receipt,after}),now]);
  assert.ok(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),now])).length,1);
  assert.equal((await q('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 RETURNING user_id',[TARGET,token])).length,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
export async function verify(client){
 const state=await inspect(client),receipt=JSON.parse(state.receipt);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.equal(receipt.userId,TARGET);
 assert.equal(Number(state.counts.find(c=>Number(c.equipment_id)===49)?.quantity??0),0);
 assert.equal(Number(state.inventory[0]?.quantity),0);assert.ok(state.chips.every(c=>c.item_code!==CHIP));
 assert.equal(state.loadout.find(l=>l.slot==='BATTLE_SUIT')?.instance_id,receipt.suitInstanceId);
 return {verified:true,receipt,counts:state.counts,suitInstanceId:receipt.suitInstanceId,remainingChips:state.chips.map(c=>({slot:c.slot_no,code:c.item_code}))};
}
