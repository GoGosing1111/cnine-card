import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';

// Explicit one-time event. A separate operations receipt must arm this round;
// neither a deployment nor later six-hour rotations enable another payout.
export const CITY_TOP10_EVENT=Object.freeze({
 operationKey:'ops:jokgak-city-top10:20261011-18:v1',
 campaignKey:'jokgak-city-top10-20261011-18-v1',
 epoch:82951,startsAt:Date.parse('2026-10-11T18:00:00+09:00'),endsAt:Date.parse('2026-10-12T00:00:00+09:00'),
 limit:10,rewardType:'COIN',rewardAmount:500_000_000_000,
 title:'족각도시 현금 보유 TOP10 · 5천억 코인'
});
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
export function validateCityTop10Plan(plan){
 for(const [key,value] of Object.entries(CITY_TOP10_EVENT))if(plan?.[key]!==value)throw Error('CITY_TOP10_PLAN_MISMATCH:'+key);
 if(plan.tiePolicy!=='INCLUDE_CUTOFF_TIES'||!Number.isSafeInteger(plan.adminId)||plan.adminId<=0||!['SCHEDULED','COMPLETED'].includes(plan.status))throw Error('CITY_TOP10_PLAN_INVALID');
 return plan;
}
export function rankCityTop10(candidates){
 const sorted=[...candidates].sort((a,b)=>b.cash-a.cash||a.id-b.id);
 if(new Set(sorted.map(c=>c.id)).size!==sorted.length||sorted.some(c=>!Number.isSafeInteger(c.id)||c.id<=0||!Number.isSafeInteger(c.cash)||c.cash<0))throw Error('CITY_TOP10_CANDIDATES_INVALID');
 const cutoff=sorted[Math.min(CITY_TOP10_EVENT.limit,sorted.length)-1]?.cash;
 let rank=0;
 return sorted.map((c,i)=>{if(!i||c.cash!==sorted[i-1].cash)rank=i+1;return {userId:c.id,cash:c.cash,rank,position:i+1};}).filter(c=>c.cash>=cutoff);
}
export function cityTop10Message(recipient){
 return `2026년 10월 11일 18시 ~ 10월 12일 00시 족각도시 로테이션 정산 보상입니다.\n\n정산 순위: ${recipient.rank}위\n종료 직전 현금: ${recipient.cash.toLocaleString('ko-KR')}원\n보상: 5,000억 코인\n\n기존 정책에 따른 자동 수입을 반영했으며, 이번 회차 참여자는 오프라인·퇴장 여부와 관계없이 집계했습니다.\n10위 기준 금액과 같은 현금 보유자는 모두 포함합니다.\n\n아래 보상 수령 버튼을 눌러 코인을 받아 주세요. 이번 회차에 한 번 지급하는 이벤트 보상입니다.`;
}
export async function prepareCityTop10Event(env,{from,to,byEpoch,now=Date.now()}){
 const event=CITY_TOP10_EVENT;
 if(from>event.epoch||to<=event.epoch)return [];
 const row=await p(env,'SELECT value FROM app_meta WHERE key=?',event.operationKey).first();
 if(!row)return [];
 const plan=validateCityTop10Plan(JSON.parse(row.value));
 if(plan.status==='COMPLETED')throw Error('CITY_TOP10_CURSOR_RECEIPT_MISMATCH');
 const candidates=byEpoch.get(event.epoch)?.candidates||[];
 const recipients=rankCityTop10(candidates),token='city-top10:'+crypto.randomUUID();
 const receipt={...plan,status:'COMPLETED',settledFor:new Date(event.endsAt).toISOString(),completedAt:new Date(now).toISOString(),
  candidateCount:candidates.length,recipientCount:recipients.length,totalCoin:String(BigInt(event.rewardAmount)*BigInt(recipients.length)),
  recipients,delivery:'MESSAGE',noImmediateWalletCredit:true};
 const value=JSON.stringify(receipt),statements=[
  p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',value,event.operationKey,row.value),
  cityGuard(env,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM user_messages WHERE campaign_key=?)',[event.operationKey,value,event.campaignKey])
 ];
 for(const recipient of recipients){
  statements.push(p(env,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(?,'ADMIN',?,?,'COIN_REWARD',?)",recipient.userId,event.title,cityTop10Message(recipient,plan),event.campaignKey),
   p(env,"INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,'COIN',CAST(? AS BIGINT) FROM user_messages WHERE user_id=? AND campaign_key=?",event.rewardAmount,recipient.userId,event.campaignKey));
 }
 statements.push(cityGuard(env,token+':delivery',`(SELECT COUNT(*) FROM user_messages WHERE campaign_key=?)=? AND (SELECT COUNT(*) FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id AND m.user_id=r.user_id WHERE m.campaign_key=? AND r.reward_type='COIN' AND r.reward_amount=?)=?`,[event.campaignKey,recipients.length,event.campaignKey,event.rewardAmount,recipients.length]),
  p(env,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'JOKGAK_CITY_TOP10_MESSAGE_SEND','USER_MESSAGE',?,?,?)",plan.adminId,event.operationKey,row.value,value),
  cityGuardEnd(env,token+':delivery'),cityGuardEnd(env,token));
 return statements;
}
