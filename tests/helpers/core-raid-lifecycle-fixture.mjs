import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handleRaidCoreProtocol,defaultCoreRaidSettings} from '../../functions/_raid_core_protocol.js';
import {coreTraces} from './core-mechanic-traces.mjs';

export async function coreLifecycleFixture(dialect='sqlite') {
  const db = dialect === 'postgres' ? new PGlite() : new DatabaseSync(':memory:');
  let failSql='',loseCommit=false;
  const schema=`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT DEFAULT 0,card_shards BIGINT DEFAULT 0);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
    INSERT INTO users(id,nickname,role) VALUES(1,'합성 검수 계정','OWNER'),(2,'합성 동료','OWNER');
    INSERT INTO cnine_user_inventory VALUES(1,'CORE_RAID_ENTRY_TICKET',5,0,CURRENT_TIMESTAMP);
  `;
  let DB;
  if(dialect==='postgres') {
    await db.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;`);
    const compat=fs.readFileSync(new URL('../../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8');
    await db.exec(compat.match(/CREATE OR REPLACE FUNCTION sqlite_json_extract[\s\S]*?\$\$;/)[0]);
    await db.exec(schema.replaceAll('CURRENT_TIMESTAMP','sqlite_now()'));
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){
      const sql=typeof input==='string'?input:input.text;
      if(failSql&&sql.includes(failSql))throw Error('Injected transaction failure');
      const result=await db.query(sql,typeof input==='string'?[]:input.values||[]);
      if(loseCommit&&sql==='COMMIT'){loseCommit=false;throw Error('Lost commit response');}
      return {...result,rowCount:result.affectedRows??result.rows.length};
    }});
  } else {
    db.exec(schema);
    class Statement {
      constructor(sql,values=[]){this.sql=sql;this.values=values;}
      bind(...values){return new Statement(this.sql,values);}
      first(){return db.prepare(this.sql).get(...this.values)||null;}
      all(){return {results:db.prepare(this.sql).all(...this.values)};}
      run(){if(failSql&&this.sql.includes(failSql))throw Error('Injected transaction failure');return {meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}
    }
    DB={prepare:sql=>new Statement(sql),batch(statements){
      db.exec('BEGIN');
      try{const result=statements.map(s=>s.run());db.exec('COMMIT');if(loseCommit){loseCommit=false;throw Error('Lost commit response');}return result;}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    }};
  }
  const env={DB},settings={...defaultCoreRaidSettings(),mode:'TEST',coreCombatPower:500000,bossCombatPower:750000};
  const cards=Array.from({length:5},(_,i)=>({id:'QA-'+i,title:'합성 카드 '+i,grade:'SSR',power:100000,power_type:'ATTACK',image:'/test-card.png'}));
  const deps={authenticate:async request=>({id:Number(request.headers.get('x-qa-user')||1),role:'OWNER',nickname:'합성 검수 계정'}),
    readBody:request=>request.json(),json:(body,status=200)=>({body,status}),writeAdminLog:async()=>{},
    raidDeckPower:async()=>({ids:cards.map(c=>c.id),cards,power:500000,cardPower:500000,characterBonus:{pve:0}}),
    createPveBattleV2:input=>({teams:{A:{cards:input.cards},B:{cards:[{id:'B:0',hp:100,maxHp:100}]}},result:{winner:'A',timeline:[]}})};
  const session='original-page-123456789';
  const call=(path,body,opts={})=>handleRaidCoreProtocol({path:path.split('?')[0],env,deps,request:new Request('https://qa.invalid/api/'+path,{
    method:opts.method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json','x-qa-user':String(opts.user||1),'x-core-raid-session':opts.session??session},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  })});
  const row=(sql,...args)=>DB.prepare(sql).bind(...args).first();
  const run=(sql,...args)=>DB.prepare(sql).bind(...args).run();
  await call('raid/core/feature');
  await run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','raid_core_protocol_settings_v2024',JSON.stringify(settings));
  const opened=await call('raid/core/open',{requestId:'QA-ROOM'});
  if(opened.status!==200){await db.close();throw Error(JSON.stringify(opened));}
  const roomId=opened.body.current.id;
  await call('raid/core/join',{roomId},{user:2});
  await call('raid/core/start',{roomId});
  const begin=(extra={},opts={})=>call('raid/core/battle',{roomId,operation:'BREAK',clientMechanicVersion:2086,clientAttemptVersion:1,requestId:'QA-START',...extra},opts);
  const finish=(battle,extra={},opts={})=>call('raid/core/resolve',{roomId,attemptId:battle.attemptId,requestId:'QA-FINISH',results:coreTraces(battle.challenge),...extra},opts);
  return {db,env,deps,call,run,row,roomId,session,begin,finish,settings,
    close:()=>db.close(),fail:sql=>{failSql=sql;},loseCommit:()=>{loseCommit=true;}};
}
