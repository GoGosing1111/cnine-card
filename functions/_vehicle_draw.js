/* V1388 VEHICLE DRAW */
const TICKET_CODE='VEHICLE_DRAW_TICKET';
const SETTINGS_KEY='vehicle_draw_settings_v1388';
const UPGRADE_KEY='safe_runtime_upgrade_v1388_vehicle_draw';
const IMAGE_UPGRADE_KEY='safe_runtime_upgrade_v1391_vehicle_draw_ticket_image_force';
const DEFAULT_TICKET_IMAGE='assets/items/vehicle-draw-ticket-v1391.png';
const DEFAULTS={enabled:true,ticketName:'이동수단 뽑기권',ticketImage:DEFAULT_TICKET_IMAGE,drawTitle:'VEHICLE ACQUISITION',drawCopy:'새로운 이동수단을 획득합니다.',masterStarChance:1,masterStarMin:1,masterStarMax:1};
let readyPromise=null;
let imageUpgradePromise=null;
const text=(v,n=300)=>String(v??'').trim().slice(0,n);
const int=(v,min=0,max=100000000)=>Math.max(min,Math.min(max,Math.floor(Number(v)||0)));
const rate=v=>Math.max(0,Math.min(100,Number.isFinite(Number(v))?Number(v):0));
const bool=(v,d=true)=>v===undefined||v===null?d:(v===true||v===1||String(v)==='1');
const parse=(v,f)=>{try{const x=JSON.parse(v);return x&&typeof x==='object'?x:f}catch{return f}};
const admin=u=>Boolean(u&&['OWNER','ADMIN'].includes(String(u.role||'').toUpperCase()));
function cleanSettings(raw={}){const min=int(raw.masterStarMin??DEFAULTS.masterStarMin,0,100000),max=int(raw.masterStarMax??DEFAULTS.masterStarMax,min,100000);return {enabled:bool(raw.enabled,true),ticketName:text(raw.ticketName||DEFAULTS.ticketName,80),ticketImage:text(raw.ticketImage||DEFAULTS.ticketImage,500),drawTitle:text(raw.drawTitle||DEFAULTS.drawTitle,100),drawCopy:text(raw.drawCopy||DEFAULTS.drawCopy,300),masterStarChance:rate(raw.masterStarChance??DEFAULTS.masterStarChance),masterStarMin:min,masterStarMax:Math.max(min,max)}}
function randomInt(min,max){return min+Math.floor(Math.random()*(max-min+1))}
async function ensure(env){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(UPGRADE_KEY).first();
    if(marker?.value==='1')return true;
    const info=await env.DB.prepare('PRAGMA table_info(character_garage_items)').all(),columns=new Set((info.results||[]).map(row=>String(row.name)));
    const statements=[];
    if(!columns.has('draw_enabled'))statements.push(env.DB.prepare('ALTER TABLE character_garage_items ADD COLUMN draw_enabled INTEGER NOT NULL DEFAULT 0'));
    if(!columns.has('draw_weight'))statements.push(env.DB.prepare('ALTER TABLE character_garage_items ADD COLUMN draw_weight REAL NOT NULL DEFAULT 0'));
    if(!columns.has('duplicate_shards'))statements.push(env.DB.prepare('ALTER TABLE character_garage_items ADD COLUMN duplicate_shards INTEGER NOT NULL DEFAULT 0'));
    statements.push(
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS vehicle_draw_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,garage_id INTEGER,duplicate INTEGER NOT NULL DEFAULT 0,shards_gained INTEGER NOT NULL DEFAULT 0,master_stars_gained INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_vehicle_draw_receipts_cleanup ON vehicle_draw_receipts(status,created_at,request_id)'),
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1)").bind(TICKET_CODE,DEFAULTS.ticketName,'VEHICLE DRAW TICKET','이동수단 전용 뽑기권입니다.','VEHICLE_DRAW','SPECIAL',DEFAULTS.ticketImage,45),
      env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(SETTINGS_KEY,JSON.stringify(DEFAULTS)),
      env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(UPGRADE_KEY,'1')
    );
    await env.DB.batch(statements);return true;
  })().catch(error=>{readyPromise=null;throw error});
  return readyPromise;
}
async function ensureTicketImageUpgrade(env){
  if(imageUpgradePromise)return imageUpgradePromise;
  imageUpgradePromise=(async()=>{
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(IMAGE_UPGRADE_KEY).first();
    if(marker?.value==='1')return true;
    const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();
    const raw=parse(row?.value,{});
    // v1391: 기존 CMS 저장값 및 구형 이미지 캐시와 무관하게 신규 파일명으로 1회 강제 교체한다.
    // 이후 관리자가 CMS에서 저장하는 값은 정상적으로 다시 반영된다.
    const next={...DEFAULTS,...raw,ticketImage:DEFAULT_TICKET_IMAGE};
    const statements=[
      env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SETTINGS_KEY,JSON.stringify(next)),
      env.DB.prepare('UPDATE inventory_items SET name=?,image_url=?,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(next.ticketName||DEFAULTS.ticketName,DEFAULT_TICKET_IMAGE,TICKET_CODE)
    ];
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(IMAGE_UPGRADE_KEY,'1'));
    await env.DB.batch(statements);return true;
  })().catch(error=>{imageUpgradePromise=null;throw error});
  return imageUpgradePromise;
}
async function settings(env){await ensure(env);await ensureTicketImageUpgrade(env);const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();return cleanSettings(parse(row?.value,DEFAULTS))}
async function payload(env){const s=await settings(env),rows=await env.DB.prepare('SELECT id,code,name,rarity,image_url,description,is_active,is_public,draw_enabled,draw_weight,duplicate_shards,sort_order FROM character_garage_items ORDER BY sort_order,id').all();return {settings:s,ticketCode:TICKET_CODE,vehicles:(rows.results||[]).map(r=>({id:Number(r.id),code:r.code,name:r.name,rarity:r.rarity,image:r.image_url||'',description:r.description||'',isActive:r.is_active!==0,isPublic:r.is_public!==0,drawEnabled:r.draw_enabled!==0,drawWeight:Number(r.draw_weight||0),duplicateShards:Number(r.duplicate_shards||0),sortOrder:Number(r.sort_order||0)}))}}
function pick(rows){const total=rows.reduce((s,r)=>s+Number(r.draw_weight||0),0);let roll=Math.random()*total;for(const row of rows){roll-=Number(row.draw_weight||0);if(roll<0)return row}return rows[rows.length-1]}
export async function handleVehicleDraw({path,request,env,deps}){const {authenticate,readBody,json,ensureEquipmentFoundation}=deps;if(ensureEquipmentFoundation)await ensureEquipmentFoundation(env);await ensure(env);
 if(path==='vehicle-draw/config'&&request.method==='GET'){const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const p=await payload(env),balance=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,TICKET_CODE).first();return json({...p,ticketQuantity:Number(balance?.quantity||0)})}
 if(path==='vehicle-draw/open'&&request.method==='POST'){
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  const b=await readBody(request),requestId=text(b.requestId,120);if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);
  const existing=await env.DB.prepare('SELECT status,response_json FROM vehicle_draw_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
  if(existing?.status==='COMPLETED'&&existing.response_json)return json(parse(existing.response_json,{}));
  if(existing)return json({error:'같은 요청이 처리 중입니다.'},409);
  const s=await settings(env);if(!s.enabled)return json({error:'현재 이동수단 뽑기가 중지되어 있습니다.'},503);
  const pool=await env.DB.prepare('SELECT * FROM character_garage_items WHERE is_active=1 AND is_public=1 AND draw_enabled=1 AND draw_weight>0 ORDER BY id').all();
  const rows=pool.results||[],total=rows.reduce((sum,r)=>sum+Number(r.draw_weight||0),0);if(!rows.length||Math.abs(total-100)>.0001)return json({error:'이동수단 뽑기 확률 설정이 올바르지 않습니다.'},503);
  const chosen=pick(rows),star=Math.random()*100<s.masterStarChance?randomInt(s.masterStarMin,s.masterStarMax):0;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO vehicle_draw_receipts(request_id,user_id,garage_id,duplicate,shards_gained,master_stars_gained,status)
      SELECT ?,?,?,CASE WHEN EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?) THEN 1 ELSE 0 END,
      CASE WHEN EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?) THEN ? ELSE 0 END,?,'PENDING'
      WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)`).bind(requestId,user.id,chosen.id,user.id,chosen.id,user.id,chosen.id,int(chosen.duplicate_shards,0),star,user.id,TICKET_CODE),
    env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND item_code=? AND quantity>=1 AND EXISTS(SELECT 1 FROM vehicle_draw_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(user.id,TICKET_CODE,requestId,user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO user_garage_vehicles(user_id,garage_id,source_type,source_id)
      SELECT ?,?,'VEHICLE_DRAW',? WHERE EXISTS(SELECT 1 FROM vehicle_draw_receipts WHERE request_id=? AND user_id=? AND duplicate=0 AND status='PENDING')`).bind(user.id,chosen.id,requestId,requestId,user.id),
    env.DB.prepare(`UPDATE users SET card_shards=card_shards+(SELECT shards_gained FROM vehicle_draw_receipts WHERE request_id=? AND user_id=?)
      WHERE id=? AND EXISTS(SELECT 1 FROM vehicle_draw_receipts WHERE request_id=? AND user_id=? AND duplicate=1 AND status='PENDING')`).bind(requestId,user.id,user.id,requestId,user.id),
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,'MASTER_STAR',master_stars_gained,master_stars_gained,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM vehicle_draw_receipts
      WHERE request_id=? AND user_id=? AND master_stars_gained>0 AND status='PENDING'
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+excluded.quantity,unseen_quantity=unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,requestId,user.id),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,-1,quantity,'VEHICLE_DRAW','VEHICLE_DRAW',? FROM cnine_user_inventory
      WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM vehicle_draw_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(user.id,TICKET_CODE,requestId,user.id,TICKET_CODE,requestId,user.id),
    env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason)
      SELECT ?,r.shards_gained,u.card_shards,'이동수단 중복 획득' FROM vehicle_draw_receipts r JOIN users u ON u.id=r.user_id
      WHERE r.request_id=? AND r.user_id=? AND r.shards_gained>0 AND r.status='PENDING'`).bind(user.id,requestId,user.id),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,'MASTER_STAR',r.master_stars_gained,i.quantity,'VEHICLE_DRAW_BONUS','VEHICLE_DRAW',? FROM vehicle_draw_receipts r
      JOIN cnine_user_inventory i ON i.user_id=r.user_id AND i.item_code='MASTER_STAR'
      WHERE r.request_id=? AND r.user_id=? AND r.master_stars_gained>0 AND r.status='PENDING'`).bind(user.id,requestId,requestId,user.id),
    env.DB.prepare(`UPDATE vehicle_draw_receipts SET status='COMPLETED',response_json=json_object(
      'ok',json('true'),'vehicle',json_object('id',?,'code',?,'name',?,'rarity',?,'image',?,'description',?),
      'duplicate',CASE WHEN duplicate=1 THEN json('true') ELSE json('false') END,
      'shardsGained',shards_gained,'masterStarsGained',master_stars_gained,
      'ticketQuantity',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),
      'masterStarQuantity',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0),
      'cardShards',COALESCE((SELECT card_shards FROM users WHERE id=?),0)),updated_at=CURRENT_TIMESTAMP
      WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(Number(chosen.id),chosen.code,chosen.name,chosen.rarity,chosen.image_url||'',chosen.description||'',user.id,TICKET_CODE,user.id,user.id,requestId,user.id)
  ]);
  const receipt=await env.DB.prepare('SELECT status,response_json FROM vehicle_draw_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
  if(!receipt)return json({error:'이동수단 뽑기권이 부족합니다.'},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'이동수단 뽑기 처리에 실패했습니다.'},500);
  if(Math.random()<.02)env.DB.prepare(`DELETE FROM vehicle_draw_receipts WHERE request_id IN (SELECT request_id FROM vehicle_draw_receipts WHERE created_at<datetime('now','-7 days') ORDER BY created_at LIMIT 100)`).run().catch(()=>{});
  return json(parse(receipt.response_json,{}));
 }
 if(path==='admin/vehicle-draw/settings'&&request.method==='GET'){const user=await authenticate(request,env);if(!admin(user))return json({error:'관리자 권한이 필요합니다.'},403);return json(await payload(env))}
 if(path==='admin/vehicle-draw/settings'&&request.method==='POST'){const user=await authenticate(request,env);if(!admin(user))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),s=cleanSettings(b.settings||{}),entries=Array.isArray(b.vehicles)?b.vehicles:[],normalized=entries.map(x=>({id:int(x.id,1,2147483647),enabled:bool(x.drawEnabled,false),weight:Math.round(rate(x.drawWeight)*1000)/1000,shards:int(x.duplicateShards,0,100000000)}));const enabled=normalized.filter(x=>x.enabled),total=enabled.reduce((sum,x)=>sum+x.weight,0);if(enabled.length&&Math.abs(total-100)>.0001)return json({error:`활성 이동수단 확률 합계는 100%여야 합니다. 현재 ${total.toFixed(3)}%입니다.`},400);if(s.enabled&&!enabled.length)return json({error:'뽑기를 사용하려면 활성 이동수단을 하나 이상 설정하세요.'},400);const statements=[env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SETTINGS_KEY,JSON.stringify(s)),env.DB.prepare('UPDATE character_garage_items SET draw_enabled=0,draw_weight=0,updated_at=CURRENT_TIMESTAMP'),env.DB.prepare('UPDATE inventory_items SET name=?,image_url=?,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(s.ticketName,s.ticketImage,TICKET_CODE)];for(const x of normalized)statements.push(env.DB.prepare('UPDATE character_garage_items SET draw_enabled=?,draw_weight=?,duplicate_shards=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(x.enabled?1:0,x.enabled?x.weight:0,x.shards,x.id));await env.DB.batch(statements);return json({ok:true,...await payload(env)})}
 if(path==='admin/vehicle-draw/grant'&&request.method==='POST'){const user=await authenticate(request,env);if(!admin(user))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),userId=int(b.userId,1,2147483647),quantity=int(b.quantity,1,100000),requestId=text(b.requestId,120);if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);const target=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first();if(!target)return json({error:'지급 대상 유저를 찾을 수 없습니다.'},404);const ref=`ADMIN:${user.id}:${requestId}`;const exists=await env.DB.prepare("SELECT 1 FROM inventory_logs WHERE reference_type='VEHICLE_DRAW_ADMIN' AND reference_id=?").bind(ref).first();if(exists)return json({error:'이미 처리된 지급 요청입니다.'},409);await env.DB.batch([env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+excluded.quantity,unseen_quantity=unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId,TICKET_CODE,quantity,quantity),env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) SELECT ?,?,?,quantity,'ADMIN_GRANT','VEHICLE_DRAW_ADMIN',?,? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(userId,TICKET_CODE,quantity,ref,user.id,userId,TICKET_CODE)]);const row=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,TICKET_CODE).first();return json({ok:true,quantity:Number(row?.quantity||0)})}
 return null}
