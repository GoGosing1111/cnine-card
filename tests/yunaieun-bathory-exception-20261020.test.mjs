import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {OPERATION_KEY,PLAN_HASH,grantBathory as grant,verifyGrant as verify} from '../scripts/ops/yunaieun-bathory-exception-20261020.mjs';
const token='a'.repeat(64),options=()=>({approvedPlanHash:PLAN_HASH,leaseToken:token,lockDeadline:Date.now()+120000,dryRun:false});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE',0,0,0),(236,'유나이은','USER','ACTIVE',123,45,6);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 INSERT INTO app_meta VALUES('mercenary_halloween_ss_pack_v1','{"revision":16,"settings":{"mode":"ON","stockLimits":{"V-977":10}}}','original'),('mercenary_limited_draw_policy_v1','{}','original'),('mercenary_limited_pack_v1','{}','original'),('ranked_series_roster_v1:236','{"order":["V-055"]}','original'),('mercenary_halloween_daily_v1:236:2026-10-20','{"purchased":15}','original');
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text);
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-977',10,10,10,'original');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-'||s,'old-'||s,220,'V-977',s,'original' FROM generate_series(1,10) s;
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(236,'MASTER_STAR',99);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(236,'V-055');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(236,'V-055',6);
 CREATE TABLE user_mercenary_levels_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_levels_v1 VALUES(236,'V-055',6);
 CREATE TABLE user_mutation_locks_v1520(user_id bigint,token text,action_path text,lease_until_ms bigint);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.query('INSERT INTO user_mutation_locks_v1520 VALUES(236,$1,$2,$3)',[token,OPERATION_KEY,Date.now()+120000]);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(236,'V-055',3,2,'original','original')");
 const snapshot=async()=>{const data={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','mercenary_limited_issues_v1','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','user_mercenary_levels_v1','admin_logs'])data[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return data;};
 return {db,snapshot};
}
test('one exception succeeds at zero stock, preserves the exhausted pool and replays without writes',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 await grant(db,{...options(),dryRun:true});assert.deepEqual(await snapshot(),before);
 const applied=await grant(db,options());assert.equal(applied.currentCopies,1);assert.deepEqual(applied.stock,{limit:10,issued:10,remaining:0});
 const after=await snapshot();
 for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','user_mercenary_levels_v1','mercenary_limited_stock_v1','mercenary_limited_issues_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.app_meta.filter(r=>r.key!==OPERATION_KEY),before.app_meta);
 assert.deepEqual(after.user_mercenary_cards_v1.filter(r=>r.mercenary_code!=='V-977'),before.user_mercenary_cards_v1);
 const noWrites={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)\b/.test(sql));return db.query(sql,args);}};
 assert.equal((await grant(noWrites,options())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verify(db)).missing,0);
});
test('failure at each of the four writes rolls back ownership, acquisition, audit and receipt',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let step=1;step<=4;step++){let n=0;const fault={query:(sql,args)=>{if(/^(INSERT|UPDATE|DELETE)\b/.test(sql)&&++n===step)throw Error('Injected failure');return db.query(sql,args);}};
  await assert.rejects(grant(fault,options()),/Injected failure/);assert.deepEqual(await snapshot(),before);
 }
});
test('wrong identity, missing lease and wrong plan reject; a prior holding gains only one duplicate',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 await assert.rejects(grant(db,{...options(),leaseToken:'b'.repeat(64)}));
 await assert.rejects(grant(db,{...options(),approvedPlanHash:'wrong'}));
 assert.deepEqual(await snapshot(),before);
 await db.exec("UPDATE users SET nickname='다른계정' WHERE id=236");
 const wrong=await snapshot();await assert.rejects(grant(db,options()));assert.deepEqual(await snapshot(),wrong);
 await db.exec("UPDATE users SET nickname='유나이은' WHERE id=236; INSERT INTO user_mercenary_cards_v1 VALUES(236,'V-977',2,1,'original','original')");
 const result=await grant(db,options());assert.equal(result.currentCopies,3);
 const card=(await db.query("SELECT * FROM user_mercenary_cards_v1 WHERE user_id=236 AND mercenary_code='V-977'")).rows[0];
 assert.equal(Number(card.duplicate_count),2);assert.equal(card.first_obtained_at,'original');
 assert.deepEqual(result.stock,{limit:10,issued:10,remaining:0});
});
