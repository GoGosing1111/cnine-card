import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './streamer-box-bini-dodaeng-20261025.plan.json' with {type:'json'};
import source from './streamer-box-bini-dodaeng-20261025.source.json' with {type:'json'};
import {REVERSECALL_STREAMER_GIFT as gift} from '../../shared/reversecall-streamer-gift-v1.mjs';
export const OPERATION_KEY='ops:streamer-box-transfer:20261025:bini-dodaeng:v1';
export const ITEM_CODE=gift.code,ACTION='OPS_STREAMER_BOX_TRANSFER',FROM_ID='4595',TO_ID='4235';
export const ORIGINAL_GRANT_KEY='ops:streamer-box-two:20261025:v1';
export const REASON='비니 지급분 2개 회수 후 도댕으로 이동 · 20261025';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PLAN_HASH=hash(plan),TARGETS=[...plan.targets].sort((a,b)=>Number(a.userId)-Number(b.userId)),IDS=TARGETS.map(t=>t.userId);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const identityHash=u=>hash({provider:u.provider,providerId:u.provider_user_id});
const balance=r=>({quantity:String(r?.quantity??0),unseen:String(r?.unseen_quantity??0)});
const userSql='SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id';
const inventorySql='SELECT user_id::text,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY cnine_user_inventory.user_id';
const ledgerSql='SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id FROM inventory_logs WHERE item_code=$1 AND reference_id=$2 ORDER BY inventory_logs.user_id,inventory_logs.id';
function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(plan),PLAN_HASH);
 assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(source.operationKey,OPERATION_KEY);assert.equal(plan.itemCode,ITEM_CODE);assert.equal(source.itemCode,ITEM_CODE);assert.equal(plan.itemName,gift.name);
 assert.deepEqual(source.inputNicknames,['비니','도댕']);assert.equal(source.fromNickname,'비니');assert.equal(source.toNickname,'도댕');assert.equal(source.amount,2);
 assert.equal(plan.fromUserId,FROM_ID);assert.equal(plan.toUserId,TO_ID);assert.equal(plan.amount,2);
 assert.deepEqual(TARGETS.map(t=>[t.nickname,t.userId,t.delta]),[['도댕',TO_ID,2],['비니',FROM_ID,-2]]);assert.equal(new Set(IDS).size,2);
 for(const t of TARGETS){assert.equal(source.inputNicknames[t.order-1],t.inputNickname);assert.equal(t.inputNickname,t.nickname);assert.match(t.identityHash,/^[a-f0-9]{64}$/);}
}
export async function inspect(db){
 const users=await q(db,userSql,[IDS]);
 const links=await q(db,'SELECT user_id::text,provider,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_second_verifications.user_id',[IDS]);
 const items=await q(db,'SELECT code,name,is_active,description FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const inventory=await q(db,inventorySql,[IDS,ITEM_CODE]);
 const other=await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code<>$2 ORDER BY user_id,item_code',[IDS,ITEM_CODE]);
 const original=await q(db,'SELECT key,value FROM app_meta WHERE key=$1',[ORIGINAL_GRANT_KEY]);
 const logs=await q(db,ledgerSql,[ITEM_CODE,OPERATION_KEY]),prior=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,identities:links.map(l=>({userId:l.user_id,identityHash:identityHash(l)})),items,inventory,otherInventoryHash:hash(other),originalReceiptHash:hash(original),logs,receipt:prior.length?parse(one(prior).value):null};
}
const protectedHash=s=>hash({users:s.users,identities:s.identities,items:s.items,otherInventoryHash:s.otherInventoryHash,originalReceiptHash:s.originalReceiptHash});
function validateSnapshot(s){
 assert.deepEqual(s.users.map(u=>u.id),IDS);assert.deepEqual(s.identities.map(u=>u.userId),IDS);
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],u=s.users[i];assert.equal(u.nickname,t.nickname,'Nickname changed');assert.equal(u.status,'ACTIVE');assert.equal(u.role,t.role);assert.equal(s.identities[i].identityHash,t.identityHash,'Verified identity changed');
  const b=balance(s.inventory.find(r=>r.user_id===t.userId));
  for(const v of Object.values(b))assert(BigInt(v)>=0n&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsafe inventory balance');
  if(t.delta<0)assert(BigInt(b.quantity)>=2n,'Insufficient unopened boxes; transfer blocked');
  else for(const v of Object.values(b))assert(BigInt(v)+2n<=BigInt(Number.MAX_SAFE_INTEGER),'Unsafe inventory balance');
 }
 const item=one(s.items);assert.equal(item.name,gift.name);assert.equal(item.description,gift.description);assert.equal(Number(item.is_active),1);
}
export async function verify(db,receipt){
 validate(PLAN_HASH);receipt??=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.actor,'CODEX_OPERATIONS');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.delivery,'INVENTORY_TRANSFER');assert.equal(receipt.fromUserId,FROM_ID);assert.equal(receipt.toUserId,TO_ID);assert.equal(receipt.amount,2);
 assert.equal(receipt.allocations.length,2);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 const logs=await q(db,ledgerSql,[ITEM_CODE,OPERATION_KEY]);assert.deepEqual(logs.map(l=>l.user_id),IDS,'Missing or duplicate transfer ledger');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],a=receipt.allocations[i],l=logs[i];assert.equal(a.userId,t.userId);assert.equal(a.nickname,t.nickname);assert.equal(a.delta,t.delta);
  assert.equal(BigInt(a.after.quantity)-BigInt(a.before.quantity),BigInt(t.delta));
  const unseen=BigInt(a.before.unseen)+BigInt(t.delta);assert.equal(BigInt(a.after.unseen),unseen<0n?0n:unseen);
  assert(BigInt(a.after.quantity)>=0n);assert.equal(l.id,a.logId);assert.equal(l.change_amount,String(t.delta));assert.equal(l.balance_after,a.after.quantity);assert.equal(l.reason,REASON);assert.equal(l.reference_type,ACTION);assert.equal(l.reference_id,OPERATION_KEY);
 }
 assert.equal(logs.reduce((n,l)=>n+BigInt(l.change_amount),0n),0n);
 if(receipt.auditId){
  const audit=one(await q(db,'SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]));
  assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);const {auditId,...details}=receipt;assert.deepEqual(parse(audit.after_data),details);
 }
 return {status:'VERIFIED',operationKey:OPERATION_KEY,from:{userId:FROM_ID,nickname:'비니',recovered:2},to:{userId:TO_ID,nickname:'도댕',granted:2},netChange:0,inventoryLogs:2,missing:0,duplicates:0,auditId:receipt.auditId??null,completedAt:receipt.completedAt};
}
// Caller owns BEGIN/COMMIT and live USER_LOCK plus database leases for both IDs.
export async function grant(db,{expectedPlanHash,lockDeadline,leaseToken}={}){
 validate(expectedPlanHash);const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(saved.length){const receipt=parse(one(saved).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const again=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(again.length){const receipt=parse(one(again).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 const checkLeases=async()=>{assert(lockDeadline>Date.now()+5000,'Account lease expiring');assert.equal((await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[IDS,leaseToken,OPERATION_KEY,Date.now()+5000])).length,2,'Missing account lease');};
 await checkLeases();await q(db,userSql+' FOR UPDATE',[IDS]);
 await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(db,inventorySql+' FOR UPDATE',[IDS,ITEM_CODE]);await q(db,'SELECT code FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
 const before=await inspect(db);validateSnapshot(before);assert.equal(before.logs.length,0,'Orphan transfer requires reconciliation');
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const protectedBefore=protectedHash(before),now=new Date().toISOString();
 one(await q(db,`UPDATE cnine_user_inventory SET quantity=quantity-2,unseen_quantity=GREATEST(0,unseen_quantity-2),updated_at=$3 WHERE user_id=$1 AND item_code=$2 AND quantity>=2 RETURNING user_id`,[FROM_ID,ITEM_CODE,now]));
 one(await q(db,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES($1,$2,2,2,$3,$3)
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+2,unseen_quantity=cnine_user_inventory.unseen_quantity+2,updated_at=excluded.updated_at RETURNING user_id`,[TO_ID,ITEM_CODE,now]));
 const logs=await q(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
  SELECT i.user_id,$2,CASE WHEN i.user_id=$3 THEN -2 ELSE 2 END,i.quantity,$4,$5,$6,1,$7 FROM cnine_user_inventory i WHERE i.user_id=ANY($1::bigint[]) AND i.item_code=$2
  RETURNING id::text,user_id::text`,[IDS,ITEM_CODE,FROM_ID,REASON,ACTION,OPERATION_KEY,now]);assert.equal(logs.length,2);
 const after=await inspect(db),protectedAfter=protectedHash(after);assert.equal(protectedAfter,protectedBefore);
 const allocations=TARGETS.map(t=>{
  const b=before.inventory.find(r=>r.user_id===t.userId),a=one(after.inventory.filter(r=>r.user_id===t.userId));
  if(b)assert.equal(a.created_at,b.created_at);assert.equal(a.updated_at,now);
  return {userId:t.userId,nickname:t.nickname,delta:t.delta,before:balance(b),after:balance(a),logId:one(logs.filter(l=>l.user_id===t.userId)).id};
 });
 const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:source.authorization,delivery:'INVENTORY_TRANSFER',itemCode:ITEM_CODE,itemName:gift.name,fromUserId:FROM_ID,toUserId:TO_ID,amount:2,allocations,protectedBefore,protectedAfter,completedAt:now};
 await verify(db,receipt);
 receipt.auditId=one(await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_INVENTORY',$2,$3,$4,$5) RETURNING id::text`,[ACTION,OPERATION_KEY,JSON.stringify({planHash:PLAN_HASH,protectedBefore}),JSON.stringify(receipt),now])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 const verification=await verify(db,receipt);await checkLeases();return {replayed:false,receipt,verification};
}
