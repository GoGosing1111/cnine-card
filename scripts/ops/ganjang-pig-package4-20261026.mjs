import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SUPPORT_PACKAGE} from '../../shared/support-package-v1.mjs';
import {readPackageCoinAccounting,packageCoinKey} from '../../functions/_package_coin_accounting.js';
import {accountingEnv} from './support-package-bogo-extra-20261025.mjs';

export const OP='ops:ganjang-pig3000-package-bogo4:20261026:v1';
export const ACTION='OPS_PIG_AND_SUPPORT_PACKAGE_GRANT',IDS=['4981'];
export const TARGET={id:'4981',nickname:'간장왕대게찜',status:'ACTIVE',role:'USER',identityHash:'24a913088a43c8e040d3a83b8812ae8d9e34cd2cf418b13185dc235c3e034a44'};
export const PLAN={operationKey:OP,authorization:'간장왕대게찜 계정에 피그코인 3000개 넣고 49800원 패키지 4회 지급해',quantityConfirmation:'현재 1+1 기준 4회: 800조 코인·에너지 1,600개·SSS 리미티드 조각 40개',pendingOrderInstruction:'새 신청은 그대로 두고 별도로 4회 지급',pendingOrderAtConfirmation:'4981_37abd34a-4f18-4d17-826c-5989b84285fa',target:TARGET,pigCoins:3000,repetitions:4,packageQuantity:8,product:SUPPORT_PACKAGE,coins:String(BigInt(SUPPORT_PACKAGE.coins)*4n),items:SUPPORT_PACKAGE.items.map(i=>({code:i.code,name:i.name,quantity:i.quantity*4})),inventoryLogFloor:'87036850',coinLogFloor:'98332588',preserveExistingOrders:true,extendPass:false,sendMessages:false};
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),HASH=hash(PLAN);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v,codes=PLAN.items.map(i=>i.code);
const reason='시즌패스 패키지 구매 '+OP,pigSource='OPS_GRANT',pigLedgerId=OP+':pig:4981';
function validate(){
 assert.equal(SUPPORT_PACKAGE.priceWon,49800);assert.equal(SUPPORT_PACKAGE.packageQuantity,2);
 assert.equal(PLAN.coins,'800000000000000');assert.equal(PLAN.pigCoins,3000);
 assert.deepEqual(PLAN.items.map(i=>[i.code,i.quantity]),[['EMPEROR_ENERGY',1600],['MERCENARY_SSS_LIMITED_SHARD',40]]);
}
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function snapshot(c){
 const fields={
  users:['SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=4981',[]],
  identity:['SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=4981',[]],
  pig:['SELECT user_id::text,balance::text FROM pig_coin_wallets_v1 WHERE user_id=4981',[]],
  inventory:['SELECT * FROM cnine_user_inventory WHERE user_id=4981 ORDER BY item_code',[]],
  cards:['SELECT * FROM user_mercenary_cards_v1 WHERE user_id=4981 ORDER BY mercenary_code',[]],
  levels:['SELECT * FROM user_mercenary_levels_v1 WHERE user_id=4981 ORDER BY mercenary_code',[]],
  growth:['SELECT * FROM user_mercenary_growth_v1 WHERE user_id=4981 ORDER BY mercenary_code',[]],
  loadout:['SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=4981',[]],
  support:["SELECT key,value FROM app_meta WHERE key IN ('server_support_v1:4981','support_package_pending_v1:4981','ops:ganjang-support-package-bogo11:20261025:v1') OR key LIKE 'support_package_order_v1:4981!_%' ESCAPE '!' ORDER BY key",[]],
  accounting:['SELECT key,value FROM app_meta WHERE key=$1',[packageCoinKey(4981)]],
  sync:['SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=4981',[]]
 };
 const s={};for(const [key,args] of Object.entries(fields))s[key]=await q(c,...args);
 s.identity=s.identity.map(v=>({identityHash:hash(v)}));return JSON.parse(JSON.stringify(s));
}
export async function artifacts(c){return {
 receipt:await receipt(c),
 coins:await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id>$1::bigint AND user_id=4981 AND reason=$2 ORDER BY id',[PLAN.coinLogFloor,reason]),
 items:await q(c,"SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reference_id FROM inventory_logs WHERE id>$1::bigint AND user_id=4981 AND reference_type='SUPPORT_PACKAGE_BULK' AND reference_id=$2 ORDER BY item_code",[PLAN.inventoryLogFloor,OP]),
 pig:await q(c,'SELECT id,user_id::text,amount::text,balance_after::text,source,reference_id FROM pig_coin_ledger_v1 WHERE user_id=4981 AND reference_id=$1 ORDER BY id',[OP]),
 audit:await q(c,'SELECT id::text,admin_id::text,target_type,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])
};}
export const protectedState=s=>({...s,users:s.users.map(({coin,...account})=>account),pig:undefined,inventory:s.inventory.filter(i=>!codes.includes(i.item_code)),accounting:undefined,sync:undefined});
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const a=await artifacts(c);assert.deepEqual(a.receipt,r);assert.equal(a.coins.length,1);assert.equal(a.items.length,2);assert.equal(a.pig.length,1);assert.equal(a.audit.length,1);
 const audit=one(a.audit);assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');
 const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 const log=one(a.coins);assert.equal(log.id,r.coin.logId);assert.equal(log.user_id,TARGET.id);assert.equal(log.admin_id,'1');assert.equal(log.change_amount,PLAN.coins);assert.equal(log.balance_after,r.coin.after);assert.equal(BigInt(r.coin.after)-BigInt(r.coin.before),BigInt(PLAN.coins));
 assert.equal(r.accountingAfter.restricted-r.accountingBefore.restricted,Number(PLAN.coins));assert.equal(String(r.accountingAfter.cursor),log.id);assert.equal(r.accountingAfter.precredited,null);assert.deepEqual(r.accountingAfter.auctionReserved,r.accountingBefore.auctionReserved);
 const pig=one(a.pig);assert.equal(pig.id,pigLedgerId);assert.equal(pig.id,r.pig.logId);assert.equal(pig.user_id,TARGET.id);assert.equal(pig.source,pigSource);assert.equal(pig.reference_id,OP);assert.equal(pig.amount,'3000');assert.equal(pig.balance_after,r.pig.after);assert.equal(BigInt(r.pig.after)-BigInt(r.pig.before),3000n);
 for(const item of PLAN.items){const g=one(r.items.filter(v=>v.code===item.code)),l=one(a.items.filter(v=>v.item_code===item.code));assert.equal(l.id,g.logId);assert.equal(l.user_id,TARGET.id);assert.equal(l.change_amount,String(item.quantity));assert.equal(l.balance_after,g.after);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(item.quantity));assert.equal(BigInt(g.unseenAfter)-BigInt(g.unseenBefore),BigInt(item.quantity));}
 assert.equal(BigInt(r.syncAfter.revision),BigInt(r.syncBefore.revision)+3n);assert.equal(r.syncAfter.domains.inventory,r.syncAfter.revision);assert.equal(BigInt(r.syncAfter.domains.wallet),BigInt(r.syncBefore.revision)+1n);
 for(const domain of Object.keys(r.syncBefore.domains))if(!['wallet','inventory'].includes(domain))assert.equal(r.syncAfter.domains[domain],r.syncBefore.domains[domain]);
 if(exact){
  const s=await snapshot(c);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);assert.equal(one(s.users).coin,r.coin.after);assert.equal(one(s.pig).balance,r.pig.after);
  for(const g of r.items){const h=one(s.inventory.filter(i=>i.item_code===g.code));assert.equal(String(h.quantity),g.after);assert.equal(String(h.unseen_quantity),g.unseenAfter);}
  const accounting=await readPackageCoinAccounting(accountingEnv(c),4981);assert.equal(accounting.availableExact,r.availableBefore);assert.deepEqual(accounting.state,r.accountingAfter);
 }
 return {status:'VERIFIED',userId:TARGET.id,nickname:TARGET.nickname,pigCoins:3000,pig:r.pig,repetitions:4,packageQuantity:8,coins:PLAN.coins,coin:r.coin,items:r.items,auditId:r.auditId,coinLogs:1,itemLogs:2,pigLogs:1,completedAt:r.completedAt};
}
// Caller owns the transaction, production USER_LOCK, and matching SQL lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 validate();const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert(lockDeadline>Date.now()+20000);assert.match(String(leaseToken),/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const checkLease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=4981 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=4981 FOR UPDATE'));
 one(await q(c,'SELECT id FROM users WHERE id=4981 FOR UPDATE'));await checkLease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=4981 FOR SHARE');
 await q(c,'SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=4981 FOR UPDATE');
 await q(c,'SELECT item_code FROM cnine_user_inventory WHERE user_id=4981 AND item_code=ANY($1::text[]) ORDER BY item_code FOR UPDATE',[codes]);
 await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[packageCoinKey(4981)]);
 const before=await snapshot(c),account=one(before.users);
 for(const key of ['id','nickname','status','role'])assert.equal(account[key],TARGET[key]);assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,TARGET.id);
 // The user explicitly requested this grant separately from the new pending
 // application. Every existing order and pending pointer stays protected.
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const catalog=await q(c,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);assert.equal(catalog.length,2);for(const item of PLAN.items){const row=one(catalog.filter(x=>x.code===item.code));assert.equal(row.name,item.name);assert.equal(Number(row.is_active),1);}
 const prior=await artifacts(c);assert.equal(prior.receipt,null);for(const key of ['coins','items','pig','audit'])assert.equal(prior[key].length,0,'Orphan grant: '+key);
 const accounting=await readPackageCoinAccounting(accountingEnv(c),4981),max=BigInt(Number.MAX_SAFE_INTEGER),coinBefore=accounting.totalExact;
 assert.equal(coinBefore,account.coin);assert(BigInt(coinBefore)+BigInt(PLAN.coins)<=max);assert(Number.isSafeInteger(accounting.state.restricted+Number(PLAN.coins)));assert.equal(accounting.state.precredited,null);
 const pigBefore=String(before.pig[0]?.balance??0);assert(BigInt(pigBefore)>=0n&&BigInt(pigBefore)+3000n<=1000000000000n);
 const coinAfter=one(await q(c,'UPDATE users SET coin=coin+$1::bigint WHERE id=4981 AND coin=$2::bigint RETURNING coin::text',[PLAN.coins,coinBefore])).coin;
 const coinLog=one(await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(4981,$1,$2,$3,1) RETURNING id::text',[PLAN.coins,coinAfter,reason]));
 const pigAfter=one(await q(c,'INSERT INTO pig_coin_wallets_v1(user_id,balance) VALUES(4981,3000) ON CONFLICT(user_id) DO UPDATE SET balance=pig_coin_wallets_v1.balance+3000 RETURNING balance::text')).balance;
 one(await q(c,'INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) VALUES($1,4981,3000,$2,$3,$4,$5) RETURNING id',[pigLedgerId,pigAfter,pigSource,OP,new Date().toISOString()]));
 const items=[];
 for(const item of PLAN.items){
  const old=before.inventory.find(i=>i.item_code===item.code),quantity=String(old?.quantity??0),unseen=String(old?.unseen_quantity??0);for(const value of [quantity,unseen])assert(BigInt(value)>=0n&&BigInt(value)+BigInt(item.quantity)<=max);
  const holding=one(await q(c,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(4981,$1,$2,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP RETURNING quantity::text,unseen_quantity::text',[item.code,item.quantity]));
  const log=one(await q(c,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES(4981,$1,$2,$3,'49,800원 코인패키지 1+1 4회분 운영 지급','SUPPORT_PACKAGE_BULK',$4,1) RETURNING id::text",[item.code,item.quantity,holding.quantity,OP]));
  items.push({code:item.code,before:quantity,after:holding.quantity,unseenBefore:unseen,unseenAfter:holding.unseen_quantity,logId:log.id});
 }
 const nextAccounting={...accounting.state,revision:accounting.state.revision+1,cursor:Number(coinLog.id),restricted:accounting.state.restricted+Number(PLAN.coins),precredited:null};
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[packageCoinKey(4981),JSON.stringify(nextAccounting)]);
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before));
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:new Date().toISOString(),coin:{before:coinBefore,after:coinAfter,logId:coinLog.id},pig:{before:pigBefore,after:pigAfter,logId:pigLedgerId},items,accountingBefore:accounting.state,accountingAfter:nextAccounting,availableBefore:accounting.availableExact,syncBefore:one(before.sync),syncAfter:one(after.sync),protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after))};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({userId:TARGET.id,coin:coinBefore,pig:pigBefore,items:before.inventory.filter(i=>codes.includes(i.item_code)),accounting:accounting.state}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OP,JSON.stringify(r)]));
 const verification=await verify(c,r,{exact:true});await checkLease();return {replayed:false,receipt:r,verification};
}
