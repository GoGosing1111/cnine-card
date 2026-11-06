import {jointError} from './_joint_request.js';

export const PACKAGE_GUARANTEE_NOTICE=Object.freeze({
 productCode:'SEASON_PASS_PACKAGE_20261106',unitPriceWon:49800,minimumWon:200000,
 campaignKey:'ops:support-package-xbody-guarantee-notice:20261106:v1',
 title:'[패키지 구매자 안내] X슈트 미획득 보장 이벤트 예정',
 body:'이번 패키지를 누적 20만 원 이상 구매하신 분들을 대상으로, X슈트(X-BODY) 제작에 실패하여 획득하지 못한 경우 보장하는 이벤트를 진행할 예정입니다.\n\n이용에 참고해 주세요.'
});
export const packageGuaranteeNoticeKey=userId=>'support_package_xbody_notice_20261106_v1:'+Number(userId);
const raw=async(env,key)=>(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value??null;
const invalid=()=>{throw jointError('SUPPORT_PACKAGE_NOTICE_STATE','패키지 안내 발송 기록을 확인해야 합니다.',409);};

// Read before the payment batch; its user lock, purchase-counter comparison and
// the guards below serialize the notice with the actual confirmed payment.
export async function planPackageGuaranteeNotice(env,{userId,productCode,paidPurchases,orderId,now}){
 const n=PACKAGE_GUARANTEE_NOTICE,id=Number(userId);
 if(productCode!==n.productCode)return null;
 if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(paidPurchases)||paidPurchases<0)invalid();
 if(BigInt(paidPurchases)*BigInt(n.unitPriceWon)<BigInt(n.minimumWon))return null;
 const key=packageGuaranteeNoticeKey(id),saved=await raw(env,key);
 if(saved!==null){
  const s=JSON.parse(saved);
  if(s.version!==1||s.status!=='SENT'||s.userId!==id||s.campaignKey!==n.campaignKey||s.productCode!==n.productCode)invalid();
  return null; // Durable even after the player reads, hides or deletes the message.
 }
 const manualRaw=await raw(env,n.campaignKey);
 if(manualRaw!==null){
  const m=JSON.parse(manualRaw);
  if(m.status!=='COMPLETED'||m.operationKey!==n.campaignKey||m.productCode!==n.productCode||m.title!==n.title||m.body!==n.body||!Array.isArray(m.recipientIds))invalid();
  if(m.recipientIds.some(recipient=>String(recipient)===String(id)))return null;
 }
 const existing=await env.DB.prepare('SELECT id,title,body,message_type FROM user_messages WHERE user_id=? AND campaign_key=?').bind(id,n.campaignKey).first();
 if(existing&&(existing.title!==n.title||existing.body!==n.body||existing.message_type!=='SYSTEM'))invalid();
 const state={version:1,status:'SENT',userId:id,productCode:n.productCode,campaignKey:n.campaignKey,paidPurchases,paidWon:(BigInt(paidPurchases)*BigInt(n.unitPriceWon)).toString(),orderId,recordedAt:now,source:existing?'EXISTING_MESSAGE':'PACKAGE_FULFILLMENT'};
 return {key,userId:id,manualRaw,existingId:existing?String(existing.id):null,state};
}

export function packageGuaranteeNoticeStatements(DB,plan,guard){
 if(!plan)return [];
 const n=PACKAGE_GUARANTEE_NOTICE,p=(sql,...args)=>DB.prepare(sql).bind(...args),value=JSON.stringify(plan.state);
 return [
  guard('NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[plan.key]),
  plan.manualRaw===null?guard('NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[n.campaignKey]):guard('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[n.campaignKey,plan.manualRaw]),
  ...(plan.existingId?[guard('EXISTS(SELECT 1 FROM user_messages WHERE id=? AND user_id=? AND campaign_key=?)',[plan.existingId,plan.userId,n.campaignKey])]:[
   p("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at) VALUES(?,'SYSTEM',?,?,'SYSTEM',?,?) ON CONFLICT(user_id,campaign_key) DO NOTHING",plan.userId,n.title,n.body,n.campaignKey,new Date(plan.state.recordedAt).toISOString())
  ]),
  guard("EXISTS(SELECT 1 FROM user_messages WHERE user_id=? AND campaign_key=? AND title=? AND body=? AND message_type='SYSTEM')",[plan.userId,n.campaignKey,n.title,n.body]),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',plan.key,value)
 ];
}
