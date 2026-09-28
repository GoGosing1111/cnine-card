// One-time user-authorized operation; no gameplay route imports this file.
import assert from 'node:assert/strict';
export const KEY='ops:joeun-avatar-cooldown-reset:20260928:v1';
export const TARGET=Object.freeze({id:4754,nickname:'조은'});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const ownershipSql='SELECT * FROM avatar_user_ownership_v1 WHERE user_id=$1 ORDER BY avatar_code';
export async function inspectAvatarReset(q){
 const users=await q('SELECT id,nickname,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 assert.equal(users.length,1);assert.equal(Number(users[0].id),TARGET.id);assert.equal(users[0].nickname,TARGET.nickname);assert.equal(users[0].status,'ACTIVE');
 const [loadout]=await q(`SELECT l.*,a.name,(l.updated_at::timestamp AT TIME ZONE 'UTC')+interval '24 hours' AS next_equip_at,
  (l.updated_at::timestamp AT TIME ZONE 'UTC')+interval '24 hours'>CURRENT_TIMESTAMP AS cooldown_locked
  FROM avatar_user_loadout_v1 l LEFT JOIN avatar_catalog_v1 a ON a.code=l.avatar_code WHERE l.user_id=$1`,[TARGET.id]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 return {user:TARGET,loadout:loadout||null,receipt:saved?parse(saved.value):null};
}
// Caller owns USER_LOCK and one PostgreSQL transaction.
export async function resetJoeunAvatarCooldown(q){
 const [clock]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day");
 assert.equal(clock.day,'2026-09-28','Authorized day only');
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]),prior=parse(saved.value);
 if(prior.status==='COMPLETED')return {...prior,replayed:true};
 assert.equal(prior.status,'PENDING');
 const [wallet]=await q(walletSql+' FOR UPDATE',[TARGET.id]);
 assert.equal(wallet?.nickname,TARGET.nickname);assert.equal(wallet.status,'ACTIVE');
 const inspected=await inspectAvatarReset(q);assert.ok(inspected.loadout,'No equipped avatar');
 const ownership=await q(ownershipSql,[TARGET.id]);
 const [before]=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=$1 FOR UPDATE',[TARGET.id]);assert.ok(before);
 const changed=await q(`UPDATE avatar_user_loadout_v1
  SET updated_at=to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '24 hours 1 second','YYYY-MM-DD HH24:MI:SS')
  WHERE user_id=$1 AND avatar_code=$2 AND updated_at=$3 RETURNING *`,[TARGET.id,before.avatar_code,before.updated_at]);
 assert.equal(changed.length,1,'Concurrent avatar change');
 const after=await inspectAvatarReset(q);assert.equal(after.loadout.cooldown_locked,false);assert.equal(after.loadout.avatar_code,before.avatar_code);
 assert.deepEqual(await q(ownershipSql,[TARGET.id]),ownership,'Ownership or expiry changed');
 assert.deepEqual((await q(walletSql,[TARGET.id]))[0],wallet,'Wallet changed');
 assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER'"))[0],'Audit owner missing');
 const result={status:'COMPLETED',operationKey:KEY,user:TARGET,avatarCode:after.loadout.avatar_code,avatarName:after.loadout.name,
  beforeUpdatedAt:before.updated_at,afterUpdatedAt:after.loadout.updated_at,cooldownLocked:false,remainingMs:0,
  equippedAvatarPreserved:true,ownershipPreserved:true,balancesPreserved:true,completedAt:new Date().toISOString()};
 const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[
  'AVATAR_EQUIP_COOLDOWN_RESET','USER',String(TARGET.id),JSON.stringify(before),
  JSON.stringify({...result,authorization:'조은 계정 아바타 쿨타임 리셋시켜'})
 ]);
 assert.ok(audit);result.adminLogId=String(audit.id);
 await q('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3',[JSON.stringify(result),result.completedAt,KEY]);
 return {...result,replayed:false};
}
