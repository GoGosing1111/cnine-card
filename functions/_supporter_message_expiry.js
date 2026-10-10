export const SUPPORT_BANK_MESSAGE_TYPE='SUPPORT_BANK_ACCOUNT';
export const SUPPORT_BANK_MESSAGE_TTL=5*60*1000;
export const supportMessageCutoff=(now=Date.now())=>new Date(now-SUPPORT_BANK_MESSAGE_TTL).toISOString();
// Only this message type expires. The bind parameter is a server UTC cutoff.
export const liveSupportMessageSql=(alias='')=>`(COALESCE(${alias}message_type,'')<>'${SUPPORT_BANK_MESSAGE_TYPE}' OR ${alias}created_at>?)`;
export function presentSupportMessage(message){
  return message.message_type===SUPPORT_BANK_MESSAGE_TYPE?{...message,expiresAt:Date.parse(message.created_at)+SUPPORT_BANK_MESSAGE_TTL}:message;
}
export async function deleteExpiredSupportMessages(env,now=Date.now(),userId=null){
  const args=[SUPPORT_BANK_MESSAGE_TYPE,supportMessageCutoff(now)];if(userId!==null)args.push(userId);
  return env.DB.prepare(`DELETE FROM user_messages WHERE message_type=? AND created_at<=?${userId!==null?' AND user_id=?':''}`).bind(...args).run();
}
export async function reconcileSupportMessages(env,now=Date.now()){
  await deleteExpiredSupportMessages(env,now);
  const next=await env.DB.prepare('SELECT MIN(created_at) AS created_at FROM user_messages WHERE message_type=?').bind(SUPPORT_BANK_MESSAGE_TYPE).first();
  return next?.created_at?new Date(Date.parse(next.created_at)+SUPPORT_BANK_MESSAGE_TTL).toISOString():null;
}
