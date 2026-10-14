import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {claimMessageRewardBatch} from '../functions/_message_reward_batch.js';
import {inspectVerifiedSssRerollMessage as inspect,sendVerifiedSssRerollMessage as send,verifyVerifiedSssRerollMessage as verify,CAMPAIGN_KEY,OPERATION_KEY,ITEM_CODE,TITLE,BODY} from '../scripts/ops/verified-sss-reroll-message-20261015.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT);
 INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'PLAYDK'),(3,'WAGO'),(4,'PLAYDK');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MERCENARY_SSS_REROLL_TICKET','SSS 재뽑기권',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT DEFAULT 0,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(3,'MERCENARY_SSS_REROLL_TICKET',7),(3,'MASTER_STAR',33);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,
 reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1,2`)).rows;return result;
}

test('all active verified roles/providers beyond one page receive exactly one SSS reroll ticket by message; replay freezes recipients',async t=>{
 const {db,client}=await fixture(t);
 await db.exec("INSERT INTO users(id,role,status) SELECT id,'USER','ACTIVE' FROM generate_series(100,300) AS id;INSERT INTO user_second_verifications SELECT id,'PLAYDK' FROM generate_series(100,300) AS id");
 const before=await snapshot(db),plan=await inspect(client);assert.equal(plan.count,204);assert.deepEqual(plan.roles,{OWNER:1,ADMIN:1,USER:202});
 const receipt=await send(client,{expectedRecipientHash:plan.recipientHash}),after=await snapshot(db);
 assert.equal(receipt.title,'2차 인증 유저 SSS 재뽑기권 지급');assert.equal(receipt.totalAmount,204);
 assert.deepEqual(receipt.verification,{messages:204,rewards:204,totalAmount:204,claimed:0,missing:0,duplicates:0});
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 assert.ok(after.user_messages.every(row=>row.title===TITLE&&row.body===BODY&&row.campaign_key===CAMPAIGN_KEY));
 assert.ok(after.user_message_rewards.every(row=>row.reward_type===ITEM_CODE&&Number(row.reward_amount)===1));
 assert.equal((await verify(client,receipt)).duplicates,0);
 await db.exec("INSERT INTO user_second_verifications VALUES(5,'PLAYDK');UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
 const replayBefore=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
 assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),replayBefore);
});

test('dry run rolls back; a changed target snapshot, wrong/inactive item or previous matching campaign blocks sending',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client),before=await snapshot(db);
 assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(db),before);
 for(const change of ["INSERT INTO user_second_verifications VALUES(5,'PLAYDK')","UPDATE inventory_items SET is_active=0","UPDATE inventory_items SET name='wrong'","INSERT INTO user_messages(user_id,title,campaign_key) VALUES(3,'2차 인증 유저 SSS 재뽑기권 지급','other');INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,3,'MERCENARY_SSS_REROLL_TICKET',1 FROM user_messages WHERE campaign_key='other'"]){
  await db.exec(change);const changed=await snapshot(db);
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}));assert.deepEqual(await snapshot(db),changed);
  await db.exec("DELETE FROM user_second_verifications WHERE user_id=5;UPDATE inventory_items SET is_active=1,name='SSS 재뽑기권';DELETE FROM user_message_rewards;DELETE FROM user_messages");
 }
});

test('partial message/reward inserts, audit failure and missing completion receipt roll back the entire campaign',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client),before=await snapshot(db);
 for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
  const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
  await assert.rejects(()=>send(broken,{expectedRecipientHash:plan.recipientHash}),/missing|Partial/);assert.deepEqual(await snapshot(db),before);
 }
 await db.exec("ALTER TABLE user_message_rewards ADD CONSTRAINT deny_sss_reroll CHECK(reward_type<>'MERCENARY_SSS_REROLL_TICKET')");
 await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/check constraint/);assert.deepEqual(await snapshot(db),before);
 await db.exec('ALTER TABLE user_message_rewards DROP CONSTRAINT deny_sss_reroll');
 assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).verification.messages,3);
});

test('lost COMMIT response recovers the existing campaign, receipt and audit without repeat delivery',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client);
 const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
 await assert.rejects(()=>send(uncertain,{expectedRecipientHash:plan.recipientHash}),/response lost/);
 const committed=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
 assert.equal(replay.replayed,true);assert.equal(replay.operationKey,OPERATION_KEY);assert.deepEqual(await snapshot(db),committed);
});

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('const COUPON_REWARD_MAX='));
const claimSource=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));

test('ticket metadata enables existing inbox claim controls without adding coupon acquisition',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise='))+';this.present=presentMessageReward;this.coupon=couponRewardSpec;',ctx);
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 vm.runInContext(app.slice(app.indexOf('const MESSAGE_REWARD_META='),app.indexOf('function messageClaimUser('))+';this.queue=claimableMessageRewards;this.meta=messageRewardMeta;',ctx);
 const message=ctx.present({id:1,reward_type:ITEM_CODE,reward_amount:1});
 assert.equal(message.reward_supported,true);assert.equal(ctx.meta(message).label,'SSS 재뽑기권');assert.equal(ctx.queue([message]).length,1);
 assert.equal(ctx.coupon(ITEM_CODE),null);
});

test('actual PostgreSQL message claim grants one SSS reroll ticket once, rolls back a failed inventory log and supports claim-all',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client);await send(client,{expectedRecipientHash:plan.recipientHash});
 let fail=false;
 const pg={async query(input){const sql=typeof input==='string'?input:input.text,args=typeof input==='string'?[]:input.values||[];
  if(fail&&sql.includes('INSERT INTO inventory_logs'))throw Error('injected inventory failure');
  const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(pg)},ctx=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
 vm.runInContext(specs+'\n'+claimSource+'\nthis.claim=claimMessageRewardDirectV1222;this.spec=verifiedMessageRewardSpec;',ctx);
 const reward=(await db.query('SELECT * FROM user_message_rewards WHERE user_id=3')).rows[0];
 const claim=()=>ctx.claim(env,{id:3},reward,Number(reward.message_id));
 await assert.rejects(()=>ctx.claim(env,{id:5},reward,Number(reward.message_id)),/보상/);
 fail=true;await assert.rejects(claim,/injected inventory failure/);
 assert.equal((await db.query('SELECT claimed_at FROM user_message_rewards WHERE id=$1',[reward.id])).rows[0].claimed_at,null);
 assert.equal((await db.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=3 AND item_code='MERCENARY_SSS_REROLL_TICKET'")).rows[0].quantity,7);
 fail=false;assert.equal((await claim()).balanceAfter,8);assert.equal((await claim()).duplicate,true);
 const ownerMessage=(await db.query('SELECT message_id FROM user_message_rewards WHERE user_id=1')).rows[0].message_id;
 const deps={specFor:ctx.spec,claim:ctx.claim,canRecover:async()=>false};
 assert.equal((await claimMessageRewardBatch(env,{id:1},[Number(ownerMessage)],deps))[0].ok,true);
 assert.equal((await claimMessageRewardBatch(env,{id:1},[Number(ownerMessage)],deps))[0].alreadyClaimed,true);
 const stock=(await db.query('SELECT user_id,item_code,quantity,unseen_quantity FROM cnine_user_inventory ORDER BY user_id,item_code')).rows;
 assert.deepEqual(stock.map(r=>[Number(r.user_id),r.item_code,Number(r.quantity),Number(r.unseen_quantity)]),[[1,ITEM_CODE,1,1],[3,ITEM_CODE,8,1],[3,'MASTER_STAR',33,0]]);
 assert.equal((await db.query('SELECT * FROM inventory_logs')).rows.length,2);
 assert.equal((await db.query('SELECT * FROM user_message_reward_claim_receipts_v1222')).rows.length,2);
 assert.ok((await db.query('SELECT coin,card_shards FROM users')).rows.every(r=>Number(r.coin)===123&&Number(r.card_shards)===456));
});
