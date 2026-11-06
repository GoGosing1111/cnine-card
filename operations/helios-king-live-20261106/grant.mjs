import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,IDS=[PLAN.target.id],CODE='V-966',ACTION='OPS_MERCENARY_EXEMPT_GRANT';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected one row'),r[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v,aid=OP+':1:V-966:1';
const SETTINGS=['mercenary_level_policy_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_blackcrown_ss_pack_v1','mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1'];
function validate(expected=HASH){
 assert.equal(expected,HASH,'Reviewed plan required');assert.equal(OP,'ops:pingdu-helios-king-grant:20261106:v1');
 assert.deepEqual(PLAN.target,{id:'1',nickname:'핑크빛유두',role:'OWNER',status:'ACTIVE',identityHash:'4e20330d91fbd5e52c5a21fa720d69468fcf0d7952b847d8787df45edf81c305'});
 assert.equal(PLAN.authorization,'핑크빛유두 헬리오스 킹 1장 지급');assert.equal(PLAN.quantity,1);assert.equal(PLAN.expectedHolding,null);
 assert.deepEqual([PLAN.code,PLAN.name,PLAN.rank,PLAN.edition],[CODE,'헬리오스 킹','SSS','LIMITED']);
 assert.equal(PLAN.levelPolicy,'PRESERVE_EXISTING_DEFAULT_ONE');assert.equal(PLAN.stockPolicy,'DIRECT_NO_PUBLIC_ACQUISITION');
 assert.equal(PLAN.cost,0);assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.automaticLoadout,false);
}
export async function snapshot(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  ranked:'SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$2 ORDER BY code',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$2 ORDER BY code,serial',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  accountSettings:"SELECT key,value FROM app_meta WHERE key LIKE '%:1' OR key LIKE 'mercenary%:1:%' ORDER BY key"
 };
 const arr=s=>`COALESCE((SELECT jsonb_agg(t) FROM (${s}) t),'[]'::jsonb)`;
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) data`,[IDS,CODE,SETTINGS])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
export const protectedState=s=>({...s,cards:s.cards.filter(x=>x.mercenary_code!==CODE),sync:undefined,ranked:undefined});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),audit:await q(c,'SELECT id::text FROM admin_logs WHERE target_id=$1',[OP]),acquisitions:await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%'])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.deepEqual(await receipt(c),r);
 assert.equal(r.quantity,1);assert.equal(r.copiesBefore,0);assert.equal(r.copiesAfter,1);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await snapshot(c),a=one((await artifacts(c)).acquisitions);assert.equal(a.acquisition_id,aid);assert.equal(String(a.user_id),'1');assert.equal(a.mercenary_code,CODE);assert.equal(Number(a.is_duplicate),0);assert.equal(Number(a.total_copies_after),1);assert.equal(Number(a.duplicate_count_after),0);assert.equal(a.created_at,r.completedAt);
 const audit=one(await q(c,'SELECT id::text,admin_id::text,action_type,target_type,after_data FROM admin_logs WHERE target_id=$1',[OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 const holding=s.cards.find(x=>x.mercenary_code===CODE)||null;
 if(exact){assert.equal(Number(holding?.total_copies),1);assert.equal(Number(holding.duplicate_count),0);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);}
 assert.equal(BigInt(one(r.syncAfter).revision),BigInt(one(r.syncBefore).revision)+1n);assert.equal(one(r.syncAfter).domains.collection,one(r.syncAfter).revision);
 return {status:'VERIFIED',userId:'1',nickname:'핑크빛유두',code:CODE,name:'헬리오스 킹',quantityGranted:1,copiesBefore:0,copiesAfter:1,currentCopies:Number(holding?.total_copies||0),auditId:r.auditId,completedAt:r.completedAt,acquisitionRecords:1,protectedStatePreserved:true};
}
// Caller holds both production account leases and owns the SQL transaction.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate(expected);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account lease required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS[0],leaseToken,OP,Date.now()+5000]));};
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=$1 FOR UPDATE',IDS));one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',IDS));await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',IDS);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code FOR UPDATE',IDS);
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 const before=await snapshot(c),u=one(before.users);for(const k of Object.keys(PLAN.target))assert.equal(u[k],PLAN.target[k],`Recipient ${k} changed`);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',['핑크빛유두'])).id,'1');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 assert.equal(before.cards.filter(x=>x.mercenary_code===CODE).length,0,'Holding changed since inspection');assert.equal(before.stock.length,0);assert.equal(before.issues.length,0);
 const prior=await artifacts(c);assert.equal(prior.receipt,null);assert.equal(prior.audit.length,0);assert.equal(prior.acquisitions.length,0);
 const now=new Date().toISOString();
 one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) RETURNING user_id',[IDS[0],CODE,now]));
 one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4) RETURNING acquisition_id',[aid,IDS[0],CODE,now]));
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before),'Protected account state changed');
 assert.equal(BigInt(one(after.sync).revision),BigInt(one(before.sync).revision)+1n);for(const k of Object.keys(one(before.sync).domains))if(k!=='collection')assert.equal(one(after.sync).domains[k],one(before.sync).domains[k]);
 if(before.ranked.length)assert.equal(BigInt(one(after.ranked).source_version),BigInt(one(before.ranked).source_version)+1n);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,quantity:1,copiesBefore:0,copiesAfter:1,holdingBefore:null,holdingAfter:one(after.cards.filter(x=>x.mercenary_code===CODE)),syncBefore:before.sync,syncAfter:after.sync,rankedBefore:before.ranked,rankedAfter:after.ranked,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after))};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({holding:null,protectedHash:r.protectedBeforeHash}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
