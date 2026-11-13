import {EXTREME_BURNING_META_KEY,EXTREME_PULSE_KEY,EXTREME_DURATIONS,canManageExtreme,extremeSettings} from '../shared/extreme-burning-v1.mjs';
import {commitBurningChange} from './_burning_event_access.js';

const otherModes=['burning_event_settings_v1','hyper_burning_event_settings_v1310','miracle_burning_event_settings_v1'];
export async function handleExtremeBurning({request,env,deps}){
  const {authenticate,json,readBody,invalidate}=deps,user=await authenticate(request,env);
  if(!user)return json({error:'로그인이 필요합니다.'},401);
  if(!canManageExtreme(user))return json({error:'핑크빛유두 계정만 익스트림 버닝을 관리할 수 있습니다.'},403);
  if(!['GET','PATCH'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
  const db=env.DB,p=(sql,...args)=>db.prepare(sql).bind(...args),now=deps.now?.()??Date.now();
  const keys=request.method==='GET'?[EXTREME_BURNING_META_KEY]:[EXTREME_BURNING_META_KEY,...otherModes,EXTREME_PULSE_KEY];
  const rows=(await p('SELECT key,value FROM app_meta WHERE key IN ('+keys.map(()=>'?').join(',')+')',...keys).all()).results;
  const byKey=new Map(rows.map(row=>[row.key,row.value]));
  const raw=JSON.parse(byKey.get(EXTREME_BURNING_META_KEY)||'{}'),before=extremeSettings(raw,now),revision=Number(raw.revision||0);
  const view=(state,rev)=>({settings:{...state,revision:rev},allowedDurations:EXTREME_DURATIONS,serverNow:new Date(now).toISOString()});
  if(request.method==='GET')return json(view(before,revision));
  const b=await readBody(request);
  if(!b||typeof b.enabled!=='boolean'||!EXTREME_DURATIONS.includes(b.durationMinutes)||!Number.isFinite(b.battleRewardMultiplier)||b.battleRewardMultiplier<1||b.battleRewardMultiplier>1000||
    !Number.isSafeInteger(b.revision)||b.revision<0||typeof b.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(b.requestId))return json({error:'코인 1~1,000배, 진행 시간과 요청 정보를 확인하세요.'},400);
  const receiptKey='extreme_burning_request_v1:'+b.requestId;
  const fingerprint=JSON.stringify([b.enabled,b.durationMinutes,b.battleRewardMultiplier,b.revision]);
  async function replay(){
    const record=await p('SELECT value FROM app_meta WHERE key=?',receiptKey).first();
    if(!record)return null;
    const saved=JSON.parse(record.value);
    if(saved.fingerprint!==fingerprint)return json({error:'같은 요청 번호에 다른 설정이 있습니다.'},409);
    const current=JSON.parse((await p('SELECT value FROM app_meta WHERE key=?',EXTREME_BURNING_META_KEY).first()).value);
    return json({ok:true,replayed:true,...view(extremeSettings(current,now),current.revision)});
  }
  const previous=await replay();if(previous)return previous;
  if(revision!==b.revision)return json({error:'버닝 설정이 바뀌었습니다. 다시 불러오세요.'},409);
  const at=new Date(now).toISOString(),next={...before,enabled:b.enabled,durationMinutes:b.durationMinutes,battleRewardMultiplier:b.battleRewardMultiplier,
    generation:before.generation+(b.enabled?1:0),revision:revision+1,activatedAt:b.enabled?at:before.activatedAt,endsAt:b.enabled?new Date(now+b.durationMinutes*60000).toISOString():null,updatedAt:at};
  const upsert=(key,value)=>p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',key,JSON.stringify(value));
  const writes=[];
  if(b.enabled){
    for(const key of otherModes){
      const old=byKey.get(key);if(!old)continue;const state=JSON.parse(old);
      if(state.enabled)writes.push(upsert(key,{...state,enabled:false,endsAt:null,updatedAt:at}));
    }
    // A Korean midnight fully refills solo entries. Party entry has at most a six-hour cooldown.
    const pulses=JSON.parse(byKey.get(EXTREME_PULSE_KEY)||'[]').filter(x=>x.at>=now-86400000);
    pulses.push({at:now,generation:next.generation});writes.push(upsert(EXTREME_PULSE_KEY,pulses));
  }
  const conflict=()=>json({error:'버닝 설정이 바뀌었습니다. 다시 불러오세요.'},409);
  try{
    const committed=await commitBurningChange(db,keys.map(key=>[key,byKey.get(key)??null]),[
      upsert(EXTREME_BURNING_META_KEY,next),...writes,
      p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',receiptKey,JSON.stringify({fingerprint,state:next})),
      p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'EXTREME_BURNING_UPDATE','APP_META',EXTREME_BURNING_META_KEY,JSON.stringify(before),JSON.stringify(next))]);
    if(!committed)return await replay()||conflict();
  }catch(error){const saved=await replay();if(saved)return saved;throw error;}
  invalidate();return json({ok:true,...view(extremeSettings(next,now),next.revision)});
}
