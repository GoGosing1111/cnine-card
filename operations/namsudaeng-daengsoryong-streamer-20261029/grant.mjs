import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import source from './source.json' with {type:'json'};
export const OPERATION_KEY='ops:namsudaeng-daengsoryong-streamer:20261029:v1';
export const ACTION='OPS_NAMSUD_PET_STREAMER_20261029',ITEM_CODE='REVERSECALL_STREAMER_GIFT_BOX',PET_CODE='PET-DAENGSORYONG';
export const REASON='남수댕 댕소룡 펫 1마리 및 스트리머 선물 4개 지급 · 20261029';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PLAN_HASH=hash(plan),TARGETS=plan.targets,IDS=TARGETS.map(t=>t.userId);
const CMS='pet_cms_preparation_v1',COLLECTION='pet_collection_v1:183';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const balance=r=>({quantity:String(r?.quantity??0),unseen:String(r?.unseen_quantity??0)});
const collection=s=>s.collection?parse(s.collection.value):{revision:0,pets:{}};
const ledgerSql="SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id FROM inventory_logs WHERE item_code='REVERSECALL_STREAMER_GIFT_BOX' AND reference_id=$1 ORDER BY id";

export function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(plan),PLAN_HASH);
 assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(source.operationKey,OPERATION_KEY);
 assert.equal(plan.authorization,'남수댕 계정에 댕소룡 지급하고 스트리머 선물 4개 지급해');assert.equal(plan.authorization,source.authorization);
 assert.equal(plan.clarification,'펫이야 임마');assert.equal(plan.clarification,source.clarification);
 assert.equal(plan.delivery,'DIRECT');assert.equal(plan.petQuantity,1);assert.equal(plan.boxQuantity,4);
 assert.equal(plan.petCode,PET_CODE);assert.equal(plan.petName,'댕소룡');assert.equal(hash(plan.petDefinition),plan.petDefinitionHash);
 assert.equal(plan.itemCode,ITEM_CODE);assert.equal(plan.itemName,'리버스콜 스트리머 선물');
 assert.equal(TARGETS.length,1);assert.equal(TARGETS[0].userId,'183');assert.equal(TARGETS[0].nickname,'남수댕');assert.equal(TARGETS[0].amount,4);
 assert.match(TARGETS[0].identityHash,/^[a-f0-9]{64}$/);
}

export async function inspect(db){
 const users=await q(db,'SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=183');
 const fullUsers=await q(db,'SELECT * FROM users WHERE id=183');
 const links=await q(db,'SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=183');
 const items=await q(db,'SELECT code,name,description,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const inventory=await q(db,'SELECT quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=183 AND item_code=$1',[ITEM_CODE]);
 const otherInventory=await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=183 AND item_code<>$1 ORDER BY item_code',[ITEM_CODE]);
 const meta=await q(db,'SELECT key,value,updated_at FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[CMS,COLLECTION,'pet_loadout_v1:183','pet_potentials_v1:183','pet_opening_settings_v1','pet_potential_settings_v1',OPERATION_KEY]]);
 const saved=meta.find(r=>r.key===OPERATION_KEY);
 return {users,fullUsersHash:hash(fullUsers),identities:links.map(l=>hash({provider:l.provider,providerId:l.provider_user_id})),items,inventory,
  otherInventoryHash:hash(otherInventory),collection:meta.find(r=>r.key===COLLECTION)??null,
  protectedMeta:meta.filter(r=>r.key!==COLLECTION&&r.key!==OPERATION_KEY),
  logs:await q(db,ledgerSql,[OPERATION_KEY]),receipt:saved?parse(saved.value):null};
}
function check(s){
 const u=one(s.users),t=TARGETS[0];assert.equal(u.id,t.userId);assert.equal(u.nickname,t.nickname,'Nickname changed');assert.equal(u.role,t.role);assert.equal(u.status,'ACTIVE');
 assert.deepEqual(s.identities,[t.identityHash],'Verified identity changed');
 const item=one(s.items);assert.equal(item.code,ITEM_CODE);assert.equal(item.name,plan.itemName);assert.equal(item.description,plan.itemDescription);assert.equal(Number(item.is_active),1);
 const cms=parse(one(s.protectedMeta.filter(r=>r.key===CMS)).value),pet=one(cms.document.pets.filter(p=>p.code===PET_CODE));
 assert.equal(hash(pet),plan.petDefinitionHash,'Pet definition changed');
 const c=collection(s);assert(Number.isSafeInteger(c.revision)&&c.revision>=0&&c.revision<Number.MAX_SAFE_INTEGER);
 assert(c.pets&&typeof c.pets==='object'&&!Array.isArray(c.pets));
 for(const n of Object.values(c.pets))assert(Number.isSafeInteger(n)&&n>=0,'Invalid pet count');
 assert(Number.isSafeInteger((c.pets[PET_CODE]??0)+1),'Unsafe pet count');
 assert(s.inventory.length<=1);
 for(const n of Object.values(balance(s.inventory[0])))assert(BigInt(n)>=0n&&BigInt(n)+4n<=BigInt(Number.MAX_SAFE_INTEGER),'Unsafe inventory balance');
}
const protectedHash=s=>{
 const {revision,pets,...rest}=collection(s),otherPets={...pets};delete otherPets[PET_CODE];
 return hash({users:s.users,fullUsersHash:s.fullUsersHash,identities:s.identities,items:s.items,otherInventoryHash:s.otherInventoryHash,protectedMeta:s.protectedMeta,petCollectionRest:rest,otherPets});
};

export async function verify(db,receipt){
 validate(PLAN_HASH);receipt??=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.actor,'CODEX_OPERATIONS');assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.userId,'183');assert.equal(receipt.nickname,'남수댕');assert.equal(receipt.pet.code,PET_CODE);assert.equal(receipt.pet.amount,1);
 assert.equal(receipt.pet.after-receipt.pet.before,1);assert.equal(receipt.pet.revisionAfter-receipt.pet.revisionBefore,1);
 assert.equal(receipt.boxes.code,ITEM_CODE);assert.equal(receipt.boxes.amount,4);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 for(const k of ['quantity','unseen'])assert.equal(BigInt(receipt.boxes.after[k])-BigInt(receipt.boxes.before[k]),4n);
 const log=one(await q(db,ledgerSql,[OPERATION_KEY]));
 assert.equal(log.id,receipt.boxes.logId);assert.equal(log.user_id,'183');assert.equal(log.item_code,ITEM_CODE);assert.equal(log.change_amount,'4');assert.equal(log.balance_after,receipt.boxes.after.quantity);
 assert.equal(log.reason,REASON);assert.equal(log.reference_type,ACTION);assert.equal(log.reference_id,OPERATION_KEY);
 const petAudit=one(await q(db,'SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.pet.auditId]));
 assert.equal(Number(petAudit.admin_id),1);assert.equal(petAudit.action_type,'PET_GRANT');assert.equal(petAudit.target_id,'183');assert.deepEqual(parse(petAudit.after_data),receipt.pet.result);
 const p=receipt.pet.result;assert.equal(p.requestId,OPERATION_KEY);assert.equal(p.target.id,183);assert.equal(p.target.nickname,'남수댕');assert.equal(p.pet.code,PET_CODE);assert.equal(p.quantity,1);assert.equal(p.before,receipt.pet.before);assert.equal(p.after,receipt.pet.after);assert.equal(p.collectionRevision,receipt.pet.revisionAfter);
 if(receipt.auditId){
  const audits=await q(db,'SELECT id::text,admin_id,action_type,target_id,after_data FROM admin_logs WHERE target_id=$1',[OPERATION_KEY]),audit=one(audits);
  assert.equal(audit.id,receipt.auditId);assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,ACTION);
  const {auditId,...details}=receipt;assert.deepEqual(parse(audit.after_data),details);
 }
 return {status:'VERIFIED',operationKey:OPERATION_KEY,userId:'183',nickname:'남수댕',pets:1,totalBoxes:4,inventoryLogs:1,missing:0,duplicates:0,auditId:receipt.auditId??null,petAuditId:receipt.pet.auditId,completedAt:receipt.completedAt};
}

// Caller owns the transaction plus the live USER_LOCK and database lease.
// Completed operations verify from immutable receipts and never restore spent items.
export async function grant(db,{expectedPlanHash,lockDeadline,leaseToken}={}){
 validate(expectedPlanHash);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(saved.length){const receipt=parse(one(saved).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const again=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(again.length){const receipt=parse(one(again).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 const lease=async()=>{assert(lockDeadline>Date.now()+5000,'Lease expiring');one(await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=183 AND token=$1 AND action_path=$2 AND lease_until_ms>$3 FOR UPDATE',[leaseToken,OPERATION_KEY,Date.now()+5000]));};
 await lease();await q(db,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=183 FOR UPDATE');await q(db,'SELECT id FROM users WHERE id=183 FOR UPDATE');
 await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=183 FOR SHARE');
 await q(db,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[COLLECTION]);await q(db,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[CMS]);
 await q(db,'SELECT user_id FROM cnine_user_inventory WHERE user_id=183 AND item_code=$1 FOR UPDATE',[ITEM_CODE]);await q(db,'SELECT code FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
 const before=await inspect(db);check(before);assert.equal(before.logs.length,0,'Orphan inventory ledger');
 assert.equal((await q(db,'SELECT id FROM admin_logs WHERE target_id=$1',[OPERATION_KEY])).length,0,'Orphan audit');
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const protectedBefore=protectedHash(before),now=new Date().toISOString(),b=collection(before),petBefore=b.pets[PET_CODE]??0;
 const next={...b,revision:b.revision+1,pets:{...b.pets,[PET_CODE]:petBefore+1}};
 if(before.collection)one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(next),now,COLLECTION,before.collection.value]));
 else one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[COLLECTION,JSON.stringify(next),now]));
 const log=one(await q(db,`WITH credited AS (
  INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(183,$1,4,4,$2,$2)
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+4,unseen_quantity=cnine_user_inventory.unseen_quantity+4,updated_at=excluded.updated_at RETURNING quantity
 ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
  SELECT 183,$1,4,quantity,$3,$4,$5,1,$2 FROM credited RETURNING id::text`,[ITEM_CODE,now,REASON,ACTION,OPERATION_KEY]));
 const petResult={ok:true,requestId:OPERATION_KEY,adminId:1,actor:'CODEX_OPERATIONS',target:{id:183,nickname:'남수댕'},pet:{code:PET_CODE,name:plan.petName,sourceArt:plan.petDefinition.sourceArt},quantity:1,reason:REASON,before:petBefore,after:petBefore+1,collectionRevision:next.revision,grantedAt:now,replayed:false};
 const petAudit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'PET_GRANT','USER','183',$1,$2,$3) RETURNING id::text",[JSON.stringify({petCode:PET_CODE,quantity:petBefore,revision:b.revision}),JSON.stringify(petResult),now]));
 const after=await inspect(db),protectedAfter=protectedHash(after);assert.equal(protectedAfter,protectedBefore);assert.deepEqual(collection(after),next);
 const a=one(after.inventory);assert.equal(a.updated_at,now);if(before.inventory.length)assert.equal(a.created_at,before.inventory[0].created_at);
 const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:plan.authorization,clarification:plan.clarification,delivery:'DIRECT',userId:'183',nickname:'남수댕',
  pet:{code:PET_CODE,name:plan.petName,amount:1,before:petBefore,after:petBefore+1,revisionBefore:b.revision,revisionAfter:next.revision,auditId:petAudit.id,result:petResult},
  boxes:{code:ITEM_CODE,name:plan.itemName,amount:4,before:balance(before.inventory[0]),after:balance(a),logId:log.id},protectedBefore,protectedAfter,completedAt:now};
 await verify(db,receipt);
 receipt.auditId=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_PET_INVENTORY',$2,$3,$4,$5) RETURNING id::text",[ACTION,OPERATION_KEY,JSON.stringify({planHash:PLAN_HASH,protectedBefore}),JSON.stringify(receipt),now])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 const verification=await verify(db,receipt);await lease();return {replayed:false,receipt,verification};
}
