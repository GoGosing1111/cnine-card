import {CHUSEOK_KEY,CHUSEOK_COIN,CHUSEOK_ASSETS,CHUSEOK_EVENTS,CHUSEOK_RETIRED_ITEMS,cleanChuseokSettings,chuseokComplete,chuseokPhase,pickChuseokReward} from '../js/chuseok-model-v1.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {MERCENARY_ACCOUNTING_SCHEMA,mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';

const TABLE='chuseok_receipts_v1',ready=new WeakMap();
export const CHUSEOK_SCHEMA=`CREATE TABLE IF NOT EXISTS chuseok_receipts_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,event TEXT NOT NULL,choice INTEGER NOT NULL CHECK(choice BETWEEN 0 AND 2),result_json TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_chuseok_user_v1 ON chuseok_receipts_v1(user_id,event,created_at DESC);`;
export const CHUSEOK_ITEM=[CHUSEOK_COIN,'추석 코인','CHUSEOK COIN','송편 고르기와 추석 떡값 이벤트 도전에 사용하는 코인입니다.','EVENT','SPECIAL',CHUSEOK_ASSETS+'chuseok-coin.svg',47];
class ChuseokError extends Error{constructor(code,message,status=409){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>{throw new ChuseokError(code,message,status);};
const safeId=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)fail('INVALID_USER','계정을 다시 확인하세요.',400);return id;};
const quantity=value=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)fail('INVALID_QUANTITY','보유 수량을 확인할 수 없습니다.');return n;};
const requestIdOf=body=>{const id=body?.requestId;if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(id))fail('INVALID_REQUEST','요청 번호를 확인하세요.',400);return id;};
function transactionDB(q,lock=false){return {dialect:'postgres',prepare(source){const make=values=>({source,values,bind:(...args)=>make(args),first:async()=>{let n=0;return (await q(source.replace(/\?/g,()=>`$${++n}`)+(lock?' FOR SHARE':''),values))[0]??null;}});return make([]);}};}
export async function ensureChuseok(env){
 const db=env.DB;if(db?.dialect!=='postgres'||!db.client||typeof db.enqueue!=='function')fail('DATABASE_UNSUPPORTED','이벤트 지급 DB를 확인하세요.',503);
 if(!ready.has(db))ready.set(db,db.enqueue(async()=>{
  const q=async(text,values=[])=>(await db.client.query({text,values})).rows;
  const [installed]=await q(`SELECT to_regclass('public.${TABLE}') AS relation,(SELECT COUNT(*) FROM inventory_items WHERE code=$1) AS items`,[CHUSEOK_COIN]);
  if(installed?.relation&&Number(installed.items)===1)return;
  await q('BEGIN');try{
   await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='15s'");await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CHUSEOK_KEY+':schema']);
   for(const sql of CHUSEOK_SCHEMA.split(';').filter(s=>s.trim()))await q(sql);
   for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await q(sql);
   await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(code) DO NOTHING',CHUSEOK_ITEM);
   await q('COMMIT');
  }catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
 }).catch(e=>{ready.delete(db);throw e;}));return ready.get(db);
}
async function transaction(env,operation){await ensureChuseok(env);return env.DB.enqueue(async()=>{
 const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;
 await q('BEGIN');try{await q("SET LOCAL TIME ZONE 'UTC'");await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='20s'");const result=await operation(q);await q('COMMIT');return result;}catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
});}
async function settings(q,lock=false){const [row]=await q(`SELECT value FROM app_meta WHERE key=$1${lock?' FOR SHARE':''}`,[CHUSEOK_KEY]);const raw=row?JSON.parse(row.value):{};return {settings:cleanChuseokSettings(raw),revision:raw.revision??null};}
const imagePath=value=>{const s=String(value||'');return /^(https?:\/\/|\/(?!\/))/.test(s)?s:s&&!s.includes(':')&&!s.startsWith('//')?'/'+s:CHUSEOK_ASSETS+'chuseok-coin.svg';};
async function catalog(q,{lock=false,selected=null}={}){
 const suffix=lock?' FOR SHARE':'',refs=selected?.map(r=>r.ref).filter(Boolean);
 const gear=await q(`SELECT id,code,name,image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1${refs?' AND code=ANY($1::text[])':''} ORDER BY name${suffix}`,refs?[refs]:[]);
 const items=await q(`SELECT code,name,image_url FROM inventory_items WHERE is_active=1 AND NOT(code=ANY($1::text[]))${refs?' AND code=ANY($2::text[])':''} ORDER BY sort_order,name${suffix}`,[[...CHUSEOK_RETIRED_ITEMS,CHUSEOK_COIN],...(refs?[refs]:[])]);
 let mercenaries=[];if(!selected||selected.some(r=>r.kind==='MERCENARY')){
  const [schema]=await q("SELECT to_regclass('public.mercenary_cms_documents_v1') AS relation");
  if(schema?.relation){const {document}=await readMercenaryDocument({DB:transactionDB(q,lock)});mercenaries=document.mercenaries.flatMap(m=>{const art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===m.code);return art&&['C','B','A','S','SS','SSS'].includes(m.rank)?[{kind:'MERCENARY',ref:m.code,name:m.name,rank:m.rank,image:imagePath(art.sourceArt)}]:[];});}
 }
 return [...gear.map(r=>({kind:'EQUIPMENT',ref:r.code,equipmentId:Number(r.id),name:r.name,image:imagePath(r.image_url)})),...items.map(r=>({kind:'ITEM',ref:r.code,name:r.name,image:imagePath(r.image_url)})),...mercenaries];
}
function rewardsFor(s,data){return s.rewards.map(r=>{
 const item=data.find(c=>c.kind===r.kind&&c.ref===r.ref);
 return {...r,...item,name:r.kind==='COIN'?(r.amount===null?'일반 코인 · 수량 설정 전':`${r.amount.toLocaleString('ko-KR')} 코인`):r.kind==='MISS'?'꽝':item?.name||r.ref||'상품 선택 전',image:r.kind==='COIN'?'/assets/ui/events/golden-axe-v1/coin.svg':item?.image||CHUSEOK_ASSETS+'chuseok-coin.svg',available:['COIN','MISS'].includes(r.kind)||Boolean(item)};
});}
async function quoteFor(config,rewards){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({revision:config.revision,rewards})));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
async function balance(q,id){const [user]=await q('SELECT coin FROM users WHERE id=$1',[id]);const [row]=await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[id,CHUSEOK_COIN]);return {coin:String(user?.coin??0),chuseokCoins:quantity(row?.quantity)};}
async function dailyCount(q,id,event,now){const [row]=await q(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE user_id=$1 AND event=$2 AND created_at>=date_trunc('day',$3::timestamptz AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'`,[id,event,now]);return Number(row.n);}
export async function chuseokState(env,userId){return transaction(env,async q=>{
 const id=safeId(userId),config=await settings(q),data=await catalog(q,{selected:Object.values(config.settings.events).flatMap(e=>e.rewards)}),[clock]=await q('SELECT clock_timestamp() AS now'),events={};
 for(const [key,s] of Object.entries(config.settings.events)){const rewards=rewardsFor(s,data);events[key]={...s,rewards,phase:chuseokPhase(s,config.settings.visible,Date.parse(clock.now)),quote:await quoteFor(config,rewards),dailyUsed:await dailyCount(q,id,key,clock.now)};}
 const history=await q(`SELECT result_json FROM ${TABLE} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[id]);
 return {userId:id,visible:config.settings.visible,revision:config.revision,serverNow:new Date(clock.now).toISOString(),events,...await balance(q,id),history:history.map(r=>JSON.parse(r.result_json))};
});}
async function inventoryChange(q,id,code,amount,requestId){
 let rows;if(amount<0)rows=await q('UPDATE cnine_user_inventory SET quantity=quantity+$3,unseen_quantity=LEAST(unseen_quantity,quantity+$3),updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND item_code=$2 AND quantity>=-($3::bigint) RETURNING quantity',[id,code,amount]);
 else rows=await q('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at) SELECT $1,code,$3,$3,CURRENT_TIMESTAMP FROM inventory_items WHERE code=$2 AND is_active=1 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP RETURNING quantity',[id,code,amount]);
 if(rows.length!==1)fail('INVENTORY_CHANGED','아이템 차감·지급을 확인하지 못해 모든 변경을 취소했습니다.');
 const log=await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,'CHUSEOK',$6) RETURNING user_id",[id,code,amount,quantity(rows[0].quantity),amount<0?'추석 이벤트 도전':'추석 이벤트 당첨',requestId]);if(log.length!==1)fail('GRANT_FAILED','지급 기록 저장 실패로 모든 변경을 취소했습니다.');
}
export async function drawChuseok(env,userId,body,{randomInt=mercenaryRandomInt}={}){
 const id=safeId(userId),requestId=requestIdOf(body),event=body.event,choice=body.choice;
 if(!Object.hasOwn(CHUSEOK_EVENTS,event)||!Number.isInteger(choice)||choice<0||choice>2)fail('INVALID_CHOICE','이벤트와 선택 대상을 확인하세요.',400);
 return transaction(env,async q=>{
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['chuseok:'+requestId]);
  const [user]=await q("SELECT id,status,coin FROM users WHERE id=$1 AND (banned_until IS NULL OR banned_until<=sqlite_now()) FOR UPDATE",[id]);if(!user||user.status!=='ACTIVE')fail('USER_INACTIVE','활성 계정만 도전할 수 있습니다.',403);
  const [prior]=await q(`SELECT user_id,event,choice,result_json FROM ${TABLE} WHERE request_id=$1`,[requestId]);
  if(prior){if(Number(prior.user_id)!==id||prior.event!==event||Number(prior.choice)!==choice)fail('REQUEST_CONFLICT','다른 작업에 사용된 요청 번호입니다.');return {...JSON.parse(prior.result_json),...await balance(q,id),replayed:true};}
  const config=await settings(q,true),s=config.settings.events[event],[clock]=await q('SELECT clock_timestamp() AS now');
  if(chuseokPhase(s,config.settings.visible,Date.parse(clock.now))!=='OPEN')fail('EVENT_CLOSED','현재 도전은 OFF입니다. 추석 코인은 소모되지 않았습니다.');
  const data=await catalog(q,{lock:true,selected:s.rewards}),rewards=rewardsFor(s,data);
  if(rewards.some(r=>r.rate>0&&!r.available))fail('REWARD_UNAVAILABLE','지급 상품을 확인 중입니다. 코인은 소모되지 않았습니다.');
  if(body.revision!==config.revision||body.quote!==await quoteFor(config,rewards))fail('SETTINGS_CHANGED','운영 설정 또는 상품이 바뀌었습니다. 새로 확인한 뒤 도전하세요.');
  if(s.dailyLimit>0&&await dailyCount(q,id,event,clock.now)>=s.dailyLimit)fail('DAILY_LIMIT','오늘의 도전 횟수를 모두 사용했습니다. 매일 00시(KST)에 초기화됩니다.');
  const [item]=await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE',[CHUSEOK_COIN]);if(Number(item?.is_active)!==1)fail('COIN_DISABLED','추석 코인 사용이 중지되어 있습니다.');
  const [owned]=await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[id,CHUSEOK_COIN]);if(quantity(owned?.quantity)<s.coinCost)fail('INSUFFICIENT_COINS','추석 코인이 부족합니다.');
  const selected=pickChuseokReward(s,randomInt(1000000)),reward={...rewards.find(r=>r.id===selected.id),quantity:selected.amount};
  if(reward.kind==='COIN'){
   const after=BigInt(String(user.coin))+BigInt(reward.amount);if(after>9223372036854775807n)fail('COIN_OVERFLOW','코인 보유 한도를 확인하세요.');
   const rows=await q('UPDATE users SET coin=coin+$2 WHERE id=$1 RETURNING coin',[id,reward.amount]);if(rows.length!==1||String(rows[0].coin)!==String(after))fail('GRANT_FAILED','코인 지급 실패로 모든 변경을 취소했습니다.');
   const logs=await q('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2,$3,$4) RETURNING user_id',[id,reward.amount,String(after),`${CHUSEOK_EVENTS[event]}:${requestId}`]);if(logs.length!==1)fail('GRANT_FAILED','지급 기록 저장에 실패했습니다.');
  }else if(reward.kind==='ITEM')await inventoryChange(q,id,reward.ref,reward.amount,requestId);
  else if(reward.kind==='EQUIPMENT'){
   const rows=await q("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT $1,id,'CHUSEOK',$2,$2 FROM character_equipment_items WHERE code=$3 AND is_active=1 AND is_public=1 RETURNING id",[id,requestId,reward.ref]);if(rows.length!==1)fail('GRANT_FAILED','장비 지급 실패로 모든 변경을 취소했습니다.');reward.instanceId=Number(rows[0].id);
  }else if(reward.kind==='MERCENARY'){
   for(const stmt of mercenaryCardAcquisitionStatements(transactionDB(q),{userId:id,mercenaryCode:reward.ref,acquisitionId:'chuseok:'+requestId})){let n=0;await q(stmt.source.replace(/\?/g,()=>`$${++n}`),stmt.values);}
   const [acquisition]=await q('SELECT total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1 AND user_id=$2 AND mercenary_code=$3',['chuseok:'+requestId,id,reward.ref]);if(!acquisition)fail('GRANT_FAILED','용병 지급 실패로 모든 변경을 취소했습니다.');Object.assign(reward,{totalCopies:Number(acquisition.total_copies_after),duplicates:Number(acquisition.duplicate_count_after)});
  }
  await inventoryChange(q,id,CHUSEOK_COIN,-s.coinCost,requestId);
  const [completed]=await q('SELECT clock_timestamp() AS now');if(chuseokPhase(s,config.settings.visible,Date.parse(completed.now))!=='OPEN')fail('EVENT_CLOSED','이벤트가 종료되어 차감과 지급을 모두 취소했습니다.');
  const result={ok:true,requestId,userId:id,event,choice,revision:config.revision,kind:reward.kind,reward:reward.kind==='MISS'?null:reward,coinCost:s.coinCost,...await balance(q,id),completedAt:new Date(completed.now).toISOString(),replayed:false};
  const rows=await q(`INSERT INTO ${TABLE}(request_id,user_id,event,choice,result_json,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING request_id`,[requestId,id,event,choice,JSON.stringify(result),result.completedAt]);if(rows.length!==1)fail('RECEIPT_FAILED','결과 저장 실패로 차감과 지급을 취소했습니다.');return result;
 });
}
export async function chuseokAdmin(env,admin,body=null){return transaction(env,async q=>{
 await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CHUSEOK_KEY]);
 const before=await settings(q),data=await catalog(q,{lock:Boolean(body)});let config=before;
 if(body){
  let next;try{next=cleanChuseokSettings(body);}catch(e){fail('SETTINGS_INVALID',e.message,400);}
  if((body.revision??null)!==before.revision)fail('REVISION_CONFLICT','다른 관리자가 변경했습니다. 다시 불러오세요.');
  if(Object.values(next.events).some(s=>s.enabled&&rewardsFor(s,data).some(r=>r.rate>0&&!r.available)))fail('REWARD_UNAVAILABLE','확률이 설정된 상품의 공개·지급 상태를 확인하세요.');
  const revision=crypto.randomUUID(),value=JSON.stringify({...next,revision});
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[CHUSEOK_KEY,value]);
  await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CHUSEOK_UPDATE','EVENT',$2,$3,$4)",[admin.id,CHUSEOK_KEY,JSON.stringify(before),value]);config={settings:next,revision};
 }
 return {...config,catalog:data,complete:Object.fromEntries(Object.entries(config.settings.events).map(([k,v])=>[k,chuseokComplete(v)]))};
});}
export async function handleChuseok({path,request,env,deps}){
 if(!['events/chuseok/feature','events/chuseok/state','events/chuseok/draw','events/chuseok/receipt','admin/chuseok'].includes(path))return null;
 const {authenticate,requirePermission,readBody,json}=deps,admin=path==='admin/chuseok';
 try{
  if(path==='events/chuseok/feature'&&request.method==='GET'){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CHUSEOK_KEY).first(),s=cleanChuseokSettings(row?JSON.parse(row.value):{});return json({visible:s.visible,name:'추석 달빛 잔치',events:Object.fromEntries(Object.entries(s.events).map(([k,v])=>[k,{phase:chuseokPhase(v,s.visible),startsAt:v.startsAt,endsAt:v.endsAt}]))});}
  const actor=admin?await requirePermission(request,env,'USER_MANAGE'):await authenticate(request,env);if(!actor)return json({error:admin?'이벤트 관리 권한이 없습니다.':'로그인이 필요합니다.'},admin?403:401);
  if(['POST','PATCH'].includes(request.method)){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_INVALID','외부 사이트 요청은 허용되지 않습니다.',403);}
  if(admin&&['GET','PATCH'].includes(request.method))return json(await chuseokAdmin(env,actor,request.method==='PATCH'?await readBody(request):null));
  if(path==='events/chuseok/state'&&request.method==='GET')return json(await chuseokState(env,actor.id));
  if(path==='events/chuseok/draw'&&request.method==='POST')return json(await drawChuseok(env,actor.id,await readBody(request)));
  if(path==='events/chuseok/receipt'&&request.method==='GET'){const id=requestIdOf({requestId:new URL(request.url).searchParams.get('requestId')});await ensureChuseok(env);const row=await env.DB.prepare(`SELECT result_json FROM ${TABLE} WHERE request_id=? AND user_id=?`).bind(id,actor.id).first();return json({found:Boolean(row),result:row?JSON.parse(row.result_json):null});}
  return json({error:'지원하지 않는 요청입니다.'},405);
 }catch(e){if(e instanceof ChuseokError)return json({error:e.message,code:e.code},e.status);console.error(JSON.stringify({event:'chuseok_failed',path,code:String(e.code||'INTERNAL')}));return json({error:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요. 중복으로 차감하지 않습니다.',code:'CHUSEOK_FAILED'},500);}
}
