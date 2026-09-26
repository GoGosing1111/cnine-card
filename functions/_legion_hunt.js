import {createHuntSession,restoreHuntSession,DIFFICULTIES} from '../preview/sustained-hunt-v2/session.mjs';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {LEGION_HUNT_ACCESS,legionHuntCatalog,readLegionHuntPolicy,saveLegionHuntPolicy} from './_legion_hunt_settings.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {DAILY_ENTRIES} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
const TTL=30*60*1000;
const ACTIONS={start:['difficulty','version'],begin:['id'],reveal:['id','seq'],claim:['id','dropId','token','x','y'],finish:['id','seq'],cancel:['id']};
export function legionHuntEntries(run,at){
  const day=new Date(at+9*3600000).toISOString().slice(0,10);
  const used=run?.daily?.day===day?Number(run.daily.used):0;
  if(!Number.isInteger(used)||used<0||used>DAILY_ENTRIES)throw jointError('HUNT_ENTRIES_UNAVAILABLE','입장 기록을 확인할 수 없습니다.',503);
  return {day,used,limit:DAILY_ENTRIES,remaining:DAILY_ENTRIES-used,resetsAt:Date.parse(day+'T00:00:00+09:00')+86400000};
}
function requireEntry(entries){
  if(entries.remaining<=0)throw jointError('HUNT_DAILY_LIMIT','오늘 입장 2회를 모두 사용했습니다. 한국시간 자정에 초기화됩니다.',409);
}
async function accountSnapshot(env,user,deps){
  try{return await loadScrapyardV3Snapshot(env,user,deps);}
  catch(error){
    if(error.code==='SCRAPYARD_V3_DECK'||/덱|보유하지 않은/.test(error.message||''))throw jointError('HUNT_DECK','저장된 PVE 덱 5장을 확인해 주세요. 편성을 저장한 뒤 다시 불러오세요.',409);
    throw error;
  }
}
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
    const now=deps.now||Date.now,key='legion_hunt_owner_session_v1:'+Number(user.id);
    if(action==='bootstrap'&&request.method==='GET'){
      const [{policy},saved]=await Promise.all([readLegionHuntPolicy(env),loadRun(env,key)]);
      let loadout=null,loadoutError=null;
      try{loadout=await accountSnapshot(env,user,deps);}catch(error){if(error.code!=='HUNT_DECK')throw error;loadoutError=error.message;}
      return json({ok:true,access:LEGION_HUNT_ACCESS,difficulties:DIFFICULTIES,entries:legionHuntEntries(saved.run,now()),loadout,loadoutError,revision:policy.revision,activeItems:policy.items.filter(i=>i.enabled&&i.weight>0).length});
    }
    if(!Object.hasOwn(ACTIONS,action))return json({error:'군단토벌 경로를 확인하세요.'},404);
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{maxBytes:4096,fields:ACTIONS[action]});
    if(action==='start'&&!DIFFICULTIES.some(d=>d.id===body.difficulty))throw jointError('HUNT_SELECTION','난이도를 선택하세요.');
    if(action==='start'&&body.version!==2)throw jointError('HUNT_CLIENT_UPDATE','군단토벌이 15분 토벌로 변경됐습니다. 게임을 새로고침한 뒤 입장하세요.',409);
    if(action!=='start'&&!idValid(body.id))throw jointError('HUNT_SESSION','원정 번호를 확인하세요.');
    return json(await deps.withUserMutationLock(env,user.id,path,async()=>{
      const before=await loadRun(env,key),entries=legionHuntEntries(before.run,now());
      if(action==='start'){
        requireEntry(entries);
        const {policy}=await readLegionHuntPolicy(env),d=policy.difficulties.find(r=>r.id===body.difficulty);
        if(!d)throw jointError('HUNT_POLICY_UNAVAILABLE','난이도별 드랍 설정을 확인하세요.',503);
        const snapshot=await accountSnapshot(env,user,deps);
        const session=(deps.createSession||createHuntSession)({snapshot,...body,now,dropPolicy:{dropChance:d.dropPercent/100,bossDropChance:d.bossDropPercent/100,dropLifeMs:d.lifetimeSeconds*1000,items:policy.items}});
        await saveRun(env,key,before.raw,{daily:before.run?.daily||null,expiresAt:now()+TTL,configRevision:policy.revision,state:session.exportState()});
        return {ok:true,id:session.id,payload:session.payload,entries,configRevision:policy.revision};
      }
      if(!before.run||before.run.state?.id!==body.id||before.run.expiresAt<=now())throw jointError('HUNT_SESSION_EXPIRED','원정이 만료됐습니다. 다시 출전하세요.',409);
      const session=restoreHuntSession(before.run.state,{now});
      let result,daily=before.run.daily||null;
      if(action==='begin'){
        if(before.run.state.startedAt===null&&!before.run.state.ended){
          requireEntry(entries);daily={day:entries.day,used:entries.used+1};
        }
        result={...session.begin(),entries:legionHuntEntries({daily},now())};
      }
      if(action==='reveal')result=session.reveal(body.seq);
      if(action==='claim')result=session.claim(body);
      if(action==='finish')result=session.finish(body.seq);
      if(action==='cancel'){session.cancel();result={cancelled:true};}
      await saveRun(env,key,before.raw,{...before.run,daily,state:session.exportState()});
      return result;
    }));
  }catch(error){
    if(error.code?.startsWith('HUNT_'))return json({ok:false,code:error.code,error:error.message},error.status||400);
    if(/^(?:HUNT_|INVALID_HUNT_|INVALID_DROP_|DROP_)[A-Z_]+$/.test(error.message||''))return json({ok:false,code:error.message,error:error.message},409);
    return jointResponseError(error,json);
  }
}
