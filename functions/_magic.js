const MAGIC_RARITIES=['R','SR','SSR'];
const MAGIC_DECK_TYPES=['PVE','PVP'];
export const MAGIC_BATTLE_EFFECTS=['OPENING_ATTACK','GUARD_BARRIER','LIFE_AMPLIFY','CRISIS_HEAL','PUNISH_TRAP','ARCANE_COUNTER','FOLLOWUP_HASTE'];
const MAGIC_EFFECT_IMAGES={
  OPENING_ATTACK:'assets/ui/magic-cards/opening-attack-768-v1500.webp',
  GUARD_BARRIER:'assets/ui/magic-cards/guard-barrier-768-v1500.webp',
  LIFE_AMPLIFY:'assets/ui/magic-cards/life-amplify-768-v1500.webp',
  CRISIS_HEAL:'assets/ui/magic-cards/crisis-heal-768-v1500.webp',
  PUNISH_TRAP:'assets/ui/magic-cards/punish-trap-768-v1500.webp',
  ARCANE_COUNTER:'assets/ui/magic-cards/arcane-counter-768-v1500.webp',
  FOLLOWUP_HASTE:'assets/ui/magic-cards/followup-haste-768-v1500.webp'
};
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
    drawCoinCost:1000,
    duplicateRefund:{R:5,SR:20,SSR:80},
    enhancement:{maxLevel:7,shardCosts:[100,200,350,550,800,1100,1500],successRates:[100,90,80,70,60,50,40],triggerBonuses:[0,3,6,10,15,21,28,36]},
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
    drawCoinCost:integer(raw.drawCoinCost,base.drawCoinCost,0,100000000),
    duplicateRefund:{
      R:integer(raw.duplicateRefund?.R,base.duplicateRefund.R,0,100000000),
      SR:integer(raw.duplicateRefund?.SR,base.duplicateRefund.SR,0,100000000),
      SSR:integer(raw.duplicateRefund?.SSR,base.duplicateRefund.SSR,0,100000000)
    },
    enhancement:{
      maxLevel:7,
      shardCosts:Array.from({length:7},(_,i)=>integer(raw.enhancement?.shardCosts?.[i],base.enhancement.shardCosts[i],0,100000000)),
      successRates:Array.from({length:7},(_,i)=>Math.max(0,Math.min(100,Number(raw.enhancement?.successRates?.[i]??base.enhancement.successRates[i])))),
      triggerBonuses:Array.from({length:8},(_,i)=>Math.max(0,Math.min(100,Number(raw.enhancement?.triggerBonuses?.[i]??base.enhancement.triggerBonuses[i]))))
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

function normalizeMagicBattleEffect(row={}){
  const raw=String(row.effect_type||row.effectType||'').trim().toUpperCase(),trigger=String(row.trigger_type||row.triggerType||'').trim().toUpperCase();
  const aliases={ATTACK_BUFF:'OPENING_ATTACK',DEFENSE_BUFF:'GUARD_BARRIER',SHIELD:'GUARD_BARRIER',HP_BUFF:'LIFE_AMPLIFY',HEAL:'CRISIS_HEAL',TRAP:'PUNISH_TRAP',COUNTER:'ARCANE_COUNTER',SPEED_BUFF:'FOLLOWUP_HASTE',HASTE:'FOLLOWUP_HASTE'};
  const effectType=MAGIC_BATTLE_EFFECTS.includes(raw)?raw:(aliases[raw]||aliases[trigger]||'');
  const level=integer(row.enhancement_level??row.enhancementLevel,0,0,7),bonus=Math.max(0,Number(row.trigger_bonus??row.triggerBonus)||0);
  return effectType?{id:Number(row.id||0),slotNo:integer(row.slot_no??row.slotNo,1,1,5),code:String(row.code||''),name:String(row.name||''),rarity:String(row.rarity||'R').toUpperCase(),imageUrl:String(row.image_url||row.imageUrl||MAGIC_EFFECT_IMAGES[effectType]||''),effectType,effectValue:Math.max(0,Math.min(500,Number(row.effect_value??row.effectValue)||0)),triggerChance:Math.max(0,Math.min(100,(Number(row.trigger_chance??row.triggerChance??100)||0)+bonus)),enhancementLevel:level,maxActivations:integer(row.max_activations??row.maxActivations,1,1,99)}:null;
}

export async function magicBattleLoadout(env,user,deckType='PVE'){
  const type=String(deckType||'PVE').trim().toUpperCase();
  if(!user||!MAGIC_DECK_TYPES.includes(type))return {enabled:false,ownerTest:false,deckType:type,cards:[]};
  const cfg=await magicSettings(env),visible=cfg.enabled===true||(cfg.ownerTestEnabled!==false&&isOwner(user));
  if(!visible)return {enabled:false,ownerTest:false,deckType:type,cards:[]};
  const scope=type==='PVP'?'scope_pvp':'scope_pve';
  const rows=(await env.DB.prepare(`SELECT l.slot_no,mc.id,mc.code,mc.name,mc.rarity,mc.image_url,mc.effect_type,mc.trigger_type,mc.effect_value,mc.trigger_chance,mc.max_activations,COALESCE(umc.enhancement_level,0) enhancement_level FROM magic_card_loadouts l JOIN magic_cards mc ON mc.id=l.magic_card_id JOIN user_magic_cards umc ON umc.user_id=l.user_id AND umc.magic_card_id=mc.id WHERE l.user_id=? AND l.deck_type=? AND l.magic_card_id>0 AND mc.is_active=1 AND mc.${scope}=1 ORDER BY l.slot_no`).bind(user.id,type).all()).results||[];
  const bonus=magicSettings(env).then(cfg=>cfg.enhancement.triggerBonuses);
  const bonuses=await bonus;
  rows.forEach(row=>{row.trigger_bonus=bonuses[integer(row.enhancement_level,0,0,7)]||0});
  return {enabled:true,ownerTest:cfg.enabled!==true&&isOwner(user),deckType:type,cards:rows.map(normalizeMagicBattleEffect).filter(Boolean)};
}


let cardUniqueSettingsCache={at:0,value:null};
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
export async function cardUniqueSettings(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&cardUniqueSettingsCache.value&&now-cardUniqueSettingsCache.at<5000)return cardUniqueSettingsCache.value;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='card_unique_effect_settings_v1'").first();
  let value=defaultCardUniqueSettings();
  if(row?.value){try{value=cleanCardUniqueSettings(JSON.parse(row.value))}catch{}}
  cardUniqueSettingsCache={at:now,value};
  return value;
}
function uniqueStat(value,max=500){
  const n=Number(value);
  return Math.max(-90,Math.min(max,Number.isFinite(n)?n:0));
}
const UNIQUE_DOMINANT_STATS=[
  {type:'ATTACK',key:'attackPercent',label:'공격'},
  {type:'DEFENSE',key:'defensePercent',label:'방어'},
  {type:'SPEED',key:'speedPercent',label:'속도'},
  {type:'HP',key:'hpPercent',label:'HP'}
];
function withDominantUniqueStat(effect={}){
  const values=UNIQUE_DOMINANT_STATS.map(stat=>({stat,value:Number(effect?.[stat.key]||0)}));
  const highest=Math.max(...values.map(item=>item.value));
  const winner=highest>0?values.find(item=>item.value===highest):null;
  return {
    ...effect,
    dominantType:winner?.stat.type||'NONE',
    dominantKey:winner?.stat.key||'',
    dominantLabel:winner?.stat.label||'',
    dominantValue:winner?winner.value:0
  };
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
      const effect=withDominantUniqueStat({cardId:String(row.card_id),attackPercent:uniqueStat(row.attack_percent),defensePercent:uniqueStat(row.defense_percent),hpPercent:uniqueStat(row.hp_percent),speedPercent:uniqueStat(row.speed_percent,300),effectName:String(row.effect_name||''),effectDescription:String(row.effect_description||''),effectType:String(row.effect_type||'NONE'),triggerType:String(row.trigger_type||'PASSIVE'),effectValue:Number(row.effect_value||0),triggerChance:Math.max(0,Math.min(100,Number(row.trigger_chance??100)||0)),maxActivations:Math.max(1,Math.floor(Number(row.max_activations||1)))});
      effectMap.set(effect.cardId,effect);
    }
  }
  return list.map(entry=>buildCardUniqueDeckState(entry.user,entry.cards,cfg,effectMap));
}
export async function cardUniqueDeckState(env,user,cards=[],scope='PVE'){
  return (await cardUniqueDeckStates(env,[{user,cards}],scope))[0];
}

function uniqueEffectMagnitude(effect,type='ATTACK'){
  const configured=Number(effect?.effectValue||0);
  if(Number.isFinite(configured)&&configured>0)return Math.max(0,configured);
  const dominant=Math.max(0,Number(effect?.dominantValue||0));
  if(type==='HP')return Math.max(6,dominant);
  if(type==='DEFENSE')return Math.max(5,dominant);
  if(type==='SPEED')return Math.max(5,dominant);
  return Math.max(5,dominant);
}
function uniqueEffectActivationBonus(card={},effect={},type='ATTACK'){
  const magnitude=uniqueEffectMagnitude(effect,type);
  const attackBase=Math.max(0,Number(card?.power||card?.baseBattlePower||0));
  const hpBase=Math.max(0,Number(card?.maxHp||card?.power||card?.baseBattlePower||0));
  if(type==='DEFENSE')return Math.max(0,Math.round(hpBase*magnitude/100*0.72));
  if(type==='SPEED')return Math.max(0,Math.round(attackBase*magnitude/100*0.84));
  if(type==='HP')return Math.max(0,Math.round(hpBase*magnitude/100));
  return Math.max(0,Math.round(attackBase*magnitude/100));
}
function uniqueEffectLabel(type='ATTACK'){
  if(type==='ATTACK')return '공격형';
  if(type==='DEFENSE')return '방어형';
  if(type==='SPEED')return '속도형';
  if(type==='HP')return 'HP형';
  return '고유효과';
}
function uniqueEffectSummary(type='ATTACK',bonus=0){
  const amount=Math.max(0,Math.floor(Number(bonus)||0)).toLocaleString();
  if(type==='ATTACK')return `추가 타격 +${amount}`;
  if(type==='DEFENSE')return `방벽 +${amount}`;
  if(type==='SPEED')return `선공 타격 +${amount}`;
  if(type==='HP')return `긴급 회복 +${amount}`;
  return `효과 +${amount}`;
}
function uniqueEffectPhase(type='ATTACK'){
  if(type==='DEFENSE')return 'DEFENSE';
  if(type==='HP')return 'RECOVERY';
  return 'ATTACK';
}
function uniqueBattleRoleMultiplier(type='ATTACK',mode='PVE'){
  const normalizedMode=String(mode||'PVE').trim().toUpperCase();
  const isPve=normalizedMode==='PVE'||normalizedMode==='PVE_AUTO'||normalizedMode==='TOWER'||normalizedMode==='RAID'||normalizedMode==='RIFT'||normalizedMode==='SEAL';
  const isPvp=normalizedMode==='PVP'||normalizedMode==='TERRITORY'||normalizedMode==='CAPTAIN';
  if(type==='ATTACK')return isPve?1.15:(isPvp?1.05:1);
  if(type==='DEFENSE')return isPve?1.25:(isPvp?1.15:1.1);
  return 1;
}
export function resolveUniqueBattleRuntime(deckState={},options={}){
  const random=typeof options?.random==='function'?options.random:Math.random;
  const cards=Array.isArray(deckState?.cards)?deckState.cards:[];
  const basePower=Math.max(0,Number(options?.basePower??deckState?.power??cards.reduce((sum,card)=>sum+Math.max(0,Number(card?.power||0)),0)));
  const opponentPower=Math.max(0,Number(options?.opponentPower||0));
  const mode=String(options?.mode||'PVE').trim().toUpperCase();
  const immediateEvents=[];
  const pendingHpEvents=[];
  let immediateBonus=0;
  for(const card of cards){
    const effect=card?.uniqueAbility;
    if(!effect||effect.dominantType==='NONE')continue;
    const type=String(effect.dominantType||'').trim().toUpperCase();
    if(!['ATTACK','DEFENSE','SPEED','HP'].includes(type))continue;
    const maxActivations=Math.max(0,Math.floor(Number(effect.maxActivations||1)));
    if(maxActivations<1)continue;
    const chance=Math.max(0,Math.min(100,Number(effect.triggerChance??100)));
    const roll=chance>=100?0:random()*100;
    const triggered=chance>=100||roll<chance;
    const roleMultiplier=uniqueBattleRoleMultiplier(type,mode);
    const bonusPower=Math.max(0,Math.round(uniqueEffectActivationBonus(card,effect,type)*roleMultiplier));
    const baseEvent={
      cardId:String(card?.id||effect.cardId||''),
      cardTitle:String(card?.title||card?.card_title||''),
      type,
      label:uniqueEffectLabel(type),
      phase:uniqueEffectPhase(type),
      mode,
      triggerChance:chance,
      roll:Number(roll.toFixed(6)),
      triggered,
      magnitude:uniqueEffectMagnitude(effect,type),
      roleMultiplier,
      bonusPower,
      summary:uniqueEffectSummary(type,bonusPower)
    };
    if(!triggered||bonusPower<=0)continue;
    if(type==='HP')pendingHpEvents.push(baseEvent);
    else {immediateEvents.push(baseEvent); immediateBonus+=bonusPower;}
  }
  let effectivePower=basePower+immediateBonus;
  const recoveryNeeded=pendingHpEvents.length>0&&effectivePower<opponentPower;
  let hpRecoveryBonus=0;
  const hpEvents=[];
  if(recoveryNeeded){
    for(const event of pendingHpEvents){
      hpEvents.push({...event,triggered:true,activated:true});
      hpRecoveryBonus+=Math.max(0,Number(event.bonusPower||0));
    }
    effectivePower+=hpRecoveryBonus;
  }
  const events=[...immediateEvents.map(event=>({...event,activated:true})),...hpEvents];
  return {
    mode,
    basePower,
    opponentPower,
    immediateBonus,
    hpRecoveryBonus,
    totalBonus:immediateBonus+hpRecoveryBonus,
    effectivePower,
    recoveryTriggered:hpRecoveryBonus>0,
    events,
    hasEvents:events.length>0
  };
}

const magicSchemaTableCache=new Set();
const magicSchemaColumnCache=new Set();
async function tableExists(env,name){
  const key=String(name||'');if(magicSchemaTableCache.has(key))return true;
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(key).first();
  if(row)magicSchemaTableCache.add(key);return Boolean(row);
}
async function columnExists(env,table,column){
  const key=`${table}:${column}`;if(magicSchemaColumnCache.has(key))return true;
  if(!await tableExists(env,table))return false;
  const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all(),exists=rows.results.some(row=>String(row.name)===String(column));
  if(exists)magicSchemaColumnCache.add(key);return exists;
}
let magicRewardFoundationPromise=null;
export async function ensureMagicRewardFoundation(env){
  if(magicRewardFoundationPromise)return magicRewardFoundationPromise;
  magicRewardFoundationPromise=(async()=>{
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1205_magic_reward_foundation_gate'").first();
    if(marker?.value==='1')return true;
    if(await tableExists(env,'users')&&!await columnExists(env,'users','magic_crystals')){
      try{await env.DB.prepare('ALTER TABLE users ADD COLUMN magic_crystals INTEGER NOT NULL DEFAULT 0').run();magicSchemaColumnCache.add('users:magic_crystals')}
      catch(error){if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error}
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
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_reward_receipts_source ON magic_crystal_reward_receipts(source,created_at DESC)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1205_magic_reward_foundation_gate','1',CURRENT_TIMESTAMP)")
    ]);
    magicSchemaTableCache.add('magic_crystal_logs');magicSchemaTableCache.add('magic_crystal_reward_receipts');
    return true;
  })().catch(error=>{magicRewardFoundationPromise=null;throw error});
  return magicRewardFoundationPromise;
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
function publicImageUrl(value=''){
  let url=String(value||'').trim().replace(/\\/g,'/');
  if(!url)return '';
  if(/^(?:https?:|data:|blob:)/i.test(url)||url.startsWith('//'))return url;
  url=url.replace(/^\.\/+/, '').replace(/^(?:\.\.\/)+/, '');
  return `/${url.replace(/^\/+/, '')}`;
}
function randomPick(rows){
  const total=rows.reduce((sum,row)=>sum+Math.max(0.0001,Number(row.draw_weight||1)),0);
  let roll=Math.random()*total;
  for(const row of rows){roll-=Math.max(0.0001,Number(row.draw_weight||1));if(roll<=0)return row}
  return rows.at(-1);
}
function cardPayload(row,cfg=defaultMagicSettings()){
  const effectType=String(row.effect_type||'NONE').toUpperCase();
  const enhancementLevel=integer(row.enhancement_level??row.enhancementLevel,0,0,7),triggerBonus=Number(cfg.enhancement?.triggerBonuses?.[enhancementLevel]||0);
  return {
    id:Number(row.id),code:String(row.code||''),name:String(row.name||''),rarity:String(row.rarity||'R'),
    imageUrl:publicImageUrl(row.image_url||MAGIC_EFFECT_IMAGES[effectType]||''),description:String(row.description||''),effectType,
    triggerType:String(row.trigger_type||'BATTLE_START'),effectValue:Number(row.effect_value||0),triggerChance:Number(row.trigger_chance??100),effectiveTriggerChance:Math.min(100,Number(row.trigger_chance??100)+triggerBonus),enhancementLevel,
    maxActivations:Number(row.max_activations||1),drawWeight:Number(row.draw_weight||1),
    scopes:{pve:row.scope_pve!==0,pvp:row.scope_pvp!==0,captain:row.scope_captain!==0},
    isActive:row.is_active!==0,sortOrder:Number(row.sort_order||0),quantity:Number(row.quantity||0),materialQuantity:Math.max(0,Number(row.quantity||0)-1)
  };
}
async function userStatus(env,user,cfg){
  const accessible=visibleTo(user,cfg);
  const balance=Number(user.magic_crystals||0);
  if(!accessible)return {visible:false,enabled:false,ownerTest:false,magicCrystals:balance,settings:{enabled:false,drawEnabled:false}};
  const [cards,loadouts]=await Promise.all([
    env.DB.prepare(`SELECT mc.*,COALESCE(umc.quantity,0) quantity,COALESCE(umc.enhancement_level,0) enhancement_level FROM magic_cards mc LEFT JOIN user_magic_cards umc ON umc.magic_card_id=mc.id AND umc.user_id=? WHERE mc.is_active=1 ORDER BY mc.sort_order,mc.id`).bind(user.id).all(),
    env.DB.prepare(`SELECT deck_type,slot_no,magic_card_id FROM magic_card_loadouts WHERE user_id=? AND magic_card_id>0 ORDER BY deck_type,slot_no`).bind(user.id).all()
  ]);
  return {
    visible:true,enabled:cfg.enabled,ownerTest:!cfg.enabled&&cfg.ownerTestEnabled&&isOwner(user),magicCrystals:balance,coin:Number(user.coin||0),cardShards:Number(user.card_shards||0),
    settings:{drawEnabled:cfg.drawEnabled,drawCost:cfg.drawCost,drawCoinCost:cfg.drawCoinCost,duplicateRefund:cfg.duplicateRefund,enhancement:cfg.enhancement,acquisitionNotice:cfg.acquisitionNotice},
    cards:cards.results.map(row=>cardPayload(row,cfg)),
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
    env.DB.prepare(`SELECT c.id AS card_id,c.title,c.rarity,m.name AS member_name,c.image_url,COALESCE(e.attack_percent,0) attack_percent,COALESCE(e.defense_percent,0) defense_percent,COALESCE(e.hp_percent,0) hp_percent,COALESCE(e.speed_percent,0) speed_percent,COALESCE(e.effect_name,'') effect_name,COALESCE(e.effect_description,'') effect_description,COALESCE(e.effect_type,'NONE') effect_type,COALESCE(e.trigger_type,'PASSIVE') trigger_type,COALESCE(e.effect_value,0) effect_value,COALESCE(e.trigger_chance,100) trigger_chance,COALESCE(e.max_activations,1) max_activations,COALESCE(e.scope_pve,1) scope_pve,COALESCE(e.scope_pvp,1) scope_pvp,COALESCE(e.scope_captain,1) scope_captain,COALESCE(e.is_active,0) effect_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects e ON e.card_id=c.id WHERE c.rarity IN ('SSR','MA','LIMITED','PRESTIGE','FUR') AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRED') ORDER BY CASE c.rarity WHEN 'FUR' THEN 5 WHEN 'PRESTIGE' THEN 4 WHEN 'LIMITED' THEN 3 WHEN 'MA' THEN 2 ELSE 1 END DESC,m.sort_order,c.id`).all(),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM magic_cards) magic_card_count,(SELECT COUNT(*) FROM magic_cards WHERE is_active=1) active_magic_card_count,(SELECT COUNT(*) FROM user_magic_cards WHERE quantity>0) owned_record_count,(SELECT COALESCE(SUM(magic_crystals),0) FROM users) total_magic_crystals`).first()
  ]);
  return {
    settings:cfg,
    uniqueEffectSettings:await cardUniqueSettings(env),
    cards:cards.results.map(row=>cardPayload(row,cfg)),
    uniqueEffects:effects.results.map(x=>({
      cardId:String(x.card_id),title:String(x.title||''),grade:String(x.rarity||''),memberName:String(x.member_name||''),imageUrl:publicImageUrl(x.image_url),
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
    const owned=await env.DB.prepare(`SELECT umc.quantity,mc.is_active,mc.scope_pve,mc.scope_pvp FROM user_magic_cards umc JOIN magic_cards mc ON mc.id=umc.magic_card_id WHERE umc.user_id=? AND umc.magic_card_id=?`).bind(user.id,magicCardId).first();
    if(!owned||Number(owned.quantity||0)<=0||Number(owned.is_active||0)!==1)return json({error:'보유하지 않았거나 비활성화된 마법카드입니다.'},400);
    if((deckType==='PVE'&&Number(owned.scope_pve||0)!==1)||(deckType==='PVP'&&Number(owned.scope_pvp||0)!==1))return json({error:`${deckType}에 적용할 수 없는 마법카드입니다.`},400);
    const used=await env.DB.prepare(`SELECT COUNT(*) count FROM magic_card_loadouts WHERE user_id=? AND deck_type=? AND magic_card_id=? AND slot_no<>?`).bind(user.id,deckType,magicCardId,slotNo).first();
    if(Number(used?.count||0)>0)return json({error:'같은 마법카드는 한 덱에 한 장만 장착할 수 있습니다.'},409);
    await env.DB.prepare(`INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,deck_type,slot_no) DO UPDATE SET magic_card_id=excluded.magic_card_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,deckType,slotNo,magicCardId).run();
    const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    return json({ok:true,status:await userStatus(env,fresh,cfg)});
  }
  if(path==='magic/enhance'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const cfg=await magicSettings(env);if(!visibleTo(user,cfg))return json({error:'마법카드 시스템이 아직 공개되지 않았습니다.'},403);
    const body=await readBody(request),requestId=String(body.requestId||'').trim().slice(0,120),magicCardId=integer(body.magicCardId,0,1,2147483647);if(!requestId||!magicCardId)return json({error:'강화 요청 정보가 올바르지 않습니다.'},400);
    let receipt=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_enhance_receipts WHERE request_id=?').bind(requestId).first();
    if(receipt&&Number(receipt.user_id)!==Number(user.id))return json({error:'이미 사용된 요청 ID입니다.'},409);
    if(receipt?.status==='COMPLETED'&&receipt.response_json){try{return json(JSON.parse(receipt.response_json))}catch{}}
    if(receipt?.status==='PENDING')return json({error:'이미 처리 중인 강화입니다.'},409);
    await env.DB.prepare(`INSERT INTO magic_card_enhance_receipts(request_id,user_id,magic_card_id,status,created_at,updated_at) VALUES(?,?,?,'PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(request_id) DO UPDATE SET status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=excluded.user_id`).bind(requestId,user.id,magicCardId).run();
    let materialReserved=false,shardsDeducted=false,enhancementCommitted=false,beforeLevel=0,shardCost=0;
    try{
      const owned=await env.DB.prepare(`SELECT umc.quantity,COALESCE(umc.enhancement_level,0) enhancement_level,mc.name FROM user_magic_cards umc JOIN magic_cards mc ON mc.id=umc.magic_card_id WHERE umc.user_id=? AND umc.magic_card_id=? AND mc.is_active=1`).bind(user.id,magicCardId).first();
      if(!owned||Number(owned.quantity||0)<2){const e=new Error('강화 재료로 사용할 동일한 0강 카드가 1장 더 필요합니다.');e.status=400;throw e}
      beforeLevel=integer(owned.enhancement_level,0,0,7);if(beforeLevel>=7){const e=new Error('이미 최고 강화 단계입니다.');e.status=400;throw e}
      shardCost=integer(cfg.enhancement.shardCosts[beforeLevel],0);const successRate=Number(cfg.enhancement.successRates[beforeLevel]||0),balance=await env.DB.prepare('SELECT card_shards FROM users WHERE id=?').bind(user.id).first();
      if(Number(balance?.card_shards||0)<shardCost){const e=new Error(`카드 조각이 부족합니다. (${shardCost.toLocaleString()}개 필요)`);e.status=400;throw e}
      const reserve=await env.DB.prepare('UPDATE user_magic_cards SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND magic_card_id=? AND quantity>=2 AND enhancement_level=?').bind(user.id,magicCardId,beforeLevel).run();
      if(Number(reserve.meta?.changes||0)!==1){const e=new Error('다른 강화 요청이 먼저 처리됐습니다. 보유 수량을 다시 확인해주세요.');e.status=409;throw e}materialReserved=true;
      const spend=await env.DB.prepare('UPDATE users SET card_shards=card_shards-? WHERE id=? AND card_shards>=?').bind(shardCost,user.id,shardCost).run();
      if(Number(spend.meta?.changes||0)!==1){const e=new Error('카드 조각 잔액이 변경됐습니다. 다시 시도해주세요.');e.status=409;throw e}shardsDeducted=true;
      const success=Math.random()*100<successRate,afterLevel=success?beforeLevel+1:beforeLevel,shardsAfter=Number(balance.card_shards)-shardCost,quantityAfter=Number(owned.quantity)-1;
      const result={ok:true,success,magicCardId,name:String(owned.name||''),beforeLevel,afterLevel,successRate,shardCost,quantityAfter,materialConsumed:1,cardShards:shardsAfter,effectiveTriggerBonus:Number(cfg.enhancement.triggerBonuses[afterLevel]||0)};
      const statements=[
        env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'마법카드 강화',?)").bind(user.id,-shardCost,shardsAfter,String(magicCardId)),
        env.DB.prepare("UPDATE magic_card_enhance_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(JSON.stringify(result),requestId,user.id)
      ];if(success)statements.unshift(env.DB.prepare('UPDATE user_magic_cards SET enhancement_level=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND magic_card_id=? AND enhancement_level=?').bind(afterLevel,user.id,magicCardId,beforeLevel));await env.DB.batch(statements);enhancementCommitted=true;
      return json({...result,status:await userStatus(env,await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first(),cfg)});
    }catch(error){if(!enhancementCommitted&&shardsDeducted)await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardCost,user.id).run();if(!enhancementCommitted&&materialReserved)await env.DB.prepare('UPDATE user_magic_cards SET quantity=quantity+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND magic_card_id=? AND enhancement_level=?').bind(user.id,magicCardId,beforeLevel).run();await env.DB.prepare("UPDATE magic_card_enhance_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(String(error.message||error).slice(0,300),requestId,user.id).run();return json({error:String(error.message||error)},Number(error.status||500))}
  }
  if(path==='magic/draw'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const cfg=await magicSettings(env);if(!visibleTo(user,cfg))return json({error:'마법카드 시스템이 아직 공개되지 않았습니다.'},403);if(!cfg.drawEnabled)return json({error:'마법카드 뽑기가 아직 개방되지 않았습니다.'},503);
    const body=await readBody(request),requestId=String(body.requestId||'').trim().slice(0,120),count=Number(body.count)===10?10:1,totalCost=cfg.drawCost*count,totalCoinCost=cfg.drawCoinCost*count;if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);
    let existing=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_draw_receipts WHERE request_id=?').bind(requestId).first();
    if(existing&&Number(existing.user_id)!==Number(user.id))return json({error:'이미 사용된 요청 ID입니다.'},409);
    if(existing?.status==='COMPLETED'&&existing.response_json){try{return json(JSON.parse(existing.response_json))}catch{}}
    if(existing?.status==='PENDING')return json({error:'이미 처리 중인 뽑기입니다.'},409);
    if(!existing){
      await env.DB.prepare(`INSERT OR IGNORE INTO magic_card_draw_receipts(request_id,user_id,status,cost,coin_cost,created_at,updated_at) VALUES(?,?,'PENDING',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(requestId,user.id,totalCost,totalCoinCost).run();
      existing=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_draw_receipts WHERE request_id=?').bind(requestId).first();
      if(!existing||Number(existing.user_id)!==Number(user.id))return json({error:'뽑기 요청을 등록하지 못했습니다.'},409);
    }else{
      await env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='PENDING',cost=?,coin_cost=?,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(totalCost,totalCoinCost,requestId,user.id).run();
    }
    let deducted=false,rewardCommitted=false;
    try{
      const pool=(await env.DB.prepare(`SELECT * FROM magic_cards WHERE is_active=1 AND draw_weight>0 ORDER BY sort_order,id`).all()).results;if(!pool.length)throw new Error('활성화된 마법카드가 없습니다.');
      const spend=await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals-?,coin=coin-? WHERE id=? AND magic_crystals>=? AND coin>=?').bind(totalCost,totalCoinCost,user.id,totalCost,totalCoinCost).run();
      if(Number(spend.meta?.changes||0)!==1){const fresh=await env.DB.prepare('SELECT coin,magic_crystals FROM users WHERE id=?').bind(user.id).first(),missing=[];if(Number(fresh?.coin||0)<totalCoinCost)missing.push(`코인 ${totalCoinCost.toLocaleString()}`);if(Number(fresh?.magic_crystals||0)<totalCost)missing.push(`마법 결정 ${totalCost.toLocaleString()}`);const e=new Error(`${missing.join('과 ')}이 부족합니다.`);e.status=400;throw e}deducted=true;
      const ownedRows=(await env.DB.prepare('SELECT magic_card_id,quantity,enhancement_level FROM user_magic_cards WHERE user_id=? AND quantity>0').bind(user.id).all()).results||[],owned=new Map(ownedRows.map(row=>[Number(row.magic_card_id),Number(row.quantity||0)])),results=[],pickedCards=[];let totalRefund=0;
      for(let index=0;index<count;index++){
        const picked=randomPick(pool),ownedQuantity=Number(owned.get(Number(picked.id))||0),duplicate=ownedQuantity>0,refund=duplicate?integer(cfg.duplicateRefund?.[String(picked.rarity||'R')],0):0;
        owned.set(Number(picked.id),ownedQuantity+1);pickedCards.push(picked);
        totalRefund+=refund;results.push({card:cardPayload({...picked,quantity:ownedQuantity+1},cfg),duplicate,refund,index});
      }
      const spentUser=await env.DB.prepare('SELECT coin,magic_crystals FROM users WHERE id=?').bind(user.id).first();if(!spentUser)throw new Error('유저 정보를 찾을 수 없습니다.');
      const finalBalance=Number(spentUser.magic_crystals||0)+totalRefund,duplicateCount=results.filter(row=>row.duplicate).length;
      const result={ok:true,count,results,totalCost,totalCoinCost,totalRefund,newCount:count-duplicateCount,duplicateCount,magicCrystals:finalBalance,coin:Number(spentUser.coin||0),...(count===1?{card:results[0].card,duplicate:results[0].duplicate,refund:results[0].refund}:{})};
      const statements=[];
      for(const picked of pickedCards)statements.push(env.DB.prepare(`INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level,first_obtained_at,updated_at) VALUES(?,?,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,magic_card_id) DO UPDATE SET quantity=user_magic_cards.quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id,picked.id));
      if(totalRefund>0)statements.push(env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(totalRefund,user.id));
      statements.push(env.DB.prepare(`INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)`).bind(user.id,-totalCost+totalRefund,finalBalance,duplicateCount?`마법카드 ${count}회 뽑기 · 중복 ${duplicateCount}장 환급`:`마법카드 ${count}회 뽑기`,'MAGIC_DRAW',requestId));
      if(totalCoinCost>0)statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'마법카드 뽑기')`).bind(user.id,-totalCoinCost,Number(spentUser.coin||0)));
      statements.push(env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(JSON.stringify(result),requestId,user.id));
      await env.DB.batch(statements);rewardCommitted=true;
      return json(result);
    }catch(error){
      if(deducted&&!rewardCommitted)await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+?,coin=coin+? WHERE id=?').bind(totalCost,totalCoinCost,user.id).run();
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
        const before=await cardUniqueSettings(env,{fresh:true}),next=cleanCardUniqueSettings(body.settings||body);
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('card_unique_effect_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();
        cardUniqueSettingsCache={at:Date.now(),value:next};
        let warning='';try{await writeAdminLog(env,admin,'CARD_UNIQUE_SETTINGS_SAVE','APP_META','card_unique_effect_settings_v1',before,next)}catch(error){warning='설정은 저장됐지만 관리자 로그 기록에 실패했습니다.';console.error('CARD_UNIQUE_SETTINGS_SAVE log failed',error)}
        return json({ok:true,settings:next,warning:warning||undefined});
      }
      if(action==='SAVE_MAGIC_CARD'){
        const id=body.id?integer(body.id,0,1,2147483647):null,code=safeCode(body.code||body.name),name=String(body.name||'').trim().slice(0,60),rarity=String(body.rarity||'R').toUpperCase(),effectType=String(body.effectType||'').toUpperCase();
        if(!name)return json({error:'마법카드 이름을 입력하세요.'},400);if(!code)return json({error:'마법카드 코드를 입력하세요.'},400);if(!MAGIC_RARITIES.includes(rarity))return json({error:'마법카드 등급은 R·SR·SSR만 사용할 수 있습니다.'},400);
        if(!MAGIC_BATTLE_EFFECTS.includes(effectType))return json({error:'확정된 마법카드 효과 7종 중 하나를 선택하세요.'},400);
        const values=[code,name,rarity,String(body.imageUrl||'').trim().slice(0,500),String(body.description||'').trim().slice(0,300),effectType,String(body.triggerType||'BATTLE_START').toUpperCase().slice(0,40),Number(body.effectValue||0),Math.min(100,Math.max(0,Number(body.triggerChance??100))),integer(body.maxActivations,1,1,99),Math.max(0.0001,Number(body.drawWeight||1)),body.scopes?.pve===false?0:1,body.scopes?.pvp===false?0:1,0,body.isActive===false?0:1,integer(body.sortOrder,0,0,100000)];
        if(id)await env.DB.prepare(`UPDATE magic_cards SET code=?,name=?,rarity=?,image_url=?,description=?,effect_type=?,trigger_type=?,effect_value=?,trigger_chance=?,max_activations=?,draw_weight=?,scope_pve=?,scope_pvp=?,scope_captain=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values,id).run();
        else await env.DB.prepare(`INSERT INTO magic_cards(code,name,rarity,image_url,description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,draw_weight,scope_pve,scope_pvp,scope_captain,is_active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
        await writeAdminLog(env,admin,'MAGIC_CARD_SAVE','MAGIC_CARD',String(id||code),null,{code,name,rarity});
        return json({ok:true});
      }
      if(action==='TOGGLE_MAGIC_CARD'){
        const id=integer(body.id,0,1,2147483647),active=body.isActive===true,statements=[env.DB.prepare('UPDATE magic_cards SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(active?1:0,id)];if(!active)statements.push(env.DB.prepare('DELETE FROM magic_card_loadouts WHERE magic_card_id=?').bind(id));await env.DB.batch(statements);await writeAdminLog(env,admin,'MAGIC_CARD_TOGGLE','MAGIC_CARD',String(id),null,{isActive:active});return json({ok:true});
      }
      if(action==='BATCH_SAVE_UNIQUE_ROWS'){
        const incoming=Array.isArray(body.items)?body.items:[],byId=new Map();
        for(const raw of incoming.slice(0,100)){const cardId=String(raw?.cardId||'').trim();if(cardId)byId.set(cardId,raw)}
        const items=[...byId.entries()].map(([cardId,raw])=>({cardId,attackPercent:uniqueStat(raw.attackPercent),defensePercent:uniqueStat(raw.defensePercent),hpPercent:uniqueStat(raw.hpPercent),speedPercent:uniqueStat(raw.speedPercent,300),scopePve:raw.scopes?.pve===false?0:1,scopePvp:raw.scopes?.pvp===false?0:1,scopeCaptain:raw.scopes?.captain===false?0:1,isActive:raw.isActive===true?1:0}));
        if(!items.length)return json({error:'저장할 카드 능력치가 없습니다.'},400);
        const ids=items.map(item=>item.cardId),marks=ids.map(()=>'?').join(','),rows=(await env.DB.prepare(`SELECT id,rarity FROM cards_effective_v1210 WHERE id IN (${marks})`).bind(...ids).all()).results||[];
        const valid=new Set(rows.filter(card=>UNIQUE_CARD_GRADES.includes(String(card.rarity||'').toUpperCase())).map(card=>String(card.id)));
        if(valid.size!==ids.length)return json({error:'저장 대상에 존재하지 않거나 고유 능력치 대상이 아닌 카드가 포함되어 있습니다.'},400);
        const sql=`INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,hp_percent,speed_percent,scope_pve,scope_pvp,scope_captain,is_active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(card_id) DO UPDATE SET attack_percent=excluded.attack_percent,defense_percent=excluded.defense_percent,hp_percent=excluded.hp_percent,speed_percent=excluded.speed_percent,scope_pve=excluded.scope_pve,scope_pvp=excluded.scope_pvp,scope_captain=excluded.scope_captain,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP`;
        await env.DB.batch(items.map(item=>env.DB.prepare(sql).bind(item.cardId,item.attackPercent,item.defensePercent,item.hpPercent,item.speedPercent,item.scopePve,item.scopePvp,item.scopeCaptain,item.isActive)));
        let warning='';try{await writeAdminLog(env,admin,'CARD_UNIQUE_INLINE_BATCH_SAVE','CARD_BATCH',ids.join(',').slice(0,500),null,{count:items.length})}catch(error){warning='능력치는 저장됐지만 관리자 로그 기록에 실패했습니다.';console.error('CARD_UNIQUE_INLINE_BATCH_SAVE log failed',error)}
        return json({ok:true,updatedCount:items.length,warning:warning||undefined});
      }
      if(action==='BATCH_SAVE_UNIQUE_EFFECTS'){
        const ids=[...new Set((Array.isArray(body.cardIds)?body.cardIds:[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,100);
        if(!ids.length)return json({error:'일괄 적용할 카드를 선택하세요.'},400);
        const raw=body.changes&&typeof body.changes==='object'?body.changes:{},columns=[],values=[];
        const add=(column,value)=>{columns.push(column);values.push(value)};
        if(Object.prototype.hasOwnProperty.call(raw,'attackPercent'))add('attack_percent',uniqueStat(raw.attackPercent));
        if(Object.prototype.hasOwnProperty.call(raw,'defensePercent'))add('defense_percent',uniqueStat(raw.defensePercent));
        if(Object.prototype.hasOwnProperty.call(raw,'hpPercent'))add('hp_percent',uniqueStat(raw.hpPercent));
        if(Object.prototype.hasOwnProperty.call(raw,'speedPercent'))add('speed_percent',uniqueStat(raw.speedPercent,300));
        if(raw.scopes&&typeof raw.scopes==='object'){
          add('scope_pve',raw.scopes.pve===false?0:1);add('scope_pvp',raw.scopes.pvp===false?0:1);add('scope_captain',raw.scopes.captain===false?0:1);
        }
        if(Object.prototype.hasOwnProperty.call(raw,'isActive'))add('is_active',raw.isActive===true?1:0);
        if(!columns.length)return json({error:'변경할 능력치 또는 적용 상태를 선택하세요.'},400);
        const marks=ids.map(()=>'?').join(','),rows=(await env.DB.prepare(`SELECT id,rarity FROM cards_effective_v1210 WHERE id IN (${marks})`).bind(...ids).all()).results||[];
        const valid=rows.filter(card=>UNIQUE_CARD_GRADES.includes(String(card.rarity||'').toUpperCase())).map(card=>String(card.id));
        if(valid.length!==ids.length)return json({error:'선택 카드 중 존재하지 않거나 고유 능력치 대상이 아닌 카드가 포함되어 있습니다.'},400);
        const insertColumns=['card_id',...columns,'updated_at'],placeholders=['?',...columns.map(()=>'?'),'CURRENT_TIMESTAMP'];
        const updates=columns.map(column=>`${column}=excluded.${column}`).concat('updated_at=CURRENT_TIMESTAMP').join(',');
        const sql=`INSERT INTO card_unique_effects(${insertColumns.join(',')}) VALUES(${placeholders.join(',')}) ON CONFLICT(card_id) DO UPDATE SET ${updates}`;
        await env.DB.batch(valid.map(cardId=>env.DB.prepare(sql).bind(cardId,...values)));
        await writeAdminLog(env,admin,'CARD_UNIQUE_EFFECT_BATCH_SAVE','CARD_BATCH',valid.join(',').slice(0,500),null,{count:valid.length,fields:columns});
        return json({ok:true,updatedCount:valid.length,fields:columns});
      }
      if(action==='SAVE_UNIQUE_EFFECT'){
        const cardId=String(body.cardId||'').trim(),card=await env.DB.prepare(`SELECT id,rarity FROM cards_effective_v1210 WHERE id=?`).bind(cardId).first();if(!card)return json({error:'카드를 찾을 수 없습니다.'},404);if(!UNIQUE_CARD_GRADES.includes(String(card.rarity||'').toUpperCase()))return json({error:'고유 효과는 SSR 이상 카드에만 설정할 수 있습니다.'},400);
        const v=[cardId,uniqueStat(body.attackPercent),uniqueStat(body.defensePercent),uniqueStat(body.hpPercent),uniqueStat(body.speedPercent,300),String(body.effectName||'').trim().slice(0,80),String(body.effectDescription||'').trim().slice(0,300),String(body.effectType||'NONE').toUpperCase().slice(0,40),String(body.triggerType||'PASSIVE').toUpperCase().slice(0,40),Number(body.effectValue||0),Math.min(100,Math.max(0,Number(body.triggerChance??100))),integer(body.maxActivations,1,1,99),body.scopes?.pve===false?0:1,body.scopes?.pvp===false?0:1,body.scopes?.captain===false?0:1,body.isActive===true?1:0];
        await env.DB.prepare(`INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,hp_percent,speed_percent,effect_name,effect_description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,scope_pve,scope_pvp,scope_captain,is_active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(card_id) DO UPDATE SET attack_percent=excluded.attack_percent,defense_percent=excluded.defense_percent,hp_percent=excluded.hp_percent,speed_percent=excluded.speed_percent,effect_name=excluded.effect_name,effect_description=excluded.effect_description,effect_type=excluded.effect_type,trigger_type=excluded.trigger_type,effect_value=excluded.effect_value,trigger_chance=excluded.trigger_chance,max_activations=excluded.max_activations,scope_pve=excluded.scope_pve,scope_pvp=excluded.scope_pvp,scope_captain=excluded.scope_captain,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP`).bind(...v).run();
        let warning='';try{await writeAdminLog(env,admin,'CARD_UNIQUE_EFFECT_SAVE','CARD',cardId,null,{effectName:body.effectName,isActive:body.isActive===true})}catch(error){warning='세부 효과는 저장됐지만 관리자 로그 기록에 실패했습니다.';console.error('CARD_UNIQUE_EFFECT_SAVE log failed',error)}return json({ok:true,warning:warning||undefined});
      }
      return json({error:'올바르지 않은 작업입니다.'},400);
    }
  }
  return null;
}
