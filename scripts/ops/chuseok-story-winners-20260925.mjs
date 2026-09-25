import assert from 'node:assert/strict';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';

export const OPERATION_KEY='ops:chuseok-story-winners:20260925:v1';
export const REASON='추석 신령 사연 이벤트 당첨 보상 (감동·유머 재선정)';
export const TARGETS=Object.freeze([
 {userId:295,nickname:'모래',rewardType:'MERCENARY',code:'V-021',quantity:1},
 {userId:4391,nickname:'더듬이구',rewardType:'MERCENARY',code:'V-021',quantity:1},
 {userId:4540,nickname:'지아영',rewardType:'MASTER_STAR',code:'MASTER_STAR',quantity:1_000_000}
]);
const ids=TARGETS.map(row=>row.userId),parse=value=>typeof value==='string'?JSON.parse(value):value;
const acquisitionId=target=>`${OPERATION_KEY}:${target.userId}:V-021`;
const shape=row=>({userId:Number(row.userId),nickname:row.nickname,rewardType:row.rewardType,code:row.code,quantity:Number(row.quantity)});

async function snapshot(q){
 return {
  users:await q('SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]),
  holdings:await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]),
  loadouts:await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]),
  growth:await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]),
  stars:await q("SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id",[ids])
 };
}

export async function verifyStoryWinners(q){
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 assert.ok(saved,'Operation receipt missing');
 const receipt=parse(saved.value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.deepEqual(receipt.recipients.map(shape),TARGETS);
 for(const target of TARGETS){
  const recipient=receipt.recipients.find(row=>row.userId===target.userId);
  const audits=await q('SELECT action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[recipient.adminLogId]);
  assert.equal(audits.length,1);assert.equal(audits[0].action_type,'OPS_CHUSEOK_STORY_REWARD');
  assert.equal(audits[0].target_type,'USER');assert.equal(audits[0].target_id,String(target.userId));
  assert.deepEqual(shape(parse(audits[0].after_data)),target);
  assert.equal(parse(audits[0].after_data).operationKey,OPERATION_KEY);
  if(target.rewardType==='MERCENARY'){
   const rows=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[acquisitionId(target)]);
   assert.equal(rows.length,1);assert.equal(Number(rows[0].user_id),target.userId);assert.equal(rows[0].mercenary_code,target.code);
   assert.equal(Number(rows[0].total_copies_after),recipient.afterCopies);
   assert.equal(Number(rows[0].duplicate_count_after),recipient.afterCopies-1);
  }else{
   const rows=await q('SELECT id,user_id,item_code,change_amount,balance_after FROM inventory_logs WHERE user_id=$1 AND item_code=$2 AND reference_type=$3 AND reference_id=$4',[target.userId,target.code,'CHUSEOK_STORY_REWARD',OPERATION_KEY]);
   assert.equal(rows.length,1);assert.equal(Number(rows[0].user_id),target.userId);assert.equal(rows[0].item_code,target.code);
   assert.equal(Number(rows[0].change_amount),target.quantity);assert.equal(String(rows[0].balance_after),recipient.afterBalance);
   assert.equal(String(rows[0].id),recipient.inventoryLogId);
  }
 }
 return receipt;
}

// Called only by an owner-authorized operational session holding all three
// USER_LOCK leases. No runtime route, migration or automatic reward hook.
export async function grantStoryWinners(client,{dryRun=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[
   OPERATION_KEY,JSON.stringify({status:'PENDING'}),new Date().toISOString()
  ]);
  if(!reserved.length){const receipt=await verifyStoryWinners(q);await client.query('ROLLBACK');return {...receipt,replayed:true,dryRun};}
  const users=await q('SELECT id,nickname,role,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  assert.equal(users.length,TARGETS.length,'Recipient missing');
  for(let i=0;i<TARGETS.length;i++){
   assert.equal(Number(users[i].id),TARGETS[i].userId);assert.equal(users[i].nickname,TARGETS[i].nickname,'Recipient nickname changed');
   assert.equal(users[i].role,'USER');assert.equal(users[i].status,'ACTIVE');
  }
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Authorized owner missing');
  const [cms]=await q("SELECT revision,payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
  assert.ok(cms,'CMS missing');const omega=parse(cms.payload_json).mercenaries.find(row=>row.code==='V-021');
  assert.equal(omega?.name,'오메가-X');assert.equal(omega?.rank,'SSS');
  const [item]=await q("SELECT name,is_active FROM inventory_items WHERE code='MASTER_STAR' FOR SHARE");
  assert.equal(item?.name,'마스터의 별');assert.equal(Number(item?.is_active),1);
  assert.equal((await q('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])',[TARGETS.filter(row=>row.rewardType==='MERCENARY').map(acquisitionId)])).length,0,'Acquisition exists without receipt');
  assert.equal((await q("SELECT id FROM inventory_logs WHERE user_id=4540 AND item_code='MASTER_STAR' AND reference_type=$1 AND reference_id=$2",['CHUSEOK_STORY_REWARD',OPERATION_KEY])).length,0,'Inventory log exists without receipt');
  await q("SELECT user_id FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id FOR UPDATE",[ids]);
  const before=await snapshot(q),now=new Date().toISOString(),recipients=[];
  const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args}}}}};
  for(const target of TARGETS){
   let recipient;
   if(target.rewardType==='MERCENARY'){
    const owned=before.holdings.find(row=>Number(row.user_id)===target.userId&&row.mercenary_code===target.code);
    const beforeCopies=Number(owned?.total_copies||0);
    for(const statement of mercenaryCardAcquisitionStatements(adapter,{userId:target.userId,mercenaryCode:target.code,acquisitionId:acquisitionId(target),createdAt:now}))await q(statement.sql,statement.args);
    const [after]=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[target.userId,target.code]);
    assert.equal(Number(after.total_copies),beforeCopies+1);assert.equal(Number(after.duplicate_count),beforeCopies);
    if(owned)assert.equal(after.first_obtained_at,owned.first_obtained_at);
    recipient={...target,mercenaryName:'오메가-X',rank:'SSS',permanent:true,beforeCopies,afterCopies:beforeCopies+1,acquisitionId:acquisitionId(target)};
   }else{
    const owned=before.stars.find(row=>Number(row.user_id)===target.userId);
    for(const amount of [owned?.quantity??0,owned?.unseen_quantity??0])assert.ok(BigInt(amount)+BigInt(target.quantity)<=BigInt(Number.MAX_SAFE_INTEGER));
    const rows=await q(`WITH credited AS (
     INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
     VALUES($1,'MASTER_STAR',$2::bigint,$2::bigint,$3,$3)
     ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
      unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
     RETURNING user_id,quantity
    ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
     SELECT user_id,'MASTER_STAR',$2::bigint,quantity,$4,'CHUSEOK_STORY_REWARD',$5,$6,$3 FROM credited
     RETURNING id,balance_after`,[target.userId,target.quantity,now,REASON,OPERATION_KEY,owner.id]);
    assert.equal(rows.length,1,'Star balance or ledger missing');
    assert.equal(BigInt(rows[0].balance_after),BigInt(owned?.quantity??0)+BigInt(target.quantity));
    recipient={...target,beforeBalance:String(owned?.quantity??0),afterBalance:String(rows[0].balance_after),inventoryLogId:String(rows[0].id)};
   }
   const audit=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[
    owner.id,'OPS_CHUSEOK_STORY_REWARD','USER',String(target.userId),JSON.stringify({operationKey:OPERATION_KEY}),
    JSON.stringify({...recipient,operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',reason:REASON,authorization:'저대로 지급해 당첨대로 — 모래·더듬이구 오메가 SSS 각 1장, 지아영 마별 100만 개'}),now
   ]);
   assert.equal(audit.length,1);recipient.adminLogId=String(audit[0].id);recipients.push(recipient);
  }
  const after=await snapshot(q);
  for(const key of ['users','loadouts','growth'])assert.deepEqual(after[key],before[key],`${key} changed`);
  const unrelated=row=>!TARGETS.some(target=>target.rewardType==='MERCENARY'&&Number(row.user_id)===target.userId&&row.mercenary_code===target.code);
  assert.deepEqual(after.holdings.filter(unrelated),before.holdings.filter(unrelated));
  for(const target of TARGETS){
   const first=before.stars.find(row=>Number(row.user_id)===target.userId),last=after.stars.find(row=>Number(row.user_id)===target.userId);
   if(target.rewardType!=='MASTER_STAR'){assert.deepEqual(last,first);continue;}
   assert.equal(BigInt(last.quantity),BigInt(first?.quantity??0)+BigInt(target.quantity));
   assert.equal(BigInt(last.unseen_quantity),BigInt(first?.unseen_quantity??0)+BigInt(target.quantity));
  }
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',cmsRevision:Number(cms.revision),recipients,completedAt:now};
  assert.equal((await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
  await verifyStoryWinners(q);await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {...receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
