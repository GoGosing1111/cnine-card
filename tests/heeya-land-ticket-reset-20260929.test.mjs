import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {resetHeeyaLandTickets,OPERATION_KEY} from '../scripts/ops/heeya-land-ticket-reset-20260929.mjs';

async function fixture(t){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT);
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE soopketland_accounts(slot TEXT PRIMARY KEY,user_id BIGINT UNIQUE);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE soopketland_ticket_lots(id TEXT PRIMARY KEY,user_id BIGINT,quantity INTEGER,remaining INTEGER CHECK(remaining>=0),coupon_uses INTEGER,created_at TEXT);
    CREATE TABLE soopketland_coupons(code TEXT PRIMARY KEY,issuer_id BIGINT,used_count INTEGER);
    CREATE TABLE soopketland_rolls(request_id TEXT PRIMARY KEY,user_id BIGINT,lot_id TEXT);
    CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT);
    CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    INSERT INTO users VALUES(1,'OWNER','OWNER','ACTIVE'),(4977,'하이희야♡','USER','ACTIVE'),(23,'하이희야','USER','ACTIVE');
    INSERT INTO soopketland_accounts VALUES('하이희야♡',4977);
    INSERT INTO cnine_user_inventory VALUES(4977,'SOOPKETLAND_TICKET',38,38,'old','old'),(23,'SOOPKETLAND_TICKET',9,9,'old','old'),(4977,'SOOPKETLAND_HYPER_BURNING_TICKET',4,4,'old','old'),(4977,'SUPERSTAR_GUARANTEED_PACK',2,2,'old','old');
    INSERT INTO soopketland_ticket_lots VALUES('spent',4977,10,0,100,'old'),('live1',4977,30,29,1,'today'),('live2',4977,9,9,200,'today'),('other',23,9,9,100,'today');
    INSERT INTO soopketland_coupons VALUES('existing-coupon',4977,3);
    INSERT INTO soopketland_rolls VALUES('existing-roll',4977,'live1');
  `);
  const client={async query(sql,args=[]){const r=await pg.query(sql,args);return{...r,rowCount:r.affectedRows??r.rows.length}}};
  const snapshot=async()=>Object.fromEntries(await Promise.all(['users','app_meta','soopketland_accounts','cnine_user_inventory','soopketland_ticket_lots','soopketland_coupons','soopketland_rolls','inventory_logs','admin_logs'].map(async table=>[table,(await client.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows.map(r=>r.row)])));
  return{client,snapshot};
}

test('reset all remaining lots and inventory; preserve other account/items/history; dry run and retry are safe',async t=>{
  const f=await fixture(t),before=await f.snapshot();
  await resetHeeyaLandTickets(f.client);assert.deepEqual(await f.snapshot(),before);
  const result=await resetHeeyaLandTickets(f.client,{dryRun:false});assert.equal(result.receipt.beforeQuantity,'38');assert.equal(result.receipt.lotsReset,2);
  const after=await f.snapshot();
  for(const table of ['users','soopketland_accounts','soopketland_coupons','soopketland_rolls'])assert.deepEqual(after[table],before[table]);
  const target=row=>row.user_id===4977&&row.item_code==='SOOPKETLAND_TICKET';
  assert.deepEqual(after.cnine_user_inventory.filter(row=>!target(row)),before.cnine_user_inventory.filter(row=>!target(row)));
  assert.equal(after.cnine_user_inventory.find(target).quantity,0);assert.equal(after.cnine_user_inventory.find(target).unseen_quantity,0);
  for(const old of before.soopketland_ticket_lots)assert.deepEqual(after.soopketland_ticket_lots.find(row=>row.id===old.id),{...old,remaining:old.user_id===4977?0:old.remaining});
  assert.equal(after.inventory_logs[0].change_amount,-38);assert.equal(after.inventory_logs[0].balance_after,0);
  assert.equal(JSON.parse(after.app_meta.find(row=>row.key===OPERATION_KEY+':before').value).inventory.quantity,38);
  // A retry after a later legitimate grant must not confiscate the new tickets.
  await f.client.query("UPDATE cnine_user_inventory SET quantity=2,unseen_quantity=2 WHERE user_id=4977 AND item_code='SOOPKETLAND_TICKET'");
  await f.client.query("INSERT INTO soopketland_ticket_lots VALUES('new-grant',4977,2,2,1,'later')");
  const granted=await f.snapshot();assert.equal((await resetHeeyaLandTickets(f.client,{dryRun:false})).replayed,true);assert.deepEqual(await f.snapshot(),granted);
});

test('audit failure rolls back inventory and lots; wrong nickname or binding aborts before changes',async t=>{
  const f=await fixture(t),before=await f.snapshot(),query=f.client.query.bind(f.client);
  f.client.query=(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit failed')):query(sql,args);
  await assert.rejects(resetHeeyaLandTickets(f.client,{dryRun:false}),/audit failed/);assert.deepEqual(await f.snapshot(),before);f.client.query=query;
  await f.client.query("UPDATE users SET nickname='하이희야' WHERE id=4977");const wrongName=await f.snapshot();
  await assert.rejects(resetHeeyaLandTickets(f.client,{dryRun:false}),/Exact heart-suffix/);assert.deepEqual(await f.snapshot(),wrongName);
  await f.client.query("UPDATE users SET nickname='하이희야♡' WHERE id=4977");await f.client.query("UPDATE soopketland_accounts SET slot='다른계정'");const wrongBinding=await f.snapshot();
  await assert.rejects(resetHeeyaLandTickets(f.client,{dryRun:false}),/binding changed/);assert.deepEqual(await f.snapshot(),wrongBinding);
});
