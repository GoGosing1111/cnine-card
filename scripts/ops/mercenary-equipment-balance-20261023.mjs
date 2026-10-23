// Private, one-time operator action. scripts/ops is excluded from public assets.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../../shared/legion-regions-v1.mjs';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';
import {LEGION_HUNT_SETTINGS_KEY} from '../../functions/_legion_hunt_settings.js';

export const OPERATION_KEY='ops:mercenary-equipment-balance:20261023:v1';
export const EQUIPMENT_PERCENT_KEYS=Object.freeze(['eliteSetPercent','bossSetPercent','bossUniquePercent']);
export const AUTHORIZATION='용병장비 전투력 2배, 고유효과 강화, 요청한 획득 빈도로 드랍 상향; 세부 드랍 수치 비공개';
const codes=REGION_EQUIPMENT.map(i=>i.code);
const hash=s=>createHash('sha256').update(s).digest('hex');
const stable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['total_power','pve_power','pvp_power','description','updated_at'].includes(key)));
const powers=row=>['total_power','pve_power','pvp_power'].map(k=>Number(row[k]));
const readGear=async client=>(await client.query('SELECT * FROM character_equipment_items ORDER BY id')).rows;
const canonical=value=>JSON.parse(JSON.stringify(value));

export function raiseEquipmentRates(raw,rates){
 assert.deepEqual(Object.keys(rates||{}).sort(),[...EQUIPMENT_PERCENT_KEYS].sort(),'Private operator rates are required');
 const policy=validateRegionPolicy(raw),changes=[];
 for(const d of policy.difficulties)for(const [field,rate] of Object.entries(rates)){
  const before=d.loot[field],after=before===0?0:rate;
  assert.ok(after>=before,'Unexpected higher live odds: '+d.id+'/'+field);
  if(before!==after){d.loot[field]=after;changes.push({difficulty:d.id,field,before,after});}
 }
 if(changes.length)policy.revision++;
 return {policy:validateRegionPolicy(policy),changes};
}
export function equipmentChancePerClear(loot,eliteKills=0){
 assert.ok(Number.isInteger(eliteKills)&&eliteKills>=0&&eliteKills<=4);
 return 1-(1-loot.bossSetPercent/100)*(1-loot.bossUniquePercent/100)*(1-loot.eliteSetPercent/100)**eliteKills;
}
function receiptValid(receipt){
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');
 assert.deepEqual(receipt.equipment.map(c=>c.after.code).sort(),[...codes].sort());
 assert.ok(receipt.auditId);
}
export async function applyMercenaryEquipmentBalance(client,{apply=false,rates,frequencyRange}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const identity=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];
  assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(saved){const receipt=JSON.parse(saved.value);receiptValid(receipt);await client.query('ROLLBACK');return {replayed:true,receipt};}
  await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
  const settings=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[LEGION_REGIONS_KEY,LEGION_HUNT_SETTINGS_KEY,'equipment_polish_settings_v1']])).rows;
  const beforeRaw=settings.find(r=>r.key===LEGION_REGIONS_KEY)?.value;assert.ok(beforeRaw);
  const original=JSON.parse(beforeRaw);assert.equal(original.mode,'ON');
  const sourceRaw=settings.find(r=>r.key===LEGION_HUNT_SETTINGS_KEY)?.value;assert.ok(sourceRaw);
  const source=JSON.parse(sourceRaw),before=await readGear(client),selected=before.filter(r=>codes.includes(r.code));
  assert.equal(selected.length,30);
  const refs=new Set(selected.map(r=>String(r.id)));
  for(const pool of [source,...original.regions.map(r=>r.fieldDrops).filter(Boolean)])
   assert.ok(!pool.items.some(i=>i.enabled&&i.type==='EQUIPMENT'&&refs.has(String(i.ref))),'Independent pool contains regional equipment');
  const desired=selected.map(row=>{
   const item=REGION_EQUIPMENT.find(i=>i.code===row.code),base=item.totalPower/2;
   assert.equal(row.name,item.name);assert.equal(row.slot,item.slot);
   assert.deepEqual(powers(row),[base,Math.floor(base*.9),base-Math.floor(base*.9)],'Live power changed: '+row.code);
   assert.equal(Number(row.is_active),1);assert.equal(Number(row.is_public),1);
   return {id:Number(row.id),code:row.code,total_power:Number(row.total_power)*2,pve_power:Number(row.pve_power)*2,pvp_power:Number(row.pvp_power)*2,
    description:item.kind==='UNIQUE'?item.description+' · 용병 전용 · 고유효과는 PVE에서 적용':row.description};
  });
  assert.ok(Number.isFinite(frequencyRange?.min)&&Number.isFinite(frequencyRange?.max)&&frequencyRange.min>0&&frequencyRange.max>=frequencyRange.min,'Private frequency range is required');
  const {policy,changes}=raiseEquipmentRates(original,rates),afterRaw=JSON.stringify(policy);
  for(const d of policy.difficulties)for(let n=0;n<=4;n++){
   const expected=1/equipmentChancePerClear(d.loot,n);assert.ok(expected>=frequencyRange.min&&expected<=frequencyRange.max,'Target clear frequency not met');
  }
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  const at=new Date().toISOString();
  const updated=(await client.query(
   'UPDATE character_equipment_items e SET total_power=x.total_power,pve_power=x.pve_power,pvp_power=x.pvp_power,description=x.description,updated_at=$2 FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,code text,total_power bigint,pve_power bigint,pvp_power bigint,description text) WHERE e.id=x.id AND e.code=x.code RETURNING e.*',
   [JSON.stringify(desired),at])).rows;
  assert.equal(updated.length,30);
  const equipment=selected.map(old=>{
   const row=updated.find(r=>r.code===old.code),target=desired.find(r=>r.code===old.code);
   assert.deepEqual(stable(row),stable(old));
   assert.deepEqual(powers(row),powers(old).map(n=>n*2));assert.equal(row.description,target.description);
   return {before:old,after:row};
  });
  assert.equal((await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[afterRaw,LEGION_REGIONS_KEY,beforeRaw])).rows.length,1);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',at,equipment,oddsChanges:changes,beforePolicy:original,afterPolicy:policy,frequencyRange,
   beforeSha256:hash(beforeRaw),afterSha256:hash(afterRaw),sourceSha256:hash(sourceRaw),accountGrants:0,privateDropRates:true};
  const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'MERCENARY_EQUIPMENT_BALANCE','EQUIPMENT_POLICY',$2,$3,$4) RETURNING id",
   [owner.id,OPERATION_KEY,JSON.stringify({equipment:selected,policy:original}),JSON.stringify({authorization:AUTHORIZATION,equipment:updated,policy,operationKey:OPERATION_KEY})])).rows;
  assert.equal(audit.length,1);receipt.auditId=String(audit[0].id);receiptValid(receipt);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  const protectedSettings=settings.filter(r=>r.key!==LEGION_REGIONS_KEY);
  assert.deepEqual((await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[protectedSettings.map(r=>r.key)])).rows,protectedSettings);
  assert.deepEqual((await readGear(client)).filter(r=>!codes.includes(r.code)),before.filter(r=>!codes.includes(r.code)));
  assert.deepEqual(JSON.parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value),policy);
  await client.query(apply?'COMMIT':'ROLLBACK');return {dryRun:!apply,replayed:false,receipt};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
export async function verifyMercenaryEquipmentBalance(client){
 const raw=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0]?.value;assert.ok(raw);
 const receipt=JSON.parse(raw);receiptValid(receipt);
 const actual=(await client.query('SELECT * FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id',[codes])).rows;
 assert.equal(actual.length,30);
 for(const change of receipt.equipment)assert.deepEqual(canonical(actual.find(r=>r.code===change.after.code)),change.after);
 const policy=(await client.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value;
 assert.equal(hash(policy),receipt.afterSha256);
 const audit=(await client.query('SELECT after_data FROM admin_logs WHERE id=$1',[receipt.auditId])).rows[0];assert.ok(audit);
 assert.equal(JSON.parse(audit.after_data).operationKey,OPERATION_KEY);
 return {verified:true,at:new Date().toISOString(),equipmentCount:30,auditId:receipt.auditId,revision:receipt.afterPolicy.revision};
}
