import {HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

// Armed only by an explicitly authorized operations transaction. Public opening
// requests cannot choose, create or replenish an account's one-time award.
export const halloweenSsOnceKey=userId=>`mercenary_halloween_ss_once_v1:${Number(userId)}`;
const invalid=()=>jointError('MERCENARY_HALLOWEEN_ONCE_CONFIG','할로윈 1회 확정 설정을 확인해 주세요.',409);
export async function readHalloweenSsOnce(DB,userId){
 const key=halloweenSsOnceKey(userId),row=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
 if(!row)return null;
 const value=JSON.parse(row.value);
 if(value.status==='CONSUMED')return null;
 const specific=value.version===2&&value.rank==='SSS'&&value.edition==='SSS_LIMITED'&&HALLOWEEN_PACK_CARDS.some(c=>c.code===value.mercenaryCode&&c.rank==='SSS');
 const legacy=value.version===1&&value.rank==='SS'&&value.edition==='HALLOWEEN_LIMITED';
 if((!legacy&&!specific)||value.status!=='ARMED'||value.remaining!==1||value.userId!==Number(userId)||value.packId!==HALLOWEEN_PACK.id||typeof value.operationId!=='string'||!value.operationId||!Number.isSafeInteger(value.actorId)||value.actorId<1)throw invalid();
 return {key,before:row.value,operationId:value.operationId,...(specific?{mercenaryCode:value.mercenaryCode}:{})};
}
export function pickHalloweenSsOnceCode(state,randomInt,once=null){
 const eligible=HALLOWEEN_PACK_CARDS.filter(c=>once?.mercenaryCode?c.rank==='SSS'&&c.code===once.mercenaryCode:c.rank==='SS').map(c=>({code:c.code,weight:limitedRateUnits(state.settings.cardRatesPpm[c.code]),stock:state.stock.find(s=>s.code===c.code)})).filter(c=>c.weight>0&&c.stock?.prepared&&c.stock.remaining>0);
 const total=eligible.reduce((sum,c)=>sum+c.weight,0);
 // With no available guarantee target, use ordinary pack odds and leave the
 // entitlement armed. Exhaustion must not prevent the pack from opening.
 if(total===0)return null;
 if(!Number.isSafeInteger(total)||total<0)throw invalid();
 let ticket=randomInt(total);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=total)throw Error('Invalid random sample');
 return eligible.find(c=>{ticket-=c.weight;return ticket<0;}).code;
}
export async function consumeHalloweenSsOnce(DB,userId,requestId,once,draw){
 if(!once)return [];
 const current=await readHalloweenSsOnce(DB,userId);
 if(current?.key!==once.key||current?.before!==once.before||current?.operationId!==once.operationId)throw Object.assign(jointError('MERCENARY_HALLOWEEN_ONCE_CHANGED','1회 확정 상태가 변경됐습니다. 새 개봉으로 다시 시도하세요.',409),{terminal:true});
 const before=JSON.parse(once.before),specific=before.version===2;
 if(draw?.rank!==before.rank||draw.edition!==before.edition||draw.quantity!==1||!HALLOWEEN_PACK_CARDS.some(c=>c.code===draw.mercenaryCode&&c.rank===before.rank)||specific&&draw.mercenaryCode!==before.mercenaryCode)throw invalid();
 const after=JSON.stringify({...before,status:'CONSUMED',remaining:0,consumedAt:new Date().toISOString(),requestId,acquisitionId:requestId+':0',mercenaryCode:draw.mercenaryCode});
 const p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
 return [
  ...(DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',once.key)]:[]),
  jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[once.key,once.before]),
  p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',after,once.key,once.before),
  jointGuard(DB,token+'-consumed','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[once.key,after]),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',before.actorId,specific?'MERCENARY_HALLOWEEN_CARD_ONCE_CONSUMED':'MERCENARY_HALLOWEEN_SS_ONCE_CONSUMED','USER',String(userId),once.before,after),
  jointGuardEnd(DB,token+'-consumed'),jointGuardEnd(DB,token)
 ];
}
