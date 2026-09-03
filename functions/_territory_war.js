const NODES=Object.freeze([
  {index:0,code:'A_BASE',name:'A팀 본진',type:'HOME'},
  {index:1,code:'A_OUTPOST',name:'A 전초기지',type:'OUTPOST'},
  {index:2,code:'A_MID',name:'A 중간거점',type:'MID'},
  {index:3,code:'A_GATE',name:'A 최종관문',type:'GATE'},
  {index:4,code:'CENTER',name:'중앙 교전지',type:'CENTER'},
  {index:5,code:'B_GATE',name:'B 최종관문',type:'GATE'},
  {index:6,code:'B_MID',name:'B 중간거점',type:'MID'},
  {index:7,code:'B_OUTPOST',name:'B 전초기지',type:'OUTPOST'},
  {index:8,code:'B_BASE',name:'B팀 본진',type:'HOME'}
]);

const DEFAULTS=Object.freeze({
  mode:'OFF',battleName:'',teamAName:'A 진영',teamBName:'B 진영',recruitmentHours:3,preparationMinutes:10,roundMinutes:180,minParticipants:6,
  energyMax:10,energyMinutes:10,attackEnergyCost:1,realtimePollSeconds:12,
  baseSiegeHp:500000,outpostHpMultiplier:1.1,midHpMultiplier:1.2,gateHpMultiplier:1.4,homeHpMultiplier:2,
  damageScale:6,minDamage:100,maxDamage:5000,damageVariancePercent:10,recentActionLimit:20,
  individualBattleWinCoin:0,
  winnerCoin:5000,loserCoin:2000,drawCoin:3000,participationShards:50,
  contributionCoinPer1000Damage:10,maxContributionCoin:1000000,settlementMinAttacks:1,
  attackRewardStarterPercent:25,attackRewardTier1Attacks:10,attackRewardTier1Percent:50,
  attackRewardTier2Attacks:30,attackRewardTier2Percent:80,attackRewardTier3Attacks:60,attackRewardTier3Percent:100,
  attackRewardTier4Attacks:100,attackRewardTier4Percent:125,
  siegeSnapshotLimit:12,siegeSnapshotAttackThreshold:200,siegeSnapshotBonusCoin:500000,
  siegeParticipationCubeThreshold:100,siegeParticipationCubeQuantity:10
  ,lastDefenseHpBonusPercent:35,lastDefenseHoldMinutes:15,lastDefenseEnergyMinutes:5,
  counterGaugeMax:1000,counterParticipationPoints:18,counterDefeatPoints:12,counterStrongChallengePoints:20,counterDefensePoints:16,counterAceWinPoints:120,counterAceDamagePoints:35,
  operationDurationMinutes:10,assaultDamageBonusPercent:25,infiltrationHpPercent:12,regroupEnergy:3,ironWallHealPercent:20,ironWallDamageReductionPercent:25,
  carpetBombingHpPercent:10,airDefenseInterceptPercent:75,airDefenseDamageReductionPercent:12,
  spgDamageBonusPercent:35,counterBatterySuppressionPercent:70,counterBatteryGaugeBonus:48,
  massAssaultDamagePercent:39,
  fatiguePerCapturePercent:5,fatigueMaxPercent:15,fatigueDamageRatio:0,
  comebackDamagePerTierPercent:4,defeatSiegeDamagePercent:0,antiPingPongRevisitThreshold:3,
  counterContributionCoinPerPoint:5,aceDefeatCoin:10000,lastDefenseCoin:5000,comebackParticipationCoin:300
});

// 11회차는 기존 규칙으로 판정 종료하고, 완화 규칙은 12회차부터 적용한다.
const BALANCE_REWORK_FROM_ROUND_ID=12;
const FORMATION_HISTORY_ROUNDS=5;
const MAX_SETTLEMENT_REWARD_COMPONENT_COIN=1_000_000_000_000;
const PARTICIPATION_ITEM_REWARD_ATTACKS=100;
const PARTICIPATION_SCRAPYARD_TICKETS=20;
const PARTICIPATION_MYSTIC_ENERGY=1;
const WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS=80;
const WINNER_MASTER_STAR_BONUS_AMOUNT=7_000;
const WINNER_MASTER_STAR_BONUS_MARKER='safe_runtime_reward_v1956_latest_finished_winner_gt80_master_star_7000';
const LEGACY_BALANCE=Object.freeze({fatiguePerCapturePercent:10,fatigueMaxPercent:30,fatigueDamageRatio:.4,comebackDamagePerTierPercent:8,defeatSiegeDamagePercent:20,antiPingPongRevisitThreshold:Number.MAX_SAFE_INTEGER});
function balanceRules(round,cfg){return Number(round?.id||0)>=BALANCE_REWORK_FROM_ROUND_ID?cfg:LEGACY_BALANCE}

let foundationReady=false;
let territoryRuntimeDeps=null;
let settingsCacheValue=null,settingsCacheExpiresAt=0;
let publicStateSharedCache=null,realtimePulseCache=null;
const participantDeckCache=new Map();
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
function cleanLabel(value,fallback,max=20){return String(value??fallback??'').replace(/[<>&"'`]/g,'').replace(/\s+/g,' ').trim().slice(0,max)||fallback}
function clamp(value,min,max,fallback=min){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function clampInt(value,min,max,fallback=min){return Math.round(clamp(value,min,max,fallback))}
function iso(ms=Date.now()){return new Date(ms).toISOString()}
function sqlMs(value){if(!value)return NaN;const text=String(value);return Date.parse(text.includes('T')?text:`${text.replace(' ','T')}Z`)}
function validRequestId(value){const text=String(value||'').trim();return text.length>=8&&text.length<=120&&/^[A-Za-z0-9:_-]+$/.test(text)?text:''}
function nodeAt(index){return NODES[Math.max(0,Math.min(NODES.length-1,Number(index)||0))]}
function hpMultiplier(node,cfg){if(node.type==='HOME')return Number(cfg.homeHpMultiplier||2);if(node.type==='GATE')return Number(cfg.gateHpMultiplier||1.4);if(node.type==='MID')return Number(cfg.midHpMultiplier||1.2);if(node.type==='OUTPOST')return Number(cfg.outpostHpMultiplier||1.1);return 1}
function maxHpForNode(node,cfg){return Math.max(1000,Math.round(Number(cfg.baseSiegeHp||500000)*hpMultiplier(node,cfg)))}
function seedOf(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function damageFor(power,requestId,cfg){const variance=clampInt(cfg.damageVariancePercent,0,40,10),spread=variance*2+1,jitter=(seedOf(requestId)%spread)-variance;const raw=Math.sqrt(Math.max(1,Number(power)||1))*Number(cfg.damageScale||6)*(1+jitter/100);return clampInt(Math.round(raw),Number(cfg.minDamage||100),Number(cfg.maxDamage||5000),Number(cfg.minDamage||100))}
async function tableExists(env,name){const row=await env.DB.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();return Boolean(row)}
function missingTableError(error,table){const message=String(error?.message||error||'').toLowerCase(),name=String(table||'').toLowerCase();return message.includes(`relation "${name}" does not exist`)||message.includes(`no such table: ${name}`)||message.includes(`table ${name} does not exist`)}
async function batchChunks(env,statements,size=50){for(let i=0;i<statements.length;i+=size)await env.DB.batch(statements.slice(i,i+size))}
async function tableColumns(env,name){const rows=(await env.DB.prepare(`PRAGMA table_info(${name})`).all()).results||[];return new Set(rows.map(row=>String(row.name||'')))}
async function addColumnIfMissing(env,table,column,definition){const columns=await tableColumns(env,table);if(columns.has(column))return false;await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();return true}
async function repairWaterBuffaloSettlementV1443(env){
  const markerKey='safe_runtime_repair_v1443_water_buffalo_b_win_500k';
  if(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(markerKey).first())return;
  const rawSettings=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first(),cfg=safeJson(rawSettings?.value,{});
  if(String(cfg.teamBName||'').trim()!=='물소파')return;
  const round=await env.DB.prepare("SELECT * FROM territory_war_v3_rounds WHERE settled_at IS NOT NULL AND winner_side<>'B' AND datetime(settled_at)>=datetime('now','-7 days') ORDER BY id DESC LIMIT 1").first();
  if(!round)return;
  const claimedB=(await env.DB.prepare("SELECT user_id,coin FROM territory_war_v3_rewards WHERE round_id=? AND side='B' AND result<>'INELIGIBLE' AND claimed_at IS NOT NULL").bind(round.id).all()).results||[],statements=[];
  statements.push(env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='territory_war_settings_v3'").bind(JSON.stringify({...cfg,winnerCoin:500000,loserCoin:100000})));
  statements.push(env.DB.prepare("UPDATE territory_war_v3_rounds SET winner_side='B',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(round.id));
  statements.push(env.DB.prepare("UPDATE territory_war_v3_rewards SET result='WIN',coin=500000 WHERE round_id=? AND side='B' AND result<>'INELIGIBLE' AND claimed_at IS NULL").bind(round.id));
  statements.push(env.DB.prepare("UPDATE territory_war_v3_rewards SET result='LOSE',coin=100000 WHERE round_id=? AND side<>'B' AND result<>'INELIGIBLE' AND claimed_at IS NULL").bind(round.id));
  for(const row of claimedB){const difference=Math.max(0,500000-Number(row.coin||0));if(difference>0){statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(difference,row.user_id));statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'영토전 정산 정정 · 물소파 승리 차액' FROM users WHERE id=?").bind(difference,row.user_id))}}
  statements.push(env.DB.prepare("UPDATE territory_war_v3_rewards SET result='WIN',coin=500000 WHERE round_id=? AND side='B' AND result<>'INELIGIBLE' AND claimed_at IS NOT NULL").bind(round.id));
  statements.push(env.DB.prepare("UPDATE territory_war_v3_rewards SET result='LOSE' WHERE round_id=? AND side<>'B' AND result<>'INELIGIBLE' AND claimed_at IS NOT NULL").bind(round.id));
  statements.push(env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(markerKey,JSON.stringify({roundId:Number(round.id),winnerSide:'B',winnerCoin:500000,loserCoin:100000,claimedBRecipients:claimedB.length,correctedAt:iso()})));
  await env.DB.batch(statements);
}
async function recoverWrongWinnerOverpaymentV1444(env){
  const markerKey='safe_runtime_repair_v1444_wrong_winner_coin_recovery';
  if(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(markerKey).first())return;
  const repair=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_repair_v1443_water_buffalo_b_win_500k'").first(),repairInfo=safeJson(repair?.value,{}),roundId=Number(repairInfo.roundId||0);
  if(!roundId)return;
  const rows=(await env.DB.prepare("SELECT r.user_id,r.coin,u.coin balance FROM territory_war_v3_rewards r JOIN users u ON u.id=r.user_id WHERE r.round_id=? AND r.side<>'B' AND r.result<>'INELIGIBLE' AND r.claimed_at IS NOT NULL AND r.coin>100000").bind(roundId).all()).results||[],statements=[];let recoveredTotal=0,outstandingTotal=0;
  for(const row of rows){const overpaid=Math.max(0,Number(row.coin||0)-100000),recovered=Math.min(Math.max(0,Number(row.balance||0)),overpaid),outstanding=Math.max(0,overpaid-recovered);recoveredTotal+=recovered;outstandingTotal+=outstanding;if(recovered>0){statements.push(env.DB.prepare('UPDATE users SET coin=MAX(0,coin-?) WHERE id=?').bind(recovered,row.user_id));statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'영토전 오정산 초과 보상 회수' FROM users WHERE id=?").bind(-recovered,row.user_id))}}
  statements.push(env.DB.prepare("UPDATE territory_war_v3_rewards SET result='LOSE',coin=100000 WHERE round_id=? AND side<>'B' AND result<>'INELIGIBLE' AND claimed_at IS NOT NULL").bind(roundId));
  statements.push(env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(markerKey,JSON.stringify({roundId,accounts:rows.length,recoveredTotal,outstandingTotal,recoveredAt:iso()})));
  await env.DB.batch(statements);
}

// 2026-09-01 운영 지시: 배포 직전의 최신 종료 회차 승리 진영 중 정산 공격 80회 초과자에게
// 마스터의 별 7,000개를 한 번만 지급한다. 전역 마커가 이후 회차 자동 지급을 막고,
// 회차별 inventory_logs 영수증이 실행 중단 후 재시도에서도 유저별 중복 지급을 막는다.
async function grantLatestWinnerMasterStarsV1956(env){
  const existingMarker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WINNER_MASTER_STAR_BONUS_MARKER).first();
  if(existingMarker){
    const receipt=safeJson(existingMarker.value,{});
    console.log(JSON.stringify({type:'territory_winner_master_star_v1956',alreadyCompleted:true,...receipt}));
    return receipt;
  }
  const round=await env.DB.prepare(`SELECT id,battle_name,winner_side,settled_at
    FROM territory_war_v3_rounds
    WHERE status='FINISHED' AND settled_at IS NOT NULL AND winner_side IN ('A','B')
    ORDER BY settled_at DESC,id DESC LIMIT 1`).first();
  if(!round)return null;
  const roundId=Number(round.id||0),winnerSide=String(round.winner_side||'').toUpperCase(),settledAtMs=sqlMs(round.settled_at);
  if(!roundId||!['A','B'].includes(winnerSide)||!Number.isFinite(settledAtMs)||settledAtMs>Date.now()+300000||Date.now()-settledAtMs>86400000){
    console.warn('territory winner master-star v1956 skipped: latest finished round is not recent',JSON.stringify({roundId,winnerSide,settledAt:round.settled_at||null}));
    return null;
  }
  const lock=await acquireLock(env,'reward_v1956_latest_finished_winner_gt80_master_star_7000',180000);
  if(!lock.ok)return null;
  try{
    const completedWhileWaiting=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WINNER_MASTER_STAR_BONUS_MARKER).first();
    if(completedWhileWaiting)return safeJson(completedWhileWaiting.value,{});
    const operationKey=`TWV3:R${roundId}:WIN:ATTACKS_GT80:MASTER_STAR:7000`,referenceType='TERRITORY_WAR_BONUS';
    const rawSettings=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first(),cfg={...DEFAULTS,...safeJson(rawSettings?.value,{})};
    const recipients=(await env.DB.prepare(`WITH action_counts AS (
        SELECT user_id,COUNT(*) action_attacks FROM territory_war_v3_actions
        WHERE round_id=? AND status IN ('APPLIED','COMPLETED') GROUP BY user_id
      )
      SELECT r.user_id,u.nickname,r.attacks,r.damage,COALESCE(w.attacks,0) stored_attacks,
        COALESCE(ac.action_attacks,0) action_attacks,COALESCE(i.quantity,0) balance_before
      FROM territory_war_v3_rewards r
      JOIN territory_war_v3_users w ON w.round_id=r.round_id AND w.user_id=r.user_id
      JOIN users u ON u.id=r.user_id
      LEFT JOIN action_counts ac ON ac.user_id=r.user_id
      LEFT JOIN cnine_user_inventory i ON i.user_id=r.user_id AND i.item_code='MASTER_STAR'
      WHERE r.round_id=? AND r.side=? AND r.result='WIN' AND r.attacks>?
      ORDER BY r.attacks DESC,r.damage DESC,r.user_id`).bind(roundId,roundId,winnerSide,WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS).all()).results||[];
    const ensureInventory=env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT r.user_id,'MASTER_STAR',0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM territory_war_v3_rewards r
      WHERE r.round_id=? AND r.side=? AND r.result='WIN' AND r.attacks>?
      ON CONFLICT(user_id,item_code) DO NOTHING`).bind(roundId,winnerSide,WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS);
    const grantInventory=env.DB.prepare(`UPDATE cnine_user_inventory SET
        quantity=quantity+?,unseen_quantity=unseen_quantity+?,updated_at=CURRENT_TIMESTAMP
      WHERE item_code='MASTER_STAR' AND user_id IN (
        SELECT r.user_id FROM territory_war_v3_rewards r
        WHERE r.round_id=? AND r.side=? AND r.result='WIN' AND r.attacks>?
      ) AND NOT EXISTS (
        SELECT 1 FROM inventory_logs l WHERE l.user_id=cnine_user_inventory.user_id
          AND l.item_code='MASTER_STAR' AND l.reference_type=? AND l.reference_id=?
      )`).bind(WINNER_MASTER_STAR_BONUS_AMOUNT,WINNER_MASTER_STAR_BONUS_AMOUNT,roundId,winnerSide,WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS,referenceType,operationKey);
    const writeLogs=env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT i.user_id,'MASTER_STAR',?,i.quantity,'영토전 승리팀 80회 초과 특별 보상',?,?
      FROM cnine_user_inventory i JOIN territory_war_v3_rewards r ON r.user_id=i.user_id AND r.round_id=?
      WHERE i.item_code='MASTER_STAR' AND r.side=? AND r.result='WIN' AND r.attacks>?
        AND NOT EXISTS (
          SELECT 1 FROM inventory_logs l WHERE l.user_id=i.user_id AND l.item_code='MASTER_STAR'
            AND l.reference_type=? AND l.reference_id=?
        )`).bind(WINNER_MASTER_STAR_BONUS_AMOUNT,referenceType,operationKey,roundId,winnerSide,WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS,referenceType,operationKey);
    await env.DB.batch([ensureInventory,grantInventory,writeLogs]);
    const audit=await env.DB.prepare(`SELECT COUNT(*) paid_count,COALESCE(SUM(change_amount),0) total_granted
      FROM inventory_logs WHERE item_code='MASTER_STAR' AND reference_type=? AND reference_id=?`).bind(referenceType,operationKey).first();
    const paidCount=Number(audit?.paid_count||0),totalGranted=Number(audit?.total_granted||0),expectedTotal=recipients.length*WINNER_MASTER_STAR_BONUS_AMOUNT;
    if(paidCount!==recipients.length||totalGranted!==expectedTotal)throw new Error(`영토전 마스터의 별 지급 검증 불일치: ${paidCount}/${recipients.length}, ${totalGranted}/${expectedTotal}`);
    const balances=(await env.DB.prepare(`SELECT i.user_id,i.quantity FROM cnine_user_inventory i
      JOIN territory_war_v3_rewards r ON r.user_id=i.user_id AND r.round_id=?
      WHERE i.item_code='MASTER_STAR' AND r.side=? AND r.result='WIN' AND r.attacks>? ORDER BY r.attacks DESC,r.damage DESC,r.user_id`).bind(roundId,winnerSide,WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS).all()).results||[];
    const balanceByUser=new Map(balances.map(row=>[Number(row.user_id),Number(row.quantity||0)]));
    const receipt={roundId,battleName:String(round.battle_name||''),winnerSide,teamName:configuredTeamLabel(cfg,winnerSide),settledAt:round.settled_at,
      threshold:`>${WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS}`,amount:WINNER_MASTER_STAR_BONUS_AMOUNT,recipientCount:recipients.length,totalGranted,operationKey,
      recipients:recipients.map(row=>({userId:Number(row.user_id),nickname:String(row.nickname||''),attacks:Number(row.attacks||0),damage:Number(row.damage||0),storedAttacks:Number(row.stored_attacks||0),actionAttacks:Number(row.action_attacks||0),balanceBefore:Number(row.balance_before||0),balanceAfter:balanceByUser.get(Number(row.user_id))??null})),completedAt:iso()};
    await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(WINNER_MASTER_STAR_BONUS_MARKER,JSON.stringify(receipt)).run();
    console.log(JSON.stringify({type:'territory_winner_master_star_v1956',alreadyCompleted:false,...receipt}));
    return receipt;
  }finally{await releaseLock(env,lock)}
}

async function ensureFoundation(env){
  if(foundationReady)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1402_territory_frontline_v3'").first();
  if(!marker){
    const sql=[
      `CREATE TABLE IF NOT EXISTS territory_war_v3_rounds(
        id INTEGER PRIMARY KEY AUTOINCREMENT,status TEXT NOT NULL DEFAULT 'RECRUITING',battle_name TEXT NOT NULL DEFAULT '',recruitment_ends_at TEXT,
        starts_at TEXT,ends_at TEXT,current_front_index INTEGER NOT NULL DEFAULT 4,current_front_id INTEGER,
        a_total_damage INTEGER NOT NULL DEFAULT 0,b_total_damage INTEGER NOT NULL DEFAULT 0,
        a_front_wins INTEGER NOT NULL DEFAULT 0,b_front_wins INTEGER NOT NULL DEFAULT 0,
        winner_side TEXT,version INTEGER NOT NULL DEFAULT 1,formed_at TEXT,settled_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS territory_war_v3_users(
        round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,deck_power INTEGER NOT NULL DEFAULT 0,deck_snapshot TEXT NOT NULL DEFAULT '[]',
        side TEXT,status TEXT NOT NULL DEFAULT 'WAITING',energy INTEGER NOT NULL DEFAULT 10,last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        attacks INTEGER NOT NULL DEFAULT 0,damage INTEGER NOT NULL DEFAULT 0,front_finishes INTEGER NOT NULL DEFAULT 0,
        defenses INTEGER NOT NULL DEFAULT 0,defense_wins INTEGER NOT NULL DEFAULT 0,defense_losses INTEGER NOT NULL DEFAULT 0,
        registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(round_id,user_id))`,
      `CREATE TABLE IF NOT EXISTS territory_war_v3_fronts(
        id INTEGER PRIMARY KEY AUTOINCREMENT,round_id INTEGER NOT NULL,sequence INTEGER NOT NULL,node_index INTEGER NOT NULL,
        node_code TEXT NOT NULL,node_name TEXT NOT NULL,node_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PREPARING',
        a_hp INTEGER NOT NULL,b_hp INTEGER NOT NULL,a_max_hp INTEGER NOT NULL,b_max_hp INTEGER NOT NULL,revisit_count INTEGER NOT NULL DEFAULT 0,
        winner_side TEXT,version INTEGER NOT NULL DEFAULT 1,started_at TEXT,resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(round_id,sequence))`,
      `CREATE TABLE IF NOT EXISTS territory_war_v3_actions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL UNIQUE,round_id INTEGER,front_id INTEGER,user_id INTEGER NOT NULL,
        opponent_user_id INTEGER,contributor_user_id INTEGER,side TEXT,winner_side TEXT,target_side TEXT,battle_seed INTEGER,
        status TEXT NOT NULL DEFAULT 'PENDING',damage INTEGER NOT NULL DEFAULT 0,energy_spent INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,battle_meta_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS territory_war_v3_front_results(
        round_id INTEGER NOT NULL,sequence INTEGER NOT NULL,front_id INTEGER NOT NULL,node_index INTEGER NOT NULL,node_code TEXT NOT NULL,
        winner_side TEXT NOT NULL,a_damage INTEGER NOT NULL DEFAULT 0,b_damage INTEGER NOT NULL DEFAULT 0,
        a_hp_left INTEGER NOT NULL DEFAULT 0,b_hp_left INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(round_id,sequence))`,
      `CREATE TABLE IF NOT EXISTS territory_war_v3_rewards(
        round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,side TEXT,result TEXT NOT NULL,coin INTEGER NOT NULL DEFAULT 0,
        shards INTEGER NOT NULL DEFAULT 0,damage INTEGER NOT NULL DEFAULT 0,attacks INTEGER NOT NULL DEFAULT 0,required_attacks INTEGER NOT NULL DEFAULT 0,
        claimed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,user_id))`,
      `CREATE TABLE IF NOT EXISTS territory_war_v3_admin_operations(
        operation_key TEXT PRIMARY KEY,action TEXT NOT NULL,round_id INTEGER,admin_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
        response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_round_status ON territory_war_v3_rounds(status,id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_users_side ON territory_war_v3_users(round_id,side,damage DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_users_user ON territory_war_v3_users(user_id,round_id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_users_match ON territory_war_v3_users(round_id,side,status,defenses,deck_power,user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_front_active ON territory_war_v3_fronts(round_id,status,id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_actions_cleanup ON territory_war_v3_actions(status,updated_at,id)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_actions_round ON territory_war_v3_actions(round_id,id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_actions_user_status ON territory_war_v3_actions(round_id,user_id,status)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_actions_opponent ON territory_war_v3_actions(round_id,opponent_user_id,id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_rewards_user ON territory_war_v3_rewards(user_id,claimed_at,round_id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_twv3_admin_cleanup ON territory_war_v3_admin_operations(status,updated_at)`
    ];
    await batchChunks(env,sql.map(statement=>env.DB.prepare(statement)));
    const old=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v1'").first();
    const migrated={...DEFAULTS,...safeJson(old?.value,{})};
    await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('territory_war_settings_v3',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(migrated)).run();
    if(await tableExists(env,'territory_war_rounds'))await env.DB.prepare("UPDATE territory_war_rounds SET status='DISABLED',updated_at=CURRENT_TIMESTAMP WHERE status IN ('RECRUITING','PREPARING','ACTIVE')").run();
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1402_territory_frontline_v3','1',CURRENT_TIMESTAMP)").run();
  }
  const battleMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1404_territory_battle_v2'").first();
  if(!battleMarker){
    await addColumnIfMissing(env,'territory_war_v3_users','defenses','INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(env,'territory_war_v3_users','defense_wins','INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(env,'territory_war_v3_users','defense_losses','INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(env,'territory_war_v3_actions','opponent_user_id','INTEGER');
    await addColumnIfMissing(env,'territory_war_v3_actions','contributor_user_id','INTEGER');
    await addColumnIfMissing(env,'territory_war_v3_actions','winner_side','TEXT');
    await addColumnIfMissing(env,'territory_war_v3_actions','target_side','TEXT');
    await addColumnIfMissing(env,'territory_war_v3_actions','battle_seed','INTEGER');
    await addColumnIfMissing(env,'territory_war_v3_actions','battle_meta_json','TEXT');
    await env.DB.batch([
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twv3_users_match ON territory_war_v3_users(round_id,side,status,defenses,deck_power,user_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twv3_actions_opponent ON territory_war_v3_actions(round_id,opponent_user_id,id DESC)`)
    ]);
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1404_territory_battle_v2','1',CURRENT_TIMESTAMP)").run();
  }
  const nameMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1428_territory_battle_name'").first();
  if(!nameMarker){
    await addColumnIfMissing(env,'territory_war_v3_rounds','battle_name',"TEXT NOT NULL DEFAULT ''");
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1428_territory_battle_name','1',CURRENT_TIMESTAMP)").run();
  }
  const rewardAuditMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1432_territory_reward_attack_audit'").first();
  if(!rewardAuditMarker){
    await addColumnIfMissing(env,'territory_war_v3_rewards','required_attacks','INTEGER NOT NULL DEFAULT 0');
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1432_territory_reward_attack_audit','1',CURRENT_TIMESTAMP)").run();
  }
  const revisitMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1442_territory_revisit_fatigue'").first();
  if(!revisitMarker){
    await addColumnIfMissing(env,'territory_war_v3_fronts','revisit_count','INTEGER NOT NULL DEFAULT 0');
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1442_territory_revisit_fatigue','1',CURRENT_TIMESTAMP)").run();
  }
  const comebackMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1465_territory_comeback_systems'").first();
  if(!comebackMarker){
    for(const [column,definition] of [
      ['a_counter_gauge','INTEGER NOT NULL DEFAULT 0'],['b_counter_gauge','INTEGER NOT NULL DEFAULT 0'],['a_operation',"TEXT NOT NULL DEFAULT ''"],['b_operation',"TEXT NOT NULL DEFAULT ''"],['a_operation_ends_at','TEXT'],['b_operation_ends_at','TEXT'],['a_capture_streak','INTEGER NOT NULL DEFAULT 0'],['b_capture_streak','INTEGER NOT NULL DEFAULT 0']
    ])await addColumnIfMissing(env,'territory_war_v3_rounds',column,definition);
    for(const [column,definition] of [
      ['counter_contribution','INTEGER NOT NULL DEFAULT 0'],['ace_defeats','INTEGER NOT NULL DEFAULT 0'],['last_defense_successes','INTEGER NOT NULL DEFAULT 0'],['comeback_participations','INTEGER NOT NULL DEFAULT 0']
    ])await addColumnIfMissing(env,'territory_war_v3_users',column,definition);
    for(const [column,definition] of [
      ['last_defense_side','TEXT'],['last_defense_deadline','TEXT'],['last_defense_triggered','INTEGER NOT NULL DEFAULT 0'],['fatigued_side','TEXT'],['fatigue_percent','INTEGER NOT NULL DEFAULT 0']
    ])await addColumnIfMissing(env,'territory_war_v3_fronts',column,definition);
    await addColumnIfMissing(env,'territory_war_v3_actions','counter_gained','INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(env,'territory_war_v3_actions','ace_target','INTEGER NOT NULL DEFAULT 0');
    for(const [column,definition] of [['counter_bonus_coin','INTEGER NOT NULL DEFAULT 0'],['ace_bonus_coin','INTEGER NOT NULL DEFAULT 0'],['last_defense_bonus_coin','INTEGER NOT NULL DEFAULT 0'],['comeback_bonus_coin','INTEGER NOT NULL DEFAULT 0']])await addColumnIfMissing(env,'territory_war_v3_rewards',column,definition);
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_operation_votes(round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,side TEXT NOT NULL,operation TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,user_id))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_notices(id INTEGER PRIMARY KEY AUTOINCREMENT,round_id INTEGER NOT NULL,type TEXT NOT NULL,side TEXT,title TEXT NOT NULL,message TEXT NOT NULL,payload_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twv3_votes_round_side ON territory_war_v3_operation_votes(round_id,side,operation)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twv3_notices_round ON territory_war_v3_notices(round_id,id DESC)`)
    ]);
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1465_territory_comeback_systems','1',CURRENT_TIMESTAMP)").run();
  }
  const operationUseMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1472_territory_operation_once'").first();
  if(!operationUseMarker){
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_operation_uses(round_id INTEGER NOT NULL,side TEXT NOT NULL,operation TEXT NOT NULL,activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,side,operation))`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_twv3_operation_uses_round_side ON territory_war_v3_operation_uses(round_id,side)`),
      env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_operation_uses(round_id,side,operation,activated_at) SELECT round_id,side,json_extract(payload_json,'$.operation'),created_at FROM territory_war_v3_notices WHERE type='COUNTER_OPERATION' AND side IN ('A','B') AND json_extract(payload_json,'$.operation') IN ('ASSAULT','INFILTRATION','REGROUP','IRON_WALL')`),
      env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_operation_uses(round_id,side,operation) SELECT id,'A',a_operation FROM territory_war_v3_rounds WHERE a_operation IN ('ASSAULT','INFILTRATION','REGROUP','IRON_WALL')`),
      env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_operation_uses(round_id,side,operation) SELECT id,'B',b_operation FROM territory_war_v3_rounds WHERE b_operation IN ('ASSAULT','INFILTRATION','REGROUP','IRON_WALL')`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1472_territory_operation_once','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const lastDefenseUseMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1473_territory_last_defense_once'").first();
  if(!lastDefenseUseMarker){
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_last_defense_uses(
        round_id INTEGER NOT NULL,side TEXT NOT NULL,front_id INTEGER,activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(round_id,side)
      )`),
      env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_last_defense_uses(round_id,side,front_id,activated_at)
        SELECT round_id,last_defense_side,id,COALESCE(started_at,created_at,CURRENT_TIMESTAMP)
        FROM territory_war_v3_fronts
        WHERE last_defense_side IN ('A','B')
        ORDER BY sequence ASC`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1473_territory_last_defense_once','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const siegeSnapshotRewardMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1474_territory_siege_snapshot_reward'").first();
  if(!siegeSnapshotRewardMarker){
    await addColumnIfMissing(env,'territory_war_v3_rewards','siege_snapshot_bonus_coin','INTEGER NOT NULL DEFAULT 0');
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1474_territory_siege_snapshot_reward','1',CURRENT_TIMESTAMP)").run();
  }
  const siegeParticipationCubeMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1475_territory_participation_cube_reward'").first();
  if(!siegeParticipationCubeMarker){
    await addColumnIfMissing(env,'territory_war_v3_rewards','premium_cube_quantity','INTEGER NOT NULL DEFAULT 0');
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM REWARD CUBE','MA·FUR·LIMITED 등급 카드가 등장하는 최고급 보상 큐브입니다.','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',30,1)"),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1475_territory_participation_cube_reward','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const participationItemRewardMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1916_territory_100_attack_inventory_reward'").first();
  if(!participationItemRewardMarker){
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('SCRAPYARD_ENTRY_TICKET','폐차장 출입 허가증','SALVAGE ACCESS PASS','망각의 기계 폐차장에 1회 입장할 수 있는 금속 출입 허가증입니다. 입장 시 1장이 차감됩니다.','ENTRY_TICKET','EPIC','assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png',166700,1)"),
      env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('STARLIGHT_ARMOR_CORE','미스틱 에너지','MYSTIC ENERGY','미스틱 장비 제작에 투입되는 고밀도 결정 에너지입니다. 직접 사용할 수 없는 제작 재료입니다.','MATERIAL','MYTHIC','assets/items/starlight-armor-core-v1749.png',174900,1)"),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1916_territory_100_attack_inventory_reward','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const massAssaultMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1535_territory_mass_assault'").first();
  if(!massAssaultMarker){
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_mass_assaults(round_id INTEGER PRIMARY KEY,front_id INTEGER NOT NULL,side TEXT NOT NULL,target_side TEXT NOT NULL,damage INTEGER NOT NULL,hp_before INTEGER NOT NULL,hp_after INTEGER NOT NULL,admin_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1535_territory_mass_assault','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const massAssaultPerTeamMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1915_territory_mass_assault_per_team'").first(),massAssaultPerTeamReady=await tableExists(env,'territory_war_v3_mass_assault_uses'),legacyMassAssaultReady=await tableExists(env,'territory_war_v3_mass_assaults');
  if(!massAssaultPerTeamMarker||!massAssaultPerTeamReady){
    const markerStatement=env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1915_territory_mass_assault_per_team','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
    if(env.DB.dialect==='postgres'&&typeof env.DB.execSchema==='function'){
      await env.DB.execSchema([
        `CREATE TABLE IF NOT EXISTS territory_war_v3_mass_assault_uses(
          round_id BIGINT NOT NULL,side TEXT NOT NULL,front_id BIGINT NOT NULL,target_side TEXT NOT NULL,
          damage BIGINT NOT NULL,hp_before BIGINT NOT NULL,hp_after BIGINT NOT NULL,admin_id BIGINT NOT NULL,
          created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
          PRIMARY KEY(round_id,side)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_twv3_mass_assault_uses_round ON territory_war_v3_mass_assault_uses(round_id,side)'
      ]);
      if(legacyMassAssaultReady)await env.DB.prepare(`INSERT INTO territory_war_v3_mass_assault_uses(round_id,side,front_id,target_side,damage,hp_before,hp_after,admin_id,created_at)
        SELECT round_id,side,front_id,target_side,damage,hp_before,hp_after,admin_id,created_at FROM territory_war_v3_mass_assaults
        WHERE side IN ('A','B') ON CONFLICT(round_id,side) DO NOTHING`).run();
      await markerStatement.run();
    }else{
      const statements=[
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_mass_assault_uses(
          round_id INTEGER NOT NULL,side TEXT NOT NULL,front_id INTEGER NOT NULL,target_side TEXT NOT NULL,
          damage INTEGER NOT NULL,hp_before INTEGER NOT NULL,hp_after INTEGER NOT NULL,admin_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,side)
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_mass_assault_uses_round ON territory_war_v3_mass_assault_uses(round_id,side)')
      ];
      if(legacyMassAssaultReady)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_mass_assault_uses(round_id,side,front_id,target_side,damage,hp_before,hp_after,admin_id,created_at)
        SELECT round_id,side,front_id,target_side,damage,hp_before,hp_after,admin_id,created_at FROM territory_war_v3_mass_assaults WHERE side IN ('A','B')`));
      statements.push(markerStatement);await env.DB.batch(statements);
    }
  }
  const truceMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1537_territory_truce'").first();
  if(!truceMarker){
    await addColumnIfMissing(env,'territory_war_v3_rounds','truce_ends_at','TEXT');
    await addColumnIfMissing(env,'territory_war_v3_rounds','truce_started_by','INTEGER');
    await addColumnIfMissing(env,'territory_war_v3_users','loadout_refreshed_at','TEXT');
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1537_territory_truce','1',CURRENT_TIMESTAMP)").run();
  }
  const loadoutSnapshotMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1538_territory_loadout_snapshot'").first();
  if(!loadoutSnapshotMarker){await addColumnIfMissing(env,'territory_war_v3_users','loadout_bonus_json','TEXT');await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1538_territory_loadout_snapshot','1',CURRENT_TIMESTAMP)").run()}
  const truceDurationMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1539_territory_truce_duration'").first();
  if(!truceDurationMarker){await addColumnIfMissing(env,'territory_war_v3_rounds','truce_duration_minutes','INTEGER');await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1539_territory_truce_duration','1',CURRENT_TIMESTAMP)").run()}
  const participationBalanceMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1647_territory_participation_balance'").first();
  if(!participationBalanceMarker){
    for(const [column,definition] of [
      ['balance_previous_round_id','INTEGER'],['balance_previous_side','TEXT'],['balance_previous_result','TEXT'],['balance_previous_attacks','INTEGER NOT NULL DEFAULT 0']
    ])await addColumnIfMissing(env,'territory_war_v3_users',column,definition);
    for(const [column,definition] of [
      ['base_result_coin','INTEGER NOT NULL DEFAULT 0'],['attack_reward_percent','INTEGER NOT NULL DEFAULT 0'],['attack_adjusted_coin','INTEGER NOT NULL DEFAULT 0']
    ])await addColumnIfMissing(env,'territory_war_v3_rewards',column,definition);
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1647_territory_participation_balance','1',CURRENT_TIMESTAMP)").run();
  }
  const comprehensiveBalanceMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1702_territory_comprehensive_balance'").first();
  if(!comprehensiveBalanceMarker){
    for(const [column,definition] of [
      ['formation_power','INTEGER NOT NULL DEFAULT 0'],['formation_breakdown_json',"TEXT NOT NULL DEFAULT '{}'"],
      ['balance_history_rounds','INTEGER NOT NULL DEFAULT 0'],['balance_history_active_rounds','INTEGER NOT NULL DEFAULT 0'],['balance_history_participation_weight','INTEGER NOT NULL DEFAULT 0'],
      ['balance_history_weighted_attacks','INTEGER NOT NULL DEFAULT 0'],['balance_history_win_weight','INTEGER NOT NULL DEFAULT 0'],
      ['balance_history_loss_weight','INTEGER NOT NULL DEFAULT 0']
    ])await addColumnIfMissing(env,'territory_war_v3_users',column,definition);
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1702_territory_comprehensive_balance','1',CURRENT_TIMESTAMP)").run();
  }
  const loadIndexMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1471_territory_load_indexes'").first();
  if(!loadIndexMarker){
    await env.DB.batch([
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_users_rank ON territory_war_v3_users(round_id,damage DESC,attacks DESC,user_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_actions_feed ON territory_war_v3_actions(round_id,status,id DESC)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1471_territory_load_indexes','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const userActionIndexMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1674_territory_user_action_index'").first();
  if(!userActionIndexMarker){
    await env.DB.batch([
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_actions_user_status ON territory_war_v3_actions(round_id,user_id,status)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1674_territory_user_action_index','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const recruitmentSyncMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_repair_v1629_territory_recruitment_hours'").first();
  if(!recruitmentSyncMarker){
    const raw=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first(),configured={...DEFAULTS,...safeJson(raw?.value,{})},round=await env.DB.prepare("SELECT id,created_at FROM territory_war_v3_rounds WHERE status='RECRUITING' ORDER BY id DESC LIMIT 1").first(),statements=[];
    if(round){const createdAt=sqlMs(round.created_at),endsAt=iso((Number.isFinite(createdAt)?createdAt:Date.now())+clampInt(configured.recruitmentHours,1,168,DEFAULTS.recruitmentHours)*3600000);statements.push(env.DB.prepare("UPDATE territory_war_v3_rounds SET recruitment_ends_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'").bind(endsAt,round.id))}
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_repair_v1629_territory_recruitment_hours','1',CURRENT_TIMESTAMP)"));await env.DB.batch(statements);
  }
  const recruitmentFromNowMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_repair_v1630_territory_recruitment_from_now'").first();
  if(!recruitmentFromNowMarker){
    const raw=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first(),configured={...DEFAULTS,...safeJson(raw?.value,{})},round=await env.DB.prepare("SELECT id FROM territory_war_v3_rounds WHERE status='RECRUITING' ORDER BY id DESC LIMIT 1").first(),statements=[];
    if(round){const endsAt=iso(Date.now()+clampInt(configured.recruitmentHours,1,168,DEFAULTS.recruitmentHours)*3600000);statements.push(env.DB.prepare("UPDATE territory_war_v3_rounds SET recruitment_ends_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'").bind(endsAt,round.id))}
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_repair_v1630_territory_recruitment_from_now','1',CURRENT_TIMESTAMP)"));await env.DB.batch(statements);
  }
  const roundEquipmentRewardMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1737_territory_round_equipment_rewards'").first();
  if(!roundEquipmentRewardMarker){
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_round_equipment_rewards(
        round_id INTEGER NOT NULL,equipment_id INTEGER NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,
        result_scope TEXT NOT NULL DEFAULT 'WIN',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,equipment_id,result_scope)
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_round_equipment_reward_round ON territory_war_v3_round_equipment_rewards(round_id,result_scope,equipment_id)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1737_territory_round_equipment_rewards','1',CURRENT_TIMESTAMP)")
    ]);
  }
  const commandWarfareMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1811_territory_command_warfare'").first(),commandMessagesTableReady=await tableExists(env,'territory_war_v3_command_messages');
  // D1 -> PostgreSQL 이관 시 app_meta 마커만 복사되고 후속 테이블이 빠진 사례를 복구한다.
  // 마커가 있어도 실제 relation이 없으면 반드시 다시 생성한다.
  if(!commandWarfareMarker||!commandMessagesTableReady){
    try{
      const markerStatement=env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1811_territory_command_warfare','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
      if(env.DB.dialect==='postgres'&&typeof env.DB.execSchema==='function'){
        await env.DB.execSchema([
          `CREATE TABLE IF NOT EXISTS territory_war_v3_command_messages(
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,round_id BIGINT NOT NULL,user_id BIGINT NOT NULL,side TEXT NOT NULL,
            message TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')
          )`,
          'CREATE INDEX IF NOT EXISTS idx_twv3_command_messages_round ON territory_war_v3_command_messages(round_id,id DESC)',
          'CREATE INDEX IF NOT EXISTS idx_twv3_command_messages_sender ON territory_war_v3_command_messages(round_id,user_id,id DESC)'
        ]);
        await markerStatement.run();
      }else{
        await env.DB.batch([
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_command_messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT,round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,side TEXT NOT NULL,
            message TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`),
          env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_command_messages_round ON territory_war_v3_command_messages(round_id,id DESC)'),
          env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_command_messages_sender ON territory_war_v3_command_messages(round_id,user_id,id DESC)'),
          markerStatement
        ]);
      }
    }catch(error){
      // 지휘 메시지는 부가 기능이다. 복구 DDL이 일시 실패해도 편성/전투/정산은 계속 동작해야 한다.
      console.error('영토전 지휘 메시지 테이블 자동 복구 실패',error);
    }
  }
  const commanderOverrideMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1914_territory_commander_overrides'").first(),commanderOverridesTableReady=await tableExists(env,'territory_war_v3_commander_overrides');
  if(!commanderOverrideMarker||!commanderOverridesTableReady){
    try{
      const markerStatement=env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1914_territory_commander_overrides','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
      if(env.DB.dialect==='postgres'&&typeof env.DB.execSchema==='function'){
        await env.DB.execSchema([
          `CREATE TABLE IF NOT EXISTS territory_war_v3_commander_overrides(
            round_id BIGINT NOT NULL,side TEXT NOT NULL,user_id BIGINT NOT NULL,assigned_by BIGINT NOT NULL,
            created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
            updated_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY(round_id,side)
          )`,
          'CREATE INDEX IF NOT EXISTS idx_twv3_commander_overrides_user ON territory_war_v3_commander_overrides(round_id,user_id)'
        ]);
        await markerStatement.run();
      }else{
        await env.DB.batch([
          env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_war_v3_commander_overrides(
            round_id INTEGER NOT NULL,side TEXT NOT NULL,user_id INTEGER NOT NULL,assigned_by INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(round_id,side)
          )`),
          env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_twv3_commander_overrides_user ON territory_war_v3_commander_overrides(round_id,user_id)'),
          markerStatement
        ]);
      }
    }catch(error){
      console.error('영토전 지정 지휘관 테이블 자동 복구 실패',error);
    }
  }
  await repairWaterBuffaloSettlementV1443(env);
  await recoverWrongWinnerOverpaymentV1444(env);
  await grantLatestWinnerMasterStarsV1956(env);
  foundationReady=true;
}

async function settings(env){
  if(settingsCacheValue&&Date.now()<settingsCacheExpiresAt)return settingsCacheValue;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first();
  settingsCacheValue={...DEFAULTS,...safeJson(row?.value,{})};settingsCacheExpiresAt=Date.now()+5000;return settingsCacheValue;
}
function invalidateSettingsCache(){settingsCacheValue=null;settingsCacheExpiresAt=0}
async function latestRound(env){return env.DB.prepare('SELECT * FROM territory_war_v3_rounds ORDER BY id DESC LIMIT 1').first()}
async function roundById(env,id){return env.DB.prepare('SELECT * FROM territory_war_v3_rounds WHERE id=?').bind(id).first()}
async function activeFront(env,round){if(!round?.current_front_id)return null;return env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(round.current_front_id).first()}
async function roundEquipmentBonuses(env,roundId,resultScope='WIN'){
  if(!Number(roundId)||String(resultScope||'').toUpperCase()!=='WIN')return[];
  const rows=(await env.DB.prepare(`SELECT r.equipment_id,r.quantity,r.result_scope,i.code,i.name,i.rarity,i.slot,i.image_url
    FROM territory_war_v3_round_equipment_rewards r
    JOIN character_equipment_items i ON i.id=r.equipment_id
    WHERE r.round_id=? AND r.result_scope='WIN' AND r.quantity>0
    ORDER BY r.equipment_id`).bind(roundId).all()).results||[];
  return rows.map(row=>({...row,quantity:Math.max(0,Number(row.quantity||0)),image_url:String(row.image_url||'').replace(/\\/g,'/')}));
}
function truceState(round){const endsAt=round?.truce_ends_at||null,active=Boolean(round?.status==='ACTIVE'&&sqlMs(endsAt)>Date.now()),minutes=clampInt(round?.truce_duration_minutes,1,360,15);return{active,endsAt:active?endsAt:null,minutes,canRefresh:active}}
function comebackState(round,cfg=DEFAULTS,front=null){
  const rules=balanceRules(round,cfg),revisitThreshold=Math.max(1,Number(rules.antiPingPongRevisitThreshold||3));
  if(Number(front?.revisit_count||0)>=revisitThreshold)return{active:false,tier:0,losingSide:null,morale:0,damageBonusPercent:0,defeatSiegePercent:0,title:'장기 교착 해소'};
  const index=Math.max(0,Math.min(8,Number(round?.current_front_index??4))),distance=Math.abs(index-4);
  if(!distance)return{active:false,tier:0,losingSide:null,morale:0,damageBonusPercent:0,defeatSiegePercent:Number(rules.defeatSiegeDamagePercent||0),title:'전선 균형'};
  const tier=Math.min(4,distance),losingSide=index>4?'B':'A',titles=['','전열 재정비','저항선 구축','결사항전','최후의 반격'];
  return{active:true,tier,losingSide,morale:tier*25,damageBonusPercent:tier*Number(rules.comebackDamagePerTierPercent||0),defeatSiegePercent:Number(rules.defeatSiegeDamagePercent||0),title:titles[tier],frontIndex:index};
}
const OPERATIONS=Object.freeze({
  ASSAULT:{name:'총공세',icon:'01',category:'OFFENSE',summary:'공성 피해 +25%',description:'전선 전 병력을 결집해 10분간 공성 피해를 증폭합니다.',counter:'IRON_WALL',asset:'assets/ui/territory-war/siege-front-v1-v1497.webp'},
  INFILTRATION:{name:'기습 침투',icon:'02',category:'OFFENSE',summary:'적 최대 HP 12% 교란',description:'특수부대가 적 방어망을 우회해 공성 HP를 즉시 감소시킵니다.',counter:'',asset:'assets/ui/territory-war/recruit-fortress-v1-v1497.webp'},
  CARPET_BOMBING:{name:'융단폭격',icon:'03',category:'OFFENSE',summary:'적 최대 HP 10% 폭격',description:'전 폭격 편대를 투입해 적 전선에 광역 공습을 가합니다.',counter:'AIR_DEFENSE',asset:'assets/ui/territory-war/carpet-bombing-v1811.webp'},
  SPG_BARRAGE:{name:'자주포 포격',icon:'04',category:'OFFENSE',summary:'공성 피해 +35%',description:'자주포대가 10분간 정밀 포격 지원을 제공합니다.',counter:'COUNTER_BATTERY',asset:'assets/ui/territory-war/spg-barrage-v1811.webp'},
  IRON_WALL:{name:'철벽 방어',icon:'05',category:'DEFENSE',summary:'HP 20% 복구 · 피해 -25%',description:'손상된 성벽을 긴급 복구하고 방어선을 강화합니다.',counter:'ASSAULT',asset:'assets/ui/territory-war/recruit-fortress-v1-v1497.webp'},
  AIR_DEFENSE:{name:'통합 대공망',icon:'06',category:'DEFENSE',summary:'피해 -12% · 폭격 75% 요격',description:'레이더와 요격 포대를 전개해 공습과 일반 공성 피해를 억제합니다.',counter:'CARPET_BOMBING',asset:'assets/ui/territory-war/air-defense-v1811.webp'},
  COUNTER_BATTERY:{name:'대포병 반격',icon:'07',category:'COUNTER',summary:'포격 억제 · 방어 반격 충전',description:'적 포격 원점을 역추적해 자주포 효율을 낮추고 반격 게이지를 확보합니다.',counter:'SPG_BARRAGE',asset:'assets/ui/territory-war/counter-battery-v1811.webp'},
  REGROUP:{name:'긴급 재편',icon:'08',category:'SUPPORT',summary:'전원 행동력 +3',description:'보급선과 부상 병력을 재정비해 진영 전체 행동력을 회복합니다.',counter:'',asset:'assets/ui/territory-war/truce-v1811.webp'}
});
function lastDefenseSide(index){return Number(index)===1?'A':Number(index)===7?'B':null}
function sideField(side,suffix){return `${String(side).toLowerCase()}_${suffix}`}
function configuredTeamLabel(cfg,side){const name=String(side==='A'?cfg?.teamAName||'A 진영':side==='B'?cfg?.teamBName||'B 진영':'미배정').trim();return /(팀|진영)$/.test(name)?name:`${name}팀`}
function activeOperation(round,side){const code=String(round?.[sideField(side,'operation')]||''),endsAt=round?.[sideField(side,'operation_ends_at')]||null,active=Boolean(code&&sqlMs(endsAt)>Date.now());return{code:active?code:'',name:active?OPERATIONS[code]?.name||code:'',endsAt:active?endsAt:null,active}}
function fatigueState(round,front,cfg=DEFAULTS){const side=String(front?.fatigued_side||''),percent=Math.max(0,Number(front?.fatigue_percent||0)),damagePenaltyPercent=Math.round(percent*Number(balanceRules(round,cfg).fatigueDamageRatio||0));return{active:Boolean(side&&percent),side,percent,damagePenaltyPercent,captureStreak:side?Number(round?.[sideField(side,'capture_streak')]||0):0}}
async function addNotice(env,roundId,type,side,title,message,payload={}){await env.DB.prepare('INSERT INTO territory_war_v3_notices(round_id,type,side,title,message,payload_json) VALUES(?,?,?,?,?,?)').bind(roundId,type,side||null,title,message,JSON.stringify(payload)).run()}
async function commandersForRound(env,roundId){
  const selectAuto=side=>env.DB.prepare(`SELECT w.user_id,w.side,w.damage,w.attacks,w.defense_wins,w.front_finishes,w.counter_contribution,u.nickname,
    (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) command_score
    FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id
    WHERE w.round_id=? AND w.side=? AND w.status='ACTIVE' AND (w.attacks>0 OR w.defense_wins>0)
    ORDER BY command_score DESC,w.attacks DESC,w.user_id LIMIT 1`).bind(roundId,side).first();
  const selectOverride=side=>env.DB.prepare(`SELECT w.user_id,w.side,w.damage,w.attacks,w.defense_wins,w.front_finishes,w.counter_contribution,u.nickname,
    (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) command_score,1 manual_override
    FROM territory_war_v3_commander_overrides o
    JOIN territory_war_v3_users w ON w.round_id=o.round_id AND w.user_id=o.user_id AND w.side=o.side AND w.status='ACTIVE'
    JOIN users u ON u.id=w.user_id
    WHERE o.round_id=? AND o.side=? LIMIT 1`).bind(roundId,side).first();
  let assigned={A:null,B:null};
  try{const[a,b]=await Promise.all([selectOverride('A'),selectOverride('B')]);assigned={A:a||null,B:b||null}}
  catch(error){if(!missingTableError(error,'territory_war_v3_commander_overrides'))throw error}
  const[a,b]=await Promise.all([assigned.A?null:selectAuto('A'),assigned.B?null:selectAuto('B')]);
  return{A:assigned.A||a||null,B:assigned.B||b||null};
}
async function commandMessagesForRound(env,roundId){
  try{
    const rows=await env.DB.prepare(`SELECT m.id,m.side,m.message,m.created_at,m.user_id,u.nickname
      FROM territory_war_v3_command_messages m JOIN users u ON u.id=m.user_id
      WHERE m.round_id=? ORDER BY m.id DESC LIMIT 24`).bind(roundId).all();
    return(rows.results||[]).reverse();
  }catch(error){
    if(missingTableError(error,'territory_war_v3_command_messages'))return[];
    throw error;
  }
}
async function sendCommanderMessage(env,deps,user,cfg,body){
  const round=await lifecycle(env,cfg);if(!round||round.status!=='ACTIVE')return deps.json({error:'진행 중인 영토전에서만 지휘 통신을 보낼 수 있습니다.'},409);
  const mine=await env.DB.prepare("SELECT side,status FROM territory_war_v3_users WHERE round_id=? AND user_id=?").bind(round.id,user.id).first();
  if(!mine?.side||mine.status!=='ACTIVE')return deps.json({error:'활성 영토전 참가자만 지휘 통신을 사용할 수 있습니다.'},403);
  const commanders=await commandersForRound(env,round.id),commander=commanders[mine.side];
  if(Number(commander?.user_id||0)!==Number(user.id))return deps.json({error:'현재 지정된 진영 지휘관만 전장 메시지를 보낼 수 있습니다.'},403);
  const message=cleanLabel(body?.message,'',100);if(message.length<2)return deps.json({error:'지휘 메시지는 2자 이상 입력하세요.'},400);
  const latest=await env.DB.prepare('SELECT created_at FROM territory_war_v3_command_messages WHERE round_id=? AND user_id=? ORDER BY id DESC LIMIT 1').bind(round.id,user.id).first();
  if(latest&&Date.now()-sqlMs(latest.created_at)<10000)return deps.json({error:'지휘 통신은 10초마다 보낼 수 있습니다.'},429);
  await env.DB.prepare('INSERT INTO territory_war_v3_command_messages(round_id,user_id,side,message) VALUES(?,?,?,?)').bind(round.id,user.id,mine.side,message).run();
  publicStateSharedCache=null;
  return deps.json({ok:true,message,state:await publicState(env,user.id)});
}
function massAssaultPreview(round,front,cfg,used=null,requestedSide=''){
  if(!round||round.status!=='ACTIVE'||!front||front.status!=='ACTIVE')return{available:false,reason:'현재 진행 중인 전선이 없습니다.',used:false};
  const frontIndex=Math.max(0,Math.min(8,Number(round.current_front_index??front.node_index??4))),explicitSide=String(requestedSide||'').toUpperCase(),hasExplicitSide=['A','B'].includes(explicitSide);
  if(!hasExplicitSide&&frontIndex===4)return{available:false,reason:'발동할 진영을 선택하세요.',used:false,frontIndex};
  const side=hasExplicitSide?explicitSide:frontIndex<4?'A':'B',targetSide=side==='A'?'B':'A',teamName=configuredTeamLabel(cfg,side),targetName=configuredTeamLabel(cfg,targetSide),uses=Array.isArray(used)?used:used?[used]:[],usedRecord=uses.find(row=>String(row?.side||'').toUpperCase()===side)||null;
  if(usedRecord)return{...usedRecord,available:false,reason:`${teamName}은 이번 회차의 인해전술을 이미 발동했습니다.`,used:true,side,targetSide,frontIndex,frontDepth:Math.abs(frontIndex-4),teamName,targetName};
  const targetHp=Number(targetSide==='A'?front.a_hp:front.b_hp),targetMax=Number(targetSide==='A'?front.a_max_hp:front.b_max_hp),percent=clampInt(cfg?.massAssaultDamagePercent,1,90,39),damage=Math.max(0,Math.min(Math.max(1,Math.round(targetMax*percent/100)),targetHp-1));
  return{available:damage>0,reason:damage>0?'':'상대 진영 공성 HP가 남아 있지 않습니다.',used:false,side,targetSide,frontIndex,frontDepth:Math.abs(frontIndex-4),damage,targetHp,hpAfter:targetHp-damage,teamName,targetName,percent};
}
async function executeMassAssault(env,deps,user,cfg,operationKey,requestedSideInput){
  const requestedSide=String(requestedSideInput||'').toUpperCase();if(!['A','B'].includes(requestedSide))return deps.json({error:'인해전술을 발동할 진영을 선택하세요.'},400);
  const round=await lifecycle(env,cfg),front=await activeFront(env,round);if(!round||!front)return deps.json({error:'현재 진행 중인 영토전 전선이 없습니다.'},409);const lock=await acquireLock(env,`mass_assault_${round.id}_${requestedSide}`,60000);if(!lock.ok)return deps.json({error:`${configuredTeamLabel(cfg,requestedSide)} 인해전술 발동 요청을 처리 중입니다.`},409);
  try{const used=await env.DB.prepare('SELECT * FROM territory_war_v3_mass_assault_uses WHERE round_id=? AND side=?').bind(round.id,requestedSide).first(),preview=massAssaultPreview(round,front,cfg,used,requestedSide);if(!preview.available)return deps.json({error:preview.reason||'인해전술을 발동할 수 없습니다.',massAssault:preview},409);const reserve=await reserveAdminOperation(env,operationKey,`MASS_ASSAULT_${requestedSide}`,round.id,user.id);if(reserve.response)return deps.json(reserve.response);if(reserve.pending)return deps.json({error:'동일한 인해전술 요청을 처리 중입니다.'},409);if(reserve.conflict)return deps.json({error:'다른 작업에서 사용한 요청 키입니다.'},409);
    const hpColumn=preview.targetSide==='A'?'a_hp':'b_hp',damageColumn=preview.side==='A'?'a_total_damage':'b_total_damage';await env.DB.batch([env.DB.prepare(`UPDATE territory_war_v3_fronts SET ${hpColumn}=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE' AND ${hpColumn}=?`).bind(preview.hpAfter,front.id,preview.targetHp),env.DB.prepare(`UPDATE territory_war_v3_rounds SET ${damageColumn}=${damageColumn}+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(preview.damage,round.id),env.DB.prepare('INSERT INTO territory_war_v3_mass_assault_uses(round_id,side,front_id,target_side,damage,hp_before,hp_after,admin_id) VALUES(?,?,?,?,?,?,?,?)').bind(round.id,preview.side,front.id,preview.targetSide,preview.damage,preview.targetHp,preview.hpAfter,user.id)]);
    await addNotice(env,round.id,'MASS_ASSAULT',preview.side,'인해전술 선포',`${preview.teamName}을 지원하는 대규모 증원군이 투입되어 ${preview.targetName} 공성 HP에 ${preview.damage.toLocaleString()} 피해를 입혔습니다.`,{operation:'MASS_ASSAULT',frontId:front.id,targetSide:preview.targetSide,damage:preview.damage,hpBefore:preview.targetHp,hpAfter:preview.hpAfter,image:'assets/ui/territory-war/mass-assault-v1811.webp'});publicStateSharedCache=null;const response={ok:true,massAssault:{...preview,roundId:round.id,frontId:front.id},state:await publicState(env,user.id,true)};await completeAdmin(env,operationKey,response);if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'TERRITORY_MASS_ASSAULT','TERRITORY_WAR_ROUND',`${round.id}:${preview.side}`,null,response.massAssault);return deps.json(response);
  }catch(error){await failAdmin(env,operationKey,error);return deps.json({error:error.message||'인해전술 발동에 실패했습니다.'},409)}finally{await releaseLock(env,lock)}}

function snapshotIds(value){const items=safeJson(value,[]);return Array.isArray(items)?items.map(item=>String(item&&typeof item==='object'?(item.id??item.card_id??''):item)).filter(Boolean).slice(0,5):[]}
const MAGIC_FORMATION_WEIGHTS=Object.freeze({OPENING_ATTACK:1,GUARD_BARRIER:1,LIFE_AMPLIFY:1,CRISIS_HEAL:.9,PUNISH_TRAP:1,ARCANE_COUNTER:1.1,FOLLOWUP_HASTE:1,ARCANE_SEAL:.9,DOOM_MARK:1.05,SHIELD_SIPHON:1,TIME_DISTORTION:.9,PHOENIX_REVIVE:1.25,PURIFY_LIGHT:.75,CHAIN_ECHO:1.05});
function magicFormationPercent(cards=[]){
  const total=(Array.isArray(cards)?cards:[]).reduce((sum,card)=>{const chance=clamp(Number(card?.triggerChance||0),0,100,0)/100,value=clamp(Number(card?.effectValue||0),0,500,0),activations=clampInt(card?.maxActivations,1,3,1),weight=Number(MAGIC_FORMATION_WEIGHTS[String(card?.effectType||'').toUpperCase()]||.8);return sum+chance*value*Math.sqrt(activations)*weight},0);
  return Number(Math.min(45,total).toFixed(3));
}
function buildFormationSnapshot({cards=[],uniqueState=null,synergy=null,loadoutBonus=null,magicLoadout=null,fallbackPower=0}={}){
  const rawCardPower=Math.max(0,cards.reduce((sum,card)=>sum+Number(card?.power||0),0)),deckComplete=cards.length===5,cardBasePower=deckComplete?rawCardPower:Math.max(rawCardPower,Number(fallbackPower||0)),uniqueEffectPower=Math.max(0,deckComplete?Number(uniqueState?.power??cardBasePower):cardBasePower),synergyAttackPercent=clamp(Number(synergy?.totals?.attackPercent||0),-90,300,0),deckSynergyPower=Math.max(0,Math.round(uniqueEffectPower*(1+synergyAttackPercent/100))),equipment=loadoutBonus&&typeof loadoutBonus==='object'?loadoutBonus:{pvp:0},characterPower=Math.max(0,Number(equipment.pvp||0)),magicCards=Array.isArray(magicLoadout?.cards)?magicLoadout.cards:[],magicPercent=magicFormationPercent(magicCards),preMagicPower=deckSynergyPower+characterPower,magicPower=Math.max(0,Math.round(preMagicPower*magicPercent/100)),formationPower=Math.max(1,preMagicPower+magicPower);
  const breakdown={version:2,deckComplete,cardBasePower,uniqueEffectPower,uniqueEffectBonus:uniqueEffectPower-cardBasePower,synergyAttackPercent,deckSynergyPower,deckSynergyBonus:deckSynergyPower-uniqueEffectPower,equipmentPower:Number(equipment.equipmentPvp||0),vehiclePower:Number(equipment.garagePvp||0),titlePower:Number(equipment.titlePvp||0),characterPower,magicCardCount:magicCards.length,magicExpectedPercent:magicPercent,magicPower,formationPower};
  return {formationPower,breakdown,loadoutBonus:{...equipment,magicEnabled:magicLoadout?.enabled===true,magicCards,formation:breakdown}};
}
async function singleFormationSnapshot(env,deps,user,deck,battle){
  const cards=(Array.isArray(deck)?deck:[]).map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)})),ids=cards.map(card=>String(card.id));
  const uniquePromise=typeof deps.cardUniqueDeckStates==='function'?deps.cardUniqueDeckStates(env,[{user,cards}],'PVP'):Promise.resolve([{power:cards.reduce((sum,card)=>sum+Number(card.power||0),0)}]);
  const synergyPromise=typeof deps.evaluateDeckSynergiesBatch==='function'?deps.evaluateDeckSynergiesBatch(env,[{user,deckIds:ids}],'PVP').then(rows=>rows[0]):typeof deps.evaluateDeckSynergies==='function'?deps.evaluateDeckSynergies(env,user,ids,'PVP',{forceOwnerTest:String(user?.role||'').toUpperCase()==='OWNER'}):Promise.resolve({totals:{attackPercent:0}});
  const magicPromise=typeof deps.magicBattleLoadouts==='function'?deps.magicBattleLoadouts(env,[user],'PVP').then(rows=>rows[0]):typeof deps.magicBattleLoadout==='function'?deps.magicBattleLoadout(env,user,'PVP'):Promise.resolve({enabled:false,cards:[]});
  const [loadoutBonus,uniqueStates,synergy,magicLoadout]=await Promise.all([typeof deps.userEquipmentBonuses==='function'?deps.userEquipmentBonuses(env,user.id):Promise.resolve({pvp:0}),uniquePromise,synergyPromise,magicPromise]);
  return buildFormationSnapshot({cards,uniqueState:uniqueStates[0],synergy,loadoutBonus,magicLoadout});
}
async function formationDecks(env,deps,users,battle){
  const byKey=new Map();if(!users.length)return new Map();
  // Keep the five snapshotted ids as the outer loop. This avoids both a large
  // IN list and a full owned-card scan when a round has hundreds of applicants.
  const rows=(await env.DB.prepare(`SELECT w.user_id,c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.focus_x,c.focus_y,m.name,uc.breakthrough_level FROM territory_war_v3_users w CROSS JOIN json_each(CASE WHEN json_valid(w.deck_snapshot) THEN w.deck_snapshot ELSE '[]' END) j CROSS JOIN cards_effective_v1210 c CROSS JOIN user_cards uc JOIN members m ON m.id=c.member_id WHERE w.round_id=? AND c.id=CAST(j.value AS TEXT) AND uc.user_id=w.user_id AND uc.card_id=c.id AND COALESCE(uc.quantity,0)>0`).bind(Number(users[0].round_id||0)).all()).results||[];
  for(const card of rows)byKey.set(`${Number(card.user_id)}:${String(card.id)}`,card);
  const result=new Map();
  for(const row of users){const cards=snapshotIds(row.deck_snapshot).map(id=>byKey.get(`${Number(row.user_id)}:${id}`)).filter(Boolean).map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)}));result.set(Number(row.user_id),cards)}
  return result;
}
async function refreshFormationSnapshots(env,deps,roundId,users,battle){
  const deckMap=await formationDecks(env,deps,users,battle),entries=users.map(row=>({user:{id:Number(row.user_id),nickname:String(row.nickname||''),role:String(row.role||'USER')},cards:deckMap.get(Number(row.user_id))||[]}));
  const uniqueStates=typeof deps.cardUniqueDeckStates==='function'?await deps.cardUniqueDeckStates(env,entries,'PVP'):entries.map(entry=>({power:entry.cards.reduce((sum,card)=>sum+Number(card.power||0),0)}));
  const synergyEntries=entries.map(entry=>({user:entry.user,deckIds:entry.cards.map(card=>String(card.id))})),synergies=typeof deps.evaluateDeckSynergiesBatch==='function'?await deps.evaluateDeckSynergiesBatch(env,synergyEntries,'PVP'):await Promise.all(synergyEntries.map(entry=>typeof deps.evaluateDeckSynergies==='function'?deps.evaluateDeckSynergies(env,entry.user,entry.deckIds,'PVP',{forceOwnerTest:String(entry.user.role||'').toUpperCase()==='OWNER'}):Promise.resolve({totals:{attackPercent:0}})));
  const missingMagicUsers=[],storedMagic=new Map();
  for(const row of users){const saved=safeJson(row.loadout_bonus_json,{pvp:0});if(Array.isArray(saved.magicCards))storedMagic.set(Number(row.user_id),{enabled:saved.magicEnabled===true,cards:saved.magicCards});else missingMagicUsers.push({id:Number(row.user_id),nickname:String(row.nickname||''),role:String(row.role||'USER')})}
  if(missingMagicUsers.length){const loads=typeof deps.magicBattleLoadouts==='function'?await deps.magicBattleLoadouts(env,missingMagicUsers,'PVP'):await Promise.all(missingMagicUsers.map(user=>typeof deps.magicBattleLoadout==='function'?deps.magicBattleLoadout(env,user,'PVP'):Promise.resolve({enabled:false,cards:[]})));missingMagicUsers.forEach((user,index)=>storedMagic.set(Number(user.id),loads[index]))}
  const statements=[],refreshed=[];
  users.forEach((row,index)=>{const cards=entries[index].cards,loadoutBonus=safeJson(row.loadout_bonus_json,{pvp:0}),snapshot=buildFormationSnapshot({cards,uniqueState:uniqueStates[index],synergy:synergies[index],loadoutBonus,magicLoadout:storedMagic.get(Number(row.user_id)),fallbackPower:Number(row.deck_power||0)});refreshed.push({...row,deck_power:snapshot.formationPower,formation_power:snapshot.formationPower,formation_breakdown_json:JSON.stringify(snapshot.breakdown),loadout_bonus_json:JSON.stringify(snapshot.loadoutBonus)});statements.push(env.DB.prepare('UPDATE territory_war_v3_users SET deck_power=?,formation_power=?,formation_breakdown_json=?,loadout_bonus_json=?,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?').bind(snapshot.formationPower,snapshot.formationPower,JSON.stringify(snapshot.breakdown),JSON.stringify(snapshot.loadoutBonus),roundId,row.user_id))});
  await batchChunks(env,statements,40);return refreshed;
}
async function participantDeck(env,deps,row,battle){
  const ids=snapshotIds(row?.deck_snapshot),key=`${row?.round_id||0}:${row?.user_id||0}:${ids.join(',')}`,cached=participantDeckCache.get(key);
  if(cached&&Date.now()<cached.expiresAt)return cached.cards.map(card=>({...card}));
  let cards=ids.length===5&&typeof deps.pvpDeckSnapshotByIds==='function'?await deps.pvpDeckSnapshotByIds(env,row.user_id,ids):[];if(cards.length!==5)cards=await deps.pvpDeckSnapshot(env,row.user_id);
  const normalized=cards.map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)}));participantDeckCache.set(key,{cards:normalized,expiresAt:Date.now()+5000});
  if(participantDeckCache.size>300){const now=Date.now();for(const [cacheKey,value] of participantDeckCache){if(now>=value.expiresAt)participantDeckCache.delete(cacheKey);if(participantDeckCache.size<=220)break}}
  return normalized.map(card=>({...card}));
}
async function sideBalance(env,roundId){const row=await env.DB.prepare(`SELECT SUM(CASE WHEN side='A' THEN 1 ELSE 0 END) a_count,SUM(CASE WHEN side='B' THEN 1 ELSE 0 END) b_count,SUM(CASE WHEN side='A' THEN deck_power ELSE 0 END) a_power,SUM(CASE WHEN side='B' THEN deck_power ELSE 0 END) b_power FROM territory_war_v3_users WHERE round_id=? AND side IN ('A','B')`).bind(roundId).first();return{aCount:Number(row?.a_count||0),bCount:Number(row?.b_count||0),aPower:Number(row?.a_power||0),bPower:Number(row?.b_power||0)}}
function balancedSide(balance,power=0){if(balance.aPower<balance.bPower)return'A';if(balance.bPower<balance.aPower)return'B';if(balance.aCount<balance.bCount)return'A';if(balance.bCount<balance.aCount)return'B';return Number(power||0)%2===0?'A':'B'}
function pickPowerMatchedOpponent(candidates,attackerPower){
  const power=Math.max(1,Number(attackerPower||0)),ranked=(Array.isArray(candidates)?candidates:[]).map((row,index)=>({...row,_matchOrder:index,_powerGap:Math.abs(Number(row?.deck_power||0)-power)})).sort((a,b)=>a._powerGap-b._powerGap||a._matchOrder-b._matchOrder);
  if(!ranked.length)return null;
  // 가장 가까운 상대보다 2%p 이상 멀어지지 않는 선에서만 방어 횟수를 분산한다.
  // 근접 상대가 충분하면 5% 이내 풀, 극단 전투력 참가자는 양 진영 중 최인접 상대 풀을 사용한다.
  const closestGap=ranked[0]._powerGap,poolGap=Math.max(Math.ceil(power*.05),closestGap+Math.ceil(power*.02));
  const pool=ranked.filter(row=>row._powerGap<=poolGap);
  pool.sort((a,b)=>Number(a.defenses||0)-Number(b.defenses||0)||a._powerGap-b._powerGap||a._matchOrder-b._matchOrder);
  const chosen=pool[0],gapPercent=Math.round((chosen._powerGap/power)*10000)/100;
  const{_matchOrder,_powerGap,...opponent}=chosen;return{...opponent,match_power_gap:_powerGap,match_power_gap_percent:gapPercent,match_pool_size:pool.length};
}
function matchPowerScale(attackerPower,defenderPower,capPercent=15){
  const attacker=Math.max(1,Number(attackerPower||0)),defender=Math.max(1,Number(defenderPower||0)),cap=1+Math.max(0,Number(capPercent||0))/100,gapPercent=Math.round(Math.abs(attacker-defender)/Math.min(attacker,defender)*10000)/100;
  if(attacker>defender*cap)return{active:true,capPercent:Number(capPercent),gapPercent,attackerScale:(defender*cap)/attacker,defenderScale:1};
  if(defender>attacker*cap)return{active:true,capPercent:Number(capPercent),gapPercent,attackerScale:1,defenderScale:(attacker*cap)/defender};
  return{active:false,capPercent:Number(capPercent),gapPercent,attackerScale:1,defenderScale:1};
}
async function selectBattleOpponent(env,roundId,mine,requestId){
  const enemy=mine.side==='A'?'B':'A',seed=seedOf(`${requestId}:MATCH`),power=Math.max(1,Number(mine.deck_power||0));
  const result=await env.DB.prepare(`SELECT w.*,u.nickname,u.role FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? AND w.side=? AND w.status='ACTIVE' AND w.user_id<>? ORDER BY ABS(w.deck_power-?) ASC,(((w.user_id * 1103515245) + ?) & 2147483647),w.user_id LIMIT 12`).bind(roundId,enemy,mine.user_id,power,seed).all();
  return pickPowerMatchedOpponent(result?.results||[],power);
}
function resultHpPercent(battleV2,side){const resultEvent=[...(battleV2?.result?.timeline||[])].reverse().find(event=>event.type==='RESULT');return Number(side==='A'?resultEvent?.teamAHpPercent:resultEvent?.teamBHpPercent)||0}
async function simulateTerritoryBattle(env,deps,attackerUser,mine,opponent,requestId,seedOverride=null){
  const battle=await deps.battleSettings(env),[attackerCards,defenderCards]=await Promise.all([participantDeck(env,deps,mine,battle),participantDeck(env,deps,opponent,battle)]);
  if(attackerCards.length!==5)throw new Error('등록한 PVP 덱 5장을 불러오지 못했습니다. 참가 신청을 다시 해주세요.');
  if(defenderCards.length!==5)throw new Error('상대 진영의 PVP 덱이 완성되지 않아 매칭할 수 없습니다.');
  const defenderUser={id:Number(opponent.user_id),nickname:String(opponent.nickname||'상대 참가자'),role:String(opponent.role||'USER')};
  const uniquePromise=typeof deps.cardUniqueDeckStates==='function'?deps.cardUniqueDeckStates(env,[{user:attackerUser,cards:attackerCards},{user:defenderUser,cards:defenderCards}],'PVP'):Promise.resolve([{enabled:false,cards:attackerCards},{enabled:false,cards:defenderCards}]);
  const storedBonusA=safeJson(mine?.loadout_bonus_json,null),storedBonusB=safeJson(opponent?.loadout_bonus_json,null),bonusA=storedBonusA?Promise.resolve(storedBonusA):typeof deps.userEquipmentBonuses==='function'?deps.userEquipmentBonuses(env,attackerUser.id):Promise.resolve({pvp:0}),bonusB=storedBonusB?Promise.resolve(storedBonusB):typeof deps.userEquipmentBonuses==='function'?deps.userEquipmentBonuses(env,defenderUser.id):Promise.resolve({pvp:0});
  const magicA=Array.isArray(storedBonusA?.magicCards)?Promise.resolve({enabled:storedBonusA.magicEnabled===true,cards:storedBonusA.magicCards}):typeof deps.magicBattleLoadout==='function'?deps.magicBattleLoadout(env,attackerUser,'PVP'):Promise.resolve({enabled:false,cards:[]}),magicB=Array.isArray(storedBonusB?.magicCards)?Promise.resolve({enabled:storedBonusB.magicEnabled===true,cards:storedBonusB.magicCards}):typeof deps.magicBattleLoadout==='function'?deps.magicBattleLoadout(env,defenderUser,'PVP'):Promise.resolve({enabled:false,cards:[]});
  const idsA=attackerCards.map(card=>String(card.id)),idsB=defenderCards.map(card=>String(card.id));
  const synergyA=typeof deps.evaluateDeckSynergies==='function'?deps.evaluateDeckSynergies(env,attackerUser,idsA,'PVP',{forceOwnerTest:String(attackerUser.role||'').toUpperCase()==='OWNER'}):Promise.resolve({totals:{attackPercent:0}});
  const synergyB=typeof deps.evaluateDeckSynergies==='function'?deps.evaluateDeckSynergies(env,defenderUser,idsB,'PVP',{forceOwnerTest:String(defenderUser.role||'').toUpperCase()==='OWNER'}):Promise.resolve({totals:{attackPercent:0}});
  const [uniqueStates,aBonus,bBonus,aSynergy,bSynergy,aMagic,bMagic]=await Promise.all([uniquePromise,bonusA,bonusB,synergyA,synergyB,magicA,magicB]);
  const [aUnique,dUnique]=uniqueStates,aMap=new Map((aUnique?.cards||[]).map(card=>[String(card.id),card])),dMap=new Map((dUnique?.cards||[]).map(card=>[String(card.id),card]));
  const aMultiplier=1+Number(aSynergy?.totals?.attackPercent||0)/100,dMultiplier=1+Number(bSynergy?.totals?.attackPercent||0)/100,matchBalance=matchPowerScale(Number(mine.formation_power||mine.deck_power||0),Number(opponent.formation_power||opponent.deck_power||0),15);
  const attackerEngineCards=attackerCards.map(card=>{const uniqueCard=aMap.get(String(card.id));return {...card,power:Math.max(1,Math.floor(Number(card.power||0)*aMultiplier*matchBalance.attackerScale)),uniqueAbility:uniqueCard?.uniqueAbility||card.uniqueAbility||null,uniqueAdvancement:uniqueCard?.uniqueAdvancement||null}});
  const defenderEngineCards=defenderCards.map(card=>{const uniqueCard=dMap.get(String(card.id));return {...card,power:Math.max(1,Math.floor(Number(card.power||0)*dMultiplier*matchBalance.defenderScale)),uniqueAbility:uniqueCard?.uniqueAbility||card.uniqueAbility||null,uniqueAdvancement:uniqueCard?.uniqueAdvancement||null}});
  const battleSeed=seedOverride==null?seedOf(`${mine.round_id}:${requestId}:TWV3_BATTLE_V2`):Number(seedOverride)>>>0;
  const battleV2=deps.createPvpBattleV2({attackerCards:attackerEngineCards,defenderCards:defenderEngineCards,attackerMagicCards:aMagic?.cards||[],defenderMagicCards:bMagic?.cards||[],attackerEquipmentBonus:Number(aBonus?.pvp||0),defenderEquipmentBonus:Number(bBonus?.pvp||0),seed:battleSeed,singleHealerBonus:battle?.engine?.singleHealerBonus});
  return{battleV2,battleSeed,attackerCards,defenderCards,attackerPower:Number(battleV2.teams?.A?.summary?.power||mine.deck_power||0),defenderPower:Number(battleV2.teams?.B?.summary?.power||opponent.deck_power||0),matchBalance,opponent:{id:Number(opponent.user_id),nickname:defenderUser.nickname,side:String(opponent.side||''),deckPower:Number(opponent.deck_power||0)}};
}
async function hydrateBattleReplay(env,deps,user,action,result){if(!action?.opponent_user_id||!action?.round_id||!action?.battle_seed)return result;try{const mine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(action.round_id,action.user_id).first(),opponent=await env.DB.prepare(`SELECT w.*,u.nickname,u.role FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? AND w.user_id=?`).bind(action.round_id,action.opponent_user_id).first();if(!mine||!opponent)return result;const simulation=await simulateTerritoryBattle(env,deps,user,mine,opponent,action.request_id,action.battle_seed);return{...result,battleV2:simulation.battleV2,opponent:simulation.opponent,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,replayedBattle:true}}catch(error){console.warn('territory battle replay hydration failed',error);return result}}

async function acquireLock(env,name,ttlMs=120000){
  const key=`territory_war_v3_lock_${name}`,token=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(key,`RUNNING|${token}|${now}`).run();
  let row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  let parts=String(row?.value||'').split('|');
  if(parts[1]===token)return{ok:true,key,token};
  if(parts[0]==='RUNNING'&&now-Number(parts[2]||0)>ttlMs){
    await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(`RUNNING|${token}|${now}`,key,row.value).run();
    row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();parts=String(row?.value||'').split('|');
    if(parts[1]===token)return{ok:true,key,token};
  }
  return{ok:false};
}
async function releaseLock(env,lock){if(lock?.ok)await env.DB.prepare('DELETE FROM app_meta WHERE key=? AND value LIKE ?').bind(lock.key,`RUNNING|${lock.token}|%`).run()}

async function createRound(env,cfg){
  const lock=await acquireLock(env,'round_create',60000);if(!lock.ok){const live=await env.DB.prepare("SELECT id FROM territory_war_v3_rounds WHERE status IN ('RECRUITING','PREPARING','ACTIVE') ORDER BY id DESC LIMIT 1").first();if(live)return Number(live.id);throw new Error('신규 영토전 회차 생성이 진행 중입니다.')}
  try{
    const live=await env.DB.prepare("SELECT id FROM territory_war_v3_rounds WHERE status IN ('RECRUITING','PREPARING','ACTIVE') ORDER BY id DESC LIMIT 1").first();if(live)return Number(live.id);
    const end=iso(Date.now()+Number(cfg.recruitmentHours||3)*3600000);
    const result=await env.DB.prepare("INSERT INTO territory_war_v3_rounds(status,battle_name,recruitment_ends_at,current_front_index) VALUES('RECRUITING',?,?,4)").bind(String(cfg.battleName||'').trim().slice(0,40),end).run();
    return Number(result.meta.last_row_id);
  }finally{await releaseLock(env,lock)}
}

async function createFront(env,roundId,sequence,nodeIndex,status,cfg){
  const node=nodeAt(nodeIndex),round=await roundById(env,roundId),rules=balanceRules(round,cfg),prior=await env.DB.prepare('SELECT COUNT(*) cnt FROM territory_war_v3_fronts WHERE round_id=? AND node_index=?').bind(roundId,node.index).first(),revisitCount=Math.max(0,Number(prior?.cnt||0)),revisitFatigue=Math.min(45,revisitCount*15),baseHp=Math.max(1,Math.round(maxHpForNode(node,cfg)*(1-revisitFatigue/100))),candidateDefenseSide=lastDefenseSide(node.index),leadingSide=Number(round?.a_capture_streak||0)>0?'A':Number(round?.b_capture_streak||0)>0?'B':null,captureStreak=leadingSide?Number(round?.[sideField(leadingSide,'capture_streak')]||0):0,antiPingPong=revisitCount>=Math.max(1,Number(rules.antiPingPongRevisitThreshold||3)),leaderFatigue=antiPingPong?0:Math.min(Number(rules.fatigueMaxPercent||15),captureStreak*Number(rules.fatiguePerCapturePercent||5));
  let defenseSide=null;
  if(candidateDefenseSide){
    const reserved=await env.DB.prepare('INSERT OR IGNORE INTO territory_war_v3_last_defense_uses(round_id,side) VALUES(?,?)').bind(roundId,candidateDefenseSide).run();
    if(Number(reserved?.meta?.changes||0)>0)defenseSide=candidateDefenseSide;
  }
  let aHp=baseHp,bHp=baseHp;if(defenseSide==='A')aHp=Math.round(aHp*(1+Number(cfg.lastDefenseHpBonusPercent||35)/100));if(defenseSide==='B')bHp=Math.round(bHp*(1+Number(cfg.lastDefenseHpBonusPercent||35)/100));if(leadingSide==='A')aHp=Math.round(aHp*(1-leaderFatigue/100));if(leadingSide==='B')bHp=Math.round(bHp*(1-leaderFatigue/100));
  const started=status==='ACTIVE'?iso():null,deadline=defenseSide?iso((status==='ACTIVE'?Date.now():sqlMs(round?.starts_at)||Date.now())+Number(cfg.lastDefenseHoldMinutes||15)*60000):null;
  await env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_fronts(round_id,sequence,node_index,node_code,node_name,node_type,status,a_hp,b_hp,a_max_hp,b_max_hp,revisit_count,started_at,last_defense_side,last_defense_deadline,fatigued_side,fatigue_percent)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(roundId,sequence,node.index,node.code,node.name,node.type,status,aHp,bHp,aHp,bHp,revisitCount,started,defenseSide,deadline,leadingSide,leaderFatigue).run();
  const front=await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE round_id=? AND sequence=?').bind(roundId,sequence).first();
  if(defenseSide&&front?.id)await env.DB.prepare('UPDATE territory_war_v3_last_defense_uses SET front_id=? WHERE round_id=? AND side=? AND front_id IS NULL').bind(front.id,roundId,defenseSide).run();
  return front;
}

function historyResult(item){return ['WIN','LOSE','DRAW'].includes(String(item?.balance_previous_result||''))?String(item.balance_previous_result):'NEW'}
function formationPower(item){return Math.max(0,Number(item?.formation_power||item?.deck_power||0))}
function historyAttacks(item){return Math.max(0,Number(item?.balance_history_weighted_attacks??item?.balance_previous_attacks??0))}
function historyParticipation(item){return Math.max(0,Number(item?.balance_history_participation_weight||item?.balance_history_active_rounds||0))}
function historyWins(item){return Math.max(0,Number(item?.balance_history_win_weight||0))}
function historyLosses(item){return Math.max(0,Number(item?.balance_history_loss_weight||0))}
function formationCost(metrics,totals){
  const powerGap=Math.abs(metrics.aPower-metrics.bPower)/Math.max(1,totals.power),activityGap=Math.abs(metrics.aActivity-metrics.bActivity)/Math.max(1,totals.activity),participationGap=Math.abs(metrics.aParticipation-metrics.bParticipation)/Math.max(1,totals.participation),winnerGap=Math.abs(metrics.aWinners-metrics.bWinners)/Math.max(1,totals.winners),loserGap=Math.abs(metrics.aLosers-metrics.bLosers)/Math.max(1,totals.losers);
  return Math.abs(metrics.aCount-metrics.bCount)*1000+powerGap*360+activityGap*180+participationGap*120+winnerGap*90+loserGap*70+metrics.repeatedSides/Math.max(1,totals.history)*3;
}
function balancedSideAssignments(users){
  const totals={power:users.reduce((sum,item)=>sum+formationPower(item),0),activity:users.reduce((sum,item)=>sum+historyAttacks(item),0),participation:users.reduce((sum,item)=>sum+historyParticipation(item),0),winners:users.reduce((sum,item)=>sum+historyWins(item),0),losers:users.reduce((sum,item)=>sum+historyLosses(item),0),history:users.filter(item=>historyResult(item)!=='NEW').length};
  const metrics={aPower:0,bPower:0,aActivity:0,bActivity:0,aParticipation:0,bParticipation:0,aWinners:0,bWinners:0,aLosers:0,bLosers:0,aCount:0,bCount:0,repeatedSides:0},assignments=[],capacityA=Math.ceil(users.length/2),capacityB=Math.ceil(users.length/2);
  const projected=(entries)=>{const next={...metrics};for(const {item,side} of entries){const prefix=side==='A'?'a':'b';next[`${prefix}Power`]+=formationPower(item);next[`${prefix}Activity`]+=historyAttacks(item);next[`${prefix}Participation`]+=historyParticipation(item);next[`${prefix}Winners`]+=historyWins(item);next[`${prefix}Losers`]+=historyLosses(item);next[`${prefix}Count`]++;if(String(item.balance_previous_side||'')===side)next.repeatedSides++}return next};
  const canPlace=entries=>entries.every(({side},index)=>{const before=entries.slice(0,index).filter(entry=>entry.side===side).length;return side==='A'?metrics.aCount+before<capacityA:metrics.bCount+before<capacityB});
  const place=(item,side)=>{assignments.push({item,side});Object.assign(metrics,projected([{item,side}]))};
  const choose=(options)=>options.filter(canPlace).map(entries=>({entries,cost:formationCost(projected(entries),totals)})).sort((a,b)=>a.cost-b.cost||String(a.entries.map(entry=>`${entry.side}:${entry.item.user_id}`).join('|')).localeCompare(String(b.entries.map(entry=>`${entry.side}:${entry.item.user_id}`).join('|'))))[0]?.entries||options[0];
  const cohorts=['WIN','LOSE','DRAW','NEW'].map(result=>users.filter(item=>historyResult(item)===result).sort((a,b)=>historyParticipation(b)-historyParticipation(a)||historyAttacks(b)-historyAttacks(a)||formationPower(b)-formationPower(a)||Number(a.user_id)-Number(b.user_id)));
  for(const cohort of cohorts){for(let index=0;index<cohort.length;index+=2){const first=cohort[index],second=cohort[index+1];if(second){for(const entry of choose([[{item:first,side:'A'},{item:second,side:'B'}],[{item:first,side:'B'},{item:second,side:'A'}]]))place(entry.item,entry.side)}else{const options=['A','B'].map(side=>[{item:first,side}]);for(const entry of choose(options))place(entry.item,entry.side)}}}
  // Start from crossed recent results, then allow any opposite-side swap when
  // the combined five-round power/activity/participation cost is improved.
  if(assignments.length<=400){let improved=true,passes=0;while(improved&&passes++<18){improved=false;let best=null,bestCost=formationCost(metrics,totals);for(let ai=0;ai<assignments.length;ai++){if(assignments[ai].side!=='A')continue;for(let bi=0;bi<assignments.length;bi++){if(assignments[bi].side!=='B')continue;const left=assignments[ai].item,right=assignments[bi].item,next={...metrics};for(const [key,getter] of [['Power',formationPower],['Activity',historyAttacks],['Participation',historyParticipation],['Winners',historyWins],['Losers',historyLosses]]){const leftValue=getter(left),rightValue=getter(right);next[`a${key}`]=metrics[`a${key}`]-leftValue+rightValue;next[`b${key}`]=metrics[`b${key}`]-rightValue+leftValue}const beforeRepeat=Number(String(left.balance_previous_side||'')==='A')+Number(String(right.balance_previous_side||'')==='B'),afterRepeat=Number(String(left.balance_previous_side||'')==='B')+Number(String(right.balance_previous_side||'')==='A');next.repeatedSides+=afterRepeat-beforeRepeat;const cost=formationCost(next,totals);if(cost+1e-9<bestCost){bestCost=cost;best={ai,bi,next}}}}if(best){assignments[best.ai].side='B';assignments[best.bi].side='A';Object.assign(metrics,best.next);improved=true}}}
  return{assignments,...metrics};
}

async function recentRoundHistory(env,roundId,limit=FORMATION_HISTORY_ROUNDS){
  const rounds=(await env.DB.prepare("SELECT id,winner_side FROM territory_war_v3_rounds WHERE id<? AND settled_at IS NOT NULL ORDER BY id DESC LIMIT ?").bind(roundId,limit).all()).results||[];if(!rounds.length)return{roundId:null,roundIds:[],users:new Map(),totalWeight:0};
  const ids=rounds.map(row=>Number(row.id)),marks=ids.map(()=>'?').join(','),rows=(await env.DB.prepare(`WITH action_counts AS (SELECT round_id,user_id,COUNT(*) attacks FROM territory_war_v3_actions WHERE round_id IN (${marks}) AND status IN ('APPLIED','COMPLETED') GROUP BY round_id,user_id) SELECT u.round_id,u.user_id,u.side,MAX(u.attacks,COALESCE(ac.attacks,0)) attacks FROM territory_war_v3_users u LEFT JOIN action_counts ac ON ac.round_id=u.round_id AND ac.user_id=u.user_id WHERE u.round_id IN (${marks})`).bind(...ids,...ids).all()).results||[],roundMap=new Map(rounds.map((row,index)=>[Number(row.id),{winner:String(row.winner_side||'DRAW'),weight:rounds.length-index,index}])),mapped=new Map(),totalWeight=rounds.reduce((sum,_,index)=>sum+rounds.length-index,0);
  rows.sort((a,b)=>Number(b.round_id)-Number(a.round_id));
  for(const row of rows){
    const userId=Number(row.user_id),roundInfo=roundMap.get(Number(row.round_id));
    if(!roundInfo)continue;
    const attacks=Math.max(0,Math.min(300,Number(row.attacks||0))),side=String(row.side||'');
    const result=roundInfo.winner==='DRAW'?'DRAW':(side===roundInfo.winner?'WIN':'LOSE');
    const entry=mapped.get(userId)||{rounds:0,activeRounds:0,participationWeight:0,weightedAttacks:0,winWeight:0,lossWeight:0,latestRoundId:null,latestSide:null,latestResult:'NEW',latestAttacks:0};
    entry.rounds++;entry.weightedAttacks+=attacks*roundInfo.weight;
    if(attacks>0){entry.activeRounds++;entry.participationWeight+=roundInfo.weight}
    if(result==='WIN')entry.winWeight+=roundInfo.weight;if(result==='LOSE')entry.lossWeight+=roundInfo.weight;
    if(entry.latestRoundId==null){entry.latestRoundId=Number(row.round_id);entry.latestSide=side;entry.latestResult=result;entry.latestAttacks=attacks}
    mapped.set(userId,entry);
  }
  return{roundId:ids[0],roundIds:ids,users:mapped,totalWeight};
}

async function formRound(env,round,cfg,deps=territoryRuntimeDeps){
  const lock=await acquireLock(env,`form_${round.id}`,120000);if(!lock.ok)return{status:'BUSY'};
  try{
    const fresh=await roundById(env,round.id);if(!fresh||fresh.status!=='RECRUITING')return{status:fresh?.status||'MISSING'};
    let users=(await env.DB.prepare('SELECT w.*,u.nickname,u.role FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? ORDER BY w.deck_power DESC,w.registered_at,w.user_id').bind(round.id).all()).results||[];
    if(users.length<Number(cfg.minParticipants||6))return{status:'WAITING_MINIMUM',count:users.length};
    if(deps?.battleSettings&&deps?.cardBattlePower){const battle=await deps.battleSettings(env);users=await refreshFormationSnapshots(env,deps,round.id,users,battle)}
    const history=await recentRoundHistory(env,round.id),candidates=users.map(item=>{const prior=history.users.get(Number(item.user_id));return{...item,balance_previous_round_id:prior?.latestRoundId||null,balance_previous_side:prior?.latestSide||null,balance_previous_result:prior?.latestResult||'NEW',balance_previous_attacks:prior?.latestAttacks||0,balance_history_rounds:prior?.rounds||0,balance_history_active_rounds:prior?.activeRounds||0,balance_history_participation_weight:prior?.participationWeight||0,balance_history_weighted_attacks:prior?.weightedAttacks||0,balance_history_win_weight:prior?.winWeight||0,balance_history_loss_weight:prior?.lossWeight||0}}),balanced=balancedSideAssignments(candidates),{aPower,bPower,aCount,bCount}=balanced,statements=[];
    for(const {item,side} of balanced.assignments)statements.push(env.DB.prepare("UPDATE territory_war_v3_users SET side=?,status='ACTIVE',energy=?,last_recharged_at=CURRENT_TIMESTAMP,balance_previous_round_id=?,balance_previous_side=?,balance_previous_result=?,balance_previous_attacks=?,balance_history_rounds=?,balance_history_active_rounds=?,balance_history_participation_weight=?,balance_history_weighted_attacks=?,balance_history_win_weight=?,balance_history_loss_weight=?,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?").bind(side,Number(cfg.energyMax||10),item.balance_previous_round_id,item.balance_previous_side,item.balance_previous_result,Number(item.balance_previous_attacks||0),Number(item.balance_history_rounds||0),Number(item.balance_history_active_rounds||0),Number(item.balance_history_participation_weight||0),Number(item.balance_history_weighted_attacks||0),Number(item.balance_history_win_weight||0),Number(item.balance_history_loss_weight||0),round.id,item.user_id));
    await batchChunks(env,statements);
    const prep=Math.max(0,Number(cfg.preparationMinutes||0)),starts=iso(Date.now()+prep*60000),ends=iso(Date.now()+(prep+Number(cfg.roundMinutes||180))*60000),front=await createFront(env,round.id,1,4,prep>0?'PREPARING':'ACTIVE',cfg);
    await env.DB.prepare(`UPDATE territory_war_v3_rounds SET status=?,formed_at=CURRENT_TIMESTAMP,starts_at=?,ends_at=?,current_front_index=4,current_front_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'`).bind(prep>0?'PREPARING':'ACTIVE',starts,ends,front.id,round.id).run();
    return{status:prep>0?'PREPARING':'ACTIVE',aCount,bCount,aPower,bPower,historyRoundIds:history.roundIds,aActivity:balanced.aActivity,bActivity:balanced.bActivity,aParticipation:balanced.aParticipation,bParticipation:balanced.bParticipation,aRecentWinWeight:balanced.aWinners,bRecentWinWeight:balanced.bWinners};
  }finally{await releaseLock(env,lock)}
}

async function activateRound(env,round){
  const lock=await acquireLock(env,`activate_${round.id}`,60000);if(!lock.ok)return round;
  try{await env.DB.batch([
    env.DB.prepare("UPDATE territory_war_v3_rounds SET status='ACTIVE',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PREPARING' AND datetime(starts_at)<=datetime('now')").bind(round.id),
    env.DB.prepare("UPDATE territory_war_v3_fronts SET status='ACTIVE',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PREPARING'").bind(round.current_front_id)
  ]);return roundById(env,round.id)}finally{await releaseLock(env,lock)}
}

function timeWinner(round,front){
  const idx=Number(round.current_front_index||4);if(idx>4)return'A';if(idx<4)return'B';
  if(front){const ar=Number(front.a_hp||0)/Math.max(1,Number(front.a_max_hp||1)),br=Number(front.b_hp||0)/Math.max(1,Number(front.b_max_hp||1));if(ar>br)return'A';if(br>ar)return'B'}
  if(Number(round.a_total_damage||0)>Number(round.b_total_damage||0))return'A';if(Number(round.b_total_damage||0)>Number(round.a_total_damage||0))return'B';return'DRAW';
}

function attackRewardPercent(attacks,cfg=DEFAULTS){
  const count=Math.max(0,Number(attacks||0)),tiers=[
    [Number(cfg.attackRewardTier1Attacks??10),Number(cfg.attackRewardTier1Percent??50)],
    [Number(cfg.attackRewardTier2Attacks??30),Number(cfg.attackRewardTier2Percent??80)],
    [Number(cfg.attackRewardTier3Attacks??60),Number(cfg.attackRewardTier3Percent??100)],
    [Number(cfg.attackRewardTier4Attacks??100),Number(cfg.attackRewardTier4Percent??125)]
  ].sort((a,b)=>a[0]-b[0]);let percent=Number(cfg.attackRewardStarterPercent??25);for(const [threshold,tierPercent] of tiers)if(count>=threshold)percent=tierPercent;return clampInt(percent,0,300,25);
}

function participationInventoryReward(attacks){
  const qualified=Math.max(0,Number(attacks||0))>=PARTICIPATION_ITEM_REWARD_ATTACKS;
  return{scrapyardTickets:qualified?PARTICIPATION_SCRAPYARD_TICKETS:0,mysticEnergy:qualified?PARTICIPATION_MYSTIC_ENERGY:0};
}

const REWARD_COLUMNS='round_id,user_id,side,result,coin,shards,damage,attacks,required_attacks,base_result_coin,attack_reward_percent,attack_adjusted_coin,counter_bonus_coin,ace_bonus_coin,last_defense_bonus_coin,comeback_bonus_coin,siege_snapshot_bonus_coin,premium_cube_quantity';
const REWARD_UPDATE='side=excluded.side,result=excluded.result,coin=excluded.coin,shards=excluded.shards,damage=excluded.damage,attacks=excluded.attacks,required_attacks=excluded.required_attacks,base_result_coin=excluded.base_result_coin,attack_reward_percent=excluded.attack_reward_percent,attack_adjusted_coin=excluded.attack_adjusted_coin,counter_bonus_coin=excluded.counter_bonus_coin,ace_bonus_coin=excluded.ace_bonus_coin,last_defense_bonus_coin=excluded.last_defense_bonus_coin,comeback_bonus_coin=excluded.comeback_bonus_coin,siege_snapshot_bonus_coin=excluded.siege_snapshot_bonus_coin,premium_cube_quantity=excluded.premium_cube_quantity';
async function generateRewards(env,round,cfg){
  const rows=(await env.DB.prepare(`WITH action_counts AS (
    SELECT user_id,COUNT(*) attacks FROM territory_war_v3_actions
    WHERE round_id=? AND status IN ('APPLIED','COMPLETED') GROUP BY user_id
  ) SELECT u.user_id,u.side,u.damage,u.counter_contribution,u.ace_defeats,u.last_defense_successes,u.comeback_participations,
    MAX(u.attacks,COALESCE(ac.attacks,0)) attacks
    FROM territory_war_v3_users u LEFT JOIN action_counts ac ON ac.user_id=u.user_id
    WHERE u.round_id=? ORDER BY u.damage DESC,attacks DESC,u.user_id`).bind(round.id,round.id).all()).results||[],required=Math.max(0,Number(cfg.settlementMinAttacks??1)),snapshotLimit=Math.max(1,Number(cfg.siegeSnapshotLimit||12)),snapshotThreshold=Math.max(0,Number(cfg.siegeSnapshotAttackThreshold??200)),snapshotReward=Math.max(0,Number(cfg.siegeSnapshotBonusCoin??500000)),cubeThreshold=Math.max(0,Number(cfg.siegeParticipationCubeThreshold??100)),cubeReward=Math.max(0,Number(cfg.siegeParticipationCubeQuantity??10)),payloads=[];
  for(const [rank,item] of rows.entries()){
    const attacks=Number(item.attacks||0),eligible=attacks>=required,winner=String(round.winner_side||'DRAW'),result=!eligible?'INELIGIBLE':winner==='DRAW'?'DRAW':item.side===winner?'WIN':'LOSE',inSnapshot=rank<snapshotLimit;
    let coin=0,shards=0,baseResultCoin=0,attackPercent=0,attackAdjustedCoin=0,counterBonus=0,aceBonus=0,lastDefenseBonus=0,comebackBonus=0,siegeSnapshotBonus=0,premiumCubeQuantity=0;
    if(eligible){
      baseResultCoin=result==='WIN'?Number(cfg.winnerCoin||0):result==='LOSE'?Number(cfg.loserCoin||0):Number(cfg.drawCoin||0);
      attackPercent=attackRewardPercent(attacks,cfg);attackAdjustedCoin=Math.floor(baseResultCoin*attackPercent/100);
      coin=attackAdjustedCoin+Math.min(Number(cfg.maxContributionCoin||1000000),Math.floor(Number(item.damage||0)/1000)*Number(cfg.contributionCoinPer1000Damage||0));
      counterBonus=Number(item.counter_contribution||0)*Number(cfg.counterContributionCoinPerPoint||5);aceBonus=Number(item.ace_defeats||0)*Number(cfg.aceDefeatCoin||10000);lastDefenseBonus=Number(item.last_defense_successes||0)*Number(cfg.lastDefenseCoin||5000);comebackBonus=Number(item.comeback_participations||0)*Number(cfg.comebackParticipationCoin||300);siegeSnapshotBonus=inSnapshot&&attacks>snapshotThreshold?snapshotReward:0;premiumCubeQuantity=attacks>=cubeThreshold?cubeReward:0;
      coin+=counterBonus+aceBonus+lastDefenseBonus+comebackBonus+siegeSnapshotBonus;shards=Number(cfg.participationShards||0);
    }
    payloads.push([round.id,item.user_id,item.side||'',result,coin,shards,Number(item.damage||0),attacks,required,baseResultCoin,attackPercent,attackAdjustedCoin,counterBonus,aceBonus,lastDefenseBonus,comebackBonus,siegeSnapshotBonus,premiumCubeQuantity]);
  }
  if(!payloads.length)return 0;
  if(env.DB.dialect==='postgres'){
    // 한 회차 보상을 한 SQL 문으로 확정한다. 기존 50개 단위 트랜잭션은
    // 두 번째 묶음에서 연결이 끊기면 앞 50명만 남는 부분 정산을 만들었다.
    const tuple=`(${Array(18).fill('?').join(',')})`,sql=`INSERT INTO territory_war_v3_rewards(${REWARD_COLUMNS}) VALUES ${payloads.map(()=>tuple).join(',')} ON CONFLICT(round_id,user_id) DO UPDATE SET ${REWARD_UPDATE} WHERE territory_war_v3_rewards.claimed_at IS NULL RETURNING round_id`;
    await env.DB.prepare(sql).bind(...payloads.flat()).run();
  }else{
    const statements=payloads.map(values=>env.DB.prepare(`INSERT INTO territory_war_v3_rewards(${REWARD_COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET ${REWARD_UPDATE} WHERE territory_war_v3_rewards.claimed_at IS NULL`).bind(...values));
    await batchChunks(env,statements);
  }
  return payloads.length;
}

async function settleRound(env,round,cfg,forcedWinner=''){
  if(!round||round.settled_at)return round;
  const lock=await acquireLock(env,`settle_${round.id}`,180000);if(!lock.ok)return roundById(env,round.id);
  try{
    let fresh=await roundById(env,round.id);if(!fresh||fresh.settled_at)return fresh;
    const front=await activeFront(env,fresh),winner=forcedWinner||timeWinner(fresh,front);
    // 보상 생성이 완전히 끝난 뒤에만 회차를 종료한다. 중간 실패 시 settled_at이
    // 비어 있으므로 다음 lifecycle 호출이 같은 UPSERT를 안전하게 재시도한다.
    await generateRewards(env,{...fresh,winner_side:winner},cfg);
    const changed=await env.DB.prepare("UPDATE territory_war_v3_rounds SET status='FINISHED',winner_side=?,settled_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND settled_at IS NULL").bind(winner,fresh.id).run();
    if(Number(changed?.meta?.changes||0))fresh=await roundById(env,fresh.id);
    return roundById(env,fresh.id);
  }finally{await releaseLock(env,lock)}
}

async function finalizeResolvedFront(env,current,cfg){
  const winner=String(current.winner_side||''),freshRound=await roundById(env,current.round_id),finalWin=(winner==='A'&&Number(current.node_index)===8)||(winner==='B'&&Number(current.node_index)===0);
  await env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_front_results(round_id,sequence,front_id,node_index,node_code,winner_side,a_damage,b_damage,a_hp_left,b_hp_left)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(current.round_id,current.sequence,current.id,current.node_index,current.node_code,winner,Number(current.a_max_hp)-Number(current.a_hp),Number(current.b_max_hp)-Number(current.b_hp),Number(current.a_hp),Number(current.b_hp)).run();
  if(Number(freshRound?.current_front_id||0)!==Number(current.id)){
    if(finalWin&&!freshRound?.settled_at){const settled=await settleRound(env,freshRound,cfg,winner);return{resolved:true,winner,roundFinished:true,round:settled,nextFront:null}}
    const next=freshRound?.current_front_id?await activeFront(env,freshRound):null;return{resolved:true,winner,roundFinished:Boolean(freshRound?.settled_at),round:freshRound,nextFront:next};
  }
  if(finalWin){
    await env.DB.prepare(`UPDATE territory_war_v3_rounds SET current_front_index=?,current_front_id=NULL,a_front_wins=a_front_wins+?,b_front_wins=b_front_wins+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_front_id=? AND settled_at IS NULL`).bind(current.node_index,winner==='A'?1:0,winner==='B'?1:0,freshRound.id,current.id).run();
    const settled=await settleRound(env,await roundById(env,freshRound.id),cfg,winner);return{resolved:true,winner,roundFinished:true,round:settled,nextFront:null};
  }
  const nextIndex=Number(current.node_index)+(winner==='A'?1:-1),nextAtCenter=nextIndex===4;
  await env.DB.prepare(`UPDATE territory_war_v3_rounds SET a_capture_streak=CASE WHEN ? THEN 0 WHEN ?='A' THEN a_capture_streak+1 ELSE 0 END,b_capture_streak=CASE WHEN ? THEN 0 WHEN ?='B' THEN b_capture_streak+1 ELSE 0 END,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_front_id=? AND settled_at IS NULL`).bind(nextAtCenter?1:0,winner,nextAtCenter?1:0,winner,freshRound.id,current.id).run();
  const next=await createFront(env,current.round_id,Number(current.sequence)+1,nextIndex,'ACTIVE',cfg);
  await env.DB.prepare(`UPDATE territory_war_v3_rounds SET current_front_index=?,current_front_id=?,a_front_wins=a_front_wins+?,b_front_wins=b_front_wins+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_front_id=? AND settled_at IS NULL`).bind(nextIndex,next.id,winner==='A'?1:0,winner==='B'?1:0,freshRound.id,current.id).run();
  if(Number(current.last_defense_triggered||0)){await env.DB.prepare('UPDATE territory_war_v3_users SET last_defense_successes=last_defense_successes+1 WHERE round_id=? AND side=? AND status=\'ACTIVE\'').bind(current.round_id,winner).run();await addNotice(env,current.round_id,'LAST_DEFENSE',winner,'최후 방어선 사수',`${configuredTeamLabel(cfg,winner)}이 최후 방어에 성공해 전선을 중앙 방향으로 밀어냈습니다.`,{frontId:current.id,nextIndex})}
  const updated=await roundById(env,freshRound.id),active=updated?.current_front_id?await activeFront(env,updated):next;return{resolved:true,winner,roundFinished:Boolean(updated?.settled_at),round:updated,nextFront:active};
}

async function resolveFront(env,round,front,cfg){
  let current=await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(front.id).first();if(!current)return{resolved:false};
  if(current.status==='ACTIVE'&&current.last_defense_side&&!current.winner_side&&sqlMs(current.last_defense_deadline)<=Date.now()&&Number(current[`${String(current.last_defense_side).toLowerCase()}_hp`]||0)>0){await env.DB.prepare("UPDATE territory_war_v3_fronts SET status='RESOLVED',winner_side=last_defense_side,last_defense_triggered=1,resolved_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").bind(current.id).run();current=await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(current.id).first()}
  if(current.status==='ACTIVE'&&!current.winner_side&&(Number(current.a_hp)<=0||Number(current.b_hp)<=0)){
    const winner=Number(current.b_hp)<=0?'A':'B';await env.DB.prepare("UPDATE territory_war_v3_fronts SET status='RESOLVED',winner_side=?,resolved_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").bind(winner,current.id).run();current=await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(current.id).first();
  }
  if(current.status==='RESOLVED'&&current.winner_side)return finalizeResolvedFront(env,current,cfg);
  return{resolved:false};
}

async function lifecycle(env,cfg){
  let round=await latestRound(env);if(String(cfg.mode||'OFF').toUpperCase()==='OFF')return round;
  if(!round||['FINISHED','DISABLED'].includes(String(round.status||''))){round=await roundById(env,await createRound(env,cfg));return round}
  if(round.status==='RECRUITING'&&sqlMs(round.recruitment_ends_at)<=Date.now()){
    const formed=await formRound(env,round,cfg);if(formed.status==='WAITING_MINIMUM'){await env.DB.prepare("UPDATE territory_war_v3_rounds SET recruitment_ends_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'").bind(iso(Date.now()+15*60000),round.id).run();return roundById(env,round.id)}round=await roundById(env,round.id);
  }
  if(round.status==='PREPARING'&&sqlMs(round.starts_at)<=Date.now())round=await activateRound(env,round);
  if(round.status==='ACTIVE'&&round.current_front_id){
    const front=await activeFront(env,round),needsAdvance=front&&(front.status==='RESOLVED'||Number(front.a_hp)<=0||Number(front.b_hp)<=0||(front.last_defense_side&&sqlMs(front.last_defense_deadline)<=Date.now()));
    if(needsAdvance){
      const lock=await acquireLock(env,`resolve_${front.id}`,15000);
      if(lock.ok){
        try{await resolveFront(env,round,front,cfg)}finally{await releaseLock(env,lock)}
      }
      round=await roundById(env,round.id);
    }
  }
  if(round.status==='ACTIVE'&&sqlMs(round.ends_at)<=Date.now())round=await settleRound(env,round,cfg);
  return round;
}

function rechargeEnergy(row,cfg,front=null){
  const max=Number(cfg.energyMax||10),defenseReform=front?.last_defense_side&&String(row?.side||row?.m_side||'')===String(front.last_defense_side),minutes=Math.max(1,Number(defenseReform?cfg.lastDefenseEnergyMinutes||5:cfg.energyMinutes||10)),last=sqlMs(row?.last_recharged_at),now=Date.now();let energy=Math.min(max,Number(row?.energy??max)),lastAt=Number.isFinite(last)?last:now;
  if(energy<max){const gained=Math.floor((now-lastAt)/(minutes*60000));if(gained>0){energy=Math.min(max,energy+gained);lastAt+=gained*minutes*60000;if(energy>=max)lastAt=now}}
  return{energy,lastRechargedAt:iso(lastAt),nextEnergyAt:energy>=max?null:iso(lastAt+minutes*60000)};
}

async function rewardForUser(env,userId){
  let v3=await env.DB.prepare('SELECT r.*,w.battle_name FROM territory_war_v3_rewards r JOIN territory_war_v3_rounds w ON w.id=r.round_id WHERE r.user_id=? AND r.claimed_at IS NULL AND w.settled_at IS NOT NULL ORDER BY r.round_id DESC LIMIT 1').bind(userId).first();
  if(v3&&v3.result==='INELIGIBLE'){
    const source=await env.DB.prepare(`SELECT side,damage,attacks FROM territory_war_v3_users WHERE round_id=? AND user_id=?`).bind(v3.round_id,userId).first(),cfg=await settings(env),required=Math.max(0,Number(v3.required_attacks)>0?Number(v3.required_attacks):Number(cfg.settlementMinAttacks??1));
    if(source){const attacks=Number(source.attacks||0),damage=Number(source.damage||0),eligible=attacks>=required;let result='INELIGIBLE',coin=0,shards=0,baseResultCoin=0,attackPercent=0,attackAdjustedCoin=0;if(eligible){const round=await roundById(env,v3.round_id),winner=String(round?.winner_side||'DRAW');result=winner==='DRAW'?'DRAW':source.side===winner?'WIN':'LOSE';baseResultCoin=result==='WIN'?Number(cfg.winnerCoin||0):result==='LOSE'?Number(cfg.loserCoin||0):Number(cfg.drawCoin||0);attackPercent=attackRewardPercent(attacks,cfg);attackAdjustedCoin=Math.floor(baseResultCoin*attackPercent/100);coin=attackAdjustedCoin+Math.min(Number(cfg.maxContributionCoin||1000000),Math.floor(damage/1000)*Number(cfg.contributionCoinPer1000Damage||0));shards=Number(cfg.participationShards||0)}await env.DB.prepare(`UPDATE territory_war_v3_rewards SET side=?,result=?,coin=?,shards=?,damage=?,attacks=?,required_attacks=?,base_result_coin=?,attack_reward_percent=?,attack_adjusted_coin=? WHERE round_id=? AND user_id=? AND claimed_at IS NULL`).bind(source.side||'',result,coin,shards,damage,attacks,required,baseResultCoin,attackPercent,attackAdjustedCoin,v3.round_id,userId).run();v3=await env.DB.prepare('SELECT r.*,w.battle_name FROM territory_war_v3_rewards r JOIN territory_war_v3_rounds w ON w.id=r.round_id WHERE r.round_id=? AND r.user_id=? AND w.settled_at IS NOT NULL').bind(v3.round_id,userId).first()}
  }
  if(v3){const participationItems=participationInventoryReward(v3.attacks);return{...v3,version:'V3',scrapyard_ticket_quantity:participationItems.scrapyardTickets,mystic_energy_quantity:participationItems.mysticEnergy,bonusEquipment:await roundEquipmentBonuses(env,v3.round_id,v3.result)}}
  if(await tableExists(env,'territory_war_rewards')){const old=await env.DB.prepare('SELECT * FROM territory_war_rewards WHERE user_id=? AND claimed_at IS NULL ORDER BY round_id DESC LIMIT 1').bind(userId).first();if(old)return{...old,version:'LEGACY',bonusEquipment:[]}}
  return null;
}

async function counterState(env,round,mine,shared=null){
  const max=Math.max(100,Number((await settings(env)).counterGaugeMax||1000)),side=String(mine?.side||''),participants=shared?.participants||(await env.DB.prepare(`SELECT side,COUNT(*) count FROM territory_war_v3_users WHERE round_id=? AND side IN ('A','B') AND status='ACTIVE' GROUP BY side`).bind(round.id).all()).results||[],uses=shared?.operationUses||(await env.DB.prepare('SELECT side,operation FROM territory_war_v3_operation_uses WHERE round_id=?').bind(round.id).all()).results||[],commanders=shared?.commanders||(side?await commandersForRound(env,round.id):{A:null,B:null}),countMap=Object.fromEntries(participants.map(row=>[row.side,Number(row.count||0)]));
  const team=s=>{const usedOperations=uses.filter(row=>row.side===s).map(row=>row.operation),allUsed=usedOperations.length>=Object.keys(OPERATIONS).length,gauge=allUsed?0:Math.min(max,Number(round?.[sideField(s,'counter_gauge')]||0));return{side:s,gauge,max,percent:allUsed?0:Math.min(100,Math.round(gauge/max*100)),ready:!allUsed&&gauge>=max,allUsed,operation:activeOperation(round,s),participants:countMap[s]||0,commanderUserId:Number(commanders?.[s]?.user_id||0),usedOperations}};
  const mineCommanderId=Number(commanders?.[side]?.user_id||0),isCommander=Boolean(side&&mineCommanderId&&mineCommanderId===Number(mine?.user_id||0));
  return{A:team('A'),B:team('B'),mineSide:side,isCommander,canActivate:Boolean(isCommander&&side&&team(side).ready),commanderUserId:mineCommanderId,operations:OPERATIONS};
}
async function activateOperation(env,round,mine,operation,cfg){
  const side=String(mine.side),enemy=side==='A'?'B':'A',endsAt=iso(Date.now()+Number(cfg.operationDurationMinutes||10)*60000),front=await activeFront(env,round),statements=[],definition=OPERATIONS[operation],enemyOperation=activeOperation(round,enemy);
  const payload={operation,endsAt,category:definition.category,summary:definition.summary,image:definition.asset,counter:definition.counter||'',intercepted:false};
  statements.push(env.DB.prepare('INSERT INTO territory_war_v3_operation_uses(round_id,side,operation) VALUES(?,?,?)').bind(round.id,side,operation));
  if(operation==='REGROUP')statements.push(env.DB.prepare('UPDATE territory_war_v3_users SET energy=MIN(?,energy+?),last_recharged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND side=?').bind(Number(cfg.energyMax||10),Number(cfg.regroupEnergy||3),round.id,side));
  if(operation==='INFILTRATION'&&front){const hpCol=enemy==='A'?'a_hp':'b_hp',maxCol=enemy==='A'?'a_max_hp':'b_max_hp',damage=Math.max(0,Math.min(Number(front[hpCol]||0)-1,Math.round(Number(front[maxCol]||0)*Number(cfg.infiltrationHpPercent||12)/100)));payload.damage=damage;statements.push(env.DB.prepare(`UPDATE territory_war_v3_fronts SET ${hpCol}=MAX(1,${hpCol}-ROUND(${maxCol}*?/100.0)),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(Number(cfg.infiltrationHpPercent||12),front.id))}
  if(operation==='CARPET_BOMBING'&&front){
    const hpCol=enemy==='A'?'a_hp':'b_hp',maxCol=enemy==='A'?'a_max_hp':'b_max_hp',intercepted=enemyOperation.code==='AIR_DEFENSE',basePercent=Number(cfg.carpetBombingHpPercent||10),effectivePercent=intercepted?basePercent*(1-Number(cfg.airDefenseInterceptPercent||75)/100):basePercent,damage=Math.max(0,Math.min(Number(front[hpCol]||0)-1,Math.round(Number(front[maxCol]||0)*effectivePercent/100)));
    payload.intercepted=intercepted;payload.damage=damage;payload.effectivePercent=Math.round(effectivePercent*10)/10;
    statements.push(env.DB.prepare(`UPDATE territory_war_v3_fronts SET ${hpCol}=MAX(1,${hpCol}-?),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(damage,front.id));
  }
  if(operation==='IRON_WALL'&&front){const hpCol=side==='A'?'a_hp':'b_hp',maxCol=side==='A'?'a_max_hp':'b_max_hp',heal=Math.max(0,Math.min(Number(front[maxCol]||0)-Number(front[hpCol]||0),Math.round(Number(front[maxCol]||0)*Number(cfg.ironWallHealPercent||20)/100)));payload.heal=heal;statements.push(env.DB.prepare(`UPDATE territory_war_v3_fronts SET ${hpCol}=MIN(${maxCol},${hpCol}+ROUND(${maxCol}*?/100.0)),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(Number(cfg.ironWallHealPercent||20),front.id))}
  statements.push(env.DB.prepare(`UPDATE territory_war_v3_rounds SET ${sideField(side,'counter_gauge')}=0,${sideField(side,'operation')}=?,${sideField(side,'operation_ends_at')}=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(operation,endsAt,round.id));
  statements.push(env.DB.prepare('DELETE FROM territory_war_v3_operation_votes WHERE round_id=? AND side=?').bind(round.id,side));await env.DB.batch(statements);
  await addNotice(env,round.id,'TACTICAL_OPERATION',side,`${definition.name} 발동`,`${configuredTeamLabel(cfg,side)}이 전술 작전 ‘${definition.name}’을 개시했습니다.`,payload);
  publicStateSharedCache=null;
}
async function activateCommanderOperation(env,deps,user,cfg,body){
  const operation=String(body.operation||'').toUpperCase();if(!OPERATIONS[operation])return deps.json({error:'선택할 수 없는 전술 작전입니다.'},400);const round=await lifecycle(env,cfg);if(!round||round.status!=='ACTIVE')return deps.json({error:'현재 진행 중인 영토전이 없습니다.'},409);const mine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(!mine?.side||mine.status!=='ACTIVE')return deps.json({error:'활성 영토전 참가자만 전술 명령을 사용할 수 있습니다.'},403);const commanders=await commandersForRound(env,round.id);if(Number(commanders?.[mine.side]?.user_id||0)!==Number(user.id))return deps.json({error:'현재 지정된 진영 지휘관만 전술 작전을 발동할 수 있습니다.'},403);
  const lock=await acquireLock(env,`counter_command_${round.id}_${mine.side}`,30000);if(!lock.ok)return deps.json({error:'지휘관 전술 명령을 처리 중입니다.'},409);try{const freshRound=await roundById(env,round.id),freshMine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(!freshRound||freshRound.status!=='ACTIVE'||!freshMine?.side||freshMine.status!=='ACTIVE')return deps.json({error:'전술 작전을 발동할 수 있는 전선 상태가 아닙니다.'},409);const freshCommanders=await commandersForRound(env,round.id);if(Number(freshCommanders?.[freshMine.side]?.user_id||0)!==Number(user.id))return deps.json({error:'지휘권이 변경되었습니다. 전황을 새로고침해 주세요.'},409);const max=Number(cfg.counterGaugeMax||1000),gauge=Number(freshRound[sideField(freshMine.side,'counter_gauge')]||0);if(gauge<max)return deps.json({error:'작전 게이지가 아직 가득 차지 않았습니다.'},409);const used=await env.DB.prepare('SELECT 1 FROM territory_war_v3_operation_uses WHERE round_id=? AND side=? AND operation=?').bind(round.id,freshMine.side,operation).first();if(used)return deps.json({error:'이번 영토전에서 이미 발동한 작전입니다.'},409);await activateOperation(env,freshRound,freshMine,operation,cfg);return deps.json({ok:true,activated:true,commandedBy:user.id,state:await publicState(env,user.id)})}finally{await releaseLock(env,lock)}
}

async function sharedPublicState(env,round,cfg){
  // Administrative phase/deadline/front changes invalidate this cache, while
  // every attack's version bump does not fan out the expensive shared reads.
  const key=`${round.id}:${round.status}:${round.recruitment_ends_at||''}:${round.current_front_id||0}`,now=Date.now();
  if(publicStateSharedCache?.key===key&&publicStateSharedCache.expiresAt>now)return publicStateSharedCache.promise;
  const promise=Promise.all([
    activeFront(env,round),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN side='A' THEN 1 ELSE 0 END) a_count,SUM(CASE WHEN side='B' THEN 1 ELSE 0 END) b_count,SUM(CASE WHEN side='A' THEN deck_power ELSE 0 END) a_power,SUM(CASE WHEN side='B' THEN deck_power ELSE 0 END) b_power FROM territory_war_v3_users WHERE round_id=?").bind(round.id).first(),
    env.DB.prepare(`SELECT w.user_id,w.side,w.damage,w.attacks,w.front_finishes,w.defenses,w.defense_wins,w.counter_contribution,u.nickname,
      (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) command_score
      FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? AND w.side IN ('A','B')
      ORDER BY command_score DESC,w.attacks DESC,w.user_id LIMIT 24`).bind(round.id).all(),
    env.DB.prepare('SELECT * FROM territory_war_v3_front_results WHERE round_id=? ORDER BY sequence DESC LIMIT 10').bind(round.id).all(),
    env.DB.prepare(`SELECT a.id,a.side,a.winner_side,a.target_side,a.damage,a.counter_gained,a.ace_target,a.created_at,au.nickname attacker_nickname,ou.nickname opponent_nickname,cu.nickname contributor_nickname FROM territory_war_v3_actions a JOIN users au ON au.id=a.user_id LEFT JOIN users ou ON ou.id=a.opponent_user_id LEFT JOIN users cu ON cu.id=COALESCE(a.contributor_user_id,a.user_id) WHERE a.round_id=? AND a.status='COMPLETED' AND a.damage>0 ORDER BY a.id DESC LIMIT ?`).bind(round.id,clampInt(cfg.recentActionLimit,5,50,20)).all(),
    env.DB.prepare('SELECT * FROM territory_war_v3_notices WHERE round_id=? ORDER BY id DESC LIMIT 1').bind(round.id).first(),
    env.DB.prepare(`SELECT side,COUNT(*) count FROM territory_war_v3_users WHERE round_id=? AND side IN ('A','B') AND status='ACTIVE' GROUP BY side`).bind(round.id).all(),
    env.DB.prepare('SELECT side,operation FROM territory_war_v3_operation_uses WHERE round_id=?').bind(round.id).all(),
    commandersForRound(env,round.id),
    commandMessagesForRound(env,round.id)
  ]).then(([front,counts,ranking,recentResults,recentActions,notice,participants,operationUses,commanders,commandMessages])=>({front,counts:counts||{},ranking:ranking.results||[],recentResults:recentResults.results||[],recentActions:recentActions.results||[],notice,participants:participants.results||[],operationUses:operationUses.results||[],commanders,commandMessages}));
  publicStateSharedCache={key,expiresAt:now+8000,promise};
  try{return await promise}catch(error){if(publicStateSharedCache?.promise===promise)publicStateSharedCache=null;throw error}
}

async function publicState(env,userId,includeAdmin=false){
  const cfg=await settings(env),round=await lifecycle(env,cfg),mode=String(cfg.mode||'OFF').toUpperCase();
  if(!round)return{mode,settings:cfg,round:null,nodes:NODES,reward:await rewardForUser(env,userId),serverNow:iso()};
  if(round.status==='RECRUITING'){
    const [counts={},mine,reward]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN side='A' THEN 1 ELSE 0 END) a_count,SUM(CASE WHEN side='B' THEN 1 ELSE 0 END) b_count,SUM(CASE WHEN side='A' THEN deck_power ELSE 0 END) a_power,SUM(CASE WHEN side='B' THEN deck_power ELSE 0 END) b_power FROM territory_war_v3_users WHERE round_id=?").bind(round.id).first(),
      env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,userId).first(),
      rewardForUser(env,userId)
    ]);
    const state={mode,settings:cfg,round,front:null,nodes:NODES,truce:{active:false,endsAt:null,minutes:15,canRefresh:false},comeback:{active:false},fatigue:{active:false},lastDefense:{active:false},counter:null,ace:null,notice:null,counts:{total:Number(counts.total||0),A:Number(counts.a_count||0),B:Number(counts.b_count||0),aPower:Number(counts.a_power||0),bPower:Number(counts.b_power||0)},mine:mine||null,registration:{canRegister:!mine,canCancel:Boolean(mine)},ranking:[],recentResults:[],recentActions:[],reward,serverNow:iso(),version:Number(round.version||0)};
    if(includeAdmin)state.adminUsers=(await env.DB.prepare(`SELECT w.*,u.nickname FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? ORDER BY CASE w.side WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,w.deck_power DESC`).bind(round.id).all()).results||[];
    return state;
  }
  await recoverAppliedForUser(env,userId,cfg);
  const [shared,mineRow,reward]=await Promise.all([sharedPublicState(env,round,cfg),env.DB.prepare(`SELECT ranked.* FROM (
    SELECT w.*,
      (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) command_score,
      ROW_NUMBER() OVER (ORDER BY (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) DESC,w.attacks DESC,w.user_id) contribution_rank,
      COUNT(*) OVER () contribution_total
    FROM territory_war_v3_users w
    WHERE w.round_id=? AND w.side IN ('A','B')
  ) ranked WHERE ranked.user_id=?`).bind(round.id,userId).first(),rewardForUser(env,userId)]),front=shared.front,counts=shared.counts;
  let mine=null;if(mineRow){const e=rechargeEnergy(mineRow,cfg,front);mine={...mineRow,energy:e.energy,nextEnergyAt:e.nextEnergyAt}}
  const ranking=shared.ranking,recentResults=shared.recentResults,recentActions=shared.recentActions;
  const canRegister=!mine&&round.status==='RECRUITING',canCancel=Boolean(mine&&round.status==='RECRUITING');
  const ace=ranking.find(row=>row.side===(Number(round.current_front_index||4)>=4?'A':'B'))||null,notice=shared.notice;
  const commanders={...shared.commanders,mineSide:mine?.side||'',canBroadcast:Boolean(mine?.side&&Number(shared.commanders?.[mine.side]?.user_id||0)===Number(userId))};
  const state={mode,settings:cfg,round,front,nodes:NODES,truce:truceState(round),comeback:comebackState(round,cfg,front),fatigue:fatigueState(round,front,cfg),lastDefense:front?.last_defense_side?{active:true,side:front.last_defense_side,deadline:front.last_defense_deadline,hpBonusPercent:Number(cfg.lastDefenseHpBonusPercent||35)}:{active:false},counter:await counterState(env,round,mineRow,shared),ace,notice:notice?{...notice,payload:safeJson(notice.payload_json,{})}:null,commanders,commandMessages:shared.commandMessages||[],counts:{total:Number(counts.total||0),A:Number(counts.a_count||0),B:Number(counts.b_count||0),aPower:Number(counts.a_power||0),bPower:Number(counts.b_power||0)},mine,registration:{canRegister,canCancel},ranking,recentResults,recentActions,reward,serverNow:iso(),version:Number(round.version||0)};
  if(includeAdmin)state.adminUsers=(await env.DB.prepare(`SELECT w.*,u.nickname FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? ORDER BY CASE w.side WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,w.damage DESC,w.deck_power DESC`).bind(round.id).all()).results||[];
  return state;
}

async function realtimePulse(env,round){
  const key=`${round.id}:${round.version}`,now=Date.now();
  if(realtimePulseCache?.key===key&&realtimePulseCache.expiresAt>now)return realtimePulseCache.promise;
  const promise=Promise.all([
    env.DB.prepare(`SELECT id,side,winner_side,created_at FROM territory_war_v3_actions WHERE round_id=? AND status='COMPLETED' AND damage>0 ORDER BY id DESC LIMIT 20`).bind(round.id).all(),
    env.DB.prepare('SELECT id,type,side,title,message,payload_json,created_at FROM territory_war_v3_notices WHERE round_id=? ORDER BY id DESC LIMIT 1').bind(round.id).first()
  ]).then(([actions,notice])=>({recentActionPulse:actions.results||[],notice:notice?{...notice,payload:safeJson(notice.payload_json,{})}:null}));
  realtimePulseCache={key,expiresAt:now+8000,promise};
  try{return await promise}catch(error){if(realtimePulseCache?.promise===promise)realtimePulseCache=null;throw error}
}

async function realtimeState(env,userId){
  const cfg=await settings(env),round=await lifecycle(env,cfg);if(!round)return{round:null,serverNow:iso()};
  if(round.status==='RECRUITING'){
    const [counts={},mine]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN side='A' THEN 1 ELSE 0 END) a_count,SUM(CASE WHEN side='B' THEN 1 ELSE 0 END) b_count FROM territory_war_v3_users WHERE round_id=?").bind(round.id).first(),
      env.DB.prepare('SELECT side,status FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,userId).first()
    ]);
    return{round,front:null,mine:mine||null,counts:{total:Number(counts.total||0),A:Number(counts.a_count||0),B:Number(counts.b_count||0)},version:Number(round.version||0),serverNow:iso()};
  }
  await recoverAppliedForUser(env,userId,cfg);
  let front=null,mine=null;
  if(round.current_front_id){
    const row=await env.DB.prepare(`SELECT f.*,m.side m_side,m.energy m_energy,m.last_recharged_at m_last_recharged_at,m.attacks m_attacks,m.damage m_damage,m.defenses m_defenses FROM territory_war_v3_fronts f LEFT JOIN territory_war_v3_users m ON m.round_id=f.round_id AND m.user_id=? WHERE f.id=?`).bind(userId,round.current_front_id).first();
    if(row){front={...row};for(const key of Object.keys(front))if(key.startsWith('m_'))delete front[key];if(row.m_side){const e=rechargeEnergy({side:row.m_side,energy:row.m_energy,last_recharged_at:row.m_last_recharged_at},cfg,front);mine={side:row.m_side,energy:e.energy,last_recharged_at:e.lastRechargedAt,nextEnergyAt:e.nextEnergyAt,attacks:Number(row.m_attacks||0),damage:Number(row.m_damage||0),defenses:Number(row.m_defenses||0)}}}
  }else{
    const mineRow=await env.DB.prepare('SELECT side,energy,last_recharged_at,attacks,damage,defenses FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,userId).first();if(mineRow){const e=rechargeEnergy(mineRow,cfg);mine={...mineRow,energy:e.energy,nextEnergyAt:e.nextEnergyAt}}
  }
  const mineFull=mine?.side?{...mine,user_id:userId}:null,pulse=await realtimePulse(env,round);return{round,front,mine,truce:truceState(round),comeback:comebackState(round,cfg,front),fatigue:fatigueState(round,front,cfg),lastDefense:front?.last_defense_side?{active:true,side:front.last_defense_side,deadline:front.last_defense_deadline,hpBonusPercent:Number(cfg.lastDefenseHpBonusPercent||35)}:{active:false},counter:await counterState(env,round,mineFull),recentActionPulse:pulse.recentActionPulse,notice:pulse.notice,version:Number(round.version||0),serverNow:iso()};
}

async function reserveAction(env,requestId,userId){
  let row=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();
  if(row){if(Number(row.user_id)!==Number(userId))return{conflict:true};if(row.status==='COMPLETED')return{completed:true,row};if(row.status==='APPLIED')return{applied:true,row};if(row.status==='PENDING'&&Date.now()-sqlMs(row.updated_at)<30000)return{pending:true,row};await env.DB.prepare("UPDATE territory_war_v3_actions SET status='PENDING',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status IN ('PENDING','FAILED')").bind(requestId).run();return{ok:true,row}}
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO territory_war_v3_actions(request_id,user_id,status) VALUES(?,?,'PENDING')").bind(requestId,userId).run();if(Number(inserted?.meta?.changes||0))return{ok:true};row=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();return row&&Number(row.user_id)!==Number(userId)?{conflict:true}:{pending:true,row};
}

async function completeAppliedAction(env,action,cfg){
  const stored={...safeJson(action.result_json,{}),damage:Number(action.damage||0)},front=action.front_id?await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(action.front_id).first():null;
  let resolution={resolved:false};
  if(front&&(front.status==='RESOLVED'||Number(front.a_hp)<=0||Number(front.b_hp)<=0)){
    const resolutionLock=await acquireLock(env,`resolve_${front.id}`,15000);if(resolutionLock.ok){try{const round=action.round_id?await roundById(env,action.round_id):null;resolution=await resolveFront(env,round,front,cfg)}finally{await releaseLock(env,resolutionLock)}}
  }
  const result={...stored,frontResolved:Boolean(resolution.resolved),frontWinner:resolution.winner||null,roundFinished:Boolean(resolution.roundFinished),nextFrontIndex:resolution.nextFront?.node_index??null};
  await env.DB.prepare("UPDATE territory_war_v3_actions SET status='COMPLETED',result_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='APPLIED'").bind(JSON.stringify(result),action.request_id).run();return result;
}

async function completedBattleResponse(env,deps,user,action,cfg,replayed=true){
  let row=action;if(row?.status==='APPLIED'){await completeAppliedAction(env,row,cfg);row=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(row.request_id).first()}
  const compact=safeJson(row?.result_json,{}),result=await hydrateBattleReplay(env,deps,user,row,compact);return deps.json({ok:true,replayed,result,state:await realtimeState(env,user.id)});
}

async function handleActionStatus(env,deps,user,cfg,request){
  const requestId=validRequestId(new URL(request.url).searchParams.get('requestId'));if(!requestId)return deps.json({error:'전투 요청 ID가 올바르지 않습니다.'},400);
  const row=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(!row)return deps.json({ok:true,pending:true,requestId,retryAfterMs:300});if(Number(row.user_id)!==Number(user.id))return deps.json({error:'다른 사용자의 전투 요청입니다.'},403);
  if(row.status==='PENDING')return deps.json({ok:true,pending:true,requestId,retryAfterMs:300});if(row.status==='FAILED')return deps.json({error:row.error_message||'영토전 전투가 완료되지 않았습니다.',failed:true},409);return completedBattleResponse(env,deps,user,row,cfg,true);
}

async function handleAttack(env,deps,user,cfg,body){
  const requestId=validRequestId(body.requestId);if(!requestId)return deps.json({error:'공격 요청 ID가 올바르지 않습니다.'},400);
  const reservation=await reserveAction(env,requestId,user.id);
  if(reservation.conflict)return deps.json({error:'다른 사용자의 요청 ID입니다.'},409);
  if(reservation.pending)return deps.json({ok:true,pending:true,requestId,retryAfterMs:300});
  if(reservation.completed||reservation.applied)return completedBattleResponse(env,deps,user,reservation.row,cfg,true);
  let attackLock=await acquireLock(env,`attack_user_${user.id}`,180000);
  if(!attackLock.ok){
    const inFlight=await env.DB.prepare("SELECT request_id,status FROM territory_war_v3_actions WHERE user_id=? AND request_id<>? AND (status='APPLIED' OR (status='PENDING' AND datetime(updated_at)>=datetime('now','-3 minutes'))) ORDER BY id DESC LIMIT 1").bind(user.id,requestId).first();
    if(inFlight?.request_id){
      // 같은 계정의 중복 클릭/다른 탭 요청은 오류로 만들지 않고 먼저 시작된 교전 결과를 함께 기다린다.
      // 아직 아무 보상도 적용하지 않은 중복 영수증은 즉시 제거해 DB 누적도 막는다.
      await env.DB.prepare("DELETE FROM territory_war_v3_actions WHERE request_id=? AND user_id=? AND status='PENDING'").bind(requestId,user.id).run();
      return deps.json({ok:true,pending:true,requestId:String(inFlight.request_id),retryAfterMs:300,duplicateSuppressed:true});
    }
    // 진행 중인 교전이 없는데 락만 남아 있으면 고아 락이다. 즉시 제거하고 한 번만 재획득한다.
    await env.DB.prepare('DELETE FROM app_meta WHERE key=?').bind(`territory_war_v3_lock_attack_user_${user.id}`).run();
    attackLock=await acquireLock(env,`attack_user_${user.id}`,180000);
    if(!attackLock.ok){
      await env.DB.prepare("UPDATE territory_war_v3_actions SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind('공격 잠금을 다시 확보하지 못했습니다.',requestId).run();
      return deps.json({error:'교전 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',code:'TERRITORY_ATTACK_LOCK_RETRY',retryable:true,retryAfterMs:500},409);
    }
  }
  try{
    const round=await lifecycle(env,cfg);if(!round||round.status!=='ACTIVE')throw new Error('현재 전투 가능한 영토전 회차가 아닙니다.');if(truceState(round).active)throw new Error('임시 휴전 중에는 공격할 수 없습니다. PVP 덱과 장비·칭호를 최신화해 주세요.');
    const front=await activeFront(env,round);if(!front||front.status!=='ACTIVE')throw new Error('현재 교전지가 준비되지 않았습니다.');
    const mine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(!mine||!['A','B'].includes(String(mine.side||'')))throw new Error('현재 회차 참가자가 아닙니다.');
    const energy=rechargeEnergy(mine,cfg,front),cost=clampInt(cfg.attackEnergyCost,1,20,1);if(energy.energy<cost)throw new Error('행동력이 부족합니다.');
    const opponent=await selectBattleOpponent(env,round.id,mine,requestId);if(!opponent)throw new Error('상대 진영 참가자가 없어 교전을 시작할 수 없습니다.');

    // V2 계산은 전선 잠금 밖에서 병렬 처리한다. D1 반영만 짧은 원자 배치로 직렬화된다.
    const simulation=await simulateTerritoryBattle(env,deps,user,mine,opponent,requestId),attackerWon=simulation.battleV2?.result?.winner==='A',winnerSide=attackerWon?String(mine.side):String(opponent.side),siegeSide=String(mine.side),targetSide=siegeSide==='A'?'B':'A',contributorId=Number(user.id),rules=balanceRules(round,cfg),comeback=comebackState(round,cfg,front),comebackActive=comeback.active&&comeback.losingSide===siegeSide,siegeDamageRate=attackerWon?1:Number(rules.defeatSiegeDamagePercent||0)/100,comebackMultiplier=comebackActive?1+comeback.damageBonusPercent/100:1;
    const [ace,lossRows]=await Promise.all([env.DB.prepare(`SELECT user_id FROM territory_war_v3_users WHERE round_id=? AND side=? ORDER BY damage DESC,attacks DESC,user_id LIMIT 1`).bind(round.id,targetSide).first(),env.DB.prepare(`SELECT winner_side FROM territory_war_v3_actions WHERE round_id=? AND user_id=? AND status='COMPLETED' ORDER BY id DESC LIMIT 2`).bind(round.id,user.id).all()]);
    const aceTarget=Number(ace?.user_id||0)===Number(opponent.user_id),strongChallenge=Number(simulation.defenderPower||0)>Number(simulation.attackerPower||0)*1.2,lossStreak=((lossRows?.results||[]).length===2&&(lossRows.results||[]).every(row=>String(row.winner_side)!==siegeSide)),counterEligible=comebackActive,counterGained=counterEligible?Number(cfg.counterParticipationPoints||18)+(attackerWon?0:Number(cfg.counterDefeatPoints||12))+(strongChallenge?Number(cfg.counterStrongChallengePoints||20):0)+(lossStreak?20:0)+(aceTarget?(attackerWon?Number(cfg.counterAceWinPoints||120):Number(cfg.counterAceDamagePoints||35)):0):0;
    const siegeOperation=activeOperation(round,siegeSide),defenseOperation=activeOperation(round,targetSide),baseDefenseCounterGained=!attackerWon&&comeback.active&&comeback.losingSide===targetSide?Number(cfg.counterDefensePoints||16):0,counterBatteryTriggered=!attackerWon&&defenseOperation.code==='COUNTER_BATTERY',defenseCounterGained=baseDefenseCounterGained+(counterBatteryTriggered?Number(cfg.counterBatteryGaugeBonus||48):0);
    const revisitCount=Math.max(0,Number(front.revisit_count||0)),siegeAccelerationPercent=Math.min(30,revisitCount*10),fatigue=fatigueState(round,front,cfg),fatigueMultiplier=fatigue.side===siegeSide?1-fatigue.damagePenaltyPercent/100:1,assaultMultiplier=siegeOperation.code==='ASSAULT'?1+Number(cfg.assaultDamageBonusPercent||25)/100:1,spgSuppression=defenseOperation.code==='COUNTER_BATTERY'?1-Number(cfg.counterBatterySuppressionPercent||70)/100:1,spgMultiplier=siegeOperation.code==='SPG_BARRAGE'?1+(Number(cfg.spgDamageBonusPercent||35)/100)*spgSuppression:1,ironWallMultiplier=defenseOperation.code==='IRON_WALL'?1-Number(cfg.ironWallDamageReductionPercent||25)/100:1,airDefenseMultiplier=defenseOperation.code==='AIR_DEFENSE'?1-Number(cfg.airDefenseDamageReductionPercent||12)/100:1,sourceAttackerPower=Math.max(1,Number(mine.formation_power||mine.deck_power||simulation.attackerPower||0)),planned=Math.max(0,Math.round(damageFor(sourceAttackerPower,`${requestId}:${siegeSide}:SIEGE`,cfg)*siegeDamageRate*(1+siegeAccelerationPercent/100)*comebackMultiplier*fatigueMultiplier*assaultMultiplier*spgMultiplier*ironWallMultiplier*airDefenseMultiplier)),hpColumn=targetSide==='A'?'a_hp':'b_hp',targetHp=Number(front[hpColumn]||0);if(targetHp<=0)throw new Error('이미 종료된 교전입니다.');
    const predictedActual=Math.max(0,Math.min(targetHp,planned)),predictedAfter=Math.max(0,targetHp-predictedActual),winnerHpPercent=resultHpPercent(simulation.battleV2,attackerWon?'A':'B'),personalWinCoin=attackerWon?clampInt(cfg.individualBattleWinCoin,0,100000000,0):0;
    const compact={requestId,roundId:round.id,frontId:front.id,nodeIndex:front.node_index,nodeCode:front.node_code,nodeName:front.node_name,revisitCount,siegeAccelerationPercent,siegeDamagePercent:Math.round(siegeDamageRate*100),comebackActive,comebackTier:comebackActive?comeback.tier:0,comebackTitle:comebackActive?comeback.title:'',comebackDamageBonusPercent:comebackActive?comeback.damageBonusPercent:0,counterGained,defenseCounterGained,counterBatteryTriggered,aceTarget,strongChallenge,fatiguePenaltyPercent:fatigue.side===siegeSide?fatigue.damagePenaltyPercent:0,operation:siegeOperation.code,defensiveOperation:defenseOperation.code,side:mine.side,opponentSide:opponent.side,opponentUserId:Number(opponent.user_id),opponentNickname:String(opponent.nickname||'상대 참가자'),matchPowerGapPercent:Number(opponent.match_power_gap_percent||0),matchPoolSize:Number(opponent.match_pool_size||1),matchPowerEqualized:Boolean(simulation.matchBalance?.active),matchPowerCapPercent:Number(simulation.matchBalance?.capPercent||15),attackerWon,winnerSide,targetSide,contributorUserId:contributorId,damage:predictedActual,personalWinCoin,energySpent:cost,energyAfter:energy.energy-cost,targetHpBefore:targetHp,targetHpAfter:predictedAfter,battleSeed:simulation.battleSeed,winnerHpPercent};
    const actualExpr=`MIN(?,COALESCE((SELECT ${hpColumn} FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE'),0))`,activeExpr=`EXISTS(SELECT 1 FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE' AND ${hpColumn}>0) AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='PENDING')`;
    const attackerDamage=actualExpr,defenderDamage='0',attackerFinish=`CASE WHEN ?>=COALESCE((SELECT ${hpColumn} FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE'),1) THEN 1 ELSE 0 END`,defenderFinish='0';
    const attackerSql=`UPDATE territory_war_v3_users SET energy=?,last_recharged_at=?,attacks=attacks+1,damage=damage+${attackerDamage},front_finishes=front_finishes+${attackerFinish},updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND ${activeExpr}`;
    const defenderSql=`UPDATE territory_war_v3_users SET defenses=defenses+1,defense_wins=defense_wins+?,defense_losses=defense_losses+?,damage=damage+${defenderDamage},front_finishes=front_finishes+${defenderFinish},updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND ${activeExpr}`;
    const roundSql=`UPDATE territory_war_v3_rounds SET a_total_damage=a_total_damage+${siegeSide==='A'?actualExpr:'0'},b_total_damage=b_total_damage+${siegeSide==='B'?actualExpr:'0'},version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${activeExpr}`;
    const meta={engine:'PROJECT_V_V3_SIEGE',seed:simulation.battleSeed,opponentUserId:Number(opponent.user_id),opponentNickname:String(opponent.nickname||'상대 참가자'),matchPowerGapPercent:Number(opponent.match_power_gap_percent||0),matchPoolSize:Number(opponent.match_pool_size||1),matchPowerEqualized:Boolean(simulation.matchBalance?.active),matchPowerCapPercent:Number(simulation.matchBalance?.capPercent||15),matchPowerOriginalGapPercent:Number(simulation.matchBalance?.gapPercent||0),winnerSide,targetSide,attackerWon,siegeDamagePercent:Math.round(siegeDamageRate*100),comebackActive,comebackTier:comebackActive?comeback.tier:0,comebackDamageBonusPercent:comebackActive?comeback.damageBonusPercent:0,operation:siegeOperation.code,defensiveOperation:defenseOperation.code,counterBatteryTriggered,sourceAttackerPower,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,winnerHpPercent};

    const attackerBinds=[energy.energy-cost,energy.lastRechargedAt,planned,front.id,planned,front.id,round.id,user.id,front.id,requestId];
    const defenderBinds=[attackerWon?0:1,attackerWon?1:0,round.id,opponent.user_id,front.id,requestId];
    const roundBinds=[];if(siegeSide==='A')roundBinds.push(planned,front.id);if(siegeSide==='B')roundBinds.push(planned,front.id);roundBinds.push(round.id,front.id,requestId);
    const actionSql=`UPDATE territory_war_v3_actions SET round_id=?,front_id=?,opponent_user_id=?,contributor_user_id=?,side=?,winner_side=?,target_side=?,battle_seed=?,counter_gained=?,ace_target=?,status='APPLIED',damage=${actualExpr},energy_spent=?,result_json=?,battle_meta_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING' AND ${activeExpr}`;
    const actionBinds=[round.id,front.id,opponent.user_id,contributorId,mine.side,winnerSide,targetSide,simulation.battleSeed,counterGained,aceTarget?1:0,planned,front.id,cost,JSON.stringify(compact),JSON.stringify(meta),requestId,front.id,requestId];
    const frontSql=`UPDATE territory_war_v3_fronts SET ${hpColumn}=MAX(0,${hpColumn}-?),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE' AND ${hpColumn}>0 AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED')`;

    await env.DB.batch([
      env.DB.prepare(attackerSql).bind(...attackerBinds),
      env.DB.prepare(defenderSql).bind(...defenderBinds),
      env.DB.prepare(roundSql).bind(...roundBinds),
      env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ?>0 AND ${activeExpr}`).bind(personalWinCoin,user.id,personalWinCoin,front.id,requestId),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'영토전 개인 교전 승리' FROM users WHERE id=? AND ?>0 AND ${activeExpr}`).bind(user.id,personalWinCoin,user.id,personalWinCoin,front.id,requestId),
      env.DB.prepare(actionSql).bind(...actionBinds),
      env.DB.prepare(`UPDATE territory_war_v3_users SET counter_contribution=counter_contribution+?,ace_defeats=ace_defeats+?,comeback_participations=comeback_participations+? WHERE round_id=? AND user_id=? AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED')`).bind(counterGained,aceTarget&&attackerWon?1:0,counterEligible?1:0,round.id,user.id,requestId),
      env.DB.prepare(`UPDATE territory_war_v3_users SET counter_contribution=counter_contribution+? WHERE round_id=? AND user_id=? AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED')`).bind(defenseCounterGained,round.id,opponent.user_id,requestId),
      env.DB.prepare(`UPDATE territory_war_v3_rounds SET ${sideField(siegeSide,'counter_gauge')}=CASE WHEN (SELECT COUNT(*) FROM territory_war_v3_operation_uses WHERE round_id=? AND side=?)>=? THEN 0 ELSE MIN(?,${sideField(siegeSide,'counter_gauge')}+?) END,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED')`).bind(round.id,siegeSide,Object.keys(OPERATIONS).length,Number(cfg.counterGaugeMax||1000),counterGained,round.id,requestId),
      env.DB.prepare(`UPDATE territory_war_v3_rounds SET ${sideField(targetSide,'counter_gauge')}=CASE WHEN (SELECT COUNT(*) FROM territory_war_v3_operation_uses WHERE round_id=? AND side=?)>=? THEN 0 ELSE MIN(?,${sideField(targetSide,'counter_gauge')}+?) END,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED')`).bind(round.id,targetSide,Object.keys(OPERATIONS).length,Number(cfg.counterGaugeMax||1000),defenseCounterGained,round.id,requestId),
      env.DB.prepare(frontSql).bind(planned,front.id,requestId)
    ]);
    let action=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(action?.status!=='APPLIED')throw new Error('교전지가 이미 변경되었습니다. 행동력은 소모되지 않았습니다.');
    const actual=Number(action.damage||0),stored={...safeJson(action.result_json,compact),damage:actual,targetHpAfter:Math.max(0,Number(safeJson(action.result_json,compact).targetHpBefore||targetHp)-actual)};await env.DB.prepare("UPDATE territory_war_v3_actions SET result_json=? WHERE request_id=? AND status='APPLIED'").bind(JSON.stringify(stored),requestId).run();action={...action,result_json:JSON.stringify(stored)};
    const completed=await completeAppliedAction(env,action,cfg),result={...completed,battleV2:simulation.battleV2,opponent:simulation.opponent,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,battleEngine:{active:true,version:'V3',renderer:'PIXIJS',mode:'SIEGE'}};
    return deps.json({ok:true,result,state:await realtimeState(env,user.id)});
  }catch(error){const row=await env.DB.prepare('SELECT status FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(row?.status==='PENDING')await env.DB.prepare("UPDATE territory_war_v3_actions SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(String(error.message||error).slice(0,300),requestId).run();return deps.json({error:error.message||'영토전 교전 처리에 실패했습니다.',retryable:/변경|처리/.test(String(error.message||''))},409)}finally{await releaseLock(env,attackLock)}
}

async function recoverAppliedForUser(env,userId,cfg){
  const rows=await env.DB.prepare("SELECT * FROM territory_war_v3_actions WHERE user_id=? AND status='APPLIED' ORDER BY id LIMIT 3").bind(userId).all();
  for(const action of rows.results||[]){
    try{await completeAppliedAction(env,action,cfg)}catch(error){console.error('territory applied action recovery failed',{userId,requestId:action.request_id,error:String(error?.message||error)})}
  }
}

async function claimV3(env,deps,user){
  const lock=await acquireLock(env,`claim_${user.id}`,60000);if(!lock.ok)return deps.json({error:'보상 수령을 처리 중입니다.'},409);
  try{
    const reward=await rewardForUser(env,user.id);if(!reward)return deps.json({error:'수령 가능한 보상이 없습니다.'},404);
    const participationItems=reward.version==='V3'?participationInventoryReward(reward.attacks):{scrapyardTickets:0,mysticEnergy:0},coin=Number(reward.coin||0),shards=Number(reward.shards||0),premiumCubes=reward.version==='V3'?Math.max(0,Number(reward.premium_cube_quantity||0)):0,scrapyardTickets=participationItems.scrapyardTickets,mysticEnergy=participationItems.mysticEnergy,bonusEquipment=reward.version==='V3'&&reward.result==='WIN'?(reward.bonusEquipment||[]):[],table=reward.version==='V3'?'territory_war_v3_rewards':'territory_war_rewards',statements=[
      env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(coin,shards,user.id,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'영토전 보상' FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,coin,user.id,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT ?,?,card_shards,'영토전 보상',NULL FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,shards,user.id,reward.round_id,user.id)
    ];
    if(premiumCubes>0)statements.push(
      env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'PREMIUM_CUBE',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,premiumCubes,premiumCubes,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'PREMIUM_CUBE',?,quantity,'TERRITORY_WAR_ATTACK_REWARD','TERRITORY_WAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code='PREMIUM_CUBE' AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,premiumCubes,String(reward.round_id),user.id,reward.round_id,user.id)
    );
    if(scrapyardTickets>0)statements.push(
      env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'SCRAPYARD_ENTRY_TICKET',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,scrapyardTickets,scrapyardTickets,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'SCRAPYARD_ENTRY_TICKET',?,quantity,'TERRITORY_WAR_100_ATTACK_REWARD','TERRITORY_WAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code='SCRAPYARD_ENTRY_TICKET' AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,scrapyardTickets,String(reward.round_id),user.id,reward.round_id,user.id)
    );
    if(mysticEnergy>0)statements.push(
      env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'STARLIGHT_ARMOR_CORE',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,mysticEnergy,mysticEnergy,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'STARLIGHT_ARMOR_CORE',?,quantity,'TERRITORY_WAR_100_ATTACK_REWARD','TERRITORY_WAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code='STARLIGHT_ARMOR_CORE' AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,mysticEnergy,String(reward.round_id),user.id,reward.round_id,user.id)
    );
    for(const item of bonusEquipment){
      const equipmentId=Math.max(0,Number(item.equipment_id||0)),quantity=Math.min(100,Math.max(0,Number(item.quantity||0)));
      for(let index=0;equipmentId&&index<quantity;index++)statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
        SELECT ?,?,'TERRITORY_WAR',?,?
        WHERE EXISTS(SELECT 1 FROM territory_war_v3_rewards WHERE round_id=? AND user_id=? AND claimed_at IS NULL AND result='WIN')`).bind(user.id,equipmentId,String(reward.round_id),`TW3-${reward.round_id}-${user.id}-${equipmentId}-${index+1}`,reward.round_id,user.id));
    }
    statements.push(env.DB.prepare(`UPDATE ${table} SET claimed_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND claimed_at IS NULL`).bind(reward.round_id,user.id));
    const results=await env.DB.batch(statements),claimed=results?.[results.length-1];
    if(!Number(claimed?.meta?.changes||0))return deps.json({error:'이미 수령한 보상입니다.'},409);return deps.json({ok:true,coin,shards,premiumCubes,scrapyardTickets,mysticEnergy,bonusEquipment,state:await publicState(env,user.id)});
  }finally{await releaseLock(env,lock)}
}

async function reserveAdminOperation(env,key,action,roundId,adminId){
  const prior=await env.DB.prepare('SELECT * FROM territory_war_v3_admin_operations WHERE operation_key=?').bind(key).first();if(prior?.status==='COMPLETED')return{response:safeJson(prior.response_json,{ok:true})};if(prior&&(prior.action!==action||Number(prior.round_id||0)!==Number(roundId||0)))return{conflict:true};if(prior?.status==='PENDING'&&Date.now()-sqlMs(prior.updated_at)<180000)return{pending:true};if(prior){await env.DB.prepare("UPDATE territory_war_v3_admin_operations SET status='PENDING',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE operation_key=?").bind(key).run();return{ok:true}}const inserted=await env.DB.prepare("INSERT OR IGNORE INTO territory_war_v3_admin_operations(operation_key,action,round_id,admin_id,status) VALUES(?,?,?,?, 'PENDING')").bind(key,action,roundId||null,adminId).run();return Number(inserted?.meta?.changes||0)?{ok:true}:{pending:true};
}
async function completeAdmin(env,key,response){await env.DB.prepare("UPDATE territory_war_v3_admin_operations SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE operation_key=?").bind(JSON.stringify(response),key).run()}
async function failAdmin(env,key,error){await env.DB.prepare("UPDATE territory_war_v3_admin_operations SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE operation_key=? AND status='PENDING'").bind(String(error?.message||error||'FAILED').slice(0,300),key).run()}

function cleanSettings(body,current){return{
  ...current,
  mode:['OFF','TEST','ON'].includes(String(body.mode||'').toUpperCase())?String(body.mode).toUpperCase():current.mode,
  battleName:String(body.battleName??current.battleName??'').trim().slice(0,40),
  teamAName:cleanLabel(body.teamAName??current.teamAName,'A 진영',20),teamBName:cleanLabel(body.teamBName??current.teamBName,'B 진영',20),
  recruitmentHours:clampInt(body.recruitmentHours,1,168,current.recruitmentHours),preparationMinutes:clampInt(body.preparationMinutes,0,1440,current.preparationMinutes),roundMinutes:clampInt(body.roundMinutes,10,10080,current.roundMinutes),minParticipants:clampInt(body.minParticipants,2,10000,current.minParticipants),
  energyMax:clampInt(body.energyMax,1,100,current.energyMax),energyMinutes:clampInt(body.energyMinutes,1,1440,current.energyMinutes),attackEnergyCost:clampInt(body.attackEnergyCost,1,20,current.attackEnergyCost),realtimePollSeconds:clampInt(body.realtimePollSeconds,2,15,current.realtimePollSeconds),
  baseSiegeHp:clampInt(body.baseSiegeHp,1000,1000000000,current.baseSiegeHp),outpostHpMultiplier:clamp(body.outpostHpMultiplier,1,10,current.outpostHpMultiplier),midHpMultiplier:clamp(body.midHpMultiplier,1,10,current.midHpMultiplier),gateHpMultiplier:clamp(body.gateHpMultiplier,1,10,current.gateHpMultiplier),homeHpMultiplier:clamp(body.homeHpMultiplier,1,20,current.homeHpMultiplier),
  damageScale:clamp(body.damageScale,.1,100,current.damageScale),minDamage:clampInt(body.minDamage,1,10000000,current.minDamage),maxDamage:clampInt(body.maxDamage,1,100000000,current.maxDamage),damageVariancePercent:clampInt(body.damageVariancePercent,0,40,current.damageVariancePercent),recentActionLimit:clampInt(body.recentActionLimit,5,50,current.recentActionLimit),
  individualBattleWinCoin:clampInt(body.individualBattleWinCoin,0,100000000,current.individualBattleWinCoin),
  winnerCoin:clampInt(body.winnerCoin,0,MAX_SETTLEMENT_REWARD_COMPONENT_COIN,current.winnerCoin),loserCoin:clampInt(body.loserCoin,0,MAX_SETTLEMENT_REWARD_COMPONENT_COIN,current.loserCoin),drawCoin:clampInt(body.drawCoin,0,MAX_SETTLEMENT_REWARD_COMPONENT_COIN,current.drawCoin),participationShards:clampInt(body.participationShards,0,1000000,current.participationShards),contributionCoinPer1000Damage:clampInt(body.contributionCoinPer1000Damage,0,1000000,current.contributionCoinPer1000Damage),maxContributionCoin:clampInt(body.maxContributionCoin,0,MAX_SETTLEMENT_REWARD_COMPONENT_COIN,current.maxContributionCoin),settlementMinAttacks:clampInt(body.settlementMinAttacks,0,10000,current.settlementMinAttacks),
  attackRewardStarterPercent:clampInt(body.attackRewardStarterPercent,0,300,current.attackRewardStarterPercent??25),attackRewardTier1Attacks:clampInt(body.attackRewardTier1Attacks,1,1000000,current.attackRewardTier1Attacks??10),attackRewardTier1Percent:clampInt(body.attackRewardTier1Percent,0,300,current.attackRewardTier1Percent??50),attackRewardTier2Attacks:clampInt(body.attackRewardTier2Attacks,1,1000000,current.attackRewardTier2Attacks??30),attackRewardTier2Percent:clampInt(body.attackRewardTier2Percent,0,300,current.attackRewardTier2Percent??80),attackRewardTier3Attacks:clampInt(body.attackRewardTier3Attacks,1,1000000,current.attackRewardTier3Attacks??60),attackRewardTier3Percent:clampInt(body.attackRewardTier3Percent,0,300,current.attackRewardTier3Percent??100),attackRewardTier4Attacks:clampInt(body.attackRewardTier4Attacks,1,1000000,current.attackRewardTier4Attacks??100),attackRewardTier4Percent:clampInt(body.attackRewardTier4Percent,0,300,current.attackRewardTier4Percent??125),
  siegeSnapshotLimit:clampInt(body.siegeSnapshotLimit,1,20,current.siegeSnapshotLimit??12),siegeSnapshotAttackThreshold:clampInt(body.siegeSnapshotAttackThreshold,0,1000000,current.siegeSnapshotAttackThreshold??200),siegeSnapshotBonusCoin:clampInt(body.siegeSnapshotBonusCoin,0,MAX_SETTLEMENT_REWARD_COMPONENT_COIN,current.siegeSnapshotBonusCoin??500000),
  siegeParticipationCubeThreshold:clampInt(body.siegeParticipationCubeThreshold,1,1000000,current.siegeParticipationCubeThreshold??100),siegeParticipationCubeQuantity:clampInt(body.siegeParticipationCubeQuantity,0,1000000,current.siegeParticipationCubeQuantity??10),
  massAssaultDamagePercent:clampInt(body.massAssaultDamagePercent,1,90,current.massAssaultDamagePercent??39)
}}

export async function handleTerritoryWar({path,request,env,deps}){
  if(!String(path).startsWith('territory-war')&&!String(path).startsWith('admin/territory-war'))return null;
  territoryRuntimeDeps=deps;await ensureFoundation(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);const admin=deps.isAdminRole(user),cfg=await settings(env);
  if(path==='territory-war/truce-status'&&request.method==='GET'){const round=await env.DB.prepare("SELECT id,status,truce_ends_at,truce_duration_minutes FROM territory_war_v3_rounds WHERE status IN ('PREPARING','ACTIVE') ORDER BY id DESC LIMIT 1").first();return deps.json({roundId:Number(round?.id||0),truce:truceState(round),serverNow:iso()})}
  if(path==='territory-war/state'&&request.method==='GET')return deps.json(await publicState(env,user.id));
  if(path==='territory-war/state-lite'&&request.method==='GET')return deps.json(await realtimeState(env,user.id));
  if(path==='territory-war/action-status'&&request.method==='GET')return handleActionStatus(env,deps,user,cfg,request);
  if(path==='territory-war/register'&&request.method==='POST'){
    const mode=String(cfg.mode||'OFF').toUpperCase();if(mode==='OFF')return deps.json({error:'영토전 운영이 중지되었습니다.'},409);const round=await lifecycle(env,cfg),canJoin=round&&round.status==='RECRUITING';if(!canJoin)return deps.json({error:'참가 모집이 종료되어 현재 회차에는 입장할 수 없습니다.'},409);
    const existing=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(existing)return deps.json({ok:true,alreadyRegistered:true,state:await publicState(env,user.id)});
    const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)return deps.json({error:'PVP 덱 5장을 먼저 편성하세요.'},400);const bs=await deps.battleSettings(env),snapshot=await singleFormationSnapshot(env,deps,user,deck,bs),power=snapshot.formationPower;
    await env.DB.prepare(`INSERT INTO territory_war_v3_users(round_id,user_id,deck_power,formation_power,formation_breakdown_json,deck_snapshot,loadout_bonus_json,side,status,energy,last_recharged_at) VALUES(?,?,?,?,?,?,?,NULL,'WAITING',?,CURRENT_TIMESTAMP)`).bind(round.id,user.id,power,power,JSON.stringify(snapshot.breakdown),JSON.stringify(deck.map(card=>String(card.id))),JSON.stringify(snapshot.loadoutBonus),Number(cfg.energyMax||10)).run();return deps.json({ok:true,lateJoined:false,side:null,state:await publicState(env,user.id)});
  }
  if(path==='territory-war/unregister'&&request.method==='POST'){const round=await lifecycle(env,cfg);if(!round||round.status!=='RECRUITING')return deps.json({error:'모집 중에만 참가 신청을 취소할 수 있습니다.'},409);await env.DB.prepare('DELETE FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).run();return deps.json({ok:true,state:await publicState(env,user.id)})}
  if(path==='territory-war/refresh-loadout'&&request.method==='POST'){
    const round=await lifecycle(env,cfg);if(!round||!truceState(round).active)return deps.json({error:'전투 준비 최신화는 임시 휴전 중에만 가능합니다.'},409);const mine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(!mine||!['A','B'].includes(String(mine.side||'')))return deps.json({error:'현재 회차 참가자만 최신화할 수 있습니다.'},403);
    const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)return deps.json({error:'PVP 덱 5장을 먼저 편성하세요.'},400);const bs=await deps.battleSettings(env),snapshot=await singleFormationSnapshot(env,deps,user,deck,bs),power=snapshot.formationPower;await env.DB.prepare('UPDATE territory_war_v3_users SET deck_snapshot=?,deck_power=?,formation_power=?,formation_breakdown_json=?,loadout_bonus_json=?,loadout_refreshed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?').bind(JSON.stringify(deck.map(card=>String(card.id))),power,power,JSON.stringify(snapshot.breakdown),JSON.stringify(snapshot.loadoutBonus),round.id,user.id).run();for(const key of participantDeckCache.keys())if(key.startsWith(`${round.id}:${user.id}:`))participantDeckCache.delete(key);publicStateSharedCache=null;return deps.json({ok:true,deckPower:power,formationBreakdown:snapshot.breakdown,state:await publicState(env,user.id)});
  }
  if(path==='territory-war/attack'&&request.method==='POST')return handleAttack(env,deps,user,cfg,await deps.readBody(request));
  if((path==='territory-war/activate-operation'||path==='territory-war/vote-operation')&&request.method==='POST')return activateCommanderOperation(env,deps,user,cfg,await deps.readBody(request));
  if(path==='territory-war/commander-message'&&request.method==='POST')return sendCommanderMessage(env,deps,user,cfg,await deps.readBody(request));
  if(path==='territory-war/claim'&&request.method==='POST')return claimV3(env,deps,user);
  if(path==='admin/territory-war/settings'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    if(request.method==='GET'){const state=await publicState(env,user.id,true),used=state.round?(await env.DB.prepare('SELECT * FROM territory_war_v3_mass_assault_uses WHERE round_id=? ORDER BY side').bind(state.round.id).all()).results||[]:[],roundBonusEquipment=state.round?await roundEquipmentBonuses(env,state.round.id,'WIN'):[],massAssaultBySide={A:massAssaultPreview(state.round,state.front,cfg,used,'A'),B:massAssaultPreview(state.round,state.front,cfg,used,'B')};return deps.json({settings:cfg,state,massAssaultBySide,massAssault:massAssaultBySide.A,roundBonusEquipment,isOwner:String(user.role||'').toUpperCase()==='OWNER'});}
    if(request.method==='POST'){
      const next=cleanSettings(await deps.readBody(request),cfg);if(Number(next.maxDamage)<Number(next.minDamage))next.maxDamage=next.minDamage;next.attackRewardTier2Attacks=Math.max(Number(next.attackRewardTier1Attacks)+1,Number(next.attackRewardTier2Attacks));next.attackRewardTier3Attacks=Math.max(Number(next.attackRewardTier2Attacks)+1,Number(next.attackRewardTier3Attacks));next.attackRewardTier4Attacks=Math.max(Number(next.attackRewardTier3Attacks)+1,Number(next.attackRewardTier4Attacks));
      await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('territory_war_settings_v3',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();invalidateSettingsCache();
      const round=await latestRound(env);
      if(round&&['RECRUITING','PREPARING','ACTIVE'].includes(round.status))await env.DB.prepare("UPDATE territory_war_v3_rounds SET battle_name=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next.battleName,round.id).run();
      if(round?.status==='RECRUITING'){
        const recruitmentEndsAt=iso(Date.now()+Number(next.recruitmentHours||3)*3600000);
        await env.DB.prepare("UPDATE territory_war_v3_rounds SET recruitment_ends_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'").bind(recruitmentEndsAt,round.id).run();
      }
      if(next.mode==='OFF'&&round&&['RECRUITING','PREPARING','ACTIVE'].includes(round.status))await env.DB.prepare("UPDATE territory_war_v3_rounds SET status='DISABLED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(round.id).run();
      if(next.mode!=='OFF'&&(!round||['FINISHED','DISABLED'].includes(round.status)))await createRound(env,next);
      publicStateSharedCache=null;return deps.json({ok:true,settings:next,state:await publicState(env,user.id,true)});
    }
  }
  if(path==='admin/territory-war/mass-assault'&&request.method==='POST'){
    if(String(user.role||'').toUpperCase()!=='OWNER')return deps.json({error:'인해전술은 OWNER만 발동할 수 있습니다.'},403);const body=await deps.readBody(request),key=validRequestId(body.operationKey),side=String(body.side||'').toUpperCase();if(!key)return deps.json({error:'유효한 작전 요청 키가 필요합니다.'},400);if(!['A','B'].includes(side))return deps.json({error:'인해전술을 발동할 진영을 선택하세요.'},400);return executeMassAssault(env,deps,user,cfg,key,side);
  }
  if(path==='admin/territory-war/truce'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);const body=await deps.readBody(request),key=validRequestId(body.operationKey);if(!key)return deps.json({error:'유효한 휴전 요청 키가 필요합니다.'},400);const round=await lifecycle(env,cfg);if(!round||round.status!=='ACTIVE')return deps.json({error:'진행 중인 영토전에서만 휴전할 수 있습니다.'},409);const reserve=await reserveAdminOperation(env,key,'TRUCE',round.id,user.id);if(reserve.response)return deps.json(reserve.response);if(reserve.pending)return deps.json({error:'동일한 휴전 요청을 처리 중입니다.'},409);if(reserve.conflict)return deps.json({error:'다른 작업에서 사용한 요청 키입니다.'},409);
    try{const durationMinutes=clampInt(body.durationMinutes,1,360,15),endsAt=iso(Date.now()+durationMinutes*60000);await env.DB.prepare('UPDATE territory_war_v3_rounds SET truce_ends_at=?,truce_duration_minutes=?,truce_started_by=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'ACTIVE\'').bind(endsAt,durationMinutes,user.id,round.id).run();await addNotice(env,round.id,'TRUCE',null,`${durationMinutes}분 임시 휴전`,`관리자 명령으로 ${durationMinutes}분간 공격이 중단됩니다. 휴전 중 PVP 덱과 장비·칭호를 최신화할 수 있습니다.`,{endsAt,durationMinutes,image:'assets/ui/territory-war/truce-v1811.webp'});publicStateSharedCache=null;const response={ok:true,endsAt,durationMinutes,state:await publicState(env,user.id,true)};await completeAdmin(env,key,response);if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'TERRITORY_TRUCE','TERRITORY_WAR_ROUND',String(round.id),null,{endsAt,durationMinutes});return deps.json(response)}catch(error){await failAdmin(env,key,error);return deps.json({error:error.message||'임시 휴전 발동에 실패했습니다.'},409)}
  }
  if(path==='admin/territory-war/reset-command-messages'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    const round=await latestRound(env);if(!round)return deps.json({error:'초기화할 영토전 회차가 없습니다.'},404);
    const before=await env.DB.prepare('SELECT COUNT(*) count FROM territory_war_v3_command_messages WHERE round_id=?').bind(round.id).first();
    const result=await env.DB.prepare('DELETE FROM territory_war_v3_command_messages WHERE round_id=?').bind(round.id).run();
    const removed=Math.max(Number(before?.count||0),Number(result?.meta?.changes||0));
    publicStateSharedCache=null;
    if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'TERRITORY_COMMAND_MESSAGES_RESET','TERRITORY_WAR_ROUND',String(round.id),{messageCount:Number(before?.count||0)},{messageCount:0});
    return deps.json({ok:true,roundId:Number(round.id),removed,state:await publicState(env,user.id,true)});
  }
  if(path==='admin/territory-war/assign-participant-side'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    const body=await deps.readBody(request),nickname=String(body.nickname||'').trim(),targetSide=String(body.targetSide||'').trim().toUpperCase();
    if(!nickname)return deps.json({error:'배치할 닉네임을 입력하세요.'},400);
    if(!['A','B'].includes(targetSide))return deps.json({error:'배치할 진영을 선택하세요.'},400);
    const matches=(await env.DB.prepare('SELECT id,nickname,role FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(nickname).all()).results||[];
    if(!matches.length)return deps.json({error:`닉네임 ${nickname} 계정을 찾을 수 없습니다.`},404);
    if(matches.length>1)return deps.json({error:`닉네임 ${nickname} 계정이 여러 개입니다. 유저 ID로 확인한 뒤 다시 시도하세요.`},409);
    const target=matches[0],round=await latestRound(env);if(!round||!['PREPARING','ACTIVE'].includes(String(round.status||'')))return deps.json({error:'수동 진영 배치가 가능한 진행 회차가 없습니다.'},409);
    const existing=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,target.id).first(),before=existing?{roundId:Number(round.id),userId:Number(target.id),nickname:String(target.nickname),side:String(existing.side||''),status:String(existing.status||''),deckPower:Number(existing.deck_power||0)}:null;
    if(existing){
      await env.DB.batch([env.DB.prepare("UPDATE territory_war_v3_users SET side=?,status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?").bind(targetSide,round.id,target.id),env.DB.prepare('DELETE FROM territory_war_v3_operation_votes WHERE round_id=? AND user_id=?').bind(round.id,target.id)]);
    }else{
      const deck=await deps.pvpDeckSnapshot(env,target.id);if(deck.length!==5)return deps.json({error:`${target.nickname} 계정의 PVP 덱 5장이 완성되지 않아 영토전에 합류시킬 수 없습니다.`},409);
      const battle=await deps.battleSettings(env),snapshot=await singleFormationSnapshot(env,deps,target,deck,battle);
      await env.DB.prepare(`INSERT INTO territory_war_v3_users(round_id,user_id,deck_power,formation_power,formation_breakdown_json,deck_snapshot,loadout_bonus_json,side,status,energy,last_recharged_at) VALUES(?,?,?,?,?,?,?,?, 'ACTIVE',?,CURRENT_TIMESTAMP)`).bind(round.id,target.id,snapshot.formationPower,snapshot.formationPower,JSON.stringify(snapshot.breakdown),JSON.stringify(deck.map(card=>String(card.id))),JSON.stringify(snapshot.loadoutBonus),targetSide,Number(cfg.energyMax||10)).run();
    }
    for(const key of participantDeckCache.keys())if(key.startsWith(`${round.id}:${target.id}:`))participantDeckCache.delete(key);publicStateSharedCache=null;realtimePulseCache=null;
    const after=await env.DB.prepare('SELECT round_id,user_id,side,status,deck_power,attacks,damage FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,target.id).first();
    if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'TERRITORY_PARTICIPANT_SIDE_ASSIGN','TERRITORY_WAR_USER',`${round.id}:${target.id}`,before,{roundId:Number(round.id),userId:Number(target.id),nickname:String(target.nickname),side:targetSide,status:String(after?.status||'ACTIVE'),deckPower:Number(after?.deck_power||0),attacks:Number(after?.attacks||0),damage:Number(after?.damage||0)});
    return deps.json({ok:true,created:!existing,changed:!existing||String(existing.side||'')!==targetSide,roundId:Number(round.id),userId:Number(target.id),nickname:String(target.nickname),side:targetSide,teamName:configuredTeamLabel(cfg,targetSide),state:await publicState(env,user.id,true)});
  }
  if(path==='admin/territory-war/assign-commander'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    const body=await deps.readBody(request),nickname=String(body.nickname||'').trim(),targetSide=String(body.targetSide||'').trim().toUpperCase();
    if(!nickname)return deps.json({error:'지휘관 닉네임을 입력하세요.'},400);
    if(!['A','B'].includes(targetSide))return deps.json({error:'지휘관 진영을 선택하세요.'},400);
    const matches=(await env.DB.prepare('SELECT id,nickname,role FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(nickname).all()).results||[];
    if(!matches.length)return deps.json({error:`닉네임 ${nickname} 계정을 찾을 수 없습니다.`},404);
    if(matches.length>1)return deps.json({error:`닉네임 ${nickname} 계정이 여러 개입니다. 유저 ID로 확인한 뒤 다시 시도하세요.`},409);
    const target=matches[0],round=await latestRound(env);if(!round||!['PREPARING','ACTIVE'].includes(String(round.status||'')))return deps.json({error:'지휘관을 지정할 수 있는 진행 회차가 없습니다.'},409);
    const participant=await env.DB.prepare("SELECT side,status,deck_power,attacks,damage FROM territory_war_v3_users WHERE round_id=? AND user_id=?").bind(round.id,target.id).first();
    if(!participant||participant.status!=='ACTIVE')return deps.json({error:`${target.nickname} 계정은 현재 회차 활성 참가자가 아닙니다.`},409);
    if(String(participant.side||'')!==targetSide)return deps.json({error:`${target.nickname} 계정은 ${configuredTeamLabel(cfg,participant.side)} 소속입니다. 해당 진영 지휘관으로 지정하세요.`},409);
    const previous=await env.DB.prepare(`SELECT o.user_id,u.nickname FROM territory_war_v3_commander_overrides o LEFT JOIN users u ON u.id=o.user_id WHERE o.round_id=? AND o.side=?`).bind(round.id,targetSide).first();
    await env.DB.prepare(`INSERT INTO territory_war_v3_commander_overrides(round_id,side,user_id,assigned_by) VALUES(?,?,?,?)
      ON CONFLICT(round_id,side) DO UPDATE SET user_id=excluded.user_id,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).bind(round.id,targetSide,target.id,user.id).run();
    publicStateSharedCache=null;
    const after={roundId:Number(round.id),side:targetSide,userId:Number(target.id),nickname:String(target.nickname),teamName:configuredTeamLabel(cfg,targetSide),manualOverride:true};
    if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'TERRITORY_COMMANDER_ASSIGN','TERRITORY_WAR_ROUND',`${round.id}:${targetSide}`,previous?{userId:Number(previous.user_id||0),nickname:String(previous.nickname||'')}:null,after);
    return deps.json({ok:true,...after,state:await publicState(env,user.id,true)});
  }
  if(path==='admin/territory-war/reset-recruitment'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    if(String(cfg.mode||'OFF').toUpperCase()==='OFF')return deps.json({error:'영토전을 먼저 ON 또는 TEST로 전환하세요.'},409);
    const round=await latestRound(env);if(!round||round.status!=='RECRUITING')return deps.json({error:'모집 시간을 초기화할 수 있는 모집 회차가 없습니다.'},409);
    const body=await deps.readBody(request),requestedEndsAt=sqlMs(body.recruitmentEndsAt),rawDuration=Number(body.durationMinutes),durationMinutes=Number.isFinite(rawDuration)&&rawDuration>0?clampInt(rawDuration,1,10080):0;
    const recruitmentEndsAt=Number.isFinite(requestedEndsAt)&&requestedEndsAt>Date.now()
      ?iso(requestedEndsAt)
      :iso(Date.now()+(durationMinutes||Number(cfg.recruitmentHours||3)*60)*60000);
    await env.DB.prepare("UPDATE territory_war_v3_rounds SET recruitment_ends_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'").bind(recruitmentEndsAt,round.id).run();
    publicStateSharedCache=null;
    return deps.json({ok:true,recruitmentEndsAt,state:await publicState(env,user.id,true)});
  }
  if(path==='admin/territory-war/start'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);const body=await deps.readBody(request),key=validRequestId(body.operationKey);if(!key)return deps.json({error:'관리자 작업 키가 올바르지 않습니다.'},400);const round=await lifecycle(env,cfg);if(!round||round.status!=='RECRUITING')return deps.json({error:'모집 중인 회차만 편성할 수 있습니다.'},409);const reserve=await reserveAdminOperation(env,key,'START',round.id,user.id);if(reserve.response)return deps.json(reserve.response);if(reserve.pending)return deps.json({error:'동일한 편성 작업을 처리 중입니다.'},409);if(reserve.conflict)return deps.json({error:'다른 작업에 사용된 관리자 작업 키입니다.'},409);
    try{
      const formed=await formRound(env,round,cfg);if(formed.status==='WAITING_MINIMUM')throw new Error(`최소 참가 인원 ${cfg.minParticipants}명이 필요합니다.`);if(!['PREPARING','ACTIVE'].includes(formed.status))throw new Error('회차 편성을 완료하지 못했습니다.');const response={ok:true,state:await publicState(env,user.id,true)};await completeAdmin(env,key,response);return deps.json(response);
    }catch(error){
      // 편성 저장이 끝난 뒤 부가 상태 조회만 실패했으면 이미 완료된 편성을 실패로 되돌려 표시하지 않는다.
      const committed=await roundById(env,round.id).catch(()=>null);
      if(['PREPARING','ACTIVE'].includes(String(committed?.status||''))){
        try{const response={ok:true,recovered:true,state:await publicState(env,user.id,true)};await completeAdmin(env,key,response);return deps.json(response)}catch(recoveryError){console.error('영토전 편성 완료 상태 복구 실패',recoveryError)}
      }
      await failAdmin(env,key,error);return deps.json({error:error.message||'편성에 실패했습니다.'},409);
    }
  }
  if(path==='admin/territory-war/finish'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);const body=await deps.readBody(request),key=validRequestId(body.operationKey),forcedWinner=String(body.winnerSide||'').toUpperCase();if(!key)return deps.json({error:'관리자 작업 키가 올바르지 않습니다.'},400);if(!['A','B','DRAW'].includes(forcedWinner))return deps.json({error:'강제 종료할 승리 진영을 선택하세요.'},400);const round=await latestRound(env);if(!round||!['PREPARING','ACTIVE'].includes(round.status))return deps.json({error:'종료 가능한 회차가 없습니다.'},409);const reserve=await reserveAdminOperation(env,key,'FINISH',round.id,user.id);if(reserve.response)return deps.json(reserve.response);if(reserve.pending)return deps.json({error:'동일한 종료 작업을 처리 중입니다.'},409);if(reserve.conflict)return deps.json({error:'다른 작업에 사용된 관리자 작업 키입니다.'},409);try{const finished=await settleRound(env,round,cfg,forcedWinner);if(!finished?.settled_at)throw new Error('회차 정산을 완료하지 못했습니다.');if(String(cfg.mode||'OFF').toUpperCase()!=='OFF')await createRound(env,cfg);const response={ok:true,winner:finished.winner_side,state:await publicState(env,user.id,true)};await completeAdmin(env,key,response);return deps.json(response)}catch(error){await failAdmin(env,key,error);return deps.json({error:error.message||'회차 종료에 실패했습니다.'},409)}
  }
  return deps.json({error:'요청한 영토전 기능을 찾을 수 없습니다.'},404);
}

export {balancedSideAssignments,buildFormationSnapshot,grantLatestWinnerMasterStarsV1956,magicFormationPercent,massAssaultPreview,pickPowerMatchedOpponent,matchPowerScale,participationInventoryReward};
