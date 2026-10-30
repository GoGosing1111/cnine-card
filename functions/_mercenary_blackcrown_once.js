import {BLACKCROWN_PACK} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLACKCROWN_SSS_CARDS} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

export const blackcrownOnceKey=userId=>`mercenary_blackcrown_card_once_v1:${Number(userId)}`;
const fail=message=>Object.assign(jointError('MERCENARY_BLACKCROWN_ONCE',message,409),{terminal:true});
// Only an audited OWNER operation can arm an entitlement. Opening input has no override field.
export async function readBlackcrownOnce(DB,userId){
 const key=blackcrownOnceKey(userId),row=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();if(!row)return null;
 const value=JSON.parse(row.value),card=BLACKCROWN_SSS_CARDS.find(c=>c.code===value.mercenaryCode);
 if(value.version!==1||value.userId!==Number(userId)||value.packId!==BLACKCROWN_PACK.id||!card||!Number.isSafeInteger(value.actorId)||value.actorId<1||typeof value.operationId!=='string'||!value.operationId||!['ARMED','CONSUMED'].includes(value.status)||value.remaining!==(value.status==='ARMED'?1:0))throw fail('블랙크라운 개봉 설정을 확인하세요.');
 return {key,before:row.value,status:value.status,mercenaryCode:card.code,name:card.name};
}
export function blackcrownOnceCode(state){
 const once=state.oneTimeRewardState;if(once?.status!=='ARMED')return null;
 const stock=state.stock.find(s=>s.code===once.mercenaryCode);
 if(!(state.settings.cardRatesPpm[once.mercenaryCode]>0)||!stock?.prepared||stock.remaining<1)throw fail('카드 발행 수량을 확인 중입니다. 코인은 차감되지 않습니다.');
 return once.mercenaryCode;
}
export function blackcrownOnceStatements(DB,userId,requestId,plan){
 const key=blackcrownOnceKey(userId),before=plan.onceSnapshot??null,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
 const list=[jointGuard(DB,token,"COALESCE((SELECT value FROM app_meta WHERE key=?),'')=?",[key,before??''])];
 if(plan.once){
  const value=JSON.parse(before),draw=plan.draws.find(r=>(r.drawIndex??0)===0&&r.guaranteed===true);
  if(value.status!=='ARMED'||value.userId!==Number(userId)||draw?.mercenaryCode!==value.mercenaryCode||draw.rank!=='SSS'||draw.quantity!==1||draw.edition!=='SSS_LIMITED')throw fail('개봉 영수증을 확인하세요.');
  const after=JSON.stringify({...value,status:'CONSUMED',remaining:0,requestId,acquisitionId:requestId+':0',consumedAt:new Date().toISOString()});
  list.push(p('UPDATE app_meta SET value=? WHERE key=? AND value=?',after,key,before),jointGuard(DB,token+'done','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,after]),p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',value.actorId,'MERCENARY_BLACKCROWN_CARD_ONCE_CONSUMED','USER',String(userId),before,after),jointGuardEnd(DB,token+'done'));
 }
 list.push(jointGuardEnd(DB,token));return list;
}
