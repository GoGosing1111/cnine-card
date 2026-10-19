import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./spirit-letter-20261019-plan.json',import.meta.url),'utf8'));
export const HASH='106a1e1a44678db1d867ed7fda3a88792e1e39f771bb34b737dd0911f1025345';
export const OP=PLAN.operationKey,ACTION='OPS_SPIRIT_LETTER_1314390';
export const REASON='신령님에게 보내는 편지 4편 선정 보상 · 10조 코인 (게시글 1314390)';
export const IDS=PLAN.recipients.map(r=>r.userId).sort((a,b)=>Number(a)-Number(b));
const coin=PLAN.recipients[0],suits=PLAN.recipients.slice(1),suitIds=suits.map(r=>r.userId);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const grantId=r=>OP+':'+r.userId+':'+r.reward.code;
function validate(hash){
 assert.equal(hash,HASH,'Reviewed plan required');assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),HASH,'Plan changed');
 assert.equal(PLAN.authorization,'지급해');assert.equal(PLAN.delivery,'DIRECT');assert.equal(IDS.length,3);assert.equal(new Set(IDS).size,3);
 assert.deepEqual(PLAN.recipients.map(r=>[r.nickname,r.userId]),[['의지','4641'],['[C9]가시','4866'],['제롬','4625']]);
 assert.equal(coin.reward.amount,'10000000000000');
 for(const s of suits)assert.deepEqual(s.reward,{kind:'EQUIPMENT',code:'BATTLE_SUIT_S_BODY',id:'47',name:'S-BODY',quantity:1});
}
export async function state(c){
 const users=await q(c,`SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,v.provider,v.provider_user_id,v.provider_name
 FROM users u JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id`,[IDS]);
 const instances=await q(c,'SELECT id::text,user_id::text,equipment_id::text,source_type,source_id,request_id FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 ORDER BY id',[suitIds]);
 const counts=await q(c,'SELECT user_id::text,quantity::text FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 ORDER BY user_id',[suitIds]);
 return {users,instances,counts};
}
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function artifacts(c){return {
 receipts:await q(c,'SELECT key FROM app_meta WHERE key=$1',[OP]),
 audits:await q(c,'SELECT id::text FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]),
 equipment:await q(c,'SELECT id::text FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 AND (source_id=$2 OR request_id=ANY($3::text[]))',[suitIds,OP,suits.map(grantId)]),
 coins:await q(c,'SELECT id::text FROM coin_logs WHERE id>(SELECT COALESCE(MAX(id),0)-300000 FROM coin_logs) AND user_id=$1 AND reason=$2',[coin.userId,REASON])
};}
export async function verify(c,r,{exact=false}={}){
 validate(r.planHash);assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.deepEqual(r.plan,PLAN);
 assert.equal(r.coin.userId,coin.userId);assert.equal(r.coin.amount,coin.reward.amount);assert.equal(BigInt(r.coin.after)-BigInt(r.coin.before),BigInt(coin.reward.amount));
 const log=one(await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=$1',[r.coin.coinLogId]));
 assert.deepEqual(log,{id:r.coin.coinLogId,user_id:coin.userId,change_amount:coin.reward.amount,balance_after:r.coin.after,reason:REASON,admin_id:r.adminId});
 const rows=await q(c,'SELECT id::text,user_id::text,equipment_id::text,source_type,source_id,request_id FROM user_equipment_instances WHERE id=ANY($1::bigint[]) ORDER BY user_id',[r.equipment.map(e=>e.instanceId)]);
 assert.equal(rows.length,2);assert.equal(r.equipment.length,2);
 for(const s of suits){
  const g=one(r.equipment.filter(x=>x.userId===s.userId)),e=one(rows.filter(x=>x.user_id===s.userId));
  assert.equal(g.quantityAfter,g.quantityBefore+1);assert.equal(g.quantity,1);assert.equal(g.code,s.reward.code);
  assert.deepEqual(e,{id:g.instanceId,user_id:s.userId,equipment_id:s.reward.id,source_type:'ADMIN',source_id:OP,request_id:grantId(s)});
 }
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,r.adminId);const {auditId,...audited}=r;assert.deepEqual(parse(audit.after_data),audited);
 const a=await artifacts(c);assert.equal(a.receipts.length,1);assert.equal(a.audits.length,1);assert.equal(a.equipment.length,2);assert.equal(a.coins.length,1);
 if(exact){const current=await state(c);assert.equal(one(current.users.filter(u=>u.id===coin.userId)).coin,r.coin.after);for(const g of r.equipment){assert.equal(current.instances.filter(i=>i.user_id===g.userId).length,g.quantityAfter);assert.equal(Number(one(current.counts.filter(x=>x.user_id===g.userId)).quantity),g.quantityAfter);}}
 return {status:'VERIFIED',recipients:3,coinRecipients:1,coinAmount:coin.reward.amount,equipmentRecipients:2,sBodyQuantity:2,coinLogs:1,equipmentInstances:2,auditRecords:1,operationReceipts:1};
}

// Caller owns BEGIN/COMMIT and the three live USER_LOCK/database leases.
export async function grant(c,expectedHash,{lockDeadline}={}){
 validate(expectedHash);assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const saved=await receipt(c);if(saved)return {receipt:saved,replayed:true,verification:await verify(c,saved)};
 await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 const before=await state(c);assert.equal(before.users.length,3);
 for(const r of PLAN.recipients){const u=one(before.users.filter(u=>u.id===r.userId));assert.equal(u.nickname,r.nickname);assert.equal(u.status,'ACTIVE');assert.equal(u.role,r.role);assert.equal(u.provider,r.provider);assert.equal(u.provider_user_id,r.providerUserId);assert.equal(u.provider_name,r.providerName);}
 const equipment=one(await q(c,'SELECT id::text,code,name,slot,is_active::text,is_public::text FROM character_equipment_items WHERE id=47 FOR SHARE'));
 assert.deepEqual(equipment,{id:'47',code:'BATTLE_SUIT_S_BODY',name:'S-BODY',slot:'BATTLE_SUIT',is_active:'1',is_public:'1'});
 assert.equal(one(await q(c,"SELECT tgenabled FROM pg_trigger WHERE tgrelid='user_equipment_instances'::regclass AND tgname='trg_user_equipment_counts_ins_v1'")).tgenabled,'O');
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Existing grant requires reconciliation');
 for(const s of suits)assert.equal(before.instances.filter(x=>x.user_id===s.userId).length,Number(before.counts.find(x=>x.user_id===s.userId)?.quantity||0),'Equipment aggregate mismatch');
 const owner=one(await q(c,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const balance=one(before.users.filter(x=>x.id===coin.userId)).coin;assert(BigInt(balance)>=0n&&BigInt(balance)+BigInt(coin.reward.amount)<=BigInt(Number.MAX_SAFE_INTEGER));
 const now=new Date().toISOString();
 const credited=one(await q(c,'UPDATE users SET coin=coin+$2::bigint WHERE id=$1 RETURNING coin::text',[coin.userId,coin.reward.amount]));
 const log=one(await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',[coin.userId,coin.reward.amount,credited.coin,REASON,owner.id,now]));
 const added=await q(c,"INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT x.user_id,47,'ADMIN',$2,x.request_id FROM unnest($1::bigint[],$3::text[]) x(user_id,request_id) RETURNING id::text,user_id::text",[suitIds,OP,suits.map(grantId)]);assert.equal(added.length,2);
 const after=await state(c);
 for(const u of before.users){const a=one(after.users.filter(x=>x.id===u.id));assert.deepEqual(a,{...u,coin:u.id===coin.userId?credited.coin:u.coin});}
 const equipmentGrants=suits.map(s=>({userId:s.userId,nickname:s.nickname,code:s.reward.code,quantity:1,instanceId:one(added.filter(e=>e.user_id===s.userId)).id,quantityBefore:before.instances.filter(e=>e.user_id===s.userId).length,quantityAfter:after.instances.filter(e=>e.user_id===s.userId).length}));
 for(const old of before.instances)assert.deepEqual(one(after.instances.filter(e=>e.id===old.id)),old);
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,adminId:owner.id,delivery:'DIRECT',coin:{userId:coin.userId,nickname:coin.nickname,amount:coin.reward.amount,before:balance,after:credited.coin,coinLogId:log.id},equipment:equipmentGrants};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_GROUP',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OP,JSON.stringify({coin:balance,equipment:equipmentGrants.map(g=>({userId:g.userId,quantity:g.quantityBefore}))}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verification=await verify(c,r,{exact:true});assert(lockDeadline>Date.now()+5000,'Account leases nearing expiration');
 return {receipt:r,replayed:false,verification};
}
