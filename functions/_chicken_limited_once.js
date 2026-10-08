import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';

// Only an audited operator operation can arm this account entitlement.
// Public order fields never select a reward or change the common odds.
export const chickenLimitedOnceKey=userId=>`chicken_limited_once_v1:${userId}`;
const invalid=()=>{throw Object.assign(Error('1회 확정 사은품 설정을 확인하세요. 배민권은 소모되지 않았습니다.'),{code:'CHICKEN_ONCE_CONFIG',status:409,chicken:true});};
export function chickenLimitedOnceState({userId,actorId,operationId,mercenaryCode,reason,now=new Date().toISOString()}){
 const card=LIMITED_MERCENARIES.find(r=>r.code===mercenaryCode&&r.rank==='SSS');
 if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(actorId)||actorId<1||!card||
    typeof operationId!=='string'||!/^[A-Za-z0-9:_-]{16,120}$/.test(operationId)||
    typeof reason!=='string'||!reason.trim()||reason.length>1000||!Number.isFinite(Date.parse(now)))invalid();
 return {version:1,status:'ARMED',userId,actorId,operationId,mercenaryCode,rank:'SSS',quantity:1,reason,createdAt:now};
}
export async function prepareChickenLimitedOnce(q,userId){
 const key=chickenLimitedOnceKey(userId),[row]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key]);
 if(!row)return null;
 let state;try{state=JSON.parse(row.value);}catch{invalid();}
 if(state?.status==='CONSUMED')return null;
 const expected=chickenLimitedOnceState({...state,now:state?.createdAt});
 if(state.userId!==Number(userId)||Object.keys(state).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>state[k]!==v))invalid();
 return {key,before:row.value,state};
}
export async function consumeChickenLimitedOnce(q,plan,result){
 if(!plan)return;
 const {state}=plan;
 if(result.userId!==state.userId||result.reward.kind!=='LIMITED'||result.reward.code!==state.mercenaryCode||result.reward.rank!=='SSS'||result.ticketCost!==1||result.status!=='COMPLETED')invalid();
 const after=JSON.stringify({...state,status:'CONSUMED',consumedAt:result.completedAt,requestId:result.requestId,acquisitionId:'chicken:'+result.requestId,serial:result.reward.serial});
 const rows=await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[after,plan.key,plan.before]);
 if(rows.length!==1)invalid();
 await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CHICKEN_LIMITED_ONCE_CONSUMED','USER',$2,$3,$4)",[state.actorId,String(state.userId),plan.before,after]);
}
