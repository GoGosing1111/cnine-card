import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import frozenSource from './source.json' with {type:'json'};
export const PLAN=plan,OP='ops:playdk-october-top30:coin100t:20261031:v1',ACTION='OPS_PLAYDK_OCTOBER_TOP30_COIN100T';
export const IDS=PLAN.targets.map(t=>t.id).sort((a,b)=>Number(a)-Number(b)),AMOUNT='100000000000000',REASON='DK 리버스콜 10월 글 작성 상위 30명 보상 · 100조 코인 · '+OP;
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH='355c8a9a9b12d79ffee898d77a8ed89493afc67e1a3f25090e84e013605f90cb';
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(PLAN.operationKey,OP);assert.equal(PLAN.delivery,'DIRECT');assert.equal(PLAN.currency,'COIN');assert.equal(PLAN.sendMessages,false);
 assert.equal(PLAN.amountPerUser,AMOUNT);assert.equal(PLAN.totalAmount,'3000000000000000');assert.equal(PLAN.targets.length,30);
 assert.equal(hash(frozenSource),PLAN.sourceHash);assert.equal(frozenSource.selected.length,30);assert.equal(new Set(IDS).size,30);
 assert.equal(PLAN.dateKst,'2026-10-31');assert.equal(PLAN.sourceStart,'2026-10-01T00:00:00+09:00');assert.equal(PLAN.sourceCutoff,'2026-10-31T15:58:32+09:00');
 assert.deepEqual(PLAN.targets.map(t=>({uuid:t.dkUuid,rank:t.rank,position:t.position,name:t.dkName,postCount:t.postCount})),frozenSource.selected.map(t=>({uuid:t.uuid,rank:t.rank,position:t.position,name:t.name,postCount:t.postCount})));
 for(const t of PLAN.targets){assert.equal(t.amount,AMOUNT);assert.equal(t.identityHash,hash({provider:'PLAYDK',providerUserId:t.dkUuid}));}
 assert.deepEqual(PLAN.recipients.map(t=>t.userId),PLAN.targets.map(t=>t.id));
}
export async function snapshot(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  loadouts:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  accounting:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key='support_package_coin_v1:'||u.id::text OR key='mercenary_pvp_loadout_v1:'||u.id::text OR key='ranked_series_roster_v1:'||u.id::text) ORDER BY key"
 };
 const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${arr(sql)}`).join(',')}) data`,[IDS])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
export const protectedState=s=>({...s,users:s.users.map(({coin,...u})=>u),sync:undefined});
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),coins:await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id>$1::bigint AND user_id=ANY($2::bigint[]) AND reason=$3 ORDER BY user_id',[PLAN.logFloor.coins,IDS,REASON]),audits:await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE id>$1::bigint AND action_type=$2 AND target_id=$3 ORDER BY id',[PLAN.logFloor.audit,ACTION,OP])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.totalAmount,PLAN.totalAmount);assert.equal(r.grants.length,30);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const a=await artifacts(c);assert.deepEqual(a.receipt,r);assert.equal(a.coins.length,30);const audit=one(a.audits);assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...body}=r;assert.deepEqual(parse(audit.after_data),body);
 for(const t of PLAN.targets){const g=one(r.grants.filter(g=>g.userId===t.id)),log=one(a.coins.filter(l=>l.user_id===t.id));assert.equal(g.nickname,t.nickname);assert.equal(g.amount,AMOUNT);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(AMOUNT));assert.equal(log.id,g.logId);assert.equal(log.change_amount,AMOUNT);assert.equal(log.balance_after,g.after);assert.equal(log.reason,REASON);assert.equal(log.admin_id,'1');}
 if(exact){const s=await snapshot(c);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);for(const g of r.grants)assert.equal(one(s.users.filter(u=>u.id===g.userId)).coin,g.after);}
 return {verified:true,recipients:30,amountPerUser:AMOUNT,totalAmount:PLAN.totalAmount,grants:r.grants.map(g=>({userId:g.userId,nickname:g.nickname,amount:g.amount,logId:g.logId})),coinLogs:30,auditRecords:1,auditId:r.auditId,completedAt:r.completedAt};
}
// The caller owns the transaction and live USER_LOCK plus database leases.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate();assert.equal(expected,HASH);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(leaseToken||'',/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account leases required');
 assert.equal(one(await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst")).kst,PLAN.dateKst,'Authorization date changed');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const leases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,30,'Missing account lease');};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,30);await leases();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 const before=await snapshot(c);assert.equal(before.users.length,30);
 for(const t of PLAN.targets){const u=one(before.users.filter(u=>u.id===t.id));for(const k of ['nickname','role','status','identityHash'])assert.equal(u[k],t[k],`Recipient ${t.id} ${k} changed`);assert.equal(u.status,'ACTIVE');assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported resulting balance');}
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[]) ORDER BY id',[PLAN.targets.map(t=>t.nickname)]);assert.equal(exact.length,30);for(const t of PLAN.targets)assert.equal(one(exact.filter(u=>u.nickname===t.nickname)).id,t.id);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));const prior=await artifacts(c);assert.equal(prior.receipt,null);assert.equal(prior.coins.length,0);assert.equal(prior.audits.length,0);
 const now=new Date().toISOString(),grants=[];
 for(const t of PLAN.targets){
  const old=one(before.users.filter(u=>u.id===t.id)).coin;
  const current=one(await q(c,'UPDATE users SET coin=coin+$1::bigint WHERE id=$2::bigint AND coin=$3::bigint RETURNING coin::text',[AMOUNT,t.id,old])).coin;
  assert.equal(BigInt(current)-BigInt(old),BigInt(AMOUNT));
  const log=one(await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) VALUES($1,$2,$3,$4,1,$5) RETURNING id::text',[t.id,AMOUNT,current,REASON,now]));
  grants.push({userId:t.id,nickname:t.nickname,amount:AMOUNT,before:old,after:current,logId:log.id});
 }
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before));
 for(const id of IDS){const b=one(before.sync.filter(s=>s.user_id===id)),a=one(after.sync.filter(s=>s.user_id===id));assert(BigInt(a.domains.wallet)>BigInt(b.domains.wallet||0),'Wallet sync did not advance');}
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,totalAmount:PLAN.totalAmount,grants,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:before.sync,syncAfter:after.sync,messagesSent:0};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_GROUP',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({balances:grants.map(g=>({userId:g.userId,coin:g.before})),protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await leases();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
