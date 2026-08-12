import { ensureEquipmentFoundation } from './_equipment.js';
import { ensureUnifiedDropPoolFoundation, invalidateUnifiedDropPoolCache } from './_drop_pool.js';

const META_KEY='scrapyard_settings_v1676';
const RECEIPT_TABLE='scrapyard_run_receipts_v1676';
const RUN_TABLE='scrapyard_runs_v1676';
const DROP_POOL_TABLE='unified_drop_pools_v1667';
const DROP_ENTRY_TABLE='unified_drop_entries_v1667';
const DROP_POOL_CODE='SCRAPYARD_PARTS';
const DROP_REFS=['VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE'];
const MODE_SET=new Set(['OFF','TEST','ON']);
let foundationPromise=null,settingsCache=null;

const DEFAULT_SETTINGS={
  mode:'ON',dailyRuns:10,
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
  `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,difficulty TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${RUN_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,difficulty TEXT NOT NULL,deck_power INTEGER NOT NULL DEFAULT 0,waves_total INTEGER NOT NULL DEFAULT 0,waves_cleared INTEGER NOT NULL DEFAULT 0,success INTEGER NOT NULL DEFAULT 0,rewards_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(request_id,user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_scrapyard_runs_user_day_v1676 ON ${RUN_TABLE}(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_scrapyard_receipts_created_v1676 ON ${RECEIPT_TABLE}(created_at)`
];

async function ensureFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{await ensureEquipmentFoundation(env);const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1676_scrapyard'").first();if(marker?.value==='1')return true;for(const sql of FOUNDATION_SQL)await env.DB.prepare(sql).run();await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${RECEIPT_TABLE} WHERE status<>'COMPLETED' AND created_at<datetime('now','-1 day')`),
    env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(META_KEY,JSON.stringify(DEFAULT_SETTINGS)),
    env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_scrapyard','1',CURRENT_TIMESTAMP)")
  ]);return true})().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}
async function settings(env,{fresh=false}={}){if(!fresh&&settingsCache?.expiresAt>Date.now())return settingsCache.value;const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(META_KEY).first(),value=cleanSettings(parse(row?.value,DEFAULT_SETTINGS));settingsCache={value,expiresAt:Date.now()+15000};return value}
async function dropSettings(env){
  const pool=await env.DB.prepare(`SELECT id,code,name,no_drop_weight,roll_mode,rolls,config_version,updated_at FROM ${DROP_POOL_TABLE} WHERE code=?`).bind(DROP_POOL_CODE).first();
  if(!pool)throw new Error('폐차장 차량 부품 드랍풀을 찾을 수 없습니다.');
  const rows=await env.DB.prepare(`SELECT e.id,e.reward_ref,e.reward_name,e.weight,e.min_quantity,e.max_quantity,e.is_enabled,i.name item_name,replace(i.image_url,char(92),'/') image_url FROM ${DROP_ENTRY_TABLE} e LEFT JOIN inventory_items i ON i.code=e.reward_ref WHERE e.pool_id=? AND e.reward_ref IN ('VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE') ORDER BY e.sort_order,e.id`).bind(pool.id).all();
  const entries=(rows.results||[]).map(row=>({...row,id:Number(row.id),weight:Number(row.weight||0),minQuantity:Number(row.min_quantity||1),maxQuantity:Number(row.max_quantity||1),isEnabled:Number(row.is_enabled)!==0}));
  const total=Math.max(0,Number(pool.no_drop_weight||0))+entries.filter(row=>row.isEnabled).reduce((sum,row)=>sum+Math.max(0,row.weight),0);
  return {poolId:Number(pool.id),code:pool.code,name:pool.name,rollMode:pool.roll_mode,rolls:Number(pool.rolls||1),noDropWeight:Number(pool.no_drop_weight||0),configVersion:Number(pool.config_version||1),updatedAt:pool.updated_at,totalWeight:total,noDropRate:total>0?Number((Number(pool.no_drop_weight||0)/total*100).toFixed(4)):0,entries:entries.map(row=>({...row,rate:total>0&&row.isEnabled?Number((row.weight/total*100).toFixed(4)):0}))};
}
function cleanDropSettings(raw={},current){
  const byRef=new Map((Array.isArray(raw.entries)?raw.entries:[]).map(row=>[code(row.rewardRef??row.reward_ref),row]));
  const entries=current.entries.map(existing=>{const input=byRef.get(existing.reward_ref)||{};return {rewardRef:existing.reward_ref,weight:clamp(input.weight,0,100000000,existing.weight),minQuantity:integer(input.minQuantity??input.min_quantity,1,100,existing.minQuantity),maxQuantity:integer(input.maxQuantity??input.max_quantity,1,100,existing.maxQuantity),isEnabled:input.isEnabled===false||Number(input.is_enabled)===0?false:true}});
  for(const row of entries)if(row.maxQuantity<row.minQuantity)row.maxQuantity=row.minQuantity;
  return {noDropWeight:clamp(raw.noDropWeight??raw.no_drop_weight,0,100000000,current.noDropWeight),entries};
}
async function saveDropSettings(env,raw){
  const before=await dropSettings(env),next=cleanDropSettings(raw,before),statements=[env.DB.prepare(`UPDATE ${DROP_POOL_TABLE} SET no_drop_weight=?,roll_mode='WEIGHTED_ONE',rolls=1,config_version=config_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(next.noDropWeight,before.poolId)];
  for(const row of next.entries)statements.push(env.DB.prepare(`UPDATE ${DROP_ENTRY_TABLE} SET weight=?,min_quantity=?,max_quantity=?,is_enabled=?,updated_at=CURRENT_TIMESTAMP WHERE pool_id=? AND reward_ref=?`).bind(row.weight,row.minQuantity,row.maxQuantity,row.isEnabled?1:0,before.poolId,row.rewardRef));
  await env.DB.batch(statements);invalidateUnifiedDropPoolCache();const saved=await dropSettings(env);
  if(Math.abs(saved.noDropWeight-next.noDropWeight)>.0001)throw new Error('폐차장 미획득 가중치 저장 검증에 실패했습니다.');
  for(const row of next.entries){const persisted=saved.entries.find(item=>item.reward_ref===row.rewardRef);if(!persisted||Math.abs(persisted.weight-row.weight)>.0001||persisted.minQuantity!==row.minQuantity||persisted.maxQuantity!==row.maxQuantity)throw new Error(`폐차장 드랍률 저장 검증에 실패했습니다: ${row.rewardRef}`)}
  return {before,saved};
}
function publicDeck(deck){return (deck?.cards||[]).slice(0,5).map(card=>({id:String(card.id),title:card.title,rarity:card.rarity||card.grade||'C',image:card.image||'',power:Number(card.power||0)}))}

async function status(env,user,raidDeckPower){
  const cfg=await settings(env),deck=await raidDeckPower(env,user.id,null,'PVE'),day=kstDayRange();
  const [runs,parts,best]=await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) count FROM ${RUN_TABLE} WHERE user_id=? AND created_at>=? AND created_at<?`).bind(user.id,day.start,day.end),
    env.DB.prepare("SELECT i.code,i.name,i.image_url,COALESCE(ui.quantity,0) quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.user_id=? AND ui.item_code=i.code WHERE i.code IN ('VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE') ORDER BY i.sort_order,i.code").bind(user.id),
    env.DB.prepare(`SELECT difficulty,MAX(waves_cleared) best_waves FROM ${RUN_TABLE} WHERE user_id=? GROUP BY difficulty`).bind(user.id)
  ]);
  const used=Number(runs.results?.[0]?.count||0),bestMap=Object.fromEntries((best.results||[]).map(row=>[row.difficulty,Number(row.best_waves||0)]));
  return {serverNow:new Date().toISOString(),settings:cfg,access:{allowed:cfg.mode==='ON'||cfg.mode==='TEST'&&isOwner(user),mode:cfg.mode,dailyRuns:cfg.dailyRuns,usedRuns:used,remainingRuns:Math.max(0,cfg.dailyRuns-used)},deckPower:Number(deck.power||0),deckCards:publicDeck(deck),parts:(parts.results||[]).map(row=>({...row,quantity:Number(row.quantity||0)})),best:bestMap};
}

async function monsterPool(env){
  const rows=await env.DB.prepare(`SELECT id,name,replace(image_url,char(92),'/') image,battle_power power,is_boss FROM battle_monsters WHERE is_active=1 AND COALESCE(pve_enabled,1)=1 ORDER BY COALESCE(is_boss,0),COALESCE(pve_display_order,sort_order,0),id LIMIT 80`).all();
  return rows.results||[];
}
function buildBattle({requestId,difficulty,deck,pool}){
  const waves=[],normal=pool.filter(row=>!Number(row.is_boss)),bosses=pool.filter(row=>Number(row.is_boss));let partyHp=100,cleared=0;
  for(let index=0;index<difficulty.waves;index++){
    const boss=index===difficulty.waves-1,candidates=boss&&bosses.length?bosses:normal.length?normal:pool,monster=candidates[Math.floor(hashUnit(`${requestId}:MONSTER:${index}`)*Math.max(1,candidates.length))]||{};
    const progress=index/Math.max(1,difficulty.waves-1),required=Math.round(difficulty.requiredPowerStart+(difficulty.requiredPowerEnd-difficulty.requiredPowerStart)*Math.pow(progress,1.22))*(boss ? 1.08 : 1),ratio=Number(deck.power||0)/Math.max(1,required),enemyMaxHp=Math.max(1000,Math.round(required*(boss ? 3.1 : 2.25))),turns=[],enemyDamage=Math.max(1,Math.round(required*(boss ? .19 : .13))),baseHit=Math.max(1,Math.round(Number(deck.power||0)*(.34+hashUnit(`${requestId}:HIT:${index}`)*.11)));let enemyHp=enemyMaxHp;
    for(let turn=0;turn<12&&enemyHp>0&&partyHp>0;turn++){
      const card=deck.cards[turn%Math.max(1,deck.cards.length)]||{},crit=hashUnit(`${requestId}:${index}:${turn}:CRIT`)<.18,damage=Math.max(1,Math.round(baseHit*(crit ? 1.65 : 1)*(boss ? .92 : 1)));enemyHp=Math.max(0,enemyHp-damage);turns.push({turn:turn+1,cardIndex:turn%5,damage,critical:crit,enemyHp});if(enemyHp<=0)break;const received=Math.max(1,Math.round(enemyDamage/Math.max(1,Number(deck.power||1))*(17+index*1.8)));partyHp=Math.max(0,partyHp-received);turns[turns.length-1].counterDamage=received;turns[turns.length-1].partyHp=partyHp;
    }
    const won=enemyHp<=0&&partyHp>0;if(won)cleared++;waves.push({wave:index+1,boss,requiredPower:required,powerRatio:Number(ratio.toFixed(3)),monster:{id:Number(monster.id||0),name:monster.name||(boss?'폐차장 파쇄왕':'고철 포식자'),image:monster.image||'',maxHp:enemyMaxHp},turns,won,partyHp});if(!won)break;
  }
  return {waves,wavesCleared:cleared,success:cleared===difficulty.waves,remainingPartyHp:partyHp};
}

async function run(env,user,body,deps){
  const requestId=text(body.requestId,120),difficultyId=code(body.difficulty);if(!requestId)throw new Error('원정 요청번호가 없습니다.');
  const prior=await env.DB.prepare(`SELECT status,response_json,error_message FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior?.status==='COMPLETED')return {...parse(prior.response_json,{ok:true}),replayed:true};
  if(prior?.status==='PENDING')throw new Error('같은 폐차장 원정을 처리 중입니다.');
  const cfg=await settings(env),difficulty=cfg.difficulties.find(row=>row.id===difficultyId);if(!difficulty)throw new Error('폐차장 난이도를 선택하세요.');
  if(cfg.mode==='OFF'||cfg.mode==='TEST'&&!isOwner(user))throw new Error('현재 폐차장 입장이 잠겨 있습니다.');
  const day=kstDayRange(),used=await env.DB.prepare(`SELECT COUNT(*) count FROM ${RUN_TABLE} WHERE user_id=? AND created_at>=? AND created_at<?`).bind(user.id,day.start,day.end).first();if(Number(used?.count||0)>=cfg.dailyRuns&&!isOwner(user))throw new Error(`오늘 폐차장 입장 ${cfg.dailyRuns}회를 모두 사용했습니다.`);
  const reserved=prior?.status==='FAILED'
    ?await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET difficulty=?,status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='FAILED'`).bind(difficulty.id,requestId,user.id).run()
    :await env.DB.prepare(`INSERT OR IGNORE INTO ${RECEIPT_TABLE}(request_id,user_id,difficulty,status) VALUES(?,?,?,'PENDING')`).bind(requestId,user.id,difficulty.id).run();if(!reserved.meta?.changes)throw new Error('같은 폐차장 원정을 처리 중입니다.');
  try{
    const [deck,pool]=await Promise.all([deps.raidDeckPower(env,user.id,null,'PVE'),monsterPool(env)]),battle=buildBattle({requestId,difficulty,deck,pool});
    let drop={rewards:[]};if(battle.success)drop=await deps.resolveUnifiedDrops(env,{userId:user.id,requestId:`SCRAPYARD:${requestId}`,sourceType:'SCRAPYARD',sourceId:difficulty.id,triggerType:'WAVE_CLEAR',context:{difficulty:cfg.difficulties.findIndex(row=>row.id===difficulty.id)+1,wave:battle.wavesCleared,boss:true},role:user.role});
    const clearCoin=battle.success?Number(difficulty.clearCoin||0):0,currentBalance=clearCoin>0?await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first():null;
    const guaranteed=clearCoin>0?[{rewardType:'COIN',rewardRef:'COIN',rewardName:'클리어 코인',quantity:clearCoin,guaranteed:true}]:[],rewards=[...guaranteed,...(drop.rewards||[])];
    const response={ok:true,requestId,difficulty:{id:difficulty.id,name:difficulty.name,accent:difficulty.accent,waves:difficulty.waves,clearCoin:Number(difficulty.clearCoin||0)},deckPower:Number(deck.power||0),deckCards:publicDeck(deck),...battle,rewards,partDropped:(drop.rewards||[]).length>0,balances:{...(drop.balances||{}),...(currentBalance?{coin:Number(currentBalance.coin||0)+clearCoin}:{})}};
    const statements=[
      ...(clearCoin>0?[env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(clearCoin,user.id),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'SCRAPYARD_CLEAR' FROM users WHERE id=?").bind(clearCoin,user.id)]:[]),
      env.DB.prepare(`INSERT INTO ${RUN_TABLE}(request_id,user_id,difficulty,deck_power,waves_total,waves_cleared,success,rewards_json) VALUES(?,?,?,?,?,?,?,?)`).bind(requestId,user.id,difficulty.id,response.deckPower,difficulty.waves,battle.wavesCleared,battle.success?1:0,JSON.stringify(response.rewards)),
      env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(JSON.stringify(response),requestId,user.id)
    ];await env.DB.batch(statements);
    return response;
  }catch(error){await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(text(error?.message||error,400),requestId,user.id).run().catch(()=>null);throw error}
}

export async function handleScrapyard({path,request,env,deps}){
  if(!path.startsWith('scrapyard')&&!path.startsWith('admin/scrapyard'))return null;
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);await ensureFoundation(env);
  if(path==='scrapyard/status'&&request.method==='GET')try{return deps.json(await status(env,user,deps.raidDeckPower))}catch(error){return deps.json({error:error.message||'폐차장 상태를 불러오지 못했습니다.'},400)}
  if(path==='scrapyard/run'&&request.method==='POST')try{return deps.json(await run(env,user,await deps.readBody(request),deps))}catch(error){return deps.json({error:error.message||'폐차장 원정을 시작하지 못했습니다.'},409)}
  if(path==='admin/scrapyard'){
    if(!isAdmin(user))return deps.json({error:'폐차장 관리 권한이 필요합니다.'},403);
    await ensureUnifiedDropPoolFoundation(env);
    if(request.method==='GET')return deps.json({settings:await settings(env,{fresh:true}),dropSettings:await dropSettings(env),recentRuns:(await env.DB.prepare(`SELECT r.*,u.nickname FROM ${RUN_TABLE} r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 50`).all()).results||[]});
    if(request.method==='POST'){const body=await deps.readBody(request),next=cleanSettings(body.settings||body);await env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(META_KEY,JSON.stringify(next)).run();settingsCache=null;let dropResult=null;if(body.dropSettings)dropResult=await saveDropSettings(env,body.dropSettings);await deps.writeAdminLog?.(env,user,'SCRAPYARD_SETTINGS_SAVE','SETTINGS',META_KEY,{settings:null,dropSettings:dropResult?.before||null},{settings:next,dropSettings:dropResult?.saved||null});return deps.json({ok:true,settings:next,dropSettings:dropResult?.saved||await dropSettings(env)})}
  }
  return deps.json({error:'지원하지 않는 폐차장 요청입니다.'},405);
}
