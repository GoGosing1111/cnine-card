import {CHUSEOK_KEY,CHUSEOK_COIN,CHUSEOK_ASSETS,CHUSEOK_EVENTS} from '../js/chuseok-model-v1.js';

const TABLE='chuseok_receipts_v1',ready=new WeakMap();
export const CHUSEOK_SCHEMA=`CREATE TABLE IF NOT EXISTS chuseok_receipts_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,event TEXT NOT NULL,choice INTEGER NOT NULL CHECK(choice BETWEEN 0 AND 2),result_json TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_chuseok_user_v1 ON chuseok_receipts_v1(user_id,event,created_at DESC);`;
export const CHUSEOK_ITEM=[CHUSEOK_COIN,'추석 코인','CHUSEOK COIN','송편 고르기와 추석 떡값 이벤트 도전에 사용하는 코인입니다.','EVENT','SPECIAL',CHUSEOK_ASSETS+'chuseok-coin.svg',47];
class ChuseokError extends Error{constructor(code,message,status=409){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>{throw new ChuseokError(code,message,status);};
const safeId=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)fail('INVALID_USER','계정을 다시 확인하세요.',400);return id;};
const quantity=value=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)fail('INVALID_QUANTITY','보유 수량을 확인할 수 없습니다.');return n;};
const requestIdOf=body=>{const id=body?.requestId;if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(id))fail('INVALID_REQUEST','요청 번호를 확인하세요.',400);return id;};
export async function ensureChuseok(env){
 const db=env.DB;if(db?.dialect!=='postgres'||!db.client||typeof db.enqueue!=='function')fail('DATABASE_UNSUPPORTED','이벤트 지급 DB를 확인하세요.',503);
 if(!ready.has(db))ready.set(db,db.enqueue(async()=>{
  const q=async(text,values=[])=>(await db.client.query({text,values})).rows;
  const [installed]=await q(`SELECT to_regclass('public.${TABLE}') AS relation,(SELECT COUNT(*) FROM inventory_items WHERE code=$1) AS items`,[CHUSEOK_COIN]);
  if(installed?.relation&&Number(installed.items)===1)return;
  await q('BEGIN');try{
   await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='15s'");await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CHUSEOK_KEY+':schema']);
   for(const sql of CHUSEOK_SCHEMA.split(';').filter(s=>s.trim()))await q(sql);
   await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,0) ON CONFLICT(code) DO NOTHING',CHUSEOK_ITEM);
   await q('COMMIT');
  }catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
 }).catch(e=>{ready.delete(db);throw e;}));return ready.get(db);
}
async function transaction(env,operation){await ensureChuseok(env);return env.DB.enqueue(async()=>{
 const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;
 await q('BEGIN');try{await q("SET LOCAL TIME ZONE 'UTC'");await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='20s'");const result=await operation(q);await q('COMMIT');return result;}catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
});}
async function balance(q,id){const [user]=await q('SELECT coin FROM users WHERE id=$1',[id]);const [row]=await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[id,CHUSEOK_COIN]);return {coin:String(user?.coin??0),chuseokCoins:quantity(row?.quantity)};}
export async function chuseokState(){fail('EVENT_RETIRED','추석 이벤트가 종료되었습니다.',410);}
export async function drawChuseok(env,userId,body){
 const id=safeId(userId),requestId=requestIdOf(body),event=body.event,choice=body.choice;
 if(!Object.hasOwn(CHUSEOK_EVENTS,event)||!Number.isInteger(choice)||choice<0||choice>2)fail('INVALID_CHOICE','이벤트와 선택 대상을 확인하세요.',400);
 return transaction(env,async q=>{
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['chuseok:'+requestId]);
  const [user]=await q("SELECT id,status,coin FROM users WHERE id=$1 AND (banned_until IS NULL OR banned_until<=sqlite_now()) FOR UPDATE",[id]);if(!user||user.status!=='ACTIVE')fail('USER_INACTIVE','활성 계정만 도전할 수 있습니다.',403);
  const [prior]=await q(`SELECT user_id,event,choice,result_json FROM ${TABLE} WHERE request_id=$1`,[requestId]);
  if(prior){if(Number(prior.user_id)!==id||prior.event!==event||Number(prior.choice)!==choice)fail('REQUEST_CONFLICT','다른 작업에 사용된 요청 번호입니다.');return {...JSON.parse(prior.result_json),...await balance(q,id),replayed:true};}
  fail('EVENT_RETIRED','추석 이벤트가 종료되었습니다.',410);
 });
}
export async function chuseokAdmin(){fail('EVENT_RETIRED','추석 이벤트 CMS는 종료되었습니다.',410);}
export async function handleChuseok({path,request,env,deps}){
 if(!['events/chuseok/feature','events/chuseok/state','events/chuseok/draw','events/chuseok/receipt','admin/chuseok'].includes(path))return null;
 const {authenticate,requirePermission,readBody,json}=deps,admin=path==='admin/chuseok';
 try{
  if(path==='events/chuseok/feature'&&request.method==='GET')return json({visible:false,phase:'RETIRED',replacement:'/events/golden-axe/'});
  const actor=admin?await requirePermission(request,env,'USER_MANAGE'):await authenticate(request,env);if(!actor)return json({error:admin?'이벤트 관리 권한이 없습니다.':'로그인이 필요합니다.'},admin?403:401);
  if(['POST','PATCH'].includes(request.method)){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_INVALID','외부 사이트 요청은 허용되지 않습니다.',403);}
  if(admin&&['GET','PATCH'].includes(request.method))return json(await chuseokAdmin(env,actor,request.method==='PATCH'?await readBody(request):null));
  if(path==='events/chuseok/state'&&request.method==='GET')return json(await chuseokState(env,actor.id));
  if(path==='events/chuseok/draw'&&request.method==='POST')return json(await drawChuseok(env,actor.id,await readBody(request)));
  if(path==='events/chuseok/receipt'&&request.method==='GET'){const id=requestIdOf({requestId:new URL(request.url).searchParams.get('requestId')});await ensureChuseok(env);const row=await env.DB.prepare(`SELECT result_json FROM ${TABLE} WHERE request_id=? AND user_id=?`).bind(id,actor.id).first();return json({found:Boolean(row),result:row?JSON.parse(row.result_json):null});}
  return json({error:'지원하지 않는 요청입니다.'},405);
 }catch(e){if(e instanceof ChuseokError)return json({error:e.message,code:e.code},e.status);console.error(JSON.stringify({event:'chuseok_failed',path,code:String(e.code||'INTERNAL')}));return json({error:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요. 중복으로 차감하지 않습니다.',code:'CHUSEOK_FAILED'},500);}
}
