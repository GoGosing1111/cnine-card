import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
export const OP='ops:support-package-500t-difference:20261101:v1';
const db=connect(),mode=process.argv[2]||'before',hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='25s'");
 const q=async(sql,args=[])=>{const rows=(await db.query(sql,args)).rows;console.log(JSON.stringify({read:sql.slice(0,65),rows:rows.length}));return rows;};
 const clock=(await q("SELECT CURRENT_TIMESTAMP now,to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst"))[0];assert.equal(clock.kst,'2026-11-01');
 const orders=(await q("SELECT key,value FROM app_meta WHERE key LIKE 'support_package_order_v1:%' ORDER BY key")).map(r=>({...r,order:JSON.parse(r.value)}));
 const start=Date.parse('2026-11-01T00:00:00+09:00'),end=Date.parse('2026-11-02T00:00:00+09:00');
 const today=orders.filter(r=>r.order.status==='FULFILLED'&&r.order.processedAt>=start&&r.order.processedAt<end),pending=orders.filter(r=>r.order.status==='PENDING');
 const ids=[...new Set(today.map(r=>String(r.order.userId)))];
 const users=await q('SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[ids]);
 const targets=users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));
 const floors=(await q('SELECT (SELECT COALESCE(MAX(id),0)::text FROM coin_logs) coins,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) audit'))[0];
 const receipts=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%support-package%500%' ORDER BY key",[OP]);
 console.log(JSON.stringify({today:today.map(r=>r.order),pending:pending.map(r=>r.order),targets}));
 const logs=await q('SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,created_at FROM coin_logs WHERE id>$1::bigint AND user_id=ANY($2::bigint[]) AND reason=ANY($3::text[]) ORDER BY id',[(BigInt(floors.coins)-1000000n).toString(),ids,today.map(r=>'시즌패스 패키지 구매 '+r.order.id)]);
 const report={checkedAt:new Date().toISOString(),clock,operationKey:OP,readOnly:true,productionWrites:0,today,pending,targets,logFloor:floors,receipts,logs,completedOrders:orders.filter(r=>r.order.status!=='PENDING').map(r=>({key:r.key,hash:hash(r.value)}))};
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);await db.query('ROLLBACK');fs.writeFileSync(new URL('./'+mode+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({checkedAt:report.checkedAt,targets,today:today.map(({order:o})=>({id:o.id,userId:o.userId,quantity:o.quantity??1,coins:o.fulfillment?.coins,code:o.product.code,createdAt:o.createdAt,processedAt:o.processedAt})),pending:pending.map(({order:o})=>({id:o.id,quantity:o.quantity??1,coins:o.product.coins,code:o.product.code})),receipts:receipts.map(r=>r.key),logs}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}
