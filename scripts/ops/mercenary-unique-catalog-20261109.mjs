import assert from 'node:assert/strict';
import {UNIQUE_MERCENARY_EQUIPMENT as gear} from '../../shared/mercenary-unique-equipment-v1.mjs';

export const operationKey='ops:mercenary-unique-11-13:20261109:v1';
const codes=gear.map(i=>i.code);
const columns='id,code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight';
export async function readCatalog(db){
 return (await db.query('SELECT '+columns+' FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY sort_order,id',[codes])).rows;
}
export async function readReceipt(db){
 const {rows}=await db.query('SELECT value FROM app_meta WHERE key=$1',[operationKey]);
 if(!rows.length)return null;
 const receipt=JSON.parse(rows[0].value);
 assert.equal(receipt.operationKey,operationKey);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.created.length,15);assert(receipt.auditId);
 return receipt;
}
export function checkCatalog(rows){
 assert.equal(rows.length,gear.length);
 for(const [i,row] of rows.entries()){
  const g=gear[i];
  for(const [key,value] of Object.entries({code:g.code,name:g.name,slot:g.slot,rarity:g.rarity,image_url:g.image,description:g.description}))assert.equal(row[key],value);
  for(const [key,value] of Object.entries({total_power:g.totalPower,pve_power:g.pvePower,pvp_power:g.pvpPower,is_active:1,is_public:1,supply_enabled:0,supply_weight:0}))assert.equal(Number(row[key]),value);
 }
}
export async function publish(db,{commit,dryRun=true}={}){
 const old=await readReceipt(db);if(old)return {replayed:true,receipt:old};
 assert.match(commit,/^[a-f0-9]{40}$/);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='20s'");
  assert.equal((await db.query('SELECT current_database() AS db, pg_is_in_recovery() AS standby')).rows[0].db,'cnine');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[operationKey]);
  const raced=await readReceipt(db);if(raced){await db.query('ROLLBACK');return {replayed:true,receipt:raced};}
  await db.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
  assert.equal((await readCatalog(db)).length,0,'Existing unique catalog needs reconciliation');
  // Reuse the stored subtype conventions of the corresponding mercenary slots.
  const standards=(await db.query("SELECT slot,subtype FROM character_equipment_items WHERE code LIKE 'MERC_ASC_10_%' AND is_public=1 AND is_active=1")).rows;
  const subtypes=new Map(standards.map(r=>[r.slot,r.subtype]));assert.equal(subtypes.size,5);
  const values=gear.map((g,index)=>({n:index+1,code:g.code,name:g.name,slot:g.slot,subtype:subtypes.get(g.slot),rarity:g.rarity,image:g.image,description:g.description,total:g.totalPower,pve:g.pvePower,pvp:g.pvpPower}));
  const inserted=await db.query(`WITH base AS (SELECT COALESCE(MAX(id),0) AS last_id,COALESCE(MAX(sort_order),0) AS last_sort FROM character_equipment_items),
    items AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(n int,code text,name text,slot text,subtype text,rarity text,image text,description text,total bigint,pve bigint,pvp bigint))
    INSERT INTO character_equipment_items(${columns}) SELECT last_id+n,code,name,slot,subtype,rarity,image,description,total,pve,pvp,1,1,last_sort+n,0,0 FROM base CROSS JOIN items ORDER BY n`,[JSON.stringify(values)]);
  assert.equal(inserted.rowCount,15);const rows=await readCatalog(db);checkCatalog(rows);
  const created=rows.map(r=>({id:String(r.id),code:r.code,name:r.name}));
  const receipt={operationKey,status:'COMPLETED',at:new Date().toISOString(),commit,created,accountGrants:0,dropEntries:0};
  const audit=await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT id,'MERCENARY_UNIQUE_CATALOG','APP_META',$1,$2,$3 FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 RETURNING id",[operationKey,JSON.stringify({registered:0}),JSON.stringify(receipt)]);
  assert.equal(audit.rowCount,1);receipt.auditId=String(audit.rows[0].id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[operationKey,JSON.stringify(receipt)]);
  assert.equal((await readReceipt(db)).auditId,receipt.auditId);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
