import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {OPERATION_KEY,PLAN_HASH,grantSeraBathory as grant,verifySeraBathoryGrant as verify} from '../scripts/ops/sera-bathory-grant-20261019.mjs';
const token='a'.repeat(64),options=()=>({approvedPlanHash:PLAN_HASH,leaseToken:token,lockDeadline:Date.now()+120000,dryRun:false});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE',0,0,0),(45,'박세라-ㅂ-','USER','ACTIVE',123,45,6);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 INSERT INTO app_meta VALUES('mercenary_halloween_ss_pack_v1','{"revision":15,"settings":{"mode":"ON","stockLimits":{"V-977":10}}}','original'),('mercenary_limited_draw_policy_v1','{}','original'),('mercenary_limited_pack_v1','{}','original'),('ranked_series_roster_v1:45','{"order":["V-055"]}','original');
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text);
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-977',10,1,1,'original');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 VALUES('old','old',220,'V-977',1,'original');
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(45,'MASTER_STAR',99);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(45,'V-055');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(45,'V-055',6);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_levels_v1 VALUES(45,'V-055',6);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(45,$1,$2,$3)',[token,OPERATION_KEY,Date.now()+120000]);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(45,'V-055',3,2,'original','original')");
 const snapshot=async()=>{const data={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','mercenary_limited_issues_v1','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','user_mercenary_levels_v1','admin_logs'])data[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return data;};
 return {db,snapshot};
}
test('grant consumes one existing stock, preserves other cards/settings, rolls back dry-run and replays without writes',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 await grant(db,{...options(),dryRun:true});assert.deepEqual(await snapshot(),before);
 const applied=await grant(db,options());assert.equal(applied.currentCopies,1);assert.deepEqual(applied.stock,{limit:10,issued:2,remaining:8});
 const after=await snapshot();for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','user_mercenary_levels_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.app_meta.filter(r=>r.key!==OPERATION_KEY),before.app_meta);
 assert.deepEqual(after.user_mercenary_cards_v1.filter(r=>r.mercenary_code!=='V-977'),before.user_mercenary_cards_v1);
 const noWrites={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)\b/.test(sql));return db.query(sql,args);}};
 assert.equal((await grant(noWrites,options())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verify(db)).missing,0);
});
test('failure at each write rolls back both ownership and issued stock',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let step=1;step<=6;step++){let n=0;const fault={query:(sql,args)=>{if(/^(INSERT|UPDATE|DELETE)\b/.test(sql)&&++n===step)throw Error('Injected failure');return db.query(sql,args);}};
  await assert.rejects(grant(fault,options()),/Injected failure/);assert.deepEqual(await snapshot(),before);
 }
});
test('sold out stock, wrong identity and missing account lease reject without granting',async t=>{
 const {db,snapshot}=await fixture(t);
 await assert.rejects(grant(db,{...options(),leaseToken:'b'.repeat(64)}));
 await db.exec("UPDATE users SET nickname='다른계정' WHERE id=45");const wrong=await snapshot();await assert.rejects(grant(db,options()));assert.deepEqual(await snapshot(),wrong);
 await db.exec("UPDATE users SET nickname='박세라-ㅂ-' WHERE id=45; UPDATE mercenary_limited_stock_v1 SET issued=10; INSERT INTO mercenary_limited_issues_v1 SELECT 'old-'||s,'old-'||s,220,'V-977',s,'original' FROM generate_series(2,10) s");
 const soldOut=await snapshot();await assert.rejects(grant(db,options()),/No remaining authorized stock/);assert.deepEqual(await snapshot(),soldOut);
});
