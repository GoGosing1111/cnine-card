import {readRuntimeData,cacheRuntimeData,invalidateRuntimeData} from './_runtime_data_cache.js';
import {TERRITORY_SKILL_COOLDOWN_MS,isClanWarfare} from './_territory_clan_warfare.js';
import {BATTLEFIELD_VERSION,normalizeBattlefieldConfig,battlefieldObjectives,battlefieldSkillCatalog,supplyWindow} from '../shared/territory-battlefield-v5.mjs';

const SCHEMA='territory_battlefield_v5_20261003';
const fail=message=>{throw Object.assign(new Error(message),{status:409})};
const json=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
const ms=value=>Date.parse(String(value||'').includes('T')?value:String(value||'').replace(' ','T')+'Z');
const sideColumn=side=>side==='A'?'a':'b';
const policyKey=id=>'territory:battlefield-policy:'+id;
export const battlefieldSchemaStatements=postgres=>{
  const int=postgres?'BIGINT':'INTEGER';
  return[
    'CREATE TABLE IF NOT EXISTS territory_battlefield_policies(round_id '+int+' PRIMARY KEY,config_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS territory_battlefield_fronts(front_id '+int+' PRIMARY KEY,round_id '+int+' NOT NULL,relay_meter INTEGER NOT NULL DEFAULT 0,relay_owner TEXT NOT NULL DEFAULT \'\',relay_capture_token TEXT,charge_a INTEGER NOT NULL DEFAULT 0,charge_b INTEGER NOT NULL DEFAULT 0,emp_a_until_ms '+int+' NOT NULL DEFAULT 0,emp_b_until_ms '+int+' NOT NULL DEFAULT 0,supply_a_until_ms '+int+' NOT NULL DEFAULT 0,supply_b_until_ms '+int+' NOT NULL DEFAULT 0,breach_a_until_ms '+int+' NOT NULL DEFAULT 0,breach_b_until_ms '+int+' NOT NULL DEFAULT 0,cannon_a_due_ms '+int+' NOT NULL DEFAULT 0,cannon_b_due_ms '+int+' NOT NULL DEFAULT 0,cannon_a_request TEXT,cannon_b_request TEXT,action_token TEXT,version INTEGER NOT NULL DEFAULT 1)',
    'CREATE TABLE IF NOT EXISTS territory_battlefield_trains(front_id '+int+' NOT NULL,cycle INTEGER NOT NULL,round_id '+int+' NOT NULL,starts_at_ms '+int+' NOT NULL,ends_at_ms '+int+' NOT NULL,a_points INTEGER NOT NULL DEFAULT 0,b_points INTEGER NOT NULL DEFAULT 0,goal INTEGER NOT NULL,winner_side TEXT NOT NULL DEFAULT \'\',captured_at_ms '+int+' NOT NULL DEFAULT 0,PRIMARY KEY(front_id,cycle))',
    'CREATE TABLE IF NOT EXISTS territory_battlefield_contributions(request_id TEXT PRIMARY KEY,round_id '+int+' NOT NULL,front_id '+int+' NOT NULL,user_id '+int+' NOT NULL,side TEXT NOT NULL CHECK(side IN (\'A\',\'B\')),objective TEXT NOT NULL CHECK(objective IN (\'SIEGE\',\'RELAY\',\'SUPPLY\')),won INTEGER NOT NULL,points INTEGER NOT NULL,charge INTEGER NOT NULL,cycle INTEGER NOT NULL DEFAULT 0,applied INTEGER NOT NULL DEFAULT 0,created_at_ms '+int+' NOT NULL)',
    'CREATE TABLE IF NOT EXISTS territory_battlefield_supply_claims(front_id '+int+' NOT NULL,cycle INTEGER NOT NULL,user_id '+int+' NOT NULL,side TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,energy INTEGER NOT NULL,claimed_at_ms '+int+' NOT NULL,PRIMARY KEY(front_id,cycle,user_id))',
    'CREATE TABLE IF NOT EXISTS territory_battlefield_events(id TEXT PRIMARY KEY,round_id '+int+' NOT NULL,front_id '+int+' NOT NULL,side TEXT NOT NULL,type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at_ms '+int+' NOT NULL)',
    'CREATE INDEX IF NOT EXISTS idx_territory_battlefield_events_front ON territory_battlefield_events(front_id,created_at_ms)',
    'CREATE INDEX IF NOT EXISTS idx_territory_battlefield_supply_participant ON territory_battlefield_contributions(front_id,cycle,user_id,objective)'
  ];
};
export async function ensureBattlefieldSchema(env){
  if(readRuntimeData(env,SCHEMA))return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA).first();
  if(!marker){const statements=battlefieldSchemaStatements(env.DB.dialect==='postgres');if(env.DB.dialect==='postgres')await env.DB.execSchema(statements);else await env.DB.batch(statements.map(sql=>env.DB.prepare(sql)));await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(SCHEMA,'1').run()}
  cacheRuntimeData(env,SCHEMA,true,1800000);
}
export async function battlefieldPolicy(env,round){
  if(!isClanWarfare(round))return null;
  const key=policyKey(round.id),cached=readRuntimeData(env,key);if(cached!==undefined)return cached||null;
  const row=await env.DB.prepare('SELECT config_json FROM territory_battlefield_policies WHERE round_id=?').bind(round.id).first();
  const config=row?normalizeBattlefieldConfig(json(row.config_json)):null;
  cacheRuntimeData(env,key,config||false,config?60000:3000);return config;
}
export async function freezeBattlefieldPolicy(env,round,cfg){
  if(!isClanWarfare(round)||round.status!=='RECRUITING')return;
  const config=normalizeBattlefieldConfig(cfg.battlefield);
  await env.DB.prepare("INSERT INTO territory_battlefield_policies(round_id,config_json) SELECT id,? FROM territory_war_v3_rounds WHERE id=? AND status='RECRUITING' AND warfare_version=4 ON CONFLICT(round_id) DO NOTHING").bind(JSON.stringify(config),round.id).run();
  invalidateRuntimeData(env,policyKey(round.id));
}
export async function initializeBattlefieldFront(env,round,front){
  const config=await battlefieldPolicy(env,round);if(!config?.enabled||!front)return null;
  await env.DB.prepare('INSERT INTO territory_battlefield_fronts(front_id,round_id) VALUES(?,?) ON CONFLICT(front_id) DO NOTHING').bind(front.id,round.id).run();
  return env.DB.prepare('SELECT * FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first();
}
async function ensureSupplyTrain(env,round,front,config,now){
  const window=supplyWindow(front.started_at,config,now);
  if(window.active)await env.DB.prepare('INSERT INTO territory_battlefield_trains(front_id,cycle,round_id,starts_at_ms,ends_at_ms,goal) VALUES(?,?,?,?,?,?) ON CONFLICT(front_id,cycle) DO NOTHING').bind(front.id,window.cycle,round.id,window.startsAt,window.endsAt,config.supplyGoal).run();
  return window;
}
export async function battlefieldAttackContext(env,{round,front,objective='SIEGE',cycle,now=Date.now()}){
  objective=battlefieldObjectives(objective);if(!objective)fail('전장 목표가 올바르지 않습니다.');
  const config=await battlefieldPolicy(env,round);
  if(!config?.enabled){if(objective!=='SIEGE')fail('이번 회차에는 전장 시설이 활성화되지 않았습니다.');return{enabled:false,objective}}
  const data=await env.DB.prepare('SELECT * FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first();if(!data)fail('전장 시설을 준비 중입니다.');
  const window=await ensureSupplyTrain(env,round,front,config,now);
  if(objective==='SUPPLY'){
    if(!window.active||Number(cycle)!==window.cycle)fail('이 보급열차의 호위 시간이 종료되었습니다.');
    const train=await env.DB.prepare('SELECT winner_side FROM territory_battlefield_trains WHERE front_id=? AND cycle=?').bind(front.id,window.cycle).first();if(train?.winner_side)fail('이미 보급열차 호위가 완료되었습니다.');
  }
  return{enabled:true,objective,config,data,window,now};
}
// The transaction reads occupation bonuses after taking the round/front locks.
// Concurrent captures therefore cannot apply a stale attacker-side bonus.
export function battlefieldSiegeSql(context,side,frontId,now=Date.now()){
  if(!context.enabled)return '1';
  const own=sideColumn(side),c=context.config;
  return "COALESCE((SELECT (CASE WHEN relay_owner='"+side+"' AND emp_"+own+"_until_ms<="+now+' THEN '+(100+c.relaySiegeBonusPercent)+' ELSE 100 END)*(CASE WHEN supply_'+own+'_until_ms>'+now+' AND emp_'+own+'_until_ms<='+now+' THEN '+(100+c.supplySiegeBonusPercent)+' ELSE 100 END)/10000.0 FROM territory_battlefield_fronts WHERE front_id='+Number(frontId)+'),1)';
}
// These statements are placed before the personal battle mutations. The common
// round -> front lock order also serializes facility objectives and command skills.
export function battlefieldAttackGuards(env,{round,front,requestId,context,now=Date.now()}){
  if(!context.enabled)return[];
  const token='BF_ATTACK:'+requestId,extra=context.objective==='SUPPLY'?' AND EXISTS(SELECT 1 FROM territory_battlefield_trains WHERE front_id=? AND cycle=? AND winner_side=\'\' AND starts_at_ms<=? AND ends_at_ms>?)':'';
  const binds=[token,round.id,front.id,new Date(now).toISOString(),new Date(now).toISOString(),front.id];if(extra)binds.push(front.id,context.window.cycle,now,now);
  return[
    env.DB.prepare("UPDATE territory_war_v3_rounds SET version=version WHERE id=? AND status='ACTIVE' AND current_front_id=?").bind(round.id,front.id),
    env.DB.prepare("UPDATE territory_war_v3_fronts SET version=version WHERE id=? AND status='ACTIVE'").bind(front.id),
    env.DB.prepare("INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND current_front_id=? AND status='ACTIVE' AND datetime(ends_at)>datetime(?) AND (truce_ends_at IS NULL OR datetime(truce_ends_at)<=datetime(?))) AND EXISTS(SELECT 1 FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE' AND a_hp>0 AND b_hp>0)"+extra+' THEN 1 ELSE 0 END').bind(...binds)
  ];
}
export function battlefieldContributionStatements(env,{round,front,mine,requestId,context,won,now=Date.now()}){
  if(!context.enabled)return[];
  const {config,objective,window}=context,side=mine.side,own=sideColumn(side),points=objective==='RELAY'?(won?config.relayWinPoints:config.relayLossPoints):objective==='SUPPLY'?(won?config.supplyWinPoints:config.supplyLossPoints):0;
  const base=objective==='SIEGE'?(won?config.siegeWinCharge:config.siegeLossCharge):config.supportCharge;
  const once="EXISTS(SELECT 1 FROM territory_battlefield_contributions WHERE request_id=? AND applied=0)",signed=side==='A'?points:-points,threshold=config.relayCapturePoints;
  const nextMeter='MIN('+threshold+',MAX(-'+threshold+',relay_meter+'+signed+'))';
  const nextOwner="CASE WHEN relay_meter+"+signed+">="+threshold+" THEN 'A' WHEN relay_meter+"+signed+"<=-"+threshold+" THEN 'B' ELSE relay_owner END";
  const statements=[
    env.DB.prepare("INSERT INTO territory_battlefield_contributions(request_id,round_id,front_id,user_id,side,objective,won,points,charge,cycle,created_at_ms) SELECT ?,?,?,?,?,?,?,?,?+CASE WHEN relay_owner=? AND emp_"+own+"_until_ms<=? THEN ? ELSE 0 END,?,? FROM territory_battlefield_fronts WHERE front_id=? AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED') ON CONFLICT(request_id) DO NOTHING").bind(requestId,round.id,front.id,mine.user_id,side,objective,won?1:0,points,base,side,now,config.relayChargeBonus,objective==='SUPPLY'?window.cycle:0,now,front.id,requestId),
    env.DB.prepare('UPDATE territory_battlefield_fronts SET charge_'+own+'=MIN(?,charge_'+own+'+(SELECT charge FROM territory_battlefield_contributions WHERE request_id=?)' + (objective==='RELAY'?"+CASE WHEN relay_owner<>("+nextOwner+") AND ("+nextOwner+")='"+side+"' THEN "+config.relayCaptureCharge+" ELSE 0 END":"")+'),relay_capture_token='+ (objective==='RELAY'?('CASE WHEN relay_owner<>('+nextOwner+') THEN ? ELSE relay_capture_token END'):'relay_capture_token')+',relay_meter='+(objective==='RELAY'?nextMeter:'relay_meter')+',relay_owner='+(objective==='RELAY'?nextOwner:'relay_owner')+',version=version+1 WHERE front_id=? AND '+once).bind(config.chargeMax,requestId,...(objective==='RELAY'?[requestId]:[]),front.id,requestId)
  ];
  if(objective==='RELAY')statements.push(env.DB.prepare("INSERT INTO territory_battlefield_events(id,round_id,front_id,side,type,payload_json,created_at_ms) SELECT ?,?,?,relay_owner,'RELAY_CAPTURED',?,? FROM territory_battlefield_fronts WHERE front_id=? AND relay_capture_token=? AND "+once+' ON CONFLICT(id) DO NOTHING').bind(requestId+':relay',round.id,front.id,JSON.stringify({objective,points,charge:config.relayCaptureCharge,siegeBonusPercent:config.relaySiegeBonusPercent,unlockedSkill:'EMP_PULSE'}),now,front.id,requestId,requestId));
  if(objective==='SUPPLY'){
    statements.push(env.DB.prepare('UPDATE territory_battlefield_trains SET '+own+"_points="+own+"_points+?,winner_side=CASE WHEN "+own+"_points+?>=goal THEN ? ELSE winner_side END,captured_at_ms=CASE WHEN "+own+"_points+?>=goal THEN ? ELSE captured_at_ms END WHERE front_id=? AND cycle=? AND winner_side='' AND "+once).bind(points,points,side,points,now,front.id,window.cycle,requestId));
    statements.push(env.DB.prepare('UPDATE territory_battlefield_fronts SET charge_'+own+'=MIN(?,charge_'+own+'+?),supply_'+own+'_until_ms=MAX(supply_'+own+'_until_ms,?),version=version+1 WHERE front_id=? AND EXISTS(SELECT 1 FROM territory_battlefield_trains WHERE front_id=? AND cycle=? AND winner_side=? AND captured_at_ms=?) AND '+once).bind(config.chargeMax,config.supplyCaptureCharge,now+config.supplyBuffSeconds*1000,front.id,front.id,window.cycle,side,now,requestId));
    statements.push(env.DB.prepare("INSERT INTO territory_battlefield_events(id,round_id,front_id,side,type,payload_json,created_at_ms) SELECT ?,?,?,winner_side,'SUPPLY_SECURED',?,? FROM territory_battlefield_trains WHERE front_id=? AND cycle=? AND winner_side=? AND captured_at_ms=? AND "+once+' ON CONFLICT(id) DO NOTHING').bind(requestId+':supply',round.id,front.id,JSON.stringify({cycle:window.cycle,energy:config.supplyEnergy,charge:config.supplyCaptureCharge,buffSeconds:config.supplyBuffSeconds,siegeBonusPercent:config.supplySiegeBonusPercent}),now,front.id,window.cycle,side,now,requestId));
  }
  statements.push(env.DB.prepare('UPDATE territory_battlefield_contributions SET applied=1 WHERE request_id=? AND applied=0').bind(requestId));
  return statements;
}
export function battlefieldAttackCleanup(env,requestId,context){return context.enabled?[env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind('BF_ATTACK:'+requestId)]:[]}

export async function battlefieldState(env,{round,front,mine,now=Date.now()}){
  const config=await battlefieldPolicy(env,round);if(!config?.enabled||!front)return null;
  const data=await env.DB.prepare('SELECT * FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first();if(!data)return null;
  const window=supplyWindow(front.started_at,config,now),userId=Number(mine?.user_id||0);
  const [train,events,claim,contribution]=await Promise.all([
    env.DB.prepare('SELECT * FROM territory_battlefield_trains WHERE front_id=? AND cycle=?').bind(front.id,window.cycle).first(),
    env.DB.prepare('SELECT id,side,type,payload_json,created_at_ms FROM territory_battlefield_events WHERE front_id=? ORDER BY created_at_ms DESC,id DESC LIMIT 12').bind(front.id).all(),
    userId&&mine?.side?env.DB.prepare("SELECT t.front_id,t.cycle FROM territory_battlefield_trains t WHERE t.round_id=? AND t.winner_side=? AND EXISTS(SELECT 1 FROM territory_battlefield_contributions c WHERE c.front_id=t.front_id AND c.cycle=t.cycle AND c.user_id=? AND c.objective='SUPPLY' AND c.applied=1) AND NOT EXISTS(SELECT 1 FROM territory_battlefield_supply_claims s WHERE s.front_id=t.front_id AND s.cycle=t.cycle AND s.user_id=?) ORDER BY t.front_id DESC,t.cycle DESC LIMIT 1").bind(round.id,mine.side,userId,userId).first():null,
    userId?env.DB.prepare('SELECT COUNT(*) battles,COALESCE(SUM(points),0) points,COALESCE(SUM(charge),0) charge FROM territory_battlefield_contributions WHERE front_id=? AND user_id=? AND applied=1').bind(front.id,userId).first():null
  ]);
  const team=side=>{const own=sideColumn(side);return{charge:Number(data['charge_'+own]),disabledUntil:Number(data['emp_'+own+'_until_ms']),supplyUntil:Number(data['supply_'+own+'_until_ms']),breachUntil:Number(data['breach_'+own+'_until_ms']),cannonDueAt:Number(data['cannon_'+own+'_due_ms']),cannonRequest:data['cannon_'+own+'_request']||null}};
  return{version:BATTLEFIELD_VERSION,frontId:Number(front.id),config,relay:{meter:Number(data.relay_meter),owner:data.relay_owner||'',goal:config.relayCapturePoints},A:team('A'),B:team('B'),supply:{...window,active:round.status==='ACTIVE'&&window.active&&!train?.winner_side,winner:train?.winner_side||'',aPoints:Number(train?.a_points||0),bPoints:Number(train?.b_points||0),goal:config.supplyGoal},supplyClaim:claim?{frontId:Number(claim.front_id),cycle:Number(claim.cycle),energy:config.supplyEnergy}:null,mine:{battles:Number(contribution?.battles||0),points:Number(contribution?.points||0),charge:Number(contribution?.charge||0)},events:(events.results||[]).map(event=>({...event,payload:json(event.payload_json),created_at_ms:Number(event.created_at_ms)}))};
}

export async function applyBattlefieldSkill(env,{round,front,mine,operation,requestId,now=Date.now()}){
  const config=await battlefieldPolicy(env,round),definition=config?.enabled?battlefieldSkillCatalog(config)[operation]:null;
  if(!definition||!['A','B'].includes(mine?.side))fail('이번 회차에서 사용할 수 없는 전장 스킬입니다.');
  const data=await env.DB.prepare('SELECT * FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first();if(!data)fail('전장 시설을 준비 중입니다.');
  const side=mine.side,own=sideColumn(side),enemy=side==='A'?'b':'a',endsAt=now+(operation==='EMP_PULSE'?config.empSeconds:operation==='WALL_BREAKER'?config.breachSeconds:operation==='SIEGE_CANNON'?config.cannonWarningSeconds:0)*1000;
  let change='',values=[],condition='';
  if(operation==='EMP_PULSE'){change='emp_'+enemy+'_until_ms=MAX(emp_'+enemy+'_until_ms,?)';values=[endsAt];condition=' AND relay_owner=?'}
  if(operation==='WALL_BREAKER'){change='breach_'+own+'_until_ms=?';values=[endsAt]}
  if(operation==='ENGINEER'){change='emp_'+own+'_until_ms=0';condition=' AND emp_'+own+'_until_ms>?';values=[]}
  if(operation==='SIEGE_CANNON'){change='charge_'+own+'=charge_'+own+'-?,cannon_'+own+'_due_ms=?,cannon_'+own+'_request=?';values=[config.chargeMax,endsAt,requestId];condition=' AND charge_'+own+'>=? AND emp_'+own+'_until_ms<=? AND cannon_'+own+'_due_ms=0'}
  const extra=operation==='EMP_PULSE'?[side]:operation==='ENGINEER'?[now]:operation==='SIEGE_CANNON'?[config.chargeMax,now]:[];
  if(operation==='EMP_PULSE'&&data.relay_owner!==side)fail('중계탑 확보 진영만 EMP 파동을 사용할 수 있습니다.');
  if(operation==='ENGINEER'&&Number(data['emp_'+own+'_until_ms'])<=now)fail('현재 복구할 아군 시설이 없습니다.');
  if(operation==='SIEGE_CANNON'&&(Number(data['charge_'+own])<config.chargeMax||Number(data['emp_'+own+'_until_ms'])>now||Number(data['cannon_'+own+'_due_ms'])>0))fail('전력 충전과 시설 상태를 확인해 주세요.');
  const result={operation,roundId:Number(round.id),frontId:Number(front.id),requestId,damage:0,endsAt:new Date(endsAt).toISOString(),readyAt:new Date(now+TERRITORY_SKILL_COOLDOWN_MS).toISOString(),...(operation==='SIEGE_CANNON'?{dueAt:endsAt,chargeSpent:config.chargeMax}:{}),summary:definition.summary};
  const roundSql="UPDATE territory_war_v3_rounds SET skill_action_token=?,version=version+1 WHERE id=? AND status='ACTIVE' AND current_front_id=? AND COALESCE(skill_action_token,'')=? AND datetime(ends_at)>datetime(?) AND (truce_ends_at IS NULL OR datetime(truce_ends_at)<=datetime(?)) AND NOT EXISTS(SELECT 1 FROM territory_war_skill_cooldowns WHERE round_id=? AND side=? AND operation=? AND ready_at_ms>?) AND COALESCE((SELECT o.user_id FROM territory_war_v3_commander_overrides o JOIN territory_war_v3_users w ON w.round_id=o.round_id AND w.user_id=o.user_id AND w.side=o.side AND w.status='ACTIVE' WHERE o.round_id=? AND o.side=?),(SELECT w.user_id FROM territory_war_v3_users w WHERE w.round_id=? AND w.side=? AND w.status='ACTIVE' AND (w.attacks>0 OR w.defense_wins>0) ORDER BY (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) DESC,w.attacks DESC,w.user_id LIMIT 1))=?";
  await env.DB.batch([
    env.DB.prepare(roundSql).bind(requestId,round.id,front.id,round.skill_action_token||'',new Date(now).toISOString(),new Date(now).toISOString(),round.id,side,operation,now,round.id,side,round.id,side,mine.user_id),
    env.DB.prepare("UPDATE territory_war_v3_fronts SET skill_action_token=?,version=version+1 WHERE id=? AND version=? AND status='ACTIVE' AND a_hp>0 AND b_hp>0").bind(requestId,front.id,front.version),
    env.DB.prepare('UPDATE territory_battlefield_fronts SET '+change+',action_token=?,version=version+1 WHERE front_id=? AND version=?'+condition).bind(...values,requestId,front.id,data.version,...extra),
    env.DB.prepare('INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds r JOIN territory_war_v3_fronts f ON f.id=r.current_front_id JOIN territory_battlefield_fronts b ON b.front_id=f.id WHERE r.id=? AND r.skill_action_token=? AND f.skill_action_token=? AND b.action_token=?) THEN 1 ELSE 0 END').bind(requestId,round.id,requestId,requestId,requestId),
    env.DB.prepare('INSERT INTO territory_war_skill_receipts(request_id,round_id,user_id,side,operation,result_json,used_at_ms) VALUES(?,?,?,?,?,?,?)').bind(requestId,round.id,mine.user_id,side,operation,JSON.stringify(result),now),
    env.DB.prepare('INSERT INTO territory_war_skill_cooldowns(round_id,side,operation,ready_at_ms) VALUES(?,?,?,?) ON CONFLICT(round_id,side,operation) DO UPDATE SET ready_at_ms=excluded.ready_at_ms').bind(round.id,side,operation,now+TERRITORY_SKILL_COOLDOWN_MS),
    env.DB.prepare('INSERT INTO territory_battlefield_events(id,round_id,front_id,side,type,payload_json,created_at_ms) VALUES(?,?,?,?,?,?,?)').bind(requestId,round.id,front.id,side,operation,JSON.stringify(result),now),
    env.DB.prepare("INSERT INTO territory_war_v3_notices(round_id,type,side,title,message,payload_json) VALUES(?,'BATTLEFIELD_SKILL',?,?,?,?)").bind(round.id,side,definition.name+' 발동',definition.name+' · '+definition.summary,JSON.stringify({...result,image:definition.asset})),
    env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(requestId)
  ]);
  invalidateRuntimeData(env,'territory:skill-cooldowns:'+round.id);return result;
}

export async function settleBattlefieldCannon(env,{round,front,now=Date.now()}){
  const config=await battlefieldPolicy(env,round);
  if(!config?.enabled||round.status!=='ACTIVE'||!front||front.status!=='ACTIVE'||ms(round.ends_at)<=now||ms(round.truce_ends_at)>now)return false;
  const pending=await env.DB.prepare('SELECT cannon_a_due_ms,cannon_b_due_ms FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first();
  const dueSides=['A','B'].filter(side=>Number(pending?.['cannon_'+sideColumn(side)+'_due_ms'])>0&&Number(pending['cannon_'+sideColumn(side)+'_due_ms'])<=now);
  if(!dueSides.length)return false;
  let changed=false;
  for(const side of dueSides){
    for(let attempt=0;attempt<3;attempt++){
      const [freshRound,freshFront,data]=await Promise.all([
        env.DB.prepare('SELECT * FROM territory_war_v3_rounds WHERE id=?').bind(round.id).first(),
        env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(front.id).first(),
        env.DB.prepare('SELECT * FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first()
      ]);
      const own=sideColumn(side),enemy=side==='A'?'b':'a',due=Number(data?.['cannon_'+own+'_due_ms']||0),requestId=data?.['cannon_'+own+'_request'];
      if(!due||due>now||!requestId||freshRound.status!=='ACTIVE'||Number(freshRound.current_front_id)!==Number(front.id)||freshFront.status!=='ACTIVE'||ms(freshRound.ends_at)<=now||ms(freshRound.truce_ends_at)>now)break;
      const counter=freshRound[enemy+'_operation']==='COUNTER_BATTERY'&&ms(freshRound[enemy+'_operation_ends_at'])>now;
      const hp=Number(freshFront[enemy+'_hp']),damage=Math.max(0,Math.min(hp-1,Math.round(Number(freshFront[enemy+'_max_hp'])*config.cannonHpPercent/100*(counter?1-config.cannonCounterReductionPercent/100:1))));
      const token=requestId+':fire',payload={operation:'SIEGE_CANNON',requestId,damage,countered:counter,frontId:Number(front.id),firedAt:now};
      try{
        await env.DB.batch([
          env.DB.prepare("UPDATE territory_war_v3_rounds SET skill_action_token=?,version=version+1 WHERE id=? AND status='ACTIVE' AND current_front_id=? AND COALESCE(skill_action_token,'')=? AND datetime(ends_at)>datetime(?) AND (truce_ends_at IS NULL OR datetime(truce_ends_at)<=datetime(?))").bind(token,round.id,front.id,freshRound.skill_action_token||'',new Date(now).toISOString(),new Date(now).toISOString()),
          env.DB.prepare("UPDATE territory_war_v3_fronts SET skill_action_token=? WHERE id=? AND version=? AND status='ACTIVE' AND a_hp>0 AND b_hp>0").bind(token,front.id,freshFront.version),
          env.DB.prepare('UPDATE territory_battlefield_fronts SET action_token=?,cannon_'+own+'_due_ms=0,emp_'+enemy+'_until_ms=MAX(emp_'+enemy+'_until_ms,?),version=version+1 WHERE front_id=? AND cannon_'+own+'_due_ms=? AND cannon_'+own+'_request=?').bind(token,now+config.cannonDisableSeconds*1000,front.id,due,requestId),
          env.DB.prepare('INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds r JOIN territory_war_v3_fronts f ON f.id=r.current_front_id JOIN territory_battlefield_fronts b ON b.front_id=f.id WHERE r.id=? AND r.skill_action_token=? AND f.skill_action_token=? AND b.action_token=?) THEN 1 ELSE 0 END').bind(token,round.id,token,token,token),
          env.DB.prepare('UPDATE territory_war_v3_fronts SET '+enemy+'_hp='+enemy+'_hp-?,version=version+1 WHERE id=?').bind(damage,front.id),
          env.DB.prepare('UPDATE territory_war_v3_rounds SET '+own+'_total_damage='+own+'_total_damage+? WHERE id=?').bind(damage,round.id),
          env.DB.prepare("INSERT INTO territory_battlefield_events(id,round_id,front_id,side,type,payload_json,created_at_ms) VALUES(?,?,?,?,'CANNON_FIRED',?,?)").bind(token,round.id,front.id,side,JSON.stringify(payload),now),
          env.DB.prepare("INSERT INTO territory_war_v3_notices(round_id,type,side,title,message,payload_json) VALUES(?,'BATTLEFIELD_SKILL',?,'거대 공성포 착탄',?,?)").bind(round.id,side,'공성 피해 '+damage+(counter?' · 대포병 반격으로 피해 감소':''),JSON.stringify(payload)),
          env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token)
        ]);
        changed=true;break;
      }catch(error){if(attempt===2)console.warn('territory cannon deferred after contention',String(error.message||error));}
    }
  }
  return changed;
}

export async function claimBattlefieldSupply(env,{round,front,claimFrontId=front?.id,mine,requestId,cycle,cfg,rechargeEnergy,now=Date.now()}){
  const old=await env.DB.prepare('SELECT * FROM territory_battlefield_supply_claims WHERE front_id=? AND cycle=? AND user_id=?').bind(claimFrontId,cycle,mine.user_id).first();
  if(old)return{replayed:true,energyGained:Number(old.energy)};
  const config=await battlefieldPolicy(env,round);if(!config?.enabled||!Number.isSafeInteger(cycle)||cycle<1)fail('수령할 보급열차를 확인해 주세요.');
  const side=mine.side,own=sideColumn(side),data=await env.DB.prepare('SELECT * FROM territory_battlefield_fronts WHERE front_id=?').bind(front.id).first();
  if(!data||Number(data['emp_'+own+'_until_ms'])>now)fail('시설 정지 중입니다. 공병 복구 또는 재가동 후 수령해 주세요.');
  const energy=rechargeEnergy(mine,cfg,front),energyAfter=Math.min(Number(cfg.energyMax),energy.energy+config.supplyEnergy),gained=energyAfter-energy.energy;
  if(gained<=0)fail('행동력이 최대입니다. 교전 후 보급을 수령해 주세요.');
  const token='BF_SUPPLY:'+requestId;
  await env.DB.batch([
    env.DB.prepare("UPDATE territory_war_v3_rounds SET version=version WHERE id=? AND status='ACTIVE' AND current_front_id=?").bind(round.id,front.id),
    env.DB.prepare('UPDATE territory_battlefield_fronts SET action_token=? WHERE front_id=? AND emp_'+own+'_until_ms<=?').bind(token,front.id,now),
    env.DB.prepare("UPDATE territory_war_v3_users SET updated_at=updated_at WHERE round_id=? AND user_id=? AND side=? AND status='ACTIVE'").bind(round.id,mine.user_id,side),
    env.DB.prepare("INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND current_front_id=? AND status='ACTIVE' AND datetime(ends_at)>datetime(?) AND (truce_ends_at IS NULL OR datetime(truce_ends_at)<=datetime(?))) AND EXISTS(SELECT 1 FROM territory_battlefield_fronts WHERE front_id=? AND action_token=?) AND EXISTS(SELECT 1 FROM territory_war_v3_users WHERE round_id=? AND user_id=? AND side=? AND status='ACTIVE' AND energy=? AND COALESCE(last_recharged_at,'')=?) AND EXISTS(SELECT 1 FROM territory_battlefield_trains WHERE front_id=? AND cycle=? AND winner_side=? AND round_id=?) AND EXISTS(SELECT 1 FROM territory_battlefield_contributions WHERE front_id=? AND cycle=? AND user_id=? AND objective='SUPPLY' AND applied=1) AND NOT EXISTS(SELECT 1 FROM territory_battlefield_supply_claims WHERE front_id=? AND cycle=? AND user_id=?) THEN 1 ELSE 0 END").bind(token,round.id,front.id,new Date(now).toISOString(),new Date(now).toISOString(),front.id,token,round.id,mine.user_id,side,mine.energy,mine.last_recharged_at||'',claimFrontId,cycle,side,round.id,claimFrontId,cycle,mine.user_id,claimFrontId,cycle,mine.user_id),
    env.DB.prepare('UPDATE territory_war_v3_users SET energy=?,last_recharged_at=?,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?').bind(energyAfter,energy.lastRechargedAt,round.id,mine.user_id),
    env.DB.prepare('INSERT INTO territory_battlefield_supply_claims(front_id,cycle,user_id,side,request_id,energy,claimed_at_ms) VALUES(?,?,?,?,?,?,?)').bind(claimFrontId,cycle,mine.user_id,side,requestId,gained,now),
    env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token)
  ]);
  return{energyGained:gained,energyAfter,replayed:false};
}
