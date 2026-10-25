import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_SHARD_CRAFTS} from '../../shared/mercenary-limited-shard-craft-v1.mjs';
import {readMercenaryCraft,readMercenaryCraftStock,decorateMercenaryCraft} from '../../functions/_mercenary_craft.js';
import {jinmuAccountAllowed} from '../../shared/mercenary-jinmu-v1.mjs';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export const OP='ops:parksera-jinmu-limited-shard:20261025:v1';
export const ACTION='OPS_MERCENARY_EXEMPT_GRANT';
export const TARGET=Object.freeze({id:45,nickname:'박세라-ㅂ-'});
export const DEFINITION=LIMITED_SHARD_CRAFTS.find(d=>d.code==='V-989');
export const ACQUISITION=`${OP}:${TARGET.id}:${DEFINITION.code}:1`;
const query=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const env=c=>({DB:new __postgresCompatTest.PostgresD1Database({query:input=>c.query(input)})});
export async function receipt(c){const rows=await query(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function inspect(c){
 const e=env(c),saved=await readMercenaryCraft(e,DEFINITION);
 return {
  users:await query(c,'SELECT id::text,nickname,status,role FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]),
  holding:await query(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,DEFINITION.code]),
  policy:saved.policy,rawPolicy:saved.value,stock:await readMercenaryCraftStock(e,DEFINITION,saved.policy),
  recipe:await query(c,'SELECT * FROM workshop_recipes_v1668 WHERE code=$1',[DEFINITION.recipeCode]),
  ledger:await query(c,'SELECT * FROM workshop_craft_logs_v1668 WHERE request_id=$1',[OP]),
  craftReceipt:await query(c,'SELECT * FROM workshop_craft_receipts_v1668 WHERE request_id=$1',[OP]),
  acquisition:await query(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[ACQUISITION]),
  audits:await query(c,'SELECT id::text FROM admin_logs WHERE target_id=$1',[OP]),
  operation:await receipt(c)
 };
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
  settings:"SELECT key,value FROM app_meta WHERE key IN ('mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_bloodmoon_pack_v1','mercenary_kairon_craft_v1','mercenary_jokro_craft_v1','mercenary_pvp_loadout_v1:'||$1::text) ORDER BY key"
 };
 const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
 return one(await query(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${arr(sql)}`).join(',')}) data`,[TARGET.id,DEFINITION.code])).data;
}
export async function verify(c,r=undefined){
 r??=await receipt(c);assert.equal(r?.operationKey,OP);assert.equal(r.status,'COMPLETED');
 assert.equal(r.grant.quantity,1);assert.equal(r.grant.userId,TARGET.id);assert.equal(r.grant.code,DEFINITION.code);
 assert.equal(r.stockPolicy,'EXEMPT_NO_COUNTER_CHANGE');assert.deepEqual(r.stockAfter,r.stockBefore);
 assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const state=await inspect(c),h=one(state.holding),a=one(state.acquisition);
 assert(Number(h.total_copies)>=r.grant.after);assert.equal(Number(h.duplicate_count),Number(h.total_copies)-1);
 assert.equal(state.ledger.length,0);assert.equal(state.craftReceipt.length,0);
 assert.equal(Number(a.user_id),TARGET.id);assert.equal(a.mercenary_code,DEFINITION.code);assert.equal(Number(a.total_copies_after),r.grant.after);
 assert(jinmuAccountAllowed(TARGET.id,DEFINITION.code),'Jinmu battle entitlement required');
 const row=(await decorateMercenaryCraft(env(c),[],{admin:true})).find(row=>row.code===DEFINITION.recipeCode);
 assert.equal(row.craftStock.crafted,state.stock.crafted);assert(state.stock.crafted>=r.stockAfter.crafted);
 const audit=one(await query(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 return {verified:true,account:TARGET,granted:1,held:Number(h.total_copies),stock:state.stock,craftLocked:row.craftLocked,combatEntitled:true,auditId:r.auditId,acquisitionId:ACQUISITION};
}
// Caller owns a transaction plus the live USER_LOCK and fallback account lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(leaseToken,/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Account lease required');
 await query(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const again=await receipt(c);if(again)return {replayed:true,receipt:again,verification:await verify(c,again)};
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await query(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[TARGET.id,leaseToken,OP,Date.now()+5000]));};
 await lease();
 await query(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=$1 FOR UPDATE',[TARGET.id]);
 one(await query(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
 await query(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[TARGET.id,DEFINITION.code]);
 await query(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[DEFINITION.code]);
 // Read-lock the existing policy while proving that this exempt gift leaves stock unchanged.
 await query(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[DEFINITION.key]);
 const before=await inspect(c),protectedBefore=await protectedState(c),u=one(before.users);
 assert.equal(Number(u.id),TARGET.id);assert.equal(u.nickname,TARGET.nickname);assert.equal(u.status,'ACTIVE');
 one(await query(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 for(const key of ['ledger','craftReceipt','acquisition','audits'])assert.equal(before[key].length,0,'Existing/orphan operation artifact');
 assert.equal(before.operation,null);assert(before.recipe.length<=1);
 const now=new Date().toISOString(),n=Number(before.holding[0]?.total_copies||0);assert(Number.isSafeInteger(n)&&n>=0&&n<2147483646);
 if(before.holding.length)assert.equal(Number(one(before.holding).duplicate_count),n-1);
 const holding=one(await query(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
  ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,DEFINITION.code,now]));assert.equal(Number(holding.total_copies),n+1);
 one(await query(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[ACQUISITION,TARGET.id,DEFINITION.code,n?1:0,n+1,n,now]));
 const after=await inspect(c),protectedAfter=await protectedState(c);assert.deepEqual(protectedAfter,protectedBefore);assert.deepEqual(after.policy,before.policy);
 assert.deepEqual(after.stock,before.stock);assert.deepEqual(after.rawPolicy,before.rawPolicy);assert.deepEqual(after.recipe,before.recipe);
 const r={status:'COMPLETED',operationKey:OP,actor:'CODEX_OPERATIONS',authorization:'박세라-ㅂ- 계정에 진무 지급. 후속 지시: 한도상관없이 1장 지급',completedAt:now,grant:{userId:TARGET.id,nickname:TARGET.nickname,code:DEFINITION.code,name:DEFINITION.art.name,quantity:1,before:n,after:n+1,acquisitionId:ACQUISITION},stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',stockBefore:before.stock,stockAfter:after.stock,policyHash:hash(before.policy),protectedBeforeHash:hash(protectedBefore),protectedAfterHash:hash(protectedAfter),preserved:{wallet:true,inventory:true,otherCards:true,loadout:true,growth:true,packStock:true,craftStock:true,craftConditions:true},automaticEquip:false};
 r.auditId=one(await query(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({operationKey:OP,holding:before.holding,stock:before.stock,protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await query(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 await lease();return {replayed:false,receipt:r,verification:await verify(c,r)};
}
