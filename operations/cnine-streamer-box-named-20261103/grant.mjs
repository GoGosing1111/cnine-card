import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import source from './source.json' with {type:'json'};
export const PLAN=plan,OP='ops:cnine-streamer-box-named:20261103:v1',ACTION='OPS_CNINE_STREAMER_BOX_NAMED_20261103',ITEM_CODE='CNINE_STREAMER_BOX';
export const IDS=PLAN.recipients.map(t=>t.userId).sort((a,b)=>Number(a)-Number(b));
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH='b937a340fde8e72af2314969c56da30d36b9ebe375915cb43dd4ac5c08b3c4db';
export const REASON='씨나인 스트리머 박스 명단 지급 · 309개 7박스 / 209개 5박스 / 109개 2박스 · 쟁이 7개만 · '+OP;
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(hash(source),PLAN.sourceHash);assert.equal(PLAN.operationKey,OP);assert.equal(source.operationKey,OP);assert.equal(PLAN.itemCode,ITEM_CODE);assert.equal(source.itemCode,ITEM_CODE);assert.equal(PLAN.itemName,'씨나인 스트리머 박스');
 assert.equal(PLAN.delivery,'DIRECT_INVENTORY');assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.autoOpen,false);assert.equal(PLAN.clarification,'쟁이는 7개만 지급');assert.equal(PLAN.recipientCount,37);assert.equal(PLAN.totalBoxes,222);
 assert.equal(PLAN.recipients.length,37);assert.equal(new Set(IDS).size,37);assert.equal(new Set(PLAN.recipients.map(t=>t.identityHash)).size,37);assert.equal(PLAN.recipients.reduce((n,t)=>n+t.amount,0),222);
 const inputs=source.groups.flatMap(g=>g.names.filter(n=>!(g.marker===209&&n==='쟁이')).map(inputNickname=>({inputNickname,marker:g.marker,amount:g.amount})));
 const ids=['233','4391','360','4981','4415','4582','4774','289','4598','4235','1768','4705','5008','1255','5362','290','88','5877','4572','4651','4610','218','5958','4597','4627','2420','164','183','1195','4562','4595','525','1545','3011','22','19','4570'];
 assert.deepEqual(PLAN.recipients.map(t=>t.userId),ids);
 for(let i=0;i<inputs.length;i++){const t=PLAN.recipients[i],e=inputs[i];assert.equal(t.order,i+1);for(const key of ['inputNickname','marker','amount'])assert.equal(t[key],e[key]);assert.equal(t.nickname,PLAN.aliases[e.inputNickname]||e.inputNickname);assert.equal(t.status,'ACTIVE');assert.match(t.identityHash,/^[a-f0-9]{64}$/);assert.equal(t.amount,({309:7,209:5,109:2})[t.marker]);}
 for(const [amount,count] of [[7,23],[5,11],[2,3]])assert.equal(PLAN.recipients.filter(t=>t.amount===amount).length,count);
 assert.equal(one(PLAN.recipients.filter(t=>t.inputNickname==='쟁이')).amount,7);
}
export async function snapshot(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  inventory:'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text,created_at,updated_at FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  item:'SELECT code,name,description,is_active FROM inventory_items WHERE code=$2'
 };
 const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) data`,[IDS,ITEM_CODE])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerId:provider_user_id})}));return s;
}
export const protectedState=s=>({...s,inventory:s.inventory.filter(i=>i.item_code!==ITEM_CODE),sync:undefined});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),logs:await q(c,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text,created_at FROM inventory_logs WHERE id>$1::bigint AND reference_id=$2 ORDER BY user_id,id',[PLAN.logFloor.inventory,OP]),audits:await q(c,'SELECT id::text,admin_id::text,action_type,target_id,after_data,created_at FROM admin_logs WHERE id>$1::bigint AND target_id=$2 ORDER BY id',[PLAN.logFloor.audit,OP])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.totalBoxes,222);assert.equal(r.grants.length,37);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const a=await artifacts(c);assert.deepEqual(a.receipt,r);assert.equal(a.logs.length,37);const audit=one(a.audits);assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.action_type,ACTION);assert.equal(audit.created_at,r.completedAt);const {auditId,...body}=r;assert.deepEqual(parse(audit.after_data),body);
 for(const t of PLAN.recipients){
  const g=one(r.grants.filter(g=>g.userId===t.userId)),log=one(a.logs.filter(l=>l.user_id===t.userId));assert.equal(g.nickname,t.nickname);assert.equal(g.inputNickname,t.inputNickname);assert.equal(g.amount,t.amount);assert.equal(g.marker,t.marker);
  assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(t.amount));assert.equal(BigInt(g.unseenAfter)-BigInt(g.unseenBefore),BigInt(t.amount));
  assert.equal(log.id,g.logId);assert.equal(log.item_code,ITEM_CODE);assert.equal(log.change_amount,String(t.amount));assert.equal(log.balance_after,g.after);assert.equal(log.reason,REASON);assert.equal(log.reference_type,ACTION);assert.equal(log.reference_id,OP);assert.equal(log.admin_id,'1');assert.equal(log.created_at,r.completedAt);
 }
 if(exact){const s=await snapshot(c);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);for(const g of r.grants){const item=one(s.inventory.filter(i=>i.user_id===g.userId&&i.item_code===ITEM_CODE));assert.equal(item.quantity,g.after);assert.equal(item.unseen_quantity,g.unseenAfter);}}
 return {verified:true,recipients:37,itemCode:ITEM_CODE,totalBoxes:222,groupCounts:PLAN.groupCounts,inventoryLogs:37,auditRecords:1,auditId:r.auditId,completedAt:r.completedAt,missing:0,duplicates:0};
}
// The caller owns the transaction and live USER_LOCK plus database leases.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate();assert.equal(expected,HASH);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(leaseToken||'',/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account leases required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const leases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,37,'Missing account lease');};
 assert.equal((await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS])).length,37);
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,37);await leases();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 await q(c,'SELECT user_id FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code FOR UPDATE',[IDS]);
 one(await q(c,'SELECT code FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]));
 const before=await snapshot(c);assert.equal(before.users.length,37);const item=one(before.item);assert.equal(item.name,PLAN.itemName);assert.equal(item.description,PLAN.itemDescription);assert.equal(Number(item.is_active),1);
 for(const t of PLAN.recipients){const u=one(before.users.filter(u=>u.id===t.userId));for(const k of ['nickname','role','status','identityHash'])assert.equal(u[k],t[k],`Recipient ${t.userId} ${k} changed`);const old=before.inventory.find(i=>i.user_id===t.userId&&i.item_code===ITEM_CODE);for(const k of ['quantity','unseen_quantity'])assert(BigInt(old?.[k]??0)>=0n&&BigInt(old?.[k]??0)+BigInt(t.amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported inventory balance');}
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[]) ORDER BY id',[PLAN.recipients.map(t=>t.nickname)]);assert.equal(exact.length,37);for(const t of PLAN.recipients)assert.equal(one(exact.filter(u=>u.nickname===t.nickname)).id,t.userId);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));const prior=await artifacts(c);assert.equal(prior.receipt,null);assert.equal(prior.logs.length,0,'Orphan inventory grant');assert.equal(prior.audits.length,0,'Orphan audit');
 const now=new Date().toISOString(),targets=IDS.map(id=>one(PLAN.recipients.filter(t=>t.userId===id))),amounts=targets.map(t=>t.amount),oldRows=IDS.map(id=>before.inventory.find(i=>i.user_id===id&&i.item_code===ITEM_CODE)),oldQuantities=oldRows.map(i=>i?.quantity??'0'),oldUnseen=oldRows.map(i=>i?.unseen_quantity??'0');
 const updated=await q(c,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
 SELECT id,$3,amount,amount,$4,$4 FROM unnest($1::bigint[],$2::bigint[]) target(id,amount) ORDER BY id
 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
 WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[],$5::bigint[],$6::bigint[]) expected(id,quantity,unseen) WHERE expected.id=cnine_user_inventory.user_id AND expected.quantity=cnine_user_inventory.quantity AND expected.unseen=cnine_user_inventory.unseen_quantity)
 RETURNING user_id::text,quantity::text,unseen_quantity::text,created_at,updated_at`,[IDS,amounts,ITEM_CODE,now,oldQuantities,oldUnseen]);assert.equal(updated.length,37,'Atomic inventory comparison failed');
 const quantities=IDS.map(id=>one(updated.filter(i=>i.user_id===id)).quantity);
 const logs=await q(c,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
 SELECT id,$4,amount,balance,$5,$6,$7,1,$8 FROM unnest($1::bigint[],$2::bigint[],$3::bigint[]) credited(id,amount,balance) ORDER BY id RETURNING id::text,user_id::text`,[IDS,amounts,quantities,ITEM_CODE,REASON,ACTION,OP,now]);assert.equal(logs.length,37);
 const grants=PLAN.recipients.map(t=>{const old=oldRows[IDS.indexOf(t.userId)],next=one(updated.filter(i=>i.user_id===t.userId));if(old)assert.equal(next.created_at,old.created_at);assert.equal(next.updated_at,now);return {userId:t.userId,nickname:t.nickname,inputNickname:t.inputNickname,marker:t.marker,amount:t.amount,before:old?.quantity??'0',after:next.quantity,unseenBefore:old?.unseen_quantity??'0',unseenAfter:next.unseen_quantity,logId:one(logs.filter(l=>l.user_id===t.userId)).id};});
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before),'Unrelated state changed');
 for(const id of IDS){const b=one(before.sync.filter(s=>s.user_id===id)),a=one(after.sync.filter(s=>s.user_id===id));assert.equal(BigInt(a.revision),BigInt(b.revision)+1n);assert.equal(BigInt(a.domains.inventory),BigInt(a.revision));assert.deepEqual({...a.domains,inventory:undefined},{...b.domains,inventory:undefined});}
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,totalBoxes:222,grants,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:before.sync,syncAfter:after.sync,messagesSent:0,automaticOpening:false};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_INVENTORY_GROUP',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({quantities:grants.map(g=>({userId:g.userId,quantity:g.before})),protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await leases();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
