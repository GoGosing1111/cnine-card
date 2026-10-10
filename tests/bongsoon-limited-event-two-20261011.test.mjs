import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,CODE,PACK_KEY,POLICY_KEY,grantBongsoonEventTwo,verifyBongsoonEventGrant} from '../scripts/ops/bongsoon-limited-event-two-20261011.mjs';

const lease=()=>({lockDeadline:Date.now()+120000});
async function fixture(t){
 const raw=new PGlite();t.after(()=>raw.close());
 await raw.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',9,8,7),(218,'현하루','USER','ACTIVE',123,45,67),(4582,'족단','USER','ACTIVE',890,12,34);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-990',10,6,12,'previous-issue'),('V-996',8,2,6,'other-issue');
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer CHECK(total_copies>=1),duplicate_count integer CHECK(duplicate_count=total_copies-1),first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_cards_v1 VALUES(218,'V-991',2,1,'original','original'),(4582,'V-996',1,0,'original','original');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-'||n,'old-'||n,900+n,'V-990',n,'original' FROM generate_series(1,6) n;
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(218,'MASTER_STAR',999),(4582,'MASTER_STAR',888);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(218,'V-991'),(4582,'V-996');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(218,'V-991',5),(4582,'V-996',4);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 const pack={revision:8,settings:{mode:'ON',prices:{single:1000000000,ten:10000000000},stockLimits:{'V-990':10,'V-996':8},normalRankRatesPpm:{SS:123.0001},extraRewards:[{id:'NONE',chancePpm:42}]},updatedBy:1,updatedAt:'original',lastRequestId:'previous'};
 for(const [key,value]of [[PACK_KEY,pack],[POLICY_KEY,{revision:3,policy:{cardWeights:{'V-990':1,'V-996':2},rankRatesPpm:{SS:0.0001,SSS:0.0002}}}],['unrelated-setting',{enabled:false}]])await raw.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),'original']);
 const db={query:(sql,args)=>sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:'2026-10-11'}]}):raw.query(sql,args)};
 const snapshot=async()=>{const state={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','admin_logs'])state[table]=(await raw.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {raw,db,pack,snapshot};
}

test('two first acquisitions and exactly +2 capacity commit together; dry run/replay do not change data',async t=>{
 const {db,pack,snapshot}=await fixture(t),before=await snapshot();
 const dry=await grantBongsoonEventTwo(db,{...lease(),dryRun:true});assert.equal(dry.receipt.after.limit,12);assert.deepEqual(await snapshot(),before);
 const result=await grantBongsoonEventTwo(db,lease());assert.equal(result.replayed,false);assert.equal(result.receipt.after.issued,8);assert.equal(result.receipt.after.remaining,4);
 assert.deepEqual(result.receipt.grants.map(g=>[g.userId,g.serial,g.copiesBefore,g.copiesAfter]),[[218,7,0,1],[4582,8,0,1]]);
 const after=await snapshot();
 for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.find(s=>s.code==='V-996'),before.mercenary_limited_stock_v1.find(s=>s.code==='V-996'));
 const saved=JSON.parse(after.app_meta.find(r=>r.key===PACK_KEY).value),expected=structuredClone(pack.settings);expected.stockLimits[CODE]=12;assert.deepEqual(saved.settings,expected);assert.equal(saved.revision,9);
 assert.equal((await grantBongsoonEventTwo(db,lease())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verifyBongsoonEventGrant(db)).status,'VERIFIED');
});

test('existing holdings gain one duplicate and keep first acquisition/growth/loadout',async t=>{
 const {raw,db}=await fixture(t);
 await raw.exec("INSERT INTO user_mercenary_cards_v1 VALUES(218,'V-990',2,1,'first-ever','previous');UPDATE mercenary_limited_issues_v1 SET user_id=218 WHERE serial IN (1,2)");
 const result=await grantBongsoonEventTwo(db,lease());assert.deepEqual(result.holdings.find(r=>r.userId===218),{userId:218,copies:3,duplicates:2});
 assert.equal((await raw.query("SELECT first_obtained_at FROM user_mercenary_cards_v1 WHERE user_id=218 AND mercenary_code='V-990'")).rows[0].first_obtained_at,'first-ever');
});

test('failure at each of twelve writes rolls back capacity, both grants, serials and audits',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let failAt=1;failAt<=12;failAt++){
  let writes=0;const fault={query:(sql,args)=>{if(/^(UPDATE|INSERT)/.test(sql)&&++writes===failAt)throw Error('Injected write failure '+failAt);return db.query(sql,args);}};
  await assert.rejects(grantBongsoonEventTwo(fault,lease()),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 assert.equal((await grantBongsoonEventTwo(db,lease())).receipt.grants.length,2);
});

test('lost commit response is recovered once from the receipt',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(grantBongsoonEventTwo(fault,lease()),/Lost commit response/);const committed=await snapshot();
 assert.equal((await grantBongsoonEventTwo(db,lease())).replayed,true);assert.deepEqual(await snapshot(),committed);
 assert.equal(committed.app_meta.filter(r=>r.key===OPERATION_KEY).length,1);
});

test('wrong identities, mismatched cap, corrupt ledger or expired locks cannot grant',async t=>{
 const {raw,db,snapshot}=await fixture(t);
 await assert.rejects(grantBongsoonEventTwo(db,{lockDeadline:Date.now()}),/leases required/);
 const scenarios=[
  ["UPDATE users SET nickname='다른 계정' WHERE id=218","UPDATE users SET nickname='현하루' WHERE id=218"],
  ["UPDATE users SET status='BANNED' WHERE id=4582","UPDATE users SET status='ACTIVE' WHERE id=4582"],
  ["UPDATE mercenary_limited_stock_v1 SET stock_limit=11 WHERE code='V-990'","UPDATE mercenary_limited_stock_v1 SET stock_limit=10 WHERE code='V-990'"],
  ["UPDATE mercenary_limited_issues_v1 SET serial=99 WHERE serial=6","UPDATE mercenary_limited_issues_v1 SET serial=6 WHERE serial=99"]
 ];
 for(const [mutate,restore]of scenarios){await raw.exec(mutate);const before=await snapshot();await assert.rejects(grantBongsoonEventTwo(db,lease()));assert.deepEqual(await snapshot(),before);await raw.exec(restore);}
 assert.equal((await grantBongsoonEventTwo(db,lease())).status,'VERIFIED');
});
