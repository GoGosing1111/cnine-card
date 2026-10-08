import {CHICKEN_KEY,CHICKEN_TICKET,CHICKEN_NAME,CHICKEN_ASSETS,CHICKEN_CHOICES,chickenDraft,cleanChickenSettings,chickenComplete,chickenPhase,pickChickenReward} from '../shared/chicken-event-v1.mjs';
import {LIMITED_MERCENARIES,isLimitedMercenary} from '../shared/mercenary-limited-catalog-v1.mjs';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';

const TABLE='chicken_event_receipts_v1';
export const CHICKEN_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS ${TABLE}(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,choice TEXT NOT NULL CHECK(choice IN ('FRIED','YANGNYEOM')),result_json TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE INDEX IF NOT EXISTS idx_chicken_event_user_v1 ON ${TABLE}(user_id,created_at DESC)`
];
const fail=(code,message,status=409)=>{throw Object.assign(Error(message),{code,status,chicken:true});};
const one=(rows,message)=>{if(rows.length!==1)fail('GRANT_FAILED',message);return rows[0];};
function requestIdOf(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(value))fail('INVALID_REQUEST','요청 번호를 확인하세요.',400);return value;}
function txDB(q,lock=false){return {dialect:'postgres',prepare(source){const make=values=>({source,values,bind:(...v)=>make(v),first:async()=>{let n=0;return (await q(source.replace(/\?/g,()=>`$${++n}`)+(lock?' FOR SHARE':''),values))[0]??null;},all:async()=>{let n=0;return {results:await q(source.replace(/\?/g,()=>`$${++n}`)+(lock?' FOR SHARE':''),values)};}});return make([]);}};}
async function tx(env,fn){
 if(env.DB?.dialect!=='postgres'||!env.DB.client||!env.DB.enqueue)fail('DATABASE_UNSUPPORTED','이벤트를 준비 중입니다.',503);
 return env.DB.enqueue(async()=>{const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;await q('BEGIN');try{await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='20s'");const result=await fn(q);await q('COMMIT');return result;}catch(e){await q('ROLLBACK').catch(()=>{});throw e;}});
}
// Called by the explicit preparation operation, never by HTTP requests.
export async function prepareChickenEvent(client){
 for(const text of CHICKEN_SCHEMA)await client.query(text);
 await client.query(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
  VALUES($1,'핑두의 배민권','철구네 치킨','철구네 치킨에서 주문할 때 1개를 소모합니다. 선택한 치킨과 보상 확률은 무관합니다.','EVENT','SPECIAL',$2,58,1) ON CONFLICT(code) DO NOTHING`,[CHICKEN_TICKET,CHICKEN_ASSETS+'ticket.svg']);
 await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',[CHICKEN_KEY,JSON.stringify({settings:chickenDraft(),revision:crypto.randomUUID()})]);
}
async function config(q,lock=false){const [r]=await q(`SELECT value FROM app_meta WHERE key=$1${lock?' FOR SHARE':''}`,[CHICKEN_KEY]);const raw=r?JSON.parse(r.value):{settings:chickenDraft(),revision:null};return {...raw,settings:cleanChickenSettings(raw.settings)};}
async function balance(q,id){const [r]=await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[id,CHICKEN_TICKET]);return Number(r?.quantity||0);}
async function catalog(q,lock=false){
 const items=await q('SELECT code,name,image_url,category,rarity FROM inventory_items WHERE is_active=1 ORDER BY sort_order NULLS LAST,code');
 const {document}=await readMercenaryDocument({DB:txDB(q,lock)});
 const [policy]=await q('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1'+(lock?' FOR SHARE':''));
 const rules=policy?JSON.parse(policy.payload_json).cardRules:undefined;
 const eligible=new Set(mercenaryCardChances(null,MERCENARY_CMS_SEED.catalog.cards.map(c=>c.code),rules).filter(r=>r.weight>0).map(r=>r.code));
 const stock=await q('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1');
 return [
  {kind:'COIN',code:'COIN',name:'코인',image:'/assets/ui/events/golden-axe-v1/coin.svg',available:true},
  ...items.filter(r=>![CHICKEN_TICKET,'PINGDU_OLD_AXE','PINGDU_WISH_TICKET','CHUSEOK_COIN'].includes(r.code)).map(r=>({kind:'ITEM',code:r.code,name:r.name,image:r.image_url,category:r.category,available:true})),
  ...document.mercenaries.filter(r=>eligible.has(r.code)&&!isLimitedMercenary(r.code)).flatMap(r=>{const art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===r.code);return art?[{kind:'MERCENARY',code:r.code,name:r.name,rank:r.rank,image:'/'+art.sourceArt.replace(/^\//,''),available:true}]:[];}),
  ...LIMITED_MERCENARIES.map(r=>{const s=stock.find(s=>s.code===r.code),remaining=s?.stock_limit===null||!s?null:Math.max(0,Number(s.stock_limit)-Number(s.issued));return {kind:'LIMITED',code:r.code,name:r.name,rank:r.rank,image:'/'+r.sourceArt,frame:'/'+r.frame,artWindow:r.artWindow,remaining,available:remaining>0};})
 ];
}
function resolve(settings,options){return settings.rewards.map(r=>({...options.find(c=>c.kind===r.kind&&c.code===r.code),...r,available:options.some(c=>c.kind===r.kind&&c.code===r.code&&c.available)}));}
export async function chickenState(env,userId){return tx(env,async q=>{
 const cfg=await config(q),options=await catalog(q),rewards=resolve(cfg.settings,options),[clock]=await q('SELECT clock_timestamp() AS now');
 let phase=chickenPhase(cfg.settings,new Date(clock.now).getTime());if(phase==='OPEN'&&rewards.some(r=>r.chancePpm>0&&!r.available))phase='UNAVAILABLE';
 const history=await q(`SELECT result_json FROM ${TABLE} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[userId]);
 return {userId:Number(userId),name:CHICKEN_NAME,revision:cfg.revision,phase,startsAt:cfg.settings.startsAt,endsAt:cfg.settings.endsAt,ticketCost:1,tickets:await balance(q,userId),rewards:rewards.filter(r=>r.chancePpm>0).map(({chancePpm,...r})=>r),history:history.map(r=>JSON.parse(r.result_json)),serverNow:new Date(clock.now).toISOString()};
});}
export async function chickenAdmin(env,actor,body=null){return tx(env,async q=>{
 await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CHICKEN_KEY]);
 const before=await config(q);let settings=before.settings,revision=before.revision;
 const options=await catalog(q,Boolean(body));
 if(body){
  if(Object.keys(body).sort().join(',')!=='revision,settings'||body.revision!==revision)fail('REVISION_CONFLICT','다른 창에서 설정이 변경됐습니다. 다시 불러오세요.');
  try{settings=cleanChickenSettings(body.settings);}catch(e){fail('SETTINGS_INVALID',e.message,400);}
  const rewards=resolve(settings,options);
  if(rewards.some(r=>!r.name))fail('UNKNOWN_REWARD','등록된 보상만 선택할 수 있습니다.',400);
  if(settings.enabled&&rewards.some(r=>r.chancePpm>0&&!r.available))fail('REWARD_UNAVAILABLE','획득 대상·리미티드 발행 한도와 잔여 수량을 확인하세요.');
  revision=crypto.randomUUID();const value=JSON.stringify({settings,revision});
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[CHICKEN_KEY,value]);
  await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CHICKEN_EVENT_UPDATE','EVENT',$2,$3,$4)",[actor.id,CHICKEN_KEY,JSON.stringify(before),value]);
 }
 return {settings,revision,options,rewards:resolve(settings,options),complete:chickenComplete(settings),ticketCost:1};
});}
async function inventory(q,id,code,amount,requestId){
 const rows=amount<0?await q('UPDATE cnine_user_inventory SET quantity=quantity+$3,unseen_quantity=LEAST(unseen_quantity,quantity+$3),updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND item_code=$2 AND quantity>=-($3::bigint) RETURNING quantity',[id,code,amount]):await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
 SELECT $1,code,$3,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM inventory_items WHERE code=$2 AND is_active=1
 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP RETURNING quantity`,[id,code,amount]);
 const row=one(rows,amount<0?'핑두의 배민권이 부족합니다.':'사은품 지급을 확인하지 못했습니다. 배민권은 소모되지 않았습니다.');
 await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'철구네 치킨','CHICKEN_EVENT',$5)",[id,code,amount,row.quantity,requestId]);
 return Number(row.quantity);
}
export async function orderChicken(env,userId,body,{randomInt=mercenaryRandomInt}={}){
 const id=Number(userId),requestId=requestIdOf(body?.requestId);
 if(!Number.isSafeInteger(id)||id<1||Object.keys(body).sort().join(',')!=='choice,requestId,revision'||!Object.hasOwn(CHICKEN_CHOICES,body.choice)||typeof body.revision!=='string')fail('INVALID_ORDER','치킨과 참가 정보를 다시 확인하세요.',400);
 return tx(env,async q=>{
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['chicken:'+requestId]);
  const [user]=await q("SELECT id,status FROM users WHERE id=$1 AND (banned_until IS NULL OR banned_until<=sqlite_now()) FOR UPDATE",[id]);
  if(!user||user.status!=='ACTIVE')fail('USER_INACTIVE','활성 계정만 주문할 수 있습니다.',403);
  const [prior]=await q(`SELECT user_id,choice,result_json FROM ${TABLE} WHERE request_id=$1`,[requestId]);
  if(prior){if(Number(prior.user_id)!==id||prior.choice!==body.choice)fail('REQUEST_CONFLICT','다른 주문에 사용한 요청 번호입니다.');return {...JSON.parse(prior.result_json),tickets:await balance(q,id),replayed:true};}
  const cfg=await config(q,true),[clock]=await q('SELECT clock_timestamp() AS now');
  if(chickenPhase(cfg.settings,new Date(clock.now).getTime())!=='OPEN')fail('EVENT_CLOSED','지금은 주문 시간이 아닙니다. 배민권은 소모되지 않았습니다.');
  if(cfg.revision!==body.revision)fail('SETTINGS_CHANGED','보상 설정이 변경됐습니다. 새로 확인한 뒤 주문하세요.');
  const rewards=resolve(cfg.settings,await catalog(q,true));
  if(rewards.some(r=>r.chancePpm>0&&!r.available))fail('REWARD_UNAVAILABLE','사은품을 준비하고 있습니다. 배민권은 소모되지 않았습니다.');
  if(await balance(q,id)<1)fail('TICKET_REQUIRED','핑두의 배민권 1개가 필요합니다.');
  const picked=pickChickenReward(cfg.settings,randomInt(1000000)),reward={...rewards.find(r=>r.kind===picked.kind&&r.code===picked.code)};
  delete reward.chancePpm;delete reward.available;delete reward.remaining;
  const acquisitionId='chicken:'+requestId,now=new Date().toISOString();
  if(reward.kind==='LIMITED'){
   const stock=one(await q('UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2 WHERE code=$1 AND issued+1<=stock_limit RETURNING issued',[reward.code,acquisitionId]),'리미티드 잔여 수량이 소진됐습니다. 배민권은 소모되지 않았습니다.');
   reward.serial=Number(stock.issued);
   const owned=one(await q(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING total_copies,duplicate_count`,[id,reward.code,now]),'용병 보유 정보를 저장하지 못했습니다.');
   one(await q('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[acquisitionId,requestId,id,reward.code,reward.serial,now]),'발행 영수증을 저장하지 못했습니다.');
   one(await q('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[acquisitionId,id,reward.code,Number(owned.total_copies)>1?1:0,owned.total_copies,owned.duplicate_count,now]),'획득 영수증을 저장하지 못했습니다.');
   reward.duplicate=Number(owned.total_copies)>1;
  }else if(reward.kind==='MERCENARY'){
   for(const s of mercenaryCardAcquisitionStatements(txDB(q),{userId:id,mercenaryCode:reward.code,acquisitionId,createdAt:now})){let n=0;await q(s.source.replace(/\?/g,()=>`$${++n}`),s.values);}
   const acquired=one(await q('SELECT is_duplicate FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1 AND user_id=$2 AND mercenary_code=$3',[acquisitionId,id,reward.code]),'용병 획득 영수증을 확인하지 못했습니다.');
   reward.duplicate=Number(acquired.is_duplicate)===1;
  }else if(reward.kind==='COIN'){
   const after=one(await q('UPDATE users SET coin=coin+$2 WHERE id=$1 RETURNING coin',[id,reward.quantity]),'코인 지급을 확인하지 못했습니다.');
   await q("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2,$3,$4)",[id,reward.quantity,after.coin,'CHICKEN_EVENT#'+requestId]);
  }else await inventory(q,id,reward.code,reward.quantity,requestId);
  const tickets=await inventory(q,id,CHICKEN_TICKET,-1,requestId),[endClock]=await q('SELECT clock_timestamp() AS now');
  if(chickenPhase(cfg.settings,new Date(endClock.now).getTime())!=='OPEN')fail('EVENT_CLOSED','주문 중 이벤트가 종료됐습니다. 배민권은 소모되지 않았습니다.');
  const result={ok:true,status:'COMPLETED',requestId,userId:id,choice:body.choice,kind:reward.kind,reward,ticketCost:1,tickets,completedAt:now,replayed:false};
  one(await q(`INSERT INTO ${TABLE}(request_id,user_id,choice,result_json) VALUES($1,$2,$3,$4) RETURNING request_id`,[requestId,id,body.choice,JSON.stringify(result)]),'주문 영수증을 저장하지 못했습니다.');
  return result;
 });
}
export async function handleChickenEvent({path,request,env,deps}){
 const admin=path==='admin/chicken-event';
 if(!admin&&!['events/chicken/feature','events/chicken/state','events/chicken/order','events/chicken/receipt'].includes(path))return null;
 try{
  if(path==='events/chicken/feature'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CHICKEN_KEY).first(),s=row?cleanChickenSettings(JSON.parse(row.value).settings):chickenDraft();
   return deps.json({visible:s.visible,name:CHICKEN_NAME,phase:chickenPhase(s),startsAt:s.startsAt,endsAt:s.endsAt});
  }
  const actor=admin?await deps.requirePermission(request,env,'BATTLE_MANAGE'):await deps.authenticate(request,env);
  if(!actor||admin&&actor.role!=='OWNER')fail('AUTH_REQUIRED',admin?'OWNER만 이벤트를 설정할 수 있습니다.':'로그인이 필요합니다.',admin?403:401);
  if(['POST','PATCH'].includes(request.method)){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_INVALID','외부 사이트 요청은 허용되지 않습니다.',403);}
  if(admin&&['GET','PATCH'].includes(request.method))return deps.json(await chickenAdmin(env,actor,request.method==='PATCH'?await deps.readBody(request):null));
  if(path==='events/chicken/state'&&request.method==='GET')return deps.json(await chickenState(env,actor.id));
  if(path==='events/chicken/order'&&request.method==='POST'){
   const body=await deps.readBody(request);
   return deps.json(await deps.withUserMutationLock(env,actor.id,path,()=>orderChicken(env,actor.id,body)),200);
  }
  if(path==='events/chicken/receipt'&&request.method==='GET'){
   const id=requestIdOf(new URL(request.url).searchParams.get('requestId'));
   const r=await env.DB.prepare(`SELECT result_json FROM ${TABLE} WHERE request_id=? AND user_id=?`).bind(id,actor.id).first();return deps.json({found:Boolean(r),result:r?JSON.parse(r.result_json):null});
  }
  return deps.json({error:'지원하지 않는 요청입니다.'},405);
 }catch(e){if(e.chicken)return deps.json({error:e.message,code:e.code},e.status);console.error('chicken_event_failed',{path,code:e.code||'INTERNAL'});return deps.json({error:'주문 결과를 확인하지 못했습니다. 같은 주문으로 다시 확인하세요.',code:'CHICKEN_FAILED'},500);}
}
