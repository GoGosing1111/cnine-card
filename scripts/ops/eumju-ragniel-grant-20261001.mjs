import assert from 'node:assert/strict';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
export const TARGETS=Object.freeze([{id:4817,nickname:'음주',code:'V-046'}]);
export const OPERATION_KEY='ops:eumju-ragniel:20261001:v1';
export const keyFor=t=>`${OPERATION_KEY}:${t.id}:${t.code}`;
const ids=TARGETS.map(t=>t.id),keys=TARGETS.map(keyFor);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const names={'V-046':'라그니엘'};
const owns=(state,t)=>state.holdings.find(r=>Number(r.user_id)===t.id&&r.mercenary_code===t.code)||null;
assert.equal(TARGETS.length,1);assert.equal(new Set(ids).size,1);


export async function inspectGrants(q){
 const exact=await q('SELECT id FROM users WHERE nickname=$1',[TARGETS[0].nickname]);
 assert.equal(exact.length,1,'Exact nickname must match once');assert.equal(Number(exact[0].id),TARGETS[0].id,'Wrong target account');
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 assert.equal(users.length,TARGETS.length,'Missing target account');
 for(const t of TARGETS){const u=users.find(r=>Number(r.id)===t.id);assert.equal(u?.nickname,t.nickname,'Target nickname changed');assert.equal(u.role,'USER');assert.equal(u.status,'ACTIVE')}
 const [cms]=await q("SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'");
 assert.ok(cms,'Missing live CMS');
 // Read authoritative stored entries only; unrelated catalog additions must not
 // require a local seed upgrade or rewrite the live CMS during a direct grant.
 const config=parse(cms.payload_json);assert.ok(Array.isArray(config?.mercenaries),'Invalid live CMS');
 const mercenaries=Object.entries(names).map(([code,name])=>{
  const rows=config.mercenaries.filter(r=>r.code===code);assert.equal(rows.length,1,'Mercenary must match exactly once');
  const m=rows[0];assert.equal(m.name,name);assert.equal(m.rank,'SSS');return {code,name,rank:m.rank};
 });
 const [policy]=await q('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1');
 const weight=policy?parse(policy.payload_json).cardRules?.cardWeights?.['V-046']??1:1;
 assert.notEqual(Number(weight),0,'라그니엘 획득이 OFF인 상태입니다.');
 const holdings=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const loadouts=await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const growth=await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY acquisition_id',[keys]);
 const receipts=(await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).map(r=>parse(r.value));
 const auditIds=receipts.map(r=>r.adminLogId);
 const audits=auditIds.length?await q('SELECT id,admin_id,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[auditIds]):[];
 const state={users,mercenaries,cmsRevision:Number(cms.revision),weight,holdings,loadouts,growth,acquisitions,receipts,audits};
 return {...state,summary:{cmsRevision:state.cmsRevision,targets:TARGETS.map(t=>({...t,mercenary:names[t.code],rank:'SSS',owned:Number(owns(state,t)?.total_copies||0),receipt:receipts.some(r=>r.operationKey===keyFor(t))}))}};
}

// Caller must hold all target USER_LOCKs and a single PostgreSQL transaction.
export async function grantTargets(q){
 await q("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
 await q('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 const [today]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(today.kst,'2026-10-01','One-time grant date expired');
 assert.equal((await q('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).length,TARGETS.length);
 const before=await inspectGrants(q);
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Missing authorized operator');
 const result=[];
 for(const t of TARGETS){
  const operationKey=keyFor(t),saved=before.receipts.find(r=>r.operationKey===operationKey);
  if(saved){
   for(const [key,value] of Object.entries({status:'COMPLETED',operationKey,userId:t.id,nickname:t.nickname,mercenaryCode:t.code,rank:'SSS',quantity:1,permanent:true,expiresAt:null}))assert.equal(saved[key],value,'Invalid existing receipt');
   const acquisitions=before.acquisitions.filter(r=>r.acquisition_id===operationKey);assert.equal(acquisitions.length,1);
   assert.equal(Number(acquisitions[0].user_id),t.id);assert.equal(acquisitions[0].mercenary_code,t.code);
   const audit=before.audits.find(r=>String(r.id)===saved.adminLogId);assert.ok(audit,'Missing audit');assert.equal(audit.target_id,String(t.id));assert.equal(parse(audit.after_data).operationKey,operationKey);
   result.push({...saved,replayed:true});continue;
  }
  assert.ok(!before.acquisitions.some(r=>r.acquisition_id===operationKey),'Acquisition without receipt');
  const owned=owns(before,t),copies=Number(owned?.total_copies||0),createdAt=new Date().toISOString();
  if(owned)assert.equal(Number(owned.duplicate_count),copies-1);
  const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args}}}}};
  for(const statement of mercenaryCardAcquisitionStatements(adapter,{userId:t.id,mercenaryCode:t.code,acquisitionId:operationKey,createdAt}))await q(statement.sql,statement.args);
  const receipt={status:'COMPLETED',operationKey,actor:'SYSTEM_OPS',userId:t.id,nickname:t.nickname,mercenaryCode:t.code,mercenaryName:names[t.code],rank:'SSS',quantity:1,permanent:true,expiresAt:null,beforeCopies:copies,totalCopies:copies+1,duplicates:copies,completedAt:createdAt};
  const audits=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_MERCENARY_GRANT','USER',String(t.id),JSON.stringify({operationKey,owned}),JSON.stringify({...receipt,authorization:'사용자 지시: 음주 계정에 라그니엘 지급. 음주(ID 4817) 라그니엘 SSS 영구 1장 직접 지급.'})]);
  assert.equal(audits.length,1,'Missing administrator audit');receipt.adminLogId=String(audits[0].id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[operationKey,JSON.stringify(receipt),createdAt])).length,1);
  result.push({...receipt,replayed:false});
 }
 const after=await inspectGrants(q);
 for(const key of ['users','loadouts','growth','mercenaries','cmsRevision'])assert.deepEqual(after[key],before[key],`Unexpected ${key} change`);
 const unrelated=rows=>rows.filter(r=>!TARGETS.some(t=>t.id===Number(r.user_id)&&t.code===r.mercenary_code));
 assert.deepEqual(unrelated(after.holdings),unrelated(before.holdings),'Other holdings changed');
 for(const t of TARGETS){
  const old=owns(before,t),now=owns(after,t),receipt=result.find(r=>r.userId===t.id);
  assert.equal(Number(now?.total_copies),Number(old?.total_copies||0)+(receipt.replayed?0:1));assert.equal(Number(now.duplicate_count),Number(now.total_copies)-1);
  if(old)assert.equal(now.first_obtained_at,old.first_obtained_at);
  assert.equal(after.acquisitions.filter(r=>r.acquisition_id===keyFor(t)).length,1);assert.equal(after.receipts.filter(r=>r.operationKey===keyFor(t)).length,1);
 }
 return {status:'COMPLETED',operationKey:OPERATION_KEY,granted:result.filter(r=>!r.replayed).length,replayed:result.filter(r=>r.replayed).length,receipts:result,preserved:{balances:true,loadouts:true,growth:true,otherMercenaries:true}};
}
