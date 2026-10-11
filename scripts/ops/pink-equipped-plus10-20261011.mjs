import assert from 'node:assert/strict';
import {forgePower} from '../../shared/equipment-forge-policy-v1.mjs';
import {EQUIPMENT_POWER_STANDARD} from '../../shared/equipment-mercenary-power-v1.mjs';

export const OPERATION_KEY='ops:pink-equipped-plus10:20261011:v1';
export const TARGET=Object.freeze({id:1,nickname:'핑크빛유두'});
// Exact equipped instances confirmed before this one-time user-authorized upgrade.
export const EQUIPMENT=Object.freeze([
 {slot:'WEAPON',instanceId:'2153543557',equipmentId:'55',code:'EASTERN_WEAPON_DRAFT_03'},
 {slot:'TOP',instanceId:'78256698',equipmentId:'43',code:'EMPEROR_TOP'},
 {slot:'BOTTOM',instanceId:'78256688',equipmentId:'44',code:'EMPEROR_BOTTOM'},
 {slot:'SHOES',instanceId:'78256694',equipmentId:'45',code:'EMPEROR_SHOES'},
 {slot:'ACCESSORY',instanceId:'78256685',equipmentId:'46',code:'EMPEROR_DUAL_DISK'},
]);
const SUIT={slot:'BATTLE_SUIT',instanceId:'2139240489'};
const ids=EQUIPMENT.map(item=>item.instanceId);
const gearKeys=['mercenary_equipment_v1:1:PVE','mercenary_equipment_v1:1:PVP'];
const loadoutSql='SELECT user_id,slot,instance_id FROM user_equipment_loadout WHERE user_id=$1 ORDER BY slot';
const walletSql='SELECT coin,card_shards,magic_crystals FROM users WHERE id=$1';
const inventorySql='SELECT item_code,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code';
const stateSql='SELECT instance_id,user_id,level,revision FROM equipment_forge_states_v1 WHERE instance_id=ANY($1::bigint[]) ORDER BY instance_id';
const snapshotSql=`SELECT x.id AS instance_id,x.user_id,x.equipment_id,i.code,i.name,i.slot,i.total_power,i.pve_power,i.pvp_power,i.is_active,i.is_public,
 s.user_id AS forge_user_id,COALESCE(s.level,0) AS level,COALESCE(s.revision,0) AS revision
 FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id
 LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id WHERE x.id=ANY($1::bigint[]) ORDER BY x.id`;
const loadoutShape=rows=>rows.map(row=>({slot:row.slot,instanceId:String(row.instance_id)}));
const expectedLoadout=[...EQUIPMENT,SUIT].map(({slot,instanceId})=>({slot,instanceId})).sort((a,b)=>a.slot.localeCompare(b.slot));
const invariant=rows=>rows.map(({level,revision,forge_user_id,...row})=>row);

export async function upgradePinkEquippedGear(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");
  const [identity]=await q('SELECT current_database() db,pg_is_in_recovery() recovery');assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const users=await q('SELECT id,nickname,status,role FROM users WHERE nickname=$1 ORDER BY id LIMIT 2 FOR UPDATE',[TARGET.nickname]);
  assert.equal(users.length,1);assert.equal(Number(users[0].id),TARGET.id);assert.equal(users[0].status,'ACTIVE');assert.equal(users[0].role,'OWNER');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.user.id,TARGET.id);assert.equal(receipt.operationKey,OPERATION_KEY);await client.query('ROLLBACK');return {...receipt,replayed:true};}
  const loadout=await q(loadoutSql+' FOR UPDATE',[TARGET.id]);assert.deepEqual(loadoutShape(loadout),expectedLoadout,'Equipped items changed; inspect again');
  const mercenary=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[gearKeys]);assert.equal(mercenary.length,0,'New mercenary equipment needs inspection');
  const pending=await q("SELECT request_id FROM joint_operations_v1 WHERE user_id=$1 AND kind IN('FORGE_ENHANCE','FORGE_RESTORE','MERCENARY_EQUIPMENT') AND status<>'COMPLETED' LIMIT 1",[TARGET.id]);assert.equal(pending.length,0,'An equipment operation is pending');
  const instanceIds=[...ids,SUIT.instanceId];
  const instances=await q('SELECT * FROM user_equipment_instances WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[instanceIds]);assert.equal(instances.length,6);assert.ok(instances.every(row=>Number(row.user_id)===TARGET.id));
  const catalogIds=[...EQUIPMENT.map(item=>item.equipmentId),'52'];
  const catalog=await q('SELECT id,code,name,slot,total_power,pve_power,pvp_power,is_active,is_public FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[catalogIds]);
  const statesBefore=await q(stateSql+' FOR UPDATE',[instanceIds]);
  const suitBefore=statesBefore.filter(row=>String(row.instance_id)===SUIT.instanceId);
  const walletBefore=(await q(walletSql,[TARGET.id]))[0],inventoryBefore=await q(inventorySql+' FOR UPDATE',[TARGET.id]);
  const polishKeys=ids.map(id=>'equipment_polish_instance_v1:1:'+id);
  const polishBefore=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[polishKeys]);
  const before=await q(snapshotSql,[ids]);assert.equal(before.length,5);
  for(const item of EQUIPMENT){
   const row=before.find(row=>String(row.instance_id)===item.instanceId);assert.ok(row);
   assert.equal(String(row.equipment_id),item.equipmentId);assert.equal(row.code,item.code);assert.equal(row.slot,item.slot);
   assert.ok(EQUIPMENT_POWER_STANDARD.supportedSlots.includes(row.slot));assert.equal(Number(row.user_id),TARGET.id);assert.equal(Number(row.is_active),1);assert.equal(Number(row.is_public),1);
   assert.ok(row.forge_user_id===null||Number(row.forge_user_id)===TARGET.id);
   assert.ok(Number.isInteger(Number(row.level))&&Number(row.level)>=0&&Number(row.level)<=10);assert.ok(Number.isSafeInteger(Number(row.revision))&&Number(row.revision)>=0);
   if(Number(row.level)===10)continue;
   const updated=await q(`INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES($1,$2,10,$3)
    ON CONFLICT(instance_id) DO UPDATE SET level=excluded.level,revision=excluded.revision
    WHERE equipment_forge_states_v1.user_id=$2 AND equipment_forge_states_v1.level=$4 AND equipment_forge_states_v1.revision=$5
    RETURNING instance_id,user_id,level,revision`,[item.instanceId,TARGET.id,Number(row.revision)+1,Number(row.level),Number(row.revision)]);
   assert.equal(updated.length,1,'Equipment changed during upgrade');
  }
  const after=await q(snapshotSql,[ids]);assert.deepEqual(invariant(after),invariant(before));
  for(const row of after){const old=before.find(item=>String(item.instance_id)===String(row.instance_id));assert.equal(Number(row.level),10);assert.equal(Number(row.revision),Number(old.revision)+(Number(old.level)<10?1:0));assert.equal(Number(row.forge_user_id),TARGET.id);}
  assert.deepEqual(await q(loadoutSql,[TARGET.id]),loadout);
  assert.deepEqual(await q('SELECT * FROM user_equipment_instances WHERE id=ANY($1::bigint[]) ORDER BY id',[instanceIds]),instances);
  assert.deepEqual((await q(stateSql,[[SUIT.instanceId]])),suitBefore);
  assert.deepEqual(await q('SELECT id,code,name,slot,total_power,pve_power,pvp_power,is_active,is_public FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id',[catalogIds]),catalog);
  assert.deepEqual((await q(walletSql,[TARGET.id]))[0],walletBefore);assert.deepEqual(await q(inventorySql,[TARGET.id]),inventoryBefore);
  assert.deepEqual(await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[polishKeys]),polishBefore);
  const changed=before.filter(row=>Number(row.level)<10).length;
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',user:TARGET,actor:'SYSTEM_OPS',completedAt:new Date().toISOString(),changed,equipment:EQUIPMENT.map(item=>{
   const old=before.find(row=>String(row.instance_id)===item.instanceId),next=after.find(row=>String(row.instance_id)===item.instanceId);
   return {...item,name:old.name,levelBefore:Number(old.level),levelAfter:Number(next.level),revisionBefore:Number(old.revision),revisionAfter:Number(next.revision),powerBefore:forgePower(Number(old.total_power),Number(old.level)),powerAfter:forgePower(Number(next.total_power),Number(next.level))};
  }),excluded:[{...SUIT,name:'SX슈트',reason:'BATTLE_SUIT is not an enhancement-supported slot'}],balancesPreserved:true,instancesAndLoadoutPreserved:true,polishPreserved:true,grants:0};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[TARGET.id,'OPS_EQUIPPED_UPGRADE_PLUS10','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,equipment:before}),JSON.stringify({...receipt,reason:'사용자 지시: 핑크빛유두 장착장비 +10전체 업그레이드'})]);assert.ok(audit);receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyPinkEquippedGear(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved);const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');
 const [user]=await q('SELECT id,nickname,status FROM users WHERE id=$1',[TARGET.id]);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');
 assert.deepEqual(loadoutShape(await q(loadoutSql,[TARGET.id])),expectedLoadout);
 const rows=await q(snapshotSql,[ids]);assert.equal(rows.length,5);
 for(const row of rows){const item=receipt.equipment.find(item=>item.instanceId===String(row.instance_id));assert.ok(item);assert.equal(Number(row.user_id),TARGET.id);assert.equal(Number(row.forge_user_id),TARGET.id);assert.equal(row.code,item.code);assert.equal(Number(row.level),10);assert.equal(Number(row.revision),item.revisionAfter);assert.deepEqual(forgePower(Number(row.total_power),Number(row.level)),item.powerAfter);}
 const [audit]=await q('SELECT action_type,target_id FROM admin_logs WHERE id=$1',[receipt.adminLogId]);assert.equal(audit.action_type,'OPS_EQUIPPED_UPGRADE_PLUS10');assert.equal(audit.target_id,String(TARGET.id));
 return {...receipt,status:'VERIFIED',verifiedAt:new Date().toISOString()};
}
