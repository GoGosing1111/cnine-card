import {TOWER_V3_RELEASE_ENABLED} from './_tower_v3.js';
import {runTowerV3,towerV3Status,towerV3Result} from './_tower_v3_runs.js';

// Prepared route boundary, deliberately absent from functions/api/[[path]].js.
// The integration must supply the existing authenticated user, CSRF validator
// and shared account-mutation lock. No dependency can turn the release gate on.
export async function handleTowerV3Route({request,env,user,path,deps}){
  if(!TOWER_V3_RELEASE_ENABLED)return Response.json({error:'개편판 공개 준비 중입니다.',code:'TOWER_V3_RELEASE_HELD'},{status:404});
  if(!user?.id)return Response.json({error:'로그인이 필요합니다.'},{status:401});
  if(typeof deps?.withUserMutationLock!=='function'||typeof deps?.assertCsrf!=='function')throw new Error('TOWER_V3_ROUTE_SECURITY_DEPENDENCY');
  if(request.method==='GET'&&path==='tower/v3/status')return Response.json(await towerV3Status(env,user,deps));
  if(request.method==='GET'&&path==='tower/v3/result')return Response.json(await towerV3Result(env,user,new URL(request.url).searchParams.get('requestId')));
  if(request.method==='POST'&&path==='tower/v3/run'){
    await deps.assertCsrf(request,user);
    const body=await request.json();
    return deps.withUserMutationLock(env,user.id,async()=>Response.json(await runTowerV3(env,user,{requestId:body.requestId,tier:body.tier},deps)));
  }
  return Response.json({error:'Not found'},{status:404});
}
