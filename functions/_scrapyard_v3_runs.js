import {loadScrapyardV3Snapshot, buildScrapyardV3Battle, validateScrapyardV3Config} from './_scrapyard_v3.js';
import {planUnifiedDropRoll, prepareUnifiedDropGrant} from './_drop_pool.js';

// No HTTP registration: this is exercised with local databases only until the
// whole PVE overhaul is ready. The future route must retain the shared user
// mutation lock used by the existing scrapyard/run route.
export const SCRAPYARD_V3_OPERATION_TABLE = 'scrapyard_v3_operations_v1';
const OPS = SCRAPYARD_V3_OPERATION_TABLE;
const RECEIPTS = 'scrapyard_run_receipts_v1676', RUNS = 'scrapyard_runs_v1676';
const TICKETS = 'scrapyard_ticket_reservations_v1680', ITEM = 'SCRAPYARD_ENTRY_TICKET';
const DROPS = 'unified_drop_receipts_v1667';
const LEASE_MS = 120000, MAX_CHECKPOINT_BYTES = 850000;
const ownedSql = `EXISTS(SELECT 1 FROM ${OPS} WHERE request_id=? AND user_id=? AND lease_token=? AND state='PREPARED')`;
const error = (code, message) => Object.assign(new Error(message), {code});
const parse = value => JSON.parse(String(value));
const p = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);

export const SCRAPYARD_V3_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ${OPS}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'PREPARED',seed INTEGER NOT NULL,snapshot_json TEXT NOT NULL,battle_json TEXT NOT NULL,drop_plan_json TEXT NOT NULL,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,integrity INTEGER NOT NULL DEFAULT 1,last_error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_scrapyard_v3_active_user ON ${OPS}(user_id) WHERE state<>'COMPLETED'`
];

export async function ensureScrapyardV3Schema(env) {
  // Postgres's D1 compatibility wrapper ignores normal DDL. Use its dedicated
  // schema path, not a marker claiming a table exists when CREATE was skipped.
  if (typeof env.DB.execSchema === 'function') {
    await env.DB.execSchema(SCRAPYARD_V3_SCHEMA.map(sql => sql.replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')));
  } else {
    for (const sql of SCRAPYARD_V3_SCHEMA) await env.DB.prepare(sql).run();
  }
}

function key(user, body) {
  if (!Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0) throw error('SCRAPYARD_V3_AUTH', '로그인이 필요합니다.');
  if (typeof body?.requestId !== 'string' || !/^[A-Za-z0-9_:-]{1,105}$/.test(body.requestId)) throw error('SCRAPYARD_V3_REQUEST', '원정 요청번호가 올바르지 않습니다.');
  if (!['OUTER','CORE','FURNACE'].includes(body?.difficulty)) throw error('SCRAPYARD_V3_ZONE', '폐차장 구역을 선택하세요.');
  return {uid:Number(user.id), rid:body.requestId};
}

async function receipt(env, uid, rid) {
  return p(env, `SELECT status,response_json FROM ${RECEIPTS} WHERE user_id=? AND request_id=?`, uid, rid).first();
}
async function operation(env, uid, rid) {
  return p(env, `SELECT * FROM ${OPS} WHERE user_id=? AND request_id=?`, uid, rid).first();
}
function pending(rid, code = 'SCRAPYARD_V3_RUNNING', difficulty) {
  return {ok:true, status:'RUNNING', code, requestId:rid, ...(difficulty ? {difficulty} : {}), retryAfterMs:1500, resultPending:true};
}
function kstRange(at) {
  const day = new Date(at + 9 * 3600000), start = Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate()) - 9 * 3600000;
  const sqlTime = ms => new Date(ms).toISOString().replace('T',' ').slice(0,19);
  return {start:sqlTime(start), end:sqlTime(start + 86400000)};
}
function encoded(value) {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_CHECKPOINT_BYTES) throw error('SCRAPYARD_V3_PAYLOAD', '원정 기록이 허용 크기를 초과했습니다. 입장권은 사용하지 않았습니다.');
  return json;
}

async function claim(env, uid, rid, token, at) {
  const row = await p(env, `UPDATE ${OPS} SET lease_token=?,lease_until=?,updated_at=CURRENT_TIMESTAMP
    WHERE request_id=? AND user_id=? AND state='PREPARED' AND (lease_token IS NULL OR lease_until<=?)`, token, at + LEASE_MS, rid, uid, at).run();
  return Number(row.meta?.changes) === 1;
}

async function reserve(env, user, rid, difficulty, cfg, snapshot, battle, plan, seed, token, at) {
  const uid = Number(user.id), day = kstRange(at), owner = String(user.role).toUpperCase() === 'OWNER';
  const snapshotJson = encoded(snapshot), battleJson = encoded({...battle, difficulty}), planJson = encoded(plan);
  // Keep headroom for presented rewards and per-row limits across backends.
  if (new TextEncoder().encode(encoded({snapshot,battle,difficulty,plan})).byteLength > 700000) throw error('SCRAPYARD_V3_PAYLOAD','원정 기록이 너무 큽니다. 입장권은 사용하지 않았습니다.');
  // A partial unique index allows only one unfinished expedition per account.
  // Every economic write shares this transaction with its frozen result.
  const stmts = [
    p(env, `INSERT INTO ${OPS}(request_id,user_id,seed,snapshot_json,battle_json,drop_plan_json,lease_token,lease_until)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)
      AND (?=1 OR (SELECT COUNT(*) FROM ${RUNS} WHERE user_id=? AND created_at>=? AND created_at<?)<?)`,
    rid,uid,seed,snapshotJson,battleJson,planJson,token,at+LEASE_MS,uid,ITEM,owner?1:0,uid,day.start,day.end,cfg.dailyRuns),
    p(env, `INSERT INTO ${RECEIPTS}(request_id,user_id,difficulty,status,ticket_consumed,response_json)
      SELECT ?,?,?,'PENDING',1,? WHERE ${ownedSql}`,rid,uid,difficulty.id,battleJson,rid,uid,token),
    // Do not silently succeed on zero stock; the NOT NULL guard below rolls
    // back the complete reservation if this subtraction could go negative.
    p(env, `UPDATE cnine_user_inventory SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND ${ownedSql}`,uid,ITEM,rid,uid,token),
    p(env, `UPDATE ${OPS} SET integrity=CASE WHEN EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=0) THEN 1 ELSE NULL END WHERE request_id=? AND user_id=? AND lease_token=?`,uid,ITEM,rid,uid,token),
    p(env, `INSERT INTO ${TICKETS}(request_id,user_id,item_code,status) SELECT ?,?,?,'RESERVED' WHERE ${ownedSql}`,rid,uid,ITEM,rid,uid,token),
    p(env, `INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,-1,quantity,'폐차장 입장','SCRAPYARD_ENTRY',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND ${ownedSql}`,uid,ITEM,rid,uid,ITEM,rid,uid,token)
  ];
  await env.DB.batch(stmts);
  const op = await operation(env,uid,rid);
  if (!op) throw error('SCRAPYARD_V3_ENTRY_UNAVAILABLE', '폐차장 입장권 또는 오늘 남은 입장 횟수를 확인하세요.');
  return op;
}

async function settle(env, user, op, token) {
  const uid = Number(user.id), rid = op.request_id, saved = parse(op.battle_json), plan = parse(op.drop_plan_json);
  if (Number(op.user_id) !== uid || plan.userId !== uid || plan.requestId !== `SCRAPYARD:${rid}` ||
      plan.sourceType !== 'SCRAPYARD' || plan.sourceId !== saved.difficulty?.id) throw error('SCRAPYARD_V3_RECORD', '저장된 원정 기록의 소유자를 확인할 수 없습니다.');
  const grants = await prepareUnifiedDropGrant(env,plan);
  const clearCoin = saved.success ? Number(saved.difficulty.clearCoin) : 0;
  const rewards = [...(clearCoin > 0 ? [{rewardType:'COIN',rewardRef:'COIN',rewardName:'클리어 코인',quantity:clearCoin,guaranteed:true}] : []), ...grants.rewards];
  const inventory = await p(env,'SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',uid,ITEM).first();
  const response = {...saved, ok:true, status:'COMPLETED', requestId:rid, rewards, partDropped:grants.rewards.length>0,
    entryTicket:{code:ITEM,consumed:1,remaining:Number(inventory?.quantity || 0)}, refreshAccount:true};
  const responseJson = encoded(response);
  const proofs = grants.proofs.length ? grants.proofs.map(proof => `(${proof.sql})`).join(' AND ') : '1=1';
  const proofValues = grants.proofs.flatMap(proof => proof.values);
  await env.DB.batch([
    // Fail before any shared grant if ownership expired OR the row disappeared.
    // An UPDATE-only check could affect zero rows and let the batch continue.
    p(env, `INSERT INTO ${OPS}(request_id,user_id,seed,snapshot_json,battle_json,drop_plan_json,integrity)
      SELECT ?,?,0,'','','',NULL WHERE NOT EXISTS(SELECT 1 FROM ${OPS}
        WHERE request_id=? AND user_id=? AND lease_token=? AND lease_until>? AND state='PREPARED')`,rid,uid,rid,uid,token,Date.now()),
    ...grants.statements,
    p(env, `UPDATE ${OPS} SET integrity=CASE WHEN ${proofs} THEN 1 ELSE NULL END WHERE request_id=? AND user_id=? AND lease_token=?`,...proofValues,rid,uid,token),
    ...(clearCoin > 0 ? [
      p(env,'UPDATE users SET coin=coin+? WHERE id=?',clearCoin,uid),
      p(env,"INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'SCRAPYARD_CLEAR' FROM users WHERE id=?",clearCoin,uid)
    ] : []),
    p(env, `UPDATE ${OPS} SET integrity=CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?) THEN 1 ELSE NULL END WHERE request_id=? AND user_id=? AND lease_token=?`,uid,grants.balances.coin+clearCoin,rid,uid,token),
    // Empty/no-binding rolls are deliberately persisted for an expedition:
    // a CMS edit must not turn a retried empty result into a new prize roll.
    p(env, `INSERT INTO ${DROPS}(request_id,user_id,source_type,source_id,trigger_type,status,result_json)
      VALUES(?,?,'SCRAPYARD',?,'CLEAR','COMPLETED',?)`,plan.requestId,uid,plan.sourceId,encoded({ok:true,rewards:grants.rewards,pools:plan.pools})),
    p(env, `INSERT INTO ${RUNS}(request_id,user_id,difficulty,deck_power,waves_total,waves_cleared,success,rewards_json) VALUES(?,?,?,?,?,?,?,?)`,rid,uid,saved.difficulty.id,saved.deckPower,saved.wavesTotal,saved.wavesCleared,saved.success?1:0,JSON.stringify(rewards)),
    p(env, `UPDATE ${TICKETS} SET status='CONSUMED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='RESERVED'`,rid,uid),
    p(env, `UPDATE ${RECEIPTS} SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`,responseJson,rid,uid),
    p(env, `UPDATE ${OPS} SET state='COMPLETED',lease_token=NULL,lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND lease_token=?`,rid,uid,token)
  ]);
  return response;
}

export async function runScrapyardV3(env,user,body,deps) {
  const {uid,rid} = key(user,body), prior = await receipt(env,uid,rid);
  if (prior?.status === 'COMPLETED') return {...parse(prior.response_json),replayed:true};
  let op = await operation(env,uid,rid);
  if (prior && !op) throw error('SCRAPYARD_V3_LEGACY_REQUEST','이 요청은 이전 폐차장 기록입니다. 기존 결과를 먼저 확인하세요.');
  const token = crypto.randomUUID(), at = Date.now();
  if (op) {
    if (!(await claim(env,uid,rid,token,at))) return pending(rid, 'SCRAPYARD_V3_RUNNING', parse(op.battle_json).difficulty.id);
  } else {
    const active = await p(env,`SELECT request_id,battle_json FROM ${OPS} WHERE user_id=? AND state<>'COMPLETED'`,uid).first();
    if (active) return pending(active.request_id,'SCRAPYARD_V3_RECOVER_ACTIVE',parse(active.battle_json).difficulty.id);
    const cfg = await deps.readSettings(env), difficulty = cfg.difficulties.find(row => row.id === body.difficulty);
    if (!difficulty || !(cfg.mode === 'ON' || cfg.mode === 'TEST' && String(user.role).toUpperCase() === 'OWNER')) throw error('SCRAPYARD_V3_CLOSED','현재 폐차장 입장이 잠겨 있습니다.');
    if (!Number.isSafeInteger(cfg.dailyRuns) || cfg.dailyRuns < 1 || !Number.isSafeInteger(difficulty.clearCoin) || difficulty.clearCoin < 0) throw error('SCRAPYARD_V3_CONFIG','폐차장 보상·횟수 설정을 확인하세요.');
    const config = validateScrapyardV3Config(difficulty.id,cfg.v3?.[difficulty.id]);
    const snapshot = await loadScrapyardV3Snapshot(env,user,deps), seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const battle = buildScrapyardV3Battle({snapshot,difficulty,config,seed});
    const plan = battle.success ? await planUnifiedDropRoll(env,{userId:uid,requestId:`SCRAPYARD:${rid}`,sourceType:'SCRAPYARD',sourceId:difficulty.id,triggerType:'CLEAR',context:{difficulty:cfg.difficulties.findIndex(row=>row.id===difficulty.id)+1,wave:battle.wavesCleared,boss:true},role:user.role})
      : {userId:uid,requestId:`SCRAPYARD:${rid}`,sourceType:'SCRAPYARD',sourceId:difficulty.id,triggerType:'CLEAR',pools:[],rewards:[]};
    // Start the lease after snapshot/roll reads, not before potentially slow I/O.
    try { op = await reserve(env,user,rid,difficulty,cfg,snapshot,battle,plan,seed,token,Date.now()); }
    catch (cause) {
      const activeNow = await p(env,`SELECT request_id,battle_json FROM ${OPS} WHERE user_id=? AND state<>'COMPLETED'`,uid).first();
      const completed = await receipt(env,uid,rid);
      if (completed?.status === 'COMPLETED') return {...parse(completed.response_json),replayed:true};
      const reserved = activeNow?.request_id === rid ? await operation(env,uid,rid) : null;
      // A reservation COMMIT can succeed while its response is lost. This
      // worker still owns that lease and can settle immediately, without 120s wait.
      if (reserved?.lease_token === token && Number(reserved.lease_until) > Date.now()) op = reserved;
      else if (activeNow) return pending(activeNow.request_id,'SCRAPYARD_V3_RECOVER_ACTIVE',parse(activeNow.battle_json).difficulty.id);
      else throw cause;
    }
  }
  try { return await settle(env,user,op,token); }
  catch (cause) {
    // Never refund a frozen successful battle and leave its reward behind.
    // Failed finalization rolls back all grants; the same saved plan is resumed.
    const completed = await receipt(env,uid,rid);
    if (completed?.status === 'COMPLETED') return {...parse(completed.response_json),replayed:true};
    await p(env,`UPDATE ${OPS} SET lease_token=NULL,lease_until=0,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND lease_token=? AND state='PREPARED'`,String(cause?.message||cause).slice(0,400),rid,uid,token).run();
    return pending(rid,'SCRAPYARD_V3_SETTLEMENT_PENDING',parse(op.battle_json).difficulty.id);
  }
}

export async function scrapyardV3RecoveryStatus(env,user) {
  if (!Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0) throw error('SCRAPYARD_V3_AUTH', '로그인이 필요합니다.');
  const row = await p(env,`SELECT request_id,state,lease_until,battle_json FROM ${OPS} WHERE user_id=? AND state<>'COMPLETED'`,Number(user.id)).first();
  return row ? {...pending(row.request_id, 'SCRAPYARD_V3_RUNNING',parse(row.battle_json).difficulty.id),canResume:Number(row.lease_until)<=Date.now()} : {ok:true,status:'IDLE'};
}
