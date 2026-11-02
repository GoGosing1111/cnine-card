import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,ACTION='OPS_BLACKCROWN_CARDGU_STOCK_GRANT';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const HASH=hash(PLAN),IDS=PLAN.recipients.map(u=>u.id).sort((a,b)=>Number(a)-Number(b));
const CODES=[...new Set(PLAN.grants.map(g=>g.code))].sort();
const SETTINGS=['mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_halloween_pack_v1','mercenary_kairon_craft_v1','mercenary_jokro_craft_v1','sss_miracle_cube_policy_20261021_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_limited_shard_craft_v1:V-970','support_package_coin_v1:525','mercenary_blackcrown_ss_pack_v1','mercenary_runtime_policy_v1'];
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
const aid=(g,i)=>`${OP}:${g.userId}:${g.code}:${i+1}`;
function validate(expected){
 assert.equal(expected,HASH,'Reviewed plan required');assert.equal(PLAN.operationKey,'ops:jokgujoa-blackcrown-cardgu:20261102:v1');
 assert.equal(PLAN.totalQuantity,1);assert.equal(PLAN.recipientCount,1);assert.deepEqual(IDS,['525']);
 assert.equal(PLAN.stockAuthorization,'블랙크라운 잔여 한도 1장 차감');assert.equal(PLAN.stockPolicy,'CONSUME_ONE_EXISTING_BLACKCROWN_SLOT');assert.equal(PLAN.stockLimit,7);assert.equal(PLAN.cost,0);assert.equal(PLAN.automaticLoadout,false);assert.equal(PLAN.sendMessages,false);
 assert.deepEqual(PLAN.recipients.map(u=>[u.id,u.nickname,u.role,u.status]),[['525','족구조아','USER','ACTIVE']]);
 assert.equal(PLAN.grants.length,1);assert.deepEqual(PLAN.grants.map(g=>g.userId).sort((a,b)=>Number(a)-Number(b)),IDS);
 for(const g of PLAN.grants){assert.equal(g.code,'V-970');assert.equal(g.rank,'SSS');assert.equal(g.season,'BLACKCROWN');assert.equal(g.quantity,1);assert.equal(g.nickname,one(PLAN.recipients.filter(u=>u.id===g.userId)).nickname);}
}
export async function state(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($2::text[]) ORDER BY code',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($2::text[]) ORDER BY code,serial',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  craft:"SELECT output_ref,COUNT(*)::text AS rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text AS crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=ANY($2::text[]) GROUP BY output_ref ORDER BY output_ref",
  recipes:"SELECT * FROM workshop_recipes_v1668 WHERE output_type='MERCENARY' AND output_ref=ANY($2::text[]) ORDER BY id",
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  accountSettings:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key LIKE 'mercenary%:'||u.id::text||':%' OR key='mercenary_pvp_loadout_v1:'||u.id::text OR key='mercenary_halloween_ss_once_v1:'||u.id::text OR key='ranked_series_roster_v1:'||u.id::text) ORDER BY key"
 };
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) AS data`,[IDS,CODES,SETTINGS])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function artifacts(c){return one(await q(c,`SELECT jsonb_build_object('receipt',${arr('SELECT key FROM app_meta WHERE key=$1')},'acquisitions',${arr('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $2')},'audit',${arr('SELECT id::text FROM admin_logs WHERE action_type=$3 AND target_id=$1')}) AS data`,[OP,OP+':%',ACTION])).data;}
export function ledger(s){
 const stock=one(s.stock),limit=Number(stock.stock_limit),issued=Number(stock.issued);assert(Number.isSafeInteger(limit)&&Number.isSafeInteger(issued)&&limit>=issued);
 const pack=JSON.parse(one(s.settings.filter(r=>r.key==='mercenary_blackcrown_ss_pack_v1')).value);assert.equal(pack.settings.stockLimits['V-970'],limit,'CMS/stock mismatch');
 assert.equal(s.issues.length,issued,'Issuance ledger mismatch');s.issues.forEach((r,i)=>assert.equal(Number(r.serial),i+1,'Serial gap'));
 return {limit,issued,remaining:limit-issued};
}
const protectedState=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['cards','sync','stock','issues'].includes(k)));
export async function verify(c,r,{exact=false}={}){
 r??=await receipt(c);validate(HASH);assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.acquisitions.length,1);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await state(c),a=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%']);assert.equal(a.length,1);
 for(const g of r.grants){
  const p=one(PLAN.grants.filter(p=>p.userId===g.userId&&p.code===g.code));assert.equal(g.quantity,p.quantity);assert.equal(g.copiesAfter-g.copiesBefore,p.quantity);
  const h=one(s.cards.filter(x=>String(x.user_id)===g.userId&&x.mercenary_code===g.code));assert(Number(h.total_copies)>=g.copiesAfter);assert.equal(Number(h.duplicate_count),Number(h.total_copies)-1);if(exact)assert.equal(Number(h.total_copies),g.copiesAfter);
  for(let i=0;i<g.quantity;i++){const row=one(a.filter(x=>x.acquisition_id===aid(g,i)));assert.equal(String(row.user_id),g.userId);assert.equal(row.mercenary_code,g.code);assert.equal(Number(row.total_copies_after),g.copiesBefore+i+1);assert.equal(Number(row.duplicate_count_after),g.copiesBefore+i);assert.equal(Number(row.is_duplicate),g.copiesBefore+i>0?1:0);assert.equal(row.created_at,r.completedAt);}
 }
 const numbered=await q(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE acquisition_id LIKE $1 OR request_id=$2',[OP+':%',OP]);assert.equal(numbered.length,1);
 const issue=numbered[0];assert.equal(issue.acquisition_id,r.acquisitions[0]);assert.equal(issue.request_id,OP);assert.equal(String(issue.user_id),'525');assert.equal(issue.code,'V-970');assert.equal(Number(issue.serial),r.serial);assert.equal(issue.created_at,r.completedAt);
 assert.equal(Number(one(r.stockAfter).stock_limit),Number(one(r.stockBefore).stock_limit));assert.equal(Number(one(r.stockAfter).issued),Number(one(r.stockBefore).issued)+1);assert.equal(Number(one(r.stockAfter).revision),Number(one(r.stockBefore).revision)+1);assert.equal(one(r.stockAfter).last_token,OP);
 assert.equal(r.serial,Number(one(r.stockAfter).issued));assert(ledger(s).issued>=r.serial);
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...recorded}=r;assert.deepEqual(parse(audit.after_data),recorded);
 if(exact){assert.deepEqual(s.stock,r.stockAfter);assert.deepEqual(s.issues,r.issuesAfter);assert.deepEqual(s.craft,r.craftBefore);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);}
 return {status:'VERIFIED',recipientCount:1,totalQuantity:1,stockCountersChanged:true,limitedIssueRecordsAdded:1,serial:r.serial,stock:ledger(s),craftCountsChanged:false,acquisitionRecords:1,auditRecords:1};
}
// Caller owns the transaction and holds all live USER_LOCK leases.
export async function grant(c,expected,{lockDeadline,leaseToken}={}){
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};validate(expected);
 assert(lockDeadline>Date.now()+20000,'Live account leases required');assert.match(leaseToken,/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const existing=await receipt(c);if(existing)return {replayed:true,receipt:existing,verification:await verify(c,existing)};
 const checkLeases=async()=>{assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,IDS.length);assert(lockDeadline>Date.now()+5000,'Lease nearing expiration');};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
 await checkLeases();assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,IDS.length);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[CODES]);
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 const before=await state(c);assert.equal(before.users.length,IDS.length);
 for(const t of PLAN.recipients){const u=one(before.users.filter(u=>u.id===t.id));for(const k of ['nickname','role','status','identityHash'])assert.equal(u[k],t[k],`Recipient ${t.id} ${k} changed`);assert.equal(u.status,'ACTIVE');}
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[])',[PLAN.recipients.map(u=>u.nickname)]);assert.equal(exact.length,IDS.length);for(const t of PLAN.recipients)assert.equal(one(exact.filter(u=>u.nickname===t.nickname)).id,t.id);
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Prior/orphan operation artifacts');
 one(await q(c,"SELECT id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'"));
 const stockBefore=ledger(before);assert.equal(stockBefore.limit,PLAN.stockLimit);assert(stockBefore.remaining>=1,'No remaining authorized stock');
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id LIKE $1 OR request_id=$2',[OP+':%',OP])).length,0,'Orphan issuance');
 const now=new Date().toISOString(),grants=[],acquisitions=[],serial=stockBefore.issued+1;
 for(const g of PLAN.grants){
  const old=before.cards.find(x=>String(x.user_id)===g.userId&&x.mercenary_code===g.code)||null,n=Number(old?.total_copies||0);assert(Number.isSafeInteger(n)&&n>=0&&n+g.quantity<2147483647);if(old)assert.equal(Number(old.duplicate_count),n-1);
  for(let i=0;i<g.quantity;i++){
   const oldStock=one(before.stock);
   one(await q(c,'UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2 WHERE code=$1 AND issued=$3 AND revision=$4 AND stock_limit=$5 AND issued<stock_limit RETURNING code',[g.code,OP,oldStock.issued,oldStock.revision,oldStock.stock_limit]));
   const holding=one(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[g.userId,g.code,now]));
   assert.equal(Number(holding.total_copies),n+i+1);assert.equal(Number(holding.duplicate_count),n+i);assert.equal(holding.first_obtained_at,old?.first_obtained_at||now);
   const id=aid(g,i);one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[id,g.userId,g.code,n+i>0?1:0,n+i+1,n+i,now]));acquisitions.push(id);
   one(await q(c,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[id,OP,g.userId,g.code,serial,now]));
  }
  grants.push({...g,copiesBefore:n,copiesAfter:n+g.quantity,holdingBefore:old});
 }
 const after=await state(c);assert.deepEqual(ledger(after),{limit:stockBefore.limit,issued:serial,remaining:stockBefore.remaining-1});
 assert.deepEqual(after.issues.filter(i=>i.request_id!==OP),before.issues);
 assert(BigInt(one(after.sync).domains.collection)>BigInt(one(before.sync).domains.collection||0));
 assert.deepEqual(protectedState(after),protectedState(before),'Protected counters/state changed');
 const others=cards=>cards.filter(x=>!PLAN.grants.some(g=>g.userId===String(x.user_id)&&g.code===x.mercenary_code));assert.deepEqual(others(after.cards),others(before.cards));
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',syncBefore:before.sync,syncAfter:after.sync,operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,grants,acquisitions,serial,stockBefore:before.stock,stockAfter:after.stock,issuesBefore:before.issues,issuesAfter:after.issues,craftBefore:before.craft,craftAfter:after.craft,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),preserved:{currency:true,stockLimit:true,priorNumberedIssues:true,craftCounts:true,packAndCraftSettings:true,otherCards:true,inventory:true,loadouts:true,levels:true,growth:true,accountSettings:true}};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_GROUP',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({holdings:grants.map(g=>({userId:g.userId,code:g.code,holding:g.holdingBefore})),protectedHash:r.protectedBeforeHash}),JSON.stringify(r)]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verification=await verify(c,r,{exact:true});await checkLeases();return {replayed:false,receipt:r,verification};
}
