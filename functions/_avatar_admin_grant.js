import {clanAdminTransaction as transaction} from './_clan_inactivity_cleanup.js';

// Exact-name, OWNER-only permanent grants. No wallet, loadout or release-setting writes.
const PREFIX='avatar_admin_grant_v2079:';
const CONFIRM='GRANT_PERMANENT_AVATAR';
const TTL=15*60000;
const pack=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?Number(v):v);
const check=(ok,message,status=409)=>{if(!ok)throw Object.assign(new Error(message),{status});};
const avatarInfo=row=>({code:row.code,name:row.name,serial:row.serial,version:Number(row.version)});

export function avatarGrantInput(body){
  check(typeof body.avatarCode==='string'&&/^[A-Z0-9_]{1,80}$/.test(body.avatarCode),'아바타를 선택하세요.',400);
  check(Array.isArray(body.nicknames)&&body.nicknames.length>0&&body.nicknames.length<=30,'정확한 닉네임을 최대 30명까지 입력하세요.',400);
  const nicknames=body.nicknames.map(name=>{
    check(typeof name==='string'&&name.trim().length>0&&name.trim().length<=80&&!/[\r\n\u0000]/.test(name),'닉네임을 한 줄에 한 명씩 입력하세요.',400);
    return name.trim();
  });
  check(new Set(nicknames).size===nicknames.length,'중복 닉네임을 제거하세요.',400);
  check(typeof body.reason==='string'&&body.reason.trim().length>0&&body.reason.trim().length<=200,'지급 사유를 1~200자로 입력하세요.',400);
  return {avatarCode:body.avatarCode,nicknames,reason:body.reason.trim()};
}

async function activeAvatar(q,code){
  const [row]=await q('SELECT code,name,serial,version,is_active,is_public FROM avatar_catalog_v1 WHERE code=$1 FOR SHARE',[code]);
  check(row&&Number(row.is_active)===1&&Number(row.is_public)===1,'사용·공개 상태가 ON인 아바타만 지급할 수 있습니다.');
  return avatarInfo(row);
}

export async function handleAvatarAdminGrant({request,env,admin,deps,now=Date.now()}){
  const {json,readBody}=deps;
  if(admin?.role!=='OWNER')return json({error:'OWNER만 아바타를 지급할 수 있습니다.'},403);
  if(request.method!=='POST')return json({error:'POST 요청이 필요합니다.'},405);
  try{
    const body=await readBody(request);
    check(body&&['preview','apply','status','cancel'].includes(body.action),'대상 확인 또는 지급 작업을 선택하세요.',400);
    return json(await transaction(env.DB,async q=>{
      const [owner]=await q('SELECT id,role,status FROM users WHERE id=$1 FOR SHARE',[admin.id]);
      check(owner?.role==='OWNER'&&owner.status==='ACTIVE','활성 OWNER 인증이 필요합니다.',403);
      if(body.action==='preview'){
        const input=avatarGrantInput(body),avatar=await activeAvatar(q,input.avatarCode);
        const users=await q('SELECT id,nickname,status FROM users WHERE nickname=ANY($1::text[]) ORDER BY id',[input.nicknames]);
        for(const name of input.nicknames){
          const matches=users.filter(u=>u.nickname===name);
          check(matches.length===1,`정확한 계정을 확인할 수 없습니다: ${name}`,400);
          check(matches[0].status==='ACTIVE',`활성 계정이 아닙니다: ${name}`,400);
        }
        const targets=users.map(u=>({userId:Number(u.id),nickname:u.nickname}));
        check(targets.every(u=>Number.isSafeInteger(u.userId)&&u.userId>0),'계정 ID를 확인할 수 없습니다.');
        const owned=await q('SELECT user_id,expires_at FROM avatar_user_ownership_v1 WHERE user_id=ANY($1::bigint[]) AND avatar_code=$2',[targets.map(u=>u.userId),avatar.code]);
        const previewId=crypto.randomUUID(),record={status:'PREVIEW',ownerId:Number(admin.id),createdAt:now,avatar,targets,reason:input.reason};
        const recipients=targets.map(t=>{
          const row=owned.find(o=>Number(o.user_id)===t.userId);
          return {...t,outcome:!row?'NEW':row.expires_at===null?'ALREADY_OWNED':'PERMANENT_UPGRADE'};
        });
        record.preview={ok:true,status:'PREVIEW',previewId,avatar,recipients,reason:input.reason,permanent:true,expiresAt:new Date(now+TTL).toISOString()};
        await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[PREFIX+previewId,pack(record),new Date(now).toISOString()]);
        return record.preview;
      }
      check(typeof body.previewId==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(body.previewId),'확인한 지급 요청 번호가 필요합니다.',400);
      const key=PREFIX+body.previewId,[saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key]);
      check(saved,'지급 확인 기록을 찾을 수 없습니다.',404);
      const record=JSON.parse(saved.value);
      check(record.ownerId===Number(admin.id),'다른 관리자의 지급 요청입니다.',403);
      if(record.status==='COMPLETED')return {...record.result,replayed:true};
      if(body.action==='cancel'){
        await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[key,pack({...record,status:'CANCELLED'}),new Date(now).toISOString()]);
        return {...record.preview,status:'CANCELLED'};
      }
      if(record.status==='CANCELLED')return {...record.preview,status:'CANCELLED'};
      const expired=now<record.createdAt||now-record.createdAt>TTL;
      if(body.action==='status')return {...record.preview,status:expired?'EXPIRED':'PREVIEW'};
      check(body.confirmation===CONFIRM,'영구 아바타 지급 확인이 필요합니다.',400);
      check(record.status==='PREVIEW'&&!expired,'지급 확인이 만료되었습니다. 결과 확인 후 새로 조회하세요.');
      const ids=record.targets.map(t=>t.userId);
      const users=await q('SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
      check(users.length===ids.length&&users.every((u,i)=>Number(u.id)===ids[i]&&u.nickname===record.targets[i].nickname&&u.status==='ACTIVE'),'대상 계정 정보가 변경됐습니다. 지급은 취소되었습니다.');
      const avatar=await activeAvatar(q,record.avatar.code);
      check(pack(avatar)===pack(record.avatar),'아바타 설정이 변경됐습니다. 지급 대상을 다시 확인하세요.');
      const before=await q('SELECT * FROM avatar_user_ownership_v1 WHERE user_id=ANY($1::bigint[]) AND avatar_code=$2 ORDER BY user_id FOR UPDATE',[ids,avatar.code]);
      const changed=await q(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at)
        SELECT id,$2,'ADMIN_GRANT',$3,$4,NULL FROM unnest($1::bigint[]) AS targets(id) ORDER BY id
        ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=EXCLUDED.source_type,source_ref=EXCLUDED.source_ref,
          acquired_at=EXCLUDED.acquired_at,expires_at=NULL
        WHERE avatar_user_ownership_v1.expires_at IS NOT NULL RETURNING user_id`,[ids,avatar.code,key,new Date(now).toISOString()]);
      const changedIds=new Set(changed.map(r=>Number(r.user_id)));
      const recipients=record.targets.map(t=>{
        const existing=before.find(o=>Number(o.user_id)===t.userId);
        check(changedIds.has(t.userId)||(existing&&existing.expires_at===null),'지급 행수 검증에 실패했습니다.');
        return {...t,outcome:!changedIds.has(t.userId)?'ALREADY_OWNED':existing?'PERMANENT_UPGRADE':'NEW'};
      });
      const after=await q('SELECT user_id,expires_at FROM avatar_user_ownership_v1 WHERE user_id=ANY($1::bigint[]) AND avatar_code=$2 ORDER BY user_id',[ids,avatar.code]);
      check(after.length===ids.length&&after.every(o=>o.expires_at===null),'영구 보유 검증에 실패했습니다.');
      const result={ok:true,status:'COMPLETED',previewId:body.previewId,avatar,recipients,reason:record.reason,permanent:true,
        granted:changedIds.size,alreadyOwned:ids.length-changedIds.size,loadoutChanged:false,completedAt:new Date(now).toISOString()};
      await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
        VALUES($1,'AVATAR_ADMIN_GRANT','AVATAR',$2,$3,$4)`,[admin.id,avatar.code,pack({ownership:before}),pack(result)]);
      await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[key,pack({...record,status:'COMPLETED',before,result}),result.completedAt]);
      return result;
    }));
  }catch(error){
    return json({error:error.status?error.message:'지급 결과를 확인하지 못했습니다. 같은 요청 번호로 결과를 다시 확인하세요.',
      code:error.status?'AVATAR_GRANT_VALIDATION':'AVATAR_GRANT_RETRY'},error.status||409);
  }
}
