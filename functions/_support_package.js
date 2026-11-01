import {readPackageCoinAccounting,packageCoinGuardStatements} from './_package_coin_accounting.js';
import {SUPPORT_PACKAGE,LIMITED_SHARD,isSupportPackageProduct,supportPackageFulfillment,supportPackageOrderProduct,supportPackageQuantityValid,supportPackageClientAllowed,supportPackageSummary,SUPPORT_PACKAGE_EVENT_DEADLINE,supportPackageSalesOpen} from '../shared/support-package-v1.mjs';
import {supportAccountEligible,supportBenefits,canManageSupport} from '../shared/server-support-v1.mjs';
import {PASS_KEY} from '../shared/supporter-season-pass-v1.mjs';
import {readSupportRecord} from './_supporter_benefits.js';
import {readPassConfig} from './_supporter_season_pass.js';
import {ensureEmperorEnergyCatalog} from './_emperor_energy.js';
import {ensureForgeScrollCatalog} from './_forge_scroll_catalog.js';
import {ensureRuntimeFoundation} from './_runtime_foundation.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody} from './_joint_request.js';
import {SUPPORT_BANK_MESSAGE_TYPE,SUPPORT_BANK_MESSAGE_TTL,deleteExpiredSupportMessages} from './_supporter_message_expiry.js';

const fail=(code,message,status=400)=>{throw jointError('SUPPORT_PACKAGE_'+code,message,status);};
const orderKey=id=>'support_package_order_v1:'+id,pendingKey=id=>'support_package_pending_v1:'+id;
const requestId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(id);
const validOrder=id=>typeof id==='string'&&/^\d+_[A-Za-z0-9_-]{16,100}$/.test(id);
async function raw(env,key){return (await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value??null;}
async function receipt(env,key,payload){const value=await raw(env,key);if(!value)return null;const saved=JSON.parse(value);if(saved.payload!==payload)fail('REQUEST_CONFLICT','같은 요청 번호에 다른 내용을 사용할 수 없습니다.',409);return {...saved.result,replayed:true};}
export async function ensureLimitedShardCatalog(env){
 const marker='mercenary_sss_limited_shard_catalog_20261020_v1';
 await ensureRuntimeFoundation(env,marker,[marker],async()=>{const x=LIMITED_SHARD;await env.DB.batch([
  env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING').bind(x.code,x.name,x.subtitle,x.description,x.category,x.rarity,x.image,x.sortOrder),
  env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(marker)
 ]);});
}
async function eligibility(env,userId,now){
 const [account,support,config]=await Promise.all([
  env.DB.prepare('SELECT u.id,u.nickname,u.status,u.created_at,s.verified_at FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=?').bind(userId).first(),readSupportRecord(env,userId),readPassConfig(env)
 ]);
 if(!supportAccountEligible(account,now)||!supportBenefits(support.state,now).active||!config.state.enabled)fail('INACTIVE','시즌패스 활성화 유저만 구매 신청할 수 있습니다.',403);
 return {account,support,config};
}
async function pendingOrder(env,userId){const id=await raw(env,pendingKey(userId));if(!id)return null;const value=await raw(env,orderKey(id));if(!value)throw Error('Missing package order');const order=JSON.parse(value);if(order.userId!==Number(userId)||order.status!=='PENDING')throw Error('Invalid package pending order');return {raw:value,order};}
async function applicationResult(env,userId,result,now){
 const message=await env.DB.prepare('SELECT id FROM user_messages WHERE user_id=? AND campaign_key=? AND hidden_at IS NULL').bind(userId,result.campaignKey).first();
 const order=JSON.parse(await raw(env,orderKey(result.order.id)));
 return {...result,order,messageId:now<result.expiresAt&&message?Number(message.id):null,messageExpired:now>=result.expiresAt||!message};
}
export async function issuePackage(env,user,body,now=Date.now()){
 if(!requestId(body.requestId))fail('INPUT','요청 번호를 확인하세요.');
 const quantity=body.quantity===undefined?1:body.quantity;
 if(!supportPackageQuantityValid(quantity))fail('QUANTITY','신청 횟수는 1~100회 사이의 정수로 입력하세요.');
 const id=Number(user.id),{account,support,config}=await eligibility(env,id,now),key='support_package_application_v1:'+id+':'+body.requestId,payload=JSON.stringify(quantity===1?[id]:[id,quantity]);
 const previous=await receipt(env,key,payload);if(previous)return applicationResult(env,id,previous,now);
 // Preserve committed application receipts while closing new bank instructions.
 if(!supportPackageSalesOpen(now))fail('CLOSED','패키지 판매가 종료되었습니다. 기존 신청은 운영자가 확인 후 처리합니다.',410);
 await deleteExpiredSupportMessages(env,now,id);await ensureJointAtomicSchema(env);
 const old=await pendingOrder(env,id);
 if(old&&body.quantity!==undefined&&quantity!==(old.order.quantity??1))fail('QUANTITY_CONFLICT','접수된 신청의 횟수는 변경할 수 없습니다. 기존 신청을 확인해 주세요.',409);
 const order=old?.order||{version:1,quantity,id:id+'_'+body.requestId,userId:id,nickname:account.nickname,product:SUPPORT_PACKAGE,status:'PENDING',revision:0,createdAt:now,eligibleUntil:support.state.endsAt};
 const product=supportPackageOrderProduct(order);if(!product)fail('PRODUCT','신청 시점의 상품 구성을 확인해야 합니다.',409);
 // Reissuing bank instructions keeps the same pending order and never repeats its owner alert.
 const campaign='support_package_bank_v1:'+id+':'+body.requestId;
 const result={ok:true,order,campaignKey:campaign,issuedAt:now,expiresAt:now+SUPPORT_BANK_MESSAGE_TTL,replayed:false};
 const message=`패키지 구매 계좌 안내\n\n신한은행 110-290-621512\n예금주: 전병은\n결제 금액: ${product.priceWon.toLocaleString('ko-KR')}원\n신청 횟수: ${order.quantity??1}회\n\n${product.eventLabel} · 패키지 총 ${product.packageQuantity}개\n${supportPackageSummary(product)}\n${SUPPORT_PACKAGE_EVENT_DEADLINE.notice}\n신청 번호: ${order.id}\n\n반드시 게임 닉네임으로 입금해 주세요.\n같은 신청에 중복 입금하지 마세요. 운영자의 입금 확인 후 패키지가 지급됩니다. 시즌패스 기간은 연장되지 않습니다. 패키지 코인은 승부예측에 사용할 수 없습니다.\n계좌 안내 메시지는 발급 시점부터 5분 뒤 자동 삭제됩니다. 신청 기록은 유지됩니다.`;
 const DB=env.DB,token=crypto.randomUUID(),tokens=[],p=(sql,...a)=>DB.prepare(sql).bind(...a),guard=(test,args)=>{const t=token+tokens.length;tokens.push(t);return jointGuard(DB,t,test,args);};
 try{await DB.batch([
  ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',id),p('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR UPDATE',support.key,PASS_KEY)]:[]),
  guard('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[support.key,support.raw,PASS_KEY,config.raw]),
  guard('EXISTS(SELECT 1 FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=? AND u.status=? AND u.created_at=? AND s.verified_at=?)',[id,'ACTIVE',account.created_at,account.verified_at]),
  guard('NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]),
  ...(old?[guard('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[pendingKey(id),order.id,orderKey(order.id),old.raw])]:[
   guard('NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[pendingKey(id)]),p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',pendingKey(id),order.id),p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',orderKey(order.id),JSON.stringify(order)),
   p("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at) VALUES(1,'SYSTEM',?,?,'SYSTEM',?,?)",'[패키지 구매 접수] '+account.nickname,`${account.nickname} (ID ${id})님의 패키지 구매 신청이 접수되었습니다.\n\n금액: ${product.priceWon.toLocaleString('ko-KR')}원\n신청 횟수: ${order.quantity??1}회\n구성: ${product.eventLabel} · 패키지 총 ${product.packageQuantity}개\n${supportPackageSummary(product)}\n${SUPPORT_PACKAGE_EVENT_DEADLINE.notice}\n신청 번호: ${order.id}\n\nOWNER CMS → 후원 관리 → 패키지 구매 접수에서 확인해 주세요. 실제 입금 확인 후 지급 처리할 수 있습니다.`, 'support_package_owner_alert_v1:'+order.id,new Date(now).toISOString())
  ]),
  p("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at) VALUES(?,'SYSTEM',?,?,?,?,?)",id,'[패키지 구매] '+product.priceWon.toLocaleString('ko-KR')+'원 계좌 안내 · 5분 후 삭제',message,SUPPORT_BANK_MESSAGE_TYPE,campaign,new Date(now).toISOString()),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({payload,result})),...tokens.map(t=>jointGuardEnd(DB,t))
 ]);}catch(error){const replay=await receipt(env,key,payload);if(replay)return applicationResult(env,id,replay,now);if((await pendingOrder(env,id))?.raw!==old?.raw)fail('REVISION','신청 상태가 변경되었습니다. 다시 확인해 주세요.',409);throw error;}
 return applicationResult(env,id,result,now);
}
export async function processPackage(env,admin,body,now=Date.now()){
 if(!canManageSupport(admin))fail('ADMIN','패키지 관리는 핑크빛유두 전용입니다.',403);
 if(!requestId(body.requestId)||!validOrder(body.orderId)||!['FULFILL','REJECT'].includes(body.action)||!Number.isSafeInteger(body.expectedRevision)||typeof body.note!=='string'||!body.note.trim()||body.note.trim().length>200)fail('INPUT','신청과 처리 종류, 입금 확인 메모를 입력하세요.');
 const key='support_package_process_v1:'+body.requestId,payload=JSON.stringify([Number(admin.id),body.orderId,body.action,body.expectedRevision,body.note.trim()]);
 const replay=await receipt(env,key,payload);if(replay)return replay;
 const before=await raw(env,orderKey(body.orderId));if(!before)fail('NOT_FOUND','신청을 찾지 못했습니다.',404);
 const order=JSON.parse(before),grant=body.action==='FULFILL';
 if(order.status!=='PENDING'||order.revision!==body.expectedRevision)fail('REVISION','이미 처리되었거나 변경된 신청입니다. 새로고침해 주세요.',409);
 // Existing October applications keep the October 1+1 terms; November orders use their own product.
 // Completed receipts return above and are never granted a second time.
 if(!supportPackageOrderProduct(order))fail('PRODUCT','신청 시점의 상품 구성을 확인해야 합니다.',409);
 const product=supportPackageOrderProduct(order);
 const target=await env.DB.prepare('SELECT id,nickname,status FROM users WHERE id=?').bind(order.userId).first();if(!target||grant&&target.status!=='ACTIVE')fail('TARGET','현재 지급할 수 없는 계정입니다.',409);
 if(grant){await ensureLimitedShardCatalog(env);await ensureEmperorEnergyCatalog(env);if(product.items.some(item=>item.code==='WEAPON_ENHANCEMENT_SCROLL'))await ensureForgeScrollCatalog(env);}
 await ensureJointAtomicSchema(env);
 const coinAccounting=grant?await readPackageCoinAccounting(env,order.userId):null;
 const next={...order,...(grant?{fulfillment:product}:{}),status:grant?'FULFILLED':'REJECTED',revision:order.revision+1,processedAt:now,processedBy:Number(admin.id),note:body.note.trim()},result={ok:true,order:next,replayed:false};
 const DB=env.DB,token=crypto.randomUUID(),tokens=[],p=(sql,...a)=>DB.prepare(sql).bind(...a),guard=(test,args)=>{const t=token+tokens.length;tokens.push(t);return jointGuard(DB,t,test,args);};
 try{await DB.batch([
  ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',order.userId)]:[]),
  guard('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[orderKey(order.id),before,pendingKey(order.userId),order.id]),
  guard('NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]),
  ...(grant?[
   ...packageCoinGuardStatements(env,order.userId,coinAccounting,{grant:product.coins,orderId:order.id}),
   guard('EXISTS(SELECT 1 FROM users WHERE id=? AND status=? AND coin>=0 AND coin<=CAST(? AS BIGINT))',[order.userId,'ACTIVE',(9223372036854775807n-BigInt(product.coins)).toString()]),
   p('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?',String(product.coins),order.userId),
   p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',product.coins,'시즌패스 패키지 구매 '+order.id,order.userId),
   ...product.items.flatMap(item=>[
    guard('EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1) AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity<0 OR quantity>? OR unseen_quantity>?))',[item.code,order.userId,item.code,Number.MAX_SAFE_INTEGER-item.quantity,Number.MAX_SAFE_INTEGER-item.quantity]),
    p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',order.userId,item.code,item.quantity,item.quantity),
    p('INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,?,?,? FROM cnine_user_inventory WHERE user_id=? AND item_code=?',item.quantity,'시즌패스 패키지 구매','SUPPORT_PACKAGE',order.id,order.userId,item.code)
   ])
  ]:[]),
  p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',JSON.stringify(next),orderKey(order.id),before),
  guard('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[orderKey(order.id),JSON.stringify(next)]),
  p('DELETE FROM app_meta WHERE key=? AND value=?',pendingKey(order.userId),order.id),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'SUPPORT_PACKAGE_'+body.action,'USER',String(order.userId),before,JSON.stringify(next)),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({payload,result})),...tokens.map(t=>jointGuardEnd(DB,t))
 ]);}catch(error){const prior=await receipt(env,key,payload);if(prior)return prior;if(await raw(env,orderKey(order.id))!==before)fail('REVISION','이미 처리된 신청입니다. 새로고침해 주세요.',409);throw error;}
 return result;
}
export async function handleSupportPackage({path,request,env,user,deps,now}){
 if(path==='admin/server-support/package/alerts'){
  if(!canManageSupport(user))fail('ADMIN','패키지 관리는 핑크빛유두 전용입니다.',403);
  if(request.method!=='GET')fail('METHOD','지원하지 않는 요청입니다.',405);
  const rows=await env.DB.prepare("SELECT o.value,u.nickname FROM app_meta p JOIN app_meta o ON o.key='support_package_order_v1:'||p.value JOIN users u ON p.key='support_package_pending_v1:'||u.id WHERE p.key LIKE 'support_package_pending_v1:%' ORDER BY p.updated_at ASC").all();
  return {product:SUPPORT_PACKAGE,pending:rows.results.map(r=>{const o=JSON.parse(r.value);return {id:o.id,userId:o.userId,nickname:r.nickname,createdAt:o.createdAt,quantity:o.quantity??1,product:supportPackageOrderProduct(o)};})};
 }
 const admin=path==='admin/server-support/package';
 if(admin){
  if(!canManageSupport(user))fail('ADMIN','패키지 관리는 핑크빛유두 전용입니다.',403);
  if(request.method==='GET'){
   await ensureLimitedShardCatalog(env);
   const [pending,recent]=await Promise.all([
    env.DB.prepare("SELECT o.value,u.nickname FROM app_meta p JOIN app_meta o ON o.key='support_package_order_v1:'||p.value JOIN users u ON p.key='support_package_pending_v1:'||u.id WHERE p.key LIKE 'support_package_pending_v1:%' ORDER BY p.updated_at ASC").all(),
    env.DB.prepare("SELECT value FROM app_meta WHERE key LIKE 'support_package_order_v1:%' ORDER BY updated_at DESC LIMIT 50").all()
   ]);
   return {product:SUPPORT_PACKAGE,pending:pending.results.map(r=>({...JSON.parse(r.value),nickname:r.nickname})),recent:recent.results.map(r=>JSON.parse(r.value)).filter(r=>r.status!=='PENDING')};
  }
  if(request.method==='POST'){
   const body=await readJointBody(request,{fields:['orderId','action','expectedRevision','requestId','note']});if(!validOrder(body.orderId))fail('INPUT','신청 번호를 확인하세요.');
   return deps.withUserMutationLock(env,Number(body.orderId.split('_')[0]),path,()=>processPackage(env,user,body,(deps.now||Date.now)()));
  }
 }else{
  if(!supportPackageClientAllowed(request))fail('CLIENT_UNAVAILABLE','이 배포판에서는 패키지 구매를 제공하지 않습니다.',403);
  await eligibility(env,user.id,now);
  if(path==='server-support/package'&&request.method==='GET'){
   await ensureLimitedShardCatalog(env);const pending=await pendingOrder(env,user.id);
   const recent=await env.DB.prepare("SELECT value FROM app_meta WHERE key LIKE ? ESCAPE '!' ORDER BY updated_at DESC LIMIT 5").bind(orderKey(Number(user.id)+'!_')+'%').all();
   return {product:pending?supportPackageFulfillment(pending.order.product):SUPPORT_PACKAGE,pending:pending?.order??null,recent:recent.results.map(r=>JSON.parse(r.value)),salesOpen:supportPackageSalesOpen(now),serverNow:now};
  }
  if(path==='server-support/package/apply'&&request.method==='POST'){
   const body=await readJointBody(request,{fields:['requestId','quantity']});await deps.ensureMessages?.(env);
   return deps.withUserMutationLock(env,user.id,path,()=>issuePackage(env,user,body,(deps.now||Date.now)()));
  }
 }
 fail('METHOD','지원하지 않는 요청입니다.',405);
}
