import {AXE_KEY,OLD_AXE,SUPERSTAR_13,PARTS_CHOICE,AXE_ASSETS,AXE_PARTS,AXE_REWARDS,cleanAxeSettings,axeSettingsComplete,axePhase,pickAxeReward} from '../js/golden-axe-model-v1.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {MERCENARY_ACCOUNTING_SCHEMA,mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';

const TABLE='golden_axe_receipts_v1',ready=new WeakMap();
export const AXE_SCHEMA=`CREATE TABLE IF NOT EXISTS golden_axe_receipts_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,operation TEXT NOT NULL,target TEXT NOT NULL DEFAULT '',result_json TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_golden_axe_user_v1 ON golden_axe_receipts_v1(user_id,operation,created_at DESC);`;
export const AXE_ITEMS=Object.freeze([
    [SUPERSTAR_13,'슈퍼스타 +13 업그레이드 강화권','SUPERSTAR +13','보유한 +0~+12 슈퍼스타 카드 1종을 선택해 +13으로 확정 강화합니다.','EVENT','SUPERSTAR',AXE_ASSETS+'upgrade-13.svg',48],
    [PARTS_CHOICE,'차량부품 150개 선택권','CHOOSE 150 PARTS','타이어·프레임·엔진 부품 중 하나를 선택해 150개를 받습니다.','EVENT','SPECIAL','/assets/ui/workshop/vehicle-part-engine-v1668.png',49]
   ]);
class AxeError extends Error{constructor(code,message,status=409){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>{throw new AxeError(code,message,status);};
const safeId=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)fail('INVALID_USER','계정을 다시 확인하세요.',400);return id;};
const quantity=value=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)fail('INVALID_QUANTITY','아이템 수량을 확인할 수 없습니다.');return n;};
const requestIdOf=body=>{const id=body?.requestId;if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(id))fail('INVALID_REQUEST','요청 번호를 확인하세요.',400);return id;};
// Reuse the canonical mercenary reader/accounting on this transaction's client;
// calling DB.enqueue again here would deadlock or split the payment transaction.
function transactionDB(q,lock=false){return {dialect:'postgres',prepare(source){const make=values=>({source,values,bind:(...args)=>make(args),first:async()=>{let n=0;const rows=await q(source.replace(/\?/g,()=>`$${++n}`)+(lock?' FOR SHARE':''),values);return rows[0]??null;},all:async()=>{let n=0;return {results:await q(source.replace(/\?/g,()=>`$${++n}`)+(lock?' FOR SHARE':''),values)};}});return make([]);}};}
export async function ensureGoldenAxe(env){
 const db=env.DB;if(db?.dialect!=='postgres'||!db.client||typeof db.enqueue!=='function')fail('DATABASE_UNSUPPORTED','이벤트 지급 DB를 확인하세요.',503);
 if(!ready.has(db))ready.set(db,db.enqueue(async()=>{
  const q=async(text,values=[])=>(await db.client.query({text,values})).rows;
  const [installed]=await q(`SELECT to_regclass('public.${TABLE}') AS relation,(SELECT COUNT(*) FROM inventory_items WHERE code=ANY($1::text[])) AS items`,[[SUPERSTAR_13,PARTS_CHOICE]]);
  if(installed?.relation&&Number(installed.items)===2)return;
  await q('BEGIN');try{
   await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='15s'");await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[AXE_KEY+':schema']);
   for(const sql of AXE_SCHEMA.split(';').filter(s=>s.trim()))await q(sql);
   for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await q(sql);
   for(const row of AXE_ITEMS)await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(code) DO NOTHING',row);
   await q('COMMIT');
  }catch(error){try{await q('ROLLBACK');}catch{}throw error;}
 }).catch(error=>{ready.delete(db);throw error;}));return ready.get(db);
}
async function transaction(env,operation){await ensureGoldenAxe(env);return env.DB.enqueue(async()=>{const q=async(text,values=[])=>(await env.DB.client.query({text,values})).rows;await q('BEGIN');try{await q("SET LOCAL TIME ZONE 'UTC'");await q("SET LOCAL lock_timeout='4s'");await q("SET LOCAL statement_timeout='20s'");const result=await operation(q);await q('COMMIT');return result;}catch(error){try{await q('ROLLBACK');}catch{}throw error;}});}
async function readSettings(q,lock=false){const [row]=await q(`SELECT value FROM app_meta WHERE key=$1${lock?' FOR SHARE':''}`,[AXE_KEY]);const raw=row?JSON.parse(row.value):{};return {settings:cleanAxeSettings(raw),revision:raw.revision??null};}
async function catalog(q,lock=false){
 const equipment=await q(`SELECT id,code,name,image_url,is_active,is_public,slot FROM character_equipment_items WHERE code=ANY($1::text[])${lock?' FOR SHARE':''}`,[AXE_REWARDS.filter(r=>r.kind==='EQUIPMENT').map(r=>r.code)]);
 const items=await q(`SELECT code,is_active FROM inventory_items WHERE code=ANY($1::text[])${lock?' FOR SHARE':''}`,[AXE_REWARDS.filter(r=>r.kind==='ITEM').map(r=>r.code)]);
 let mercenaries=[];const [schema]=await q("SELECT to_regclass('public.mercenary_cms_documents_v1') AS relation");
 if(schema?.relation){const {document}=await readMercenaryDocument({DB:transactionDB(q,lock)});mercenaries=document.mercenaries.filter(m=>m.rank==='S').flatMap(m=>{const art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===m.code);return art?[{code:m.code,name:m.name,rank:'S',image:art.sourceArt}]:[];});}
 return {mercenaries,rewards:AXE_REWARDS.map(reward=>{let available=true,extra={};if(reward.kind==='EQUIPMENT'){const row=equipment.find(e=>e.code===reward.code);available=Boolean(row&&Number(row.is_active)===1&&Number(row.is_public)===1&&row.slot==='BATTLE_SUIT');if(row)extra={id:Number(row.id),image:String(row.image_url||reward.image).replace(/^(?!https?:|\/)/,'/')};}else if(reward.kind==='ITEM')available=items.some(i=>i.code===reward.code&&Number(i.is_active)===1);else if(reward.kind==='MERCENARY')available=mercenaries.length>0;return {...reward,...extra,available};})};
}
async function quoteFor(config,data){const raw=JSON.stringify({revision:config.revision,rewards:data.rewards.map(r=>[r.key,r.id??null,r.available]),mercenaries:data.mercenaries.map(m=>[m.code,m.rank])});const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
async function balances(q,id){const [user]=await q('SELECT coin FROM users WHERE id=$1',[id]);const rows=await q('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=ANY($2::text[])',[id,[OLD_AXE,SUPERSTAR_13,PARTS_CHOICE]]);const count=code=>quantity(rows.find(r=>r.item_code===code)?.quantity);return {coin:String(user?.coin??0),axes:count(OLD_AXE),upgradeTickets:count(SUPERSTAR_13),partsTickets:count(PARTS_CHOICE)};}
async function dailyCount(q,id,now){const [row]=await q(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE user_id=$1 AND operation='DRAW' AND created_at>=date_trunc('day',$2::timestamptz AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'`,[id,now]);return Number(row.n);}
export async function goldenAxeState(env,userId){return transaction(env,async q=>{const id=safeId(userId),config=await readSettings(q),data=await catalog(q),[clock]=await q('SELECT clock_timestamp() AS now'),history=await q(`SELECT result_json FROM ${TABLE} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[id]);return {userId:id,revision:config.revision,quote:await quoteFor(config,data),phase:axePhase(config.settings,Date.parse(clock.now)),serverNow:new Date(clock.now).toISOString(),...config.settings,...await balances(q,id),dailyUsed:await dailyCount(q,id,clock.now),rewards:data.rewards.map(r=>({...r,rate:config.settings.rates[r.key]})),history:history.map(r=>JSON.parse(r.result_json))};});}
async function lockRequest(q,id,requestId,operation,target=''){
 await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`golden-axe:${requestId}`]);const [user]=await q("SELECT id,status,coin FROM users WHERE id=$1 AND (banned_until IS NULL OR banned_until<=sqlite_now()) FOR UPDATE",[id]);if(!user||user.status!=='ACTIVE')fail('USER_INACTIVE','활성 계정만 참여할 수 있습니다.',403);
 const [prior]=await q(`SELECT user_id,operation,target,result_json FROM ${TABLE} WHERE request_id=$1`,[requestId]);if(prior){if(Number(prior.user_id)!==id||prior.operation!==operation||prior.target!==target)fail('REQUEST_CONFLICT','다른 작업에 사용된 요청 번호입니다.');return {prior:{...JSON.parse(prior.result_json),...await balances(q,id),replayed:true}};}return {user};
}
async function inventoryChange(q,id,code,amount,requestId,reason){
 let rows;if(amount<0)rows=await q('UPDATE cnine_user_inventory SET quantity=quantity+$3,unseen_quantity=LEAST(unseen_quantity,quantity+$3),updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND item_code=$2 AND quantity>=-($3::bigint) RETURNING quantity',[id,code,amount]);
 else rows=await q('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at) SELECT $1,code,$3,$3,CURRENT_TIMESTAMP FROM inventory_items WHERE code=$2 AND is_active=1 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP RETURNING quantity',[id,code,amount]);
 if(rows.length!==1)fail('INVENTORY_CHANGED',amount<0?'보유 아이템이 부족합니다.':'상품 지급을 확인하지 못했습니다. 차감과 지급을 취소했습니다.');
 const after=quantity(rows[0].quantity);await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,'GOLDEN_AXE',$6)",[id,code,amount,after,reason,requestId]);return after;
}
async function saveReceipt(q,result){const rows=await q(`INSERT INTO ${TABLE}(request_id,user_id,operation,target,result_json) VALUES($1,$2,$3,$4,$5) RETURNING request_id`,[result.requestId,result.userId,result.operation,result.target||'',JSON.stringify(result)]);if(rows.length!==1)fail('RECEIPT_FAILED','결과를 저장하지 못해 차감과 지급을 취소했습니다.');return result;}
// Permanent retirement gate. Only completed historical requests may replay.
export async function drawGoldenAxe(env,userId,body){
 const id=safeId(userId),requestId=requestIdOf(body);
 return transaction(env,async q=>{const {prior}=await lockRequest(q,id,requestId,'DRAW');if(prior)return prior;fail('EVENT_RETIRED','도끼 이벤트가 종료되었습니다. 낡은도끼는 사용할 수 없습니다.',410);});
}
export async function goldenAxeItemOptions(env,userId,itemCode){if(![SUPERSTAR_13,PARTS_CHOICE].includes(itemCode))fail('INVALID_ITEM','아이템을 확인하세요.',400);return transaction(env,async q=>({itemCode,...await balances(q,safeId(userId)),choices:itemCode===PARTS_CHOICE?AXE_PARTS:await q("SELECT c.id AS code,c.title AS name,c.image_url AS image,uc.breakthrough_level AS level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=$1 AND uc.quantity>0 AND uc.breakthrough_level BETWEEN 0 AND 12 AND c.rarity='SUPERSTAR' AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' ORDER BY c.title",[safeId(userId)])}));}
export async function useGoldenAxeItem(env,userId,body){
 const id=safeId(userId),requestId=requestIdOf(body),itemCode=body.itemCode,target=String(body.target||'');if(![SUPERSTAR_13,PARTS_CHOICE].includes(itemCode)||!target||target.length>100)fail('INVALID_ITEM','사용할 아이템과 대상을 선택하세요.',400);
 return transaction(env,async q=>{const {prior}=await lockRequest(q,id,requestId,itemCode,target);if(prior)return prior;const [item]=await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE',[itemCode]);if(Number(item?.is_active)!==1)fail('ITEM_DISABLED','이 아이템은 사용이 중지되어 있습니다.');let reward;
  if(itemCode===PARTS_CHOICE){const part=AXE_PARTS.find(p=>p.code===target);if(!part)fail('INVALID_TARGET','차량 부품 종류를 선택하세요.',400);await inventoryChange(q,id,part.code,150,requestId,'차량부품 150개 선택권 사용');reward={...part,quantity:150,kind:'ITEM'};}
  else{
   const [card]=await q("SELECT uc.card_id,uc.quantity,uc.breakthrough_level,uc.breakthrough_fail_count,c.title,c.image_url,c.rarity,c.is_active,c.card_status FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=$1 AND uc.card_id=$2 FOR UPDATE OF uc",[id,target]);
   if(!card||Number(card.quantity)<1||card.rarity!=='SUPERSTAR'||Number(card.is_active)!==1||(card.card_status??'PUBLIC')!=='PUBLIC'||Number(card.breakthrough_level)<0||Number(card.breakthrough_level)>=13)fail('INVALID_TARGET','보유한 +0~+12 슈퍼스타 카드만 강화할 수 있습니다.');
   const rows=await q('UPDATE user_cards SET breakthrough_level=13,breakthrough_fail_count=0 WHERE user_id=$1 AND card_id=$2 AND quantity>0 AND breakthrough_level=$3 AND breakthrough_level<13 RETURNING card_id',[id,target,card.breakthrough_level]);if(rows.length!==1)fail('CARD_CHANGED','카드 상태가 변경되어 강화권을 사용하지 않았습니다.');reward={code:target,name:card.title,image:card.image_url,kind:'UPGRADE',beforeLevel:Number(card.breakthrough_level),level:13,quantity:1};
  }
  await inventoryChange(q,id,itemCode,-1,requestId,'금도끼 은도끼 상품 사용');return saveReceipt(q,{ok:true,requestId,userId:id,operation:itemCode,target,kind:reward.kind,reward,...await balances(q,id),completedAt:new Date().toISOString(),replayed:false});
 });
}
export async function goldenAxeAdmin(){fail('EVENT_RETIRED','도끼 이벤트 CMS는 종료되었습니다. 추석 달빛 잔치 CMS를 사용하세요.',410);}
export async function handleGoldenAxe({path,request,env,deps}){
 if(!['events/golden-axe/feature','events/golden-axe/state','events/golden-axe/draw','events/golden-axe/receipt','events/golden-axe/item-options','events/golden-axe/use-item','admin/golden-axe'].includes(path))return null;
 const {authenticate,requirePermission,readBody,json}=deps,admin=path==='admin/golden-axe';try{
  if(path==='events/golden-axe/feature'&&request.method==='GET')return json({visible:false,enabled:false,phase:'RETIRED',replacement:'/events/chuseok/'});
  const actor=admin?await requirePermission(request,env,'USER_MANAGE'):await authenticate(request,env);if(!actor)return json({error:admin?'이벤트 관리 권한이 없습니다.':'로그인이 필요합니다.'},admin?403:401);
  if(['POST','PATCH'].includes(request.method)){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_INVALID','외부 사이트 요청은 허용되지 않습니다.',403);}
  if(admin&&['GET','PATCH'].includes(request.method))return json(await goldenAxeAdmin(env,actor,request.method==='PATCH'?await readBody(request):null));
  if(path==='events/golden-axe/state'&&request.method==='GET')return json({error:'도끼 이벤트가 종료되었습니다.',code:'EVENT_RETIRED',replacement:'/events/chuseok/'},410);
  if(path==='events/golden-axe/draw'&&request.method==='POST')return json(await drawGoldenAxe(env,actor.id,await readBody(request)));
  if(path==='events/golden-axe/item-options'&&request.method==='GET')return json(await goldenAxeItemOptions(env,actor.id,new URL(request.url).searchParams.get('itemCode')));
  if(path==='events/golden-axe/use-item'&&request.method==='POST')return json(await useGoldenAxeItem(env,actor.id,await readBody(request)));
  if(path==='events/golden-axe/receipt'&&request.method==='GET'){const requestId=requestIdOf({requestId:new URL(request.url).searchParams.get('requestId')});await ensureGoldenAxe(env);const row=await env.DB.prepare(`SELECT result_json FROM ${TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,actor.id).first();return json({found:Boolean(row),result:row?JSON.parse(row.result_json):null});}
  return json({error:'지원하지 않는 요청입니다.'},405);
 }catch(error){if(error instanceof AxeError)return json({error:error.message,code:error.code},error.status);console.error('golden_axe_failed',{path,code:String(error.code||'INTERNAL')});return json({error:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요. 중복으로 차감하지 않습니다.',code:'AXE_FAILED'},500);}
}
