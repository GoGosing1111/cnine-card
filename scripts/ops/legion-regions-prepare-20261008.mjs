import assert from 'node:assert/strict';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY,legionRegionDefaults} from '../../shared/legion-regions-v1.mjs';
export const REGION_PREPARE_KEY='ops:legion-regions-prepare:20261008:v1';
// One-time draft registration, never imported by runtime startup. Existing CMS
// edits and every acquisition pool remain untouched. No account grants.
export async function prepareLegionRegions(client,{apply=false,lockForReview=false}={}){
  await client.query('BEGIN');
  try{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[REGION_PREPARE_KEY]);
    const identity=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];
    assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
    const created=[];
    for(const [index,item] of REGION_EQUIPMENT.entries()){
      const pve=Math.floor(item.totalPower*.9),subtype=item.slot==='WEAPON'?'RIFLE':'';
      const inserted=await client.query(`INSERT INTO character_equipment_items(code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,0,0) ON CONFLICT(code) DO NOTHING RETURNING id,code`,
        [item.code,item.name,item.slot,subtype,item.rarity,item.image,item.description+' · 세트/고유 효과는 PVE 전용',item.totalPower,pve,item.totalPower-pve,2000+index]);
      if(inserted.rows.length)created.push(inserted.rows[0]);
    }
    const inserted=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[LEGION_REGIONS_KEY,JSON.stringify(legionRegionDefaults())]);
    const rows=(await client.query('SELECT id,code,name,slot,total_power,pve_power,pvp_power,is_active,is_public,supply_enabled,supply_weight FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY code',[REGION_EQUIPMENT.map(i=>i.code)])).rows;
    assert.equal(rows.length,30);
    for(const item of created){const row=rows.find(r=>r.code===item.code);for(const field of ['is_active','is_public','supply_enabled','supply_weight'])assert.equal(Number(row[field]),0);}
    const policy=JSON.parse((await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[LEGION_REGIONS_KEY])).rows[0].value);
    const locked=lockForReview&&(policy.mode!=='TEST'||policy.testUserIds.length>0);
    if(locked){policy.mode='TEST';policy.testUserIds=[];policy.revision++;await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1',[LEGION_REGIONS_KEY,JSON.stringify(policy)]);}
    const result={operationKey:REGION_PREPARE_KEY,at:new Date().toISOString(),created,policyCreated:inserted.rows.length===1,mode:policy.mode,testUserIds:policy.testUserIds,lockedForReview:lockForReview,equipment:rows,grants:0,polishPolicyChanged:false};
    if(created.length||inserted.rows.length||locked){
      await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'LEGION_REGIONS_PREPARE','APP_META',$2,NULL,$3)",[owner.id,LEGION_REGIONS_KEY,JSON.stringify(result)]);
      await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',[REGION_PREPARE_KEY,JSON.stringify(result)]);
    }
    await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
