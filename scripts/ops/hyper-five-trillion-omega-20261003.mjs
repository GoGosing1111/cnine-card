import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
import cohort from './hyper-five-trillion-omega-20261003-targets.json' with {type:'json'};

export const KEY='ops:hyper-five-trillion-omega:20261003:v1',CODE='V-021',BATCH_SIZE=4;
export const TARGETS=Object.freeze(cohort.targets.map(Object.freeze));
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
assert.equal(TARGETS.length,11);assert.equal(new Set(TARGETS.map(t=>t.id)).size,11);
export function scope(batch){
 assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=Math.ceil(TARGETS.length/BATCH_SIZE));
 const targets=TARGETS.slice((batch-1)*BATCH_SIZE,batch*BATCH_SIZE),ids=targets.map(t=>t.id).sort((a,b)=>a-b);
 return {targets,ids,key:KEY+':batch'+batch,acquisitionIds:targets.map(t=>KEY+':'+t.id)};
}

export async function inspect(client,batch){
 const {ids,key,acquisitionIds}=scope(batch);
 const [cms]=await q(client,"SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'");assert.ok(cms);
 const mercenaries=parse(cms.payload_json).mercenaries,omega=mercenaries.filter(m=>m.code===CODE);
 assert.equal(omega.length,1);assert.equal(omega[0].name,'오메가-X');assert.equal(omega[0].rank,'SSS');
 const codes=mercenaries.filter(m=>m.rank==='SSS').map(m=>m.code);
 const [revocation]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[cohort.revocationReceipt]);assert.ok(revocation);
 const revoked=parse(revocation.value);assert.equal(revoked.status,'COMPLETED');assert.equal(revoked.operationKey,cohort.revocationReceipt);
 const revokedIds=revoked.acquisitionIds,confirmed=new Set(revoked.before.flatMap(r=>r.acquisitionIds));
 assert.ok(Array.isArray(revokedIds));assert.equal(new Set(revokedIds).size,revokedIds.length);
 for(const id of revokedIds)assert.ok(confirmed.has(id),'Unconfirmed revocation');
 const users=await q(client,'SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 const eligibility=await q(client,`SELECT u.id::text user_id,
  COALESCE((SELECT SUM((o.plan_json::jsonb->>'coinCost')::numeric) FROM joint_operations_v1 o WHERE o.user_id=u.id AND o.kind='MERCENARY_OPEN' AND o.status='COMPLETED'),0)::text spent_coin,
  EXISTS(SELECT 1 FROM user_mercenary_cards_v1 c WHERE c.user_id=u.id AND c.mercenary_code=ANY($2::text[]) AND c.total_copies>0) owns_sss,
  EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 a WHERE a.user_id=u.id AND a.mercenary_code=ANY($2::text[]) AND NOT(a.acquisition_id=ANY($3::text[]))) acquired_sss,
  EXISTS(SELECT 1 FROM user_message_rewards r WHERE r.user_id=u.id AND r.reward_type='MERCENARY_OMEGA_X' AND r.claimed_at IS NULL) pending_omega,
  EXISTS(SELECT 1 FROM joint_operations_v1 o WHERE o.user_id=u.id AND o.kind='MERCENARY_OPEN' AND o.status='PENDING') pending_open
  FROM users u WHERE u.id=ANY($1::bigint[]) ORDER BY u.id`,[ids,codes,revokedIds]);
 const holdings=await q(client,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const loadouts=await q(client,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const growth=await q(client,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const acquisitions=await q(client,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY acquisition_id',[acquisitionIds]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[key]);
 return {cmsRevision:Number(cms.revision),users,eligibility,holdings,loadouts,growth,acquisitions,receipt:saved?parse(saved.value):null};
}

export async function verify(client,batch,state=undefined){
 state??=await inspect(client,batch);
 const {targets,key}=scope(batch),receipt=state.receipt;assert.ok(receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,key);
 assert.equal(receipt.mercenaryCode,CODE);assert.equal(receipt.quantityEach,1);
 assert.deepEqual([...receipt.recipients,...receipt.skipped].map(t=>t.userId).sort((a,b)=>a-b),targets.map(t=>t.id).sort((a,b)=>a-b));
 assert.equal(state.acquisitions.length,receipt.recipients.length);
 const logs=receipt.recipients.length?await q(client,'SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[])',[receipt.recipients.map(r=>r.adminLogId)]):[];
 assert.equal(logs.length,receipt.recipients.length);
 for(const r of receipt.recipients){
  assert.equal(r.nickname,targets.find(t=>t.id===r.userId)?.nickname);assert.equal(r.quantity,1);assert.equal(r.beforeCopies,0);assert.equal(r.totalCopies,1);
  const a=state.acquisitions.find(a=>a.acquisition_id===KEY+':'+r.userId),h=state.holdings.find(h=>Number(h.user_id)===r.userId&&h.mercenary_code===CODE);
  assert.equal(Number(a?.user_id),r.userId);assert.equal(a.mercenary_code,CODE);assert.equal(Number(a.total_copies_after),1);assert.ok(Number(h?.total_copies)>=1);
  const log=logs.find(l=>String(l.id)===r.adminLogId);assert.equal(log?.action_type,'OPS_MERCENARY_GRANT');assert.equal(log.target_id,String(r.userId));assert.equal(parse(log.after_data).operationKey,key);
 }
 return receipt;
}

// Short per-batch transactions. The live acquisition helper and this operation
// take the same user-row locks; database leases also guard fallback mutations.
export async function apply(client,batch,{dryRun=false}={}){
 const {targets,ids,key}=scope(batch),token=randomUUID();
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='30s'");
  for(const userId of ids){const now=Date.now();
   const lease=await q(client,`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
    VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,
    lease_until_ms=excluded.lease_until_ms,updated_at=excluded.updated_at WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[userId,token,key,now+60000,now]);
   assert.equal(lease.length,1,'Account operation in progress');
  }
  assert.equal((await q(client,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).length,targets.length);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[key]);
  const unlock=async()=>assert.equal((await q(client,'DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 RETURNING user_id',[ids,token])).length,targets.length);
  if(saved){const receipt=await verify(client,batch);await unlock();await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,replayed:true,dryRun};}
  await q(client,"SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
  await q(client,'SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
  const before=await inspect(client,batch);assert.equal(before.acquisitions.length,0,'Acquisition without receipt');
  const [owner]=await q(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const [draw]=await q(client,'SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1');assert.ok(draw);
  assert.ok(Number(parse(draw.payload_json).cardRules?.cardWeights?.[CODE]??1)>0,'Omega acquisition disabled');
  const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args};}};}};
  const recipients=[],skipped=[],now=new Date().toISOString();
  for(const t of targets){
   const user=before.users.find(u=>Number(u.id)===t.id),e=before.eligibility.find(u=>Number(u.user_id)===t.id);
   assert.equal(user?.nickname,t.nickname,'Reviewed nickname changed');assert.equal(user.role,t.role);
   assert.equal(e.pending_open,false,'Mercenary opening in progress');
   const reason=user.status!=='ACTIVE'?'INACTIVE':BigInt(e.spent_coin)<BigInt(cohort.thresholdCoinInclusive)?'BELOW_THRESHOLD':e.owns_sss||e.acquired_sss?'SSS_ALREADY_ACQUIRED':e.pending_omega?'OMEGA_ALREADY_DELIVERED':null;
   if(reason){skipped.push({userId:t.id,nickname:t.nickname,reason});continue;}
   const acquisitionId=KEY+':'+t.id;
   for(const s of mercenaryCardAcquisitionStatements(adapter,{userId:t.id,mercenaryCode:CODE,acquisitionId,createdAt:now}))await q(client,s.sql,s.args);
   const r={userId:t.id,nickname:t.nickname,spentCoin:e.spent_coin,mercenaryCode:CODE,mercenaryName:'오메가-X',rank:'SSS',quantity:1,permanent:true,beforeCopies:0,totalCopies:1,duplicateCount:0,acquisitionId};
   const [audit]=await q(client,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[
    'OPS_MERCENARY_GRANT','USER',String(t.id),JSON.stringify({eligibility:e,owned:null}),JSON.stringify({...r,operationKey:key,actor:'SYSTEM_OPS',authorization:cohort.authorization,cohortSnapshotAt:cohort.snapshotAt,revocationReceipt:cohort.revocationReceipt})]);
   assert.ok(audit);r.adminLogId=String(audit.id);recipients.push(r);
  }
  const after=await inspect(client,batch);
  for(const name of ['users','loadouts','growth','cmsRevision'])assert.deepEqual(after[name],before[name],`Unexpected ${name} change`);
  const granted=new Set(recipients.map(r=>r.userId));
  const unrelated=rows=>rows.filter(r=>r.mercenary_code!==CODE||!granted.has(Number(r.user_id)));
  assert.deepEqual(unrelated(after.holdings),unrelated(before.holdings),'Other mercenaries changed');
  const receipt={status:'COMPLETED',operationKey:key,batch,cmsRevision:before.cmsRevision,mercenaryCode:CODE,mercenaryName:'오메가-X',rank:'SSS',quantityEach:1,permanent:true,recipients,skipped,completedAt:now};
  assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[key,JSON.stringify(receipt),now])).length,1);
  await verify(client,batch,{...after,receipt});await unlock();await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {...receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
