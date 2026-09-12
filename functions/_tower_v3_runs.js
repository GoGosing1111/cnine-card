import {buildTowerV3Battle,validateTowerV3Config,migrateTowerProgress,towerProgressAfter,towerError,towerInt} from './_tower_v3.js';
import {validateTowerEconomy,planTowerRewards,towerBudgetDate} from './_tower_v3_economy.js';
import {prepareUnifiedDropGrant} from './_drop_pool.js';

const RUNS='tower_v3_runs_v1',PROGRESS='tower_v3_progress_v1',DAILY='tower_v3_daily_v1',FIRST='tower_v3_first_clears_v1',RECORDS='tower_v3_records_v1';
const LEASE=120000,MAX_BYTES=850000;
const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const json=value=>{const s=JSON.stringify(value);if(new TextEncoder().encode(s).length>MAX_BYTES)throw towerError('TOWER_V3_PAYLOAD','전투 기록이 허용 크기를 초과했습니다.');return s;};
const parse=s=>JSON.parse(String(s));
const owns=`EXISTS(SELECT 1 FROM ${RUNS} WHERE user_id=? AND request_id=? AND lease_token=? AND state='PREPARED')`;
export const TOWER_V3_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS ${PROGRESS}(user_id INTEGER PRIMARY KEY,best_cleared INTEGER NOT NULL,max_unlocked INTEGER NOT NULL,legacy_reward_through INTEGER NOT NULL,best_run_id TEXT,selected_tier INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ${RUNS}(user_id INTEGER NOT NULL,request_id TEXT NOT NULL,tier INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'PREPARED',seed INTEGER NOT NULL,day_key TEXT NOT NULL,checkpoint_json TEXT NOT NULL,response_json TEXT,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,integrity INTEGER NOT NULL DEFAULT 1,last_error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,request_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tower_v3_active_user ON ${RUNS}(user_id) WHERE state<>'COMPLETED'`,
  `CREATE TABLE IF NOT EXISTS ${DAILY}(user_id INTEGER NOT NULL,day_key TEXT NOT NULL,rewarded INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,material INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day_key))`,
  `CREATE TABLE IF NOT EXISTS ${FIRST}(user_id INTEGER NOT NULL,tier INTEGER NOT NULL,request_id TEXT NOT NULL,policy_version TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,tier))`,
  `CREATE TABLE IF NOT EXISTS tower_v3_reward_ledger_v1(user_id INTEGER NOT NULL,request_id TEXT NOT NULL,reward_type TEXT NOT NULL,reward_ref TEXT NOT NULL,quantity INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,request_id,reward_type,reward_ref))`,
  `CREATE TABLE IF NOT EXISTS ${RECORDS}(user_id INTEGER NOT NULL,rules_version TEXT NOT NULL,tier INTEGER NOT NULL,best_combat_ms INTEGER NOT NULL,request_id TEXT NOT NULL,achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,rules_version,tier))`,
  `CREATE INDEX IF NOT EXISTS idx_tower_v3_ranking ON ${RECORDS}(rules_version,tier DESC,best_combat_ms,achieved_at,user_id)`
];
// Explicit migration only. Importing a route/module never performs DDL.
export async function ensureTowerV3Schema(env){
  if(typeof env.DB.execSchema==='function')await env.DB.execSchema(TOWER_V3_SCHEMA.map(s=>s.replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')));
  else for(const s of TOWER_V3_SCHEMA)await env.DB.prepare(s).run();
}
function userId(user){return towerInt(Number(user?.id),1,Number.MAX_SAFE_INTEGER,'계정');}
function key(user,body){const uid=userId(user);if(typeof body?.requestId!=='string'||!/^[-A-Za-z0-9_:]{1,100}$/.test(body.requestId))throw towerError('TOWER_V3_REQUEST','원정 요청번호를 확인하세요.');return {uid,rid:body.requestId};}
const getRun=(env,uid,rid)=>p(env,`SELECT * FROM ${RUNS} WHERE user_id=? AND request_id=?`,uid,rid).first();
const activeRun=(env,uid)=>p(env,`SELECT request_id,tier FROM ${RUNS} WHERE user_id=? AND state<>'COMPLETED'`,uid).first();
const pending=row=>({ok:true,status:'RUNNING',requestId:row.request_id,tier:Number(row.tier),retryAfterMs:1500});
function presentProgress(row){return {bestClearedTier:Number(row.best_cleared),maxUnlockedTier:Number(row.max_unlocked),legacyRewardThrough:Number(row.legacy_reward_through),bestRunId:row.best_run_id,selectedTier:Number(row.selected_tier),revision:Number(row.revision)};}
async function progress(env,uid,legacy){
  let row=await p(env,`SELECT * FROM ${PROGRESS} WHERE user_id=?`,uid).first();
  if(!row){const m=migrateTowerProgress(legacy);await p(env,`INSERT INTO ${PROGRESS}(user_id,best_cleared,max_unlocked,legacy_reward_through) VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING`,uid,m.bestClearedTier,m.maxUnlockedTier,m.legacyRewardThrough).run();row=await p(env,`SELECT * FROM ${PROGRESS} WHERE user_id=?`,uid).first();}
  return presentProgress(row);
}
export async function towerV3Status(env,user,deps){
  const uid=userId(user),legacy=await deps.loadLegacy(env,user),c=validateTowerV3Config(await deps.readConfig(env));
  const policy=validateTowerEconomy(await deps.readEconomy(env));
  const row=await p(env,`SELECT * FROM ${PROGRESS} WHERE user_id=?`,uid).first();
  // Merely opening the status page does not migrate an account.
  const state=row?presentProgress(row):{...migrateTowerProgress(legacy),selectedTier:1,revision:0};
  const day=towerBudgetDate((deps.now||Date.now)());
  const budget=await p(env,`SELECT rewarded,eligible,material FROM ${DAILY} WHERE user_id=? AND day_key=?`,uid,day).first()||{rewarded:0,eligible:0,material:0};
  const active=await activeRun(env,uid);
  return {ok:true,status:active?'RUNNING':'IDLE',...(active?pending(active):{}),progress:state,budget:{...budget,day,remaining:Math.max(0,policy.dailyRewardedClears-Number(budget.rewarded))},rulesVersion:c.rulesVersion,policyVersion:policy.version,maxTier:c.maxTier,autoRepeatMax:c.autoRepeatMax,mode:c.mode};
}
export async function towerV3Result(env,user,requestId){const {uid,rid}=key(user,{requestId}),row=await getRun(env,uid,rid);return row?.state==='COMPLETED'?{...parse(row.response_json),replayed:true}:row?pending(row):{ok:true,status:'NOT_FOUND'};}
async function settle(env,user,row,token,now){
  const uid=userId(user),rid=row.request_id,saved=parse(row.checkpoint_json);
  if(saved.userId!==uid||saved.requestId!==rid||saved.battle.tier!==Number(row.tier))throw towerError('TOWER_V3_RECORD','저장된 원정의 소유자를 확인할 수 없습니다.');
  const grantPlan={userId:uid,requestId:`TOWER_V3:${rid}`,sourceType:'TOWER',sourceId:String(row.tier),triggerType:'CLEAR',pools:[],rewards:saved.plan.rewards.map(r=>({...r,poolId:r.poolId??null,entryId:r.entryId??null}))};
  const grants=await prepareUnifiedDropGrant(env,grantPlan,{writePoolLedger:false}),next={...towerProgressAfter(saved.progress,saved.battle),selectedTier:Number(row.tier),revision:saved.progress.revision+1};
  if(saved.battle.success&&saved.battle.tier>saved.progress.bestClearedTier)next.bestRunId=rid;
  const response={...saved.battle,status:'COMPLETED',requestId:rid,progress:next,rewards:grants.rewards,firstClear:saved.plan.firstClear,
    budget:{day:row.day_key,rewarded:saved.plan.rewardedAfter,remaining:saved.plan.remaining},policyVersion:saved.plan.policyVersion,refreshAccount:grants.rewards.length>0};
  const success=saved.battle.success,proofs=grants.proofs.length?grants.proofs.map(q=>`(${q.sql})`).join(' AND '):'1=1';
  const first=success&&saved.plan.firstClear;
  await env.DB.batch([
    // A NOT NULL failure also guards an absent row, not just an UPDATE matching
    // zero rows. All grants, first claims and completion share this transaction.
    p(env,`INSERT INTO ${RUNS}(user_id,request_id,tier,seed,day_key,checkpoint_json,integrity) SELECT ?,?,1,0,'','',NULL WHERE NOT EXISTS(SELECT 1 FROM ${RUNS} WHERE user_id=? AND request_id=? AND lease_token=? AND lease_until>? AND state='PREPARED') OR NOT EXISTS(SELECT 1 FROM users WHERE id=?)`,uid,rid,uid,rid,token,now(),uid),
    ...(first?[p(env,`INSERT INTO ${FIRST}(user_id,tier,request_id,policy_version) VALUES(?,?,?,?)`,uid,row.tier,rid,saved.plan.policyVersion)]:[]),
    ...grants.statements,
    ...saved.plan.rewards.map(r=>p(env,'INSERT INTO tower_v3_reward_ledger_v1(user_id,request_id,reward_type,reward_ref,quantity) VALUES(?,?,?,?,?)',uid,rid,r.rewardType,r.rewardRef,r.quantity)),
    p(env,`UPDATE ${RUNS} SET integrity=CASE WHEN ${proofs} THEN 1 ELSE NULL END WHERE user_id=? AND request_id=? AND lease_token=?`,...grants.proofs.flatMap(q=>q.values),uid,rid,token),
    p(env,`UPDATE ${PROGRESS} SET best_cleared=CASE WHEN best_cleared<? THEN ? ELSE best_cleared END,max_unlocked=CASE WHEN max_unlocked<? THEN ? ELSE max_unlocked END,best_run_id=CASE WHEN best_cleared<? THEN ? ELSE best_run_id END,selected_tier=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`,next.bestClearedTier,next.bestClearedTier,next.maxUnlockedTier,next.maxUnlockedTier,next.bestClearedTier,rid,row.tier,uid),
    p(env,`UPDATE ${RUNS} SET integrity=CASE WHEN EXISTS(SELECT 1 FROM ${PROGRESS} WHERE user_id=? AND revision=?) THEN 1 ELSE NULL END WHERE user_id=? AND request_id=?`,uid,next.revision,uid,rid),
    ...(success?[p(env,`INSERT INTO ${RECORDS}(user_id,rules_version,tier,best_combat_ms,request_id) VALUES(?,?,?,?,?) ON CONFLICT(user_id,rules_version,tier) DO UPDATE SET best_combat_ms=excluded.best_combat_ms,request_id=excluded.request_id,achieved_at=CURRENT_TIMESTAMP WHERE excluded.best_combat_ms<${RECORDS}.best_combat_ms`,uid,saved.battle.rulesVersion,row.tier,saved.battle.elapsedCombatMs,rid)]:[]),
    p(env,`UPDATE ${RUNS} SET state='COMPLETED',response_json=?,lease_token=NULL,lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND request_id=? AND lease_token=?`,json(response),uid,rid,token)
  ]);
  return response;
}
export async function towerV3Ranking(env,{rulesVersion,limit=50}){
  if(!/^TOWER_[A-Z0-9_:-]{1,80}$/.test(rulesVersion))throw towerError('TOWER_V3_CONFIG','기록판 버전을 확인하세요.');
  towerInt(limit,1,100,'순위 조회 수');
  const rows=await p(env,`SELECT r.user_id,u.nickname,r.tier,r.best_combat_ms,r.achieved_at FROM ${RECORDS} r JOIN users u ON u.id=r.user_id WHERE r.rules_version=? AND NOT EXISTS(SELECT 1 FROM ${RECORDS} higher WHERE higher.user_id=r.user_id AND higher.rules_version=r.rules_version AND higher.tier>r.tier) ORDER BY r.tier DESC,r.best_combat_ms ASC,r.achieved_at ASC,r.user_id ASC LIMIT ?`,rulesVersion,limit).all();
  return {ok:true,rulesVersion,records:rows.results||[]};
}
export async function runTowerV3(env,user,body,deps){
  const {uid,rid}=key(user,body),now=deps.now||Date.now,token=crypto.randomUUID();
  let row=await getRun(env,uid,rid);
  if(row?.state==='COMPLETED')return {...parse(row.response_json),replayed:true};
  if(row){
    const claimed=await p(env,`UPDATE ${RUNS} SET lease_token=?,lease_until=? WHERE user_id=? AND request_id=? AND state='PREPARED' AND (lease_token IS NULL OR lease_until<=?)`,token,now()+LEASE,uid,rid,now()).run();
    if(Number(claimed.meta?.changes)!==1)return pending(row);
  }else{
    const active=await activeRun(env,uid);if(active)return pending(active);
    const config=validateTowerV3Config(await deps.readConfig(env)),policy=validateTowerEconomy(await deps.readEconomy(env));
    if(!(config.mode==='ON'&&policy.approved||config.mode==='TEST'&&String(user.role).toUpperCase()==='OWNER'))throw towerError('TOWER_V3_CLOSED','현재 무한의탑 개편판 입장이 잠겨 있습니다.');
    const legacy=await deps.loadLegacy(env,user),state=await progress(env,uid,legacy);
    const tier=towerInt(body.tier,1,config.maxTier,'도전층');if(tier>state.maxUnlockedTier)throw towerError('TOWER_V3_LOCKED','아직 해금되지 않은 층입니다.');
    const snapshot=await deps.loadSnapshot(env,user),seed=crypto.getRandomValues(new Uint32Array(1))[0];
    const battle=buildTowerV3Battle({snapshot,tier,seed,config}),day=towerBudgetDate(now());
    const before=await p(env,`SELECT rewarded,eligible,material FROM ${DAILY} WHERE user_id=? AND day_key=?`,uid,day).first()||{rewarded:0,eligible:0,material:0};
    const budget=Object.fromEntries(Object.entries(before).map(([k,v])=>[k,Number(v)]));
    const first=await p(env,`SELECT 1 AS claimed FROM ${FIRST} WHERE user_id=? AND tier=?`,uid,tier).first();
    const plan=planTowerRewards({battle,progress:state,firstClaimed:Boolean(first),budget,policy,firstTable:legacy.firstRewards});
    const checkpoint=json({userId:uid,requestId:rid,snapshot,battle,progress:state,plan,config,policy,seed});
    const stamp=now();
    try{
      await env.DB.batch([
        p(env,`INSERT INTO ${RUNS}(user_id,request_id,tier,seed,day_key,checkpoint_json,lease_token,lease_until) VALUES(?,?,?,?,?,?,?,?)`,uid,rid,tier,seed,day,checkpoint,token,stamp+LEASE),
        p(env,`INSERT INTO ${DAILY}(user_id,day_key) VALUES(?,?) ON CONFLICT(user_id,day_key) DO NOTHING`,uid,day),
        // Compare the complete pre-admission budget in-transaction. A competing
        // admission may have completed between SELECT and INSERT above.
        p(env,`UPDATE ${RUNS} SET integrity=CASE WHEN EXISTS(SELECT 1 FROM ${DAILY} WHERE user_id=? AND day_key=? AND rewarded=? AND eligible=? AND material=?) AND EXISTS(SELECT 1 FROM ${PROGRESS} WHERE user_id=? AND revision=?) THEN 1 ELSE NULL END WHERE user_id=? AND request_id=?`,uid,day,budget.rewarded,budget.eligible,budget.material,uid,state.revision,uid,rid),
        p(env,`UPDATE ${DAILY} SET rewarded=rewarded+?,eligible=eligible+?,material=material+? WHERE user_id=? AND day_key=? AND ${owns}`,plan.repeatReserved?1:0,plan.eligibleMaterial?1:0,plan.materialQuantity,uid,day,uid,rid,token)
      ]);
      row=await getRun(env,uid,rid);
    }catch(cause){
      row=await getRun(env,uid,rid);
      if(row?.state==='COMPLETED')return {...parse(row.response_json),replayed:true};
      if(row?.lease_token!==token){const other=await activeRun(env,uid);if(other)return pending(other);throw cause;}
      // Reservation commit succeeded and its response was lost: this worker
      // still owns the frozen plan and can finish without a new roll.
    }
  }
  try{return await settle(env,user,row,token,now);}
  catch(cause){
    const completed=await getRun(env,uid,rid);if(completed?.state==='COMPLETED')return {...parse(completed.response_json),replayed:true};
    await p(env,`UPDATE ${RUNS} SET lease_token=NULL,lease_until=0,last_error=? WHERE user_id=? AND request_id=? AND state='PREPARED' AND lease_token=?`,String(cause.code||cause.message||cause).slice(0,200),uid,rid,token).run();
    throw cause;
  }
}
