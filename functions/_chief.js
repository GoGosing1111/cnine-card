const CHIEF_META_KEY='chief_appointment_v1';
const BURNING_KEY='burning_event_settings_v1';
const HYPER_KEY='hyper_burning_event_settings_v1310';
const DISCOUNT_REMOVAL_MARKER='safe_runtime_upgrade_v1657_chief_discount_removed';
const DAY_MS=86400000;
let discountRemovalPromise=null;
let foundationPromise=null;

const parse=(value,fallback={})=>{try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:fallback}catch{return fallback}};
const iso=value=>{const ms=Date.parse(String(value||''));return Number.isFinite(ms)?new Date(ms).toISOString():null};
const chiefOrdinal=value=>{if(typeof value!=='number'&&typeof value!=='string')return null;const text=String(value).trim();if(!/^[1-9]\d{0,3}$/.test(text))return null;const number=Number(text);return Number.isSafeInteger(number)&&number<=9999?number:null};
const kstDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
async function ensure(env){
  if(!foundationPromise)foundationPromise=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS chief_power_uses(id INTEGER PRIMARY KEY AUTOINCREMENT,appointment_id TEXT NOT NULL,user_id INTEGER NOT NULL,power_type TEXT NOT NULL,period_key TEXT NOT NULL,use_slot INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(appointment_id,power_type,period_key,use_slot))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chief_power_uses_lookup ON chief_power_uses(appointment_id,power_type,period_key,created_at)`)
  ]).then(()=>true).catch(error=>{foundationPromise=null;throw error});
  await foundationPromise;
  if(!discountRemovalPromise)discountRemovalPromise=(async()=>{
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(DISCOUNT_REMOVAL_MARKER).first();
    if(marker?.value==='1')return;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM app_meta WHERE key='chief_discount_event_v1'"),
      env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(DISCOUNT_REMOVAL_MARKER,'1')
    ]);
  })().catch(error=>{discountRemovalPromise=null;throw error});
  await discountRemovalPromise;
}
async function rowValue(env,key){return (await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value||null}
async function appointment(env){
  await ensure(env);const raw=parse(await rowValue(env,CHIEF_META_KEY),{}),startsAt=iso(raw.startsAt),endsAt=iso(raw.endsAt);
  if(!raw.id||!raw.userId||!startsAt||!endsAt)return {active:false};
  const now=Date.now(),user=await env.DB.prepare('SELECT id,nickname,status FROM users WHERE id=?').bind(Number(raw.userId)).first();
  return {...raw,userId:Number(raw.userId),nickname:user?.nickname||raw.nickname||'',startsAt,endsAt,active:Boolean(user&&user.status==='ACTIVE'&&now>=Date.parse(startsAt)&&now<Date.parse(endsAt))};
}
async function usage(env,a){
  if(!a.id)return {burningToday:0,hyperToday:0,towerResetCount:0,towerResetUsed:false};
  const [daily,total]=await env.DB.batch([
    env.DB.prepare('SELECT power_type,COUNT(*) count FROM chief_power_uses WHERE appointment_id=? AND period_key=? GROUP BY power_type').bind(a.id,kstDate()),
    env.DB.prepare("SELECT COUNT(*) count FROM chief_power_uses WHERE appointment_id=? AND power_type='TOWER_RESET'").bind(a.id)
  ]),d=Object.fromEntries((daily.results||[]).map(x=>[x.power_type,Number(x.count||0)]));
  const towerResetCount=Number(total.results?.[0]?.count||0);
  return {burningToday:d.BURNING||0,hyperToday:d.HYPER||0,towerResetCount,towerResetUsed:towerResetCount>=2};
}
function publicState(a,u,viewerId){
  const remaining=Math.max(0,Date.parse(a.endsAt||0)-Date.now());
  const active=a.active===true;
  return {status:active?'ACTIVE':'VACANT',active,appointmentId:a.id||null,userId:a.userId||null,nickname:a.nickname||'',ordinal:chiefOrdinal(a.ordinal),source:'와이고수 투표',startsAt:a.startsAt||null,endsAt:a.endsAt||null,remainingMs:remaining,isChief:active&&Number(viewerId)===Number(a.userId),inaugurationVersion:Number(a.inaugurationVersion||1),usage:u||{burningToday:0,hyperToday:0,towerResetCount:0,towerResetUsed:false},limits:{burningHours:3,burningUsesPerDay:2,hyperHours:1,towerResetsPerTerm:2}};
}
async function activateBurning(env,a,type){
  const hyper=type==='HYPER',durationHours=hyper?1:3,key=hyper?HYPER_KEY:BURNING_KEY,other=hyper?BURNING_KEY:HYPER_KEY,now=new Date(),endsAt=new Date(now.getTime()+durationHours*3600000).toISOString();
  const current=parse(await rowValue(env,key),{}),otherCurrent=parse(await rowValue(env,other),{}),next={...current,mode:type,theme:hyper?'HYPER':'RED',enabled:true,generation:Number(current.generation||0)+1,activatedAt:now.toISOString(),updatedAt:now.toISOString(),endsAt,title:`족장 ${a.nickname}의 ${hyper?'하이퍼 버닝':'버닝'} 선포`};
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(key,JSON.stringify(next)),
    env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(other,JSON.stringify({...otherCurrent,enabled:false,updatedAt:now.toISOString()}))
  ]);return {startsAt:now.toISOString(),endsAt,durationHours};
}
async function activate(env,a,user,type){
  const u=await usage(env,a),now=new Date(),period=type==='TOWER_RESET'?String(a.id):kstDate(now);
  if(type==='BURNING'&&u.burningToday>=2)throw new Error('오늘의 버닝 선포 2회를 모두 사용했습니다.');
  if(type==='HYPER'&&u.hyperToday>=1)throw new Error('오늘의 하이퍼 버닝 선포 권한을 이미 사용했습니다.');
  if(type==='TOWER_RESET'&&u.towerResetCount>=2)throw new Error('이번 임기의 무한의 탑 초기화 2회를 모두 사용했습니다.');
  const slot=type==='BURNING'?u.burningToday+1:type==='TOWER_RESET'?u.towerResetCount+1:1;
  const reserved=await env.DB.prepare('INSERT OR IGNORE INTO chief_power_uses(appointment_id,user_id,power_type,period_key,use_slot,starts_at,details_json) VALUES(?,?,?,?,?,?,?)').bind(a.id,user.id,type,period,slot,now.toISOString(),JSON.stringify({status:'PENDING'})).run();
  if(!Number(reserved.meta?.changes||0))throw new Error('동일한 족장 권한이 이미 처리되었거나 사용되었습니다.');
  try{
    let details={};
    if(type==='BURNING'||type==='HYPER')details=await activateBurning(env,a,type);
    else if(type==='TOWER_RESET'){
      const season=await env.DB.prepare("SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first();
      if(!season)throw new Error('진행 중인 무한의 탑 시즌이 없습니다.');
      await env.DB.prepare('UPDATE tower_user_progress SET current_floor=1,highest_floor=0,highest_reached_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE season_id=?').bind(season.id).run();details={seasonId:Number(season.id)};
    }
    await env.DB.prepare('UPDATE chief_power_uses SET starts_at=?,ends_at=?,details_json=? WHERE appointment_id=? AND power_type=? AND period_key=? AND use_slot=?').bind(details.startsAt||now.toISOString(),details.endsAt||null,JSON.stringify(details),a.id,type,period,slot).run();
    return details;
  }catch(error){
    await env.DB.prepare('DELETE FROM chief_power_uses WHERE appointment_id=? AND power_type=? AND period_key=? AND use_slot=? AND details_json=?').bind(a.id,type,period,slot,JSON.stringify({status:'PENDING'})).run().catch(()=>{});
    throw error;
  }
}
export async function handleChief({path,request,env,deps}){
  if(!path.startsWith('chief/')&&!path.startsWith('admin/chief'))return null;
  const {authenticate,readBody,json,requirePermission,writeAdminLog}=deps;await ensure(env);
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  if(path==='chief/status'&&request.method==='GET'){const a=await appointment(env);return json({chief:publicState(a,await usage(env,a),user.id),serverNow:new Date().toISOString()})}
  if(path==='chief/activate'&&request.method==='POST'){
    const a=await appointment(env);if(!a.active||Number(a.userId)!==Number(user.id))return json({error:'현재 족장만 권한을 발동할 수 있습니다.'},403);
    const type=String((await readBody(request)).type||'').toUpperCase();if(!['BURNING','HYPER','TOWER_RESET'].includes(type))return json({error:'알 수 없는 족장 권한입니다.'},400);
    try{const result=await activate(env,a,user,type);return json({ok:true,type,result,chief:publicState(a,await usage(env,a),user.id)})}catch(error){return json({error:error.message||'권한 발동에 실패했습니다.'},409)}
  }
  if(path==='admin/chief'){
    const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'운영 설정 권한이 필요합니다.'},403);
    if(request.method==='GET'){
      const a=await appointment(env),query=String(new URL(request.url).searchParams.get('q')||'').trim().slice(0,40);
      const users=query
        ?(await env.DB.prepare("SELECT id,nickname,COALESCE(role,'USER') role FROM users WHERE status='ACTIVE' AND COALESCE(role,'USER') IN ('USER','OWNER') AND (nickname LIKE ? ESCAPE '\\' COLLATE NOCASE OR CAST(id AS TEXT)=? OR COALESCE(role,'USER')=?) ORDER BY CASE WHEN nickname=? THEN 0 WHEN CAST(id AS TEXT)=? THEN 0 WHEN COALESCE(role,'USER')='OWNER' THEN 1 ELSE 2 END,nickname,id LIMIT 50").bind(`%${query.replace(/([%_\\])/g,'\\$1')}%`,query,query.toUpperCase(),query,query).all()).results||[]
        :(await env.DB.prepare("SELECT id,nickname,COALESCE(role,'USER') role FROM users WHERE status='ACTIVE' AND COALESCE(role,'USER') IN ('USER','OWNER') ORDER BY CASE WHEN COALESCE(role,'USER')='OWNER' THEN 0 ELSE 1 END,id DESC LIMIT 100").all()).results||[];
      return json({chief:publicState(a,await usage(env,a),null),users,query});
    }
    if(request.method==='PATCH'){
      const body=await readBody(request),ordinal=chiefOrdinal(body.ordinal);if(!ordinal)return json({error:'족장 대수는 1~9999 범위의 정수로 직접 입력해야 합니다.'},400);
      const stored=await rowValue(env,CHIEF_META_KEY),raw=parse(stored,{}),before=await appointment(env);if(!stored||!raw.id||!before.active)return json({error:'대수를 수정할 현재 임기의 족장이 없습니다.'},409);
      const now=new Date().toISOString(),next={...raw,ordinal,ordinalUpdatedAt:now,ordinalUpdatedBy:Number(admin.id)};
      const updated=await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),CHIEF_META_KEY,stored).run();if(Number(updated.meta?.changes||0)!==1)return json({error:'족장 정보가 동시에 변경되었습니다. 새로고침 후 다시 시도하세요.'},409);
      await writeAdminLog(env,admin,'CHIEF_ORDINAL_UPDATE','CHIEF_APPOINTMENT',String(raw.id),before,next);const current=await appointment(env);return json({ok:true,chief:publicState(current,await usage(env,current),null)});
    }
    if(request.method==='POST'){
      const body=await readBody(request),ordinal=chiefOrdinal(body.ordinal);if(!ordinal)return json({error:'족장 대수는 1~9999 범위의 정수로 직접 입력해야 합니다.'},400);
      const target=await env.DB.prepare("SELECT id,nickname,COALESCE(role,'USER') role FROM users WHERE id=? AND status='ACTIVE' AND COALESCE(role,'USER') IN ('USER','OWNER')").bind(Number(body.userId)).first();if(!target)return json({error:'선출 가능한 활성 USER 또는 OWNER를 찾을 수 없습니다.'},404);
      const now=new Date(),next={id:crypto.randomUUID(),userId:Number(target.id),nickname:target.nickname,ordinal,source:'와이고수 투표',startsAt:now.toISOString(),endsAt:new Date(now.getTime()+7*DAY_MS).toISOString(),inaugurationVersion:Date.now(),appointedBy:Number(admin.id)};
      const before=await appointment(env);await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(CHIEF_META_KEY,JSON.stringify(next)).run();await writeAdminLog(env,admin,'CHIEF_APPOINT','USER',String(target.id),before,next);return json({ok:true,chief:publicState({...next,active:true},await usage(env,next),null)})
    }
  }
  return json({error:'지원하지 않는 족장 요청입니다.'},405);
}
