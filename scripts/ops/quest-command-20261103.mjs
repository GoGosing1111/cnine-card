import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DAILY_COMBAT_SCHEMA} from '../../functions/_quest_combat.js';
import {WEEKLY_COMBAT_REWARDS,DAILY_COMBAT_QUESTS,QUEST_COMBAT_POLICY_KEY} from '../../shared/quest-command-v1.mjs';
export const OP='ops:quest-command:20261103:v1',WEEKLY='quest_weekly_settings_v20260924';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const QUEST_FINISH_INDEXES=['lich','madara','blackwing'].map(name=>({name:`idx_quest_${name}_finished_20261103`,table:`raid_${name}_rooms_v1`}));
export async function stageQuestIndexes(db,indexes=QUEST_FINISH_INDEXES){
 const results=[];for(const row of indexes){
  // Build without blocking normal room writes; all original raid rows remain intact.
  await db.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${row.name} ON ${row.table} (((state_json::jsonb->>'finishedAt')::bigint)) WHERE status IN ('CLEAR','FAILED')`);
  const result=(await db.query('SELECT i.indisvalid,pg_get_indexdef(i.indexrelid) definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname=$1',[row.name])).rows[0];assert.equal(result?.indisvalid,true);results.push({...row,...result});
 }return results;
}
export async function stageQuestSchema(db,{dryRun=true}={}){
 await db.query('BEGIN');try{
  for(const sql of DAILY_COMBAT_SCHEMA)await db.query(sql);
  // Same runtime permissions as the already deployed weekly receipt table.
  const grants=(await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='quest_weekly_claims_v1' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')")).rows;
  for(const row of grants){assert(/^[a-zA-Z0-9_]+$/.test(row.grantee));await db.query(`GRANT ${row.privilege_type} ON quest_daily_combat_claims_v1 TO "${row.grantee}"`);}
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,table:'quest_daily_combat_claims_v1',grantCount:grants.length};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
export async function applyQuestPolicy(db,{authorization,expectedWeekly,sourceCommit,dryRun=true,failAt=''}={}){
 assert.equal(authorization,OP);assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);assert(expectedWeekly);
 const existing=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
 if(existing)return {replayed:true,receipt:JSON.parse(existing.value)};
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='15s'");await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",[OP]);
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
  if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)}}
  const before=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[WEEKLY])).rows[0]?.value;assert.equal(before,expectedWeekly,'Weekly config changed: re-review required');
  assert.equal((await db.query('SELECT key FROM app_meta WHERE key=$1',[QUEST_COMBAT_POLICY_KEY])).rowCount,0,'Daily policy already exists');
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner,'Audit OWNER missing');
  const claims=(await db.query('SELECT * FROM quest_weekly_claims_v1 ORDER BY user_id,week_key,quest_id')).rows;
  const previous=JSON.parse(before),next=structuredClone(previous);assert.equal(next.revision,6);next.revision++;
  for(const [id,rewardAmount]of Object.entries(WEEKLY_COMBAT_REWARDS))next.quests[id]={...next.quests[id],enabled:true,rewardType:'COIN',rewardAmount};
  next.operationToken=OP;assert.deepEqual(next.quests.POST,previous.quests.POST);
  const daily={version:1,enabled:true,operation:OP,quests:DAILY_COMBAT_QUESTS.map(({id,target,coin,masterStars})=>({id,target,coin,masterStars}))};
  const updated=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),WEEKLY,before]);assert.equal(updated.rowCount,1);
  if(failAt==='weekly')throw Error('INJECTED_FAILURE_AFTER_WEEKLY');
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[QUEST_COMBAT_POLICY_KEY,JSON.stringify(daily)]);
  const receipt={operation:OP,sourceCommit,beforeWeeklyHash:hash(previous),afterWeeklyHash:hash(next),weekly:next,daily,postPreserved:true,priorClaims:{count:claims.length,sha256:hash(claims)},accountWrites:0,messagesSent:0};
  const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'QUEST_COMMAND_POLICY','APP_META',$2,$3,$4) RETURNING id,created_at",[owner.id,OP,before,JSON.stringify(receipt)])).rows[0];
  receipt.auditId=String(audit.id);receipt.appliedAt=String(audit.created_at);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);
  assert.equal(hash((await db.query('SELECT * FROM quest_weekly_claims_v1 ORDER BY user_id,week_key,quest_id')).rows),receipt.priorClaims.sha256);
  if(failAt==='receipt')throw Error('INJECTED_FAILURE_AFTER_RECEIPT');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
