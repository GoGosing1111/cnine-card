import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {JOINT_TRANSACTION_SCHEMA} from '../functions/_joint_transactions.js';
import {JOINT_ATOMIC_SCHEMA} from '../functions/_joint_atomic.js';
import {TOURNAMENT_GIFT as gift,TOURNAMENT_GIFT_CATALOG_KEY as catalogKey,ensureTournamentGiftCatalog,openTournamentGift,grantTournamentGift} from '../functions/_tournament_gift.js';
import {invalidateRuntimeData} from '../functions/_runtime_data_cache.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

async function fixture(t){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec([
    "CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$",
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
    'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT NOT NULL)',
    "INSERT INTO users VALUES(1,123),(2,400),(9,1000)",
    "INSERT INTO app_meta VALUES('safe_runtime_upgrade_v2121_foundation','1',NULL)",
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT,updated_at TEXT)',
    "INSERT INTO inventory_items(code,is_active) VALUES('MASTER_STAR',1)",
    'CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT NOT NULL,unseen_quantity BIGINT NOT NULL,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
    "INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',17,3,NULL,NULL)",
    'CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
    'CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
    ...JOINT_TRANSACTION_SCHEMA,...JOINT_ATOMIC_SCHEMA
  ].join(';'));
  let fault=null,queries=0;const sqls=[];
  const client={async query(input){
    const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    queries++;sqls.push(sql);
    if(fault?.pattern&&sql.includes(fault.pattern)){fault=null;throw Error('QA injected write failure');}
    const result=await pg.query(sql,values);
    if(fault?.ack&&sql==='COMMIT'){fault=null;throw Error('QA commit acknowledgement lost');}
    const rows=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v])));
    return {...result,rows,rowCount:result.affectedRows??rows.length};
  }};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const one=async(sql,values=[])=>{const row=(await pg.query(sql,values)).rows[0];return row&&Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]));};
  const quantity=async(code=gift.code,userId=1)=>Number((await one('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[userId,code]))?.quantity||0);
  const stock=async(n,userId=1)=>pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES($1,$2,$3,$3) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity',[userId,gift.code,n]);
  const open=(requestId=crypto.randomUUID(),count=1,userId=1)=>openTournamentGift(env,{id:userId},{requestId,count});
  const grant=(requestId=crypto.randomUUID(),amount=2,userId=1)=>grantTournamentGift(env,{id:9},{requestId,amount,userId,reason:'대회 검수'});
  return {pg,env,one,quantity,stock,open,grant,sqls,queries:()=>queries,fault:value=>{fault=value;}};
}

test('PostgreSQL: catalog registers with an existing foundation gate, preserves edits, and warms without DB reads',async t=>{
  const f=await fixture(t);await ensureTournamentGiftCatalog(f.env);
  const row=await f.one('SELECT * FROM inventory_items WHERE code=$1',[gift.code]);
  assert.deepEqual([row.name,row.category,row.is_active,row.image_url],['대회 사은품','GIFT_BOX',1,gift.image]);
  assert.equal(await f.quantity(),0);assert.equal(await f.quantity('MASTER_STAR'),17);
  const before=f.queries();await ensureTournamentGiftCatalog(f.env);assert.equal(f.queries(),before);
  await f.pg.query("UPDATE inventory_items SET is_active=0,name='CMS edit' WHERE code=$1",[gift.code]);
  invalidateRuntimeData(f.env,catalogKey);await ensureTournamentGiftCatalog(f.env);
  assert.deepEqual(await f.one('SELECT name,is_active FROM inventory_items WHERE code=$1',[gift.code]),{name:'CMS edit',is_active:0});
});

test('PostgreSQL: one box gives exactly 2 million stars AND 250 billion coins once; bounded work',async t=>{
  const f=await fixture(t);await f.stock(2);await ensureTournamentGiftCatalog(f.env);
  const id=crypto.randomUUID(),start=f.queries(),started=performance.now(),result=await f.open(id);
  const queryCount=f.queries()-start;
  t.diagnostic(JSON.stringify({openSqlStatements:queryCount,fixtureElapsedMs:Math.round(performance.now()-started)}));
  assert(queryCount<=28,'bounded SQL work');
  assert.deepEqual(result.rewards,{masterStar:2_000_000,coin:250_000_000_000});
  assert.equal(await f.quantity(),1);assert.equal(await f.quantity('MASTER_STAR'),2_000_017);
  assert.deepEqual(await f.one('SELECT coin FROM users WHERE id=1'),{coin:250_000_000_123});
  assert.deepEqual(await f.one("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'"),{quantity:2000017,unseen_quantity:2000003});
  assert.deepEqual(await f.one('SELECT change_amount,balance_after FROM coin_logs'),{change_amount:250000000000,balance_after:250000000123});
  assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,2);
  assert.equal((await f.open(id)).replayed,true);
  assert.equal(await f.quantity(),1);assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
  assert.equal((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n,0);
});

test('PostgreSQL: concurrent same receipt replays; different requests cannot consume the last box twice',async t=>{
  for(const same of [true,false]){
    const f=await fixture(t);await f.stock(1);await ensureTournamentGiftCatalog(f.env);const id=crypto.randomUUID();
    const results=await Promise.allSettled([f.open(id),f.open(same?id:crypto.randomUUID())]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,same?2:1);
    assert.equal(await f.quantity(),0);assert.equal(await f.quantity('MASTER_STAR'),2000017);
    assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,250000000123);
    assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
  }
});

test('PostgreSQL: missing stock, malformed requests, disabled currency and overflow never consume a box',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.open(),/보유한/);
  await f.stock(1);
  for(const count of [0,2,100,1.5])await assert.rejects(f.open(crypto.randomUUID(),count),/1개씩/);
  await assert.rejects(f.open('bad'),/요청 번호/);
  await f.pg.query('UPDATE users SET coin=$1 WHERE id=1',[Number.MAX_SAFE_INTEGER]);
  await assert.rejects(f.open());
  await f.pg.query('UPDATE users SET coin=123 WHERE id=1');
  await f.pg.query("UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'");
  await assert.rejects(f.open());
  assert.equal(await f.quantity(),1);assert.equal(await f.quantity('MASTER_STAR'),17);
  assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);
  assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);
});

test('PostgreSQL: reward, audit and completion failures roll back the entire open; the same ID can retry',async t=>{
  for(const pattern of ["INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES","INSERT INTO coin_logs","UPDATE joint_operations_v1 SET status='COMPLETED'"]){
    const f=await fixture(t);await f.stock(1);await ensureTournamentGiftCatalog(f.env);const id=crypto.randomUUID();f.fault({pattern});
    await assert.rejects(f.open(id));
    assert.equal(await f.quantity(),1);assert.equal(await f.quantity('MASTER_STAR'),17);
    assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);
    assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);
    await f.open(id);assert.equal(await f.quantity(),0);assert.equal(await f.quantity('MASTER_STAR'),2000017);
  }
});

test('PostgreSQL: a lost commit response recovers success without applying rewards again',async t=>{
  const f=await fixture(t);await f.stock(1);await ensureTournamentGiftCatalog(f.env);
  const id=crypto.randomUUID();f.fault({ack:true});await f.open(id);await f.open(id);
  assert.equal(await f.quantity(),0);assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
});

test('PostgreSQL: admin can grant immediately with atomic audit, replay and request ownership checks',async t=>{
  const f=await fixture(t),id=crypto.randomUUID();
  await f.grant(id);await f.grant(id);assert.equal(await f.quantity(),2);
  assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,1);
  assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);
  assert.equal(await f.quantity('MASTER_STAR'),17);
  await assert.rejects(f.grant(id,3),/다른 내용/);
  await assert.rejects(f.grant(id,2,2),/다른 내용/);
  await assert.rejects(f.open(id),/다른 내용/);
  await assert.rejects(f.grant(crypto.randomUUID(),0),/수량/);
  const retry=crypto.randomUUID();f.fault({pattern:'INSERT INTO admin_logs'});
  await assert.rejects(f.grant(retry));
  assert.equal(await f.quantity(),2);
  await f.grant(retry);assert.equal(await f.quantity(),4);
  assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,2);
  await f.pg.query('UPDATE inventory_items SET is_active=0 WHERE code=$1',[gift.code]);
  await assert.rejects(f.grant());
  await assert.rejects(f.open());
  assert.equal(await f.quantity(),4);
});

test('live routes require authentication/permission and the client uses the actual grant and inventory paths',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),api=read('functions/api/[[path]].js'),app=read('js/app.js'),admin=read('admin/admin-v1276.js');
  const inventory=api.slice(api.indexOf("if(path==='inventory'){"),api.indexOf("if(path==='inventory/seen'"));
  assert(inventory.indexOf('authenticate')<inventory.indexOf('ensureTournamentGiftCatalog'));
  const grant=api.slice(api.indexOf("if(path==='admin/users/action'"));
  assert(grant.indexOf("requirePermission(request,env,'USER_MANAGE')")<grant.indexOf('grantTournamentGift'));
  assert.match(grant,/withJointUserMutationLock\(env,userId,'admin\/tournament-gift\/grant'/);
  assert.match(app,/if\(itemCode==='TOURNAMENT_GIFT_BOX'\)return window.TournamentGiftV1.open/);
  assert.match(app,/tournament-gift:\$\{loadUser\(\)\?\.serverUserId\}:pending/);
  assert(read('index.html').includes('js/tournament-gift-v1.js?v=20260926'));
  assert(read('admin/index.html').includes('tournamentGift=20260926'));
  assert.match(admin,/<option value="TOURNAMENT_GIFT_BOX">대회 사은품/);
  const helper=admin.slice(admin.indexOf('function tournamentGiftGrantKey'),admin.indexOf('async function userAction'));
  const values=new Map(),ctx={state:{admin:{id:9}},crypto,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
  vm.createContext(ctx);vm.runInContext(helper,ctx);
  const first={userId:1,amount:2,reason:'test'},retry={...first},next={...first,amount:3};
  ctx.prepareTournamentGiftGrant(first);ctx.prepareTournamentGiftGrant(retry);ctx.prepareTournamentGiftGrant(next);
  assert.equal(first.requestId,retry.requestId);assert.notEqual(first.requestId,next.requestId);
});

