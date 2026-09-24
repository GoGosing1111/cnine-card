import assert from 'node:assert/strict';
import {inspectHeeyaCryvern,OPERATION_KEY as GRANT_KEY,TARGET} from './heeya-cryvern-grant-20260925.mjs';

export {TARGET,GRANT_KEY};
export const OPERATION_KEY=GRANT_KEY+':revoke';
const CODE='V-049',parse=value=>typeof value==='string'?JSON.parse(value):value;

export async function inspectHeeyaCryvernRevoke(q){
 const state=await inspectHeeyaCryvern(q),grant=state.receipt;
 assert.ok(grant,'Original grant receipt is required');
 assert.equal(grant.operationKey,GRANT_KEY);assert.equal(grant.status,'COMPLETED');
 assert.equal(grant.userId,TARGET.id);assert.equal(grant.mercenaryCode,CODE);
 assert.equal(grant.rank,'SSS');assert.equal(grant.quantity,1);assert.equal(grant.permanent,true);
 const acquired=state.acquisitions.filter(row=>row.acquisition_id===GRANT_KEY);
 assert.equal(acquired.length,1,'Original acquisition must be present');
 assert.equal(Number(acquired[0].user_id),TARGET.id);assert.equal(acquired[0].mercenary_code,CODE);
 const [audit]=await q("SELECT id,admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1 AND action_type='OPS_MERCENARY_GRANT' AND target_id=$2",[grant.adminLogId,String(TARGET.id)]);
 assert.ok(audit,'Original grant audit must be present');assert.equal(Number(audit.admin_id),1);
 assert.equal(parse(audit.after_data).operationKey,GRANT_KEY);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {...state,grant,receipt:saved?parse(saved.value):null};
}

// Operational helper only. Caller holds the account mutation lock and one
// PostgreSQL transaction. Immutable acquisition/grant history is retained.
export async function revokeHeeyaCryvern(q){
 const [user]=await q('SELECT id,nickname,status,role FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
 assert.ok(user);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const before=await inspectHeeyaCryvernRevoke(q);
 if(before.receipt){
  const r=before.receipt;assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.sourceGrantKey,GRANT_KEY);
  assert.equal(r.status,'COMPLETED');assert.equal(r.userId,TARGET.id);assert.equal(r.mercenaryCode,CODE);assert.equal(r.quantity,1);
  return {...r,replayed:true};
 }
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Missing authorized operator');
 const copies=Number(before.owned?.total_copies||0);
 assert.ok(Number.isSafeInteger(copies)&&copies>=1,'No copy available; do not remove a different mercenary');
 assert.equal(Number(before.owned.duplicate_count),copies-1);
 const completedAt=new Date().toISOString(),loadoutCleared=copies===1&&before.loadout?.mercenary_code===CODE;
 if(loadoutCleared){
  assert.equal((await q('UPDATE user_mercenary_loadout_v1 SET mercenary_code=NULL,revision=revision+1,updated_at=$1 WHERE user_id=$2 AND mercenary_code=$3 AND revision=$4 RETURNING user_id',[completedAt,TARGET.id,CODE,before.loadout.revision])).length,1,'Loadout changed');
 }
 const changed=copies===1
  ?await q('DELETE FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=1 AND duplicate_count=0 RETURNING user_id',[TARGET.id,CODE])
  :await q('UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-1,duplicate_count=duplicate_count-1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=$3 AND duplicate_count=$4 RETURNING user_id',[TARGET.id,CODE,copies,copies-1]);
 assert.equal(changed.length,1,'Ownership changed; do not retry without the receipt');
 const after=await inspectHeeyaCryvernRevoke(q);
 assert.equal(Number(after.owned?.total_copies||0),copies-1);
 if(copies>1)assert.equal(Number(after.owned.duplicate_count),copies-2);
 if(loadoutCleared){assert.equal(after.loadout.mercenary_code,null);assert.equal(Number(after.loadout.revision),Number(before.loadout.revision)+1)}
 else assert.deepEqual(after.loadout,before.loadout,'Unrelated loadout changed');
 assert.deepEqual(after.user,before.user,'Account balances changed');assert.deepEqual(after.growth,before.growth,'Growth changed');
 assert.deepEqual(after.acquisitions,before.acquisitions,'Acquisition history changed');assert.deepEqual(after.grant,before.grant,'Original grant history changed');
 assert.deepEqual(after.holdings.filter(row=>row.mercenary_code!==CODE),before.holdings.filter(row=>row.mercenary_code!==CODE),'Other mercenary changed');
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,sourceGrantKey:GRANT_KEY,sourceGrantAuditId:before.grant.adminLogId,actor:'SYSTEM_OPS',userId:TARGET.id,nickname:TARGET.nickname,mercenaryCode:CODE,mercenaryName:'크라이베른',rank:'SSS',quantity:1,beforeCopies:copies,remainingCopies:copies-1,loadoutCleared,loadoutAfter:after.loadout?.mercenary_code||null,balancesPreserved:true,historyPreserved:true,completedAt};
 const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[
  owner.id,'OPS_MERCENARY_REVOKE','USER',String(TARGET.id),JSON.stringify({sourceGrantKey:GRANT_KEY,owned:before.owned,loadout:before.loadout,growth:before.growth}),JSON.stringify({...receipt,owned:after.owned,loadout:after.loadout,authorization:'사용자 지시: 하이희야♡ 계정에 크라이베른 SSS 회수. 앞서 영구 지급한 1장만 회수.'})
 ]);
 assert.ok(audit,'Missing revoke audit');receipt.adminLogId=String(audit.id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),completedAt])).length,1);
 return {...receipt,replayed:false};
}
