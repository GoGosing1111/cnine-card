import {handleIdleDungeon} from './_idle_dungeon.js';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {buildIdleV3Playback} from './_idle_v3_playback.js';
import {readJointBody,jointError} from './_joint_request.js';
import {claimIdleV3} from './_idle_v3_claim.js';
export async function handleIdleV3Ready({path,request,env,user,deps}){
  const versioned=path.startsWith('idle-dungeon/v3/'),action=path.slice(versioned?'idle-dungeon/v3/'.length:'idle-dungeon/'.length);
  const canonical=action==='state'?'status':action;
  if(!['status','start','stop','heartbeat','claim'].includes(canonical))return deps.json({error:'원정 경로를 찾을 수 없습니다.'},404);
  if(request.method!==(canonical==='status'?'GET':'POST'))return deps.json({error:'지원하지 않는 요청입니다.'},405);
  let body;if(request.method==='POST')body=await readJointBody(request,{fields:canonical==='start'?['difficulty','sessionId']:canonical==='claim'?['requestId']:['sessionId']});
  if(typeof deps.withUserMutationLock!=='function')throw jointError('PVE_V3_LOCK','계정 잠금 서비스를 확인하세요.',503);
  return deps.withUserMutationLock(env,user.id,path,async()=>{
    const result=await handleIdleDungeon({path:`idle-dungeon/${canonical==='claim'?'status':canonical}`,request,env,deps:{...deps,authenticate:async()=>user,
      isAdminRole:u=>u.role==='OWNER',readBody:async()=>body}});
    if(canonical==='claim')return result.ok?deps.json(await claimIdleV3(env,user,body)):result;
    if(!versioned||canonical!=='status'||!result.ok)return result;
    const state=await result.json(),snapshot=await loadScrapyardV3Snapshot(env,user,deps);
    return deps.json({...state,accountId:Number(user.id),battle:buildIdleV3Playback(snapshot,state)});
  });
}
