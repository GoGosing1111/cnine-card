import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ACCOUNT_SYNC_SCHEMA_SQL,ACCOUNT_SYNC_TABLES,accountSyncTriggersSql} from './account-sync-schema-20261015.mjs';
export const OPERATION_KEY='ops:account-sync-schema:20261015:v1';
export async function applyAccountSync(client,{commit=false}={}){
 const tables=Object.keys(ACCOUNT_SYNC_TABLES),sql=ACCOUNT_SYNC_SCHEMA_SQL+accountSyncTriggersSql(tables)+'\nGRANT SELECT,INSERT,UPDATE ON account_sync_versions_v1 TO cnine_migrator;',schemaHash=createHash('sha256').update(sql).digest('hex');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'");
  const identity=(await client.query('SELECT current_database() AS db,current_user AS role')).rows[0];assert.equal(identity.db,'cnine');assert(['neondb_owner','cnine_migrator'].includes(identity.role),'Use an existing table owner');
  const foundation=identity.role==='neondb_owner',operationKey=OPERATION_KEY+(foundation?':foundation':'');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('cnine-account-sync-schema-v1'))");
  const maintenance=(await client.query("SELECT value FROM app_meta WHERE key='maintenance_mode' FOR SHARE")).rows[0];assert.equal(maintenance?.value,'1','Keep maintenance active during the additive migration');
  const columns=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[tables])).rows;
  for(const [table,[column]]of Object.entries(ACCOUNT_SYNC_TABLES))assert(columns.some(r=>r.table_name===table&&r.column_name===column),'Missing account identity column: '+table+'.'+column);
  const owners=(await client.query("SELECT relname AS table_name,pg_get_userbyid(relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows;
  assert(owners.every(o=>['neondb_owner','cnine_migrator'].includes(o.owner)),'Unexpected table owner');
  const owned=owners.filter(o=>o.owner===identity.role).map(o=>o.table_name);
  const previous=(await client.query('SELECT value FROM app_meta WHERE key=$1',[operationKey])).rows[0];
  if(previous){const receipt=JSON.parse(previous.value);assert.equal(receipt.schemaHash,schemaHash,'A different migration already owns this receipt');await client.query('ROLLBACK');return {...receipt,replayed:true};}
  const economics=async()=>(await client.query(`SELECT (SELECT COUNT(*)::text FROM users) AS accounts,
    (SELECT COALESCE(SUM(coin),0)::text FROM users) AS coin,(SELECT COALESCE(SUM(magic_crystals),0)::text FROM users) AS crystals,
    (SELECT COALESCE(SUM(quantity),0)::text FROM user_cards) AS cards,(SELECT COALESCE(SUM(quantity),0)::text FROM cnine_user_inventory) AS inventory,
    (SELECT COALESCE(SUM(total_copies),0)::text FROM user_mercenary_cards_v1) AS mercenaries`)).rows[0];
  const before=await economics();
  // Existing tables have two owners. Each owner changes only its own tables;
  // no role membership or source-table privileges are widened for migration.
  if(foundation)await client.query(ACCOUNT_SYNC_SCHEMA_SQL+'\nGRANT SELECT,INSERT,UPDATE ON account_sync_versions_v1 TO cnine_migrator;');
  await client.query(accountSyncTriggersSql(owned));const after=await economics();assert.deepEqual(after,before,'Economic data must not change');
  const verifyTables=foundation?owned:tables;
  const triggers=(await client.query("SELECT COUNT(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND t.tgname IN ('cnine_sync_insert_v1','cnine_sync_update_v1','cnine_sync_delete_v1')",[verifyTables])).rows[0].count;assert.equal(triggers,verifyTables.length*3);
  const plan=(await client.query('EXPLAIN (FORMAT JSON) SELECT revision,domains FROM account_sync_versions_v1 WHERE user_id=1')).rows;
  assert.match(JSON.stringify(plan),/account_sync_versions_v1_pkey/,'Version reads must use the account primary key');
  const receipt={status:commit?(foundation?'FOUNDATION_READY':'COMPLETED'):'DRY_RUN',operationKey,schemaHash,tables:verifyTables,changedTables:owned,triggers,economicDataUnchanged:true,maintenanceKept:true,accountCount:before.accounts,indexedRead:true,completedAt:new Date().toISOString()};
  if(commit){await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[operationKey,JSON.stringify(receipt)]);await client.query('COMMIT');}else await client.query('ROLLBACK');
  return receipt;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
