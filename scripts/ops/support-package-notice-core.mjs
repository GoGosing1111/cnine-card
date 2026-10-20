import {PACKAGE_NOTICE_CAMPAIGN,PACKAGE_NOTICE_RECEIPT,PACKAGE_NOTICE_TITLE,PACKAGE_NOTICE_BODY} from '../../shared/support-package-notice-v1.mjs';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from '../../functions/_joint_atomic.js';
import {supportAccountEligible,supportBenefits} from '../../shared/server-support-v1.mjs';

export async function packageNoticeRecipients(env,now=Date.now()){
  const rows=await env.DB.prepare("SELECT u.id,u.status,u.created_at,v.verified_at,m.value FROM app_meta m JOIN users u ON m.key='server_support_v1:'||u.id LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.status='ACTIVE'").all();
  return rows.results.filter(row=>supportAccountEligible(row,now)&&supportBenefits(JSON.parse(row.value),now).active).map(row=>Number(row.id)).sort((a,b)=>a-b);
}
export async function sendPackageNotice(env,{adminId=1,now=Date.now()}={}){
  const DB=env.DB,prior=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PACKAGE_NOTICE_RECEIPT).first();
  // The receipt survives inbox deletion. Retrying must never recreate a read notice.
  if(prior)return {...JSON.parse(prior.value),replayed:true};
  const recipients=await packageNoticeRecipients(env,now);if(!recipients.length)throw Error('No season pass purchasers');
  await ensureJointAtomicSchema(env);
  const result={version:1,campaign:PACKAGE_NOTICE_CAMPAIGN,title:PACKAGE_NOTICE_TITLE,body:PACKAGE_NOTICE_BODY,recipientIds:recipients,count:recipients.length,sentAt:new Date(now).toISOString(),deleteOnRead:true},token=crypto.randomUUID();
  await DB.batch([
    jointGuard(DB,token,'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[PACKAGE_NOTICE_RECEIPT]),
    ...recipients.map(id=>DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,is_read,created_at) VALUES(?,'SYSTEM',?,?,'SYSTEM',?,0,?)").bind(id,PACKAGE_NOTICE_TITLE,PACKAGE_NOTICE_BODY,PACKAGE_NOTICE_CAMPAIGN,result.sentAt)),
    DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(adminId,'SUPPORT_PACKAGE_NOTICE','CAMPAIGN',PACKAGE_NOTICE_CAMPAIGN,null,JSON.stringify(result)),
    DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(PACKAGE_NOTICE_RECEIPT,JSON.stringify(result)),
    jointGuardEnd(DB,token)
  ]);
  return {...result,replayed:false};
}
