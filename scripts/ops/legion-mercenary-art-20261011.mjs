import assert from 'node:assert/strict';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../../shared/legion-regions-v1.mjs';
export const LEGION_MERCENARY_ART_KEY='ops:legion-mercenary-art:20261011:v1';
// Art/description update only. No region release, catalog activation, supply,
// account grants, power changes or polish policy changes are part of this task.
export async function applyLegionMercenaryArt(client,{apply=false}={}){
  await client.query('BEGIN');
  try{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[LEGION_MERCENARY_ART_KEY]);
    const identity=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
    const codes=REGION_EQUIPMENT.map(item=>item.code),policyKeys=[LEGION_REGIONS_KEY,'equipment_polish_settings_v1'];
    const policies=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[policyKeys])).rows;
    const before=(await client.query('SELECT id,code,name,slot,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,supply_enabled,supply_weight FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[codes])).rows;
    assert.equal(before.length,30);
    const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_MERCENARY_ART_KEY])).rows[0];
    const changes=[];
    for(const row of before){
      const item=REGION_EQUIPMENT.find(item=>item.code===row.code),description=item.description+' · 용병 PVE/PVP 장비 · 세트/고유/연마 효과 PVE 전용';
      if(row.image_url===item.image&&row.description===description)continue;
      await client.query('UPDATE character_equipment_items SET image_url=$2,description=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[row.id,item.image,description]);
      changes.push({code:row.code,beforeImage:row.image_url,image:item.image,beforeDescription:row.description,description});
    }
    const after=(await client.query('SELECT id,code,name,slot,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,supply_enabled,supply_weight FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY code',[codes])).rows;
    const invariant=rows=>rows.map(({image_url,description,...row})=>row);assert.deepEqual(invariant(after),invariant(before));
    assert.deepEqual((await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[policyKeys])).rows,policies);
    const result={operationKey:LEGION_MERCENARY_ART_KEY,at:new Date().toISOString(),changes,count:changes.length,regionPolicyChanged:false,polishPolicyChanged:false,grants:0,replayed:Boolean(previous)&&!changes.length};
    if(changes.length){
      const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
      await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'LEGION_MERCENARY_ART','EQUIPMENT',$2,$3,$4)",[owner.id,LEGION_MERCENARY_ART_KEY,JSON.stringify(before),JSON.stringify(result)]);
      await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[LEGION_MERCENARY_ART_KEY,JSON.stringify(result)]);
    }
    await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
