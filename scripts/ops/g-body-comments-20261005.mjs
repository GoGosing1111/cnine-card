import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:g-body-comments-20261005';
export const EQUIPMENT={id:'38',code:'BATTLE_SUIT_03',name:'G-BODY',quantity:1};
export const ACTION='OPS_G_BODY_COMMENTS_GRANT_20261005';
export const AUTHORIZATION='닉네임 추출해서 g바디 지급해';
export const RECIPIENTS=[
  ['zkzk9999','3884','zkzk9999'],['스루형2↑','4910','스루형2↑'],
  ['커피먹는봉순','22','커피먹는철구'],['깡총','4643','깡총'],
  ['불법사행산업신고센터','13','불법사행산업신고센터'],['정말잘하시네요','4820','정말잘하시네요'],
  ['펜타','4772','펜타'],['다시생각','1421','다시생각'],['시소둥이','4693','시소둥이'],
  ['블랙캐슬','2420','블랙캐슬'],['씨나인짱','34','씨나인짱'],['처음와봄','850','뽑기고수71'],
  ['[C9]가시','4866','[C9]가시'],['건빵3개','4371','건빵3개'],['Moo날두','4415','Moo날두'],
  ['옴마니반메훔','4675','옴마니반메훔'],['난종신','2246','옹가망함1'],['최성수','8','최성수'],
  ['리이렐','4621','리이렐'],['정원이','91','정원이'],['택신','4199','택신'],['미미미눙','75','미미미눙'],
  ['진땅콩간바레','202','진땅콩간바레'],['족알못','220','족알못'],['싸우지마애들아','2300','싸우지마애들아']
].map(([participant,userId,gameNickname])=>({participant,userId,gameNickname,quantity:1}));

const norm=v=>String(v||'').normalize('NFC').trim().toLowerCase();
const ids=RECIPIENTS.map(r=>r.userId).sort((a,b)=>Number(a)-Number(b));
const requestId=userId=>`${OPERATION_KEY}:${userId}:${EQUIPMENT.code}`;
const q=async(client,sql,values=[]) => (await client.query(sql,values)).rows;

export async function verifyGBodyGrant(client,receipt,{balances=false}={}) {
  assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
  assert.equal(receipt.authorization,AUTHORIZATION);assert.equal(receipt.delivery,'DIRECT');
  assert.deepEqual(receipt.equipment,EQUIPMENT);assert.equal(receipt.grants.length,25);
  assert.equal(new Set(receipt.grants.map(r=>r.userId)).size,25);
  const instances=await q(client,`SELECT id,user_id,equipment_id,source_type,source_id,request_id
    FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=$2 AND request_id=ANY($3::text[])`,
    [ids,EQUIPMENT.id,ids.map(requestId)]);
  assert.equal(instances.length,25,'Missing or duplicate granted instances');
  const audits=await q(client,'SELECT id,admin_id,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(r=>r.adminLogId)]);
  assert.equal(audits.length,25,'Missing or duplicate audit records');
  for(const target of RECIPIENTS) {
    const grant=receipt.grants.find(r=>r.userId===target.userId);
    for(const key of Object.keys(target))assert.equal(grant?.[key],target[key]);
    assert.equal(grant.requestId,requestId(target.userId));
    assert.equal(grant.quantityAfter,grant.quantityBefore+1);
    const instance=instances.find(r=>String(r.id)===grant.instanceId);
    assert(instance,'Missing grant instance');assert.equal(String(instance.user_id),target.userId);
    assert.equal(String(instance.equipment_id),EQUIPMENT.id);assert.equal(instance.source_type,'ADMIN');
    assert.equal(instance.source_id,OPERATION_KEY);assert.equal(instance.request_id,grant.requestId);
    const audit=audits.find(r=>String(r.id)===grant.adminLogId),{adminLogId,...loggedGrant}=grant;
    assert(audit,'Missing grant audit');assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');
    assert.equal(audit.target_id,target.userId);assert.equal(String(audit.admin_id),receipt.adminId);
    assert.deepEqual(JSON.parse(audit.after_data),loggedGrant);
    assert.equal(JSON.parse(audit.before_data).quantity,grant.quantityBefore);
  }
  if(balances) {
    const actual=await q(client,'SELECT user_id,COUNT(*) quantity FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=$2 GROUP BY user_id',[ids,EQUIPMENT.id]);
    const counts=await q(client,'SELECT user_id,quantity FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) AND equipment_id=$2',[ids,EQUIPMENT.id]);
    for(const grant of receipt.grants) {
      assert.equal(Number(actual.find(r=>String(r.user_id)===grant.userId)?.quantity||0),grant.quantityAfter,'Instance count differs');
      assert.equal(Number(counts.find(r=>String(r.user_id)===grant.userId)?.quantity||0),grant.quantityAfter,'Inventory aggregate differs');
    }
  }
  return {recipients:25,totalGranted:25,instanceCount:instances.length,auditCount:audits.length};
}

// Caller owns the transaction. All ownership, audit and receipt writes commit together.
// The fixed receipt prevents additional grants on retry, even if ownership changes later.
export async function grantGBody(client) {
  assert.equal(RECIPIENTS.length,25);assert.equal(new Set(ids).size,25);
  assert.equal(new Set(RECIPIENTS.map(r=>norm(r.participant))).size,25);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(saved) {
    const receipt=JSON.parse(saved.value);await verifyGBodyGrant(client,receipt);
    return {...receipt,replayed:true};
  }
  const users=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  const providers=await q(client,'SELECT user_id,provider,provider_name,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
  assert.equal(users.length,25);assert.equal(providers.length,25);
  for(const target of RECIPIENTS) {
    const user=users.find(r=>String(r.id)===target.userId),provider=providers.find(r=>String(r.user_id)===target.userId);
    assert.equal(user?.nickname,target.gameNickname);assert.equal(user?.status,'ACTIVE');
    assert.equal(provider?.provider,'PLAYDK');assert.equal(norm(provider?.provider_name),norm(target.participant));
    if(target.participant==='족알못')assert.equal(provider.provider_user_id,'e7a4d95d');
    if(target.participant==='싸우지마애들아')assert.equal(provider.provider_user_id,'3b292408');
  }
  const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  assert(owner,'An active owner is required for audit records');
  const [equipment]=await q(client,'SELECT id,code,name,slot,is_active,is_public FROM character_equipment_items WHERE code=$1 FOR SHARE',[EQUIPMENT.code]);
  assert.equal(String(equipment?.id),EQUIPMENT.id);assert.equal(equipment?.name,EQUIPMENT.name);
  assert.equal(equipment?.slot,'BATTLE_SUIT');assert.equal(Number(equipment?.is_active),1);assert.equal(Number(equipment?.is_public),1);
  const previous=await q(client,'SELECT id FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=$2 AND request_id=ANY($3::text[])',[ids,EQUIPMENT.id,ids.map(requestId)]);
  const priorAudits=await q(client,"SELECT id FROM admin_logs WHERE action_type=$1 AND target_type='USER' AND target_id=ANY($2::text[])",[ACTION,ids]);
  assert.equal(previous.length+priorAudits.length,0,'Prior grant without receipt requires reconciliation');
  const aggregates=await q(client,'SELECT user_id,quantity FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) AND equipment_id=$2 ORDER BY user_id FOR UPDATE',[ids,EQUIPMENT.id]);
  const actual=await q(client,'SELECT user_id,COUNT(*) quantity FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=$2 GROUP BY user_id',[ids,EQUIPMENT.id]);
  const before=new Map(ids.map(id=>[id,Number(actual.find(r=>String(r.user_id)===id)?.quantity||0)]));
  for(const id of ids)assert.equal(Number(aggregates.find(r=>String(r.user_id)===id)?.quantity||0),before.get(id),'Pre-grant inventory aggregate differs');
  const inserted=await q(client,`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
    SELECT x.user_id,$2,'ADMIN',$3,x.request_id FROM unnest($1::bigint[],$4::text[]) x(user_id,request_id)
    RETURNING id,user_id`,[ids,EQUIPMENT.id,OPERATION_KEY,ids.map(requestId)]);
  assert.equal(inserted.length,25,'Partial equipment grant');
  const grants=[];
  for(const target of RECIPIENTS) {
    const instance=inserted.find(r=>String(r.user_id)===target.userId);assert(instance);
    const grant={...target,operationKey:OPERATION_KEY,actor:'CODEX_OPERATIONS',matchBasis:'VERIFIED_PLAYDK_NICKNAME',
      equipmentId:EQUIPMENT.id,equipmentCode:EQUIPMENT.code,equipmentName:EQUIPMENT.name,
      requestId:requestId(target.userId),instanceId:String(instance.id),quantityBefore:before.get(target.userId),quantityAfter:before.get(target.userId)+1};
    const audits=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      VALUES($1,$2,'USER',$3,$4,$5) RETURNING id`,
      [owner.id,ACTION,target.userId,JSON.stringify({operationKey:OPERATION_KEY,quantity:grant.quantityBefore}),JSON.stringify(grant)]);
    assert.equal(audits.length,1);assert(audits[0].id);
    grants.push({...grant,adminLogId:String(audits[0].id)});
  }
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,actor:'CODEX_OPERATIONS',
    adminId:String(owner.id),delivery:'DIRECT',equipment:EQUIPMENT,grants,completedAt:new Date().toISOString()};
  assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
  await verifyGBodyGrant(client,receipt,{balances:true});
  return {...receipt,replayed:false};
}
