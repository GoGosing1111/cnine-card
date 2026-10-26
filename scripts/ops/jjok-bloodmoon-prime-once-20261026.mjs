import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bloodmoonSsOnceKey,readBloodmoonSsOnce,pickBloodmoonSsOnceCode} from '../../functions/_mercenary_bloodmoon_once.js';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,BLOODMOON_OPEN_KIND} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE,isPrimeMaterialDraw} from '../../shared/mercenary-prime-material-v1.mjs';

export const OP='ops:jjok-bloodmoon-prime-once:20261026:v1',IDS=['303'];
export const TARGET={id:303,nickname:'[C9]족쪽이',role:'USER',status:'ACTIVE',identityHash:'6abd44fb8640b6b0961a6f987c0d9ef93ed74d28035c595d978c6d535a80e53b'};
export const KEY=bloodmoonSsOnceKey(TARGET.id),ACTION='MERCENARY_BLOODMOON_CARD_ONCE_ARMED';
export const PLAN={operationKey:OP,authorization:'[C9]족쪽이 블러드문팩 개봉때 기운잃은프라임카드 획득하게 설정해 / 1회만',target:TARGET,packId:BLOODMOON_PACK.id,stockCode:PRIME_MATERIAL_STOCK_CODE,itemCode:PRIME_MATERIAL.code,itemName:PRIME_MATERIAL.name,quantity:1,appliesTo:'FIRST_SLOT_OF_NEXT_NEW_VALID_SINGLE_TEN_OR_BULK_OPEN',subsequent:'NORMAL_PROBABILITY',directGrant:false,stockReservation:false};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const SETTINGS=[BLOODMOON_PACK_KEY,'mercenary_halloween_ss_pack_v1','mercenary_prime_craft_v1'];
const read=async(c,key)=>{const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[key]);return rows.length?parse(one(rows).value):null;};
export const receipt=c=>read(c,OP);
export function makeEntitlement(now=new Date().toISOString()){
 return {version:2,status:'ARMED',remaining:1,userId:TARGET.id,actorId:1,actor:'CODEX_OPERATIONS',operationId:OP,operationKey:OP,packId:BLOODMOON_PACK.id,rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:PRIME_MATERIAL_STOCK_CODE,createdAt:now,reason:PLAN.authorization};
}
export async function snapshot(c){
 const s={};
 for(const [key,sql,args] of [
  ['user','SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=303',[]],
  ['identity','SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=303',[]],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=303 ORDER BY item_code',[]],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=303 ORDER BY mercenary_code',[]],
  ['growth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=303 ORDER BY mercenary_code',[]],
  ['levels','SELECT * FROM user_mercenary_levels_v1 WHERE user_id=303 ORDER BY mercenary_code',[]],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=303',[]],
  ['sync','SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=303',[]],
  ['settings','SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]],
  ['stock','SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PRIME_MATERIAL_STOCK_CODE]],
  ['pending',"SELECT request_id,status,plan_json FROM joint_operations_v1 WHERE user_id=303 AND kind=$1 AND status='PENDING' ORDER BY request_id",[BLOODMOON_OPEN_KIND]]
 ])s[key]=await q(c,sql,args);
 s.identity=s.identity.map(x=>({identityHash:hash(x)}));return JSON.parse(JSON.stringify(s));
}
export async function artifacts(c){
 return {receipt:await receipt(c),once:await read(c,KEY),audit:await q(c,'SELECT id::text,admin_id::text,action_type,target_id,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2 AND after_data::jsonb->>\'operationKey\'=$3',[ACTION,String(TARGET.id),OP])};
}
export async function verify(c){
 const a=await artifacts(c),r=a.receipt;assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const audit=one(a.audit);assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 const once=a.once;for(const [k,v] of Object.entries(makeEntitlement(once.createdAt)))if(!['status','remaining'].includes(k))assert.deepEqual(once[k],v,k);
 assert(['ARMED','CONSUMED'].includes(once.status));assert.equal(once.remaining,once.status==='ARMED'?1:0);
 let acquisition=null;
 if(once.status==='CONSUMED'){
  assert.equal(once.rewardKind,'ITEM');assert.equal(once.itemCode,PRIME_MATERIAL.code);
  const op=one(await q(c,'SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=$1 AND user_id=303 AND kind=$2',[once.requestId,BLOODMOON_OPEN_KIND]));assert.equal(op.status,'COMPLETED');const plan=parse(op.plan_json);assert.equal(plan.once.operationId,OP);assert(isPrimeMaterialDraw(plan.draws.find(x=>(x.drawIndex??0)===0)));assert.equal(once.acquisitionId,once.requestId+':0');
  acquisition=one(await q(c,"SELECT l.code,l.serial,i.item_code,i.change_amount::text FROM mercenary_limited_issues_v1 l JOIN inventory_logs i ON i.reference_id=l.acquisition_id AND i.user_id=l.user_id WHERE l.acquisition_id=$1 AND l.user_id=303 AND i.item_code=$2 AND i.reason='BLOODMOON_PRIME_MATERIAL'",[once.acquisitionId,PRIME_MATERIAL.code]));assert.equal(acquisition.code,PRIME_MATERIAL_STOCK_CODE);assert.equal(acquisition.change_amount,'1');
 }
 return {status:'VERIFIED',userId:303,nickname:TARGET.nickname,itemCode:PRIME_MATERIAL.code,itemName:PRIME_MATERIAL.name,quantity:1,guaranteeStatus:once.status,remaining:once.remaining,auditId:r.auditId,registeredAt:r.completedAt,acquisition};
}
// The runner owns one transaction, the production USER_LOCK and its DB lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c)};
 assert(lockDeadline>Date.now()+20000);assert.match(String(leaseToken),/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=303 FOR UPDATE');one(await q(c,'SELECT id FROM users WHERE id=303 FOR UPDATE'));
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=303 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=303 FOR SHARE');
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[[...SETTINGS,KEY,OP]]);
 one(await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[PRIME_MATERIAL_STOCK_CODE]));
 const before=await snapshot(c),account=one(before.user);for(const key of ['nickname','role','status'])assert.equal(account[key],TARGET[key]);assert.equal(account.id,'303');assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,'303');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const current=await artifacts(c);assert.equal(current.receipt,null);assert.equal(current.once,null,'Do not overwrite any existing one-time setting');assert.equal(current.audit.length,0,'Orphan audit found');
 const pack=parse(one(before.settings.filter(x=>x.key===BLOODMOON_PACK_KEY)).value),stock=one(before.stock);assert.equal(pack.settings.mode,'ON');assert(Number(stock.issued)<Number(stock.stock_limit),'Prime material sold out');assert.equal(Number(stock.stock_limit),pack.settings.stockLimits[PRIME_MATERIAL_STOCK_CODE]);assert(pack.settings.cardRatesPpm[PRIME_MATERIAL_STOCK_CODE]>0);
 const now=new Date().toISOString(),once=makeEntitlement(now);await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[KEY,JSON.stringify(once),now]);
 const adapter={prepare:sql=>({bind:(...values)=>({first:async()=>{let n=0;return (await q(c,sql.replace(/\?/g,()=>'$'+(++n)),values))[0]||null;}})})};
 const runtime=await readBloodmoonSsOnce(adapter,303);assert.equal(runtime.operationId,OP);assert.equal(pickBloodmoonSsOnceCode({settings:pack.settings,stock:[{code:stock.code,prepared:true,remaining:Number(stock.stock_limit)-Number(stock.issued)}]},()=>0,runtime),PRIME_MATERIAL_STOCK_CODE);
 const after=await snapshot(c);assert.deepEqual(after,before);const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,entitlementKey:KEY,protectedBeforeHash:hash(before),protectedAfterHash:hash(after),grantsDuringArming:0,costDuringArming:0};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,'null',$3) RETURNING id::text",[ACTION,'303',JSON.stringify(r)])).id;
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(r),now]);await lease();return {replayed:false,receipt:r,verification:await verify(c)};
}
