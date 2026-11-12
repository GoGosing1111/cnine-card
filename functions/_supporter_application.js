import {supportAccountEligible,SUPPORT_PLAN,canManageSupport} from '../shared/server-support-v1.mjs';
import {jointError} from './_joint_request.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {SUPPORT_BANK_MESSAGE_TYPE,SUPPORT_BANK_MESSAGE_TTL,deleteExpiredSupportMessages} from './_supporter_message_expiry.js';
import {readSupportRecord} from './_supporter_benefits.js';
import {passMonth,secondPassSale} from './_supporter_season_pass.js';
import {passSubscription} from '../shared/supporter-season-pass-v1.mjs';
import {PASS_ORDER_PREFIX as passOrderPrefix,secondPassOrderKey,unpaidKey,supportAccount,requirePassPurchase,purchaseHoldGuard} from './_support_pass_review.js';
export {secondPassOrderKey};

const LIMIT=3,KST=9*60*60*1000;
export const SUPPORT_APPLICATION_CONFIG_KEY='server_support_application_config_v1';
const dayOf=now=>new Date(now+KST).toISOString().slice(0,10);
const dayKey=(userId,now)=>`support_application_day_v1:${userId}:${dayOf(now)}`;
const receiptKey=(userId,requestId)=>`support_application_receipt_v1:${userId}:${requestId}`;
const campaignKey=(userId,requestId)=>`support_application_v1:${userId}:${requestId}`;
const fail=(code,message,status=400)=>{throw jointError('SUPPORT_APPLICATION_'+code,message,status);};
const passOrderStatement=(db,id,requestId,now)=>db.prepare(
  'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING'
).bind(secondPassOrderKey(id),JSON.stringify({id:id+'_'+requestId,userId:id,createdAt:now}));
export async function secondPassOrder(env,id){
  return receipt(env,secondPassOrderKey(id));
}
export async function secondPassOrders(env){
  const rows=await env.DB.prepare(`SELECT p.value,u.nickname FROM app_meta p
    JOIN users u ON u.id=CAST(substr(p.key,?) AS BIGINT)
    WHERE p.key>=? AND p.key<? ORDER BY p.updated_at,p.key`).bind(passOrderPrefix.length+1,passOrderPrefix,passOrderPrefix+'~').all();
  return rows.results.map(r=>({...JSON.parse(r.value),nickname:r.nickname,month:2,priceWon:SUPPORT_PLAN.priceWon}));
}
// A purchase confirmation request contains no bank details and grants no benefits.
// Users can still request the existing, separately controlled bank notice when available.
export async function requestSecondPassPurchase(env,userRow,requestId,now){
  const id=Number(userRow.id),DB=env.DB;
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))fail('INPUT','신청 번호를 확인하세요.');
  if(!supportAccountEligible(userRow,now))fail('ELIGIBILITY','가입 3일 경과와 2차 인증 완료 후 신청할 수 있습니다.',403);
  requirePassPurchase(userRow);
  const receiptKey='support_pass_month2_request_v1:'+id+':'+requestId;
  const [support,pending,previous]=await Promise.all([readSupportRecord(env,id),secondPassOrder(env,id),receipt(env,receiptKey)]);
  if(passSubscription(support.state,2,now).purchased)return {purchased:true,pending:null,serverNow:now};
  if(pending||previous){
    if(pending?.id!==id+'_'+requestId&&await receipt(env,unpaidKey(id+'_'+requestId)))fail('REJECTED','미입금으로 거절된 신청입니다.',409);
    return {pending,serverNow:now};
  }
  const sale=await secondPassSale(env,support.state,now),token=crypto.randomUUID(),p=(sql,...args)=>DB.prepare(sql).bind(...args);
  await ensureJointAtomicSchema(env);
  try{await DB.batch([
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',id),p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',sale.key)]:[]),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[sale.key,sale.raw]),
    jointGuard(DB,token+'t',support.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',support.raw===null?[support.key]:[support.key,support.raw]),
    jointGuard(DB,token+'u','EXISTS(SELECT 1 FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=? AND u.status=? AND u.created_at=? AND s.verified_at=?)',[id,'ACTIVE',userRow.created_at,userRow.verified_at]),
    jointGuard(DB,token+'h',...purchaseHoldGuard(userRow)),
    jointGuard(DB,token+'n','NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[unpaidKey(id+'_'+requestId)]),
    passOrderStatement(DB,id,requestId,now),
    p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',receiptKey,JSON.stringify({issuedAt:now})),
    ...[token,token+'t',token+'u',token+'h',token+'n'].map(t=>jointGuardEnd(DB,t))
  ]);}catch(error){
    requirePassPurchase(await supportAccount(env,id));
    if(await receipt(env,unpaidKey(id+'_'+requestId)))fail('REJECTED','미입금으로 거절된 신청입니다.',409);
    if(passSubscription((await readSupportRecord(env,id)).state,2,now).purchased)return {purchased:true,pending:null,serverNow:now};
    if(!(await receipt(env,receiptKey)))throw error;
  }
  return {pending:await secondPassOrder(env,id),serverNow:now};
}
export async function lastPassApplication(env,userId){
  const prefix='support_application_day_v1:'+Number(userId)+':';
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key>=? AND key<? ORDER BY key DESC LIMIT 1').bind(prefix,prefix+'~').first();
  if(!row)return null;
  const saved=JSON.parse(row.value);
  return saved.issuedAt?{month:saved.month,issuedAt:saved.issuedAt}:null;
}
async function ledger(env,userId,now){
  const key=dayKey(userId,now),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  const used=row?JSON.parse(row.value).used:0;
  if(!Number.isInteger(used)||used<0||used>LIMIT)throw Error('Invalid supporter application ledger');
  return {key,raw:row?.value??null,used};
}
function status(used,now){return {used,limit:LIMIT,remaining:LIMIT-used,resetsAt:Date.parse(dayOf(now)+'T00:00:00+09:00')+86400000,expiresAfterSeconds:SUPPORT_BANK_MESSAGE_TTL/1000};}
async function configRecord(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SUPPORT_APPLICATION_CONFIG_KEY).first(),value=row?JSON.parse(row.value):{};
  return {key:SUPPORT_APPLICATION_CONFIG_KEY,raw:row?.value??null,config:{enabled:value.enabled===true,firstMonthSalesOpen:value.firstMonthSalesOpen!==false,revision:Number(value.revision)||0}};
}
function requireFirstMonthOpen(record){
  if(!record.config.firstMonthSalesOpen)fail('MONTH1_CLOSED','1개월차 시즌패스 판매가 종료되었습니다.',409);
  return record;
}
export async function firstPassSale(env){return requireFirstMonthOpen(await configRecord(env));}
// Lock the owner row when initializing settings: PostgreSQL cannot lock a missing config row.
export function lockSaleConfig(DB,p,sale,writing=false){
  if(DB.dialect!=='postgres')return [];
  const lock=writing?' FOR UPDATE':' FOR SHARE';
  return sale.raw==null?[p('SELECT id FROM users WHERE id=1'+lock)]:[p('SELECT key FROM app_meta WHERE key=?'+lock,sale.key)];
}
export async function readSupportApplicationConfig(env){return (await configRecord(env)).config;}
export async function readSupportApplication(env,userId,now=Date.now()){
  const [record,config]=await Promise.all([ledger(env,userId,now),readSupportApplicationConfig(env)]);
  return {...status(record.used,now),enabled:config.enabled,firstMonthSalesOpen:config.firstMonthSalesOpen};
}
export async function saveSupportApplicationConfig(env,admin,body,now=Date.now()){
  if(!canManageSupport(admin))fail('ADMIN','후원 관리는 핑크빛유두 전용입니다.',403);
  if(typeof body.enabled!=='boolean'||(body.firstMonthSalesOpen!==undefined&&typeof body.firstMonthSalesOpen!=='boolean')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))fail('INPUT','신청 버튼 설정을 확인하세요.');
  const key='support_application_settings_receipt_v1:'+body.requestId,payload=JSON.stringify([admin.id,body.enabled,body.expectedRevision,...(body.firstMonthSalesOpen===undefined?[]:[body.firstMonthSalesOpen])]);
  const replay=async()=>{const prior=await receipt(env,key);if(!prior)return null;if(prior.payload!==payload)fail('REQUEST_CONFLICT','같은 요청 번호로 다른 설정을 저장할 수 없습니다.',409);return {...prior.result,replayed:true};};
  const previous=await replay();if(previous)return previous;
  const record=await configRecord(env);if(record.config.revision!==body.expectedRevision)fail('REVISION','다른 창에서 설정을 변경했습니다. 새로고침 후 다시 저장하세요.',409);
  const config={enabled:body.enabled,firstMonthSalesOpen:body.firstMonthSalesOpen??record.config.firstMonthSalesOpen,revision:record.config.revision+1},raw=JSON.stringify({...config,lastRequestId:body.requestId}),DB=env.DB,token=crypto.randomUUID(),p=(sql,...a)=>DB.prepare(sql).bind(...a);
  const result={ok:true,config,processedAt:now,replayed:false};await ensureJointAtomicSchema(env);
  try{await DB.batch([
    ...lockSaleConfig(DB,p,record,true),
    jointGuard(DB,token,record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',record.raw===null?[SUPPORT_APPLICATION_CONFIG_KEY]:[SUPPORT_APPLICATION_CONFIG_KEY,record.raw]),
    record.raw===null?p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',SUPPORT_APPLICATION_CONFIG_KEY,raw):p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,SUPPORT_APPLICATION_CONFIG_KEY,record.raw),
    jointGuard(DB,token+'w','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[SUPPORT_APPLICATION_CONFIG_KEY,raw]),
    p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'SERVER_SUPPORT_APPLICATION_SETTINGS','SETTINGS',SUPPORT_APPLICATION_CONFIG_KEY,JSON.stringify(record.config),JSON.stringify(result)),
    p('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify({payload,result})),
    jointGuardEnd(DB,token),jointGuardEnd(DB,token+'w')
  ]);}catch(error){const prior=await replay();if(prior)return prior;if((await configRecord(env)).raw!==record.raw)fail('REVISION','다른 창에서 설정을 변경했습니다. 새로고침 후 다시 저장하세요.',409);throw error;}
  return result;
}
async function receipt(env,key){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null;}
async function resultFor(env,userId,saved,now,replayed){
  const row=await env.DB.prepare('SELECT id FROM user_messages WHERE user_id=? AND campaign_key=? AND hidden_at IS NULL').bind(userId,campaignKey(userId,saved.requestId)).first();
  return {ok:true,...saved,replayed,serverNow:now,expired:now>=saved.expiresAt,messageId:now<saved.expiresAt?Number(row?.id)||null:null,application:await readSupportApplication(env,userId,now)};
}
export async function issueSupportApplication(env,user,body,now=Date.now(),accountRow=null){
  const id=Number(user.id),month=passMonth(body.month);
  if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))fail('INPUT','신청 요청을 다시 확인하세요.');
  const row=accountRow??await supportAccount(env,id);
  if(!supportAccountEligible(row,now))fail('ELIGIBILITY','가입 3일 경과와 2차 인증 완료 후 신청할 수 있습니다.',403);
  requirePassPurchase(row);
  const applicationConfig=await configRecord(env);
  if(!applicationConfig.config.enabled)fail('DISABLED','현재 후원 신청을 받지 않습니다.',403);
  const key=receiptKey(id,body.requestId),previous=await receipt(env,key);
  // Replaying an old request never recreates an expired or manually deleted message.
  const replay=async saved=>{
    if((saved.month??1)!==month)fail('REQUEST_CONFLICT','같은 신청 번호의 시즌패스가 다릅니다.',409);
    if(month===2&&await receipt(env,unpaidKey(id+'_'+body.requestId)))fail('REJECTED','미입금으로 거절된 신청입니다.',409);
    return resultFor(env,id,saved,now,true);
  };
  if(previous)return replay(previous);
  if(month===1)requireFirstMonthOpen(applicationConfig);
  await deleteExpiredSupportMessages(env,now,id);
  const support=month===2?await readSupportRecord(env,id):null;
  const sale=support?await secondPassSale(env,support.state,now):null;
  await ensureJointAtomicSchema(env);
  for(let attempt=0;attempt<4;attempt++){
    const record=await ledger(env,id,now);
    if(record.used>=LIMIT)fail('LIMIT','오늘 계좌 안내를 3회 모두 발급했습니다. 한국시간 자정 이후 다시 신청해 주세요.',429);
    const saved={requestId:body.requestId,month,issuedAt:now,expiresAt:now+SUPPORT_BANK_MESSAGE_TTL},next=JSON.stringify({used:record.used+1,lastRequestId:body.requestId,issuedAt:now,month});
    const message=`서버 운영 후원 계좌 안내\n\n신한은행 110-290-621512\n예금주: 전병은\n${month}개월차 시즌패스 · 30일 후원: ${SUPPORT_PLAN.priceWon.toLocaleString('ko-KR')}원\n\n반드시 게임 닉네임으로 입금해 주세요.\n\n이 메시지는 발급 시점부터 5분 뒤 자동 삭제됩니다. 계좌 안내는 하루 3회까지 발급할 수 있습니다.\n운영자의 후원 확인 후 30일 혜택이 적용됩니다.`;
    const DB=env.DB,token=crypto.randomUUID(),tokens=['d','r','a','w','m','c'].map(s=>token+s),p=(sql,...args)=>DB.prepare(sql).bind(...args);
    try{
      await DB.batch([
        ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',id)]:[]),
        ...lockSaleConfig(DB,p,applicationConfig),
        ...(sale&&DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',sale.key)]:[]),
        jointGuard(DB,token+'h',...purchaseHoldGuard(row)),
        ...(month===2?[jointGuard(DB,token+'n','NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[unpaidKey(id+'_'+body.requestId)])]:[]),
        ...(sale?[jointGuard(DB,token+'sale','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[sale.key,sale.raw]),
          jointGuard(DB,token+'term',support.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',support.raw===null?[support.key]:[support.key,support.raw])]:[]),
        jointGuard(DB,tokens[0],record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',record.raw===null?[record.key]:[record.key,record.raw]),
        jointGuard(DB,tokens[1],'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]),
        jointGuard(DB,tokens[2],'EXISTS(SELECT 1 FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=? AND u.status=? AND u.created_at=? AND s.verified_at=?)',[id,'ACTIVE',row.created_at,row.verified_at]),
        record.raw===null?p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',record.key,next):p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',next,record.key,record.raw),
        jointGuard(DB,tokens[3],'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[record.key,next]),
        p("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at) VALUES(?,'SYSTEM',?,?,?,?,?)",id,`[후원 신청] ${month}개월차 시즌패스 계좌 안내 · 5분 후 삭제`,message,SUPPORT_BANK_MESSAGE_TYPE,campaignKey(id,body.requestId),new Date(now).toISOString()),
        jointGuard(DB,tokens[4],'EXISTS(SELECT 1 FROM user_messages WHERE user_id=? AND campaign_key=?)',[id,campaignKey(id,body.requestId)]),
        jointGuard(DB,tokens[5],'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[SUPPORT_APPLICATION_CONFIG_KEY,applicationConfig.raw]),
        p('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify(saved)),
        ...(month===2?[passOrderStatement(DB,id,body.requestId,now)]:[]),
        ...[...tokens,token+'h',...(sale?[token+'sale',token+'term',token+'n']:[])].map(t=>jointGuardEnd(DB,t))
      ]);
      return resultFor(env,id,saved,now,false);
    }catch(error){
      const prior=await receipt(env,key);if(prior)return replay(prior);
      requirePassPurchase(await supportAccount(env,id));
      if(month===1)await firstPassSale(env);
      if(month===2&&await receipt(env,unpaidKey(id+'_'+body.requestId)))fail('REJECTED','미입금으로 거절된 신청입니다.',409);
      if((await ledger(env,id,now)).raw!==record.raw&&attempt<3)continue;
      throw error;
    }
  }
}
