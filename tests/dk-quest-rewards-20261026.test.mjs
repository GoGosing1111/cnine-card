import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {configureQuestIncrease,deliverQuestDeltas,verifyQuestIncrease,hash,DAILY_KEY,WEEKLY_KEY,CAMPAIGN_PREFIX} from '../scripts/ops/dk-quest-rewards-20261026.mjs';
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,role text,status text,coin bigint DEFAULT 123);
 INSERT INTO users(id,role,status) SELECT i,CASE WHEN i=1 THEN 'OWNER' ELSE 'USER' END,'ACTIVE' FROM generate_series(1,8) i;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE wago_daily_quest_claims(id bigserial PRIMARY KEY,user_id bigint,quest_date text,reward_coin bigint,post_count bigint,claimed_at text,UNIQUE(user_id,quest_date));
 INSERT INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count,claimed_at) VALUES
 (2,'2026-10-26',100000000000,15,'2026-10-25 15:00:00'),(3,'2026-10-26',100000000000,30,'2026-10-26 00:00:00'),
 (4,'2026-10-26',5000000000000,15,'2026-10-26 00:00:00'),(5,'2026-10-25',100000000000,15,'2026-10-25 14:59:59'),(6,'2026-10-27',100000000000,15,'2026-10-26 15:00:00');
 CREATE TABLE quest_weekly_claims_v1(user_id bigint,week_key text,quest_id text,claim_token text UNIQUE,status text,progress bigint,reward_type text,reward_amount bigint,message_id bigint,created_at text,PRIMARY KEY(user_id,week_key,quest_id));
 CREATE TABLE user_messages(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),sender_type text,title text,body text,message_type text,campaign_key text,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id bigserial PRIMARY KEY,message_id bigint UNIQUE REFERENCES user_messages(id),user_id bigint REFERENCES users(id),reward_type text,reward_amount bigint,claimed_at text);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint,user_id bigint,reward_type text,reward_amount bigint,balance_before bigint,balance_after bigint);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 const daily={enabled:true,postEnabled:true,commentEnabled:false,requiredPosts:15,postRewardCoin:100000000000,rewardCoin:100000000000,boardSlugs:['skm'],checkCooldownSeconds:20,adminTestAllowed:true};
 const weekly={revision:5,operationToken:'original-token',quests:{POST:{enabled:true,rewardType:'COIN',rewardAmount:1000000000000},CORE_RAID:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:300000},TERRITORY:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:150000},CLAN:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:500000}}};
 for(const [key,value] of [[DAILY_KEY,daily],[WEEKLY_KEY,weekly],['wago_daily_quest_settings_v1',{rewardCoin:1111}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 for(const [user,week,quest,amount,created,progress] of [
  [2,'2026-10-19','POST',1000000000000,'2026-10-25 15:00:00',252],[2,'2026-10-26','POST',1000000000000,'2026-10-26 00:10:00',300],
  [3,'2026-10-19','POST',1000000000000,'2026-10-25 14:59:59',300],[4,'2026-10-26','POST',30000000000000,'2026-10-26 00:10:00',300],
  [5,'2026-10-26','CORE_RAID',300000,'2026-10-26 00:10:00',3],[6,'2026-10-26','POST',1000000000000,'2026-10-26 15:00:00',300]
 ]){
  const type=quest==='POST'?'COIN':'MASTER_STAR',token=`${user}:${week}:${quest}`;
  const m=(await db.query('INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2) RETURNING id',[user,token])).rows[0];
  await db.query('INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES($1,$2,$3,$4)',[m.id,user,type,amount]);
  await db.query("INSERT INTO quest_weekly_claims_v1 VALUES($1,$2,$3,$4,'COMPLETED',$5,$6,$7,$8,$9)",[user,week,quest,token,progress,type,amount,m.id,created]);
 }
 const snapshot=async()=>{const state={};for(const table of ['users','app_meta','wago_daily_quest_claims','quest_weekly_claims_v1','user_messages','user_message_rewards','admin_logs'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {db,snapshot,daily,weekly,options:{now:new Date('2026-10-26T02:00:00Z'),expectedSettingsHash:hash({[DAILY_KEY]:daily,[WEEKLY_KEY]:weekly})}};
}

test('today KST receipts get exact deltas, including completed prior-week exceptions; settings and source records remain intact',async t=>{
 const f=await fixture(t),before=await f.snapshot();const dry=await configureQuestIncrease(f.db,{...f.options,dryRun:true});assert.equal(dry.receipt.plan.length,4);assert.deepEqual(await f.snapshot(),before);
 const {receipt}=await configureQuestIncrease(f.db,f.options);assert.deepEqual(receipt.summary,{uniqueUsers:2,DAILY:{count:2,totalCoin:'9800000000000'},WEEKLY:{count:2,totalCoin:'58000000000000'}});
 assert.deepEqual(receipt.after[DAILY_KEY],{...f.daily,postRewardCoin:5000000000000,rewardCoin:5000000000000});
 assert.deepEqual({...receipt.after[WEEKLY_KEY].quests,POST:f.weekly.quests.POST},f.weekly.quests);assert.equal(receipt.after[WEEKLY_KEY].quests.POST.rewardAmount,30000000000000);
 const configured=await f.snapshot(),options={expectedPlanHash:receipt.planHash};await deliverQuestDeltas(f.db,{...options,dryRun:true});assert.deepEqual(await f.snapshot(),configured);
 const paid=await deliverQuestDeltas(f.db,options),after=await f.snapshot();assert.equal(paid.verification.messages,4);
 for(const table of ['users','wago_daily_quest_claims','quest_weekly_claims_v1'])assert.deepEqual(after[table],before[table]);assert.deepEqual(after.user_message_rewards.slice(0,before.user_message_rewards.length),before.user_message_rewards);
 assert.deepEqual(after.app_meta.find(r=>r.key==='wago_daily_quest_settings_v1'),before.app_meta.find(r=>r.key==='wago_daily_quest_settings_v1'));
 const selectOnly={query:(sql,args)=>{assert(/^SELECT\b/.test(sql),'Replay must be SELECT-only');return f.db.query(sql,args);}};
 assert((await configureQuestIncrease(selectOnly,f.options)).replayed);assert((await deliverQuestDeltas(selectOnly,options)).replayed);assert.deepEqual(await f.snapshot(),after);
});

test('configuration, attachment, audit and completion failures roll back atomically and keep the retry plan',async t=>{
 const f=await fixture(t),before=await f.snapshot();const broken=prefix=>({query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('Injected failure')):f.db.query(sql,args)});
 await assert.rejects(configureQuestIncrease(broken('INSERT INTO admin_logs'),f.options),/Injected/);assert.deepEqual(await f.snapshot(),before);
 const {receipt}=await configureQuestIncrease(f.db,f.options),configured=await f.snapshot(),options={expectedPlanHash:receipt.planHash};
 for(const prefix of ['INSERT INTO user_message_rewards','INSERT INTO admin_logs','INSERT INTO app_meta']){await assert.rejects(deliverQuestDeltas(broken(prefix),options),/Injected/);assert.deepEqual(await f.snapshot(),configured);}
 const partial={query:(sql,args)=>sql.startsWith('INSERT INTO user_message_rewards')?Promise.resolve({rows:[]}):f.db.query(sql,args)};
 await assert.rejects(deliverQuestDeltas(partial,options),/Partial reward/);assert.deepEqual(await f.snapshot(),configured);
 await assert.rejects(deliverQuestDeltas(f.db,{expectedPlanHash:'wrong'}),/Reviewed/);
});

test('lost completion acknowledgement and already collected supplemental messages safely replay',async t=>{
 const f=await fixture(t),{receipt}=await configureQuestIncrease(f.db,f.options),options={expectedPlanHash:receipt.planHash};
 const lost={async query(sql,args){const result=await f.db.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
 await assert.rejects(deliverQuestDeltas(lost,options),/response lost/);
 const r=(await f.db.query('SELECT r.* FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key LIKE $1 ORDER BY r.id LIMIT 1',[CAMPAIGN_PREFIX+'%'])).rows[0];
 await f.db.query("UPDATE user_message_rewards SET claimed_at='2026-10-26 02:00:00' WHERE id=$1",[r.id]);
 await f.db.query('INSERT INTO user_message_reward_claim_receipts_v1222 VALUES($1,$2,$3,$4,$5,123,$6)',[r.id,r.message_id,r.user_id,r.reward_type,r.reward_amount,String(123n+BigInt(r.reward_amount))]);
 await f.db.query('UPDATE users SET coin=coin+$1 WHERE id=$2',[r.reward_amount,r.user_id]);
 const before=await f.snapshot(),retry=await deliverQuestDeltas(f.db,options);assert(retry.replayed);assert.equal(retry.verification.collected,1);assert.deepEqual(await f.snapshot(),before);
});

test('wrong date, changed policy, broken receipts and late old-price claims cannot silently pass',async t=>{
 const f=await fixture(t);await assert.rejects(configureQuestIncrease(f.db,{...f.options,now:new Date('2026-10-27T00:00:00Z')}),/Authorized/);
 await assert.rejects(configureQuestIncrease(f.db,{...f.options,expectedSettingsHash:'wrong'}),/Reviewed settings/);
 await f.db.query("UPDATE quest_weekly_claims_v1 SET status='PENDING' WHERE user_id=2 AND week_key='2026-10-19'");await assert.rejects(configureQuestIncrease(f.db,f.options),/Pending/);
 await f.db.query("UPDATE quest_weekly_claims_v1 SET status='COMPLETED' WHERE user_id=2 AND week_key='2026-10-19'");
 const {receipt}=await configureQuestIncrease(f.db,f.options);await f.db.query("INSERT INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count,claimed_at) VALUES(7,'2026-10-26',100000000000,15,'2026-10-26 02:00:00')");
 await assert.rejects(deliverQuestDeltas(f.db,{expectedPlanHash:receipt.planHash}),/changed after cutover/);
 assert.equal((await f.db.query('SELECT id FROM user_messages WHERE campaign_key LIKE $1',[CAMPAIGN_PREFIX+'%'])).rows.length,0);
});
