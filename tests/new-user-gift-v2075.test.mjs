import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { giftEligibility, giftTimestamp, NEW_USER_GIFT_CODE, NEW_USER_GIFT_COIN, NEW_USER_GIFT_EQUIPMENT,
  ensureNewUserGift, newUserGiftStatus, issueNewUserGift, openNewUserGift, handleNewUserGift } from '../functions/_new_user_gift.js';

const admin = { id: 99, role: 'OWNER' };
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

test('7 days uses the real UTC signup timestamp, rejects missing/future/malformed dates and missing secondary verification', () => {
  const now = '2026-09-09T10:00:00Z', user = {status:'ACTIVE',created_at:'2026-09-02 10:00:00'}, verification={provider:'PLAYDK',provider_user_id:'uuid',verified_at:'2026-09-09 09:00:00'};
  assert.equal(giftEligibility(user,verification,now).eligible,true);
  assert.equal(giftEligibility({...user,created_at:'2026-09-02 09:59:59'},verification,now).code,'EXPIRED');
  for(const created_at of ['', '2026-02-30 10:00:00','2026-09-09','2026-09-10T00:00:00Z']) assert.equal(giftEligibility({...user,created_at},verification,now).code,'JOIN_DATE_INVALID');
  assert(Number.isNaN(giftTimestamp('2026-02-30T10:00:00Z')));
  assert.equal(giftTimestamp('2026-09-09T19:00:00+09:00'),Date.parse(now));
  assert.equal(giftEligibility(user,null,now).code,'SECOND_VERIFICATION_REQUIRED');
  assert.equal(giftEligibility(user,{...verification,provider:'UNTRUSTED'},now).eligible,false);
  assert.equal(giftEligibility(user,{...verification,provider:'WAGO'},now).eligible,true);
});

test('CMS checks actual signup and verified status; request fields cannot alter reward contents',async()=>{
  const f=await fixture();try{
    const s=await f.status();assert.equal(s.canIssue,true);assert.equal(s.rewards.cards.length,3);assert.equal(s.rewards.magic.length,2);assert.equal(s.rewards.equipment.length,5);
    const granted=await f.issue(1,{coin:999999999999999,cardLevel:99,days:999});
    assert.equal(granted.rewards.coin,10000000000);assert.equal(granted.rewards.cardLevel,10);
    assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),3000);
    assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory')).quantity),1);
    const state=await f.status();assert.equal(state.canIssue,false);assert.equal(state.canOpen,true);
    assert.equal(Number((await f.row('SELECT COUNT(*) n FROM admin_logs')).n),1);
    assert.equal(state.eligibility.code,'ALREADY_ISSUED');
  }finally{await f.close();}
});

test('whole box opens atomically, grants actual +10/+5 and five instances, preserves stronger levels and loadouts',async()=>{
  const f=await fixture();try{
    await f.pg.exec("INSERT INTO user_cards VALUES(1,'F1',2,13,6,NULL),(1,'F2',1,4,3,NULL); INSERT INTO user_magic_cards VALUES(1,1,2,7,NULL),(1,2,0,9,NULL)");
    await f.issue();const r=await f.open();
    assert.equal(r.coin,NEW_USER_GIFT_COIN);assert.equal(r.coinAfter,10000003000);assert.deepEqual(r.summary,{fur:2,zenith:1,magic:2,equipment:5});
    assert.equal(Number((await f.row("SELECT breakthrough_level FROM user_cards WHERE card_id='F1'")).breakthrough_level),13);
    assert.equal(Number((await f.row("SELECT breakthrough_fail_count FROM user_cards WHERE card_id='F1'")).breakthrough_fail_count),6);
    assert.equal(Number((await f.row("SELECT quantity FROM user_cards WHERE card_id='F1'")).quantity),3);
    assert.equal(Number((await f.row("SELECT breakthrough_level FROM user_cards WHERE card_id='F2'")).breakthrough_level),10);
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
  assert.match(read('index.html'),/js\/new-user-gift-v2075\.js\?v=2075/);
  assert.match(read('admin/index.html'),/new-user-gift-v2075\.js\?v=2075/);
  assert.match(read('js/app.js'),/itemCode==='NEW_USER_GIFT_BOX'.*NewUserGiftV2075.open/);
  assert.match(read('functions/api/[[path]].js'),/if\(itemCode===NEW_USER_GIFT_CODE\)return json/);
  assert.match(read('admin/new-user-gift-v2075.js'),/USER|userDialog/);
  assert.match(read('js/new-user-gift-v2075.js'),/new-user-gift\/open/);
});
