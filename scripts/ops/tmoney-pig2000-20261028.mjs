import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OP='ops:tmoney-pig2000:20261028:v1',ACTION='OPS_PIG_COIN_GRANT',IDS=['5147'];
export const TARGET={id:'5147',nickname:'T-Money™',status:'ACTIVE',role:'USER',identityHash:'35fe97106d5fff7ffeeb25a7c64196327dedda8f907ffd336af1f0baa5d75fed'};
export const PLAN={operationKey:OP,authorizations:['T-Money™ 계정에 피그코인 1000개 넣어','1000개더 지급해'],target:TARGET,pigCoins:2000,requestParts:[1000,1000],supersededUnappliedKey:'ops:tmoney-pig1000:20261028:v1',delivery:'DIRECT_WALLET',sendMessages:false};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
export const LEDGER_ID=OP+':pig',SOURCE='OPS_DIRECT_GRANT';
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const settings=['support_package_coin_v1:5147','server_support_v1:5147','support_package_pending_v1:5147','mercenary_pvp_loadout_v1:5147','mercenary_dual_loadout_v2:5147','ranked_series_roster_v1:5147','ops:tmoney-prime-pig:20261026:v1','ops:tmoney-support-package-bogo15:20261026:v1'];
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function snapshot(c){
 const s={};for(const [key,sql,args=[]] of [
  ['user','SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=5147'],
  ['identity','SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=5147'],
  ['pig','SELECT user_id::text,balance::text FROM pig_coin_wallets_v1 WHERE user_id=5147'],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=5147 ORDER BY item_code'],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=5147 ORDER BY mercenary_code'],
  ['levels','SELECT * FROM user_mercenary_levels_v1 WHERE user_id=5147 ORDER BY mercenary_code'],
  ['growth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=5147 ORDER BY mercenary_code'],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=5147'],
  ['settings','SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]],
  ['sync','SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=5147']
 ])s[key]=await q(c,sql,args);
 s.identity=s.identity.map(v=>({identityHash:hash({provider:v.provider,providerUserId:v.provider_user_id})}));return JSON.parse(JSON.stringify(s));
}
export const protectedState=s=>({...s,pig:undefined,sync:undefined});
export async function artifacts(c){return {receipt:await receipt(c),pig:await q(c,'SELECT id,user_id::text,amount::text,balance_after::text,source,reference_id FROM pig_coin_ledger_v1 WHERE id=$1 OR (user_id=5147 AND source=$2 AND reference_id=$3)',[LEDGER_ID,SOURCE,OP]),audit:await q(c,'SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])};}
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);assert.equal(BigInt(r.pig.after)-BigInt(r.pig.before),2000n);
 const a=await artifacts(c);assert.deepEqual(a.receipt,r);assert.deepEqual(one(a.pig),{id:LEDGER_ID,user_id:TARGET.id,amount:'2000',balance_after:r.pig.after,source:SOURCE,reference_id:OP});
 const audit=one(a.audit),{auditId,...payload}=r;assert.equal(audit.id,auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,OP);assert.deepEqual(parse(audit.before_data),{pigCoins:r.pig.before});assert.deepEqual(parse(audit.after_data),payload);
 assert.equal(BigInt(r.syncAfter.revision),BigInt(r.syncBefore.revision)+1n);assert.equal(r.syncAfter.domains.wallet,r.syncAfter.revision);for(const domain of Object.keys(r.syncBefore.domains))if(domain!=='wallet')assert.equal(r.syncAfter.domains[domain],r.syncBefore.domains[domain]);
 const current=one(await q(c,'SELECT balance::text FROM pig_coin_wallets_v1 WHERE user_id=5147')).balance;
 if(exact){assert.equal(current,r.pig.after);assert.equal(hash(protectedState(await snapshot(c))),r.protectedBeforeHash);}
 return {status:'VERIFIED',userId:TARGET.id,nickname:TARGET.nickname,pigCoins:2000,before:r.pig.before,after:r.pig.after,currentBalance:current,ledgerId:LEDGER_ID,auditId:r.auditId,completedAt:r.completedAt};
}
// Caller owns the transaction, production USER_LOCK, and matching SQL lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.equal(PLAN.pigCoins,2000);assert.equal(PLAN.requestParts.reduce((a,b)=>a+b,0),PLAN.pigCoins);assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=5147 FOR UPDATE'));one(await q(c,'SELECT id FROM users WHERE id=5147 FOR UPDATE'));
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=5147 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=5147 FOR SHARE');await q(c,'SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=5147 FOR UPDATE');
 const before=await snapshot(c),user=one(before.user);for(const key of ['id','nickname','status','role'])assert.equal(user[key],TARGET[key]);assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,TARGET.id);one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const existing=await artifacts(c);assert.equal(existing.receipt,null);assert.equal(existing.pig.length,0,'Orphan pig grant');assert.equal(existing.audit.length,0,'Orphan audit');
 assert.equal((await q(c,'SELECT key FROM app_meta WHERE key=$1',[PLAN.supersededUnappliedKey])).length,0,'Original request was already applied');
 assert.equal((await q(c,'SELECT id FROM pig_coin_ledger_v1 WHERE user_id=5147 AND source=$1 AND reference_id=$2',[SOURCE,PLAN.supersededUnappliedKey])).length,0,'Original request ledger exists');
 const pigBefore=String(before.pig[0]?.balance||0);assert(BigInt(pigBefore)>=0n&&BigInt(pigBefore)+2000n<=1000000000000n);
 const now=new Date().toISOString();
 const pigAfter=one(await q(c,'INSERT INTO pig_coin_wallets_v1(user_id,balance) VALUES(5147,2000) ON CONFLICT(user_id) DO UPDATE SET balance=pig_coin_wallets_v1.balance+2000 WHERE pig_coin_wallets_v1.balance+2000<=1000000000000 RETURNING balance::text')).balance;assert.equal(BigInt(pigAfter)-BigInt(pigBefore),2000n);
 one(await q(c,'INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) VALUES($1,5147,2000,$2,$3,$4,$5) RETURNING id',[LEDGER_ID,pigAfter,SOURCE,OP,now]));
 one(await q(c,"UPDATE account_sync_versions_v1 SET revision=revision+1,domains=domains||jsonb_build_object('wallet',(revision+1)::text),updated_at=clock_timestamp() WHERE user_id=5147 RETURNING user_id"));
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before));
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,pig:{before:pigBefore,after:pigAfter,ledgerId:LEDGER_ID},protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:one(before.sync),syncAfter:one(after.sync)};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({pigCoins:pigBefore}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verification=await verify(c,r,{exact:true});await lease();return {replayed:false,receipt:r,verification};
}
