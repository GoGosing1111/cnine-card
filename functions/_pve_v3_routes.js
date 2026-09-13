import {V3_JOINT_RELEASE_ENABLED,v3JointReleaseState} from '../shared/v3-joint-release-v1.mjs';
import {isPvePublicPath} from '../shared/pve-public-release-v2092.mjs';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {runScrapyardV3,scrapyardV3RecoveryStatus,scrapyardV3Result} from './_scrapyard_v3_runs.js';
import {readScrapyardSettings,readScrapyardStatus} from './_scrapyard.js';
import {runTowerV3,towerV3Status,towerV3Result} from './_tower_v3_runs.js';
import {loadTowerV3Legacy} from './_tower_v3_legacy.js';
import {readTowerV3Settings,saveTowerV3Draft} from './_tower_v3_settings.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {runExpeditionV3,expeditionV3Status,expeditionV3Result} from './_expedition_v3_runs.js';
import {readExpeditionPolicy,saveExpeditionDraft} from './_expedition_v3_settings.js';
import {handleIdleV3Ready} from './_idle_v3_routes.js';
import {cowPortalStatus,COW_PORTAL_POLICY} from './_cow_room_portal.js';

export const PVE_V3_PREFIXES=Object.freeze(['tower/v3/','scrapyard/v3/','cow-room/v3/','idle-dungeon/v3/']);
export const isPveV3Path=path=>PVE_V3_PREFIXES.some(prefix=>path.startsWith(prefix));
const failHeld=json=>json({ok:false,code:'PVE_V3_RELEASE_HELD',error:'공동 업데이트를 준비 중입니다.',enabled:false},423);

function towerDependencies(env,deps){
  // One request reads one coherent settings document. Later requests see edits.
  let settings;
  const read=()=>settings||(settings=readTowerV3Settings(env));
  return {loadLegacy:loadTowerV3Legacy,loadSnapshot:(env,user)=>loadScrapyardV3Snapshot(env,user,deps),
    readConfig:async()=>structuredClone((await read()).config),readEconomy:async()=>structuredClone((await read()).economy)};
}

// Public entry: hard release hold is checked before authentication or DB access.
export async function handlePveV3({path,request,env,deps}){
  if(path==='pve/v3/feature')return request.method==='GET'?deps.json(v3JointReleaseState()):deps.json({error:'GET 요청이 필요합니다.'},405);
  if(!isPveV3Path(path)&&path!=='admin/pve-v3'&&!(V3_JOINT_RELEASE_ENABLED&&path.startsWith('idle-dungeon/')))return null;
  if(!V3_JOINT_RELEASE_ENABLED&&!isPvePublicPath(path)&&path!=='admin/pve-v3')return failHeld(deps.json);
  return handlePveV3Ready({path,request,env,deps});
}

// Same authenticated handler used by the local account harness. It never trusts
// a user ID, deck, seed, reward or battle result supplied by the browser.
export async function handlePveV3Ready({path,request,env,deps}){
  const {json,authenticate,withUserMutationLock}=deps;
  try{
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.',code:'PVE_V3_AUTH'},401);
    if(path.startsWith('idle-dungeon/'))return await handleIdleV3Ready({path,request,env,user,deps});
    if(path==='admin/pve-v3'){
      if(user.role!=='OWNER')return json({error:'OWNER만 개편 설정을 관리할 수 있습니다.'},403);
      if(request.method==='GET')return json({release:v3JointReleaseState(),tower:await readTowerV3Settings(env,{draft:true}),cow:await readExpeditionPolicy(env,'COW_ROOM',{draft:true}),cowPortal:COW_PORTAL_POLICY});
      if(request.method!=='PATCH')return json({error:'지원하지 않는 요청입니다.'},405);
      const body=await readJointBody(request,{maxBytes:32000,fields:['content','revision','config','economy']});
      if(!['TOWER','COW_ROOM'].includes(body.content))throw jointError('PVE_V3_CONTENT','콘텐츠를 확인하세요.');
      if(typeof withUserMutationLock!=='function')throw jointError('PVE_V3_LOCK','계정 잠금 서비스를 확인하세요.',503);
      return json(await withUserMutationLock(env,user.id,path,()=>body.content==='TOWER'?saveTowerV3Draft(env,user,body):saveExpeditionDraft(env,user,body.content,body)));
    }
    if(path==='cow-room/v3/portals')return request.method==='GET'?json({ok:true,accountId:Number(user.id),portals:await cowPortalStatus(env,user)}):json({error:'GET 요청이 필요합니다.'},405);
    const match=/^(tower|scrapyard|cow-room)\/v3\/(state|status|result|run)$/.exec(path);
    if(!match)return json({error:'원정 경로를 찾을 수 없습니다.'},404);
    const [,content,action]=match,query=new URL(request.url).searchParams;
    if(action==='run'){
      if(request.method!=='POST')return json({error:'POST 요청이 필요합니다.'},405);
      const body=await readJointBody(request,{fields:content==='tower'?['requestId','tier']:['requestId','difficulty']});
      if(typeof withUserMutationLock!=='function')throw jointError('PVE_V3_LOCK','계정 잠금 서비스를 확인하세요.',503);
      return await withUserMutationLock(env,user.id,path,async()=>{
        if(content==='tower')return json(await runTowerV3(env,user,body,towerDependencies(env,deps)));
        if(content==='scrapyard')return json(await runScrapyardV3(env,user,body,{...deps,readSettings:env=>readScrapyardSettings(env,{fresh:true})}));
        return json(await runExpeditionV3(env,user,'COW_ROOM',body,deps));
      });
    }
    if(request.method!=='GET')return json({error:'GET 요청이 필요합니다.'},405);
    if(content==='tower'){
      if(action==='result')return json(await towerV3Result(env,user,query.get('requestId')));
      const td=towerDependencies(env,deps),status=await towerV3Status(env,user,td);
      if(action==='status')return json(status);
      const [config,economy]=await Promise.all([td.readConfig(),td.readEconomy()]);
      const records=(await env.DB.prepare('SELECT tier,best_combat_ms,achieved_at FROM tower_v3_records_v1 WHERE user_id=? AND rules_version=? ORDER BY tier DESC LIMIT 40').bind(user.id,config.rulesVersion).all()).results;
      return json({...status,accountId:Number(user.id),config,economy,records});
    }
    if(content==='scrapyard'){
      if(action==='result')return json(await scrapyardV3Result(env,user,query.get('requestId')));
      const recovery=await scrapyardV3RecoveryStatus(env,user);if(action==='status')return json(recovery);
      return json({...await readScrapyardStatus(env,user,deps.raidDeckPower),...recovery,accountId:Number(user.id)});
    }
    return json(action==='result'?await expeditionV3Result(env,user,'COW_ROOM',query.get('requestId')):await expeditionV3Status(env,user,'COW_ROOM',deps));
  }catch(error){return jointResponseError(error,json);}
}
