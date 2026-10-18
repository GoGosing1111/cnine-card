import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:retired-content-cleanup:20261019:v1';
export const LOG_TABLES=Object.freeze(['monster_siege_actions','monster_siege_ai_actions']);
export const SETTINGS_KEYS=Object.freeze(['monster_siege_settings_v1','pingdu_chicken_event_v1','pingdu_golden_axe_v1']);
const PROTECTED_TABLES=['monster_siege_events','monster_siege_users','monster_siege_rewards','monster_siege_participation_bonus_v1','monster_siege_ai_state'];
export async function removalState(client){
 const logs=[];
 for(const name of LOG_TABLES){
  const {rows:[row]}=await client.query(`SELECT COUNT(*)::text AS count,pg_total_relation_size('public.${name}')::text AS bytes FROM public.${name}`);
  logs.push({table:name,...row});
 }
 const {rows:settings}=await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS_KEYS]);
 const protectedRecords=[];
 for(const name of PROTECTED_TABLES){
  const {rows:[row]}=await client.query(`SELECT COUNT(*)::text AS count,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) AS digest FROM public.${name} t`);
  protectedRecords.push({table:name,...row});
 }
 return {logs,settings,protectedRecords};
}

// One explicit operations transaction, never a request-time migration.
// No CASCADE, user/account writes, shared financial-log deletion or reward settlement.
export async function removeRetiredContent(client,{commit=false,release}={}){
 assert.equal(release?.retiredRoutesVerified,true,'Verify the deployed retirement responses first');
 assert.match(release?.commit||'',/^[a-f0-9]{40}$/,'Record the deployed source commit');
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const {rows:[prior]}=await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await client.query('ROLLBACK');const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');return {...receipt,replayed:true};}
  const {rows:[owner]}=await client.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
  assert.ok(owner,'Expected active OWNER missing');
  const {rows:active}=await client.query("SELECT id FROM monster_siege_events WHERE status='ACTIVE'");
  assert.equal(active.length,0,'Active siege must be resolved before removing its logs');
  await client.query('LOCK TABLE ONLY monster_siege_actions, ONLY monster_siege_ai_actions IN ACCESS EXCLUSIVE MODE');
  const {rows:dependencies}=await client.query("SELECT conname AS name FROM pg_constraint WHERE contype='f' AND confrelid IN ('monster_siege_actions'::regclass,'monster_siege_ai_actions'::regclass) UNION ALL SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('monster_siege_actions'::regclass,'monster_siege_ai_actions'::regclass) UNION ALL SELECT inhrelid::regclass::text FROM pg_inherits WHERE inhparent IN ('monster_siege_actions'::regclass,'monster_siege_ai_actions'::regclass)");
  assert.equal(dependencies.length,0,'Unexpected dependent table or trigger; no cascading removal allowed');
  await client.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) FOR UPDATE',[SETTINGS_KEYS]);
  const before=await removalState(client);
  await client.query('TRUNCATE TABLE ONLY monster_siege_actions CONTINUE IDENTITY RESTRICT');
  // AI logs have a different table owner; use existing DELETE rights without
  // changing grants or taking over that owner's role (3,531 production rows).
  await client.query('DELETE FROM ONLY monster_siege_ai_actions');
  const removedSettings=await client.query('DELETE FROM app_meta WHERE key=ANY($1::text[]) RETURNING key',[SETTINGS_KEYS]);
  const after=await removalState(client);
  assert.ok(after.logs.every(row=>row.count==='0'),'Logs remain');
  assert.equal(after.settings.length,0,'Retired settings remain');
  assert.deepEqual(after.protectedRecords,before.protectedRecords,'Protected event or reward records changed');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),release,
   authorization:'몬스터공성 API,로그 아예 삭제하고 설정에서도 치킨집,금도끼은도끼 이벤트 아예 삭제해 그리고DB정리 하는 설정도 안쓰니까 삭제',
   logs:before.logs.map((row,i)=>({table:row.table,deleted:Number(row.count),bytesBefore:Number(row.bytes),bytesAfter:Number(after.logs[i].bytes)})),
   removedSettings:removedSettings.rows.map(row=>row.key).sort(),protectedRecords:after.protectedRecords,accountDataChanged:false,sharedFinancialLogsChanged:false};
  const {rows:[audit]}=await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'RETIRED_CONTENT_REMOVE','CONTENT',$2,$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify(before),JSON.stringify(receipt)]);
  assert.ok(audit);receipt.auditId=String(audit.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(commit?'COMMIT':'ROLLBACK');
  return {...receipt,dryRun:!commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyRetiredContentRemoval(client){
 const {rows:[row]}=await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 assert.ok(row,'No completion receipt');const receipt=JSON.parse(row.value);
 const state=await removalState(client);assert.ok(state.logs.every(row=>row.count==='0'));assert.equal(state.settings.length,0);
 assert.deepEqual(state.protectedRecords,receipt.protectedRecords);
 const {rows:[audit]}=await client.query('SELECT id FROM admin_logs WHERE id=$1 AND action_type=$2 AND target_id=$3',[receipt.auditId,'RETIRED_CONTENT_REMOVE',OPERATION_KEY]);assert.ok(audit);
 return {verifiedAt:new Date().toISOString(),receipt,logs:state.logs,retiredSettingsRemaining:state.settings.length,protectedRecordsVerified:true};
}
