const LEGACY_DEFAULTS={enabled:true,coinCost:50000,shardCost:1500,successRate:10,pityAttempts:10};
const PRESTIGE_DEFAULTS={maToPrestigeMasterStarCost:1,maToPrestigeSuccessRate:100,maToPrestigePityAttempts:10};
const EVOLUTION_TYPES={
  SSR_TO_MA:{sourceGrade:'SSR',targetGrade:'MA',minBreakthrough:10,label:'SSR → MA',mode:'LEGACY_ATTEMPT'},
  MA_TO_PRESTIGE:{sourceGrade:'MA',targetGrade:'PRESTIGE',minBreakthrough:13,label:'MA +13 → PRESTIGE',mode:'MASTER_STAR'}
};

const clampInt=(value,fallback,min=0,max=999999)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.floor(n))):fallback};
const normalizeType=value=>EVOLUTION_TYPES[String(value||'').toUpperCase()]?String(value).toUpperCase():'SSR_TO_MA';
const resultRows=result=>Array.isArray(result?.results)?result.results:[];
const firstRow=result=>resultRows(result)[0]||null;
const parseDeck=row=>{try{return new Set(JSON.parse(row?.card_ids||'[]').map(String))}catch{return new Set()}};

async function tableColumns(env,table){const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all();return new Set((rows.results||[]).map(row=>String(row.name)))}
async function runUpgrade(env){
  for(const sql of [
    `CREATE TABLE IF NOT EXISTS card_evolution_progress(user_id INTEGER NOT NULL,source_card_id TEXT NOT NULL,failed_attempts INTEGER NOT NULL DEFAULT 0,total_attempts INTEGER NOT NULL DEFAULT 0,is_success INTEGER NOT NULL DEFAULT 0,reward_card_id TEXT,completed_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,source_card_id))`,
    `CREATE TABLE IF NOT EXISTS card_evolution_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,source_card_id TEXT NOT NULL,attempt_no INTEGER NOT NULL,coin_cost INTEGER NOT NULL DEFAULT 0,shard_cost INTEGER NOT NULL DEFAULT 0,success_rate REAL NOT NULL DEFAULT 100,is_pity INTEGER NOT NULL DEFAULT 0,is_success INTEGER NOT NULL DEFAULT 0,reward_card_id TEXT,reward_duplicate INTEGER NOT NULL DEFAULT 0,reward_shards INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS card_evolution_atomic_guard(guard_id TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1))`,
    `CREATE INDEX IF NOT EXISTS idx_evolution_logs_user ON card_evolution_logs(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_evolution_progress_success ON card_evolution_progress(is_success,updated_at)`
  ])await env.DB.prepare(sql).run();
  const columns=await tableColumns(env,'card_evolution_logs');
  for(const [name,type] of [['evolution_type',"TEXT NOT NULL DEFAULT 'SSR_TO_MA'"],['master_star_cost','INTEGER NOT NULL DEFAULT 0'],['request_id','TEXT'],['source_consumed','INTEGER NOT NULL DEFAULT 0']]){
    if(!columns.has(name))await env.DB.prepare(`ALTER TABLE card_evolution_logs ADD COLUMN ${name} ${type}`).run();
  }
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_evolution_logs_request_id ON card_evolution_logs(request_id) WHERE request_id IS NOT NULL`).run();
  await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1157_evolution_ui_master_star','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").run();
}
let upgradePromise=null;
async function upgrade(env){if(!upgradePromise)upgradePromise=(async()=>{const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1157_evolution_ui_master_star'").first();if(done?.value==='1')return;await runUpgrade(env)})().catch(error=>{upgradePromise=null;throw error});return upgradePromise}

function cleanLegacy(raw={}){return {enabled:raw.enabled!==false,coinCost:clampInt(raw.coinCost,LEGACY_DEFAULTS.coinCost,0,999999999),shardCost:clampInt(raw.shardCost,LEGACY_DEFAULTS.shardCost,0,999999999),successRate:Math.max(0,Math.min(100,Number.isFinite(Number(raw.successRate))?Number(raw.successRate):LEGACY_DEFAULTS.successRate)),pityAttempts:clampInt(raw.pityAttempts,LEGACY_DEFAULTS.pityAttempts,1,100)}}
function cleanPrestige(raw={}){return {maToPrestigeMasterStarCost:clampInt(raw.maToPrestigeMasterStarCost,PRESTIGE_DEFAULTS.maToPrestigeMasterStarCost,1,9999),maToPrestigeSuccessRate:Math.max(0,Math.min(100,Number.isFinite(Number(raw.maToPrestigeSuccessRate))?Number(raw.maToPrestigeSuccessRate):PRESTIGE_DEFAULTS.maToPrestigeSuccessRate)),maToPrestigePityAttempts:clampInt(raw.maToPrestigePityAttempts,PRESTIGE_DEFAULTS.maToPrestigePityAttempts,1,100)}}
async function config(env){
  const rows=await env.DB.batch([
    env.DB.prepare("SELECT value FROM app_meta WHERE key='card_evolution_settings_v1'"),
    env.DB.prepare("SELECT value FROM app_meta WHERE key='card_evolution_settings_v2'")
  ]);
  let legacy={...LEGACY_DEFAULTS},prestige={...PRESTIGE_DEFAULTS};
  try{if(firstRow(rows[0])?.value)legacy=cleanLegacy(JSON.parse(firstRow(rows[0]).value))}catch{}
  try{if(firstRow(rows[1])?.value)prestige=cleanPrestige(JSON.parse(firstRow(rows[1]).value))}catch{}
  return {...legacy,...prestige};
}
async function state(env,userId,cardId){return await env.DB.prepare('SELECT * FROM card_evolution_progress WHERE user_id=? AND source_card_id=?').bind(userId,cardId).first()||{failed_attempts:0,total_attempts:0,is_success:0,reward_card_id:null}}
function randomPercent(){try{const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]/4294967296*100}catch{return Math.random()*100}}
function pickRandom(items){if(!items.length)return null;try{const values=new Uint32Array(1);crypto.getRandomValues(values);return items[values[0]%items.length]}catch{return items[Math.floor(Math.random()*items.length)]}}
function baseCandidate(row,rule){return {id:String(row.id),title:row.title,name:row.name,grade:row.grade,image:row.image,focusX:Number(row.focusX??50),focusY:Number(row.focusY??50),breakthroughLevel:Number(row.breakthrough_level||0),quantity:Number(row.quantity||0),basePower:Number(row.base_power||0),powerType:String(row.power_type||'')}}
function candidatePayload(row,rule,pveDeck,pvpDeck,progressMap){
  const card=baseCandidate(row,rule),inPve=pveDeck.has(card.id),inPvp=pvpDeck.has(card.id);let blockedReason='';
  if(card.breakthroughLevel<rule.minBreakthrough)blockedReason=`${rule.sourceGrade} +${rule.minBreakthrough} 강화가 필요합니다.`;
  if(rule.mode==='MASTER_STAR'&&!blockedReason&&inPve)blockedReason='현재 PVE 덱에 편성된 카드입니다.';
  if(rule.mode==='MASTER_STAR'&&!blockedReason&&inPvp)blockedReason='현재 PVP 덱에 편성된 카드입니다.';
  const progress=progressMap.get(card.id)||{};
  return {...card,inPve,inPvp,eligible:!blockedReason,blockedReason,progress:{failedAttempts:Number(progress.failed_attempts||0),totalAttempts:Number(progress.total_attempts||0),success:Boolean(progress.is_success),rewardCardId:progress.reward_card_id||null}};
}
async function overview(env,userId,settings){
  const results=await env.DB.batch([
    env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId),
    env.DB.prepare(`SELECT uc.card_id AS id,uc.quantity,uc.breakthrough_level,c.title,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type,c.base_power,m.name FROM user_cards uc JOIN cards c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.rarity IN ('SSR','MA') ORDER BY CASE c.rarity WHEN 'MA' THEN 2 ELSE 1 END DESC,uc.breakthrough_level DESC,m.sort_order,c.title`).bind(userId),
    env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY FROM cards c JOIN members m ON m.id=c.member_id WHERE c.rarity='MA' AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL ORDER BY m.sort_order,c.title`),
    env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY FROM cards c JOIN members m ON m.id=c.member_id WHERE c.rarity='PRESTIGE' AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL ORDER BY m.sort_order,c.title`),
    env.DB.prepare('SELECT card_ids FROM pve_decks WHERE user_id=?').bind(userId),
    env.DB.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').bind(userId),
    env.DB.prepare('SELECT source_card_id,failed_attempts,total_attempts,is_success,reward_card_id FROM card_evolution_progress WHERE user_id=?').bind(userId),
    env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(userId)
  ]);
  const masterStars=Number(firstRow(results[0])?.quantity||0),owned=resultRows(results[1]),pveDeck=parseDeck(firstRow(results[4])),pvpDeck=parseDeck(firstRow(results[5])),progressMap=new Map(resultRows(results[6]).map(row=>[String(row.source_card_id),row])),resources=firstRow(results[7])||{};
  const ssrRule=EVOLUTION_TYPES.SSR_TO_MA,prestigeRule=EVOLUTION_TYPES.MA_TO_PRESTIGE;
  const ssrCandidates=owned.filter(row=>String(row.grade).toUpperCase()==='SSR').map(row=>candidatePayload(row,ssrRule,pveDeck,pvpDeck,progressMap));
  const prestigeCandidates=owned.filter(row=>String(row.grade).toUpperCase()==='MA').map(row=>candidatePayload(row,prestigeRule,pveDeck,pvpDeck,progressMap));
  return {
    settings,masterStars,userResources:{coin:Number(resources.coin||0),cardShards:Number(resources.card_shards||0)},
    types:{
      SSR_TO_MA:{...ssrRule,type:'SSR_TO_MA',candidates:ssrCandidates,resultPool:resultRows(results[2]).map(row=>({...row,focusX:Number(row.focusX??50),focusY:Number(row.focusY??50)})),eligibleCount:ssrCandidates.filter(card=>card.eligible).length,coinCost:settings.coinCost,shardCost:settings.shardCost,successRate:settings.successRate,pityAttempts:settings.pityAttempts},
      MA_TO_PRESTIGE:{...prestigeRule,type:'MA_TO_PRESTIGE',candidates:prestigeCandidates,resultPool:resultRows(results[3]).map(row=>({...row,focusX:Number(row.focusX??50),focusY:Number(row.focusY??50)})),eligibleCount:prestigeCandidates.filter(card=>card.eligible).length,masterStarCost:settings.maToPrestigeMasterStarCost,successRate:settings.maToPrestigeSuccessRate,pityAttempts:settings.maToPrestigePityAttempts}
    }
  };
}
async function cardInCurrentDeck(env,userId,cardId){const rows=await env.DB.batch([env.DB.prepare('SELECT card_ids FROM pve_decks WHERE user_id=?').bind(userId),env.DB.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').bind(userId)]);if(parseDeck(firstRow(rows[0])).has(String(cardId)))return '현재 PVE 덱에 편성된 카드입니다.';if(parseDeck(firstRow(rows[1])).has(String(cardId)))return '현재 PVP 덱에 편성된 카드입니다.';return ''}

async function legacyAttempt({env,deps,user,cardId,settings}){
  const owned=await env.DB.prepare(`SELECT uc.breakthrough_level,uc.quantity,c.rarity,c.title FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,cardId).first();
  if(!owned)return deps.json({error:'보유한 카드가 아닙니다.'},404);
  let progress=await state(env,user.id,cardId);
  if(progress.is_success){await env.DB.prepare('UPDATE card_evolution_progress SET failed_attempts=0,total_attempts=0,is_success=0,reward_card_id=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND source_card_id=? AND is_success=1').bind(user.id,cardId).run();progress=await state(env,user.id,cardId)}
  const eligible=owned.rarity==='SSR'&&Number(owned.breakthrough_level)>=10;
  if(!settings.enabled)return deps.json({error:'현재 카드 진화가 중지되어 있습니다.'},503);
  if(!eligible)return deps.json({error:'SSR 등급 ★10 돌파 카드만 진화할 수 있습니다.'},400);
  if(progress.is_success)return deps.json({error:'이 SSR 카드는 이미 진화에 성공했습니다.'},409);
  const pool=(await env.DB.prepare("SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.name FROM cards c JOIN members m ON m.id=c.member_id WHERE c.rarity='MA' AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL ORDER BY RANDOM()").all()).results;
  if(!pool.length)return deps.json({error:'획득 가능한 공개 MA 카드가 없습니다.'},503);
  const fresh=await env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id).first();
  if(Number(fresh.coin)<settings.coinCost||Number(fresh.card_shards)<settings.shardCost)return deps.json({error:`진화 재료가 부족합니다. (${settings.coinCost.toLocaleString()}코인 / 카드조각 ${settings.shardCost.toLocaleString()}개)`},400);
  const spent=await env.DB.prepare('UPDATE users SET coin=coin-?,card_shards=card_shards-? WHERE id=? AND coin>=? AND card_shards>=?').bind(settings.coinCost,settings.shardCost,user.id,settings.coinCost,settings.shardCost).run();
  if(!spent.meta.changes)return deps.json({error:'진화 재료가 부족합니다.'},409);
  const attemptNo=Number(progress.total_attempts)+1,isPity=Number(progress.failed_attempts)+1>=settings.pityAttempts,success=isPity||Math.random()*100<settings.successRate;let reward=null,duplicate=false,rewardShards=0,masterStarGained=0;
  if(success){
    reward=pool[0];duplicate=Boolean(await env.DB.prepare('SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND COALESCE(quantity,0)>0').bind(user.id,reward.id).first());rewardShards=duplicate?Number(deps.shardReward.MA||120):0;masterStarGained=duplicate?1:0;
    const masterStarBefore=masterStarGained?Number((await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first())?.quantity||0):0,drawGroupId=`evolution-${user.id}-${Date.now()}-${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare('UPDATE user_cards SET quantity=0,breakthrough_level=0 WHERE user_id=? AND card_id=? AND quantity>0').bind(user.id,cardId),
      env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,reward.id),
      env.DB.prepare(`INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success,reward_card_id,completed_at,updated_at) VALUES(?,?,0,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_card_id) DO UPDATE SET total_attempts=excluded.total_attempts,is_success=1,reward_card_id=excluded.reward_card_id,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(user.id,cardId,attemptNo,reward.id),
      ...(rewardShards?[env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(rewardShards,user.id)]:[]),
      ...(masterStarGained?[env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,'MASTER_STAR',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+1,unseen_quantity=unseen_quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id),env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',1,?,'MA_DUPLICATE','EVOLUTION',?)").bind(user.id,masterStarBefore+1,drawGroupId)]:[])
    ]);
  }else await env.DB.prepare(`INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success,updated_at) VALUES(?,?,1,1,0,CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_card_id) DO UPDATE SET failed_attempts=failed_attempts+1,total_attempts=total_attempts+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id,cardId).run();
  const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'CARD_EVOLUTION')").bind(user.id,-settings.coinCost,updated.coin),
    env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'CARD_EVOLUTION',?)").bind(user.id,-settings.shardCost,updated.card_shards,cardId),
    env.DB.prepare('INSERT INTO card_evolution_logs(user_id,source_card_id,attempt_no,coin_cost,shard_cost,success_rate,is_pity,is_success,reward_card_id,reward_duplicate,reward_shards,evolution_type,master_star_cost,source_consumed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(user.id,cardId,attemptNo,settings.coinCost,settings.shardCost,settings.successRate,isPity?1:0,success?1:0,reward?.id||null,duplicate?1:0,rewardShards,'SSR_TO_MA',success?1:0)
  ]);
  return deps.json({ok:true,success,isPity,attemptNo,pityAttempts:settings.pityAttempts,evolutionType:'SSR_TO_MA',reward:reward?{...reward,focusX:Number(reward.focusX??50),focusY:Number(reward.focusY??50)}:null,duplicate,rewardShards,masterStarGained,sourceConsumed:success,user:await deps.profile(env,updated),progress:await state(env,user.id,cardId)});
}

async function prestigeAttempt({env,deps,user,cardId,requestId,settings}){
  if(!settings.enabled)return deps.json({error:'현재 카드 진화가 중지되어 있습니다.'},503);
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))return deps.json({error:'진화 요청 ID가 올바르지 않습니다.'},400);
  const prior=await env.DB.prepare('SELECT id FROM card_evolution_logs WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();if(prior)return deps.json({error:'이미 처리된 진화 요청입니다.',code:'EVOLUTION_DUPLICATE_REQUEST'},409);
  const source=await env.DB.prepare(`SELECT uc.quantity,uc.breakthrough_level,c.id,c.title,c.rarity AS grade FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,cardId).first();
  if(!source)return deps.json({error:'보유한 카드가 아닙니다.'},404);
  if(String(source.grade).toUpperCase()!=='MA'||Number(source.breakthrough_level||0)<13)return deps.json({error:'MA +13 강화 카드만 PRESTIGE로 진화할 수 있습니다.'},400);
  const deckReason=await cardInCurrentDeck(env,user.id,cardId);if(deckReason)return deps.json({error:deckReason},409);
  let progress=await state(env,user.id,cardId);
  if(progress.is_success){await env.DB.prepare('UPDATE card_evolution_progress SET failed_attempts=0,total_attempts=0,is_success=0,reward_card_id=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND source_card_id=? AND is_success=1').bind(user.id,cardId).run();progress=await state(env,user.id,cardId)}
  const masterStarCost=Number(settings.maToPrestigeMasterStarCost||1),successRate=Number(settings.maToPrestigeSuccessRate??100),pityAttempts=Math.max(1,Number(settings.maToPrestigePityAttempts||10)),starRow=await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first(),masterStarBefore=Number(starRow?.quantity||0);
  if(masterStarBefore<masterStarCost)return deps.json({error:`마스터의 별이 ${masterStarCost-masterStarBefore}개 부족합니다.`},400);
  const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY FROM cards c JOIN members m ON m.id=c.member_id WHERE c.rarity='PRESTIGE' AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL ORDER BY c.id`).all()).results||[];
  if(!pool.length)return deps.json({error:'획득 가능한 공개 PRESTIGE 카드가 없습니다. CMS 카드 설정을 확인하세요.'},503);
  const attemptNo=Number(progress.total_attempts||0)+1,isPity=Number(progress.failed_attempts||0)+1>=pityAttempts,success=isPity||randomPercent()<successRate,guardId=`${user.id}:${requestId}`;
  let reward=null,duplicate=false,rewardShards=0;
  if(success){
    reward=pickRandom(pool);duplicate=Boolean(await env.DB.prepare('SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND COALESCE(quantity,0)>0').bind(user.id,reward.id).first());rewardShards=duplicate?Number(deps.shardReward?.PRESTIGE||0):0;
  }
  const statements=[
    env.DB.prepare(`INSERT INTO card_evolution_atomic_guard(guard_id,verified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0 AND c.rarity='MA' AND COALESCE(uc.breakthrough_level,0)>=13) AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity>=?) THEN 1 ELSE 0 END`).bind(guardId,user.id,cardId,user.id,masterStarCost),
    env.DB.prepare("UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity>=?").bind(masterStarCost,masterStarCost,user.id,masterStarCost)
  ];
  if(success){
    statements.push(
      env.DB.prepare('UPDATE user_cards SET quantity=0,breakthrough_level=0,last_obtained_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_id=? AND quantity>0').bind(user.id,cardId),
      env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,first_obtained_at,last_obtained_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,reward.id)
    );
    if(rewardShards>0){statements.push(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(rewardShards,user.id));statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT ?,?,card_shards,'EVOLUTION_DUPLICATE',? FROM users WHERE id=?").bind(user.id,rewardShards,reward.id,user.id))}
    statements.push(env.DB.prepare(`INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success,reward_card_id,completed_at,updated_at) VALUES(?,?,0,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_card_id) DO UPDATE SET failed_attempts=0,total_attempts=card_evolution_progress.total_attempts+1,is_success=1,reward_card_id=excluded.reward_card_id,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(user.id,cardId,reward.id));
  }else{
    statements.push(env.DB.prepare(`INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success,reward_card_id,completed_at,updated_at) VALUES(?,?,1,1,0,NULL,NULL,CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_card_id) DO UPDATE SET failed_attempts=card_evolution_progress.failed_attempts+1,total_attempts=card_evolution_progress.total_attempts+1,is_success=0,reward_card_id=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(user.id,cardId));
  }
  statements.push(
    env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',-?,quantity,'PRESTIGE_EVOLUTION','EVOLUTION',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id,masterStarCost,requestId,user.id),
    env.DB.prepare(`INSERT INTO card_evolution_logs(user_id,source_card_id,attempt_no,coin_cost,shard_cost,success_rate,is_pity,is_success,reward_card_id,reward_duplicate,reward_shards,evolution_type,master_star_cost,request_id,source_consumed) VALUES(?,?,?,0,0,?,?,?,?,?,?, 'MA_TO_PRESTIGE',?,?,?)`).bind(user.id,cardId,attemptNo,successRate,isPity?1:0,success?1:0,reward?.id||null,duplicate?1:0,rewardShards,masterStarCost,requestId,success?1:0),
    env.DB.prepare('DELETE FROM card_evolution_atomic_guard WHERE guard_id=?').bind(guardId)
  );
  try{await env.DB.batch(statements)}catch(error){const message=String(error?.message||error||'');if(/request_id|UNIQUE/i.test(message))return deps.json({error:'이미 처리된 진화 요청입니다.',code:'EVOLUTION_DUPLICATE_REQUEST'},409);if(/CHECK constraint|verified/i.test(message))return deps.json({error:'진화 재료 또는 대상 카드 상태가 변경되었습니다. 다시 확인해주세요.',code:'EVOLUTION_STATE_CHANGED'},409);throw error}
  const [updated,starAfter]=await Promise.all([env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first(),env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first()]);
  return deps.json({ok:true,success,isPity,attemptNo,pityAttempts,successRate,evolutionType:'MA_TO_PRESTIGE',sourceConsumed:success,source:{id:cardId,title:source.title,grade:source.grade,breakthroughLevel:Number(source.breakthrough_level||0)},reward:reward?{...reward,focusX:Number(reward.focusX??50),focusY:Number(reward.focusY??50)}:null,duplicate,rewardShards,masterStarGained:0,masterStarCost,masterStarsAfter:Number(starAfter?.quantity||0),user:await deps.profile(env,updated),progress:await state(env,user.id,cardId)});
}

export async function handleEvolution({path,request,env,deps}){
  if(!path.startsWith('evolution/')&&!path.startsWith('admin/evolution'))return null;
  await upgrade(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(path==='admin/evolution/settings'){
    if(!deps.isAdminRole(user))return deps.json({error:'OWNER 또는 ADMIN 권한이 필요합니다.'},403);
    if(request.method==='PATCH'){
      const body=await deps.readBody(request),legacy=cleanLegacy(body),prestige=cleanPrestige(body);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('card_evolution_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(legacy)),
        env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('card_evolution_settings_v2',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(prestige))
      ]);
      return deps.json({ok:true,settings:{...legacy,...prestige}});
    }
    const logs=await env.DB.prepare(`SELECT l.*,u.nickname,c.title source_title,r.title reward_title FROM card_evolution_logs l JOIN users u ON u.id=l.user_id JOIN cards c ON c.id=l.source_card_id LEFT JOIN cards r ON r.id=l.reward_card_id ORDER BY l.id DESC LIMIT 50`).all();
    return deps.json({settings:await config(env),logs:logs.results||[]});
  }
  const settings=await config(env);
  if(path==='evolution/overview'&&request.method==='GET')return deps.json(await overview(env,user.id,settings));
  if(path==='evolution/status'&&request.method==='GET'){
    const cardId=String(new URL(request.url).searchParams.get('cardId')||'').trim();if(!cardId)return deps.json({error:'카드를 선택하세요.'},400);
    const owned=await env.DB.prepare(`SELECT uc.breakthrough_level,uc.quantity,c.rarity,c.title FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,cardId).first();if(!owned)return deps.json({error:'보유한 카드가 아닙니다.'},404);
    const progress=await state(env,user.id,cardId),eligible=owned.rarity==='SSR'&&Number(owned.breakthrough_level)>=10;
    return deps.json({settings:{enabled:settings.enabled,coinCost:settings.coinCost,shardCost:settings.shardCost,successRate:settings.successRate,pityAttempts:settings.pityAttempts},eligible,card:{id:cardId,title:owned.title,rarity:owned.rarity,breakthroughLevel:Number(owned.breakthrough_level)},progress:{failedAttempts:Number(progress.failed_attempts),totalAttempts:Number(progress.total_attempts),success:Boolean(progress.is_success),rewardCardId:progress.reward_card_id},nextAttempt:Number(progress.total_attempts)+1,pityNext:Number(progress.failed_attempts)+1>=settings.pityAttempts,user:{coin:Number(user.coin),cardShards:Number(user.card_shards||0)}});
  }
  if(path==='evolution/attempt'&&request.method==='POST'){
    const body=await deps.readBody(request),type=normalizeType(body.evolutionType),cardId=String(body.cardId||'').trim();if(!cardId)return deps.json({error:'진화할 카드를 선택하세요.'},400);
    if(type==='SSR_TO_MA')return legacyAttempt({env,deps,user,cardId,settings});
    return prestigeAttempt({env,deps,user,cardId,requestId:String(body.requestId||'').trim(),settings});
  }
  return deps.json({error:'진화 API를 찾을 수 없습니다.'},404);
}
