import {LIMITED_SHARD_CRAFTS,LIMITED_CRAFT_STOCK_MAX,LIMITED_CRAFT_STOCK_STEP} from '../shared/mercenary-limited-shard-craft-v1.mjs';
import {mercenaryCraftReady,validateMercenaryCraft} from '../shared/mercenary-craft-v1.mjs';
import {STOCK_SCHEDULE_MAX_PENDING,stockScheduleInitial,stockScheduleNext} from '../shared/mercenary-stock-schedule-v1.mjs';
import {jointHash} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const CRAFT_STOCK_SCHEDULE_KEY='mercenary_limited_shard_stock_schedule_v1';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const definition=code=>LIMITED_SHARD_CRAFTS.find(d=>d.code===code);
const requestKey=id=>CRAFT_STOCK_SCHEDULE_KEY+':request:'+id;
export async function readLimitedCraftStockSchedules(env){
 const row=await env.DB.prepare('SELECT CURRENT_TIMESTAMP AS db_now,(SELECT value FROM app_meta WHERE key=?) AS value').bind(CRAFT_STOCK_SCHEDULE_KEY).first();
 const raw=row.value??null,document=raw?JSON.parse(raw):stockScheduleInitial();
 const serverNow=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(row.db_now))?row.db_now:String(row.db_now).replace(' ','T')+'Z').toISOString();
 return {raw,document,serverNow,nextAt:stockScheduleNext(document)[0]?.executeAt??null};
}
function validate(input){
 if(!input||Object.keys(input).sort().join(',')!=='changes,executeAt,reason,requestId'||typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(input.requestId)||typeof input.reason!=='string'||input.reason.trim().length<4||input.reason.length>500||/[\u0000-\u001f]/.test(input.reason))throw fail('제작 수량 예약의 요청 번호와 사유를 확인하세요.');
 if(typeof input.executeAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(input.executeAt)||!Number.isFinite(Date.parse(input.executeAt))||new Date(input.executeAt).toISOString()!==input.executeAt)throw fail('제작 수량 예약 시각을 확인하세요.');
 const changes=input.changes;
 if(!Array.isArray(changes)||!changes.length||changes.length>LIMITED_SHARD_CRAFTS.length||new Set(changes.map(c=>c?.code)).size!==changes.length)throw fail('서로 다른 SSS 리미티드 조각 제작 대상을 선택하세요.');
 for(const change of changes){
  if(!change||!definition(change.code))throw fail('등록된 SSS 리미티드 조각 제작 대상을 선택하세요.');
  const fields=Object.keys(change).sort().join(',');
  if(fields==='code,open'&&change.open===true)continue;
  if(fields!=='code,quantity'||!Number.isSafeInteger(change.quantity)||change.quantity<LIMITED_CRAFT_STOCK_STEP||change.quantity>10000||change.quantity%LIMITED_CRAFT_STOCK_STEP)throw fail('공개 예약 또는 5장 단위 추가 수량을 확인하세요.');
 }
 return {...input,changes:[...changes].sort((a,b)=>a.code.localeCompare(b.code))};
}
async function policies(env,changes){
 const keys=changes.map(c=>definition(c.code).key),rows=(await env.DB.prepare('SELECT key,value FROM app_meta WHERE key IN ('+keys.map(()=>'?').join(',')+') ORDER BY key').bind(...keys).all()).results;
 return changes.map(change=>{
  const d=definition(change.code),row=rows.find(r=>r.key===d.key);
  if(!row)throw fail('예약 대상 제작 설정이 없습니다.',409);
  const rawPolicy=JSON.parse(row.value),policy=validateMercenaryCraft(rawPolicy,d);
  if(!Number.isSafeInteger(policy.revision)||policy.revision>=2147483646)throw fail('제작 설정 버전을 확인하세요.',409);
  if(change.open&&!mercenaryCraftReady(policy))throw fail('공개할 제작식의 재료·비용·확률을 먼저 저장하세요.',409);
  return {change,definition:d,row,rawPolicy,policy};
 });
}
export async function scheduleLimitedCraftStock(env,actor,input){
 if(actor?.role!=='OWNER')throw fail('OWNER만 제작 수량을 예약할 수 있습니다.',403);
 const body=validate(input),hash=await jointHash({actor:Number(actor.id),...body}),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const replay=async()=>{const row=await p('SELECT value FROM app_meta WHERE key=?',requestKey(body.requestId)).first();if(!row)return null;const r=JSON.parse(row.value);if(r.hash!==hash)throw fail('같은 요청 번호에 다른 제작 예약 내용이 있습니다.',409);return {...r,replayed:true};};
 const prior=await replay();if(prior)return prior;
 for(let attempt=0;attempt<4;attempt++){
  const before=await readLimitedCraftStockSchedules(env),now=Date.parse(before.serverNow),next=structuredClone(before.document);
  if(Date.parse(body.executeAt)<now+60000||Date.parse(body.executeAt)>now+366*86400000)throw fail('예약은 서버 현재 시각에서 1분 이후, 1년 이내로 등록하세요.');
  if(stockScheduleNext(next).length>=STOCK_SCHEDULE_MAX_PENDING)throw fail('대기 제작 예약은 최대 32개입니다.');
  for(const {change,policy}of await policies(env,body.changes)){
   const pending=stockScheduleNext(next).flatMap(s=>s.changes).filter(c=>c.code===change.code);
   if(change.open){
    if(policy.isActive||policy.isPublic||pending.some(c=>c.open))throw fail('공개 예약은 아직 열리지 않은 비공개 제작식에 한 번만 등록할 수 있습니다.',409);
    continue;
   }
   const reserved=pending.reduce((n,c)=>n+(c.quantity??0),0);
   if(!policy.isPublic||!policy.isActive||policy.stockLimit+reserved+change.quantity>LIMITED_CRAFT_STOCK_MAX)throw fail('공개된 제작 대상과 현재 발행 한도를 확인하세요.',409);
  }
  const openings=body.changes.filter(c=>c.open);
  if(openings.length){
   const recipeCodes=openings.map(c=>definition(c.code).recipeCode);
   const drafts=await p("SELECT code,output_ref FROM workshop_recipes_v1668 WHERE category='MERCENARY_CRAFT' AND output_type='MERCENARY' AND output_quantity=1 AND is_active=0 AND is_public=0 AND code IN ("+recipeCodes.map(()=>'?').join(',')+')',...recipeCodes).all();
   if(!openings.every(c=>drafts.results.some(r=>r.code===definition(c.code).recipeCode&&r.output_ref===c.code)))throw fail('공개 예약할 비공개 제작식을 제작소에 먼저 저장하세요.',409);
  }
  const schedule={id:body.requestId,status:'SCHEDULED',executeAt:body.executeAt,changes:body.changes,reason:body.reason.trim(),createdAt:before.serverNow,createdBy:Number(actor.id)};
  next.revision++;next.schedules.push(schedule);
  const receipt={hash,schedule},after=JSON.stringify(next),token=crypto.randomUUID();
  try{
   await DB.batch([
    p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',CRAFT_STOCK_SCHEDULE_KEY,before.raw??JSON.stringify(stockScheduleInitial())),
    p('UPDATE app_meta SET value=? WHERE key=? AND value=?',after,CRAFT_STOCK_SCHEDULE_KEY,before.raw??JSON.stringify(stockScheduleInitial())),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[CRAFT_STOCK_SCHEDULE_KEY,after]),
    p('INSERT INTO app_meta(key,value) VALUES(?,?)',requestKey(body.requestId),JSON.stringify(receipt)),
    p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'MERCENARY_CRAFT_STOCK_SCHEDULE','SETTING',CRAFT_STOCK_SCHEDULE_KEY,before.raw,JSON.stringify(receipt)),jointGuardEnd(DB,token)
   ]);return {...receipt,replayed:false};
  }catch(error){const saved=await replay();if(saved)return saved;const current=await readLimitedCraftStockSchedules(env);if(current.raw===before.raw||attempt===3)throw error;}
 }
}
export async function processLimitedCraftStockSchedules(env,{clock}={}){
 const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);let applied=0,conflicts=0;
 for(let i=0;i<STOCK_SCHEDULE_MAX_PENDING+4;i++){
  const before=await readLimitedCraftStockSchedules(env),now=clock?clock():Date.parse(before.serverNow),due=stockScheduleNext(before.document).find(s=>Date.parse(s.executeAt)<=now);
  if(!due)return {...before,applied};
  // Revalidate persisted input before it can affect a policy.
  validate({requestId:due.id,executeAt:due.executeAt,changes:due.changes,reason:due.reason});
  const rows=await policies(env,due.changes),limits=rows.map(({change,policy})=>{
   if(change.open)return {code:change.code,before:policy.stockLimit,after:policy.stockLimit,opened:true};
   if(policy.stockLimit+change.quantity>LIMITED_CRAFT_STOCK_MAX)throw fail('제작 예약 증가분이 한도 상한을 초과합니다.',409);
   return {code:change.code,before:policy.stockLimit,after:policy.stockLimit+change.quantity,quantity:change.quantity};
  });
  const completedAt=new Date(now).toISOString(),receipt={...due,status:'APPLIED',completedAt,limits},next=structuredClone(before.document);
  next.revision++;next.schedules=next.schedules.map(s=>s.id===due.id?receipt:s);
  const token=crypto.randomUUID(),after=JSON.stringify(next),statements=[];
  // CMS and crafting lock policy first; use the same order and compare the full value.
  if(DB.dialect==='postgres')statements.push(p('SELECT key FROM app_meta WHERE key IN ('+rows.map(()=>'?').join(',')+') ORDER BY key FOR UPDATE',...rows.map(r=>r.definition.key)));
  statements.push(p('UPDATE app_meta SET value=? WHERE key=? AND value=?',after,CRAFT_STOCK_SCHEDULE_KEY,before.raw),jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[CRAFT_STOCK_SCHEDULE_KEY,after]));
  for(const {change,definition:d,row,rawPolicy,policy}of rows){
   const update=change.open?{isActive:true,isPublic:true}:{stockLimit:policy.stockLimit+change.quantity};
   const value=JSON.stringify({...rawPolicy,...update,revision:policy.revision+1}),guard=token+change.code;
   statements.push(p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',value,d.key,row.value),jointGuard(DB,guard,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[d.key,value]),jointGuardEnd(DB,guard));
   if(change.open){
    const recipeGuard=guard+'-recipe';
    const recipeWhere="code=? AND category='MERCENARY_CRAFT' AND output_type='MERCENARY' AND output_ref=? AND output_quantity=1";
    statements.push(p('UPDATE workshop_recipes_v1668 SET is_active=1,is_public=1,updated_at=CURRENT_TIMESTAMP WHERE '+recipeWhere,d.recipeCode,d.code),
     jointGuard(DB,recipeGuard,'EXISTS(SELECT 1 FROM workshop_recipes_v1668 WHERE '+recipeWhere+' AND is_active=1 AND is_public=1)',[d.recipeCode,d.code]),jointGuardEnd(DB,recipeGuard));
   }
  }
  statements.push(p('INSERT INTO app_meta(key,value) VALUES(?,?)',CRAFT_STOCK_SCHEDULE_KEY+':applied:'+due.id,JSON.stringify(receipt)),p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',due.createdBy,'MERCENARY_CRAFT_STOCK_SCHEDULE_APPLY','SETTING',due.id,JSON.stringify(rows.map(r=>r.row)),JSON.stringify(receipt)),jointGuardEnd(DB,token));
  try{await DB.batch(statements);applied++;conflicts=0;}catch(error){
   const current=await readLimitedCraftStockSchedules(env);if(current.document.schedules.some(s=>s.id===due.id&&s.status!=='SCHEDULED'))continue;
   const latest=await policies(env,due.changes),changed=latest.some((r,i)=>r.row.value!==rows[i].row.value);
   if(++conflicts>3||current.raw===before.raw&&!changed)throw error;
  }
 }
 throw fail('제작 수량 예약 처리 중입니다. 잠시 후 다시 시도하세요.',503);
}
