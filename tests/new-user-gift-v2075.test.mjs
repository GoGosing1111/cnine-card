import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { refreshIssuedNewUserGiftContents } from '../scripts/ops/new-user-gift-contents-20261001.mjs';
import { giftEligibility, giftTimestamp, NEW_USER_GIFT_CODE, NEW_USER_GIFT_COIN, NEW_USER_GIFT_EQUIPMENT,
  ensureNewUserGift, newUserGiftStatus, issueNewUserGift, openNewUserGift, handleNewUserGift,
  completePlaydkVerificationWithGift, claimNewUserGiftMessage } from '../functions/_new_user_gift.js';

const admin = { id: 99, role: 'OWNER' };
async function autoFixture() {
  const f=await fixture();
  await ensureNewUserGift(f.env);
  await f.pg.exec(`
    ALTER TABLE user_second_verifications ADD COLUMN provider_name TEXT;
    ALTER TABLE user_second_verifications ADD COLUMN updated_at TEXT;
    DELETE FROM user_second_verifications;
    CREATE TABLE wago_verifications(user_id BIGINT,status TEXT);
    CREATE TABLE user_messages(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read BIGINT DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key));
    CREATE TABLE user_message_rewards(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT);
  `);
  return {...f, verify:(id=1,uuid='uuid-1')=>completePlaydkVerificationWithGift(f.env,id,{uuid,name:'인증QA'}),
    claim:async(id=1)=>{const reward=await f.row('SELECT * FROM user_message_rewards WHERE user_id=$1',[id]);return claimNewUserGiftMessage(f.env,{id},reward,reward.message_id);}};
}

test('first verification atomically sends one claimable box, claims once then opens the unchanged full contents',async()=>{
  const f=await autoFixture();try{
    await f.pg.exec("UPDATE users SET created_at=to_char(timezone('UTC',CURRENT_TIMESTAMP-INTERVAL '13 days'),'YYYY-MM-DD HH24:MI:SS') WHERE id=1");
    const result=await f.verify();assert.equal(result.newlyVerified,true);assert.equal(result.giftMessage.sent,true);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),3000);
    assert.equal((await f.status()).pendingMessageId,result.giftMessage.messageId);
    assert.equal((await f.status()).canOpen,false);assert.equal((await f.status()).canIssue,false);
    const repeat=await f.verify();assert.equal(repeat.newlyVerified,false);
    await assert.rejects(f.verify(1,'other-uuid'),e=>e.code==='SECONDARY_VERIFICATION_RACE');
    await assert.rejects(f.verify(2),e=>e.code==='SECONDARY_VERIFICATION_RACE');
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_messages')).n),1);
    const claims=await Promise.all([f.claim(),f.claim()]);assert.equal(claims.filter(x=>x.credited).length,1);
    assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM inventory_logs')).n),1);
    assert.equal((await f.status()).canOpen,true);
    const opened=await f.open();assert.equal(opened.coin,NEW_USER_GIFT_COIN);
    assert.deepEqual(opened.rewards.cardLevels,{SUPERSTAR:11,FUR:13,ZENITH:13});
    assert.equal((await f.claim()).duplicate,true);assert.equal((await f.open()).replayed,true);
    assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),0);
  }finally{await f.close();}
});

test('over 14 days and invalid/future signup still verify successfully without sending a box',async()=>{
  for(const joined of ["to_char(timezone('UTC',CURRENT_TIMESTAMP-INTERVAL '14 days 1 second'),'YYYY-MM-DD HH24:MI:SS')","'2026-02-30 00:00:00'","to_char(timezone('UTC',CURRENT_TIMESTAMP+INTERVAL '1 day'),'YYYY-MM-DD HH24:MI:SS')"]){
    const f=await autoFixture();try{
      await f.pg.exec(`UPDATE users SET created_at=${joined} WHERE id=1`);
      const result=await f.verify();assert.equal(result.newlyVerified,true);assert.equal(result.giftMessage.sent,false);
      assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_second_verifications')).n),1);
      assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_messages')).n),0);
      assert.equal(Number((await f.row('SELECT COUNT(*) n FROM new_user_gift_receipts_v1')).n),0);
    }finally{await f.close();}
  }
});

test('catalog/message/audit failure rolls back verification and entitlement together and permits retry',async()=>{
  for(const fault of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO new_user_gift_receipts_v1','INSERT INTO admin_logs']){
    const f=await autoFixture();try{
      f.setFault(fault);await assert.rejects(f.verify(),/injected/);
      for(const table of ['user_second_verifications','user_messages','user_message_rewards','new_user_gift_receipts_v1']) assert.equal(Number((await f.row(`SELECT COUNT(*) n FROM ${table}`)).n),0);
      f.setFault(null);assert.equal((await f.verify()).giftMessage.sent,true);
    }finally{await f.close();}
  }
});

test('same identity, unlink/relink, concurrent first verification and old manual grants never issue a second box',async()=>{
  const f=await autoFixture();try{
    const results=await Promise.all([f.verify(),f.verify()]);assert.equal(results.filter(x=>x.giftMessage.sent).length,1);
    await f.pg.exec('DELETE FROM user_second_verifications WHERE user_id=1');
    assert.equal((await f.verify(2)).giftMessage.code,'ALREADY_ISSUED');
    await f.pg.exec('DELETE FROM user_second_verifications WHERE user_id=2');
    assert.equal((await f.verify(1,'different-uuid')).giftMessage.code,'ALREADY_ISSUED');
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_messages')).n),1);
    await assert.rejects(f.claim(),e=>e.code==='SECOND_VERIFICATION_REQUIRED');
  }finally{await f.close();}
  const m=await autoFixture();try{
    await m.pg.exec("INSERT INTO user_second_verifications(user_id,provider,provider_user_id,verified_at) VALUES(1,'PLAYDK','manual-id',sqlite_now())");
    await m.issue();await m.pg.exec('DELETE FROM user_second_verifications WHERE user_id=1');
    assert.equal((await m.verify(1,'manual-id')).giftMessage.code,'ALREADY_ISSUED');
    assert.equal(Number((await m.row('SELECT COUNT(*) n FROM user_messages')).n),0);
  }finally{await m.close();}
});

test('failed or forged message claims cannot create extra boxes and genuine claim can retry',async()=>{
  const f=await autoFixture();try{
    await f.verify();
    const reward=await f.row('SELECT * FROM user_message_rewards');
    await assert.rejects(claimNewUserGiftMessage(f.env,{id:2},reward,reward.message_id),e=>e.code==='RECEIPT_INVALID');
    await f.pg.exec("UPDATE user_message_rewards SET reward_amount=2");
    await assert.rejects(f.claim(),e=>e.code==='RECEIPT_INVALID');
    await f.pg.exec('UPDATE user_message_rewards SET reward_amount=1');
    f.setFault('INSERT INTO inventory_logs');await assert.rejects(f.claim(),/injected/);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_message_reward_claim_receipts_v1222')).n),0);
    assert.equal((await f.row('SELECT claimed_at FROM user_message_rewards')).claimed_at,null);
    assert.equal((await f.row('SELECT hidden_at FROM user_messages')).hidden_at,null);
    f.setFault(null);assert.equal((await f.claim()).credited,true);
  }finally{await f.close();}
});

test('disabled gift preserves verification; preexisting verification is not retroactively mailed',async()=>{
  const f=await autoFixture();try{
    await f.pg.exec('UPDATE inventory_items SET is_active=0');
    assert.equal((await f.verify()).giftMessage.code,'GIFT_DISABLED');
    await f.pg.exec('UPDATE inventory_items SET is_active=1');
    assert.equal((await f.verify()).giftMessage.code,'ALREADY_VERIFIED');
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_messages')).n),0);
    await f.pg.exec("INSERT INTO user_second_verifications(user_id,provider,provider_user_id,verified_at) VALUES(2,'PLAYDK','old-id',sqlite_now())");
    assert.equal((await f.verify(2,'old-id')).giftMessage.code,'ALREADY_VERIFIED');
  }finally{await f.close();}
});

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,created_at TEXT);
    INSERT INTO users VALUES(1,'신규QA','ACTIVE','USER',3000,sqlite_now()),(2,'다른QA','ACTIVE','USER',0,sqlite_now()),(99,'운영자','ACTIVE','OWNER',0,'2020-01-01 00:00:00');
    CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,provider TEXT,provider_user_id TEXT,verified_at TEXT,UNIQUE(provider,provider_user_id));
    INSERT INTO user_second_verifications VALUES(1,'PLAYDK','uuid-1',sqlite_now());
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT);
    CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT);
    CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active BIGINT);
    INSERT INTO members VALUES(1,'활성',1),(2,'비활성',0);
    CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,is_active BIGINT,card_status TEXT,member_id BIGINT,limited_total BIGINT,issued_count BIGINT DEFAULT 0);
    INSERT INTO cards(id,title,rarity,is_active,card_status,member_id) VALUES
      ('S1','슈퍼스타 A','SUPERSTAR',1,'PUBLIC',1),('S2','슈퍼스타 B','SUPERSTAR',1,'PUBLIC',1),
      ('F1','FUR A','FUR',1,'PUBLIC',1),('F2','FUR B','FUR',1,'PUBLIC',1),('Z1','제니스 A','ZENITH',1,'PUBLIC',1),
      ('retired','삭제카드','FUR',0,'RETIRED',1),('hidden','비공개','ZENITH',1,'PRIVATE',1),('offmember','비활성멤버','FUR',1,'PUBLIC',2),('limited','제외등급','LIMITED',1,'PUBLIC',1);
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,breakthrough_fail_count BIGINT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
    CREATE TABLE magic_cards(id BIGINT PRIMARY KEY,code TEXT,name TEXT,is_active BIGINT);
    INSERT INTO magic_cards VALUES(1,'M1','마법1',1),(2,'M2','마법2',1),(3,'M3','폐기마법',0);
    CREATE TABLE user_magic_cards(user_id BIGINT,magic_card_id BIGINT,quantity BIGINT,enhancement_level BIGINT,updated_at TEXT,PRIMARY KEY(user_id,magic_card_id));
    CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT,name TEXT,slot TEXT,subtype TEXT,is_active BIGINT,is_public BIGINT);
    CREATE TABLE user_equipment_instances(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,equipment_id BIGINT,source_type TEXT,source_id TEXT,request_id TEXT UNIQUE);
    CREATE TABLE user_equipment_loadout(user_id BIGINT,slot TEXT,instance_id BIGINT);
    CREATE TABLE decks(user_id BIGINT,card_ids TEXT);
    INSERT INTO user_equipment_loadout VALUES(1,'WEAPON',77);
    INSERT INTO decks VALUES(1,'old deck unchanged');
  `);
  for (const [index,e] of NEW_USER_GIFT_EQUIPMENT.entries()) await pg.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,$4,$5,1,1)', [index+1,e.code,e.name,e.slot,e.subtype]);
  let fault = null;
  const client = { async query(input) {
    const sql = typeof input === 'string' ? input : input.text, values = typeof input === 'string' ? [] : input.values || [];
    if (fault && sql.includes(fault)) throw new Error('QA injected failure');
    const result = await pg.query(sql, values);
    return { ...result, rows: result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key, typeof value === 'bigint' ? Number(value) : value]))), rowCount: result.affectedRows ?? result.rows.length };
  } };
  const DB = new __postgresCompatTest.PostgresD1Database(client), env = { DB };
  const issue = (userId=1, extra={}) => issueNewUserGift(env, { userId, requestId: crypto.randomUUID(), reason: 'QA 신규 기프트', ...extra }, admin);
  const row = async (sql, args=[]) => (await pg.query(sql,args)).rows[0];
  return { pg, env, issue, row, open: (id=1)=>openNewUserGift(env,id), status:(id=1)=>newUserGiftStatus(env,id,admin), setFault(value){fault=value;}, close:()=>pg.close() };
}

test('14 days uses the real UTC signup timestamp, accepts exactly 336 hours and rejects one second over', () => {
  const now = '2026-09-09T10:00:00Z', user = {status:'ACTIVE',created_at:'2026-08-26 10:00:00'}, verification={provider:'PLAYDK',provider_user_id:'uuid',verified_at:'2026-09-09 09:00:00'};
  assert.equal(giftEligibility(user,verification,now).eligible,true);
  assert.equal(giftEligibility(user,verification,now).days,14);
  assert.equal(giftEligibility({...user,created_at:'2026-08-26 09:59:59'},verification,now).code,'EXPIRED');
  for(const created_at of ['', '2026-02-30 10:00:00','2026-09-09','2026-09-10T00:00:00Z']) assert.equal(giftEligibility({...user,created_at},verification,now).code,'JOIN_DATE_INVALID');
  assert(Number.isNaN(giftTimestamp('2026-02-30T10:00:00Z')));
  assert.equal(giftTimestamp('2026-09-09T19:00:00+09:00'),Date.parse(now));
  assert.equal(giftEligibility(user,null,now).code,'SECOND_VERIFICATION_REQUIRED');
  assert.equal(giftEligibility(user,{...verification,provider:'UNTRUSTED'},now).eligible,false);
  assert.equal(giftEligibility(user,{...verification,provider:'WAGO'},now).eligible,true);
});

test('CMS checks actual signup and verified status; request fields cannot alter reward contents',async()=>{
  const f=await fixture();try{
    const s=await f.status();assert.equal(s.canIssue,true);assert.equal(s.rewards.cards.length,5);assert.equal(s.rewards.magic.length,2);assert.equal(s.rewards.equipment.length,5);
    const granted=await f.issue(1,{coin:999999999999999,cardLevel:99,days:999});
    assert.equal(granted.rewards.coin,10000000000);assert.deepEqual(granted.rewards.cardLevels,{SUPERSTAR:11,FUR:13,ZENITH:13});
    assert.deepEqual(granted.rewards.equipment.map(e=>e.name).sort(),['미스틱 슈트','미스틱 레깅스','미스틱 슈즈','미스틱 듀얼디스크','소버린 SKS'].sort());
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),3000);
    assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
    const state=await f.status();assert.equal(state.canIssue,false);assert.equal(state.canOpen,true);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM admin_logs')).n),1);
    assert.equal(state.eligibility.code,'ALREADY_ISSUED');
  }finally{await f.close();}
});

test('whole box grants SUPERSTAR +11, FUR/ZENITH +13, magic +5 and five new equipment instances atomically',async()=>{
  const f=await fixture();try{
    await f.pg.exec("INSERT INTO user_cards VALUES(1,'F1',2,13,6,NULL),(1,'F2',1,4,3,NULL),(1,'S1',1,13,4,NULL),(1,'S2',0,13,4,NULL); INSERT INTO user_magic_cards VALUES(1,1,2,7,NULL),(1,2,0,9,NULL)");
    await f.issue();const r=await f.open();
    assert.equal(r.coin,NEW_USER_GIFT_COIN);assert.equal(r.coinAfter,10000003000);assert.deepEqual(r.summary,{superstar:2,fur:2,zenith:1,magic:2,equipment:5});
    assert.equal(Number((await f.row("SELECT breakthrough_level FROM user_cards WHERE card_id='F1'")).breakthrough_level),13);
    assert.equal(Number((await f.row("SELECT breakthrough_fail_count FROM user_cards WHERE card_id='F1'")).breakthrough_fail_count),6);
    assert.equal(Number((await f.row("SELECT quantity FROM user_cards WHERE card_id='F1'")).quantity),3);
    for(const cardId of ['F2','Z1','S1'])assert.equal(Number((await f.row('SELECT breakthrough_level FROM user_cards WHERE card_id=$1',[cardId])).breakthrough_level),13);
    assert.equal(Number((await f.row("SELECT breakthrough_fail_count FROM user_cards WHERE card_id='S1'")).breakthrough_fail_count),4);
    assert.equal(Number((await f.row("SELECT breakthrough_level FROM user_cards WHERE card_id='S2'")).breakthrough_level),11);
    assert.equal(Number((await f.row("SELECT breakthrough_fail_count FROM user_cards WHERE card_id='S2'")).breakthrough_fail_count),0);
    assert.equal(Number((await f.row("SELECT breakthrough_fail_count FROM user_cards WHERE card_id='F2'")).breakthrough_fail_count),0);
    assert.equal(Number((await f.row('SELECT enhancement_level FROM user_magic_cards WHERE magic_card_id=1')).enhancement_level),7);
    assert.equal(Number((await f.row('SELECT enhancement_level FROM user_magic_cards WHERE magic_card_id=2')).enhancement_level),5);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),5);
    assert.equal(Number((await f.row('SELECT instance_id FROM user_equipment_loadout')).instance_id),77);
    assert.equal((await f.row('SELECT card_ids FROM decks')).card_ids,'old deck unchanged');
    assert.equal(Number((await f.row('SELECT change_amount FROM coin_logs')).change_amount),10000000000);
    assert.equal((await f.row('SELECT status FROM new_user_gift_receipts_v1')).status,'OPENED');
    assert.equal((await f.status()).canOpen,false);
  }finally{await f.close();}
});

test('rapid duplicate issue/open requests and lost responses replay one persisted entitlement',async()=>{
  const f=await fixture();try{
    const issues=await Promise.all([f.issue(),f.issue(),f.issue()]);assert.equal(issues.filter(r=>!r.replayed).length,1);
    const opens=await Promise.all([f.open(),f.open(),f.open()]);assert.equal(opens.filter(r=>!r.replayed).length,1);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),5);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM admin_logs')).n),1);
    assert.equal((await f.issue()).replayed,true);
  }finally{await f.close();}
});

test('unverified, old, disabled and forged boxes cannot be issued/opened',async()=>{
  const f=await fixture();try{
    assert.equal((await f.status(2)).canIssue,false);await assert.rejects(f.issue(2),e=>e.code==='SECOND_VERIFICATION_REQUIRED');
    await f.pg.exec("UPDATE users SET created_at='2020-01-01 00:00:00' WHERE id=1");
    await assert.rejects(f.issue(),e=>e.code==='EXPIRED');
    await f.pg.exec("INSERT INTO cnine_user_inventory VALUES(2,'NEW_USER_GIFT_BOX',1,1,NULL)");
    await assert.rejects(f.open(2),e=>e.code==='NOT_ISSUED');
    await f.pg.exec("UPDATE users SET created_at=sqlite_now() WHERE id=1;UPDATE inventory_items SET is_active=0");
    await assert.rejects(f.issue(),e=>e.code==='GIFT_DISABLED');
    await ensureNewUserGift(f.env);assert.equal(Number((await f.row('SELECT is_active FROM inventory_items')).is_active),0);
    await ensureNewUserGift({DB:new __postgresCompatTest.PostgresD1Database(f.env.DB.client)});
    assert.equal(Number((await f.row('SELECT is_active FROM inventory_items')).is_active),0);
    assert.match((await f.row('SELECT description FROM inventory_items')).description,/슈퍼스타 전체 각 1장 \+11.*미스틱 장비 4종과 소버린 SKS/);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM new_user_gift_receipts_v1')).n),0);
  }finally{await f.close();}
});

test('verification unlink/account deletion/relink cannot reset once-only identity entitlement',async()=>{
  const f=await fixture();try{
    await f.issue();await f.pg.exec('DELETE FROM user_second_verifications WHERE user_id=1');
    await assert.rejects(f.open(),e=>e.code==='SECOND_VERIFICATION_REQUIRED');
    await f.pg.exec("INSERT INTO user_second_verifications VALUES(2,'PLAYDK','uuid-1',sqlite_now()); DELETE FROM users WHERE id=1");
    assert.equal((await f.status(2)).eligibility.code,'IDENTITY_ALREADY_ISSUED');
    await assert.rejects(f.issue(2),e=>e.code==='IDENTITY_ALREADY_ISSUED');
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM new_user_gift_receipts_v1')).n),1);
  }finally{await f.close();}
});

test('issued box is not silently expired after day 7; new catalog additions do not change its snapshot',async()=>{
  const f=await fixture();try{
    await f.issue();await f.pg.exec("UPDATE users SET created_at='2020-01-01 00:00:00' WHERE id=1; INSERT INTO magic_cards VALUES(4,'M4','후속 신규',1)");
    const r=await f.open();assert.equal(r.summary.magic,2);
  }finally{await f.close();}
});

async function makeLegacyReceipt(f) {
  const {rewards}=await f.issue();
  const legacy={version:1,coin:NEW_USER_GIFT_COIN,cardLevel:10,magicLevel:5,
    cards:rewards.cards.filter(c=>c.grade!=='SUPERSTAR').map(({level,...c})=>c),magic:rewards.magic,
    equipment:['EQ_1785961398598','EQ_1785961420255','EQ_1785961440314','EQ_1786908918550','EQ_1785961300455'].map((code,i)=>({id:101+i,code,name:'이전 장비'}))};
  const manifest=JSON.stringify(legacy),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(manifest))).toString('hex');
  await f.pg.query('UPDATE new_user_gift_receipts_v1 SET manifest_json=$1,manifest_hash=$2',[manifest,hash]);
  return {legacy,manifest,hash};
}

test('unopened legacy box upgrades once, snapshots new contents and replays without duplicate grants',async()=>{
  const f=await fixture();try{
    const old=await makeLegacyReceipt(f);
    assert.equal((await refreshIssuedNewUserGiftContents(f.env)).updated,1);
    assert.equal((await refreshIssuedNewUserGiftContents(f.env)).updated,0);
    const status=await f.status();
    assert.equal(status.rewards.version,2);assert.equal(status.rewards.previousManifestHash,old.hash);
    assert.equal(status.rewards.cards.length,5);assert.equal(status.canOpen,true);
    const upgraded=await f.row('SELECT manifest_json,manifest_hash,issued_at,request_id FROM new_user_gift_receipts_v1');
    await f.pg.exec("INSERT INTO cards(id,title,rarity,is_active,card_status,member_id) VALUES('S3','나중 추가','SUPERSTAR',1,'PUBLIC',1)");
    assert.equal((await f.issue()).rewards.cards.length,5);
    const r=await f.open();assert.equal(r.summary.superstar,2);
    assert.deepEqual(await f.row('SELECT manifest_json,manifest_hash,issued_at,request_id FROM new_user_gift_receipts_v1'),upgraded);
    assert.equal((await f.open()).replayed,true);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),5);
  }finally{await f.close();}
});

test('direct legacy opening rolls back contents upgrade on failure; completed old boxes stay unchanged',async()=>{
  const f=await fixture();try{
    const old=await makeLegacyReceipt(f);
    f.setFault('INSERT INTO coin_logs');await assert.rejects(f.open());f.setFault(null);
    assert.equal((await f.row('SELECT manifest_hash FROM new_user_gift_receipts_v1')).manifest_hash,old.hash);
    assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_cards')).n),0);
    const historical={ok:true,replayed:false,coin:NEW_USER_GIFT_COIN,rewards:old.legacy};
    await f.pg.query("UPDATE new_user_gift_receipts_v1 SET status='OPENED',result_json=$1",[JSON.stringify(historical)]);
    assert.equal((await f.status()).rewards.version,1);
    assert.equal((await f.issue()).rewards.version,1);
    assert.deepEqual(await f.open(),{...historical,replayed:true});
    assert.equal((await f.row('SELECT manifest_hash FROM new_user_gift_receipts_v1')).manifest_hash,old.hash);
  }finally{await f.close();}
});

test('missing superstar catalog and tampered legacy receipts cannot be silently upgraded',async()=>{
  const f=await fixture();try{
    await makeLegacyReceipt(f);
    await f.pg.exec("UPDATE cards SET is_active=0 WHERE rarity='SUPERSTAR'");
    await assert.rejects(f.status(),e=>e.code==='CATALOG_INVALID');
    await f.pg.exec("UPDATE cards SET is_active=1 WHERE rarity='SUPERSTAR'; UPDATE new_user_gift_receipts_v1 SET manifest_hash='invalid'");
    await assert.rejects(f.status(),e=>e.code==='RECEIPT_INVALID');
    assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
  }finally{await f.close();}
});

test('shared player/CMS reward view matches the issued manifest including historical +10 boxes',()=>{
  const context={window:{}};runInNewContext(readFileSync(new URL('../js/new-user-gift-v2075.js',import.meta.url),'utf8'),context);
  const rewardsHtml=context.window.NewUserGiftV2075.rewardsHtml;
  const cards=[{grade:'SUPERSTAR',title:'별',level:11},{grade:'FUR',title:'불',level:13},{grade:'ZENITH',title:'빛',level:13}];
  const html=rewardsHtml({version:2,coin:NEW_USER_GIFT_COIN,cardLevels:{SUPERSTAR:11,FUR:13,ZENITH:13},magicLevel:5,cards,magic:[{name:'마법'}],equipment:NEW_USER_GIFT_EQUIPMENT});
  assert.match(html,/슈퍼스타 전체 1종.*각 1장 · \+11/);assert.match(html,/제니스 전체 1종.*각 1장 · \+13/);
  assert.match(html,/미스틱 장비 4종 \+ 소버린 SKS/);assert.match(html,/\[FUR\] 불 \+13/);assert.doesNotMatch(html,/\+10|프라임|M200/);
  const old=rewardsHtml({version:1,coin:NEW_USER_GIFT_COIN,cardLevel:10,magicLevel:5,cards:cards.slice(1).map(({level,...c})=>c),magic:[],equipment:[]});
  assert.match(old,/프라임 방어구 4종 \+ M200/);assert.match(old,/\[FUR\] 불 \+10/);assert.doesNotMatch(old,/슈퍼스타|undefined/);
});

test('missing/private/retired reward, depleted limited stock and corrupt manifest fail without consumption',async()=>{
  for(const mutation of ["UPDATE character_equipment_items SET is_public=0 WHERE id=1", "UPDATE cards SET is_active=0 WHERE id='F1'", "UPDATE magic_cards SET is_active=0 WHERE id=1", "UPDATE cards SET limited_total=0 WHERE id='F1'", "UPDATE new_user_gift_receipts_v1 SET manifest_json='{}'"]){
    const f=await fixture();try{
      await f.issue();await f.pg.exec(mutation);await assert.rejects(f.open());
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),3000);
      assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
      assert.equal((await f.row('SELECT status FROM new_user_gift_receipts_v1')).status,'ISSUED');
      for(const table of ['user_cards','user_magic_cards','user_equipment_instances','coin_logs'])assert.equal(Number((await f.row(`SELECT COUNT(*) n FROM ${table}`)).n),0);
    }finally{await f.close();}
  }
});

test('audit failures, zero-row equipment grants and final receipt failures roll back every write',async()=>{
  for(const fault of ['INSERT INTO admin_logs','INSERT INTO coin_logs',"SET status='OPENED'",'zero-equipment']){
    const f=await fixture();try{
      if(fault==='INSERT INTO admin_logs'){
        f.setFault(fault);await assert.rejects(f.issue());
        assert.equal(Number((await f.row('SELECT COUNT(*) n FROM new_user_gift_receipts_v1')).n),0);
        assert.equal(Number((await f.row('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);
      }else{
        await f.issue();
        if(fault==='zero-equipment')await f.pg.exec('CREATE FUNCTION qa_drop_instance() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END;$$; CREATE TRIGGER qa_drop BEFORE INSERT ON user_equipment_instances FOR EACH ROW EXECUTE FUNCTION qa_drop_instance()');
        else f.setFault(fault);
        await assert.rejects(f.open());
        assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
        assert.equal((await f.row('SELECT status FROM new_user_gift_receipts_v1')).status,'ISSUED');
        for(const table of ['user_cards','user_magic_cards','user_equipment_instances','coin_logs'])assert.equal(Number((await f.row(`SELECT COUNT(*) n FROM ${table}`)).n),0);
      }
      assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),3000);
    }finally{await f.close();}
  }
});

test('route permissions block anonymous/users before schema work and reject unsupported methods',async()=>{
  const request=new Request('https://qa.test/api/admin/users/new-user-gift?userId=1');
  const denied=await handleNewUserGift({path:'admin/users/new-user-gift',request,env:{},deps:{requirePermission:async()=>null,json:(body,status)=>({body,status})}});
  assert.equal(denied.status,403);
  const f=await fixture();try{
    const deps={authenticate:async()=>({id:1}),requirePermission:async()=>admin,json:(body,status=200)=>({body,status}),readBody:r=>r.json(),ensureSecondVerificationFoundation:async()=>{}};
    const status=await handleNewUserGift({path:'admin/users/new-user-gift',request,env:f.env,deps});assert.equal(status.status,200);assert.equal(status.body.canIssue,true);
    const wrong=await handleNewUserGift({path:'new-user-gift/open',request,env:f.env,deps});assert.equal(wrong.status,405);
  }finally{await f.close();}
});

test('client/CMS integrations load versioned assets and generic inventory grant cannot bypass the dedicated route',()=>{
  const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(read('index.html'),/js\/new-user-gift-v2075\.js\?v=20261004-first-verify-14days/);
  assert.match(read('admin/index.html'),/\.\.\/js\/new-user-gift-v2075\.js\?v=20261004-first-verify-14days/);
  assert.match(read('js/app.js'),/itemCode==='NEW_USER_GIFT_BOX'.*NewUserGiftV2075.open/);
  assert.match(read('functions/api/[[path]].js'),/if\(itemCode===NEW_USER_GIFT_CODE\)return json/);
  assert.match(read('admin/new-user-gift-v2075.js'),/USER|userDialog/);
  assert.match(read('js/new-user-gift-v2075.js'),/new-user-gift\/open/);
});
