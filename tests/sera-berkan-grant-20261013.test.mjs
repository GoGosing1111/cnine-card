import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {OPERATION_KEY,PLAN_HASH,grantSeraBerkan,verifySeraBerkan} from '../scripts/ops/sera-berkan-grant-20261013.mjs';

const options=()=>({lockDeadline:Date.now()+120000,approvedPlanHash:PLAN_HASH});
async function fixture(t){
 const raw=new PGlite();t.after(()=>raw.close());
 await raw.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE',9,8,7),(45,'박세라-ㅂ-','USER','ACTIVE',123,45,67),(46,'다른 계정','USER','ACTIVE',7,8,9);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 INSERT INTO app_meta VALUES('mercenary_limited_pack_v1','{"revision":16,"settings":{"stockLimits":{"V-996":10}}}','original');
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text);
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-996',10,6,16,'previous');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 VALUES('old-issue','old-request',46,'V-996',1,'original');
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(45,'MASTER_STAR',999);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(45,'V-021');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(45,'V-021',5);
 CREATE TABLE mercenary_cms_documents_v1(doc_key text PRIMARY KEY,payload_json text,revision int);
 INSERT INTO mercenary_cms_documents_v1 VALUES('config','{"mercenaries":[{"code":"V-055","name":"베르칸","rank":"SSS"}]}',61);
 CREATE TABLE mercenary_draw_config_v1(id int PRIMARY KEY,payload_json text,revision int);
 INSERT INTO mercenary_draw_config_v1 VALUES(1,'{"cardRules":{"cardWeights":{"V-055":10}}}',30);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await raw.exec(sql);
 await raw.exec("INSERT INTO user_mercenary_cards_v1 VALUES(45,'V-021',2,1,'original','original'),(46,'V-055',1,0,'other','other')");
 const db={query:(sql,args)=>sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:'2026-10-13'}]}):raw.query(sql,args)};
 const snapshot=async()=>{const state={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_draw_config_v1','admin_logs'])state[table]=(await raw.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {raw,db,snapshot};
}

test('one SSS Berkan commits with no costs or limited changes; dry-run and replay preserve state',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 const dry=await grantSeraBerkan(db,{...options(),dryRun:true});assert.equal(dry.dryRun,true);assert.deepEqual(await snapshot(),before);
 const result=await grantSeraBerkan(db,options());assert.deepEqual(result.holdings,[{code:'V-055',copies:1}]);
 assert.deepEqual(result.receipt.grants.map(g=>[g.userId,g.code,g.copiesBefore,g.copiesAfter]),[[45,'V-055',0,1]]);
 const after=await snapshot();
 for(const table of ['users','mercenary_limited_stock_v1','mercenary_limited_issues_v1','mercenary_card_atomic_guard_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_draw_config_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.app_meta.filter(r=>r.key!==OPERATION_KEY),before.app_meta);
 const noWrites={query:(sql,args)=>{assert(!/^(?:WITH\b.*)?\b(UPDATE|INSERT|DELETE)/.test(sql),'Replay must not mutate');return db.query(sql,args);}};
 assert.equal((await grantSeraBerkan(noWrites,options())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verifySeraBerkan(db)).missing,0);
});

test('existing copies increase without resetting first acquisition, equipment or growth',async t=>{
 const {raw,db}=await fixture(t);
 await raw.exec("INSERT INTO user_mercenary_cards_v1 VALUES(45,'V-055',2,1,'first-berkan','previous'); INSERT INTO user_mercenary_growth_v1 VALUES(45,'V-055',8)");
 const result=await grantSeraBerkan(db,options());assert.deepEqual(result.holdings,[{code:'V-055',copies:3}]);
 assert.equal((await raw.query("SELECT first_obtained_at FROM user_mercenary_cards_v1 WHERE user_id=45 AND mercenary_code='V-055'")).rows[0].first_obtained_at,'first-berkan');
 assert.equal((await raw.query("SELECT level FROM user_mercenary_growth_v1 WHERE user_id=45 AND mercenary_code='V-055'")).rows[0].level,8);
});

test('failure at each acquisition/audit/receipt write rolls back all changes',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let failAt=1;failAt<=7;failAt++){
  let writes=0;const fault={query:(sql,args)=>{if(/\b(INSERT|UPDATE|DELETE)\b/.test(sql)&&++writes===failAt)throw Error('Injected write failure');return db.query(sql,args);}};
  await assert.rejects(grantSeraBerkan(fault,options()),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 assert.equal((await grantSeraBerkan(db,options())).receipt.grants.length,1);
});

test('lost commit response resolves to one receipt without granting twice',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(grantSeraBerkan(fault,options()),/Lost commit response/);const committed=await snapshot();
 assert.equal((await grantSeraBerkan(db,options())).replayed,true);assert.deepEqual(await snapshot(),committed);
 assert.equal(committed.app_meta.filter(r=>r.key===OPERATION_KEY).length,1);
});

test('wrong identity, CMS card, OFF policy, plan and expired lease prevent grants',async t=>{
 const {raw,db,snapshot}=await fixture(t);
 await assert.rejects(grantSeraBerkan(db,{...options(),lockDeadline:Date.now()}),/lease required/);
 await assert.rejects(grantSeraBerkan(db,{...options(),approvedPlanHash:'wrong'}),/Reviewed plan/);
 const scenarios=[
  ["UPDATE users SET nickname='다른이름' WHERE id=45","UPDATE users SET nickname='박세라-ㅂ-' WHERE id=45"],
  ["UPDATE mercenary_cms_documents_v1 SET payload_json=replace(payload_json,'베르칸','다른용병')","UPDATE mercenary_cms_documents_v1 SET payload_json=replace(payload_json,'다른용병','베르칸')"],
  ["UPDATE mercenary_draw_config_v1 SET payload_json=replace(payload_json,':10',':0')","UPDATE mercenary_draw_config_v1 SET payload_json=replace(payload_json,':0',':10')"]
 ];
 for(const [mutate,restore]of scenarios){await raw.exec(mutate);const before=await snapshot();await assert.rejects(grantSeraBerkan(db,options()));assert.deepEqual(await snapshot(),before);await raw.exec(restore);}
});
