import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {JINMU_CODE} from '../../shared/mercenary-jinmu-v1.mjs';

export const OPERATION_KEY='ops:heeya-jinmu-grant:20261015:v1';
export const TARGET=Object.freeze({id:4977,nickname:'하이희야♡',code:JINMU_CODE,quantity:1});
export const AUTHORIZATION='하이희야♡ 계정에 진무 지급하고 편성 가능하게 해';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const settings=['mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_pvp_loadout_v1:4977'];

export async function inspectJinmuGrant(db){
 const users=await q(db,'SELECT id,nickname,role,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const verification=await q(db,'SELECT user_id,provider,provider_user_id FROM user_second_verifications WHERE user_id=$1',[TARGET.id]);
 const owned=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,TARGET.code]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,verification,owned,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

async function protectedDigest(db){
 const data={};
 data.user=await q(db,'SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]);
 for(const [name,table,order]of [['inventory','cnine_user_inventory','item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code']])
  data[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 data.otherCards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',[TARGET.id,TARGET.code]);
 data.otherHolders=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id<>$1 AND mercenary_code=$2 ORDER BY user_id',[TARGET.id,TARGET.code]);
 data.settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settings]);
 data.stock=await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[TARGET.code]);
 data.issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[TARGET.code]);
 assert.equal(data.stock.length,0,'Exclusive Jinmu must not consume pack stock');assert.equal(data.issues.length,0);
 return hash(data);
}

export async function verifyJinmuGrant(db){
 const state=await inspectJinmuGrant(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.deepEqual(r.target,TARGET);
 assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.copiesAfter,r.copiesBefore+1);assert.equal(r.protectedBefore,r.protectedAfter);
 assert.equal(r.permanent,true);assert.equal(r.countedInLimited,false);assert.equal(r.automaticLoadout,false);assert.equal(r.cost,0);
 assert.equal((await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1',[TARGET.code])).length,0);
 assert.equal((await q(db,'SELECT code FROM mercenary_limited_issues_v1 WHERE code=$1',[TARGET.code])).length,0);
 const owned=one(state.owned);assert(Number(owned.total_copies)>=r.copiesAfter);assert.equal(Number(owned.duplicate_count),Number(owned.total_copies)-1);
 const acquired=one(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(Number(acquired.user_id),TARGET.id);assert.equal(acquired.mercenary_code,TARGET.code);
 assert.equal(Number(acquired.total_copies_after),r.copiesAfter);assert.equal(Number(acquired.duplicate_count_after),r.copiesBefore);
 assert.equal(Number(acquired.is_duplicate),r.copiesBefore>0?1:0);assert.equal(acquired.created_at,r.completedAt);
 const audit=one(await q(db,'SELECT admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_EXCLUSIVE_MERCENARY_GRANT');
 assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt:r,currentCopies:Number(owned.total_copies),missing:0,duplicateOperationGrants:0};
}

// Explicit one-account exception only. Caller holds the live USER_LOCK lease.
// Public acquisition, issue stock, wallet and chosen loadouts stay intact.
export async function grantJinmu(db,{dryRun=false,lockDeadline}={}){
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[settings]);
  await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
  const before=await inspectJinmuGrant(db),user=one(before.users);
  assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
  const verification=one(before.verification);assert.equal(verification.provider,'PLAYDK');assert.equal(verification.provider_user_id,'5e2dc209');
  if(before.receipt){const verified=await verifyJinmuGrant(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:true};}
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0,'Orphan acquisition needs inspection');
  const protectedBefore=await protectedDigest(db),owned=before.owned[0],copiesBefore=Number(owned?.total_copies||0);
  assert(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);if(owned)assert.equal(Number(owned.duplicate_count),copiesBefore-1);
  const now=new Date().toISOString();
  const result=one(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
   VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,
   duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,TARGET.code,now]));
  assert.equal(Number(result.total_copies),copiesBefore+1);assert.equal(Number(result.duplicate_count),copiesBefore);
  assert.equal(result.first_obtained_at,owned?.first_obtained_at??now);
  await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[OPERATION_KEY,TARGET.id,TARGET.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]);
  const protectedAfter=await protectedDigest(db);assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,target:TARGET,completedAt:now,
   copiesBefore,copiesAfter:copiesBefore+1,protectedBefore,protectedAfter,automaticLoadout:false,permanent:true,countedInLimited:false,cost:0};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_EXCLUSIVE_MERCENARY_GRANT','USER','4977',$1,$2) RETURNING id",[JSON.stringify({operationKey:OPERATION_KEY,owned:owned??null}),JSON.stringify(receipt)]));
  receipt.adminLogId=String(audit.id);
  await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  const verified=await verifyJinmuGrant(db);assert(lockDeadline>Date.now()+5000,'Account lease expired');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
