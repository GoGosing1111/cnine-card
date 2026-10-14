import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OPERATION_KEY as GRANT_KEY,REVOCATION_KEY as OPERATION_KEY,TARGET,inspectJinmuGrant,verifyJinmuGrant} from './heeya-jinmu-grant-20261015.mjs';
export {OPERATION_KEY,GRANT_KEY,TARGET};
export const AUTHORIZATION='진무 다시 회수해 — 직전 하이희야♡ 지급 1장 회수 및 추가 편성 허용 해제';
const PVP_KEY='mercenary_pvp_loadout_v1:'+TARGET.id;
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modes=(legacy,pvp)=>{const PVE={mercenaryCode:legacy?.mercenary_code||null,revision:Number(legacy?.revision||0)};return {PVE,PVP:pvp?JSON.parse(pvp.value):{...PVE}};};

export async function inspectJinmuRevoke(db){
 const state=await inspectJinmuGrant(db),legacy=(await q(db,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[TARGET.id]))[0]||null;
 const pvp=(await q(db,'SELECT * FROM app_meta WHERE key=$1',[PVP_KEY]))[0]||null,saved=(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0];
 return {...state,grant:state.receipt,receipt:saved?JSON.parse(saved.value):null,legacy,pvp,loadouts:modes(legacy,pvp)};
}
async function protectedDigest(db){
 const data={user:await q(db,'SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id])};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','item_code'],['growth','user_mercenary_growth_v1','mercenary_code']])data[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 data.otherCards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',[TARGET.id,TARGET.code]);
 data.otherHolders=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id<>$1 AND mercenary_code=$2 ORDER BY user_id',[TARGET.id,TARGET.code]);
 data.settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[GRANT_KEY,'mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1']]);
 data.stock=await q(db,'SELECT * FROM mercenary_limited_stock_v1 ORDER BY code');
 data.issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 ORDER BY code,serial');
 data.acquisitions=await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE user_id=$1 ORDER BY acquisition_id',[TARGET.id]);
 return hash(data);
}
function sourceReceipt(state){
 const r=state.grant;assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,GRANT_KEY);assert.deepEqual(r.target,TARGET);
 assert.equal(r.copiesBefore,0);assert.equal(r.copiesAfter,1);assert.equal(r.countedInLimited,false);
 return r;
}
export async function verifyJinmuRevoke(db){
 const state=await inspectJinmuRevoke(db),r=state.receipt,grant=sourceReceipt(state);
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.sourceGrantKey,GRANT_KEY);assert.deepEqual(r.target,TARGET);
 assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.copiesBefore,1);assert.equal(r.copiesAfter,0);assert.equal(r.protectedBefore,r.protectedAfter);
 assert.equal(state.owned.length,0);for(const slot of Object.values(state.loadouts))assert.notEqual(slot.mercenaryCode,TARGET.code);
 const acquisition=one(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT_KEY]));
 assert.equal(Number(acquisition.user_id),TARGET.id);assert.equal(acquisition.mercenary_code,TARGET.code);assert.equal(Number(acquisition.total_copies_after),1);
 const originalAudit=one(await q(db,'SELECT after_data FROM admin_logs WHERE id=$1',[grant.adminLogId]));assert.equal(JSON.parse(originalAudit.after_data).operationKey,GRANT_KEY);
 const audit=one(await q(db,'SELECT admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_EXCLUSIVE_MERCENARY_REVOKE');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt:r,currentCopies:0,loadouts:state.loadouts,grantHistoryPreserved:true};
}

// The caller holds both live USER_LOCK and database fallback leases. Preserve
// immutable grant history; only the one original holding and its selections change.
export async function revokeJinmu(db,{dryRun=true,lockDeadline}={}){
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
  await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[GRANT_KEY,OPERATION_KEY,PVP_KEY]]);
  await q(db,'SELECT user_id FROM user_mercenary_loadout_v1 WHERE user_id=$1 FOR UPDATE',[TARGET.id]);
  const before=await inspectJinmuRevoke(db),user=one(before.users),identity=one(before.verification);
  assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
  assert.equal(identity.provider,'PLAYDK');assert.equal(identity.provider_user_id,'5e2dc209');
  if(before.receipt){const verified=await verifyJinmuRevoke(db);await db.query('ROLLBACK');return {...verified,dryRun,replayed:true};}
  const grant=sourceReceipt(before);await verifyJinmuGrant(db);
  const owned=one(before.owned);assert.equal(Number(owned.total_copies),1,'Expected only the original granted copy');assert.equal(Number(owned.duplicate_count),0);
  const protectedBefore=await protectedDigest(db),now=new Date().toISOString(),clearedModes=Object.entries(before.loadouts).filter(([,slot])=>slot.mercenaryCode===TARGET.code).map(([mode])=>mode);
  if(clearedModes.length){
   const clearPve=clearedModes.includes('PVE'),nextCode=clearPve?null:before.loadouts.PVE.mercenaryCode,nextRevision=before.loadouts.PVE.revision+(clearPve?1:0);
   // Touch the established row on PVP changes too, preserving ranked cache invalidation.
   one(await q(db,'INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET mercenary_code=excluded.mercenary_code,revision=excluded.revision,updated_at=excluded.updated_at RETURNING user_id',[TARGET.id,nextCode,nextRevision,now]));
   if(before.pvp&&clearedModes.includes('PVP')){
    const next={...before.loadouts.PVP,mercenaryCode:null,revision:before.loadouts.PVP.revision+1};
    one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(next),now,PVP_KEY,before.pvp.value]));
   }
  }
  one(await q(db,'DELETE FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=1 AND duplicate_count=0 RETURNING user_id',[TARGET.id,TARGET.code]));
  const after=await inspectJinmuRevoke(db);assert.equal(after.owned.length,0);
  for(const mode of ['PVE','PVP'])if(clearedModes.includes(mode))assert.equal(after.loadouts[mode].mercenaryCode,null);else assert.deepEqual(after.loadouts[mode],before.loadouts[mode]);
  const protectedAfter=await protectedDigest(db);assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,sourceGrantKey:GRANT_KEY,sourceGrantAuditId:grant.adminLogId,authorization:AUTHORIZATION,target:TARGET,completedAt:now,copiesBefore:1,copiesAfter:0,clearedModes,loadoutsBefore:before.loadouts,loadoutsAfter:after.loadouts,protectedBefore,protectedAfter,grantHistoryPreserved:true};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_EXCLUSIVE_MERCENARY_REVOKE','USER',$1,$2,$3) RETURNING id",[String(TARGET.id),JSON.stringify({owned,legacy:before.legacy,pvp:before.pvp}),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyJinmuRevoke(db);assert(lockDeadline>Date.now()+5000,'Account lease expired');await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
