import {PACKAGE_NOTICE_CAMPAIGN} from '../shared/support-package-notice-v1.mjs';

export function presentPackageNotice(message){
  return {...message,deleteOnRead:message.campaign_key===PACKAGE_NOTICE_CAMPAIGN&&message.message_type==='SYSTEM'&&!message.reward_type};
}
export async function deleteReadPackageNotice(env,userId,messageId){
  const result=await env.DB.prepare(`DELETE FROM user_messages WHERE id=? AND user_id=? AND campaign_key=? AND message_type='SYSTEM'
    AND NOT EXISTS(SELECT 1 FROM user_message_rewards r WHERE r.message_id=user_messages.id)`)
    .bind(messageId,userId,PACKAGE_NOTICE_CAMPAIGN).run();
  return Number(result.meta?.changes||0)>0;
}
