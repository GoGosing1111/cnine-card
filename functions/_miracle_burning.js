import { BURNING_EVENT_DEFAULT_DURATION_MINUTES, BURNING_EVENT_DURATION_MINUTES, burningEventEndsAt, burningEventIsLive, isBurningEventDurationMinutes } from './_burning_event_access.js';

export const MIRACLE_BURNING_META_KEY = 'miracle_burning_event_settings_v1';
export const MIRACLE_BURNING_OPERATOR = '핑크빛유두';
export const MIRACLE_BURNING_DROP_PERCENT = 30;

export function canManageMiracleBurning(user) {
  return String(user?.role || '').trim().toUpperCase() === 'OWNER'
    && user?.nickname === MIRACLE_BURNING_OPERATOR;
}

export function defaultMiracleBurningSettings() {
  return {
    mode:'MIRACLE',theme:'SKY',enabled:false,generation:0,activatedAt:null,updatedAt:null,endsAt:null,
    durationMinutes:BURNING_EVENT_DEFAULT_DURATION_MINUTES,title:'숲켓몬 미라클 버닝이 발동되었습니다',
    pveMaxEnergy:30,pvpMaxEnergy:30,rechargeMinutes:1,apocalypseMaxEnergy:10,apocalypseRechargeMinutes:5,
    dropIncreasePercent:MIRACLE_BURNING_DROP_PERCENT,battleRewardMultiplier:100,
    duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0
  };
}

export function miracleApocalypseConfig(base, burning, now = Date.now()) {
  return burning?.mode === 'MIRACLE' && burningEventIsLive(burning,now)
    ? {...base,maxEnergy:10,rechargeMinutes:5,burningMode:'MIRACLE',burningEndsAt:burning.endsAt,burningActivatedAt:burning.activatedAt}
    : {...base,burningMode:'NONE',burningEndsAt:null};
}

export async function readMiracleDropPercent(env) {
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MIRACLE_BURNING_META_KEY).first();
  let settings;try{settings=JSON.parse(row?.value||'{}')}catch{return 0}
  return burningEventIsLive(settings) ? MIRACLE_BURNING_DROP_PERCENT : 0;
}

// Probability only: existing quantities, weights and grant receipts stay authoritative.
export function applyMiracleDropChance(chance, percent=0) {
  const value=Number(chance),base=Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
  return Number(percent)===MIRACLE_BURNING_DROP_PERCENT ? Math.min(100,base*1.3) : base;
}

export async function handleMiracleBurningAdmin({request,env,deps}) {
  const {authenticate,json,readBody,burningEventPair,burningPublicState,cleanBurningEventSettings,writeAdminLog,invalidate}=deps;
  const admin=await authenticate(request,env);
  if(!admin)return json({error:'관리자 로그인이 필요합니다.'},401);
  if(!canManageMiracleBurning(admin))return json({error:'미라클 버닝은 OWNER 핑크빛유두 계정만 관리할 수 있습니다.',code:'MIRACLE_BURNING_OPERATOR_ONLY'},403);
  if(!['GET','PATCH'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
  const beforePair=await burningEventPair(env,{fresh:true}),before=beforePair.miracle;
  const response=pair=>({settings:pair.miracle,allowedDurations:BURNING_EVENT_DURATION_MINUTES,activeMode:pair.active.enabled?pair.active.mode:'NONE',activeEvent:burningPublicState(pair.active),serverNow:new Date().toISOString()});
  if(request.method==='GET')return json(response(beforePair));
  const body=await readBody(request),payload=body.settings||body;
  const durationMinutes=Number(payload.durationMinutes??before.durationMinutes),multiplier=Number(payload.battleRewardMultiplier??before.battleRewardMultiplier);
  if(!isBurningEventDurationMinutes(durationMinutes))return json({error:'진행 시간은 30분, 1시간, 2시간 중 선택하세요.',code:'INVALID_BURNING_DURATION'},400);
  if(!Number.isFinite(multiplier)||multiplier<1||multiplier>100)return json({error:'코인 보상 배율은 1~100배로 입력하세요.',code:'INVALID_MIRACLE_MULTIPLIER'},400);
  // Energy pools persist second precision; align activation to prevent a refill
  // after every debit during the first fractional second of the event.
  const enabled=Object.hasOwn(payload,'enabled')?payload.enabled===true:before.enabled===true,changedAt=new Date(Math.floor(Date.now()/1000)*1000).toISOString();
  const next=cleanBurningEventSettings({...before,...payload,enabled,durationMinutes,battleRewardMultiplier:multiplier,
    generation:Number(before.generation||0)+(enabled?1:0),activatedAt:enabled?changedAt:before.activatedAt,
    updatedAt:changedAt,endsAt:enabled?burningEventEndsAt(changedAt,durationMinutes):null},'MIRACLE');
  const upsert=(key,value)=>env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(key,JSON.stringify(value));
  const statements=[upsert(MIRACLE_BURNING_META_KEY,next)];
  if(enabled)for(const [key,settings,mode] of [
    ['burning_event_settings_v1',beforePair.normal,'BURNING'],
    ['hyper_burning_event_settings_v1310',beforePair.hyper,'HYPER']
  ])statements.push(upsert(key,cleanBurningEventSettings({...settings,enabled:false,endsAt:null,updatedAt:changedAt},mode)));
  await env.DB.batch(statements);
  invalidate();
  const verified=await burningEventPair(env,{fresh:true});
  await writeAdminLog(env,admin,'MIRACLE_BURNING_EVENT_UPDATE','APP_META',MIRACLE_BURNING_META_KEY,before,verified.miracle);
  return json({ok:true,...response(verified)});
}
