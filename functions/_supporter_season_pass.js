import {PASS_KEY,PASS_DAYS,DAY_MS,kstDay,dayDate,claimKey,dailyKey,emptyPass,passCycle,passWindow,passEntitlement} from '../shared/supporter-season-pass-v1.mjs';
import {canManageSupport,supportBenefits} from '../shared/server-support-v1.mjs';
import {readSupportRecord} from './_supporter_benefits.js';
import {legionHuntCatalog} from './_legion_hunt_settings.js';
import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {jointError,readJointBody} from './_joint_request.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

const fail=(code,message,status=400)=>{throw jointError('SUPPORT_PASS_'+code,message,status);};
const safe=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const fields=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k));
const restricted=new Set(['PREMIUM_CUBE','EQUIPMENT_PROTECTION_TICKET']);
export async function readPassConfig(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PASS_KEY).first();
  const state=row?JSON.parse(row.value):emptyPass();
  if(state.version!==1||!safe(state.revision)||!Array.isArray(state.days)||state.days.length!==30)throw Error('Invalid season pass configuration');
  return {raw:row?.value??null,state};
}
export async function passCatalog(env){
  const items=(await legionHuntCatalog(env)).map(x=>({...x,maxQuantity:x.type==='VEHICLE'?1:x.type==='EQUIPMENT'?50:1000000,
    available:!restricted.has(x.ref),unavailableReason:restricted.has(x.ref)?x.ref==='PREMIUM_CUBE'?'종료된 아이템':'승인된 게임 드롭 전용':''}));
  return [
    {code:'COIN:',type:'COIN',ref:'',name:'코인',image:'assets/ui/icon-fusion-20261004/coin.webp',rarity:'SPECIAL',maxQuantity:1000000000000,available:true},
    {code:'CARD_SHARDS:',type:'CARD_SHARDS',ref:'',name:'카드 조각',image:'',rarity:'SPECIAL',maxQuantity:1000000,available:true},
    {code:'MAGIC_CRYSTAL:',type:'MAGIC_CRYSTAL',ref:'',name:'마법 결정',image:'',rarity:'EPIC',maxQuantity:1000000,available:true},...items];
}
export function normalizePass(document,catalog){
  if(!fields(document,['title','enabled','days'])||typeof document.title!=='string'||!document.title.trim()||document.title.trim().length>40||typeof document.enabled!=='boolean'||!Array.isArray(document.days)||document.days.length!==30)fail('CONFIG','제목과 30일 보상표를 확인하세요.');
  const byCode=new Map(catalog.map(x=>[x.code,x]));
  const days=document.days.map((row,index)=>{
    if(!fields(row,['day','rewards'])||row.day!==index+1||!Array.isArray(row.rewards)||row.rewards.length>12)fail('CONFIG','날짜별 보상은 1~30일 순서, 하루 최대 12종입니다.');
    const seen=new Set();let equipmentCount=0;
    const rewards=row.rewards.map(r=>{
      if(!fields(r,['code','quantity'])||typeof r.code!=='string'||seen.has(r.code))fail('CONFIG',`${row.day}일차 보상 종류가 중복되거나 올바르지 않습니다.`);
      const item=byCode.get(r.code);if(!item?.available)fail('ITEM',`${row.day}일차에 지급할 수 없는 아이템이 있습니다.`);
      if(!safe(r.quantity,1,item.maxQuantity))fail('QUANTITY',`${item.name} 수량은 1~${item.maxQuantity.toLocaleString('ko-KR')} 정수로 입력하세요.`);
      seen.add(r.code);if(item.type==='EQUIPMENT')equipmentCount+=r.quantity;
      return {code:item.code,type:item.type,ref:item.ref,name:item.name,image:item.image,rarity:item.rarity,quantity:r.quantity};
    });
    if(equipmentCount>50)fail('QUANTITY','하루 장비 지급은 합계 50개까지입니다.');
    if(document.enabled&&!rewards.length)fail('EMPTY',`${row.day}일차 보상을 등록해야 시즌패스를 열 수 있습니다.`);
    return {day:row.day,rewards};
  });
  return {title:document.title.trim(),enabled:document.enabled,days};
}
export async function savePassConfig(env,admin,body,now=Date.now()){
  if(!canManageSupport(admin))fail('ADMIN','후원 관리는 핑크빛유두 전용입니다.',403);
  if(!safe(body.expectedRevision)||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))fail('INPUT','저장 요청 정보를 확인하세요.');
  const receiptKey='supporter_pass_config_receipt_v1:'+body.requestId,payload=JSON.stringify([admin.id,body.expectedRevision,body.document]);
  const prior=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
  if(prior){const saved=JSON.parse(prior.value);if(saved.payload!==payload)fail('REQUEST','같은 요청 번호의 내용이 다릅니다.',409);return {...saved.result,replayed:true};}
  const [record,catalog]=await Promise.all([readPassConfig(env),passCatalog(env)]);
  if(record.state.revision!==body.expectedRevision)fail('REVISION','다른 창에서 보상을 변경했습니다. 새로 불러와 주세요.',409);
  const state={version:1,revision:record.state.revision+1,writeToken:body.requestId,...normalizePass(body.document,catalog)},raw=JSON.stringify(state);
  if(!safe(state.revision))fail('LIMIT','설정 변경 한도를 초과했습니다.',409);
  const token=crypto.randomUUID(),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),result={ok:true,config:state,serverNow:now,replayed:false};
  await ensureJointAtomicSchema(env);
  try{await DB.batch([
    jointGuard(DB,token,record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',record.raw===null?[PASS_KEY]:[PASS_KEY,record.raw]),
    record.raw===null?p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',PASS_KEY,raw):p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,PASS_KEY,record.raw),
    jointGuard(DB,token+'w','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PASS_KEY,raw]),
    p("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'SUPPORTER_PASS_CONFIG','SETTINGS',?,?,?)",admin.id,PASS_KEY,record.raw,raw),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',receiptKey,JSON.stringify({payload,result})),jointGuardEnd(DB,token),jointGuardEnd(DB,token+'w')
  ]);}catch(error){
    const saved=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
    if(saved&&JSON.parse(saved.value).payload===payload)return {...JSON.parse(saved.value).result,replayed:true};
    if((await readPassConfig(env)).raw!==record.raw)fail('REVISION','다른 창에서 보상을 변경했습니다. 새로 불러와 주세요.',409);throw error;
  }
  return result;
}
async function passLedger(env,userId,subscription,now){
  const window=passWindow(subscription,now);
  if(!window||window.endDay<window.startDay)return {window,saved:new Map(),due:[]};
  const rows=(await env.DB.prepare('SELECT key,value FROM app_meta WHERE key LIKE ? OR (key>=? AND key<=?)')
    .bind('supporter_pass_claim_v1:'+Number(userId)+':'+subscription.startsAt+'-%',dailyKey(userId,dayDate(window.startDay)),dailyKey(userId,dayDate(window.endDay))).all()).results;
  const saved=new Map(rows.map(r=>[r.key,JSON.parse(r.value)])),due=[];
  for(let calendarDay=window.startDay;calendarDay<=window.endDay;calendarDay++){
    const day=passEntitlement(window,calendarDay);
    if(!saved.has(claimKey(userId,day.cycle,day.day))&&!saved.has(dailyKey(userId,day.date)))due.push(day);
  }
  return {window,saved,due};
}
export async function readSeasonPass(env,userId,subscription,now){
  const {state:config}=await readPassConfig(env),cycle=passCycle(subscription,now),today=dayDate(kstDay(now));
  const {window,saved,due}=await passLedger(env,userId,subscription,now);
  const days=config.days.map(d=>{
    const receipt=saved.get(claimKey(userId,cycle.cycle,d.day)),calendarDay=cycle.startDay===null?null:cycle.startDay+d.day-1,date=calendarDay===null?null:dayDate(calendarDay);
    const status=receipt?'CLAIMED':!config.enabled?'CLOSED':!subscription.active?'INACTIVE':!window||calendarDay>window.endDay?'UPCOMING':saved.has(dailyKey(userId,date))?'DAILY_LIMIT':d.rewards.length?'AVAILABLE':'EMPTY';
    return {...d,rewards:receipt?.rewards??d.rewards,date,status,claimedAt:receipt?.claimedAt??null};
  });
  const claimable=config.enabled&&subscription.active?due.filter(d=>config.days[d.day-1].rewards.length):[];
  return {title:config.title,enabled:config.enabled,revision:config.revision,cycle:cycle.cycle,currentDay:cycle.currentDay,startDate:cycle.startDay===null?null:dayDate(cycle.startDay),endDate:cycle.startDay===null?null:dayDate(cycle.startDay+29),today,serverNow:now,nextResetAt:(kstDay(now)+1)*DAY_MS-9*3600000,claimedCount:days.filter(d=>d.status==='CLAIMED').length,days,
    claimableCount:claimable.length,claimableFrom:claimable[0]?.date??null,claimableTo:claimable.at(-1)?.date??null,accrualStartDate:window?dayDate(window.startDay):null,
    claimAll:window?{startsAt:window.startsAt,throughDay:window.endDay,expectedRevision:config.revision}:null};
}
const availability=item=>{
  const definitions={INVENTORY_ITEM:['inventory_items','code=? AND is_active=1'],EQUIPMENT:['character_equipment_items','CAST(id AS TEXT)=? AND is_active=1 AND is_public=1'],VEHICLE:['character_garage_items','CAST(id AS TEXT)=? AND is_active=1 AND is_public=1'],CARD:['cards_effective_v1210 c JOIN members m ON m.id=c.member_id',"CAST(c.id AS TEXT)=? AND c.is_active=1 AND m.is_active=1 AND UPPER(c.rarity) IN ('SUPERSTAR','ZENITH','FUR') AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'"]};
  const def=definitions[item.type];return def?{sql:`EXISTS(SELECT 1 FROM ${def[0]} WHERE ${def[1]})`,values:[item.ref]}:null;
};
function combineRewards(days,config){
  const combined=new Map();
  for(const day of days){
    const rewards=config.days[day.day-1].rewards;
    if(!rewards.length||rewards.some(x=>restricted.has(x.ref)))fail('ITEM','지급 가능한 보상을 확인하지 못했습니다.',409);
    for(const reward of rewards){const previous=combined.get(reward.code),quantity=(previous?.quantity||0)+reward.quantity;
      if(!safe(quantity,1))fail('LIMIT','보상 수량 한도를 초과했습니다.',409);
      combined.set(reward.code,{...reward,quantity});}
  }
  return [...combined.values()];
}
async function commitPassDays(env,user,{days,support,config,now,requestId,batch=null,remainingCount=0}){
  const rewards=combineRewards(days,config.state),grants=await prepareUnifiedDropGrant(env,{userId:Number(user.id),requestId,sourceType:'SUPPORTER_SEASON_PASS',sourceId:batch?String(batch.startsAt):days[0].cycle,rewards:rewards.map(r=>({rewardType:r.type,rewardRef:r.ref,rewardName:r.name,quantity:r.quantity}))},{writePoolLedger:false});
  const guards=rewards.map(availability).filter(Boolean);
  for(const r of rewards){
    const col={COIN:'coin',CARD_SHARDS:'card_shards',MAGIC_CRYSTAL:'magic_crystals'}[r.type];
    const balance=col?grants.balances[{COIN:'coin',CARD_SHARDS:'cardShards',MAGIC_CRYSTAL:'magicCrystals'}[r.type]]:r.type==='INVENTORY_ITEM'?grants.balances.inventory[r.ref]:r.type==='CARD'?grants.balances.cards[r.ref]:null;
    if(balance!==null&&!safe(balance))fail('LIMIT','보유 수량 한도를 초과하여 수령할 수 없습니다.',409);
    if(col)guards.push({sql:'EXISTS(SELECT 1 FROM users WHERE id=? AND '+col+'=?)',values:[user.id,balance-r.quantity]});
    if(r.type==='INVENTORY_ITEM')guards.push({sql:'COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)=? AND COALESCE((SELECT unseen_quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)<=?',values:[user.id,r.ref,balance-r.quantity,user.id,r.ref,Number.MAX_SAFE_INTEGER-r.quantity]});
    if(r.type==='CARD')guards.push({sql:'COALESCE((SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?),0)=?',values:[user.id,r.ref,balance-r.quantity]});
  }
  const receipts=days.map(d=>({ok:true,cycle:d.cycle,day:d.day,date:d.date,claimedAt:now,rewards:config.state.days[d.day-1].rewards,refreshAccount:true,replayed:false,...(batch?{batchRequestId:batch.requestId}:{})}));
  const result=batch?{ok:true,requestId:batch.requestId,startsAt:batch.startsAt,throughDay:batch.throughDay,days:receipts,dayCount:days.length,rewards,remainingCount,claimedAt:now,refreshAccount:true,replayed:false}:receipts[0];
  const DB=env.DB,token=crypto.randomUUID(),p=(sql,...v)=>DB.prepare(sql).bind(...v);
  const receiptKeys=days.flatMap(d=>[claimKey(user.id,d.cycle,d.day),dailyKey(user.id,d.date)]);
  const absent=[...receiptKeys,...(batch?[batch.key]:[])];
  await ensureJointAtomicSchema(env);
  try{await DB.batch([
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',user.id),p('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR UPDATE',support.key,PASS_KEY)]:[]),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND '+absent.map(()=> 'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)').join(' AND '),[support.key,support.raw,PASS_KEY,config.raw,...absent]),
    ...guards.map((g,i)=>jointGuard(DB,token+'g'+i,g.sql,g.values)),
    ...receipts.flatMap(r=>[p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',claimKey(user.id,r.cycle,r.day),JSON.stringify(r)),p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',dailyKey(user.id,r.date),JSON.stringify({cycle:r.cycle,day:r.day,date:r.date,claimedAt:now}))]),
    ...grants.statements,
    jointGuard(DB,token+'p',grants.proofs.map(x=>'('+x.sql+')').join(' AND ')||'1=0',grants.proofs.flatMap(x=>x.values)),
    ...(batch?[p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',batch.key,JSON.stringify({payload:batch.payload,result}))]:[]),
    ...[token,token+'p',...guards.map((_,i)=>token+'g'+i)].map(t=>jointGuardEnd(DB,t))
  ]);}catch(error){
    const key=batch?.key??claimKey(user.id,days[0].cycle,days[0].day),row=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
    if(row){const saved=JSON.parse(row.value);if(batch&&saved.payload!==batch.payload)fail('REQUEST','같은 요청 번호의 내용이 다릅니다.',409);return {...(batch?saved.result:saved),replayed:true};}
    const raced=await DB.prepare('SELECT key FROM app_meta WHERE key IN ('+receiptKeys.map(()=>'?').join(',')+')').bind(...receiptKeys).all();
    if(raced.results.length)fail('CHANGED','다른 창에서 일부 보상을 받았습니다. 남은 보상을 다시 확인하세요.',409);
    throw error;
  }
  return result;
}
export async function claimSeasonPass(env,user,body,now=Date.now()){
  if(typeof body.cycle!=='string'||!/^\d{1,16}-\d{1,6}$/.test(body.cycle)||!safe(body.day,1,30)||!safe(body.expectedRevision))fail('INPUT','수령할 날짜를 다시 선택하세요.');
  const key=claimKey(user.id,body.cycle,body.day),prior=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(prior)return {...JSON.parse(prior.value),replayed:true};
  const [support,config]=await Promise.all([readSupportRecord(env,user.id),readPassConfig(env)]),subscription=supportBenefits(support.state,now),window=passWindow(subscription,now);
  if(!subscription.active)fail('INACTIVE','후원 혜택 적용 기간에 수령할 수 있습니다.',403);
  if(!config.state.enabled)fail('CLOSED','시즌패스 보상을 준비하고 있습니다.',409);
  const [startsAt,index]=body.cycle.split('-').map(Number),calendarDay=(window?.startDay??0)+index*PASS_DAYS+body.day-1;
  const day=window?passEntitlement(window,calendarDay):null;
  if(startsAt!==subscription.startsAt||!day||day.cycle!==body.cycle||calendarDay>window.endDay)fail('DAY','후원 적용일부터 오늘까지 열린 보상만 수령할 수 있습니다.',409);
  if(body.expectedRevision!==config.state.revision)fail('REVISION','보상표가 변경됐습니다. 다시 확인하고 수령하세요.',409);
  if(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(dailyKey(user.id,day.date)).first())fail('DAILY','해당 날짜 보상은 이미 수령했습니다.',409);
  return commitPassDays(env,user,{days:[day],support,config,now,requestId:'SUPPORT_PASS:'+user.id+':'+body.cycle+':'+body.day});
}
export async function claimSeasonPassBatch(env,user,body,now=Date.now()){
  if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||!safe(body.startsAt,1)||!safe(body.throughDay)||!safe(body.expectedRevision))fail('INPUT','일괄 수령 요청을 다시 확인하세요.');
  const key='supporter_pass_batch_v1:'+Number(user.id)+':'+body.requestId,payload=JSON.stringify([body.startsAt,body.throughDay,body.expectedRevision]);
  const prior=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(prior){const saved=JSON.parse(prior.value);if(saved.payload!==payload)fail('REQUEST','같은 요청 번호의 내용이 다릅니다.',409);return {...saved.result,replayed:true};}
  const [support,config]=await Promise.all([readSupportRecord(env,user.id),readPassConfig(env)]),subscription=supportBenefits(support.state,now);
  if(!subscription.active)fail('INACTIVE','후원 혜택 적용 기간에 수령할 수 있습니다.',403);
  if(!config.state.enabled)fail('CLOSED','시즌패스 보상을 준비하고 있습니다.',409);
  if(body.expectedRevision!==config.state.revision)fail('REVISION','보상표가 변경됐습니다. 다시 확인하고 수령하세요.',409);
  const {window,due}=await passLedger(env,user.id,subscription,now);
  if(body.startsAt!==subscription.startsAt||!window||body.throughDay<window.startDay||body.throughDay>window.endDay)fail('DAY','후원 적용일부터 오늘까지 열린 보상만 수령할 수 있습니다.',409);
  const available=due.filter(d=>d.calendarDay<=body.throughDay),days=[];let equipment=0,entries=0;
  for(const day of available){const rewards=config.state.days[day.day-1].rewards,extra=rewards.filter(r=>r.type==='EQUIPMENT').reduce((n,r)=>n+r.quantity,0);
    if(days.length&&(days.length>=30||equipment+extra>50||entries+rewards.length>60))break;
    days.push(day);equipment+=extra;entries+=rewards.length;}
  if(!days.length)fail('EMPTY','현재 받을 수 있는 미수령 보상이 없습니다.',409);
  return commitPassDays(env,user,{days,support,config,now,requestId:'SUPPORT_PASS_BATCH:'+user.id+':'+body.requestId,batch:{...body,key,payload},remainingCount:available.length-days.length});
}
export async function handleSeasonPass({path,request,env,user,deps,now,eligible}){
  if(path==='admin/server-support/pass'){
    if(request.method==='GET'){const [config,catalog]=await Promise.all([readPassConfig(env),passCatalog(env)]);return {adminId:Number(user.id),config:config.state,catalog,serverNow:now};}
    if(request.method==='POST'){const body=await readJointBody(request,{maxBytes:65536,fields:['document','expectedRevision','requestId']});return deps.withUserMutationLock(env,user.id,path,()=>savePassConfig(env,user,body,(deps.now||Date.now)()));}
  }
  if(['server-support/pass/claim','server-support/pass/claim-all'].includes(path)&&request.method==='POST'){
    if(!eligible)fail('ELIGIBILITY','가입 3일 경과와 2차 인증 완료가 필요합니다.',403);
    const batch=path.endsWith('/claim-all'),body=await readJointBody(request,{fields:batch?['startsAt','throughDay','expectedRevision','requestId']:['cycle','day','expectedRevision']});
    return deps.withUserMutationLock(env,user.id,path,()=>(batch?claimSeasonPassBatch:claimSeasonPass)(env,user,body,(deps.now||Date.now)()));
  }
  fail('ROUTE','지원하지 않는 시즌패스 요청입니다.',405);
}
