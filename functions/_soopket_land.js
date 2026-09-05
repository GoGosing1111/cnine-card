import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';
// Streamer event rewards are committed before the client starts its pachinko show.
// No daily allowance, client-side prize selection, or nickname-based ongoing access.
export const LAND_TICKET='SOOPKETLAND_TICKET';
export const HYPER_TICKET='SOOPKETLAND_HYPER_BURNING_TICKET';
export const LAND_IYEJUN_PRIZE='IYEJUN_CARD';
export const LAND_IYEJUN_CARD_ID='CN-346F8DB0DEB84D41';
export const LAND_STREAMERS=Object.freeze(['진짜디임','조은','오리꿍','강구열','하이희야♡']);
export const LAND_PRIZES=Object.freeze([
  {key:'COIN',label:'코인',range:'1억 ~ 20억',min:1,max:20,unit:100000000,symbol:'C',color:0xffd477},
  {key:'HIGH_GRADE_REROLL_TICKET',label:'고등급 재뽑기권',range:'1개',min:1,max:1,unit:1,symbol:'R',color:0xdbb8ff},
  {key:'MASTER_STAR',label:'마스터의 별',range:'1,000 ~ 15,000개',min:1,max:15,unit:1000,symbol:'S',color:0xffe7a6},
  {key:'BLACK_MIRACLE_PACK',label:'블랙미라클 카드',range:'1 ~ 10개',min:1,max:10,unit:1,symbol:'B',color:0xbc91ff},
  {key:HYPER_TICKET,label:'하이퍼버닝 발동권',range:'서버 전체 ×15 · 60분',min:1,max:1,unit:1,symbol:'15',color:0xff8059},
  {key:'ZENITH_RANDOM_CARD',label:'제니스 랜덤카드',range:'1 ~ 3장',min:1,max:3,unit:1,symbol:'Z',color:0x90ebff},
  {key:'FUR_RANDOM_CARD',label:'FUR 랜덤카드',range:'1 ~ 5장',min:1,max:5,unit:1,symbol:'F',color:0xffb5d9},
  {key:LAND_IYEJUN_PRIZE,label:'이예준 카드',range:'1장',min:1,max:1,unit:1,symbol:'Y',color:0xff916f}
]);
const SCHEMA='soopketland_schema_v2039',SETTINGS='soopketland_settings_v2039';
const BURNING=['burning_event_settings_v1','hyper_burning_event_settings_v1310'];
const defaults=()=>({weights:Object.fromEntries(LAND_PRIZES.map(p=>[p.key,p.key===LAND_IYEJUN_PRIZE?210:970]))});
const parse=(value,fallback=null)=>{try{return JSON.parse(value)}catch{return fallback}};
const fail=(message,status=400,code='LAND_INVALID')=>Object.assign(new Error(message),{status,code});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{8,100}$/.test(value);
const safeInt=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const owner=user=>user?.role==='OWNER'&&user?.status==='ACTIVE';
const active=user=>user?.status==='ACTIVE'&&(!user.banned_until||Date.parse(/Z$|[+-]\d\d:\d\d$/.test(String(user.banned_until))?user.banned_until:String(user.banned_until).replace(' ','T')+'Z')<=Date.now());
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const now=()=>new Date().toISOString();

export function secureLandInt(max){
  if(!safeInt(max,1,0xffffffff))throw new Error('Invalid random bound');
  const bytes=new Uint32Array(1),limit=Math.floor(0x100000000/max)*max;
  do{crypto.getRandomValues(bytes)}while(bytes[0]>=limit);
  return bytes[0]%max;
}
export function validateLandWeights(raw){
  if(!raw||Object.keys(raw).length!==LAND_PRIZES.length||LAND_PRIZES.some(p=>!safeInt(raw[p.key],0,10000)))throw fail('각 보상 가중치는 0~10,000의 정수로 설정하세요.');
  if(!Object.values(raw).some(n=>n>0))throw fail('최소 한 종류의 보상을 활성화하세요.');
  return Object.fromEntries(LAND_PRIZES.map(p=>[p.key,raw[p.key]]));
}
// A rolling deployment must keep the existing seven-prize setting usable until
// the separately audited 3% activation is committed. OWNER saves require all eight.
export function storedLandWeights(raw){
  return validateLandWeights(raw&&!Object.hasOwn(raw,LAND_IYEJUN_PRIZE)?{...raw,[LAND_IYEJUN_PRIZE]:0}:raw);
}
export function pickLandPrize(weights,random=secureLandInt){
  const total=Object.values(weights).reduce((a,b)=>a+b,0);let roll=random(total);
  for(const p of LAND_PRIZES){roll-=weights[p.key];if(roll<0){const amount=(p.min+random(p.max-p.min+1))*p.unit;return {...p,amount,jackpot:p.key===HYPER_TICKET||p.key.endsWith('_CARD')||amount===p.max*p.unit&&p.min!==p.max}}}
  throw new Error('Invalid prize weights');
}

export async function ensureLand(db,env={DB:db}){
  if(readRuntimeData(env,SCHEMA))return;
  if((await one(db,'SELECT value FROM app_meta WHERE key=?',SCHEMA))?.value==='1'){cacheRuntimeData(env,SCHEMA,true,1800000);return;}
  const uid=db.dialect==='postgres'?'BIGINT':'INTEGER';
  const ddl=[
    `CREATE TABLE IF NOT EXISTS soopketland_accounts(slot TEXT PRIMARY KEY,user_id ${uid} NOT NULL UNIQUE,bound_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS soopketland_ticket_lots(id TEXT PRIMARY KEY,user_id ${uid} NOT NULL,issued_by ${uid} NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),remaining INTEGER NOT NULL CHECK(remaining>=0),coupon_uses INTEGER NOT NULL CHECK(coupon_uses BETWEEN 1 AND 1000),plan_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS soopketland_rolls(request_id TEXT PRIMARY KEY,user_id ${uid} NOT NULL,lot_id TEXT NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS soopketland_coupons(code TEXT PRIMARY KEY,issuer_id ${uid} NOT NULL,request_id TEXT NOT NULL UNIQUE,reward_json TEXT NOT NULL,max_uses INTEGER NOT NULL CHECK(max_uses>0),used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count>=0 AND used_count<=max_uses),is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS soopketland_redemptions(code TEXT NOT NULL,user_id ${uid} NOT NULL,operation_key TEXT NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(code,user_id))`,
    `CREATE TABLE IF NOT EXISTS soopketland_actions(request_id TEXT PRIMARY KEY,user_id ${uid} NOT NULL,action TEXT NOT NULL,plan_json TEXT NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
    'CREATE TABLE IF NOT EXISTS soopketland_atomic_guard(id TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1))',
    'CREATE INDEX IF NOT EXISTS idx_soopketland_lots_user ON soopketland_ticket_lots(user_id,created_at)',
    'CREATE INDEX IF NOT EXISTS idx_soopketland_rolls_user ON soopketland_rolls(user_id,created_at)'
  ];
  if(db.dialect==='postgres')await db.execSchema(ddl);else await db.batch(ddl.map(sql=>db.prepare(sql)));
  await db.batch([
    stmt(db,"INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",SETTINGS,JSON.stringify(defaults())),
    ...[
      [LAND_TICKET,'숲켓랜드 이용권','STREAMER EVENT PASS','OWNER가 지급하는 방송 이벤트 전용 이용권. 숲켓랜드에서 1개를 사용합니다.','assets/ui/soopketland/event-ticket-v1.svg'],
      [HYPER_TICKET,'하이퍼버닝 발동권 ×15','SERVER HYPER BURNING','스트리머가 사용하면 서버 전체에 ×15 하이퍼버닝이 60분간 적용됩니다. 기존 버닝 진행 중에는 사용할 수 없습니다.','assets/ui/soopketland/hyper-ticket-v1.svg']
    ].map(([code,name,subtitle,description,image])=>stmt(db,"INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,'ENTRY_TICKET','SPECIAL',?,125,1) ON CONFLICT(code) DO NOTHING",code,name,subtitle,description,image)),
    stmt(db,"INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",SCHEMA)
  ]);
}

// Initial exact-name lookup may only run on an OWNER visit. Once bound, renaming
// an account neither grants access to a new user nor removes the original ID.
async function bindAccounts(db){
  if(Number((await one(db,'SELECT COUNT(*) n FROM soopketland_accounts'))?.n)===LAND_STREAMERS.length)return;
  for(const slot of LAND_STREAMERS)await stmt(db,`INSERT INTO soopketland_accounts(slot,user_id,bound_at) SELECT ?,id,? FROM users WHERE nickname=? AND status='ACTIVE' AND (SELECT COUNT(*) FROM users WHERE nickname=?)=1 AND NOT EXISTS(SELECT 1 FROM soopketland_accounts a WHERE a.user_id=users.id) ON CONFLICT(slot) DO NOTHING`,slot,now(),slot,slot).run();
}
export async function landAccess(db,user,env={DB:db}){
  if(!active(user))return {allowed:false,isOwner:false};
  if(owner(user))return {allowed:true,isOwner:true};
  if(!readRuntimeData(env,SCHEMA)){
    if((await one(db,'SELECT value FROM app_meta WHERE key=?',SCHEMA))?.value!=='1')return {allowed:false,isOwner:false};
    cacheRuntimeData(env,SCHEMA,true,1800000);
  }
  return {allowed:!!(await one(db,'SELECT user_id FROM soopketland_accounts WHERE user_id=?',user.id)),isOwner:false};
}
function guard(db,list,condition,args=[]){
  const id=crypto.randomUUID();
  list.push(stmt(db,`INSERT INTO soopketland_atomic_guard(id,verified) SELECT ?,CASE WHEN ${condition} THEN 1 ELSE 0 END`,id,...args),stmt(db,'DELETE FROM soopketland_atomic_guard WHERE id=?',id));
}
function lockUser(db,list,id){if(db.dialect==='postgres')list.push(stmt(db,'SELECT id FROM users WHERE id=? FOR UPDATE',id))}
function guardUser(db,list,id,onlyOwner=false){
  guard(db,list,`EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=CURRENT_TIMESTAMP) AND ${onlyOwner?"u.role='OWNER'":"(u.role='OWNER' OR EXISTS(SELECT 1 FROM soopketland_accounts a WHERE a.user_id=u.id))"})`,[id]);
}
function inventoryGrant(db,list,userId,code,quantity,reference){
  guard(db,list,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[code]);
  list.push(stmt(db,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',userId,code,quantity,quantity));
  inventoryLog(db,list,userId,code,quantity,reference);
}
function inventoryLog(db,list,userId,code,quantity,reference){list.push(stmt(db,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'SOOPKETLAND','EVENT',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",userId,code,quantity,reference,userId,code))}
function inventoryDebit(db,list,userId,code,reference){
  if(db.dialect==='postgres')list.push(stmt(db,'SELECT item_code FROM cnine_user_inventory WHERE user_id=? AND item_code=? FOR UPDATE',userId,code));
  guard(db,list,'EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)',[userId,code]);
  list.push(stmt(db,'UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=MIN(unseen_quantity,quantity-1),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=?',userId,code));inventoryLog(db,list,userId,code,-1,reference);
}
function message(db,list,userId,title,body,code,ref){list.push(stmt(db,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,coupon_code,campaign_key) VALUES(?,'SYSTEM',?,?,'SOOPKETLAND_COUPON',?,?)",userId,title,body,code,`soopketland:${ref}`))}
function actionReceipt(db,list,user,id,action,plan,response){list.push(stmt(db,'INSERT INTO soopketland_actions(request_id,user_id,action,plan_json,response_json,created_at) VALUES(?,?,?,?,?,?)',id,user.id,action,JSON.stringify(plan),JSON.stringify(response),now()))}
async function replayAction(db,user,id,action,plan){
  const row=await one(db,'SELECT * FROM soopketland_actions WHERE request_id=?',id);if(!row)return null;
  if(Number(row.user_id)!==Number(user.id)||row.action!==action||row.plan_json!==JSON.stringify(plan))throw fail('같은 요청 번호를 다른 작업에 사용할 수 없습니다.',409,'LAND_REQUEST_MISMATCH');
  return {...parse(row.response_json),replayed:true};
}
async function commit(db,list,replay){
  try{await db.batch(list)}catch(error){const prior=await replay();if(prior)return prior;if(/CHECK|verified|deadlock|serialize/i.test(String(error?.message)))throw fail('상태가 변경되어 처리하지 않았습니다. 같은 요청으로 다시 확인하세요.',409,'LAND_STATE_CHANGED');throw error}
  return null;
}
async function state(db,user,access){
  const settingsRow=await one(db,'SELECT value FROM app_meta WHERE key=?',SETTINGS),settings=parse(settingsRow?.value,defaults());
  settings.weights=storedLandWeights(settings.weights);
  const tickets=await one(db,'SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,LAND_TICKET);
  const lots=await rows(db,'SELECT coupon_uses,remaining FROM soopketland_ticket_lots WHERE user_id=? AND remaining>0 ORDER BY created_at,id',user.id);
  const history=await rows(db,'SELECT response_json,created_at FROM soopketland_rolls WHERE user_id=? ORDER BY created_at DESC LIMIT 30',user.id);
  const total=Object.values(settings.weights).reduce((a,b)=>a+b,0);
  return {access,tickets:Math.min(Number(tickets?.quantity||0),lots.reduce((n,l)=>n+Number(l.remaining),0)),nextCouponUses:Number(lots[0]?.coupon_uses||0),prizes:LAND_PRIZES.map(p=>({...p,weight:settings.weights[p.key],percent:settings.weights[p.key]/total*100})),history:history.map(r=>({...parse(r.response_json),createdAt:r.created_at})),
    ...(access.isOwner?{owner:{accounts:await rows(db,'SELECT a.slot,a.user_id,u.nickname,u.status,COALESCE(i.quantity,0) tickets FROM soopketland_accounts a JOIN users u ON u.id=a.user_id LEFT JOIN cnine_user_inventory i ON i.user_id=a.user_id AND i.item_code=?',LAND_TICKET),missing:[],self:{id:Number(user.id),nickname:user.nickname},weights:settings.weights,coupons:await rows(db,'SELECT code,issuer_id,reward_json,max_uses,used_count,is_active,created_at FROM soopketland_coupons ORDER BY created_at DESC LIMIT 40')}}:{})};
}

export async function handleSoopketLand({path,request,env,deps}){
  if(!path.startsWith('soopketland/'))return null;
  const db=env.DB,user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  try{
    const access=await landAccess(db,user,env);
    if(path==='soopketland/access'&&request.method==='GET')return deps.json(access);
    if(!access.allowed)throw fail('등록된 스트리머 계정과 OWNER만 이용할 수 있습니다.',403,'LAND_FORBIDDEN');
    await ensureLand(db,env);
    if(path==='soopketland/state'&&request.method==='GET'){
      if(access.isOwner)await bindAccounts(db);
      const result=await state(db,user,access);if(result.owner)result.owner.missing=LAND_STREAMERS.filter(name=>!result.owner.accounts.some(a=>a.slot===name));return deps.json(result);
    }
    if(request.method!=='POST')throw fail('지원하지 않는 요청입니다.',405);
    const body=await deps.readBody(request);if(!validId(body.requestId))throw fail('요청 번호를 확인하세요.');
    if(path==='soopketland/spin')return deps.json(await spin(db,user,body));
    if(path==='soopketland/hyper/activate')return deps.json(await activateHyper(db,user,body,deps));
    if(!access.isOwner)throw fail('OWNER만 설정하거나 이용권을 지급할 수 있습니다.',403);
    if(path==='soopketland/grant')return deps.json(await grant(db,user,body));
    if(path==='soopketland/settings'){
      const plan={weights:validateLandWeights(body.weights)},prior=await replayAction(db,user,body.requestId,'SETTINGS',plan);if(prior)return deps.json(prior);
      const response={ok:true,message:'보상 가중치를 저장했습니다.'},list=[];lockUser(db,list,user.id);guardUser(db,list,user.id,true);
      list.push(stmt(db,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(plan),SETTINGS));actionReceipt(db,list,user,body.requestId,'SETTINGS',plan,response);
      return deps.json(await commit(db,list,()=>replayAction(db,user,body.requestId,'SETTINGS',plan))||response);
    }
    if(path==='soopketland/coupon/disable'){
      const plan={code:String(body.code||'')};if(!/^SLD-[A-F0-9]{24}$/.test(plan.code))throw fail('쿠폰 코드가 올바르지 않습니다.');
      const prior=await replayAction(db,user,body.requestId,'DISABLE',plan);if(prior)return deps.json(prior);
      const response={ok:true,message:'쿠폰의 추가 사용을 중지했습니다.'},list=[];lockUser(db,list,user.id);guardUser(db,list,user.id,true);
      guard(db,list,'EXISTS(SELECT 1 FROM soopketland_coupons WHERE code=?)',[plan.code]);
      list.push(stmt(db,'UPDATE soopketland_coupons SET is_active=0 WHERE code=?',plan.code));actionReceipt(db,list,user,body.requestId,'DISABLE',plan,response);
      return deps.json(await commit(db,list,()=>replayAction(db,user,body.requestId,'DISABLE',plan))||response);
    }
    throw fail('지원하지 않는 요청입니다.',404);
  }catch(error){if(error.status)return deps.json({error:error.message,code:error.code},error.status);throw error}
}

async function grant(db,user,body){
  const plan={userId:body.userId,quantity:body.quantity,couponUses:body.couponUses};
  if(!safeInt(plan.userId,1,Number.MAX_SAFE_INTEGER)||!safeInt(plan.quantity,1,1000)||!safeInt(plan.couponUses,1,1000))throw fail('대상 계정, 이용권 1~1,000개, 쿠폰 사용 인원 1~1,000명을 입력하세요.');
  const prior=await replayAction(db,user,body.requestId,'GRANT',plan);if(prior)return prior;
  const target=await one(db,'SELECT * FROM users WHERE id=?',plan.userId);
  if(!(await landAccess(db,target)).allowed)throw fail('등록된 스트리머 또는 OWNER에게만 지급할 수 있습니다.',403);
  const response={ok:true,...plan,message:`${target.nickname}에게 이용권 ${plan.quantity}개를 지급했습니다.`},list=[];
  for(const id of [...new Set([user.id,plan.userId])].sort((a,b)=>a-b))lockUser(db,list,id);
  guardUser(db,list,user.id,true);guardUser(db,list,plan.userId);
  list.push(stmt(db,'INSERT INTO soopketland_ticket_lots(id,user_id,issued_by,quantity,remaining,coupon_uses,plan_json,created_at) VALUES(?,?,?,?,?,?,?,?)',body.requestId,plan.userId,user.id,plan.quantity,plan.quantity,plan.couponUses,JSON.stringify(plan),now()));
  inventoryGrant(db,list,plan.userId,LAND_TICKET,plan.quantity,body.requestId);
  message(db,list,plan.userId,'숲켓랜드 이용권 도착',`OWNER가 이용권 ${plan.quantity}개를 지급했습니다. 당첨 쿠폰은 각 ${plan.couponUses}명이 사용할 수 있습니다. 행정부 → 숲켓랜드에서 이용하세요.`,null,body.requestId);
  actionReceipt(db,list,user,body.requestId,'GRANT',plan,response);
  return await commit(db,list,()=>replayAction(db,user,body.requestId,'GRANT',plan))||response;
}
async function spin(db,user,body){
  const read=async()=>{const r=await one(db,'SELECT user_id,response_json FROM soopketland_rolls WHERE request_id=?',body.requestId);if(!r)return null;if(Number(r.user_id)!==Number(user.id))throw fail('다른 계정의 요청 번호입니다.',409);return {...parse(r.response_json),replayed:true}};
  const prior=await read();if(prior)return prior;
  const lot=await one(db,'SELECT * FROM soopketland_ticket_lots WHERE user_id=? AND remaining>0 ORDER BY created_at,id LIMIT 1',user.id);
  if(!lot)throw fail('OWNER가 지급한 이용권이 필요합니다.',409,'LAND_NO_TICKET');
  const cfg=await one(db,'SELECT value FROM app_meta WHERE key=?',SETTINGS),prize=pickLandPrize(storedLandWeights(parse(cfg?.value)?.weights));
  // The original request explicitly reserves Hyper Burning activation to the streamer.
  const direct=prize.key===HYPER_TICKET;
  const code=direct?null:`SLD-${crypto.randomUUID().replaceAll('-','').slice(0,24).toUpperCase()}`;
  const response={ok:true,requestId:body.requestId,prize,delivery:direct?'STREAMER_INVENTORY':'VIEWER_COUPON',code,couponUses:direct?0:Number(lot.coupon_uses)};
  const list=[];lockUser(db,list,user.id);guardUser(db,list,user.id);
  if(db.dialect==='postgres')list.push(stmt(db,'SELECT id FROM soopketland_ticket_lots WHERE id=? FOR UPDATE',lot.id));
  guard(db,list,'EXISTS(SELECT 1 FROM soopketland_ticket_lots WHERE id=? AND user_id=? AND remaining>0) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[lot.id,user.id,SETTINGS,cfg.value]);
  inventoryDebit(db,list,user.id,LAND_TICKET,body.requestId);
  list.push(stmt(db,'UPDATE soopketland_ticket_lots SET remaining=remaining-1 WHERE id=?',lot.id));
  if(direct)inventoryGrant(db,list,user.id,HYPER_TICKET,1,body.requestId);
  else list.push(stmt(db,'INSERT INTO soopketland_coupons(code,issuer_id,request_id,reward_json,max_uses,created_at) VALUES(?,?,?,?,?,?)',code,user.id,body.requestId,JSON.stringify(prize),lot.coupon_uses,now()));
  list.push(stmt(db,'INSERT INTO soopketland_rolls(request_id,user_id,lot_id,response_json,created_at) VALUES(?,?,?,?,?)',body.requestId,user.id,lot.id,JSON.stringify(response),now()));
  message(db,list,user.id,`숲켓랜드 · ${prize.label} 당첨`,direct?'하이퍼버닝 발동권 1개가 인벤토리에 지급되었습니다. 사용 시 서버 전체 ×15 · 60분.':`${prize.label} ${prize.amount.toLocaleString('ko-KR')}${prize.key==='COIN'?'코인':prize.key.endsWith('_CARD')?'장':'개'} · 시청자 공유용 쿠폰입니다. 선착순 ${lot.coupon_uses}명, 계정당 1회. 메시지의 코드를 복사해 방송에서 공유하세요.`,code,body.requestId);
  return await commit(db,list,read)||response;
}

export async function redeemLandCoupon({env,user,body,deps}){
  const code=String(body.code||'').trim().toUpperCase().replace(/\s+/g,'');if(!code.startsWith('SLD-'))return null;
  const db=env.DB;
  try{
    await ensureLand(db);
    const operationKey=String(body.operationKey||'');if(!validId(operationKey))throw fail('쿠폰 요청 번호가 올바르지 않습니다.');
    const read=async()=>{const r=await one(db,'SELECT operation_key,response_json FROM soopketland_redemptions WHERE code=? AND user_id=?',code,user.id);if(!r)return null;if(r.operation_key!==operationKey)throw fail('이미 사용한 쿠폰입니다.',409,'LAND_ALREADY_REDEEMED');return {...parse(r.response_json),replayed:true}};
    const finish=async result=>{const fresh=await one(db,'SELECT * FROM users WHERE id=?',user.id);return deps.json({...result,user:await deps.profile(env,fresh)})};
    const prior=await read();if(prior)return finish(prior);
    const coupon=await one(db,'SELECT * FROM soopketland_coupons WHERE code=?',code);
    if(!coupon||!Number(coupon.is_active))throw fail('존재하지 않거나 중지된 숲켓랜드 쿠폰입니다.',404);
    if(Number(coupon.used_count)>=Number(coupon.max_uses))throw fail('쿠폰 사용 인원이 모두 마감되었습니다.',409,'LAND_COUPON_EXHAUSTED');
    const prize=parse(coupon.reward_json),spec=LAND_PRIZES.find(p=>p.key===prize?.key);
    if(!spec||prize.key===HYPER_TICKET||!safeInt(prize.amount,spec.min*spec.unit,spec.max*spec.unit)||prize.amount%spec.unit)throw fail('쿠폰 보상 설정을 확인해야 합니다.',409);
    const list=[];lockUser(db,list,user.id);
    if(db.dialect==='postgres')list.push(stmt(db,'SELECT code FROM soopketland_coupons WHERE code=? FOR UPDATE',code));
    guard(db,list,"EXISTS(SELECT 1 FROM users WHERE id=? AND status='ACTIVE' AND (banned_until IS NULL OR banned_until<=CURRENT_TIMESTAMP))",[user.id]);
    guard(db,list,'EXISTS(SELECT 1 FROM soopketland_coupons WHERE code=? AND is_active=1 AND used_count<max_uses)',[code]);
    let card=null,cards=[];
    if(prize.key==='COIN'){
      list.push(stmt(db,'UPDATE users SET coin=coin+? WHERE id=?',prize.amount,user.id),stmt(db,"INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'SOOPKETLAND_COUPON' FROM users WHERE id=?",user.id,prize.amount,user.id));
    }else if(prize.key.endsWith('_CARD')){
      const fixed=prize.key===LAND_IYEJUN_PRIZE;
      const grade=prize.key==='ZENITH_RANDOM_CARD'?'ZENITH':'FUR';
      const candidates=await rows(db,"SELECT c.id,c.title,c.rarity,c.image_url,m.name FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.rarity=? AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND COALESCE(c.limited_total,0)<=0"+(fixed?' AND c.id=?':'')+' ORDER BY c.id',grade,...(fixed?[LAND_IYEJUN_CARD_ID]:[]));
      // The named 3% prize is separate from this event's random FUR pool only.
      // No global card-pack weights or exclusions are changed.
      const pool=fixed?candidates:candidates.filter(card=>String(card.id)!==LAND_IYEJUN_CARD_ID&&!deps.isRandomDrawExcluded(card));
      if(!pool.length)throw fail('현재 지급 가능한 카드가 없습니다. 쿠폰은 소모되지 않았습니다.',409,'LAND_POOL_EMPTY');
      const selected=new Map();
      for(let i=0;i<prize.amount;i++){
        const chosen=pool[secureLandInt(pool.length)],id=String(chosen.id),entry=selected.get(id)||{...chosen,id,quantity:0};
        entry.quantity++;selected.set(id,entry);
      }
      cards=[...selected.values()];card=prize.amount===1?cards[0]:null;
      for(const chosen of [...cards].sort((a,b)=>a.id.localeCompare(b.id))){
        guard(db,list,"EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.rarity=? AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND COALESCE(c.limited_total,0)<=0)",[chosen.id,grade]);
        list.push(stmt(db,'INSERT INTO user_cards(user_id,card_id,quantity,first_obtained_at,last_obtained_at) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=CURRENT_TIMESTAMP',user.id,chosen.id,chosen.quantity));
      }
    }else inventoryGrant(db,list,user.id,prize.key,prize.amount,code);
    const response={ok:true,rewardType:prize.key,rewardAmount:prize.amount,rewardCoin:prize.key==='COIN'?prize.amount:0,rewardLabel:prize.label,card,cards,message:cards.length?`${prize.label} ${prize.amount}장을 받았습니다. (${cards.map(c=>`${c.title} ${c.rarity} ×${c.quantity}`).join(', ')})`:`${prize.label} ${prize.amount.toLocaleString('ko-KR')}${prize.key==='COIN'?'코인':'개'}를 받았습니다.`};
    list.push(stmt(db,'UPDATE soopketland_coupons SET used_count=used_count+1 WHERE code=?',code),stmt(db,'INSERT INTO soopketland_redemptions(code,user_id,operation_key,response_json,created_at) VALUES(?,?,?,?,?)',code,user.id,operationKey,JSON.stringify(response),now()));
    return finish(await commit(db,list,read)||response);
  }catch(error){if(error.status)return deps.json({error:error.message,code:error.code},error.status);throw error}
}

async function activateHyper(db,user,body,deps){
  const plan={multiplier:15,durationMinutes:60},prior=await replayAction(db,user,body.requestId,'HYPER',plan);if(prior)return prior;
  const current=await rows(db,'SELECT key,value FROM app_meta WHERE key IN (?,?)',...BURNING),map=new Map(current.map(r=>[r.key,r.value]));
  if(current.some(r=>{const c=parse(r.value);return c?.enabled&&Date.parse(c.endsAt)>Date.now()}))throw fail('현재 버닝이 진행 중입니다. 종료 후 사용하세요. 발동권은 보존됩니다.',409,'LAND_BURNING_ACTIVE');
  const timestamp=Date.now(),base=deps.cleanBurningEventSettings(parse(map.get(BURNING[1]),{}),'HYPER');
  const settings={...base,enabled:true,durationMinutes:60,battleRewardMultiplier:15,generation:Number(base.generation||0)+1,activatedAt:new Date(timestamp).toISOString(),endsAt:new Date(timestamp+3600000).toISOString(),updatedAt:new Date(timestamp).toISOString()};
  const response={ok:true,message:'서버 전체 하이퍼버닝 ×15가 60분간 시작되었습니다.',endsAt:settings.endsAt,multiplier:15},list=[];
  lockUser(db,list,user.id);guardUser(db,list,user.id);
  // Ensure both metadata rows exist before locks, then compare exact snapshots.
  for(const key of BURNING)list.push(stmt(db,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',key,map.get(key)||'{}'));
  if(db.dialect==='postgres')list.push(stmt(db,'SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR UPDATE',...BURNING));
  for(const key of BURNING)guard(db,list,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,map.get(key)||'{}']);
  inventoryDebit(db,list,user.id,HYPER_TICKET,body.requestId);
  list.push(stmt(db,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(settings),BURNING[1]));
  actionReceipt(db,list,user,body.requestId,'HYPER',plan,response);
  const result=await commit(db,list,()=>replayAction(db,user,body.requestId,'HYPER',plan));
  deps.invalidateBurning();return result||response;
}
