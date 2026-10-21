import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {halloweenSsOnceKey} from '../../functions/_mercenary_halloween_once.js';
import {HALLOWEEN_PACK} from '../../shared/mercenary-halloween-pack-v1.mjs';

export const TARGET={id:4111,nickname:'족게이다'};
export const OPERATION_KEY='ops:jokgeida-halloween-valter-once:20261021:v1';
export const ENTITLEMENT_KEY=halloweenSsOnceKey(TARGET.id);
export const AUTHORIZATION='족게이다 계정에 할로윈팩 개봉할때 1번 발테르 뜨게 해놔';
const q=async(db,sql,v=[])=>(await db.query(sql,v)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function inspect(db){
 const users=await q(db,'SELECT id,nickname,role,status FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const identity=await q(db,'SELECT provider,provider_user_id,provider_name FROM user_second_verifications WHERE user_id=$1',[TARGET.id]);
 const rows=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[ENTITLEMENT_KEY,OPERATION_KEY,'mercenary_halloween_ss_pack_v1']]);
 const read=key=>{const row=rows.find(r=>r.key===key);return row?JSON.parse(row.value):null;};
 const stock=await q(db,"SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code='V-996' ORDER BY code");
 return {users,identity,once:read(ENTITLEMENT_KEY),receipt:read(OPERATION_KEY),pack:read('mercenary_halloween_ss_pack_v1'),stock};
}
async function protectedDigest(db){
 const data={};for(const [key,sql] of [
  ['user','SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=$1'],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code'],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1'],
  ['growth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code'],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code']])data[key]=await q(db,sql,[TARGET.id]);
 data.pack=await q(db,"SELECT value FROM app_meta WHERE key='mercenary_halloween_ss_pack_v1'");
 data.stock=await q(db,"SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-996' ORDER BY code");
 return hash(data);
}
export async function verify(db){
 const s=await inspect(db),r=s.receipt;assert.equal(r?.status,'COMPLETED');assert.deepEqual(r.target,TARGET);assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.protectedBefore,r.protectedAfter);
 assert.equal(s.once.version,2);assert.equal(s.once.mercenaryCode,'V-996');assert.equal(s.once.operationId,OPERATION_KEY);assert.equal(s.once.userId,TARGET.id);assert.equal(s.once.rank,'SSS');assert.equal(s.once.packId,HALLOWEEN_PACK.id);assert(['ARMED','CONSUMED'].includes(s.once.status));assert.equal(s.once.remaining,s.once.status==='ARMED'?1:0);
 const audit=one(await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));assert.equal(audit.action_type,'MERCENARY_HALLOWEEN_CARD_ONCE_ARMED');assert.equal(audit.target_id,String(TARGET.id));assert.equal(JSON.parse(audit.after_data).operationKey,OPERATION_KEY);
 let acquisition=null;
 if(s.once.status==='CONSUMED'){
  const op=one(await q(db,'SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=$1 AND user_id=$2 AND kind=$3',[s.once.requestId,TARGET.id,'MERCENARY_HALLOWEEN_OPEN']));assert.equal(op.status,'COMPLETED');const plan=JSON.parse(op.plan_json);assert.equal(plan.once.operationId,OPERATION_KEY);assert.equal(plan.draws[0].rank,'SSS');assert.equal(plan.draws[0].edition,'SSS_LIMITED');assert.equal(plan.draws[0].mercenaryCode,s.once.mercenaryCode);
  acquisition=one(await q(db,'SELECT a.mercenary_code,a.total_copies_after,l.serial FROM mercenary_card_acquisitions_v1 a JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id WHERE a.acquisition_id=$1 AND a.user_id=$2',[s.once.acquisitionId,TARGET.id]));assert.equal(acquisition.mercenary_code,s.once.mercenaryCode);
  assert.equal((await q(db,"SELECT id FROM admin_logs WHERE action_type='MERCENARY_HALLOWEEN_CARD_ONCE_CONSUMED' AND target_id=$1 AND after_data::jsonb->>'operationId'=$2",[String(TARGET.id),OPERATION_KEY])).length,1);
 }
 return {status:'VERIFIED',target:TARGET,guaranteeStatus:s.once.status,remaining:s.once.remaining,receipt:r,once:s.once,acquisition};
}
export async function arm(db,{dryRun=true,lockDeadline,leaseToken}={}){
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);one(await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[TARGET.id,leaseToken,OPERATION_KEY,Date.now()+10000]));await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
  await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[[ENTITLEMENT_KEY,OPERATION_KEY,'mercenary_halloween_ss_pack_v1']]);
  await q(db,"SELECT code FROM mercenary_limited_stock_v1 WHERE code='V-996' ORDER BY code FOR SHARE");
  const state=await inspect(db);if(state.receipt){const result=await verify(db);await db.query('ROLLBACK');return {...result,dryRun,replayed:true};}
  const user=one(state.users);assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.role,'USER');assert.equal(user.status,'ACTIVE');
  const identity=one(state.identity);assert.equal(identity.provider,'PLAYDK');assert.equal(identity.provider_user_id,'6c8a26e9');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));assert.equal(state.once,null,'Existing entitlement must not be overwritten');assert.equal(state.pack.settings.mode,'ON');
  assert(state.stock.some(s=>Number(s.issued)<Number(s.stock_limit)&&state.pack.settings.cardRatesPpm[s.code]>0),'No eligible Valter stock');
  const before=await protectedDigest(db),now=new Date().toISOString();
  const once={version:2,status:'ARMED',remaining:1,userId:TARGET.id,actorId:1,operationId:OPERATION_KEY,packId:HALLOWEEN_PACK.id,rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:'V-996',createdAt:now,reason:AUTHORIZATION};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[ENTITLEMENT_KEY,JSON.stringify(once),now]);
  const after=await protectedDigest(db);assert.equal(after,before);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,target:TARGET,completedAt:now,entitlementKey:ENTITLEMENT_KEY,quantity:1,mercenaryCode:'V-996',name:'발테르',rank:'SSS',appliesTo:'NEXT_NEW_VALID_SINGLE_OR_TEN_OPEN_INCLUDING_AUTO',subsequent:'NORMAL_PROBABILITY',protectedBefore:before,protectedAfter:after,grantsDuringArming:0,costDuringArming:0};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_HALLOWEEN_CARD_ONCE_ARMED','USER',$1,'null',$2) RETURNING id",[String(TARGET.id),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);const result=await verify(db);assert(lockDeadline>Date.now()+5000,'Account lease expired');await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
