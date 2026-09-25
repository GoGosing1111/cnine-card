// Explicit configuration publication for the current round; never run at startup.
import assert from 'node:assert/strict';
export const SEAL_STAR_OPERATION='ops:seal:49:master-star:20260925:v1';
export const SEAL_STAR_EVENT='seal-1790277293129-5d2eb5d7cb6e';
export async function inspectSealStars(client){
 const settings=(await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).rows[0];
 const event=(await client.query("SELECT e.id,e.event_key,e.status,e.clear_coin,e.clear_shards,e.min_reward_attempts,COALESCE(r.master_star,0) clear_master_star FROM seal_battle_events e LEFT JOIN seal_battle_clear_rewards_v20260925 r ON r.event_id=e.id WHERE e.id=49")).rows[0];
 const paid=(await client.query("SELECT COUNT(*) n FROM seal_battle_clear_claims WHERE event_id=49 AND status='COMPLETED'")).rows[0];
 const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[SEAL_STAR_OPERATION])).rows[0];
 return {settings:JSON.parse(settings?.value||'{}'),event,completedClaims:Number(paid.n),receipt:prior?JSON.parse(prior.value):null};
}
export async function publishSealStars(client,{commit=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[SEAL_STAR_OPERATION]);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[SEAL_STAR_OPERATION])).rows[0];
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  // Compatible with both an already initialized worker and the first new request.
  await client.query('CREATE TABLE IF NOT EXISTS seal_battle_clear_rewards_v20260925(event_id BIGINT PRIMARY KEY,master_star BIGINT NOT NULL DEFAULT 0 CHECK(master_star>=0 AND master_star<=1000000))');
  await client.query('LOCK TABLE seal_battle_clear_claims IN SHARE ROW EXCLUSIVE MODE');
  const stored=(await client.query("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1' FOR UPDATE")).rows[0];assert(stored,'Seal CMS settings missing');
  const event=(await client.query('SELECT * FROM seal_battle_events WHERE id=49 FOR UPDATE')).rows[0];
  assert.equal(event?.event_key,SEAL_STAR_EVENT,'Current round identity changed');assert.equal(event.status,'ACTIVE','Round is no longer active; inspect settlement before publication');
  assert.equal(Number((await client.query('SELECT MAX(id) id FROM seal_battle_events')).rows[0].id),49,'A newer round exists');
  assert.equal(Number((await client.query('SELECT COUNT(*) n FROM seal_battle_clear_claims WHERE event_id=49')).rows[0].n),0,'Current round already has claims');
  assert.equal(Number((await client.query("SELECT is_active FROM inventory_items WHERE code='MASTER_STAR'")).rows[0]?.is_active),1,'Master Star is unavailable');
  const before=JSON.parse(stored.value),next={...before,clearReward:{...before.clearReward,masterStar:200000}};
  const saved=await client.query("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='seal_battle_settings_v1' RETURNING value",[JSON.stringify(next)]);assert.equal(saved.rows.length,1);
  const priorReward=(await client.query('SELECT * FROM seal_battle_clear_rewards_v20260925 WHERE event_id=49 FOR UPDATE')).rows[0]||null;
  const changed=await client.query('INSERT INTO seal_battle_clear_rewards_v20260925(event_id,master_star) VALUES(49,200000) ON CONFLICT(event_id) DO UPDATE SET master_star=excluded.master_star RETURNING *');assert.equal(changed.rows.length,1);
  const withoutStar=structuredClone(next);delete withoutStar.clearReward.masterStar;const old=structuredClone(before);delete old.clearReward.masterStar;assert.deepEqual(withoutStar,old);
  const after=(await client.query('SELECT * FROM seal_battle_events WHERE id=49')).rows[0];assert.deepEqual(after,event,'Unexpected existing round change');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' ORDER BY id LIMIT 1")).rows[0];assert(owner,'Owner audit identity missing');
  const receipt={status:'COMPLETED',operationKey:SEAL_STAR_OPERATION,eventId:49,eventKey:SEAL_STAR_EVENT,masterStar:200000,clearCoin:Number(event.clear_coin),minimumAttempts:Number(event.min_reward_attempts),settingsOtherFieldsPreserved:true,roundOtherFieldsPreserved:true,accountGrants:0,at:new Date().toISOString()};
  const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'SEAL_CLEAR_MASTER_STAR_PUBLISH','SEAL_BATTLE','49',JSON.stringify({settings:before,event,priorReward}),JSON.stringify({...receipt,authorization:'봉인전 현 회차부터 봉인성공시 마스터의별 추가 CMS포함 20만개'})])).rows[0];assert(audit);receipt.adminLogId=String(audit.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[SEAL_STAR_OPERATION,JSON.stringify(receipt)]);
  await client.query("INSERT INTO app_meta(key,value,updated_at) VALUES('seal_master_star_schema_20260925_v1','1',sqlite_now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at");
  const verified=await inspectSealStars(client);assert.equal(verified.settings.clearReward.masterStar,200000);assert.equal(Number(verified.event.clear_master_star),200000);assert.equal(verified.completedClaims,0);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
