import {reviewOrganizationAnswers} from '../shared/organization-interview-v1.mjs';
import {ORGANIZATION_PREPARATION} from '../shared/organization-preparation-v1.mjs';
import {ORGANIZATIONS,ORGANIZATION_RELEASE_ENABLED,defaultOrganizationPolicy,validateOrganizationPolicy,organizationHideout,allocateOrganizations,orgAssert,orgInteger} from '../shared/organization-system-v1.mjs';
import {readJointBody} from './_joint_request.js';
import {jointHash} from './_joint_transactions.js';

const parse=JSON.parse;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const owner=user=>user?.role==='OWNER';
const qFor=DB=>async(text,values=[]) => (await DB.client.query({text,values})).rows;
async function transaction(DB,work){
  orgAssert(DB?.dialect==='postgres'&&DB.client&&DB.enqueue,'DATABASE','조직 준비 DB를 확인하세요.',503);
  return DB.enqueue(async()=>{const q=qFor(DB);await q('BEGIN');try{await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='10s'");const result=await work(q);await q('COMMIT');return result;}catch(error){try{await q('ROLLBACK');}catch{}throw error;}});
}
async function policy(q,lock=''){
  const [row]=await q('SELECT * FROM organization_policy_v1 WHERE id=1'+lock);
  return row?validateOrganizationPolicy({...parse(row.policy_json),revision:Number(row.revision)}):defaultOrganizationPolicy();
}
async function round(q,id,lock=''){
  orgAssert(typeof id==='string'&&id.length<=80,'ROUND','조직 모집 회차를 지정하세요.',400);
  const [row]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1'+lock,[id]);orgAssert(row,'ROUND','조직 모집 회차를 찾을 수 없습니다.',404);return row;
}
function access(p,user,r,{write=false}={}){
  orgAssert(user&&(!user.status||user.status==='ACTIVE'),'AUTH','활성 계정으로 로그인하세요.',403);
  if(r.scope==='TEST')orgAssert(owner(user)||p.testUserIds.includes(Number(user.id)),'TEST_ONLY','조직 검수는 OWNER와 지정된 테스트 계정만 이용할 수 있습니다.',403);
  if(write&&r.scope==='LIVE')orgAssert(ORGANIZATION_RELEASE_ENABLED,'RELEASE_LOCKED','실제 조직 모집과 배정은 출시 승인 전까지 잠겨 있습니다.');
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
  const rows=await q(`SELECT s.*,u.nickname,u.status,u.role,u.banned_until,x.rating_json,x.expires_at,x.round_revision FROM organization_surveys_v1 s JOIN users u ON u.id=s.user_id LEFT JOIN organization_ratings_v1 x ON x.round_id=s.round_id AND x.user_id=s.user_id WHERE s.round_id=$1 AND s.active=1 ORDER BY s.user_id LIMIT 151`,[r.id]);
  orgAssert(rows.length<=150,'OVERFLOW','150석을 초과했습니다. 초과 신청자 처리 정책을 정한 뒤 배정하세요.');return rows;
}
function validRatings(rows,r,now){return rows.length>0&&rows.every(row=>row.rating_json&&Number(row.round_revision)===Number(r.revision)&&Number(row.expires_at)>now);}
async function inputFor(q,r,now){
  const rows=await participants(q,r);orgAssert(validRatings(rows,r,now),'RATING_PENDING','참가자 전력을 최신화한 뒤 배정안을 만드세요.');
  orgAssert(rows.every(row=>row.status==='ACTIVE'&&(!row.banned_until||Date.parse(row.banned_until)<=now)),'ACCOUNT_CHANGED','참가 계정 상태가 변경되었습니다. 설문 명단을 확인하세요.');
  const ratings=rows.map(row=>parse(row.rating_json));
  return {rows,ratings,players:rows.map((row,i)=>({userId:Number(row.user_id),nickname:row.nickname,preferredOrganizationId:Number(row.preferred_id),power:ratings[i].power,organizationFit:reviewOrganizationAnswers(parse(row.answers_json)).organizationFit})),hash:await jointHash(rows.map(row=>({userId:Number(row.user_id),preferredId:Number(row.preferred_id),surveyRevision:Number(row.revision),answers:parse(row.answers_json),rating:parse(row.rating_json)})))};
}
export async function organizationOverview(env,user,{roundId,admin=false,now=Date.now()}={}){
  return env.DB.enqueue(async()=>{
    const q=qFor(env.DB),p=await policy(q),rounds=await q('SELECT * FROM organization_rounds_v1 ORDER BY created_at DESC,id LIMIT 2');
    const r=roundId?await round(q,roundId):rounds.find(r=>r.scope==='LIVE')||rounds.find(r=>r.scope==='TEST');
    if(admin)orgAssert(owner(user),'PERMISSION','조직 운영은 OWNER 전용입니다.',403);
    if(r)access(p,user,r);
    const [counts,survey,membership,ratingCount,proposal,progress]=r?await Promise.all([
      q('SELECT preferred_id,COUNT(*)::integer AS n FROM organization_surveys_v1 WHERE round_id=$1 AND active=1 GROUP BY preferred_id',[r.id]),
      q('SELECT preferred_id,revision,updated_at,active,answers_json FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]),
      q('SELECT organization_id,slot FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]),
      q('SELECT COUNT(*)::integer AS n FROM organization_ratings_v1 WHERE round_id=$1 AND round_revision=$2 AND expires_at>$3',[r.id,r.revision,now]),
      admin?q('SELECT * FROM organization_proposals_v1 WHERE round_id=$1 AND (round_revision=$2 OR applied_at IS NOT NULL) ORDER BY created_at DESC,id DESC LIMIT 1',[r.id,r.revision]):[],
      q('SELECT p.*,COUNT(m.user_id)::integer AS member_count,COALESCE(SUM(m.seed_power),0) AS power FROM organization_progress_v1 p LEFT JOIN organization_members_v1 m ON m.round_id=p.round_id AND m.organization_id=p.organization_id WHERE p.round_id=$1 GROUP BY p.round_id,p.organization_id,p.points,p.stage ORDER BY p.organization_id',[r.id])
    ]):[[],[],[],[],[],[]];
    const latest=proposal[0];
    return {ok:true,viewerId:Number(user.id),releaseEnabled:ORGANIZATION_RELEASE_ENABLED,preparation:ORGANIZATION_PREPARATION,round:r||null,policy:admin?p:{pointsPerRegion:p.pointsPerRegion,settlementMinutes:p.settlementMinutes,growthMode:p.growthMode,hideoutThresholds:p.hideoutThresholds,unlocks:p.unlocks},...(admin?{rounds}:{}),survey:survey[0]?{answers:parse(survey[0].answers_json),submitted:survey[0].active===1,preferredOrganizationId:Number(survey[0].preferred_id),revision:Number(survey[0].revision)}:null,membership:membership[0]?{organizationId:Number(membership[0].organization_id),slot:Number(membership[0].slot)}:null,participantCount:counts.reduce((n,c)=>n+c.n,0),ratedCount:ratingCount[0]?.n||0,organizations:ORGANIZATIONS.map(o=>{const s=progress.find(p=>Number(p.organization_id)===o.id);return {...o,applicants:counts.find(c=>Number(c.preferred_id)===o.id)?.n||0,memberCount:s?.member_count||0,power:Number(s?.power||0),hideout:organizationHideout(Number(s?.points||0),p)};}),proposal:latest?{id:latest.id,expiresAt:Number(latest.expires_at),appliedAt:latest.applied_at?Number(latest.applied_at):null,...parse(latest.result_json)}:null};
  });
}
async function refreshRatings(env,user,body,deps,now){
  const replay=await env.DB.enqueue(async()=>{const [row]=await qFor(env.DB)('SELECT * FROM organization_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,body.requestId]);return row;});
  if(replay){orgAssert(replay.fingerprint===await jointHash(canonical({path:'admin/organization/ratings',body})),'REQUEST_CONFLICT','같은 요청 식별자에 다른 내용을 사용할 수 없습니다.');return parse(replay.response_json);}
  if(body.restart===true)return mutation(env,user,'admin/organization/ratings',body,async q=>{const {r}=await lockedContext(q,user,body);orgAssert(r.phase==='CLOSED','PHASE','설문을 마감한 뒤 전력을 평가하세요.');await q('DELETE FROM organization_ratings_v1 WHERE round_id=$1',[r.id]);await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[r.id]);return {ok:true,ratedCount:0,done:false};},now);
  // Expensive account evaluation runs outside all organization transactions.
  const state=await env.DB.enqueue(async()=>{const q=qFor(env.DB),p=await policy(q),r=await round(q,body.roundId);access(p,user,r,{write:true});orgAssert(r.phase==='CLOSED','PHASE','설문을 마감한 뒤 전력을 평가하세요.');const rows=await participants(q,r);return {r,rows,ids:rows.filter(row=>!row.rating_json||Number(row.round_revision)!==Number(r.revision)||Number(row.expires_at)<=now).slice(0,12).map(row=>Number(row.user_id))};});
  orgAssert(state.rows.length,'EMPTY','설문 참가자가 없습니다.');
  const loader=deps.loadOrganizationRatings||(await import('./_organization_ratings.js')).loadOrganizationRatings;
  const ratings=state.ids.length?await loader(env,state.ids,deps,{now}):[];
  orgAssert(ratings.length===state.ids.length&&new Set(ratings.map(r=>r.userId)).size===ratings.length&&ratings.every(r=>state.ids.includes(r.userId)&&Number.isSafeInteger(r.power)&&r.power>0&&r.power<=1e12&&Number.isSafeInteger(r.expiresAt)&&r.expiresAt>now),'RATING_INVALID','전력 평가 결과를 확인하지 못했습니다.',503);
  return mutation(env,user,'admin/organization/ratings',body,async q=>{const {r}=await lockedContext(q,user,body);orgAssert(r.phase==='CLOSED'&&r.revision===state.r.revision,'STALE','설문 상태가 변경되었습니다. 다시 확인하세요.');for(const rating of ratings)await q('INSERT INTO organization_ratings_v1 VALUES($1,$2,$3,$4,$5) ON CONFLICT(round_id,user_id) DO UPDATE SET round_revision=excluded.round_revision,rating_json=excluded.rating_json,expires_at=excluded.expires_at',[r.id,rating.userId,r.revision,JSON.stringify(rating),rating.expiresAt]);const [{n}]=await q('SELECT COUNT(*)::integer AS n FROM organization_ratings_v1 WHERE round_id=$1 AND round_revision=$2 AND expires_at>$3',[r.id,r.revision,now]);return {ok:true,ratedCount:n,total:state.rows.length,done:n===state.rows.length};},now);
}
export async function handleOrganization({path,request,env,deps}){
  const admin=path==='admin/organization'||path.startsWith('admin/organization/');
  if(!admin&&!path.startsWith('organization/'))return null;
  const json=(data,status=200)=>deps.json(data,status,{'Cache-Control':'no-store'});
  try{
    const user=await deps.authenticate(request,env);orgAssert(user,'AUTH','로그인이 필요합니다.',401);if(admin)orgAssert(owner(user),'PERMISSION','조직 운영은 OWNER 전용입니다.',403);
    const now=(deps.now||Date.now)(),url=new URL(request.url);
    if(request.method==='GET'&&['organization/overview','admin/organization'].includes(path))return json(await organizationOverview(env,user,{roundId:url.searchParams.get('roundId')||undefined,admin,now}));
    orgAssert(request.method==='POST','METHOD','지원하지 않는 요청입니다.',405);
    const fields={
      'admin/organization/policy':['requestId','policy'],
      'admin/organization/create':['requestId','scope','name'],
      'admin/organization/phase':['requestId','roundId','revision','phase'],
      'organization/survey':['requestId','roundId','revision','preferredOrganizationId','answers'],
      'organization/withdraw':['requestId','roundId','revision'],
      'admin/organization/ratings':['requestId','roundId','restart'],
      'admin/organization/propose':['requestId','roundId'],
      'admin/organization/apply':['requestId','roundId','proposalId']
    }[path];orgAssert(fields,'ROUTE','요청 경로를 확인하세요.',404);
    const body=await readJointBody(request,{fields,maxBytes:32000});
    if(path==='admin/organization/ratings')return json(await refreshRatings(env,user,body,deps,now));
    return json(await mutation(env,user,path,body,async q=>{
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
      if(path==='admin/organization/phase'){
        orgAssert(body.revision===Number(r.revision),'STALE','모집 상태가 변경되었습니다. 다시 불러오세요.');
        orgAssert((body.phase==='SURVEY'&&['PREPARATION','CLOSED'].includes(r.phase))||(body.phase==='CLOSED'&&r.phase==='SURVEY'),'PHASE','현재 단계에서 변경할 수 없습니다.');
        await q('UPDATE organization_rounds_v1 SET phase=$1,revision=revision+1 WHERE id=$2',[body.phase,r.id]);return {ok:true,phase:body.phase,revision:Number(r.revision)+1};
      }
      if(path==='organization/survey'||path==='organization/withdraw'){
        orgAssert(r.phase==='SURVEY','SURVEY_CLOSED','희망 조직 설문이 열리지 않았습니다.');
        const [prior]=await q('SELECT revision,active FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]);orgAssert(body.revision===Number(prior?.revision||0),'STALE','다른 창에서 설문이 변경되었습니다. 다시 불러오세요.');
        if(path.endsWith('/withdraw')){orgAssert(prior?.active===1,'SURVEY_MISSING','제출한 설문이 없습니다.');await q('UPDATE organization_surveys_v1 SET active=0,revision=revision+1 WHERE round_id=$1 AND user_id=$2',[r.id,user.id]);}
        else{orgInteger(body.preferredOrganizationId,1,15,'희망 조직');const interview=reviewOrganizationAnswers(body.answers);await q('INSERT INTO organization_surveys_v1(round_id,user_id,preferred_id,revision,updated_at,answers_json) VALUES($1,$2,$3,1,$4,$5) ON CONFLICT(round_id,user_id) DO UPDATE SET preferred_id=excluded.preferred_id,revision=organization_surveys_v1.revision+1,updated_at=excluded.updated_at,answers_json=excluded.answers_json,active=1',[r.id,user.id,body.preferredOrganizationId,now,JSON.stringify(interview.answers)]);}
        await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[r.id]);return {ok:true,submitted:!path.endsWith('/withdraw')};
      }
      orgAssert(r.phase==='CLOSED','PHASE','설문 마감 후 배정안을 확인하세요.');
      const input=await inputFor(q,r,now);
      if(r.scope==='TEST')orgAssert(input.rows.every(row=>owner(row)||p.testUserIds.includes(Number(row.user_id))),'TEST_USERS_CHANGED','테스트 참가자 명단이 변경되었습니다. 설문을 다시 확인하세요.');
      if(path==='admin/organization/propose'){
        const result=allocateOrganizations(input.players,{seed:r.id}),id=crypto.randomUUID(),expiresAt=Math.min(...input.ratings.map(r=>r.expiresAt));
        await q('INSERT INTO organization_proposals_v1(id,round_id,round_revision,input_hash,result_json,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,r.id,r.revision,input.hash,JSON.stringify(result),expiresAt,now]);
        return {ok:true,proposal:{id,expiresAt,...result}};
      }
      const [proposal]=await q('SELECT * FROM organization_proposals_v1 WHERE id=$1 AND round_id=$2 FOR UPDATE',[body.proposalId,r.id]);
      orgAssert(proposal&&Number(proposal.round_revision)===Number(r.revision)&&Number(proposal.expires_at)>now&&proposal.input_hash===input.hash,'STALE_PROPOSAL','배정안 또는 전력 정보가 변경되었습니다. 다시 평가하세요.');
      const validate=deps.validateOrganizationRatingsLocked||(await import('./_organization_ratings.js')).validateOrganizationRatingsLocked;
      orgAssert(await validate(q,input.ratings,{now}),'RATING_CHANGED','계정 전력이 변경되었습니다. 전력 재평가 후 배정안을 다시 만드세요.');
      const result=parse(proposal.result_json),expected=allocateOrganizations(input.players,{seed:r.id});orgAssert(await jointHash(result)===await jointHash(expected),'PROPOSAL_INVALID','배정안 검증에 실패했습니다.',503);
      const entries=result.organizations.flatMap(o=>o.members.map(m=>({user_id:m.userId,organization_id:o.id,slot:m.slot,seed_power:m.power})));
      await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,x.user_id,x.organization_id,x.slot,x.seed_power,$3 FROM json_to_recordset($2::json) AS x(user_id bigint,organization_id int,slot int,seed_power bigint)',[r.id,JSON.stringify(entries),now]);
      await q('INSERT INTO organization_progress_v1(round_id,organization_id) SELECT $1,generate_series(1,15)',[r.id]);
      await q("UPDATE organization_rounds_v1 SET phase='ASSIGNED',revision=revision+1,assigned_at=$2 WHERE id=$1",[r.id,now]);await q('UPDATE organization_proposals_v1 SET applied_at=$2 WHERE id=$1',[proposal.id,now]);
      return {ok:true,assigned:entries.length,stats:result.stats,scope:r.scope};
    },now));
  }catch(error){const known=/^(ORG_|JOINT_|DUO_)/.test(error.code||'');if(!known)deps.onError?.(error);return json({ok:false,code:known?error.code:'ORG_UNAVAILABLE',error:known?error.message:'조직 요청을 처리하지 못했습니다. 잠시 후 같은 요청으로 다시 확인하세요.'},known?(error.status||409):503);}
}
