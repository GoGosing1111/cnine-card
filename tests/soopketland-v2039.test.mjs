import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleSoopketLand,redeemLandCoupon,landAccess,LAND_TICKET,HYPER_TICKET,LAND_PRIZES,LAND_STREAMERS,LAND_IYEJUN_PRIZE,LAND_IYEJUN_CARD_ID,pickLandPrize,validateLandWeights,storedLandWeights} from '../functions/_soopket_land.js';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

class Statement{
  constructor(owner,sql,args=[]){Object.assign(this,{owner,sql,args})}
  bind(...args){return new Statement(this.owner,this.sql,args)}
  first(){return this.owner.db.prepare(this.sql).get(...this.args)||null}
  all(){return {results:this.owner.db.prepare(this.sql).all(...this.args)}}
  run(){const q=this.owner.db.prepare(this.sql);return q.columns().length?this.all():{meta:{changes:Number(q.run(...this.args).changes)}}}
}
class DB{
  constructor(db){this.db=db;this.recorded=[]}
  prepare(sql){return new Statement(this,sql)}
  batch(list){this.recorded.push(...list);this.db.exec('BEGIN IMMEDIATE');try{const r=list.map(s=>s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
}
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'PLAYER',status TEXT DEFAULT 'ACTIVE',banned_until TEXT,coin INTEGER DEFAULT 0);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE user_messages(id INTEGER PRIMARY KEY,user_id INTEGER,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,coupon_code TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));
    CREATE TABLE members(id INTEGER PRIMARY KEY,is_active INTEGER,name TEXT DEFAULT '테스트');
    CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,image_url TEXT,member_id INTEGER,is_active INTEGER,card_status TEXT,limited_total INTEGER DEFAULT NULL);
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER DEFAULT 0,first_obtained_at TEXT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
    INSERT INTO users(id,nickname,role) VALUES(1,'OWNER','OWNER');
    INSERT INTO users(id,nickname) VALUES(20,'시청자1'),(21,'시청자2'),(22,'시청자3');
    INSERT INTO members(id,is_active) VALUES(1,1);
    INSERT INTO cards(id,title,rarity,image_url,member_id,is_active,card_status) VALUES('z1','제니스 테스트','ZENITH','test.png',1,1,'PUBLIC'),('z2','퇴사','ZENITH','',1,1,'RETIRED'),('f1','FUR 테스트','FUR','test.png',1,1,'PUBLIC');
  `);
  LAND_STREAMERS.forEach((n,i)=>sqlite.prepare('INSERT INTO users(id,nickname) VALUES(?,?)').run(i+2,n));
  for(const code of ['MASTER_STAR','BLACK_MIRACLE_PACK','HIGH_GRADE_REROLL_TICKET'])sqlite.prepare('INSERT INTO inventory_items(code,is_active) VALUES(?,1)').run(code);
  const db=new DB(sqlite),env={DB:db},current={id:1};let invalidations=0;
  const deps={authenticate:async()=>sqlite.prepare('SELECT * FROM users WHERE id=?').get(current.id),readBody:async r=>r.body,json:(body,status=200)=>({body,status}),profile:async(e,u)=>u,isRandomDrawExcluded:()=>false,cleanBurningEventSettings:raw=>({pveMaxEnergy:30,pvpMaxEnergy:30,rechargeMinutes:1,generation:0,...raw}),invalidateBurning:()=>invalidations++};
  const call=(path='state',body=null,method=body?'POST':'GET')=>handleSoopketLand({path:`soopketland/${path}`,request:{method,body},env,deps});
  await call();
  const grant=(quantity=1,couponUses=1,userId=2,id=crypto.randomUUID())=>call('grant',{requestId:id,userId,quantity,couponUses});
  const weights=key=>Object.fromEntries(LAND_PRIZES.map(p=>[p.key,p.key===key?10:0]));
  const force=key=>call('settings',{requestId:crypto.randomUUID(),weights:weights(key)});
  const spin=(id=crypto.randomUUID())=>call('spin',{requestId:id});
  const redeem=(code,userId=20,operationKey=crypto.randomUUID())=>redeemLandCoupon({env,user:sqlite.prepare('SELECT * FROM users WHERE id=?').get(userId),body:{code,operationKey},deps});
  const qty=(code,id=2)=>sqlite.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').get(id,code)?.quantity||0;
  return {sqlite,db,env,deps,current,call,grant,force,spin,redeem,qty,weights,invalidations:()=>invalidations};
}

test('private stable ID access binds exactly five accounts; OWNER allowed; rename does not transfer access',async()=>{
  const f=await fixture();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM soopketland_accounts').get().n,5);
  f.current.id=20;assert.equal((await f.call()).status,403);assert.equal((await f.call('access')).body.allowed,false);
  f.sqlite.exec("UPDATE users SET nickname='변경된 이름' WHERE id=2; UPDATE users SET nickname='진짜디임' WHERE id=20");
  f.current.id=1;await f.call();f.current.id=2;assert.equal((await f.call()).status,200);f.current.id=20;assert.equal((await f.call()).status,403);
  f.sqlite.exec("UPDATE users SET status='BANNED' WHERE id=2");f.current.id=2;assert.equal((await f.call()).status,403);
});
test('no daily free rolls; only owner-issued lots, including inventory-only forged tickets, can play',async()=>{
  const f=await fixture();f.current.id=2;assert.equal((await f.spin()).body.code,'LAND_NO_TICKET');assert.equal((await f.grant()).status,403);
  f.sqlite.prepare('INSERT INTO cnine_user_inventory VALUES(?,?,50,50,NULL,NULL)').run(2,LAND_TICKET);assert.equal((await f.spin()).body.code,'LAND_NO_TICKET');
});
test('OWNER grants are idempotent, scoped to registered accounts, audited and cannot be reused for a changed request',async()=>{
  const f=await fixture(),id=crypto.randomUUID();assert.equal((await f.grant(3,10,2,id)).status,200);assert.equal(f.qty(LAND_TICKET),3);
  assert.equal((await f.grant(3,10,2,id)).body.replayed,true);assert.equal(f.qty(LAND_TICKET),3);
  assert.equal((await f.grant(4,10,2,id)).body.code,'LAND_REQUEST_MISMATCH');assert.equal((await f.grant(1,1,20)).status,403);
  assert.equal((await f.grant(-1)).status,400);assert.equal((await f.grant(1,0)).status,400);
});
test('spin atomically spends one ticket and sends viewer coupon, without crediting streamer; lost-response replay is identical',async()=>{
  const f=await fixture();await f.force('COIN');await f.grant(2,3);f.current.id=2;const id=crypto.randomUUID(),first=await f.spin(id),again=await f.spin(id);
  assert.equal(first.status,200);assert.equal(again.body.replayed,true);assert.equal(first.body.code,again.body.code);assert.equal(f.qty(LAND_TICKET),1);
  assert.equal(f.sqlite.prepare('SELECT coin FROM users WHERE id=2').get().coin,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM soopketland_coupons').get().n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM user_messages WHERE coupon_code IS NOT NULL').get().n,1);
  assert.equal(first.body.couponUses,3);f.current.id=3;assert.equal((await f.spin(id)).status,409);
});
test('message insert failure rolls back ticket, lot, coupon and roll receipt',async()=>{
  const f=await fixture();await f.grant();await f.force('COIN');f.current.id=2;
  f.sqlite.exec("CREATE TRIGGER message_fault BEFORE INSERT ON user_messages BEGIN SELECT RAISE(ABORT,'message offline'); END");
  await assert.rejects(()=>f.spin(),/message offline/);assert.equal(f.qty(LAND_TICKET),1);
  assert.equal(f.sqlite.prepare('SELECT remaining FROM soopketland_ticket_lots').get().remaining,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM soopketland_coupons').get().n,0);
});
test('each viewer can redeem once; cap is exact; retry does not pay twice',async()=>{
  const f=await fixture();await f.force('COIN');await f.grant(1,2);f.current.id=2;const roll=(await f.spin()).body,id=crypto.randomUUID();
  const first=await f.redeem(roll.code,20,id);assert.equal(first.status,200);assert.equal((await f.redeem(roll.code,20,id)).body.replayed,true);
  assert.equal((await f.redeem(roll.code,20)).body.code,'LAND_ALREADY_REDEEMED');assert.equal((await f.redeem(roll.code,21)).status,200);assert.equal((await f.redeem(roll.code,22)).body.code,'LAND_COUPON_EXHAUSTED');
  assert.equal(f.sqlite.prepare('SELECT coin FROM users WHERE id=20').get().coin,roll.prize.amount);
});
test('disabled coupons stop new redemptions without deleting earned rewards',async()=>{
  const f=await fixture();await f.force('MASTER_STAR');await f.grant(1,3);f.current.id=2;const {code}= (await f.spin()).body;await f.redeem(code);f.current.id=1;
  assert.equal((await f.call('coupon/disable',{requestId:crypto.randomUUID(),code})).status,200);assert.equal((await f.redeem(code,21)).status,404);assert.ok(f.qty('MASTER_STAR',20)>=1000);
});
test('missing inventory catalog row never consumes coupon; log failure rolls back coin and claim',async()=>{
  const f=await fixture();await f.force('BLACK_MIRACLE_PACK');await f.grant();f.current.id=2;const {code}= (await f.spin()).body;
  f.sqlite.exec("DELETE FROM inventory_items WHERE code='BLACK_MIRACLE_PACK'");assert.equal((await f.redeem(code)).status,409);
  assert.equal(f.sqlite.prepare('SELECT used_count FROM soopketland_coupons').get().used_count,0);
  f.current.id=1;await f.force('COIN');await f.grant();f.current.id=2;const roll=(await f.spin()).body;
  f.sqlite.exec("CREATE TRIGGER coin_fault BEFORE INSERT ON coin_logs BEGIN SELECT RAISE(ABORT,'log offline'); END");await assert.rejects(()=>f.redeem(roll.code),/log offline/);
  assert.equal(f.sqlite.prepare('SELECT coin FROM users WHERE id=20').get().coin,0);
});
test('ZENITH/FUR coupon grants a public active card and preserves existing enhancement; empty pools preserve coupon',async()=>{
  const f=await fixture();await f.force('ZENITH_RANDOM_CARD');await f.grant(1,2);f.current.id=2;const {code}=(await f.spin()).body;
  couponAmount(f,code,1);
  f.sqlite.exec("INSERT INTO user_cards VALUES(20,'z1',1,13,NULL,NULL)");const r=await f.redeem(code);assert.equal(r.body.card.id,'z1');assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards WHERE user_id=20').get().quantity,2);assert.equal(f.sqlite.prepare('SELECT breakthrough_level FROM user_cards WHERE user_id=20').get().breakthrough_level,13);
  f.sqlite.exec("UPDATE cards SET is_active=0 WHERE id='z1'");assert.equal((await f.redeem(code,21)).body.code,'LAND_POOL_EMPTY');assert.equal(f.sqlite.prepare('SELECT used_count FROM soopketland_coupons').get().used_count,1);
  f.current.id=1;await f.force('FUR_RANDOM_CARD');await f.grant();f.current.id=2;const fur=(await f.spin()).body;couponAmount(f,fur.code,1);assert.equal((await f.redeem(fur.code)).body.card.id,'f1');
});
test('Hyper ticket goes only to streamer inventory; activation is server-wide 15x/60min and idempotent',async()=>{
  const f=await fixture();await f.force(HYPER_TICKET);await f.grant();f.current.id=2;const roll=(await f.spin()).body;
  assert.equal(roll.code,null);assert.equal(roll.delivery,'STREAMER_INVENTORY');assert.equal(f.qty(HYPER_TICKET),1);
  const body={requestId:crypto.randomUUID()},response=await f.call('hyper/activate',body);assert.equal(response.status,200);assert.equal(f.qty(HYPER_TICKET),0);
  const settings=JSON.parse(f.sqlite.prepare("SELECT value FROM app_meta WHERE key='hyper_burning_event_settings_v1310'").get().value);
  assert.equal(settings.battleRewardMultiplier,15);assert.equal(Date.parse(settings.endsAt)-Date.parse(settings.activatedAt),3600000);
  assert.equal((await f.call('hyper/activate',body)).body.replayed,true);assert.equal(f.invalidations(),1);
});
test('active burning and unauthorized accounts cannot consume or overwrite activation',async()=>{
  const f=await fixture();await f.force(HYPER_TICKET);await f.grant();f.current.id=2;await f.spin();
  f.sqlite.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').run('burning_event_settings_v1',JSON.stringify({enabled:true,endsAt:new Date(Date.now()+600000).toISOString()}));
  assert.equal((await f.call('hyper/activate',{requestId:crypto.randomUUID()})).body.code,'LAND_BURNING_ACTIVE');assert.equal(f.qty(HYPER_TICKET),1);
  f.current.id=20;assert.equal((await f.call('hyper/activate',{requestId:crypto.randomUUID()})).status,403);
});
test('prize bounds, amounts and weight validation are deterministic and server-only',()=>{
  const weights=Object.fromEntries(LAND_PRIZES.map(p=>[p.key,1]));assert.deepEqual(validateLandWeights(weights),weights);
  assert.throws(()=>validateLandWeights({...weights,COIN:-1}));assert.throws(()=>validateLandWeights(Object.fromEntries(LAND_PRIZES.map(p=>[p.key,0]))));
  for(const p of LAND_PRIZES){const w=Object.fromEntries(LAND_PRIZES.map(q=>[q.key,q===p?1:0]));assert.equal(pickLandPrize(w,()=>0).amount,p.min*p.unit);assert.equal(pickLandPrize(w,max=>max-1).amount,p.max*p.unit)}
});
test('concurrent requests cannot double-spend the last ticket or overrun a one-person coupon',async()=>{
  const f=await fixture();await f.force('COIN');await f.grant();f.current.id=2;
  const result=await Promise.all([f.spin(),f.spin()]);assert.equal(result.filter(r=>r.status===200).length,1);assert.equal(f.qty(LAND_TICKET),0);
  const code=result.find(r=>r.status===200).body.code,claims=await Promise.all([f.redeem(code,20),f.redeem(code,21)]);
  assert.equal(claims.filter(r=>r.status===200).length,1);assert.equal(f.sqlite.prepare('SELECT used_count FROM soopketland_coupons').get().used_count,1);
});
test('concurrent replay of identical grant and roll identifiers returns one durable receipt',async()=>{
  const f=await fixture(),grantId=crypto.randomUUID();const grants=await Promise.all([f.grant(2,1,2,grantId),f.grant(2,1,2,grantId)]);assert.ok(grants.every(r=>r.status===200));assert.equal(f.qty(LAND_TICKET),2);
  await f.force('MASTER_STAR');f.current.id=2;const id=crypto.randomUUID(),spins=await Promise.all([f.spin(id),f.spin(id)]);assert.ok(spins.every(r=>r.status===200));assert.equal(spins[0].body.code,spins[1].body.code);assert.equal(f.qty(LAND_TICKET),1);
});
test('all stopped, finite-edition and globally excluded random cards preserve unused coupons',async()=>{
  const f=await fixture();await f.force('FUR_RANDOM_CARD');await f.grant(1,2);f.current.id=2;const {code}=(await f.spin()).body;
  f.sqlite.exec("UPDATE cards SET limited_total=10 WHERE id='f1'");assert.equal((await f.redeem(code)).body.code,'LAND_POOL_EMPTY');
  f.sqlite.exec("UPDATE cards SET limited_total=NULL WHERE id='f1'");f.deps.isRandomDrawExcluded=()=>true;assert.equal((await f.redeem(code)).body.code,'LAND_POOL_EMPTY');assert.equal(f.sqlite.prepare('SELECT used_count FROM soopketland_coupons').get().used_count,0);
});
test('client integration is shared, recovers pending requests, and never renders a self-redeem action for event codes',()=>{
  const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'),app=read('js/app.js'),live=read('js/soopketland-v2039.src.js'),index=read('index.html'),api=read('functions/api/[[path]].js');
  assert.match(app,/data-copy-event-coupon/);assert.match(app,/activateLandHyperTicket/);assert.match(app,/soopketland:\{/);assert.match(index,/js\/app\.js\?v=2053-player-calling-card/);
  assert.match(live,/PachinkoStage/);assert.match(live,/setTimeout\(finish,12000\)/);assert.match(live,/savePending\(requestId\)/);assert.match(live,/document.hidden/);
  assert.ok(api.indexOf('const landResponse=')<api.indexOf('const couponSchemaPath='),'land endpoints must not wait for legacy global upgrade');
  assert.match(read('preview/soopketland-v2039/index.html'),/soopketland-v2039\.bundle\.js/);
});
test('PostgreSQL translates every captured statement with matched binds; new transactions use real row locks',async()=>{
  const f=await fixture();await f.force('COIN');await f.grant();f.current.id=2;const roll=await f.spin();await f.redeem(roll.body.code);
  for(const s of f.db.recorded){assert.ok(s.args.length<=100);const sql=__postgresCompatTest.translateDialect(s.sql);assert.equal((sql.match(/\?/g)||[]).length,s.args.length)}
  const source=fs.readFileSync(new URL('../functions/_soopket_land.js',import.meta.url),'utf8');assert.match(source,/SELECT code FROM soopketland_coupons WHERE code=\? FOR UPDATE/);assert.match(source,/SELECT key FROM app_meta WHERE key IN/);
});

function couponAmount(f,code,amount){
  const prize=JSON.parse(f.sqlite.prepare('SELECT reward_json FROM soopketland_coupons WHERE code=?').get(code).reward_json);
  f.sqlite.prepare('UPDATE soopketland_coupons SET reward_json=? WHERE code=?').run(JSON.stringify({...prize,amount}),code);
}
function addIyejun(f){
  f.sqlite.prepare("INSERT INTO cards(id,title,rarity,image_url,member_id,is_active,card_status) VALUES(?,'철구','FUR','iyejun.png',1,1,'PUBLIC')").run(LAND_IYEJUN_CARD_ID);
}

test('expanded prize bounds are exact, inclusive and keep the original minimum/step',()=>{
  const expected={COIN:[1,20,100000000],MASTER_STAR:[1,15,1000],BLACK_MIRACLE_PACK:[1,10,1],FUR_RANDOM_CARD:[1,5,1],ZENITH_RANDOM_CARD:[1,3,1],IYEJUN_CARD:[1,1,1]};
  for(const [key,bounds] of Object.entries(expected)){
    const prize=LAND_PRIZES.find(p=>p.key===key);assert.deepEqual([prize.min,prize.max,prize.unit],bounds);
    const weights=Object.fromEntries(LAND_PRIZES.map(p=>[p.key,p.key===key?1:0]));
    for(let step=0;step<=prize.max-prize.min;step++){let calls=0;assert.equal(pickLandPrize(weights,()=>calls++?step:0).amount,(prize.min+step)*prize.unit)}
  }
});
test('default Iyejun chance is exactly 3%, strictly lowest, and spans precisely 210 of 7000 outcomes',async()=>{
  const f=await fixture(),state=(await f.call()).body,weights=state.owner.weights;
  assert.equal(state.prizes.length,8);assert.equal(state.prizes.find(p=>p.key===LAND_IYEJUN_PRIZE).percent,3);
  assert.ok(state.prizes.filter(p=>p.key!==LAND_IYEJUN_PRIZE).every(p=>p.percent>3));
  let wins=0;for(let roll=0;roll<7000;roll++){let calls=0;if(pickLandPrize(weights,()=>calls++?0:roll).key===LAND_IYEJUN_PRIZE)wins++}assert.equal(wins,210);
});
test('legacy seven-prize settings stay usable until activation but stale OWNER saves cannot erase the new prize',async()=>{
  const f=await fixture(),legacy=Object.fromEntries(LAND_PRIZES.filter(p=>p.key!==LAND_IYEJUN_PRIZE).map(p=>[p.key,10]));
  assert.equal(storedLandWeights(legacy)[LAND_IYEJUN_PRIZE],0);assert.throws(()=>validateLandWeights(legacy));
  f.sqlite.prepare("UPDATE app_meta SET value=? WHERE key='soopketland_settings_v2039'").run(JSON.stringify({weights:legacy}));
  const state=(await f.call()).body;assert.equal(state.prizes.find(p=>p.key===LAND_IYEJUN_PRIZE).percent,0);
  assert.equal((await f.call('settings',{requestId:crypto.randomUUID(),weights:legacy})).status,400);
  await f.grant();f.current.id=2;assert.equal((await f.spin()).status,200);
});
test('20억 coins, 15000 stars and 10 Black Miracles credit exactly once per viewer without touching pack settings',async()=>{
  for(const [key,amount] of [['COIN',2000000000],['MASTER_STAR',15000],['BLACK_MIRACLE_PACK',10]]){
    const f=await fixture();await f.force(key);await f.grant(1,2);f.current.id=2;const {code}=(await f.spin()).body;couponAmount(f,code,amount);
    const id=crypto.randomUUID();assert.equal((await f.redeem(code,20,id)).body.rewardAmount,amount);assert.equal((await f.redeem(code,20,id)).body.replayed,true);
    assert.equal(key==='COIN'?f.sqlite.prepare('SELECT coin FROM users WHERE id=20').get().coin:f.qty(key,20),amount);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM app_meta WHERE key LIKE '%miracle%'").get().n,0);
  }
});
test('maximum random card prizes deliver all copies, preserve enhancement, and replay cannot add copies',async()=>{
  for(const [key,amount,id] of [['FUR_RANDOM_CARD',5,'f1'],['ZENITH_RANDOM_CARD',3,'z1']]){
    const f=await fixture();await f.force(key);await f.grant();f.current.id=2;const {code}=(await f.spin()).body;couponAmount(f,code,amount);
    f.sqlite.prepare('INSERT INTO user_cards VALUES(?,?,2,13,NULL,NULL)').run(20,id);
    const requestId=crypto.randomUUID(),r=await f.redeem(code,20,requestId);assert.equal(r.status,200);assert.equal(r.body.rewardAmount,amount);assert.equal(r.body.cards.reduce((n,c)=>n+c.quantity,0),amount);
    assert.match(r.body.message,new RegExp(`${amount}장`));const card=f.sqlite.prepare('SELECT * FROM user_cards WHERE user_id=20').get();assert.equal(card.quantity,amount+2);assert.equal(card.breakthrough_level,13);
    assert.equal((await f.redeem(code,20,requestId)).body.replayed,true);assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards WHERE user_id=20').get().quantity,amount+2);
    for(const s of f.db.recorded)assert.equal((__postgresCompatTest.translateDialect(s.sql).match(/\?/g)||[]).length,s.args.length);
  }
});
test('each card is independently sampled and a later card insert failure rolls back the whole coupon',async t=>{
  const f=await fixture();f.sqlite.exec("INSERT INTO cards VALUES('f2','두번째 FUR','FUR','test.png',1,1,'PUBLIC',NULL)");
  await f.force('FUR_RANDOM_CARD');await f.grant();f.current.id=2;const {code}=(await f.spin()).body;couponAmount(f,code,5);
  let counter=0;t.mock.method(crypto,'getRandomValues',buffer=>{buffer[0]=counter++%2;return buffer});
  f.sqlite.exec("CREATE TRIGGER card_fault BEFORE INSERT ON user_cards WHEN NEW.card_id='f2' BEGIN SELECT RAISE(ABORT,'card insert offline'); END");
  await assert.rejects(()=>f.redeem(code),/card insert offline/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM user_cards').get().n,0);assert.equal(f.sqlite.prepare('SELECT used_count FROM soopketland_coupons').get().used_count,0);
  f.sqlite.exec('DROP TRIGGER card_fault');counter=0;const r=await f.redeem(code);assert.equal(r.status,200);assert.equal(r.body.cards.length,2);assert.deepEqual(r.body.cards.map(c=>c.quantity).sort(),[2,3]);
});
test('Iyejun coupon uses the fixed ID, grants one unenhanced copy, and is excluded only from land random cards',async()=>{
  const f=await fixture();addIyejun(f);await f.force(LAND_IYEJUN_PRIZE);await f.grant(1,2);f.current.id=2;const roll=(await f.spin()).body;
  assert.equal(roll.prize.amount,1);assert.equal(roll.prize.jackpot,true);assert.match(f.sqlite.prepare('SELECT body FROM user_messages WHERE coupon_code=?').get(roll.code).body,/1장/);
  f.deps.isRandomDrawExcluded=()=>true;
  const requestId=crypto.randomUUID(),r=await f.redeem(roll.code,20,requestId);assert.equal(r.body.card.id,LAND_IYEJUN_CARD_ID);assert.equal(r.body.cards[0].quantity,1);
  assert.equal(f.sqlite.prepare('SELECT breakthrough_level FROM user_cards WHERE user_id=20').get().breakthrough_level,0);assert.equal((await f.redeem(roll.code,20,requestId)).body.replayed,true);
  f.sqlite.prepare('UPDATE cards SET is_active=0 WHERE id=?').run(LAND_IYEJUN_CARD_ID);assert.equal((await f.redeem(roll.code,21)).body.code,'LAND_POOL_EMPTY');
  f.sqlite.prepare('UPDATE cards SET is_active=1 WHERE id=?').run(LAND_IYEJUN_CARD_ID);f.sqlite.exec("UPDATE cards SET is_active=0 WHERE id='f1'");f.deps.isRandomDrawExcluded=()=>false;
  f.current.id=1;await f.force('FUR_RANDOM_CARD');await f.grant();f.current.id=2;assert.equal((await f.redeem((await f.spin()).body.code,21)).body.code,'LAND_POOL_EMPTY');
});
test('old issued one-card coupons retain their amount and amounts above new caps are refused without consumption',async()=>{
  const f=await fixture();await f.force('ZENITH_RANDOM_CARD');await f.grant(1,2);f.current.id=2;const {code}=(await f.spin()).body;couponAmount(f,code,1);
  const r=await f.redeem(code);assert.equal(r.body.rewardAmount,1);assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards WHERE user_id=20').get().quantity,1);
  couponAmount(f,code,4);assert.equal((await f.redeem(code,21)).status,409);assert.equal(f.sqlite.prepare('SELECT used_count FROM soopketland_coupons').get().used_count,1);
});
test('client formats named cards as 장, uses server coin cap, and loads the new versioned bundle',()=>{
  const live=fs.readFileSync(new URL('../js/soopketland-v2039.src.js',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.match(live,/endsWith\('_CARD'\)/);assert.match(live,/s\.data\.prizes\.find\(p=>p\.key==='COIN'\)\?\.max/);assert.doesNotMatch(live,/couponUses\*500000000|7종 동일 가중치/);
  assert.match(app,/soopketland-v2039\.bundle\.js\?v=2045-shared-fx/);
});
