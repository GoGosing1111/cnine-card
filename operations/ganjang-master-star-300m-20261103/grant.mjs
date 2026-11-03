import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
export const PLAN=plan,OP='ops:ganjang-master-star-300m:20261103:v1',IDS=['4981'],AMOUNT='300000000';
export const ACTION='OPS_GANJANG_MASTER_STAR_GRANT',REASON='운영자 지정 지급 · 마스터의 별 3억 · '+OP,REF='OPS_DIRECT_MASTER_STAR';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH='930f2035a921d3bf75631967baf753ed5be09721c6c9cf50fc8c07a39b80c67b';
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(PLAN.operationKey,OP);assert.equal(PLAN.itemCode,'MASTER_STAR');assert.equal(PLAN.amount,AMOUNT);assert.equal(PLAN.delivery,'DIRECT');assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.recipientCount,1);
 assert.equal(PLAN.recipients.length,1);assert.equal(PLAN.recipients[0].userId,'4981');assert.equal(PLAN.recipients[0].nickname,'간장왕대게찜');
}
export async function state(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  inventory:'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  loadouts:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  rank:'SELECT user_id::text,total_ticks::text,updated_at FROM account_rank_progress_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  accounting:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key='support_package_coin_v1:'||u.id::text OR key='mercenary_pvp_loadout_v1:'||u.id::text OR key='ranked_series_roster_v1:'||u.id::text) ORDER BY key"
 };
 const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) data`,[IDS])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
export const protectedState=s=>({...s,inventory:s.inventory.filter(i=>i.item_code!=='MASTER_STAR'),sync:undefined});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),logs:await q(c,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text,created_at FROM inventory_logs WHERE id>$1::bigint AND user_id=ANY($2::bigint[]) AND reference_id=$3 ORDER BY id',[PLAN.logFloor.inventory,IDS,OP]),audits:await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE id>$1::bigint AND action_type=$2 AND target_id=$3 ORDER BY id',[PLAN.logFloor.audit,ACTION,OP])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);assert.equal(r.grants.length,1);
 const a=await artifacts(c);assert.deepEqual(a.receipt,r);const g=one(r.grants),log=one(a.logs),audit=one(a.audits);
 assert.equal(g.userId,'4981');assert.equal(g.nickname,'간장왕대게찜');assert.equal(g.amount,AMOUNT);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(AMOUNT));assert.equal(BigInt(g.unseenAfter)-BigInt(g.unseenBefore),BigInt(AMOUNT));
 assert.equal(log.id,g.logId);assert.equal(log.user_id,g.userId);assert.equal(log.item_code,'MASTER_STAR');assert.equal(log.change_amount,AMOUNT);assert.equal(log.balance_after,g.after);assert.equal(log.reason,REASON);assert.equal(log.reference_type,REF);assert.equal(log.reference_id,OP);assert.equal(log.admin_id,'1');assert.equal(log.created_at,r.completedAt);
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...body}=r;assert.deepEqual(parse(audit.after_data),body);
 if(exact){const s=await state(c),i=one(s.inventory.filter(i=>i.item_code==='MASTER_STAR'));assert.equal(i.quantity,g.after);assert.equal(i.unseen_quantity,g.unseenAfter);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);}
 return {verified:true,recipients:1,itemCode:'MASTER_STAR',amount:AMOUNT,inventoryLogs:1,auditRecords:1,auditId:r.auditId,completedAt:r.completedAt};
}
// Caller owns the transaction, live USER_LOCK and database lease.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate();assert.equal(expected,HASH);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(leaseToken||'',/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account leases required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const leases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,1,'Missing account lease');};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);one(await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]));await leases();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);await q(c,'SELECT user_id FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code FOR UPDATE',[IDS]);
 const before=await state(c),target=one(PLAN.recipients),u=one(before.users);assert.equal(u.id,target.userId);for(const k of ['nickname','role','status','identityHash'])assert.equal(u[k],target[k],`Recipient ${k} changed`);assert.equal(u.status,'ACTIVE');
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[target.nickname])).id,target.userId);one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 one(await q(c,"SELECT code FROM inventory_items WHERE code='MASTER_STAR' AND name='마스터의 별' AND is_active=1 FOR SHARE"));
 const prior=await artifacts(c);assert.equal(prior.receipt,null);assert.equal(prior.logs.length,0);assert.equal(prior.audits.length,0);
 const old=before.inventory.find(i=>i.item_code==='MASTER_STAR');for(const k of ['quantity','unseen_quantity'])assert(BigInt(old?.[k]??0)>=0n&&BigInt(old?.[k]??0)+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported resulting balance');
 const now=new Date().toISOString();
 const next=one(await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES($1,'MASTER_STAR',$2,$2,$3,$3)
 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
 WHERE cnine_user_inventory.quantity=$4::bigint AND cnine_user_inventory.unseen_quantity=$5::bigint RETURNING quantity::text,unseen_quantity::text,created_at`,[target.userId,AMOUNT,now,old?.quantity??'0',old?.unseen_quantity??'0']));
 if(old)assert.equal(next.created_at,old.created_at);
 const log=one(await q(c,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) VALUES($1,'MASTER_STAR',$2,$3,$4,$5,$6,1,$7) RETURNING id::text",[target.userId,AMOUNT,next.quantity,REASON,REF,OP,now]));
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before),'Unrelated state changed');
 const b=one(before.sync),a=one(after.sync);assert.equal(BigInt(a.revision),BigInt(b.revision)+1n,'Inventory sync must advance exactly once');assert.equal(a.domains.inventory,a.revision);assert.deepEqual({...a.domains,inventory:undefined},{...b.domains,inventory:undefined});
 const grants=[{userId:target.userId,nickname:target.nickname,amount:AMOUNT,before:old?.quantity??'0',after:next.quantity,unseenBefore:old?.unseen_quantity??'0',unseenAfter:next.unseen_quantity,logId:log.id}];
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,grants,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:before.sync,syncAfter:after.sync,messagesSent:0};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({masterStarsBefore:grants[0].before,protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await leases();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
