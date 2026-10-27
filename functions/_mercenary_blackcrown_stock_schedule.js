import {BLACKCROWN_LIMITED_CARDS as ALL_BLACKCROWN_STOCK} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLACKCROWN_MERCENARIES as BLACKCROWN_LIMITED_CARDS} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {BLACKCROWN_PACK_KEY,readBlackcrownPackSettings,validateBlackcrownPack} from '../shared/mercenary-blackcrown-pack-v1.mjs';
const STOCK_SCHEDULE_KEY='mercenary_blackcrown_stock_schedule_v1';
import {STOCK_SCHEDULE_MAX_LIMIT,STOCK_SCHEDULE_MAX_PENDING,stockScheduleInitial,stockScheduleNext,trimStockScheduleHistory} from '../shared/mercenary-stock-schedule-v1.mjs';
import {jointHash} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

const fail=(message,status=400)=>jointError('MERCENARY_STOCK_SCHEDULE',message,status);
const exact=(value,keys)=>value&&Object.keys(value).sort().join(',')===keys.sort().join(',');
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(value);
const receiptKey=id=>STOCK_SCHEDULE_KEY+':request:'+id;
export async function readMercenaryStockSchedules(env){
 const row=await env.DB.prepare('SELECT CURRENT_TIMESTAMP AS db_now,(SELECT value FROM app_meta WHERE key=?) AS value').bind(STOCK_SCHEDULE_KEY).first();
 const raw=row.value??null,document=raw?JSON.parse(raw):stockScheduleInitial();
 const serverNow=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(row.db_now))?row.db_now:String(row.db_now).replace(' ','T')+'Z').toISOString();
 return {raw,document,serverNow,nextAt:stockScheduleNext(document)[0]?.executeAt??null};
}
function validateRequest(actor,body){
 if(actor?.role!=='OWNER')throw fail('한정 수량 예약은 OWNER만 관리할 수 있습니다.',403);
 if(!body||!['SCHEDULE_STOCK','CANCEL_STOCK'].includes(body.action)||!validId(body.requestId)||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw fail('예약 종류·요청 번호·사유를 확인하세요.');
 if(body.action==='CANCEL_STOCK'){
  if(!exact(body,['action','requestId','scheduleId','reason'])||!validId(body.scheduleId))throw fail('취소할 예약을 확인하세요.');
  return structuredClone(body);
 }
 if(!exact(body,['action','requestId','executeAt','changes','reason'])||typeof body.executeAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(body.executeAt)||!Number.isFinite(Date.parse(body.executeAt))||new Date(body.executeAt).toISOString()!==body.executeAt)throw fail('예약 시각을 초 단위로 확인하세요.');
 if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>BLACKCROWN_LIMITED_CARDS.length||new Set(body.changes.map(c=>c?.code)).size!==body.changes.length||body.changes.some(c=>!exact(c,['code','quantity'])||!BLACKCROWN_LIMITED_CARDS.some(card=>card.code===c.code)||!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>10000))throw fail('한정 용병과 추가 수량(1~10,000장)을 확인하세요.');
 return {...body,changes:[...body.changes].sort((a,b)=>a.code.localeCompare(b.code))};
}
// A single statement sees matching policy/stock without a nested transaction
// or a shared lock on every shop read. This also works inside audited ops.
export async function readBlackcrownStockSnapshot(env){
 const DB=env.DB,codes=ALL_BLACKCROWN_STOCK.map(c=>c.code),rows='SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('+codes.map(()=>'?').join(',')+') ORDER BY code';
 const aggregate=DB.dialect==='postgres'?"COALESCE(json_agg(s),'[]'::json)::text":"COALESCE(json_group_array(json_object('code',code,'stock_limit',stock_limit,'issued',issued)),'[]')";
 const result=await DB.prepare('SELECT (SELECT value FROM app_meta WHERE key=?) AS value,(SELECT '+aggregate+' FROM ('+rows+') s) AS stock_json').bind(BLACKCROWN_PACK_KEY,...codes).first();
 return {row:result.value===null?null:{value:result.value},stock:JSON.parse(result.stock_json)};
}
export async function changeMercenaryStockSchedule(env,actor,input){
 const body=validateRequest(actor,input),hash=await jointHash({actor:Number(actor.id),...body}),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const replay=async()=>{const row=await p('SELECT value FROM app_meta WHERE key=?',receiptKey(body.requestId)).first();if(!row)return null;const receipt=JSON.parse(row.value);if(receipt.hash!==hash)throw fail('같은 요청 번호에 다른 예약 내용이 있습니다.',409);return {...receipt,replayed:true};};
 const prior=await replay();if(prior)return prior;
 for(let attempt=0;attempt<4;attempt++){
  const before=await readMercenaryStockSchedules(env),now=Date.parse(before.serverNow),next=structuredClone(before.document);let schedule;
  if(body.action==='SCHEDULE_STOCK'){
   if(Date.parse(body.executeAt)<now+60000||Date.parse(body.executeAt)>now+366*86400000)throw fail('예약은 서버 현재 시각에서 1분 이후, 1년 이내로 등록하세요.');
   if(stockScheduleNext(next).length>=STOCK_SCHEDULE_MAX_PENDING)throw fail('대기 예약은 최대 32개입니다.');
   const snapshot=await readBlackcrownStockSnapshot(env);if(!snapshot.row)throw fail('블랙크라운팩 운영 설정이 필요합니다.',409);
   const settings=readBlackcrownPackSettings(JSON.parse(snapshot.row.value).settings);
   for(const change of body.changes){
    const row=snapshot.stock.find(r=>r.code===change.code),reserved=stockScheduleNext(next).flatMap(s=>s.changes).filter(c=>c.code===change.code).reduce((n,c)=>n+c.quantity,0);
    if(!row||Number(row.stock_limit)!==settings.stockLimits[change.code]||Number(row.issued)>Number(row.stock_limit)||Number(row.stock_limit)+reserved+change.quantity>STOCK_SCHEDULE_MAX_LIMIT)throw fail('현재 발행 한도와 예약 증가분을 확인하세요.',409);
   }
   schedule={id:body.requestId,status:'SCHEDULED',executeAt:body.executeAt,changes:body.changes,reason:body.reason.trim(),createdAt:before.serverNow,createdBy:Number(actor.id)};
   next.schedules.push(schedule);
  }else{
   schedule=next.schedules.find(s=>s.id===body.scheduleId);
   if(!schedule||schedule.status!=='SCHEDULED'||Date.parse(schedule.executeAt)<=now)throw fail('이미 실행 시각이 되었거나 취소·완료된 예약입니다.',409);
   Object.assign(schedule,{status:'CANCELLED',completedAt:before.serverNow,cancelledBy:Number(actor.id),cancelReason:body.reason.trim()});
  }
  next.revision++;next.schedules=trimStockScheduleHistory(next.schedules);
  const after=JSON.stringify(next),token=crypto.randomUUID(),receipt={hash,action:body.action,schedule,revision:next.revision};
  try{
   await DB.batch([
    p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',STOCK_SCHEDULE_KEY,JSON.stringify(stockScheduleInitial())),
    p('UPDATE app_meta SET value=? WHERE key=? AND value=?',after,STOCK_SCHEDULE_KEY,before.raw??JSON.stringify(stockScheduleInitial())),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[STOCK_SCHEDULE_KEY,after]),
    p('INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey(body.requestId),JSON.stringify(receipt)),
    p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'MERCENARY_STOCK_'+body.action,'SETTING',STOCK_SCHEDULE_KEY,before.raw,JSON.stringify(receipt)),jointGuardEnd(DB,token)
   ]);return {...receipt,replayed:false};
  }catch(error){const committed=await replay();if(committed)return committed;const current=await readMercenaryStockSchedules(env);if(current.raw===before.raw||attempt===3)throw error;}
 }
}
export async function processMercenaryStockSchedules(env,{clock}={}){
 const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);let applied=0,conflicts=0;
 for(let i=0;i<STOCK_SCHEDULE_MAX_PENDING+4;i++){
  const before=await readMercenaryStockSchedules(env),now=clock?clock():Date.parse(before.serverNow),due=stockScheduleNext(before.document).find(s=>Date.parse(s.executeAt)<=now);
  if(!due)return {...before,applied};
  const snapshot=await readBlackcrownStockSnapshot(env);if(!snapshot.row)throw fail('예약 실행에 필요한 팩 설정이 없습니다.',503);
  const pack=JSON.parse(snapshot.row.value),settings=readBlackcrownPackSettings(pack.settings),limits=[];
  for(const change of due.changes){
   const row=snapshot.stock.find(s=>s.code===change.code),limit=Number(row?.stock_limit),issued=Number(row?.issued);
   if(!row||limit!==settings.stockLimits[change.code]||!Number.isSafeInteger(issued)||issued<0||issued>limit||limit+change.quantity>STOCK_SCHEDULE_MAX_LIMIT)throw fail('예약 대상의 발행 수량을 확인해야 합니다.',503);
   limits.push({code:change.code,before:limit,after:limit+change.quantity,quantity:change.quantity});settings.stockLimits[change.code]=limit+change.quantity;
  }
  validateBlackcrownPack(settings,{allowLegacyStock:true});
  const completedAt=new Date(now).toISOString(),receipt={...due,status:'APPLIED',completedAt,limits},next=structuredClone(before.document);
  next.revision++;next.schedules=trimStockScheduleHistory(next.schedules.map(s=>s.id===due.id?receipt:s));
  const after=JSON.stringify(next),nextPack=JSON.stringify({...pack,revision:pack.revision+1,settings,updatedAt:completedAt,updatedBy:due.createdBy,lastStockScheduleId:due.id}),token=crypto.randomUUID();
  const statements=[p('UPDATE app_meta SET value=? WHERE key=? AND value=?',after,STOCK_SCHEDULE_KEY,before.raw),jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[STOCK_SCHEDULE_KEY,after]),
   p('UPDATE app_meta SET value=? WHERE key=? AND value=?',nextPack,BLACKCROWN_PACK_KEY,snapshot.row.value),jointGuard(DB,token+'p','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[BLACKCROWN_PACK_KEY,nextPack])];
  for(const limit of limits){const guard=token+limit.code;statements.push(p('UPDATE mercenary_limited_stock_v1 SET stock_limit=?,revision=revision+1,last_token=? WHERE code=? AND stock_limit=? AND issued<=stock_limit',limit.after,guard,limit.code,limit.before),jointGuard(DB,guard,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND stock_limit=? AND last_token=?)',[limit.code,limit.after,guard]),jointGuardEnd(DB,guard));}
  statements.push(p('INSERT INTO app_meta(key,value) VALUES(?,?)',STOCK_SCHEDULE_KEY+':applied:'+due.id,JSON.stringify(receipt)),p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',due.createdBy,'MERCENARY_STOCK_SCHEDULE_APPLY','SETTING',due.id,JSON.stringify(limits.map(r=>({code:r.code,limit:r.before}))),JSON.stringify(receipt)),jointGuardEnd(DB,token+'p'),jointGuardEnd(DB,token));
  try{await DB.batch(statements);applied++;conflicts=0;}catch(error){const current=await readMercenaryStockSchedules(env);if(current.document.schedules.some(s=>s.id===due.id&&s.status!=='SCHEDULED'))continue;if(++conflicts>3||current.raw===before.raw&&(await readBlackcrownStockSnapshot(env)).row?.value===snapshot.row.value)throw error;}
 }
 throw fail('예약 처리 중입니다. 잠시 후 다시 확인하세요.',503);
}
