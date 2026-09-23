import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/chuseok-v1.mjs';
import {inspect,preview,apply,verify,RETIREMENT_KEY} from '../scripts/ops/chuseok-retirement-20260923.mjs';
async function setup(){
 const f=await fixture();await f.pg.exec(`
 ALTER TABLE users ADD COLUMN role TEXT;
 UPDATE users SET role='OWNER' WHERE id=99;
 ALTER TABLE inventory_logs ADD COLUMN admin_id BIGINT;
 CREATE TABLE coupons(id BIGINT PRIMARY KEY,code TEXT,reward_type TEXT,is_active BIGINT,deleted_at TEXT,deleted_by BIGINT,updated_at TEXT);
 INSERT INTO coupons VALUES(1,'OLD','PINGDU_OLD_AXE',1,NULL,NULL,NULL),(2,'KEEP','COIN',1,NULL,NULL,NULL);
 INSERT INTO inventory_items(code,name,is_active) VALUES('PINGDU_OLD_AXE','낡은도끼',1);
 INSERT INTO app_meta(key,value) VALUES('pingdu_golden_axe_v1','{"visible":true,"enabled":true}');
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'VEHICLE_PARTS_150_CHOICE',2,2);
 `);
 const client={query:(text,values=[])=>f.pg.query(text,values)};
 return {...f,client};
}
test('retirement dry-run rolls back; apply removes only axes, preserves prizes and backs up every removed value',async()=>{
 const f=await setup();try{
  const before=await inspect(f.client),dry=await preview(f.client);assert(dry.summary.dryRun);assert.equal(dry.summary.removedQuantity,'20');assert.deepEqual(await inspect(f.client),before);
  const result=await apply(f.client);assert.equal(result.summary.removedQuantity,'20');assert.equal(result.backup.holdings.length,2);assert.equal((await verify(f.client)).verified,true);
  assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='VEHICLE_PARTS_150_CHOICE'")).quantity),2);assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='CHUSEOK_COIN'")).quantity),20);assert.equal(Number((await f.row("SELECT quantity FROM user_cards WHERE user_id=1 AND card_id='ss'")).quantity),3);
  assert.equal(Number((await f.row("SELECT is_active FROM coupons WHERE code='KEEP'")).is_active),1);
  assert.equal((await apply(f.client)).summary.replayed,true);assert.equal(Number((await f.row("SELECT COUNT(*) n FROM inventory_logs WHERE reference_id=$1",[RETIREMENT_KEY])).n),2);
  const audit=JSON.parse((await f.row("SELECT before_data FROM admin_logs WHERE target_id=$1",[RETIREMENT_KEY])).before_data);assert.equal(audit.holdings.length,2);assert.equal(audit.items[0].code,'PINGDU_OLD_AXE');
 }finally{await f.close();}
});
test('dependent reward references, enabled replacement or audit failure block the entire retirement',async()=>{
 const f=await setup();try{
  await f.pg.exec("CREATE TABLE user_message_rewards(reward_type TEXT);INSERT INTO user_message_rewards VALUES('PINGDU_OLD_AXE')");
  await assert.rejects(apply(f.client),/still referenced/);assert.equal(Number((await inspect(f.client)).holdings.quantity),20);await f.pg.exec('DELETE FROM user_message_rewards');
  await f.configure();await assert.rejects(apply(f.client),/has been enabled/);
  await f.pg.exec("DELETE FROM app_meta WHERE key='chuseok_events_v1'");
  const fault={query:(s,v)=>s.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit unavailable')):f.client.query(s,v)};await assert.rejects(apply(fault),/audit unavailable/);assert.equal(Number((await inspect(f.client)).holdings.quantity),20);assert.equal(Number((await f.row("SELECT COUNT(*) n FROM inventory_logs WHERE reference_id=$1",[RETIREMENT_KEY])).n),0);
 }finally{await f.close();}
});
