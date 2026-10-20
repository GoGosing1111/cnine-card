import {duoConfigVersionStatements} from '../../functions/_ranked_duo_schema.js';

export const OPERATION_KEY='ops:ranked-duo-growth-tracking:20261020:v1';
const validTrigger=r=>r.enabled==='O'&&(r.table_name==='user_mercenary_levels_v1'?r.definition.includes('ranked_duo_touch_account_v1'):r.definition.includes('mercenary_level_policy_v1'));
export async function inspectDuoGrowthTracking(client){
 const rows=(await client.query(`SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal AND
   (c.relname='user_mercenary_levels_v1' AND t.tgname='ranked_duo_touch_v1'
    OR c.relname='app_meta' AND t.tgname IN ('ranked_duo_config_insert_v1','ranked_duo_config_update_v1','ranked_duo_config_delete_v1')) ORDER BY c.relname,t.tgname`)).rows;
 return {ready:rows.length===4&&rows.every(validTrigger),triggers:rows};
}

// Repair only the existing duo invalidation hooks. No growth, deck, energy,
// score, battle receipt or reward is rewritten. Dry-run DDL is rolled back.
// Production has two existing table owners. Install policy hooks first in
// their owner's transaction, then the level hook and completion receipt in
// the runtime owner's transaction. An interrupted first stage is safe to retry.
export async function installDuoGrowthTracking(client,{commit=false,policyClient=client}={}){
 let policyPreview=null,initial=null;
 if(policyClient!==client){
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  initial=await inspectDuoGrowthTracking(client);
  if(prior){
   if(!initial.ready)throw Error('DUO_GROWTH_TRACKING_CHANGED');
   return {replayed:true,receipt:JSON.parse(prior.value),verification:initial};
  }
  await policyClient.query('BEGIN');
  try{
   await policyClient.query("SET LOCAL lock_timeout='5s'");
   await policyClient.query("SET LOCAL statement_timeout='15s'");
   await policyClient.query('SELECT pg_advisory_xact_lock(20261020,1801)');
   for(const sql of duoConfigVersionStatements('postgres'))await policyClient.query(sql);
   policyPreview=(await inspectDuoGrowthTracking(policyClient)).triggers.filter(r=>r.table_name==='app_meta');
   if(policyPreview.length!==3||!policyPreview.every(validTrigger))throw Error('DUO_POLICY_TRACKING_NOT_READY');
   await policyClient.query(commit?'COMMIT':'ROLLBACK');
  }catch(error){await policyClient.query('ROLLBACK');throw error;}
 }
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('SELECT pg_advisory_xact_lock(20261020,1801)');
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){
   const verification=await inspectDuoGrowthTracking(client);
   if(!verification.ready)throw Error('DUO_GROWTH_TRACKING_CHANGED');
   await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value),verification};
  }
  const owner=(await client.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows[0];
  if(!owner)throw Error('DUO_OWNER_NOT_ACTIVE');
  const before=initial||await inspectDuoGrowthTracking(client);
  await client.query('DROP TRIGGER IF EXISTS ranked_duo_touch_v1 ON user_mercenary_levels_v1');
  await client.query('CREATE TRIGGER ranked_duo_touch_v1 AFTER INSERT OR UPDATE OR DELETE ON user_mercenary_levels_v1 FOR EACH ROW EXECUTE FUNCTION ranked_duo_touch_account_v1()');
  if(policyClient===client)for(const sql of duoConfigVersionStatements('postgres'))await client.query(sql);
  let verification=await inspectDuoGrowthTracking(client);
  if(policyPreview&&!commit){
   const triggers=[...verification.triggers.filter(r=>r.table_name==='user_mercenary_levels_v1'),...policyPreview];
   verification={ready:triggers.length===4&&triggers.every(validTrigger),triggers,separateRolledBackTransactions:true};
  }
  if(!verification.ready)throw Error('DUO_GROWTH_TRACKING_NOT_READY');
  const [version]=(await client.query('UPDATE ranked_duo_policy_version_v1 SET revision=revision+1 WHERE id=1 RETURNING revision')).rows;
  if(!version)throw Error('DUO_POLICY_NOT_INITIALIZED');
  const receipt={operationKey:OPERATION_KEY,appliedAt:new Date().toISOString(),policyRevision:Number(version.revision),growthRowsChanged:0,battlesChanged:0,rewardsIssued:0};
  await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'DUO_GROWTH_TRACKING','RANKED_DUO','GROWTH',$1,$2)",[JSON.stringify(before),JSON.stringify(receipt)]);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(commit?'COMMIT':'ROLLBACK');
  return {replayed:false,dryRun:!commit,receipt,verification};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
