import { chiefAuthorityGuard } from './_coup_schema.js';
import { openPrisonReleaseCaseStatement } from './_prison_community.js';

const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const stamp=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
const parse=value=>JSON.parse(String(value));
export const CHIEF_ARREST_MESSAGE='최고사령부에서 당신을 체포하였습니다';

export async function imprisonByChief(env,user,appointment,body,deps){
  const userId=Number(body.userId),durationMinutes=Number(body.durationMinutes),reason=String(body.reason||'').trim(),requestId=String(body.requestId||'');
  if(!Number.isSafeInteger(userId)||userId<1||userId===Number(user.id))fail('수감할 다른 유저를 선택하세요.',400);
  if(!Number.isInteger(durationMinutes)||durationMinutes<10||durationMinutes>360)fail('수감 시간은 10분부터 6시간(360분)까지 설정하세요.',400);
  if(!reason||reason.length>200)fail('수감 사유를 1~200자로 입력하세요.',400);
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))fail('수감 요청 번호가 올바르지 않습니다.',400);
  await deps.ensurePrisonFoundation(env);
  return deps.withUserMutationLock(env,userId,'chief/prison',async()=>{
    const prior=await env.DB.prepare("SELECT details_json FROM chief_power_uses WHERE appointment_id=? AND user_id=? AND power_type='PRISON' AND period_key=? AND use_slot=1").bind(appointment.id,user.id,requestId).first();
    if(prior){
      const saved=parse(prior.details_json);
      if(saved.user.id!==userId||saved.durationMinutes!==durationMinutes||saved.reason!==reason)fail('같은 요청 번호의 대상이나 수감 내용이 다릅니다.');
      return {...saved,replayed:true};
    }
    const target=await env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id=?').bind(userId).first();
    if(!target||target.status!=='ACTIVE')fail('수감 가능한 활성 유저를 찾을 수 없습니다.',404);
    if(target.role==='OWNER'&&user.role!=='OWNER')fail('OWNER 계정은 수감할 수 없습니다.',403);
    const before=await deps.prisonStatusForUser(env,userId);
    if(before.incarcerated)fail('이미 감옥이나 수용 시설에 수감 중인 유저입니다.');
    const now=Date.now(),jailedAt=stamp(now),jailedUntil=stamp(now+durationMinutes*60000);
    const prison={incarcerated:true,facility:'PRISON',reason,jailedAt,jailedUntil,jailedByNickname:user.nickname,remainingSeconds:durationMinutes*60};
    const result={ok:true,user:{id:userId,nickname:target.nickname},prison,durationMinutes,reason,requestId};
    const authority=chiefAuthorityGuard(env,appointment.id,Number(user.id)),guard=crypto.randomUUID();
    // Recheck term/duty and target eligibility in the same transaction as the
    // sentence, client command, bail case, receipt and audit. No new authority role.
    await env.DB.batch([
      ...authority.before,
      env.DB.prepare('UPDATE users SET id=id WHERE id=?').bind(userId),
      env.DB.prepare(`INSERT INTO coup_atomic_guard_v2115(id,ok) SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND status='ACTIVE' AND (COALESCE(role,'USER')<>'OWNER' OR ?='OWNER'))
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM user_prison_status WHERE user_id=? AND active=1 AND jailed_until>CURRENT_TIMESTAMP)
        THEN 1 ELSE 0 END`).bind(guard,userId,user.role,user.id,userId),
      env.DB.prepare(`INSERT INTO chief_power_uses(appointment_id,user_id,power_type,period_key,use_slot,starts_at,ends_at,details_json)
        VALUES(?,?,'PRISON',?,1,?,?,?)`).bind(appointment.id,user.id,requestId,jailedAt,jailedUntil,JSON.stringify(result)),
      env.DB.prepare(`INSERT INTO user_prison_status(user_id,active,reason,jailed_by,jailed_at,jailed_until,released_by,released_at,release_reason,updated_at)
        VALUES(?,1,?,?,?,?,NULL,NULL,'',CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET active=1,reason=excluded.reason,jailed_by=excluded.jailed_by,
        jailed_at=excluded.jailed_at,jailed_until=excluded.jailed_until,released_by=NULL,released_at=NULL,release_reason='',updated_at=CURRENT_TIMESTAMP`)
        .bind(userId,reason,user.id,jailedAt,jailedUntil),
      env.DB.prepare(`INSERT INTO user_runtime_commands(user_id,command_type,payload_json,created_by,expires_at)
        VALUES(?,'PRISON_LOCK',?,?,?)`).bind(userId,JSON.stringify({source:'CHIEF',reason,durationMinutes,jailedUntil,message:CHIEF_ARREST_MESSAGE}),user.id,jailedUntil),
      openPrisonReleaseCaseStatement(env,{inmateUserId:userId}),
      env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'CHIEF_PRISON','USER',?,?,?)")
        .bind(user.id,String(userId),JSON.stringify({user:{id:userId,nickname:target.nickname},prison:before}),JSON.stringify({...result,appointmentId:appointment.id})),
      env.DB.prepare('DELETE FROM coup_atomic_guard_v2115 WHERE id=?').bind(guard),authority.after
    ]);
    return result;
  });
}

export async function handleChiefPrison({path,request,env,user,appointment,deps}){
  const {json}=deps;
  if(!appointment.active||Number(appointment.userId)!==Number(user.id))return json({error:'현재 임기의 족장만 감옥 수감 권한을 사용할 수 있습니다.'},403);
  if(path==='chief/prison/users'&&request.method==='GET'){
    const query=String(new URL(request.url).searchParams.get('q')||'').trim().slice(0,40);
    if(!query)return json({users:[]});
    const rows=await env.DB.prepare(`SELECT id,nickname FROM users WHERE status='ACTIVE' AND id<>?
      AND (COALESCE(role,'USER')<>'OWNER' OR ?='OWNER')
      AND (nickname LIKE ? ESCAPE '\\' COLLATE NOCASE OR CAST(id AS TEXT)=?)
      ORDER BY CASE WHEN nickname=? THEN 0 ELSE 1 END,nickname,id LIMIT 20`)
      .bind(user.id,user.role,`%${query.replace(/([%_\\])/g,'\\$1')}%`,query,query).all();
    return json({users:rows.results||[]});
  }
  if(path==='chief/prison'&&request.method==='POST'){
    try{return json(await imprisonByChief(env,user,appointment,await deps.readBody(request),deps));}
    catch(error){return json({error:error.status?error.message:'수감 결과를 확인하지 못했습니다. 임기와 대상 상태를 확인한 뒤 같은 요청으로 다시 시도하세요.'},error.status||409);}
  }
  return json({error:'지원하지 않는 수감 요청입니다.'},405);
}
