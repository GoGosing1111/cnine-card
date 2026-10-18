import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';

export const OPERATION_KEY='ops:jokgeida-kangyun-message:20261019:v1';
export const TARGET=Object.freeze({id:4111,nickname:'족게이다',code:'V-057',name:'신궁 강윤',rank:'SSS',quantity:1});
export const MESSAGE='강윤지급완료';
export const AUTHORIZATION='족게이다 계정에 강윤 지급하고 메세지로 강윤지급완료 보내놔';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify({OPERATION_KEY,TARGET,MESSAGE,AUTHORIZATION})).digest('hex');
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const int=value=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=0);return n;};

export async function inspectGrant(db){
 const users=await q(db,'SELECT id,nickname,status,role FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const owned=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,TARGET.code]);
 const acquisitions=await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]);
 const messages=await q(db,'SELECT * FROM user_messages WHERE user_id=$1 AND campaign_key=$2',[TARGET.id,OPERATION_KEY]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,owned,acquisitions,messages,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

async function protectedHash(db){
 const data={user:await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id])};
 for(const [name,table,order] of [['inventory','cnine_user_inventory','item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code']])
  data[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 data.otherCards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',[TARGET.id,TARGET.code]);
 return hash(data);
}

export async function verifyGrant(db){
 const state=await inspectGrant(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);
 assert.deepEqual(r.target,TARGET);assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.message,MESSAGE);
 assert.equal(r.copiesAfter,r.copiesBefore+1);assert.equal(r.protectedBefore,r.protectedAfter);
 assert.equal(r.cost,0);assert.equal(r.permanent,true);assert.equal(r.automaticLoadout,false);
 const acquisition=one(state.acquisitions);
 assert.equal(Number(acquisition.user_id),TARGET.id);assert.equal(acquisition.mercenary_code,TARGET.code);
 assert.equal(int(acquisition.total_copies_after),r.copiesAfter);assert.equal(int(acquisition.duplicate_count_after),r.copiesBefore);
 assert.equal(int(acquisition.is_duplicate),r.copiesBefore>0?1:0);assert.equal(acquisition.created_at,r.completedAt);
 const owned=one(state.owned);assert(int(owned.total_copies)>=r.copiesAfter);assert.equal(int(owned.duplicate_count),int(owned.total_copies)-1);
 const message=one(state.messages);
 assert.equal(String(message.id),r.messageId);assert.equal(Number(message.user_id),TARGET.id);
 assert.equal(message.sender_type,'ADMIN');assert.equal(message.message_type,'NOTICE');
 assert.equal(message.title,MESSAGE);assert.equal(message.body,MESSAGE);assert.equal(message.campaign_key,OPERATION_KEY);
 assert.equal((await q(db,'SELECT id FROM user_message_rewards WHERE message_id=$1',[r.messageId])).length,0,'Direct grant must not attach another reward');
 const audit=one(await q(db,'SELECT admin_id,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_MERCENARY_GRANT_MESSAGE');
 assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt:r,currentCopies:int(owned.total_copies),messages:1,acquisitions:1};
}

// Explicit one-account grant and notification, protected by the live USER_LOCK.
// Uses existing acquisition accounting; no CMS, stock, equipment or runtime change.
export async function grantKangyun(db,{dryRun=true,lockDeadline,approvedPlanHash,assertLease}={}){
 assert.equal(approvedPlanHash,PLAN_HASH);assert.equal(typeof assertLease,'function');
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  one(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  const before=await inspectGrant(db),user=one(before.users);
  assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
  if(before.receipt){const result=await verifyGrant(db);await db.query('ROLLBACK');return {...result,dryRun,replayed:true};}
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const card=one(MERCENARY_CMS_SEED.catalog.cards.filter(c=>c.code===TARGET.code));assert.equal(card.name,TARGET.name);assert.equal(card.rank,TARGET.rank);
  const day=one(await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst"));assert.equal(day.kst,'2026-10-19');
  assert.equal(before.acquisitions.length,0,'Acquisition without receipt');assert.equal(before.messages.length,0,'Message without receipt');
  const protectedBefore=await protectedHash(db),owned=before.owned[0],copiesBefore=int(owned?.total_copies??0);
  assert(copiesBefore<2147483647);if(owned)assert.equal(int(owned.duplicate_count),copiesBefore-1);
  const now=new Date().toISOString();
  const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args};}};}};
  for(const statement of mercenaryCardAcquisitionStatements(adapter,{userId:TARGET.id,mercenaryCode:TARGET.code,acquisitionId:OPERATION_KEY,createdAt:now}))
   await q(db,statement.sql,statement.args);
  const changed=one(await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,TARGET.code]));
  assert.equal(int(changed.total_copies),copiesBefore+1);assert.equal(int(changed.duplicate_count),copiesBefore);
  assert.equal(changed.first_obtained_at,owned?.first_obtained_at??now);
  const message=one(await q(db,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at) VALUES($1,'ADMIN',$2,$2,'NOTICE',$3,$4) RETURNING id,is_read,hidden_at",[TARGET.id,MESSAGE,OPERATION_KEY,now]));
  assert.equal(Number(message.is_read),0);assert.equal(message.hidden_at,null);
  const protectedAfter=await protectedHash(db);assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:AUTHORIZATION,target:TARGET,
   completedAt:now,copiesBefore,copiesAfter:copiesBefore+1,message:MESSAGE,messageId:String(message.id),protectedBefore,protectedAfter,cost:0,permanent:true,automaticLoadout:false};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_MERCENARY_GRANT_MESSAGE','USER',$1,$2,$3) RETURNING id",[String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,owned:owned??null,messages:0}),JSON.stringify(receipt)]));
  receipt.adminLogId=String(audit.id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyGrant(db);await assertLease();assert(lockDeadline>Date.now()+5000,'Account lease expired');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
