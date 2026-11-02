import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import plan from './plan.json' with {type:'json'};
import {state as baseState} from '../tmoney-master-star-10b-20261103/grant.mjs';
import {publicAccountRank} from '../../output/revan-live-20261027/release-checkout/functions/_account_rank.js';
import {rankLevelTicks} from '../../output/revan-live-20261027/release-checkout/functions/_account_rank_curve.js';
export const PLAN=plan,OP='ops:tmoney-major1:20261103:v1',IDS=['5147'],ACTION='OPS_TMONEY_RANK_MAJOR1';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH='4ada07f7ebed0fbe3b9d1c3853de15d93acec77b711328b3c26ebb2c3b901242';
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(PLAN.operationKey,OP);assert.equal(PLAN.recipientCount,1);assert.equal(PLAN.recipients.length,1);assert.equal(PLAN.recipients[0].userId,'5147');assert.equal(PLAN.recipients[0].nickname,'T-Money™');assert.equal(PLAN.sendMessages,false);
 assert.equal(PLAN.targetLevel,170);assert.equal(PLAN.targetCode,'MAJOR');assert.equal(PLAN.rankStep,1);assert.equal(PLAN.targetTicks,String(rankLevelTicks(170)));assert.equal(publicAccountRank(PLAN.targetTicks).code,'MAJOR');assert.equal(publicAccountRank(PLAN.targetTicks).progress.current,0);
}
export async function verifyCode(){for(const [file,expected] of Object.entries(PLAN.codeHashes))assert.equal(createHash('sha256').update(await readFile(new URL('../../output/revan-live-20261027/release-checkout/'+file,import.meta.url))).digest('hex'),expected,'Rank runtime changed: '+file);}
export async function state(c){return {...await baseState(c),rankReceipts:await q(c,'SELECT COUNT(*)::text count,COALESCE(SUM(ticks),0)::text total_ticks,MAX(created_at) latest FROM account_rank_receipts_v1 WHERE user_id=5147'),rankPresets:await q(c,'SELECT * FROM account_rank_presets_v1 WHERE user_id=5147 ORDER BY slot'),rankIdle:await q(c,'SELECT * FROM account_rank_idle_cursor_v1 WHERE user_id=5147')};}
export const protectedState=s=>({...s,rank:undefined,sync:undefined});
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),audits:await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE id>$1::bigint AND action_type=$2 AND target_id=$3 ORDER BY id',[PLAN.auditFloor,ACTION,OP])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.afterTicks,PLAN.targetTicks);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);assert.deepEqual(r.afterRank,publicAccountRank(r.afterTicks));assert.equal(r.afterRank.level,170);assert.equal(r.afterRank.code,'MAJOR');assert.equal(r.afterRank.progress.current,0);assert.equal(r.deltaTicks,String(BigInt(r.afterTicks)-BigInt(r.beforeTicks)));
 const a=await artifacts(c);assert.deepEqual(a.receipt,r);const audit=one(a.audits);assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...body}=r;assert.deepEqual(parse(audit.after_data),body);
 if(exact){const s=await state(c);assert.equal(one(s.rank).total_ticks,r.afterTicks);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);}
 return {verified:true,userId:'5147',nickname:'T-Money™',code:'MAJOR',name:'소령',level:170,rankStep:1,progressAtChange:0,auditId:r.auditId,completedAt:r.completedAt};
}
// Caller owns the transaction, live USER_LOCK and database lease. Historical XP receipts remain unchanged.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate();assert.equal(expected,HASH);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(leaseToken||'',/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account leases required');await verifyCode();
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const leases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,1,'Missing account lease');};
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);one(await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]));await leases();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);one(await q(c,'SELECT user_id FROM account_rank_progress_v1 WHERE user_id=5147 FOR UPDATE'));
 const before=await state(c),target=one(PLAN.recipients),u=one(before.users);assert.equal(u.id,target.userId);for(const k of ['nickname','role','status','identityHash'])assert.equal(u[k],target[k],`Recipient ${k} changed`);assert.equal(u.status,'ACTIVE');assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[target.nickname])).id,target.userId);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));const prior=await artifacts(c);assert.equal(prior.receipt,null);assert.equal(prior.audits.length,0);
 const old=one(before.rank),now=new Date().toISOString();assert.notEqual(old.total_ticks,PLAN.targetTicks,'Account already at exact target; investigate instead of replaying a new operation');
 one(await q(c,'UPDATE account_rank_progress_v1 SET total_ticks=$1::bigint,updated_at=$2 WHERE user_id=5147 AND total_ticks=$3::bigint RETURNING user_id',[PLAN.targetTicks,now,old.total_ticks]));
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before),'Unrelated state changed');assert.equal(one(after.rank).total_ticks,PLAN.targetTicks);
 const b=one(before.sync),a=one(after.sync);assert.equal(BigInt(a.revision),BigInt(b.revision)+1n,'Wallet sync must advance exactly once');assert.equal(a.domains.wallet,a.revision);assert.deepEqual({...a.domains,wallet:undefined},{...b.domains,wallet:undefined});
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,userId:'5147',nickname:target.nickname,beforeTicks:old.total_ticks,afterTicks:PLAN.targetTicks,deltaTicks:String(BigInt(PLAN.targetTicks)-BigInt(old.total_ticks)),beforeRank:publicAccountRank(old.total_ticks),afterRank:publicAccountRank(PLAN.targetTicks),protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:before.sync,syncAfter:after.sync,messagesSent:0};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({totalTicks:old.total_ticks,rank:r.beforeRank,protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await leases();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
