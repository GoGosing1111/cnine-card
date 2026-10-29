import {organizationIdentity} from '../shared/organization-identity-v1.mjs?v=20261025-clan-eight';
import {organizationHeadquartersState} from '../shared/organization-headquarters-v1.mjs';
import {reviewOrganizationAnswers} from '../shared/organization-interview-v1.mjs';
import {ORGANIZATION_PREPARATION} from '../shared/organization-preparation-v1.mjs';
import {ORGANIZATIONS,ORGANIZATION_LIMITS,ORGANIZATION_RECRUITMENT_MS,ORGANIZATION_RELEASE_ENABLED,defaultOrganizationPolicy,validateOrganizationPolicy,allocateOrganizations,orgAssert,orgInteger} from '../shared/organization-system-v1.mjs';
import {readJointBody} from './_joint_request.js';
import {jointHash} from './_joint_transactions.js';
import {allocateAdditionalOrganizations} from '../shared/organization-additional-v1.mjs';
import {organizationJoinOverview,organizationJoinCommand,organizationJoinOpen} from './_organization_join.js';
import {kickOrganizationMember} from './_organization_member_kick.js';
import {CLAN_RESUMPTION_STATE_KEY,activeClanResumption} from '../shared/clan-resumption-v1.mjs';

const parse=JSON.parse;
// Presentation only: retain stored proposal snapshots and all allocation inputs.
const displayAllocation=value=>({...value,...(Array.isArray(value.organizations)?{organizations:value.organizations.map(o=>({...o,name:organizationIdentity(o.id)?.name||o.name}))}:{})});
const displayResponse=value=>value?.proposal?{...value,proposal:displayAllocation(value.proposal)}:value;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const owner=user=>user?.role==='OWNER';
const additionalRecruitment=r=>r?.phase==='ASSIGNED'&&['RECRUITING','RECRUITMENT_CLOSED'].includes(r.assignment_status);
const surveyOpen=(r,now)=>(r?.phase==='SURVEY'||additionalRecruitment(r)&&r.assignment_status==='RECRUITING')&&r.opened_at!==null&&r.closes_at!==null&&Number(r.opened_at)<=now&&now<Number(r.closes_at);
const assignmentOpen=(r,now)=>r.phase==='CLOSED'||additionalRecruitment(r)&&!surveyOpen(r,now);
const recruitmentView=(r,now)=>({kind:additionalRecruitment(r)?'ADDITIONAL':'INITIAL',open:surveyOpen(r,now),openedAt:r.opened_at===null?null:Number(r.opened_at),closesAt:r.closes_at===null?null:Number(r.closes_at),autoAssign:additionalRecruitment(r)?false:!!Number(r.auto_assign)});
const roundView=(r,now)=>r?Object.fromEntries(Object.entries({...r,name:typeof r.name==='string'?r.name.replace(/^조직(?=\s|$)/,'클랜'):r.name,phase:r.phase==='SURVEY'&&r.closes_at!==null&&Number(r.closes_at)<=now?'CLOSED':r.phase,assignment_status:additionalRecruitment(r)&&!surveyOpen(r,now)?'RECRUITMENT_CLOSED':r.assignment_status,recruitment:recruitmentView(r,now)}).filter(([key])=>!['assignment_token','assignment_lease_until'].includes(key))):null;
const qFor=DB=>async(text,values=[]) => (await DB.client.query({text,values})).rows;
async function transaction(DB,work){
  orgAssert(DB?.dialect==='postgres'&&DB.client&&DB.enqueue,'DATABASE','클랜 준비 DB를 확인하세요.',503);
  return DB.enqueue(async()=>{const q=qFor(DB);await q('BEGIN');try{await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='10s'");const result=await work(q);await q('COMMIT');return result;}catch(error){try{await q('ROLLBACK');}catch{}throw error;}});
}
async function policy(q,lock=''){
  const [row]=await q('SELECT * FROM organization_policy_v1 WHERE id=1'+lock);
  return row?validateOrganizationPolicy({...parse(row.policy_json),revision:Number(row.revision)}):defaultOrganizationPolicy();
}
async function round(q,id,lock=''){
  orgAssert(typeof id==='string'&&id.length<=80,'ROUND','클랜 모집 회차를 지정하세요.',400);
  const [row]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1'+lock,[id]);orgAssert(row,'ROUND','클랜 모집 회차를 찾을 수 없습니다.',404);return row;
}
function access(p,user,r,{write=false}={}){
  orgAssert(user&&(!user.status||user.status==='ACTIVE'),'AUTH','활성 계정으로 로그인하세요.',403);
  if(r.scope==='TEST')orgAssert(owner(user)||p.testUserIds.includes(Number(user.id)),'TEST_ONLY','클랜 검수는 OWNER와 지정된 테스트 계정만 이용할 수 있습니다.',403);
  if(write&&r.scope==='LIVE')orgAssert(ORGANIZATION_RELEASE_ENABLED,'RELEASE_LOCKED','실제 클랜 모집과 배정은 출시 승인 전까지 잠겨 있습니다.');
}
async function mutation(env,user,path,body,work,now){
  orgAssert(typeof body.requestId==='string'&&/^[a-zA-Z0-9:_-]{8,100}$/.test(body.requestId),'REQUEST_ID','요청 식별자를 확인하세요.',400);
  const fingerprint=await jointHash(canonical({path,body}));
  return transaction(env.DB,async q=>{
    await q('INSERT INTO organization_actors_v1(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[user.id]);
    await q('SELECT user_id FROM organization_actors_v1 WHERE user_id=$1 FOR UPDATE',[user.id]);
    const [receipt]=await q('SELECT * FROM organization_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,body.requestId]);
    if(receipt){orgAssert(receipt.fingerprint===fingerprint,'REQUEST_CONFLICT','같은 요청 식별자에 다른 내용을 사용할 수 없습니다.');return parse(receipt.response_json);}
    const result=await work(q);
    await q('INSERT INTO organization_receipts_v1 VALUES($1,$2,$3,$4,$5)',[user.id,body.requestId,fingerprint,JSON.stringify(result),now]);
    return result;
  });
}
async function lockedContext(q,user,body){const p=await policy(q,' FOR SHARE'),r=await round(q,body.roundId,' FOR UPDATE');access(p,user,r,{write:true});return {p,r};}
async function participants(q,r){
  const rows=await q(`SELECT s.*,u.nickname,u.status,u.role,u.banned_until,x.rating_json,x.expires_at,x.round_revision FROM organization_surveys_v1 s JOIN users u ON u.id=s.user_id LEFT JOIN organization_ratings_v1 x ON x.round_id=s.round_id AND x.user_id=s.user_id WHERE s.round_id=$1 AND s.active=1 AND (NOT $2::boolean OR NOT EXISTS(SELECT 1 FROM organization_members_v1 m WHERE m.round_id=s.round_id AND m.user_id=s.user_id)) ORDER BY s.user_id LIMIT ${ORGANIZATION_LIMITS.participants+1}`,[r.id,additionalRecruitment(r)]);
  orgAssert(rows.length<=ORGANIZATION_LIMITS.participants,'OVERFLOW','200석을 초과했습니다. 초과 신청자 처리 정책을 정한 뒤 배정하세요.');return rows;
}
function validRatings(rows,r,now){return rows.length>0&&rows.every(row=>row.rating_json&&Number(row.round_revision)===Number(r.revision)&&Number(row.expires_at)>now);}
async function ratingProgress(q,rows,r,deps,now){
  const eligible=rows.filter(row=>row.rating_json&&Number(row.round_revision)===Number(r.revision));
  const inspect=deps.staleOrganizationRatingIds||(await import('./_organization_ratings.js')).staleOrganizationRatingIds;
  const stale=new Set(await inspect(q,eligible.map(row=>parse(row.rating_json)),{now,minimumValidityMs:30000,requireCurrentSource:false}));
  const pending=rows.filter(row=>!row.rating_json||Number(row.round_revision)!==Number(r.revision)||Number(row.expires_at)<=now+30000||stale.has(Number(row.user_id)));
  return {ids:pending.map(row=>Number(row.user_id)),ratedCount:rows.length-pending.length,total:rows.length};
}
async function inputFor(q,r,now){
  const rows=await participants(q,r);orgAssert(validRatings(rows,r,now),'RATING_PENDING','참가자 전력을 최신화한 뒤 배정안을 만드세요.');
  orgAssert(rows.every(row=>row.status==='ACTIVE'&&(!row.banned_until||Date.parse(row.banned_until)<=now)),'ACCOUNT_CHANGED','참가 계정 상태가 변경되었습니다. 설문 명단을 확인하세요.');
  const ratings=rows.map(row=>parse(row.rating_json));
  const existing=additionalRecruitment(r)?(await q('SELECT m.user_id,m.organization_id,m.slot,m.seed_power,u.nickname,s.preferred_id FROM organization_members_v1 m JOIN users u ON u.id=m.user_id LEFT JOIN organization_surveys_v1 s ON s.round_id=m.round_id AND s.user_id=m.user_id WHERE m.round_id=$1 ORDER BY m.user_id',[r.id])).map(m=>({userId:Number(m.user_id),organizationId:Number(m.organization_id),slot:Number(m.slot),power:Number(m.seed_power),nickname:m.nickname,preferredOrganizationId:Number(m.preferred_id||m.organization_id)})):[];
  orgAssert(rows.length+existing.length<=ORGANIZATION_LIMITS.participants,'OVERFLOW','200석을 초과했습니다. 초과 신청자 처리 정책을 정한 뒤 배정하세요.');
  const source=rows.map(row=>({userId:Number(row.user_id),preferredId:Number(row.preferred_id),surveyRevision:Number(row.revision),answers:parse(row.answers_json),rating:parse(row.rating_json)}));
  return {rows,ratings,existing,players:rows.map((row,i)=>({userId:Number(row.user_id),nickname:row.nickname,preferredOrganizationId:Number(row.preferred_id),power:ratings[i].power,organizationFit:reviewOrganizationAnswers(parse(row.answers_json)).organizationFit})),hash:await jointHash(existing.length?{applicants:source,existing}:source)};
}
export async function organizationOverview(env,user,{roundId,admin=false,now=Date.now()}={}){
  return env.DB.enqueue(async()=>{
    const q=qFor(env.DB),p=await policy(q),rounds=await q('SELECT * FROM organization_rounds_v1 ORDER BY created_at DESC,id LIMIT 2');
    const r=roundId?await round(q,roundId):rounds.find(r=>r.scope==='LIVE')||rounds.find(r=>r.scope==='TEST');
    if(admin)orgAssert(owner(user),'PERMISSION','클랜 운영은 OWNER 전용입니다.',403);
    if(r)access(p,user,r);
    const [counts,survey,membership,ratingCount,proposal,progress]=r?await Promise.all([
      q('SELECT s.preferred_id,COUNT(*)::integer AS n,COUNT(*) FILTER(WHERE m.user_id IS NULL)::integer AS pending FROM organization_surveys_v1 s LEFT JOIN organization_members_v1 m ON m.round_id=s.round_id AND m.user_id=s.user_id WHERE s.round_id=$1 AND s.active=1 GROUP BY s.preferred_id',[r.id]),
      q('SELECT preferred_id,revision,updated_at,active,answers_json FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]),
      q('SELECT organization_id,slot FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]),
      q('SELECT COUNT(*)::integer AS n FROM organization_ratings_v1 x WHERE round_id=$1 AND round_revision=$2 AND expires_at>$3 AND (NOT $4::boolean OR NOT EXISTS(SELECT 1 FROM organization_members_v1 m WHERE m.round_id=x.round_id AND m.user_id=x.user_id))',[r.id,r.revision,now,additionalRecruitment(r)]),
      admin?q('SELECT * FROM organization_proposals_v1 WHERE round_id=$1 AND (round_revision=$2 OR (applied_at IS NOT NULL AND NOT $3::boolean)) ORDER BY created_at DESC,id DESC LIMIT 1',[r.id,r.revision,additionalRecruitment(r)]):[],
      q('SELECT p.*,COUNT(m.user_id)::integer AS member_count,COALESCE(SUM(m.seed_power),0) AS power FROM organization_progress_v1 p LEFT JOIN organization_members_v1 m ON m.round_id=p.round_id AND m.organization_id=p.organization_id WHERE p.round_id=$1 GROUP BY p.round_id,p.organization_id,p.points,p.stage ORDER BY p.organization_id',[r.id])
    ]):[[],[],[],[],[],[]];
    const roster=r&&membership[0]?await q('SELECT m.user_id,m.slot,m.joined_at,u.nickname FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 AND m.organization_id=$2 ORDER BY m.slot LIMIT 25',[r.id,membership[0].organization_id]):[];
    const latest=proposal[0],join=await organizationJoinOverview(q,r,user,now);
    const applicants=admin&&r?await q('SELECT s.user_id,u.nickname,s.preferred_id,s.updated_at,s.revision,s.active,x.expires_at,x.round_revision FROM organization_surveys_v1 s JOIN users u ON u.id=s.user_id LEFT JOIN organization_ratings_v1 x ON x.round_id=s.round_id AND x.user_id=s.user_id WHERE s.round_id=$1 ORDER BY s.active DESC,s.updated_at,s.user_id',[r.id]):[];
    const allMembers=admin&&r?await q('SELECT m.user_id,m.organization_id,m.slot,m.seed_power,u.nickname FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 ORDER BY m.organization_id,m.slot',[r.id]):[];
    return {ok:true,join,viewerId:Number(user.id),releaseEnabled:ORGANIZATION_RELEASE_ENABLED,admissionEnabled:join.enabled||!!r&&(surveyOpen(r,now)||survey[0]?.active===1),serverNow:now,capacity:ORGANIZATION_LIMITS.participants,limits:ORGANIZATION_LIMITS,preparation:{...ORGANIZATION_PREPARATION,status:r?.phase||'PREPARATION',registrationOpen:join.canApply||surveyOpen(r,now)&&!membership[0]},round:roundView(r,now),policy:admin?p:{pointsPerRegion:p.pointsPerRegion,settlementMinutes:p.settlementMinutes,growthMode:p.growthMode,hideoutThresholds:p.hideoutThresholds,unlocks:p.unlocks},...(admin?{rounds:rounds.map(row=>roundView(row,now)),participants:applicants.map(a=>({userId:Number(a.user_id),nickname:a.nickname,preferredOrganizationId:Number(a.preferred_id),submittedAt:Number(a.updated_at),surveyRevision:Number(a.revision),assignedOrganizationId:Number(allMembers.find(m=>Number(m.user_id)===Number(a.user_id))?.organization_id)||null,active:a.active===1,rated:Number(a.expires_at)>now&&Number(a.round_revision)===Number(r.revision)}))}:{}),survey:survey[0]?{answers:parse(survey[0].answers_json),submitted:survey[0].active===1,preferredOrganizationId:Number(survey[0].preferred_id),revision:Number(survey[0].revision)}:null,membership:membership[0]?{organizationId:Number(membership[0].organization_id),slot:Number(membership[0].slot)}:null,roster:roster.map(m=>({userId:Number(m.user_id),nickname:m.nickname,slot:Number(m.slot),joinedAt:Number(m.joined_at),isSelf:Number(m.user_id)===Number(user.id),isElder:(join.elderIds||[]).includes(Number(m.user_id)),canKick:join.canReview===true&&Number(m.user_id)!==Number(user.id)&&!(join.elderIds||[]).includes(Number(m.user_id))})),participantCount:counts.reduce((n,c)=>n+c.n,0),pendingApplicantCount:counts.reduce((n,c)=>n+c.pending,0),memberCount:progress.reduce((n,p)=>n+Number(p.member_count),0),ratedCount:ratingCount[0]?.n||0,organizations:ORGANIZATIONS.map(o=>{const s=progress.find(p=>Number(p.organization_id)===o.id);return {...o,...(admin?{roster:allMembers.filter(m=>Number(m.organization_id)===o.id).map(m=>({userId:Number(m.user_id),nickname:m.nickname,slot:Number(m.slot),power:Number(m.seed_power)}))}:{}),applicants:counts.find(c=>Number(c.preferred_id)===o.id)?.n||0,memberCount:s?.member_count||0,power:Number(s?.power||0),hideout:organizationHeadquartersState(s,p)};}),proposal:latest?{id:latest.id,expiresAt:Number(latest.expires_at),appliedAt:latest.applied_at?Number(latest.applied_at):null,...displayAllocation(parse(latest.result_json))}:null};
  });
}
async function refreshRatings(env,user,body,deps,now){
  const replay=await env.DB.enqueue(async()=>{const [row]=await qFor(env.DB)('SELECT * FROM organization_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,body.requestId]);return row;});
  if(replay){orgAssert(replay.fingerprint===await jointHash(canonical({path:'admin/organization/ratings',body})),'REQUEST_CONFLICT','같은 요청 식별자에 다른 내용을 사용할 수 없습니다.');return parse(replay.response_json);}
  if(body.restart===true)return mutation(env,user,'admin/organization/ratings',body,async q=>{const {r}=await lockedContext(q,user,body);orgAssert(assignmentOpen(r,(deps.now||Date.now)()),'PHASE','설문을 마감한 뒤 전력을 평가하세요.');await q('DELETE FROM organization_ratings_v1 WHERE round_id=$1',[r.id]);await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[r.id]);return {ok:true,ratedCount:0,done:false};},now);
  // Expensive account evaluation runs outside all organization transactions.
  const state=await env.DB.enqueue(async()=>{const q=qFor(env.DB),p=await policy(q),r=await round(q,body.roundId);access(p,user,r,{write:true});orgAssert(assignmentOpen(r,(deps.now||Date.now)()),'PHASE','설문을 마감한 뒤 전력을 평가하세요.');const rows=await participants(q,r),progress=await ratingProgress(q,rows,r,deps,(deps.now||Date.now)());return {r,rows,ids:progress.ids.slice(0,12)};});
  orgAssert(state.rows.length,'EMPTY','설문 참가자가 없습니다.');
  const loader=deps.loadOrganizationRatings||(await import('./_organization_ratings.js')).loadOrganizationRatings;
  const ratings=state.ids.length?await loader(env,state.ids,deps,{now}):[];
  orgAssert(ratings.length===state.ids.length&&new Set(ratings.map(r=>r.userId)).size===ratings.length&&ratings.every(r=>state.ids.includes(r.userId)&&Number.isSafeInteger(r.power)&&r.power>0&&r.power<=1e12&&Number.isSafeInteger(r.expiresAt)&&r.expiresAt>now),'RATING_INVALID','전력 평가 결과를 확인하지 못했습니다.',503);
  return mutation(env,user,'admin/organization/ratings',body,async q=>{const {r}=await lockedContext(q,user,body);orgAssert(assignmentOpen(r,(deps.now||Date.now)())&&r.revision===state.r.revision,'STALE','설문 상태가 변경되었습니다. 다시 확인하세요.');for(const rating of ratings)await q('INSERT INTO organization_ratings_v1 VALUES($1,$2,$3,$4,$5) ON CONFLICT(round_id,user_id) DO UPDATE SET round_revision=excluded.round_revision,rating_json=excluded.rating_json,expires_at=excluded.expires_at',[r.id,rating.userId,r.revision,JSON.stringify(rating),rating.expiresAt]);const progress=await ratingProgress(q,await participants(q,r),r,deps,(deps.now||Date.now)());return {ok:true,ratedCount:progress.ratedCount,total:progress.total,done:progress.total>0&&progress.ids.length===0};},now);
}
export async function handleOrganization({path,request,env,deps}){
  const admin=path==='admin/organization'||path.startsWith('admin/organization/');
  if(!admin&&!path.startsWith('organization/'))return null;
  const json=(data,status=200)=>deps.json(data,status,{'Cache-Control':'no-store'});
  try{
    const user=await deps.authenticate(request,env);orgAssert(user,'AUTH','로그인이 필요합니다.',401);if(admin)orgAssert(owner(user),'PERMISSION','클랜 운영은 OWNER 전용입니다.',403);
    const now=(deps.now||Date.now)(),url=new URL(request.url);
    if(request.method==='GET'&&['organization/overview','admin/organization'].includes(path))return json(await organizationOverview(env,user,{roundId:url.searchParams.get('roundId')||undefined,admin,now}));
    orgAssert(request.method==='POST','METHOD','지원하지 않는 요청입니다.',405);
    const fields={
      'organization/join/apply':['requestId','roundId','revision','organizationId','message'],
      'organization/join/cancel':['requestId','roundId','revision'],
      'organization/join/review':['requestId','roundId','revision','userId','decision'],
      'organization/member/kick':['requestId','roundId','revision','targetUserId','joinedAt','confirmation'],
      'admin/organization/policy':['requestId','policy'],
      'admin/organization/create':['requestId','scope','name'],
      'admin/organization/phase':['requestId','roundId','revision','phase','autoAssign'],
      'admin/organization/additional-recruitment':['requestId','roundId','revision','action'],
      'organization/survey':['requestId','roundId','revision','preferredOrganizationId','answers'],
      'organization/withdraw':['requestId','roundId','revision'],
      'admin/organization/ratings':['requestId','roundId','restart'],
      'admin/organization/propose':['requestId','roundId','fixedAssignments'],
      'admin/organization/apply':['requestId','roundId','proposalId']
    }[path];orgAssert(fields,'ROUTE','요청 경로를 확인하세요.',404);
    const body=await readJointBody(request,{fields,maxBytes:32000});
    return json(displayResponse(await organizationCommand(env,user,path,body,deps,now)));
  }catch(error){const known=/^(ORG_|JOINT_|DUO_)/.test(error.code||'');if(!known)deps.onError?.(error);return json({ok:false,code:known?error.code:'ORG_UNAVAILABLE',error:known?error.message:'클랜 요청을 처리하지 못했습니다. 잠시 후 같은 요청으로 다시 확인하세요.'},known?(error.status||409):503);}
}

// The existing clan screen sends a season and a text joined_at, not an organization
// round/revision. Keep its original request fingerprint and validate that membership
// under the shared removal locks, then use the same atomic elder-removal operation.
export async function handleRestoredClanMemberKick({request,env,deps,user}){
  const json=(data,status=200)=>deps.json(data,status,{'Cache-Control':'no-store'});
  try{
    orgAssert(request.method==='POST','METHOD','POST 요청만 지원합니다.',405);
    const body=await readJointBody(request,{fields:['requestId','seasonId','targetUserId','joinedAt','confirmation'],maxBytes:32000});
    const seasonId=orgInteger(body.seasonId,1,Number.MAX_SAFE_INTEGER,'클랜 시즌');
    const targetUserId=orgInteger(body.targetUserId,1,Number.MAX_SAFE_INTEGER,'방출 대상');
    orgAssert(typeof body.joinedAt==='string'&&body.joinedAt.length>0&&body.joinedAt.length<=80,'STALE','클랜원의 가입 정보를 다시 확인하세요.',400);
    const now=(deps.now||Date.now)();
    return json(await mutation(env,user,'clan/member/kick',body,async q=>{
      const currentTime=(deps.now||Date.now)();
      const [meta]=await q('SELECT value FROM app_meta WHERE key=$1',[CLAN_RESUMPTION_STATE_KEY]);
      const resumption=meta&&activeClanResumption(parse(meta.value),currentTime);
      orgAssert(resumption&&resumption.seasonId===seasonId,'SEASON','클랜 시즌이 변경되었습니다. 명단을 새로고침하세요.');
      const {r}=await lockedContext(q,user,{roundId:resumption.roundId});
      orgAssert(r.scope==='LIVE','SEASON','현재 운영 클랜 명단을 확인하지 못했습니다.');
      const [member]=await q('SELECT joined_at FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2',[r.id,targetUserId]);
      orgAssert(member,'MEMBERSHIP','현재 같은 클랜에 소속된 클랜원만 방출할 수 있습니다.',403);
      const result=await kickOrganizationMember(q,user,{...body,roundId:r.id,revision:Number(r.revision),joinedAt:Number(member.joined_at)},r,currentTime,{seasonId,joinedAt:body.joinedAt});
      return {...result,seasonId,clanId:result.organizationId};
    },now));
  }catch(error){const known=/^(ORG_|JOINT_|DUO_)/.test(error.code||'');if(!known)deps.onError?.(error);return json({ok:false,code:known?error.code:'ORG_UNAVAILABLE',error:known?error.message:'클랜 요청을 처리하지 못했습니다. 잠시 후 같은 요청으로 다시 확인하세요.'},known?(error.status||409):503);}
}

async function organizationCommand(env,user,path,body,deps,now){
    if(path.startsWith('organization/join/'))return organizationJoinCommand(env,user,path,body,deps,now,{mutation,lockedContext,qFor});
    if(path==='admin/organization/ratings')return refreshRatings(env,user,body,deps,now);
    return mutation(env,user,path,body,async q=>{
      if(path==='admin/organization/policy'){
        // An explicit draft save never changes a round's recruitment state.
        const before=await policy(q,' FOR UPDATE'),next=validateOrganizationPolicy(body.policy);orgAssert(next.revision===before.revision,'STALE','설정이 변경되었습니다. 다시 불러오세요.');
        if(next.testUserIds.length){const rows=await q("SELECT id FROM users WHERE id=ANY($1::bigint[]) AND status='ACTIVE'",[next.testUserIds]);orgAssert(rows.length===next.testUserIds.length,'ACCOUNT','활성 계정만 검수 명단에 추가할 수 있습니다.');}
        next.revision++;await q('UPDATE organization_policy_v1 SET revision=$1,policy_json=$2 WHERE id=1',[next.revision,JSON.stringify(next)]);return {ok:true,policy:next};
      }
      if(path==='admin/organization/create'){
        await policy(q,' FOR UPDATE');orgAssert(['TEST','LIVE'].includes(body.scope),'SCOPE','TEST 또는 LIVE 범위를 지정하세요.',400);access(await policy(q),user,{scope:body.scope},{write:true});
        orgAssert(typeof body.name==='string'&&body.name.trim().length>0&&body.name.length<=60,'INPUT','모집 회차 이름을 확인하세요.',400);
        const existing=await q('SELECT id FROM organization_rounds_v1 WHERE scope=$1',[body.scope]);orgAssert(!existing.length,'ROUND_EXISTS','현재 회차가 있습니다. 새로 만들거나 초기화할 수 없습니다.');
        const id=crypto.randomUUID();await q("INSERT INTO organization_rounds_v1(id,scope,name,phase,created_at) VALUES($1,$2,$3,'PREPARATION',$4)",[id,body.scope,body.name.trim(),now]);
        return {ok:true,roundId:id};
      }
      const {p,r}=await lockedContext(q,user,body);
      // Admission deadlines are checked after body parsing and all row locks.
      now=(deps.now||Date.now)();
      if(path==='organization/member/kick')return kickOrganizationMember(q,user,body,r,now);
      if(path==='admin/organization/additional-recruitment'){
        const [actor]=await q('SELECT role,status,banned_until FROM users WHERE id=$1 FOR SHARE',[user.id]);
        orgAssert(actor?.role==='OWNER'&&actor.status==='ACTIVE'&&(!actor.banned_until||Date.parse(actor.banned_until)<=now),'PERMISSION','클랜 추가 모집은 활성 OWNER 전용입니다.',403);
        orgAssert(body.revision===Number(r.revision),'STALE','모집 상태가 변경되었습니다. 다시 불러오세요.');
        orgAssert(r.phase==='ASSIGNED','PHASE','기존 클랜 배정이 완료된 뒤 추가 모집할 수 있습니다.');
        orgAssert(['open','close'].includes(body.action),'INPUT','추가 모집 동작을 확인하세요.',400);
        if(body.action==='open')orgAssert(!surveyOpen(r,now),'RECRUITMENT_OPEN','이미 추가 모집 중입니다. 기존 마감 시각은 연장하지 않습니다.');
        else orgAssert(additionalRecruitment(r),'PHASE','진행한 추가 모집이 없습니다.');
        const opened=body.action==='open'?now:Number(r.opened_at),closes=body.action==='open'?now+ORGANIZATION_RECRUITMENT_MS:Math.min(Number(r.closes_at),now),status=body.action==='open'?'RECRUITING':'RECRUITMENT_CLOSED';
        const [updated]=await q("UPDATE organization_rounds_v1 SET revision=revision+1,opened_at=$2,closes_at=$3,auto_assign=0,assignment_status=$4,assignment_error=NULL,assignment_token=NULL,assignment_lease_until=NULL WHERE id=$1 RETURNING *",[r.id,opened,closes,status]);
        return {ok:true,round:roundView(updated,now),previousRecruitment:{openedAt:Number(r.opened_at),closesAt:Number(r.closes_at),autoAssign:!!Number(r.auto_assign)},membershipWrites:0,autoAssign:false};
      }
      if(path==='admin/organization/phase'){
        orgAssert(body.revision===Number(r.revision),'STALE','모집 상태가 변경되었습니다. 다시 불러오세요.');
        orgAssert((body.phase==='SURVEY'&&['PREPARATION','CLOSED'].includes(r.phase))||(body.phase==='CLOSED'&&r.phase==='SURVEY'),'PHASE','현재 단계에서 변경할 수 없습니다.');
        orgAssert(body.autoAssign===undefined||typeof body.autoAssign==='boolean','INPUT','자동 배정 설정을 확인하세요.',400);
        const opened=body.phase==='SURVEY'?now:r.opened_at,closes=body.phase==='SURVEY'?now+ORGANIZATION_RECRUITMENT_MS:Math.min(Number(r.closes_at||now),now),automatic=body.autoAssign===undefined?Number(r.auto_assign):Number(body.autoAssign);
        await q("UPDATE organization_rounds_v1 SET phase=$1,revision=revision+1,opened_at=$3,closes_at=$4,auto_assign=$5,assignment_status='WAITING',assignment_error=NULL,assignment_token=NULL,assignment_lease_until=NULL WHERE id=$2",[body.phase,r.id,opened,closes,automatic]);
        return {ok:true,phase:body.phase,revision:Number(r.revision)+1,round:{id:r.id,phase:body.phase,revision:Number(r.revision)+1,opened_at:opened,closes_at:closes,auto_assign:automatic}};
      }
      if(path==='organization/survey'||path==='organization/withdraw'){
        if(path==='organization/survey')orgAssert(!organizationJoinOpen(r,now),'ELDER_ADMISSION','가입 신청 메뉴에서 원하는 클랜을 선택하세요. 해당 클랜 원로가 승인합니다.');
        orgAssert(surveyOpen(r,now),'SURVEY_CLOSED','클랜 입단 접수가 마감되었거나 아직 시작되지 않았습니다.');
        const [member]=await q('SELECT user_id FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]);
        orgAssert(!member,'ALREADY_ASSIGNED','이미 클랜 배정이 완료됐습니다. 추가 모집은 미배정 계정만 신청할 수 있습니다.');
        const [prior]=await q('SELECT revision,active FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]);orgAssert(body.revision===Number(prior?.revision||0),'STALE','다른 창에서 설문이 변경되었습니다. 다시 불러오세요.');
        if(path.endsWith('/withdraw')){orgAssert(prior?.active===1,'SURVEY_MISSING','제출한 설문이 없습니다.');await q('UPDATE organization_surveys_v1 SET active=0,revision=revision+1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]);}
        else{orgInteger(body.preferredOrganizationId,1,ORGANIZATIONS.length,'희망 클랜');const interview=reviewOrganizationAnswers(body.answers);await q('INSERT INTO organization_surveys_v1(round_id,user_id,preferred_id,revision,updated_at,answers_json) VALUES($1,$2,$3,1,$4,$5) ON CONFLICT(round_id,user_id) DO UPDATE SET preferred_id=excluded.preferred_id,revision=organization_surveys_v1.revision+1,updated_at=excluded.updated_at,answers_json=excluded.answers_json,active=1',[r.id,user.id,body.preferredOrganizationId,now,JSON.stringify(interview.answers)]);}
        await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[r.id]);return {ok:true,submitted:!path.endsWith('/withdraw')};
      }
      orgAssert(assignmentOpen(r,now),'PHASE','설문 마감 후 배정안을 확인하세요.');
      const input=await inputFor(q,r,now);
      if(r.scope==='TEST')orgAssert(input.rows.every(row=>owner(row)||p.testUserIds.includes(Number(row.user_id))),'TEST_USERS_CHANGED','테스트 참가자 명단이 변경되었습니다. 설문을 다시 확인하세요.');
      if(path==='admin/organization/propose'){
        orgAssert(additionalRecruitment(r)||!body.fixedAssignments?.length,'PLACEMENT','고정 배정은 추가 모집에서만 사용할 수 있습니다.',400);
        const result=additionalRecruitment(r)?allocateAdditionalOrganizations(input.players,input.existing,{seed:r.id,fixedAssignments:body.fixedAssignments||[]}):allocateOrganizations(input.players,{seed:r.id}),id=crypto.randomUUID(),expiresAt=Math.min(...input.ratings.map(r=>r.expiresAt));
        await q('INSERT INTO organization_proposals_v1(id,round_id,round_revision,input_hash,result_json,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,r.id,r.revision,input.hash,JSON.stringify(result),expiresAt,now]);
        return {ok:true,proposal:{id,expiresAt,...result}};
      }
      const [proposal]=await q('SELECT * FROM organization_proposals_v1 WHERE id=$1 AND round_id=$2 FOR UPDATE',[body.proposalId,r.id]);
      orgAssert(proposal&&Number(proposal.round_revision)===Number(r.revision)&&Number(proposal.expires_at)>now&&proposal.input_hash===input.hash,'STALE_PROPOSAL','배정안 또는 전력 정보가 변경되었습니다. 다시 평가하세요.');
      const validate=deps.validateOrganizationRatingsLocked||(await import('./_organization_ratings.js')).validateOrganizationRatingsLocked;
      // Server-verified power is a five-minute allocation snapshot. Ongoing play
      // cannot revoke it; account status, policy versions and real expiry still can.
      orgAssert(await validate(q,input.ratings,{now,requireCurrentSource:false}),'RATING_CHANGED','전력 평가 기준이 변경되었습니다. 전력 재평가 후 배정안을 다시 만드세요.');
      const result=parse(proposal.result_json),additional=additionalRecruitment(r),expected=additional?allocateAdditionalOrganizations(input.players,input.existing,{seed:r.id,fixedAssignments:result.fixedAssignments}):allocateOrganizations(input.players,{seed:r.id});orgAssert(await jointHash(displayAllocation(result))===await jointHash(displayAllocation(expected)),'PROPOSAL_INVALID','배정안 검증에 실패했습니다.',503);
      const entries=result.organizations.flatMap(o=>o.members.filter(m=>!additional||!m.preserved).map(m=>({user_id:m.userId,organization_id:o.id,slot:m.slot,seed_power:m.power})));
      await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,x.user_id,x.organization_id,x.slot,x.seed_power,$3 FROM json_to_recordset($2::json) AS x(user_id bigint,organization_id int,slot int,seed_power bigint)',[r.id,JSON.stringify(entries),now]);
      await q('INSERT INTO organization_progress_v1(round_id,organization_id) SELECT $1,generate_series(1,$2::int) ON CONFLICT DO NOTHING',[r.id,ORGANIZATIONS.length]);
      await q("UPDATE organization_rounds_v1 SET phase='ASSIGNED',revision=revision+1,assigned_at=CASE WHEN $3::boolean THEN assigned_at ELSE $2 END,assignment_status='COMPLETED',assignment_error=NULL,assignment_token=NULL,assignment_lease_until=NULL WHERE id=$1",[r.id,now,additional]);await q('UPDATE organization_proposals_v1 SET applied_at=$2 WHERE id=$1',[proposal.id,now]);
      return {ok:true,assigned:entries.length,stats:result.stats,scope:r.scope};
    },now);
}

// Explicit local operation uses the same OWNER checks, row locks and receipt
// path as CMS. It does not create a session or alter membership.
export async function runOrganizationAdditionalRecruitment(env,{ownerId,...body},deps={}){
 const user=await env.DB.prepare('SELECT id,role,status,banned_until FROM users WHERE id=?').bind(ownerId).first();
 orgAssert(owner(user)&&user.status==='ACTIVE','PERMISSION','활성 OWNER 계정을 확인하세요.',403);
 return organizationCommand(env,user,'admin/organization/additional-recruitment',body,deps,(deps.now||Date.now)());
}

// Explicit trusted operation shares the CMS command, validation and receipt path.
export async function runOrganizationAllocation(env,{ownerId,action,...body},deps={}){
 const now=(deps.now||Date.now)();
 const user=await env.DB.prepare('SELECT id,role,status,banned_until FROM users WHERE id=?').bind(ownerId).first();
 orgAssert(owner(user)&&user.status==='ACTIVE'&&(!user.banned_until||Date.parse(user.banned_until)<=now),'PERMISSION','활성 OWNER 계정을 확인하세요.',403);
 orgAssert(['ratings','propose','apply'].includes(action),'INPUT','클랜 배정 동작을 확인하세요.',400);
 return organizationCommand(env,user,'admin/organization/'+action,body,deps,now);
}

// Public content status contains no applicant identity, wish, answers or ratings.
export async function organizationLiveOperation(env,now=Date.now()){
 const r=await env.DB.prepare("SELECT id,phase,opened_at,closes_at,auto_assign,assignment_status FROM organization_rounds_v1 WHERE scope='LIVE' LIMIT 1").first();
 if(!r||r.phase==='PREPARATION')return null;
 const open=surveyOpen(r,now);
 if(additionalRecruitment(r)&&open)return {kind:'ORGANIZATION',phase:'FORMATION',entityId:r.id,title:'클랜 추가 모집',detail:'24시간 추가 접수 · 자동 배정 OFF · 시즌 시작 전',deadlineAt:new Date(Number(r.closes_at)).toISOString(),sortOrder:0};
 if(r.phase==='ASSIGNED'){
  const faction=await env.DB.prepare('SELECT policy_json FROM organization_faction_policy_v1 WHERE id=1').first();
  if(!faction||parse(faction.policy_json).mode==='OFF')return null;
 }
 return {kind:'ORGANIZATION',phase:open?'FORMATION':r.phase==='ASSIGNED'?'ACTIVE':'PREPARING',entityId:r.id,title:open?'클랜 입단 모집':r.phase==='ASSIGNED'?'클랜 본부':'클랜 균등 배정',detail:open?'7문항 설문 접수 · 24시간 모집':r.phase==='ASSIGNED'?'내 클랜과 아지트 · 서울 25개 구 세력전':r.assignment_status==='BLOCKED'?'배정 보류 · 운영 확인 중':'설문 마감 · 인원·전력 균등 배정 중',deadlineAt:open?new Date(Number(r.closes_at)).toISOString():null,sortOrder:0};
}

// One leased job evaluates every batch within the rating validity window. No
// browser, logged-in OWNER, or open page is required after the 24-hour deadline.
export async function reconcileOrganizationRecruitment(env,deps={}, {now=Date.now()}={}){
 if(!ORGANIZATION_RELEASE_ENABLED)return {changed:false,status:'OFF'};
 const token=crypto.randomUUID(),clock=()=>deps.now?deps.now():Date.now();
 const job=await transaction(env.DB,async q=>{
  const [r]=await q("SELECT * FROM organization_rounds_v1 WHERE scope='LIVE' FOR UPDATE");
  if(!r||r.phase==='PREPARATION')return null;
  if(r.phase==='ASSIGNED'){
   if(r.assignment_status==='RECRUITING'&&Number(r.closes_at)<=now){await q("UPDATE organization_rounds_v1 SET assignment_status='RECRUITMENT_CLOSED',auto_assign=0,revision=revision+1 WHERE id=$1",[r.id]);return {waiting:true,status:'MANUAL',additionalRecruitment:true};}
   return null;
  }
  if(r.phase==='SURVEY'&&Number(r.closes_at)>now)return {waiting:true,nextCheckAt:new Date(Number(r.closes_at)).toISOString()};
  if(r.phase==='SURVEY'){await q("UPDATE organization_rounds_v1 SET phase='CLOSED',revision=revision+1 WHERE id=$1",[r.id]);r.revision=Number(r.revision)+1;r.phase='CLOSED';}
  if(!Number(r.auto_assign))return {waiting:true,status:'MANUAL'};
  if(Number(r.assignment_lease_until)>now)return {waiting:true,status:'RUNNING'};
  const [{n}]=await q('SELECT COUNT(*)::integer AS n FROM organization_surveys_v1 WHERE round_id=$1 AND active=1',[r.id]);
  if(n===0||n>ORGANIZATION_LIMITS.participants){const error=n===0?'입단 신청자가 없어 배정을 보류했습니다.':'200명 정원을 초과했습니다. 초과 처리 방식을 지정하기 전에는 누구도 임의로 제외하지 않습니다.';await q("UPDATE organization_rounds_v1 SET assignment_status='BLOCKED',assignment_error=$2 WHERE id=$1",[r.id,error]);return {waiting:true,status:'BLOCKED',participants:n};}
  const [actor]=await q("SELECT id,nickname,role,status FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");orgAssert(actor,'OWNER','자동 배정 운영 계정을 확인하세요.',503);
  await q("UPDATE organization_rounds_v1 SET assignment_status='RUNNING',assignment_error=NULL,assignment_token=$2,assignment_lease_until=$3 WHERE id=$1",[r.id,token,now+240000]);
  return {r,actor};
 });
 if(!job)return {changed:false,status:'IDLE'};
 if(job.waiting)return {changed:false,...job};
 const {r,actor}=job;
 try{
  let done=false;
  for(let batch=0;batch<13;batch++){
   const at=clock();
   const live=await env.DB.prepare('SELECT phase,assignment_token FROM organization_rounds_v1 WHERE id=?').bind(r.id).first();
   orgAssert(live?.phase==='CLOSED'&&live.assignment_token===token,'STALE','자동 배정 중 모집 상태가 변경되었습니다.');
   const result=await organizationCommand(env,actor,'admin/organization/ratings',{requestId:token+':rating:'+batch,roundId:r.id},deps,at);
   await env.DB.prepare('UPDATE organization_rounds_v1 SET assignment_lease_until=? WHERE id=? AND assignment_token=?').bind(at+240000,r.id,token).run();
   if(result.done){done=true;break;}
  }
  orgAssert(done,'RATING_PENDING','전력 평가를 다음 자동 처리에서 이어갑니다.');
  const proposal=await organizationCommand(env,actor,'admin/organization/propose',{requestId:token+':proposal',roundId:r.id},deps,clock());
  const result=await organizationCommand(env,actor,'admin/organization/apply',{requestId:token+':apply',roundId:r.id,proposalId:proposal.proposal.id},deps,clock());
  return {changed:true,status:'ASSIGNED',roundId:r.id,assigned:result.assigned,stats:result.stats};
 }catch(error){
  const known=/^(ORG_|DUO_)/.test(error.code||'');
  await transaction(env.DB,async q=>{
   const [active]=await q('SELECT assignment_token FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[r.id]);if(active?.assignment_token!==token)return;
   // The next batch checks policy versions and refreshes only invalid or
   // expiring snapshots. Ongoing play does not revoke a completed evaluation.
   await q("UPDATE organization_rounds_v1 SET assignment_status='RETRY',assignment_error=$2,assignment_token=NULL,assignment_lease_until=NULL WHERE id=$1",[r.id,known?error.message:'자동 배정을 다시 시도하고 있습니다.']);
  });
  if(!known)throw error;
  return {changed:false,status:'RETRY',roundId:r.id,code:error.code};
 }
}
