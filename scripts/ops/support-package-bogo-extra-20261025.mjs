import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SUPPORT_PACKAGE_UNIT} from '../../shared/support-package-v1.mjs';
import {readPackageCoinAccounting,packageCoinKey} from '../../functions/_package_coin_accounting.js';

export const OP='ops:support-package-bogo-extra:20261025:v1';
export const ACTION='OPS_SUPPORT_PACKAGE_BOGO_EXTRA';
export const AUTHORIZATION='응맨하고 씨나인택갓 49800원패키지 1개 추가 지급하고';
export const TARGETS=Object.freeze([
 {id:'1195',nickname:'씨나인택갓',sourceOrder:'1195_e584dc1b-25af-43dd-a2b9-2c904ca31602'},
 {id:'4572',nickname:'응맨',sourceOrder:'4572_b5b6e536-788a-4c43-a340-ae3de3b67279'}
]);
const ids=TARGETS.map(t=>t.id),codes=SUPPORT_PACKAGE_UNIT.items.map(i=>i.code);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const safeMax=BigInt(Number.MAX_SAFE_INTEGER);
const reason=id=>'시즌패스 패키지 구매 '+OP+':'+id;
// Read through the existing coin-origin reconciliation, inside this same transaction.
export function accountingEnv(db){
 return {DB:{prepare(sql){
  assert.match(sql,/^SELECT\b/);let n=0;const text=sql.replace(/\?/g,()=>'$'+(++n));
  return {bind(...args){return {
   first:async()=>(await q(db,text,args))[0]||null,
   all:async()=>({results:await q(db,text,args)})
  };}};
 }}};
}
export async function receipt(db){const rows=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
async function protectedState(db){return {
 users:await q(db,"SELECT to_jsonb(u)-'coin' AS account FROM users u WHERE id=ANY($1::bigint[]) ORDER BY id",[ids]),
 support:await q(db,"SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) OR (key LIKE 'support_package_order_v1:%' AND (value::jsonb->>'userId')=ANY($2::text[])) ORDER BY key",[ids.flatMap(id=>['server_support_v1:'+id,'support_package_pending_v1:'+id]),ids])
};}
export async function inspect(db){return {
 accounts:await q(db,'SELECT id::text,nickname,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]),
 inventory:await q(db,'SELECT user_id::text,item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[]) ORDER BY user_id,item_code',[ids,codes]),
 accounting:await Promise.all(TARGETS.map(async t=>({userId:t.id,...await readPackageCoinAccounting(accountingEnv(db),t.id)}))),
 receipt:await receipt(db)
};}
export async function verify(db,r){
 r??=await receipt(db);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.authorization,AUTHORIZATION);assert.deepEqual(r.targets,TARGETS);assert.equal(r.grants.length,2);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const coinLogs=await q(db,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE user_id=ANY($1::bigint[]) AND reason=ANY($2::text[]) ORDER BY user_id',[ids,ids.map(reason)]);
 const itemLogs=await q(db,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND reference_type=$2 AND reference_id=$3 ORDER BY user_id,item_code',[ids,'SUPPORT_PACKAGE_BOGO',OP]);
 assert.equal(coinLogs.length,2);assert.equal(itemLogs.length,4);
 for(const t of TARGETS){
  const g=one(r.grants.filter(x=>x.userId===t.id));assert.equal(g.packageQuantity,1);assert.equal(g.nickname,t.nickname);assert.equal(g.sourceOrder,t.sourceOrder);
  const coin=one(coinLogs.filter(x=>x.user_id===t.id));assert.equal(coin.id,g.coin.logId);assert.equal(coin.change_amount,String(SUPPORT_PACKAGE_UNIT.coins));assert.equal(coin.balance_after,g.coin.after);assert.equal(BigInt(g.coin.after)-BigInt(g.coin.before),BigInt(SUPPORT_PACKAGE_UNIT.coins));
  assert.equal(g.accountingAfter.restricted-g.accountingBefore.restricted,SUPPORT_PACKAGE_UNIT.coins);assert.equal(String(g.accountingAfter.cursor),g.coin.logId);assert.equal(g.accountingAfter.precredited,null);
  for(const item of SUPPORT_PACKAGE_UNIT.items){const grant=one(g.items.filter(i=>i.code===item.code)),log=one(itemLogs.filter(i=>i.user_id===t.id&&i.item_code===item.code));assert.equal(log.id,grant.logId);assert.equal(log.change_amount,String(item.quantity));assert.equal(log.balance_after,grant.after);assert.equal(BigInt(grant.after)-BigInt(grant.before),BigInt(item.quantity));assert.equal(BigInt(grant.unseenAfter)-BigInt(grant.unseenBefore),BigInt(item.quantity));}
 }
 const audit=one(await q(db,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 return {verified:true,receipt:r};
}
export async function grantExtra(db,{dryRun=true}={}){
 const existing=await receipt(db);if(existing)return {...await verify(db,existing),replayed:true};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='8s'");await db.query("SET LOCAL statement_timeout='30s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const prior=await receipt(db);if(prior){const result=await verify(db,prior);await db.query('ROLLBACK');return {...result,replayed:true};}
  const accounts=await q(db,'SELECT id::text,nickname,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);assert.equal(accounts.length,2);
  const owner=one(await q(db,'SELECT id,role,status FROM users WHERE id=1'));assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  assert.equal((await q(db,'SELECT id FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])).length,0,'Prior audit without receipt');
  assert.equal((await q(db,'SELECT id FROM coin_logs WHERE user_id=ANY($1::bigint[]) AND reason=ANY($2::text[])',[ids,ids.map(reason)])).length,0,'Prior grant without receipt');
  const catalog=await q(db,'SELECT code,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);assert.equal(catalog.length,2);assert(catalog.every(i=>Number(i.is_active)===1));
  const before=await protectedState(db),grants=[];
  for(const t of TARGETS){
   const account=one(accounts.filter(a=>a.id===t.id));assert.equal(account.nickname,t.nickname);assert.equal(account.status,'ACTIVE');
   const order=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',['support_package_order_v1:'+t.sourceOrder])).value);assert.equal(order.status,'FULFILLED');assert.equal(String(order.userId),t.id);assert.deepEqual(order.product,SUPPORT_PACKAGE_UNIT);
   const accounting=await readPackageCoinAccounting(accountingEnv(db),t.id);assert(accounting.tracked);assert.equal(accounting.totalExact,account.coin);
   assert(BigInt(account.coin)>=0n&&BigInt(account.coin)+BigInt(SUPPORT_PACKAGE_UNIT.coins)<=safeMax);assert(Number.isSafeInteger(accounting.state.restricted+SUPPORT_PACKAGE_UNIT.coins));
   const wallet=one(await q(db,'UPDATE users SET coin=coin+$2::bigint WHERE id=$1 RETURNING coin::text',[t.id,String(SUPPORT_PACKAGE_UNIT.coins)]));
   const coinLog=one(await q(db,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES($1,$2,$3,$4,1) RETURNING id::text',[t.id,String(SUPPORT_PACKAGE_UNIT.coins),wallet.coin,reason(t.id)]));
   const nextAccounting={...accounting.state,revision:accounting.state.revision+1,cursor:Number(coinLog.id),restricted:accounting.state.restricted+SUPPORT_PACKAGE_UNIT.coins,precredited:null};
   await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[packageCoinKey(t.id),JSON.stringify(nextAccounting)]);
   const items=[];
   for(const item of SUPPORT_PACKAGE_UNIT.items){
    const old=(await q(db,'SELECT quantity::text,COALESCE(unseen_quantity,0)::text AS unseen FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[t.id,item.code]))[0]||{quantity:'0',unseen:'0'};
    for(const n of [old.quantity,old.unseen])assert(BigInt(n)>=0n&&BigInt(n)+BigInt(item.quantity)<=safeMax);
    const after=one(await q(db,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES($1,$2,$3,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP RETURNING quantity::text,unseen_quantity::text',[t.id,item.code,item.quantity]));
    const log=one(await q(db,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'49,800원 패키지 1+1 이벤트 추가 1개','SUPPORT_PACKAGE_BOGO',$5) RETURNING id::text",[t.id,item.code,item.quantity,after.quantity,OP]));
    items.push({code:item.code,before:old.quantity,after:after.quantity,unseenBefore:old.unseen,unseenAfter:after.unseen_quantity,logId:log.id});
   }
   grants.push({userId:t.id,nickname:t.nickname,sourceOrder:t.sourceOrder,packageQuantity:1,coin:{before:account.coin,after:wallet.coin,logId:coinLog.id},accountingBefore:accounting.state,accountingAfter:nextAccounting,items});
  }
  const after=await protectedState(db);assert.deepEqual(after,before);
  const result={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,targets:TARGETS,completedAt:new Date().toISOString(),grants,protectedBeforeHash:hash(before),protectedAfterHash:hash(after)};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USERS',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({accounts,protectedHash:hash(before)}),JSON.stringify(result)]));result.auditId=audit.id;
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(result)]);
  const verified=await verify(db,result);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
