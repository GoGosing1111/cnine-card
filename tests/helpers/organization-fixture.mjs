import {ORGANIZATION_INTERVIEW} from '../../shared/organization-interview-v1.mjs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {installOrganizationSchema} from '../../functions/_organization_schema.js';
import {handleOrganization} from '../../functions/_organization.js';

export async function organizationFixture(t,{people=30}={}){
  const pg=new PGlite(),queries=[];let failAt='',clock=Date.parse('2026-10-15T03:00:00Z'),ratingPolicyRevision=1;
  await pg.exec("CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,banned_until TEXT);CREATE TABLE qa_ratings(user_id BIGINT PRIMARY KEY,power BIGINT,version INTEGER);CREATE TABLE clan_members(user_id BIGINT,clan_id BIGINT);INSERT INTO clan_members VALUES(2,8);");
  const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;queries.push(sql);if(failAt&&sql.includes(failAt))throw Error('INJECTED_ORGANIZATION_FAILURE');const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
  await installOrganizationSchema(DB);
  await pg.query("INSERT INTO users VALUES(1,'검수 운영자','OWNER','ACTIVE',NULL)");
  for(let id=2;id<people+2;id++){
    await pg.query("INSERT INTO users VALUES($1,$2,'USER','ACTIVE',NULL)",[id,'검수 참가자 '+String(id-1).padStart(3,'0')]);
    await pg.query('INSERT INTO qa_ratings VALUES($1,$2,1)',[id,1500+(id*173)%8500]);
  }
  const env={DB},errors=[];
  const deps={now:()=>clock,json:(body,status=200,headers={})=>Response.json(body,{status,headers}),onError:error=>errors.push(error),authenticate:async request=>(await pg.query('SELECT * FROM users WHERE id=$1',[Number(request.headers.get('x-qa-user'))])).rows[0]||null,
    loadOrganizationRatings:async(_env,ids)=> (await pg.query('SELECT * FROM qa_ratings WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids])).rows.map(row=>({userId:Number(row.user_id),power:Number(row.power),sourceVersion:Number(row.version),policyRevision:ratingPolicyRevision,expiresAt:clock+300000,source:'ISOLATED_FIXTURE'})),
    staleOrganizationRatingIds:async(q,ratings,{now=clock,minimumValidityMs=0,requireCurrentSource=true}={})=>{const rows=await q('SELECT * FROM qa_ratings WHERE user_id=ANY($1::bigint[])',[ratings.map(r=>r.userId)]);return ratings.filter(r=>r.expiresAt<=now+minimumValidityMs||r.policyRevision!==ratingPolicyRevision||!rows.some(row=>Number(row.user_id)===r.userId&&(!requireCurrentSource||Number(row.version)===r.sourceVersion))).map(r=>r.userId);},
    validateOrganizationRatingsLocked:async(q,ratings,{requireCurrentSource=true}={})=>{const rows=await q('SELECT * FROM qa_ratings WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ratings.map(r=>r.userId)]);return ratings.every(r=>rows.some(row=>Number(row.user_id)===r.userId&&(!requireCurrentSource||Number(row.version)===r.sourceVersion)&&r.policyRevision===ratingPolicyRevision&&r.expiresAt>clock));}};
  const call=async(path,{user=1,method='GET',body,headers={}}={})=>{
    const response=await handleOrganization({path:path.split('?')[0],request:new Request('http://127.0.0.1:4287/api/'+path,{method,headers:{'x-qa-user':String(user),'Content-Type':'application/json',Origin:'http://127.0.0.1:4287',...headers},...(body?{body:JSON.stringify(body)}:{})}),env,deps});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  const post=(path,body={},options={})=>call(path,{...options,method:'POST',body:{requestId:crypto.randomUUID(),...(path==='organization/survey'?{answers:Object.fromEntries(ORGANIZATION_INTERVIEW.map((q,i)=>[q.id,q.options[(Number(options.user||2)+i*3)%4].id]))}:{}),...body}});
  async function prepare({survey=true,enroll=0}={}){
    const initial=await call('admin/organization');
    let response=await post('admin/organization/policy',{policy:{...initial.data.policy,testUserIds:Array.from({length:people},(_,i)=>i+2)}});if(response.status!==200)throw Error(JSON.stringify(response));
    response=await post('admin/organization/create',{scope:'TEST',name:'조직 시스템 1차 검수'});if(response.status!==200)throw Error(JSON.stringify(response));const id=response.data.roundId;
    if(survey)await post('admin/organization/phase',{roundId:id,revision:0,phase:'SURVEY'});
    for(let user=2;user<enroll+2;user++){response=await post('organization/survey',{roundId:id,revision:0,preferredOrganizationId:user%4+1},{user});if(response.status!==200)throw Error(JSON.stringify(response));}
    return id;
  }
  async function close(roundId){const state=await call('admin/organization?roundId='+roundId);return post('admin/organization/phase',{roundId,revision:state.data.round.revision,phase:'CLOSED'});}
  async function rate(roundId){for(let step=0;step<13;step++){const response=await post('admin/organization/ratings',{roundId});if(response.status!==200||response.data.done)return response;}throw Error('Rating batch exceeded');}
  const closeDb=()=>pg.close();t?.after(closeDb);
  return {env,pg,deps,call,post,prepare,close,rate,queries,errors,advance:ms=>clock+=ms,fail:value=>failAt=value,clock:()=>clock,bumpRatingPolicy:()=>++ratingPolicyRevision,closeDb};
}
