import assert from 'node:assert/strict';
import {BLACKWING_SCHEMA,BLACKWING_SETTINGS,defaultBlackwingSettings,validateBlackwingSettings} from '../../functions/_raid_blackwing_live.js';

export const BLACKWING_RELEASE_KEY='blackwing_raid_test_release_20261024_v1';
// Caller supplies the existing owner connection. Never saves credentials or
// grants a new role; reuse the application's existing migration/runtime role.
export async function applyBlackwingTest(db,{commit=false,adminId=1}={}){
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[BLACKWING_RELEASE_KEY]);
  const actor=(await db.query("SELECT id,role FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[adminId])).rows[0];
  assert(actor,'An existing active OWNER must be the audit actor');
  const previous=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[BLACKWING_SETTINGS])).rows[0]?.value??null;
  const replay=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLACKWING_RELEASE_KEY])).rows[0]?.value;
  if(replay){assert.equal(JSON.parse(previous).mode,'TEST','Previously applied release has since changed mode; inspect instead of overwriting');await db.query('ROLLBACK');return {replayed:true,...JSON.parse(replay)};}
  const existingRaid=(await db.query("SELECT value FROM app_meta WHERE key='raid_madara_settings_v1'")).rows[0]?.value;
  for(const sql of BLACKWING_SCHEMA)await db.query(sql);
  for(const table of ['raid_blackwing_rooms_v1','raid_blackwing_active_v1','raid_blackwing_receipts_v1'])await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE '+table+' TO cnine_migrator');
  const cfg=previous?validateBlackwingSettings(JSON.parse(previous)):defaultBlackwingSettings();
  const settings={...cfg,mode:'TEST',revision:cfg.revision+1};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=CURRENT_TIMESTAMP',[BLACKWING_SETTINGS,JSON.stringify(settings)]);
  const after={settings,entryCost:0,rewardLocked:true,scope:'LIVE_TEST',tables:3};
  const log=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'BLACKWING_RAID_TEST_RELEASE','RAID',$2,$3,$4) RETURNING id",[adminId,BLACKWING_SETTINGS,previous,JSON.stringify(after)])).rows[0];
  const result={appliedAt:new Date().toISOString(),auditId:Number(log.id),...after};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[BLACKWING_RELEASE_KEY,JSON.stringify(result)]);
  assert.equal((await db.query("SELECT value FROM app_meta WHERE key='raid_madara_settings_v1'")).rows[0]?.value,existingRaid,'Existing raid settings must remain unchanged');
  await db.query(commit?'COMMIT':'ROLLBACK');
  return {replayed:false,committed:commit,...result};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
