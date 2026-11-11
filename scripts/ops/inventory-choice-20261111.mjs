import assert from 'node:assert/strict';
import {EMPEROR_BOX,LEVEL_TICKET} from '../../functions/_inventory_choice.js';
import {EQUIPMENT_SET_PARTS} from '../../shared/equipment-set-visual-v1.mjs';

export const registrationKey='ops:inventory-choice-emperor15-mercenary21:20261111:v1';
export async function registerChoiceItems(client,{commit=false}={}){
  const query=async(sql,values=[])=>(await client.query(sql,values)).rows;
  await query('BEGIN');
  try{
    await query("SET LOCAL lock_timeout='5s'");
    await query("SET LOCAL statement_timeout='20s'");
    await query('SELECT pg_advisory_xact_lock(hashtext($1))',[registrationKey]);
    const [existing]=await query('SELECT value FROM app_meta WHERE key=$1',[registrationKey]);
    if(existing){await query('ROLLBACK');return {...JSON.parse(existing.value),replayed:true};}
    const [owner]=await query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner);
    const parts=await query('SELECT code,slot FROM character_equipment_items WHERE code=ANY($1::text[]) AND is_active=1 AND is_public=1 FOR SHARE',[Object.values(EQUIPMENT_SET_PARTS.EMPEROR)]);
    assert.deepEqual(Object.fromEntries(parts.map(p=>[p.slot,p.code])),EQUIPMENT_SET_PARTS.EMPEROR);
    const items=[EMPEROR_BOX,LEVEL_TICKET];
    assert.equal((await query('SELECT code FROM inventory_items WHERE code=ANY($1::text[])',[items.map(i=>i.code)])).length,0,'Existing catalog entry needs reconciliation');
    for(const [index,item] of items.entries()){
      await query('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1)',
        [item.code,item.name,item.subtitle,item.description,item.category,item.rarity,item.image,58+index]);
    }
    const receipt={operationKey:registrationKey,items:items.map(i=>({code:i.code,name:i.name})),createdAt:new Date().toISOString()};
    const [audit]=await query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES($1,'ITEM_CHOICE_CATALOG_REGISTER','INVENTORY_ITEM',$2,$3) RETURNING id",[owner.id,registrationKey,JSON.stringify(receipt)]);
    receipt.auditId=String(audit.id);
    await query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[registrationKey,JSON.stringify(receipt)]);
    await query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
