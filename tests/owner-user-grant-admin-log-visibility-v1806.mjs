import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ADMIN_LOG_HIDDEN_NICKNAME,visibleAdminLogs} from '../functions/_admin_log_visibility.js';

async function fixture(t,postgres){
 let database,query;
 if(postgres){
  database=new PGlite();
  await database.exec(readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8'));
  query=async(sql,values=[])=>{
   const translated=__postgresCompatTest.translateDialect(__postgresCompatTest.bindQuestionMarks(sql).text);
   return (await database.query(translated,values)).rows;
  };
  t.after(()=>database.close());
 }else{
  database=new DatabaseSync(':memory:');
  query=async(sql,values=[])=>{
   const s=database.prepare(sql);
   return s.columns().length?s.all(...values):(s.run(...values),[]);
  };
  t.after(()=>database.close());
 }
 await query('CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT)');
 await query('CREATE TABLE admin_logs(id INTEGER PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT)');
 for(const row of [[1,'renamed-operator','OWNER'],[2,'other-owner','OWNER'],[3,'ordinary-admin','ADMIN'],[4,' '+ADMIN_LOG_HIDDEN_NICKNAME+' ','ADMIN']])
  await query('INSERT INTO users VALUES(?,?,?)',row);
 const env={DB:{prepare(sql){return {values:[],bind(...values){return {...this,values};},async all(){return {results:await query(sql,this.values)};}};}}};
 const insert=(id,admin=3,action='SETTINGS',before=null,after=null)=>query('INSERT INTO admin_logs VALUES(?,?,?,?,?,?,?,?)',[id,admin,action,'USER','50',before,after,'2026-10-22 00:00:00']);
 return {env,query,insert};
}

for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: all excluded-operator actions and structured Codex operations are absent; ordinary logs and stored receipts remain`,async t=>{
  const f=await fixture(t,postgres);
  for(const [id,admin,action,before,after] of [
   [1,1,'COIN'],[2,1,'SETTINGS'],[3,1,'NICKNAME_CHANGE'],[4,4,'UNKNOWN_FUTURE_ACTION'],
   [5,2,'OPS_GRANT'],[6,3,' codex_adjust '],
   [7,3,'CUSTOM',null,'{ "actor" : "CODEX_OPERATIONS" }'],
   [8,3,'CUSTOM','{"actor":"system_ops"}',null],
   [9,3,'CUSTOM',null,'{"source":" Codex "}'],
   [10,3,'CUSTOM','{"operationKey":"ops:legacy-grant"}',null],
   [11,3,'CUSTOM',null,'{"operationKey":" OPS:new-operation "}'],
   [12,null,'CUSTOM',null,'{"actor":"CODEX"}']
  ])await f.insert(id,admin,action,before??null,after??null);
  const visible=[
   [101,2,'COIN'],[102,2,'SETTINGS'],[103,3,'COIN'],
   [104,3,'MANUAL',null,'{"reason":"CODEX_OPERATIONS 안내 문구"}'],
   [105,3,'MANUAL',null,'{invalid json'],
   [106,3,'OPSTEST',null,'{"operationKey":"cms:manual"}'],
   [107,null,null,null,null],[108,999,'MISSING_OPERATOR',null,''],
   [109,3,'MANUAL',null,'"CODEX_OPERATIONS"']
  ];
  for(const [id,admin,action,before,after] of visible)await f.insert(id,admin,action,before??null,after??null);
  const before=await f.query('SELECT * FROM admin_logs ORDER BY id');
  const logs=await visibleAdminLogs(f.env);
  assert.deepEqual(logs.map(x=>Number(x.id)),visible.map(x=>x[0]).reverse());
  assert.deepEqual(await f.query('SELECT * FROM admin_logs ORDER BY id'),before);
  // Existing rows and future rows are treated identically, even after a rename.
  await f.insert(200,1,'FUTURE_COMMAND');
  await f.insert(201,2,'CUSTOM',null,'{"actor":"CODEX_OPERATIONS"}');
  await f.insert(202,2,'NEW_MANUAL_ACTION');
  assert.deepEqual((await visibleAdminLogs(f.env)).map(x=>Number(x.id)),[202,...visible.map(x=>x[0]).reverse()]);
 });
 test(`${label}: hidden recent operations do not consume the 300 visible-log limit`,async t=>{
  const f=await fixture(t,postgres);
  for(let i=1;i<=310;i++)await f.insert(i,2,'MANUAL');
  for(let i=311;i<=660;i++)await f.insert(i,1,'SETTINGS');
  for(let i=661;i<=1010;i++)await f.insert(i,3,'OPS_ANY_COMMAND');
  const logs=await visibleAdminLogs(f.env);
  assert.equal(logs.length,300);assert.equal(Number(logs[0].id),310);assert.equal(Number(logs.at(-1).id),11);
  assert.equal(Number((await f.query('SELECT COUNT(*) count FROM admin_logs'))[0].count),1010);
 });
}
test('the actual admin/logs route retains permission checks and returns only server-filtered rows',async()=>{
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const branch=api.split("if(path==='admin/logs'){")[1].split("if(path==='admin/tiers'){")[0];
 assert.ok(branch.includes("requirePermission(request,env,'ADMIN_LOG')"));
 assert.ok(branch.indexOf('if(!admin)')<branch.indexOf('visibleAdminLogs(env)'));
 assert.match(branch,/return json\(\{logs:await visibleAdminLogs\(env\)\}\)/);
 assert.doesNotMatch(api,/USER_GRANT_ADMIN_ACTIONS/);
});
