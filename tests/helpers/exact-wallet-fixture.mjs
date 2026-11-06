import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export async function exactWalletFixture(t,dialect='postgres'){
  const pg=dialect==='postgres'?new PGlite():null,sqlite=pg?null:new DatabaseSync(':memory:');
  t.after(()=>pg?pg.close():sqlite.close());
  let failure='',lostCommit=false;
  const convert=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]));
  const query=async(sql,values=[])=>{
    if(failure&&sql.includes(failure)){failure='';throw Error('INJECTED_WRITE_FAILURE');}
    if(pg){const r=await pg.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v!==null&&r.fields?.some(f=>f.name===k&&[20,1700].includes(f.dataTypeID))?Number(v):v]))),rowCount:r.affectedRows??r.rows.length};}
    const stmt=sqlite.prepare(sql);stmt.setReadBigInts(true);
    if(stmt.columns().length){const rows=stmt.all(...values).map(convert);return {rows,rowCount:rows.length};}
    const result=stmt.run(...values);return {rows:[],rowCount:Number(result.changes)};
  };
  const exec=sql=>pg?pg.exec(sql):sqlite.exec(sql);
  if(pg)await exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$");
  const DB=pg?new __postgresCompatTest.PostgresD1Database({async query(q){const sql=q.text||q,r=await query(sql,q.values||[]);if(lostCommit&&sql==='COMMIT'){lostCommit=false;throw Error('LOST_COMMIT_RESPONSE');}return r;}}):{
    prepare(source){return {source,values:[],bind(...values){this.values=values;return this;},async first(){return (await query(source,this.values)).rows[0]||null;},async all(){const r=await query(source,this.values);return {results:r.rows,meta:{changes:r.rowCount}};},async run(){const r=await query(source,this.values);return {results:r.rows,meta:{changes:r.rowCount}};}};},
    async batch(list){sqlite.exec('BEGIN');let committed=false;try{const results=[];for(const stmt of list)results.push(await stmt.run());sqlite.exec('COMMIT');committed=true;if(lostCommit){lostCommit=false;throw Error('LOST_COMMIT_RESPONSE');}return results;}catch(e){if(!committed)sqlite.exec('ROLLBACK');throw e;}}
  };
  await exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT NOT NULL,card_shards BIGINT DEFAULT 0,magic_crystals BIGINT DEFAULT 0);
    INSERT INTO users(id,nickname,role,status,coin) VALUES(1,'fixture','USER','ACTIVE',100000000000000001);
    CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT);
    CREATE TABLE joint_atomic_guards_v1(token TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1));
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
  const p=(sql,...values)=>DB.prepare(sql).bind(...values);
  return {env:{DB},DB,pg,exec,p,one:(sql,...v)=>p(sql,...v).first(),run:(sql,...v)=>p(sql,...v).run(),
    exact:async()=>String((await p('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=1').first()).coin),
    fail:pattern=>{failure=pattern;},loseCommit:()=>{lostCommit=true;}};
}
