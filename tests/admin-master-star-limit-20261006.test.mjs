import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const source=api.slice(api.indexOf("    if(path==='admin/users/master-star'"),api.indexOf("    if(path==='admin/users/action'"));
const route=new (Object.getPrototypeOf(async()=>{}).constructor)('path','request','env','requirePermission','readBody','json',source);
const owner={id:9,role:'OWNER',permissions:['USER_MANAGE']};

async function fixture(t){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,magic_crystals BIGINT DEFAULT 0);
    INSERT INTO users(id,nickname,role) VALUES(1,'지급 검수 계정','USER'),(2,'다른 계정','USER'),(9,'검수 운영자','OWNER');
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'MASTER_STAR',123,23),(2,'MASTER_STAR',456,0),(1,'MINE_ELECTRIC_DRILL',7,0);
    CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT);
    CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
  let failWrite=false;
  const db=new __postgresCompatTest.PostgresD1Database({async query(input){
    const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    if(failWrite&&sql.startsWith('UPDATE cnine_user_inventory')){failWrite=false;throw Error('injected balance write failure');}
    const result=await pg.query(sql,values),rows=result.rows.map(convert);
    return {...result,rows,rowCount:result.affectedRows??rows.length};
  }});
  const one=async sql=>convert((await pg.query(sql)).rows[0]);
  const balance=()=>one("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'");
  const call=(amount,{admin=owner,userId=1,reason='수량 검수',path='admin/users/master-star'}={})=>route(path,
    new Request('http://localhost/api/'+path,{method:'POST',body:JSON.stringify({userId,amount,reason})}),{DB:db},
    async(_request,_env,permission)=>admin&&(admin.role==='OWNER'||(admin.role==='ADMIN'&&admin.permissions?.includes(permission)))?admin:null,
    request=>request.json(),(body,status=200)=>Response.json(body,{status}));
  return {pg,one,balance,call,failNextWrite:()=>{failWrite=true;}};
}
function convert(row){return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?Number(value):value]));}

test('CMS master-star grants above one million through 100 million preserve exact balances and both ledgers',async t=>{
  const f=await fixture(t);let expected=123,unseen=23;
  for(const amount of [1000001,50000000,99999999,100000000,-100000000]){
    const response=await f.call(amount),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
    expected+=amount;unseen=amount>0?unseen+amount:Math.min(unseen,expected);
    assert.equal(data.amount,amount);assert.equal(data.balance,expected);assert.deepEqual(await f.balance(),{quantity:expected,unseen_quantity:unseen});
    const inventory=await f.one('SELECT * FROM inventory_logs ORDER BY ctid DESC LIMIT 1');
    assert.equal(inventory.change_amount,amount);assert.equal(inventory.balance_after,expected);assert.equal(inventory.admin_id,9);
    const audit=await f.one('SELECT * FROM admin_logs ORDER BY ctid DESC LIMIT 1');
    assert.equal(audit.action_type,'MASTER_STAR_ADJUST');assert.equal(audit.admin_id,9);
    assert.deepEqual(JSON.parse(audit.after_data),{nickname:'지급 검수 계정',balance:expected,amount,reason:'수량 검수'});
  }
  assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,5);assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,5);
  assert.equal((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).quantity,456);
  assert.equal((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MINE_ELECTRIC_DRILL'")).quantity,7);
});

test('invalid amounts, excessive recovery and unauthorized requests do not change inventory or logs; crystal cap stays one million',async t=>{
  const f=await fixture(t),before=await f.balance();
  for(const amount of [0,0.5,100000001,-100000001,Number.MAX_SAFE_INTEGER,'invalid',null])assert.equal((await f.call(amount)).status,400);
  assert.equal((await f.call(-124)).status,409);assert.deepEqual(await f.balance(),before);
  for(const admin of [null,{id:2,role:'USER',permissions:['USER_MANAGE']},{id:2,role:'ADMIN',permissions:[]}])assert.equal((await f.call(50000000,{admin})).status,403);
  assert.equal((await f.call(50000000,{admin:{id:2,role:'ADMIN',permissions:['USER_MANAGE']},userId:9})).status,403);
  assert.equal((await f.call(50000000,{userId:999})).status,404);assert.equal((await f.call(50000000,{reason:' '})).status,400);
  const crystal=await f.call(1000001,{path:'admin/users/magic-crystal'});assert.equal(crystal.status,400);assert.match((await crystal.json()).error,/1,000,000/);
  assert.deepEqual(await f.balance(),before);assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);
  assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,0);
});

test('failed balance write leaves the grant unapplied and a retry applies the full 50 million',async t=>{
  const f=await fixture(t),before=await f.balance();f.failNextWrite();
  await assert.rejects(f.call(50000000),/injected balance write failure/);assert.deepEqual(await f.balance(),before);
  assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);
  const retried=await f.call(50000000);assert.equal(retried.status,200);assert.equal((await retried.json()).balance,50000123);
  assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,1);assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,1);
});
