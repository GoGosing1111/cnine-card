import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {PLAN,PLAN_HASH,OPERATION_KEY as BASE_KEY,CAMPAIGN_KEY as BASE_CAMPAIGN,TARGETS,body,identityHash} from '../scripts/ops/crater-tournament-rewards-20261022.mjs';
import {IDENTITY_HASH} from '../scripts/ops/crater-moonaldo-reward-20261022.mjs';
const identity={provider:'TEST',provider_name:'Moo날두',provider_user_id:'test-4415'};
const source=readFileSync(new URL('../scripts/ops/crater-moonaldo-reward-20261022.mjs',import.meta.url),'utf8')
 .replace('./crater-tournament-rewards-20261022.mjs',new URL('../scripts/ops/crater-tournament-rewards-20261022.mjs',import.meta.url).href)
 .replace(IDENTITY_HASH,identityHash(identity));
const ops=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'OWNER','OWNER','ACTIVE'),(4415,'Moo날두','USER','ACTIVE'),(4568,'족날두','USER','ACTIVE'),(999001,'철줌마효진님','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_name TEXT,provider_user_id TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,hidden_at TEXT,created_at TEXT DEFAULT '2026-10-22T00:00:00Z',UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,balance_before BIGINT,balance_after BIGINT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 await db.query('INSERT INTO user_second_verifications VALUES(4415,$1,$2,$3)',Object.values(identity));
 const deliveries=[];
 for(const target of TARGETS){
  const m=(await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES($1,'ADMIN',$2,$3,'COIN_REWARD',$4) RETURNING id::text",[target.userId,PLAN.title,body(target),BASE_CAMPAIGN])).rows[0];
  const r=(await db.query("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES($1,$2,'COIN',$3) RETURNING id::text",[m.id,target.userId,target.amount])).rows[0];deliveries.push({userId:target.userId,messageId:m.id,rewardId:r.id});
 }
 const prior={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:BASE_KEY,campaignKey:BASE_CAMPAIGN,planHash:PLAN_HASH,authorization:PLAN.authorization,delivery:'MESSAGE',noImmediateCredit:true,recipients:TARGETS,held:PLAN.held,totalCoin:PLAN.totalCoin,deliveries};
 await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[BASE_KEY,JSON.stringify(prior)]);
 const snapshot=async()=>{const out={};for(const table of ['users','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','admin_logs','app_meta'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 return {db,snapshot};
}
test('one additional message grants Moo날두 only; original 50, wallets, held player and replay are preserved',async t=>{
 const f=await fixture(t),before=await f.snapshot();await ops.send(f.db,{commit:false});assert.deepEqual(await f.snapshot(),before);
 const sent=await ops.send(f.db,{commit:true}),after=await f.snapshot();assert.equal(sent.verification.totalRecipients,51);assert.equal(sent.verification.totalCoin,'89000000000000');
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.user_messages.filter(m=>m.campaign_key===BASE_CAMPAIGN),before.user_messages);
 assert.deepEqual(after.app_meta.find(r=>r.key===BASE_KEY),before.app_meta[0]);assert.equal(after.user_messages.length,51);assert.equal(after.user_message_rewards.length,51);
 const extra=after.user_messages.find(m=>m.campaign_key===ops.CAMPAIGN_KEY);assert.equal(Number(extra.user_id),4415);assert.equal(extra.title,'크레이터 대회 상금');
 assert.equal(after.user_messages.filter(m=>[4568,999001].includes(Number(m.user_id))).length,0);
 const readOnly={query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE)/i.test(sql));return f.db.query(sql,args);}};
 assert.equal((await ops.send(readOnly,{commit:true})).replayed,true);assert.deepEqual(await f.snapshot(),after);
});
test('identity changes, unsafe wallet, duplicate delivery and failures at each write leave no partial message',async t=>{
 const f=await fixture(t);await f.db.query("UPDATE user_second_verifications SET provider_user_id='changed' WHERE user_id=4415");let before=await f.snapshot();
 await assert.rejects(ops.send(f.db,{commit:true}),/identity changed/);assert.deepEqual(await f.snapshot(),before);await f.db.query("UPDATE user_second_verifications SET provider_user_id='test-4415' WHERE user_id=4415");
 await f.db.query('UPDATE users SET coin=$1 WHERE id=4415',[Number.MAX_SAFE_INTEGER]);before=await f.snapshot();await assert.rejects(ops.send(f.db,{commit:true}),/Unsupported/);assert.deepEqual(await f.snapshot(),before);await f.db.query('UPDATE users SET coin=123 WHERE id=4415');before=await f.snapshot();
 for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const failing={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):f.db.query(sql,args)};await assert.rejects(ops.send(failing,{commit:true}));assert.deepEqual(await f.snapshot(),before);
 }
 await f.db.query("INSERT INTO user_messages(user_id,title,campaign_key) VALUES(4415,$1,'manual-duplicate')",[ops.TITLE]);before=await f.snapshot();await assert.rejects(ops.send(f.db,{commit:true}),/already sent/);assert.deepEqual(await f.snapshot(),before);
});
