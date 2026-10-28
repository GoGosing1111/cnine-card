import {CNINE_GROUPS} from '../js/cnine-roster-v1.js';
import {createPlaydkIdentityClient,PlaydkApiError} from './_playdk_client.js';
import {SoopWatchError,validSoopId,watchMonthPeriod} from './_soop_watch_contract.js';

export const SOOP_WATCH_PREFIX = 'soop_watch_identity_v1:';
// User approved the current C9 roster plus Cheolgu on 2026-10-28.
// Cheolgu station: https://www.sooplive.com/station/y1026
export const CNINE_WATCH_STREAMERS = Object.freeze([{id:'y1026',name:'철구'},...CNINE_GROUPS.flatMap(group=>group.members)]);

// Optional provider data is kept only after the existing account binding succeeds.
// Missing data clears the previous ID; it is not labelled as a consent refusal.
export async function saveSoopWatchIdentity(env, userId, identity, observedAt) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId)<1 || !identity?.uuid || !Number.isFinite(Date.parse(observedAt))) throw new SoopWatchError('SOOP_WATCH_IDENTITY_INVALID','시청정보 연결을 확인하세요.');
  const soopUserId = validSoopId(identity.soopUserId) ? identity.soopUserId : null;
  const value = JSON.stringify({version:1,userId:Number(userId),providerUuid:identity.uuid,soopUserId,observedAt});
  const result = await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at)
    SELECT ?,?,CURRENT_TIMESTAMP FROM user_second_verifications
    WHERE user_id=? AND provider='PLAYDK' AND provider_user_id=?
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE COALESCE(app_meta.value::jsonb->>'observedAt','') <= excluded.value::jsonb->>'observedAt'`)
    .bind(SOOP_WATCH_PREFIX+Number(userId),value,Number(userId),identity.uuid).run();
  return {identityAvailable:Boolean(soopUserId),identityStored:Number(result?.meta?.changes)===1};
}
export async function rememberSoopWatchIdentity(env,userId,identity,observedAt) {
  try { return await saveSoopWatchIdentity(env,userId,identity,observedAt); }
  catch { console.warn('SOOP_WATCH_IDENTITY_SAVE_FAILED'); return {identityAvailable:Boolean(identity.soopUserId),identityStored:false}; }
}

export async function readSoopWatchCandidates(env) {
  const result = await env.DB.prepare(`SELECT u.id AS user_id,u.nickname,v.provider_user_id,m.value
    FROM user_second_verifications v JOIN users u ON u.id=v.user_id
    LEFT JOIN app_meta m ON m.key=?||CAST(u.id AS TEXT)
    WHERE v.provider='PLAYDK' AND u.status='ACTIVE' ORDER BY u.id`).bind(SOOP_WATCH_PREFIX).all();
  const rows=result.results||[],candidates=[],byId=new Map();
  for(const row of rows){
    let record;try{record=JSON.parse(row.value)}catch{continue;}
    if(record?.version!==1 || record.userId!==Number(row.user_id) || record.providerUuid!==row.provider_user_id || !validSoopId(record.soopUserId))continue;
    const account={userId:Number(row.user_id),nickname:String(row.nickname),providerUuid:row.provider_user_id};
    candidates.push({account,soopUserId:record.soopUserId,observedAt:record.observedAt});
    if(!byId.has(record.soopUserId))byId.set(record.soopUserId,[]);
    byId.get(record.soopUserId).push(account);
  }
  return {rows,candidates,byId,userSoopIds:[...byId.keys()].sort(),fingerprint:JSON.stringify(candidates)};
}
export async function collectSoopWatchRanking(env,{month,now=Date.now(),client}={}) {
  const period=watchMonthPeriod(month,now),snapshot=await readSoopWatchCandidates(env);
  const coverage={verifiedAccounts:snapshot.rows.length,linkedAccounts:snapshot.candidates.length,uniqueSoopIds:snapshot.userSoopIds.length,uncollectedAccounts:snapshot.rows.length-snapshot.candidates.length};
  const base={...period,streamers:CNINE_WATCH_STREAMERS,coverage,scope:'CURRENTLY_LINKED_PLAYDK_ACCOUNTS',allVerifiedAccountsCovered:coverage.uncollectedAccounts===0,simultaneousStreamsSummed:true};
  if(!snapshot.userSoopIds.length)return {...base,status:'WAITING_FOR_IDENTITIES',generatedAt:null,ranking:{data:[],total:0,page:1,size:100,more:false}};
  if(snapshot.userSoopIds.length>1000)throw new SoopWatchError('SOOP_WATCH_USER_LIMIT','DK 단일 조회 한도 1,000명을 초과했습니다. 일부만 집계하지 않았습니다.',409);
  const configured=client||createPlaydkIdentityClient({baseUrl:String(env.PLAYDK_BASE_URL||'https://www.playdk.kr'),accessKey:env.PLAYDK_ACCESS_KEY,secretKey:env.PLAYDK_SECRET_KEY,timeoutMs:15000});
  const result=await configured.getWatchRanking({userSoopIds:snapshot.userSoopIds,streamerIds:CNINE_WATCH_STREAMERS.map(x=>x.id),dateGte:period.dateGte,dateLt:period.dateLt,pagination:{page:1,size:100}});
  if((await readSoopWatchCandidates(env)).fingerprint!==snapshot.fingerprint)throw new SoopWatchError('SOOP_WATCH_CANDIDATES_CHANGED','조회 중 연결 정보가 바뀌었습니다. 다시 조회하세요.',409);
  const data=result.ranking.data.map(row=>{const accounts=snapshot.byId.get(row.soopUserId);return {...row,nickname:accounts[0].nickname,userId:accounts[0].userId,linkedAccounts:accounts.map(({providerUuid,...account})=>account)};});
  return {...base,...result,status:'OK',ranking:{...result.ranking,data}};
}
export async function handleSoopWatch({path,request,env,deps}) {
  if(path!=='admin/soop-watch/ranking')return null;
  const admin=await deps.requirePermission(request,env,'USER_MANAGE');
  if(!admin||admin.role!=='OWNER')return deps.json({error:'시청시간 집계는 OWNER 전용입니다.'},403);
  if(request.method!=='GET')return deps.json({error:'조회 요청만 지원합니다.'},405);
  try{return deps.json(await collectSoopWatchRanking(env,{month:new URL(request.url).searchParams.get('month')}));}
  catch(error){
    if(error instanceof PlaydkApiError){
      const forbidden=error.status===403;
      return deps.json({code:forbidden?'SOOP_WATCH_PROVIDER_FORBIDDEN':'SOOP_WATCH_PROVIDER_ERROR',error:forbidden?'DK에서 현재 권한·동의·연결 조건으로 조회를 거부했습니다. 전체 집계 결과를 반환하지 않았습니다.':'DK 시청시간 조회에 실패했습니다. 시청시간 0으로 처리하지 않았습니다.',upstreamStatus:error.status},forbidden?403:502);
    }
    if(error instanceof SoopWatchError)return deps.json({code:error.code,error:error.message},error.status);
    console.warn('SOOP_WATCH_RANKING_FAILED');return deps.json({code:'SOOP_WATCH_UNAVAILABLE',error:'시청시간 집계를 완료하지 못했습니다.'},503);
  }
}
