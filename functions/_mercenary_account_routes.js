import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {mercenaryAccountState,readMercenaryRuntime,saveMercenaryRuntime,openMercenaryCards,mercenaryOpeningReceipt,saveMercenaryLoadout,growMercenary} from './_mercenary_account.js';
export const isMercenaryAccountPath=path=>path.startsWith('mercenaries/v3/')||['mercenary-cards/open','mercenary-cards/open-batch','mercenary-cards/feature','hyper-pack/open'].includes(path);
export const mercenaryUsesInnerLock=path=>isMercenaryAccountPath(path);
export async function handleMercenaryAccount({path,request,env,deps}){
  if(!isMercenaryAccountPath(path)&&path!=='admin/mercenaries/runtime')return null;
  if(path==='mercenary-cards/feature')return request.method==='GET'?deps.json({connected:true,userOpeningEnabled:V3_JOINT_RELEASE_ENABLED,packId:'hyper',openPath:'mercenary-cards/open',batchPath:'mercenary-cards/open-batch',receiptPath:'mercenaries/v3/receipt',accountUrl:'/mercenary-hangar/'}):deps.json({error:'GET 요청이 필요합니다.'},405);
  if(!V3_JOINT_RELEASE_ENABLED&&path!=='admin/mercenaries/runtime')return deps.json({code:'MERCENARY_OPENING_DISABLED',error:'용병 공동 업데이트를 준비 중입니다.',userOpeningEnabled:false},path.startsWith('mercenary-cards/')?409:423);
  return handleMercenaryAccountReady({path,request,env,deps});
}
export async function handleMercenaryAccountReady({path,request,env,deps}){
  const {authenticate,json,withUserMutationLock}=deps;
  try{const user=await authenticate(request,env);if(!user)throw jointError('MERCENARY_AUTH','로그인이 필요합니다.',401);
    const admin=path==='admin/mercenaries/runtime';if(admin&&user.role!=='OWNER')throw jointError('MERCENARY_PERMISSION','OWNER만 관리할 수 있습니다.',403);
    if(request.method==='GET'){
      if(admin)return json({policy:await readMercenaryRuntime(env,{draft:true}),releaseEnabled:V3_JOINT_RELEASE_ENABLED});
      if(path==='mercenaries/v3/state')return json(await mercenaryAccountState(env,user));
      if(path==='mercenaries/v3/receipt')return json(await mercenaryOpeningReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
    }
    if(request.method!==(admin?'PATCH':'POST'))throw jointError('MERCENARY_METHOD','지원하지 않는 요청입니다.',405);
    const action=['mercenary-cards/open','mercenary-cards/open-batch','hyper-pack/open','mercenaries/v3/open'].includes(path)?'OPEN':path==='mercenaries/v3/loadout'?'LOADOUT':path==='mercenaries/v3/train'?'TRAIN':path==='mercenaries/v3/level-up'?'LEVEL':null;
    if(!admin&&!action)throw jointError('MERCENARY_PATH','용병 경로를 찾을 수 없습니다.',404);
    const fields=admin?['policy']:action==='OPEN'?['requestId','count']:action==='LOADOUT'?['requestId','mercenaryCode','revision']:['requestId','mercenaryCode','revision','quantity'];
    const body=await readJointBody(request,{fields});if(typeof withUserMutationLock!=='function')throw jointError('MERCENARY_LOCK','계정 잠금 서비스를 확인하세요.',503);
    return json(await withUserMutationLock(env,user.id,path,async()=>admin?{policy:await saveMercenaryRuntime(env,user,body.policy),releaseEnabled:false}:action==='OPEN'?openMercenaryCards(env,user,body):action==='LOADOUT'?saveMercenaryLoadout(env,user,body):growMercenary(env,user,body,action)));
  }catch(error){return jointResponseError(error,json);}
}
