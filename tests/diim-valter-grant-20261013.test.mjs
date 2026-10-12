import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,PLAN_HASH,PACK_KEY,POLICY_KEY,grantDiimValter,verifyDiimValter} from '../scripts/ops/diim-valter-grant-20261013.mjs';

const options=()=>({lockDeadline:Date.now()+120000,approvedPlanHash:PLAN_HASH});
async function fixture(t){
 const raw=new PGlite();t.after(()=>raw.close());
 await raw.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',9,8,7),(4773,'진짜디임','USER','ACTIVE',123,45,67);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-996',8,4,14,'previous'),('V-990',12,9,11,'other');
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer CHECK(total_copies>=1),duplicate_count integer CHECK(duplicate_count=total_copies-1),first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_cards_v1 VALUES(4773,'V-021',2,1,'original','original');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-'||n,'old-'||n,900+n,'V-996',n,'original' FROM generate_series(1,4) n;
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(4773,'MASTER_STAR',999);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(4773,'V-021');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(4773,'V-021',5);
 CREATE TABLE mercenary_cms_documents_v1(doc_key text PRIMARY KEY,payload_json text,revision int);
 INSERT INTO mercenary_cms_documents_v1 VALUES('config','{"mercenaries":[{"code":"V-055","name":"베르칸","rank":"SSS"}]}',61);
 CREATE TABLE mercenary_draw_config_v1(id int PRIMARY KEY,payload_json text,revision int);
 INSERT INTO mercenary_draw_config_v1 VALUES(1,'{"cardRules":{"cardWeights":{"V-055":10}}}',30);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 const pack={revision:12,settings:{mode:'ON',prices:{single:10},stockLimits:{'V-996':8,'V-990':12},extraRewards:[{id:'NONE',chancePpm:42}]},updatedBy:1,updatedAt:'original',lastRequestId:'previous'};
 for(const [key,value]of [[PACK_KEY,pack],[POLICY_KEY,{revision:3,policy:{cardWeights:{'V-996':1},rankRatesPpm:{SS:0.0001}}}],['unrelated-setting',{enabled:false}]])await raw.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),'original']);
 const db={query:(sql,args)=>sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:'2026-10-13'}]}):raw.query(sql,args)};
 const snapshot=async()=>{const state={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_draw_config_v1','admin_logs'])state[table]=(await raw.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {raw,db,pack,snapshot};
}

test('one SSS Valter and +1 limited capacity commit together; rollback and replay preserve state',async t=>{
 const {db,pack,snapshot}=await fixture(t),before=await snapshot();
 const dry=await grantDiimValter(db,{...options(),dryRun:true});assert.equal(dry.dryRun,true);assert.deepEqual(await snapshot(),before);
 const result=await grantDiimValter(db,options());assert.deepEqual(result.receipt.after,{limit:9,issued:5,remaining:4});
 assert.deepEqual(result.receipt.grants.map(g=>[g.code,g.copiesBefore,g.copiesAfter,g.serial??null]),[['V-996',0,1,5]]);
 const after=await snapshot();
 for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_draw_config_v1'])assert.deepEqual(after[table],before[table]);
 const settings=JSON.parse(after.app_meta.find(r=>r.key===PACK_KEY).value),expected=structuredClone(pack.settings);expected.stockLimits['V-996']=9;assert.deepEqual(settings.settings,expected);
 const noWrites={query:(sql,args)=>{assert(!/^(UPDATE|INSERT|DELETE)/.test(sql),'Replay must not mutate');return db.query(sql,args);}};
 assert.equal((await grantDiimValter(noWrites,options())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verifyDiimValter(db)).missing,0);
});

test('existing copies become duplicates without resetting acquisition time or growth',async t=>{
 const {raw,db}=await fixture(t);
 await raw.exec("INSERT INTO user_mercenary_cards_v1 VALUES(4773,'V-996',2,1,'first-diim','previous')");
 const result=await grantDiimValter(db,options());assert.deepEqual(result.holdings,[{code:'V-996',copies:3}]);
 const rows=(await raw.query("SELECT mercenary_code,first_obtained_at FROM user_mercenary_cards_v1 WHERE mercenary_code IN ('V-996') ORDER BY mercenary_code")).rows;
 assert.deepEqual(rows.map(r=>r.first_obtained_at),['first-diim']);
});

test('each write failure rolls back the card, capacity, serial, audit and receipt',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let failAt=1;failAt<=8;failAt++){
  let writes=0;const fault={query:(sql,args)=>{if(/^(UPDATE|INSERT)/.test(sql)&&++writes===failAt)throw Error('Injected write failure');return db.query(sql,args);}};
  await assert.rejects(grantDiimValter(fault,options()),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 assert.equal((await grantDiimValter(db,options())).receipt.grants.length,1);
});

test('lost commit response resolves to the existing receipt without a second grant',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(grantDiimValter(fault,options()),/Lost commit response/);const committed=await snapshot();
 assert.equal((await grantDiimValter(db,options())).replayed,true);assert.deepEqual(await snapshot(),committed);
 assert.equal(committed.app_meta.filter(r=>r.key===OPERATION_KEY).length,1);
});

test('wrong identity, ledger, capacity, plan or lease prevents grants',async t=>{
 const {raw,db,snapshot}=await fixture(t);
 await assert.rejects(grantDiimValter(db,{...options(),lockDeadline:Date.now()}),/lease required/);
 await assert.rejects(grantDiimValter(db,{...options(),approvedPlanHash:'wrong'}),/Reviewed plan/);
 const scenarios=[
  ["UPDATE users SET nickname='다른 계정' WHERE id=4773","UPDATE users SET nickname='진짜디임' WHERE id=4773"],
  ["UPDATE mercenary_limited_stock_v1 SET stock_limit=9 WHERE code='V-996'","UPDATE mercenary_limited_stock_v1 SET stock_limit=8 WHERE code='V-996'"],
  ["UPDATE mercenary_limited_issues_v1 SET serial=99 WHERE serial=4","UPDATE mercenary_limited_issues_v1 SET serial=4 WHERE serial=99"]
 ];
 for(const [mutate,restore]of scenarios){await raw.exec(mutate);const before=await snapshot();await assert.rejects(grantDiimValter(db,options()));assert.deepEqual(await snapshot(),before);await raw.exec(restore);}
});
