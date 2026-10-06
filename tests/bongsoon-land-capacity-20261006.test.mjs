import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {updateBongsoonLandCapacity,COUPON_REQUESTS} from '../scripts/ops/bongsoon-land-capacity-20261006.mjs';

async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE soopketland_accounts(slot TEXT PRIMARY KEY,user_id BIGINT);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,PRIMARY KEY(user_id,item_code));
 CREATE TABLE soopketland_ticket_lots(id TEXT PRIMARY KEY,user_id BIGINT,quantity INTEGER,remaining INTEGER,coupon_uses INTEGER,plan_json TEXT,created_at TEXT);
 CREATE TABLE soopketland_coupons(code TEXT PRIMARY KEY,issuer_id BIGINT,request_id TEXT,reward_json TEXT,max_uses INTEGER,used_count INTEGER,is_active INTEGER);
 CREATE TABLE soopketland_rolls(request_id TEXT PRIMARY KEY,user_id BIGINT,lot_id TEXT,response_json TEXT,created_at TEXT);
 CREATE TABLE soopketland_redemptions(code TEXT,user_id BIGINT,response_json TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO users VALUES(1,'OWNER','ACTIVE','OWNER'),(5426,'나무늘봉순','ACTIVE','USER'),(50,'다른사람','ACTIVE','USER');
 INSERT INTO soopketland_accounts VALUES('나무늘봉순',5426);
 INSERT INTO cnine_user_inventory VALUES(5426,'SOOPKETLAND_TICKET',53,5),(50,'SOOPKETLAND_TICKET',7,7);
 INSERT INTO soopketland_ticket_lots VALUES('old',5426,50,48,1,'{"couponUses":1}','old'),('new',5426,5,5,200,'{"couponUses":200}','new'),('spent',5426,10,0,1,'{}','older'),('other',50,7,7,1,'{}','old');
 INSERT INTO soopketland_coupons VALUES('old-coupon',5426,'old-roll','{}',100,8,1),('other-coupon',50,'other-roll','{}',1,1,1);
 INSERT INTO soopketland_redemptions VALUES('coupon-0',50,'{"ok":true}');`);
 for(const [i,id] of COUPON_REQUESTS.entries()){
  await pg.query('INSERT INTO soopketland_coupons VALUES($1,5426,$2,$3,1,1,1)',['coupon-'+i,id,JSON.stringify({key:i?'STARLIGHT_ARMOR_CORE':'COIN',amount:i?927:46200000000})]);
  await pg.query('INSERT INTO soopketland_rolls VALUES($1,5426,$2,$3,$4)',[id,'old',JSON.stringify({ok:true,code:'coupon-'+i,couponUses:1,prize:{key:i?'STARLIGHT_ARMOR_CORE':'COIN'}}),'now']);
 }
 const client={async query(sql,args=[]){const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 const snapshot=async()=>Object.fromEntries(await Promise.all(['users','app_meta','soopketland_accounts','cnine_user_inventory','soopketland_ticket_lots','soopketland_coupons','soopketland_rolls','soopketland_redemptions','admin_logs'].map(async table=>[table,(await client.query(`SELECT row_to_json(t) r FROM ${table} t ORDER BY row_to_json(t)::text`)).rows.map(r=>r.r)])));
 return {client,snapshot};
}

test('capacity correction covers unused tickets and exactly two coupons; preserves balances, redemptions and retry safety',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const dry=await updateBongsoonLandCapacity(f.client);assert.equal(dry.receipt.convertedTickets,48);assert.deepEqual(await f.snapshot(),before);
 const result=await updateBongsoonLandCapacity(f.client,{commit:true});assert.equal(result.receipt.heldTickets,53);assert.ok(result.receipt.coupons.every(c=>c.maxUses===200&&c.usedCount===1&&c.remainingUses===199));
 const after=await f.snapshot();
 for(const table of ['users','soopketland_accounts','cnine_user_inventory','soopketland_redemptions'])assert.deepEqual(after[table],before[table]);
 const unchanged=c=>!COUPON_REQUESTS.includes(c.request_id);assert.deepEqual(after.soopketland_coupons.filter(unchanged),before.soopketland_coupons.filter(unchanged));
 assert.equal(after.soopketland_ticket_lots.find(l=>l.id==='spent').coupon_uses,1);assert.equal(after.soopketland_ticket_lots.find(l=>l.id==='other').coupon_uses,1);
 assert.equal(after.soopketland_ticket_lots.find(l=>l.id==='old').plan_json,'{"couponUses":1}');
 await f.client.query("INSERT INTO soopketland_coupons VALUES('later',5426,'later','{}',1,0,1)");const later=await f.snapshot();
 assert.equal((await updateBongsoonLandCapacity(f.client,{commit:true})).replayed,true);assert.deepEqual(await f.snapshot(),later);
});

test('audit failure or account mismatch aborts the complete correction',async t=>{
 const f=await fixture(t),before=await f.snapshot(),query=f.client.query.bind(f.client);
 f.client.query=(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit failure')):query(sql,args);
 await assert.rejects(updateBongsoonLandCapacity(f.client,{commit:true}),/audit failure/);assert.deepEqual(await f.snapshot(),before);f.client.query=query;
 await f.client.query("UPDATE users SET nickname='다른 계정' WHERE id=5426");const changed=await f.snapshot();
 await assert.rejects(updateBongsoonLandCapacity(f.client,{commit:true}));assert.deepEqual(await f.snapshot(),changed);
});
