import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(readFileSync(new URL('./comment-new-user-gift-20261022.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,CODE='NEW_USER_GIFT_BOX',IDS=PLAN.recipients.map(u=>u.id),ACTION='OPS_COMMENT_NEW_USER_GIFT';
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const HASH=hash(PLAN);
const q=async(c,s,p=[])=>(await c.query(s,p)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const request=id=>'comment-newgift-20261022-'+id;
const archive=id=>OP+':previous:'+id;
const EQUIPMENT=['EQ_1787156691265','EQ_1787156640727','EQ_1787156667357','EQ_1787156718021','EQ_1786966923833'];
export async function catalog(c){
 const cards=await q(c,"SELECT c.id,c.title,c.member_id,UPPER(c.rarity) AS grade FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 AND UPPER(c.rarity) IN ('SUPERSTAR','FUR','ZENITH') ORDER BY c.rarity,c.id LIMIT 1001");
 const magic=await q(c,'SELECT id,code,name FROM magic_cards WHERE is_active=1 ORDER BY id LIMIT 501');
 const equipment=await q(c,'SELECT id,code,name,slot,subtype FROM character_equipment_items WHERE code=ANY($1::text[]) AND is_active=1 AND is_public=1 ORDER BY code',[EQUIPMENT]);
 assert(cards.length>0&&cards.length<=1000&&magic.length>0&&magic.length<=500);assert.equal(equipment.length,5);for(const grade of ['SUPERSTAR','FUR','ZENITH'])assert(cards.some(c=>c.grade===grade));
 return {version:3,coin:300000000000,cardLevels:{SUPERSTAR:13,FUR:13,ZENITH:13},magicLevel:9,cards:cards.map(({member_id,...c})=>({...c,memberId:Number(member_id),level:c.grade==='FUR'&&Number(member_id)===111?15:13})),magic:magic.map(m=>({...m,id:Number(m.id)})),equipment:equipment.map(e=>({...e,id:Number(e.id)}))};
}
export async function state(c){
 const users=await q(c,'SELECT u.id::text,u.nickname,u.status,u.role,u.created_at,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id,v.verified_at FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[IDS]);
 const inventory=await q(c,'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',[IDS]);
 const gifts=await q(c,'SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[IDS]);
 const rows=await q(c,'SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE $2 ORDER BY key',[OP,OP+':previous:%']);
 return {users:users.map(({provider_user_id,...u})=>({...u,identityHash:hash(`${u.provider}:${String(provider_user_id||'').trim()}`)})),inventory,gifts,receipts:rows.map(r=>({key:r.key,value:parse(r.value)}))};
}
const protectedState=s=>({users:s.users,inventory:s.inventory.filter(i=>i.item_code!==CODE)});
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function verify(c,r,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.planHash,HASH);assert.equal(r.operationKey,OP);assert.equal(r.grants.length,24);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await state(c),logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text FROM inventory_logs WHERE id=ANY($3::bigint[]) AND reference_type=$1 AND reference_id=$2 ORDER BY user_id',[ACTION,OP,r.grants.map(g=>g.inventoryLogId)]);assert.equal(logs.length,24);assert.equal(s.gifts.length,24);
 let unopened=0,opened=0;
 for(const g of r.grants){
  const gift=one(s.gifts.filter(x=>String(x.user_id)===g.userId)),item=one(s.inventory.filter(x=>String(x.user_id)===g.userId&&x.item_code===CODE)),u=one(s.users.filter(x=>x.id===g.userId));
  assert.equal(gift.request_id,request(g.userId));assert.equal(gift.manifest_hash,r.manifestHash);assert.equal(hash(gift.manifest_json),r.manifestHash);assert.equal(gift.provider,u.provider);assert.equal(gift.identity_hash,u.identityHash);assert.equal(parse(gift.manifest_json).version,3);
  const log=one(logs.filter(l=>l.user_id===g.userId));assert.equal(log.id,g.inventoryLogId);assert.equal(log.change_amount,'1');assert.equal(log.balance_after,'1');
  if(gift.status==='ISSUED'){assert.equal(Number(item.quantity),1);unopened++;}else{assert.equal(gift.status,'OPENED');assert.equal(Number(item.quantity),0);opened++;}
  if(exact){assert.equal(gift.status,'ISSUED');assert.equal(Number(item.unseen_quantity),1);}
  if(g.previousReceipt){assert.deepEqual(one(s.receipts.filter(x=>x.key===archive(g.userId))).value,g.previousReceipt);assert.equal(g.previousReceipt.status,'OPENED');}
 }
 assert.equal(r.grants.filter(g=>g.previousReceipt).length,4);assert.equal(s.receipts.filter(x=>x.key.startsWith(OP+':previous:')).length,4);
 const audit=one(await q(c,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);const {auditId,...recorded}=r;assert.deepEqual(parse(audit.after_data),recorded);
 if(exact)assert.equal(hash(protectedState(s)),r.protectedBeforeHash);
 return {verified:true,recipientCount:24,totalBoxes:24,firstIssues:20,reissues:4,unopened,opened,previousReceiptsArchived:4,inventoryLogRecords:24,openedByOperation:0};
}
// Caller owns BEGIN/COMMIT and the live USER_LOCK + matching database leases.
export async function grant(c,expected,{leaseToken,lockDeadline}={}){
 assert.equal(expected,HASH);assert.equal(IDS.length,24);assert.equal(new Set(IDS).size,24);
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert(lockDeadline>Date.now()+20000);assert.match(leaseToken,/^[a-f0-9]{64}$/);await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const again=await receipt(c);if(again)return {replayed:true,receipt:again,verification:await verify(c,again)};
 const check=async()=>{assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,24);assert(lockDeadline>Date.now()+5000);};await check();
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,24);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(c,'SELECT user_id FROM new_user_gift_receipts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
 await q(c,'SELECT user_id FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[IDS,CODE]);
 const before=await state(c);assert.equal(before.users.length,24);assert.equal(before.receipts.length,0);assert.equal((await q(c,'SELECT id FROM inventory_logs WHERE id>(SELECT COALESCE(MAX(id),0)-100000 FROM inventory_logs) AND reference_type=$1 AND reference_id=$2',[ACTION,OP])).length,0);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));const item=one(await q(c,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[CODE]));assert.equal(item.name,'신규유저 기프트 박스');assert.equal(Number(item.is_active),1);
 for(const p of PLAN.recipients){const u=one(before.users.filter(u=>u.id===p.id));for(const k of ['nickname','provider','identityHash','created_at','role','status'])assert.equal(u[k],p[k],`Recipient ${p.id}: ${k}`);assert.equal(u.status,'ACTIVE');assert(u.verified_at);assert.equal(Number(before.inventory.find(x=>String(x.user_id)===p.id&&x.item_code===CODE)?.quantity||0),0);const old=before.gifts.find(x=>String(x.user_id)===p.id);assert.equal(old?.status||null,p.priorGiftStatus);if(old){assert.equal(old.status,'OPENED');assert.equal(old.identity_hash,u.identityHash);assert.equal(old.provider,u.provider);}}
 const collisions=await q(c,'SELECT user_id::text FROM new_user_gift_receipts_v1 WHERE provider=$1 AND identity_hash=ANY($2::text[]) AND NOT(user_id=ANY($3::bigint[]))',['PLAYDK',PLAN.recipients.map(u=>u.identityHash),IDS]);assert.equal(collisions.length,0,'Verified identity belongs to another gift account');
 const rewards=await catalog(c),manifest=JSON.stringify(rewards),manifestHash=hash(manifest),now=new Date().toISOString();
 for(const old of before.gifts)one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[archive(String(old.user_id)),JSON.stringify(old),now]));
 const payload=PLAN.recipients.map(p=>({user_id:p.id,provider:p.provider,identity_hash:p.identityHash,joined_at:p.created_at,request_id:request(p.id)}));
 const issued=await q(c,`INSERT INTO new_user_gift_receipts_v1(user_id,provider,identity_hash,status,issued_by,issued_at,joined_at,request_id,manifest_json,manifest_hash)
 SELECT p.user_id,p.provider,p.identity_hash,'ISSUED',1,$2,p.joined_at,p.request_id,$3,$4 FROM jsonb_to_recordset($1::jsonb) p(user_id bigint,provider text,identity_hash text,joined_at text,request_id text)
 ON CONFLICT(user_id) DO UPDATE SET status='ISSUED',issued_by=1,issued_at=excluded.issued_at,request_id=excluded.request_id,manifest_json=excluded.manifest_json,manifest_hash=excluded.manifest_hash,opened_at=NULL,result_json=NULL
 WHERE new_user_gift_receipts_v1.status='OPENED' AND new_user_gift_receipts_v1.provider=excluded.provider AND new_user_gift_receipts_v1.identity_hash=excluded.identity_hash RETURNING user_id`,[JSON.stringify(payload),now,manifest,manifestHash]);assert.equal(issued.length,24);
 const holdings=await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT id,$2,1,1,$3,$3 FROM unnest($1::bigint[]) p(id)
 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=1,unseen_quantity=1,updated_at=excluded.updated_at WHERE cnine_user_inventory.quantity=0 RETURNING user_id`,[IDS,CODE,now]);assert.equal(holdings.length,24);
 const logs=await q(c,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) SELECT id,$2,1,1,$3,$4,$5,1,$6 FROM unnest($1::bigint[]) p(id) RETURNING id::text,user_id::text`,[IDS,CODE,'댓글 명단 신규유저 기프트 박스 각 1개 특별 지급',ACTION,OP,now]);assert.equal(logs.length,24);
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before));
 const grants=PLAN.recipients.map(p=>({userId:p.id,nickname:p.nickname,sourceNickname:p.sourceNickname,quantity:1,inventoryLogId:one(logs.filter(l=>l.user_id===p.id)).id,previousReceipt:before.gifts.find(g=>String(g.user_id)===p.id)||null}));
 const r={status:'COMPLETED',operationKey:OP,authorization:PLAN.authorization,planHash:HASH,completedAt:now,itemCode:CODE,itemName:item.name,quantity:24,grants,manifestHash,rewards,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),joinAgeException:true,priorReceiptsArchived:true,openedByOperation:0};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_GROUP',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({recipientCount:24,previousGiftReceipts:4,protectedHash:r.protectedBeforeHash}),JSON.stringify(r)]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));const verification=await verify(c,r,{exact:true});await check();return {replayed:false,receipt:r,verification};
}
