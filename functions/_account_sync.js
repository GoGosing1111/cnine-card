import {normalizeAccountSync,ACCOUNT_SYNC_LEASE_MS} from '../shared/account-sync-v1.mjs';
import {assertJointOrigin,readJointBody,jointError} from './_joint_request.js';
const channel=(env,id)=>env.ACCOUNT_SYNC.getByName(String(id));
export async function readAccountSync(env,userId){
 return normalizeAccountSync(await env.DB.prepare('SELECT revision,domains FROM account_sync_versions_v1 WHERE user_id=?').bind(Number(userId)).first()||{});
}
export async function publishAccountSync(env,userId){
 if(!env.ACCOUNT_SYNC||!userId)return;
 // No query for an account with no listeners. A missed notification is recovered
 // from the same persistent version row by the bounded live-channel check.
 const stub=channel(env,userId);if(!await stub.listening())return;
 await stub.publish(await readAccountSync(env,userId));
}
export async function accountSyncStream(request,env){
 try{
  assertJointOrigin(request);const url=new URL(request.url),id=url.searchParams.get('account'),ticket=url.searchParams.get('ticket');
  if(request.method!=='GET'||request.headers.get('upgrade')?.toLowerCase()!=='websocket'||!/^\d{1,15}$/.test(id||'')||Number(id)<1||!/^[-a-f0-9]{36}$/.test(ticket||''))throw jointError('SYNC_INPUT','연결 정보를 확인하세요.',400);
  if(!env.ACCOUNT_SYNC)throw jointError('SYNC_UNAVAILABLE','동기화 연결을 준비하고 있습니다.',503);
  return await channel(env,id).fetch(request);
 }catch(error){return Response.json({code:error.code||'SYNC_UNAVAILABLE',error:'동기화 연결을 다시 확인합니다.'},{status:error.status||503,headers:{'cache-control':'no-store'}});}
}
export async function handleAccountSync({path,request,env,deps}){
 if(!['sync/ticket','sync/state'].includes(path))return null;
 try{
  if(!env.ACCOUNT_SYNC)throw jointError('SYNC_UNAVAILABLE','동기화 연결을 준비하고 있습니다.',503);
  const user=await deps.authenticate(request,env);if(!user)throw jointError('SYNC_LOGIN','로그인이 필요합니다.',401);
  if(user.status!=='ACTIVE')throw jointError('SYNC_ACCOUNT','계정 상태를 확인하세요.',403);
  if(path==='sync/state'&&request.method==='GET')return deps.json({ok:true,accountId:Number(user.id),snapshot:await readAccountSync(env,user.id),serverNow:Date.now()},200,{'cache-control':'no-store'});
  if(path!=='sync/ticket'||request.method!=='POST')throw jointError('SYNC_METHOD','지원하지 않는 요청입니다.',405);
  await readJointBody(request,{fields:[]});
  const clientId=request.headers.get('x-cnine-client-id')||'';
  if(!/^[a-zA-Z0-9:_-]{12,120}$/.test(clientId))throw jointError('SYNC_CLIENT','접속 정보를 확인하세요.',400);
  // Session enforcement remains in the common request gate. The ticket is
  // single-use, scoped to this account, and never contains a login credential.
  const snapshot=await readAccountSync(env,user.id);
  const result=await channel(env,user.id).issueTicket({userId:Number(user.id),clientId,snapshot});
  return deps.json({ok:true,accountId:Number(user.id),snapshot,leaseMs:ACCOUNT_SYNC_LEASE_MS,...result},200,{'cache-control':'no-store'});
 }catch(error){return deps.json({code:error.code||'SYNC_UNAVAILABLE',error:error.code?error.message:'동기화 연결이 지연되고 있습니다.'},error.status||503,{'cache-control':'no-store'});}
}
