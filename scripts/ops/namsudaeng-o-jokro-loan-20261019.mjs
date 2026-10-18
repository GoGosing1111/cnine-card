import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PLAN=Object.freeze({userId:5950,nickname:'남수댕ㅗ',code:'V-979',name:'족로',quantity:1,expiresAt:'2026-10-19T04:00:00+09:00',authorization:'남수댕ㅗ 족로 용병 지급하고 4시에 회수해'});
export const GRANT='ops:namsudaeng-o:jokro:loan:20261019:v1',REVOKE='ops:namsudaeng-o:jokro:revoke:20261019:v1';
export const HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),DEADLINE=Date.parse(PLAN.expiresAt);
const q=async(c,s,p=[])=>(await c.query(s,p)).rows;
const one=a=>{assert.equal(a.length,1,'Expected exactly one row');return a[0];};
const key='mercenary_pvp_loadout_v1:'+PLAN.userId;
export const receipt=async(c,k)=>{const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[k]);return r[0]?JSON.parse(r[0].value):null;};
export async function state(c){
 const user=one(await q(c,'SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',[PLAN.userId]));
 const tables={};
 for(const [n,t,o]of [['cards','user_mercenary_cards_v1','mercenary_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code'],['levels','user_mercenary_levels_v1','mercenary_code'],['inventory','cnine_user_inventory','item_code']])tables[n]=await q(c,`SELECT * FROM ${t} WHERE user_id=$1 ORDER BY ${o}`,[PLAN.userId]);
 return {user,...tables,pvp:await q(c,'SELECT key,value FROM app_meta WHERE key=$1',[key]),stock:await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code]),issues:await q(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[PLAN.code])};
}
function protect(before,after,allowLoadout=false){
 for(const k of ['user','growth','levels','inventory','stock','issues',...allowLoadout?[]:['loadout','pvp']])assert.deepEqual(after[k],before[k],k+' unexpectedly changed');
 assert.deepEqual(after.cards.filter(x=>x.mercenary_code!==PLAN.code),before.cards.filter(x=>x.mercenary_code!==PLAN.code));
}
async function lock(c,expectedHash,lockDeadline){
 assert.equal(expectedHash,HASH);assert.ok(lockDeadline>Date.now()+15000,'Account lease required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[GRANT]);
 const u=one(await q(c,'SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
 assert.equal(u.nickname,PLAN.nickname);assert.equal(u.status,'ACTIVE');
 assert.equal(String(one(await q(c,'SELECT id FROM users WHERE nickname=$1',[PLAN.nickname])).id),String(PLAN.userId));
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]);
}
async function record(c,operationKey,before,data){
 const r={status:'COMPLETED',operationKey,planHash:HASH,plan:PLAN,completedAt:new Date().toISOString(),...data};
 const a=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[operationKey===GRANT?'OPS_MERCENARY_TEMPORARY_GRANT':'OPS_MERCENARY_TEMPORARY_REVOKE',String(PLAN.userId),JSON.stringify(before),JSON.stringify(r)]));
 r.adminLogId=a.id;one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[operationKey,JSON.stringify(r),r.completedAt]));return r;
}
export async function grant(c,expectedHash,{lockDeadline}={}){
 await lock(c,expectedHash,lockDeadline);
 assert.equal(await receipt(c,REVOKE),null,'Loan already revoked; do not grant again');
 const old=await receipt(c,GRANT);if(old)return {replayed:true,receipt:old};
 assert.ok(Date.now()<DEADLINE,'Loan period already ended');
 const before=await state(c);assert.equal(before.cards.some(x=>x.mercenary_code===PLAN.code),false,'Unexpected existing holding');
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT])).length,0);
 const now=new Date().toISOString();
 one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) RETURNING user_id',[PLAN.userId,PLAN.code,now]));
 one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4) RETURNING acquisition_id',[GRANT,PLAN.userId,PLAN.code,now]));
 const after=await state(c);protect(before,after);assert.equal(Number(one(after.cards.filter(x=>x.mercenary_code===PLAN.code)).total_copies),1);
 const r=await record(c,GRANT,{holding:null},{copiesBefore:0,copiesAfter:1,acquiredAt:now,automaticLoadout:false,stockChanged:false});
 assert.ok(lockDeadline>Date.now()+5000);return {replayed:false,receipt:r};
}
export async function revoke(c,expectedHash,{lockDeadline,previewClock}={}){
 await lock(c,expectedHash,lockDeadline);
 const old=await receipt(c,REVOKE);if(old)return {replayed:true,receipt:old};
 assert.ok((previewClock??Date.now())>=DEADLINE,'Not yet 04:00 KST');
 const source=await receipt(c,GRANT);assert.equal(source?.planHash,HASH);assert.equal(source?.copiesAfter,1);assert.equal(source?.copiesBefore,0);
 const acquired=one(await q(c,'SELECT user_id,mercenary_code FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT]));assert.equal(Number(acquired.user_id),PLAN.userId);assert.equal(acquired.mercenary_code,PLAN.code);
 await q(c,'SELECT user_id FROM user_mercenary_loadout_v1 WHERE user_id=$1 FOR UPDATE',[PLAN.userId]);await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[key]);
 const before=await state(c),holding=before.cards.find(x=>x.mercenary_code===PLAN.code),count=Number(holding?.total_copies||0),remaining=Math.max(0,count-1),now=new Date().toISOString(),cleared=[];
 if(count===1)one(await q(c,'DELETE FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=1 RETURNING user_id',[PLAN.userId,PLAN.code]));
 else if(count>1)one(await q(c,'UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-1,duplicate_count=duplicate_count-1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=$3 RETURNING user_id',[PLAN.userId,PLAN.code,count]));
 if(remaining===0){
  const legacy=before.loadout[0],pvp=before.pvp[0]?JSON.parse(before.pvp[0].value):null;
  if(legacy?.mercenary_code===PLAN.code){one(await q(c,'UPDATE user_mercenary_loadout_v1 SET mercenary_code=NULL,revision=revision+1,updated_at=$1 WHERE user_id=$2 RETURNING user_id',[now,PLAN.userId]));cleared.push('PVE');if(!pvp)cleared.push('PVP');}
  if(pvp?.mercenaryCode===PLAN.code){one(await q(c,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 RETURNING key',[JSON.stringify({...pvp,mercenaryCode:null,revision:pvp.revision+1}),now,key]));cleared.push('PVP');if(legacy)await q(c,'UPDATE user_mercenary_loadout_v1 SET updated_at=$1 WHERE user_id=$2',[now,PLAN.userId]);}
 }
 const after=await state(c);protect(before,after,true);
 assert.equal(Number(after.cards.find(x=>x.mercenary_code===PLAN.code)?.total_copies||0),remaining);
 const r=await record(c,REVOKE,{holding:holding||null,loadout:before.loadout,pvp:before.pvp},{sourceGrantKey:GRANT,sourceGrantAuditId:source.adminLogId,copiesBefore:count,copiesAfter:remaining,removed:count?1:0,clearedModes:cleared,grantHistoryPreserved:true,stockChanged:false});
 assert.ok(lockDeadline>Date.now()+5000);return {replayed:false,receipt:r};
}
export async function verify(c){
 const granted=await receipt(c,GRANT),revoked=await receipt(c,REVOKE),s=await state(c);
 assert.equal(granted?.planHash,HASH);const a=one(await q(c,'SELECT user_id,mercenary_code FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[GRANT]));assert.equal(Number(a.user_id),PLAN.userId);assert.equal(a.mercenary_code,PLAN.code);
 for(const r of [granted,revoked].filter(Boolean)){const log=one(await q(c,'SELECT after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));const {adminLogId,...data}=r;assert.deepEqual(JSON.parse(log.after_data),data);}
 const copies=Number(s.cards.find(x=>x.mercenary_code===PLAN.code)?.total_copies||0);
 if(!revoked)assert.ok(copies>=1,'Granted holding missing');
 return {userId:PLAN.userId,nickname:PLAN.nickname,code:PLAN.code,currentCopies:copies,granted:!!granted,revoked:!!revoked,expiresAt:PLAN.expiresAt,grantAuditId:granted.adminLogId,revokeAuditId:revoked?.adminLogId||null,loadout:s.loadout,pvp:s.pvp};
}
