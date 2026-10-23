import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(fs.readFileSync(new URL('./pumpkin-choice-grant-20261023.json',import.meta.url),'utf8'));
export const HASH='e5e43f70a2110a4348210b1a5ec5f49a2459f2b94274555ed85702b89f9f0cc1';
export const OP=PLAN.operationKey,ACTION='OPS_PUMPKIN_CHOICE_GRANT_20261023',CODE='PET_PUMPKIN_CHOICE_TICKET';
const ids=PLAN.recipients.map(r=>r.userId);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const safe=BigInt(Number.MAX_SAFE_INTEGER);
function validate(hash){
 assert.equal(hash,HASH,'Frozen plan hash required');assert.equal(sha(PLAN),HASH,'Plan changed');
 assert.equal(PLAN.itemCode,CODE);assert.equal(PLAN.itemName,'호박펫 선택권');assert.equal(PLAN.delivery,'DIRECT_INVENTORY');
 assert.equal(PLAN.recipientCount,70);assert.equal(ids.length,70);assert.equal(new Set(ids).size,70);
 assert.equal(PLAN.totalTickets,70);assert.equal(PLAN.recipients.reduce((n,r)=>n+r.quantity,0),70);
 for(const r of PLAN.recipients)assert.ok(Number.isSafeInteger(r.quantity)&&r.quantity===1);
 assert.equal(PLAN.correctionAuthorization,'이전에 승인된 동일 명단의 3개 닉네임 정정 재사용');
}
export async function readReceipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;}
export async function verify(c,r,{balances=false}={}){
 validate(r.planHash);assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.deepEqual(r.plan,PLAN);
 assert.equal(r.grants.length,70);assert.equal(new Set(r.grants.map(g=>g.userId)).size,70);
 const logs=await q(c,`SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text
  FROM inventory_logs WHERE item_code=$3 AND reference_type=$1 AND reference_id=$2 ORDER BY user_id`,[ACTION,OP,CODE]);
 assert.equal(logs.length,70);assert.equal(new Set(logs.map(l=>l.user_id)).size,70);
 const inventory=balances?await q(c,'SELECT user_id::text,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2',[ids,CODE]):[];
 let total=0n;
 for(const expected of PLAN.recipients){
  const g=one(r.grants.filter(g=>g.userId===expected.userId));
  for(const field of ['nickname','sourceNickname','quantity'])assert.equal(g[field],expected[field]);
  assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(g.quantity));
  assert.equal(BigInt(g.unseenAfter)-BigInt(g.unseenBefore),BigInt(g.quantity));
  assert.ok(BigInt(g.before)>=0n&&BigInt(g.after)<=safe&&BigInt(g.unseenBefore)>=0n&&BigInt(g.unseenAfter)<=safe);
  const log=one(logs.filter(l=>l.user_id===g.userId));assert.equal(log.id,g.inventoryLogId);
  assert.equal(log.item_code,CODE);assert.equal(log.change_amount,String(g.quantity));assert.equal(log.balance_after,g.after);
  assert.equal(log.reason,PLAN.reason);assert.equal(log.admin_id,r.adminId);
  if(balances){const row=one(inventory.filter(i=>i.user_id===g.userId));assert.equal(row.quantity,g.after);assert.equal(row.unseen_quantity,g.unseenAfter);}
  total+=BigInt(log.change_amount);
 }
 assert.equal(String(total),'70');
 const audit=one(await q(c,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,r.adminId);assert.equal(audit.target_type,'USER_GROUP');
 const {auditId,...saved}=r;assert.deepEqual(JSON.parse(audit.after_data),saved);
 assert.deepEqual(JSON.parse(audit.before_data),{recipients:70,totalTickets:70,itemCode:CODE,priorGrant:false});
 return {recipients:70,totalTickets:Number(total),inventoryLogs:70,adminLogs:1,missing:0,duplicates:0,openedByOperation:0};
}
// Caller owns transaction. This grants unredeemed choice tickets; it never runs the pet choice redeemer.
export async function grant(c,hash){
 validate(hash);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const saved=await readReceipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.equal((await q(c,'SELECT id FROM inventory_logs WHERE item_code=$2 AND reference_id=$1 LIMIT 1',[OP,CODE])).length,0,'Unreconciled prior grant');
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE action_type=$1 OR target_id=$2 LIMIT 1',[ACTION,OP])).length,0,'Unreconciled prior audit');
 const storage=await q(c,"SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='cnine_user_inventory' AND column_name IN ('quantity','unseen_quantity')) OR (table_name='inventory_logs' AND column_name IN ('change_amount','balance_after')))");
 assert.equal(storage.length,4);assert.ok(storage.every(s=>s.data_type==='bigint'),'BIGINT inventory storage required');
 const users=await q(c,'SELECT id::text AS "userId",nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 assert.equal(users.length,70);
 const verified=await q(c,'SELECT user_id::text AS "userId",provider,provider_user_id AS "providerUserId" FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
 for(const p of PLAN.recipients){
  const u=one(users.filter(u=>u.userId===p.userId));for(const k of ['nickname','status','role'])assert.equal(u[k],p[k]);assert.equal(u.status,'ACTIVE');
  const v=one(verified.filter(v=>v.userId===p.userId));assert.equal(v.provider,p.provider);assert.equal(v.providerUserId,p.providerUserId);
 }
 const item=one(await q(c,'SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[CODE]));
 assert.equal(item.name,PLAN.itemName);assert.equal(Number(item.is_active),1);
 const owner=one(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE"));
 const before=await q(c,'SELECT user_id::text,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[ids,CODE]);
 for(const p of PLAN.recipients){const b=before.find(i=>i.user_id===p.userId);for(const field of ['quantity','unseen_quantity']){const n=BigInt(b?.[field]||'0');assert.ok(n>=0n&&n+BigInt(p.quantity)<=safe,'Unsafe inventory count');}}
 const credited=await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
  SELECT x.user_id,$3,x.amount,x.amount,sqlite_now(),sqlite_now() FROM unnest($1::bigint[],$2::bigint[]) x(user_id,amount)
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+EXCLUDED.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+EXCLUDED.unseen_quantity,updated_at=EXCLUDED.updated_at
  RETURNING user_id::text,quantity::text,unseen_quantity::text`,[ids,PLAN.recipients.map(r=>r.quantity),CODE]);
 assert.equal(credited.length,70);
 const logs=await q(c,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
  SELECT x.user_id,$3,x.amount,i.quantity,$4,$5,$6,$7 FROM unnest($1::bigint[],$2::bigint[]) x(user_id,amount)
  JOIN cnine_user_inventory i ON i.user_id=x.user_id AND i.item_code=$3 RETURNING id::text,user_id::text`,
 [ids,PLAN.recipients.map(r=>r.quantity),CODE,PLAN.reason,ACTION,OP,owner.id]);
 assert.equal(logs.length,70);
 const grants=PLAN.recipients.map(p=>{
  const b=before.find(i=>i.user_id===p.userId),a=one(credited.filter(i=>i.user_id===p.userId)),l=one(logs.filter(l=>l.user_id===p.userId));
  return {userId:p.userId,nickname:p.nickname,sourceNickname:p.sourceNickname,quantity:p.quantity,before:b?.quantity||'0',after:a.quantity,
   unseenBefore:b?.unseen_quantity||'0',unseenAfter:a.unseen_quantity,inventoryLogId:l.id};
 });
 const walletsAfter=await q(c,'SELECT id::text AS "userId",nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 assert.deepEqual(walletsAfter,users,'Choice ticket grant must not change wallets or open contents');
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,delivery:'DIRECT_INVENTORY',adminId:owner.id,grants,
  walletUnchanged:true,openedByOperation:0,completedAt:new Date().toISOString()};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_GROUP',$3,$4,$5) RETURNING id::text",
 [owner.id,ACTION,OP,JSON.stringify({recipients:70,totalTickets:70,itemCode:CODE,priorGrant:false}),JSON.stringify(r)]));r.auditId=audit.id;
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OP,JSON.stringify(r)])).rowCount,1);
 return {replayed:false,receipt:r,verification:await verify(c,r,{balances:true})};
}
