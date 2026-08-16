import { ensureEquipmentFoundation } from './_equipment.js';
import { ensureUnifiedDropPoolFoundation } from './_drop_pool.js';

const META_KEY='scrapyard_settings_v1676';
const RECEIPT_TABLE='scrapyard_run_receipts_v1676';
const RUN_TABLE='scrapyard_runs_v1676';
const ENTRY_TICKET_CODE='SCRAPYARD_ENTRY_TICKET';
const TICKET_RESERVATION_TABLE='scrapyard_ticket_reservations_v1680';
const DROP_RECEIPT_TABLE='unified_drop_receipts_v1667';
const MODE_SET=new Set(['OFF','TEST','ON']);
const SCRAPYARD_ENEMIES={
  OUTER:{
    normal:[{id:'SCRAP_OUTER_GEARJAW',name:'기어죠 스캐빈저',image:'assets/ui/scrapyard/monsters/gearjaw-scavenger-v1698.webp'}],
    boss:[{id:'SCRAP_OUTER_BREAKER',name:'고철군주 브레이커',image:'assets/ui/scrapyard/monsters/wrecklord-breaker-v1698.webp'}]
  },
  CORE:{
    normal:[{id:'SCRAP_CORE_POLARITY',name:'극성 회수기',image:'assets/ui/scrapyard/monsters/polarity-reclaimer-v1698.webp'}],
    boss:[{id:'SCRAP_CORE_ATLAS',name:'유압거신 아틀라스',image:'assets/ui/scrapyard/monsters/hydraulic-titan-atlas-v1698.webp'}]
  },
  FURNACE:{
    normal:[{id:'SCRAP_FURNACE_RAVAGER',name:'신더트랙 라바저',image:'assets/ui/scrapyard/monsters/cindertrack-ravager-v1698.webp'}],
    boss:[{id:'SCRAP_FURNACE_MOLOCH',name:'용광로 군주 몰로크',image:'assets/ui/scrapyard/monsters/furnace-sovereign-moloch-v1698.webp'}]
  }
};
let foundationPromise=null,settingsCache=null;
const staleRecoveryAt=new Map();

const DEFAULT_SETTINGS={
  mode:'OFF',dailyRuns:10,
  difficulties:[
    {id:'OUTER',name:'외곽 폐차장',waves:5,requiredPowerStart:70000,requiredPowerEnd:180000,clearCoin:100000,accent:'#58ddff'},
    {id:'CORE',name:'압축 설비 구역',waves:6,requiredPowerStart:170000,requiredPowerEnd:390000,clearCoin:200000,accent:'#ffb85c'},
    {id:'FURNACE',name:'용광로 심부',waves:7,requiredPowerStart:360000,requiredPowerEnd:760000,clearCoin:400000,accent:'#ff596f'}
  ]
};

const clamp=(value,min,max,fallback=min)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const integer=(value,min,max,fallback=min)=>Math.floor(clamp(value,min,max,fallback));
const text=(value,max=120)=>String(value??'').trim().slice(0,max);
const code=value=>text(value,40).toUpperCase().replace(/[^A-Z0-9_:-]/g,'_');
const parse=(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}};
const isOwner=user=>String(user?.role||'').toUpperCase()==='OWNER';
const canAccess=(mode,user)=>mode==='ON'||mode==='TEST'&&isOwner(user);
const isAdmin=user=>['OWNER','ADMIN'].includes(String(user?.role||'').toUpperCase());
function kstDayRange(now=Date.now()){
  const shifted=new Date(now+9*60*60*1000);
  const startMs=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-9*60*60*1000;
  return {start:new Date(startMs).toISOString(),end:new Date(startMs+24*60*60*1000).toISOString()};
}
function hashUnit(seed){let h=2166136261;for(const ch of String(seed||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h/4294967296}
function cleanSettings(raw={}){
  const base=DEFAULT_SETTINGS,mode=MODE_SET.has(String(raw.mode||'').toUpperCase())?String(raw.mode).toUpperCase():base.mode;
  const input=Array.isArray(raw.difficulties)?raw.difficulties:base.difficulties;
  const difficulties=base.difficulties.map((fallback,index)=>{const row=input[index]||fallback,start=integer(row.requiredPowerStart,1000,1000000000,fallback.requiredPowerStart),end=integer(row.requiredPowerEnd,start,1000000000,fallback.requiredPowerEnd);return{id:fallback.id,name:text(row.name,40)||fallback.name,waves:integer(row.waves,3,10,fallback.waves),requiredPowerStart:start,requiredPowerEnd:end,clearCoin:integer(row.clearCoin,0,100000000,fallback.clearCoin),accent:/^#[0-9a-f]{6}$/i.test(String(row.accent||''))?String(row.accent):fallback.accent}});
  return {mode,dailyRuns:integer(raw.dailyRuns,1,100,base.dailyRuns),difficulties};
}

const FOUNDATION_SQL=[
  `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,difficulty TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',ticket_consumed INTEGER NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${RUN_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,difficulty TEXT NOT NULL,deck_power INTEGER NOT NULL DEFAULT 0,waves_total INTEGER NOT NULL DEFAULT 0,waves_cleared INTEGER NOT NULL DEFAULT 0,success INTEGER NOT NULL DEFAULT 0,rewards_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${TICKET_RESERVATION_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,item_code TEXT NOT NULL DEFAULT '${ENTRY_TICKET_CODE}',status TEXT NOT NULL DEFAULT 'RESERVED',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_scrapyard_runs_user_day_v1676 ON ${RUN_TABLE}(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_scrapyard_receipts_created_v1676 ON ${RECEIPT_TABLE}(created_at)`
];

async function ensureFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    await ensureEquipmentFoundation(env);
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1676_scrapyard'").first();
    if(marker?.value!=='1'){
      for(const sql of FOUNDATION_SQL)await env.DB.prepare(sql).run();
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM ${RECEIPT_TABLE} WHERE status<>'COMPLETED' AND created_at<datetime('now','-1 day')`),
        env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(META_KEY,JSON.stringify(DEFAULT_SETTINGS)),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_scrapyard','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const ticketMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1680_scrapyard_ticket'").first();
    if(ticketMarker?.value!=='1'){
      await ensureUnifiedDropPoolFoundation(env);
      const columns=await env.DB.prepare(`PRAGMA table_info(${RECEIPT_TABLE})`).all();
      if(!(columns.results||[]).some(row=>row.name==='ticket_consumed'))await env.DB.prepare(`ALTER TABLE ${RECEIPT_TABLE} ADD COLUMN ticket_consumed INTEGER NOT NULL DEFAULT 0`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${TICKET_RESERVATION_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,item_code TEXT NOT NULL DEFAULT '${ENTRY_TICKET_CODE}',status TEXT NOT NULL DEFAULT 'RESERVED',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1680_scrapyard_ticket','1',CURRENT_TIMESTAMP)").run();
    }
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}
async function settings(env,{fresh=false}={}){if(!fresh&&settingsCache?.expiresAt>Date.now())return settingsCache.value;const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(META_KEY).first(),value=cleanSettings(parse(row?.value,DEFAULT_SETTINGS));settingsCache={value,expiresAt:Date.now()+15000};return value}
function publicDeck(deck){return (deck?.cards||[]).slice(0,5).map(card=>({id:String(card.id),title:card.title,rarity:card.rarity||card.grade||'C',grade:card.rarity||card.grade||'C',image:card.image||card.image_url||'',power:Number(card.power||0),powerType:card.powerType||card.power_type||'',breakthroughLevel:Number(card.breakthroughLevel??card.breakthrough_level??0),focusX:Number(card.focusX??card.focus_x??50),focusY:Number(card.focusY??card.focus_y??50),uniqueAbility:card.uniqueAbility||null}))}

async function status(env,user,raidDeckPower){
  const day=kstDayRange(),statusReads=env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) count FROM ${RUN_TABLE} WHERE user_id=? AND created_at>=? AND created_at<?`).bind(user.id,day.start,day.end),
    env.DB.prepare("SELECT i.code,i.name,i.image_url,COALESCE(ui.quantity,0) quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.user_id=? AND ui.item_code=i.code WHERE i.code IN ('VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE') ORDER BY i.sort_order,i.code").bind(user.id),
    env.DB.prepare(`SELECT difficulty,MAX(waves_cleared) best_waves FROM ${RUN_TABLE} WHERE user_id=? GROUP BY difficulty`).bind(user.id),
    env.DB.prepare(`SELECT i.code,i.name,i.subtitle,i.description,replace(i.image_url,char(92),'/') image_url,COALESCE(ui.quantity,0) quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.user_id=? AND ui.item_code=i.code WHERE i.code=?`).bind(user.id,ENTRY_TICKET_CODE)
  ]),[cfg,deck,statusRows]=await Promise.all([settings(env),raidDeckPower(env,user.id,null,'PVE'),statusReads]),[runs,parts,best,ticket]=statusRows;
  const used=Number(runs.results?.[0]?.count||0),bestMap=Object.fromEntries((best.results||[]).map(row=>[row.difficulty,Number(row.best_waves||0)]));
  const ticketItem={...(ticket.results?.[0]||{}),code:ENTRY_TICKET_CODE,quantity:Number(ticket.results?.[0]?.quantity||0)};
  const effectiveMode=cfg.mode,allowed=canAccess(effectiveMode,user);
  return {serverNow:new Date().toISOString(),settings:{...cfg,mode:effectiveMode},access:{allowed,mode:effectiveMode,configuredMode:cfg.mode,publicReleaseEnabled:true,dailyRuns:cfg.dailyRuns,usedRuns:used,remainingRuns:Math.max(0,cfg.dailyRuns-used),ticketRequired:true,ticketQuantity:ticketItem.quantity,canEnterWithTicket:ticketItem.quantity>0},ticket:ticketItem,deckPower:Number(deck.power||0),deckCards:publicDeck(deck),parts:(parts.results||[]).map(row=>({...row,quantity:Number(row.quantity||0)})),best:bestMap};
}

function buildBattle({requestId,difficulty,deck}){
  const waves=[],enemySet=SCRAPYARD_ENEMIES[difficulty.id]||SCRAPYARD_ENEMIES.OUTER,normal=enemySet.normal,bosses=enemySet.boss;let partyHp=100,cleared=0;
  for(let index=0;index<difficulty.waves;index++){
    const boss=index===difficulty.waves-1,candidates=boss?bosses:normal,monster=candidates[Math.floor(hashUnit(`${requestId}:MONSTER:${index}`)*Math.max(1,candidates.length))]||{};
    const progress=index/Math.max(1,difficulty.waves-1),required=Math.round(difficulty.requiredPowerStart+(difficulty.requiredPowerEnd-difficulty.requiredPowerStart)*Math.pow(progress,1.22))*(boss ? 1.08 : 1),ratio=Number(deck.power||0)/Math.max(1,required),enemyMaxHp=Math.max(1000,Math.round(required*(boss ? 3.1 : 2.25))),turns=[],enemyDamage=Math.max(1,Math.round(required*(boss ? .19 : .13))),baseHit=Math.max(1,Math.round(Number(deck.power||0)*(.34+hashUnit(`${requestId}:HIT:${index}`)*.11)));let enemyHp=enemyMaxHp;
    for(let turn=0;turn<12&&enemyHp>0&&partyHp>0;turn++){
      const card=deck.cards[turn%Math.max(1,deck.cards.length)]||{},crit=hashUnit(`${requestId}:${index}:${turn}:CRIT`)<.18,damage=Math.max(1,Math.round(baseHit*(crit ? 1.65 : 1)*(boss ? .92 : 1)));enemyHp=Math.max(0,enemyHp-damage);turns.push({turn:turn+1,cardIndex:turn%5,damage,critical:crit,enemyHp});if(enemyHp<=0)break;const received=Math.max(1,Math.round(enemyDamage/Math.max(1,Number(deck.power||1))*(17+index*1.8)));partyHp=Math.max(0,partyHp-received);turns[turns.length-1].counterDamage=received;turns[turns.length-1].partyHp=partyHp;
    }
    const won=enemyHp<=0&&partyHp>0;if(won)cleared++;waves.push({wave:index+1,boss,requiredPower:required,powerRatio:Number(ratio.toFixed(3)),monster:{id:String(monster.id||''),name:monster.name||(boss?'폐차장 파쇄왕':'고철 포식자'),image:monster.image||'',maxHp:enemyMaxHp},turns,won,partyHp});if(!won)break;
  }
  return {waves,wavesCleared:cleared,success:cleared===difficulty.waves,remainingPartyHp:partyHp};
}

async function reserveEntryTicket(env,userId,requestId){
  const statements=[
    env.DB.prepare(`DELETE FROM ${TICKET_RESERVATION_TABLE} WHERE request_id=? AND user_id=? AND status='REFUNDED'`).bind(requestId,userId),
    env.DB.prepare(`INSERT OR IGNORE INTO ${TICKET_RESERVATION_TABLE}(request_id,user_id,item_code,status) SELECT ?,?,?,'RESERVED' WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)`).bind(requestId,userId,ENTRY_TICKET_CODE,userId,ENTRY_TICKET_CODE),
    env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=1 AND EXISTS(SELECT 1 FROM ${TICKET_RESERVATION_TABLE} WHERE request_id=? AND user_id=? AND status='RESERVED')`).bind(userId,ENTRY_TICKET_CODE,requestId,userId),
    env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET ticket_consumed=1,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM ${TICKET_RESERVATION_TABLE} WHERE request_id=? AND user_id=? AND status='RESERVED')`).bind(requestId,userId,requestId,userId),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,-1,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),'폐차장 입장','SCRAPYARD_ENTRY',? WHERE EXISTS(SELECT 1 FROM ${TICKET_RESERVATION_TABLE} WHERE request_id=? AND user_id=? AND status='RESERVED')`).bind(userId,ENTRY_TICKET_CODE,userId,ENTRY_TICKET_CODE,requestId,requestId,userId)
  ];
  await env.DB.batch(statements);
  const receipt=await env.DB.prepare(`SELECT x.ticket_consumed,COALESCE(i.quantity,0) quantity FROM ${RECEIPT_TABLE} x LEFT JOIN cnine_user_inventory i ON i.user_id=x.user_id AND i.item_code=? WHERE x.request_id=? AND x.user_id=?`).bind(ENTRY_TICKET_CODE,requestId,userId).first();
  if(Number(receipt?.ticket_consumed)!==1)throw new Error('폐차장 출입 허가증이 부족합니다. 입장권 1장이 필요합니다.');
  return Math.max(0,Number(receipt?.quantity||0));
}

async function refundEntryTicket(env,userId,requestId,error){
  const message=text(error?.message||error,400);
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${TICKET_RESERVATION_TABLE} SET status='REFUNDING',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='RESERVED'`).bind(requestId,userId),
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT user_id,item_code,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM ${TICKET_RESERVATION_TABLE} WHERE request_id=? AND user_id=? AND status='REFUNDING' ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(requestId,userId),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,1,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),'폐차장 입장 실패 환불','SCRAPYARD_REFUND',? WHERE EXISTS(SELECT 1 FROM ${TICKET_RESERVATION_TABLE} WHERE request_id=? AND user_id=? AND status='REFUNDING')`).bind(userId,ENTRY_TICKET_CODE,userId,ENTRY_TICKET_CODE,requestId,requestId,userId),
    env.DB.prepare(`UPDATE ${TICKET_RESERVATION_TABLE} SET status='REFUNDED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='REFUNDING'`).bind(requestId,userId),
    env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',ticket_consumed=0,error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(message,requestId,userId)
  ]);
}

async function recoverStaleEntryTickets(env,userId){
  const now=Date.now(),last=Number(staleRecoveryAt.get(Number(userId))||0);if(now-last<60000)return;staleRecoveryAt.set(Number(userId),now);
  if(staleRecoveryAt.size>256)for(const [id,checkedAt] of staleRecoveryAt)if(now-checkedAt>60000)staleRecoveryAt.delete(id);
  const rows=await env.DB.prepare(`SELECT r.request_id FROM ${TICKET_RESERVATION_TABLE} r JOIN ${RECEIPT_TABLE} x ON x.request_id=r.request_id AND x.user_id=r.user_id WHERE r.user_id=? AND r.status='RESERVED' AND x.status='PENDING' AND r.updated_at<datetime('now','-5 minutes') AND NOT EXISTS(SELECT 1 FROM ${DROP_RECEIPT_TABLE} d WHERE d.request_id=('SCRAPYARD:'||r.request_id) AND d.user_id=r.user_id AND d.status='COMPLETED') ORDER BY r.updated_at LIMIT 3`).bind(userId).all();
  for(const row of rows.results||[])await refundEntryTicket(env,userId,row.request_id,'폐차장 처리 중단 자동 복구');
}

async function run(env,user,body,deps){
  const requestId=text(body.requestId,120),difficultyId=code(body.difficulty);if(!requestId)throw new Error('원정 요청번호가 없습니다.');
  const [prior,cfg]=await Promise.all([
    env.DB.prepare(`SELECT status,ticket_consumed,response_json,error_message FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first(),
    settings(env,{fresh:true}),
    recoverStaleEntryTickets(env,user.id)
  ]);
  if(prior?.status==='COMPLETED')return {...parse(prior.response_json,{ok:true}),replayed:true};
  if(prior?.status==='PENDING')throw new Error('같은 폐차장 원정을 처리 중입니다.');
  const difficulty=cfg.difficulties.find(row=>row.id===difficultyId);if(!difficulty)throw new Error('폐차장 난이도를 선택하세요.');
  if(!canAccess(cfg.mode,user))throw new Error('현재 폐차장 입장이 잠겨 있습니다.');
  const day=kstDayRange(),[usedResult,ticketResult]=await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) count FROM ${RUN_TABLE} WHERE user_id=? AND created_at>=? AND created_at<?`).bind(user.id,day.start,day.end),
    env.DB.prepare(`SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?`).bind(user.id,ENTRY_TICKET_CODE)
  ]),used=usedResult.results?.[0],ticketBefore=Number(ticketResult.results?.[0]?.quantity||0);
  if(Number(used?.count||0)>=cfg.dailyRuns&&!isOwner(user))throw new Error(`오늘 폐차장 입장 ${cfg.dailyRuns}회를 모두 사용했습니다.`);
  if(ticketBefore<1)throw new Error('폐차장 출입 허가증이 부족합니다. 입장권 1장이 필요합니다.');
  const reserved=prior?.status==='FAILED'
    ?await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET difficulty=?,status='PENDING',ticket_consumed=0,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='FAILED'`).bind(difficulty.id,requestId,user.id).run()
    :await env.DB.prepare(`INSERT OR IGNORE INTO ${RECEIPT_TABLE}(request_id,user_id,difficulty,status) VALUES(?,?,?,'PENDING')`).bind(requestId,user.id,difficulty.id).run();if(!reserved.meta?.changes)throw new Error('같은 폐차장 원정을 처리 중입니다.');
  let dropCommitted=false;
  try{
    const [ticketRemaining,deck]=await Promise.all([reserveEntryTicket(env,user.id,requestId),deps.raidDeckPower(env,user.id,null,'PVE')]);
    let uniqueRoll=0;
    const uniqueRuntime=deck.unique?.enabled&&typeof deps.resolveUniqueBattleRuntime==='function'
      ?deps.resolveUniqueBattleRuntime(deck.unique,{mode:'PVE',basePower:Number(deck.power||0),opponentPower:Math.round(Number(difficulty.requiredPowerEnd||0)*1.08),random:()=>hashUnit(`${requestId}:UNIQUE:${uniqueRoll++}`)})
      :null;
    const effectivePower=Math.max(0,Number(uniqueRuntime?.effectivePower??deck.power??0));
    const battleDeck={...deck,power:effectivePower},battle=buildBattle({requestId,difficulty,deck:battleDeck});
    let drop={rewards:[]};if(battle.success)drop=await deps.resolveUnifiedDrops(env,{userId:user.id,requestId:`SCRAPYARD:${requestId}`,sourceType:'SCRAPYARD',sourceId:difficulty.id,triggerType:'CLEAR',context:{difficulty:cfg.difficulties.findIndex(row=>row.id===difficulty.id)+1,wave:battle.wavesCleared,boss:true},role:user.role});dropCommitted=(drop.rewards||[]).length>0;
    const clearCoin=battle.success?Number(difficulty.clearCoin||0):0,dropCoinBalance=Number(drop.balances?.coin),coinBeforeClear=Number.isFinite(dropCoinBalance)?dropCoinBalance:Number(user.coin||0);
    const guaranteed=clearCoin>0?[{rewardType:'COIN',rewardRef:'COIN',rewardName:'클리어 코인',quantity:clearCoin,guaranteed:true}]:[],rewards=[...guaranteed,...(drop.rewards||[])];
    const response={ok:true,requestId,difficulty:{id:difficulty.id,name:difficulty.name,accent:difficulty.accent,waves:difficulty.waves,clearCoin:Number(difficulty.clearCoin||0)},entryTicket:{code:ENTRY_TICKET_CODE,consumed:1,remaining:ticketRemaining},baseDeckPower:Number(deck.power||0),deckPower:effectivePower,deckCards:publicDeck(deck),uniqueAbility:typeof deps.uniqueBattleResponsePayload==='function'?deps.uniqueBattleResponsePayload(deck.unique,uniqueRuntime):null,...battle,rewards,partDropped:(drop.rewards||[]).length>0,balances:{...(drop.balances||{}),...(clearCoin>0?{coin:coinBeforeClear+clearCoin}:{})}};
    const statements=[
      ...(clearCoin>0?[env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(clearCoin,user.id),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'SCRAPYARD_CLEAR' FROM users WHERE id=?").bind(clearCoin,user.id)]:[]),
      env.DB.prepare(`INSERT INTO ${RUN_TABLE}(request_id,user_id,difficulty,deck_power,waves_total,waves_cleared,success,rewards_json) VALUES(?,?,?,?,?,?,?,?)`).bind(requestId,user.id,difficulty.id,response.deckPower,difficulty.waves,battle.wavesCleared,battle.success?1:0,JSON.stringify(response.rewards)),
      env.DB.prepare(`UPDATE ${TICKET_RESERVATION_TABLE} SET status='CONSUMED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='RESERVED'`).bind(requestId,user.id),
      env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(JSON.stringify(response),requestId,user.id)
    ];await env.DB.batch(statements);
    return response;
  }catch(error){
    if(!dropCommitted){const committed=await env.DB.prepare(`SELECT 1 ok FROM ${DROP_RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND status='COMPLETED'`).bind(`SCRAPYARD:${requestId}`,user.id).first().catch(()=>null);dropCommitted=Boolean(committed?.ok)}
    if(dropCommitted)await env.DB.prepare(`UPDATE ${TICKET_RESERVATION_TABLE} SET status='CONSUMED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='RESERVED'`).bind(requestId,user.id).run().catch(()=>null);
    else await refundEntryTicket(env,user.id,requestId,error).catch(()=>null);
    throw error
  }
}

export async function handleScrapyard({path,request,env,deps}){
  if(!path.startsWith('scrapyard')&&!path.startsWith('admin/scrapyard'))return null;
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);await ensureFoundation(env);
  if(path==='scrapyard/status'&&request.method==='GET')try{return deps.json(await status(env,user,deps.raidDeckPower))}catch(error){return deps.json({error:error.message||'폐차장 상태를 불러오지 못했습니다.'},400)}
  if(path==='scrapyard/run'&&request.method==='POST')try{return deps.json(await run(env,user,await deps.readBody(request),deps))}catch(error){return deps.json({error:error.message||'폐차장 원정을 시작하지 못했습니다.'},409)}
  if(path==='admin/scrapyard'){
    if(!isAdmin(user))return deps.json({error:'폐차장 관리 권한이 필요합니다.'},403);
    await ensureUnifiedDropPoolFoundation(env);
    if(request.method==='GET')return deps.json({settings:await settings(env,{fresh:true}),recentRuns:(await env.DB.prepare(`SELECT r.*,u.nickname FROM ${RUN_TABLE} r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 50`).all()).results||[]});
    if(request.method==='POST'){const body=await deps.readBody(request),next=cleanSettings(body.settings||body);await env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(META_KEY,JSON.stringify(next)).run();settingsCache=null;await deps.writeAdminLog?.(env,user,'SCRAPYARD_SETTINGS_SAVE','SETTINGS',META_KEY,null,{settings:next});return deps.json({ok:true,settings:next})}
  }
  return deps.json({error:'지원하지 않는 폐차장 요청입니다.'},405);
}
