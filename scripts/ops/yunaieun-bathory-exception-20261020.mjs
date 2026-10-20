import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BATHORY_ART} from '../../shared/mercenary-bathory-v1.mjs';

export const OPERATION_KEY='ops:yunaieun-bathory-exception:20261020:v1';
export const TARGET=Object.freeze({id:236,nickname:'유나이은',code:'V-977',name:'바토리',rank:'SS',edition:'LIMITED',quantity:1});
export const AUTHORIZATION='유나이은 계정에 바토리 남은한도 0이여도 그냥 예외처리해서 지급해';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify({OPERATION_KEY,TARGET,AUTHORIZATION})).digest('hex');
const settings=['mercenary_halloween_ss_pack_v1','mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1'];
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const int=value=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=0,'Invalid count');return n;};

export async function inspectGrant(db){
 const users=await q(db,'SELECT id,nickname,role,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const owned=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,TARGET.code]);
 const config=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]);
 const stock=one(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[TARGET.code]));
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[TARGET.code]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,owned,config,stock,issues,receipt:saved[0]?JSON.parse(saved[0].value):null};
}
function ledger(state){
 const limit=int(state.stock.stock_limit),issued=int(state.stock.issued);assert(limit>=issued);assert.equal(limit,10);
 const pack=JSON.parse(one(state.config.filter(c=>c.key==='mercenary_halloween_ss_pack_v1')).value);
 assert.equal(pack.settings.stockLimits[TARGET.code],limit,'CMS/stock mismatch');
 assert.equal(state.issues.length,issued,'Issuance ledger mismatch');
 state.issues.forEach((row,i)=>assert.equal(int(row.serial),i+1,'Serial gap'));
 return {limit,issued,remaining:limit-issued};
}
async function protectedDigest(db){
 const data={user:await q(db,'SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id])};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code'],['levels','user_mercenary_levels_v1','mercenary_code']])
  data[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 data.otherCards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',[TARGET.id,TARGET.code]);
 data.settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]);
 data.daily=await q(db,'SELECT key,value,updated_at FROM app_meta WHERE key LIKE $1 OR key LIKE $2 ORDER BY key',[`mercenary_limited_daily_v1:${TARGET.id}:%`,`mercenary_halloween_daily_v1:${TARGET.id}:%`]);
 data.rosters=await q(db,'SELECT key,value,updated_at FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[`ranked_series_roster_v1:${TARGET.id}`,`mercenary_pvp_loadout_v1:${TARGET.id}`]]);
 data.stock=await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[TARGET.code]);
 data.issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[TARGET.code]);
 return hash(data);
}
export async function verifyGrant(db){
 const state=await inspectGrant(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);assert.deepEqual(r.target,TARGET);
 assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.copiesAfter,r.copiesBefore+1);assert.equal(r.protectedBefore,r.protectedAfter);
 assert.equal(r.cost,0);assert.equal(r.automaticLoadout,false);assert.equal(r.permanent,true);assert.equal(r.countedInLimited,false);assert.equal(r.purchaseCountDelta,0);
 assert.deepEqual(r.stockAfter,r.stockBefore);assert.equal(state.issues.filter(i=>i.acquisition_id===OPERATION_KEY).length,0,'Exception must not use a limited serial');
 const owned=one(state.owned);assert(int(owned.total_copies)>=r.copiesAfter);assert.equal(int(owned.duplicate_count),int(owned.total_copies)-1);
 const acquired=one(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(Number(acquired.user_id),TARGET.id);assert.equal(acquired.mercenary_code,TARGET.code);assert.equal(int(acquired.total_copies_after),r.copiesAfter);
 assert.equal(int(acquired.duplicate_count_after),r.copiesBefore);assert.equal(int(acquired.is_duplicate),r.copiesBefore>0?1:0);assert.equal(acquired.created_at,r.completedAt);
 const audit=one(await q(db,'SELECT admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_MERCENARY_STOCK_EXCEPTION');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt:r,currentCopies:int(owned.total_copies),stock:ledger(state),missing:0,duplicateOperationGrants:0};
}

// This one-account direct grant deliberately leaves the exhausted pack stock intact.
// Caller holds the live USER_LOCK and matching database fallback lease.
export async function grantBathory(db,{dryRun=true,lockDeadline,leaseToken,approvedPlanHash}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Reviewed plan required');
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/,'Lease token required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  one(await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[TARGET.id,leaseToken,OPERATION_KEY,Date.now()+10000]));
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[settings])).length,3);
  one(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[TARGET.code]));
  const before=await inspectGrant(db);
  if(before.receipt){const verified=await verifyGrant(db);await db.query('ROLLBACK');return {...verified,dryRun,replayed:true};}
  const user=one(before.users);assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  assert.equal(BATHORY_ART.code,TARGET.code);assert.equal(BATHORY_ART.name,TARGET.name);assert.equal(BATHORY_ART.rank,TARGET.rank);assert.equal(BATHORY_ART.edition,TARGET.edition);
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0,'Orphan acquisition');
  assert.equal(before.issues.filter(i=>i.acquisition_id===OPERATION_KEY).length,0,'Orphan issuance');
  const stockBefore=ledger(before),protectedBefore=await protectedDigest(db),owned=before.owned[0],copiesBefore=int(owned?.total_copies??0);
  assert(copiesBefore<2147483647);if(owned)assert.equal(int(owned.duplicate_count),copiesBefore-1);
  const now=new Date().toISOString();
  const result=one(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
   ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,TARGET.code,now]));
  assert.equal(int(result.total_copies),copiesBefore+1);assert.equal(int(result.duplicate_count),copiesBefore);assert.equal(result.first_obtained_at,owned?.first_obtained_at??now);
  one(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[OPERATION_KEY,TARGET.id,TARGET.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
  const after=await inspectGrant(db),stockAfter=ledger(after);
  assert.deepEqual(after.stock,before.stock);assert.deepEqual(after.issues,before.issues);
  const protectedAfter=await protectedDigest(db);assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:AUTHORIZATION,target:TARGET,completedAt:now,copiesBefore,copiesAfter:copiesBefore+1,
   stockBefore,stockAfter,protectedBefore,protectedAfter,permanent:true,automaticLoadout:false,cost:0,countedInLimited:false,purchaseCountDelta:0};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_MERCENARY_STOCK_EXCEPTION','USER',$1,$2,$3) RETURNING id",[String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,owned:owned??null,stock:stockBefore}),JSON.stringify(receipt)]));
  receipt.adminLogId=String(audit.id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyGrant(db);assert(lockDeadline>Date.now()+5000,'Account lease expired');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
