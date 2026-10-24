import {PGlite} from '@electric-sql/pglite';
import {Client} from 'pg';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {ultimateBulkDependencies} from '../../functions/api/[[path]].js';
import {createUltimateBulkService} from '../../functions/_ultimate_pack_bulk.js';
import {ultimateBulkRequestId} from '../../shared/ultimate-pack-bulk-v1.mjs';
export const schema=[
 'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT NOT NULL,card_shards BIGINT NOT NULL DEFAULT 0)',
 "CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active BIGINT DEFAULT 1)",
 "CREATE TABLE cards(id TEXT PRIMARY KEY,member_id BIGINT,title TEXT,rarity TEXT,image_url TEXT DEFAULT '',focus_x BIGINT DEFAULT 50,focus_y BIGINT DEFAULT 50,is_active BIGINT DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC',draw_weight DOUBLE PRECISION DEFAULT 1,limited_total BIGINT,issued_count BIGINT DEFAULT 0)",
 'CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards',
 "CREATE TABLE card_packs(id TEXT PRIMARY KEY,price BIGINT,is_active BIGINT DEFAULT 1,allowed_rarities TEXT,guarantee_10 TEXT,guarantee_20 TEXT,pickup_member_id BIGINT,pickup_multiplier DOUBLE PRECISION DEFAULT 1)",
 'CREATE TABLE card_pack_rates(pack_id TEXT,rarity TEXT,rate DOUBLE PRECISION)',
 'CREATE TABLE card_pack_cards(pack_id TEXT,card_id TEXT,PRIMARY KEY(pack_id,card_id))',
 "CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT NOT NULL,breakthrough_level BIGINT DEFAULT 0,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id))",
 "CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT DEFAULT 0,unseen_quantity BIGINT DEFAULT 0,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))",
 "CREATE TABLE draw_request_receipts_v2(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,pack_id TEXT NOT NULL,draw_count BIGINT NOT NULL,status TEXT NOT NULL,cost BIGINT,response_json TEXT,error_message TEXT,created_at TEXT DEFAULT '',updated_at TEXT DEFAULT '')",
 'CREATE TABLE draw_active_lock_v1480(user_id BIGINT PRIMARY KEY,request_id TEXT,lease_until_ms BIGINT)',
 'CREATE TABLE joint_atomic_guards_v1(token TEXT PRIMARY KEY,verified BIGINT NOT NULL CHECK(verified=1))',
 'CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
 'CREATE TABLE shard_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,card_id TEXT)',
 'CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
 'CREATE TABLE draw_logs(id BIGSERIAL PRIMARY KEY,draw_group_id TEXT,user_id BIGINT,pack_id TEXT,card_id TEXT,rarity TEXT,coin_used BIGINT,is_new BIGINT)',
 'CREATE TABLE limited_acquisition_audit(event_key TEXT PRIMARY KEY,request_id TEXT,draw_group_id TEXT,source_type TEXT,source_id TEXT,user_id BIGINT,user_nickname TEXT,card_id TEXT,card_title TEXT,pack_id TEXT,status TEXT,coin_cost BIGINT,stock_before BIGINT,stock_after BIGINT,quantity_before BIGINT,quantity_after BIGINT,is_duplicate BIGINT,stock_reserved BIGINT,card_granted BIGINT,admin_id BIGINT,admin_reason TEXT,evidence_note TEXT,error_message TEXT,created_at TEXT,updated_at TEXT)'
];
export const tables=schema.filter(s=>s.startsWith('CREATE TABLE')).map(s=>s.match(/CREATE TABLE (\w+)/)[1]);
export async function seedUltimate(DB,{limitedRate=1,stock=10,normalTypes=300}={}){
 const p=(s,...v)=>DB.prepare(s).bind(...v);
 await p('INSERT INTO users(id,coin) VALUES(1,100000000000000),(2,100000000000000)').run();
 await p("INSERT INTO members(id,name) VALUES(1,'검수')").run();
 await p("INSERT INTO card_packs(id,price,allowed_rarities,guarantee_10) VALUES('ultimate',10000000,?,'UR')",JSON.stringify(['C','U','R','SR','HR','UR','SSR','MA','FUR'])).run();
 for(const [grade,rate]of [['C',20],['U',20],['R',20],['SR',15],['HR',10],['UR',10],['SSR',3],['MA',1.9],['FUR',.1],['LIMITED',limitedRate]])await p("INSERT INTO card_pack_rates VALUES('ultimate',?,?)",grade,rate).run();
 const grades=['C','U','R','SR','HR','UR','SSR','MA','FUR'];
 for(let offset=0;offset<normalTypes;offset+=25){const n=Math.min(25,normalTypes-offset);await p('INSERT INTO cards(id,member_id,title,rarity) VALUES '+Array.from({length:n},()=>'(?,1,?,?)').join(','),...Array.from({length:n},(_,i)=>[String(offset+i),'검수 '+(offset+i),grades[(offset+i)%grades.length]]).flat()).run();}
 await p("INSERT INTO cards(id,member_id,title,rarity,limited_total) VALUES('limited-a',1,'검수 리미티드','LIMITED',?)",stock).run();
}
export function ultimateService(){const deps=ultimateBulkDependencies();return createUltimateBulkService({...deps,loadContext:deps.queryContext,criticalSettings:async()=>({enabled:true,chance:20,bonus:30})});}
export function body(count=100000){return {requestId:ultimateBulkRequestId(),count,expectedCost:count*10000000};}
export async function ultimateFixture(t,options={}){
 const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;"+schema.join(';'));
 await pg.exec(readFileSync(new URL('../../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8').match(/CREATE OR REPLACE FUNCTION sqlite_json_each[\s\S]*?\$\$;/)[0]);
 let DB,afterCommitFailure=false,failSql='',beforeBatch=null;const stats={wire:0,statements:0};
 const client={escapeLiteral:v=>Client.prototype.escapeLiteral.call(null,v),async query(input){stats.wire++;const text=typeof input==='string'?input:input.text;
  if(failSql&&text.includes(failSql)){failSql='';throw Error('INJECTED_BATCH_FAILURE');}
  if(typeof input==='string'){const rows=(await pg.exec(text)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return rows.length===1?rows[0]:rows;}
  const r=await pg.query(input.text,input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 __postgresCompatTest.clearPostgresCatalogCache();DB=new __postgresCompatTest.PostgresD1Database(client);await seedUltimate(DB,options);
 const batch=DB.batch.bind(DB);DB.batch=async list=>{stats.statements+=list.length;if(list.some(s=>String(s.source||'').includes('FOR UPDATE'))&&beforeBatch){const fn=beforeBatch;beforeBatch=null;await fn();}const result=await batch(list);if(afterCommitFailure&&list.some(s=>String(s.source||'').includes('FOR UPDATE'))){afterCommitFailure=false;throw Error('LOST_COMMIT_ACK');}return result;};
 return {pg,DB,env:{DB},service:ultimateService(),user:{id:1,nickname:'검수'},stats,p:(s,...v)=>DB.prepare(s).bind(...v),fail:value=>{failSql=value;},loseAck:()=>{afterCommitFailure=true;},beforeCommit:fn=>{beforeBatch=fn;}};
}
