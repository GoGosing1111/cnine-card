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
  mode:'OFF',recruitmentHours:5,preparationMinutes:10,roundMinutes:180,minParticipants:6,
  energyMax:10,energyMinutes:10,attackEnergyCost:1,realtimePollSeconds:3,
  baseSiegeHp:500000,outpostHpMultiplier:1.1,midHpMultiplier:1.2,gateHpMultiplier:1.4,homeHpMultiplier:2,
  damageScale:6,minDamage:100,maxDamage:5000,damageVariancePercent:10,recentActionLimit:20,
  winnerCoin:5000,loserCoin:2000,drawCoin:3000,participationShards:50,
  contributionCoinPer1000Damage:10,maxContributionCoin:1000000,settlementMinAttacks:1
});

let foundationReady=false;
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

async function ensureFoundation(env){
  if(foundationReady)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1402_territory_frontline_v3'").first();
  if(marker){foundationReady=true;return}
  const sql=[
    `CREATE TABLE IF NOT EXISTS territory_war_v3_rounds(
      id INTEGER PRIMARY KEY AUTOINCREMENT,status TEXT NOT NULL DEFAULT 'RECRUITING',recruitment_ends_at TEXT,
      starts_at TEXT,ends_at TEXT,current_front_index INTEGER NOT NULL DEFAULT 4,current_front_id INTEGER,
      a_total_damage INTEGER NOT NULL DEFAULT 0,b_total_damage INTEGER NOT NULL DEFAULT 0,
      a_front_wins INTEGER NOT NULL DEFAULT 0,b_front_wins INTEGER NOT NULL DEFAULT 0,
      winner_side TEXT,version INTEGER NOT NULL DEFAULT 1,formed_at TEXT,settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS territory_war_v3_users(
      round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,deck_power INTEGER NOT NULL DEFAULT 0,deck_snapshot TEXT NOT NULL DEFAULT '[]',
      side TEXT,status TEXT NOT NULL DEFAULT 'WAITING',energy INTEGER NOT NULL DEFAULT 10,last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      attacks INTEGER NOT NULL DEFAULT 0,damage INTEGER NOT NULL DEFAULT 0,front_finishes INTEGER NOT NULL DEFAULT 0,
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
      side TEXT,status TEXT NOT NULL DEFAULT 'PENDING',damage INTEGER NOT NULL DEFAULT 0,energy_spent INTEGER NOT NULL DEFAULT 0,
      result_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
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
    `CREATE INDEX IF NOT EXISTS idx_twv3_front_active ON territory_war_v3_fronts(round_id,status,id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_twv3_actions_cleanup ON territory_war_v3_actions(status,updated_at,id)`,
    `CREATE INDEX IF NOT EXISTS idx_twv3_actions_round ON territory_war_v3_actions(round_id,id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_twv3_rewards_user ON territory_war_v3_rewards(user_id,claimed_at,round_id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_twv3_admin_cleanup ON territory_war_v3_admin_operations(status,updated_at)`
  ];
  await batchChunks(env,sql.map(s=>env.DB.prepare(s)));
  const old=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v1'").first();
  const migrated={...DEFAULTS,...safeJson(old?.value,{})};
  await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('territory_war_settings_v3',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(migrated)).run();
  if(await tableExists(env,'territory_war_rounds'))await env.DB.prepare("UPDATE territory_war_rounds SET status='DISABLED',updated_at=CURRENT_TIMESTAMP WHERE status IN ('RECRUITING','PREPARING','ACTIVE')").run();
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1402_territory_frontline_v3','1',CURRENT_TIMESTAMP)").run();
  foundationReady=true;
}

async function settings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first();return {...DEFAULTS,...safeJson(row?.value,{})}}
async function latestRound(env){return env.DB.prepare('SELECT * FROM territory_war_v3_rounds ORDER BY id DESC LIMIT 1').first()}
async function roundById(env,id){return env.DB.prepare('SELECT * FROM territory_war_v3_rounds WHERE id=?').bind(id).first()}
async function activeFront(env,round){if(!round?.current_front_id)return null;return env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(round.current_front_id).first()}

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
    const result=await env.DB.prepare("INSERT INTO territory_war_v3_rounds(status,recruitment_ends_at,current_front_index) VALUES('RECRUITING',?,4)").bind(end).run();
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
  const v3=await env.DB.prepare('SELECT * FROM territory_war_v3_rewards WHERE user_id=? AND claimed_at IS NULL ORDER BY round_id DESC LIMIT 1').bind(userId).first();if(v3)return{...v3,version:'V3'};
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
  const recentActions=(await env.DB.prepare(`SELECT a.side,a.damage,a.created_at,u.nickname FROM territory_war_v3_actions a JOIN users u ON u.id=a.user_id WHERE a.round_id=? AND a.status='COMPLETED' AND a.damage>0 ORDER BY a.id DESC LIMIT ?`).bind(round.id,clampInt(cfg.recentActionLimit,5,50,20)).all()).results||[];
  const state={mode,settings:cfg,round,front,nodes:NODES,counts:{total:Number(counts.total||0),A:Number(counts.a_count||0),B:Number(counts.b_count||0),aPower:Number(counts.a_power||0),bPower:Number(counts.b_power||0)},mine,ranking,recentResults,recentActions,reward:await rewardForUser(env,userId),serverNow:iso(),version:Number(round.version||0)};
  if(includeAdmin)state.adminUsers=(await env.DB.prepare(`SELECT w.*,u.nickname FROM territory_war_v3_users w JOIN users u ON u.id=w.user_id WHERE w.round_id=? ORDER BY CASE w.side WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,w.damage DESC,w.deck_power DESC`).bind(round.id).all()).results||[];
  return state;
}

async function realtimeState(env,userId){
  const cfg=await settings(env),round=await lifecycle(env,cfg);if(!round)return{round:null,serverNow:iso()};const front=await activeFront(env,round),mineRow=await env.DB.prepare('SELECT side,energy,last_recharged_at,attacks,damage FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,userId).first(),counts=await env.DB.prepare("SELECT SUM(CASE WHEN side='A' THEN 1 ELSE 0 END) a_count,SUM(CASE WHEN side='B' THEN 1 ELSE 0 END) b_count FROM territory_war_v3_users WHERE round_id=?").bind(round.id).first();let mine=null;if(mineRow){const e=rechargeEnergy(mineRow,cfg);mine={...mineRow,energy:e.energy,nextEnergyAt:e.nextEnergyAt}}return{round,front,mine,counts:{A:Number(counts?.a_count||0),B:Number(counts?.b_count||0)},version:Number(round.version||0),serverNow:iso()};
}

async function reserveAction(env,requestId,userId){
  let row=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();
  if(row){if(Number(row.user_id)!==Number(userId))return{conflict:true};if(row.status==='COMPLETED')return{completed:true,row};if(row.status==='APPLIED')return{applied:true,row};if(row.status==='PENDING'&&Date.now()-sqlMs(row.updated_at)<120000)return{pending:true};await env.DB.prepare("UPDATE territory_war_v3_actions SET status='PENDING',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status IN ('PENDING','FAILED')").bind(requestId).run();return{ok:true,row}}
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO territory_war_v3_actions(request_id,user_id,status) VALUES(?,?,'PENDING')").bind(requestId,userId).run();return Number(inserted?.meta?.changes||0)?{ok:true}:{pending:true};
}

async function completeAppliedAction(env,action,cfg){
  const stored=safeJson(action.result_json,{}),round=action.round_id?await roundById(env,action.round_id):null,front=action.front_id?await env.DB.prepare('SELECT * FROM territory_war_v3_fronts WHERE id=?').bind(action.front_id).first():null,resolution=front?await resolveFront(env,round,front,cfg):{resolved:false};const result={...stored,frontResolved:Boolean(resolution.resolved),frontWinner:resolution.winner||null,roundFinished:Boolean(resolution.roundFinished),nextFrontIndex:resolution.nextFront?.node_index??null};await env.DB.prepare("UPDATE territory_war_v3_actions SET status='COMPLETED',result_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='APPLIED'").bind(JSON.stringify(result),action.request_id).run();return result;
}

async function handleAttack(env,deps,user,cfg,body){
  const requestId=validRequestId(body.requestId);if(!requestId)return deps.json({error:'공격 요청 ID가 올바르지 않습니다.'},400);
  const reservation=await reserveAction(env,requestId,user.id);if(reservation.conflict)return deps.json({error:'다른 사용자의 요청 ID입니다.'},409);if(reservation.pending)return deps.json({error:'동일한 공격 요청을 처리 중입니다.',retryable:true},409);if(reservation.completed)return deps.json({ok:true,replayed:true,result:safeJson(reservation.row.result_json,{}),state:await publicState(env,user.id)});if(reservation.applied){const recoveryLock=await acquireLock(env,`front_${reservation.row.front_id}`,120000);if(!recoveryLock.ok)return deps.json({error:'적용된 공격 결과를 복구 중입니다. 같은 요청으로 다시 시도하세요.',retryable:true},409);try{const result=await completeAppliedAction(env,reservation.row,cfg);return deps.json({ok:true,replayed:true,result,state:await publicState(env,user.id)})}finally{await releaseLock(env,recoveryLock)}}
  let round=await lifecycle(env,cfg);if(!round||round.status!=='ACTIVE'){await env.DB.prepare("UPDATE territory_war_v3_actions SET status='FAILED',error_message='ROUND_NOT_ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(requestId).run();return deps.json({error:'현재 공격 가능한 영토전 회차가 아닙니다.'},409)}let front=await activeFront(env,round);if(!front||front.status!=='ACTIVE'){await env.DB.prepare("UPDATE territory_war_v3_actions SET status='FAILED',error_message='FRONT_NOT_ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(requestId).run();return deps.json({error:'현재 교전지가 준비되지 않았습니다.'},409)}
  const lock=await acquireLock(env,`front_${front.id}`,120000);if(!lock.ok)return deps.json({error:'다른 공격을 처리 중입니다. 같은 요청으로 다시 시도하세요.',retryable:true},409);
  try{
    let action=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(action?.status==='COMPLETED')return deps.json({ok:true,replayed:true,result:safeJson(action.result_json,{}),state:await publicState(env,user.id)});if(action?.status==='APPLIED'){const result=await completeAppliedAction(env,action,cfg);return deps.json({ok:true,replayed:true,result,state:await publicState(env,user.id)})}
    round=await roundById(env,round.id);front=await activeFront(env,round);if(!round||round.status!=='ACTIVE'||!front||front.status!=='ACTIVE')throw new Error('교전 상태가 변경되었습니다. 전장을 새로고침하세요.');
    const mine=await env.DB.prepare('SELECT * FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).first();if(!mine||!['A','B'].includes(String(mine.side||'')))throw new Error('현재 회차 참가자가 아닙니다.');
    const energy=rechargeEnergy(mine,cfg),cost=clampInt(cfg.attackEnergyCost,1,20,1);if(energy.energy<cost)throw new Error('행동력이 부족합니다.');
    const planned=damageFor(mine.deck_power,requestId,cfg),targetHp=mine.side==='A'?Number(front.b_hp):Number(front.a_hp),actual=Math.max(0,Math.min(targetHp,planned));if(actual<=0)throw new Error('이미 종료된 교전입니다.');
    const afterHp=Math.max(0,targetHp-actual),result={requestId,roundId:round.id,frontId:front.id,nodeIndex:front.node_index,nodeCode:front.node_code,nodeName:front.node_name,side:mine.side,damage:actual,energySpent:cost,energyAfter:energy.energy-cost,targetHpBefore:targetHp,targetHpAfter:afterHp};
    const frontSql=mine.side==='A'?"UPDATE territory_war_v3_fronts SET b_hp=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'":"UPDATE territory_war_v3_fronts SET a_hp=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'";
    await env.DB.batch([
      env.DB.prepare("UPDATE territory_war_v3_users SET energy=?,last_recharged_at=?,attacks=attacks+1,damage=damage+?,front_finishes=front_finishes+?,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=?").bind(energy.energy-cost,energy.lastRechargedAt,actual,afterHp<=0?1:0,round.id,user.id),
      env.DB.prepare(frontSql).bind(afterHp,front.id),
      env.DB.prepare(`UPDATE territory_war_v3_rounds SET a_total_damage=a_total_damage+?,b_total_damage=b_total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(mine.side==='A'?actual:0,mine.side==='B'?actual:0,round.id),
      env.DB.prepare("UPDATE territory_war_v3_actions SET round_id=?,front_id=?,side=?,status='APPLIED',damage=?,energy_spent=?,result_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(round.id,front.id,mine.side,actual,cost,JSON.stringify(result),requestId)
    ]);
    action=await env.DB.prepare('SELECT * FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();const completed=await completeAppliedAction(env,action,cfg);return deps.json({ok:true,result:completed,state:await publicState(env,user.id)});
  }catch(error){const row=await env.DB.prepare('SELECT status FROM territory_war_v3_actions WHERE request_id=?').bind(requestId).first();if(row?.status==='PENDING')await env.DB.prepare("UPDATE territory_war_v3_actions SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(String(error.message||error).slice(0,300),requestId).run();return deps.json({error:error.message||'공격 처리에 실패했습니다.'},409)}finally{await releaseLock(env,lock)}
}

async function claimV3(env,deps,user){
  const lock=await acquireLock(env,`claim_${user.id}`,60000);if(!lock.ok)return deps.json({error:'보상 수령을 처리 중입니다.'},409);
  try{
    const reward=await rewardForUser(env,user.id);if(!reward)return deps.json({error:'수령 가능한 보상이 없습니다.'},404);
    const coin=Number(reward.coin||0),shards=Number(reward.shards||0),table=reward.version==='V3'?'territory_war_v3_rewards':'territory_war_rewards';
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE users SET coins=coins+?,card_shards=card_shards+? WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(coin,shards,user.id,reward.round_id,user.id),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coins,'영토전 보상' FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${table} WHERE round_id=? AND user_id=? AND claimed_at IS NULL)`).bind(user.id,coin,user.id,reward.round_id,user.id),
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
  recruitmentHours:clampInt(body.recruitmentHours,1,168,current.recruitmentHours),preparationMinutes:clampInt(body.preparationMinutes,0,1440,current.preparationMinutes),roundMinutes:clampInt(body.roundMinutes,10,10080,current.roundMinutes),minParticipants:clampInt(body.minParticipants,2,10000,current.minParticipants),
  energyMax:clampInt(body.energyMax,1,100,current.energyMax),energyMinutes:clampInt(body.energyMinutes,1,1440,current.energyMinutes),attackEnergyCost:clampInt(body.attackEnergyCost,1,20,current.attackEnergyCost),realtimePollSeconds:clampInt(body.realtimePollSeconds,2,15,current.realtimePollSeconds),
  baseSiegeHp:clampInt(body.baseSiegeHp,1000,1000000000,current.baseSiegeHp),outpostHpMultiplier:clamp(body.outpostHpMultiplier,1,10,current.outpostHpMultiplier),midHpMultiplier:clamp(body.midHpMultiplier,1,10,current.midHpMultiplier),gateHpMultiplier:clamp(body.gateHpMultiplier,1,10,current.gateHpMultiplier),homeHpMultiplier:clamp(body.homeHpMultiplier,1,20,current.homeHpMultiplier),
  damageScale:clamp(body.damageScale,.1,100,current.damageScale),minDamage:clampInt(body.minDamage,1,10000000,current.minDamage),maxDamage:clampInt(body.maxDamage,1,100000000,current.maxDamage),damageVariancePercent:clampInt(body.damageVariancePercent,0,40,current.damageVariancePercent),recentActionLimit:clampInt(body.recentActionLimit,5,50,current.recentActionLimit),
  winnerCoin:clampInt(body.winnerCoin,0,100000000,current.winnerCoin),loserCoin:clampInt(body.loserCoin,0,100000000,current.loserCoin),drawCoin:clampInt(body.drawCoin,0,100000000,current.drawCoin),participationShards:clampInt(body.participationShards,0,1000000,current.participationShards),contributionCoinPer1000Damage:clampInt(body.contributionCoinPer1000Damage,0,1000000,current.contributionCoinPer1000Damage),maxContributionCoin:clampInt(body.maxContributionCoin,0,100000000,current.maxContributionCoin),settlementMinAttacks:clampInt(body.settlementMinAttacks,0,10000,current.settlementMinAttacks)
}}

export async function handleTerritoryWar({path,request,env,deps}){
  if(!String(path).startsWith('territory-war')&&!String(path).startsWith('admin/territory-war'))return null;
  await ensureFoundation(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);const admin=deps.isAdminRole(user),cfg=await settings(env);
  if(path==='territory-war/state'&&request.method==='GET')return deps.json(await publicState(env,user.id));
  if(path==='territory-war/state-lite'&&request.method==='GET')return deps.json(await realtimeState(env,user.id));
  if(path==='territory-war/register'&&request.method==='POST'){
    if(String(cfg.mode||'OFF').toUpperCase()==='OFF')return deps.json({error:'영토전 운영이 중지되었습니다.'},409);const round=await lifecycle(env,cfg);if(!round||round.status!=='RECRUITING')return deps.json({error:'현재 참가 모집 기간이 아닙니다.'},409);const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)return deps.json({error:'PVP 덱 5장을 먼저 편성하세요.'},400);const bs=await deps.battleSettings(env),power=deck.reduce((sum,card)=>sum+deps.cardBattlePower(card,card.breakthrough_level,bs),0);await env.DB.prepare(`INSERT INTO territory_war_v3_users(round_id,user_id,deck_power,deck_snapshot,status,energy,last_recharged_at) VALUES(?,?,?,?, 'WAITING',?,CURRENT_TIMESTAMP)
      ON CONFLICT(round_id,user_id) DO UPDATE SET deck_power=excluded.deck_power,deck_snapshot=excluded.deck_snapshot,status='WAITING',energy=excluded.energy,last_recharged_at=CURRENT_TIMESTAMP,registered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(round.id,user.id,power,JSON.stringify(deck.map(x=>x.id)),Number(cfg.energyMax||10)).run();return deps.json({ok:true,state:await publicState(env,user.id)});
  }
  if(path==='territory-war/unregister'&&request.method==='POST'){const round=await lifecycle(env,cfg);if(!round||round.status!=='RECRUITING')return deps.json({error:'모집 중에만 참가 신청을 취소할 수 있습니다.'},409);await env.DB.prepare('DELETE FROM territory_war_v3_users WHERE round_id=? AND user_id=?').bind(round.id,user.id).run();return deps.json({ok:true,state:await publicState(env,user.id)})}
  if(path==='territory-war/attack'&&request.method==='POST')return handleAttack(env,deps,user,cfg,await deps.readBody(request));
  if(path==='territory-war/claim'&&request.method==='POST')return claimV3(env,deps,user);
  if(path==='admin/territory-war/settings'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    if(request.method==='GET')return deps.json({settings:cfg,state:await publicState(env,user.id,true)});
    if(request.method==='POST'){
      const next=cleanSettings(await deps.readBody(request),cfg);if(Number(next.maxDamage)<Number(next.minDamage))next.maxDamage=next.minDamage;
      await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('territory_war_settings_v3',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();
      const round=await latestRound(env);if(next.mode==='OFF'&&round&&['RECRUITING','PREPARING','ACTIVE'].includes(round.status))await env.DB.prepare("UPDATE territory_war_v3_rounds SET status='DISABLED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(round.id).run();if(next.mode!=='OFF'&&(!round||['FINISHED','DISABLED'].includes(round.status)))await createRound(env,next);return deps.json({ok:true,settings:next,state:await publicState(env,user.id,true)});
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
