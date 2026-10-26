import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE} from '../../shared/mercenary-prime-material-v1.mjs';

export const OP='ops:tmoney-prime-pig:20261026:v1',ACTION='OPS_BLOODMOON_PRIME_AND_PIG_GRANT',IDS=['5147'];
export const TARGET={id:'5147',nickname:'T-Money™',status:'ACTIVE',role:'USER',identityHash:'35fe97106d5fff7ffeeb25a7c64196327dedda8f907ffd336af1f0baa5d75fed'};
export const PLAN={operationKey:OP,authorization:'그리고 블러드문팩 한도 차감하고 기운잃은프라임카드 지급해 피그코인 2000개까지',target:TARGET,itemCode:PRIME_MATERIAL.code,itemName:PRIME_MATERIAL.name,quantity:1,pigCoins:2000,stockCode:PRIME_MATERIAL_STOCK_CODE,stockPolicy:'CONSUME_ONE_EXISTING_BLOODMOON_SLOT',expectedStockLimit:3,logFloor:{items:'87037161',audit:'51872'},coinCost:0,automaticCraft:false,sendMessages:false};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const PACK_KEY='mercenary_bloodmoon_ss_pack_v1',AID=OP+':prime',PIG_ID=OP+':pig',PIG_SOURCE='OPS_DIRECT_GRANT';
const SETTINGS=[PACK_KEY,'mercenary_prime_craft_v1','mercenary_bloodmoon_ss_once_v1:5147','support_package_coin_v1:5147','ops:tmoney-support-package-bogo15:20261026:v1'];
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const balance=row=>({quantity:String(row?.quantity||0),unseenQuantity:String(row?.unseen_quantity||0)});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function snapshot(c){
 const s={};for(const [key,sql,args=[]] of [
  ['user','SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=5147'],
  ['identity','SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=5147'],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=5147 ORDER BY item_code'],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=5147 ORDER BY mercenary_code'],
  ['levels','SELECT * FROM user_mercenary_levels_v1 WHERE user_id=5147 ORDER BY mercenary_code'],
  ['growth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=5147 ORDER BY mercenary_code'],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=5147'],
  ['pig','SELECT user_id::text,balance::text FROM pig_coin_wallets_v1 WHERE user_id=5147'],
  ['stock','SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.stockCode]],
  ['issues','SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[PLAN.stockCode]],
  ['settings','SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]],
  ['pending',"SELECT request_id,status,plan_json FROM joint_operations_v1 WHERE user_id=5147 AND kind='MERCENARY_BLOODMOON_OPEN' AND status='PENDING' ORDER BY request_id"],
  ['sync','SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=5147']
 ])s[key]=await q(c,sql,args);
 s.identity=s.identity.map(v=>({identityHash:hash({provider:v.provider,providerUserId:v.provider_user_id})}));return JSON.parse(JSON.stringify(s));
}
const protectedState=s=>({...s,inventory:s.inventory.filter(v=>v.item_code!==PLAN.itemCode),pig:undefined,stock:undefined,issues:undefined,sync:undefined});
export async function artifacts(c){return {
 receipt:await receipt(c),
 items:await q(c,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reference_type,reference_id,admin_id::text FROM inventory_logs WHERE id>$1::bigint AND user_id=5147 AND reference_id=$2 ORDER BY id',[PLAN.logFloor.items,AID]),
 pig:await q(c,'SELECT id,user_id::text,amount::text,balance_after::text,source,reference_id FROM pig_coin_ledger_v1 WHERE id=$1 OR (user_id=5147 AND source=$2 AND reference_id=$3)',[PIG_ID,PIG_SOURCE,OP]),
 issue:await q(c,'SELECT acquisition_id,request_id,user_id::text,code,serial::text,created_at FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1 OR request_id=$2 ORDER BY serial',[AID,OP]),
 audit:await q(c,'SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs WHERE id>$1::bigint AND action_type=$2 AND target_id=$3',[PLAN.logFloor.audit,ACTION,OP])
};}
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(r.material.after[key])-BigInt(r.material.before[key]),1n);
 assert.equal(BigInt(r.pig.after)-BigInt(r.pig.before),2000n);assert.equal(r.stock.before.stock_limit,r.stock.after.stock_limit);assert.equal(BigInt(r.stock.after.issued)-BigInt(r.stock.before.issued),1n);assert.equal(BigInt(r.stock.after.revision)-BigInt(r.stock.before.revision),1n);assert.equal(r.stock.after.last_token,OP);assert(BigInt(r.stock.after.issued)<=BigInt(r.stock.after.stock_limit));
 const a=await artifacts(c),item=one(a.items),pig=one(a.pig),issue=one(a.issue),audit=one(a.audit);assert.deepEqual(a.receipt,r);
 assert.equal(item.id,r.material.logId);assert.equal(item.user_id,TARGET.id);assert.equal(item.item_code,PLAN.itemCode);assert.equal(item.change_amount,'1');assert.equal(item.balance_after,r.material.after.quantity);assert.equal(item.reference_type,'SYSTEM_GRANT');assert.equal(item.reference_id,AID);assert.equal(item.admin_id,'1');
 assert.deepEqual(pig,{id:PIG_ID,user_id:TARGET.id,amount:'2000',balance_after:r.pig.after,source:PIG_SOURCE,reference_id:OP});
 assert.deepEqual(issue,{acquisition_id:AID,request_id:OP,user_id:TARGET.id,code:PLAN.stockCode,serial:String(r.stock.after.issued),created_at:r.completedAt});
 const {auditId,...payload}=r;assert.equal(audit.id,auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,OP);assert.deepEqual(parse(audit.after_data),payload);
 if(exact){const s=await snapshot(c);assert.deepEqual(balance(one(s.inventory.filter(v=>v.item_code===PLAN.itemCode))),r.material.after);assert.equal(one(s.pig).balance,r.pig.after);assert.deepEqual(one(s.stock),r.stock.after);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);assert.deepEqual(s.issues.filter(v=>v.acquisition_id!==AID),r.previousIssues);}
 return {status:'VERIFIED',userId:TARGET.id,nickname:TARGET.nickname,material:{code:PLAN.itemCode,name:PLAN.itemName,quantity:1,before:r.material.before.quantity,after:r.material.after.quantity,logId:r.material.logId},pigCoins:{amount:2000,before:r.pig.before,after:r.pig.after},stock:{code:PLAN.stockCode,limit:r.stock.after.stock_limit,issuedBefore:r.stock.before.issued,issuedAfter:r.stock.after.issued,remaining:String(BigInt(r.stock.after.stock_limit)-BigInt(r.stock.after.issued)),serial:issue.serial},auditId:r.auditId,completedAt:r.completedAt};
}
// The runner owns the transaction, production USER_LOCK and matching SQL lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=5147 FOR UPDATE'));one(await q(c,'SELECT id FROM users WHERE id=5147 FOR UPDATE'));
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=5147 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=5147 FOR SHARE');
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 one(await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[PLAN.stockCode]));
 await q(c,'SELECT item_code FROM cnine_user_inventory WHERE user_id=5147 AND item_code=$1 FOR UPDATE',[PLAN.itemCode]);await q(c,'SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=5147 FOR UPDATE');
 const before=await snapshot(c),user=one(before.user);for(const key of ['id','nickname','role','status'])assert.equal(user[key],TARGET[key]);assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,TARGET.id);one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const catalog=one(await q(c,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[PLAN.itemCode]));assert.equal(catalog.name,PLAN.itemName);assert.equal(Number(catalog.is_active),1);
 assert.equal(before.pending.length,0,'Unfinished Bloodmoon opening must be resolved first');
 const pack=parse(one(before.settings.filter(v=>v.key===PACK_KEY)).value),stock=one(before.stock);assert.equal(pack.settings.mode,'ON');assert.equal(Number(stock.stock_limit),PLAN.expectedStockLimit);assert.equal(Number(stock.stock_limit),pack.settings.stockLimits[PLAN.stockCode]);assert(BigInt(stock.issued)<BigInt(stock.stock_limit),'Prime material sold out');assert.equal(BigInt(before.issues.length),BigInt(stock.issued));
 assert.deepEqual(before.issues.map(v=>Number(v.serial)),Array.from({length:Number(stock.issued)},(_,i)=>i+1));
 const existing=await artifacts(c);assert.equal(existing.receipt,null);for(const key of ['items','pig','issue','audit'])assert.equal(existing[key].length,0,'Orphan grant: '+key);
 const old=balance(before.inventory.find(v=>v.item_code===PLAN.itemCode)),pigBefore=String(before.pig[0]?.balance||0);for(const n of Object.values(old))assert(BigInt(n)>=0n&&BigInt(n)<BigInt(Number.MAX_SAFE_INTEGER));assert(BigInt(pigBefore)>=0n&&BigInt(pigBefore)+2000n<=1000000000000n);
 const now=new Date().toISOString();
 const stockAfter=one(await q(c,'UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$1 WHERE code=$2 AND stock_limit=$3 AND issued=$4 AND revision=$5 AND issued+1<=stock_limit RETURNING *',[OP,PLAN.stockCode,stock.stock_limit,stock.issued,stock.revision]));
 one(await q(c,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,5147,$3,$4,$5) RETURNING acquisition_id',[AID,OP,PLAN.stockCode,stockAfter.issued,now]));
 const materialAfter=balance(one(await q(c,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(5147,$1,1,1,$2,$2) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+1,updated_at=excluded.updated_at RETURNING quantity::text,unseen_quantity::text',[PLAN.itemCode,now])));
 const itemLog=one(await q(c,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at) VALUES(5147,$1,1,$2,'블러드문팩 발행 한도 차감 운영 지급','SYSTEM_GRANT',$3,1,$4) RETURNING id::text",[PLAN.itemCode,materialAfter.quantity,AID,now]));
 const pigAfter=one(await q(c,'INSERT INTO pig_coin_wallets_v1(user_id,balance) VALUES(5147,2000) ON CONFLICT(user_id) DO UPDATE SET balance=pig_coin_wallets_v1.balance+2000 RETURNING balance::text')).balance;
 one(await q(c,'INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) VALUES($1,5147,2000,$2,$3,$4,$5) RETURNING id',[PIG_ID,pigAfter,PIG_SOURCE,OP,now]));
 one(await q(c,"UPDATE account_sync_versions_v1 SET revision=revision+1,domains=domains||jsonb_build_object('wallet',(revision+1)::text),updated_at=clock_timestamp() WHERE user_id=5147 RETURNING user_id"));
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before));assert.deepEqual(after.issues.filter(v=>v.acquisition_id!==AID),before.issues);assert.equal(after.issues.length,before.issues.length+1);
 for(const domain of ['wallet','inventory'])assert(BigInt(one(after.sync).domains[domain])>BigInt(one(before.sync).domains[domain]));
 for(const domain of Object.keys(one(before.sync).domains))if(!['wallet','inventory'].includes(domain))assert.equal(one(after.sync).domains[domain],one(before.sync).domains[domain]);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,material:{before:old,after:materialAfter,logId:itemLog.id},pig:{before:pigBefore,after:pigAfter,ledgerId:PIG_ID},stock:{before:stock,after:stockAfter},previousIssues:before.issues,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:one(before.sync),syncAfter:one(after.sync)};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({material:old,pig:pigBefore,stock}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OP,JSON.stringify(r)]));
 const verification=await verify(c,r,{exact:true});await lease();return {replayed:false,receipt:r,verification};
}
