import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SUPPORT_PACKAGE} from '../../shared/support-package-v1.mjs';
import {readPackageCoinAccounting,packageCoinKey} from '../../functions/_package_coin_accounting.js';
import {accountingEnv} from './support-package-bogo-extra-20261025.mjs';

export const OP='ops:oil-gaji-support-package-bogo3:20261026:v1',ACTION='OPS_SUPPORT_PACKAGE_BOGO_3';
export const IDS=['3011'],TARGET={id:'3011',nickname:'오일바른가지',status:'ACTIVE',role:'USER',identityHash:'aa721411230ad727d6a73f772fb71364af222351e684218b202c127c0916d0cd'};
export const LOG_FLOOR={coins:"98337317",items:"87038908",audit:"51885"};
export const PLAN={operationKey:OP,authorization:'오일바른가지에 49800원 패키지 3번 지급해 1+1기준으로',target:TARGET,logFloor:LOG_FLOOR,repetitions:3,packageQuantity:6,product:SUPPORT_PACKAGE,coins:String(BigInt(SUPPORT_PACKAGE.coins)*3n),items:SUPPORT_PACKAGE.items.map(i=>({code:i.code,name:i.name,quantity:i.quantity*3})),preserveExistingOrders:true,extendPass:false,sendMessages:false};
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),HASH=hash(PLAN);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v,codes=PLAN.items.map(i=>i.code),reason='시즌패스 패키지 구매 '+OP;
function validate(){assert.equal(SUPPORT_PACKAGE.priceWon,49800);assert.equal(SUPPORT_PACKAGE.packageQuantity,2);assert.equal(PLAN.coins,'600000000000000');assert.deepEqual(PLAN.items.map(i=>[i.code,i.quantity]),[['EMPEROR_ENERGY',1200],['MERCENARY_SSS_LIMITED_SHARD',30]]);}
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function snapshot(c){
 const fields={
  users:[`SELECT jsonb_build_object('id',id::text,'nickname',nickname,'status',status,'role',role,'coin',coin::text,'card_shards',card_shards::text,'magic_crystals',magic_crystals::text) AS account FROM users WHERE id=3011`,[]],
  identity:['SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=3011',[]],
  inventory:['SELECT * FROM cnine_user_inventory WHERE user_id=3011 ORDER BY item_code',[]],
  cards:['SELECT * FROM user_mercenary_cards_v1 WHERE user_id=3011 ORDER BY mercenary_code',[]],
  levels:['SELECT * FROM user_mercenary_levels_v1 WHERE user_id=3011 ORDER BY mercenary_code',[]],
  growth:['SELECT * FROM user_mercenary_growth_v1 WHERE user_id=3011 ORDER BY mercenary_code',[]],
  loadout:['SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=3011',[]],
  support:["SELECT key,value FROM app_meta WHERE key IN ('server_support_v1:3011','support_package_pending_v1:3011') OR key LIKE 'support_package_order_v1:3011!_%' ESCAPE '!' ORDER BY key",[]],
  accounting:['SELECT key,value FROM app_meta WHERE key=$1',[packageCoinKey(3011)]],
  sync:['SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=3011',[]]
 };
 const s={};for(const [key,args] of Object.entries(fields))s[key]=await q(c,...args);
 s.identity=s.identity.map(v=>({identityHash:hash({provider:v.provider,providerId:v.provider_user_id})}));return JSON.parse(JSON.stringify(s));
}
export async function artifacts(c){return {receipt:await receipt(c),coins:await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE user_id=3011 AND reason=$1 AND id>$2::bigint ORDER BY id',[reason,LOG_FLOOR.coins]),items:await q(c,"SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reference_id FROM inventory_logs WHERE user_id=3011 AND reference_type='SUPPORT_PACKAGE_BULK' AND reference_id=$1 AND id>$2::bigint ORDER BY item_code",[OP,LOG_FLOOR.items]),audit:await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2 AND id>$3::bigint',[ACTION,OP,LOG_FLOOR.audit])};}
const protectedState=s=>({...s,users:s.users.map(({account:{coin,...account}})=>({account})),inventory:s.inventory.filter(i=>!codes.includes(i.item_code)),accounting:undefined,sync:undefined});
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const a=await artifacts(c);assert.equal(a.coins.length,1);assert.equal(a.items.length,2);assert.equal(a.audit.length,1);assert.equal(a.audit[0].id,r.auditId);assert.equal(a.audit[0].admin_id,'1');
 const {auditId,...payload}=r;assert.deepEqual(parse(a.audit[0].after_data),payload);
 const log=a.coins[0];assert.equal(log.id,r.coin.logId);assert.equal(log.change_amount,PLAN.coins);assert.equal(log.balance_after,r.coin.after);assert.equal(BigInt(r.coin.after)-BigInt(r.coin.before),BigInt(PLAN.coins));
 assert.equal(r.accountingAfter.restricted-r.accountingBefore.restricted,Number(PLAN.coins));assert.equal(String(r.accountingAfter.cursor),log.id);assert.equal(r.accountingAfter.precredited,null);assert.deepEqual(r.accountingAfter.auctionReserved,r.accountingBefore.auctionReserved);
 for(const item of PLAN.items){const g=one(r.items.filter(v=>v.code===item.code)),l=one(a.items.filter(v=>v.item_code===item.code));assert.equal(l.id,g.logId);assert.equal(l.change_amount,String(item.quantity));assert.equal(l.balance_after,g.after);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(item.quantity));assert.equal(BigInt(g.unseenAfter)-BigInt(g.unseenBefore),BigInt(item.quantity));}
 if(exact){const s=await snapshot(c);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);assert.equal(String(one(s.users).account.coin),r.coin.after);for(const g of r.items){const h=one(s.inventory.filter(i=>i.item_code===g.code));assert.equal(String(h.quantity),g.after);assert.equal(String(h.unseen_quantity),g.unseenAfter);}const accounting=await readPackageCoinAccounting(accountingEnv(c),3011);assert.equal(accounting.availableExact,r.availableBefore);assert.deepEqual(accounting.state,r.accountingAfter);}
 return {status:'VERIFIED',userId:TARGET.id,nickname:TARGET.nickname,repetitions:3,packageQuantity:6,coins:PLAN.coins,items:PLAN.items,auditId:r.auditId,coinLogs:1,itemLogs:2};
}
// Transaction, live account lock and fallback lease are owned by the runner.
export async function grant(c,{leaseToken,lockDeadline}={}){
 validate();const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert(lockDeadline>Date.now()+20000);assert.match(leaseToken,/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const checkLease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=3011 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=3011 FOR UPDATE');
 one(await q(c,'SELECT id FROM users WHERE id=3011 FOR UPDATE'));await checkLease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=3011 FOR SHARE');
 await q(c,'SELECT item_code FROM cnine_user_inventory WHERE user_id=3011 AND item_code=ANY($1::text[]) ORDER BY item_code FOR UPDATE',[codes]);
 await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[packageCoinKey(3011)]);
 const before=await snapshot(c),account=one(before.users).account;
 for(const key of ['nickname','status','role'])assert.equal(account[key],TARGET[key]);assert.equal(String(account.id),TARGET.id);assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,TARGET.id);
 assert(!before.support.some(r=>r.key==='support_package_pending_v1:3011'),'Reconcile a newly created pending order before granting');
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const catalog=await q(c,'SELECT code,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);assert.equal(catalog.length,2);assert(catalog.every(r=>Number(r.is_active)===1));
 assert(!before.support.some(r=>r.key.startsWith('support_package_order_v1:')&&parse(r.value).status==='PENDING'),'New pending order must be reconciled');
 const prior=await artifacts(c);assert.equal(prior.receipt,null);for(const key of ['coins','items','audit'])assert.equal(prior[key].length,0,'Orphan grant: '+key);
 const accounting=await readPackageCoinAccounting(accountingEnv(c),3011),max=BigInt(Number.MAX_SAFE_INTEGER),coinBefore=accounting.totalExact;
 assert.equal(coinBefore,String(account.coin));assert(BigInt(coinBefore)+BigInt(PLAN.coins)<=max);assert(Number.isSafeInteger(accounting.state.restricted+Number(PLAN.coins)));
 const coinAfter=one(await q(c,'UPDATE users SET coin=coin+$1::bigint WHERE id=3011 AND coin=$2::bigint RETURNING coin::text',[PLAN.coins,coinBefore])).coin;
 const coinLog=one(await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(3011,$1,$2,$3,1) RETURNING id::text',[PLAN.coins,coinAfter,reason]));
 const items=[];
 for(const item of PLAN.items){const old=before.inventory.find(i=>i.item_code===item.code),quantity=String(old?.quantity||0),unseen=String(old?.unseen_quantity||0);for(const value of [quantity,unseen])assert(BigInt(value)>=0n&&BigInt(value)+BigInt(item.quantity)<=max);
  const holding=one(await q(c,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(3011,$1,$2,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP RETURNING quantity::text,unseen_quantity::text',[item.code,item.quantity]));
  const log=one(await q(c,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(3011,$1,$2,$3,'49,800원 코인패키지 1+1 3회분 운영 지급','SUPPORT_PACKAGE_BULK',$4) RETURNING id::text",[item.code,item.quantity,holding.quantity,OP]));
  items.push({code:item.code,before:quantity,after:holding.quantity,unseenBefore:unseen,unseenAfter:holding.unseen_quantity,logId:log.id});
 }
 const nextAccounting={...accounting.state,revision:accounting.state.revision+1,cursor:Number(coinLog.id),restricted:accounting.state.restricted+Number(PLAN.coins),precredited:null};
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[packageCoinKey(3011),JSON.stringify(nextAccounting)]);
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before));
 for(const domain of ['wallet','inventory'])assert(BigInt(one(after.sync).domains[domain])>BigInt(one(before.sync).domains[domain]));
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:new Date().toISOString(),coin:{before:coinBefore,after:coinAfter,logId:coinLog.id},items,accountingBefore:accounting.state,accountingAfter:nextAccounting,availableBefore:accounting.availableExact,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after))};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({userId:TARGET.id,coin:coinBefore,items:before.inventory.filter(i=>codes.includes(i.item_code)),accounting:accounting.state}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OP,JSON.stringify(r)]));
 const verification=await verify(c,r,{exact:true});await checkLease();return {replayed:false,receipt:r,verification};
}
