import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import source from './source.json' with {type:'json'};
const gift={code:'REVERSECALL_STREAMER_GIFT_BOX',name:'리버스콜 스트리머 선물',description:plan.itemDescription};

export const OPERATION_KEY='ops:streamer-box-scaled:20261030:v1';
export const ITEM_CODE=gift.code,ACTION='OPS_STREAMER_BOX_SCALED_20261030';
export const REASON='사용자 명단 수량×2 스트리머 박스 지급 · 비니 추가 · 20261030';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PLAN_HASH=hash(plan),TARGETS=[...plan.targets].sort((a,b)=>Number(a.userId)-Number(b.userId)),IDS=TARGETS.map(t=>t.userId);
export const identityHash=u=>hash({provider:u.provider,providerId:u.provider_user_id});
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const balance=r=>({quantity:String(r?.quantity??0),unseen:String(r?.unseen_quantity??0)});
const userSql='SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id';
const inventorySql='SELECT user_id::text,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY cnine_user_inventory.user_id';
const ledgerSql='SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id FROM inventory_logs WHERE item_code=$1 AND reference_id=$2 ORDER BY inventory_logs.user_id,inventory_logs.id';

export function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(plan),PLAN_HASH);
 assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(source.operationKey,OPERATION_KEY);assert.equal(plan.itemCode,ITEM_CODE);assert.equal(plan.itemName,gift.name);
 assert.equal(source.inputs.length,15);assert.equal(plan.requestedCount,15);assert.equal(TARGETS.length,15);assert.equal(new Set(IDS).size,15);
 assert.equal(TARGETS.reduce((n,t)=>n+t.amount,0),138);assert.equal(plan.recipientCount,15);assert.equal(plan.totalBoxes,138);
 assert.equal(TARGETS.reduce((n,t)=>n+t.units,0),69);assert.equal(plan.totalUnits,69);assert.equal(source.multiplier,2);assert.equal(plan.multiplier,2);
 assert.deepEqual(plan.pending,[]);assert.deepEqual(plan.skipped,[]);
 assert.equal(plan.delivery,'DIRECT_INVENTORY');assert.equal(source.delivery,'DIRECT_INVENTORY');
 assert.equal(plan.authorization,source.authorization);assert.equal(plan.additionalAuthorization,source.additionalAuthorization);assert.equal(source.additionalAuthorization,'비니 3\n추가');
 const expectedInputs=[['씨나인택갓',5,'1195'],['더듬이구',5,'4391'],['Mild7',5,'290'],['랭비!',3,'4615'],['음순이',5,'65'],['족게이다',10,'4111'],['Moo날두',5,'4415'],['0수표',5,'88'],['박사',3,'164'],['비쥬얼깡패',5,'81'],['라피e',5,'360'],['차단하다',5,'162'],['족구조아',2,'525'],['족단',3,'4582'],['비니',3,'4595']];
 assert.deepEqual([...TARGETS.map(t=>t.order)].sort((a,b)=>a-b),Array.from({length:15},(_,i)=>i+1));
 for(const t of TARGETS){
  const e=source.inputs[t.order-1],[name,units,id]=expectedInputs[t.order-1];
  assert.deepEqual([t.inputNickname,t.nickname,t.units,t.userId],[name,name,units,id]);
  for(const k of ['order','inputNickname','units','amount'])assert.equal(t[k],e[k]);
  assert(Number.isSafeInteger(t.units)&&t.units>0);assert.equal(t.amount,t.units*2);
  assert.match(t.userId,/^[1-9]\d*$/);assert.match(t.identityHash,/^[a-f0-9]{64}$/);
 }
}

export async function inspect(db){
 const users=await q(db,userSql,[IDS]);
 const links=await q(db,'SELECT user_id::text,provider,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_second_verifications.user_id',[IDS]);
 const items=await q(db,'SELECT code,name,is_active,description FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const inventory=await q(db,inventorySql,[IDS,ITEM_CODE]);
 const otherInventory=await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code<>$2 ORDER BY user_id,item_code',[IDS,ITEM_CODE]);
 const logs=await q(db,ledgerSql,[ITEM_CODE,OPERATION_KEY]);
 const prior=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,identities:links.map(l=>({userId:l.user_id,identityHash:identityHash(l)})),items,inventory,otherInventoryHash:hash(otherInventory),logs,receipt:prior.length?parse(one(prior).value):null};
}

function validateSnapshot(s){
 assert.deepEqual(s.users.map(u=>u.id),IDS);assert.deepEqual(s.identities.map(u=>u.userId),IDS);
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],u=s.users[i];assert.equal(u.nickname,t.nickname,'Nickname changed');assert.equal(u.status,'ACTIVE');assert.equal(u.role,t.role);
  assert.equal(s.identities[i].identityHash,t.identityHash,'Verified identity changed');
  for(const value of Object.values(balance(s.inventory.find(r=>r.user_id===t.userId))))assert(BigInt(value)>=0n&&BigInt(value)+BigInt(t.amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsafe inventory balance');
 }
 const item=one(s.items);assert.equal(item.name,gift.name);assert.equal(item.description,gift.description);assert.equal(Number(item.is_active),1);
}
const protectedHash=s=>hash({users:s.users,identities:s.identities,items:s.items,otherInventoryHash:s.otherInventoryHash});

export async function verify(db,receipt){
 validate(PLAN_HASH);
 receipt??=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.actor,'CODEX_OPERATIONS');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.authorization,plan.authorization);assert.equal(receipt.additionalAuthorization,plan.additionalAuthorization);assert.equal(receipt.multiplier,2);assert.equal(receipt.totalUnits,69);assert.equal(receipt.delivery,'DIRECT_INVENTORY');assert.equal(receipt.recipientCount,15);assert.equal(receipt.totalBoxes,138);
 assert.deepEqual(receipt.pending,plan.pending);assert.deepEqual(receipt.skipped,plan.skipped);assert.equal(receipt.allocations.length,15);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 const logs=await q(db,ledgerSql,[ITEM_CODE,OPERATION_KEY]);assert.deepEqual(logs.map(l=>l.user_id),IDS,'Missing or duplicate grant');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],a=receipt.allocations[i],l=logs[i];
  assert.equal(a.userId,t.userId);assert.equal(a.nickname,t.nickname);assert.equal(a.inputNickname,t.inputNickname);assert.equal(a.amount,t.amount);assert.equal(a.units,t.units);
  for(const key of ['quantity','unseen'])assert.equal(BigInt(a.after[key])-BigInt(a.before[key]),BigInt(t.amount));
  assert.equal(l.id,a.logId);assert.equal(l.change_amount,String(t.amount));assert.equal(l.balance_after,a.after.quantity);assert.equal(l.reason,REASON);assert.equal(l.reference_type,ACTION);assert.equal(l.reference_id,OPERATION_KEY);
 }
 if(receipt.auditId){
  const audit=one(await q(db,'SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]));
  assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);
  const {auditId,...details}=receipt;assert.deepEqual(parse(audit.after_data),details);
 }
 return {status:'VERIFIED',operationKey:OPERATION_KEY,recipientCount:15,totalBoxes:138,pending:plan.pending,inventoryLogs:logs.length,missing:0,duplicates:0,auditId:receipt.auditId??null,completedAt:receipt.completedAt};
}

// Caller owns BEGIN/COMMIT and both live USER_LOCK and matching database leases.
// A completed receipt is checked before leases, so a replay can be SELECT-only.
export async function grant(db,{expectedPlanHash,lockDeadline,leaseToken}={}){
 validate(expectedPlanHash);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(saved.length){const receipt=parse(one(saved).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const again=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(again.length){const receipt=parse(one(again).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 const checkLeases=async()=>{
  assert(lockDeadline>Date.now()+5000,'Account lease expiring');
  assert.equal((await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[IDS,leaseToken,OPERATION_KEY,Date.now()+5000])).length,15,'Missing account lease');
 };await checkLeases();
 await q(db,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS]);
 await q(db,userSql+' FOR UPDATE',[IDS]);
 await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(db,inventorySql+' FOR UPDATE',[IDS,ITEM_CODE]);await q(db,'SELECT code FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
 const before=await inspect(db);validateSnapshot(before);assert.equal(before.logs.length,0,'Orphan grant requires reconciliation');
 assert.equal((await q(db,'SELECT id FROM admin_logs WHERE target_id=$1',[OPERATION_KEY])).length,0,'Orphan audit requires reconciliation');
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const protectedBefore=protectedHash(before),now=new Date().toISOString(),amounts=TARGETS.map(t=>t.amount);
 const logs=await q(db,`WITH credited AS (
  INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
  SELECT t.user_id,$3,t.amount,t.amount,$4,$4 FROM unnest($1::bigint[],$2::bigint[]) t(user_id,amount) ORDER BY t.user_id::text
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
  RETURNING user_id,quantity
 ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
  SELECT c.user_id,$3,t.amount,c.quantity,$5,$6,$7,1,$4 FROM credited c JOIN unnest($1::bigint[],$2::bigint[]) t(user_id,amount) ON t.user_id=c.user_id
  RETURNING id::text,user_id::text`,[IDS,amounts,ITEM_CODE,now,REASON,ACTION,OPERATION_KEY]);
 assert.equal(logs.length,15);assert.equal(new Set(logs.map(l=>l.user_id)).size,15);
 const after=await inspect(db),protectedAfter=protectedHash(after);assert.equal(protectedAfter,protectedBefore);
 const allocations=TARGETS.map(t=>{
  const b=before.inventory.find(r=>r.user_id===t.userId),a=one(after.inventory.filter(r=>r.user_id===t.userId));
  if(b)assert.equal(a.created_at,b.created_at);assert.equal(a.updated_at,now);
  return {userId:t.userId,nickname:t.nickname,inputNickname:t.inputNickname,units:t.units,amount:t.amount,before:balance(b),after:balance(a),logId:one(logs.filter(l=>l.user_id===t.userId)).id};
 });
 const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:plan.authorization,additionalAuthorization:plan.additionalAuthorization,multiplier:2,totalUnits:69,
  delivery:'DIRECT_INVENTORY',itemCode:ITEM_CODE,itemName:gift.name,recipientCount:15,totalBoxes:138,pending:plan.pending,skipped:plan.skipped,allocations,protectedBefore,protectedAfter,completedAt:now};
 await verify(db,receipt);
 receipt.auditId=one(await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
  VALUES(1,$1,'USER_INVENTORY',$2,$3,$4,$5) RETURNING id::text`,[ACTION,OPERATION_KEY,JSON.stringify({planHash:PLAN_HASH,protectedBefore}),JSON.stringify(receipt),now])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 const verification=await verify(db,receipt);await checkLeases();return {replayed:false,receipt,verification};
}
