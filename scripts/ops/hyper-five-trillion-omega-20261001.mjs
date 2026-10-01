import assert from 'node:assert/strict';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
import cohort from './hyper-five-trillion-omega-20261001-targets.json' with {type:'json'};

export const OPERATION_KEY='ops:hyper-five-trillion-omega:20261001:v1';
export const THRESHOLD='5000000000000',CODE='V-021';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export const TARGETS=Object.freeze(cohort.targets.map(t=>Object.freeze(t)));
export const BATCH_SIZE=5;
assert.equal(TARGETS.length,20);assert.equal(new Set(TARGETS.map(t=>t.id)).size,20);
export function scope(batch){
 assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=Math.ceil(TARGETS.length/BATCH_SIZE),'Invalid batch');
 const targets=TARGETS.slice((batch-1)*BATCH_SIZE,batch*BATCH_SIZE),ids=targets.map(t=>t.id).sort((a,b)=>a-b),key=OPERATION_KEY+':batch'+batch;
 return {batch,targets,ids,key,acquisitionIds:targets.map(t=>key+':'+t.id)};
}
export async function liveCatalog(q){
 const [cms]=await q("SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'");
 assert.ok(cms,'Missing live CMS');const config=parse(cms.payload_json);
 assert.ok(Array.isArray(config.mercenaries),'Missing live mercenaries');
 const matches=config.mercenaries.filter(c=>c.code===CODE);assert.equal(matches.length,1);
 assert.equal(matches[0].name,'오메가-X');assert.equal(matches[0].rank,'SSS');
 const sss=config.mercenaries.filter(c=>c.rank==='SSS').map(c=>({code:c.code,name:c.name}));
 assert.equal(new Set(sss.map(c=>c.code)).size,sss.length,'Duplicate SSS codes');
 const [policy]=await q('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1');
 const weight=policy?parse(policy.payload_json).cardRules?.cardWeights?.[CODE]??1:1;
 assert.notEqual(Number(weight),0,'Omega acquisition is OFF');
 return {cmsRevision:Number(cms.revision),sss,weight};
}
export async function inspectHyperEligibility(q){
 const catalog=await liveCatalog(q),codes=catalog.sss.map(c=>c.code);
 const [snapshot]=await q('SELECT CURRENT_TIMESTAMP AS snapshot_at');
 const [integrity]=await q("SELECT COUNT(*)::text completed,COUNT(*) FILTER(WHERE plan_json::jsonb->>'coinCost' IS NULL OR plan_json::jsonb->>'count' IS NULL)::text invalid FROM joint_operations_v1 WHERE kind='MERCENARY_OPEN' AND status='COMPLETED'");
 assert.equal(integrity.invalid,'0','Completed opening has no price or count');
 const qualified=await q(`WITH paid AS (
  SELECT user_id,SUM((plan_json::jsonb->>'coinCost')::numeric) spent_coin,SUM((plan_json::jsonb->>'count')::bigint) opening_count,COUNT(*) transactions,MAX(completed_at) last_opened_at
  FROM joint_operations_v1 WHERE kind='MERCENARY_OPEN' AND status='COMPLETED'
  GROUP BY user_id HAVING SUM((plan_json::jsonb->>'coinCost')::numeric)>=$1::numeric
 ) SELECT u.id::text user_id,u.nickname,u.role,u.status,p.spent_coin::text,p.opening_count::text,p.transactions::text,p.last_opened_at,
  (SELECT COUNT(*) FROM user_mercenary_cards_v1 c WHERE c.user_id=u.id AND c.mercenary_code=ANY($2::text[]) AND c.total_copies>0)::text sss_owned_types,
  (SELECT COUNT(*) FROM mercenary_card_acquisitions_v1 a WHERE a.user_id=u.id AND a.mercenary_code=ANY($2::text[]))::text sss_acquisitions,
  (SELECT COUNT(*) FROM user_message_rewards r WHERE r.user_id=u.id AND r.reward_type='MERCENARY_OMEGA_X' AND r.claimed_at IS NULL)::text unclaimed_omega_rewards
 FROM paid p JOIN users u ON u.id=p.user_id ORDER BY p.spent_coin DESC,u.id`,[THRESHOLD,codes]);
 const eligible=qualified.filter(u=>u.status==='ACTIVE'&&u.sss_owned_types==='0'&&u.sss_acquisitions==='0'&&u.unclaimed_omega_rewards==='0');
 return {snapshotAt:snapshot.snapshot_at,thresholdCoinInclusive:THRESHOLD,...catalog,completedOpenings:integrity.completed,qualifiedCount:qualified.length,eligibleCount:eligible.length,eligible,
  excluded:qualified.filter(u=>!eligible.includes(u)).map(u=>({userId:Number(u.user_id),nickname:u.nickname,status:u.status,sssOwned:Number(u.sss_owned_types),sssAcquisitions:Number(u.sss_acquisitions),unclaimedOmega:Number(u.unclaimed_omega_rewards)}))};
}

export async function inspectBatch(q,batch){
 const {targets,ids,key,acquisitionIds}=scope(batch),catalog=await liveCatalog(q),codes=catalog.sss.map(c=>c.code);
 const users=await q('SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 assert.equal(users.length,targets.length,'Missing target account');
 for(const t of targets)assert.equal(users.find(u=>Number(u.id)===t.id)?.nickname,t.nickname,'Target nickname changed');
 const eligibility=await q(`SELECT u.id::text user_id,
  COALESCE((SELECT SUM((o.plan_json::jsonb->>'coinCost')::numeric) FROM joint_operations_v1 o WHERE o.user_id=u.id AND o.kind='MERCENARY_OPEN' AND o.status='COMPLETED'),0)::text spent_coin,
  EXISTS(SELECT 1 FROM user_mercenary_cards_v1 c WHERE c.user_id=u.id AND c.mercenary_code=ANY($2::text[]) AND c.total_copies>0) owns_sss,
  EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 a WHERE a.user_id=u.id AND a.mercenary_code=ANY($2::text[])) acquired_sss,
  EXISTS(SELECT 1 FROM user_message_rewards r WHERE r.user_id=u.id AND r.reward_type='MERCENARY_OMEGA_X' AND r.claimed_at IS NULL) pending_omega
 FROM users u WHERE u.id=ANY($1::bigint[]) ORDER BY u.id`,[ids,codes]);
 const holdings=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const loadouts=await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const growth=await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY user_id',[acquisitionIds]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[key]);
 return {...catalog,users,eligibility,holdings,loadouts,growth,acquisitions,receipt:saved?parse(saved.value):null};
}

export async function verifyBatch(q,batch,state=undefined){
 state??=await inspectBatch(q,batch);if(!state.receipt)return null;
 const {targets,key}=scope(batch),receipt=state.receipt.result;
 assert.equal(state.receipt.status,'COMPLETED');assert.equal(receipt.operationKey,key);
 assert.equal(receipt.mercenaryCode,CODE);assert.equal(receipt.quantityEach,1);
 assert.equal(receipt.recipients.length+receipt.skipped.length,targets.length);
 assert.equal(new Set([...receipt.recipients,...receipt.skipped].map(t=>t.userId)).size,targets.length);
 assert.equal(state.acquisitions.length,receipt.recipients.length);
 const logs=receipt.recipients.length?await q('SELECT id,admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[])',[receipt.recipients.map(r=>r.adminLogId)]):[];
 assert.equal(logs.length,receipt.recipients.length);
 for(const r of receipt.recipients){
  const target=targets.find(t=>t.id===r.userId);assert.equal(r.nickname,target?.nickname);assert.equal(r.quantity,1);assert.equal(r.beforeCopies,0);assert.equal(r.totalCopies,1);
  const a=state.acquisitions.find(a=>a.acquisition_id===key+':'+r.userId),h=state.holdings.find(h=>Number(h.user_id)===r.userId&&h.mercenary_code===CODE);
  assert.equal(Number(a?.user_id),r.userId);assert.equal(a.mercenary_code,CODE);assert.equal(Number(a.total_copies_after),1);assert.ok(Number(h?.total_copies)>=1);
  const log=logs.find(l=>String(l.id)===r.adminLogId);assert.equal(log?.action_type,'OPS_MERCENARY_GRANT');assert.equal(log.target_type,'USER');assert.equal(Number(log.admin_id),1);assert.equal(String(log.target_id),String(r.userId));assert.equal(parse(log.after_data).operationKey,key);
 }
 return receipt;
}

// Caller holds each target's USER_LOCK and one PostgreSQL transaction. Recheck
// eligibility under user row locks so a new SSS acquisition cannot double-grant.
export async function grantBatch(q,batch){
 const {targets,ids,key}=scope(batch);
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[key]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key]),record=parse(saved.value);
 if(record.status==='COMPLETED')return {...await verifyBatch(q,batch),replayed:true};
 assert.equal(record.status,'PENDING');
 const [today]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst");assert.equal(today.kst,'2026-10-01','One-time operation date expired');
 assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"))[0],'Missing active operator');
 await q('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 await q("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
 await q('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 const before=await inspectBatch(q,batch);assert.equal(before.acquisitions.length,0,'Acquisition without receipt');
 const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args};}};}};
 const recipients=[],skipped=[],now=new Date().toISOString();
 for(const t of targets){
  const u=before.users.find(u=>Number(u.id)===t.id),e=before.eligibility.find(e=>Number(e.user_id)===t.id);
  const reason=u.status!=='ACTIVE'?'INACTIVE':BigInt(e.spent_coin)<BigInt(THRESHOLD)?'BELOW_THRESHOLD':e.owns_sss||e.acquired_sss?'SSS_ALREADY_ACQUIRED':e.pending_omega?'OMEGA_ALREADY_DELIVERED':null;
  if(reason){skipped.push({userId:t.id,nickname:t.nickname,reason});continue;}
  for(const s of mercenaryCardAcquisitionStatements(adapter,{userId:t.id,mercenaryCode:CODE,acquisitionId:key+':'+t.id,createdAt:now}))await q(s.sql,s.args);
  const r={userId:t.id,nickname:t.nickname,spentCoin:e.spent_coin,mercenaryCode:CODE,mercenaryName:'오메가-X',rank:'SSS',quantity:1,permanent:true,beforeCopies:0,totalCopies:1,duplicateCount:0,acquisitionId:key+':'+t.id};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[
   'OPS_MERCENARY_GRANT','USER',String(t.id),JSON.stringify({eligibility:e,owned:null}),JSON.stringify({...r,operationKey:key,actor:'SYSTEM_OPS',authorization:'5조이상 하이퍼팩 sss 미습득자 오메가 명단 새로 조회하고 지급해',cohortSnapshotAt:cohort.snapshotAt})]);
  assert.ok(audit,'Missing grant audit');r.adminLogId=String(audit.id);recipients.push(r);
 }
 const after=await inspectBatch(q,batch);
 for(const field of ['users','loadouts','growth'])assert.deepEqual(after[field],before[field],field+' changed');
 const granted=new Set(recipients.map(r=>r.userId));
 const unrelated=rows=>rows.filter(h=>h.mercenary_code!==CODE||!granted.has(Number(h.user_id)));
 assert.deepEqual(unrelated(after.holdings),unrelated(before.holdings),'Other mercenary holdings changed');
 assert.equal(after.acquisitions.length,recipients.length);
 for(const r of recipients){const h=after.holdings.find(h=>Number(h.user_id)===r.userId&&h.mercenary_code===CODE);assert.equal(Number(h?.total_copies),1);assert.equal(Number(h.duplicate_count),0);}
 const result={status:'COMPLETED',operationKey:key,batch,mercenaryCode:CODE,mercenaryName:'오메가-X',rank:'SSS',count:recipients.length,quantityEach:1,permanent:true,recipients,skipped,completedAt:now};
 await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[key,JSON.stringify({status:'COMPLETED',result}),now]);
 await verifyBatch(q,batch,{...after,receipt:{status:'COMPLETED',result}});
 return {...result,replayed:false};
}
