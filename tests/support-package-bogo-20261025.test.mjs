import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_UNIT} from '../shared/support-package-v1.mjs';
import {readPackageCoinAccounting} from '../functions/_package_coin_accounting.js';
import {OP,TARGETS,grantExtra,verify,accountingEnv} from '../scripts/ops/support-package-bogo-extra-20261025.mjs';

test('new and legacy pending applications deliver the same 1+1 total with restricted coins',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();
  for(const legacy of [false,true]){
   const applied=await f.apply(),order=applied.body.order;
   assert.equal(order.product.priceWon,49800);assert.equal(order.product.packageQuantity,2);assert.equal(order.product.eventLabel,'1+1 이벤트');
   if(legacy){order.product=SUPPORT_PACKAGE_UNIT;await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(order),'support_package_order_v1:'+order.id);}
   const before=Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),rid=crypto.randomUUID();
   const result=await f.process(order,'FULFILL',rid);assert.equal(result.status,200,JSON.stringify(result.body));
   assert.deepEqual(result.body.order.fulfillment,SUPPORT_PACKAGE);assert.deepEqual(result.body.order.product,legacy?SUPPORT_PACKAGE_UNIT:SUPPORT_PACKAGE);
   assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin)-before,200000000000000);
   const accounting=await readPackageCoinAccounting(f.env,2);assert.equal(accounting.available,1234);assert.equal(accounting.restricted,legacy?400000000000000:200000000000000);
   assert.equal((await f.process(order,'FULFILL',rid)).body.replayed,true);assert.equal((await f.process(order)).status,409);
  }
  assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='EMPEROR_ENERGY'")).quantity),800);
  assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MERCENARY_SSS_LIMITED_SHARD'")).quantity),20);
  const messages=await f.all('SELECT body FROM user_messages');assert(messages.every(m=>m.body.includes('1+1 이벤트')&&m.body.includes('200조')&&m.body.includes('400개')&&m.body.includes('10개')));
 }finally{await f.close();}
});

test('completed old receipts retain their one-package result without writes; altered product is rejected',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const order=(await f.apply()).body.order,rid=crypto.randomUUID();
  const old={...order,product:SUPPORT_PACKAGE_UNIT,status:'FULFILLED',revision:1};
  const payload=JSON.stringify([1,order.id,'FULFILL',0,'입금 확인 검수']);
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','support_package_process_v1:'+rid,JSON.stringify({payload,result:{ok:true,order:old,replayed:false}}));
  const start=f.queries.length,result=await f.process(order,'FULFILL',rid);assert.equal(result.status,200);assert.equal(result.body.replayed,true);assert.deepEqual(result.body.order.product,SUPPORT_PACKAGE_UNIT);assert.equal(result.body.order.fulfillment,undefined);
  assert(!f.queries.slice(start).some(q=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)));assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),1234);
  order.product={...SUPPORT_PACKAGE_UNIT,coins:1};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(order),'support_package_order_v1:'+order.id);
  assert.equal((await f.process(order)).status,409);
 }finally{await f.close();}
});

async function opsFixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,other_property TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,PRIMARY KEY(user_id,item_code));
 CREATE TABLE inventory_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO users VALUES(1,'핑크빛유두','ACTIVE','OWNER',10,'preserve');`);
 for(const item of SUPPORT_PACKAGE_UNIT.items)await db.query('INSERT INTO inventory_items VALUES($1,1)',[item.code]);
 for(const target of TARGETS){
  await db.query("INSERT INTO users VALUES($1,$2,'ACTIVE','USER',100000000001234,'preserve')",[target.id,target.nickname]);
  await db.query("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,100000000000000,100000000001234,$2)",[target.id,'시즌패스 패키지 구매 '+target.sourceOrder]);
  for(const [key,value] of [['support_package_order_v1:'+target.sourceOrder,{userId:Number(target.id),product:SUPPORT_PACKAGE_UNIT,status:'FULFILLED'}],['server_support_v1:'+target.id,{endsAt:123456,revision:7}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
  for(const item of SUPPORT_PACKAGE_UNIT.items)await db.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES($1,$2,$3,0)',[target.id,item.code,item.quantity]);
 }
 return db;
}
async function snapshot(db){const result={};for(const table of ['users','app_meta','coin_logs','cnine_user_inventory','inventory_logs','admin_logs'])result[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;}

test('two named recipients get exactly one extra each; pass, orders and spendable coins stay unchanged; replay is read-only',async t=>{
 const db=await opsFixture(t),result=await grantExtra(db,{dryRun:false});assert.equal(result.verified,true);assert.equal(result.receipt.grants.length,2);
 for(const target of TARGETS){const s=await readPackageCoinAccounting(accountingEnv(db),target.id);assert.equal(s.total,200000000001234);assert.equal(s.restricted,200000000000000);assert.equal(s.available,1234);}
 const before=await snapshot(db),replay=await grantExtra({query:(s,a)=>{assert.match(s,/^SELECT\b/);return db.query(s,a);}});assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(db),before);assert.equal((await verify(db)).receipt.operationKey,OP);
});

test('extra-package dry run and failures at coins, second recipient, audit and receipt roll back both recipients',async t=>{
 const db=await opsFixture(t),before=await snapshot(db);assert.equal((await grantExtra(db)).dryRun,true);assert.deepEqual(await snapshot(db),before);
 for(const [prefix,occurrence] of [['INSERT INTO coin_logs',1],['UPDATE users',2],['INSERT INTO inventory_logs',3],['INSERT INTO admin_logs',1],['INSERT INTO app_meta',3]]){
  let n=0;const failing={query:(sql,args)=>sql.startsWith(prefix)&&++n===occurrence?Promise.reject(Error('INJECTED_FAILURE')):db.query(sql,args)};
  await assert.rejects(grantExtra(failing,{dryRun:false}),/INJECTED_FAILURE/);assert.equal(n,occurrence);assert.deepEqual(await snapshot(db),before);
 }
});

test('extra-package identity mismatch, suspended recipient, changed source order and overflow fail before grants',async t=>{
 const db=await opsFixture(t);
 for(const [sql,args] of [["UPDATE users SET nickname='다른 계정' WHERE id=4572",[]],["UPDATE users SET status='SUSPENDED' WHERE id=4572",[]],["UPDATE users SET coin=9007199254740991 WHERE id=4572",[]],["UPDATE app_meta SET value=$1 WHERE key=$2",[JSON.stringify({userId:4572,status:'FULFILLED',product:{...SUPPORT_PACKAGE_UNIT,coins:1}}),'support_package_order_v1:'+TARGETS[1].sourceOrder]]]){
  await db.query('BEGIN');await db.query(sql,args);const bad=await snapshot(db);await db.query('COMMIT');
  await assert.rejects(grantExtra(db,{dryRun:false}));assert.deepEqual(await snapshot(db),bad);
  await db.query("UPDATE users SET nickname='응맨',status='ACTIVE',coin=100000000001234 WHERE id=4572");
 }
});
