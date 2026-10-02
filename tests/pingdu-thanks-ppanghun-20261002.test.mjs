import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {quantityFor,inspectThanksGift,sendThanksGift,verifyThanksGift,CAMPAIGN_KEY,ITEM_CODE,TITLE,bodyFor} from '../scripts/ops/pingdu-thanks-ppanghun-20261002.mjs';
import reviewed from '../scripts/ops/pingdu-thanks-ppanghun-20261002.targets.json' with {type:'json'};
const targets=[
 {id:'2',nickname:'하나',soop:'고라니ㅇ',total:693,quantity:5,playdkId:'qa-a'},
 {id:'3',nickname:'둘',soop:'연구가태여니',total:397,quantity:4,playdkId:'qa-b'},
 {id:'4',nickname:'셋',soop:'[C9]비니',total:106,quantity:1,playdkId:'qa-c'}
];
async function fixture({failAudit=false,failReward=false}={}){
 const db=new PGlite();await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(2,'하나','USER','ACTIVE'),(3,'둘','USER','ACTIVE'),(4,'셋','USER','ACTIVE'),(5,'미확인','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT);INSERT INTO user_second_verifications VALUES(2,'PLAYDK','qa-a'),(3,'PLAYDK','qa-b'),(4,'PLAYDK','qa-c');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);INSERT INTO inventory_items VALUES('PINGDU_THANKS_GIFT_BOX','핑두의 감사 선물',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);INSERT INTO cnine_user_inventory VALUES(2,'RECRUITMENT_GIFT_BOX',5),(3,'MASTER_STAR',777);
 CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,reference_id TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT ${failReward?'CHECK(user_id<>3)':''},reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='DENIED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory','inventory_logs','user_messages','user_message_rewards','app_meta','admin_logs'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;return result;}
test('approved list separates both Binis, holds unknown games and assigns the override without exceeding five',()=>{
 assert.equal(reviewed.sourceCount,76);assert.equal(reviewed.targets.length,74);assert.equal(new Set(reviewed.targets.map(t=>t.id)).size,74);
 assert.equal(reviewed.targets.reduce((n,t)=>n+t.quantity,0),158);
 assert.equal(reviewed.targets.find(t=>t.soop==='연구가태여니').quantity,4);assert.equal(reviewed.targets.find(t=>t.soop==='[C9]비니').quantity,1);
 assert.deepEqual(reviewed.held.map(t=>t.source).sort(),['ΘωΘ비니','블랑코_'].sort());
 for(const [total,quantity] of [[100,1],[199,1],[200,2],[299,2],[300,3],[499,4],[500,5],[693,5],[3108,5]])assert.equal(quantityFor('다른 후원자',total),quantity);
 assert.equal(quantityFor('연구가태여니',397),4);assert.throws(()=>quantityFor('다른 후원자',99));
});
test('each account receives its exact attached box quantity; replay never sends another message',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectThanksGift(client,targets),receipt=await sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash}),after=await snapshot(db);
  assert.equal(receipt.verification.messages,3);assert.equal(receipt.verification.boxes,10);assert.equal(receipt.verification.duplicates,0);
  for(const row of after.user_messages){const target=targets.find(t=>t.id===String(row.user_id));assert.ok(target);assert.equal(row.title,TITLE);assert.equal(row.body,bodyFor(target.quantity));}
  for(const row of after.user_message_rewards){const target=targets.find(t=>t.id===String(row.user_id));assert.equal(row.reward_type,ITEM_CODE);assert.equal(Number(row.reward_amount),target.quantity);assert.equal(row.claimed_at,null);}
  for(const table of ['users','cnine_user_inventory','inventory_logs','inventory_items'])assert.deepEqual(after[table],before[table]);
  await db.exec("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=2");const replayBefore=await snapshot(db);
  const replay=await sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash});assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),replayBefore);
  assert.equal((await verifyThanksGift(client,receipt)).missing,0);
 }finally{await db.close();}
});
for(const failure of ['failAudit','failReward'])test(`${failure}: every message, reward and receipt rolls back`,async()=>{
 const {db,client}=await fixture({[failure]:true});try{const before=await snapshot(db),plan=await inspectThanksGift(client,targets);await assert.rejects(sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash}),/check constraint/);assert.deepEqual(await snapshot(db),before);}finally{await db.close();}
});
test('dry run, changed identities, excessive amounts and duplicate targets cannot mutate data',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectThanksGift(client,targets);assert.equal((await sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(db),before);
  await assert.rejects(sendThanksGift(client,[...targets,targets[0]],{expectedRecipientHash:plan.recipientHash}),/Duplicate/);
  for(const change of [{quantity:6},{total:600},{soop:'알 수 없음'}])await assert.rejects(sendThanksGift(client,[{...targets[0],...change}],{expectedRecipientHash:plan.recipientHash}));
  await db.exec("UPDATE user_second_verifications SET provider_user_id='changed' WHERE user_id=2");const changed=await snapshot(db);
  await assert.rejects(sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash}),/Account identity changed/);assert.deepEqual(await snapshot(db),changed);
 }finally{await db.close();}
});
test('a lost COMMIT response recovers the original receipt and cannot send twice',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectThanksGift(client,targets),uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(sendThanksGift(uncertain,targets,{expectedRecipientHash:plan.recipientHash}),/response lost/);
  const before=await snapshot(db);assert.equal((await sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash})).replayed,true);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
test('another operation or prior direct grants cannot pay the same gift again',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectThanksGift(client,targets);await sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash});
  const subset=[targets[0]],next=await inspectThanksGift(client,subset),before=await snapshot(db);
  await assert.rejects(sendThanksGift(client,subset,{expectedRecipientHash:next.recipientHash}),/already sent/);assert.deepEqual(await snapshot(db),before);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=$1',[CAMPAIGN_KEY])).rows[0].n,3);
  await db.exec('DELETE FROM app_meta;DELETE FROM admin_logs;DELETE FROM user_message_rewards;DELETE FROM user_messages;');
  await db.query('INSERT INTO inventory_logs VALUES(2,$1,1,$2)',[ITEM_CODE,'manual-grant']);const direct=await snapshot(db);
  await assert.rejects(sendThanksGift(client,targets,{expectedRecipientHash:plan.recipientHash}),/already granted/);assert.deepEqual(await snapshot(db),direct);
 }finally{await db.close();}
});
test('partial message, reward and completed receipt writes all roll back',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectThanksGift(client,targets);
  for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','UPDATE app_meta']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(sendThanksGift(broken,targets,{expectedRecipientHash:plan.recipientHash}),/Partial message insert|Partial reward insert|Missing completed receipt/);assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close();}
});
