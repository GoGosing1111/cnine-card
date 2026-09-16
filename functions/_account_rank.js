import {RANKS,rankForLevel} from '../shared/account-ranks-v1.mjs';

// Server-only. Never return the curve, payout rules or receipt ledger to clients.
const PAYOUT = Object.freeze({HUNT:8,APOCALYPSE:24,RAID:20,ESCORT:30,SIEGE:120,SEAL:160,TOWER:10,SCRAPYARD:20,COW_ROOM:30,RIFT:30});
export const MAX_RANK_TICKS=139440*600;
const PROGRESS='account_rank_progress_v1',LEDGER='account_rank_receipts_v1';
export const ACCOUNT_RANK_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS ${PROGRESS}(user_id INTEGER PRIMARY KEY,total_ticks INTEGER NOT NULL DEFAULT 0 CHECK(total_ticks>=0 AND total_ticks<=${MAX_RANK_TICKS}),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ${LEDGER}(user_id INTEGER NOT NULL,source TEXT NOT NULL,event_id TEXT NOT NULL,ticks INTEGER NOT NULL CHECK(ticks>0),token TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,source,event_id))`,
  `CREATE TABLE IF NOT EXISTS account_rank_presets_v1(user_id INTEGER NOT NULL,slot INTEGER NOT NULL CHECK(slot>=1 AND slot<=5),name TEXT NOT NULL,card_ids TEXT NOT NULL,mercenary_code TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,slot))`,
  `CREATE TABLE IF NOT EXISTS account_rank_idle_cursor_v1(user_id INTEGER PRIMARY KEY,settled_at TEXT NOT NULL)`
];
// This promise belongs to the request environment, not a worker-global connection.
const READY=Symbol('accountRankSchema');
const schemaScopes=new Set();
export async function ensureAccountRank(env){
  const scope=env.RUNTIME_DB_CACHE_SCOPE;
  if(scope&&schemaScopes.has(scope))return;
  if(!env[READY])env[READY]=(async()=>{
    if(typeof env.DB.execSchema==='function')await env.DB.execSchema(ACCOUNT_RANK_SCHEMA.map(s=>s.replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')));
    else for(const s of ACCOUNT_RANK_SCHEMA)await env.DB.prepare(s).run();
    if(scope)schemaScopes.add(scope);
  })().catch(e=>{delete env[READY];throw e;});
  return env[READY];
}
export function levelFromTicks(value){
  const xp=Math.max(0,Math.min(MAX_RANK_TICKS,Math.floor(Number(value)||0)))/600;
  // XP(L) = 2*(L-1)^2 + 62*(L-1).
  return Math.min(250,1+Math.floor((-62+Math.sqrt(3844+8*xp))/4));
}
export function publicAccountRank(ticks=0){
  const level=levelFromTicks(ticks),r=rankForLevel(level);
  return {level,code:r.code,name:r.name,icon:`/assets/ui/account-ranks-v1/${r.code.toLowerCase()}-96.webp`,group:r.group,tone:r.tone,
    attackBp:r.attackBp,hpBp:r.hpBp,coinBp:r.coinBp,presetSlots:r.presetSlots,maxLevel:250};
}
export async function readAccountRank(env,userId){
  await ensureAccountRank(env);
  const row=await env.DB.prepare(`SELECT total_ticks FROM ${PROGRESS} WHERE user_id=?`).bind(userId).first();
  return publicAccountRank(row?.total_ticks);
}
export async function accountRankAward(env,userId,source,eventId,{quantity=1,ticks,guard='1=1',values=[]}={}){
  if(!Number.isSafeInteger(Number(userId))||Number(userId)<=0||typeof eventId!=='string'||!eventId||eventId.length>200)throw new Error('Invalid account rank event');
  const amount=source==='IDLE'?ticks:(PAYOUT[source]||0)*600*quantity;
  if(!Number.isSafeInteger(amount)||amount<=0||amount>MAX_RANK_TICKS)throw new Error('Invalid account rank award');
  await ensureAccountRank(env);
  const token=crypto.randomUUID();
  const statements=[
    env.DB.prepare(`INSERT INTO ${PROGRESS}(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING`).bind(userId),
    env.DB.prepare(`INSERT INTO ${LEDGER}(user_id,source,event_id,ticks,token) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(user_id,source,event_id) DO NOTHING`).bind(userId,source,eventId,amount,token,...values),
    env.DB.prepare(`UPDATE ${PROGRESS} SET total_ticks=MIN(?,total_ticks+?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND EXISTS(SELECT 1 FROM ${LEDGER} WHERE token=?)`).bind(MAX_RANK_TICKS,amount,userId,token)
  ];
  statements.token=token;
  return statements;
}
const PERSONAL=new Set(['HUNT','APOCALYPSE','SCRAPYARD','COW_ROOM','ESCORT','IDLE','RIFT']);
export async function accountRankBenefits(env,userId,scope){
  if(!PERSONAL.has(scope))return {attackBp:0,hpBp:0,coinBp:0};
  const r=await readAccountRank(env,userId);
  return {attackBp:r.attackBp,hpBp:r.hpBp,coinBp:r.coinBp};
}
export function rankCoin(base,benefits){return Math.max(0,Math.floor(Number(base||0)*(10000+Number(benefits?.coinBp||0))/10000));}
// Only trusted server snapshots call this; raw browser deck data never reaches it.
export function rankCards(cards,benefits){return cards.map(c=>({...c,accountRankBonus:{attackBp:Number(benefits?.attackBp||0),hpBp:Number(benefits?.hpBp||0)}}));}

export async function handleAccountRank({path,request,env,deps}){
  if(!path.startsWith('account-rank/'))return null;
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  const rank=await readAccountRank(env,user.id);
  if(path==='account-rank/status'&&request.method==='GET')return deps.json({accountRank:rank,ranks:RANKS});
  if(path==='account-rank/presets'&&request.method==='GET'){
    const rows=(await env.DB.prepare('SELECT slot,name,card_ids,mercenary_code FROM account_rank_presets_v1 WHERE user_id=? ORDER BY slot').bind(user.id).all()).results||[];
    return deps.json({slots:rank.presetSlots,presets:rows.filter(r=>Number(r.slot)<=rank.presetSlots).map(r=>({slot:Number(r.slot),name:r.name,cardIds:JSON.parse(r.card_ids),mercenaryCode:r.mercenary_code||null}))});
  }
  if(path==='account-rank/presets'&&request.method==='POST'){
    const body=await deps.readBody(request),slot=Number(body.slot),name=String(body.name||`편성 ${slot}`).trim().slice(0,24);
    if(!Number.isInteger(slot)||slot<1||slot>rank.presetSlots)return deps.json({error:'아직 사용할 수 없는 편성 슬롯입니다.'},403);
    // Save the authenticated account's current validated deck, never supplied IDs.
    const cards=await deps.pveDeckCards(env,user.id);
    if(cards.length!==5||new Set(cards.map(String)).size!==5)return deps.json({error:'PVE 덱 5장을 먼저 저장하세요.'},400);
    await env.DB.prepare('INSERT INTO account_rank_presets_v1(user_id,slot,name,card_ids,mercenary_code) VALUES(?,?,?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET name=excluded.name,card_ids=excluded.card_ids,mercenary_code=excluded.mercenary_code,updated_at=CURRENT_TIMESTAMP').bind(user.id,slot,name,JSON.stringify(cards),null).run();
    return deps.json({ok:true});
  }
  if(path==='account-rank/presets/apply'&&request.method==='POST'){
    const body=await deps.readBody(request),slot=Number(body.slot);
    if(!Number.isInteger(slot)||slot<1||slot>rank.presetSlots)return deps.json({error:'아직 사용할 수 없는 편성 슬롯입니다.'},403);
    const row=await env.DB.prepare('SELECT card_ids FROM account_rank_presets_v1 WHERE user_id=? AND slot=?').bind(user.id,slot).first();
    if(!row)return deps.json({error:'저장된 편성이 없습니다.'},404);
    const ids=JSON.parse(row.card_ids);
    if(!Array.isArray(ids)||ids.length!==5||new Set(ids.map(String)).size!==5)return deps.json({error:'편성을 다시 저장하세요.'},409);
    const owned=await env.DB.prepare(`SELECT card_id FROM user_cards WHERE user_id=? AND quantity>0 AND card_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all();
    if(owned.results.length!==5)return deps.json({error:'현재 보유하지 않은 카드가 있습니다. 편성을 다시 저장하세요.'},409);
    await deps.validateDeckGradeLimits(env,ids,'PVE 덱');
    await env.DB.prepare('INSERT INTO pve_decks(user_id,card_ids,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(user.id,JSON.stringify(ids)).run();
    return deps.json({ok:true,cardIds:ids});
  }
  return deps.json({error:'지원하지 않는 요청입니다.'},404);
}

export const __accountRankTest={PAYOUT,PROGRESS,LEDGER,PERSONAL};

export async function settleRankedHunt(env,userId,source,eventId,coin,reason){
  const writes=await accountRankAward(env,userId,source,eventId);
  const guard=`EXISTS(SELECT 1 FROM account_rank_receipts_v1 WHERE token=?)`;
  writes.push(env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${guard}`).bind(coin,userId,writes.token),
    env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=? AND ${guard}`).bind(coin,reason,userId,writes.token));
  return env.DB.batch(writes);
}

export async function accountRankIdleSettlement(env,userId,row,next,now){
  await ensureAccountRank(env);
  const table='account_rank_idle_cursor_v1';
  // First observation establishes a fresh baseline: pre-release offline time is not XP.
  await env.DB.prepare(`INSERT INTO ${table}(user_id,settled_at) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING`).bind(userId,new Date(now).toISOString()).run();
  const cursor=await env.DB.prepare(`SELECT settled_at FROM ${table} WHERE user_id=?`).bind(userId).first();
  const end=Date.parse(next.last_settled_at),start=Math.max(Date.parse(cursor.settled_at),Date.parse(row.run_started_at||cursor.settled_at),Number(next.rankSettlementCutoff||0));
  const ticks=row.run_started_at?Math.max(0,Math.floor((end-start)/1000)):0;
  if(!ticks)return [];
  const guard='EXISTS(SELECT 1 FROM idle_dungeon_progress WHERE user_id=? AND version=?) AND EXISTS(SELECT 1 FROM account_rank_idle_cursor_v1 WHERE user_id=? AND settled_at=?)';
  const values=[userId,Number(row.version||0),userId,cursor.settled_at];
  return [...await accountRankAward(env,userId,'IDLE',`${cursor.settled_at}:${next.last_settled_at}`,{ticks,guard,values}),
    env.DB.prepare(`UPDATE ${table} SET settled_at=? WHERE user_id=? AND ${guard}`).bind(new Date(start+ticks*1000).toISOString(),userId,...values)];
}
