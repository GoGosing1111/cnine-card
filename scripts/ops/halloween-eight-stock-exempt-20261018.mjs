import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_MERCENARIES} from '../../shared/mercenary-halloween-catalog-v1.mjs';

export const OP='ops:halloween-eight:stock-exempt:20261018:v1';
export const ACTION='OPS_HALLOWEEN_MERCENARY_STOCK_EXEMPT_GRANT';
export const PLAN=Object.freeze({
 operationKey:OP,dateKST:'2026-10-18',quantityEach:1,permanent:true,delivery:'DIRECT',stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',limitedIssueRecord:false,
 authorization:'딤키우기 할로윈 디임 / zkzk9999 할로윈 디임 / 씨나인택갓 할로윈 디임 / 족구조아 할로윈 디임 / ShowMaker 할로윈 디임 / 진짜디임 할로윈 디임 / 여우 할로윈 수댕 / 모래 할로인 수댕 지급',
 stockAuthorization:'직전 사용자 지시: 남수댕ㅗ 계정에 리미티드 할로윈 남수댕 지급해 횟수증가없이 예외지급. 같은 지급 요청의 후속 8명에도 발행 횟수 미증가 적용.',
 grants:Object.freeze([
  {userId:'4836',nickname:'딤키우기',code:'V-984',name:'디임'},
  {userId:'3884',nickname:'zkzk9999',code:'V-984',name:'디임'},
  {userId:'1195',nickname:'씨나인택갓',code:'V-984',name:'디임'},
  {userId:'525',nickname:'족구조아',code:'V-984',name:'디임'},
  {userId:'233',nickname:'ShowMaker',code:'V-984',name:'디임'},
  {userId:'4773',nickname:'진짜디임',code:'V-984',name:'디임'},
  {userId:'25',nickname:'여우',code:'V-986',name:'남수댕'},
  {userId:'295',nickname:'모래',code:'V-986',name:'남수댕'}
 ].map(x=>Object.freeze({...x,rank:'SS',edition:'HALLOWEEN_LIMITED',quantity:1})))
});
export const HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const IDS=PLAN.grants.map(x=>x.userId).sort((a,b)=>Number(a)-Number(b));
const CODES=[...new Set(PLAN.grants.map(x=>x.code))].sort(),PACK='mercenary_halloween_ss_pack_v1';
const pair=x=>`${x.user_id??x.userId}:${x.mercenary_code??x.code}`;
const TARGETS=new Set(PLAN.grants.map(pair));
const acquisitionId=x=>`${OP}:${x.userId}:${x.code}`;
const ACQUISITIONS=PLAN.grants.map(acquisitionId);
const one=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const array=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;

// One snapshot query keeps all eight account leases short. Credentials are never selected.
export async function state(c){
 const fields={
  users:'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',
  stock:'SELECT code,stock_limit::text,issued::text,revision::text,last_token FROM mercenary_limited_stock_v1 WHERE code=ANY($2::text[]) ORDER BY code',
  issueCounts:'SELECT code,COUNT(*)::text AS count FROM mercenary_limited_issues_v1 WHERE code=ANY($2::text[]) GROUP BY code ORDER BY code',
  pack:'SELECT key,value FROM app_meta WHERE key=$3',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  drawUsage:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key LIKE 'mercenary%:'||u.id::text||':%') ORDER BY key"
 };
 return one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${array(sql)}`).join(',')}) AS data`,[IDS,CODES,PACK])).data;
}
export async function receipt(c){
 const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;
}
function auditPayload(r,g){
 const {adminLogId,...grant}=g;
 return {operationKey:OP,planHash:HASH,completedAt:r.completedAt,stockPolicy:PLAN.stockPolicy,grant};
}
export async function verify(c,r,{exact=false}={}){
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);
 assert.deepEqual(r.stockBefore,r.stockAfter);assert.deepEqual(r.issueCountsBefore,r.issueCountsAfter);assert.equal(r.grants.length,8);
 const snapshot=await state(c);
 const evidence=one(await q(c,`SELECT jsonb_build_object(
  'acquisitions',${array('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY acquisition_id')},
  'issues',${array('SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id=ANY($1::text[]) OR request_id=$2')},
  'audits',${array('SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($3::bigint[]) ORDER BY id')}
 ) AS data`,[ACQUISITIONS,OP,r.grants.map(g=>g.adminLogId)])).data;
 assert.equal(evidence.acquisitions.length,8);assert.equal(evidence.issues.length,0);assert.equal(evidence.audits.length,8);
 for(const [i,plan] of PLAN.grants.entries()){
  const g=r.grants[i];for(const [key,value] of Object.entries(plan))assert.equal(g[key],value);
  assert.equal(g.acquisitionId,acquisitionId(plan));assert.equal(g.copiesAfter,g.copiesBefore+1);assert.equal(g.duplicatesAfter,g.copiesAfter-1);
  const a=one(evidence.acquisitions.filter(x=>x.acquisition_id===g.acquisitionId));
  assert.equal(String(a.user_id),g.userId);assert.equal(a.mercenary_code,g.code);assert.equal(Number(a.total_copies_after),g.copiesAfter);
  assert.equal(Number(a.duplicate_count_after),g.duplicatesAfter);assert.equal(Number(a.is_duplicate),g.copiesBefore>0?1:0);assert.equal(a.created_at,r.completedAt);
  const holding=one(snapshot.cards.filter(x=>pair(x)===pair(g)));
  assert.ok(Number(holding.total_copies)>=g.copiesAfter);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
  assert.equal(holding.first_obtained_at,g.holdingBefore?.first_obtained_at||r.completedAt);
  const audit=one(evidence.audits.filter(x=>x.id===g.adminLogId));assert.equal(audit.admin_id,r.adminId);assert.equal(audit.action_type,ACTION);
  assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,g.userId);assert.deepEqual(JSON.parse(audit.after_data),auditPayload(r,g));
  if(exact){assert.equal(Number(holding.total_copies),g.copiesAfter);assert.equal(holding.last_obtained_at,r.completedAt);}
 }
 if(exact){assert.deepEqual(snapshot.stock,r.stockBefore);assert.deepEqual(snapshot.issueCounts,r.issueCountsBefore);}
 return {status:'VERIFIED',recipients:8,totalCopies:8,grants:r.grants.map(g=>({userId:g.userId,nickname:g.nickname,code:g.code,name:g.name,quantity:1,copiesBefore:g.copiesBefore,copiesAfter:g.copiesAfter})),stockChanged:false,
  stock:r.stockAfter.map(s=>({code:s.code,limit:s.stock_limit,issued:s.issued,remaining:String(BigInt(s.stock_limit)-BigInt(s.issued))})),acquisitionRecords:8,numberedIssueRecords:0,auditRecords:8,duplicateOperationGrants:0};
}

// Caller holds production account leases and owns BEGIN/COMMIT/ROLLBACK for the entire batch.
export async function grant(c,expectedHash,{lockDeadline}={}){
 assert.equal(expectedHash,HASH);assert.ok(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account leases required');
 assert.equal(IDS.length,8);assert.equal(new Set(IDS).size,8);
 for(const p of PLAN.grants){const item=HALLOWEEN_MERCENARIES.find(x=>x.code===p.code);assert.equal(item?.name,p.name);assert.equal(item?.rank,'SS');assert.equal(item?.season,'HALLOWEEN');}
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const previous=await receipt(c);if(previous)return {replayed:true,receipt:previous,verification:await verify(c,previous)};
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,8);
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[PACK]));
 assert.equal((await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[CODES])).length,2);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) AND mercenary_code=ANY($2::text[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS,CODES]);
 const before=await state(c);assert.equal(before.users.length,8);
 for(const p of PLAN.grants){const user=one(before.users.filter(x=>x.id===p.userId));assert.equal(user.nickname,p.nickname);assert.equal(user.status,'ACTIVE');}
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[]) ORDER BY users.id',[PLAN.grants.map(p=>p.nickname)]);
 assert.equal(exact.length,8);for(const p of PLAN.grants)assert.equal(one(exact.filter(u=>u.nickname===p.nickname)).id,p.userId);
 for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])assert.equal((await q(c,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=ANY($1::text[])`,[ACQUISITIONS])).length,0,'Orphan grant requires reconciliation');
 assert.equal((await q(c,"SELECT id FROM admin_logs WHERE action_type=$1 AND after_data::jsonb->>'operationKey'=$2",[ACTION,OP])).length,0);
 const owner=one(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const now=new Date().toISOString();
 const inputs=PLAN.grants.map(p=>{
  const holdingBefore=before.cards.find(x=>pair(x)===pair(p))||null,copiesBefore=Number(holdingBefore?.total_copies||0);
  assert.ok(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);if(holdingBefore)assert.equal(Number(holdingBefore.duplicate_count),copiesBefore-1);
  return {...p,acquisitionId:acquisitionId(p),holdingBefore,copiesBefore,copiesAfter:copiesBefore+1,duplicatesAfter:copiesBefore};
 });
 const payload=JSON.stringify(inputs.map(g=>({user_id:g.userId,code:g.code,acquisition_id:g.acquisitionId,is_duplicate:g.copiesBefore>0?1:0,copies_after:g.copiesAfter,duplicates_after:g.duplicatesAfter})));
 const updated=await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
  SELECT x.user_id,x.code,1,0,$2,$2 FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,code text) ORDER BY x.user_id
  ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[payload,now]);assert.equal(updated.length,8);
 const acquisitions=await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
  SELECT x.acquisition_id,x.user_id,x.code,x.is_duplicate,x.copies_after,x.duplicates_after,$2 FROM jsonb_to_recordset($1::jsonb)
  AS x(acquisition_id text,user_id bigint,code text,is_duplicate integer,copies_after integer,duplicates_after integer) RETURNING acquisition_id`,[payload,now]);assert.equal(acquisitions.length,8);
 const after=await state(c);
 for(const key of ['users','stock','issueCounts','pack','loadout','inventory','levels','growth','drawUsage'])assert.deepEqual(after[key],before[key],key+' changed unexpectedly');
 const others=cards=>cards.filter(x=>!TARGETS.has(pair(x)));assert.deepEqual(others(after.cards),others(before.cards));
 for(const g of inputs){const h=one(after.cards.filter(x=>pair(x)===pair(g)));assert.equal(Number(h.total_copies),g.copiesAfter);assert.equal(Number(h.duplicate_count),g.duplicatesAfter);assert.equal(h.first_obtained_at,g.holdingBefore?.first_obtained_at||now);}
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,adminId:owner.id,stockBefore:before.stock,stockAfter:after.stock,issueCountsBefore:before.issueCounts,issueCountsAfter:after.issueCounts,grants:inputs,
  preserved:{balances:true,stockCounters:true,numberedIssues:true,packSettings:true,otherMercenaries:true,loadout:true,inventory:true,levels:true,growth:true,drawUsage:true}};
 const logs=JSON.stringify(inputs.map(g=>({target_id:g.userId,before_data:JSON.stringify({operationKey:OP,holding:g.holdingBefore}),after_data:JSON.stringify(auditPayload(r,g))})));
 const audits=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  SELECT $2,$3,'USER',x.target_id,x.before_data,x.after_data FROM jsonb_to_recordset($1::jsonb) AS x(target_id text,before_data text,after_data text) RETURNING id::text,target_id`,[logs,owner.id,ACTION]);assert.equal(audits.length,8);
 for(const g of r.grants)g.adminLogId=one(audits.filter(a=>a.target_id===g.userId)).id;
 const verification=await verify(c,r,{exact:true});
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 assert.ok(lockDeadline>Date.now()+5000,'Account leases nearing expiration');return {replayed:false,receipt:r,verification};
}
