// Explicit one-time owner-requested CMS change. Never imported by game runtime.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';
import {LEGION_REGIONS_KEY,REGION_EQUIPMENT} from '../../shared/legion-regions-v1.mjs';
import {LEGION_HUNT_SETTINGS_KEY} from '../../functions/_legion_hunt_settings.js';

export const OPERATION_KEY='ops:legion-equipment-extreme-rare:20261018:v1';
export const EQUIPMENT_PERCENT_CAP=.001;
export const EQUIPMENT_PERCENT_KEYS=['eliteSetPercent','bossSetPercent','bossUniquePercent'];
const hash=raw=>createHash('sha256').update(raw).digest('hex');

export function reduceLegionEquipmentOdds(raw){
 const next=validateRegionPolicy(raw),changes=[];
 for(const difficulty of next.difficulties)for(const field of EQUIPMENT_PERCENT_KEYS){
  const before=difficulty.loot[field],after=Math.min(before,EQUIPMENT_PERCENT_CAP);
  if(before!==after){difficulty.loot[field]=after;changes.push({difficulty:difficulty.id,field,before,after});}
 }
 if(changes.length)next.revision++;
 return {policy:validateRegionPolicy(next),changes};
}

export async function applyLegionEquipmentRarity(client,{apply=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const identity=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];
  assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(saved){await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(saved.value)};}
  const rows=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[LEGION_HUNT_SETTINGS_KEY,LEGION_REGIONS_KEY,'equipment_polish_settings_v1']])).rows;
  const raw=rows.find(r=>r.key===LEGION_REGIONS_KEY)?.value;
  assert.ok(raw,'Saved regional policy is required');
  const original=JSON.parse(raw);
  assert.equal(original.mode,'OFF','New maps must remain OFF; inspect an unexpected mode change');
  const sourceRaw=rows.find(r=>r.key===LEGION_HUNT_SETTINGS_KEY)?.value;assert.ok(sourceRaw);
  const source=JSON.parse(sourceRaw);
  const gear=(await client.query("SELECT * FROM character_equipment_items WHERE code LIKE 'HUNT_%' ORDER BY code FOR SHARE")).rows;
  assert.equal(gear.length,REGION_EQUIPMENT.length);
  assert.deepEqual(gear.map(r=>r.code).sort(),REGION_EQUIPMENT.map(r=>r.code).sort());
  for(const item of gear)for(const field of ['is_active','is_public','supply_enabled'])assert.equal(Number(item[field]),0,'Retain equipment release locks');
  // Another independent field pool must not silently bypass the regional odds.
  const gearRefs=new Set(gear.map(r=>String(r.id)));
  for(const pool of [source,...original.regions.map(r=>r.fieldDrops).filter(Boolean)])
   assert.ok(!pool.items.some(r=>r.enabled&&r.type==='EQUIPMENT'&&gearRefs.has(String(r.ref))),'Regional equipment found in an independent field pool; inspect before applying');
  const {policy,changes}=reduceLegionEquipmentOdds(original),afterRaw=JSON.stringify(policy);
  const protectedSettings=rows.filter(r=>r.key!==LEGION_REGIONS_KEY);
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',at:new Date().toISOString(),beforeRevision:original.revision,revision:policy.revision,mode:policy.mode,
   capPercent:EQUIPMENT_PERCENT_CAP,changes,equipmentCount:gear.length,regionCount:policy.regions.length,difficultyCount:policy.difficulties.length,
   zeroOddsPreserved:true,fieldDropsUnchanged:true,stoneOddsUnchanged:true,combatUnchanged:true,equipmentLocksUnchanged:true,
   sourceMode:source.mode,sourceRevision:source.revision,sourceSha256:hash(sourceRaw),beforeSha256:hash(raw),afterSha256:hash(changes.length?afterRaw:raw),
   odds:policy.difficulties.map(d=>({id:d.id,...Object.fromEntries(EQUIPMENT_PERCENT_KEYS.map(k=>[k,d.loot[k]]))})),accountGrants:0};
  if(changes.length){
   const result=await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[afterRaw,LEGION_REGIONS_KEY,raw]);
   assert.equal(result.rows.length,1,'Regional policy changed concurrently');
  }
  const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'LEGION_EQUIPMENT_EXTREME_RARE','APP_META',$2,$3,$4) RETURNING id",
   [owner.id,LEGION_REGIONS_KEY,raw,JSON.stringify({authorization:'용병장비 드랍 확률 극악으로 전부 설정; 기존 신맵 OFF 유지',policy,receipt})])).rows;
  assert.equal(audit.length,1);receipt.auditId=String(audit[0].id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.deepEqual((await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[protectedSettings.map(r=>r.key)])).rows,protectedSettings);
  assert.deepEqual((await client.query("SELECT * FROM character_equipment_items WHERE code LIKE 'HUNT_%' ORDER BY code")).rows,gear);
  const checked=validateRegionPolicy(JSON.parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value));
  assert.deepEqual(checked,policy);
  await client.query(apply?'COMMIT':'ROLLBACK');return {dryRun:!apply,replayed:false,receipt};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
