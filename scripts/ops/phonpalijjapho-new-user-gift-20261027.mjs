import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './phonpalijjapho-new-user-gift-20261027.plan.json' with {type:'json'};
import {NEW_USER_GIFT_VERSION,NEW_USER_GIFT_CODE,NEW_USER_GIFT_COIN,NEW_USER_GIFT_MAGIC_LEVEL,NEW_USER_GIFT_CARD_LEVELS,NEW_USER_GIFT_FUR_MEMBER_ID,NEW_USER_GIFT_EQUIPMENT,giftTimestamp} from '../../functions/_new_user_gift.js';
export const OPERATION_KEY=plan.operationKey,IDS=plan.targets.map(t=>t.userId),CODE=NEW_USER_GIFT_CODE,ACTION='OPS_PHONPALIJJAPHO_NEW_USER_GIFT';
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const PLAN_HASH=hash(plan),REQUEST_ID='phonpalijjapho-newgift-20261027-v1';
const target=plan.targets[0],q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const identity=v=>hash(v.provider+':'+String(v.provider_user_id||'').trim());
assert.deepEqual(IDS,['4655']);assert.equal(target.nickname,'폰팔이짭호');assert.equal(plan.quantity,1);assert.equal(plan.reissuePreviouslyOpened,false);
assert.equal(NEW_USER_GIFT_VERSION,4);assert.equal(plan.itemCode,CODE);
export async function catalog(db){
 const cards=await q(db,"SELECT c.id,c.title,c.member_id,UPPER(c.rarity) AS grade FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND UPPER(c.rarity) IN ('SUPERSTAR','FUR','ZENITH') ORDER BY c.rarity,c.id LIMIT 1001");
 const magic=await q(db,'SELECT id,code,name FROM magic_cards WHERE is_active=1 ORDER BY id LIMIT 501');
 const equipment=await q(db,'SELECT id,code,name,slot,subtype FROM character_equipment_items WHERE code=ANY($1::text[]) AND is_active=1 AND is_public=1 ORDER BY code',[NEW_USER_GIFT_EQUIPMENT.map(e=>e.code)]);
 assert(Object.keys(NEW_USER_GIFT_CARD_LEVELS).every(g=>cards.some(c=>c.grade===g))&&cards.length<=1000&&magic.length>0&&magic.length<=500,'Current reward catalog incomplete');
 assert.equal(equipment.length,NEW_USER_GIFT_EQUIPMENT.length);
 for(const expected of NEW_USER_GIFT_EQUIPMENT)assert(equipment.some(e=>['code','name','slot','subtype'].every(k=>e[k]===expected[k])),'Current equipment catalog mismatch');
 return {version:NEW_USER_GIFT_VERSION,coin:NEW_USER_GIFT_COIN,cardLevels:NEW_USER_GIFT_CARD_LEVELS,magicLevel:NEW_USER_GIFT_MAGIC_LEVEL,
  cards:cards.map(({member_id,...c})=>({...c,memberId:Number(member_id),level:c.grade==='FUR'&&Number(member_id)===NEW_USER_GIFT_FUR_MEMBER_ID?15:NEW_USER_GIFT_CARD_LEVELS[c.grade]})),
  magic:magic.map(m=>({...m,id:Number(m.id)})),equipment:equipment.map(e=>({...e,id:Number(e.id)}))};
}
export async function inspect(db){
 const users=await q(db,'SELECT id::text,nickname,role,status,created_at,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',[target.userId]);
 const links=await q(db,'SELECT provider,provider_user_id,verified_at FROM user_second_verifications WHERE user_id=$1',[target.userId]);
 const inventory=await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[target.userId]);
 const gifts=await q(db,'SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1 OR (provider=$2 AND identity_hash=$3) ORDER BY user_id',[target.userId,target.provider,target.identityHash]);
 const items=await q(db,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[CODE]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,identities:links.map(v=>({provider:v.provider,identityHash:identity(v),verifiedAt:v.verified_at})),inventory,gifts,items,receipt:saved.length?parse(one(saved).value):null};
}
const protectedHash=s=>hash({users:s.users,identities:s.identities,items:s.items,inventory:s.inventory.filter(r=>r.item_code!==CODE)});
export async function verify(db,receipt,{exact=false}={}){
 const s=await inspect(db);receipt??=s.receipt;assert(receipt);assert.deepEqual(s.receipt,receipt);assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.userId,target.userId);assert.equal(receipt.quantity,1);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 const gift=one(s.gifts);assert.equal(String(gift.user_id),target.userId);assert.equal(gift.request_id,REQUEST_ID);assert.equal(gift.provider,target.provider);assert.equal(gift.identity_hash,target.identityHash);
 assert.equal(gift.manifest_hash,receipt.manifestHash);assert.equal(hash(gift.manifest_json),receipt.manifestHash);
 const manifest=JSON.parse(gift.manifest_json);assert.equal(manifest.version,4);assert.equal(manifest.coin,300000000000);assert(manifest.equipment.some(e=>e.code==='BATTLE_SUIT_03'));
 const item=one(s.inventory.filter(r=>r.item_code===CODE));assert(['ISSUED','OPENED'].includes(gift.status));assert.equal(Number(item.quantity),gift.status==='ISSUED'?1:0);
 if(exact){assert.equal(gift.status,'ISSUED');assert.equal(Number(item.unseen_quantity),1);assert.equal(protectedHash(s),receipt.protectedBefore);}
 const logs=await q(db,'SELECT id::text,user_id::text,change_amount::text,balance_after::text FROM inventory_logs WHERE user_id=$1 AND reference_type=$2 AND reference_id=$3 AND item_code=$4 ORDER BY id',[target.userId,ACTION,OPERATION_KEY,CODE]);
 const log=one(logs);assert.equal(log.id,receipt.inventoryLogId);assert.equal(log.user_id,target.userId);assert.equal(log.change_amount,'1');assert.equal(log.balance_after,'1');
 const audit=one(await q(db,'SELECT id::text,admin_id::text,target_id,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]));
 assert.equal(audit.id,receipt.auditId);assert.equal(audit.admin_id,'1');const {auditId,...recorded}=receipt;assert.deepEqual(parse(audit.after_data),recorded);
 return {verified:true,userId:target.userId,nickname:target.nickname,itemCode:CODE,quantityGranted:1,currentQuantity:Number(item.quantity),receiptStatus:gift.status,manifestVersion:manifest.version,coinOnOpen:manifest.coin,cardCount:manifest.cards.length,magicCount:manifest.magic.length,equipmentCount:manifest.equipment.length,gBodyIncluded:true,auditId:receipt.auditId,openedByOperation:false};
}
// One explicitly named first issue. Only this operation bypasses the join-age
// limit; verification, active-state and lifetime duplicate guards remain intact.
// Caller owns the transaction and both live USER_LOCK and database leases.
export async function grant(db,{expectedPlanHash,leaseToken,lockDeadline}={}){
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed plan required');
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(saved.length){const receipt=parse(one(saved).value);return {replayed:true,receipt,verification:await verify(db,receipt)};}
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Account lease required');assert.match(leaseToken||'',/^[a-f0-9]{64}$/);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const checkLease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[target.userId,leaseToken,OPERATION_KEY,Date.now()+5000]));};await checkLease();
 one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[target.userId]));
 one(await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[target.userId]));
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`new-user-gift:${target.provider}:${target.identityHash}`]);
 await q(db,'SELECT user_id FROM new_user_gift_receipts_v1 WHERE user_id=$1 OR (provider=$2 AND identity_hash=$3) FOR UPDATE',[target.userId,target.provider,target.identityHash]);
 await q(db,'SELECT user_id FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[target.userId,CODE]);
 one(await q(db,'SELECT code FROM inventory_items WHERE code=$1 FOR SHARE',[CODE]));
 const before=await inspect(db),user=one(before.users),verified=one(before.identities),item=one(before.items);
 for(const [key,value]of Object.entries({id:target.userId,nickname:target.nickname,role:target.role,status:target.status,created_at:target.createdAt}))assert.equal(user[key],value,'Recipient changed: '+key);
 assert.equal(verified.provider,target.provider);assert.equal(verified.identityHash,target.identityHash);assert(Number.isFinite(giftTimestamp(verified.verifiedAt)));
 assert.equal(item.name,'신규유저 기프트 박스');assert.equal(Number(item.is_active),1);
 assert.equal(before.gifts.length,0,'An existing account or identity receipt must never be overwritten');assert.equal(before.receipt,null);
 assert.equal(Number(before.inventory.find(r=>r.item_code===CODE)?.quantity||0),0,'Untracked box exists');
 assert.equal((await q(db,'SELECT id FROM inventory_logs WHERE user_id=$1 AND reference_type=$2 AND reference_id=$3',[target.userId,ACTION,OPERATION_KEY])).length,0);
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const rewards=await catalog(db),manifest=JSON.stringify(rewards),manifestHash=hash(manifest),now=new Date().toISOString();
 one(await q(db,"INSERT INTO new_user_gift_receipts_v1(user_id,provider,identity_hash,status,issued_by,issued_at,joined_at,request_id,manifest_json,manifest_hash) VALUES($1,$2,$3,'ISSUED',1,$4,$5,$6,$7,$8) RETURNING user_id",[target.userId,target.provider,target.identityHash,now,user.created_at,REQUEST_ID,manifest,manifestHash]));
 one(await q(db,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES($1,$2,1,1,$3,$3) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=1,unseen_quantity=1,updated_at=excluded.updated_at WHERE cnine_user_inventory.quantity=0 RETURNING user_id',[target.userId,CODE,now]));
 const log=one(await q(db,'INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) VALUES($1,$2,1,1,$3,$4,$5,1,$6) RETURNING id::text',[target.userId,CODE,'사용자 지정 폰팔이짭호 신규유저 기프트 박스 1개 지급',ACTION,OPERATION_KEY,now]));
 const after=await inspect(db),preserved=protectedHash(before);assert.equal(protectedHash(after),preserved);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:plan.authorization,userId:target.userId,nickname:target.nickname,itemCode:CODE,quantity:1,beforeQuantity:0,afterQuantity:1,delivery:'DIRECT_INVENTORY',joinAgeException:true,firstIssue:true,manifestHash,manifestVersion:4,inventoryLogId:log.id,protectedBefore:preserved,protectedAfter:protectedHash(after),completedAt:now,openedByOperation:false,messagesSent:0};
 const audit=one(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id::text',[ACTION,'USER',OPERATION_KEY,JSON.stringify({user,verification:verified,previousGift:null,previousQuantity:0}),JSON.stringify(receipt)]));receipt.auditId=audit.id;
 await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);await checkLease();
 return {replayed:false,receipt,verification:await verify(db,receipt,{exact:true})};
}
