// Explicit one-time CMS preparation. Never imported by runtime routes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LEGION_REGIONS_KEY,REGION_DIFFICULTIES} from '../../shared/legion-regions-v1.mjs';
import {LEGION_HUNT_SETTINGS_KEY,validateLegionHuntPolicy} from '../../functions/_legion_hunt_settings.js';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';
export const OPERATION_KEY='ops:legion-map-drafts:20261018:v1';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function fillLegionMapDrafts(source,regional){
  validateLegionHuntPolicy(source,source.items);
  const next=validateRegionPolicy(regional);
  const added=[];
  for(const region of next.regions){
    if(Object.hasOwn(region,'fieldDrops'))continue;
    region.fieldDrops={items:structuredClone(source.items),difficulties:REGION_DIFFICULTIES.map(d=>{
      const base=source.difficulties.find(row=>row.id===(d.id==='calamity'?'inferno':d.id));
      assert.ok(base,'Missing source difficulty');return {...base,id:d.id};
    })};
    added.push(region.id);
  }
  next.mode='OFF';
  if(added.length||regional.mode!=='OFF')next.revision++;
  validateRegionPolicy(next);
  return {policy:next,added};
}
export async function prepareLegionMapDrafts(client,{apply=false}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const identity=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
    const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
    if(saved){await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(saved.value)};}
    const rows=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[LEGION_HUNT_SETTINGS_KEY,LEGION_REGIONS_KEY]])).rows;
    const sourceRaw=rows.find(r=>r.key===LEGION_HUNT_SETTINGS_KEY)?.value,beforeRaw=rows.find(r=>r.key===LEGION_REGIONS_KEY)?.value;assert.ok(sourceRaw&&beforeRaw);
    const source=JSON.parse(sourceRaw),before=JSON.parse(beforeRaw),{policy,added}=fillLegionMapDrafts(source,before);
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
    const protectedBefore=(await client.query("SELECT key,value FROM app_meta WHERE key='equipment_polish_settings_v1'")).rows;
    const gearBefore=(await client.query("SELECT * FROM character_equipment_items WHERE code LIKE 'HUNT_%' ORDER BY code")).rows;
    const raw=JSON.stringify(policy),receipt={operationKey:OPERATION_KEY,status:'COMPLETED',mode:policy.mode,revision:policy.revision,sourceRevision:source.revision,sourceSha256:digest(sourceRaw),beforeSha256:digest(beforeRaw),afterSha256:digest(raw),added,regions:policy.regions.map(r=>({id:r.id,items:r.fieldDrops.items.length,difficulties:r.fieldDrops.difficulties.length})),calamitySource:'inferno',completedAt:new Date().toISOString()};
    const changed=await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[raw,LEGION_REGIONS_KEY,beforeRaw]);assert.equal(changed.rows.length,1);
    const audit=await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'LEGION_REGION_DRAFT_FILL','APP_META',$2,$3,$4) RETURNING id",[owner.id,LEGION_REGIONS_KEY,beforeRaw,JSON.stringify({authorization:'잊혀진섬 방식으로 나머지 맵 채우고 OFF 유지',policy,receipt})]);assert.equal(audit.rows.length,1);receipt.auditId=String(audit.rows[0].id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
    assert.equal((await client.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_HUNT_SETTINGS_KEY])).rows[0].value,sourceRaw);
    assert.deepEqual((await client.query("SELECT key,value FROM app_meta WHERE key='equipment_polish_settings_v1'")).rows,protectedBefore);
    assert.deepEqual((await client.query("SELECT * FROM character_equipment_items WHERE code LIKE 'HUNT_%' ORDER BY code")).rows,gearBefore);
    await client.query(apply?'COMMIT':'ROLLBACK');return {dryRun:!apply,replayed:false,receipt};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
