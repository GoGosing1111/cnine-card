import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {configureQuestIncrease,deliverQuestDeltas,OPERATION_KEY,DAILY_KEY,WEEKLY_KEY,CAMPAIGNS} from '../scripts/ops/dk-quest-reward-increase-20261017.mjs';
const options={now:new Date('2026-10-17T04:00:00Z')};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'USER','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','ACTIVE'),(5,'USER','ACTIVE');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE wago_daily_quest_claims(id BIGSERIAL PRIMARY KEY,user_id BIGINT,quest_date TEXT,reward_coin BIGINT,post_count BIGINT,UNIQUE(user_id,quest_date));
 INSERT INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count) VALUES(2,'2026-10-17',10000000000,15),(3,'2026-10-17',10000000000,30),(4,'2026-10-17',100000000000,15),(5,'2026-10-16',10000000000,15);
 CREATE TABLE quest_weekly_claims_v1(user_id BIGINT,week_key TEXT,quest_id TEXT,claim_token TEXT,status TEXT,progress BIGINT,reward_type TEXT,reward_amount BIGINT,message_id BIGINT,PRIMARY KEY(user_id,week_key,quest_id));
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id),sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE REFERENCES user_messages(id),user_id BIGINT REFERENCES users(id),reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,balance_before BIGINT,balance_after BIGINT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 const daily={enabled:true,postEnabled:true,commentEnabled:false,requiredPosts:15,postRewardCoin:10000000000,rewardCoin:10000000000,boardSlugs:['skm'],checkCooldownSeconds:20,adminTestAllowed:true};
 const weekly={revision:4,operationToken:'old-token',quests:{POST:{enabled:true,rewardType:'COIN',rewardAmount:250000000000},CORE_RAID:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:300000},TERRITORY:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:150000},CLAN:{enabled:true,rewardType:'MASTER_STAR',rewardAmount:500000}}};
 for(const [key,value] of [[DAILY_KEY,daily],[WEEKLY_KEY,weekly],['wago_daily_quest_settings_v1',{rewardCoin:1111}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 for(const [user,week,amount,claimed,quest] of [[2,'2026-10-12',250000000000,'claimed','POST'],[3,'2026-10-12',250000000000,null,'POST'],[4,'2026-10-12',1000000000000,null,'POST'],[5,'2026-10-05',250000000000,null,'POST'],[2,'2026-10-12',300000,null,'CORE_RAID']]){
  const type=quest==='POST'?'COIN':'MASTER_STAR';
  const m=(await db.query("INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2) RETURNING id",[user,`${week}:${quest}`])).rows[0];
  await db.query('INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount,claimed_at) VALUES($1,$2,$3,$4,$5)',[m.id,user,type,amount,claimed]);
  await db.query("INSERT INTO quest_weekly_claims_v1 VALUES($1,$2,$3,$4,'COMPLETED',300,$5,$6,$7)",[user,week,quest,`${user}:${week}:${quest}`,type,amount,m.id]);
 }
 const snapshot=async()=>{const out={};for(const table of ['users','app_meta','wago_daily_quest_claims','quest_weekly_claims_v1','user_messages','user_message_rewards','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return out;};
 return {db,daily,weekly,snapshot};
}

test('today/week-only deltas include collected and uncollected weekly rewards, with unchanged wallets and original receipts',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const dry=await configureQuestIncrease(f.db,{...options,dryRun:true});assert.equal(dry.receipt.plan.length,4);assert.deepEqual(await f.snapshot(),before);
 const configured=await configureQuestIncrease(f.db,options),receipt=configured.receipt;
 assert.deepEqual(receipt.summary,{DAILY:{count:2,totalCoin:'180000000000'},WEEKLY:{count:2,totalCoin:'1500000000000'}});
 assert.deepEqual(receipt.after[DAILY_KEY],{...f.daily,postRewardCoin:100000000000,rewardCoin:100000000000});
 for(const id of ['CORE_RAID','TERRITORY','CLAN'])assert.deepEqual(receipt.after[WEEKLY_KEY].quests[id],f.weekly.quests[id]);
 assert.equal(receipt.after[WEEKLY_KEY].revision,5);assert.notEqual(receipt.after[WEEKLY_KEY].operationToken,'old-token');
 const configuredState=await f.snapshot();
 const delivery={expectedPlanHash:receipt.planHash};
 await deliverQuestDeltas(f.db,{...delivery,dryRun:true});assert.deepEqual(await f.snapshot(),configuredState);
 const paid=await deliverQuestDeltas(f.db,delivery),after=await f.snapshot();assert.equal(paid.verification.messages,4);
 for(const table of ['users','wago_daily_quest_claims','quest_weekly_claims_v1'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.user_message_rewards.slice(0,before.user_message_rewards.length),before.user_message_rewards);
 assert.deepEqual(after.app_meta.find(r=>r.key==='wago_daily_quest_settings_v1'),before.app_meta.find(r=>r.key==='wago_daily_quest_settings_v1'));
 assert.equal((await configureQuestIncrease(f.db,options)).replayed,true);assert.equal((await deliverQuestDeltas(f.db,delivery)).replayed,true);assert.deepEqual(await f.snapshot(),after);
});

test('configuration failures and partial message/reward/audit writes roll back without losing the retry plan',async t=>{
 const f=await fixture(t),initial=await f.snapshot();
 const brokenConfig={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('Injected config failure')):f.db.query(sql,args)};
 await assert.rejects(configureQuestIncrease(brokenConfig,options),/Injected/);assert.deepEqual(await f.snapshot(),initial);
 const {receipt}=await configureQuestIncrease(f.db,options),before=await f.snapshot(),delivery={expectedPlanHash:receipt.planHash};
 for(const prefix of ['INSERT INTO user_message_rewards','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('Injected delivery failure')):f.db.query(sql,args)};
  await assert.rejects(deliverQuestDeltas(broken,delivery),/Injected/);assert.deepEqual(await f.snapshot(),before);
 }
 const partial={query:(sql,args)=>sql.startsWith('INSERT INTO user_message_rewards')?Promise.resolve({rows:[]}):f.db.query(sql,args)};
 await assert.rejects(deliverQuestDeltas(partial,delivery),/Partial reward/);assert.deepEqual(await f.snapshot(),before);
 await assert.rejects(deliverQuestDeltas(f.db,{expectedPlanHash:'wrong'}),/Reviewed/);assert.deepEqual(await f.snapshot(),before);
});

test('lost commit acknowledgement and a collected supplement remain safe to replay',async t=>{
 const f=await fixture(t),{receipt}=await configureQuestIncrease(f.db,options),delivery={expectedPlanHash:receipt.planHash};
 const lost={async query(sql,args){const result=await f.db.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result}};
 await assert.rejects(deliverQuestDeltas(lost,delivery),/response lost/);
 const r=(await f.db.query('SELECT r.* FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key=$1 ORDER BY r.id LIMIT 1',[CAMPAIGNS.DAILY])).rows[0];
 await f.db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE id=$1",[r.id]);
 await f.db.query("INSERT INTO user_message_reward_claim_receipts_v1222 VALUES($1,$2,$3,'COIN',$4,123,$5)",[r.id,r.message_id,r.user_id,r.reward_amount,String(BigInt(r.reward_amount)+123n)]);
 const before=await f.snapshot(),result=await deliverQuestDeltas(f.db,delivery);
 assert.equal(result.replayed,true);assert.equal(result.verification.collected,1);assert.deepEqual(await f.snapshot(),before);
 assert.equal(JSON.parse((await f.db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].value).status,'COMPLETED');
});

test('pending/broken weekly receipts, wrong date and late old-price claims are rejected',async t=>{
 const f=await fixture(t);
 await assert.rejects(configureQuestIncrease(f.db,{now:new Date('2026-10-18T00:00:00Z')}),/authorized KST date/);
 await f.db.query("UPDATE quest_weekly_claims_v1 SET status='PENDING' WHERE user_id=3");
 await assert.rejects(configureQuestIncrease(f.db,options),/Pending/);
 await f.db.query("UPDATE quest_weekly_claims_v1 SET status='COMPLETED' WHERE user_id=3");
 const {receipt}=await configureQuestIncrease(f.db,options);
 await f.db.query("INSERT INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count) VALUES(5,'2026-10-17',10000000000,15)");
 await assert.rejects(deliverQuestDeltas(f.db,{expectedPlanHash:receipt.planHash}),/changed after cutover/);
 assert.equal((await f.db.query('SELECT id FROM user_messages WHERE campaign_key=ANY($1::text[])',[Object.values(CAMPAIGNS)])).rows.length,0);
});
