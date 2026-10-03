import {createHuntSession,restoreHuntSession,DIFFICULTIES} from '../preview/sustained-hunt-v2/session.mjs';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {legionHuntAccess,canAccessLegionHunt,legionHuntCatalog,legionHuntTestUsers,searchLegionHuntTestUsers,readLegionHuntPolicy,saveLegionHuntPolicy} from './_legion_hunt_settings.js';
import {claimLegionHuntReward,settleLegionHuntRewards} from './_legion_hunt_rewards.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {DAILY_ENTRIES} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
import {readMiracleDropPercent,applyMiracleDropChance} from './_miracle_burning.js';
const TTL=30*60*1000;
const ACTIONS={start:['difficulty','version'],begin:['id'],reveal:['id','seq','seqs'],claim:['id','dropId','token','x','y'],finish:['id','seq'],cancel:['id'],recover:[]};
export function legionHuntEntries(run,at,user){
  const day=new Date(at+9*3600000).toISOString().slice(0,10);
  const used=run?.daily?.day===day?Number(run.daily.used):0;
  if(!Number.isInteger(used)||used<0||used>DAILY_ENTRIES)throw jointError('HUNT_ENTRIES_UNAVAILABLE','입장 기록을 확인할 수 없습니다.',503);
  const unlimited=user?.role==='OWNER';
  return {day,used,unlimited,limit:unlimited?null:DAILY_ENTRIES,remaining:unlimited?null:DAILY_ENTRIES-used,resetsAt:Date.parse(day+'T00:00:00+09:00')+86400000};
}
function requireEntry(entries){
  if(!entries.unlimited&&entries.remaining<=0)throw jointError('HUNT_DAILY_LIMIT','오늘 입장 2회를 모두 사용했습니다. 한국시간 자정에 초기화됩니다.',409);
}
function requireAccess(policy,user){
  const access=legionHuntAccess(policy);
  if(!access.ownerEnabled)throw jointError('HUNT_CLOSED','군단토벌은 현재 운영하지 않습니다.',423);
  if(!canAccessLegionHunt(policy,user))throw jointError('HUNT_TEST_ONLY','군단토벌은 지정된 테스트 참여자만 이용할 수 있습니다.',403);
  return access;
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
  return {raw,run};
}
async function settleRun(env,user,{key,before,policyRaw,access}){
  if(!before.run.liveRewards){
    const saved=await saveRun(env,key,before.raw,{...before.run,rewardStatus:'SETTLED'});
    return {saved,result:saved.run.state.receipt};
  }
  if(!access.liveRewards)throw jointError('HUNT_REWARD_PAUSED','보상 지급이 일시 중지됐습니다. 종료 기록은 보관되며 재개 후 정산됩니다.',423);
  const result=await settleLegionHuntRewards(env,user,{key,before:before.raw,run:before.run,policyRaw});
  return {saved:await loadRun(env,key),result};
}
// Entering the lobby/start of a new run abandons only an unfinished expedition.
// A persisted finish intent always settles first, even after a lost reply or TTL.
async function recoverRun(env,user,{key,before,policyRaw,access,at}){
  const run=before.run,state=run?.state;
  if(!state)return {saved:before,recovery:null};
  if(run.rewardTiming==='FINISH'&&state.receipt&&run.rewardStatus!=='SETTLED'){
    const settled=await settleRun(env,user,{key,before,policyRaw,access});
    return {...settled,recovery:{kind:'SETTLED',receipt:settled.result}};
  }
  if(state.receipt||run.interruption)return {saved:before,recovery:null};
  const charged=run.entry?run.entry.charged:state.startedAt!=null&&user.role!=='OWNER';
  const day=run.entry?.day||(state.startedAt!=null?legionHuntEntries(null,state.startedAt,user).day:null);
  const refund=charged&&run.daily?.day===day&&Number(run.daily.used)>0;
  const daily=refund?{...run.daily,used:run.daily.used-1}:run.daily;
  const interruption={id:state.id,kind:'INTERRUPTED',at,refunded:!!refund,day};
  const saved=await saveRun(env,key,before.raw,{...run,daily,entry:{...run.entry,charged:!!charged,day,status:'REFUNDED'},interruption,state:{...state,ended:true}});
  return {saved,recovery:interruption};
}
export async function handleLegionHunt({path,request,env,deps}){
  if(!path.startsWith('legion-hunt/')&&!['admin/legion-hunt','admin/legion-hunt/test-users'].includes(path))return null;
  const json=deps.json;
  try{
    const user=await deps.authenticate(request,env);
    if(!user)throw jointError('JOINT_AUTH','로그인이 필요합니다.',401);
    if(path==='admin/legion-hunt'||path==='admin/legion-hunt/test-users'){
      if(user.role!=='OWNER')throw jointError('JOINT_PERMISSION','운영 설정은 OWNER만 변경할 수 있습니다.',403);
      if(path==='admin/legion-hunt/test-users'){
        if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405);
        return json({ok:true,users:await searchLegionHuntTestUsers(env,new URL(request.url).searchParams.get('q'))});
      }
      if(request.method==='GET'){
        const [{policy},catalog]=await Promise.all([readLegionHuntPolicy(env),legionHuntCatalog(env)]);
        return json({ok:true,access:legionHuntAccess(policy),policy,catalog,testUsers:await legionHuntTestUsers(env,policy.testUserIds)});
      }
      if(request.method!=='PATCH')return json({error:'지원하지 않는 요청입니다.'},405);
      const body=await readJointBody(request,{maxBytes:131072,fields:['policy']});
      const policy=await deps.withUserMutationLock(env,user.id,path,()=>saveLegionHuntPolicy(env,user,body.policy));
      return json({ok:true,access:legionHuntAccess(policy),policy});
    }
    const action=path.slice('legion-hunt/'.length);
    const now=deps.now||Date.now,key='legion_hunt_owner_session_v1:'+Number(user.id);
    if(action==='status'&&request.method==='GET'){
      const {policy}=await readLegionHuntPolicy(env);
      return json({ok:true,access:legionHuntAccess(policy),canEnter:canAccessLegionHunt(policy,user)});
    }
    if(action==='bootstrap'&&request.method==='GET'){
      const {policy}=await readLegionHuntPolicy(env),access=requireAccess(policy,user);
      const saved=await loadRun(env,key);
      let loadout=null,loadoutError=null;
      try{loadout=await accountSnapshot(env,user,deps);}catch(error){if(error.code!=='HUNT_DECK')throw error;loadoutError=error.message;}
      return json({ok:true,access,difficulties:DIFFICULTIES,entries:legionHuntEntries(saved.run,now(),user),loadout,loadoutError,revision:policy.revision,activeItems:policy.items.filter(i=>i.enabled&&i.weight>0).length});
    }
    if(!Object.hasOwn(ACTIONS,action))return json({error:'군단토벌 경로를 확인하세요.'},404);
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{maxBytes:4096,fields:ACTIONS[action]});
    if(action==='start'&&!DIFFICULTIES.some(d=>d.id===body.difficulty))throw jointError('HUNT_SELECTION','난이도를 선택하세요.');
    if(action==='start'&&body.version!==4)throw jointError('HUNT_CLIENT_UPDATE','군단토벌 중단 복구와 보상 정산이 개선됐습니다. 게임을 새로고침한 뒤 입장하세요.',409);
    if(!['start','recover'].includes(action)&&!idValid(body.id))throw jointError('HUNT_SESSION','원정 번호를 확인하세요.');
    return json(await deps.withUserMutationLock(env,user.id,path,async()=>{
      const {policy,raw:policyRaw}=await readLegionHuntPolicy(env),access=action==='recover'?legionHuntAccess(policy):requireAccess(policy,user);
      let before=await loadRun(env,key),recovery=null;
      if(action==='recover'||action==='start'){
        const recovered=await recoverRun(env,user,{key,before,policyRaw,access,at:now()});before=recovered.saved;recovery=recovered.recovery;
      }
      const entries=legionHuntEntries(before.run,now(),user);
      if(action==='recover')return {ok:true,recovery,entries};
      if(action==='start'){
        requireEntry(entries);
        const d=policy.difficulties.find(r=>r.id===body.difficulty);
        if(!d)throw jointError('HUNT_POLICY_UNAVAILABLE','난이도별 드랍 설정을 확인하세요.',503);
        const snapshot=await accountSnapshot(env,user,deps);
        const miracleDropPercent=await readMiracleDropPercent(env);
        const session=(deps.createSession||createHuntSession)({snapshot,...body,now,dropPolicy:{dropChance:applyMiracleDropChance(d.dropPercent,miracleDropPercent)/100,bossDropChance:applyMiracleDropChance(d.bossDropPercent,miracleDropPercent)/100,dropLifeMs:d.lifetimeSeconds*1000,items:policy.items}});
        await saveRun(env,key,before.raw,{daily:before.run?.daily||null,expiresAt:now()+TTL,configRevision:policy.revision,liveRewards:access.liveRewards,rewardTiming:'FINISH',entry:{charged:false,status:'READY'},state:session.exportState()});
        return {ok:true,id:session.id,payload:session.payload,entries,access,recovery,configRevision:policy.revision};
      }
      if(!before.run||before.run.state?.id!==body.id)throw jointError('HUNT_SESSION_EXPIRED','원정이 만료됐습니다. 입장 화면에서 복구 후 다시 출전하세요.',409);
      if(action==='cancel'){
        const recovered=await recoverRun(env,user,{key,before,policyRaw,access,at:now()});
        return {cancelled:!recovered.saved.run.state.receipt,recovery:recovered.recovery,entries:legionHuntEntries(recovered.saved.run,now(),user)};
      }
      if(before.run.state.receipt){
        if(action==='finish')return before.run.rewardTiming==='FINISH'&&before.run.rewardStatus!=='SETTLED'?(await settleRun(env,user,{key,before,policyRaw,access})).result:before.run.state.receipt;
        throw jointError('HUNT_ENDED','이미 종료된 원정입니다.',409);
      }
      if(before.run.interruption||before.run.expiresAt<=now())throw jointError('HUNT_SESSION_EXPIRED','원정이 중단됐습니다. 입장 화면에서 횟수를 복구해 주세요.',409);
      const session=restoreHuntSession(before.run.state,{now});
      let result,daily=before.run.daily||null;
      if(action==='begin'){
        if(before.run.state.startedAt===null&&!before.run.state.ended){
          requireEntry(entries);
          if(!entries.unlimited)daily={day:entries.day,used:entries.used+1};
          before.run.entry={day:entries.day,charged:!entries.unlimited,status:'RESERVED'};
        }
        result={...session.begin(),entries:legionHuntEntries({daily},now(),user)};
      }
      if(action==='reveal'){
        if(body.seqs!==undefined&&body.seq!==undefined)throw jointError('HUNT_DROP_BATCH','드랍 확인 요청을 다시 확인하세요.');
        result=body.seqs!==undefined?session.revealMany(body.seqs):session.reveal(body.seq);
      }
      if(action==='claim'){
        result=session.claim(body);
        if(before.run.state.claims?.some(([id])=>id===body.dropId))return result;
        // TEST sessions never become paying sessions after an operator mode change.
        if(before.run.liveRewards===true){
          if(!access.liveRewards)throw jointError('HUNT_REWARD_PAUSED','실계정 보상 지급이 중지됐습니다. 운영 모드를 확인해 주세요.',423);
          if(before.run.rewardTiming!=='FINISH')return claimLegionHuntReward(env,user,{key,before:before.raw,run:{...before.run,state:session.exportState()},policyRaw,result});
          result.pendingRewards=true;
        }
        result.liveRewards=false;
      }
      if(action==='finish'){
        result=Object.assign(session.finish(body.seq),{previewOnly:before.run.liveRewards!==true,liveRewards:false,entries});
        if(before.run.rewardTiming==='FINISH'){
          before=await saveRun(env,key,before.raw,{...before.run,entry:{...before.run.entry,status:'CONSUMED'},rewardStatus:'PENDING',finishRequestedAt:now(),state:session.exportState()});
          return (await settleRun(env,user,{key,before,policyRaw,access})).result;
        }
        result.liveRewards=before.run.liveRewards===true;
      }
      await saveRun(env,key,before.raw,{...before.run,daily,state:session.exportState()});
      return result;
    }));
  }catch(error){
    if(error.code?.startsWith('HUNT_'))return json({ok:false,code:error.code,error:error.message},error.status||400);
    if(/^(?:HUNT_|INVALID_HUNT_|INVALID_DROP_|DROP_)[A-Z_]+$/.test(error.message||''))return json({ok:false,code:error.message,error:error.message},409);
    return jointResponseError(error,json);
  }
}
