import {RANK_POTIONS,RANK_POTION_VERSION,rankPotionItem,rankPotionState,nextRankPotion} from '../shared/rank-exp-potion-v1.mjs';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
const KIND='RANK_EXP_POTION';
const fail=(code,message,status=409)=>jointError('RANK_POTION_'+code,message,status);
export const rankPotionKey=userId=>'account_rank_potion_v1:'+userId;
async function record(env,userId){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(rankPotionKey(userId)).first();
 let state=null;try{state=JSON.parse(row?.value||'null');}catch{}
 return {raw:row?.value??null,state};
}
export async function readRankExpPotion(env,userId,now=Date.now()){
 return {...rankPotionState((await record(env,userId)).state,now),userId:Number(userId),serverNow:new Date(now).toISOString()};
}
export async function rankPotionOptions(env,user){
 const [buff,items,pending]=await Promise.all([
  readRankExpPotion(env,user.id),
  env.DB.prepare('SELECT i.code,i.is_active,COALESCE(ui.quantity,0) AS quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.item_code=i.code AND ui.user_id=? WHERE i.code IN (?,?)').bind(user.id,...RANK_POTIONS.map(x=>x.code)).all(),
  env.DB.prepare("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1").bind(user.id,KIND).first()
 ]);
 return {buff,version:RANK_POTION_VERSION,items:RANK_POTIONS.map(item=>{const row=(items.results||[]).find(r=>r.code===item.code);return {...item,enabled:Number(row?.is_active)===1,quantity:Number(row?.quantity||0)};}),pendingRequestId:pending?.request_id||null};
}
export async function rankPotionReceipt(env,user,requestId){
 const row=await readJointOperation(env,user.id,requestId,KIND);
 if(row.status!=='COMPLETED')return {requestId,status:row.status,input:row.plan.input};
 return {ok:true,status:'COMPLETED',requestId,consumed:1,item:rankPotionItem(row.plan.input.itemCode),applied:row.plan.applied,buff:await readRankExpPotion(env,user.id)};
}
export async function useRankExpPotion(env,user,body){
 const item=rankPotionItem(body.itemCode);
 if(!item||body.version!==RANK_POTION_VERSION||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw fail('INPUT','물약 정보를 다시 확인해 주세요.',400);
 const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),input={itemCode:item.code,version:RANK_POTION_VERSION,expectedRevision:body.expectedRevision};
 const operation=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input,
  prepare:async()=>{
   const options=await rankPotionOptions(env,user),stock=options.items.find(x=>x.code===item.code),before=await record(env,user.id);
   if(options.pendingRequestId)throw fail('PENDING','이전 물약 사용 결과를 먼저 확인해 주세요.');
   if(!stock.enabled)throw fail('CLOSED','현재 이 물약은 사용할 수 없습니다.');
   if(!Number.isSafeInteger(stock.quantity)||stock.quantity<1)throw fail('BALANCE','보유한 물약이 없습니다.');
   if(rankPotionState(before.state).revision!==body.expectedRevision)throw fail('CHANGED','적용 중인 물약이 변경됐습니다. 다시 확인해 주세요.');
   return {input,beforeRaw:before.raw};
  },
  statements:async plan=>{
   const before=await record(env,user.id);
   if(before.raw!==plan.beforeRaw)throw Object.assign(fail('CHANGED','적용 중인 물약이 변경되어 요청을 취소했습니다. 다시 확인해 주세요.'),{terminal:true});
   // Failed attempts do not run down the timer. It starts when this write succeeds.
   const applied=nextRankPotion(before.state,item.multiplier,Date.now()),encoded=JSON.stringify(applied),token=crypto.randomUUID(),key=rankPotionKey(user.id);
   return [jointGuard(DB,token,before.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',before.raw===null?[key]:[key,before.raw]),
    ...jointInventoryChange(DB,user.id,item.code,-1,'계급 경험치 물약 사용',body.requestId),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',key,encoded),
    p("UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=? AND user_id=? AND status='PENDING'",JSON.stringify({...plan,applied}),body.requestId,user.id),
    p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) THEN 1 ELSE 0 END WHERE token=?',key,encoded,token),jointGuardEnd(DB,token)];
  }
 });
 return {...await rankPotionReceipt(env,user,body.requestId),replayed:operation.replayed===true};
}
export async function handleRankExpPotion({path,request,env,deps}){
 if(!['rank-exp-potion/status','rank-exp-potion/options','rank-exp-potion/use','rank-exp-potion/receipt'].includes(path))return null;
 const reply=(body,status=200)=>deps.json(body,status,{'cache-control':'private, no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
  if(path.endsWith('/use')){
   if(request.method!=='POST')throw fail('METHOD','POST 요청이 필요합니다.',405);
   const body=await readJointBody(request,{fields:['itemCode','requestId','version','expectedRevision']});
   return reply(await deps.withUserMutationLock(env,user.id,path,()=>useRankExpPotion(env,user,body)));
  }
  if(request.method!=='GET')throw fail('METHOD','GET 요청이 필요합니다.',405);
  if(path.endsWith('/status'))return reply({buff:await readRankExpPotion(env,user.id)});
  if(path.endsWith('/options'))return reply(await rankPotionOptions(env,user));
  return reply(await rankPotionReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
 }catch(error){if(String(error.code||'').startsWith('RANK_POTION_'))return reply({ok:false,code:error.code,error:error.message,retryable:error.code.endsWith('_PENDING')},error.status);return jointResponseError(error,reply);}
}
