import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,DAY,PLAN_HASH,CONFIG_KEYS,ACQUISITION_ID,applyLimitedResetHelios as apply,verifyLimitedResetHelios as verify} from '../scripts/ops/limited-reset-helios-20261012.mjs';
const options=()=>({approvedPlanHash:PLAN_HASH,lockDeadline:Date.now()+120000});
async function fixture(t){
 const raw=new PGlite();t.after(()=>raw.close());
 await raw.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'핑크빛유두','ACTIVE','OWNER',555,666,777),(65,'음순이','ACTIVE','USER',123,456,789),(73,'란x2','ACTIVE','USER',11,22,33),(74,'미구매','ACTIVE','USER',44,55,66);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 INSERT INTO app_meta VALUES('mercenary_limited_daily_v1:65:2026-10-12','2970','before'),('mercenary_limited_daily_v1:73:2026-10-12','3000','before'),('mercenary_limited_daily_v1:74:2026-10-12','0','original'),('mercenary_limited_daily_v1:65:2026-10-11','2100','older'),('pickup_daily:65:2026-10-12','10','original'),('unrelated','123','original');
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-999',7,0,4,null),('V-995',14,4,8,'old');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies integer CHECK(total_copies>=1),duplicate_count integer CHECK(duplicate_count=total_copies-1),first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_cards_v1 VALUES(65,'V-995',1,0,'first','last');
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate int,total_copies_after int,duplicate_count_after int CHECK(duplicate_count_after=total_copies_after-1),created_at text);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint);INSERT INTO cnine_user_inventory VALUES(65,'MASTER_STAR',99999);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint,mercenary_code text);INSERT INTO user_mercenary_loadout_v1 VALUES(65,'V-995');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(65,'V-995',5);
 CREATE TABLE joint_operations_v1(request_id text PRIMARY KEY,user_id bigint,status text,plan_json text);INSERT INTO joint_operations_v1 VALUES('old-buy',65,'COMPLETED','{"count":2970}');
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 const settings=[{revision:5,policy:{cardWeights:{'V-999':1},rankRatesPpm:{SSS:0.0001}}},{revision:4,settings:{mode:'ON',stockLimits:{'V-999':7,'V-995':14},prices:{single:1000000000},normalRankRatesPpm:{SS:1}}}];
 for(let i=0;i<2;i++)await raw.query('INSERT INTO app_meta VALUES($1,$2,$3)',[CONFIG_KEYS[i],JSON.stringify(settings[i]),'original']);
 const queries=[];
 const db={query:(sql,args)=>{queries.push(sql);return sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:DAY}]}):raw.query(sql,args);}};
 const snapshot=async()=>{const data={};for(const table of ['users','app_meta','mercenary_limited_stock_v1','mercenary_limited_issues_v1','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','joint_operations_v1','admin_logs'])data[table]=(await raw.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return data;};
 return {raw,db,queries,snapshot};
}

test('exact KST day reset and one existing-stock Helios grant; dry run and new-purchase replay',async t=>{
 const {raw,db,queries,snapshot}=await fixture(t),before=await snapshot();
 const dry=await apply(db,{...options(),dryRun:true});assert.equal(dry.dryRun,true);assert.deepEqual(await snapshot(),before);
 queries.length=0;const result=await apply(db,options()),after=await snapshot();
 assert.equal(result.receipt.reset.affectedUsers,2);assert.equal(result.receipt.reset.restoredPurchases,5970);assert.equal(result.currentDayUsed,0);
 assert.deepEqual(result.stock,{limit:7,issued:1,remaining:6,revision:5});assert.deepEqual(result.holding,{userId:65,nickname:'음순이',code:'V-999',copies:1,serial:1});
 for(const table of ['users','cnine_user_inventory','user_mercenary_loadout_v1','user_mercenary_growth_v1','joint_operations_v1'])assert.deepEqual(after[table],before[table]);
 const untouched=rows=>rows.filter(r=>!['mercenary_limited_daily_v1:65:'+DAY,'mercenary_limited_daily_v1:73:'+DAY,OPERATION_KEY].includes(r.key));
 assert.deepEqual(untouched(after.app_meta),untouched(before.app_meta));assert.deepEqual(after.mercenary_limited_stock_v1[0],before.mercenary_limited_stock_v1[0]);
 assert(queries.findIndex(s=>s==='SELECT id FROM users WHERE id=$1 FOR UPDATE')<queries.findIndex(s=>s.includes('ORDER BY key FOR UPDATE')));
 assert(queries.findIndex(s=>s.includes('ORDER BY key FOR UPDATE'))<queries.findIndex(s=>s.startsWith('UPDATE app_meta')));
 await raw.query("UPDATE app_meta SET value='10' WHERE key=$1",['mercenary_limited_daily_v1:65:'+DAY]);
 const boughtAgain=await snapshot();const replay=await apply(db,options());assert.equal(replay.replayed,true);assert.equal(replay.currentDayUsed,10);assert.deepEqual(replay.receipt,result.receipt);assert.deepEqual(await snapshot(),boughtAgain);assert.equal((await verify(db)).status,'VERIFIED');
});
test('all eight write failures roll back quotas, stock, ownership and both audit records',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(let fail=1;fail<=8;fail++){
  let writes=0;const fault={query:(sql,args)=>{if(/^(INSERT|UPDATE)/.test(sql)&&++writes===fail)throw Error('Injected write failure');return db.query(sql,args);}};
  await assert.rejects(apply(fault,options()),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
});
test('lost commit acknowledgement is recovered without another reset or duplicate card',async t=>{
 const {db,snapshot}=await fixture(t);let lost=false;
 const fault={query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT'&&!lost){lost=true;throw Error('Lost commit response');}return result;}};
 await assert.rejects(apply(fault,options()),/Lost commit response/);const beforeReplay=await snapshot();assert.equal((await apply(db,options())).replayed,true);assert.deepEqual(await snapshot(),beforeReplay);
});
test('existing holding retains first acquisition and gains one serialized duplicate',async t=>{
 const {raw,db}=await fixture(t);
 await raw.exec("UPDATE mercenary_limited_stock_v1 SET issued=1 WHERE code='V-999';INSERT INTO mercenary_limited_issues_v1 VALUES('old-helios','old',65,'V-999',1,'original');INSERT INTO user_mercenary_cards_v1 VALUES(65,'V-999',1,0,'first-ever','last')");
 const result=await apply(db,options());assert.equal(result.holding.copies,2);assert.equal(result.holding.serial,2);assert.equal(result.receipt.grant.copiesBefore,1);
 const holding=(await raw.query("SELECT * FROM user_mercenary_cards_v1 WHERE user_id=65 AND mercenary_code='V-999'")).rows[0];assert.equal(holding.duplicate_count,1);assert.equal(holding.first_obtained_at,'first-ever');
 assert.equal((await raw.query('SELECT is_duplicate FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[ACQUISITION_ID])).rows[0].is_duplicate,1);
});
test('identity, day, stock and lease failures cannot partially reset users',async t=>{
 const {raw,db,snapshot}=await fixture(t);
 await assert.rejects(apply(db,{...options(),approvedPlanHash:'wrong'}),/Inspected plan/);await assert.rejects(apply(db,{...options(),lockDeadline:0}),/lease required/);
 const scenarios=[
  ["UPDATE users SET nickname='wrong' WHERE id=65","UPDATE users SET nickname='음순이' WHERE id=65"],
  ["UPDATE mercenary_limited_stock_v1 SET stock_limit=0 WHERE code='V-999'","UPDATE mercenary_limited_stock_v1 SET stock_limit=7 WHERE code='V-999'"],
  ["UPDATE app_meta SET value='3001' WHERE key='mercenary_limited_daily_v1:73:2026-10-12'","UPDATE app_meta SET value='3000' WHERE key='mercenary_limited_daily_v1:73:2026-10-12'"]
 ];
 for(const [mutate,restore]of scenarios){await raw.exec(mutate);const before=await snapshot();await assert.rejects(apply(db,options()));assert.deepEqual(await snapshot(),before);await raw.exec(restore);}
 const before=await snapshot();const tomorrow={query:(sql,args)=>sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP')?Promise.resolve({rows:[{kst:'2026-10-13'}]}):db.query(sql,args)};
 await assert.rejects(apply(tomorrow,options()),/reset day expired/);assert.deepEqual(await snapshot(),before);
});
