import {PET_PUMPKIN_CHOICE_ITEM as ITEM,PET_PUMPKIN_CHOICES as PETS,PET_PUMPKIN_CHOICE_VERSION as VERSION} from '../shared/pet-pumpkin-choice-v1.mjs';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {readPetCms} from './_pet_companion_cms.js';
import {readPetCollection} from './_pet_account.js';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';

const KIND='PET_PUMPKIN_CHOICE';
const fail=(code,message,status=409)=>jointError('PET_CHOICE_'+code,message,status);
const choices=(cms,owned)=>PETS.filter(pet=>cms.state.document.pets.some(row=>row.code===pet.code)).map(pet=>({...pet,quantity:owned.state.pets[pet.code]||0}));
async function state(env,user){
  const [cms,owned,item,pending]=await Promise.all([
    readPetCms(env),readPetCollection(env,user.id),
    env.DB.prepare('SELECT i.is_active,COALESCE(ui.quantity,0) AS quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.item_code=i.code AND ui.user_id=? WHERE i.code=?').bind(user.id,ITEM.code).first(),
    env.DB.prepare("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1").bind(user.id,KIND).first()
  ]);
  return {cms,owned,quantity:Number(item?.quantity||0),enabled:Number(item?.is_active)===1,pendingRequestId:pending?.request_id||null};
}
export async function petPumpkinChoiceOptions(env,user){
  const current=await state(env,user);
  return {userId:Number(user.id),item:ITEM,version:VERSION,quantity:current.quantity,enabled:current.enabled,choices:choices(current.cms,current.owned),pendingRequestId:current.pendingRequestId};
}
function completed(operation){
  const plan=operation.plan;
  return {ok:true,status:'COMPLETED',requestId:operation.requestId||operation.request_id,replayed:operation.replayed===true,itemCode:ITEM.code,consumed:1,
    reward:{...plan.target,quantity:1,ownedAfter:plan.ownedBefore+1},collectionRevision:plan.collectionRevision+1,refreshAccount:true};
}
export async function petPumpkinChoiceReceipt(env,user,requestId){
  const operation=await readJointOperation(env,user.id,requestId,KIND);
  return operation.status==='COMPLETED'?completed({...operation,replayed:true}):{requestId,status:operation.status,input:operation.plan.input};
}
export async function usePetPumpkinChoice(env,user,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['requestId','targetCode','version'].includes(key)))throw fail('INPUT','선택 요청 항목을 확인해 주세요.',400);
  const target=PETS.find(pet=>pet.code===body.targetCode);
  if(!target)throw fail('TARGET','호박봉순 또는 호박조은을 선택해 주세요.',400);
  if(body.version!==VERSION)throw fail('VERSION','호박펫 선택권 화면을 다시 열어 주세요.');
  const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),input={targetCode:target.code,version:VERSION};
  const operation=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input,
    prepare:async()=>{
      const current=await state(env,user);
      if(current.pendingRequestId)throw fail('PENDING','이전에 사용한 선택권 결과를 먼저 확인해 주세요.');
      if(!current.enabled)throw fail('CLOSED','현재 호박펫 선택권 사용이 중지되어 있습니다.');
      if(!Number.isSafeInteger(current.quantity)||current.quantity<1)throw fail('BALANCE','호박펫 선택권이 없습니다.');
      const selected=choices(current.cms,current.owned).find(pet=>pet.code===target.code);
      if(!selected)throw fail('UNAVAILABLE','선택한 호박펫은 현재 등록되어 있지 않습니다.');
      if(!Number.isSafeInteger(selected.quantity+1)||!Number.isSafeInteger(current.owned.state.revision+1))throw fail('LIMIT','펫 보유 한도를 확인해 주세요.');
      return {input,target,ownedBefore:selected.quantity,collectionRevision:current.owned.state.revision,collectionKey:current.owned.key,collectionRaw:current.owned.raw,cmsRaw:current.cms.raw};
    },
    statements:async plan=>{
      if(plan.target?.code!==target.code)throw fail('TARGET','선택한 펫 정보를 확인해 주세요.',400);
      const [owned,cms]=await Promise.all([readPetCollection(env,user.id),readPetCms(env)]);
      if(owned.key!==plan.collectionKey||owned.raw!==plan.collectionRaw||cms.raw!==plan.cmsRaw)throw Object.assign(fail('CHANGED','펫 보유량 또는 설정이 바뀌어 사용을 취소했습니다. 다시 선택해 주세요.'),{terminal:true});
      const next={...owned.state,revision:plan.collectionRevision+1,pets:{...owned.state.pets,[target.code]:plan.ownedBefore+1}},raw=JSON.stringify(next),token=crypto.randomUUID();
      const collectionGuard=owned.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
      return [
        jointGuard(DB,token,collectionGuard,owned.raw===null?[owned.key]:[owned.key,owned.raw]),
        jointGuard(DB,token+'c','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PET_CMS_KEY,plan.cmsRaw]),
        ...jointInventoryChange(DB,user.id,ITEM.code,-1,'호박펫 선택권 사용',body.requestId),
        p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',owned.key,raw),
        p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) THEN 1 ELSE 0 END WHERE token=?',owned.key,raw,token),
        jointGuardEnd(DB,token),jointGuardEnd(DB,token+'c')
      ];
    }
  });
  return completed(operation);
}
export async function handlePetPumpkinChoice({path,request,env,deps}){
  if(!['pets/choice/options','pets/choice/use','pets/choice/receipt'].includes(path))return null;
  const reply=(body,status=200)=>{const response=deps.json(body,status);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;};
  try{
    const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
    if(path.endsWith('/use')){
      if(request.method!=='POST')throw fail('METHOD','POST 요청이 필요합니다.',405);
      const body=await readJointBody(request,{fields:['requestId','targetCode','version']});
      return reply(await deps.withUserMutationLock(env,user.id,path,()=>usePetPumpkinChoice(env,user,body)));
    }
    if(request.method!=='GET')throw fail('METHOD','GET 요청이 필요합니다.',405);
    return reply(path.endsWith('/options')?await petPumpkinChoiceOptions(env,user):await petPumpkinChoiceReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
  }catch(error){
    if(String(error.code||'').startsWith('PET_CHOICE_'))return reply({ok:false,code:error.code,error:error.message,retryable:error.code.endsWith('_PENDING')},error.status);
    return jointResponseError(error,reply);
  }
}
