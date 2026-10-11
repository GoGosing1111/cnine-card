import {deliverChampionsRewards,championsPublicState} from './_clan_champions.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {reconcileFactionSessions} from './_clan_faction_sessions.js';
import {ORGANIZATION_PREPARATION} from '../shared/organization-preparation-v1.mjs';

export const CLAN_RETIREMENT_KEY='clan_retirement_20261012_v1';
export const CLAN_RETIREMENT_RECEIPT_KEY=CLAN_RETIREMENT_KEY+':completed';
export const ORGANIZATION_REFORM_KEY='organization_reform_v1';
const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);

export async function saveLegacyClanSettings(env,key,value){
  const result=await p(env,`INSERT INTO app_meta(key,value,updated_at)
    SELECT ?,?,CURRENT_TIMESTAMP WHERE NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)`,key,value,CLAN_RETIREMENT_RECEIPT_KEY,CLAN_RETIREMENT_RECEIPT_KEY).run();
  return Number(result?.meta?.changes)>0;
}

export async function readClanRetirementPlan(env){
  const row=await p(env,'SELECT value FROM app_meta WHERE key=?',CLAN_RETIREMENT_KEY).first();
  if(!row)return null;
  const plan=JSON.parse(row.value);
  if(plan.version!==1||!Number.isSafeInteger(plan.seasonId)||plan.seasonId<=0||plan.transition!=='FRESH_ORGANIZATIONS_PREPARATION')throw Error('클랜 종료 계획을 확인하세요.');
  return plan.enabled===true?{...plan,raw:row.value}:null;
}

export async function clanRetirementPublicState(env,knownPlan){
  const plan=knownPlan===undefined?await readClanRetirementPlan(env):knownPlan;
  if(!plan)return null;
  const [receipt,season,cup]=await Promise.all([
    p(env,'SELECT value FROM app_meta WHERE key=?',CLAN_RETIREMENT_RECEIPT_KEY).first(),
    p(env,'SELECT phase FROM clan_seasons WHERE id=?',plan.seasonId).first(),
    p(env,'SELECT semifinal_starts_at,final_starts_at,settings_json,status FROM clan_championships WHERE season_id=?',plan.seasonId).first()
  ]);
  const duration=Number(JSON.parse(cup?.settings_json||'{}').warDurationMinutes)||120;
  return {...ORGANIZATION_PREPARATION,sourceSeasonId:plan.seasonId,retired:Boolean(receipt),
    legacyClosed:Boolean(receipt)||season?.phase==='COMPLETE',settling:!receipt&&season?.phase==='COMPLETE',
    semifinalStartsAt:cup?.semifinal_starts_at,finalStartsAt:cup?.final_starts_at,
    expectedEndAt:cup?.final_starts_at?new Date(Date.parse(cup.final_starts_at)+duration*60000).toISOString():null,
    retiredAt:receipt?JSON.parse(receipt.value).retiredAt:null};
}

// Competition/reward receipts stay in the legacy tables. Nothing is copied into new organizations.
export async function finishClanRetirement(env,season,settings,knownPlan,{settleFaction=reconcileFactionSessions}={}){
  const plan=knownPlan===undefined?await readClanRetirementPlan(env):knownPlan;
  if(!plan||Number(season?.id)!==plan.seasonId)return null;
  const saved=await p(env,'SELECT value FROM app_meta WHERE key=?',CLAN_RETIREMENT_RECEIPT_KEY).first();
  if(saved)return JSON.parse(saved.value);
  if(season.phase!=='COMPLETE'||settings.mode!=='ON')return null;
  await deliverChampionsRewards(env,season.id,settings);
  const cup=await p(env,'SELECT status,reward_status,completed_at,winner_clan_id FROM clan_championships WHERE season_id=?',season.id).first();
  if(cup?.status!=='COMPLETED'||cup.reward_status!=='SENT')return null;
  // Close any remaining old faction session before disabling its scheduler.
  await settleFaction(env);
  const current=await p(env,"SELECT value FROM app_meta WHERE key='clan_settings_v1'").first();
  const oldSettings=JSON.parse(current?.value||'{}');
  if(oldSettings.mode!=='ON')return null;
  const next={...oldSettings,mode:'OFF',scheduleEnabled:false};
  const receipt={status:'COMPLETED',version:1,sourceSeasonId:plan.seasonId,retiredAt:new Date().toISOString(),
    championsCompletedAt:cup.completed_at,winnerClanId:Number(cup.winner_clan_id),rewardStatus:'SENT',
    transition:plan.transition,registrationOpen:false,inheritance:'NONE'};
  const token=crypto.randomUUID(),DB=env.DB,write=(sql,...values)=>DB.prepare(sql).bind(...values),writes=[];
  await ensureJointAtomicSchema(env);
  if(DB.dialect==='postgres'){
    writes.push(write('SELECT id FROM clan_seasons WHERE id=? FOR UPDATE',plan.seasonId));
    writes.push(write('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR UPDATE',CLAN_RETIREMENT_KEY,'clan_settings_v1'));
  }
  writes.push(jointGuard(DB,token,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
    AND EXISTS(SELECT 1 FROM app_meta WHERE key='clan_settings_v1' AND value=?)
    AND EXISTS(SELECT 1 FROM clan_seasons s JOIN clan_championships c ON c.season_id=s.id
      WHERE s.id=? AND s.phase='COMPLETE' AND c.status='COMPLETED' AND c.reward_status='SENT')
    AND NOT EXISTS(SELECT 1 FROM clan_seasons WHERE id>?)
    AND NOT EXISTS(SELECT 1 FROM clan_war_battles WHERE season_id=? AND status IN ('PENDING','RESOLVING'))`,
    [CLAN_RETIREMENT_KEY,plan.raw,current.value,plan.seasonId,plan.seasonId,plan.seasonId]));
  writes.push(write("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='clan_settings_v1'",JSON.stringify(next)));
  writes.push(write('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',CLAN_RETIREMENT_RECEIPT_KEY,JSON.stringify(receipt)));
  writes.push(write('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',ORGANIZATION_REFORM_KEY,JSON.stringify(ORGANIZATION_PREPARATION)));
  writes.push(jointGuardEnd(DB,token));
  try{await DB.batch(writes)}catch(error){
    // Concurrent scheduler/API delivery may have committed the identical transition first.
    const replay=await p(env,'SELECT value FROM app_meta WHERE key=?',CLAN_RETIREMENT_RECEIPT_KEY).first();
    if(replay&&JSON.parse(replay.value).sourceSeasonId===plan.seasonId)return JSON.parse(replay.value);
    throw error;
  }
  return receipt;
}

// This guard precedes legacy admin shortcuts, mode checks and implicit season creation.
export async function handleClanRetirementRoute({path,request,env,deps}){
  if(!path.startsWith('clan/')&&!path.startsWith('admin/clan-war/'))return null;
  const plan=await readClanRetirementPlan(env);if(!plan)return null;
  const state=await clanRetirementPublicState(env,plan);
  const resetPath=['clan/register','clan/draft/pick','admin/clan-war/reset-draft','admin/clan-war/reset-official-season-one','clan/admin/test-bootstrap','clan/admin/test-activate'].includes(path);
  const blocked=request.method!=='GET'&&(resetPath||state.legacyClosed)&&path!=='admin/clan-war/champions-rewards';
  const overview=request.method==='GET'&&path==='clan/overview'&&state.legacyClosed;
  const preparation=request.method==='GET'&&path==='clan/organization';
  const alert=request.method==='GET'&&state.legacyClosed&&['clan/faction/alerts','clan/war/ready-alert'].includes(path);
  const closedRead=request.method==='GET'&&state.legacyClosed&&path.startsWith('clan/')&&!overview&&!preparation&&!alert;
  if(!blocked&&!overview&&!preparation&&!alert&&!closedRead)return null;
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(alert)return deps.json({ok:true,enabled:false,alert:null,alerts:[]});
  if(blocked||closedRead)return deps.json({error:'기존 클랜 운영이 종료됩니다. 조직 개편 준비 중이며 신규 모집은 추후 안내합니다.',code:'CLAN_RETIREMENT',organizationPreparation:state},409);
  const settings=JSON.parse((await p(env,"SELECT value FROM app_meta WHERE key='clan_settings_v1'").first())?.value||'{}');
  return deps.json({ok:true,organizationPreparation:state,champions:await championsPublicState(env,plan.seasonId,settings)},200,{'cache-control':'no-store'});
}
