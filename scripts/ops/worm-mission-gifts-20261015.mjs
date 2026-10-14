import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import SOURCE from './worm-mission-gifts-20261015.source.json' with {type:'json'};
import PLAN from './worm-mission-gifts-20261015.targets.json' with {type:'json'};
export {SOURCE};
export const OPERATION_KEY=SOURCE.operationKey,ITEM=SOURCE.itemCode;
export const TARGETS=PLAN.targets,HELD=PLAN.pending;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PLAN_HASH=digest(PLAN);
export const TARGET_ROWS=SOURCE.rows.map(([sourceNickname,gameNickname,sourceChecked,donationTotal,boxes])=>({sourceNickname,gameNickname,sourceChecked,donationTotal,boxes}));
assert.equal(TARGET_ROWS.length,74);assert.equal(new Set(TARGET_ROWS.map(r=>r.gameNickname)).size,74);
assert.equal(TARGET_ROWS.reduce((sum,r)=>sum+r.boxes,0),180);
for(const row of TARGET_ROWS)assert.equal(row.boxes,Math.min(3,Math.floor(row.donationTotal/100)));
assert.equal(TARGETS.length,73);assert.equal(new Set(TARGETS.map(r=>r.userId)).size,73);
assert.equal(new Set(TARGETS.map(r=>r.sourceRow)).size,73);assert.equal(TARGETS.reduce((n,r)=>n+r.boxes,0),177);
assert.deepEqual(HELD.map(r=>[r.gameNickname,r.boxes]),[['캄레인',3]]);
for(const target of TARGETS){const row=TARGET_ROWS[target.sourceRow-1];assert.equal(target.inputNickname,row.gameNickname);assert.equal(target.boxes,row.boxes);assert.ok(target.boxes>=1&&target.boxes<=3);}
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
export async function inspect(db){
 const users=await q(db,'SELECT id::text id,nickname,status,role FROM users WHERE nickname=ANY($1::text[]) ORDER BY id',[TARGET_ROWS.map(r=>r.gameNickname)]);
 const ids=[...new Set([...users.map(r=>r.id),...TARGETS.map(r=>r.userId)])],matched=TARGET_ROWS.map(row=>({...row,matches:users.filter(u=>u.nickname===row.gameNickname)}));
 const missing=matched.filter(r=>r.matches.length!==1);
 const caseCandidates=missing.length?await q(db,'SELECT id::text id,nickname,status FROM users WHERE lower(nickname)=ANY($1::text[]) ORDER BY id',[missing.map(r=>r.gameNickname.toLowerCase())]):[];
 const schema=await q(db,"SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[['users','user_second_verifications','inventory_logs','user_messages','cnine_user_inventory']]);
 const items=await q(db,'SELECT code,name,is_active,description FROM inventory_items WHERE code=$1',[ITEM]);
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after,reason,reference_type,reference_id,admin_id::text admin_id,created_at FROM inventory_logs WHERE item_code=$1 AND user_id=ANY($2::bigint[]) ORDER BY id',[ITEM,ids]);
 const inventory=await q(db,'SELECT user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE item_code=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id',[ITEM,ids]);
 const operations=await q(db,"SELECT key FROM app_meta WHERE key LIKE 'ops:%worm%' OR key LIKE 'ops:%1322742%' ORDER BY key");
 const identityCandidates=await q(db,`SELECT u.id::text id,u.nickname,u.status,s.provider,s.provider_name
  FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id
  WHERE u.nickname ILIKE ANY($1::text[]) OR s.provider_name=ANY($2::text[]) ORDER BY u.id`,[['%베%킹%','%캄%','%쑤댕%'],missing.map(r=>r.sourceNickname)]);
 const messageSchema=await q(db,"SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE '%message%reward%' ORDER BY table_name,ordinal_position");
 const messages=await q(db,`SELECT r.id::text id,r.user_id::text user_id,r.reward_amount::text reward_amount,r.claimed_at,m.title,m.campaign_key
  FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE r.reward_type=$1 AND r.user_id=ANY($2::bigint[]) ORDER BY r.id`,[ITEM,ids]);
 const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {checkedAt:new Date().toISOString(),matched,caseCandidates,identityCandidates,items,inventory,logs,messages,operations,schema,messageSchema,receipt:saved?JSON.parse(saved.value):null};
}

export async function verify(db,receipt){
 if(!receipt){const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert(saved,'Missing grant receipt');receipt=JSON.parse(saved.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.itemCode,ITEM);assert.equal(receipt.delivery,'DIRECT_INVENTORY');assert.equal(receipt.recipientCount,73);assert.equal(receipt.totalBoxes,177);
 assert.deepEqual(receipt.allocations.map(({sourceRow,userId,nickname,boxes})=>({sourceRow,userId,nickname,boxes})),TARGETS.map(({sourceRow,userId,nickname,boxes})=>({sourceRow,userId,nickname,boxes})));
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after,admin_id::text admin_id,reason FROM inventory_logs WHERE item_code=$1 AND reference_id=$2 ORDER BY user_id',[ITEM,OPERATION_KEY]);
 assert.equal(logs.length,73);assert.equal(new Set(logs.map(r=>r.user_id)).size,73);
 for(const row of receipt.allocations){
  const log=logs.find(l=>l.id===row.logId);assert(log,'Missing inventory ledger');assert.equal(log.user_id,row.userId);assert.equal(Number(log.change_amount),row.boxes);
  assert.equal(log.balance_after,row.after.quantity);assert.equal(log.admin_id,receipt.adminId);assert.equal(log.reason,SOURCE.title);
  assert.equal(BigInt(row.after.quantity)-BigInt(row.before.quantity),BigInt(row.boxes));assert.equal(BigInt(row.after.unseenQuantity)-BigInt(row.before.unseenQuantity),BigInt(row.boxes));
 }
 const [audit]=await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);assert.equal(audit?.action_type,'OPS_WORM_MISSION_GIFT');assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 return {status:'VERIFIED',recipients:73,totalBoxes:177,maximumPerAccount:3,groups:{3:44,2:16,1:13},held:HELD,ledgerRows:logs.length,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// Caller holds all target USER_LOCK leases and their PostgreSQL fallback leases.
// The frozen, reviewed recipient set is the only permitted input; no message or
// gift opening is performed. A durable receipt handles lost commit responses.
export async function grant(db,{expectedPlanHash,commit=false,lockDeadline}={}){
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed recipient plan changed');
 assert.ok(Number.isFinite(lockDeadline)&&lockDeadline>Date.now()+10000,'Live account locks required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verify(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,committed:true};}
  const ids=TARGETS.map(r=>r.userId),amounts=TARGETS.map(r=>r.boxes);
  const walletSql='SELECT id::text id,nickname,status,role,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id::bigint';
  const users=await q(db,walletSql+' FOR UPDATE',[ids]);assert.equal(users.length,73,'Recipient count changed');
  for(const target of TARGETS){const user=users.find(u=>u.id===target.userId);assert.equal(user?.nickname,target.nickname,'Recipient identity changed');assert.equal(user.status,'ACTIVE');}
  const [owner]=await q(db,"SELECT id::text id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner,'Active owner required');
  const [item]=await q(db,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM]);assert.equal(item?.name,'지렁이대회 사은품');assert.equal(Number(item.is_active),1);
  const priorLogs=await q(db,'SELECT id FROM inventory_logs WHERE item_code=$1 AND user_id=ANY($2::bigint[]) AND change_amount>0',[ITEM,ids]);assert.equal(priorLogs.length,0,'Prior gift credit requires reconciliation');
  const priorMessages=await q(db,'SELECT id FROM user_message_rewards WHERE reward_type=$1 AND user_id=ANY($2::bigint[])',[ITEM,ids]);assert.equal(priorMessages.length,0,'Prior gift attachment requires reconciliation');
  const before=await q(db,'SELECT user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE item_code=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id FOR UPDATE',[ITEM,ids]);
  for(const row of before){assert.equal(BigInt(row.quantity),0n,'Unexplained previous gift stock');assert.equal(BigInt(row.unseen_quantity),0n);}
  const now=new Date().toISOString();
  const after=await q(db,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT user_id,$3,amount,amount,$4,$4 FROM unnest($1::bigint[],$2::bigint[]) AS t(user_id,amount)
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity`,[ids,amounts,ITEM,now]);
  assert.equal(after.length,73,'Partial inventory grant');
  const balances=ids.map(id=>{const row=after.find(r=>r.user_id===id),target=TARGETS.find(r=>r.userId===id);assert(row);assert.equal(BigInt(row.quantity),BigInt(target.boxes));assert.equal(BigInt(row.unseen_quantity),BigInt(target.boxes));return row.quantity;});
  const logs=await q(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,$4,amount,balance,$5,'SYSTEM_GRANT',$6,$7,$8 FROM unnest($1::bigint[],$2::bigint[],$3::bigint[]) AS t(user_id,amount,balance)
   RETURNING id::text id,user_id::text user_id`,[ids,amounts,balances,ITEM,SOURCE.title,OPERATION_KEY,owner.id,now]);assert.equal(logs.length,73,'Partial grant ledger');
  assert.deepEqual(await q(db,walletSql,[ids]),users,'Unrelated account balances changed');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,sourceUrl:SOURCE.sourceUrl,sourceContentSha256:PLAN.sourceCheck.contentSha256,
   authorization:SOURCE.authorization,holdAuthorization:'일단 안된건 보류하고 명단 따로 작성',itemCode:ITEM,delivery:'DIRECT_INVENTORY',recipientCount:73,totalBoxes:177,maxPerAccount:3,held:HELD,
   allocations:TARGETS.map(target=>{const old=before.find(r=>r.user_id===target.userId)||{quantity:'0',unseen_quantity:'0'},row=after.find(r=>r.user_id===target.userId),log=logs.find(r=>r.user_id===target.userId);assert(log);return {...target,before:{quantity:old.quantity,unseenQuantity:old.unseen_quantity},after:{quantity:row.quantity,unseenQuantity:row.unseen_quantity},logId:log.id};}),
   walletsUnchanged:true,walletSnapshotHash:digest(users),adminId:owner.id,completedAt:now};
  const [audit]=await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_WORM_MISSION_GIFT','USER_INVENTORY',$2,$3,$4,$5) RETURNING id::text id`,[owner.id,OPERATION_KEY,JSON.stringify({recipientCount:73,priorGiftCredits:0,priorGiftMessages:0}),JSON.stringify(receipt),now]);assert(audit,'Missing grant audit');receipt.auditId=audit.id;
  assert.equal((await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1,'Missing completed receipt');
  const verification=await verify(db,receipt);assert.ok(Date.now()+5000<lockDeadline,'Account lock expiry too close');
  await db.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,committed:commit,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
