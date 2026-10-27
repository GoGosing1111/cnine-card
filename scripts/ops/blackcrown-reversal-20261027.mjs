import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readPackageCoinAccounting} from '../../functions/_package_coin_accounting.js';
import {accountingEnv} from './support-package-bogo-extra-20261025.mjs';
export const OP='ops:blackcrown-early-opening-reversal:20261027:v1',IDS=['1','91','4199'],QA='docs/qa/blackcrown-reversal-20261027';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export const audit=JSON.parse(fs.readFileSync(new URL('../../docs/qa/blackcrown-off-ss10-20261027/early-openings.json',import.meta.url),'utf8'));
export function aggregate(records){
 const targets=IDS.map(userId=>({userId,refund:'0',requests:[],cards:{},acquisitionIds:[]}));
 assert.equal(records.length,15);assert.equal(new Set(records.map(r=>r.requestId)).size,15);
 for(const r of records){
  const t=targets.find(t=>t.userId===r.userId);assert(t);t.refund=(BigInt(t.refund)+BigInt(r.coinCost)).toString();t.requests.push(r.requestId);
  let cards=0;
  for(const [i,d] of r.draws.entries()){
   if(d.outcomeId==='NONE'){assert.equal(d.quantity,0);continue;}
   assert.equal(d.edition,'STANDARD');assert.match(d.mercenaryCode,/^V-0\d\d$/);assert.equal(d.quantity,1);
   t.cards[d.mercenaryCode]=(t.cards[d.mercenaryCode]||0)+d.quantity;cards+=d.quantity;t.acquisitionIds.push({id:r.requestId+':'+i,code:d.mercenaryCode,quantity:d.quantity});
  }
  for(const d of r.normalDraws){assert.equal(d.edition,'STANDARD');assert.match(d.mercenaryCode,/^V-0\d\d$/);assert(Number.isSafeInteger(d.quantity)&&d.quantity>0);t.cards[d.mercenaryCode]=(t.cards[d.mercenaryCode]||0)+d.quantity;cards+=d.quantity;t.acquisitionIds.push({id:r.requestId+':bulk:'+d.mercenaryCode,code:d.mercenaryCode,quantity:d.quantity});}
  assert.equal(cards+(r.missCount??r.draws.filter(d=>d.outcomeId==='NONE').length),r.count);
 }
 for(const t of targets)t.cards=Object.fromEntries(Object.entries(t.cards).sort());
 assert.equal(targets.reduce((n,t)=>n+BigInt(t.refund),0n).toString(),'11049000000000');return targets;
}
export const TARGETS=aggregate(audit.records);
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function sourceEvidence(c){
 const operations=await q(c,'SELECT request_id,user_id::text,kind,status,plan_json FROM joint_operations_v1 WHERE request_id=ANY($1::text[]) ORDER BY request_id',[audit.records.map(r=>r.requestId)]);assert.equal(operations.length,15);
 const coinLogs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[audit.records.map(r=>r.coinLogId)]);assert.equal(coinLogs.length,15);
 const expectedAcquisitions=TARGETS.flatMap(t=>t.acquisitionIds.map(a=>({...a,userId:t.userId})));
 const acquisitions=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) ORDER BY acquisition_id',[expectedAcquisitions.map(a=>a.id)]);assert.equal(acquisitions.length,expectedAcquisitions.length);
 for(const r of audit.records){const o=one(operations.filter(o=>o.request_id===r.requestId)),p=parse(o.plan_json),l=one(coinLogs.filter(l=>l.id===r.coinLogId));assert.equal(o.kind,'MERCENARY_BLACKCROWN_OPEN');assert.equal(o.status,'COMPLETED');assert.equal(o.user_id,r.userId);assert.equal(p.count,r.count);assert.equal(String(p.coinCost),r.coinCost);assert.deepEqual(p.draws,r.draws);assert.deepEqual(p.normalDraws||[],r.normalDraws);assert.equal(p.missCount,r.missCount);assert.equal(l.user_id,r.userId);assert.equal(l.reason,'블랙크라운팩 '+r.requestId);assert.equal(l.change_amount,String(-BigInt(r.coinCost)));}
 for(const a of expectedAcquisitions){const row=one(acquisitions.filter(r=>r.acquisition_id===a.id));assert.equal(String(row.user_id),a.userId);assert.equal(row.mercenary_code,a.code);assert(Number(row.total_copies_after)>=a.quantity);assert.equal(Number(row.duplicate_count_after),Number(row.total_copies_after)-1);}
 return {operations,coinLogs,acquisitions};
}
export async function snapshot(c){
 const s={users:await q(c,"SELECT id::text,nickname,role,status,coin::text,md5((to_jsonb(u)-'coin')::text) AS protected_hash FROM users u WHERE id=ANY($1::bigint[]) ORDER BY id",[IDS])};
 for(const [key,table,order] of [['cards','user_mercenary_cards_v1','user_id,mercenary_code'],['levels','user_mercenary_levels_v1','user_id,mercenary_code'],['growth','user_mercenary_growth_v1','user_id,mercenary_code'],['inventory','cnine_user_inventory','user_id,item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['sync','account_sync_versions_v1','user_id'],['ranked','ranked_duo_accounts_v1','user_id']])s[key]=await q(c,`SELECT * FROM ${table} WHERE user_id=ANY($1::bigint[]) ORDER BY ${order}`,[IDS]);
 s.identities=(await q(c,'SELECT user_id::text,provider,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,provider',[IDS])).map(i=>({userId:i.user_id,hash:hash({provider:i.provider,providerUserId:i.provider_user_id})}));
 s.settings=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[['mercenary_blackcrown_ss_pack_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1',...IDS.map(id=>'mercenary_pvp_loadout_v1:'+id),...IDS.map(id=>'ranked_series_roster_v1:'+id),...IDS.map(id=>'mercenary_experience_transfer_v1:'+id)]]);
 s.packageAccounting=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[IDS.map(id=>'support_package_coin_v1:'+id)]);
 s.stock=await q(c,'SELECT * FROM mercenary_limited_stock_v1 ORDER BY code');s.evidence=await sourceEvidence(c);return JSON.parse(JSON.stringify(s));
}
export function compact(s){return {users:s.users,identities:s.identities,targets:TARGETS.map(t=>({...t,acquisitionIds:undefined,holdings:Object.entries(t.cards).map(([code,reclaim])=>{const owned=Number(s.cards.find(c=>String(c.user_id)===t.userId&&c.mercenary_code===code)?.total_copies||0);return {code,reclaim,owned,remaining:owned-reclaim};})})),snapshotHash:hash(s)};}
export const PLAN=JSON.parse(fs.readFileSync(new URL('../../docs/qa/blackcrown-reversal-20261027/plan.json',import.meta.url),'utf8')),HASH=hash(PLAN);
export function deriveChanges(s){
 assert.deepEqual(PLAN.targets.map(({identity,nickname,...t})=>t),TARGETS);assert.equal(hash(s.evidence),PLAN.sourceEvidenceHash);
 assert.equal(s.users.length,3);assert.equal(s.packageAccounting.length,0,'Package accounting appeared; review funding origin');
 return PLAN.targets.map(t=>{
  const u=one(s.users.filter(u=>u.id===t.userId));assert.equal(u.nickname,t.nickname);assert.equal(u.role,t.userId==='1'?'OWNER':'USER');assert.equal(u.status,'ACTIVE');assert.deepEqual(s.identities.filter(i=>i.userId===t.userId),t.identity);
  const coinAfter=BigInt(u.coin)+BigInt(t.refund);assert(coinAfter<=BigInt(Number.MAX_SAFE_INTEGER)&&BigInt(u.coin)>=0n);
  const cards=Object.entries(t.cards).map(([code,quantity])=>{const h=one(s.cards.filter(h=>String(h.user_id)===t.userId&&h.mercenary_code===code)),before=Number(h.total_copies);assert.equal(Number(h.duplicate_count),before-1);assert(before>quantity,'Insufficient duplicate holdings for '+t.userId+'/'+code);return {code,quantity,before,after:before-quantity};});
  return {userId:t.userId,nickname:t.nickname,coinBefore:u.coin,coinAfter:coinAfter.toString(),refund:t.refund,cards};
 });
}
export function protectedState(s){return {...s,users:s.users.map(({coin,...u})=>u),cards:s.cards.map(c=>{if(!TARGETS.find(t=>t.userId===String(c.user_id))?.cards[c.mercenary_code])return c;const {total_copies,duplicate_count,...rest}=c;return rest;}),sync:undefined,ranked:s.ranked.map(({source_version,updated_at,...r})=>r)};}
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);assert.equal(r.sourceEvidenceHash,PLAN.sourceEvidenceHash);
 const a=one(await q(c,'SELECT admin_id::text,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.auditId]));assert.equal(a.admin_id,'1');assert.equal(a.action_type,'OPS_BLACKCROWN_EARLY_REVERSAL');assert.equal(a.target_id,OP);const {auditId,...payload}=r;assert.deepEqual(parse(a.after_data),payload);
 for(const t of PLAN.targets){const result=one(r.accounts.filter(a=>a.userId===t.userId));assert.equal(BigInt(result.coinAfter)-BigInt(result.coinBefore),BigInt(t.refund));assert.deepEqual(result.cards.map(c=>[c.code,c.quantity]),Object.entries(t.cards));for(const row of result.cards)assert.equal(row.before-row.after,row.quantity);
  const log=one(await q(c,'SELECT user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=$1',[result.coinLogId]));assert.equal(log.user_id,t.userId);assert.equal(log.change_amount,t.refund);assert.equal(log.balance_after,result.coinAfter);assert.equal(log.reason,'블랙크라운팩 오픈 취소 전액 환급 '+OP);assert.equal(log.admin_id,'1');
 }
 assert.equal(hash(await sourceEvidence(c)),PLAN.sourceEvidenceHash);
 if(exact){const s=await snapshot(c);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);for(const a of r.accounts){assert.equal(one(s.users.filter(u=>u.id===a.userId)).coin,a.coinAfter);for(const card of a.cards){const h=one(s.cards.filter(c=>String(c.user_id)===a.userId&&c.mercenary_code===card.code));assert.equal(Number(h.total_copies),card.after);assert.equal(Number(h.duplicate_count),card.after-1);}}}
 return {verified:true,totalRefund:PLAN.totalRefund,totalDraws:PLAN.totalDraws,reclaimedCards:r.accounts.reduce((n,a)=>n+a.cards.reduce((n,c)=>n+c.quantity,0),0),accounts:r.accounts.map(a=>({userId:a.userId,nickname:a.nickname,refund:a.refund,reclaimedCards:a.cards.reduce((n,c)=>n+c.quantity,0),coinLogId:a.coinLogId})),auditId:r.auditId,completedAt:r.completedAt,originalPurchaseHistoryPreserved:true};
}
// Caller owns a single transaction and both account leases for all three accounts.
export async function reverse(c,{leaseToken,lockDeadline}={}){
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,3);
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 ORDER BY user_id',[IDS,leaseToken,OP,Date.now()+5000])).length,3);};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 const before=await snapshot(c),accounts=deriveChanges(before);
 const pack=parse(one(before.settings.filter(s=>s.key==='mercenary_blackcrown_ss_pack_v1')).value);assert.equal(pack.settings.mode,'OFF');
 for(const id of IDS){const accounting=await readPackageCoinAccounting(accountingEnv(c),Number(id));assert.equal(accounting.tracked,false,'Tracked package funds require separate origin reconciliation');assert.equal(accounting.restricted,0);}
 for(const a of accounts){
  const orphan=await q(c,'SELECT id FROM coin_logs WHERE user_id=$1 AND reason=$2',[a.userId,'블랙크라운팩 오픈 취소 전액 환급 '+OP]);assert.equal(orphan.length,0,'Orphan refund ledger');
  for(const card of a.cards)one(await q(c,'UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-$3,duplicate_count=duplicate_count-$3 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=$4 AND duplicate_count=$4-1 RETURNING user_id',[a.userId,card.code,card.quantity,card.before]));
  const wallet=one(await q(c,'UPDATE users SET coin=coin+$2::bigint WHERE id=$1 AND coin=$3::bigint RETURNING coin::text',[a.userId,a.refund,a.coinBefore]));assert.equal(wallet.coin,a.coinAfter);
  a.coinLogId=one(await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES($1,$2,$3,$4,1) RETURNING id::text',[a.userId,a.refund,a.coinAfter,'블랙크라운팩 오픈 취소 전액 환급 '+OP])).id;
 }
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before));
 for(const id of IDS){const b=one(before.sync.filter(r=>String(r.user_id)===id)),a=one(after.sync.filter(r=>String(r.user_id)===id));for(const d of ['wallet','collection'])assert(BigInt(a.domains[d])>BigInt(b.domains[d]));for(const d of Object.keys(b.domains))if(!['wallet','collection'].includes(d))assert.equal(a.domains[d],b.domains[d]);}
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,sourceEvidenceHash:hash(before.evidence),authorization:PLAN.authorization,accounts,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),completedAt:new Date().toISOString(),originalPurchaseHistoryPreserved:true,stockChanged:false,growthChanged:false,loadoutChanged:false};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_BLACKCROWN_EARLY_REVERSAL','USERS',$1,$2,$3) RETURNING id::text",[OP,JSON.stringify(accounts.map(({coinLogId,...a})=>a)),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),r.completedAt]));await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
