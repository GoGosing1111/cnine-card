import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PLAN=Object.freeze({userId:5426,nickname:'나무늘봉순',identityHash:'69c6531bf6abf3c4ab04cfd6595ca6e3ca18c75f24dde6e32ce4ea1eb25cba98',code:'V-974',name:'제너럴 족',quantity:1,expiresAt:'2026-10-26T05:00:00+09:00',stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',automaticLoadout:false,authorization:'나무늘봉순 계정에 예외처리로 제너럴족 지급하고 5시에 회수해'});
export const GRANT='ops:bongsoon:general-jok:loan:20261026:v1',REVOKE='ops:bongsoon:general-jok:revoke:20261026:v1';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const HASH=hash(PLAN),DEADLINE=Date.parse(PLAN.expiresAt),PVP_KEY='mercenary_pvp_loadout_v1:'+PLAN.userId;
const q=async(c,s,p=[])=>(await c.query(s,p)).rows,one=a=>(assert.equal(a.length,1,'Expected exactly one row'),a[0]);
const SETTINGS=['mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_bloodmoon_ss_pack_v1','sss_miracle_cube_policy_20261021_v1'];
export async function receipt(c,key){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[key]);return r.length?JSON.parse(one(r).value):null;}
export async function state(c){
 const user=one(await q(c,'SELECT id::text,nickname,role,status,md5(to_jsonb(u)::text) AS row_hash FROM users u WHERE id=$1',[PLAN.userId]));
 const identities=(await q(c,'SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=$1 ORDER BY provider',[PLAN.userId])).map(v=>hash({provider:v.provider,providerUserId:v.provider_user_id}));
 const result={user,identities};
 for(const [name,table,order] of [['cards','user_mercenary_cards_v1','mercenary_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code'],['levels','user_mercenary_levels_v1','mercenary_code'],['inventory','cnine_user_inventory','item_code']])result[name]=await q(c,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[PLAN.userId]);
 result.pvp=await q(c,'SELECT key,value FROM app_meta WHERE key=$1',[PVP_KEY]);
 result.settings=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]);
 result.stock=await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code]);
 result.issues=await q(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[PLAN.code]);
 return result;
}
function protect(before,after,{loadout=false}={}){
 for(const key of ['user','identities','growth','levels','inventory','settings','stock','issues',...(loadout?[]:['loadout','pvp'])])assert.deepEqual(after[key],before[key],key+' unexpectedly changed');
 assert.deepEqual(after.cards.filter(c=>c.mercenary_code!==PLAN.code),before.cards.filter(c=>c.mercenary_code!==PLAN.code),'Other mercenaries changed');
}
async function lock(c,expected,{lockDeadline,leaseToken}={}){
 assert.equal(expected,HASH,'Reviewed plan required');assert(lockDeadline>Date.now()+15000,'Account lease required');assert.match(leaseToken||'',/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[GRANT]);
 one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[PLAN.userId,leaseToken,GRANT,Date.now()+5000]));
 const u=one(await q(c,'SELECT id,nickname,role,status FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));assert.equal(u.nickname,PLAN.nickname);assert.equal(u.role,'USER');assert.equal(u.status,'ACTIVE');
 assert.equal(Number(one(await q(c,'SELECT id FROM users WHERE nickname=$1',[PLAN.nickname])).id),PLAN.userId);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[PLAN.userId]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
}
async function record(c,key,before,data){
 const r={status:'COMPLETED',operationKey:key,planHash:HASH,plan:PLAN,completedAt:new Date().toISOString(),...data};
 const a=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[key===GRANT?'OPS_MERCENARY_TEMPORARY_GRANT':'OPS_MERCENARY_TEMPORARY_REVOKE',String(PLAN.userId),JSON.stringify(before),JSON.stringify(r)]));
 r.auditId=a.id;one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[key,JSON.stringify(r),r.completedAt]));return r;
}
export async function verify(c,{allowMissing=false}={}){
 const granted=await receipt(c,GRANT),revoked=await receipt(c,REVOKE);assert.equal(granted?.planHash,HASH);assert.equal(granted.copiesBefore,0);assert.equal(granted.copiesAfter,1);
 const acquired=one(await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT]));
 assert.equal(Number(acquired.user_id),PLAN.userId);assert.equal(acquired.mercenary_code,PLAN.code);assert.equal(Number(acquired.is_duplicate),0);assert.equal(Number(acquired.total_copies_after),1);assert.equal(Number(acquired.duplicate_count_after),0);assert.equal(acquired.created_at,granted.acquiredAt);
 for(const r of [granted,revoked].filter(Boolean)){
  assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.status,'COMPLETED');
  const a=one(await q(c,'SELECT admin_id::text,after_data FROM admin_logs WHERE id=$1',[r.auditId]));assert.equal(a.admin_id,'1');const {auditId,...data}=r;assert.deepEqual(JSON.parse(a.after_data),data);
 }
 const holdings=await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code]);assert(holdings.length<=1);
 const copies=Number(holdings[0]?.total_copies||0);if(copies)assert.equal(Number(holdings[0].duplicate_count),copies-1);
 if(revoked){assert.equal(revoked.sourceGrantKey,GRANT);assert.equal(revoked.removed,Math.min(1,revoked.copiesBefore));assert.equal(revoked.copiesAfter,Math.max(0,revoked.copiesBefore-1));}
 else if(!allowMissing)assert(copies>=1,'Temporary holding is missing');
 return {verified:true,userId:PLAN.userId,nickname:PLAN.nickname,code:PLAN.code,currentCopies:copies,granted:true,revoked:Boolean(revoked),expiresAt:PLAN.expiresAt,grantAuditId:granted.auditId,revokeAuditId:revoked?.auditId||null,removed:revoked?.removed||0,stockCountersChanged:false};
}
// Caller owns the transaction and both the live USER_LOCK and PostgreSQL lease.
export async function grant(c,expected,options={}){
 assert.equal(expected,HASH);const old=await receipt(c,GRANT);if(old)return {replayed:true,receipt:old,verification:await verify(c)};
 await lock(c,expected,options);assert.equal(await receipt(c,REVOKE),null,'Loan already revoked');assert(Date.now()<DEADLINE,'Loan period ended');
 const before=await state(c);assert.deepEqual(before.identities,[PLAN.identityHash]);assert.equal(before.cards.some(x=>x.mercenary_code===PLAN.code),false,'Unexpected existing holding');
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT])).length,0,'Orphan acquisition');
 const now=new Date().toISOString();
 one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) RETURNING user_id',[PLAN.userId,PLAN.code,now]));
 one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4) RETURNING acquisition_id',[GRANT,PLAN.userId,PLAN.code,now]));
 const after=await state(c);protect(before,after);assert.equal(Number(one(after.cards.filter(x=>x.mercenary_code===PLAN.code)).total_copies),1);
 const r=await record(c,GRANT,{holding:null},{copiesBefore:0,copiesAfter:1,acquiredAt:now,automaticLoadout:false,stockChanged:false,protectedHash:hash({...before,cards:before.cards.filter(x=>x.mercenary_code!==PLAN.code)})});
 assert(options.lockDeadline>Date.now()+5000);return {replayed:false,receipt:r,verification:await verify(c)};
}
export async function revoke(c,expected,options={}){
 assert.equal(expected,HASH);const old=await receipt(c,REVOKE);if(old)return {replayed:true,receipt:old,verification:await verify(c)};
 // previewClock is solely for rolled-back validation; the production runner never accepts it from CLI.
 assert((options.previewClock??Date.now())>=DEADLINE,'Not yet 05:00 KST');
 await lock(c,expected,options);const source=await receipt(c,GRANT);assert.equal(source?.planHash,HASH);await verify(c,{allowMissing:true});
 await q(c,'SELECT user_id FROM user_mercenary_loadout_v1 WHERE user_id=$1 FOR UPDATE',[PLAN.userId]);await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[PVP_KEY]);
 const before=await state(c);assert.deepEqual(before.identities,[PLAN.identityHash]);
 const holding=before.cards.find(c=>c.mercenary_code===PLAN.code),count=Number(holding?.total_copies||0),remaining=Math.max(0,count-1),now=new Date().toISOString(),cleared=[];
 if(count===1)one(await q(c,'DELETE FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=1 RETURNING user_id',[PLAN.userId,PLAN.code]));
 else if(count>1)one(await q(c,'UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-1,duplicate_count=duplicate_count-1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=$3 RETURNING user_id',[PLAN.userId,PLAN.code,count]));
 const expectedLoadout=structuredClone(before.loadout),expectedPvp=structuredClone(before.pvp);
 if(remaining===0){
  const pve=expectedLoadout[0],pvp=expectedPvp[0]?JSON.parse(expectedPvp[0].value):null;
  if(pve?.mercenary_code===PLAN.code){one(await q(c,'UPDATE user_mercenary_loadout_v1 SET mercenary_code=NULL,revision=revision+1,updated_at=$1 WHERE user_id=$2 RETURNING user_id',[now,PLAN.userId]));pve.mercenary_code=null;pve.revision=Number(pve.revision)+1;pve.updated_at=now;cleared.push('PVE');if(!pvp)cleared.push('PVP');}
  if(pvp?.mercenaryCode===PLAN.code){const value=JSON.stringify({...pvp,mercenaryCode:null,revision:Number(pvp.revision||0)+1});one(await q(c,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 RETURNING key',[value,now,PVP_KEY]));expectedPvp[0].value=value;cleared.push('PVP');if(pve){await q(c,'UPDATE user_mercenary_loadout_v1 SET updated_at=$1 WHERE user_id=$2',[now,PLAN.userId]);pve.updated_at=now;}}
 }
 const after=await state(c);protect(before,after,{loadout:true});assert.deepEqual(after.loadout,expectedLoadout);assert.deepEqual(after.pvp,expectedPvp);
 assert.equal(Number(after.cards.find(c=>c.mercenary_code===PLAN.code)?.total_copies||0),remaining);
 const r=await record(c,REVOKE,{holding:holding||null,loadout:before.loadout,pvp:before.pvp},{sourceGrantKey:GRANT,sourceGrantAuditId:source.auditId,copiesBefore:count,copiesAfter:remaining,removed:count?1:0,clearedModes:cleared,grantHistoryPreserved:true,stockChanged:false});
 assert(options.lockDeadline>Date.now()+5000);return {replayed:false,receipt:r,verification:await verify(c)};
}
