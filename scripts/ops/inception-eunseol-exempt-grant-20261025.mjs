import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_SHARD_CRAFTS} from '../../shared/mercenary-limited-shard-craft-v1.mjs';
import {readMercenaryCraft,readMercenaryCraftStock} from '../../functions/_mercenary_craft.js';
import {BLOODMOON_PACK_KEY} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export const OP='ops:inception-eunseol-exempt-grant:20261025:v1';
export const ACTION='OPS_MERCENARY_EXEMPT_GRANT';
export const AUTHORIZATION='Inception 계정에 은설 수량차감없이 지급해';
export const TARGET=Object.freeze({id:2,nickname:'Inception',role:'OWNER',status:'ACTIVE',identityHash:'e9508363ca4b1bb1eb2de9c933539a931115093b50ef32b7fccc258503cfc242'});
export const DEFINITION=LIMITED_SHARD_CRAFTS.find(d=>d.code==='V-973');
export const ACQUISITION=`${OP}:${TARGET.id}:${DEFINITION.code}:1`;
const SETTINGS=[BLOODMOON_PACK_KEY,DEFINITION.key,'mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_prime_craft_v1'];
const query=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const env=c=>({DB:new __postgresCompatTest.PostgresD1Database({query:input=>c.query(input)})});
export async function receipt(c){const rows=await query(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function inspect(c){
 const saved=await readMercenaryCraft(env(c),DEFINITION);
 const users=(await query(c,'SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 ORDER BY u.id',[TARGET.id,TARGET.nickname])).map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));
 return {users,holding:await query(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,DEFINITION.code]),
  policy:saved.policy,rawPolicy:saved.value,stock:await readMercenaryCraftStock(env(c),DEFINITION,saved.policy),
  packStock:await query(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[DEFINITION.code]),
  packIssues:await query(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[DEFINITION.code]),
  recipe:await query(c,'SELECT * FROM workshop_recipes_v1668 WHERE code=$1',[DEFINITION.recipeCode]),
  ledger:await query(c,'SELECT * FROM workshop_craft_logs_v1668 WHERE request_id=$1',[OP]),
  craftReceipt:await query(c,'SELECT * FROM workshop_craft_receipts_v1668 WHERE request_id=$1',[OP]),
  acquisition:await query(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[ACQUISITION]),
  audits:await query(c,'SELECT id::text FROM admin_logs WHERE target_id=$1',[OP]),operation:await receipt(c)};
}
export async function protectedState(c){
 const fields={
  wallet:'SELECT id,coin,card_shards,magic_crystals FROM users WHERE id=$1',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 ORDER BY mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',
  packStock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$2',
  packIssues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$2 ORDER BY serial',
  craftLogs:"SELECT * FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=$2 ORDER BY request_id",
  recipe:'SELECT * FROM workshop_recipes_v1668 WHERE output_ref=$2 ORDER BY id',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  accountSettings:"SELECT key,value FROM app_meta WHERE key LIKE 'mercenary%:'||$1::text||':%' OR key='mercenary_pvp_loadout_v1:'||$1::text OR key='mercenary_halloween_ss_once_v1:'||$1::text OR key='ranked_series_roster_v1:'||$1::text ORDER BY key"
 };
 const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
 return one(await query(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${arr(sql)}`).join(',')}) data`,[TARGET.id,DEFINITION.code,SETTINGS])).data;
}
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.operationKey,OP);assert.equal(r.status,'COMPLETED');assert.equal(r.authorization,AUTHORIZATION);
 assert.equal(r.grant.quantity,1);assert.equal(r.grant.userId,TARGET.id);assert.equal(r.grant.code,DEFINITION.code);assert.equal(r.grant.after,r.grant.before+1);
 assert.equal(r.stockPolicy,'EXEMPT_NO_COUNTER_CHANGE');assert.equal(r.cost,0);assert.equal(r.automaticEquip,false);assert.equal(r.purchaseCountDelta,0);
 assert.deepEqual(r.stockAfter,r.stockBefore);assert.deepEqual(r.packStockAfter,r.packStockBefore);assert.deepEqual(r.packIssuesAfter,r.packIssuesBefore);
 assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await inspect(c),h=one(s.holding),a=one(s.acquisition);
 assert(Number(h.total_copies)>=r.grant.after);assert.equal(Number(h.duplicate_count),Number(h.total_copies)-1);
 assert.equal(Number(a.user_id),TARGET.id);assert.equal(a.mercenary_code,DEFINITION.code);assert.equal(Number(a.total_copies_after),r.grant.after);assert.equal(Number(a.duplicate_count_after),r.grant.before);assert.equal(Number(a.is_duplicate),r.grant.before>0?1:0);assert.equal(a.created_at,r.completedAt);
 assert.equal(s.ledger.length,0);assert.equal(s.craftReceipt.length,0);assert.equal(s.audits.length,1);
 assert.equal((await query(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1 OR request_id=$2',[ACQUISITION,OP])).length,0);
 const audit=one(await query(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 if(exact){assert.equal(Number(h.total_copies),r.grant.after);assert.deepEqual(s.packStock,r.packStockAfter);assert.deepEqual(s.packIssues,r.packIssuesAfter);assert.deepEqual(s.stock,r.stockAfter);assert.equal(hash(await protectedState(c)),r.protectedAfterHash);}
 const pack=one(s.packStock);
 return {verified:true,userId:TARGET.id,nickname:TARGET.nickname,code:DEFINITION.code,name:'은설',granted:1,held:Number(h.total_copies),stockPolicy:r.stockPolicy,limitedIssueRecordsAdded:0,craftLedgerRecordsAdded:0,pack:{limit:Number(pack.stock_limit),issued:Number(pack.issued),remaining:Number(pack.stock_limit)-Number(pack.issued)},craftStock:s.stock,auditId:r.auditId,acquisitionId:ACQUISITION};
}
// Caller owns one transaction and holds both the live USER_LOCK and fallback lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(leaseToken,/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Account lease required');
 await query(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const again=await receipt(c);if(again)return {replayed:true,receipt:again,verification:await verify(c,again)};
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await query(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[TARGET.id,leaseToken,OP,Date.now()+5000]));};
 await lease();
 await query(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=$1 FOR UPDATE',[TARGET.id]);
 one(await query(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
 await query(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
 await query(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[TARGET.id,DEFINITION.code]);
 await query(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[DEFINITION.code]);
 await query(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 const before=await inspect(c),protectedBefore=await protectedState(c),u=one(before.users);
 assert.equal(Number(u.id),TARGET.id);for(const key of ['nickname','role','status','identityHash'])assert.equal(u[key],TARGET[key],'Target identity changed');
 one(await query(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 assert.equal(DEFINITION.art.name,'은설');assert.equal(DEFINITION.art.rank,'SSS');assert.equal(DEFINITION.art.edition,'LIMITED');
 for(const key of ['ledger','craftReceipt','acquisition','audits'])assert.equal(before[key].length,0,'Existing/orphan operation artifact');assert.equal(before.operation,null);
 const now=new Date().toISOString(),old=before.holding[0]||null,n=Number(old?.total_copies||0);assert(Number.isSafeInteger(n)&&n>=0&&n<2147483646);
 if(old)assert.equal(Number(old.duplicate_count),n-1);
 const holding=one(await query(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
  ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,DEFINITION.code,now]));
 assert.equal(Number(holding.total_copies),n+1);assert.equal(Number(holding.duplicate_count),n);assert.equal(holding.first_obtained_at,old?.first_obtained_at||now);
 one(await query(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[ACQUISITION,TARGET.id,DEFINITION.code,n?1:0,n+1,n,now]));
 const after=await inspect(c),protectedAfter=await protectedState(c);assert.deepEqual(protectedAfter,protectedBefore);assert.deepEqual(after.policy,before.policy);assert.deepEqual(after.stock,before.stock);assert.deepEqual(after.rawPolicy,before.rawPolicy);assert.deepEqual(after.recipe,before.recipe);
 const r={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:now,grant:{userId:TARGET.id,nickname:TARGET.nickname,code:DEFINITION.code,name:'은설',quantity:1,before:n,after:n+1,acquisitionId:ACQUISITION},stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',cost:0,purchaseCountDelta:0,automaticEquip:false,stockBefore:before.stock,stockAfter:after.stock,packStockBefore:before.packStock,packStockAfter:after.packStock,packIssuesBefore:before.packIssues,packIssuesAfter:after.packIssues,protectedBeforeHash:hash(protectedBefore),protectedAfterHash:hash(protectedAfter),preserved:{wallet:true,inventory:true,otherCards:true,loadout:true,growth:true,packStock:true,craftStock:true,craftConditions:true,packSettings:true,purchaseCounts:true}};
 r.auditId=one(await query(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({operationKey:OP,holding:before.holding,stock:before.stock,packStock:before.packStock,protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await query(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
