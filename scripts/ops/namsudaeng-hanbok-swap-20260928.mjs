import assert from 'node:assert/strict';
export const KEY='ops:namsudaeng-hanbok-swap:20260928:v1';
export const TARGET=Object.freeze({id:183,nickname:'남수댕',providerId:'c6762516'});
export const FROM='DC_HI_HEEYA',TO='FM_DIMWOOS';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function inspectNamsudaengHanbok(q){
 const [user]=await q('SELECT id,nickname,status,role FROM users WHERE id=$1',[TARGET.id]);
 const links=await q("SELECT provider_user_id FROM user_second_verifications WHERE user_id=$1 AND provider='PLAYDK'",[TARGET.id]);
 const catalog=await q('SELECT code,name,is_active,is_public FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) ORDER BY code',[[FROM,TO]]);
 const ownership=await q('SELECT * FROM avatar_user_ownership_v1 WHERE user_id=$1 ORDER BY avatar_code',[TARGET.id]);
 const loadout=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=$1',[TARGET.id]);
 const receipt=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);return {user,links,catalog,ownership,loadout,receipt:receipt[0]?parse(receipt[0].value):null};
}
// Explicit one-account correction. Caller holds the account lock and transaction.
// An existing permanent Diim2 remains intact; only Heeya is revoked.
export async function swapNamsudaengHanbok(q){
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]),receipt=parse(saved.value);if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};assert.equal(receipt.status,'PENDING');
 assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"))[0]);
 const [user]=await q('SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');
 await q('SELECT code FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[[FROM,TO]]);
 await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE user_id=$1 ORDER BY avatar_code FOR UPDATE',[TARGET.id]);
 await q('SELECT user_id FROM avatar_user_loadout_v1 WHERE user_id=$1 FOR UPDATE',[TARGET.id]);
 const before=await inspectNamsudaengHanbok(q);assert.deepEqual(before.links,[{provider_user_id:TARGET.providerId}]);
 assert.equal(before.catalog.find(a=>a.code===FROM)?.name,'한복 하이희야');const destination=before.catalog.find(a=>a.code===TO);assert.equal(destination?.name,'한복 디임2');assert.equal(destination.is_active,1);assert.equal(destination.is_public,1);
 const now=new Date().toISOString(),oldDestination=before.ownership.find(o=>o.avatar_code===TO);
 const granted=await q(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) VALUES($1,$2,'ADMIN_GRANT',$3,$4,NULL)
  ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=EXCLUDED.source_type,source_ref=EXCLUDED.source_ref,acquired_at=EXCLUDED.acquired_at,expires_at=NULL
  WHERE avatar_user_ownership_v1.expires_at IS NOT NULL RETURNING user_id`,[TARGET.id,TO,KEY,now]);
 const revoked=await q('DELETE FROM avatar_user_ownership_v1 WHERE user_id=$1 AND avatar_code=$2 RETURNING *',[TARGET.id,FROM]);assert.ok(revoked.length<=1);
 const equipped=await q('UPDATE avatar_user_loadout_v1 SET avatar_code=$1 WHERE user_id=$2 AND avatar_code=$3 RETURNING user_id',[TO,TARGET.id,FROM]);
 const after=await inspectNamsudaengHanbok(q);assert.ok(!after.ownership.some(o=>o.avatar_code===FROM));const owned=after.ownership.find(o=>o.avatar_code===TO);assert.ok(owned);assert.equal(owned.expires_at,null);
 if(oldDestination?.expires_at===null)assert.deepEqual(owned,oldDestination);
 const unrelated=rows=>rows.filter(o=>![FROM,TO].includes(o.avatar_code));assert.deepEqual(unrelated(after.ownership),unrelated(before.ownership));assert.deepEqual(after.user,before.user);
 assert.deepEqual(after.loadout,before.loadout.map(l=>l.avatar_code===FROM?{...l,avatar_code:TO}:l));
 const result={status:'COMPLETED',operationKey:KEY,userId:TARGET.id,nickname:TARGET.nickname,from:FROM,fromName:'한복 하이희야',to:TO,toName:'한복 디임2',revoked:revoked.length,granted:granted.length,alreadyPermanent:oldDestination?.expires_at===null,equippedReplaced:equipped.length===1,permanent:true,completedAt:now};
 const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['NAMSUDAENG_HANBOK_SWAP','USER',String(TARGET.id),JSON.stringify({ownership:before.ownership,loadout:before.loadout}),JSON.stringify(result)]);assert.ok(audit);result.adminLogId=String(audit.id);
 await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[KEY,JSON.stringify({status:'COMPLETED',result}),now]);return {...result,replayed:false};
}
