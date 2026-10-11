import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,TARGETS,CAPACITY,PLAN_HASH,PACK_KEY,POLICY_KEY,grantThreeLimitedCards,verifyThreeLimitedGrants} from '../scripts/ops/ss-limited-three-users-20261011.mjs';
const lease=()=>({lockDeadline:Date.now()+120000,approvedPlanHash:PLAN_HASH});
async function fixture(t){
 const raw=new PGlite();t.after(()=>raw.close());
 await raw.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',9,8,7),(4694,'북부대공','USER','ACTIVE',123,45,67);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-990',12,8,13,'old-bongsoon'),('V-994',10,5,11,'old-diim'),('V-996',8,2,6,'other-issue');
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer CHECK(total_copies>=1),duplicate_count integer CHECK(duplicate_count=total_copies-1),first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_cards_v1 VALUES(233,'V-991',2,1,'original','original'),(4693,'V-996',1,0,'original','original');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-b-'||n,'old-b-'||n,900+n,'V-990',n,'original' FROM generate_series(1,8) n;
 INSERT INTO mercenary_limited_issues_v1 SELECT 'old-d-'||n,'old-d-'||n,900+n,'V-994',n,'original' FROM generate_series(1,5) n;
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate integer,total_copies_after integer,duplicate_count_after integer,created_at text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(233,'MASTER_STAR',999),(4693,'MASTER_STAR',888),(4774,'MASTER_STAR',777);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(233,'V-991'),(4693,'V-996');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(233,'V-991',5),(4693,'V-996',4);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 for(const t of TARGETS)await raw.query("INSERT INTO users VALUES($1,$2,'USER','ACTIVE',12345,67,89)",[t.id,t.nickname]);
 const pack={revision:9,settings:{mode:'ON',prices:{single:1000000000,ten:10000000000},stockLimits:{'V-990':12,'V-994':10,'V-996':8},normalRankRatesPpm:{SS:123.0001},extraRewards:[{id:'NONE',chancePpm:42}]},updatedBy:1,updatedAt:'original',lastRequestId:'previous'};
 for(const [key,value]of [[PACK_KEY,pack],[POLICY_KEY,{revision:3,policy:{cardWeights:{'V-990':1,'V-994':1,'V-996':2},rankRatesPpm:{SS:0.0001,SSS:0.0002}}}],['unrelated-setting',{enabled:false}]])await raw.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),'original']);
 const db={query:(sql,args)=>sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:'2026-10-11'}]}):raw.query(sql,args)};
 const snapshot=async()=>{const state={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','admin_logs'])state[table]=(await raw.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {raw,db,pack,snapshot};
}

test('three exact grants with +2 Bongsoon and +1 Diim capacity; dry-run and replay preserve state',async t=>{
 const {db,pack,snapshot}=await fixture(t),before=await snapshot();
 const dry=await grantThreeLimitedCards(db,{...lease(),dryRun:true});assert.deepEqual(await snapshot(),before);assert.equal(dry.receipt.after['V-990'].limit,14);
 const result=await grantThreeLimitedCards(db,lease());assert.equal(result.replayed,false);
 assert.deepEqual(result.receipt.grants.map(g=>[g.userId,g.code,g.serial,g.copiesBefore,g.copiesAfter]),[[4693,'V-990',9,0,1],[4774,'V-994',6,0,1],[233,'V-990',10,0,1]]);
 for(const [code,cap]of Object.entries(CAPACITY)){assert.equal(result.current[code].limit,cap.before+cap.add);assert.equal(result.current[code].remaining,result.receipt.before[code].remaining);}
 const after=await snapshot();
 assert.equal(after.user_mercenary_cards_v1.filter(c=>Number(c.user_id)===4694).length,0,'Corrected-away recipient must not receive a card');
 for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.find(s=>s.code==='V-996'),before.mercenary_limited_stock_v1.find(s=>s.code==='V-996'));
 const saved=JSON.parse(after.app_meta.find(r=>r.key===PACK_KEY).value),expected=structuredClone(pack.settings);expected.stockLimits['V-990']=14;expected.stockLimits['V-994']=11;assert.deepEqual(saved.settings,expected);assert.equal(saved.revision,10);
 assert.equal((await grantThreeLimitedCards(db,lease())).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal((await verifyThreeLimitedGrants(db)).status,'VERIFIED');
});
test('existing recipient holdings gain one duplicate with original acquisition and other cards preserved',async t=>{
 const {raw,db}=await fixture(t);await raw.exec("INSERT INTO user_mercenary_cards_v1 VALUES(4693,'V-990',2,1,'first-ever','previous');UPDATE mercenary_limited_issues_v1 SET user_id=4693 WHERE code='V-990' AND serial IN (1,2)");
 const result=await grantThreeLimitedCards(db,lease());assert.equal(result.holdings.find(r=>r.userId===4693).copies,3);assert.equal(result.holdings.find(r=>r.userId===4693).duplicates,2);
 assert.equal((await raw.query("SELECT first_obtained_at FROM user_mercenary_cards_v1 WHERE user_id=4693 AND mercenary_code='V-990'")).rows[0].first_obtained_at,'first-ever');
});
test('each of 18 writes rolls back all three grants, both caps, serials and audit entries on failure',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let failAt=1;failAt<=18;failAt++){
  let writes=0;const fault={query:(sql,args)=>{if(/^(UPDATE|INSERT)/.test(sql)&&++writes===failAt)throw Error('Injected write failure '+failAt);return db.query(sql,args);}};
  await assert.rejects(grantThreeLimitedCards(fault,lease()),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 assert.equal((await grantThreeLimitedCards(db,lease())).receipt.grants.length,3);
});
test('lost commit response replays exactly once without additional stock or acquisitions',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(grantThreeLimitedCards(fault,lease()),/Lost commit response/);const committed=await snapshot();
 assert.equal((await grantThreeLimitedCards(db,lease())).replayed,true);assert.deepEqual(await snapshot(),committed);assert.equal(committed.app_meta.filter(r=>r.key===OPERATION_KEY).length,1);
});
test('wrong identity, cap conflict, broken ledger and invalid lease cannot grant',async t=>{
 const {raw,db,snapshot}=await fixture(t);await assert.rejects(grantThreeLimitedCards(db,{...lease(),lockDeadline:Date.now()}),/leases required/);
 await assert.rejects(grantThreeLimitedCards(db,{...lease(),approvedPlanHash:'changed'}),/Inspected operation required/);
 const scenarios=[
  ["UPDATE users SET nickname='다른 계정' WHERE id=233","UPDATE users SET nickname='ShowMaker' WHERE id=233"],
  ["UPDATE users SET status='BANNED' WHERE id=4774","UPDATE users SET status='ACTIVE' WHERE id=4774"],
  ["UPDATE mercenary_limited_stock_v1 SET stock_limit=13 WHERE code='V-990'","UPDATE mercenary_limited_stock_v1 SET stock_limit=12 WHERE code='V-990'"],
  ["UPDATE mercenary_limited_issues_v1 SET serial=99 WHERE code='V-994' AND serial=5","UPDATE mercenary_limited_issues_v1 SET serial=5 WHERE code='V-994' AND serial=99"]
 ];
 for(const [mutate,restore]of scenarios){await raw.exec(mutate);const before=await snapshot();await assert.rejects(grantThreeLimitedCards(db,lease()));assert.deepEqual(await snapshot(),before);await raw.exec(restore);}
});
