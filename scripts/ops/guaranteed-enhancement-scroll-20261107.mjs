import assert from 'node:assert/strict';
import {GUARANTEED_SCROLL as item} from '../../shared/equipment-forge-advanced-v1.mjs';

export const scrollOperation='ops:guaranteed-enhancement-scroll:20261107:v1';
export async function registerGuaranteedScroll(client,{apply=false,expectedDatabase='cnine'}={}){
 const q=async(sql,values=[])=> (await client.query(sql,values)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='15s'");
  assert.deepEqual((await q('SELECT current_database() db,pg_is_in_recovery() replica'))[0],{db:expectedDatabase,replica:false});
  const prior=async()=> (await q('SELECT value FROM app_meta WHERE key=$1',[scrollOperation]))[0];
  const replay=async row=>{const receipt=JSON.parse(row.value);assert.equal(receipt.code,item.code);await q('ROLLBACK');return {...receipt,replayed:true};};
  let earlier=await prior();if(earlier)return await replay(earlier);
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[scrollOperation]);
  earlier=await prior();if(earlier)return await replay(earlier);
  const owner=(await q("SELECT id FROM users WHERE role='OWNER' ORDER BY id LIMIT 1 FOR SHARE"))[0];assert(owner);
  // A conflicting existing catalog item needs review; never overwrite its art, availability or balance.
  const itemRow=(await q("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,'MATERIAL','SPECIAL',$5,16,1) RETURNING code,name,image_url",[item.code,item.name,item.subtitle,item.description,item.image]))[0];
  const audit=(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'FORGE_SCROLL_CATALOG_ADD','INVENTORY_ITEM',$2,$3,$4) RETURNING id",[owner.id,item.code,'null',JSON.stringify(itemRow)]))[0];
  const at=(await q('SELECT clock_timestamp()::text AS at'))[0].at;
  const receipt={operation:scrollOperation,code:item.code,at,auditId:String(audit.id),catalogOnly:true};
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[scrollOperation,JSON.stringify(receipt)]);
  await q(apply?'COMMIT':'ROLLBACK');return {...receipt,dryRun:!apply};
 }catch(error){await q('ROLLBACK');throw error;}
}
