import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import source from './source.json' with {type:'json'};
export const OPERATION_KEY='ops:daengsoryong-pet-roster:20261029:v1',ACTION='OPS_DAENGSORYONG_PET_ROSTER_20261029',PET='PET-DAENGSORYONG';
export const REASON='명단 댕소룡 펫 각1마리 지급 · 20261029',CORRECTION_REASON='작업 해석 오류로 추가한 깅더듬 스트리머 박스4개 원복 · 원 감사52772';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const PLAN_HASH=hash(plan),TARGETS=[...plan.targets].sort((a,b)=>Number(a.userId)-Number(b.userId)),IDS=TARGETS.map(t=>t.userId);
export const identityHash=u=>hash({provider:u.provider,providerId:u.provider_user_id});
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const requestId=id=>'ops-daeng-pet-roster-20261029-'+id,collectionKey=id=>'pet_collection_v1:'+id;
const grantKey=id=>'pet_grant_receipt_v1:'+requestId(id),collectionKeys=IDS.map(collectionKey),grantKeys=IDS.map(grantKey);
const protectedPetKeys=IDS.flatMap(id=>['pet_loadout_v1:'+id,'pet_potentials_v1:'+id]);
const settingsKeys=['pet_cms_preparation_v1','pet_opening_settings_v1','pet_potential_settings_v1'];
const parentKeys=[plan.parentOperationKey,plan.correction.operationKey];
export function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(plan),PLAN_HASH);assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(source.operationKey,OPERATION_KEY);
 assert.equal(plan.delivery,'DIRECT_PET_COLLECTION');assert.equal(plan.petCode,PET);assert.equal(plan.petName,'댕소룡');assert.equal(plan.recipientCount,42);assert.equal(plan.totalPets,42);assert.equal(TARGETS.length,42);assert.equal(new Set(IDS).size,42);
 assert.equal(source.quantityPerAccount,1);assert.equal(source.recipientCount,42);assert.equal(source.authorization,plan.authorization);assert.match(source.authorization,/명단에 댕소룡 펫도 지급/);assert.deepEqual(plan.pending,[]);
 assert.equal(plan.parentOperationKey,'ops:streamer-box-four:20261029:v1');assert.equal(plan.parentAuditId,'52769');
 assert.equal(plan.correction.userId,'5877');assert.equal(plan.correction.nickname,'깅더듬');assert.equal(plan.correction.amount,4);assert.equal(plan.correction.auditId,'52772');assert.equal(plan.correction.canReverse,true);assert.equal(plan.correction.expectedQuantity,'8');
 for(const t of TARGETS){assert.equal(t.amount,1);assert.match(t.userId,/^[1-9]\d*$/);assert.match(t.identityHash,/^[a-f0-9]{64}$/);assert.notEqual(t.nickname,'댕소룡');}
 assert.equal(TARGETS.find(t=>t.inputNickname==='Brintellix°').userId,'5877');assert.equal(TARGETS.find(t=>t.nickname==='굳건창수').userId,'4908');
}
function collection(row){
 const s=row?parse(row.value):{revision:0,pets:{}};assert(Number.isSafeInteger(s.revision)&&s.revision>=0&&s.revision<Number.MAX_SAFE_INTEGER,'Invalid collection revision');
 assert(s.pets&&typeof s.pets==='object'&&!Array.isArray(s.pets));for(const n of Object.values(s.pets))assert(Number.isSafeInteger(n)&&n>=0,'Invalid pet balance');
 assert((s.pets[PET]??0)<Number.MAX_SAFE_INTEGER,'Unsafe pet balance');return s;
}
export async function inspect(db){
 const users=await q(db,'SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[IDS]);
 const links=await q(db,'SELECT user_id::text,provider,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_second_verifications.user_id',[IDS]);
 const collections=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[collectionKeys]);
 const protectedPetRecords=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[protectedPetKeys]);
 const settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingsKeys]);
 const parents=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[parentKeys]);
 const inventory=await q(db,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',[IDS]);
 const petReceipts=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[grantKeys]);
 const logs=await q(db,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id FROM inventory_logs WHERE user_id=5877 AND item_code=$2 AND id>$3::bigint AND reference_id=$1 ORDER BY id',[OPERATION_KEY,plan.correction.itemCode,plan.correction.inventoryLogId]);
 const previous=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,identities:links.map(l=>({userId:l.user_id,identityHash:identityHash(l)})),collections,protectedPetRecords,settings,parents,inventory,petReceipts,logs,receipt:previous.length?parse(one(previous).value):null};
}
const correctionRow=s=>one(s.inventory.filter(r=>r.user_id===plan.correction.userId&&r.item_code===plan.correction.itemCode));
const protectedHash=s=>hash({users:s.users,identities:s.identities,protectedPetRecords:s.protectedPetRecords,settings:s.settings,parents:s.parents,
 inventory:s.inventory.filter(r=>!(r.user_id===plan.correction.userId&&r.item_code===plan.correction.itemCode)),
 otherPets:IDS.map(id=>{const c=collection(s.collections.find(r=>r.key===collectionKey(id)));const {revision,pets,...rest}=c;const {[PET]:ignored,...other}=pets;return {id,rest,other};})});
function validateSnapshot(s){
 assert.deepEqual(s.users.map(u=>u.id),IDS);assert.deepEqual(s.identities.map(u=>u.userId),IDS);
 TARGETS.forEach((t,i)=>{assert.equal(s.users[i].nickname,t.nickname,'Nickname changed');assert.equal(s.users[i].role,t.role);assert.equal(s.users[i].status,'ACTIVE');assert.equal(s.identities[i].identityHash,t.identityHash,'Verified identity changed');collection(s.collections.find(r=>r.key===collectionKey(t.userId)));});
 assert.equal(hash(s.settings),plan.settingsHash,'Pet settings changed');assert.equal(hash(s.parents),plan.parentReceiptsHash,'Original receipts changed');
 const cms=parse(one(s.settings.filter(r=>r.key==='pet_cms_preparation_v1')).value);assert.equal(cms.revision,plan.petCmsRevision);assert.deepEqual(one(cms.document.pets.filter(p=>p.code===PET)),plan.petDefinition);
 const error=parse(one(s.parents.filter(r=>r.key===plan.correction.operationKey)).value);assert.equal(error.auditId,plan.correction.auditId);const a=one(error.allocations);assert.equal(a.userId,'5877');assert.equal(a.amount,4);assert.equal(a.logId,plan.correction.inventoryLogId);
 const row=correctionRow(s);assert.equal(row.quantity,plan.correction.expectedQuantity,'Erroneous boxes changed; do not claw back other assets');assert(BigInt(row.unseen_quantity)>=0n&&BigInt(row.unseen_quantity)<=BigInt(row.quantity));
 assert.equal(s.petReceipts.length,0,'Prior per-account pet receipts require reconciliation');assert.equal(s.logs.length,0,'Orphan correction log');
}
export async function verify(db,r){
 validate(PLAN_HASH);r??=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);assert.equal(r.petCode,PET);assert.equal(r.recipientCount,42);assert.equal(r.totalPets,42);assert.equal(r.protectedBefore,r.protectedAfter);assert.equal(r.petGrants.length,42);
 const rows=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[grantKeys]);assert.equal(rows.length,42);
 const audits=await q(db,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[r.petGrants.map(g=>g.auditId)]);assert.equal(audits.length,42);
 TARGETS.forEach((t,i)=>{const g=r.petGrants[i];assert.equal(g.userId,t.userId);assert.equal(g.nickname,t.nickname);assert.equal(g.afterQuantity-g.beforeQuantity,1);assert.equal(g.afterRevision-g.beforeRevision,1);
  const saved=parse(one(rows.filter(row=>row.key===grantKey(t.userId))).value);assert.equal(saved.payloadHash,g.payloadHash);assert.deepEqual(saved.result,g.result);assert.equal(g.result.quantity,1);assert.equal(g.result.pet.code,PET);assert.equal(g.result.target.id,Number(t.userId));
  const a=one(audits.filter(a=>a.id===g.auditId));assert.equal(a.admin_id,'1');assert.equal(a.action_type,'PET_GRANT');assert.equal(a.target_id,t.userId);assert.deepEqual(parse(a.after_data),g.result);assert.deepEqual(parse(a.before_data),{petCode:PET,quantity:g.beforeQuantity,revision:g.beforeRevision});
 });
 const c=r.boxCorrection;assert.equal(c.userId,'5877');assert.equal(c.removed,4);assert.equal(BigInt(c.before.quantity)-BigInt(c.after.quantity),4n);assert.equal(c.after.quantity,'4');
 const l=one(await q(db,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type FROM inventory_logs WHERE user_id=5877 AND item_code=$2 AND id>$3::bigint AND reference_id=$1',[OPERATION_KEY,plan.correction.itemCode,plan.correction.inventoryLogId]));assert.equal(l.id,c.inventoryLogId);assert.equal(l.user_id,'5877');assert.equal(l.item_code,plan.correction.itemCode);assert.equal(l.change_amount,'-4');assert.equal(l.balance_after,c.after.quantity);assert.equal(l.reference_type,ACTION);assert.equal(l.reason,CORRECTION_REASON);
 if(r.auditId){const a=one(await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.auditId]));assert.equal(a.action_type,ACTION);assert.equal(a.target_id,OPERATION_KEY);const {auditId,...details}=r;assert.deepEqual(parse(a.after_data),details);}
 return {status:'VERIFIED',operationKey:OPERATION_KEY,recipientCount:42,totalPets:42,petAudits:42,correctionBoxesRemoved:4,correctStreamerBoxTotal:168,missing:0,duplicates:0,auditId:r.auditId??null,completedAt:r.completedAt};
}
export async function grant(db,{expectedPlanHash,leaseToken,lockDeadline}={}){
 validate(expectedPlanHash);const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(saved.length){const receipt=parse(one(saved).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);const again=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(again.length){const receipt=parse(one(again).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 const checkLeases=async()=>{assert(lockDeadline>Date.now()+5000,'Account lease expiring');assert.equal((await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[IDS,leaseToken,OPERATION_KEY,Date.now()+5000])).length,42,'Missing account lease');};await checkLeases();
 await q(db,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS]);
 await q(db,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[collectionKeys]);await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[[...settingsKeys,...parentKeys,...protectedPetKeys]]);
 await q(db,'SELECT user_id FROM cnine_user_inventory WHERE user_id=5877 AND item_code=$1 FOR UPDATE',[plan.correction.itemCode]);
 const before=await inspect(db);validateSnapshot(before);one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 assert.equal((await q(db,'SELECT id FROM inventory_logs WHERE user_id=5877 AND item_code=$1 AND id>$2::bigint',[plan.correction.itemCode,plan.correction.inventoryLogId])).length,0,'Erroneous boxes have been used or changed');
 assert.equal((await q(db,'SELECT id FROM admin_logs WHERE target_id=$1 OR (action_type=$2 AND after_data LIKE $3)',[OPERATION_KEY,'PET_GRANT','%ops-daeng-pet-roster-20261029-%'])).length,0,'Orphan pet audit');
 const protectedBefore=protectedHash(before),now=new Date().toISOString(),pet={code:PET,name:'댕소룡',sourceArt:plan.petDefinition.sourceArt};
 const grants=TARGETS.map(t=>{const b=collection(before.collections.find(r=>r.key===collectionKey(t.userId))),beforeQuantity=b.pets[PET]??0,afterQuantity=beforeQuantity+1,afterRevision=b.revision+1;
  const result={ok:true,requestId:requestId(t.userId),adminId:1,target:{id:Number(t.userId),nickname:t.nickname},pet,quantity:1,reason:REASON,before:beforeQuantity,after:afterQuantity,collectionRevision:afterRevision,grantedAt:now,replayed:false};
  const payloadHash=hash([1,Number(t.userId),{petCode:PET,quantity:1,reason:REASON},b.revision,plan.petCmsRevision]);
  return {userId:t.userId,nickname:t.nickname,beforeQuantity,afterQuantity,beforeRevision:b.revision,afterRevision,payloadHash,result,raw:JSON.stringify({...b,revision:afterRevision,pets:{...b.pets,[PET]:afterQuantity}})};});
 assert.equal((await db.query(`INSERT INTO app_meta(key,value,updated_at) SELECT x.key,x.value,$3 FROM unnest($1::text[],$2::text[]) x(key,value) ORDER BY x.key
 ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at RETURNING key`,[collectionKeys,grants.map(g=>g.raw),now])).rowCount,42);
 const audits=await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
 SELECT 1,'PET_GRANT','USER',x.id,x.before_data,x.after_data,$4 FROM unnest($1::text[],$2::text[],$3::text[]) x(id,before_data,after_data) RETURNING id::text,target_id`,[IDS,grants.map(g=>JSON.stringify({petCode:PET,quantity:g.beforeQuantity,revision:g.beforeRevision})),grants.map(g=>JSON.stringify(g.result)),now]);assert.equal(audits.length,42);
 assert.equal((await db.query('INSERT INTO app_meta(key,value,updated_at) SELECT x.key,x.value,$3 FROM unnest($1::text[],$2::text[]) x(key,value) RETURNING key',[grantKeys,grants.map(g=>JSON.stringify({payloadHash:g.payloadHash,result:g.result})),now])).rowCount,42);
 const b=correctionRow(before),a=one(await q(db,`UPDATE cnine_user_inventory SET quantity=quantity-4,unseen_quantity=LEAST(unseen_quantity,quantity-4),updated_at=$2 WHERE user_id=5877 AND item_code=$1 AND quantity=8 RETURNING quantity::text,unseen_quantity::text`,[plan.correction.itemCode,now]));
 const log=one(await q(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) VALUES(5877,$1,-4,$2,$3,$4,$5,1,$6) RETURNING id::text`,[plan.correction.itemCode,a.quantity,CORRECTION_REASON,ACTION,OPERATION_KEY,now]));
 const after=await inspect(db),protectedAfter=protectedHash(after);assert.equal(protectedBefore,protectedAfter,'Unrelated state changed');
 for(const g of grants)assert.equal(one(after.collections.filter(r=>r.key===collectionKey(g.userId))).value,g.raw);
 const petGrants=grants.map(({raw,...g})=>({...g,auditId:one(audits.filter(a=>a.target_id===g.userId)).id}));
 const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:plan.authorization,petCode:PET,petName:'댕소룡',recipientCount:42,totalPets:42,parentOperationKey:plan.parentOperationKey,parentAuditId:plan.parentAuditId,petGrants,boxCorrection:{userId:'5877',nickname:'깅더듬',itemCode:plan.correction.itemCode,removed:4,erroneousOperationKey:plan.correction.operationKey,erroneousAuditId:plan.correction.auditId,before:{quantity:b.quantity,unseen_quantity:b.unseen_quantity},after:a,inventoryLogId:log.id},protectedBefore,protectedAfter,completedAt:now};
 await verify(db,receipt);
 receipt.auditId=one(await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_GROUP',$2,$3,$4,$5) RETURNING id::text`,[ACTION,OPERATION_KEY,JSON.stringify({planHash:PLAN_HASH,protectedBefore}),JSON.stringify(receipt),now])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 const verification=await verify(db,receipt);await checkLeases();return {replayed:false,receipt,verification};
}
