import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../../shared/mercenary-cms-model-v1.mjs';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';

export const KEY='ops:hyper-five-trillion-omega:20260928:v1',CODE='V-021';
export const TARGETS=Object.freeze([
 {id:52,nickname:'폭군#',role:'USER'},{id:148,nickname:'혜루',role:'USER'},
 {id:183,nickname:'남수댕',role:'USER'},{id:4647,nickname:'피카츄',role:'USER'},
 {id:4598,nickname:'암살자..',role:'USER'},{id:521,nickname:'대저동토마토',role:'USER'},
 {id:4222,nickname:'#크레파스',role:'USER'},{id:3011,nickname:'오일바른가지',role:'USER'},
 {id:76,nickname:'랄네미탱탱',role:'USER'},{id:16,nickname:'오승환이다',role:'ADMIN'},
 {id:4562,nickname:'찡찡ෆ',role:'USER'},{id:4627,nickname:'학벌',role:'USER'},
 {id:4504,nickname:'깜찍소녀',role:'USER'}
]);
const ids=TARGETS.map(t=>t.id).sort((a,b)=>a-b),parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function inspectOmegaGrant(q){
 const users=await q('SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 assert.equal(users.length,TARGETS.length);
 for(const t of TARGETS){const u=users.find(u=>Number(u.id)===t.id);assert.equal(u.nickname,t.nickname,'Recipient name changed');assert.equal(u.status,'ACTIVE');assert.equal(u.role,t.role);}
 const [cms]=await q("SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'");assert.ok(cms);
 const config=expandMercenarySkillCatalog(parse(cms.payload_json),seed.document,seed.catalog),card=config.mercenaries.find(c=>c.code===CODE);
 assert.equal(card?.name,'오메가-X');assert.equal(card.rank,'SSS');
 const [policy]=await q('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1'),weight=policy?parse(policy.payload_json).cardRules?.cardWeights?.[CODE]??1:1;
 const holdings=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const loadouts=await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const growth=await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]);
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY user_id',[ids.map(id=>KEY+':'+id)]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 return {users,mercenary:{code:CODE,name:card.name,rank:card.rank},cmsRevision:Number(cms.revision),weight,holdings,loadouts,growth,acquisitions,receipt:saved?parse(saved.value):null};
}
// The user approved this exact 13-account list, including ADMIN account 16.
// Caller holds USER_LOCK leases and one transaction. No gameplay route changes.
export async function grantOmegaToThirteen(q){
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]),record=parse(saved.value);
 if(record.status==='COMPLETED')return {...record.result,replayed:true};
 assert.equal(record.status,'PENDING');assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"))[0]);
 await q('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 await q("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
 await q('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 const before=await inspectOmegaGrant(q);assert.notEqual(Number(before.weight),0,'Omega acquisition is OFF');assert.equal(before.acquisitions.length,0,'Acquisition exists without receipt');
 const now=new Date().toISOString(),adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args}}}}};
 for(const t of TARGETS)for(const s of mercenaryCardAcquisitionStatements(adapter,{userId:t.id,mercenaryCode:CODE,acquisitionId:KEY+':'+t.id,createdAt:now}))await q(s.sql,s.args);
 const after=await inspectOmegaGrant(q);
 for(const key of ['users','loadouts','growth'])assert.deepEqual(after[key],before[key],key+' changed');
 assert.deepEqual(after.holdings.filter(h=>h.mercenary_code!==CODE),before.holdings.filter(h=>h.mercenary_code!==CODE));
 assert.equal(after.acquisitions.length,TARGETS.length);
 const recipients=[];
 for(const t of TARGETS){
  const old=before.holdings.find(h=>Number(h.user_id)===t.id&&h.mercenary_code===CODE),owned=after.holdings.find(h=>Number(h.user_id)===t.id&&h.mercenary_code===CODE),copies=Number(old?.total_copies||0);
  assert.ok(owned);assert.equal(Number(owned.total_copies),copies+1);assert.equal(Number(owned.duplicate_count),copies);
  if(old)assert.equal(owned.first_obtained_at,old.first_obtained_at);
  const acquisition=after.acquisitions.find(a=>a.acquisition_id===KEY+':'+t.id);
  assert.equal(Number(acquisition?.user_id),t.id);assert.equal(acquisition.mercenary_code,CODE);assert.equal(Number(acquisition.total_copies_after),copies+1);
  const result={userId:t.id,nickname:t.nickname,mercenaryCode:CODE,mercenaryName:'오메가-X',rank:'SSS',quantity:1,permanent:true,beforeCopies:copies,totalCopies:copies+1,duplicateCount:copies,acquisitionId:acquisition.acquisition_id};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[
   'OPS_MERCENARY_GRANT','USER',String(t.id),JSON.stringify({owned:old||null}),
   JSON.stringify({...result,operationKey:KEY,authorization:'위 명단에 SSS 오메가 지급해 — 2026-09-28 13:59 KST 하이퍼팩 누적 5조 이상·SSS 미보유 조회 명단 13명 각 1장 직접 지급'})
  ]);
  assert.ok(audit);result.adminLogId=String(audit.id);recipients.push(result);
 }
 const result={status:'COMPLETED',operationKey:KEY,mercenaryCode:CODE,mercenaryName:'오메가-X',rank:'SSS',count:TARGETS.length,quantityEach:1,permanent:true,recipients,completedAt:now};
 await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[KEY,JSON.stringify({status:'COMPLETED',result}),now]);
 return {...result,replayed:false};
}
