import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import source from './source.json' with {type:'json'};
const gift={code:'REVERSECALL_STREAMER_GIFT_BOX',name:'리버스콜 스트리머 선물',description:plan.itemDescription};

export const OPERATION_KEY='ops:streamer-box-starball:20261031:v1';
export const ITEM_CODE=gift.code,ACTION='OPS_STREAMER_BOX_STARBALL_20261031';
export const REASON='사용자 별풍선 명단 209(표시2)→6박스·509(표시5)→12박스 지급 · 20261031';
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
 assert.equal(source.inputs.length,42);assert.equal(plan.requestedCount,42);assert.equal(TARGETS.length,42);assert.equal(new Set(IDS).size,42);assert.equal(new Set(TARGETS.map(t=>t.identityHash)).size,42);
 assert.equal(TARGETS.reduce((n,t)=>n+t.amount,0),390);assert.equal(plan.recipientCount,42);assert.equal(plan.totalBoxes,390);
 const mapping={'2':{starBallCount:209,boxes:6},'5':{starBallCount:509,boxes:12}};
 assert.deepEqual(source.mapping,mapping);assert.deepEqual(plan.mapping,mapping);
 assert.equal(plan.sixBoxRecipients,19);assert.equal(plan.twelveBoxRecipients,23);
 assert.equal(TARGETS.filter(t=>t.marker===2).length,19);assert.equal(TARGETS.filter(t=>t.marker===5).length,23);
 assert.deepEqual(plan.pending,[]);assert.deepEqual(plan.skipped,[]);
 assert.equal(plan.delivery,'DIRECT_INVENTORY');assert.equal(source.delivery,'DIRECT_INVENTORY');assert.equal(plan.authorization,source.authorization);
 const expectedInputs=[["0수표",5,"88"],["씨나인택갓",5,"1195"],["Mild7",5,"290"],["더듬이구",5,"4391"],["응맨",2,"4572"],["혜정",2,"4570"],["학벌",5,"4627"],["라피e",5,"360"],["현하루",5,"218"],["Moo날두",5,"4415"],["베베킹",5,"289"],["족구조아",5,"525"],["간장왕대게찜",5,"4981"],["오일바른가지",2,"3011"],["˚쟁이。",5,"4705"],["세라네꼬라지",2,"4651"],["[C9]가시",2,"4866"],["깅더듬",2,"5877"],["핫시",5,"1768"],["[C9]족쪽이",5,"303"],["암살자..",2,"4598"],["블랙캐슬",2,"2420"],["전게씹선미아웃",5,"1255"],["레가파",5,"4408"],["단정한밤",5,"5008"],["Veil",2,"4629"],["고라니ㅇ",5,"4610"],["찬호",5,"4597"],["박사",2,"164"],["모래",2,"295"],["ShowMaker",2,"233"],["좋은하루",2,"1545"],["점빡이",5,"5362"],["zkzk9999",2,"3884"],["리이렐",2,"4621"],["대지",2,"4479"],["쁴로리",5,"4965"],["다시생각",5,"1421"],["오승환이다",5,"16"],["심심이",2,"4933"],["유나이은",2,"236"],["하트!",2,"4608"]];
 assert.deepEqual([...TARGETS.map(t=>t.order)].sort((a,b)=>a-b),Array.from({length:42},(_,i)=>i+1));
 for(const t of TARGETS){
  const e=source.inputs[t.order-1],[name,marker,id]=expectedInputs[t.order-1];
  assert.deepEqual([t.inputNickname,t.nickname,t.marker,t.userId],[name,name,marker,id]);
  for(const k of ['order','inputNickname','marker','starBallCount','amount'])assert.equal(t[k],e[k]);
  assert.equal(t.amount,mapping[marker].boxes);assert.equal(t.starBallCount,mapping[marker].starBallCount);
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
 assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.authorization,plan.authorization);assert.deepEqual(receipt.mapping,plan.mapping);assert.equal(receipt.sixBoxRecipients,19);assert.equal(receipt.twelveBoxRecipients,23);assert.equal(receipt.delivery,'DIRECT_INVENTORY');assert.equal(receipt.recipientCount,42);assert.equal(receipt.totalBoxes,390);
 assert.deepEqual(receipt.pending,plan.pending);assert.deepEqual(receipt.skipped,plan.skipped);assert.equal(receipt.allocations.length,42);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 const logs=await q(db,ledgerSql,[ITEM_CODE,OPERATION_KEY]);assert.deepEqual(logs.map(l=>l.user_id),IDS,'Missing or duplicate grant');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],a=receipt.allocations[i],l=logs[i];
  assert.equal(a.userId,t.userId);assert.equal(a.nickname,t.nickname);assert.equal(a.inputNickname,t.inputNickname);assert.equal(a.amount,t.amount);assert.equal(a.marker,t.marker);assert.equal(a.starBallCount,t.starBallCount);
  for(const key of ['quantity','unseen'])assert.equal(BigInt(a.after[key])-BigInt(a.before[key]),BigInt(t.amount));
  assert.equal(l.id,a.logId);assert.equal(l.change_amount,String(t.amount));assert.equal(l.balance_after,a.after.quantity);assert.equal(l.reason,REASON);assert.equal(l.reference_type,ACTION);assert.equal(l.reference_id,OPERATION_KEY);
 }
 if(receipt.auditId){
  const audit=one(await q(db,'SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]));
  assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);
  const {auditId,...details}=receipt;assert.deepEqual(parse(audit.after_data),details);
 }
 return {status:'VERIFIED',operationKey:OPERATION_KEY,recipientCount:42,totalBoxes:390,pending:plan.pending,inventoryLogs:logs.length,missing:0,duplicates:0,auditId:receipt.auditId??null,completedAt:receipt.completedAt};
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
  assert.equal((await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[IDS,leaseToken,OPERATION_KEY,Date.now()+5000])).length,42,'Missing account lease');
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
 assert.equal(logs.length,42);assert.equal(new Set(logs.map(l=>l.user_id)).size,42);
 const after=await inspect(db),protectedAfter=protectedHash(after);assert.equal(protectedAfter,protectedBefore);
 const allocations=TARGETS.map(t=>{
  const b=before.inventory.find(r=>r.user_id===t.userId),a=one(after.inventory.filter(r=>r.user_id===t.userId));
  if(b)assert.equal(a.created_at,b.created_at);assert.equal(a.updated_at,now);
  return {userId:t.userId,nickname:t.nickname,inputNickname:t.inputNickname,marker:t.marker,starBallCount:t.starBallCount,amount:t.amount,before:balance(b),after:balance(a),logId:one(logs.filter(l=>l.user_id===t.userId)).id};
 });
 const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:plan.authorization,mapping:plan.mapping,sixBoxRecipients:19,twelveBoxRecipients:23,
  delivery:'DIRECT_INVENTORY',itemCode:ITEM_CODE,itemName:gift.name,recipientCount:42,totalBoxes:390,pending:plan.pending,skipped:plan.skipped,allocations,protectedBefore,protectedAfter,completedAt:now};
 await verify(db,receipt);
 receipt.auditId=one(await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
  VALUES(1,$1,'USER_INVENTORY',$2,$3,$4,$5) RETURNING id::text`,[ACTION,OPERATION_KEY,JSON.stringify({planHash:PLAN_HASH,protectedBefore}),JSON.stringify(receipt),now])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 const verification=await verify(db,receipt);await checkLeases();return {replayed:false,receipt,verification};
}
