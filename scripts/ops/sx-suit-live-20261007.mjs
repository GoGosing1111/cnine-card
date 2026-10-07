import assert from 'node:assert/strict';
import {SX_ITEM,OPERATION_KEY as REGISTRATION_KEY} from './sx-equipment-cms-20261007.mjs';
export const OPERATION_KEY='ops:sx-suit-live:20261007:v1';
export const RUNTIME_VERSION='SX_LIVE_20261007_2X_V1';
export const AUTHORIZATION='연결해 왜안함 공격속도만 2배속으로 해서 반영해';
export const DESCRIPTION='푸른 사신 SX슈트. PVE 전용. X슈트 기준 일반 공격속도 2배, 청령검무·푸른 오라·대시 잔상과 창천멸진 광역 궁극기.';
function assertProduction(proof){
  assert.equal(proof?.origin,'https://cnine-card.pages.dev');
  assert.equal(proof?.runtimeVersion,RUNTIME_VERSION);
  assert.equal(proof?.runtimeEnabled,true);
  assert.equal(proof?.attackSpeedMultiplier,2);
  assert.equal(proof?.sourceSha256,SX_ITEM.sha256);
  assert.equal(proof?.bundleMatchesCommittedBuild,true);
  assert.equal(proof?.mainLoaderCacheVersion,'sx=20261007-2x-v1');
  assert.match(proof?.commit||'',/^[a-f0-9]{40}$/);
  const age=Date.now()-Date.parse(proof?.checkedAt);
  assert.ok(Number.isFinite(age)&&age>=0&&age<600000,'Fresh verified production runtime required');
}
export async function inspectSxLive(client){
  const item=(await client.query('SELECT * FROM character_equipment_items WHERE code=$1',[SX_ITEM.code])).rows[0];
  const value=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0]?.value;
  return {item,receipt:value?JSON.parse(value):null};
}
export async function activateSxLive(client,proof){
  assertProduction(proof);
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
    const {item:before,receipt:saved}=await inspectSxLive(client);
    assert.ok(before,'Registered SX equipment missing');
    if(saved){
      assert.equal(saved.status,'COMPLETED');assert.equal(String(before.id),String(saved.item.id));
      await client.query('COMMIT');return {alreadyActivated:true,item:before,receipt:saved};
    }
    const registered=(await client.query('SELECT value FROM app_meta WHERE key=$1',[REGISTRATION_KEY])).rows[0];
    assert.equal(String(JSON.parse(registered?.value||'{}').item?.id),String(before.id),'Registration identity mismatch');
    for(const [key,value] of Object.entries({code:SX_ITEM.code,name:SX_ITEM.name,slot:'BATTLE_SUIT',subtype:'BATTLE_SUIT',image_url:SX_ITEM.image}))assert.equal(before[key],value,key);
    const others=(await client.query('SELECT * FROM character_equipment_items WHERE code<>$1 ORDER BY id',[SX_ITEM.code])).rows;
    const x=others.find(row=>row.code==='BATTLE_SUIT_X_BODY');
    const pvePower=Number(before.pve_power)>0?Number(before.pve_power):Number(x?.pve_power);
    assert.ok(Number.isSafeInteger(pvePower)&&pvePower>0,'Valid X baseline or existing SX power required');
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert.ok(owner,'Active owner required for authorized operation audit');
    const description=!before.description||before.description===SX_ITEM.description?DESCRIPTION:before.description;
    const item=(await client.query(`UPDATE character_equipment_items SET pve_power=$2,total_power=$2,pvp_power=0,is_active=1,is_public=1,description=$3 WHERE id=$1 RETURNING *`,[before.id,pvePower,description])).rows[0];
    assert.deepEqual((await client.query('SELECT * FROM character_equipment_items WHERE code<>$1 ORDER BY id',[SX_ITEM.code])).rows,others,'Unrelated equipment changed');
    const changed=new Set(['pve_power','total_power','pvp_power','is_active','is_public','description']);
    for(const key of Object.keys(before))if(!changed.has(key))assert.deepEqual(item[key],before[key],key+' changed');
    const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,scope:'SX_LIVE_CONNECTION',before,item,proof,
      attackSpeedMultiplier:2,ultimateDamageReference:'BATTLE_SUIT_X_BODY',ultimateCooldownMs:20000,
      powerSource:Number(before.pve_power)>0?'EXISTING_CMS_VALUE':'CURRENT_X_SUIT_BASELINE',automaticGrants:false,recipesAdded:false,
      preservedEquipmentCount:others.length,completedAt:new Date().toISOString()};
    const audit=(await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
      VALUES($1,'EQUIPMENT_UPDATE','EQUIPMENT',$2,$3,$4,$5) RETURNING id`,[owner.id,String(item.id),JSON.stringify(before),JSON.stringify(receipt),receipt.completedAt])).rows[0];
    assert.ok(audit,'Equipment activation audit missing');receipt.adminLogId=String(audit.id);
    assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).rows.length,1);
    await client.query('COMMIT');return {alreadyActivated:false,item,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function verifySxLive(client){
  const state=await inspectSxLive(client);assert.equal(state.receipt?.status,'COMPLETED');
  assert.equal(String(state.item?.id),String(state.receipt.item.id));
  const audit=(await client.query("SELECT id,after_data FROM admin_logs WHERE id=$1 AND action_type='EQUIPMENT_UPDATE' AND target_type='EQUIPMENT' AND target_id=$2",[state.receipt.adminLogId,String(state.item.id)])).rows;
  assert.equal(audit.length,1);assert.equal(JSON.parse(audit[0].after_data).operationKey,OPERATION_KEY);
  return {verified:true,checkedAt:new Date().toISOString(),...state};
}
