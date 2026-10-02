import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {inspectPpanghunCkVerifiedRewards as inspect,sendPpanghunCkVerifiedRewards as send,verifyPpanghunCkVerifiedRewards as verify,GIFTS,TITLE,OPERATION_KEY} from '../scripts/ops/ppanghun-ck-verified-rewards-20261002.mjs';

async function fixture({failure=''}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY);
 INSERT INTO user_second_verifications VALUES(1),(2),(3),(4);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1),('STARLIGHT_ARMOR_CORE','미스틱 에너지',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 INSERT INTO cnine_user_inventory VALUES(3,'MASTER_STAR',777),(3,'STARLIGHT_ARMOR_CORE',33);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,
 reward_type TEXT ${['MASTER_STAR','STARLIGHT_ARMOR_CORE'].includes(failure)?`CHECK(reward_type<>'${failure}')`:''},reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failure==='AUDIT'?"CHECK(action_type='DENIED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return result;
}

test('all active secondary-verified roles receive three messages, replay freezes recipients and never alters wallets',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspect(client);
  assert.equal(plan.count,3);assert.deepEqual(plan.roles,{OWNER:1,ADMIN:1,USER:1});
  assert.deepEqual(plan.gifts.map(g=>[g.rewardType,g.rewardAmount,g.totalAmount]),[['COIN',300_000_000_000,'900000000000'],['MASTER_STAR',3_000_000,'9000000'],['STARLIGHT_ARMOR_CORE',1000,'3000']]);
  const receipt=await send(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(receipt.title,'빵훈방 CK 감사합니다');assert.equal(receipt.verification.messages,9);
  const after=await snapshot(db);assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
  assert.equal(after.admin_logs.length,1);assert.ok(after.user_messages.every(row=>row.title===TITLE&&row.body===TITLE));
  assert.equal((await verify(client,receipt)).duplicates,0);
  await db.exec("INSERT INTO user_second_verifications VALUES(5);UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
  const replayBefore=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.verification.campaigns.map(c=>c.claimed),[1,1,1]);
  assert.deepEqual(await snapshot(db),replayBefore);
 }finally{await db.close();}
});

test('dry-run rollback, changed target snapshot and inactive material cannot send a partial campaign',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspect(client);
  assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('INSERT INTO user_second_verifications VALUES(5)');
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Recipients changed/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec("DELETE FROM user_second_verifications WHERE user_id=5;UPDATE inventory_items SET is_active=0 WHERE code='STARLIGHT_ARMOR_CORE'");
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Active reward item required/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

for(const failure of ['MASTER_STAR','STARLIGHT_ARMOR_CORE','AUDIT'])test(`${failure} failure rolls back all three campaigns, retry sends each once`,async()=>{
 const {db,client}=await fixture({failure});try{
  const before=await snapshot(db),plan=await inspect(client);
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/check constraint/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec(failure==='AUDIT'?'ALTER TABLE admin_logs DROP CONSTRAINT admin_logs_action_type_check':'ALTER TABLE user_message_rewards DROP CONSTRAINT user_message_rewards_reward_type_check');
  assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).verification.messages,9);
  assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).replayed,true);
 }finally{await db.close();}
});

test('partial inserts or missing completion receipt cannot leave messages, rewards or audit',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspect(client);
  for(const prefix of ['UPDATE app_meta','INSERT INTO user_messages','INSERT INTO user_message_rewards']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(()=>send(broken,{expectedRecipientHash:plan.recipientHash}),/Completed receipt missing|Partial (message|reward) insert/);
   assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close();}
});

test('lost COMMIT response replays the completed operation without another gift or audit',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspect(client),uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(()=>send(uncertain,{expectedRecipientHash:plan.recipientHash}),/response lost/);
  const committed=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.equal(replay.operationKey,OPERATION_KEY);assert.equal(replay.verification.messages,9);
  assert.deepEqual(await snapshot(db),committed);
 }finally{await db.close();}
});

test('matching energy message under another campaign key prevents duplicate bundle',async()=>{
 const {db,client}=await fixture();try{
  await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(3,'ADMIN',$1,$1,'ITEM_REWARD','other-key')",[TITLE]);
  await db.query("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(1,3,'STARLIGHT_ARMOR_CORE',$1)",[GIFTS[2].rewardAmount]);
  const before=await snapshot(db),plan=await inspect(client);
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Matching gift exists/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('real PostgreSQL message claim credits 3000억, 300만 stars and 1000 energy once and recovers failed energy claim',async()=>{
 const {db,client}=await fixture();try{
  await db.exec(`ALTER TABLE users ADD COLUMN card_shards BIGINT DEFAULT 0;
   ALTER TABLE user_messages ADD COLUMN read_at TEXT;
   ALTER TABLE cnine_user_inventory ADD PRIMARY KEY(user_id,item_code);
   ALTER TABLE cnine_user_inventory ADD COLUMN unseen_quantity BIGINT DEFAULT 0;
   ALTER TABLE cnine_user_inventory ADD COLUMN created_at TEXT;
   ALTER TABLE cnine_user_inventory ADD COLUMN updated_at TEXT;
   CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
   CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
   CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
   CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,
    reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT);`);
  const plan=await inspect(client);await send(client,{expectedRecipientHash:plan.recipientHash});
  const rewards=(await db.query('SELECT * FROM user_message_rewards WHERE user_id=3 ORDER BY id')).rows;
  const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('const COUPON_REWARD_MAX='));
  const claimSource=source.slice(source.indexOf('async function claimMessageRewardDirectV1222('),source.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
  let failEnergy=false;
  const pg={async query(input){
   const sql=typeof input==='string'?input:input.text,args=typeof input==='string'?[]:input.values||[];
   if(failEnergy&&sql.includes('INSERT INTO inventory_logs')&&args.includes('STARLIGHT_ARMOR_CORE'))throw Error('injected energy claim failure');
   const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};
  }};
  const env={DB:new __postgresCompatTest.PostgresD1Database(pg)},context=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
  vm.runInContext(`${specs}\n${claimSource}\nthis.claim=claimMessageRewardDirectV1222;`,context);
  const claim=reward=>context.claim(env,{id:3},reward,Number(reward.message_id));
  assert.equal((await claim(rewards[0])).balanceAfter,300_000_000_123);
  assert.equal((await claim(rewards[1])).balanceAfter,3_000_777);
  failEnergy=true;await assert.rejects(()=>claim(rewards[2]),/injected energy claim failure/);
  assert.equal(Number((await db.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=3 AND item_code='STARLIGHT_ARMOR_CORE'")).rows[0].quantity),33);
  assert.equal((await db.query('SELECT claimed_at FROM user_message_rewards WHERE id=$1',[rewards[2].id])).rows[0].claimed_at,null);
  failEnergy=false;assert.equal((await claim(rewards[2])).balanceAfter,1033);
  for(const reward of rewards)assert.equal((await claim(reward)).duplicate,true);
  const stock=(await db.query('SELECT item_code,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=3 ORDER BY item_code')).rows;
  assert.deepEqual(stock.map(row=>[row.item_code,Number(row.quantity),Number(row.unseen_quantity)]),[['MASTER_STAR',3_000_777,3_000_000],['STARLIGHT_ARMOR_CORE',1033,1000]]);
  assert.equal(Number((await db.query('SELECT coin FROM users WHERE id=3')).rows[0].coin),300_000_000_123);
  assert.equal((await db.query('SELECT * FROM coin_logs')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM inventory_logs')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM user_message_reward_claim_receipts_v1222')).rows.length,3);
 }finally{await db.close();}
});
