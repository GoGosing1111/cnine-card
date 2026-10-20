import assert from 'node:assert/strict';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {issueDailyLandTickets,landDayKey,LAND_TICKET,LAND_DAILY_POLICY,LAND_DAILY_QUANTITY,LAND_COUPON_USES} from '../../functions/_soopket_land.js';

export const OPERATION_KEY='ops:reverse-land-daily:20261020:v1';
export const REGISTERED_IDS=[4718,4754,4773,4913,4977,5209,5393,5426,5950];
export const TICKET_DESCRIPTION='등록 스트리머에게 한국 시간 기준 매일 10장 자동 발급되는 방송 이벤트 이용권. 1회에 1장을 사용하며 자동 발급 이용권의 당첨 쿠폰은 150명이 사용할 수 있습니다.';
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;

// Explicit one-time reset. Deploying or restarting a worker must never reset a balance.
export async function applyReverseLandDailyPolicy(client,{commit=false,timestamp=Date.now()}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='20s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operation,OPERATION_KEY);await client.query('ROLLBACK');return {replayed:true,commit,receipt};}
  await client.query('LOCK TABLE soopketland_accounts IN SHARE ROW EXCLUSIVE MODE');
  const roster=await q(client,'SELECT slot,user_id FROM soopketland_accounts ORDER BY user_id');
  assert.deepEqual(roster.map(r=>Number(r.user_id)),REGISTERED_IDS,'Streamer registration changed; inspect before reset');
  // Same order as grant/spin: users, lots, inventory. OWNER is locked first so
  // a simultaneous manual grant cannot escape the reset snapshot.
  const users=await q(client,`SELECT id,nickname,status,role FROM users WHERE id=1
   OR id IN (SELECT user_id FROM soopketland_accounts)
   OR id IN (SELECT user_id FROM soopketland_ticket_lots)
   OR id IN (SELECT user_id FROM cnine_user_inventory WHERE item_code=$1) ORDER BY id FOR UPDATE`,[LAND_TICKET]);
  assert.ok(users.some(u=>Number(u.id)===1&&u.status==='ACTIVE'&&u.role==='OWNER'),'Audit OWNER missing');
  const lots=await q(client,'SELECT * FROM soopketland_ticket_lots ORDER BY user_id,created_at,id FOR UPDATE');
  const inventory=await q(client,'SELECT * FROM cnine_user_inventory WHERE item_code=$1 ORDER BY user_id FOR UPDATE',[LAND_TICKET]);
  const [policyBefore]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[LAND_DAILY_POLICY]);
  assert.equal(policyBefore,undefined,'Daily policy already exists without reset receipt');
  const [settings]=await q(client,"SELECT value FROM app_meta WHERE key='soopketland_settings_v2039'");
  const [catalog]=await q(client,'SELECT code,description,is_active FROM inventory_items WHERE code=$1 FOR UPDATE',[LAND_TICKET]);
  assert.equal(Number(catalog?.is_active),1,'Ticket catalog inactive');
  assert.ok(lots.every(l=>Number(l.remaining)>=0)&&inventory.every(i=>BigInt(i.quantity)>=0n),'Invalid existing balance');
  const at=new Date(timestamp).toISOString(),day=landDayKey(timestamp);
  const archiveKey=OPERATION_KEY+':before';
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[archiveKey,JSON.stringify({users,roster,lots,inventory,policy:policyBefore??null,catalog,settings}),at]);
  await client.query('UPDATE soopketland_ticket_lots SET remaining=0 WHERE remaining>0');
  await client.query('UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0,updated_at=$2 WHERE item_code=$1',[LAND_TICKET,at]);
  for(const row of inventory)if(BigInt(row.quantity)>0n){
   await client.query('INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES($1,$2,$3,0,$4,$5,$6,1)',[row.user_id,LAND_TICKET,String(-BigInt(row.quantity)),'사용자 지시: 리버스랜드 스트리머 이용권 전체 초기화','OPS_SOOPKETLAND_TICKET_RESET',OPERATION_KEY]);
  }
  const policy={enabled:true,quantity:LAND_DAILY_QUANTITY,couponUses:LAND_COUPON_USES,startsOn:day};
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[LAND_DAILY_POLICY,JSON.stringify(policy),at]);
  await client.query('UPDATE inventory_items SET description=$2 WHERE code=$1',[LAND_TICKET,TICKET_DESCRIPTION]);
  const db=new __postgresCompatTest.PostgresD1Database(client);
  // The caller owns the encompassing reset+today's allowance transaction.
  db.batch=statements=>db.enqueue(()=>db.batchSequential(statements,false));
  const daily=await issueDailyLandTickets(db,{timestamp});
  const after=await q(client,"SELECT u.id,u.nickname,COALESCE(i.quantity,0) AS tickets,COALESCE((SELECT SUM(remaining) FROM soopketland_ticket_lots l WHERE l.user_id=u.id),0) AS lot_remaining FROM users u LEFT JOIN cnine_user_inventory i ON i.user_id=u.id AND i.item_code=$1 WHERE u.id=ANY($2::bigint[]) ORDER BY u.id",[LAND_TICKET,users.map(u=>u.id)]);
  assert.ok(after.every(row=>Number(row.tickets)===Number(row.lot_remaining)),'Inventory and lots diverged');
  const receipt={status:'COMPLETED',operation:OPERATION_KEY,completedAt:at,archiveKey,resetAccounts:inventory.filter(i=>BigInt(i.quantity)>0n).length,resetTickets:inventory.reduce((n,i)=>n+Number(i.quantity),0),resetLots:lots.filter(l=>Number(l.remaining)>0).length,policy,daily,after};
  const [audit]=await q(client,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_REVERSE_LAND_DAILY','SYSTEM','REVERSE_LAND',$1,$2) RETURNING id",[JSON.stringify({archiveKey}),JSON.stringify(receipt)]);
  receipt.auditId=String(audit.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),at]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {replayed:false,commit,receipt};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
