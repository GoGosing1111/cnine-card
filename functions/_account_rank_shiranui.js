// Composed into the XP settlement transaction; no separate grant or client event.
export const SHIRANUI_RANK_CAMPAIGN='account-rank:shiranui:235:v1';
export const shiranuiRankRewardKey=id=>`${SHIRANUI_RANK_CAMPAIGN}:${Number(id)}`;
export const SHIRANUI_MESSAGE_REWARD='MERCENARY_SHIRANUI';
export function shiranuiRankRewardStatements(DB,userId,requiredTicks,{guard='1=1',values=[]}={}){
 const id=Number(userId),key=shiranuiRankRewardKey(id),token=crypto.randomUUID(),p=(s,...v)=>DB.prepare(s).bind(...v);
 if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid rank reward account');
 return [
  p(`INSERT INTO app_meta(key,value,updated_at)
   SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=r.user_id AND mercenary_code='V-987' AND total_copies>0) THEN 'PREVIOUSLY_OWNED' ELSE ? END,CURRENT_TIMESTAMP
   FROM account_rank_progress_v1 r
   WHERE r.user_id=? AND r.total_ticks>=? AND ${guard} ON CONFLICT(key) DO NOTHING`,key,token,id,requiredTicks,...values),
  p(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT ?,'SYSTEM','중장 달성 보상 · 시라누이','중장 계급 달성을 축하합니다! SSS 리미티드 용병 시라누이 1장이 도착했습니다. 아래 보상 수령 버튼을 눌러 주세요. 계정당 1회 지급되며 중장(Lv.235) 이상에서만 편성할 수 있습니다.','ITEM_REWARD',?
   FROM app_meta WHERE key=? AND value=? ON CONFLICT DO NOTHING`,id,SHIRANUI_RANK_CAMPAIGN,key,token),
  p(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,?,1 FROM user_messages m JOIN app_meta a ON a.key=? AND a.value=?
   WHERE m.user_id=? AND m.campaign_key=? ON CONFLICT(message_id) DO NOTHING`,SHIRANUI_MESSAGE_REWARD,key,token,id,SHIRANUI_RANK_CAMPAIGN)
 ];
}
