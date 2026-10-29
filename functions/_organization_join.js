import {orgAssert,orgInteger,ORGANIZATION_RELEASE_ENABLED,ORGANIZATION_LIMITS} from '../shared/organization-system-v1.mjs';
import {organizationElderIds} from '../shared/organization-faction-v1.mjs';
import {ORGANIZATION_FIXED_SCHEDULE} from '../shared/organization-schedule-v1.mjs';
import {mirrorResumedClanJoin} from './_clan_resumption.js';
const prefix=r=>'organization-join:'+r.id+':';
const key=(r,id)=>prefix(r)+id;
export const organizationJoinOpen=(r,now)=>ORGANIZATION_RELEASE_ENABLED&&r?.phase==='ASSIGNED'&&now>=ORGANIZATION_FIXED_SCHEDULE.effectiveAt;
async function membership(q,r,id){return (await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2',[r.id,id]))[0];}
async function application(q,r,id){const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[key(r,id)]);return row?JSON.parse(row.value):null;}
async function authority(q,r,user,{lock=false}={}){
 const mine=await membership(q,r,user.id);
 if(!mine)return {canReview:false,organizationId:null};
 const [row]=await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1'+(lock?' FOR SHARE':''),[r.id]);
 const roster=(await q('SELECT m.user_id,m.organization_id,u.status FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1',[r.id])).map(m=>({userId:Number(m.user_id),clanId:Number(m.organization_id),status:m.status}));
 const state=JSON.parse(row?.state_json||'{}'),organizationId=Number(mine.organization_id);
 const elderIds=(state.elders?.[organizationId]??[state.commanders?.[organizationId]]).filter(id=>roster.some(m=>m.userId===id&&m.clanId===organizationId));
 return {organizationId,elderIds,canReview:organizationElderIds(state,roster,organizationId).includes(Number(user.id))};
}
export async function organizationJoinOverview(q,r,user,now){
 if(!organizationJoinOpen(r,now))return {enabled:false,canApply:false,canReview:false,applications:[]};
 const mine=await membership(q,r,user.id),a=await application(q,r,user.id),auth=await authority(q,r,user);
 const rows=auth.canReview?await q('SELECT value FROM app_meta WHERE left(key,length($1))=$1 ORDER BY key',[prefix(r)]):[];
 const requests=rows.map(row=>JSON.parse(row.value)).filter(a=>a.organizationId===auth.organizationId&&a.status==='PENDING');
 const users=requests.length?await q('SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[])',[requests.map(a=>a.userId)]):[];
 return {enabled:true,canApply:!mine,application:a,...auth,applications:requests.map(a=>({...a,nickname:users.find(u=>Number(u.id)===a.userId)?.nickname||'탈퇴 계정',accountActive:users.find(u=>Number(u.id)===a.userId)?.status==='ACTIVE'})).sort((a,b)=>a.updatedAt-b.updatedAt||a.userId-b.userId)};
}
export async function organizationJoinCommand(env,user,path,body,deps,now,{mutation,lockedContext,qFor}){
 orgAssert(typeof body.requestId==='string'&&/^[a-zA-Z0-9:_-]{8,100}$/.test(body.requestId),'REQUEST_ID','요청 식별자를 확인하세요.',400);
 let rating;
 // Retry completed approvals without reevaluating a now-joined applicant.
 const replay=await env.DB.enqueue(async()=> (await qFor(env.DB)('SELECT request_id FROM organization_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,body.requestId]))[0]);
 if(!replay&&path==='organization/join/review'&&body.decision==='APPROVED'){
  await env.DB.enqueue(async()=>{
   const q=qFor(env.DB),[r]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1',[body.roundId]);
   orgAssert(organizationJoinOpen(r,now),'JOIN_CLOSED','가입 신청은 클랜 배정 완료 후 이용할 수 있습니다.');
   const auth=await authority(q,r,user),a=await application(q,r,body.userId);
   orgAssert(auth.canReview&&a?.organizationId===auth.organizationId,'ELDER','우리 클랜의 원로만 가입 신청을 심사할 수 있습니다.',403);
   orgAssert(a.status==='PENDING'&&a.revision===body.revision,'STALE','신청 상태가 변경되었습니다. 다시 불러오세요.');
  });
  const loader=deps.loadOrganizationRatings||(await import('./_organization_ratings.js')).loadOrganizationRatings;
  [rating]=await loader(env,[body.userId],deps,{now});
 }
 return mutation(env,user,path,body,async q=>{
  const {r}=await lockedContext(q,user,body);
  orgAssert(organizationJoinOpen(r,now),'JOIN_CLOSED','가입 신청은 클랜 배정 완료 후 이용할 수 있습니다.');
  const [actor]=await q('SELECT status,banned_until FROM users WHERE id=$1 FOR SHARE',[user.id]);
  orgAssert(actor?.status==='ACTIVE'&&(!actor.banned_until||Date.parse(actor.banned_until)<=now),'ACCOUNT','활성 계정만 가입 신청과 심사를 진행할 수 있습니다.',403);
  const review=path==='organization/join/review',id=review?orgInteger(body.userId,1,Number.MAX_SAFE_INTEGER,'신청자'):Number(user.id);
  const before=await application(q,r,id);
  orgInteger(body.revision,0,2147483646,'신청 버전');
  orgAssert((before?.revision||0)===body.revision,'STALE','신청 상태가 변경되었습니다. 다시 불러오세요.');
  let next;
  if(path==='organization/join/apply'){
   orgAssert(!await membership(q,r,id),'MEMBER','이미 클랜에 가입되어 있습니다.');
   const organizationId=orgInteger(body.organizationId,1,ORGANIZATION_LIMITS.organizations,'희망 클랜');
   orgAssert(typeof body.message==='string'&&body.message.length<=300,'INPUT','가입 인사는 300자 이내로 입력하세요.',400);
   orgAssert(before?.status!=='PENDING','PENDING','기존 신청을 취소한 뒤 다른 클랜에 신청하세요.');
   const [{n}]=await q('SELECT COUNT(*)::integer AS n FROM organization_members_v1 WHERE round_id=$1 AND organization_id=$2',[r.id,organizationId]);
   orgAssert(n<25,'FULL','이 클랜은 정원 25명이 찼습니다. 다른 클랜을 선택하세요.');
   next={userId:id,organizationId,message:body.message.trim(),status:'PENDING',revision:body.revision+1,createdAt:now,updatedAt:now};
  }else{
   orgAssert(before?.status==='PENDING','STALE','심사 대기 중인 신청이 아닙니다.');
   if(review){
    orgAssert(['APPROVED','REJECTED'].includes(body.decision),'INPUT','승인 또는 거절을 선택하세요.',400);
    const auth=await authority(q,r,user,{lock:true});
    orgAssert(auth.canReview&&auth.organizationId===before.organizationId,'ELDER','우리 클랜의 원로만 가입 신청을 심사할 수 있습니다.',403);
    if(body.decision==='APPROVED'){
     const [applicant]=await q('SELECT status,banned_until FROM users WHERE id=$1 FOR SHARE',[id]);
     orgAssert(applicant?.status==='ACTIVE'&&(!applicant.banned_until||Date.parse(applicant.banned_until)<=now),'ACCOUNT','현재 가입할 수 없는 계정입니다.');
     orgAssert(!await membership(q,r,id),'MEMBER','신청자가 이미 클랜에 가입되어 있습니다.');
     const slots=await q('SELECT slot FROM organization_members_v1 WHERE round_id=$1 AND organization_id=$2',[r.id,before.organizationId]);
     const slot=Array.from({length:25},(_,i)=>i+1).find(n=>!slots.some(s=>Number(s.slot)===n));
     orgAssert(slot,'FULL','클랜 정원 25명이 찼습니다.');
     orgAssert(rating?.userId===id&&Number.isSafeInteger(rating.power)&&rating.power>0&&rating.power<=1e12&&rating.expiresAt>now,'RATING_INVALID','신청자의 전력 평가를 다시 진행하세요.',503);
     const validate=deps.validateOrganizationRatingsLocked||(await import('./_organization_ratings.js')).validateOrganizationRatingsLocked;
     orgAssert(await validate(q,[rating],{now,requireCurrentSource:false}),'RATING_INVALID','신청자의 전력 평가가 만료되었습니다. 다시 시도하세요.');
     await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) VALUES($1,$2,$3,$4,$5,$6)',[r.id,id,before.organizationId,slot,rating.power,now]);
     await mirrorResumedClanJoin(q,r,id,before.organizationId,slot,now);
     await q('INSERT INTO organization_progress_v1(round_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[r.id,before.organizationId]);
     await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[r.id]);
    }
   }
   next={...before,status:review?body.decision:'CANCELLED',revision:before.revision+1,updatedAt:now,...(review?{reviewedBy:Number(user.id),reviewedAt:now}:{})};
  }
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[key(r,id),JSON.stringify(next),new Date(now).toISOString()]);
  return {ok:true,application:next};
 },now);
}
