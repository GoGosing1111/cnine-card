import {WISH_TICKET,WISH_LAMP_IMAGE,WISH_CHOICES,WISH_REWARDS,cleanWishSettings,wishSettingsComplete,wishEventPhase,wishChoicePool} from '../js/wish-lamp-model-v2077.js';
const KEY='pingdu_wish_lamp_v2077',TABLE='wish_lamp_receipts_v2077';
const ready=new WeakMap();
export const WISH_SCHEMA=`CREATE TABLE IF NOT EXISTS wish_lamp_receipts_v2077(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,choice_id TEXT NOT NULL,revision TEXT NOT NULL,result_json TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_wish_lamp_user_v2077 ON wish_lamp_receipts_v2077(user_id,created_at DESC);`;
class WishError extends Error{constructor(code,message,status=409){super(message);this.code=code;this.status=status}}
const fail=(code,message,status)=>{throw new WishError(code,message,status)};
const safeId=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)fail('INVALID_USER','계정을 다시 확인하세요.',400);return n};
export async function ensureWishLamp(env){
 const db=env.DB;if(db?.dialect!=='postgres'||!db.client||typeof db.enqueue!=='function')fail('DATABASE_UNSUPPORTED','이벤트 지급을 지원하지 않는 DB입니다.',503);
 if(!ready.has(db))ready.set(db,db.enqueue(async()=>{
   const q=async(text,values=[])=>(await db.client.query({text,values})).rows;
   const [installed]=await q(`SELECT to_regclass('public.${TABLE}') AS relation,EXISTS(SELECT 1 FROM inventory_items WHERE code=$1) AS ticket`,[WISH_TICKET]);
   if(installed?.relation&&installed.ticket)return;
   await q('BEGIN');try{
    await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='15s'");
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY+':schema']);
    const [row]=await q(`SELECT to_regclass('public.${TABLE}') AS relation`);
    if(!row?.relation)for(const statement of WISH_SCHEMA.split(';').filter(s=>s.trim()))await q(statement);
    await q(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,'핑두의 소원권','WISH TICKET','기간제 이벤트 핑두의 소원램프에서 코인과 함께 사용하는 소원권입니다.','EVENT','SPECIAL',$2,46,1) ON CONFLICT(code) DO NOTHING`,[WISH_TICKET,WISH_LAMP_IMAGE]);
    await q('COMMIT');
   }catch(e){try{await q('ROLLBACK')}catch{}throw e}
 }).catch(e=>{ready.delete(db);throw e}));return ready.get(db);
}
async function tx(env,operation){
 await ensureWishLamp(env);return env.DB.enqueue(async()=>{
  const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;
  await q('BEGIN');try{await q("SET LOCAL TIME ZONE 'UTC'");await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='15s'");const result=await operation(q);await q('COMMIT');return result}catch(e){try{await q('ROLLBACK')}catch{}throw e}
 });
}
async function settings(q,lock=false){const [r]=await q(`SELECT value FROM app_meta WHERE key=$1${lock?' FOR SHARE':''}`,[KEY]);const raw=r?JSON.parse(r.value):{};return {settings:cleanWishSettings(raw),revision:raw.revision||null,stored:r?.value??null}}
async function catalog(q,lock=false){
 const all=Object.values(WISH_REWARDS),equipment=all.filter(r=>r.type!=='VEHICLE').map(r=>r.code),vehicles=all.filter(r=>r.type==='VEHICLE').map(r=>r.code);
 const eq=await q(`SELECT id,code,name,slot,image_url,is_active,is_public FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id${lock?' FOR SHARE':''}`,[equipment]);
 const garage=await q(`SELECT id,code,name,image_url,is_active,is_public FROM character_garage_items WHERE code=ANY($1::text[]) ORDER BY id${lock?' FOR SHARE':''}`,[vehicles]);
 return Object.fromEntries(Object.entries(WISH_REWARDS).map(([key,expected])=>{const row=(expected.type==='VEHICLE'?garage:eq).find(r=>r.code===expected.code);return [key,{...expected,key,id:row?Number(row.id):null,available:Boolean(row&&Number(row.is_active)===1&&Number(row.is_public)===1&&(!expected.slot||row.slot===expected.slot)),name:row?.name||expected.name,image:String(row?.image_url||expected.image).replaceAll('\\','/').replace(/^(?!https?:|\/)/,'/')}]}));
}
async function owned(q,id){return (await q('SELECT g.code FROM user_garage_vehicles u JOIN character_garage_items g ON g.id=u.garage_id WHERE u.user_id=$1',[id])).map(r=>r.code)}
function poolData(s,choice,ownedCodes,items){const p=wishChoicePool(s,choice,ownedCodes);p.items=p.items.map(r=>({...r,...items[r.key],rate:r.rate,owned:r.owned}));p.catalogReady=p.items.every(r=>r.rate===0||r.rate===null||r.available);p.available=p.available&&p.catalogReady;return p}
async function quoteFor(revision,pool){const raw=JSON.stringify({revision,id:pool.id,miss:pool.missRate,rows:pool.items.map(r=>[r.key,r.id,r.rate,r.available,r.owned])});const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function balanceNumber(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail('BALANCE_INVALID','재화 잔액을 확인할 수 없습니다.');return n}
async function balances(q,id){const [user]=await q('SELECT coin FROM users WHERE id=$1',[id]);const [ticket]=await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[id,WISH_TICKET]);return {coin:balanceNumber(user?.coin??0),tickets:balanceNumber(ticket?.quantity??0)}}
export async function wishLampState(env,userId){return tx(env,async q=>{
 const id=safeId(userId),cfg=await settings(q),items=await catalog(q),ownedCodes=await owned(q,id),[clock]=await q('SELECT clock_timestamp() AS now');
 const choices=await Promise.all(WISH_CHOICES.map(async c=>{const pool=poolData(cfg.settings,c.id,ownedCodes,items);return {...pool,quote:await quoteFor(cfg.revision,pool)}}));
 const recent=await q(`SELECT result_json FROM ${TABLE} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 12`,[id]);
 return {userId:id,revision:cfg.revision,phase:wishEventPhase(cfg.settings,Date.parse(clock.now)),serverNow:new Date(clock.now).toISOString(),startsAt:cfg.settings.startsAt,endsAt:cfg.settings.endsAt,coinCost:cfg.settings.coinCost,ticketCost:cfg.settings.ticketCost,choices,...await balances(q,id),history:recent.map(r=>JSON.parse(r.result_json))};
})}
export function selectWishReward(pool,unit){
 if(typeof unit!=='number'||unit<0||unit>=1||!Number.isFinite(unit))throw new Error('Invalid random unit');
 let n=unit*100;for(const row of pool.items){if(n<row.rate)return row;n-=row.rate}return null;
}
function randomUnit(){const v=new Uint32Array(1);crypto.getRandomValues(v);return v[0]/4294967296}
export async function openWishLamp(env,userId,body,{random=randomUnit}={}){
 const id=safeId(userId),requestId=body?.requestId,choiceId=body?.choiceId;
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)||!WISH_CHOICES.some(c=>c.id===choiceId))fail('REQUEST_INVALID','소원 종류와 요청 번호를 확인하세요.',400);
 return tx(env,async q=>{
  // Same request and same account cannot race, including two different request IDs.
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`wish:${requestId}`]);
  const [user]=await q('SELECT id,status,coin FROM users WHERE id=$1 FOR UPDATE',[id]);
  if(!user||user.status!=='ACTIVE')fail('USER_INACTIVE','활성 계정만 참여할 수 있습니다.',403);
  const [prior]=await q(`SELECT user_id,choice_id,result_json FROM ${TABLE} WHERE request_id=$1`,[requestId]);
  if(prior){if(Number(prior.user_id)!==id||prior.choice_id!==choiceId)fail('REQUEST_CONFLICT','다른 소원에 사용된 요청입니다.');return {...JSON.parse(prior.result_json),replayed:true,...await balances(q,id)}}
  const cfg=await settings(q,true),[clock]=await q('SELECT clock_timestamp() AS now');
  if(wishEventPhase(cfg.settings,Date.parse(clock.now))!=='OPEN')fail('EVENT_CLOSED','현재 소원램프 운영 시간이 아닙니다. 재화는 차감되지 않았습니다.');
  const items=await catalog(q,true),pool=poolData(cfg.settings,choiceId,await owned(q,id),items);
  if(!pool.available)fail('POOL_UNAVAILABLE','선택한 보상 목록을 이용할 수 없습니다. 재화는 차감되지 않았습니다.');
  const quote=await quoteFor(cfg.revision,pool);
  if(body.revision!==cfg.revision||body.quote!==quote)fail('QUOTE_CHANGED','비용 또는 등장확률이 변경됐습니다. 다시 확인해주세요.');
  const [ticket]=await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[id,WISH_TICKET]);
  const coinBefore=balanceNumber(user.coin),ticketBefore=balanceNumber(ticket?.quantity??0),s=cfg.settings;
  if(coinBefore<s.coinCost||ticketBefore<s.ticketCost)fail('INSUFFICIENT_BALANCE','코인 또는 소원권이 부족합니다.');
  const [ticketItem]=await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE',[WISH_TICKET]);
  if(Number(ticketItem?.is_active)!==1)fail('TICKET_DISABLED','소원권 사용이 중지되어 있습니다.');
  const reward=selectWishReward(pool,random());let grant=null;
  if(reward?.type==='VEHICLE'){
   const rows=await q(`INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT $1,id,'WISH_LAMP',$2 FROM character_garage_items WHERE id=$3 AND code=$4 AND is_active=1 AND is_public=1 ON CONFLICT(user_id,garage_id) DO NOTHING RETURNING garage_id`,[id,requestId,reward.id,reward.code]);
   if(rows.length!==1)fail('GRANT_FAILED','차량 지급을 확인하지 못해 차감과 지급을 모두 취소했습니다.');grant={garageId:Number(rows[0].garage_id)};
  }else if(reward){
   const rows=await q(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT $1,id,'WISH_LAMP',$2,$2 FROM character_equipment_items WHERE id=$3 AND code=$4 AND is_active=1 AND is_public=1 RETURNING id,equipment_id`,[id,requestId,reward.id,reward.code]);
   if(rows.length!==1)fail('GRANT_FAILED','장비 지급을 확인하지 못해 차감과 지급을 모두 취소했습니다.');grant={instanceId:Number(rows[0].id),equipmentId:Number(rows[0].equipment_id)};
  }
  const coins=await q('UPDATE users SET coin=coin-$2 WHERE id=$1 AND coin>=$2 RETURNING coin',[id,s.coinCost]);
  const tickets=await q('UPDATE cnine_user_inventory SET quantity=quantity-$3,unseen_quantity=LEAST(unseen_quantity,quantity-$3),updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND item_code=$2 AND quantity>=$3 RETURNING quantity',[id,WISH_TICKET,s.ticketCost]);
  if(coins.length!==1||tickets.length!==1||Number(coins[0].coin)!==coinBefore-s.coinCost||Number(tickets[0].quantity)!==ticketBefore-s.ticketCost)fail('DEBIT_FAILED','재화 검증에 실패해 모든 변경을 취소했습니다.');
  await q("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2,$3,$4)",[id,-s.coinCost,coins[0].coin,`핑두의 소원램프:${requestId}`]);
  await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'핑두의 소원램프','WISH_LAMP',$5)",[id,WISH_TICKET,-s.ticketCost,tickets[0].quantity,requestId]);
  const [completed]=await q('SELECT clock_timestamp() AS now');
  if(wishEventPhase(s,Date.parse(completed.now))!=='OPEN')fail('EVENT_CLOSED','이벤트가 종료되어 차감과 지급을 모두 취소했습니다.');
  const result={ok:true,requestId,userId:id,choiceId,revision:cfg.revision,kind:reward?reward.type:'MISS',reward:reward?{key:reward.key,id:reward.id,code:reward.code,name:reward.name,image:reward.image,quantity:1,...grant}:null,coinCost:s.coinCost,ticketCost:s.ticketCost,coin:Number(coins[0].coin),tickets:Number(tickets[0].quantity),completedAt:new Date(completed.now).toISOString(),replayed:false};
  const saved=await q(`INSERT INTO ${TABLE}(request_id,user_id,choice_id,revision,result_json) VALUES($1,$2,$3,$4,$5) RETURNING request_id`,[requestId,id,choiceId,cfg.revision,JSON.stringify(result)]);if(saved.length!==1)fail('RECEIPT_FAILED','소원 기록 저장에 실패해 모든 변경을 취소했습니다.');return result;
 });
}
export async function wishLampAdmin(env,admin,body=null){return tx(env,async q=>{
 await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);const before=await settings(q),items=await catalog(q,true);
 if(body){let next;try{next=cleanWishSettings(body)}catch(e){fail('SETTINGS_INVALID',e.message,400)}
  if((body.revision??null)!==before.revision)fail('REVISION_CONFLICT','다른 관리자가 변경했습니다. 다시 불러오세요.');
  if(next.enabled&&!Object.values(items).every(r=>r.available))fail('CATALOG_INVALID','보상 9종의 활성·공개 상태를 확인해야 합니다.');
  const revision=crypto.randomUUID(),value=JSON.stringify({...next,revision});
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[KEY,value]);
  await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'WISH_LAMP_UPDATE','EVENT',$2,$3,$4)",[admin.id,KEY,JSON.stringify(before.settings),value]);
  return {settings:next,revision,items,complete:wishSettingsComplete(next)};
 }return {settings:before.settings,revision:before.revision,items,complete:wishSettingsComplete(before.settings)};
})}
export async function handleWishLamp({path,request,env,deps}){
 if(!['events/wish-lamp/feature','events/wish-lamp/state','events/wish-lamp/open','admin/wish-lamp'].includes(path))return null;
 const {authenticate,requirePermission,json,readBody}=deps;const adminPath=path==='admin/wish-lamp';
 try{
  if(path==='events/wish-lamp/feature'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first(),s=cleanWishSettings(row?JSON.parse(row.value):{});
   return json({visible:s.visible,name:'핑두의 소원램프',phase:wishEventPhase(s),startsAt:s.startsAt,endsAt:s.endsAt});
  }
  const actor=adminPath?await requirePermission(request,env,'USER_MANAGE'):await authenticate(request,env);
  if(!actor)return json({error:adminPath?'이벤트 관리 권한이 없습니다.':'로그인이 필요합니다.'},adminPath?403:401);
  if(['POST','PATCH'].includes(request.method)){
   const origin=request.headers.get('origin');if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_INVALID','외부 사이트 요청은 허용되지 않습니다.',403);
  }
  if(adminPath&&request.method==='GET')return json(await wishLampAdmin(env,actor));
  if(adminPath&&request.method==='PATCH')return json(await wishLampAdmin(env,actor,await readBody(request)));
  if(path==='events/wish-lamp/state'&&request.method==='GET')return json(await wishLampState(env,actor.id));
  if(path==='events/wish-lamp/open'&&request.method==='POST')return json(await openWishLamp(env,actor.id,await readBody(request)));
  return json({error:'지원하지 않는 요청입니다.'},405);
 }catch(e){if(e instanceof WishError)return json({error:e.message,code:e.code},e.status);console.error('wish_lamp_failed',{path,code:String(e.code||'INTERNAL')});return json({error:'처리가 완료되지 않았습니다. 새로 결제하지 말고 소원 기록을 확인해주세요.',code:'WISH_FAILED'},500)}
}
