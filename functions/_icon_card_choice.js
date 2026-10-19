import {ICON_CHOICE_ITEM as ITEM,ICON_CHOICE_CARDS as CARDS,ICON_CHOICE_VERSION} from '../shared/icon-card-choice-v1.mjs';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';

const KIND='ICON_CARD_CHOICE';
const fail=(code,message,status=409)=>jointError('ICON_CHOICE_'+code,message,status);
const availableCard="EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.rarity='ICON' AND c.is_active=1 AND m.is_active=1 AND c.card_status='PUBLIC')";
async function choices(DB,userId){
 const rows=(await DB.prepare(`SELECT c.id,COALESCE(uc.quantity,0) AS quantity FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN user_cards uc ON uc.card_id=c.id AND uc.user_id=? WHERE c.id IN (${CARDS.map(()=>'?').join(',')}) AND c.rarity='ICON' AND c.is_active=1 AND m.is_active=1 AND c.card_status='PUBLIC'`).bind(userId,...CARDS.map(c=>c.cardId)).all()).results||[];
 const counts=new Map(rows.map(row=>[String(row.id),Number(row.quantity)]));
 return CARDS.filter(card=>counts.has(card.cardId)).map(card=>({...card,quantity:counts.get(card.cardId)}));
}
export async function iconChoiceOptions(env,user){
 const DB=env.DB;
 const [catalog,item,pending]=await Promise.all([choices(DB,user.id),DB.prepare('SELECT i.is_active,COALESCE(ui.quantity,0) AS quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.item_code=i.code AND ui.user_id=? WHERE i.code=?').bind(user.id,ITEM.code).first(),DB.prepare("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1").bind(user.id,KIND).first()]);
 return {item:ITEM,version:ICON_CHOICE_VERSION,quantity:Number(item?.quantity||0),enabled:Number(item?.is_active)===1,choices:catalog,pendingRequestId:pending?.request_id||null};
}
function completed(operation){
 const p=operation.plan;
 return {ok:true,status:'COMPLETED',requestId:operation.requestId||operation.request_id,replayed:operation.replayed===true,itemCode:ITEM.code,consumed:1,reward:{...p.target,quantity:1,ownedAfter:p.ownedBefore+1},refreshAccount:true};
}
export async function iconChoiceReceipt(env,user,requestId){
 const row=await readJointOperation(env,user.id,requestId,KIND);
 return row.status==='COMPLETED'?completed({...row,replayed:true}):{requestId,status:row.status,input:row.plan.input};
}
export async function useIconChoice(env,user,body){
 const target=CARDS.find(card=>card.code===body.targetCode);
 if(!target)throw fail('TARGET','현재 선택 가능한 일반 아이콘을 골라 주세요.',400);
 if(body.version!==ICON_CHOICE_VERSION)throw fail('VERSION','선택권 화면을 다시 열어 주세요.');
 const input={targetCode:target.code,version:ICON_CHOICE_VERSION},DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values);
 const operation=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input,
  prepare:async()=>{
   const state=await iconChoiceOptions(env,user);
   if(state.pendingRequestId)throw fail('PENDING','이전에 사용한 선택권 결과를 먼저 확인해 주세요.');
   if(!state.enabled)throw fail('CLOSED','현재 선택권 사용이 중지되어 있습니다.');
   if(!Number.isSafeInteger(state.quantity)||state.quantity<1)throw fail('BALANCE','아이콘 카드 선택권이 없습니다.');
   const card=state.choices.find(c=>c.code===target.code);
   if(!card)throw fail('UNAVAILABLE','선택한 아이콘은 현재 획득할 수 없습니다.');
   if(!Number.isSafeInteger(card.quantity)||card.quantity<0||card.quantity>=2147483647)throw fail('LIMIT','카드 보유 한도를 확인해 주세요.');
   return {input,target,ownedBefore:card.quantity};
  },
  statements:async plan=>{
   if(plan.target?.cardId!==target.cardId)throw fail('TARGET','선택한 카드 정보를 확인하세요.',400);
   const current=await p('SELECT COALESCE((SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?),0) AS quantity',user.id,target.cardId).first();
   if(Number(current.quantity)!==plan.ownedBefore)throw Object.assign(fail('CHANGED','카드 보유 수량이 바뀌어 사용을 취소했습니다. 다시 선택해 주세요.'),{terminal:true});
   const token=crypto.randomUUID();
   return [jointGuard(DB,token,availableCard+' AND COALESCE((SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?),0)=?',[target.cardId,user.id,target.cardId,plan.ownedBefore]),
    ...jointInventoryChange(DB,user.id,ITEM.code,-1,'아이콘 카드 선택권 사용',body.requestId),
    p("INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,first_obtained_at,last_obtained_at) VALUES(?,?,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP",user.id,target.cardId),
    p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=?) THEN 1 ELSE 0 END WHERE token=?',user.id,target.cardId,plan.ownedBefore+1,token),jointGuardEnd(DB,token)];
  }
 });
 return completed(operation);
}
export async function handleIconCardChoice({path,request,env,deps}){
 if(!['icons/choice/options','icons/choice/use','icons/choice/receipt'].includes(path))return null;
 const reply=(body,status=200)=>deps.json(body,status,{'cache-control':'private, no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
  if(path.endsWith('/use')){
   if(request.method!=='POST')throw fail('METHOD','POST 요청이 필요합니다.',405);
   const body=await readJointBody(request,{fields:['requestId','targetCode','version']});
   return reply(await deps.withUserMutationLock(env,user.id,path,()=>useIconChoice(env,user,body)));
  }
  if(request.method!=='GET')throw fail('METHOD','GET 요청이 필요합니다.',405);
  return reply(path.endsWith('/options')?await iconChoiceOptions(env,user):await iconChoiceReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
 }catch(error){if(String(error.code||'').startsWith('ICON_CHOICE_'))return reply({ok:false,code:error.code,error:error.message,retryable:error.code.endsWith('_PENDING')},error.status);return jointResponseError(error,reply);}
}
