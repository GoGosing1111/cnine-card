import {PGlite} from '@electric-sql/pglite';
import {Client} from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handleSuperstarPackDraw,superstarPackSettings} from '../../functions/_superstar_pack.js';
import {superstarBulkRequestId} from '../../shared/superstar-pack-bulk-v1.mjs';
export const superstarSchema=[
 'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
 "CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT,card_shards BIGINT DEFAULT 0)",
 'CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active INTEGER DEFAULT 1)',
 "CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT DEFAULT 'SUPERSTAR',image_url TEXT DEFAULT sqlite_now(),focus_x INTEGER DEFAULT 50,focus_y INTEGER DEFAULT 50,power_type TEXT DEFAULT 'FIXED',base_power BIGINT DEFAULT 15500,member_id BIGINT DEFAULT 1,is_active INTEGER DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC')",
 'CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards',
 'CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id))',
 'CREATE TABLE draw_logs(draw_group_id TEXT,user_id BIGINT,pack_id TEXT,card_id TEXT,rarity TEXT,coin_used BIGINT,is_new INTEGER,created_at TEXT)',
 'CREATE INDEX idx_draw_logs_user ON draw_logs(user_id,created_at)',
 'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
 'CREATE TABLE shard_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,card_id TEXT)',
 "CREATE TABLE superstar_pack_receipts_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',outcome TEXT,card_id TEXT,cost BIGINT NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,created_at TEXT DEFAULT sqlite_now(),updated_at TEXT DEFAULT sqlite_now())",
 "CREATE TABLE superstar_pack_debits_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,cost BIGINT NOT NULL,created_at TEXT DEFAULT sqlite_now())",
 'CREATE INDEX idx_superstar_pack_receipts_user ON superstar_pack_receipts_v1(user_id,created_at DESC)',
 "CREATE UNIQUE INDEX idx_superstar_pack_one_pending_per_user ON superstar_pack_receipts_v1(user_id) WHERE status='PENDING'",
 'CREATE INDEX idx_superstar_pack_debits_user ON superstar_pack_debits_v1(user_id,created_at DESC)',
 'CREATE TABLE superstar_pack_atomic_guard_v2047(id TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1))'
];
export async function superstarFixture(t,{price=300000000,coin=100000000000000,successRate=10,types=40,enabled=true,randomUnit}={}){
 const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;"+superstarSchema.join(';'));
 const queries=[];
 const client={escapeLiteral:v=>Client.prototype.escapeLiteral.call(null,v),async query(input){const sql=typeof input==='string'?input:input.text;queries.push(sql);
  if(typeof input==='string'){const rows=(await pg.exec(sql)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return rows.length===1?rows[0]:rows;}
  const r=await pg.query(sql,input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 __postgresCompatTest.clearPostgresCatalogCache();const DB=new __postgresCompatTest.PostgresD1Database(client),env={DB},p=(s,...v)=>DB.prepare(s).bind(...v);
 await p("INSERT INTO app_meta VALUES('superstar_pack_settings_v1',?,NULL),('superstar_pack_public_release_v2047','1',NULL)",JSON.stringify({price,successRate,drawEnabled:enabled})).run();
 await p("INSERT INTO users(id,nickname,coin) VALUES(1,'검수',?),(2,'검수2',?)",coin,coin).run();await p("INSERT INTO members(id,name) VALUES(1,'검수')").run();
 for(let i=0;i<types;i++)await p('INSERT INTO cards(id,title) VALUES(?,?)','S'+String(i).padStart(3,'0'),'검수 '+i).run();
 await superstarPackSettings(env,true);
 let currentId=1,before=null,after=null,lost=false;const batches=[],batch=DB.batch.bind(DB);
 DB.batch=async list=>{const payment=list.some(s=>s.source.includes('FOR UPDATE'));if(payment){batches.push(list);if(before){const fn=before;before=null;await fn();}}const result=await batch(list);if(payment&&after){const fn=after;after=null;await fn();}if(payment&&lost){lost=false;throw Error('LOST_COMMIT_ACK');}return result;};
 const deps={authenticate:async()=>({id:currentId,nickname:'검수',role:'USER'}),readBody:r=>r.json(),json:(body,status=200)=>({body,status}),...(randomUnit?{randomUnit}:{})};
 const call=(count=10000,requestId=superstarBulkRequestId(),extra={})=>handleSuperstarPackDraw({env,deps,request:new Request('https://game.test/api/superstar-pack/draw',{method:'POST',headers:{origin:'https://game.test','content-type':'application/json','x-cnine-draw-client':'qa_client_1234567890123456'},body:JSON.stringify({count,requestId,expectedCost:price*count,...extra})})});
 return {pg,DB,env,p,deps,call,queries,batches,setUser:id=>currentId=id,beforeCommit:fn=>before=fn,afterCommit:fn=>after=fn,loseAck:()=>lost=true};
}
