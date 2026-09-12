import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {readForgeRuntime,saveForgeRuntime,forgeAccountState,forgeQuote,executeForge,forgeReceipt} from './_equipment_forge_transactions.js';
export const isForgeRuntimePath=path=>path.startsWith('character/equipment/forge/')||path==='admin/equipment-forge/runtime';
export async function handleForgeRuntime({path,request,env,deps}){
 if(!isForgeRuntimePath(path))return null;
 // Preserve the approved public inventory/notice during the joint release hold.
 if(!V3_JOINT_RELEASE_ENABLED&&path!=='admin/equipment-forge/runtime')return null;
 return handleForgeRuntimeReady({path,request,env,deps});
}
export async function handleForgeRuntimeReady({path,request,env,deps}){
 const {authenticate,json,withUserMutationLock}=deps;
 try{const user=await authenticate(request,env);if(!user)throw jointError('FORGE_AUTH','로그인이 필요합니다.',401);const admin=path==='admin/equipment-forge/runtime';
  if(admin&&user.role!=='OWNER')throw jointError('FORGE_PERMISSION','OWNER만 정책을 관리할 수 있습니다.',403);
  const action=path.split('/').at(-1),url=new URL(request.url);
  if(request.method==='GET'){
   if(admin)return json({policy:await readForgeRuntime(env,{draft:true}),releaseEnabled:false});
   if(action==='state'||action==='status')return json(await forgeAccountState(env,user,{group:url.searchParams.get('group')||'all',beforeId:url.searchParams.get('beforeId'),limit:40}));
   if(action==='receipt')return json(await forgeReceipt(env,user,url.searchParams.get('requestId'),url.searchParams.get('kind')));
  }
  if(request.method!==(admin?'PATCH':'POST'))throw jointError('FORGE_METHOD','지원하지 않는 요청입니다.',405);
  if(!admin&&!['quote','enhance','restore'].includes(action))throw jointError('FORGE_PATH','강화 경로를 찾을 수 없습니다.',404);
  const fields=admin?['policy']:action==='quote'?['requestId','kind','instanceId','recordId','useProtection']:['requestId','quoteId'],body=await readJointBody(request,{fields,maxBytes:24000});
  if(typeof withUserMutationLock!=='function')throw jointError('FORGE_LOCK','계정 잠금 서비스를 확인하세요.',503);
  return json(await withUserMutationLock(env,user.id,path,async()=>admin?{policy:await saveForgeRuntime(env,user,body.policy),releaseEnabled:false}:action==='quote'?forgeQuote(env,user,body):executeForge(env,user,body,action==='enhance'?'ENHANCE':'RESTORE',{randomInt:deps.forgeRandomInt})));
 }catch(error){return jointResponseError(error,json);}
}
