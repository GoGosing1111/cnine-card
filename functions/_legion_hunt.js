import {createHuntSession,restoreHuntSession,DIFFICULTIES,PARTIES} from '../preview/sustained-hunt-v2/session.mjs';
import {LEGION_HUNT_REVIEW_FIXTURE} from '../shared/legion-hunt-review-fixture-v1.mjs';
import {LEGION_HUNT_ACCESS,legionHuntCatalog,readLegionHuntPolicy,saveLegionHuntPolicy} from './_legion_hunt_settings.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
const TTL=30*60*1000;
const ACTIONS={start:['difficulty','party'],begin:['id'],reveal:['id','seq'],claim:['id','dropId','token','x','y'],finish:['id','seq'],cancel:['id']};
const idValid=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id);
async function loadRun(env,key){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)return {raw:null,run:null};
  try{return {raw:row.value,run:JSON.parse(row.value)};}catch{throw jointError('HUNT_SESSION_UNAVAILABLE','원정 기록을 읽을 수 없습니다. 다시 출전하세요.',503);}
}
async function saveRun(env,key,before,run){
  const raw=JSON.stringify(run);
  const statement=before===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(key,raw):
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,key,before);
  if(Number((await statement.run()).meta?.changes)!==1)throw jointError('HUNT_SESSION_CONFLICT','다른 요청을 처리 중입니다. 같은 요청으로 다시 시도하세요.',409);
}
export async function handleLegionHunt({path,request,env,deps}){
  if(!path.startsWith('legion-hunt/')&&path!=='admin/legion-hunt')return null;
  const json=deps.json;
  try{
    const user=await deps.authenticate(request,env);
    if(!user)throw jointError('JOINT_AUTH','로그인이 필요합니다.',401);
    if(user.role!=='OWNER')throw jointError('JOINT_PERMISSION','군단토벌은 OWNER 검수 중입니다.',403);
    if(path==='admin/legion-hunt'){
      if(request.method==='GET'){
        const [{policy},catalog]=await Promise.all([readLegionHuntPolicy(env),legionHuntCatalog(env)]);
        return json({ok:true,access:LEGION_HUNT_ACCESS,policy,catalog});
      }
      if(request.method!=='PATCH')return json({error:'지원하지 않는 요청입니다.'},405);
      const body=await readJointBody(request,{maxBytes:131072,fields:['policy']});
      const policy=await deps.withUserMutationLock(env,user.id,path,()=>saveLegionHuntPolicy(env,user,body.policy));
      return json({ok:true,access:LEGION_HUNT_ACCESS,policy});
    }
    const action=path.slice('legion-hunt/'.length);
    if(action==='bootstrap'&&request.method==='GET'){
      const {policy}=await readLegionHuntPolicy(env);
      return json({ok:true,access:LEGION_HUNT_ACCESS,difficulties:DIFFICULTIES,parties:PARTIES,revision:policy.revision,activeItems:policy.items.filter(i=>i.enabled&&i.weight>0).length});
    }
    if(!Object.hasOwn(ACTIONS,action))return json({error:'군단토벌 경로를 확인하세요.'},404);
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{maxBytes:4096,fields:ACTIONS[action]}),now=deps.now||Date.now;
    if(action==='start'&&(!DIFFICULTIES.some(d=>d.id===body.difficulty)||!PARTIES.some(p=>p.id===body.party)))throw jointError('HUNT_SELECTION','난이도와 검수 원정대를 선택하세요.');
    if(action!=='start'&&!idValid(body.id))throw jointError('HUNT_SESSION','원정 번호를 확인하세요.');
    return json(await deps.withUserMutationLock(env,user.id,path,async()=>{
      const key='legion_hunt_owner_session_v1:'+Number(user.id),before=await loadRun(env,key);
      if(action==='start'){
        const {policy}=await readLegionHuntPolicy(env),d=policy.difficulties.find(r=>r.id===body.difficulty);
        if(!d)throw jointError('HUNT_POLICY_UNAVAILABLE','난이도별 드랍 설정을 확인하세요.',503);
        const session=(deps.createSession||createHuntSession)({...LEGION_HUNT_REVIEW_FIXTURE,...body,now,dropPolicy:{dropChance:d.dropPercent/100,bossDropChance:d.bossDropPercent/100,dropLifeMs:d.lifetimeSeconds*1000,items:policy.items}});
        await saveRun(env,key,before.raw,{expiresAt:now()+TTL,configRevision:policy.revision,state:session.exportState()});
        return {ok:true,id:session.id,payload:session.payload,configRevision:policy.revision};
      }
      if(!before.run||before.run.state?.id!==body.id||before.run.expiresAt<=now())throw jointError('HUNT_SESSION_EXPIRED','원정이 만료됐습니다. 다시 출전하세요.',409);
      const session=restoreHuntSession(before.run.state,{now});
      let result;
      if(action==='begin')result=session.begin();
      if(action==='reveal')result=session.reveal(body.seq);
      if(action==='claim')result=session.claim(body);
      if(action==='finish')result=session.finish(body.seq);
      if(action==='cancel'){session.cancel();result={cancelled:true};}
      await saveRun(env,key,before.raw,{...before.run,state:session.exportState()});
      return result;
    }));
  }catch(error){
    if(error.code?.startsWith('HUNT_'))return json({ok:false,code:error.code,error:error.message},error.status||400);
    if(/^(?:HUNT_|INVALID_HUNT_|INVALID_DROP_|DROP_)[A-Z_]+$/.test(error.message||''))return json({ok:false,code:error.message,error:error.message},409);
    return jointResponseError(error,json);
  }
}
