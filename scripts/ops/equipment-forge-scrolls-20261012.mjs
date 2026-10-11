import assert from 'node:assert/strict';
import {FORGE_SCROLL_ITEMS} from '../../shared/equipment-forge-advanced-v1.mjs';
export const FORGE_CAP_OPERATION='ops:equipment-forge-cap:20261012:v1';
export const FORGE_SCROLL_OPERATION='ops:equipment-forge-scrolls:20261012:v1';
async function operation(client,key,{apply=false,expectedDatabase='cnine',now=Date.now()},work){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='60s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
  const db=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(db.db,expectedDatabase);assert.equal(db.recovery,false);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0];
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner,'OWNER audit account required');
  const {before,after,...data}=await work();
  const receipt={operation:key,at:new Date(now).toISOString(),...data,before,after,balancesChanged:false,advancedStepsActivated:false};
  await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EQUIPMENT_FORGE_EXTENSION','EQUIPMENT_FORGE',$2,$3,$4)",[owner.id,key,JSON.stringify(before),JSON.stringify(after)]);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[key,JSON.stringify(receipt)]);
  await client.query(apply?'COMMIT':'ROLLBACK');return {...receipt,dryRun:!apply};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function migrateForgeLevelCap(client,options={}){
 return operation(client,FORGE_CAP_OPERATION,options,async()=>{
  const checks=(await client.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='equipment_forge_states_v1'::regclass AND contype='c'")).rows;
  const levels=checks.filter(row=>row.definition.includes('level >=')&&row.definition.includes('level <='));assert.equal(levels.length,1);
  const before=levels[0];assert.equal(before.conname,'equipment_forge_states_v1_level_check');
  assert.ok(before.definition.includes('level >= 0'));assert.ok(before.definition.includes('level <= 10)')||before.definition.includes('level <= 15)'));
  const changed=!before.definition.includes('level <= 15)');
  if(changed)await client.query('ALTER TABLE equipment_forge_states_v1 DROP CONSTRAINT equipment_forge_states_v1_level_check, ADD CONSTRAINT equipment_forge_states_v1_level_check CHECK (level BETWEEN 0 AND 15)');
  return {before,after:{maxStoredLevel:15},changed};
 });
}
export async function registerForgeScrolls(client,options={}){
 return operation(client,FORGE_SCROLL_OPERATION,options,async()=>{
  const before=(await client.query('SELECT code,name,image_url,is_active FROM inventory_items WHERE code=ANY($1::text[])',[FORGE_SCROLL_ITEMS.map(item=>item.code)])).rows;
  for(const [i,item] of FORGE_SCROLL_ITEMS.entries())await client.query("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,'MATERIAL','SPECIAL',$5,$6,1) ON CONFLICT(code) DO NOTHING",[item.code,item.name,item.subtitle,(i?'상의·하의·신발·장신구':'무기')+'의 +10→+11부터 +15까지 강화할 때 필요한 주문서입니다. 시도별 수량은 강화 센터에서 확인하며 성공·유지·파괴 결과와 관계없이 시도 시 소모합니다.',item.image,14+i]);
  const after=(await client.query('SELECT code,name,image_url,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[FORGE_SCROLL_ITEMS.map(item=>item.code)])).rows;
  assert.equal(after.length,2);
  for(const row of after){const item=FORGE_SCROLL_ITEMS.find(item=>item.code===row.code);assert.equal(row.image_url,item.image);assert.equal(Number(row.is_active),1);}
  return {before,after,registered:2-before.length};
 });
}
