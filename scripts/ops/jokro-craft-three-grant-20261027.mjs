import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './jokro-craft-three-grant-20261027.plan.json' with {type:'json'};
import {LIMITED_SHARD_CRAFTS} from '../../shared/mercenary-limited-shard-craft-v1.mjs';
import {MERCENARY_CRAFTS} from '../../shared/mercenary-craft-v1.mjs';
import {readLimitedShardCraftOwners} from '../../functions/_mercenary_craft_access.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
export const OPERATION_KEY=plan.operationKey,IDS=plan.targets.map(t=>t.id).sort((a,b)=>Number(a)-Number(b)),CODE='V-979',ACTION='OPS_JOKRO_CRAFT_STOCK_GRANT';
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex'),PLAN_HASH=hash(plan);
const definition=LIMITED_SHARD_CRAFTS.find(d=>d.code===CODE),q=async(c,sql,args=[])=>(await c.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const acquisitionId=id=>`${definition.prefix}:${id}:${OPERATION_KEY}`;
const settings=[...MERCENARY_CRAFTS.map(d=>d.key),'mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_blackcrown_ss_pack_v1'];
assert.deepEqual(IDS,['5','8','148']);assert.deepEqual(plan.targets.map(t=>t.nickname),['싸이타마','혜루','최성수']);assert.equal(plan.totalQuantity,3);assert.equal(plan.recipientCount,3);assert.equal(plan.stockPolicy,'CONSUME_LIMITED_SHARD_CRAFT_STOCK');assert.equal(plan.cost,0);assert.equal(plan.automaticLoadout,false);assert.equal(plan.sendMessage,false);assert.equal(plan.recipeCode,definition.recipeCode);
export async function inspect(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  loadouts:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  accountSettings:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key LIKE 'mercenary%:'||u.id::text||':%' OR key='mercenary_pvp_loadout_v1:'||u.id::text) ORDER BY key",
  policies:'SELECT key,value FROM app_meta WHERE key=ANY($2::text[]) ORDER BY key',
  recipes:"SELECT * FROM workshop_recipes_v1668 WHERE output_type='MERCENARY' AND output_ref=$3 ORDER BY id",
  materials:"SELECT m.* FROM workshop_recipe_materials_v1668 m JOIN workshop_recipes_v1668 r ON r.id=m.recipe_id WHERE r.output_type='MERCENARY' AND r.output_ref=$3 ORDER BY m.recipe_id,m.item_code",
  packStock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$3',
  packIssues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$3 ORDER BY serial',
  previousCraftLogs:"SELECT * FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=$3 AND request_id<>$4 ORDER BY id",
  logs:'SELECT * FROM workshop_craft_logs_v1668 WHERE request_id=$4 ORDER BY user_id',
  craftReceipts:'SELECT * FROM workshop_craft_receipts_v1668 WHERE request_id=$4 ORDER BY user_id',
  acquisitions:'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($5::text[]) ORDER BY user_id'
 };
 const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${arr(sql)}`).join(',')}) data`,[IDS,settings,CODE,OPERATION_KEY,IDS.map(acquisitionId)])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));
 const policy=JSON.parse(one(s.policies.filter(p=>p.key===plan.policyKey)).value),crafted=Number(one(await q(c,"SELECT COALESCE(SUM(output_quantity),0)::text crafted FROM workshop_craft_logs_v1668 WHERE recipe_id=$1 AND output_type='MERCENARY' AND output_ref=$2 AND success=1",[plan.recipeId,CODE])).crafted);
 s.stock={limit:policy.stockLimit,crafted,remaining:policy.stockLimit-crafted};
 const stored=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);s.receipt=stored.length?parse(one(stored).value):null;return s;
}
const protectedState=s=>Object.fromEntries(Object.entries(s).filter(([key])=>!['cards','sync','stock','receipt','logs','craftReceipts','acquisitions'].includes(key)));
export async function verify(c,receipt,{exact=false}={}){
 const s=await inspect(c);receipt??=s.receipt;assert(receipt);assert.deepEqual(s.receipt,receipt);assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.grants.length,3);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 assert.equal(receipt.stockBefore.limit,receipt.stockAfter.limit);assert.equal(receipt.stockAfter.crafted-receipt.stockBefore.crafted,3);assert.equal(receipt.stockBefore.remaining-receipt.stockAfter.remaining,3);
 assert.equal(s.logs.length,3);assert.equal(s.craftReceipts.length,3);assert.equal(s.acquisitions.length,3);
 for(const target of plan.targets){
  const grant=one(receipt.grants.filter(g=>g.userId===target.id)),holding=one(s.cards.filter(h=>String(h.user_id)===target.id&&h.mercenary_code===CODE)),log=one(s.logs.filter(l=>String(l.user_id)===target.id)),record=one(s.craftReceipts.filter(r=>String(r.user_id)===target.id)),acquisition=one(s.acquisitions.filter(a=>String(a.user_id)===target.id));
  assert.equal(grant.quantity,1);assert.equal(grant.after,grant.before+1);assert(Number(holding.total_copies)>=grant.after);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
  assert.equal(String(log.id),grant.craftLogId);assert.equal(Number(log.recipe_id),plan.recipeId);assert.equal(log.output_ref,CODE);assert.equal(Number(log.output_quantity),1);assert.equal(Number(log.success),1);assert.equal(log.payment_type,'ADMIN_GRANT');assert.equal(Number(log.coin_spent),0);assert.equal(Number(log.master_star_spent),0);
  assert.equal(record.status,'COMPLETED');assert.equal(Number(record.recipe_id),plan.recipeId);const result=parse(record.result_json);assert.equal(result.adminGrant,true);assert.equal(result.operationKey,OPERATION_KEY);assert.equal(result.output.quantity,1);assert.equal(result.output.ref,CODE);assert.equal(result.coinSpent,0);assert.equal(result.masterStarSpent,0);assert.equal(result.cardShardSpent,0);
  assert.equal(acquisition.acquisition_id,acquisitionId(target.id));assert.equal(acquisition.mercenary_code,CODE);assert.equal(Number(acquisition.total_copies_after),grant.after);assert.equal(Number(acquisition.duplicate_count_after),grant.before);
 }
 const env={DB:new __postgresCompatTest.PostgresD1Database({query:input=>c.query(input.text,input.values)})};assert.deepEqual([...await readLimitedShardCraftOwners(env,CODE,IDS)].sort((a,b)=>a-b),IDS.map(Number));
 assert(s.stock.crafted>=receipt.stockAfter.crafted&&s.stock.crafted<=s.stock.limit);
 if(exact){assert.deepEqual(s.stock,receipt.stockAfter);assert.equal(hash(protectedState(s)),receipt.protectedBefore);}
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]));assert.equal(audit.id,receipt.auditId);assert.equal(audit.admin_id,'1');const {auditId,...body}=receipt;assert.deepEqual(parse(audit.after_data),body);
 return {verified:true,grants:receipt.grants.map(g=>({userId:g.userId,nickname:g.nickname,quantity:g.quantity,before:g.before,after:g.after})),stock:s.stock,stockConsumed:3,combatEntitled:true,auditId:receipt.auditId};
}
// Caller owns a transaction and the live USER_LOCK plus DB leases for all targets.
export async function grant(c,{expectedPlanHash,leaseToken,lockDeadline}={}){
 assert.equal(expectedPlanHash,PLAN_HASH);
 const prior=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(prior.length){const receipt=parse(one(prior).value);return {replayed:true,receipt,verification:await verify(c,receipt)};}
 assert.match(leaseToken||'',/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'All account leases required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const checkLeases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OPERATION_KEY,Date.now()+5000])).length,IDS.length);};await checkLeases();
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,3);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[plan.policyKey]));
 one(await q(c,'SELECT id FROM workshop_recipes_v1668 WHERE id=$1 AND code=$2 AND output_ref=$3 FOR SHARE',[plan.recipeId,plan.recipeCode,CODE]));
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 const prerequisite=parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[plan.prerequisiteOperation])).value);assert.equal(prerequisite.status,'COMPLETED');assert.equal(prerequisite.totalAdded,60);assert.equal(one(prerequisite.rows.filter(r=>r.code===CODE)).after.stockLimit,15);
 const before=await inspect(c);assert.equal(before.receipt,null);for(const key of ['logs','craftReceipts','acquisitions'])assert.equal(before[key].length,0,'Existing operation artifact');
 assert.equal(hash(one(before.policies.filter(p=>p.key===plan.policyKey)).value),plan.policyHash,'Jokro craft policy changed');assert.equal(before.stock.limit,plan.stockLimit);assert(before.stock.crafted>=plan.selectedIssued);assert(before.stock.remaining>=3,'Insufficient remaining Jokro craft stock');
 assert.equal(before.users.length,3);for(const target of plan.targets){const user=one(before.users.filter(u=>u.id===target.id));for(const key of ['nickname','role','status','identityHash'])assert.equal(user[key],target[key],'Recipient changed: '+target.id+' '+key);}
 const exactUsers=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[])',[plan.targets.map(t=>t.nickname)]);assert.equal(exactUsers.length,3);for(const target of plan.targets)assert.equal(one(exactUsers.filter(u=>u.nickname===target.nickname)).id,target.id);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const now=new Date().toISOString(),grants=[];
 for(const target of plan.targets){
  const old=before.cards.find(h=>String(h.user_id)===target.id&&h.mercenary_code===CODE),copies=Number(old?.total_copies||0);assert(Number.isSafeInteger(copies)&&copies>=0&&copies<2147483646);if(old)assert.equal(Number(old.duplicate_count),copies-1);
  const holding=one(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[target.id,CODE,now]));assert.equal(Number(holding.total_copies),copies+1);assert.equal(holding.first_obtained_at,old?.first_obtained_at||now);
  await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[acquisitionId(target.id),target.id,CODE,copies?1:0,copies+1,copies,now]);
  const result={ok:true,requestId:OPERATION_KEY,operationKey:OPERATION_KEY,adminGrant:true,reason:'운영자 지정 지급 · SSS 리미티드 조각 제작 한도 1장 사용',recipeId:plan.recipeId,recipeName:definition.name,category:'MERCENARY_CRAFT',attempts:1,successCount:1,failureCount:0,success:true,paymentType:'ADMIN_GRANT',coinSpent:0,masterStarSpent:0,cardShardSpent:0,materialsConsumed:[],output:{type:'MERCENARY',ref:CODE,name:definition.art.name,image:definition.art.sourceArt,rarity:'SSS LIMITED',quantity:1}};
  await q(c,"INSERT INTO workshop_craft_receipts_v1668(request_id,user_id,recipe_id,payment_type,status,result_json,created_at,updated_at) VALUES($1,$2,$3,'ADMIN_GRANT','COMPLETED',$4,$5,$5)",[OPERATION_KEY,target.id,plan.recipeId,JSON.stringify(result),now]);
  const log=one(await q(c,"INSERT INTO workshop_craft_logs_v1668(request_id,user_id,recipe_id,recipe_name,category,output_type,output_ref,output_quantity,payment_type,coin_spent,master_star_spent,success,created_at) VALUES($1,$2,$3,$4,'MERCENARY_CRAFT','MERCENARY',$5,1,'ADMIN_GRANT',0,0,1,$6) RETURNING id::text",[OPERATION_KEY,target.id,plan.recipeId,definition.name,CODE,now]));
  grants.push({userId:target.id,nickname:target.nickname,code:CODE,quantity:1,before:copies,after:copies+1,acquisitionId:acquisitionId(target.id),craftLogId:log.id});
 }
 const after=await inspect(c);assert.equal(hash(protectedState(after)),hash(protectedState(before)));assert.equal(after.stock.crafted,before.stock.crafted+3);assert.equal(after.stock.remaining,before.stock.remaining-3);assert.equal(after.stock.limit,before.stock.limit);
 assert.deepEqual(after.cards.filter(h=>h.mercenary_code!==CODE),before.cards.filter(h=>h.mercenary_code!==CODE));
 for(const id of IDS){const old=one(before.sync.filter(s=>s.user_id===id)),current=one(after.sync.filter(s=>s.user_id===id));assert(BigInt(current.domains.collection)>BigInt(old.domains.collection||0));}
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:plan.authorization,completedAt:now,grants,stockPolicy:plan.stockPolicy,stockBefore:before.stock,stockAfter:after.stock,protectedBefore:hash(protectedState(before)),protectedAfter:hash(protectedState(after)),syncBefore:before.sync,syncAfter:after.sync,cost:0,automaticLoadout:false,messagesSent:0};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_GROUP',$2,$3,$4) RETURNING id::text",[ACTION,OPERATION_KEY,JSON.stringify({stock:before.stock,protectedHash:receipt.protectedBefore,holdings:grants.map(g=>({userId:g.userId,before:g.before}))}),JSON.stringify(receipt)]));receipt.auditId=audit.id;
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);await checkLeases();
 return {replayed:false,receipt,verification:await verify(c,receipt,{exact:true})};
}
