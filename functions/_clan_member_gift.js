// Used only inside the OWNER roster-change transaction, never as a broadcast.
const check=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{status:409});};
const MONEY_COLUMNS={users:['coin'],user_message_rewards:['reward_amount'],
  user_message_reward_claim_receipts_v1222:['reward_amount','balance_before','balance_after'],coin_logs:['change_amount','balance_after']};

export function clanGiftSpec(value) {
  if(value===undefined)return null;
  check(value&&Number.isSafeInteger(value.coin)&&value.coin>0&&value.coin<=3000000000,'클랜 메시지 코인은 1~30억 정수로 지정하세요.');
  check(typeof value.title==='string'&&value.title.trim().length>0&&value.title.length<=100
    &&typeof value.body==='string'&&value.body.trim().length>0&&value.body.length<=1000,'보상 메시지 제목과 내용을 확인하세요.');
  return {coin:value.coin,title:value.title.trim(),body:value.body.trim()};
}

export async function clanGiftRecipients(q,target,{projectChange=false}={}) {
  const rows=await q(`SELECT m.user_id,u.nickname,u.status,m.member_role FROM clan_members m JOIN users u ON u.id=m.user_id
    WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id`,[target.seasonId,target.clanId]);
  let recipients=rows;
  if(projectChange) {
    const removed=new Set((target.removeMembers||[]).map(m=>m.userId));
    recipients=rows.filter(m=>!removed.has(Number(m.user_id)));
    const [incoming]=await q('SELECT id AS user_id,nickname,status FROM users WHERE id=$1',[target.userId]);
    check(incoming,'편입할 보상 수신 계정이 없습니다.');
    recipients.push({...incoming,member_role:'MEMBER'});
  }
  check(recipients.length>0&&recipients.length<=22&&recipients.every(m=>String(m.status).toUpperCase()==='ACTIVE'),
    '클랜 보상 수신 인원 또는 계정 상태를 확인하세요.');
  const result=recipients.map(m=>({userId:Number(m.user_id),nickname:m.nickname,memberRole:m.member_role})).sort((a,b)=>a.userId-b.userId);
  check(new Set(result.map(m=>m.userId)).size===result.length,'클랜 보상 대상이 중복되었습니다.');
  return result;
}

export async function clanGiftMoneyStorage(q,{upgrade=false}={}) {
  const columns=await q(`SELECT table_name,column_name,data_type FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[Object.keys(MONEY_COLUMNS)]);
  const changed=[];
  for(const [table,names] of Object.entries(MONEY_COLUMNS))for(const name of names) {
    const column=columns.find(c=>c.table_name===table&&c.column_name===name);
    check(column&&['bigint','integer','smallint'].includes(column.data_type),'메시지 보상 금액 저장 구조를 확인하지 못했습니다.');
    if(column.data_type!=='bigint') {
      changed.push(`${table}.${name}`);
      // All identifiers come from MONEY_COLUMNS, not from the request.
      if(upgrade)await q(`ALTER TABLE ${table} ALTER COLUMN ${name} TYPE BIGINT USING ${name}::bigint`);
    }
  }
  return changed;
}

export async function sendClanGift(q,target,previewId,expectedRecipients) {
  const recipients=await clanGiftRecipients(q,target);
  check(JSON.stringify(recipients)===JSON.stringify(expectedRecipients),'확인한 클랜 보상 수신 명단이 변경되었습니다.');
  const campaignKey=`clan-roster-gift:${previewId}`,gift=target.clanGift;
  const [prior]=await q('SELECT id FROM user_messages WHERE campaign_key=$1 LIMIT 1',[campaignKey]);
  check(!prior,'동일 요청의 보상 메시지 기록이 이미 존재합니다.');
  const messages=await q(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT user_id,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) AS target(user_id)
    RETURNING id,user_id`,[recipients.map(m=>m.userId),gift.title,gift.body,campaignKey]);
  check(messages.length===recipients.length,'클랜 보상 메시지 생성 인원이 일치하지 않습니다.');
  const rewards=await q(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1
    RETURNING id,message_id,user_id,reward_amount`,[campaignKey,gift.coin]);
  check(rewards.length===recipients.length&&rewards.every(r=>Number(r.reward_amount)===gift.coin),'클랜 메시지 보상 금액 또는 인원이 일치하지 않습니다.');
  return {campaignKey,delivery:'MESSAGE',sent:recipients.length,coinPerUser:gift.coin,totalCoin:gift.coin*recipients.length,
    title:gift.title,recipients:recipients.map(m=>({...m,messageId:Number(messages.find(row=>Number(row.user_id)===m.userId).id),
      rewardId:Number(rewards.find(row=>Number(row.user_id)===m.userId).id)}))};
}
