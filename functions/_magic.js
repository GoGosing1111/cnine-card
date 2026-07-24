const MAGIC_RARITIES=['R','SR','SSR'];
const MAGIC_DECK_TYPES=['PVE','PVP','CAPTAIN'];
const UNIQUE_CARD_GRADES=['SSR','MA','LIMITED','PRESTIGE','FUR'];

function defaultAcquisitionSettings(){
  return {
    tower:{enabled:false,floorRewards:[]},
    raid:{enabled:false,participation:0,rankRewards:[]},
    captain:{enabled:false,victory:0,settlement:[]},
    pve:{enabled:false,chance:0,amount:0,dailyLimit:0},
    pvp:{enabled:false,chance:0,amount:0,dailyLimit:0}
  };
}
function cleanRangeRewards(rows=[],amountKey='amount'){
  return (Array.isArray(rows)?rows:[]).slice(0,50).map(row=>{
    const from=integer(row?.from,1,1,100000),to=integer(row?.to??row?.from,from,1,100000);
    return {from:Math.min(from,to),to:Math.max(from,to),[amountKey]:integer(row?.[amountKey]??row?.amount,0,0,100000000)};
  }).filter(row=>row[amountKey]>0).sort((a,b)=>a.from-b.from||a.to-b.to);
}
function cleanFloorRewards(rows=[]){
  const map=new Map();
  for(const row of (Array.isArray(rows)?rows:[]).slice(0,300)){
    const floor=integer(row?.floor,0,1,100000),amount=integer(row?.amount,0,0,100000000);
    if(floor&&amount>0)map.set(floor,{floor,amount});
  }
  return [...map.values()].sort((a,b)=>a.floor-b.floor);
}
export function defaultMagicSettings(){
  return {
    enabled:false,
    ownerTestEnabled:true,
    drawEnabled:false,
    drawCost:100,
    duplicateRefund:{R:5,SR:20,SSR:80},
    acquisition:defaultAcquisitionSettings(),
    acquisitionNotice:'마법 결정은 인게임 플레이를 통해서만 획득할 수 있습니다.',
    version:2
  };
}
function integer(value,fallback=0,min=0,max=100000000){
  const n=Number(value);
  return Math.min(max,Math.max(min,Number.isFinite(n)?Math.floor(n):fallback));
}
export function cleanMagicSettings(raw={}){
  const base=defaultMagicSettings(),a=raw.acquisition||{},tower=a.tower||{},raid=a.raid||{},captain=a.captain||{},pve=a.pve||{},pvp=a.pvp||{};
  return {
    ...base,
    enabled:raw.enabled===true,
    ownerTestEnabled:raw.ownerTestEnabled!==false,
    drawEnabled:raw.drawEnabled===true,
    drawCost:integer(raw.drawCost,base.drawCost,0,100000000),
    duplicateRefund:{
      R:integer(raw.duplicateRefund?.R,base.duplicateRefund.R,0,100000000),
      SR:integer(raw.duplicateRefund?.SR,base.duplicateRefund.SR,0,100000000),
      SSR:integer(raw.duplicateRefund?.SSR,base.duplicateRefund.SSR,0,100000000)
    },
    acquisition:{
      tower:{enabled:tower.enabled===true,floorRewards:cleanFloorRewards(tower.floorRewards)},
      raid:{enabled:raid.enabled===true,participation:integer(raid.participation,0,0,100000000),rankRewards:cleanRangeRewards(raid.rankRewards)},
      captain:{enabled:captain.enabled===true,victory:integer(captain.victory,0,0,100000000),settlement:cleanRangeRewards(captain.settlement)},
      pve:{enabled:pve.enabled===true,chance:Math.max(0,Math.min(100,Number(pve.chance)||0)),amount:integer(pve.amount,0,0,100000000),dailyLimit:integer(pve.dailyLimit,0,0,100000000)},
      pvp:{enabled:pvp.enabled===true,chance:Math.max(0,Math.min(100,Number(pvp.chance)||0)),amount:integer(pvp.amount,0,0,100000000),dailyLimit:integer(pvp.dailyLimit,0,0,100000000)}
    },
    acquisitionNotice:String(raw.acquisitionNotice||base.acquisitionNotice).slice(0,240),
    version:2
  };
}
export async function magicSettings(env){
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first();
  if(!row?.value)return defaultMagicSettings();
  try{return cleanMagicSettings(JSON.parse(row.value))}catch{return defaultMagicSettings()}
}


export function defaultCardUniqueSettings(){
  return {enabled:false,ownerTestEnabled:true,userDetailEnabled:true,version:1};
}
export function cleanCardUniqueSettings(raw={}){
  const base=defaultCardUniqueSettings();
  return {
    enabled:raw.enabled===true,
    ownerTestEnabled:raw.ownerTestEnabled!==false,
    userDetailEnabled:raw.userDetailEnabled!==false,
    version:1
  };
}
export async function cardUniqueSettings(env){
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='card_unique_effect_settings_v1'").first();
  if(!row?.value)return defaultCardUniqueSettings();
  try{return cleanCardUniqueSettings(JSON.parse(row.value))}catch{return defaultCardUniqueSettings()}
}
function uniqueStat(value,max=500){
  const n=Number(value);
  return Math.max(-90,Math.min(max,Number.isFinite(n)?n:0));
}
export function cardUniqueVisibleTo(user,cfg){
  return cfg?.enabled===true||(cfg?.ownerTestEnabled!==false&&isOwner(user));
}
function uniqueScopeColumn(scope){
  const key=String(scope||'PVE').trim().toUpperCase();
  if(key==='PVP')return 'scope_pvp';
  if(key==='CAPTAIN')return 'scope_captain';
  return 'scope_pve';
}
function normalizeUniqueCards(cards=[]){
  return (Array.isArray(cards)?cards:[]).map((card,index)=>{
    const base=Math.max(0,Number(card?.baseBattlePower??card?.power??card?.battlePower??card?.battle_power??0)||0);
    return {...card,id:String(card?.id??card?.card_id??`slot-${index}`),power:base,maxHp:base,baseBattlePower:base,uniqueAbility:null,uniqueDefensePercent:0,uniqueSpeedPercent:0};
  });
}
function buildCardUniqueDeckState(user,cards,cfg,effectMap){
  const normalized=normalizeUniqueCards(cards),basePower=normalized.reduce((sum,card)=>sum+Number(card.power||0),0),visible=cardUniqueVisibleTo(user,cfg),ownerTest=!cfg.enabled&&visible&&isOwner(user);
  if(!visible||!normalized.length)return {enabled:false,ownerTest:false,settings:cfg,basePower,power:basePower,attackPower:basePower,durabilityPower:basePower,speedPercent:0,cards:normalized,effects:[]};
  let attackPower=0,durabilityPower=0,speedWeight=0,speedBase=0;
  const appliedEffects=[];
  const appliedCards=normalized.map(card=>{
    const effect=effectMap.get(String(card.id))||null,rawPower=Math.max(0,Number(card.power||0));
    if(!effect){attackPower+=rawPower;durabilityPower+=rawPower;speedBase+=rawPower;return card;}
    appliedEffects.push(effect);
    const attack=Math.max(0,Math.round(rawPower*(1+effect.attackPercent/100)));
    const hp=Math.max(1,Math.round(rawPower*(1+effect.hpPercent/100)));
    const durable=Math.max(0,rawPower*(1+effect.hpPercent/100)*(1+effect.defensePercent/100));
    attackPower+=attack;durabilityPower+=durable;speedWeight+=rawPower*effect.speedPercent;speedBase+=rawPower;
    return {...card,power:attack,maxHp:hp,uniqueAbility:effect,uniqueDefensePercent:effect.defensePercent,uniqueSpeedPercent:effect.speedPercent};
  });
  const speedPercent=speedBase>0?speedWeight/speedBase:0;
  const power=Math.max(0,Math.floor(Math.sqrt(Math.max(0,attackPower)*Math.max(0,durabilityPower))*(1+speedPercent/200)));
  return {enabled:true,ownerTest,settings:cfg,basePower,power,attackPower:Math.round(attackPower),durabilityPower:Math.round(durabilityPower),speedPercent:Number(speedPercent.toFixed(3)),cards:appliedCards,effects:appliedEffects};
}
export async function cardUniqueDeckStates(env,entries=[],scope='PVE'){
  const cfg=await cardUniqueSettings(env),list=(Array.isArray(entries)?entries:[]).map(entry=>({user:entry?.user||null,cards:Array.isArray(entry?.cards)?entry.cards:[]}));
  const visibleEntries=list.filter(entry=>cardUniqueVisibleTo(entry.user,cfg));
  const ids=[...new Set(visibleEntries.flatMap(entry=>entry.cards.map(card=>String(card?.id??card?.card_id??'')).filter(Boolean)))];
  const effectMap=new Map();
  if(ids.length){
    const marks=ids.map(()=>'?').join(','),scopeColumn=uniqueScopeColumn(scope);
    const rows=(await env.DB.prepare(`SELECT card_id,attack_percent,defense_percent,hp_percent,speed_percent,effect_name,effect_description,effect_type,trigger_type,effect_value,trigger_chance,max_activations FROM card_unique_effects WHERE is_active=1 AND ${scopeColumn}=1 AND card_id IN (${marks})`).bind(...ids).all()).results||[];
    for(const row of rows){
      const effect={cardId:String(row.card_id),attackPercent:uniqueStat(row.attack_percent),defensePercent:uniqueStat(row.defense_percent),hpPercent:uniqueStat(row.hp_percent),speedPercent:uniqueStat(row.speed_percent,300),effectName:String(row.effect_name||''),effectDescription:String(row.effect_description||''),effectType:String(row.effect_type||'NONE'),triggerType:String(row.trigger_type||'PASSIVE'),effectValue:Number(row.effect_value||0),triggerChance:Math.max(0,Math.min(100,Number(row.trigger_chance??100)||0)),maxActivations:Math.max(1,Math.floor(Number(row.max_activations||1)))};
      effectMap.set(effect.cardId,effect);
    }
  }
  return list.map(entry=>buildCardUniqueDeckState(entry.user,entry.cards,cfg,effectMap));
}
export async function cardUniqueDeckState(env,user,cards=[],scope='PVE'){
  return (await cardUniqueDeckStates(env,[{user,cards}],scope))[0];
}

async function tableExists(env,name){const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();return Boolean(row)}
async function columnExists(env,table,column){if(!await tableExists(env,table))return false;const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all();return rows.results.some(row=>String(row.name)===String(column))}
export async function ensureMagicRewardFoundation(env){
  if(await tableExists(env,'users')&&!await columnExists(env,'users','magic_crystals')){
    try{await env.DB.prepare('ALTER TABLE users ADD COLUMN magic_crystals INTEGER NOT NULL DEFAULT 0').run()}catch(error){if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error}
  }
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_crystal_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_crystal_reward_receipts(
      receipt_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,source TEXT NOT NULL,reference_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',roll_value REAL,configured_chance REAL NOT NULL DEFAULT 100,
      configured_amount INTEGER NOT NULL DEFAULT 0,granted_amount INTEGER NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_crystal_logs_user ON magic_crystal_logs(user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_reward_receipts_user ON magic_crystal_reward_receipts(user_id,created_at DESC)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_reward_receipts_source ON magic_crystal_reward_receipts(source,created_at DESC)')
  ]);
}
function kstDateKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function magicRewardForRank(rows,rank){return (Array.isArray(rows)?rows:[]).find(x=>Number(rank)>=Number(x.from)&&Number(rank)<=Number(x.to))?.amount||0}
export function magicRewardForTowerFloor(cfg,floor){return (cfg?.acquisition?.tower?.floorRewards||[]).find(x=>Number(x.floor)===Number(floor))?.amount||0}
export async function resolveMagicCrystalReward(env,{userId,source,referenceId,enabled=true,chance=100,amount=0,dailyLimit=0,reason=''}){
  await ensureMagicRewardFoundation(env);
  source=String(source||'MAGIC_REWARD').toUpperCase().replace(/[^A-Z0-9_]/g,'_').slice(0,50);
  referenceId=String(referenceId||'').trim().slice(0,160);
  const configuredChance=Math.max(0,Math.min(100,Number(chance)||0)),configuredAmount=integer(amount,0,0,100000000),limit=integer(dailyLimit,0,0,100000000);
  if(!userId||!referenceId)return null;
  const receiptId=`${source}:${Number(userId)}:${referenceId}`.slice(0,240);
  let existing=await env.DB.prepare('SELECT status,response_json,updated_at AS updatedAt FROM magic_crystal_reward_receipts WHERE receipt_id=?').bind(receiptId).first();
  if(existing?.status==='COMPLETED'){try{return JSON.parse(existing.response_json||'null')}catch{return null}}
  if(existing?.status==='PENDING'){
    const age=Date.now()-Date.parse(String(existing.updatedAt||'').replace(' ','T')+'Z');
    if(Number.isFinite(age)&&age<45000)return {pending:true,source,amount:0,awarded:false};
    await env.DB.prepare("UPDATE magic_crystal_reward_receipts SET status='RETRYABLE',error_message='STALE_PENDING',updated_at=CURRENT_TIMESTAMP WHERE receipt_id=? AND status='PENDING'").bind(receiptId).run();
  }
  let reserved={meta:{changes:0}};
  if(existing)reserved=await env.DB.prepare("UPDATE magic_crystal_reward_receipts SET status='PENDING',configured_chance=?,configured_amount=?,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE receipt_id=? AND status IN ('RETRYABLE','FAILED')").bind(configuredChance,configuredAmount,receiptId).run();
  if(!Number(reserved?.meta?.changes||0))reserved=await env.DB.prepare("INSERT OR IGNORE INTO magic_crystal_reward_receipts(receipt_id,user_id,source,reference_id,status,configured_chance,configured_amount) VALUES(?,?,?,?,'PENDING',?,?)").bind(receiptId,userId,source,referenceId,configuredChance,configuredAmount).run();
  if(!Number(reserved?.meta?.changes||0)){
    existing=await env.DB.prepare('SELECT status,response_json FROM magic_crystal_reward_receipts WHERE receipt_id=?').bind(receiptId).first();
    if(existing?.status==='COMPLETED'){try{return JSON.parse(existing.response_json||'null')}catch{return null}}
    return {pending:true,source,amount:0,awarded:false};
  }
  try{
    const roll=Math.random()*100;
    let grant=enabled&&configuredAmount>0&&configuredChance>0&&roll<configuredChance?configuredAmount:0;
    let earnedToday=0;
    if(grant>0&&limit>0){
      const today=kstDateKey(),row=await env.DB.prepare("SELECT COALESCE(SUM(change_amount),0) total FROM magic_crystal_logs WHERE user_id=? AND reference_type=? AND change_amount>0 AND date(created_at,'+9 hours')=?").bind(userId,source,today).first();
      earnedToday=Math.max(0,Number(row?.total||0));
      grant=Math.min(grant,Math.max(0,limit-earnedToday));
    }
    const before=await env.DB.prepare('SELECT magic_crystals FROM users WHERE id=?').bind(userId).first();
    if(!before)throw new Error('유저 정보를 찾을 수 없습니다.');
    const balance=Number(before.magic_crystals||0)+grant;
    const result={source,referenceId,awarded:grant>0,amount:grant,balance,roll:Number(roll.toFixed(6)),chance:configuredChance,dailyLimit:limit,dailyEarned:earnedToday+grant,limited:limit>0&&grant<configuredAmount};
    const statements=[];
    if(grant>0){
      statements.push(env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(grant,userId));
      statements.push(env.DB.prepare('INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)').bind(userId,grant,balance,String(reason||source).slice(0,120),source,referenceId));
    }
    statements.push(env.DB.prepare("UPDATE magic_crystal_reward_receipts SET status='COMPLETED',roll_value=?,granted_amount=?,response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE receipt_id=?").bind(roll,grant,JSON.stringify(result),receiptId));
    await env.DB.batch(statements);
    return result;
  }catch(error){
    await env.DB.prepare("UPDATE magic_crystal_reward_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE receipt_id=? AND status='PENDING'").bind(String(error?.message||error).slice(0,400),receiptId).run();
    throw error;
  }
}
function isOwner(user){return String(user?.role||'').toUpperCase()==='OWNER'}
function visibleTo(user,cfg){return cfg.enabled||(cfg.ownerTestEnabled&&isOwner(user))}
function safeCode(value=''){
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,50);
}
function randomPick(rows){
  const total=rows.reduce((sum,row)=>sum+Math.max(0.0001,Number(row.draw_weight||1)),0);
  let roll=Math.random()*total;
  for(const row of rows){roll-=Math.max(0.0001,Number(row.draw_weight||1));if(roll<=0)return row}
  return rows.at(-1);
}
function cardPayload(row){
  return {
    id:Number(row.id),code:String(row.code||''),name:String(row.name||''),rarity:String(row.rarity||'R'),
    imageUrl:String(row.image_url||''),description:String(row.description||''),effectType:String(row.effect_type||'NONE'),
    triggerType:String(row.trigger_type||'BATTLE_START'),effectValue:Number(row.effect_value||0),triggerChance:Number(row.trigger_chance||100),
    maxActivations:Number(row.max_activations||1),drawWeight:Number(row.draw_weight||1),
    scopes:{pve:row.scope_pve!==0,pvp:row.scope_pvp!==0,captain:row.scope_captain!==0},
    isActive:row.is_active!==0,sortOrder:Number(row.sort_order||0),quantity:Number(row.quantity||0)
  };
}
async function userStatus(env,user,cfg){
  const accessible=visibleTo(user,cfg);
  const balance=Number(user.magic_crystals||0);
  if(!accessible)return {visible:false,enabled:false,ownerTest:false,magicCrystals:balance,settings:{enabled:false,drawEnabled:false}};
  const [cards,loadouts]=await Promise.all([
    env.DB.prepare(`SELECT mc.*,COALESCE(umc.quantity,0) quantity FROM magic_cards mc LEFT JOIN user_magic_cards umc ON umc.magic_card_id=mc.id AND umc.user_id=? WHERE mc.is_active=1 ORDER BY mc.sort_order,mc.id`).bind(user.id).all(),
    env.DB.prepare(`SELECT deck_type,slot_no,magic_card_id FROM magic_card_loadouts WHERE user_id=? AND magic_card_id>0 ORDER BY deck_type,slot_no`).bind(user.id).all()
  ]);
  return {
    visible:true,enabled:cfg.enabled,ownerTest:!cfg.enabled&&cfg.ownerTestEnabled&&isOwner(user),magicCrystals:balance,
    settings:{drawEnabled:cfg.drawEnabled,drawCost:cfg.drawCost,duplicateRefund:cfg.duplicateRefund,acquisitionNotice:cfg.acquisitionNotice},
    cards:cards.results.map(cardPayload),
    loadouts:loadouts.results.map(x=>({deckType:String(x.deck_type),slotNo:Number(x.slot_no),magicCardId:Number(x.magic_card_id)}))
  };
}
async function requireOwner(request,env,authenticate){
  const user=await authenticate(request,env);
  return isOwner(user)?user:null;
}
async function requireAdminOperator(request,env,authenticate){
  const user=await authenticate(request,env);
  return ['OWNER','ADMIN'].includes(String(user?.role||'').toUpperCase())?user:null;
}
async function adminData(env){
  const cfg=await magicSettings(env);
  const [cards,effects,counts]=await Promise.all([
    env.DB.prepare(`SELECT * FROM magic_cards ORDER BY sort_order,id`).all(),
    env.DB.prepare(`SELECT c.id AS card_id,c.title,c.rarity,m.name AS member_name,c.image_url,COALESCE(e.attack_percent,0) attack_percent,COALESCE(e.defense_percent,0) defense_percent,COALESCE(e.hp_percent,0) hp_percent,COALESCE(e.speed_percent,0) speed_percent,COALESCE(e.effect_name,'') effect_name,COALESCE(e.effect_description,'') effect_description,COALESCE(e.effect_type,'NONE') effect_type,COALESCE(e.trigger_type,'PASSIVE') trigger_type,COALESCE(e.effect_value,0) effect_value,COALESCE(e.trigger_chance,100) trigger_chance,COALESCE(e.max_activations,1) max_activations,COALESCE(e.scope_pve,1) scope_pve,COALESCE(e.scope_pvp,1) scope_pvp,COALESCE(e.scope_captain,1) scope_captain,COALESCE(e.is_active,0) effect_active FROM cards c JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects e ON e.card_id=c.id WHERE c.rarity IN ('SSR','MA','LIMITED','PRESTIGE','FUR') AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRED') ORDER BY CASE c.rarity WHEN 'FUR' THEN 5 WHEN 'PRESTIGE' THEN 4 WHEN 'LIMITED' THEN 3 WHEN 'MA' THEN 2 ELSE 1 END DESC,m.sort_order,c.id`).all(),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM magic_cards) magic_card_count,(SELECT COUNT(*) FROM magic_cards WHERE is_active=1) active_magic_card_count,(SELECT COUNT(*) FROM user_magic_cards WHERE quantity>0) owned_record_count,(SELECT COALESCE(SUM(magic_crystals),0) FROM users) total_magic_crystals`).first()
  ]);
  return {
    settings:cfg,
    uniqueEffectSettings:await cardUniqueSettings(env),
    cards:cards.results.map(cardPayload),
    uniqueEffects:effects.results.map(x=>({
      cardId:String(x.card_id),title:String(x.title||''),grade:String(x.rarity||''),memberName:String(x.member_name||''),imageUrl:String(x.image_url||''),
      attackPercent:Number(x.attack_percent||0),defensePercent:Number(x.defense_percent||0),hpPercent:Number(x.hp_percent||0),speedPercent:Number(x.speed_percent||0),
      effectName:String(x.effect_name||''),effectDescription:String(x.effect_description||''),effectType:String(x.effect_type||'NONE'),triggerType:String(x.trigger_type||'PASSIVE'),
      effectValue:Number(x.effect_value||0),triggerChance:Number(x.trigger_chance||100),maxActivations:Number(x.max_activations||1),
      scopes:{pve:x.scope_pve!==0,pvp:x.scope_pvp!==0,captain:x.scope_captain!==0},isActive:x.effect_active!==0
    })),
    stats:{magicCardCount:Number(counts?.magic_card_count||0),activeMagicCardCount:Number(counts?.active_magic_card_count||0),ownedRecordCount:Number(counts?.owned_record_count||0),totalMagicCrystals:Number(counts?.total_magic_crystals||0)}
  };
}

export async function handleMagic({path,request,env,deps}){
  const {authenticate,readBody,json,profile,writeAdminLog}=deps;
  if(path==='magic/status'&&request.method==='GET'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    return json(await userStatus(env,user,await magicSettings(env)));
  }
  if(path==='magic/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const cfg=await magicSettings(env);if(!visibleTo(user,cfg))return json({error:'마법카드 시스템이 아직 공개되지 않았습니다.'},403);
    const body=await readBody(request),deckType=String(body.deckType||'').toUpperCase(),slotNo=integer(body.slotNo,0,1,5),magicCardId=body.magicCardId==null?null:integer(body.magicCardId,0,1,2147483647);
    if(!MAGIC_DECK_TYPES.includes(deckType)||!slotNo)return json({error:'장착 위치가 올바르지 않습니다.'},400);
    if(magicCardId===null){await env.DB.prepare(`INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(user_id,deck_type,slot_no) DO UPDATE SET magic_card_id=0,updated_at=CURRENT_TIMESTAMP`).bind(user.id,deckType,slotNo).run();return json({ok:true,status:await userStatus(env,await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first(),cfg)});}
    const owned=await env.DB.prepare(`SELECT umc.quantity,mc.is_active FROM user_magic_cards umc JOIN magic_cards mc ON mc.id=umc.magic_card_id WHERE umc.user_id=? AND umc.magic_card_id=?`).bind(user.id,magicCardId).first();
    if(!owned||Number(owned.quantity||0)<=0||Number(owned.is_active||0)!==1)return json({error:'보유하지 않았거나 비활성화된 마법카드입니다.'},400);
    const used=await env.DB.prepare(`SELECT COUNT(*) count FROM magic_card_loadouts WHERE user_id=? AND deck_type=? AND magic_card_id=? AND slot_no<>?`).bind(user.id,deckType,magicCardId,slotNo).first();
    if(Number(used?.count||0)>=Number(owned.quantity||0))return json({error:'보유 수량보다 많이 장착할 수 없습니다.'},409);
    await env.DB.prepare(`INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,deck_type,slot_no) DO UPDATE SET magic_card_id=excluded.magic_card_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,deckType,slotNo,magicCardId).run();
    const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    return json({ok:true,status:await userStatus(env,fresh,cfg)});
  }
  if(path==='magic/draw'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const cfg=await magicSettings(env);if(!visibleTo(user,cfg))return json({error:'마법카드 시스템이 아직 공개되지 않았습니다.'},403);if(!cfg.drawEnabled)return json({error:'마법카드 뽑기가 아직 개방되지 않았습니다.'},503);
    const body=await readBody(request),requestId=String(body.requestId||'').trim().slice(0,120);if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);
    let existing=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_draw_receipts WHERE request_id=?').bind(requestId).first();
    if(existing&&Number(existing.user_id)!==Number(user.id))return json({error:'이미 사용된 요청 ID입니다.'},409);
    if(existing?.status==='COMPLETED'&&existing.response_json){try{return json(JSON.parse(existing.response_json))}catch{}}
    if(existing?.status==='PENDING')return json({error:'이미 처리 중인 뽑기입니다.'},409);
    if(!existing){
      await env.DB.prepare(`INSERT OR IGNORE INTO magic_card_draw_receipts(request_id,user_id,status,cost,created_at,updated_at) VALUES(?,?,'PENDING',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(requestId,user.id,cfg.drawCost).run();
      existing=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_draw_receipts WHERE request_id=?').bind(requestId).first();
      if(!existing||Number(existing.user_id)!==Number(user.id))return json({error:'뽑기 요청을 등록하지 못했습니다.'},409);
    }else{
      await env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='PENDING',cost=?,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(cfg.drawCost,requestId,user.id).run();
    }
    let deducted=false,rewardCommitted=false;
    try{
      const pool=(await env.DB.prepare(`SELECT * FROM magic_cards WHERE is_active=1 AND draw_weight>0 ORDER BY sort_order,id`).all()).results;if(!pool.length)throw new Error('활성화된 마법카드가 없습니다.');
      const spend=await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals-? WHERE id=? AND magic_crystals>=?').bind(cfg.drawCost,user.id,cfg.drawCost).run();
      if(Number(spend.meta?.changes||0)!==1){const e=new Error(`마법 결정이 부족합니다. (${cfg.drawCost.toLocaleString()}개 필요)`);e.status=400;throw e}deducted=true;
      const picked=randomPick(pool),owned=await env.DB.prepare('SELECT quantity FROM user_magic_cards WHERE user_id=? AND magic_card_id=?').bind(user.id,picked.id).first(),duplicate=Number(owned?.quantity||0)>0,refund=duplicate?integer(cfg.duplicateRefund?.[String(picked.rarity||'R')],0):0;
      const spentUser=await env.DB.prepare('SELECT magic_crystals FROM users WHERE id=?').bind(user.id).first();if(!spentUser)throw new Error('유저 정보를 찾을 수 없습니다.');
      const finalBalance=Number(spentUser.magic_crystals||0)+refund;
      const result={ok:true,card:cardPayload({...picked,quantity:duplicate?Number(owned.quantity||0):1}),duplicate,refund,magicCrystals:finalBalance};
      const statements=[];
      if(!duplicate)statements.push(env.DB.prepare(`INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,first_obtained_at,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,magic_card_id) DO UPDATE SET quantity=user_magic_cards.quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id,picked.id));
      if(refund>0)statements.push(env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(refund,user.id));
      statements.push(env.DB.prepare(`INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)`).bind(user.id,-cfg.drawCost+refund,finalBalance,duplicate?'마법카드 중복 환급':'마법카드 뽑기','MAGIC_DRAW',requestId));
      statements.push(env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(JSON.stringify(result),requestId,user.id));
      await env.DB.batch(statements);rewardCommitted=true;
      return json(result);
    }catch(error){
      if(deducted&&!rewardCommitted)await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(cfg.drawCost,user.id).run();
      if(!rewardCommitted)await env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(String(error.message||error).slice(0,300),requestId,user.id).run();
      return json({error:String(error.message||error)},Number(error.status||500));
    }
  }
  if(path==='admin/magic-acquisition'){
    const admin=await requireAdminOperator(request,env,authenticate);if(!admin)return json({error:'마법 결정 보상 관리 권한이 없습니다.'},403);
    if(request.method==='GET'){
      const cfg=await magicSettings(env);
      return json({ok:true,settings:{acquisition:cfg.acquisition},role:String(admin.role||'').toUpperCase()});
    }
    if(request.method==='POST'){
      const body=await readBody(request),before=await magicSettings(env);
      const acquisition=body.acquisition||body.settings?.acquisition||{};
      const next=cleanMagicSettings({...before,acquisition});
      await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('magic_card_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();
      await writeAdminLog(env,admin,'MAGIC_ACQUISITION_SAVE','APP_META','magic_card_settings_v1',before.acquisition,next.acquisition);
      return json({ok:true,settings:{acquisition:next.acquisition}});
    }
    return json({error:'지원하지 않는 요청 방식입니다.'},405);
  }
  if(path==='admin/magic-system'){
    const admin=await requireOwner(request,env,authenticate);if(!admin)return json({error:'마법카드 관리는 OWNER 전용입니다.'},403);
    if(request.method==='GET')return json(await adminData(env));
    if(request.method==='POST'){
      const body=await readBody(request),action=String(body.action||'').toUpperCase();
      if(action==='SAVE_SETTINGS'){
        const before=await magicSettings(env),next=cleanMagicSettings(body.settings||body);
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('magic_card_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();
        await writeAdminLog(env,admin,'MAGIC_SETTINGS_SAVE','APP_META','magic_card_settings_v1',before,next);
        return json({ok:true,settings:next});
      }
      if(action==='SAVE_UNIQUE_SETTINGS'){
        const before=await cardUniqueSettings(env),next=cleanCardUniqueSettings(body.settings||body);
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('card_unique_effect_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();
        await writeAdminLog(env,admin,'CARD_UNIQUE_SETTINGS_SAVE','APP_META','card_unique_effect_settings_v1',before,next);
        return json({ok:true,settings:next});
      }
      if(action==='SAVE_MAGIC_CARD'){
        const id=body.id?integer(body.id,0,1,2147483647):null,code=safeCode(body.code||body.name),name=String(body.name||'').trim().slice(0,60),rarity=String(body.rarity||'R').toUpperCase();
        if(!name)return json({error:'마법카드 이름을 입력하세요.'},400);if(!code)return json({error:'마법카드 코드를 입력하세요.'},400);if(!MAGIC_RARITIES.includes(rarity))return json({error:'마법카드 등급은 R·SR·SSR만 사용할 수 있습니다.'},400);
        const values=[code,name,rarity,String(body.imageUrl||'').trim().slice(0,500),String(body.description||'').trim().slice(0,300),String(body.effectType||'NONE').toUpperCase().slice(0,40),String(body.triggerType||'BATTLE_START').toUpperCase().slice(0,40),Number(body.effectValue||0),Math.min(100,Math.max(0,Number(body.triggerChance??100))),integer(body.maxActivations,1,1,99),Math.max(0.0001,Number(body.drawWeight||1)),body.scopes?.pve===false?0:1,body.scopes?.pvp===false?0:1,body.scopes?.captain===false?0:1,body.isActive===false?0:1,integer(body.sortOrder,0,0,100000)];
        if(id)await env.DB.prepare(`UPDATE magic_cards SET code=?,name=?,rarity=?,image_url=?,description=?,effect_type=?,trigger_type=?,effect_value=?,trigger_chance=?,max_activations=?,draw_weight=?,scope_pve=?,scope_pvp=?,scope_captain=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values,id).run();
        else await env.DB.prepare(`INSERT INTO magic_cards(code,name,rarity,image_url,description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,draw_weight,scope_pve,scope_pvp,scope_captain,is_active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
        await writeAdminLog(env,admin,'MAGIC_CARD_SAVE','MAGIC_CARD',String(id||code),null,{code,name,rarity});
        return json({ok:true});
      }
      if(action==='TOGGLE_MAGIC_CARD'){
        const id=integer(body.id,0,1,2147483647);await env.DB.prepare('UPDATE magic_cards SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.isActive===true?1:0,id).run();await writeAdminLog(env,admin,'MAGIC_CARD_TOGGLE','MAGIC_CARD',String(id),null,{isActive:body.isActive===true});return json({ok:true});
      }
      if(action==='SAVE_UNIQUE_EFFECT'){
        const cardId=String(body.cardId||'').trim(),card=await env.DB.prepare(`SELECT id,rarity FROM cards WHERE id=?`).bind(cardId).first();if(!card)return json({error:'카드를 찾을 수 없습니다.'},404);if(!UNIQUE_CARD_GRADES.includes(String(card.rarity||'').toUpperCase()))return json({error:'고유 효과는 SSR 이상 카드에만 설정할 수 있습니다.'},400);
        const v=[cardId,uniqueStat(body.attackPercent),uniqueStat(body.defensePercent),uniqueStat(body.hpPercent),uniqueStat(body.speedPercent,300),String(body.effectName||'').trim().slice(0,80),String(body.effectDescription||'').trim().slice(0,300),String(body.effectType||'NONE').toUpperCase().slice(0,40),String(body.triggerType||'PASSIVE').toUpperCase().slice(0,40),Number(body.effectValue||0),Math.min(100,Math.max(0,Number(body.triggerChance??100))),integer(body.maxActivations,1,1,99),body.scopes?.pve===false?0:1,body.scopes?.pvp===false?0:1,body.scopes?.captain===false?0:1,body.isActive===true?1:0];
        await env.DB.prepare(`INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,hp_percent,speed_percent,effect_name,effect_description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,scope_pve,scope_pvp,scope_captain,is_active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(card_id) DO UPDATE SET attack_percent=excluded.attack_percent,defense_percent=excluded.defense_percent,hp_percent=excluded.hp_percent,speed_percent=excluded.speed_percent,effect_name=excluded.effect_name,effect_description=excluded.effect_description,effect_type=excluded.effect_type,trigger_type=excluded.trigger_type,effect_value=excluded.effect_value,trigger_chance=excluded.trigger_chance,max_activations=excluded.max_activations,scope_pve=excluded.scope_pve,scope_pvp=excluded.scope_pvp,scope_captain=excluded.scope_captain,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP`).bind(...v).run();
        await writeAdminLog(env,admin,'CARD_UNIQUE_EFFECT_SAVE','CARD',cardId,null,{effectName:body.effectName,isActive:body.isActive===true});return json({ok:true});
      }
      return json({error:'올바르지 않은 작업입니다.'},400);
    }
  }
  return null;
}
