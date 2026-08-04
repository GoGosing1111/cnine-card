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
  mode:'OFF',battleName:'',recruitmentHours:5,preparationMinutes:10,roundMinutes:180,minParticipants:6,
  energyMax:10,energyMinutes:10,attackEnergyCost:1,realtimePollSeconds:3,
  baseSiegeHp:500000,outpostHpMultiplier:1.1,midHpMultiplier:1.2,gateHpMultiplier:1.4,homeHpMultiplier:2,
  damageScale:6,minDamage:100,maxDamage:5000,damageVariancePercent:10,recentActionLimit:20,
  individualBattleWinCoin:0,
  winnerCoin:5000,loserCoin:2000,drawCoin:3000,participationShards:50,
  contributionCoinPer1000Damage:10,maxContributionCoin:1000000,settlementMinAttacks:1
});

let foundationReady=false;
let settingsCacheValue=null,settingsCacheExpiresAt=0;
const participantDeckCache=new Map();
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
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
async function batchChunks(env,statements,size=50){for(let i=0;i<statements.length;i+=size)await env.DB.batch(statements.slice(i,i+size))}
async function tableColumns(env,name){const rows=(await env.DB.prepare(`PRAGMA table_info(${name})`).all()).results||[];return new Set(rows.map(row=>String(row.name||'')))}
async function addColumnIfMissing(env,table,column,definition){const columns=await tableColumns(env,table);if(columns.has(column))return false;await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();return true}

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
        a_hp INTEGER NOT NULL,b_hp INTEGER NOT NULL,a_max_hp INTEGER NOT NULL,b_max_hp INTEGER NOT NULL,
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
        shards INTEGER NOT NULL DEFAULT 0,damage INTEGER NOT NULL DEFAULT 0,attacks INTEGER NOT NULL DEFAULT 0,
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

function snapshotIds(value){const items=safeJson(value,[]);return Array.isArray(items)?items.map(item=>String(item&&typeof item==='object'?(item.id??item.card_id??''):item)).filter(Boolean).slice(0,5):[]}
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
async function selectBattleOpponent(env,roundId,mine,requestId){
  const enemy=mine.side==='A'?'B':'A',seed=seedOf(`${requestId}:MATCH`),power=Math.max(1,Number(mine.deck_power||0));
  return env.DB.prepare(`SELECT w.*,u.nickname,u.role FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? AND w.side=? AND w.status='ACTIVE' AND w.user_id<>? ORDER BY CASE WHEN w.deck_power BETWEEN ? AND ? THEN 0 ELSE 1 END,(((w.user_id * 1103515245) + ?) & 2147483647),ABS(w.deck_power-?),w.user_id LIMIT 1`).bind(roundId,enemy,mine.user_id,Math.floor(power*.7),Math.ceil(power*1.3),seed,power).first();
}
function resultHpPercent(battleV2,side){const resultEvent=[...(battleV2?.result?.timeline||[])].reverse().find(event=>event.type==='RESULT');return Number(side==='A'?resultEvent?.teamAHpPercent:resultEvent?.teamBHpPercent)||0}
async function simulateTerritoryBattle(env,deps,attackerUser,mine,opponent,requestId,seedOverride=null){
  const battle=await deps.battleSettings(env),[attackerCards,defenderCards]=await Promise.all([participantDeck(env,deps,mine,battle),participantDeck(env,deps,opponent,battle)]);
  if(attackerCards.length!==5)throw new Error('등록한 PVP 덱 5장을 불러오지 못했습니다. 참가 신청을 다시 해주세요.');
  if(defenderCards.length!==5)throw new Error('상대 진영의 PVP 덱이 완성되지 않아 매칭할 수 없습니다.');
  const defenderUser={id:Number(opponent.user_id),nickname:String(opponent.nickname||'상대 참가자'),role:String(opponent.role||'USER')};
  const uniquePromise=typeof deps.cardUniqueDeckStates==='function'?deps.cardUniqueDeckStates(env,[{user:attackerUser,cards:attackerCards},{user:defenderUser,cards:defenderCards}],'PVP'):Promise.resolve([{enabled:false,cards:attackerCards},{enabled:false,cards:defenderCards}]);
  const bonusA=typeof deps.userEquipmentBonuses==='function'?deps.userEquipmentBonuses(env,attackerUser.id):Promise.resolve({pvp:0}),bonusB=typeof deps.userEquipmentBonuses==='function'?deps.userEquipmentBonuses(env,defenderUser.id):Promise.resolve({pvp:0});
  const idsA=attackerCards.map(card=>String(card.id)),idsB=defenderCards.map(card=>String(card.id));
  const synergyA=typeof deps.evaluateDeckSynergies==='function'?deps.evaluateDeckSynergies(env,attackerUser,idsA,'PVP',{forceOwnerTest:String(attackerUser.role||'').toUpperCase()==='OWNER'}):Promise.resolve({totals:{attackPercent:0}});
  const synergyB=typeof deps.evaluateDeckSynergies==='function'?deps.evaluateDeckSynergies(env,defenderUser,idsB,'PVP',{forceOwnerTest:String(defenderUser.role||'').toUpperCase()==='OWNER'}):Promise.resolve({totals:{attackPercent:0}});
  const [uniqueStates,aBonus,bBonus,aSynergy,bSynergy]=await Promise.all([uniquePromise,bonusA,bonusB,synergyA,synergyB]);
  const [aUnique,dUnique]=uniqueStates,aMap=new Map((aUnique?.cards||[]).map(card=>[String(card.id),card.uniqueAbility||null])),dMap=new Map((dUnique?.cards||[]).map(card=>[String(card.id),card.uniqueAbility||null]));
  const aMultiplier=1+Number(aSynergy?.totals?.attackPercent||0)/100,dMultiplier=1+Number(bSynergy?.totals?.attackPercent||0)/100;
  const attackerEngineCards=attackerCards.map(card=>({...card,power:Math.max(1,Math.floor(Number(card.power||0)*aMultiplier)),uniqueAbility:aMap.get(String(card.id))||card.uniqueAbility||null}));
  const defenderEngineCards=defenderCards.map(card=>({...card,power:Math.max(1,Math.floor(Number(card.power||0)*dMultiplier)),uniqueAbility:dMap.get(String(card.id))||card.uniqueAbility||null}));
  const battleSeed=seedOverride==null?seedOf(`${mine.round_id}:${requestId}:TWV3_BATTLE_V2`):Number(seedOverride)>>>0;
  const battleV2=deps.createPvpBattleV2({attackerCards:attackerEngineCards,defenderCards:defenderEngineCards,attackerEquipmentBonus:Number(aBonus?.pvp||0),defenderEquipmentBonus:Number(bBonus?.pvp||0),seed:battleSeed});
  return{battleV2,battleSeed,attackerCards,defenderCards,attackerPower:Number(battleV2.teams?.A?.summary?.power||mine.deck_power||0),defenderPower:Number(battleV2.teams?.B?.summary?.power||opponent.deck_power||0),opponent:{id:Number(opponent.user_id),nickname:defenderUser.nickname,side:String(opponent.side||''),deckPower:Number(opponent.deck_power||0)}};
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
    const end=iso(Date.now()+Number(cfg.recruitmentHours||5)*3600000);
    const result=await env.DB.prepare("INSERT INTO territory_war_v3_rounds(status,battle_name,recruitment_ends_at,current_front_index) VALUES('RECRUITING',?,?,4)").bind(String(cfg.battleName||'').trim().slice(0,40),end).run();
    return Number(result.meta.last_row_id);
  }finally{await releaseLock(env,lock)}
}

async function createFront(env,roundId,sequence,nodeIndex,status,cfg){
  const node=nodeAt(nodeIndex),hp=maxHpForNode(node,cfg),started=status==='ACTIVE'?iso():null;
  await env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_fronts(round_id,sequence,node_index,node_code,node_name,node_type,status,a_hp,b_hp,a_max_hp,b_max_hp,started_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(roundId,sequence,node.index,node.code,node.name,node.type,status,hp,hp,hp,hp,started).run();
  return env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE round_id=? AND sequence=?').bind(roundId,sequence).first();
}

async function formRound(env,round,cfg){
  const lock=await acquireLock(env,`form_${round.id}`,120000);if(!lock.ok)return{status:'BUSY'};
  try{
    const fresh=await roundById(env,round.id);if(!fresh||fresh.status!=='RECRUITING')return{status:fresh?.status||'MISSING'};
    const users=(await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? ORDER BY deck_power DESC,registered_at,user_id').bind(round.id).all()).results||[];
    if(users.length<Number(cfg.minParticipants||6))return{status:'WAITING_MINIMUM',count:users.length};
    let aPower=0,bPower=0,aCount=0,bCount=0;const statements=[];
    for(const item of users){let side;if(aPower<bPower)side='A';else if(bPower<aPower)side='B';else if(aCount<bCount)side='A';else if(bCount<aCount)side='B';else side=(aCount+bCount)%2===0?'A':'B';if(side==='A'){aPower+=Number(item.deck_power||0);aCount++}else{bPower+=Number(item.deck_power||0);bCount++}statements.push(env.DB.prepare("UPDATE territory_war_v3_users SET side=?,status='ACTIVE',energy=?,last_recharged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?").bind(side,Number(cfg.energyMax||10),round.id,item.user_id))}
    await batchChunks(env,statements);
    const prep=Math.max(0,Number(cfg.preparationMinutes||0)),starts=iso(Date.now()+prep*60000),ends=iso(Date.now()+(prep+Number(cfg.roundMinutes||180))*60000),front=await createFront(env,round.id,1,4,prep>0?'PREPARING':'ACTIVE',cfg);
    await env.DB.prepare(`UPDATE territory_war_v3_rounds SET status=?,formed_at=CURRENT_TIMESTAMP,starts_at=?,ends_at=?,current_front_index=4,current_front_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECRUITING'`).bind(prep>0?'PREPARING':'ACTIVE',starts,ends,front.id,round.id).run();
    return{status:prep>0?'PREPARING':'ACTIVE',aCount,bCount,aPower,bPower};
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

async function generateRewards(env,round,cfg){
  const rows=(await env.DB.prepare('SELECT user_id,side,damage,attacks FROM territory_war_v3_users WHERE round_id=?').bind(round.id).all()).results||[],statements=[];
  for(const item of rows){const eligible=Number(item.attacks||0)>=Number(cfg.settlementMinAttacks||1),winner=String(round.winner_side||'DRAW'),result=!eligible?'INELIGIBLE':winner==='DRAW'?'DRAW':item.side===winner?'WIN':'LOSE';let coin=0,shards=0;if(eligible){coin=result==='WIN'?Number(cfg.winnerCoin||0):result==='LOSE'?Number(cfg.loserCoin||0):Number(cfg.drawCoin||0);coin+=Math.min(Number(cfg.maxContributionCoin||1000000),Math.floor(Number(item.damage||0)/1000)*Number(cfg.contributionCoinPer1000Damage||0));shards=Number(cfg.participationShards||0)}statements.push(env.DB.prepare(`INSERT OR IGNORE INTO territory_war_v3_rewards(round_id,user_id,side,result,coin,shards,damage,attacks) VALUES(?,?,?,?,?,?,?,?)`).bind(round.id,item.user_id,item.side||'',result,coin,shards,Number(item.damage||0),Number(item.attacks||0)))}
  await batchChunks(env,statements);
}

async function settleRound(env,round,cfg,forcedWinner=''){
  if(!round||round.settled_at)return round;
  const lock=await acquireLock(env,`settle_${round.id}`,180000);if(!lock.ok)return roundById(env,round.id);
  try{
    let fresh=await roundById(env,round.id);if(!fresh||fresh.settled_at)return fresh;
    const front=await activeFront(env,fresh),winner=forcedWinner||timeWinner(fresh,front);
    const changed=await env.DB.prepare("UPDATE territory_war_v3_rounds SET status='FINISHED',winner_side=?,settled_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND settled_at IS NULL").bind(winner,fresh.id).run();
    if(Number(changed?.meta?.changes||0)){fresh=await roundById(env,fresh.id);await generateRewards(env,fresh,cfg)}
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
  const nextIndex=Number(current.node_index)+(winner==='A'?1:-1),next=await createFront(env,current.round_id,Number(current.sequence)+1,nextIndex,'ACTIVE',cfg);
  await env.DB.prepare(`UPDATE territory_war_v3_rounds SET current_front_index=?,current_front_id=?,a_front_wins=a_front_wins+?,b_front_wins=b_front_wins+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_front_id=? AND settled_at IS NULL`).bind(nextIndex,next.id,winner==='A'?1:0,winner==='B'?1:0,freshRound.id,current.id).run();
  const updated=await roundById(env,freshRound.id),active=updated?.current_front_id?await activeFront(env,updated):next;return{resolved:true,winner,roundFinished:Boolean(updated?.settled_at),round:updated,nextFront:active};
}

async function resolveFront(env,round,front,cfg){
  let current=await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(front.id).first();if(!current)return{resolved:false};
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
  if(round.status==='ACTIVE'&&sqlMs(round.ends_at)<=Date.now())round=await settleRound(env,round,cfg);
  return round;
}

function rechargeEnergy(row,cfg){
  const max=Number(cfg.energyMax||10),minutes=Math.max(1,Number(cfg.energyMinutes||10)),last=sqlMs(row?.last_recharged_at),now=Date.now();let energy=Math.min(max,Number(row?.energy??max)),lastAt=Number.isFinite(last)?last:now;
  if(energy<max){const gained=Math.floor((now-lastAt)/(minutes*60000));if(gained>0){energy=Math.min(max,energy+gained);lastAt+=gained*minutes*60000;if(energy>=max)lastAt=now}}
  return{energy,lastRechargedAt:iso(lastAt),nextEnergyAt:energy>=max?null:iso(lastAt+minutes*60000)};
}

async function rewardForUser(env,userId){
  const v3=await env.DB.prepare('SELECT r.*,w.battle_name FROM territory_war_v3_rewards r LEFT JOIN territory_war_v3_rounds w ON w.id=r.round_id WHERE r.user_id=? AND r.claimed_at IS NULL ORDER BY r.round_id DESC LIMIT 1').bind(userId).first();if(v3)return{...v3,version:'V3'};
  if(await tableExists(env,'territory_war_rewards')){const old=await env.DB.prepare('SELECT * FROM territory_war_rewards WHERE user_id=? AND claimed_at IS NULL ORDER BY round_id DESC LIMIT 1').bind(userId).first();if(old)return{...old,version:'LEGACY'}}
  return null;
}

async function publicState(env,userId,includeAdmin=false){
  const cfg=await settings(env),round=await lifecycle(env,cfg),mode=String(cfg.mode||'OFF').toUpperCase();
  if(!round)return{mode,settings:cfg,round:null,nodes:NODES,reward:await rewardForUser(env,userId),serverNow:iso()};
  const front=await activeFront(env,round),mineRow=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,userId).first(),counts=(await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN side='A' THEN 1 ELSE 0 END) a_count,SUM(CASE WHEN side='B' THEN 1 ELSE 0 END) b_count,SUM(CASE WHEN side='A' THEN deck_power ELSE 0 END) a_power,SUM(CASE WHEN side='B' THEN deck_power ELSE 0 END) b_power FROM territory_war_v3_users WHERE round_id=?").bind(round.id).first())||{};
  let mine=null;if(mineRow){const e=rechargeEnergy(mineRow,cfg);mine={...mineRow,energy:e.energy,nextEnergyAt:e.nextEnergyAt}}
  const ranking=(await env.DB.prepare(`SELECT w.user_id,w.side,w.damage,w.attacks,w.front_finishes,u.nickname FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? AND w.side IN ('A','B') ORDER BY w.damage DESC,w.attacks DESC,w.user_id LIMIT 20`).bind(round.id).all()).results||[];
  const recentResults=(await env.DB.prepare('SELECT * FROM territory_war_v3_front_results WHERE round_id=? ORDER BY sequence DESC LIMIT 10').bind(round.id).all()).results||[];
  const recentActions=(await env.DB.prepare(`SELECT a.side,a.winner_side,a.target_side,a.damage,a.created_at,au.nickname attacker_nickname,ou.nickname opponent_nickname,cu.nickname contributor_nickname FROM territory_war_v3_actions a JOIN users au ON au.id=a.user_id LEFT JOIN users ou ON ou.id=a.opponent_user_id LEFT JOIN users cu ON cu.id=COALESCE(a.contributor_user_id,a.user_id) WHERE a.round_id=? AND a.status='COMPLETED' AND a.damage>0 ORDER BY a.id DESC LIMIT ?`).bind(round.id,clampInt(cfg.recentActionLimit,5,50,20)).all()).results||[];
  const canRegister=!mine&&round.status==='RECRUITING',canCancel=Boolean(mine&&round.status==='RECRUITING');
  const state={mode,settings:cfg,round,front,nodes:NODES,counts:{total:Number(counts.total||0),A:Number(counts.a_count||0),B:Number(counts.b_count||0),aPower:Number(counts.a_power||0),bPower:Number(counts.b_power||0)},mine,registration:{canRegister,canCancel},ranking,recentResults,recentActions,reward:await rewardForUser(env,userId),serverNow:iso(),version:Number(round.version||0)};
  if(includeAdmin)state.adminUsers=(await env.DB.prepare(`SELECT w.*,u.nickname FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? ORDER BY CASE w.side WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,w.damage DESC,w.deck_power DESC`).bind(round.id).all()).results||[];
  return state;
}

async function realtimeState(env,userId){
  const cfg=await settings(env),round=await lifecycle(env,cfg);if(!round)return{round:null,serverNow:iso()};
  let front=null,mine=null;
  if(round.current_front_id){
    const row=await env.DB.prepare(`SELECT f.*,m.side m_side,m.energy m_energy,m.last_recharged_at m_last_recharged_at,m.attacks m_attacks,m.damage m_damage,m.defenses m_defenses FROM territory_war_v3_fronts f LEFT JOIN territory_war_v3_users m ON m.round_id=f.round_id AND m.user_id=? WHERE f.id=?`).bind(userId,round.current_front_id).first();
    if(row){front={...row};for(const key of Object.keys(front))if(key.startsWith('m_'))delete front[key];if(row.m_side){const e=rechargeEnergy({energy:row.m_energy,last_recharged_at:row.m_last_recharged_at},cfg);mine={side:row.m_side,energy:e.energy,last_recharged_at:e.lastRechargedAt,nextEnergyAt:e.nextEnergyAt,attacks:Number(row.m_attacks||0),damage:Number(row.m_damage||0),defenses:Number(row.m_defenses||0)}}}
  }else{
    const mineRow=await env.DB.prepare('SELECT side,energy,last_recharged_at,attacks,damage,defenses FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,userId).first();if(mineRow){const e=rechargeEnergy(mineRow,cfg);mine={...mineRow,energy:e.energy,nextEnergyAt:e.nextEnergyAt}}
  }
  return{round,front,mine,version:Number(round.version||0),serverNow:iso()};
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
  try{
    const round=await lifecycle(env,cfg);if(!round||round.status!=='ACTIVE')throw new Error('현재 전투 가능한 영토전 회차가 아닙니다.');
    const front=await activeFront(env,round);if(!front||front.status!=='ACTIVE')throw new Error('현재 교전지가 준비되지 않았습니다.');
    const mine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(!mine||!['A','B'].includes(String(mine.side||'')))throw new Error('현재 회차 참가자가 아닙니다.');
    const energy=rechargeEnergy(mine,cfg),cost=clampInt(cfg.attackEnergyCost,1,20,1);if(energy.energy<cost)throw new Error('행동력이 부족합니다.');
    const opponent=await selectBattleOpponent(env,round.id,mine,requestId);if(!opponent)throw new Error('상대 진영 참가자가 없어 교전을 시작할 수 없습니다.');

    // V2 계산은 전선 잠금 밖에서 병렬 처리한다. D1 반영만 짧은 원자 배치로 직렬화된다.
    const simulation=await simulateTerritoryBattle(env,deps,user,mine,opponent,requestId),attackerWon=simulation.battleV2?.result?.winner==='A',winnerSide=attackerWon?String(mine.side):String(opponent.side),targetSide=winnerSide==='A'?'B':'A',contributorId=attackerWon?Number(user.id):Number(opponent.user_id),winnerPower=attackerWon?simulation.attackerPower:simulation.defenderPower;
    const planned=damageFor(winnerPower,`${requestId}:${winnerSide}:SIEGE`,cfg),hpColumn=targetSide==='A'?'a_hp':'b_hp',targetHp=Number(front[hpColumn]||0);if(targetHp<=0)throw new Error('이미 종료된 교전입니다.');
    const predictedActual=Math.max(0,Math.min(targetHp,planned)),predictedAfter=Math.max(0,targetHp-predictedActual),winnerHpPercent=resultHpPercent(simulation.battleV2,attackerWon?'A':'B'),personalWinCoin=attackerWon?clampInt(cfg.individualBattleWinCoin,0,100000000,0):0;
    const compact={requestId,roundId:round.id,frontId:front.id,nodeIndex:front.node_index,nodeCode:front.node_code,nodeName:front.node_name,side:mine.side,opponentSide:opponent.side,opponentUserId:Number(opponent.user_id),opponentNickname:String(opponent.nickname||'상대 참가자'),attackerWon,winnerSide,targetSide,contributorUserId:contributorId,damage:predictedActual,personalWinCoin,energySpent:cost,energyAfter:energy.energy-cost,targetHpBefore:targetHp,targetHpAfter:predictedAfter,battleSeed:simulation.battleSeed,winnerHpPercent};
    const actualExpr=`MIN(?,COALESCE((SELECT ${hpColumn} FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE'),0))`,activeExpr=`EXISTS(SELECT 1 FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE' AND ${hpColumn}>0) AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='PENDING')`;
    const attackerDamage=attackerWon?actualExpr:'0',defenderDamage=attackerWon?'0':actualExpr,attackerFinish=attackerWon?`CASE WHEN ?>=COALESCE((SELECT ${hpColumn} FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE'),1) THEN 1 ELSE 0 END`:'0',defenderFinish=attackerWon?'0':`CASE WHEN ?>=COALESCE((SELECT ${hpColumn} FROM territory_war_v3_fronts WHERE id=? AND status='ACTIVE'),1) THEN 1 ELSE 0 END`;
    const attackerSql=`UPDATE territory_war_v3_users SET energy=?,last_recharged_at=?,attacks=attacks+1,damage=damage+${attackerDamage},front_finishes=front_finishes+${attackerFinish},updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND ${activeExpr}`;
    const defenderSql=`UPDATE territory_war_v3_users SET defenses=defenses+1,defense_wins=defense_wins+?,defense_losses=defense_losses+?,damage=damage+${defenderDamage},front_finishes=front_finishes+${defenderFinish},updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND ${activeExpr}`;
    const roundSql=`UPDATE territory_war_v3_rounds SET a_total_damage=a_total_damage+${winnerSide==='A'?actualExpr:'0'},b_total_damage=b_total_damage+${winnerSide==='B'?actualExpr:'0'},version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${activeExpr}`;
    const meta={engine:'BATTLE_ENGINE_V2_PVP',seed:simulation.battleSeed,opponentUserId:Number(opponent.user_id),opponentNickname:String(opponent.nickname||'상대 참가자'),winnerSide,targetSide,attackerWon,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,winnerHpPercent};

    const attackerBinds=[energy.energy-cost,energy.lastRechargedAt];if(attackerWon)attackerBinds.push(planned,front.id,planned,front.id);attackerBinds.push(round.id,user.id,front.id,requestId);
    const defenderBinds=[attackerWon?0:1,attackerWon?1:0];if(!attackerWon)defenderBinds.push(planned,front.id,planned,front.id);defenderBinds.push(round.id,opponent.user_id,front.id,requestId);
    const roundBinds=[];if(winnerSide==='A')roundBinds.push(planned,front.id);if(winnerSide==='B')roundBinds.push(planned,front.id);roundBinds.push(round.id,front.id,requestId);
    const actionSql=`UPDATE territory_war_v3_actions SET round_id=?,front_id=?,opponent_user_id=?,contributor_user_id=?,side=?,winner_side=?,target_side=?,battle_seed=?,status='APPLIED',damage=${actualExpr},energy_spent=?,result_json=?,battle_meta_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING' AND ${activeExpr}`;
    const actionBinds=[round.id,front.id,opponent.user_id,contributorId,mine.side,winnerSide,targetSide,simulation.battleSeed,planned,front.id,cost,JSON.stringify(compact),JSON.stringify(meta),requestId,front.id,requestId];
    const frontSql=`UPDATE territory_war_v3_fronts SET ${hpColumn}=MAX(0,${hpColumn}-?),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE' AND ${hpColumn}>0 AND EXISTS(SELECT 1 FROM territory_war_v3_actions WHERE request_id=? AND status='APPLIED')`;

    await env.DB.batch([
      env.DB.prepare(attackerSql).bind(...attackerBinds),
      env.DB.prepare(defenderSql).bind(...defenderBinds),
      env.DB.prepare(roundSql).bind(...roundBinds),
      env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ?>0 AND ${activeExpr}`).bind(personalWinCoin,user.id,personalWinCoin,front.id,requestId),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'영토전 개인 교전 승리' FROM users WHERE id=? AND ?>0 AND ${activeExpr}`).bind(user.id,personalWinCoin,user.id,personalWinCoin,front.id,requestId),
      env.DB.prepare(actionSql).bind(...actionBinds),
      env.DB.prepare(frontSql).bind(planned,front.id,requestId)
    ]);
    let action=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(action?.status!=='APPLIED')throw new Error('교전지가 이미 변경되었습니다. 행동력은 소모되지 않았습니다.');
    const actual=Number(action.damage||0),stored={...safeJson(action.result_json,compact),damage:actual,targetHpAfter:Math.max(0,Number(safeJson(action.result_json,compact).targetHpBefore||targetHp)-actual)};await env.DB.prepare("UPDATE territory_war_v3_actions SET result_json=? WHERE request_id=? AND status='APPLIED'").bind(JSON.stringify(stored),requestId).run();action={...action,result_json:JSON.stringify(stored)};
    const completed=await completeAppliedAction(env,action,cfg),result={...completed,battleV2:simulation.battleV2,opponent:simulation.opponent,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,battleEngine:{active:true,version:'V2',mode:'TERRITORY_WAR_V3'}};
    return deps.json({ok:true,result,state:await realtimeState(env,user.id)});
  }catch(error){const row=await env.DB.prepare('SELECT status FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(row?.status==='PENDING')await env.DB.prepare("UPDATE territory_war_v3_actions SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(String(error.message||error).slice(0,300),requestId).run();return deps.json({error:error.message||'영토전 교전 처리에 실패했습니다.',retryable:/변경|처리/.test(String(error.message||''))},409)}
}

async function claimV3(env,deps,user){
  const lock=await acquireLock(env,`claim_${user.id}`,60000);if(!lock.ok)return deps.json({error:'보상 수령을 처리 중입니다.'},409);
  try{
    const reward=await rewardForUser(env,user.id);if(!reward)return deps.json({error:'수령 가능한 보상이 없습니다.'},404);
    const coin=Number(reward.coin||0),shards=Number(reward.shards||0),table=reward.version==='V3'?'territory_war_v3_rewards':'territory_war_rewards';
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(coin,shards,user.id,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'영토전 보상' FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,coin,user.id,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT ?,?,card_shards,'영토전 보상',NULL FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,shards,user.id,reward.round_id,user.id),
      env.DB.prepare(`UPDATE ${table} SET claimed_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND claimed_at IS NULL`).bind(reward.round_id,user.id)
    ]);
    if(!Number(results?.[3]?.meta?.changes||0))return deps.json({error:'이미 수령한 보상입니다.'},409);return deps.json({ok:true,coin,shards,state:await publicState(env,user.id)});
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
  recruitmentHours:clampInt(body.recruitmentHours,1,168,current.recruitmentHours),preparationMinutes:clampInt(body.preparationMinutes,0,1440,current.preparationMinutes),roundMinutes:clampInt(body.roundMinutes,10,10080,current.roundMinutes),minParticipants:clampInt(body.minParticipants,2,10000,current.minParticipants),
  energyMax:clampInt(body.energyMax,1,100,current.energyMax),energyMinutes:clampInt(body.energyMinutes,1,1440,current.energyMinutes),attackEnergyCost:clampInt(body.attackEnergyCost,1,20,current.attackEnergyCost),realtimePollSeconds:clampInt(body.realtimePollSeconds,2,15,current.realtimePollSeconds),
  baseSiegeHp:clampInt(body.baseSiegeHp,1000,1000000000,current.baseSiegeHp),outpostHpMultiplier:clamp(body.outpostHpMultiplier,1,10,current.outpostHpMultiplier),midHpMultiplier:clamp(body.midHpMultiplier,1,10,current.midHpMultiplier),gateHpMultiplier:clamp(body.gateHpMultiplier,1,10,current.gateHpMultiplier),homeHpMultiplier:clamp(body.homeHpMultiplier,1,20,current.homeHpMultiplier),
  damageScale:clamp(body.damageScale,.1,100,current.damageScale),minDamage:clampInt(body.minDamage,1,10000000,current.minDamage),maxDamage:clampInt(body.maxDamage,1,100000000,current.maxDamage),damageVariancePercent:clampInt(body.damageVariancePercent,0,40,current.damageVariancePercent),recentActionLimit:clampInt(body.recentActionLimit,5,50,current.recentActionLimit),
  individualBattleWinCoin:clampInt(body.individualBattleWinCoin,0,100000000,current.individualBattleWinCoin),
  winnerCoin:clampInt(body.winnerCoin,0,100000000,current.winnerCoin),loserCoin:clampInt(body.loserCoin,0,100000000,current.loserCoin),drawCoin:clampInt(body.drawCoin,0,100000000,current.drawCoin),participationShards:clampInt(body.participationShards,0,1000000,current.participationShards),contributionCoinPer1000Damage:clampInt(body.contributionCoinPer1000Damage,0,1000000,current.contributionCoinPer1000Damage),maxContributionCoin:clampInt(body.maxContributionCoin,0,100000000,current.maxContributionCoin),settlementMinAttacks:clampInt(body.settlementMinAttacks,0,10000,current.settlementMinAttacks)
}}

export async function handleTerritoryWar({path,request,env,deps}){
  if(!String(path).startsWith('territory-war')&&!String(path).startsWith('admin/territory-war'))return null;
  await ensureFoundation(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);const admin=deps.isAdminRole(user),cfg=await settings(env);
  if(path==='territory-war/state'&&request.method==='GET')return deps.json(await publicState(env,user.id));
  if(path==='territory-war/state-lite'&&request.method==='GET')return deps.json(await realtimeState(env,user.id));
  if(path==='territory-war/action-status'&&request.method==='GET')return handleActionStatus(env,deps,user,cfg,request);
  if(path==='territory-war/register'&&request.method==='POST'){
    const mode=String(cfg.mode||'OFF').toUpperCase();if(mode==='OFF')return deps.json({error:'영토전 운영이 중지되었습니다.'},409);const round=await lifecycle(env,cfg),canJoin=round&&round.status==='RECRUITING';if(!canJoin)return deps.json({error:'참가 모집이 종료되어 현재 회차에는 입장할 수 없습니다.'},409);
    const existing=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(existing)return deps.json({ok:true,alreadyRegistered:true,state:await publicState(env,user.id)});
    const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)return deps.json({error:'PVP 덱 5장을 먼저 편성하세요.'},400);const bs=await deps.battleSettings(env),power=deck.reduce((sum,card)=>sum+deps.cardBattlePower(card,card.breakthrough_level,bs),0);
    await env.DB.prepare(`INSERT INTO territory_war_v3_users(round_id,user_id,deck_power,deck_snapshot,side,status,energy,last_recharged_at) VALUES(?,?,?,?,NULL,'WAITING',?,CURRENT_TIMESTAMP)`).bind(round.id,user.id,power,JSON.stringify(deck.map(card=>String(card.id))),Number(cfg.energyMax||10)).run();return deps.json({ok:true,lateJoined:false,side:null,state:await publicState(env,user.id)});
  }
  if(path==='territory-war/unregister'&&request.method==='POST'){const round=await lifecycle(env,cfg);if(!round||round.status!=='RECRUITING')return deps.json({error:'모집 중에만 참가 신청을 취소할 수 있습니다.'},409);await env.DB.prepare('DELETE FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).run();return deps.json({ok:true,state:await publicState(env,user.id)})}
  if(path==='territory-war/attack'&&request.method==='POST')return handleAttack(env,deps,user,cfg,await deps.readBody(request));
  if(path==='territory-war/claim'&&request.method==='POST')return claimV3(env,deps,user);
  if(path==='admin/territory-war/settings'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    if(request.method==='GET')return deps.json({settings:cfg,state:await publicState(env,user.id,true)});
    if(request.method==='POST'){
      const next=cleanSettings(await deps.readBody(request),cfg);if(Number(next.maxDamage)<Number(next.minDamage))next.maxDamage=next.minDamage;
      await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('territory_war_settings_v3',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();invalidateSettingsCache();
      const round=await latestRound(env);if(round&&['RECRUITING','PREPARING','ACTIVE'].includes(round.status))await env.DB.prepare("UPDATE territory_war_v3_rounds SET battle_name=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next.battleName,round.id).run();if(next.mode==='OFF'&&round&&['RECRUITING','PREPARING','ACTIVE'].includes(round.status))await env.DB.prepare("UPDATE territory_war_v3_rounds SET status='DISABLED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(round.id).run();if(next.mode!=='OFF'&&(!round||['FINISHED','DISABLED'].includes(round.status)))await createRound(env,next);return deps.json({ok:true,settings:next,state:await publicState(env,user.id,true)});
    }
  }
  if(path==='admin/territory-war/start'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);const body=await deps.readBody(request),key=validRequestId(body.operationKey);if(!key)return deps.json({error:'관리자 작업 키가 올바르지 않습니다.'},400);const round=await lifecycle(env,cfg);if(!round||round.status!=='RECRUITING')return deps.json({error:'모집 중인 회차만 편성할 수 있습니다.'},409);const reserve=await reserveAdminOperation(env,key,'START',round.id,user.id);if(reserve.response)return deps.json(reserve.response);if(reserve.pending)return deps.json({error:'동일한 편성 작업을 처리 중입니다.'},409);if(reserve.conflict)return deps.json({error:'다른 작업에 사용된 관리자 작업 키입니다.'},409);try{const formed=await formRound(env,round,cfg);if(formed.status==='WAITING_MINIMUM')throw new Error(`최소 참가 인원 ${cfg.minParticipants}명이 필요합니다.`);if(!['PREPARING','ACTIVE'].includes(formed.status))throw new Error('회차 편성을 완료하지 못했습니다.');const response={ok:true,state:await publicState(env,user.id,true)};await completeAdmin(env,key,response);return deps.json(response)}catch(error){await failAdmin(env,key,error);return deps.json({error:error.message||'편성에 실패했습니다.'},409)}
  }
  if(path==='admin/territory-war/finish'&&request.method==='POST'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);const body=await deps.readBody(request),key=validRequestId(body.operationKey);if(!key)return deps.json({error:'관리자 작업 키가 올바르지 않습니다.'},400);const round=await latestRound(env);if(!round||!['PREPARING','ACTIVE'].includes(round.status))return deps.json({error:'종료 가능한 회차가 없습니다.'},409);const reserve=await reserveAdminOperation(env,key,'FINISH',round.id,user.id);if(reserve.response)return deps.json(reserve.response);if(reserve.pending)return deps.json({error:'동일한 종료 작업을 처리 중입니다.'},409);if(reserve.conflict)return deps.json({error:'다른 작업에 사용된 관리자 작업 키입니다.'},409);try{const finished=await settleRound(env,round,cfg);if(!finished?.settled_at)throw new Error('회차 정산을 완료하지 못했습니다.');if(String(cfg.mode||'OFF').toUpperCase()!=='OFF')await createRound(env,cfg);const response={ok:true,winner:finished.winner_side,state:await publicState(env,user.id,true)};await completeAdmin(env,key,response);return deps.json(response)}catch(error){await failAdmin(env,key,error);return deps.json({error:error.message||'회차 종료에 실패했습니다.'},409)}
  }
  return deps.json({error:'요청한 영토전 기능을 찾을 수 없습니다.'},404);
}
