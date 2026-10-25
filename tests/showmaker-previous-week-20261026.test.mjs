import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PLAN,OP,PLAN_HASH,CAMPAIGN,complete,inspect,verify} from '../scripts/ops/showmaker-previous-week-20261026.mjs';
const now=Date.parse('2026-10-25T18:00:00Z'),options={expectedPlanHash:PLAN_HASH,dryRun:false,now};
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint);
 CREATE TABLE user_second_verifications(user_id bigint,provider text,provider_user_id text,provider_name text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE quest_weekly_posts_v1(user_id bigint,week_key text,provider_user_id text,board_slugs_json text,post_count bigint,days_json text,checked_at text,PRIMARY KEY(user_id,week_key));
 CREATE TABLE quest_weekly_claims_v1(user_id bigint,week_key text,quest_id text,claim_token text UNIQUE,status text CHECK(status IN ('PENDING','COMPLETED')),progress bigint,reward_type text,reward_amount bigint,message_id bigint,created_at text DEFAULT CURRENT_TIMESTAMP::text,PRIMARY KEY(user_id,week_key,quest_id));
 CREATE TABLE user_messages(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id bigint,sender_type text,title text,body text,message_type text,campaign_key text,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,message_id bigint,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint,user_id bigint,reward_type text,reward_amount bigint,credited_at text);
 CREATE TABLE admin_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 INSERT INTO users VALUES(1,'OWNER','OWNER','ACTIVE',0),(233,'ShowMaker','USER','ACTIVE',1234567),(234,'Other','USER','ACTIVE',7654321);
 INSERT INTO user_second_verifications VALUES(233,'PLAYDK','25958d94','ShowMaker');
 INSERT INTO quest_weekly_claims_v1(user_id,week_key,quest_id,claim_token,status,progress,reward_type,reward_amount) VALUES
 (233,'2026-10-19','CORE_RAID','other-quest','COMPLETED',4,'MASTER_STAR',300000),
 (233,'2026-10-26','POST','current-week','COMPLETED',301,'COIN',1000000000000);`);
 const settings={revision:5,quests:{POST:{enabled:true,rewardType:'COIN',rewardAmount:1000000000000},CORE_RAID:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:300000},TERRITORY:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:150000},CLAN:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:500000}}};
 await q(db,'INSERT INTO app_meta VALUES($1,$2,$3)',['quest_weekly_settings_v20260924',JSON.stringify(settings),'unchanged']);
 await q(db,'INSERT INTO app_meta VALUES($1,$2,$3)',['playdk_daily_quest_settings_v1',JSON.stringify({boardSlugs:['skm'],enabled:true}),'unchanged']);
 await q(db,'INSERT INTO quest_weekly_posts_v1 VALUES($1,$2,$3,$4,$5,$6,$7)',[233,PLAN.weekKey,PLAN.providerUserId,'["skm"]',252,JSON.stringify([42,23,25,20,25,9,108].map((count,i)=>({date:`2026-10-${19+i}`,count}))),PLAN.sourceCheckedAt]);
 await q(db,'INSERT INTO quest_weekly_posts_v1 VALUES($1,$2,$3,$4,$5,$6,$7)',[233,'2026-10-26',PLAN.providerUserId,'["skm"]',301,'[]','2026-10-26T01:00:00Z']);
 return db;
}
async function all(db){const result={};for(const table of ['users','user_second_verifications','app_meta','quest_weekly_posts_v1','quest_weekly_claims_v1','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','admin_logs'])result[table]=await q(db,`SELECT * FROM ${table} ORDER BY 1,2`);return result;}

test('last-week POST exception issues one normal inbox reward while preserving measured posts, wallets, this week and other quests',async t=>{
 const db=await fixture(t),before=await inspect(db),users=await q(db,'SELECT * FROM users ORDER BY id');
 const result=await complete(db,options),after=await inspect(db);
 assert.equal(result.committed,true);assert.equal(result.verification.status,'COMPLETED');assert.equal(result.verification.observedPosts,252);
 assert.equal(result.verification.rewardAmount,'1000000000000');assert.equal(result.verification.rewardCollected,false);
 assert.deepEqual(after.posts,before.posts);assert.deepEqual(after.settings,before.settings);assert.deepEqual(await q(db,'SELECT * FROM users ORDER BY id'),users);
 assert.deepEqual(after.claims.filter(c=>!(c.week_key===PLAN.weekKey&&c.quest_id==='POST')),before.claims);
 assert.equal((await q(db,'SELECT * FROM user_messages')).length,1);assert.equal((await q(db,'SELECT * FROM user_message_rewards')).length,1);
 assert.equal((await q(db,'SELECT * FROM user_message_reward_claim_receipts_v1222')).length,0);
 assert.equal((await verify(db)).verified,true);
});

test('dry run and failure after message creation both restore all transactional rows',async t=>{
 const db=await fixture(t),before=await all(db);
 const dry=await complete(db,{...options,dryRun:true});assert.equal(dry.rollbackVerified,true);assert.equal(dry.committed,false);assert.deepEqual(await all(db),before);
 const faulty={query:(sql,args)=>{if(sql.startsWith('INSERT INTO app_meta')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}};
 await assert.rejects(complete(faulty,options),/INJECTED_RECEIPT_FAILURE/);assert.deepEqual(await all(db),before);
});

test('replay is SELECT-only and never reissues a reward already collected through the normal inbox',async t=>{
 const db=await fixture(t),first=await complete(db,options),r=first.receipt;
 await q(db,"UPDATE user_message_rewards SET claimed_at='2026-10-26T04:00:00Z' WHERE id=$1",[r.rewardId]);
 await q(db,"INSERT INTO user_message_reward_claim_receipts_v1222 VALUES($1,$2,233,'COIN',1000000000000,'2026-10-26T04:00:00Z')",[r.rewardId,r.messageId]);
 await q(db,'UPDATE users SET coin=coin+1000000000000 WHERE id=233');
 const before=await all(db);let queries=0;
 const readOnly={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);assert(!/FOR UPDATE|FOR SHARE|nextval|pg_advisory/.test(sql));queries++;return db.query(sql,args);}};
 const replay=await complete(readOnly,{...options,now:now+30*86400000});assert.equal(replay.replayed,true);assert.equal(replay.verification.rewardCollected,true);assert(queries>0);assert.deepEqual(await all(db),before);
});

test('wrong date, changed identity or changed source evidence block the operation without writes',async t=>{
 const db=await fixture(t);let before=await all(db);
 await assert.rejects(complete(db,{...options,now:now-86400000}),/authorized operation date/);assert.deepEqual(await all(db),before);
 await q(db,"UPDATE user_second_verifications SET provider_user_id='different' WHERE user_id=233");before=await all(db);
 await assert.rejects(complete(db,options));assert.deepEqual(await all(db),before);
 await q(db,"UPDATE user_second_verifications SET provider_user_id='25958d94' WHERE user_id=233");
 await q(db,"UPDATE quest_weekly_posts_v1 SET post_count=253 WHERE user_id=233 AND week_key='2026-10-19'");before=await all(db);
 await assert.rejects(complete(db,options));assert.deepEqual(await all(db),before);
});

test('existing original weekly claim or an orphan reward campaign cannot be overwritten or duplicated',async t=>{
 const db=await fixture(t);
 await q(db,"INSERT INTO quest_weekly_claims_v1(user_id,week_key,quest_id,claim_token,status,progress,reward_type,reward_amount) VALUES(233,'2026-10-19','POST','already','COMPLETED',300,'COIN',1000000000000)");
 let before=await all(db);await assert.rejects(complete(db,options),/Existing weekly receipt/);assert.deepEqual(await all(db),before);
 await q(db,"DELETE FROM quest_weekly_claims_v1 WHERE claim_token='already'");
 await q(db,"INSERT INTO user_messages(user_id,campaign_key) VALUES(233,$1)",[CAMPAIGN]);before=await all(db);
 await assert.rejects(complete(db,options),/Existing weekly reward/);assert.deepEqual(await all(db),before);
});
