import assert from 'node:assert/strict';
import {OP,IDS,hash,parse,stateOf,planRollback} from './rollback-plan.mjs';
export {OP,IDS,hash,planRollback};
const ACTION='OPS_MERCENARY_XP_TRANSFER_ROLLBACK';
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const settings=['mercenary_level_policy_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_limited_pack_v1','mercenary_halloween_ss_pack_v1'];
export async function snapshot(c){
 const fields={
  users:['SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[IDS]],
  operations:["SELECT * FROM joint_operations_v1 WHERE user_id=ANY($1::bigint[]) AND kind='MERCENARY_LEVEL_V1' ORDER BY created_at,request_id",[IDS]],
  levels:['SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[IDS]],
  memory:["SELECT key,value,updated_at FROM app_meta WHERE key LIKE 'mercenary_experience_transfer_v1:%' ORDER BY key",[]],
  item:["SELECT * FROM inventory_items WHERE code='MERCENARY_XP_TRANSFER_POTION'",[]],
  inventory:["SELECT * FROM cnine_user_inventory WHERE item_code='MERCENARY_XP_TRANSFER_POTION' ORDER BY user_id",[]],
  itemLogs:["SELECT * FROM inventory_logs WHERE item_code='MERCENARY_XP_TRANSFER_POTION' ORDER BY id",[]],
  cards:['SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[IDS]],
  allInventory:['SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',[IDS]],
  loadouts:['SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[IDS]],
  growth:['SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[IDS]],
  settings:['SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]],
  stock:['SELECT * FROM mercenary_limited_stock_v1 ORDER BY code',[]],
  sync:['SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[IDS]]
 };
 const s={};for(const [key,args] of Object.entries(fields))s[key]=await q(c,...args);return JSON.parse(JSON.stringify(s));
}
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),acquisitions:await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%']),audit:await q(c,'SELECT id::text,admin_id::text,before_data,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])};}
const protectedPart=(s,p)=>({
 users:s.users,allInventory:s.allInventory,loadouts:s.loadouts,growth:s.growth,settings:s.settings,stock:s.stock,item:s.item,itemLogs:s.itemLogs,
 cards:s.cards.filter(c=>!p.refunds.some(r=>r.userId===String(c.user_id)&&r.code===c.mercenary_code)),
 levels:s.levels.filter(c=>!p.restores.some(r=>r.userId===String(c.user_id)&&r.code===c.mercenary_code)),
 operations:s.operations.filter(r=>!p.restores.some(p=>p.operations.some(o=>o.request_id===r.request_id))),
 memory:s.memory.filter(r=>!p.memories.some(m=>m.key===r.key))
});
export async function verify(c,r,{exact=false}={}){
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,hash(r.plan));assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await snapshot(c),a=await artifacts(c),p=r.plan;assert.equal(a.audit.length,1);assert.equal(a.audit[0].id,r.auditId);
 assert.equal(a.acquisitions.length,p.refunds.reduce((n,v)=>n+v.quantity,0));
 for(const restore of p.restores){
  const live=one(s.levels.filter(l=>String(l.user_id)===restore.userId&&l.mercenary_code===restore.code));
  assert(Number(live.revision)>=restore.restored.revision);if(exact)assert.deepEqual(stateOf(live),restore.restored);
  for(const original of restore.operations){const current=one(s.operations.filter(o=>o.request_id===original.request_id));assert.deepEqual(current,{...original,status:'CANCELLED'});}
 }
 for(const refund of r.refunds){
  const holding=one(s.cards.filter(x=>String(x.user_id)===refund.userId&&x.mercenary_code===refund.code));assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);if(exact)assert.equal(Number(holding.total_copies),refund.after);
  const acq=a.acquisitions.filter(x=>String(x.user_id)===refund.userId&&x.mercenary_code===refund.code);assert.equal(acq.length,refund.quantity);
  for(let i=1;i<=refund.quantity;i++){const row=one(acq.filter(x=>x.acquisition_id===OP+':'+refund.userId+':'+refund.code+':'+i));assert.equal(Number(row.total_copies_after),refund.before+i);assert.equal(Number(row.duplicate_count_after),refund.before+i-1);assert.equal(Number(row.is_duplicate),1);}
 }
 for(const m of p.memories){const current=parse(one(s.memory.filter(r=>r.key===m.key)).value);assert(current.revision>=m.after.revision);if(exact)assert.deepEqual(current,m.after);}
 if(exact){assert.equal(hash(protectedPart(s,p)),r.protectedBeforeHash);for(const uid of IDS){const old=one(r.syncBefore.filter(x=>x.user_id===uid)),now=one(s.sync.filter(x=>x.user_id===uid));assert(BigInt(now.domains.collection)>BigInt(old.domains.collection));}}
 return {status:'VERIFIED',accounts:IDS.length,mercenaries:p.restores.length,transfers:p.transfers,cancelledOperations:p.restores.reduce((n,v)=>n+v.operations.length,0),refundedCards:p.refunds.reduce((n,v)=>n+v.quantity,0),auditId:r.auditId,unrelatedStatePreserved:true};
}
// Caller must own a transaction and both live account locks and DB fallback leases.
export async function rollback(c,plan,{leaseToken,lockDeadline}={}){
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.equal(plan.operationKey,OP);assert.deepEqual(plan.ids,IDS);assert.match(leaseToken,/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const check=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,IDS.length);};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);await check();
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,IDS.length);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[plan.memories.map(r=>r.key)]);
 const before=await snapshot(c);assert.equal(hash(planRollback(before)),hash(plan),'Reviewed rollback plan changed');
 const priorArtifacts=await artifacts(c);assert.equal(priorArtifacts.receipt,null);assert.equal(priorArtifacts.acquisitions.length,0);assert.equal(priorArtifacts.audit.length,0);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'"));
 const now=new Date().toISOString(),restores=plan.restores.map(r=>({uid:r.userId,code:r.code,level:r.restored.level===21?20:r.restored.level,xp:r.restored.experience,mask:r.restored.breakthroughMask,revision:r.restored.revision,old_revision:r.current.revision}));
 assert.equal((await q(c,`UPDATE user_mercenary_levels_v1 l SET level=p.level,experience=p.xp,breakthrough_mask=p.mask,revision=p.revision,updated_at=$2 FROM jsonb_to_recordset($1::jsonb) AS p(uid bigint,code text,level integer,xp bigint,mask integer,revision integer,old_revision integer) WHERE l.user_id=p.uid AND l.mercenary_code=p.code AND l.revision=p.old_revision RETURNING l.user_id`,[JSON.stringify(restores),now])).length,restores.length);
 const operationIds=plan.restores.flatMap(r=>r.operations.map(o=>o.request_id));
 assert.equal((await q(c,"UPDATE joint_operations_v1 SET status='CANCELLED' WHERE request_id=ANY($1::text[]) AND status IN ('COMPLETED','PENDING') RETURNING request_id",[operationIds])).length,operationIds.length);
 const memories=plan.memories.map(m=>({key:m.key,old:m.before,value:JSON.stringify(m.after)}));
 assert.equal((await q(c,'UPDATE app_meta m SET value=p.value,updated_at=$2 FROM jsonb_to_recordset($1::jsonb) AS p(key text,old text,value text) WHERE m.key=p.key AND m.value=p.old RETURNING m.key',[JSON.stringify(memories),now])).length,memories.length);
 const refunds=plan.refunds.map(r=>{const h=one(before.cards.filter(c=>String(c.user_id)===r.userId&&c.mercenary_code===r.code)),n=Number(h.total_copies);assert(Number.isSafeInteger(n)&&n>0&&n+r.quantity<2147483647);assert.equal(Number(h.duplicate_count),n-1);return {...r,before:n,after:n+r.quantity};});
 const credits=JSON.stringify(refunds.map(r=>({uid:r.userId,code:r.code,quantity:r.quantity,before:r.before,after:r.after})));
 assert.equal((await q(c,`UPDATE user_mercenary_cards_v1 c SET total_copies=p.after,duplicate_count=p.after-1,last_obtained_at=$2 FROM jsonb_to_recordset($1::jsonb) AS p(uid bigint,code text,quantity integer,before integer,after integer) WHERE c.user_id=p.uid AND c.mercenary_code=p.code AND c.total_copies=p.before RETURNING c.user_id`,[credits,now])).length,refunds.length);
 const expectedAcq=refunds.reduce((n,r)=>n+r.quantity,0);
 assert.equal((await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT $2||':'||p.uid::text||':'||p.code||':'||n::text,p.uid,p.code,1,p.before+n,p.before+n-1,$3 FROM jsonb_to_recordset($1::jsonb) AS p(uid bigint,code text,quantity integer,before integer,after integer) CROSS JOIN LATERAL generate_series(1,p.quantity) n RETURNING acquisition_id`,[credits,OP,now])).length,expectedAcq);
 // Level-only restores must also invalidate every active client collection cache.
 await q(c,"UPDATE account_sync_versions_v1 SET revision=revision+1,domains=jsonb_set(domains,'{collection}',to_jsonb((COALESCE(domains->>'collection','0')::bigint+1)::text)) WHERE user_id=ANY($1::bigint[])",[IDS]);
 const after=await snapshot(c),protectedBeforeHash=hash(protectedPart(before,plan));assert.equal(hash(protectedPart(after,plan)),protectedBeforeHash);
 const r={status:'COMPLETED',operationKey:OP,planHash:hash(plan),plan,completedAt:now,refunds,syncBefore:before.sync,syncAfter:after.sync,protectedBeforeHash,protectedAfterHash:hash(protectedPart(after,plan))};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_GROUP',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({levels:before.levels.filter(l=>restores.some(r=>String(l.user_id)===r.uid&&l.mercenary_code===r.code)),memory:before.memory,refundHoldings:before.cards.filter(l=>refunds.some(r=>String(l.user_id)===r.userId&&l.mercenary_code===r.code))}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verification=await verify(c,r,{exact:true});await check();return {replayed:false,receipt:r,verification};
}
