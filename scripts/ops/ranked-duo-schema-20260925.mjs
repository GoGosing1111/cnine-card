import {prepareDuoSchema,DUO_ACCOUNT_SOURCES,DUO_POLICY_SOURCES} from '../../functions/_ranked_duo_schema.js';
import {DUO_AUTO_SCHEMA,DUO_AUTO_SCHEMA_KEY} from '../../functions/_ranked_duo_seasons.js';

const runtimeRole='cnine_migrator',ownerRole='neondb_owner';
const tables=[...DUO_ACCOUNT_SOURCES,...DUO_POLICY_SOURCES,'app_meta'];
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
async function transaction(client,statements){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='4s'; SET LOCAL statement_timeout='20s'");
  await client.query(statements.join(';\n'));
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}

// The two existing owners install their own triggers. No role membership,
// existing-table privileges, passwords or ownership are changed.
export async function installRankedDuoSchema({runtime,owner,expectedDatabase='cnine'}){
 for(const [client,role]of [[runtime,runtimeRole],[owner,ownerRole]]){
  const row=(await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  if(row.database!==expectedDatabase||row.role!==role)throw Error('Unexpected duo migration database or role');
 }
 const ready=await runtime.query('SELECT value FROM app_meta WHERE key=$1',[DUO_AUTO_SCHEMA_KEY]);
 if(ready.rows.length)return {status:'ALREADY_READY',version:ready.rows[0].value};
 const catalog=(await runtime.query("SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",[tables])).rows;
 if(!catalog.some(r=>r.name==='app_meta'))throw Error('app_meta is required');
 if(catalog.some(r=>![runtimeRole,ownerRole].includes(r.owner)))throw Error('Unexpected source table owner');
 const ownership=new Map(catalog.map(r=>[r.name,r.owner])),ddl=[];
 await prepareDuoSchema({DB:{dialect:'postgres',execSchema:async statements=>ddl.push(...statements),prepare(sql){
  if(!sql.includes('information_schema.tables'))throw Error('Unexpected schema planning query');
  return {all:async()=>({results:catalog})};
 }}});
 const base=[],byOwner={cnine_migrator:[],neondb_owner:[]};
 for(const sql of ddl){
  if(/^(?:CREATE|DROP) TRIGGER\b/.test(sql)){
   const table=sql.match(/\bON ([a-z0-9_]+)\b/)?.[1],role=ownership.get(table);
   if(!role)throw Error('Unknown trigger owner');
   byOwner[role].push(sql);
  }else base.push(sql);
 }
 await transaction(runtime,[...base,
  // Existing owner-driven catalog/inventory operations invoke these triggers.
  // Only the new invalidation counters need read/update access for that owner.
  'GRANT SELECT,UPDATE ON ranked_duo_accounts_v1,ranked_duo_policy_version_v1 TO neondb_owner'
 ]);
 if(byOwner.neondb_owner.length)await transaction(owner,byOwner.neondb_owner);
 if(byOwner.cnine_migrator.length)await transaction(runtime,byOwner.cnine_migrator);
 const expected=ddl.filter(sql=>/^CREATE TRIGGER\b/.test(sql)).map(sql=>({
  name:sql.match(/^CREATE TRIGGER ([a-z0-9_]+)/)[1],table:sql.match(/\bON ([a-z0-9_]+)\b/)[1]
 }));
 const installed=(await runtime.query("SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgname LIKE 'ranked_duo_%'")).rows;
 if(expected.some(e=>!installed.some(i=>i.table===e.table&&i.name===e.name)))throw Error('Duo trigger installation incomplete');
 const receipt={version:'20260925-24h',accountSources:DUO_ACCOUNT_SOURCES.filter(t=>ownership.has(t)).length,policySources:DUO_POLICY_SOURCES.filter(t=>ownership.has(t)).length,triggers:expected.length,roles:[runtimeRole,ownerRole]};
 await transaction(runtime,[...DUO_AUTO_SCHEMA,
  `INSERT INTO app_meta(key,value,updated_at) VALUES(${literal(DUO_AUTO_SCHEMA_KEY)},'20260925-24h',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`,
  `INSERT INTO app_meta(key,value,updated_at) VALUES('ops_ranked_duo_schema_20260925',${literal(JSON.stringify(receipt))},CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`
 ]);
 return {status:'READY',...receipt};
}
