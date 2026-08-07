const CHIEF_META_KEY='chief_appointment_v1';
const DISCOUNT_META_KEY='chief_discount_event_v1';
const BURNING_KEY='burning_event_settings_v1';
const HYPER_KEY='hyper_burning_event_settings_v1310';
const DAY_MS=86400000;

const parse=(value,fallback={})=>{try{return JSON.parse(value)}catch{return fallback}};
const iso=value=>{const ms=Date.parse(String(value||''));return Number.isFinite(ms)?new Date(ms).toISOString():null};
const kstDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const kstWeek=(date=new Date())=>{
  const parts=kstDate(date).split('-').map(Number),d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d-yearStart)/DAY_MS)+1)/7)).padStart(2,'0')}`;
};
async function ensure(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS chief_power_uses(id INTEGER PRIMARY KEY AUTOINCREMENT,appointment_id TEXT NOT NULL,user_id INTEGER NOT NULL,power_type TEXT NOT NULL,period_key TEXT NOT NULL,use_slot INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(appointment_id,power_type,period_key,use_slot))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chief_power_uses_lookup ON chief_power_uses(appointment_id,power_type,period_key,created_at)`)
  ]);
}
async function rowValue(env,key){return (await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value||null}
async function appointment(env){
  await ensure(env);const raw=parse(await rowValue(env,CHIEF_META_KEY),{}),startsAt=iso(raw.startsAt),endsAt=iso(raw.endsAt);
  if(!raw.id||!raw.userId||!startsAt||!endsAt)return {active:false};
  const now=Date.now(),user=await env.DB.prepare('SELECT id,nickname,status FROM users WHERE id=?').bind(Number(raw.userId)).first();
  return {...raw,userId:Number(raw.userId),nickname:user?.nickname||raw.nickname||'',startsAt,endsAt,active:Boolean(user&&user.status==='ACTIVE'&&now>=Date.parse(startsAt)&&now<Date.parse(endsAt))};
}
async function usage(env,a){
  if(!a.id)return {burningToday:0,hyperToday:0,discountThisWeek:0,towerResetUsed:false};
  const [daily,weekly,total]=await env.DB.batch([
    env.DB.prepare('SELECT power_type,COUNT(*) count FROM chief_power_uses WHERE appointment_id=? AND period_key=? GROUP BY power_type').bind(a.id,kstDate()),
    env.DB.prepare("SELECT power_type,COUNT(*) count FROM chief_power_uses WHERE appointment_id=? AND period_key=? AND power_type='DISCOUNT' GROUP BY power_type").bind(a.id,kstWeek()),
    env.DB.prepare("SELECT COUNT(*) count FROM chief_power_uses WHERE appointment_id=? AND power_type='TOWER_RESET'").bind(a.id)
  ]),d=Object.fromEntries((daily.results||[]).map(x=>[x.power_type,Number(x.count||0)]));
  return {burningToday:d.BURNING||0,hyperToday:d.HYPER||0,discountThisWeek:Number(weekly.results?.[0]?.count||0),towerResetUsed:Number(total.results?.[0]?.count||0)>0};
}
function publicState(a,u,viewerId){
  const remaining=Math.max(0,Date.parse(a.endsAt||0)-Date.now());
  return {active:a.active===true,appointmentId:a.id||null,userId:a.userId||null,nickname:a.nickname||'',source:'와이고수 투표',startsAt:a.startsAt||null,endsAt:a.endsAt||null,remainingMs:remaining,isChief:a.active===true&&Number(viewerId)===Number(a.userId),inaugurationVersion:Number(a.inaugurationVersion||1),usage:u||{burningToday:0,hyperToday:0,discountThisWeek:0,towerResetUsed:false},limits:{burningHours:3,hyperHours:1,discountHours:5,discountPercent:25,discountUsesPerWeek:2,towerResetsPerTerm:1}};
}
export async function chiefDiscountState(env){
  const d=parse(await rowValue(env,DISCOUNT_META_KEY),{}),end=Date.parse(String(d.endsAt||''));
  return Number.isFinite(end)&&end>Date.now()?{active:true,percent:25,startsAt:d.startsAt,endsAt:d.endsAt,chiefNickname:d.chiefNickname||''}:{active:false,percent:0};
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
  const u=await usage(env,a),now=new Date(),period=type==='DISCOUNT'?kstWeek(now):type==='TOWER_RESET'?String(a.id):kstDate(now);
  if(type==='BURNING'&&u.burningToday>=1)throw new Error('오늘의 버닝 선포 권한을 이미 사용했습니다.');
  if(type==='HYPER'&&u.hyperToday>=1)throw new Error('오늘의 하이퍼 버닝 선포 권한을 이미 사용했습니다.');
  if(type==='DISCOUNT'&&u.discountThisWeek>=2)throw new Error('이번 주 할인 선포 2회를 모두 사용했습니다.');
  if(type==='TOWER_RESET'&&u.towerResetUsed)throw new Error('이번 임기의 무한의 탑 초기화 권한을 이미 사용했습니다.');
  const slot=type==='DISCOUNT'?u.discountThisWeek+1:1;
  const reserved=await env.DB.prepare('INSERT OR IGNORE INTO chief_power_uses(appointment_id,user_id,power_type,period_key,use_slot,starts_at,details_json) VALUES(?,?,?,?,?,?,?)').bind(a.id,user.id,type,period,slot,now.toISOString(),JSON.stringify({status:'PENDING'})).run();
  if(!Number(reserved.meta?.changes||0))throw new Error('동일한 족장 권한이 이미 처리되었거나 사용되었습니다.');
  try{
    let details={};
    if(type==='BURNING'||type==='HYPER')details=await activateBurning(env,a,type);
    else if(type==='DISCOUNT'){
      details={startsAt:now.toISOString(),endsAt:new Date(now.getTime()+5*3600000).toISOString(),percent:25};
      await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(DISCOUNT_META_KEY,JSON.stringify({...details,appointmentId:a.id,chiefNickname:a.nickname})).run();
    }else if(type==='TOWER_RESET'){
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
  if(path==='chief/status'&&request.method==='GET'){const a=await appointment(env);return json({chief:publicState(a,await usage(env,a),user.id),discount:await chiefDiscountState(env),serverNow:new Date().toISOString()})}
  if(path==='chief/activate'&&request.method==='POST'){
    const a=await appointment(env);if(!a.active||Number(a.userId)!==Number(user.id))return json({error:'현재 족장만 권한을 발동할 수 있습니다.'},403);
    const type=String((await readBody(request)).type||'').toUpperCase();if(!['BURNING','HYPER','DISCOUNT','TOWER_RESET'].includes(type))return json({error:'알 수 없는 족장 권한입니다.'},400);
    try{const result=await activate(env,a,user,type);return json({ok:true,type,result,chief:publicState(a,await usage(env,a),user.id),discount:await chiefDiscountState(env)})}catch(error){return json({error:error.message||'권한 발동에 실패했습니다.'},409)}
  }
  if(path==='admin/chief'){
    const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'운영 설정 권한이 필요합니다.'},403);
    if(request.method==='GET'){const a=await appointment(env);const users=(await env.DB.prepare("SELECT id,nickname FROM users WHERE status='ACTIVE' AND COALESCE(role,'USER')='USER' ORDER BY nickname LIMIT 500").all()).results||[];return json({chief:publicState(a,await usage(env,a),null),users})}
    if(request.method==='POST'){
      const body=await readBody(request),target=await env.DB.prepare("SELECT id,nickname FROM users WHERE id=? AND status='ACTIVE'").bind(Number(body.userId)).first();if(!target)return json({error:'선출할 활성 유저를 찾을 수 없습니다.'},404);
      const now=new Date(),next={id:crypto.randomUUID(),userId:Number(target.id),nickname:target.nickname,source:'와이고수 투표',startsAt:now.toISOString(),endsAt:new Date(now.getTime()+7*DAY_MS).toISOString(),inaugurationVersion:Date.now(),appointedBy:Number(admin.id)};
      const before=await appointment(env);await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(CHIEF_META_KEY,JSON.stringify(next)).run();await writeAdminLog(env,admin,'CHIEF_APPOINT','USER',String(target.id),before,next);return json({ok:true,chief:publicState({...next,active:true},await usage(env,next),null)})
    }
  }
  return json({error:'지원하지 않는 족장 요청입니다.'},405);
}
