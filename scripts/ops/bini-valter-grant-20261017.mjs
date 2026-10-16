import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OPERATION_KEY='ops:bini-valter-grant:20261017:v1';
export const TARGET=Object.freeze({id:5504,nickname:'비_니',code:'V-996',name:'발테르',rank:'SSS',edition:'LIMITED',quantity:1});
export const AUTHORIZATION='비_니 계정에 발테르 지급해';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify({OPERATION_KEY,TARGET,AUTHORIZATION})).digest('hex');
const settings=['mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1'];
const q=async(db,s,v=[])=>(await db.query(s,v)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const int=value=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=0,'Invalid count');return n;};

export async function inspectValterGrant(db){
 const users=await q(db,'SELECT id,nickname,role,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const verification=await q(db,'SELECT user_id,provider,provider_user_id,provider_name FROM user_second_verifications WHERE user_id=$1',[TARGET.id]);
 const owned=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,TARGET.code]);
 const config=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]);
 const stock=one(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[TARGET.code]));
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[TARGET.code]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,verification,owned,config,stock,issues,receipt:saved[0]?JSON.parse(saved[0].value):null};
}
function ledger(state){
 const limit=int(state.stock.stock_limit),issued=int(state.stock.issued);assert(limit>=issued);
 const pack=JSON.parse(one(state.config.filter(c=>c.key==='mercenary_limited_pack_v1')).value);assert.equal(pack.settings.stockLimits[TARGET.code],limit,'CMS/stock mismatch');
 assert.equal(state.issues.length,issued,'Issuance ledger mismatch');state.issues.forEach((r,i)=>assert.equal(int(r.serial),i+1,'Serial gap'));
 return {limit,issued,remaining:limit-issued};
}
async function protectedDigest(db){
 const data={user:await q(db,'SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id])};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code']])data[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 data.otherCards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',[TARGET.id,TARGET.code]);
 data.settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]);
 data.daily=await q(db,'SELECT key,value,updated_at FROM app_meta WHERE key LIKE $1 ORDER BY key',['mercenary_limited_daily_v1:'+TARGET.id+':%']);
 return hash(data);
}
export async function verifyValterGrant(db){
 const state=await inspectValterGrant(db),r=state.receipt;assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);assert.deepEqual(r.target,TARGET);
 assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.copiesAfter,r.copiesBefore+1);assert.equal(r.protectedBefore,r.protectedAfter);assert.equal(r.cost,0);assert.equal(r.automaticLoadout,false);assert.equal(r.permanent,true);
 assert.equal(r.stockAfter.limit,r.stockBefore.limit);assert.equal(r.stockAfter.issued,r.stockBefore.issued+1);assert.equal(r.stockAfter.remaining,r.stockBefore.remaining-1);assert.equal(r.serial,r.stockAfter.issued);
 const current=ledger(state);assert(current.issued>=r.stockAfter.issued);
 const owned=one(state.owned);assert(int(owned.total_copies)>=r.copiesAfter);assert.equal(int(owned.duplicate_count),int(owned.total_copies)-1);
 const acquired=one(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(Number(acquired.user_id),TARGET.id);assert.equal(acquired.mercenary_code,TARGET.code);assert.equal(int(acquired.total_copies_after),r.copiesAfter);assert.equal(int(acquired.duplicate_count_after),r.copiesBefore);assert.equal(int(acquired.is_duplicate),r.copiesBefore>0?1:0);assert.equal(acquired.created_at,r.completedAt);
 const issue=one(state.issues.filter(i=>i.acquisition_id===OPERATION_KEY));assert.equal(Number(issue.user_id),TARGET.id);assert.equal(issue.code,TARGET.code);assert.equal(int(issue.serial),r.serial);assert.equal(issue.request_id,OPERATION_KEY);assert.equal(issue.created_at,r.completedAt);
 const audit=one(await q(db,'SELECT admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_LIMITED_MERCENARY_GRANT');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));const {adminLogId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt:r,currentCopies:int(owned.total_copies),stock:current,missing:0,duplicateOperationGrants:0};
}
// The caller holds the live account USER_LOCK and matching database fallback lease.
// One card consumes one remaining serial; pack settings and daily purchases do not change.
export async function grantValter(db,{dryRun=true,lockDeadline,approvedPlanHash}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Reviewed plan required');assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[settings])).length,2);
  one(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[TARGET.code]));
  const before=await inspectValterGrant(db);
  if(before.receipt){const verified=await verifyValterGrant(db);await db.query('ROLLBACK');return {...verified,dryRun,replayed:true};}
  const user=one(before.users);assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
  const identity=one(before.verification);assert.equal(identity.provider,'PLAYDK');assert.equal(identity.provider_user_id,'c633da6a');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const card=LIMITED_MERCENARIES.find(c=>c.code===TARGET.code);assert.equal(card?.name,TARGET.name);assert.equal(card.rank,TARGET.rank);assert.equal(card.edition,TARGET.edition);
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0,'Orphan acquisition');assert.equal(before.issues.filter(i=>i.acquisition_id===OPERATION_KEY).length,0,'Orphan issuance');
  const stockBefore=ledger(before);assert(stockBefore.remaining>=1,'No remaining authorized stock');
  const protectedBefore=await protectedDigest(db),owned=before.owned[0],copiesBefore=int(owned?.total_copies??0);assert(copiesBefore<2147483647);if(owned)assert.equal(int(owned.duplicate_count),copiesBefore-1);
  const now=new Date().toISOString();
  one(await q(db,'UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2 WHERE code=$1 AND issued=$3 AND revision=$4 AND issued<stock_limit RETURNING code',[TARGET.code,OPERATION_KEY,before.stock.issued,before.stock.revision]));
  const result=one(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
   ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,TARGET.code,now]));
  assert.equal(int(result.total_copies),copiesBefore+1);assert.equal(int(result.duplicate_count),copiesBefore);assert.equal(result.first_obtained_at,owned?.first_obtained_at??now);
  one(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[OPERATION_KEY,TARGET.id,TARGET.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
  const serial=stockBefore.issued+1;
  one(await q(db,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$1,$2,$3,$4,$5) RETURNING acquisition_id',[OPERATION_KEY,TARGET.id,TARGET.code,serial,now]));
  const after=await inspectValterGrant(db),stockAfter=ledger(after);assert.deepEqual(stockAfter,{limit:stockBefore.limit,issued:serial,remaining:stockBefore.remaining-1});assert.deepEqual(after.issues.filter(i=>i.acquisition_id!==OPERATION_KEY),before.issues);
  const protectedAfter=await protectedDigest(db);assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:AUTHORIZATION,target:TARGET,completedAt:now,copiesBefore,copiesAfter:copiesBefore+1,serial,stockBefore,stockAfter,protectedBefore,protectedAfter,permanent:true,automaticLoadout:false,cost:0};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_MERCENARY_GRANT','USER',$1,$2,$3) RETURNING id",[String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,owned:owned??null,stock:stockBefore}),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyValterGrant(db);assert(lockDeadline>Date.now()+5000,'Account lease expired');await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
