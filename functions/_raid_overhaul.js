const ITEM_TYPES=['NORMAL_CUBE','ADVANCED_CUBE','PREMIUM_CUBE','EQUIPMENT_SUPPLY_BOX','MAGIC_CARD_PACK','MASTER_STAR'];
const ALL_REWARD_TYPES=['COIN','CARD_SHARD',...ITEM_TYPES];
const ITEM_LABELS={NORMAL_CUBE:'일반 큐브',ADVANCED_CUBE:'고급 큐브',PREMIUM_CUBE:'프리미엄 큐브',EQUIPMENT_SUPPLY_BOX:'장비 보급상자',MAGIC_CARD_PACK:'마법카드 팩',MASTER_STAR:'마스터의 별'};
const DEFAULT_REWARDS={
  participation:[{type:'COIN',amount:100}],
  clear:[{type:'COIN',amount:300},{type:'CARD_SHARD',amount:20}],
  damageMilestones:[
    {damage:100000,rewards:[{type:'NORMAL_CUBE',amount:1}]},
    {damage:500000,rewards:[{type:'ADVANCED_CUBE',amount:1}]},
    {damage:1000000,rewards:[{type:'EQUIPMENT_SUPPLY_BOX',amount:1}]}
  ],
  rankRewards:[
    {from:1,to:1,rewards:[{type:'PREMIUM_CUBE',amount:1},{type:'EQUIPMENT_SUPPLY_BOX',amount:2}]},
    {from:2,to:3,rewards:[{type:'ADVANCED_CUBE',amount:2},{type:'EQUIPMENT_SUPPLY_BOX',amount:1}]},
    {from:4,to:10,rewards:[{type:'ADVANCED_CUBE',amount:1}]}
  ],
  rareDrops:[
    {type:'PREMIUM_CUBE',amount:1,chance:1},
    {type:'MAGIC_CARD_PACK',amount:1,chance:2},
    {type:'EQUIPMENT_SUPPLY_BOX',amount:1,chance:5}
  ]
};

const num=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));
const integer=(value,fallback,min,max)=>Math.floor(num(value,fallback,min,max));
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
const clone=value=>JSON.parse(JSON.stringify(value));
function cleanRewardItems(rows,allowChance=false){
  const output=[];
  for(const raw of Array.isArray(rows)?rows:[]){
    const type=String(raw?.type||'').toUpperCase();
    if(!ALL_REWARD_TYPES.includes(type))continue;
    const amount=integer(raw?.amount,0,0,type==='COIN'?100000000:1000000);
    if(amount<=0)continue;
    const item={type,amount};
    if(allowChance)item.chance=num(raw?.chance,0,0,100);
    output.push(item);
    if(output.length>=20)break;
  }
  return output;
}
function cleanDamageMilestones(rows){
  const result=[];
  for(const raw of Array.isArray(rows)?rows:[]){
    const damage=integer(raw?.damage,0,1,2000000000),rewards=cleanRewardItems(raw?.rewards);
    if(!damage||!rewards.length)continue;
    result.push({damage,rewards});
    if(result.length>=30)break;
  }
  result.sort((a,b)=>a.damage-b.damage);
  return result;
}
function cleanRankRewards(rows){
  const result=[];
  for(const raw of Array.isArray(rows)?rows:[]){
    const from=integer(raw?.from,1,1,10000),to=integer(raw?.to,from,from,10000),rewards=cleanRewardItems(raw?.rewards);
    if(!rewards.length)continue;
    result.push({from,to,rewards});
    if(result.length>=50)break;
  }
  result.sort((a,b)=>a.from-b.from||a.to-b.to);
  return result;
}
function cleanTimeSlots(rawSlots,legacy={}){
  const source=Array.isArray(rawSlots)&&rawSlots.length?rawSlots:[
    {id:'A',label:'1부',enabled:true,openTime:legacy.openTime||'20:00',closeTime:legacy.closeTime||'21:00',entriesPerSlot:1,bossId:0},
    {id:'B',label:'2부',enabled:true,openTime:'23:00',closeTime:'23:30',entriesPerSlot:1,bossId:0}
  ];
  const ids=new Set(),result=[];
  for(let index=0;index<Math.min(4,source.length);index++){
    const row=source[index]||{},fallbackId=String.fromCharCode(65+index),id=String(row.id||fallbackId).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,12)||fallbackId;
    if(ids.has(id))continue;ids.add(id);
    result.push({
      id,label:String(row.label||`${index+1}부`).trim().slice(0,20)||`${index+1}부`,enabled:row.enabled!==false,
      openTime:validTime(row.openTime)?String(row.openTime):index===0?'20:00':'23:00',
      closeTime:validTime(row.closeTime)?String(row.closeTime):index===0?'21:00':'23:30',
      entriesPerSlot:integer(row.entriesPerSlot,1,1,20),bossId:integer(row.bossId,0,0,2147483647)
    });
  }
  while(result.length<2){const i=result.length;result.push({id:i===0?'A':'B',label:i===0?'1부':'2부',enabled:true,openTime:i===0?'20:00':'23:00',closeTime:i===0?'21:00':'23:30',entriesPerSlot:1,bossId:0});}
  return result;
}
export function defaultRaidSettingsV1293(){
  return {enabled:false,ownerOnlyTest:false,userOpenEnabled:true,title:'월드 레이드',maxParticipants:30,minParticipants:5,lobbySeconds:60,battleSeconds:120,dailyEntries:2,autoStartOnFull:true,showNicknames:true,showRepresentativeCard:true,showDamageLog:true,showPersonalDamage:true,showLiveRanking:true,rankingSize:10,attackIntervalMs:800,damageMultiplier:1,criticalEnabled:true,criticalChance:10,criticalMultiplier:1.5,participationCoin:100,clearCoin:300,rewardShards:20,deckHpMultiplier:12,bossAttackPower:850,bossAttackIntervalMs:5000,bossAttackVariance:15,enrageEnabled:true,enrageHpPercent:30,enrageMultiplier:1.6,showBattleStage:true,showParticipantHp:true,scheduleMode:'SCHEDULED',openDays:[0,1,2,3,4,5,6],openTime:'20:00',closeTime:'21:00',entryCloseMinutes:0,showOpenCountdown:true,ownerScheduleBypass:true,
    timeSlots:cleanTimeSlots(null,{openTime:'20:00',closeTime:'21:00'}),
    phase2Enabled:true,phase2StartHpPercent:70,phase2EndHpPercent:30,phase2ShieldPercent:12,phase2BreakDamageMultiplier:1.25,
    phase3EnrageEnabled:true,phase3EnrageMultiplier:1.75,
    rewards:clone(DEFAULT_REWARDS)
  };
}
export function cleanRaidSettingsV1293(raw={}){
  const base=defaultRaidSettingsV1293(),days=[...new Set((Array.isArray(raw.openDays)?raw.openDays:base.openDays).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))];
  const legacyRewards={
    participation:[{type:'COIN',amount:integer(raw.participationCoin,base.participationCoin,0,100000000)}],
    clear:[{type:'COIN',amount:integer(raw.clearCoin,base.clearCoin,0,100000000)},{type:'CARD_SHARD',amount:integer(raw.rewardShards,base.rewardShards,0,1000000)}].filter(x=>x.amount>0),
    damageMilestones:base.rewards.damageMilestones,rankRewards:base.rewards.rankRewards,rareDrops:base.rewards.rareDrops
  };
  const rewardRaw=raw.rewards&&typeof raw.rewards==='object'?raw.rewards:legacyRewards;
  const rewards={
    participation:cleanRewardItems(rewardRaw.participation),
    clear:cleanRewardItems(rewardRaw.clear),
    damageMilestones:cleanDamageMilestones(rewardRaw.damageMilestones),
    rankRewards:cleanRankRewards(rewardRaw.rankRewards),
    rareDrops:cleanRewardItems(rewardRaw.rareDrops,true)
  };
  const timeSlots=cleanTimeSlots(raw.timeSlots,{openTime:raw.openTime||base.openTime,closeTime:raw.closeTime||base.closeTime});
  const first=timeSlots.find(x=>x.enabled)||timeSlots[0];
  const out={...base,
    enabled:raw.enabled===true,ownerOnlyTest:raw.ownerOnlyTest===true,userOpenEnabled:raw.userOpenEnabled!==false,title:String(raw.title||base.title).trim().slice(0,40),
    maxParticipants:integer(raw.maxParticipants,base.maxParticipants,1,200),minParticipants:integer(raw.minParticipants,base.minParticipants,1,200),lobbySeconds:integer(raw.lobbySeconds,base.lobbySeconds,5,3600),battleSeconds:integer(raw.battleSeconds,base.battleSeconds,10,3600),dailyEntries:integer(raw.timeSlots?raw.dailyEntries:Math.max(2,Number(raw.dailyEntries||0)),base.dailyEntries,1,99),autoStartOnFull:raw.autoStartOnFull!==false,
    showNicknames:raw.showNicknames!==false,showRepresentativeCard:raw.showRepresentativeCard!==false,showDamageLog:raw.showDamageLog!==false,showPersonalDamage:raw.showPersonalDamage!==false,showLiveRanking:raw.showLiveRanking!==false,rankingSize:integer(raw.rankingSize,base.rankingSize,1,100),attackIntervalMs:integer(raw.attackIntervalMs,base.attackIntervalMs,200,5000),damageMultiplier:num(raw.damageMultiplier,base.damageMultiplier,.01,100),criticalEnabled:raw.criticalEnabled!==false,criticalChance:num(raw.criticalChance,base.criticalChance,0,100),criticalMultiplier:num(raw.criticalMultiplier,base.criticalMultiplier,1,10),
    participationCoin:integer(raw.participationCoin,base.participationCoin,0,100000000),clearCoin:integer(raw.clearCoin,base.clearCoin,0,100000000),rewardShards:integer(raw.rewardShards,base.rewardShards,0,1000000),deckHpMultiplier:num(raw.deckHpMultiplier,base.deckHpMultiplier,1,1000),bossAttackPower:integer(raw.bossAttackPower,base.bossAttackPower,1,100000000),bossAttackIntervalMs:integer(raw.bossAttackIntervalMs,base.bossAttackIntervalMs,500,60000),bossAttackVariance:num(raw.bossAttackVariance,base.bossAttackVariance,0,90),enrageEnabled:raw.enrageEnabled!==false,enrageHpPercent:num(raw.enrageHpPercent,base.enrageHpPercent,1,99),enrageMultiplier:num(raw.enrageMultiplier,base.enrageMultiplier,1,10),showBattleStage:raw.showBattleStage!==false,showParticipantHp:raw.showParticipantHp!==false,
    scheduleMode:String(raw.scheduleMode||base.scheduleMode).toUpperCase()==='ALWAYS'?'ALWAYS':'SCHEDULED',openDays:days.length?days:base.openDays,openTime:first.openTime,closeTime:first.closeTime,entryCloseMinutes:integer(raw.entryCloseMinutes,base.entryCloseMinutes,0,1440),showOpenCountdown:raw.showOpenCountdown!==false,ownerScheduleBypass:raw.ownerScheduleBypass!==false,
    timeSlots,
    phase2Enabled:raw.phase2Enabled!==false,phase2StartHpPercent:num(raw.phase2StartHpPercent,base.phase2StartHpPercent,31,95),phase2EndHpPercent:num(raw.phase2EndHpPercent,base.phase2EndHpPercent,5,69),phase2ShieldPercent:num(raw.phase2ShieldPercent,base.phase2ShieldPercent,0,100),phase2BreakDamageMultiplier:num(raw.phase2BreakDamageMultiplier,base.phase2BreakDamageMultiplier,1,5),phase3EnrageEnabled:raw.phase3EnrageEnabled!==false,phase3EnrageMultiplier:num(raw.phase3EnrageMultiplier,base.phase3EnrageMultiplier,1,10),rewards
  };
  if(out.phase2EndHpPercent>=out.phase2StartHpPercent)out.phase2EndHpPercent=Math.max(5,out.phase2StartHpPercent-10);
  return out;
}
function kstParts(nowMs){const kst=new Date(nowMs+9*3600000);return {kst,day:kst.getUTCDay(),date:[kst.getUTCFullYear(),String(kst.getUTCMonth()+1).padStart(2,'0'),String(kst.getUTCDate()).padStart(2,'0')].join('-')};}
function slotWindow(date,slot){const open=Date.parse(`${date}T${slot.openTime}:00+09:00`),base=Date.parse(`${date}T${slot.closeTime}:00+09:00`),close=base<=open?base+86400000:base;return {open,close};}
export function raidScheduleStateV1293(cfg,user,nowMs=Date.now()){
  const bypass=Boolean(user?.role==='OWNER'&&cfg.ownerScheduleBypass),slots=cleanTimeSlots(cfg.timeSlots,{openTime:cfg.openTime,closeTime:cfg.closeTime});
  if(cfg.scheduleMode==='ALWAYS'||bypass){const {date}=kstParts(nowMs);return {isOpen:true,canEnter:true,bypassed:bypass,currentSlot:{id:'ALWAYS',label:'상시 개방',entriesPerSlot:Math.max(1,Number(cfg.dailyEntries||99)),bossId:0},slots,nextOpenAt:null,closesAt:null,entryDateKey:date,reason:bypass?'OWNER_BYPASS':'ALWAYS'};}
  const {kst}=kstParts(nowMs),enabled=slots.filter(x=>x.enabled);let currentSlot=null,currentWindow=null,currentEntryDateKey=null;
  const candidates=[];
  for(const offset of [-1,0]){
    const d=new Date(kst.getTime()+offset*86400000),startDay=d.getUTCDay();
    if(!(cfg.openDays||[]).includes(startDay))continue;
    const ymd=[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')].join('-');
    for(const slot of enabled){const window=slotWindow(ymd,slot);if(nowMs>=window.open&&nowMs<window.close)candidates.push({slot,window,entryDateKey:ymd});}
  }
  if(candidates.length){candidates.sort((a,b)=>b.window.open-a.window.open);currentSlot=candidates[0].slot;currentWindow=candidates[0].window;currentEntryDateKey=candidates[0].entryDateKey;}
  let nextOpenAt=null,nextSlot=null;
  for(let add=0;add<8&&!nextOpenAt;add++){
    const d=new Date(kst.getTime()+add*86400000),wd=d.getUTCDay();if(!(cfg.openDays||[]).includes(wd))continue;
    const ymd=[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')].join('-');
    for(const slot of enabled){const candidate=slotWindow(ymd,slot).open;if(candidate>nowMs&&(!nextOpenAt||candidate<Date.parse(nextOpenAt))){nextOpenAt=new Date(candidate).toISOString();nextSlot=slot;}}
  }
  if(!currentSlot)return {isOpen:false,canEnter:false,bypassed:false,currentSlot:null,slots,nextOpenAt,nextSlot,closesAt:null,reason:'CLOSED'};
  const entryCloseAt=currentWindow.close-Math.max(0,Number(cfg.entryCloseMinutes||0))*60000,canEnter=nowMs<entryCloseAt;
  return {isOpen:true,canEnter,bypassed:false,currentSlot,slots,nextOpenAt,nextSlot,closesAt:new Date(currentWindow.close).toISOString(),entryClosesAt:new Date(entryCloseAt).toISOString(),entryDateKey:currentEntryDateKey,reason:canEnter?'OPEN':'ENTRY_CLOSED'};
}

let readyPromise=null;
export async function ensureRaidOverhaulV1293(env){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_instance_v1293 (instance_id INTEGER PRIMARY KEY,slot_id TEXT NOT NULL DEFAULT 'LEGACY',settings_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_participant_v1293 (instance_id INTEGER NOT NULL,user_id INTEGER NOT NULL,final_damage INTEGER NOT NULL DEFAULT 0,final_rank INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(instance_id,user_id))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_user_reward_v1293 (instance_id INTEGER NOT NULL,user_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'READY',reward_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(instance_id,user_id))`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_raid_participant_v1293_rank ON raid_participant_v1293(instance_id,final_rank,final_damage)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_raid_user_reward_v1293_status ON raid_user_reward_v1293(status,updated_at)`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1293_raid_overhaul','1',CURRENT_TIMESTAMP)")
    ]);
    const cleanup=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_v1293_cleanup_last'").first(),last=Date.parse(cleanup?.value||0);
    if(!Number.isFinite(last)||Date.now()-last>=86400000){
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM raid_user_reward_v1293 WHERE rowid IN (SELECT rw.rowid FROM raid_user_reward_v1293 rw JOIN raid_instances ri ON ri.id=rw.instance_id WHERE ri.status='ENDED' AND rw.status='COMPLETED' AND datetime(ri.ends_at)<datetime('now','-90 days') LIMIT 1000)`),
        env.DB.prepare(`DELETE FROM raid_participant_v1293 WHERE rowid IN (SELECT rp.rowid FROM raid_participant_v1293 rp JOIN raid_instances ri ON ri.id=rp.instance_id JOIN raid_participants legacy ON legacy.instance_id=rp.instance_id AND legacy.user_id=rp.user_id AND legacy.reward_claimed=1 WHERE ri.status='ENDED' AND datetime(ri.ends_at)<datetime('now','-90 days') AND NOT EXISTS (SELECT 1 FROM raid_user_reward_v1293 rw WHERE rw.instance_id=rp.instance_id AND rw.user_id=rp.user_id) LIMIT 1000)`),
        env.DB.prepare(`DELETE FROM raid_instance_v1293 WHERE instance_id IN (SELECT x.instance_id FROM raid_instance_v1293 x JOIN raid_instances ri ON ri.id=x.instance_id WHERE ri.status='ENDED' AND datetime(ri.ends_at)<datetime('now','-90 days') AND NOT EXISTS (SELECT 1 FROM raid_participant_v1293 rp WHERE rp.instance_id=x.instance_id) AND NOT EXISTS (SELECT 1 FROM raid_user_reward_v1293 rw WHERE rw.instance_id=x.instance_id) LIMIT 300)`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_v1293_cleanup_last',?,CURRENT_TIMESTAMP)").bind(new Date().toISOString())
      ]);
    }
    return true;
  })().catch(error=>{readyPromise=null;throw error});
  return readyPromise;
}
export async function snapshotRaidInstanceV1293(env,instanceId,slotId,cfg){
  await ensureRaidOverhaulV1293(env);const clean=cleanRaidSettingsV1293(cfg);
  await env.DB.prepare(`INSERT OR IGNORE INTO raid_instance_v1293(instance_id,slot_id,settings_json,created_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(Number(instanceId),String(slotId||'LEGACY').slice(0,20),JSON.stringify(clean)).run();
  return clean;
}
export async function raidInstanceSettingsV1293(env,instanceId,fallbackCfg){
  await ensureRaidOverhaulV1293(env);const row=await env.DB.prepare('SELECT settings_json FROM raid_instance_v1293 WHERE instance_id=?').bind(Number(instanceId)).first();
  if(row?.settings_json){try{return cleanRaidSettingsV1293(JSON.parse(row.settings_json))}catch{}}
  return snapshotRaidInstanceV1293(env,instanceId,'LEGACY',fallbackCfg);
}
export async function raidInstanceSlotV1293(env,instanceId){await ensureRaidOverhaulV1293(env);const row=await env.DB.prepare('SELECT slot_id AS slotId FROM raid_instance_v1293 WHERE instance_id=?').bind(Number(instanceId)).first();return String(row?.slotId||'LEGACY');}
export async function raidSlotEntryCountV1293(env,userId,dateKey,slotId){
  await ensureRaidOverhaulV1293(env);if(!slotId||slotId==='ALWAYS')return 0;
  const row=await env.DB.prepare(`SELECT COUNT(*) count FROM raid_daily_entry_uses u JOIN raid_instance_v1293 x ON x.instance_id=u.instance_id LEFT JOIN raid_daily_entry_restores r ON r.user_id=u.user_id AND r.entry_date=u.entry_date AND r.instance_id=u.instance_id WHERE u.user_id=? AND u.entry_date=? AND x.slot_id=? AND r.instance_id IS NULL`).bind(Number(userId),String(dateKey),String(slotId)).first();
  return Math.max(0,Number(row?.count||0));
}

export function raidCombatSnapshotV1293(participants,instance,cfg,nowMs=Date.now()){
  const startMs=Date.parse(instance.starts_at||0),storedEndMs=Date.parse(instance.ends_at||0),durationMs=Math.max(1,Number(cfg.battleSeconds||120)*1000),effectiveNowMs=instance.status==='ENDED'&&storedEndMs?storedEndMs:nowMs,elapsedMs=Math.max(0,Math.min(durationMs,effectiveNowMs-startMs)),bossMaxHp=Math.max(0,Number(instance.max_hp||0)),bossInterval=Math.max(500,Number(cfg.bossAttackIntervalMs||5000));
  const states=participants.map(row=>{const maxHp=Math.max(1,Math.floor(Number(row.totalPower??row.total_power??0)*Number(cfg.deckHpMultiplier||12))),variance=1+(((Number(row.userId??row.user_id??0)%31)-15)/100)*(Number(cfg.bossAttackVariance||0)/15);return {row,maxHp,currentHp:maxHp,variance,shownDamage:0,isDefeated:false,defeatedAtMs:null};});
  const phase2Start=Math.max(0,Math.min(1,Number(cfg.phase2StartHpPercent||70)/100)),phase2End=Math.max(0,Math.min(phase2Start-.01,Number(cfg.phase2EndHpPercent||30)/100)),shieldMax=cfg.phase2Enabled===false?0:Math.max(0,bossMaxHp*Number(cfg.phase2ShieldPercent||0)/100);
  let bossHp=bossMaxHp,shieldHp=shieldMax,shieldActivated=false,shieldBroken=shieldMax<=0,processedMs=0,attackTicks=0,clearedAtMs=null,wipedAtMs=null;
  const currentPhase=()=>{const pct=bossMaxHp>0?bossHp/bossMaxHp:0;if(pct>phase2Start)return 1;if(pct>phase2End)return 2;return 3;};
  const applyPartyDamage=segmentMs=>{
    if(segmentMs<=0||bossHp<=0)return;
    const alive=states.filter(x=>!x.isDefeated);if(!alive.length){if(wipedAtMs===null)wipedAtMs=processedMs;return;}
    const rawTotal=alive.reduce((sum,x)=>sum+(Number(x.row.totalDamage??x.row.total_damage??0)*segmentMs/durationMs),0);if(rawTotal<=0){processedMs+=segmentMs;return;}
    let rawLeft=rawTotal,rawConsumed=0,guard=0;
    while(rawLeft>1e-9&&bossHp>0&&guard++<8){
      const phase=currentPhase();
      if(phase===1){
        const threshold=bossMaxHp*phase2Start,needed=Math.max(0,bossHp-threshold),used=Math.min(rawLeft,needed||rawLeft);bossHp=Math.max(threshold,bossHp-used);rawLeft-=used;rawConsumed+=used;if(needed<=0||bossHp<=threshold+1e-6)continue;
      }else if(phase===2){
        if(!shieldActivated){shieldActivated=true;shieldHp=shieldMax;shieldBroken=shieldMax<=0;}
        if(shieldHp>0){const used=Math.min(rawLeft,shieldHp);shieldHp-=used;rawLeft-=used;rawConsumed+=used;if(shieldHp<=1e-6){shieldHp=0;shieldBroken=true;}if(rawLeft<=1e-9)break;}
        const threshold=bossMaxHp*phase2End,bonus=shieldBroken?Math.max(1,Number(cfg.phase2BreakDamageMultiplier||1)):1,neededBoss=Math.max(0,bossHp-threshold),neededRaw=neededBoss/bonus,used=Math.min(rawLeft,neededRaw||rawLeft);bossHp=Math.max(threshold,bossHp-used*bonus);rawLeft-=used;rawConsumed+=used;if(neededBoss<=0||bossHp<=threshold+1e-6)continue;
      }else{
        const used=Math.min(rawLeft,bossHp);bossHp=Math.max(0,bossHp-used);rawLeft-=used;rawConsumed+=used;if(bossHp<=0){clearedAtMs=processedMs+segmentMs*(rawConsumed/rawTotal);break;}
      }
      if(rawLeft<=1e-9)break;
    }
    const ratio=Math.max(0,Math.min(1,rawConsumed/Math.max(rawTotal,1e-9)));
    for(const x of alive){const share=Number(x.row.totalDamage??x.row.total_damage??0)*segmentMs/durationMs/Math.max(rawTotal,1e-9);x.shownDamage+=rawConsumed*share;}
    processedMs+=segmentMs*(bossHp<=0?ratio:1);
  };
  let nextBossTick=bossInterval;
  while(processedMs<elapsedMs&&bossHp>0&&states.some(x=>!x.isDefeated)){
    const segmentEnd=Math.min(elapsedMs,nextBossTick);applyPartyDamage(segmentEnd-processedMs);if(bossHp<=0||processedMs>=elapsedMs)break;
    if(segmentEnd===nextBossTick){attackTicks++;const phase=currentPhase();let rage=1;if(phase===3&&cfg.phase3EnrageEnabled!==false)rage=Math.max(rage,Number(cfg.phase3EnrageMultiplier||1.75));for(const x of states){if(x.isDefeated)continue;const hit=Math.max(0,Math.floor(Number(cfg.bossAttackPower||850)*x.variance*rage));x.currentHp=Math.max(0,x.currentHp-hit);if(x.currentHp<=0){x.isDefeated=true;x.defeatedAtMs=processedMs;}}if(states.length&&states.every(x=>x.isDefeated)&&bossHp>0)wipedAtMs=processedMs;nextBossTick+=bossInterval;}
  }
  const allDefeated=states.length>0&&states.every(x=>x.isDefeated),cleared=bossHp<=0&&!allDefeated,phase=currentPhase();
  return {durationMs,elapsedMs,bossHp:bossHp<=0?0:Math.max(1,Math.ceil(bossHp)),bossHpPct:bossMaxHp>0?bossHp/bossMaxHp:0,attackTicks,allDefeated,cleared,clearedAtMs,wipedAtMs,states,phase,phaseLabel:phase===1?'돌입':phase===2?'브레이크':phase===3?'광폭화':'돌입',shieldMaxHp:Math.ceil(shieldMax),shieldHp:Math.max(0,Math.ceil(shieldHp)),shieldBroken,breakProgress:shieldMax>0?Math.max(0,Math.min(1,(shieldMax-shieldHp)/shieldMax)):1};
}
export async function finalizeRaidV1293(env,instanceId,snapshot){
  await ensureRaidOverhaulV1293(env);const ranked=(snapshot?.states||[]).map(x=>({userId:Number(x.row.userId??x.row.user_id),damage:Math.max(0,Math.floor(Number(x.shownDamage||0)))})).filter(x=>x.userId).sort((a,b)=>b.damage-a.damage||a.userId-b.userId),statements=[];
  ranked.forEach((x,index)=>statements.push(env.DB.prepare(`INSERT INTO raid_participant_v1293(instance_id,user_id,final_damage,final_rank,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(instance_id,user_id) DO UPDATE SET final_damage=excluded.final_damage,final_rank=excluded.final_rank,updated_at=CURRENT_TIMESTAMP`).bind(Number(instanceId),x.userId,x.damage,index+1)));
  if(statements.length)await env.DB.batch(statements);return ranked;
}
export async function raidFinalParticipantV1293(env,instanceId,userId){await ensureRaidOverhaulV1293(env);return env.DB.prepare('SELECT final_damage AS finalDamage,final_rank AS finalRank FROM raid_participant_v1293 WHERE instance_id=? AND user_id=?').bind(Number(instanceId),Number(userId)).first();}

function hash01(text){let hash=2166136261;for(const ch of String(text)){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0;}return hash/4294967296;}
function addReward(target,item,source){if(!item||Number(item.amount)<=0)return;const type=String(item.type).toUpperCase(),amount=Math.floor(Number(item.amount));target.push({type,amount,source,label:type==='COIN'?'코인':type==='CARD_SHARD'?'카드 조각':ITEM_LABELS[type]||type});}
export function raidRewardPlanV1293({cfg,instanceId,userId,totalDamage,finalRank,cleared}){
  const rewards=cfg?.rewards||DEFAULT_REWARDS,entries=[];
  for(const item of rewards.participation||[])addReward(entries,item,'참여');
  if(cleared)for(const item of rewards.clear||[])addReward(entries,item,'처치');
  for(const milestone of rewards.damageMilestones||[])if(Number(totalDamage)>=Number(milestone.damage||0))for(const item of milestone.rewards||[])addReward(entries,item,`누적 피해 ${Number(milestone.damage).toLocaleString()}`);
  const rankBand=(rewards.rankRewards||[]).find(x=>Number(finalRank)>=Number(x.from)&&Number(finalRank)<=Number(x.to));if(rankBand)for(const item of rankBand.rewards||[])addReward(entries,item,`${rankBand.from===rankBand.to?rankBand.from:`${rankBand.from}~${rankBand.to}`}위`);
  const rare=[];for(let i=0;i<(rewards.rareDrops||[]).length;i++){const item=rewards.rareDrops[i],roll=hash01(`${instanceId}:${userId}:${item.type}:${i}`)*100,won=roll<Number(item.chance||0);rare.push({...item,roll:Number(roll.toFixed(4)),won});if(won)addReward(entries,item,`희귀 드롭 ${Number(item.chance||0)}%`);}
  const aggregate={coin:0,shards:0,inventory:{}};for(const entry of entries){if(entry.type==='COIN')aggregate.coin+=entry.amount;else if(entry.type==='CARD_SHARD')aggregate.shards+=entry.amount;else aggregate.inventory[entry.type]=(aggregate.inventory[entry.type]||0)+entry.amount;}
  const inventoryRewards=Object.entries(aggregate.inventory).map(([type,amount])=>({type,itemCode:type,amount,label:ITEM_LABELS[type]||type}));
  return {coin:aggregate.coin,shards:aggregate.shards,inventoryRewards,entries,rareDrops:rare,totalDamage:Number(totalDamage||0),finalRank:Number(finalRank||0),cleared:Boolean(cleared)};
}
export async function ensureRaidUserRewardPlanV1293(env,{instanceId,userId,cfg,totalDamage,finalRank,cleared}){
  await ensureRaidOverhaulV1293(env);let row=await env.DB.prepare('SELECT status,reward_json AS rewardJson FROM raid_user_reward_v1293 WHERE instance_id=? AND user_id=?').bind(Number(instanceId),Number(userId)).first();
  if(row?.rewardJson){try{return {status:String(row.status||'READY'),plan:JSON.parse(row.rewardJson)}}catch{}}
  const plan=raidRewardPlanV1293({cfg,instanceId,userId,totalDamage,finalRank,cleared});await env.DB.prepare(`INSERT OR IGNORE INTO raid_user_reward_v1293(instance_id,user_id,status,reward_json,created_at,updated_at) VALUES(?,?,'READY',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(Number(instanceId),Number(userId),JSON.stringify(plan)).run();
  row=await env.DB.prepare('SELECT status,reward_json AS rewardJson FROM raid_user_reward_v1293 WHERE instance_id=? AND user_id=?').bind(Number(instanceId),Number(userId)).first();try{return {status:String(row?.status||'READY'),plan:JSON.parse(row?.rewardJson||JSON.stringify(plan))}}catch{return {status:'READY',plan};}
}
export async function raidInventoryGrantStatementsV1293(env,{userId,instanceId,inventoryRewards}){
  const rewards=(Array.isArray(inventoryRewards)?inventoryRewards:[]).filter(x=>ITEM_TYPES.includes(String(x.itemCode||x.type))&&Number(x.amount)>0);if(!rewards.length)return {statements:[],balances:[]};
  const codes=[...new Set(rewards.map(x=>String(x.itemCode||x.type)))],marks=codes.map(()=>'?').join(','),rows=(await env.DB.prepare(`SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? AND item_code IN (${marks})`).bind(Number(userId),...codes).all()).results||[],balanceMap=Object.fromEntries(rows.map(x=>[String(x.item_code),Number(x.quantity||0)])),statements=[],balances=[];
  for(const reward of rewards){const code=String(reward.itemCode||reward.type),amount=Math.floor(Number(reward.amount)),after=Number(balanceMap[code]||0)+amount;balanceMap[code]=after;statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(Number(userId),code,amount,amount));statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,'RAID_V1293_REWARD','RAID',?)").bind(Number(userId),code,amount,after,String(instanceId)));balances.push({itemCode:code,amount,balanceAfter:after,label:ITEM_LABELS[code]||code});}
  return {statements,balances};
}
export function raidRewardDisplayV1293(plan){return {coin:Number(plan?.coin||0),shards:Number(plan?.shards||0),inventoryRewards:Array.isArray(plan?.inventoryRewards)?plan.inventoryRewards:[],entries:Array.isArray(plan?.entries)?plan.entries:[],rareDrops:Array.isArray(plan?.rareDrops)?plan.rareDrops:[],totalDamage:Number(plan?.totalDamage||0),finalRank:Number(plan?.finalRank||0)};}
