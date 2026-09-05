import { activePredictionSubsidy,ensureAdministrationTreasuryFoundation,predictionSubsidyFinalizationStatements,TREASURY_PREDICTION_SUBSIDY_TABLE } from './_administration_treasury.js';
import { PREDICTION_CATEGORIES,PREDICTION_CATEGORY_PREFIX,PREDICTION_CATEGORY_JOIN,PREDICTION_CATEGORY_SQL,predictionCategory,predictionFilterSql,predictionCategoryStatement } from './_coin_prediction_categories.js';

const MIN_BET=100000;
// V2000: 이벤트당 유저 배팅 한도 1억 -> 5억
// 이 상수를 바꾸면 ensureReady() 의 마이그레이션이
// 저장된 설정(app_meta)과 진행 중인 DRAFT/OPEN 이벤트의 max_bet 까지 자동으로 맞춘다.
const USER_MAX_BET_PER_EVENT=500000000;
const DEFAULTS=Object.freeze({enabled:true,feePercent:10,minBet:MIN_BET,maxBetPerEvent:USER_MAX_BET_PER_EVENT,pollSeconds:10,termsVersion:'2026-09-03'});
const DAILY_CHAMPION_KEY='coin_prediction_daily_champion_v1';
const HISTORY_RETENTION_HOURS=24;
const predictionListView=value=>String(value||'').toLowerCase()==='history'?'history':'active';
const predictionListPage=value=>int(value,1,10000,1);
let ready=false;
const safeJson=(v,f={})=>{try{return JSON.parse(v||'')}catch{return f}};
const nowIso=()=>new Date().toISOString();
const sqlMs=v=>Date.parse(String(v||'').includes('T')?String(v):`${String(v||'').replace(' ','T')}Z`);
const clean=(v,n=80)=>String(v||'').replace(/[<>&"'`]/g,'').replace(/\s+/g,' ').trim().slice(0,n);
const int=(v,min,max,f=min)=>{const n=Math.floor(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):f};
const kstDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function orderPredictionEvents(items,now=Date.now()){
  return (Array.isArray(items)?items:[]).map((event,index)=>{const closeAt=sqlMs(event?.closes_at),active=event?.status==='OPEN'&&(!event?.closes_at||closeAt>now);return{event,index,active,closeAt:Number.isFinite(closeAt)?closeAt:Number.MAX_SAFE_INTEGER}}).sort((a,b)=>{
    if(a.active!==b.active)return a.active?-1:1;
    if(a.active&&a.closeAt!==b.closeAt)return a.closeAt-b.closeAt;
    if(!a.active){const idDiff=Number(b.event?.id||0)-Number(a.event?.id||0);if(idDiff)return idDiff}
    return a.index-b.index;
  }).map(x=>x.event);
}

async function foundation(env){
  if(ready)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS coin_prediction_events(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',image_url TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'DRAFT',closes_at TEXT,result_option_id INTEGER,total_pool INTEGER NOT NULL DEFAULT 0,fee_percent INTEGER NOT NULL DEFAULT 10,min_bet INTEGER NOT NULL DEFAULT ${MIN_BET},max_bet INTEGER NOT NULL DEFAULT ${USER_MAX_BET_PER_EVENT},created_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,settled_at TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS coin_prediction_options(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,label TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,total_bet INTEGER NOT NULL DEFAULT 0,bet_count INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS coin_prediction_bets(event_id INTEGER NOT NULL,user_id INTEGER NOT NULL,option_id INTEGER NOT NULL,amount INTEGER NOT NULL DEFAULT 0,payout INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,settled_at TEXT,PRIMARY KEY(event_id,user_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS coin_prediction_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,event_id INTEGER NOT NULL,action TEXT NOT NULL,response_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_prediction_events_status ON coin_prediction_events(status,id DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_prediction_events_settled ON coin_prediction_events(status,settled_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_prediction_bets_event ON coin_prediction_bets(event_id,option_id,user_id)`)
  ]);
  await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('coin_prediction_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(DEFAULTS)).run();
  const stored=await env.DB.prepare("SELECT value FROM app_meta WHERE key='coin_prediction_settings_v1'").first(),storedSettings=safeJson(stored?.value,{});
  if(Number(storedSettings.maxBetPerEvent)!==USER_MAX_BET_PER_EVENT){const migrated={...DEFAULTS,...storedSettings,feePercent:10,minBet:MIN_BET,maxBetPerEvent:USER_MAX_BET_PER_EVENT,termsVersion:DEFAULTS.termsVersion};await env.DB.batch([
    env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='coin_prediction_settings_v1'").bind(JSON.stringify(migrated)),
    env.DB.prepare("UPDATE coin_prediction_events SET max_bet=?,updated_at=CURRENT_TIMESTAMP WHERE status IN ('DRAFT','OPEN') AND max_bet<>?").bind(USER_MAX_BET_PER_EVENT,USER_MAX_BET_PER_EVENT)
  ])}ready=true;
}
async function settings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='coin_prediction_settings_v1'").first();return{...DEFAULTS,...safeJson(row?.value,{}),feePercent:10,minBet:MIN_BET,maxBetPerEvent:USER_MAX_BET_PER_EVENT}}
async function lock(env,key,ttl=30000){const name=`coin_prediction_lock_${key}`,token=crypto.randomUUID(),now=Date.now(),until=now+ttl,value=`${token}|${until}`;const r=await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP WHERE CAST(substr(app_meta.value,instr(app_meta.value,'|')+1) AS BIGINT)<?").bind(name,value,now).run();return Number(r?.meta?.changes||0)?{name,token}:null}
async function unlock(env,l){if(l)await env.DB.prepare("DELETE FROM app_meta WHERE key=? AND value LIKE ?").bind(l.name,`${l.token}|%`).run()}
async function autoClose(env){await env.DB.prepare("UPDATE coin_prediction_events SET status='CLOSED',updated_at=CURRENT_TIMESTAMP WHERE status='OPEN' AND closes_at IS NOT NULL AND datetime(closes_at)<=datetime('now')").run()}
async function todayHitKing(env){
  const day=kstDate(),cached=safeJson((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(DAILY_CHAMPION_KEY).first())?.value,null);
  if(cached?.date===day)return cached.champion||null;
  const row=await env.DB.prepare(`SELECT b.user_id,COALESCE(NULLIF(TRIM(u.nickname),''),'익명') nickname,SUM(b.payout-b.amount) net_profit,SUM(b.payout) total_payout,SUM(b.amount) total_bet,SUM(CASE WHEN b.option_id=e.result_option_id AND b.payout>0 THEN 1 ELSE 0 END) hit_count FROM coin_prediction_bets b JOIN coin_prediction_events e ON e.id=b.event_id JOIN users u ON u.id=b.user_id WHERE e.status='SETTLED' AND b.status='SETTLED' AND datetime(e.settled_at)>=datetime('now','+9 hours','start of day','-9 hours') GROUP BY b.user_id,u.nickname HAVING SUM(b.payout-b.amount)>0 AND SUM(CASE WHEN b.option_id=e.result_option_id AND b.payout>0 THEN 1 ELSE 0 END)>0 ORDER BY net_profit DESC,total_payout DESC,hit_count DESC,b.user_id ASC LIMIT 1`).first();
  const champion=row?{userId:Number(row.user_id),nickname:String(row.nickname||'익명'),netProfit:Number(row.net_profit||0),totalPayout:Number(row.total_payout||0),totalBet:Number(row.total_bet||0),hitCount:Number(row.hit_count||0)}:null;
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(DAILY_CHAMPION_KEY,JSON.stringify({date:day,champion})).run();return champion;
}
async function eventData(env,userId,admin=false,ownerUnlimited=false,requestedView='active',requestedPage=1,filters={}){
  if(admin)await autoClose(env);
  const view=predictionListView(requestedView),pageSize=admin?30:12;
  const filter=predictionFilterSql(filters,userId),categoryFilter=predictionFilterSql({mine:filter.mine},userId);
  const activeWhere=`e.status='OPEN' AND (e.closes_at IS NULL OR datetime(e.closes_at)>datetime('now'))`;
  const historyWhere=`(e.status='CLOSED' OR (e.status='OPEN' AND e.closes_at IS NOT NULL AND datetime(e.closes_at)<=datetime('now')) OR (e.status IN ('SETTLED','VOID') AND datetime(COALESCE(e.settled_at,e.updated_at))>datetime('now','-1 day')))`;
  const eventWhere=view==='history'?historyWhere:activeWhere;
  const eventOrder=view==='history'
    ?`CASE WHEN e.status='CLOSED' OR (e.status='OPEN' AND e.closes_at IS NOT NULL AND datetime(e.closes_at)<=datetime('now')) THEN 0 ELSE 1 END ASC,datetime(COALESCE(e.settled_at,e.updated_at,e.closes_at)) DESC,e.id DESC`
    :`CASE WHEN e.closes_at IS NULL THEN 1 ELSE 0 END ASC,datetime(e.closes_at) ASC,e.id DESC`;
  const [s,wallet,categoryRows,todayChampion]=await Promise.all([
    settings(env),
    env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(userId).first(),
    env.DB.prepare(`SELECT ${PREDICTION_CATEGORY_SQL} category,COALESCE(SUM(CASE WHEN ${activeWhere} THEN 1 ELSE 0 END),0) active_count,COALESCE(SUM(CASE WHEN ${historyWhere} THEN 1 ELSE 0 END),0) history_count FROM coin_prediction_events e ${PREDICTION_CATEGORY_JOIN} WHERE 1=1${categoryFilter.sql} GROUP BY ${PREDICTION_CATEGORY_SQL}`).bind(...categoryFilter.binds).all(),
    todayHitKing(env)
  ]);
  const countRow=(categoryRows.results||[]).filter(row=>filter.category==='ALL'||predictionCategory(row.category)===filter.category).reduce((sum,row)=>({active_count:sum.active_count+Number(row.active_count||0),history_count:sum.history_count+Number(row.history_count||0)}),{active_count:0,history_count:0});
  const activeCount=Number(countRow.active_count),historyCount=Number(countRow.history_count),total=view==='history'?historyCount:activeCount,totalPages=Math.max(1,Math.ceil(total/pageSize));
  const page=Math.min(predictionListPage(requestedPage),totalPages),offset=(page-1)*pageSize;
  const eventRows=await env.DB.prepare(`SELECT e.*,${PREDICTION_CATEGORY_SQL} category,(SELECT COUNT(*) FROM coin_prediction_bets b WHERE b.event_id=e.id) participant_count,
    COALESCE((SELECT SUM(ts.amount) FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} ts WHERE ts.event_id=e.id AND ts.status IN ('ACTIVE','CONSUMED')),0) treasury_subsidy
    FROM coin_prediction_events e ${PREDICTION_CATEGORY_JOIN} WHERE (${eventWhere})${filter.sql} ORDER BY ${eventOrder} LIMIT ${pageSize} OFFSET ${offset}`).bind(...filter.binds).all();
  const categoryCounts=Object.fromEntries(PREDICTION_CATEGORIES.map(code=>[code,0]));
  for(const row of categoryRows.results||[])categoryCounts[predictionCategory(row.category)]=Number(row[view==='history'?'history_count':'active_count']||0);
  categoryCounts.ALL=Object.values(categoryCounts).reduce((sum,n)=>sum+n,0);
  const now=Date.now(),normalized=(eventRows.results||[]).map(e=>e.status==='OPEN'&&e.closes_at&&sqlMs(e.closes_at)<=now?{...e,status:'CLOSED'}:e),events=view==='active'?orderPredictionEvents(normalized,now):normalized,ids=events.map(x=>x.id);s.todayChampion=todayChampion;s.todayChampionPeriod='KST 00:00';s.ownerUnlimited=ownerUnlimited===true;let options=[],bets=[],bettors=[];
  if(ids.length){const marks=ids.map(()=>'?').join(','),[optionRows,betRows,bettorRows]=await Promise.all([env.DB.prepare(`SELECT * FROM coin_prediction_options WHERE event_id IN (${marks}) ORDER BY event_id,sort_order,id`).bind(...ids).all(),env.DB.prepare(`SELECT * FROM coin_prediction_bets WHERE user_id=? AND event_id IN (${marks})`).bind(userId,...ids).all(),env.DB.prepare(`SELECT b.event_id,b.option_id,b.amount,COALESCE(NULLIF(TRIM(u.nickname),''),'익명') nickname FROM coin_prediction_bets b JOIN users u ON u.id=b.user_id WHERE b.event_id IN (${marks}) ORDER BY b.event_id,b.option_id,b.amount DESC,b.updated_at ASC`).bind(...ids).all()]);options=optionRows.results||[];bets=betRows.results||[];bettors=bettorRows.results||[]}
  const betMap=new Map(bets.map(x=>[Number(x.event_id),x])),bettorMap=new Map();for(const b of bettors){const key=`${Number(b.event_id)}:${Number(b.option_id)}`;if(!bettorMap.has(key))bettorMap.set(key,[]);bettorMap.get(key).push({nickname:String(b.nickname||'익명'),amount:Number(b.amount||0)})}return{settings:s,walletCoin:Number(wallet?.coin||0),serverNow:nowIso(),navigation:{view,page,pageSize,total,totalPages,counts:{active:activeCount,history:historyCount},category:filter.category,mine:filter.mine,categoryCounts,historyRetentionHours:HISTORY_RETENTION_HOURS},terms:{version:s.termsVersion,title:'숲켓몬 코인 승부예측 이용 규정',items:['숲켓몬 코인은 게임 플레이를 위한 무상·가상 재화이며 유저 간 직접 전송할 수 없습니다.','숲켓몬 코인은 현금성이 없으며 현금·미네랄·상품·외부 재화로 교환하거나 환전할 수 없습니다. 양도·판매·대리 참여도 금지됩니다.','본 시스템은 비영리 팬게임 안에서만 제공되는 오락용 이벤트입니다. 참여 코인과 보상 코인은 게임 밖의 경제적 가치가 없습니다.','참여 금액은 1회 최소 100,000코인, 이벤트당 누적 최대 500,000,000코인입니다. 한 이벤트에서는 최초 선택 항목에만 추가 참여할 수 있으며 참여 후 취소하거나 다른 항목으로 변경할 수 없습니다.','정산 대상 풀에서 운영 수수료 10%를 공제하고, OWNER가 승인한 행정부 지원금이 있으면 이를 더한 뒤 적중 참여자의 참여 비율에 따라 코인을 배분합니다. 화면의 예상 배율은 참여 상황에 따라 변하며 고정 배율이 아닙니다. 원 단위 미만의 계산 잔액은 지급하지 않습니다.','명백한 결과 오류·경기 취소·적중자 없음·중대한 시스템 장애가 발생하면 운영자는 해당 이벤트를 무효 처리하고 정상 참여 코인을 전액 환불합니다. 승인된 행정부 지원금은 재정금고로 환입됩니다.','다중 계정, 자동화, 취약점 이용, 담합 등 비정상 참여가 확인되면 참여 취소·보상 회수·이용 제한이 적용될 수 있습니다.','참여자는 위 규정과 현금성·환전성·양도성이 전혀 없음을 확인한 뒤 자율적으로 참여합니다.']},events:events.map(e=>({...e,treasury_subsidy:Number(e.treasury_subsidy||0),options:options.filter(o=>Number(o.event_id)===Number(e.id)).map(o=>({...o,bettors:bettorMap.get(`${Number(e.id)}:${Number(o.id)}`)||[]})),myBet:betMap.get(Number(e.id))||null}))};
}
async function placeBet(env,deps,user,body){
  const s=await settings(env),ownerUnlimited=String(user?.role||'').trim().toUpperCase()==='OWNER';if(!s.enabled)return deps.json({error:'현재 코인 승부예측 참여가 중지되었습니다.'},409);const eventId=Math.floor(Number(body.eventId)||0),optionId=Math.floor(Number(body.optionId)||0),amount=Math.floor(Number(body.amount)||0),requestId=String(body.requestId||'').trim();if(eventId<1||optionId<1||requestId.length<8||!Number.isSafeInteger(amount))return deps.json({error:'참여 요청 정보가 올바르지 않습니다.'},400);if(amount<Number(s.minBet))return deps.json({error:`최소 참여 금액은 ${Number(s.minBet).toLocaleString()}코인입니다.`},400);if(!ownerUnlimited&&amount>Number(s.maxBetPerEvent))return deps.json({error:`1회 참여 금액은 ${Number(s.maxBetPerEvent).toLocaleString()}코인을 넘을 수 없습니다.`},400);
  const prior=await env.DB.prepare('SELECT response_json FROM coin_prediction_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();if(prior){if(!prior.response_json)return deps.json({error:'동일한 참여 요청을 처리 중입니다.'},409);return deps.json({...safeJson(prior.response_json,{ok:true}),replayed:true})}const l=await lock(env,`bet_${user.id}`);if(!l)return deps.json({error:'이전 참여 요청을 처리 중입니다.'},409);
  let eventLock=null;
  try{
    eventLock=await lock(env,`event_${eventId}`);
    if(!eventLock)return deps.json({error:'이 이벤트의 참여·정산을 처리 중입니다. 잠시 후 다시 시도해 주세요.'},409);
    const event=await env.DB.prepare("SELECT * FROM coin_prediction_events WHERE id=? AND status='OPEN' AND (closes_at IS NULL OR datetime(closes_at)>datetime('now'))").bind(eventId).first();if(!event)return deps.json({error:'참여가 마감되었거나 존재하지 않는 이벤트입니다.'},409);const option=await env.DB.prepare('SELECT * FROM coin_prediction_options WHERE id=? AND event_id=?').bind(optionId,eventId).first();if(!option)return deps.json({error:'선택 항목이 올바르지 않습니다.'},400);const current=await env.DB.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=? AND user_id=?').bind(eventId,user.id).first();if(current&&current.status!=='ACTIVE')return deps.json({error:'이미 환불·정산된 참여에는 코인을 추가할 수 없습니다.'},409);if(current&&Number(current.option_id)!==optionId)return deps.json({error:'한 이벤트에서는 처음 선택한 항목에만 추가 참여할 수 있습니다.'},409);const total=Number(current?.amount||0)+amount,max=Number(event.max_bet||s.maxBetPerEvent);if(!Number.isSafeInteger(total))return deps.json({error:'참여 금액이 허용 범위를 넘었습니다.'},400);if(!ownerUnlimited&&total>max)return deps.json({error:`이벤트당 최대 참여 금액은 ${max.toLocaleString()}코인입니다.`},400);const response={ok:true,eventId,optionId,added:amount,total,ownerUnlimited},guard=[requestId,user.id,eventId],exists=`EXISTS(SELECT 1 FROM coin_prediction_receipts WHERE request_id=? AND user_id=? AND event_id=? AND response_json IS NULL)`;await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO coin_prediction_receipts(request_id,user_id,event_id,action,response_json) SELECT ?,?,?,'BET',NULL FROM users WHERE id=? AND coin>=?").bind(requestId,user.id,eventId,user.id,amount),
    env.DB.prepare(`UPDATE users SET coin=coin-? WHERE id=? AND ${exists}`).bind(amount,user.id,...guard),
    env.DB.prepare(`INSERT INTO coin_prediction_bets(event_id,user_id,option_id,amount) SELECT ?,?,?,? WHERE ${exists} ON CONFLICT(event_id,user_id) DO UPDATE SET amount=coin_prediction_bets.amount+excluded.amount,updated_at=CURRENT_TIMESTAMP WHERE coin_prediction_bets.option_id=excluded.option_id`).bind(eventId,user.id,optionId,amount,...guard),
    env.DB.prepare(`UPDATE coin_prediction_options SET total_bet=total_bet+?,bet_count=bet_count+? WHERE id=? AND event_id=? AND ${exists}`).bind(amount,current?0:1,optionId,eventId,...guard),
    env.DB.prepare(`UPDATE coin_prediction_events SET total_pool=total_pool+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${exists}`).bind(amount,eventId,...guard),
    env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'코인 승부예측 참여' FROM users WHERE id=? AND ${exists}`).bind(-amount,user.id,...guard),
    env.DB.prepare('UPDATE coin_prediction_receipts SET response_json=? WHERE request_id=? AND user_id=? AND event_id=? AND response_json IS NULL').bind(JSON.stringify(response),...guard)
  ]);const saved=await env.DB.prepare('SELECT response_json FROM coin_prediction_receipts WHERE request_id=? AND user_id=? AND event_id=?').bind(...guard).first();if(!saved?.response_json)return deps.json({error:'보유 코인이 부족합니다.'},409);return deps.json({...response,state:await eventData(env,user.id,false,ownerUnlimited)});}finally{await unlock(env,eventLock);await unlock(env,l)}
}
export function predictionPayoutStatements(env,{eventId,userId,payout,voided=false}){
  if(!Number.isSafeInteger(payout)||payout<0)throw new Error('승부예측 지급 금액이 허용 범위를 넘었습니다.');
  const active="EXISTS(SELECT 1 FROM coin_prediction_bets WHERE event_id=? AND user_id=? AND status='ACTIVE')";
  const statements=[env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${active}`).bind(payout,userId,eventId,userId)];
  // A bare "?>0" makes PostgreSQL infer int4 from the literal 0, even when
  // the payout/coin columns are bigint. Check positivity before binding SQL.
  // Keep the log under the same ACTIVE guard as the wallet credit on retries.
  if(payout>0)statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=? AND ${active}`).bind(payout,voided?'코인 승부예측 무효 환불':'코인 승부예측 정산',userId,eventId,userId));
  statements.push(env.DB.prepare("UPDATE coin_prediction_bets SET payout=?,status=?,settled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='ACTIVE'").bind(payout,voided?'REFUNDED':'SETTLED',eventId,userId));
  return statements;
}
export async function settleCoinPrediction(env,eventId,resultOptionId,voided=false){
  const l=await lock(env,`event_${eventId}`,300000);if(!l)throw new Error('이 이벤트의 정산을 이미 처리 중입니다.');try{const event=await env.DB.prepare('SELECT * FROM coin_prediction_events WHERE id=?').bind(eventId).first();if(!event||['SETTLED','VOID'].includes(event.status))throw new Error('이미 정산되었거나 존재하지 않는 이벤트입니다.');if(!voided&&event.status!=='CLOSED')throw new Error('참여를 먼저 마감한 뒤 결과를 확정하세요.');if(!voided){const option=await env.DB.prepare('SELECT id FROM coin_prediction_options WHERE id=? AND event_id=?').bind(resultOptionId,eventId).first();if(!option)throw new Error('정산할 적중 항목이 올바르지 않습니다.')}
  // Freeze new participation before the first refund. A failed batch remains
  // CLOSED, and retrying resumes only ACTIVE bets under the shared event lock.
  if(voided)await env.DB.prepare("UPDATE coin_prediction_events SET status='CLOSED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('DRAFT','OPEN')").bind(eventId).run();
  const allBets=(await env.DB.prepare('SELECT * FROM coin_prediction_bets WHERE event_id=?').bind(eventId).all()).results||[],activeBets=allBets.filter(b=>b.status==='ACTIVE'),pool=allBets.reduce((n,b)=>n+Number(b.amount||0),0),winnerTotal=voided?0:allBets.filter(b=>Number(b.option_id)===resultOptionId).reduce((n,b)=>n+Number(b.amount||0),0),baseDistributable=Math.floor(pool*(100-Number(event.fee_percent||10))/100),treasurySubsidy=await activePredictionSubsidy(env,eventId),distributable=voided?pool:baseDistributable+treasurySubsidy;if(!voided&&pool>0&&winnerTotal<=0)throw new Error('적중 참여자가 없어 정산할 수 없습니다. 무효·전액 환불로 처리하세요.');
  for(const b of activeBets){const payout=voided?Number(b.amount):winnerTotal>0&&Number(b.option_id)===resultOptionId?Math.floor(distributable*Number(b.amount)/winnerTotal):0;await env.DB.batch(predictionPayoutStatements(env,{eventId,userId:b.user_id,payout,voided}))}
  await env.DB.batch([
    env.DB.prepare("UPDATE coin_prediction_events SET status=?,result_option_id=?,total_pool=?,settled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('SETTLED','VOID')").bind(voided?'VOID':'SETTLED',voided?null:resultOptionId,pool,eventId),
    ...predictionSubsidyFinalizationStatements(env,{eventId,voided,amount:treasurySubsidy}),
    env.DB.prepare('DELETE FROM app_meta WHERE key=?').bind(DAILY_CHAMPION_KEY)
  ]);return{pool,distributable,fee:voided?0:pool-baseDistributable,treasurySubsidy,winnerTotal,participants:allBets.length};}finally{await unlock(env,l)}
}
export async function handleCoinPrediction({path,request,env,deps}){
  if(!String(path).startsWith('coin-prediction')&&!String(path).startsWith('admin/coin-prediction'))return null;await Promise.all([foundation(env),ensureAdministrationTreasuryFoundation(env)]);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);const adminPath=String(path).startsWith('admin/coin-prediction'),admin=adminPath?Boolean(await deps.requirePermission(request,env,'COIN_PREDICTION_MANAGE')):deps.isAdminRole(user),ownerUnlimited=String(user?.role||'').trim().toUpperCase()==='OWNER',query=new URL(request.url).searchParams,listView=predictionListView(query.get('view')),listPage=predictionListPage(query.get('page')),filters={category:query.get('category')||'ALL',mine:query.get('mine')==='1'};
  if(path==='coin-prediction/state'&&request.method==='GET')return deps.json(await eventData(env,user.id,false,ownerUnlimited,listView,listPage,filters));
  if(path==='coin-prediction/bet'&&request.method==='POST')return placeBet(env,deps,user,await deps.readBody(request));
  if(path==='admin/coin-prediction/category'&&request.method==='POST'){
    if(!admin)return deps.json({error:'승부예측 관리 권한이 필요합니다.'},403);
    const body=await deps.readBody(request),eventId=Number(body.eventId);
    if(!Number.isSafeInteger(eventId)||eventId<1||!PREDICTION_CATEGORIES.includes(body.category))return deps.json({error:'경기와 카테고리를 확인하세요.'},400);
    const event=await env.DB.prepare('SELECT id,title FROM coin_prediction_events WHERE id=?').bind(eventId).first();
    if(!event)return deps.json({error:'존재하지 않는 경기입니다.'},404);
    const before=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(`${PREDICTION_CATEGORY_PREFIX}${eventId}`).first();
    await predictionCategoryStatement(env,eventId,body.category).run();
    await deps.writeAdminLog(env,user,'COIN_PREDICTION_CATEGORY','COIN_PREDICTION',String(eventId),{category:predictionCategory(before?.value)},{category:body.category,title:event.title});
    return deps.json({ok:true,eventId,category:body.category});
  }
  if(path==='admin/coin-prediction/state'&&request.method==='GET'){if(!admin)return deps.json({error:'승부예측 관리 권한이 필요합니다.'},403);return deps.json(await eventData(env,user.id,true,ownerUnlimited,listView,listPage,filters))}
  if(path==='admin/coin-prediction/settings'&&request.method==='POST'){if(!admin)return deps.json({error:'승부예측 관리 권한이 필요합니다.'},403);const body=await deps.readBody(request),current=await settings(env),next={...current,enabled:body.enabled!==false,feePercent:10,minBet:MIN_BET,maxBetPerEvent:USER_MAX_BET_PER_EVENT,pollSeconds:int(body.pollSeconds,5,60,current.pollSeconds)};await env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='coin_prediction_settings_v1'").bind(JSON.stringify(next)).run();await deps.writeAdminLog(env,user,'COIN_PREDICTION_SETTINGS','APP_META','coin_prediction_settings_v1',current,next);return deps.json({ok:true,settings:next})}
  if(path==='admin/coin-prediction/event'&&request.method==='POST'){if(!admin)return deps.json({error:'승부예측 관리 권한이 필요합니다.'},403);const b=await deps.readBody(request);if(b.category!==undefined&&!PREDICTION_CATEGORIES.includes(b.category))return deps.json({error:'올바른 카테고리를 선택하세요.'},400);const category=predictionCategory(b.category),title=clean(b.title),options=[...new Set((Array.isArray(b.options)?b.options:[]).map(x=>clean(x,30)).filter(Boolean))].slice(0,6);if(!title||options.length<2)return deps.json({error:'제목과 서로 다른 선택 항목 2개 이상을 입력하세요.'},400);const closesAt=String(b.closesAt||'').trim(),closeMs=sqlMs(closesAt);if(!Number.isFinite(closeMs)||closeMs<=Date.now()+60000)return deps.json({error:'마감 시각은 현재보다 최소 1분 이후로 설정하세요.'},400);const result=await env.DB.prepare(`INSERT INTO coin_prediction_events(title,description,image_url,status,closes_at,fee_percent,min_bet,max_bet,created_by) VALUES(?,?,?,'OPEN',?,?,?,?,?)`).bind(title,clean(b.description,300),clean(b.imageUrl,300),new Date(closeMs).toISOString(),10,MIN_BET,USER_MAX_BET_PER_EVENT,user.id).run(),id=Number(result.meta.last_row_id);await env.DB.batch([...options.map((label,i)=>env.DB.prepare('INSERT INTO coin_prediction_options(event_id,label,sort_order) VALUES(?,?,?)').bind(id,label,i)),predictionCategoryStatement(env,id,category)]);await deps.writeAdminLog(env,user,'COIN_PREDICTION_CREATE','COIN_PREDICTION',String(id),null,{title,category,options,closesAt:new Date(closeMs).toISOString()});return deps.json({ok:true,id,state:await eventData(env,user.id,true)})}
  if(path==='admin/coin-prediction/action'&&request.method==='POST'){if(!admin)return deps.json({error:'승부예측 관리 권한이 필요합니다.'},403);const b=await deps.readBody(request),eventId=Math.floor(Number(b.eventId)||0),optionId=Math.floor(Number(b.optionId||0)),action=String(b.action||'').toUpperCase();if(eventId<1)return deps.json({error:'이벤트 번호가 올바르지 않습니다.'},400);let result=null;if(action==='CLOSE'){const changed=await env.DB.prepare("UPDATE coin_prediction_events SET status='CLOSED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'").bind(eventId).run();if(!Number(changed?.meta?.changes||0))return deps.json({error:'진행 중인 이벤트만 마감할 수 있습니다.'},409)}else if(action==='SETTLE'){if(optionId<1)return deps.json({error:'적중 항목을 선택하세요.'},400);result=await settleCoinPrediction(env,eventId,optionId,false)}else if(action==='VOID')result=await settleCoinPrediction(env,eventId,0,true);else return deps.json({error:'지원하지 않는 작업입니다.'},400);await deps.writeAdminLog(env,user,`COIN_PREDICTION_${action}`,'COIN_PREDICTION',String(eventId),null,{optionId,result});return deps.json({ok:true,result,state:await eventData(env,user.id,true,ownerUnlimited,'history',1)})}
  return deps.json({error:'요청한 승부예측 기능을 찾을 수 없습니다.'},404);
}
