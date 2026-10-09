import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,ORIGINAL_GRANT,PACK_KEY,inspectValterStock,restoreValterOwnerStock,verifyValterStockRestore} from '../scripts/ops/valter-owner-stock-restore-20261010.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',123),(81,'비쥬얼깡패','USER','ACTIVE',456);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-996',7,2,5,'second-grant'),('V-990',7,3,4,'other-grant');
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer,duplicate_count integer,first_obtained_at text,last_obtained_at text);
 INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-996',1,0,'original','original'),(81,'V-996',1,0,'second','second');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 const pack={revision:4,settings:{mode:'OFF',prices:{single:1000000000,ten:10000000000},stockLimits:{'V-996':7,'V-990':7},extraRewards:[{chancePpm:400000}]},updatedAt:'keep-history',updatedBy:1,lastRequestId:'old'};
 const grant={status:'COMPLETED',grant:{userId:1,code:'V-996',quantity:1,serial:1}};
 for(const [key,value]of [[PACK_KEY,pack],[ORIGINAL_GRANT,grant],['pingdu_chicken_event_v1',{settings:{enabled:true}}]])await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),'original']);
 await db.query("INSERT INTO mercenary_limited_issues_v1 VALUES($1,1,'V-996',1,'original'),('second-grant',81,'V-996',2,'second')",[ORIGINAL_GRANT]);
 const snapshot=async()=>{const result={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','admin_logs'])result[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return result;};
 return {db,pack,snapshot};
}

test('dry-run rolls back; apply restores one capacity without cards/serial changes and retries do not add more',async t=>{
 const {db,pack,snapshot}=await fixture(t),before=await snapshot();
 const dry=await restoreValterOwnerStock(db,{dryRun:true});assert.equal(dry.receipt.after.remaining,6);assert.deepEqual(await snapshot(),before);
 const applied=await restoreValterOwnerStock(db);assert.equal(applied.replayed,false);assert.equal(applied.stock.stock_limit,8);assert.equal(applied.stock.issued,2);assert.equal(applied.packMode,'OFF');
 const state=await inspectValterStock(db),expected=structuredClone(pack.settings);expected.stockLimits['V-996']=8;assert.deepEqual(state.pack.settings,expected);
 const after=await snapshot();for(const table of ['users','user_mercenary_cards_v1','mercenary_limited_issues_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.find(r=>r.code==='V-990'),before.mercenary_limited_stock_v1.find(r=>r.code==='V-990'));
 assert.equal((await restoreValterOwnerStock(db)).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verifyValterStockRestore(db)).status,'VERIFIED');
});

test('failures at each write roll back both limit stores, audit and receipt; retry succeeds once',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(const prefix of ['UPDATE app_meta','UPDATE mercenary_limited_stock_v1','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const fault={query:async(sql,args)=>{if(sql.startsWith(prefix))throw Error('injected write failure');return db.query(sql,args);}};
  await assert.rejects(restoreValterOwnerStock(fault),/injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 assert.equal((await restoreValterOwnerStock(db)).receipt.restoredCapacity,1);
});

test('lost commit response is recovered by the receipt without a second increment',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('lost acknowledgement');}return result;}};
 await assert.rejects(restoreValterOwnerStock(fault),/lost acknowledgement/);const before=await snapshot();
 assert.equal((await restoreValterOwnerStock(db)).replayed,true);assert.deepEqual(await snapshot(),before);
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].n,1);
});

test('changed target, stock/CMS mismatch or missing original grant cannot restore capacity',async t=>{
 const {db,snapshot}=await fixture(t);
 for(const mutate of ["UPDATE users SET nickname='다른 계정' WHERE id=1","UPDATE mercenary_limited_stock_v1 SET stock_limit=8 WHERE code='V-996'","DELETE FROM app_meta WHERE key='"+ORIGINAL_GRANT+"'"]){
  const original=await snapshot();await db.exec(mutate);const mutated=await snapshot();await assert.rejects(restoreValterOwnerStock(db));assert.deepEqual(await snapshot(),mutated);
  await db.exec("UPDATE users SET nickname='핑크빛유두' WHERE id=1;UPDATE mercenary_limited_stock_v1 SET stock_limit=7 WHERE code='V-996'");
  if(!mutated.app_meta.some(r=>r.key===ORIGINAL_GRANT)){const row=original.app_meta.find(r=>r.key===ORIGINAL_GRANT);await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[row.key,row.value,row.updated_at]);}
 }
});
