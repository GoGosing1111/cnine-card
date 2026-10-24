import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:chanho-legion-recovery:20261024:v1';
export const PLAN={userId:4597,nickname:'찬호',sessionId:'90c91d30-2793-4f60-b952-fbf9c0b73ab4',paidCoins:2651362984,
 evidenceSha256:'5B79B3858A78053FDEE52B5913105C2716FA53BC72830276EFADD249CC5A758A',
 items:[{code:'VEHICLE_PART_ENGINE',quantity:8},{code:'VEHICLE_PART_FRAME',quantity:5},{code:'MASTER_STAR',quantity:49866},{code:'EQUIPMENT_POLISH_STONE',quantity:2},{code:'VEHICLE_PART_TIRE',quantity:3}]};
export const HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;}
export async function state(c){return {
 user:one(await q(c,'SELECT id::text,nickname,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',[PLAN.userId])),
 inventory:await q(c,'SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=$1 AND item_code=ANY($2::text[]) ORDER BY item_code',[PLAN.userId,PLAN.items.map(i=>i.code)]),
 run:await q(c,'SELECT value FROM app_meta WHERE key=$1',['legion_hunt_owner_session_v1:'+PLAN.userId])};}
export async function artifacts(c){return await q(c,'SELECT id::text,item_code,change_amount::text,balance_after::text FROM inventory_logs WHERE user_id=$1 AND reference_id=$2 ORDER BY item_code',[PLAN.userId,OP]);}
export async function verify(c,r){
 assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);const logs=await artifacts(c);assert.equal(logs.length,5);
 for(const item of PLAN.items){const log=one(logs.filter(l=>l.item_code===item.code));assert.equal(Number(log.change_amount),item.quantity);const g=one(r.grants.filter(g=>g.code===item.code));assert.equal(log.id,g.logId);assert.equal(log.balance_after,g.after);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(item.quantity));}
 const audit=one(await q(c,'SELECT after_data FROM admin_logs WHERE id=$1 AND target_id=$2',[r.auditId,OP]));assert.equal(JSON.parse(audit.after_data).planHash,HASH);
 return {verified:true,grantLogs:logs.length};
}
// Caller holds both existing account leases and owns BEGIN/COMMIT/ROLLBACK.
export async function grant(c,planHash,{leaseToken,lockDeadline}={}){
 assert.equal(planHash,HASH);const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND lease_until_ms>$3 FOR UPDATE',[PLAN.userId,leaseToken,Date.now()+5000]));
 const user=one(await q(c,'SELECT id::text,nickname,status FROM users WHERE nickname=$1 FOR UPDATE',[PLAN.nickname]));assert.equal(Number(user.id),PLAN.userId);assert.equal(user.status,'ACTIVE');
 assert.equal((await artifacts(c)).length,0);
 const coins=one(await q(c,"SELECT COALESCE(SUM(change_amount),0)::text total FROM coin_logs WHERE user_id=$1 AND created_at >= '2026-10-24' AND created_at < '2026-10-25' AND reason LIKE $2",[PLAN.userId,'군단토벌 몬스터 처치 ['+PLAN.sessionId+':%']));assert.equal(Number(coins.total),PLAN.paidCoins);
 assert.equal((await q(c,'SELECT id FROM inventory_logs WHERE user_id=$1 AND reference_id LIKE $2 LIMIT 1',[PLAN.userId,'LEGION_HUNT:'+PLAN.sessionId+':%'])).length,0,'Original run already paid');
 const before=await state(c);assert(!before.run.some(r=>JSON.parse(r.value).state?.id===PLAN.sessionId),'Use normal recovery if the original session still exists');
 const owner=one(await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const grants=[],now=new Date().toISOString();
 for(const item of PLAN.items){
  const definition=one(await q(c,'SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[item.code]));assert.equal(Number(definition.is_active),1);
  const old=(await q(c,'SELECT quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[PLAN.userId,item.code]))[0];
  const oldQuantity=old?.quantity||'0';assert(BigInt(oldQuantity)+BigInt(item.quantity)<BigInt(Number.MAX_SAFE_INTEGER));
  const after=one(await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES($1,$2,$3,$3,$4,$4)
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING quantity::text,unseen_quantity::text`,[PLAN.userId,item.code,item.quantity,now]));
  assert.equal(BigInt(after.quantity)-BigInt(oldQuantity),BigInt(item.quantity));assert.equal(BigInt(after.unseen_quantity)-BigInt(old?.unseen_quantity||'0'),BigInt(item.quantity));
  const log=one(await q(c,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) VALUES($1,$2,$3,$4,$5,'SYSTEM_GRANT',$6,$7,$8) RETURNING id::text",[PLAN.userId,item.code,item.quantity,after.quantity,'군단토벌 중단 미정산 복구: 첨부 수집 가방·코인 원장 일치 확인',OP,owner.id,now]));
  grants.push({...item,name:definition.name,before:oldQuantity,after:after.quantity,logId:log.id});
 }
 const after=await state(c);assert.deepEqual(after.user,before.user);assert.deepEqual(after.run,before.run);
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,grants,completedAt:now,coinsAndEnergyPreserved:true};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_LEGION_INTERRUPTION_RECOVERY','USER_INVENTORY',$2,$3,$4) RETURNING id::text",[owner.id,OP,JSON.stringify(before.inventory),JSON.stringify(r)]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 return {replayed:false,receipt:r,verification:await verify(c,r)};
}
