import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OP='ops:eumsooni-sss-limited-shard30:20261026:v1',IDS=['65'],ACTION='OPS_CRAFT_MATERIALS_GRANT';
export const TARGET={id:65,nickname:'음순이',role:'USER',status:'ACTIVE',identityHash:'2f77e6e1664c782d529261c6fe33038227b5a88eba0f86f414eb5a0f6bba0cc3'};
export const PLAN={operationKey:OP,authorization:'음순이 계정에 sss리미티드 조각 30개 지급해',target:TARGET,code:'MERCENARY_SSS_LIMITED_SHARD',name:'SSS 리미티드 조각',amount:30,logFloor:'87027398'};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const balances=r=>({quantity:String(r?.quantity??0),unseenQuantity:String(r?.unseen_quantity??0)});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),
 logs:await q(c,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reference_type,reference_id FROM inventory_logs WHERE id>$1::bigint AND user_id=65 AND item_code=$2 AND reference_id=$3 ORDER BY id',[PLAN.logFloor,PLAN.code,OP]),
 audit:await q(c,'SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])};}
export async function snapshot(c){
 const state={};for(const [key,sql] of [
  ['user','SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=65'],
  ['identity','SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=65'],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=65 ORDER BY item_code'],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=65 ORDER BY mercenary_code'],
  ['levels','SELECT * FROM user_mercenary_levels_v1 WHERE user_id=65 ORDER BY mercenary_code'],
  ['growth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=65 ORDER BY mercenary_code'],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=65'],
  ['sync','SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=65']
 ])state[key]=await q(c,sql);
 state.identity=state.identity.map(x=>({identityHash:hash(x)}));return JSON.parse(JSON.stringify(state));
}
const protectedState=s=>({...s,inventory:s.inventory.filter(x=>x.item_code!==PLAN.code),sync:undefined});
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(r.after[key])-BigInt(r.before[key]),30n);
 const a=await artifacts(c),log=one(a.logs),audit=one(a.audit);assert.deepEqual(a.receipt,r);assert.equal(log.id,r.inventoryLogId);assert.equal(log.user_id,'65');assert.equal(log.item_code,PLAN.code);assert.equal(log.change_amount,'30');assert.equal(log.balance_after,r.after.quantity);assert.equal(log.reference_type,'SYSTEM_GRANT');assert.equal(log.reference_id,OP);
 const {auditId,...payload}=r;assert.equal(audit.id,auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER_INVENTORY');assert.deepEqual(parse(audit.after_data),payload);assert.deepEqual(parse(audit.before_data),r.before);
 assert.equal(BigInt(r.syncAfter.revision),BigInt(r.syncBefore.revision)+1n);assert.equal(r.syncAfter.domains.inventory,r.syncAfter.revision);
 const current=balances(one(await q(c,'SELECT quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=65 AND item_code=$1',[PLAN.code])));if(exact)assert.deepEqual(current,r.after);
 return {status:'VERIFIED',userId:65,nickname:TARGET.nickname,code:PLAN.code,name:PLAN.name,amount:30,before:r.before,after:r.after,current,inventoryLogId:r.inventoryLogId,auditId,completedAt:r.completedAt};
}
// Caller owns the transaction, production USER_LOCK, and matching SQL lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=65 FOR UPDATE'));one(await q(c,'SELECT id FROM users WHERE id=65 FOR UPDATE'));
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=65 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=65 FOR SHARE');
 await q(c,'SELECT item_code FROM cnine_user_inventory WHERE user_id=65 AND item_code=$1 FOR UPDATE',[PLAN.code]);
 const item=one(await q(c,'SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[PLAN.code]));assert.equal(item.name,PLAN.name);assert.equal(Number(item.is_active),1);
 const before=await snapshot(c),user=one(before.user);for(const key of ['nickname','role','status'])assert.equal(user[key],TARGET[key]);assert.equal(user.id,'65');assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,'65');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const old=balances(before.inventory.find(x=>x.item_code===PLAN.code)),existing=await artifacts(c);assert.equal(existing.receipt,null);assert.equal(existing.logs.length+existing.audit.length,0,'Prior grant artifacts without receipt');
 for(const value of Object.values(old))assert(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-30n);
 const now=new Date().toISOString(),changed=one(await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(65,$1,30,30,$2,$2)
 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+30,unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+30,updated_at=excluded.updated_at RETURNING quantity::text,unseen_quantity::text`,[PLAN.code,now])),after=balances(changed);
 for(const key of Object.keys(old))assert.equal(BigInt(after[key])-BigInt(old[key]),30n);
 const log=one(await q(c,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) VALUES(65,$1,30,$2,$3,'SYSTEM_GRANT',$4,1,$5) RETURNING id::text",[PLAN.code,after.quantity,'사용자 지시: '+PLAN.authorization,OP,now]));
 const final=await snapshot(c);assert.deepEqual(protectedState(final),protectedState(before));
 const syncBefore=one(before.sync),syncAfter=one(final.sync);assert.equal(BigInt(syncAfter.revision),BigInt(syncBefore.revision)+1n);assert.equal(syncAfter.domains.inventory,syncAfter.revision);for(const domain of Object.keys(syncBefore.domains))if(domain!=='inventory')assert.equal(syncAfter.domains[domain],syncBefore.domains[domain]);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,before:old,after,inventoryLogId:log.id,syncBefore,syncAfter,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(final)),completedAt:now};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_INVENTORY',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify(old),JSON.stringify(r)])).id;
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(r),now]);await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
