import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {lichWeeklyReward,LICH_WEEKLY_REWARD_LIMIT} from '../functions/_raid_lich_rewards.js';
import {madaraWeeklyReward} from '../functions/_raid_madara_rewards.js';
import {RAIDS,OPERATION_KEY,AUTHORIZED_WEEK,inspectRaidResetTickets as inspect,resetRaidAndSendTickets as apply,verifyRaidResetTickets as verify} from '../scripts/ops/raid-weekly-reset-tickets-20261017.mjs';
const at=Date.parse('2026-10-16T20:00:00Z');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456,magic_crystals BIGINT DEFAULT 789);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'WAGO');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT DEFAULT 0,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(3,'LICH_KING_ENTRY_TICKET',7),(3,'MADARA_RAID_ENTRY_TICKET',2),(3,'MASTER_STAR',33);
 CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE raid_lich_rooms_v1(room_id TEXT PRIMARY KEY,status TEXT,version BIGINT DEFAULT 0,state_json TEXT);
 CREATE TABLE raid_madara_rooms_v1(LIKE raid_lich_rooms_v1 INCLUDING ALL);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT);
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;`);
 const compat=readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8');await db.exec(compat.match(/CREATE OR REPLACE FUNCTION sqlite_json_extract[\s\S]*?\$\$;/)[0]);
 for(const raid of RAIDS){
  await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[raid.ticket,raid.catalogName]);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2),($3,$4)',[raid.settings,JSON.stringify({mode:'ON',weeklyRewardLimit:raid.id==='MADARA'?5:3,revision:7}),'reward_reveal_policy_v1:'+raid.id,JSON.stringify({enabled:true,revision:3})]);
  for(const [uid,count]of [[1,5],[3,4],[4,2]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[raid.prefix+AUTHORIZED_WEEK+':'+uid,JSON.stringify({count,token:'old',roomId:'paid-'+raid.id})]);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[raid.prefix+'2026-10-05:3',JSON.stringify({count:5})]);
  await db.query(`INSERT INTO ${raid.rooms}(room_id,status,version,state_json) VALUES($1,'CLEAR',8,$2),($3,'ACTIVE',12,$4)`,['paid-'+raid.id,JSON.stringify({status:'CLEAR',clearRewardSettlement:{grantedIds:['1']},clearRewards:{1:{granted:true}},finishedAt:at-1000}),'active-'+raid.id,JSON.stringify({status:'ACTIVE',hp:99})]);
 }
 await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2),($3,$4),($5,$6)',['reward_reveal_offer_v1:3:offer','{"status":"PENDING","choice":1}','reward_reveal_pending_v1:3:offer','{"offerId":"offer"}','raid_core_weekly_v1:2026-10-12:3','{"count":3}']);
 const pg={async query(input){const result=await db.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
 return {db,env:{DB:new __postgresCompatTest.PostgresD1Database(pg)}};
}
async function snapshot(db){const result={};for(const table of ['users','cnine_user_inventory','inventory_logs','coin_logs','app_meta','raid_lich_rooms_v1','raid_madara_rooms_v1','user_messages','user_message_rewards','admin_logs'])result[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;}
const options=plan=>({at,expectedRecipientHash:plan.recipientHash,expectedSettingsDigest:plan.settingsDigest,commit:true});

test('all active roles including unverified users receive both tickets; all current quotas reset and prior rewards survive',async t=>{
 const {db,env}=await fixture(t);await db.exec("INSERT INTO users(id,role,status) SELECT id,'USER','ACTIVE' FROM generate_series(100,300) AS id");
 const before=await snapshot(db),plan=await inspect(db,{at}),receipt=await apply(db,options(plan)),after=await snapshot(db);
 assert.equal(plan.count,205);assert.equal(receipt.totalAccounts,206);assert.equal(LICH_WEEKLY_REWARD_LIMIT,7);
 assert.equal(after.user_messages.length,410);assert.equal(after.user_message_rewards.length,410);assert.ok(after.user_message_rewards.every(row=>Number(row.reward_amount)===5));
 assert.ok(after.user_messages.some(row=>Number(row.user_id)===5));assert.ok(!after.user_messages.some(row=>Number(row.user_id)===4));
 for(const uid of [1,3,4,5]){assert.equal((await lichWeeklyReward(env,uid,at)).remaining,7);assert.equal((await madaraWeeklyReward(env,uid,5,at)).remaining,5);}
 for(const table of ['users','cnine_user_inventory','inventory_logs','coin_logs'])assert.deepEqual(after[table],before[table]);
 const preserved=rows=>rows.filter(row=>!RAIDS.some(raid=>row.key.startsWith(raid.prefix+AUTHORIZED_WEEK+':'))&&row.key!==OPERATION_KEY);
 assert.deepEqual(preserved(after.app_meta),preserved(before.app_meta));
 for(const raid of RAIDS){
  assert.deepEqual(after[raid.rooms],before[raid.rooms].map(row=>({...row,version:row.status==='ACTIVE'?Number(row.version)+1:row.version})));
  assert.equal((await db.query(`UPDATE ${raid.rooms} SET version=version+1 WHERE room_id=$1 AND version=12 RETURNING room_id`,['active-'+raid.id])).rows.length,0);
 }
 assert.equal((await verify(db)).verification.LICH.totalTickets,1025);
 await db.query('UPDATE app_meta SET value=$2 WHERE key=$1',[RAIDS[0].prefix+AUTHORIZED_WEEK+':3',JSON.stringify({count:1,token:'new-clear'})]);
 await db.exec("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
 const replayBefore=await snapshot(db);assert.equal((await apply(db,options(plan))).replayed,true);assert.deepEqual(await snapshot(db),replayBefore);assert.equal((await lichWeeklyReward(env,3,at)).used,1);
});

test('dry run and failures after a reset or partial delivery roll back both quotas, both campaigns and audit',async t=>{
 const {db}=await fixture(t),plan=await inspect(db,{at}),before=await snapshot(db);
 assert.equal((await apply(db,{...options(plan),commit:false})).committed,false);assert.deepEqual(await snapshot(db),before);
 for(const failure of ['INSERT INTO user_message_rewards','INSERT INTO admin_logs','INSERT INTO app_meta(key,value,updated_at)']){
  const broken={query:(sql,args)=>sql.startsWith(failure)?Promise.reject(Error('injected failure')):db.query(sql,args)};
  await assert.rejects(apply(broken,options(plan)),/injected failure/);assert.deepEqual(await snapshot(db),before);
 }
 let messages=0;const partial={query:(sql,args)=>sql.startsWith('INSERT INTO user_messages')&&++messages===2?Promise.resolve({rows:[]}):db.query(sql,args)};
 await assert.rejects(apply(partial,options(plan)),/Partial message/);assert.deepEqual(await snapshot(db),before);
});

test('wrong week, changed recipients/settings, inactive tickets and unexpected legacy payouts reject without changes',async t=>{
 const {db}=await fixture(t),plan=await inspect(db,{at}),before=await snapshot(db);
 await assert.rejects(apply(db,{...options(plan),at:Date.parse('2026-10-19T12:00:00Z')}),/authorized week/);assert.deepEqual(await snapshot(db),before);
 for(const change of ["UPDATE users SET status='BANNED' WHERE id=5","UPDATE app_meta SET value='{}' WHERE key='raid_madara_settings_v1'","UPDATE inventory_items SET is_active=0 WHERE code='LICH_KING_ENTRY_TICKET'",`INSERT INTO raid_lich_rooms_v1 VALUES('legacy','CLEAR',0,'{"finishedAt":${at}}'); INSERT INTO inventory_logs(user_id,item_code,change_amount,reference_type,reference_id) VALUES(3,'PET_ESSENCE',5,'LICH_RAID_CLEAR','legacy')`]){
  await db.exec('BEGIN');await db.exec(change);const changed=await snapshot(db);await db.exec('COMMIT');
  await assert.rejects(apply(db,options(plan)));assert.deepEqual(await snapshot(db),changed);
  if(change.startsWith('UPDATE users'))await db.exec("UPDATE users SET status='ACTIVE' WHERE id=5");
  if(change.startsWith('UPDATE app_meta'))await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[plan.settings.find(row=>row.key==='raid_madara_settings_v1').value,'raid_madara_settings_v1']);
  if(change.startsWith('UPDATE inventory_items'))await db.exec('UPDATE inventory_items SET is_active=1');
 }
});

test('lost COMMIT response recovers the same reset and both messages without restarting quotas',async t=>{
 const {db}=await fixture(t),plan=await inspect(db,{at});
 const uncertain={async query(sql,args){const result=await db.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
 await assert.rejects(apply(uncertain,options(plan)),/response lost/);const committed=await snapshot(db);
 assert.equal((await apply(db,options(plan))).replayed,true);assert.deepEqual(await snapshot(db),committed);
});

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('const COUPON_REWARD_MAX='));
const claimSource=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
test('real message-claim handler credits each ticket +5 exactly once and never changes currencies',async t=>{
 const {db,env}=await fixture(t),plan=await inspect(db,{at});await apply(db,options(plan));
 const ctx=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
 vm.runInContext(specs+'\n'+claimSource+'\nthis.claim=claimMessageRewardDirectV1222;',ctx);
 const rewards=(await db.query('SELECT * FROM user_message_rewards WHERE user_id=3 ORDER BY id')).rows;
 for(const reward of rewards){const result=await ctx.claim(env,{id:3},reward,Number(reward.message_id));assert.equal(result.duplicate,false);assert.equal((await ctx.claim(env,{id:3},reward,Number(reward.message_id))).duplicate,true);}
 const inventory=(await db.query('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=3 ORDER BY item_code')).rows;
 assert.deepEqual(inventory.map(row=>[row.item_code,Number(row.quantity)]),[['LICH_KING_ENTRY_TICKET',12],['MADARA_RAID_ENTRY_TICKET',7],['MASTER_STAR',33]]);
 assert.equal((await db.query('SELECT * FROM user_message_reward_claim_receipts_v1222')).rows.length,2);
 assert.ok((await db.query('SELECT coin,card_shards,magic_crystals FROM users')).rows.every(row=>Number(row.coin)===123&&Number(row.card_shards)===456&&Number(row.magic_crystals)===789));
});
