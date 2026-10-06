import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleSuperstarPackDraw,superstarPackSettings,__superstarPackTest} from '../functions/_superstar_pack.js';
import {invalidateRuntimeData} from '../functions/_runtime_data_cache.js';

// PostgreSQL WASM, not SQLite or SQL-string mocks. In particular, it enforces
// int4 range/type inference and executes the real compatibility adapter.
async function fixture({coin=5000000000,price=300000000,hit=false}={}){
  const pg=new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT);
    CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active INTEGER);
    INSERT INTO members VALUES(1,'QA',1);
    CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,image_url TEXT,focus_x INTEGER,focus_y INTEGER,power_type TEXT,base_power BIGINT,member_id BIGINT,is_active INTEGER,card_status TEXT);
    INSERT INTO cards VALUES('S1','QA','SUPERSTAR','qa.png',50,50,'FIXED',15500,1,1,'PUBLIC');
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
    CREATE TABLE draw_logs(draw_group_id TEXT,user_id BIGINT,pack_id TEXT,card_id TEXT,rarity TEXT,coin_used BIGINT,is_new INTEGER,created_at TEXT DEFAULT sqlite_now());
    CREATE INDEX idx_draw_logs_user ON draw_logs(user_id,created_at);
    CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
    CREATE TABLE shard_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,card_id TEXT);
    CREATE TABLE administration_treasury_v2030(id INTEGER PRIMARY KEY,balance BIGINT DEFAULT 0,total_collected BIGINT DEFAULT 0,total_disbursed BIGINT DEFAULT 0,total_refunded BIGINT DEFAULT 0,tax_bps INTEGER DEFAULT 100,reserve_bps INTEGER DEFAULT 2000,version BIGINT DEFAULT 0,updated_at TEXT);
    INSERT INTO administration_treasury_v2030(id) VALUES(1);
    CREATE TABLE administration_tax_receipts_v2030(source_type TEXT,source_request_id TEXT,user_id BIGINT,gross_coin BIGINT,tax_coin BIGINT,status TEXT,label TEXT,updated_at TEXT,PRIMARY KEY(source_type,source_request_id));
    CREATE TABLE administration_treasury_ledger_v2030(reference_key TEXT PRIMARY KEY,entry_type TEXT,amount BIGINT,balance_after BIGINT,user_id BIGINT,source_type TEXT,source_request_id TEXT,memo TEXT);
    CREATE TABLE superstar_pack_receipts_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',outcome TEXT,card_id TEXT,cost INTEGER NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,created_at TEXT DEFAULT sqlite_now(),updated_at TEXT DEFAULT sqlite_now());
    CREATE TABLE superstar_pack_debits_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,cost INTEGER NOT NULL,created_at TEXT DEFAULT sqlite_now());
  `);
  await pg.query("INSERT INTO users VALUES(1,'QA','USER','ACTIVE',$1,100)",[coin]);
  await pg.query("INSERT INTO app_meta VALUES('superstar_pack_settings_v1',$1,NULL),('superstar_pack_public_release_v2047','1',NULL)",[JSON.stringify({drawEnabled:true,price,successRate:hit?100:0})]);
  const errors=[],queries=[];let failReceipt=false;
  const client={async query(input){
    const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    queries.push({sql,values});
    if(failReceipt&&sql.includes("UPDATE superstar_pack_receipts_v1 SET status='COMPLETED'"))throw new Error('QA receipt failure');
    try{
      const result=await pg.query(sql,values);
      const rows=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?Number(value):value])));
      return {...result,rows,rowCount:result.affectedRows??rows.length};
    }catch(error){errors.push({sql,message:error.message,code:error.code});throw error;}
  }};
  const DB=new __postgresCompatTest.PostgresD1Database(client),env={DB};
  const deps={authenticate:async()=>({id:1,nickname:'QA',role:'USER'}),readBody:request=>request.json(),json:(body,status=200)=>({body,status}),randomUnit:()=>hit?0:.99};
  const call=(count=10,id=crypto.randomUUID())=>handleSuperstarPackDraw({env,deps,request:new Request('https://qa.test/api/superstar-pack/draw',{method:'POST',headers:{origin:'https://qa.test','content-type':'application/json','x-cnine-draw-client':'qa_client_1234567890123456'},body:JSON.stringify({count,requestId:id,expectedCost:price*count})})});
  const row=async sql=>(await pg.query(sql)).rows[0];
  return {pg,env,call,row,errors,queries,failReceipt(){failReceipt=true;},close:()=>pg.close()};
}

test('real PostgreSQL reproduces the screenshot for a legacy int4 cost column',async()=>{
  const f=await fixture();
  try{
    await assert.rejects(f.pg.query("INSERT INTO superstar_pack_debits_v1(request_id,user_id,cost) VALUES('repro',1,$1)",[3000000000]),error=>error.code==='22003'&&error.message.includes('3000000000'));
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM superstar_pack_debits_v1')).n),0);
  }finally{await f.close();}
});

for(const options of [{coin:5000000000,price:300000000,hit:false},{coin:5000000000,price:300000000,hit:true},{coin:25000000000,price:2000000000,hit:false}]){
  test(`PostgreSQL upgrades existing money fields then settles ${options.price*10} exactly once (hit=${options.hit})`,async()=>{
    const f=await fixture(options),id=crypto.randomUUID(),cost=options.price*10;
    try{
      const result=await f.call(10,id);assert.equal(result.status,200,JSON.stringify({result,errors:f.errors}));
      assert.equal(result.body.cost,cost);assert.equal(result.body.results.length,10);
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),options.coin-cost);
      assert.equal(Number((await f.row('SELECT change_amount FROM coin_logs')).change_amount),-cost);
      assert.equal(Number((await f.row('SELECT balance_after FROM coin_logs')).balance_after),options.coin-cost);
      assert.equal(Number((await f.row('SELECT balance FROM administration_treasury_v2030')).balance),0);
      if(options.hit){assert.equal(Number((await f.row('SELECT quantity FROM user_cards')).quantity),10);assert.equal(Number((await f.row('SELECT card_shards FROM users WHERE id=1')).card_shards),5500);}
      const columns=(await f.pg.query("SELECT table_name,data_type FROM information_schema.columns WHERE table_name IN ('superstar_pack_receipts_v1','superstar_pack_debits_v1') AND column_name='cost'")).rows;
      assert.equal(columns.length,2);assert(columns.every(column=>column.data_type==='bigint'));
      assert.deepEqual(await f.call(10,id),result);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);
      assert.equal(Number((await f.row('SELECT COUNT(*) n FROM superstar_pack_atomic_guard_v2047')).n),0);
    }finally{await f.close();}
  });
}

test('PostgreSQL insufficient 10-pack balance and post-debit receipt failure leave no charge or grants',async()=>{
  for(const fault of ['insufficient','receipt']){
    const coin=fault==='insufficient'?2999999999:5000000000,f=await fixture({coin,hit:true});
    try{
      if(fault==='receipt')f.failReceipt();
      const result=await f.call();assert.equal(result.status,fault==='insufficient'?400:409,JSON.stringify(f.errors));
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),coin);
      for(const table of ['coin_logs','user_cards','draw_logs','superstar_pack_debits_v1'])assert.equal(Number((await f.row('SELECT COUNT(*) n FROM '+table)).n),0,table);
      assert.equal((await f.row('SELECT status FROM superstar_pack_receipts_v1')).status,'FAILED');
    }finally{await f.close();}
  }
});

test('PostgreSQL partial unique conflict expires an abandoned request and charges its replacement once',async()=>{
  const f=await fixture();
  try{
    await superstarPackSettings(f.env,true);
    await f.pg.query("INSERT INTO superstar_pack_receipts_v1(request_id,user_id,status,updated_at) VALUES('abandoned-old-id',1,'PENDING','2000-01-01 00:00:00')");
    const id=crypto.randomUUID(),result=await f.call(1,id);
    assert.equal(result.status,200,JSON.stringify({result,errors:f.errors}));
    assert.equal((await f.row("SELECT status FROM superstar_pack_receipts_v1 WHERE request_id='abandoned-old-id'")).status,'FAILED');
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),4700000000);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM superstar_pack_debits_v1')).n),1);
    assert.deepEqual(await f.call(1,id),result);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test('PostgreSQL partial unique conflict preserves a live request without charging or granting',async()=>{
  const f=await fixture({hit:true});
  try{
    await superstarPackSettings(f.env,true);
    await f.pg.query("INSERT INTO superstar_pack_receipts_v1(request_id,user_id,status) VALUES('still-active-id',1,'PENDING')");
    const result=await f.call(1);
    assert.equal(result.status,409,JSON.stringify({result,errors:f.errors}));
    assert.equal(result.body.code,'SUPERSTAR_DRAW_PENDING');
    assert.equal((await f.row("SELECT status FROM superstar_pack_receipts_v1 WHERE request_id='still-active-id'")).status,'PENDING');
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),5000000000);
    for(const table of ['coin_logs','user_cards','draw_logs','superstar_pack_debits_v1'])assert.equal(Number((await f.row('SELECT COUNT(*) n FROM '+table)).n),0,table);
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test('installed PostgreSQL schema stays read-only across cold/expired Workers without repeating DDL',async()=>{
  const f=await fixture();
  try{
    await superstarPackSettings(f.env,true);
    f.env.DB.execSchema=async()=>{throw Error('An installed foundation must not acquire DDL locks');};
    for(let cold=0;cold<3;cold++){
      invalidateRuntimeData(f.env,'superstar:foundation:v2048-bigint');
      f.queries.length=0;
      await __superstarPackTest.ensureSuperstarPackFoundation(f.env);
      assert.equal(f.queries.length,1,'one catalog read per cold check');
      assert.match(f.queries[0].sql,/^SELECT CASE WHEN/);
      await __superstarPackTest.ensureSuperstarPackFoundation(f.env);
      assert.equal(f.queries.length,1,'completed readiness is reused');
    }
    assert.equal((await f.call(10)).status,200,'actual opening still works without any schema write');
  }finally{await f.close();}
});

test('missing PostgreSQL pending-user index is restored before accepting an opening',async()=>{
  const f=await fixture();
  try{
    await superstarPackSettings(f.env,true);
    await f.pg.exec('DROP INDEX idx_superstar_pack_one_pending_per_user');
    invalidateRuntimeData(f.env,'superstar:foundation:v2048-bigint');
    await __superstarPackTest.ensureSuperstarPackFoundation(f.env);
    const index=await f.row("SELECT indisvalid,indisunique FROM pg_index WHERE indexrelid=to_regclass('idx_superstar_pack_one_pending_per_user')");
    assert.equal(index.indisvalid,true);assert.equal(index.indisunique,true);
    assert.equal((await f.call(10)).status,200);
  }finally{await f.close();}
});

test('atomic draw-log verification uses the existing timestamp index despite a large user history',async()=>{
  const f=await fixture({hit:true});
  try{
    await f.pg.exec(`INSERT INTO draw_logs(draw_group_id,user_id,created_at)
      SELECT 'history-'||n,1,'2020-01-01 00:00:00' FROM generate_series(1,20000) n;
      ANALYZE draw_logs;`);
    const id=crypto.randomUUID(),result=await f.call(10,id);
    assert.equal(result.status,200,JSON.stringify(f.errors));
    const logs=(await f.pg.query('SELECT created_at FROM draw_logs WHERE draw_group_id=$1 AND user_id=1',[id])).rows;
    assert.equal(logs.length,10);assert.equal(new Set(logs.map(row=>row.created_at)).size,1);
    const guard=f.queries.find(row=>row.sql.includes('SELECT COUNT(*) FROM draw_logs'));
    assert.match(guard.sql,/draw_group_id=\$\d+ AND user_id=\$\d+ AND created_at=\$\d+/);
    assert.ok(guard.values.includes(logs[0].created_at),'guard uses the exact inserted UTC timestamp');
    const plan=(await f.pg.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT COUNT(*) FROM draw_logs
      WHERE draw_group_id=$1 AND user_id=$2 AND created_at=$3`,[id,1,logs[0].created_at])).rows[0]['QUERY PLAN'][0].Plan;
    const scans=[];const walk=node=>{if(node['Index Name'])scans.push(node);for(const child of node.Plans||[])walk(child);};walk(plan);
    assert.ok(scans.some(node=>node['Index Name']==='idx_draw_logs_user'&&node['Index Cond'].includes('created_at')));
    assert.ok(scans.every(node=>node['Actual Rows']<=10),'history is excluded by the index');
    assert.equal(plan['Actual Rows'],1);
    const replay=await f.call(10,id);assert.equal(replay.status,200);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM draw_logs')).n),20010);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM superstar_pack_debits_v1')).n),1);
  }finally{await f.close();}
});
