import assert from 'node:assert/strict';

export const CAMPAIGN='fortress-participation-20261003-master-star-1500000';
export const RECEIPT_KEY='ops:'+CAMPAIGN;
export const TITLE='포트리스 참가상';
export const BODY='포트리스 참가상으로 마스터의 별 1,500,000개를 지급합니다. 메시지에서 보상을 수령해 주세요.';
export const AMOUNT=1500000;
const query=async(client,sql,values=[]) => (await client.query(sql,values)).rows;

export async function verifyFortressPrize(client,recipients){
  const messages=await query(client,`SELECT m.id,m.user_id,m.title,m.body,m.message_type,r.id reward_id,r.user_id reward_user_id,r.reward_type,r.reward_amount,r.claimed_at
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1`,[CAMPAIGN]);
  assert.equal(messages.length,recipients.length,'Stored audience or reward count differs');
  const ids=new Set(recipients.map(x=>String(x.userId))),seen=new Set();
  for(const m of messages){
    assert(ids.has(String(m.user_id))&&!seen.has(String(m.user_id)),'Unexpected or duplicate recipient');
    seen.add(String(m.user_id));
    assert.equal(m.title,TITLE);assert.equal(m.body,BODY);assert.equal(m.message_type,'ITEM_REWARD');
    assert.equal(String(m.reward_user_id),String(m.user_id));assert.equal(m.reward_type,'MASTER_STAR');
    assert.equal(Number(m.reward_amount),AMOUNT);assert(m.reward_id,'Missing reward');
  }
  return {campaign:CAMPAIGN,messages:messages.length,totalMasterStars:messages.length*AMOUNT,
    claimed:messages.filter(m=>m.claimed_at).length,pendingClaims:messages.filter(m=>!m.claimed_at).length};
}

// Caller owns BEGIN/COMMIT/ROLLBACK. This sends claimable messages; it never credits inventory directly.
// Replays and later resolutions of the two missing accounts share the same campaign and audit receipt.
export async function sendFortressPrize(client,recipients,unresolved,{skipUnresolved=false}={}){
  assert.equal(recipients.length+unresolved.length,72,'Expected the 72 approved participants');
  assert.equal(new Set(recipients.map(x=>String(x.userId))).size,recipients.length,'Duplicate recipient');
  assert.equal(new Set([...recipients.map(x=>x.participant),...unresolved]).size,72,'Duplicate participant');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[RECEIPT_KEY]);
  const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[RECEIPT_KEY]);
  const prior=saved?JSON.parse(saved.value):null;
  if(prior){
    assert.equal(prior.campaign,CAMPAIGN);assert.equal(prior.amountPerPerson,AMOUNT);
    for(const r of prior.recipients)assert(recipients.some(x=>x.participant===r.participant&&String(x.userId)===String(r.userId)),'Previously paid identity changed');
    await verifyFortressPrize(client,prior.recipients);
  }else{
    const [existing]=await query(client,'SELECT COUNT(*) n FROM user_messages WHERE campaign_key=$1',[CAMPAIGN]);
    assert.equal(Number(existing.n),0,'Existing messages without an audit receipt require reconciliation');
  }
  const users=await query(client,`SELECT u.id,u.nickname,u.status,s.provider_name FROM users u
    LEFT JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=ANY($1::bigint[]) FOR SHARE OF u`,[recipients.map(x=>x.userId)]);
  assert.equal(users.length,recipients.length);
  const norm=value=>String(value||'').normalize('NFC').trim().toLowerCase();
  for(const r of recipients){
    const u=users.find(x=>String(x.id)===String(r.userId));
    assert.equal(u.status,'ACTIVE','Inactive recipient');
    assert(norm(u.nickname)===norm(r.participant)||norm(u.provider_name)===norm(r.participant),'Recipient nickname linkage changed');
  }
  const [item]=await query(client,"SELECT code,is_active FROM inventory_items WHERE code='MASTER_STAR'");
  assert.equal(Number(item?.is_active),1,'Master Star item is unavailable');
  const already=new Set((prior?.recipients||[]).map(x=>String(x.userId)));
  const additions=recipients.filter(x=>!already.has(String(x.userId)));
  let messageIds=[],rewardIds=[];
  if(additions.length){
    const messages=await query(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
      SELECT user_id,'ADMIN',$2,$3,'ITEM_REWARD',$4 FROM unnest($1::bigint[]) a(user_id) RETURNING id,user_id`,
      [additions.map(x=>x.userId),TITLE,BODY,CAMPAIGN]);
    assert.equal(messages.length,additions.length,'Partial message insert');
    const rewards=await query(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
      SELECT id,user_id,'MASTER_STAR',$2 FROM user_messages WHERE id=ANY($1::bigint[]) RETURNING id,message_id`,
      [messages.map(x=>x.id),AMOUNT]);
    assert.equal(rewards.length,additions.length,'Partial reward insert');
    messageIds=messages.map(x=>String(x.id));rewardIds=rewards.map(x=>String(x.id));
  }
  const receipt={status:unresolved.length&&!skipUnresolved?'PARTIAL_PENDING_ACCOUNT_RESOLUTION':'COMPLETED',campaign:CAMPAIGN,
    title:TITLE,body:BODY,rewardType:'MASTER_STAR',amountPerPerson:AMOUNT,expectedParticipants:72,
    delivery:'MESSAGE',noImmediateInventoryCredit:true,actor:'CODEX_OPERATIONS',
    authorization:'위 인원 마별 150만개 포트리스 참가상 메세지로 지급',
    exclusionAuthorization:skipUnresolved?'미확인 콧송이·공명 계정에 대한 사용자 답변: 패스':null,
    recipients,unresolved:skipUnresolved?[]:unresolved,skipped:skipUnresolved?unresolved:[],
    messageIds:[...(prior?.messageIds||[]),...messageIds],rewardIds:[...(prior?.rewardIds||[]),...rewardIds],
    totalMasterStars:recipients.length*AMOUNT,createdAt:prior?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await client.query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,[RECEIPT_KEY,JSON.stringify(receipt)]);
  return {...await verifyFortressPrize(client,recipients),newMessages:additions.length,
    unresolved:receipt.unresolved,skipped:receipt.skipped};
}
