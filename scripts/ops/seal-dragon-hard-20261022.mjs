import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:seal-dragon-hard:20261022:v1';
export const BOSS_STAGE={name:'봉인룡 네르가온',hp:15000000000,battlePower:18000000};
// Explicit OWNER request: 난이도 높게해놔. Future-round settings only. Never
// executed on deploy/startup; an operation receipt protects subsequent CMS edits.
export async function configureSealDragonHard(client,{commit=false,expectedSettings}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const stored=(await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1' FOR UPDATE")).rows[0];assert(stored);
  const before=JSON.parse(stored.value);if(expectedSettings)assert.deepEqual(before,expectedSettings,'CMS settings changed; inspect before applying');
  const next={...before,format:'SEALS_BOSS',bossStage:BOSS_STAGE};
  const roundBefore=(await client.query('SELECT * FROM seal_battle_events ORDER BY id DESC LIMIT 1')).rows[0];
  const changed=await client.query("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='seal_battle_settings_v1' RETURNING value",[JSON.stringify(next)]);assert.equal(changed.rows.length,1);
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner);
  const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,format:'SEALS_BOSS',bossStage:BOSS_STAGE,
   scope:'NEXT_ROUND_ONLY',roundUnchanged:true,rewardsUnchanged:true,roundStarted:false,at:new Date().toISOString()};
  const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
   [owner.id,'SEAL_DRAGON_DIFFICULTY','SEAL_BATTLE','settings',JSON.stringify(before),JSON.stringify({...receipt,authorization:'세 봉인 해제 → 보스 본체전 → 공동 완료 보상 작업해. 보스는 새로 리소스 만들고 용으로 하나 만들어. 난이도 높게해놔'})])).rows[0];assert(audit);receipt.adminLogId=String(audit.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.deepEqual((await client.query('SELECT * FROM seal_battle_events ORDER BY id DESC LIMIT 1')).rows[0],roundBefore);
  assert.deepEqual(JSON.parse((await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).rows[0].value),next);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
