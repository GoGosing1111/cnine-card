import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,TARGETS,CAPACITY,PLAN_HASH,PACK_KEY,POLICY_KEY,grantLimitedCards,verifyLimitedGrants} from '../scripts/ops/bini-bongsoon-limited-grants-20261013.mjs';
const lease=()=>({lockDeadline:Date.now()+120000,approvedPlanHash:PLAN_HASH});
async function fixture(t){
 const raw=new PGlite();t.after(()=>raw.close());
 await raw.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',9,8,7),(4595,'비니','USER','ACTIVE',123,45,67);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-990',14,11,18,'old-bongsoon'),('V-996',10,6,16,'old-valter'),('V-994',12,5,11,'other-issue');
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer CHECK(total_copies>=1),duplicate_count integer CHECK(duplicate_count=total_copies-1),first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_cards_v1 VALUES(5426,'V-990',1,0,'original','original'),(5504,'V-991',2,1,'original','original');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-b-'||n,'old-b-'||n,900+n,'V-990',n,'original' FROM generate_series(1,11) n;
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-v-'||n,'old-v-'||n,900+n,'V-996',n,'original' FROM generate_series(1,6) n;
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(5426,'MASTER_STAR',999),(5504,'MASTER_STAR',888);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(5426,'V-990'),(5504,'V-991');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(5426,'V-990',5),(5504,'V-991',4);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 for(const target of TARGETS)await raw.query("INSERT INTO users VALUES($1,$2,'USER','ACTIVE',12345,67,89)",[target.id,target.nickname]);
 const pack={revision:16,settings:{mode:'ON',prices:{single:1000000000,ten:10000000000},stockLimits:{'V-990':14,'V-996':10,'V-994':12},normalRankRatesPpm:{SS:123.0001},extraRewards:[{id:'NONE',chancePpm:42}]},updatedBy:1,updatedAt:'original',lastRequestId:'previous'};
 for(const [key,value]of [[PACK_KEY,pack],[POLICY_KEY,{revision:3,policy:{cardWeights:{'V-990':1,'V-996':2},rankRatesPpm:{SS:0.0001,SSS:0.0002}}}],['unrelated-setting',{enabled:false}],['mercenary_limited_daily_v1:5426:2026-10-13',37],['mercenary_limited_daily_v1:5504:2026-10-13',50]])await raw.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),'original']);
 const db={query:(sql,args)=>sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:'2026-10-13'}]}):raw.query(sql,args)};
 const snapshot=async()=>{const state={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','admin_logs'])state[table]=(await raw.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {raw,db,pack,snapshot};
}

test('two exact grants preserve remaining stock and daily usage; rollback and replay make no extra grants',async t=>{
 const {db,pack,snapshot}=await fixture(t),before=await snapshot();
 const dry=await grantLimitedCards(db,{...lease(),dryRun:true});assert.deepEqual(await snapshot(),before);assert.equal(dry.dryRun,true);
 const result=await grantLimitedCards(db,lease());assert.equal(result.replayed,false);
 assert.deepEqual(result.receipt.grants.map(g=>[g.userId,g.code,g.rank,g.serial,g.copiesBefore,g.copiesAfter]),[[5504,'V-990','SS',12,0,1],[5426,'V-996','SSS',7,0,1]]);
 for(const [code,cap]of Object.entries(CAPACITY)){assert.equal(result.current[code].limit,cap.before+cap.add);assert.equal(result.current[code].remaining,result.receipt.before[code].remaining);}
 const after=await snapshot();
 assert.equal(after.user_mercenary_cards_v1.filter(c=>Number(c.user_id)===4595).length,0,'Similar nickname must not receive a card');
 for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.find(s=>s.code==='V-994'),before.mercenary_limited_stock_v1.find(s=>s.code==='V-994'));
 assert.deepEqual(after.app_meta.filter(r=>r.key!==PACK_KEY&&r.key!==OPERATION_KEY),before.app_meta.filter(r=>r.key!==PACK_KEY));
 const saved=JSON.parse(after.app_meta.find(r=>r.key===PACK_KEY).value),expected=structuredClone(pack.settings);expected.stockLimits['V-990']=15;expected.stockLimits['V-996']=11;assert.deepEqual(saved.settings,expected);assert.equal(saved.revision,17);
 const noWrites={query:(sql,args)=>{assert(!/^(UPDATE|INSERT|DELETE)/.test(sql),'Replay must be read-only');return db.query(sql,args);}};
 assert.equal((await grantLimitedCards(noWrites,lease())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verifyLimitedGrants(db)).missing,0);
});

test('existing copies gain one duplicate without resetting acquisition time or growth',async t=>{
 const {raw,db}=await fixture(t);await raw.exec("INSERT INTO user_mercenary_cards_v1 VALUES(5504,'V-990',2,1,'first-ever','previous')");
 const result=await grantLimitedCards(db,lease());assert.equal(result.holdings.find(r=>r.userId===5504).copies,3);assert.equal(result.holdings.find(r=>r.userId===5504).duplicates,2);
 assert.equal((await raw.query("SELECT first_obtained_at FROM user_mercenary_cards_v1 WHERE user_id=5504 AND mercenary_code='V-990'")).rows[0].first_obtained_at,'first-ever');
});

test('each of 14 write failures rolls back both cards, capacities, serials, audits and receipt',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let failAt=1;failAt<=14;failAt++){
  let writes=0;const fault={query:(sql,args)=>{if(/^(UPDATE|INSERT)/.test(sql)&&++writes===failAt)throw Error('Injected write failure '+failAt);return db.query(sql,args);}};
  await assert.rejects(grantLimitedCards(fault,lease()),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 assert.equal((await grantLimitedCards(db,lease())).receipt.grants.length,2);
});

test('lost commit response resolves to one existing receipt with no duplicate grant',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(grantLimitedCards(fault,lease()),/Lost commit response/);const committed=await snapshot();
 assert.equal((await grantLimitedCards(db,lease())).replayed,true);assert.deepEqual(await snapshot(),committed);assert.equal(committed.app_meta.filter(r=>r.key===OPERATION_KEY).length,1);
});

test('changed identity, account status, capacity, ledger, plan or lease blocks the operation',async t=>{
 const {raw,db,snapshot}=await fixture(t);await assert.rejects(grantLimitedCards(db,{...lease(),lockDeadline:Date.now()}),/leases required/);
 await assert.rejects(grantLimitedCards(db,{...lease(),approvedPlanHash:'changed'}),/Inspected operation required/);
 const scenarios=[
  ["UPDATE users SET nickname='다른 계정' WHERE id=5504","UPDATE users SET nickname='비_니' WHERE id=5504"],
  ["UPDATE users SET status='BANNED' WHERE id=5426","UPDATE users SET status='ACTIVE' WHERE id=5426"],
  ["UPDATE mercenary_limited_stock_v1 SET stock_limit=15 WHERE code='V-990'","UPDATE mercenary_limited_stock_v1 SET stock_limit=14 WHERE code='V-990'"],
  ["UPDATE mercenary_limited_issues_v1 SET serial=99 WHERE code='V-996' AND serial=5","UPDATE mercenary_limited_issues_v1 SET serial=5 WHERE code='V-996' AND serial=99"]
 ];
 for(const [mutate,restore]of scenarios){await raw.exec(mutate);const before=await snapshot();await assert.rejects(grantLimitedCards(db,lease()));assert.deepEqual(await snapshot(),before);await raw.exec(restore);}
});
