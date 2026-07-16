import { SCHEMA } from '../_data/schema.js';
import { MEMBERS, CARDS, PACKS, RATES } from '../_data/seed.js';
import { handleEvolution } from '../_evolution.js';
import { handleCaptain } from '../_captain.js';

const SCORE={C:1,U:5,R:20,SR:50,HR:100,UR:200,SSR:500,MA:1500,FUR:5000,LIMITED:3000};
const ORDER={C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7,MA:8,FUR:9,LIMITED:10};
const RARITIES=['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'];
const SHARD_REWARD={C:1,U:2,R:4,SR:8,HR:15,UR:30,SSR:60,MA:120,FUR:250,LIMITED:180};
const BREAKTHROUGH_COST=[50,100,200,350,550,800,1100,1450,1850,2300];
const BREAKTHROUGH_RATE=[100,100,100,80,65,50,35,25,15,8];
const BREAKTHROUGH_GRADES=['SR','HR','UR','SSR','MA','FUR','LIMITED'];
const BREAKTHROUGH_MIN_ORDER=ORDER.SR;
const BATTLE_POWER_DEFAULT={C:100,U:160,R:250,SR:400,HR:620,UR:900,SSR:1300,MA:1850,FUR:2600,LIMITED:2800};
const BATTLE_BREAKTHROUGH_DEFAULT=[0,18,42,72,108,150,198,252,312,378,450];

const SCORE_TIER_DEFAULT=[
  {id:'bronze',name:'브론즈',min:0,color:'#b87333',aura:false},
  {id:'silver',name:'실버',min:15000,color:'#c9d4e3',aura:false},
  {id:'gold',name:'골드',min:40000,color:'#ffd15c',aura:false},
  {id:'platinum',name:'플래티넘',min:90000,color:'#5ff0df',aura:true},
  {id:'diamond',name:'다이아',min:170000,color:'#69cfff',aura:true},
  {id:'master',name:'마스터',min:300000,color:'#bd7cff',aura:true},
  {id:'grandmaster',name:'그랜드마스터',min:500000,color:'#ff6f91',aura:true}
];
function defaultTierSettings(){return {cardScoreTiers:SCORE_TIER_DEFAULT,pvp:{enabled:true,status:'ACTIVE',seasonName:'시즌 준비 중',startsAt:null,endsAt:null,tiers:SCORE_TIER_DEFAULT.map((x,i)=>({...x,min:i*500}))}}}
async function tierSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='tier_settings_v1'").first();const base=defaultTierSettings();if(!row?.value)return base;try{const x=JSON.parse(row.value);const cleanTiers=(Array.isArray(x.cardScoreTiers)?x.cardScoreTiers:base.cardScoreTiers).map((t,i)=>({id:String(t.id||base.cardScoreTiers[i]?.id||('tier'+i)).replace(/[^a-z0-9_-]/gi,'').slice(0,30),name:String(t.name||'티어').slice(0,20),min:Math.max(0,Math.floor(Number(t.min)||0)),color:/^#[0-9a-f]{6}$/i.test(String(t.color||''))?String(t.color):'#7ceeff',aura:t.aura!==false})).sort((a,b)=>a.min-b.min);return {cardScoreTiers:cleanTiers,pvp:{enabled:x.pvp?.enabled!==false,status:String(x.pvp?.status||'ACTIVE').slice(0,30),seasonName:String(x.pvp?.seasonName||'시즌 준비 중').slice(0,40),startsAt:x.pvp?.startsAt||null,endsAt:x.pvp?.endsAt||null,tiers:Array.isArray(x.pvp?.tiers)?x.pvp.tiers:base.pvp.tiers}}}catch{return base}}
function resolveTier(score,tiers){let current=tiers[0]||{id:'bronze',name:'브론즈',min:0,color:'#b87333',aura:false};for(const t of tiers)if(score>=t.min)current=t;return current}


function defaultPvpSettings(){return {enabled:true,status:'ACTIVE',seasonTitle:'ASYNC PVP SEASON',seasonName:'시즌 1',seasonDescription:'저장한 PvP 덱으로 비동기 대전을 진행합니다.',startsAt:null,endsAt:null,initialScore:1000,winScore:24,loseScore:16,matchCardRange:15,matchSeasonRange:300,historyLimit:100,winCoin:50,loseCoin:25,scoreBalance:{enabled:true,equalRange:10,weakerWinMid:80,weakerWinHigh:60,weakerWinExtreme:40,strongerWinMid:110,strongerWinHigh:125,strongerWinExtreme:140,strongerLossMid:90,strongerLossHigh:75,strongerLossExtreme:60,weakerLossMid:110,weakerLossHigh:125,weakerLossExtreme:140,minChange:1,maxChange:999},energy:{enabled:true,maxEnergy:5,rechargeMinutes:30,costPerBattle:1,adminUnlimited:true,testUnlimited:true},rewardClaimMode:'SEASON_END',tierRewardsEnabled:true,rankRewardsEnabled:true,tiers:[{id:'bronze',name:'브론즈',min:0,color:'#b87333',aura:false,rewardCoin:500,rewardShards:0},{id:'silver',name:'실버',min:1100,color:'#c9d4e3',aura:false,rewardCoin:1000,rewardShards:20},{id:'gold',name:'골드',min:1250,color:'#ffd15c',aura:false,rewardCoin:2000,rewardShards:50},{id:'platinum',name:'플래티넘',min:1450,color:'#5ff0df',aura:true,rewardCoin:4000,rewardShards:100},{id:'diamond',name:'다이아',min:1700,color:'#69cfff',aura:true,rewardCoin:7000,rewardShards:180},{id:'master',name:'마스터',min:2050,color:'#bd7cff',aura:true,rewardCoin:12000,rewardShards:300},{id:'grandmaster',name:'그랜드마스터',min:2500,color:'#ff6f91',aura:true,rewardCoin:20000,rewardShards:500}],rankRewards:[{from:1,to:1,rewardCoin:30000,rewardShards:700},{from:2,to:3,rewardCoin:20000,rewardShards:500},{from:4,to:10,rewardCoin:12000,rewardShards:300},{from:11,to:50,rewardCoin:5000,rewardShards:120}]};}
function cleanPvpSettings(raw={}){const base=defaultPvpSettings(),num=(v,d,min=0,max=100000000)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Math.floor(Number(v)):d));const tiers=(Array.isArray(raw.tiers)?raw.tiers:base.tiers).map((t,i)=>({id:String(t.id||base.tiers[i]?.id||('tier'+i)).replace(/[^a-z0-9_-]/gi,'').slice(0,30),name:String(t.name||base.tiers[i]?.name||'티어').slice(0,20),min:num(t.min,base.tiers[i]?.min||0),color:/^#[0-9a-f]{6}$/i.test(String(t.color||''))?String(t.color):base.tiers[i]?.color||'#7ceeff',aura:t.aura!==false,rewardCoin:num(t.rewardCoin,base.tiers[i]?.rewardCoin||0),rewardShards:num(t.rewardShards,base.tiers[i]?.rewardShards||0)})).sort((a,b)=>a.min-b.min);const rankRewards=(Array.isArray(raw.rankRewards)?raw.rankRewards:base.rankRewards).slice(0,20).map((r,i)=>{const from=num(r.from,base.rankRewards[i]?.from||1,1,100000),to=num(r.to,base.rankRewards[i]?.to||from,1,100000);return {from:Math.min(from,to),to:Math.max(from,to),rewardCoin:num(r.rewardCoin,base.rankRewards[i]?.rewardCoin||0),rewardShards:num(r.rewardShards,base.rankRewards[i]?.rewardShards||0)}}).sort((a,b)=>a.from-b.from);return {...base,enabled:raw.enabled!==false,status:String(raw.status||base.status).slice(0,60),seasonTitle:String(raw.seasonTitle||base.seasonTitle).slice(0,80),seasonName:String(raw.seasonName||base.seasonName).slice(0,40),seasonDescription:String(raw.seasonDescription||base.seasonDescription).slice(0,240),startsAt:raw.startsAt||null,endsAt:raw.endsAt||null,initialScore:num(raw.initialScore,base.initialScore,0,1000000),winScore:num(raw.winScore,base.winScore,0,100000),loseScore:num(raw.loseScore,base.loseScore,0,100000),matchCardRange:num(raw.matchCardRange,base.matchCardRange,1,100),matchSeasonRange:num(raw.matchSeasonRange,base.matchSeasonRange,0,100000),historyLimit:num(raw.historyLimit,base.historyLimit,10,500),winCoin:num(raw.winCoin,base.winCoin,0,10000000),loseCoin:num(raw.loseCoin,base.loseCoin,0,10000000),scoreBalance:{enabled:raw.scoreBalance?.enabled!==false,equalRange:num(raw.scoreBalance?.equalRange,base.scoreBalance.equalRange,0,100),weakerWinMid:num(raw.scoreBalance?.weakerWinMid,base.scoreBalance.weakerWinMid,0,500),weakerWinHigh:num(raw.scoreBalance?.weakerWinHigh,base.scoreBalance.weakerWinHigh,0,500),weakerWinExtreme:num(raw.scoreBalance?.weakerWinExtreme,base.scoreBalance.weakerWinExtreme,0,500),strongerWinMid:num(raw.scoreBalance?.strongerWinMid,base.scoreBalance.strongerWinMid,0,500),strongerWinHigh:num(raw.scoreBalance?.strongerWinHigh,base.scoreBalance.strongerWinHigh,0,500),strongerWinExtreme:num(raw.scoreBalance?.strongerWinExtreme,base.scoreBalance.strongerWinExtreme,0,500),strongerLossMid:num(raw.scoreBalance?.strongerLossMid,base.scoreBalance.strongerLossMid,0,500),strongerLossHigh:num(raw.scoreBalance?.strongerLossHigh,base.scoreBalance.strongerLossHigh,0,500),strongerLossExtreme:num(raw.scoreBalance?.strongerLossExtreme,base.scoreBalance.strongerLossExtreme,0,500),weakerLossMid:num(raw.scoreBalance?.weakerLossMid,base.scoreBalance.weakerLossMid,0,500),weakerLossHigh:num(raw.scoreBalance?.weakerLossHigh,base.scoreBalance.weakerLossHigh,0,500),weakerLossExtreme:num(raw.scoreBalance?.weakerLossExtreme,base.scoreBalance.weakerLossExtreme,0,500),minChange:num(raw.scoreBalance?.minChange,base.scoreBalance.minChange,0,100000),maxChange:num(raw.scoreBalance?.maxChange,base.scoreBalance.maxChange,1,100000)},energy:{enabled:raw.energy?.enabled!==false,maxEnergy:num(raw.energy?.maxEnergy,base.energy.maxEnergy,1,999),rechargeMinutes:num(raw.energy?.rechargeMinutes,base.energy.rechargeMinutes,1,1440),costPerBattle:num(raw.energy?.costPerBattle,base.energy.costPerBattle,1,99),adminUnlimited:raw.energy?.adminUnlimited!==false,testUnlimited:raw.energy?.testUnlimited!==false},rewardClaimMode:['IMMEDIATE','SEASON_END'].includes(raw.rewardClaimMode)?raw.rewardClaimMode:base.rewardClaimMode,tierRewardsEnabled:raw.tierRewardsEnabled!==false,rankRewardsEnabled:raw.rankRewardsEnabled!==false,tiers,rankRewards};}
async function pvpSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pvp_settings_v1'").first();if(!row?.value)return defaultPvpSettings();try{return cleanPvpSettings(JSON.parse(row.value))}catch{return defaultPvpSettings()}}
function pvpSeasonKey(settings){return [String(settings?.seasonName||'').trim(),String(settings?.startsAt||''),String(settings?.endsAt||'')].join('|').slice(0,220)}
async function completedPvpSettlement(env,settings){const key=pvpSeasonKey(settings);if(!key)return null;return env.DB.prepare("SELECT id,status,completed_at FROM pvp_season_settlements WHERE season_key=? AND status='COMPLETED'").bind(key).first()}
function pvpSettlementRewardFor(rankRow,settings,tierClaimed,rankClaimed){const tier=resolveTier(Number(rankRow.highest_score||0),settings.tiers||[]),rankReward=(settings.rankRewards||[]).find(x=>Number(rankRow.final_rank)>=Number(x.from)&&Number(rankRow.final_rank)<=Number(x.to));return {tier,tierCoin:settings.tierRewardsEnabled&&!tierClaimed?Number(tier.rewardCoin||0):0,tierShards:settings.tierRewardsEnabled&&!tierClaimed?Number(tier.rewardShards||0):0,rankCoin:settings.rankRewardsEnabled&&!rankClaimed?Number(rankReward?.rewardCoin||0):0,rankShards:settings.rankRewardsEnabled&&!rankClaimed?Number(rankReward?.rewardShards||0):0}}

function pvpScoreAdjustment(base,isWin,myCard,opponentCard,settings){const cfg=settings.scoreBalance||{},safeBase=Math.max(0,Number(base||0));if(cfg.enabled===false||!myCard||!opponentCard)return {change:safeBase,multiplier:100,diffPercent:0,label:'기본 점수'};const diff=(Number(opponentCard)-Number(myCard))/Math.max(1,Number(myCard))*100,abs=Math.abs(diff),eq=Number(cfg.equalRange??10);let multiplier=100,label='비슷한 체급';if(abs>eq){const band=abs<20?'Mid':abs<30?'High':'Extreme';if(isWin){if(diff<0){multiplier=Number(cfg['weakerWin'+band]??100);label='낮은 체급 승리 패널티'}else{multiplier=Number(cfg['strongerWin'+band]??100);label='상위 체급 승리 보너스'}}else{if(diff>0){multiplier=Number(cfg['strongerLoss'+band]??100);label='상위 체급 패배 완화'}else{multiplier=Number(cfg['weakerLoss'+band]??100);label='낮은 체급 패배 패널티'}}}const min=Math.max(0,Number(cfg.minChange??1)),max=Math.max(min,Number(cfg.maxChange??999));return {change:Math.max(min,Math.min(max,Math.round(safeBase*multiplier/100))),multiplier,diffPercent:Math.round(diff*10)/10,label}}

function pvpSeasonScoreAdjustment(isWin,myScore,opponentScore){const diff=Number(opponentScore||0)-Number(myScore||0);let change,label;if(diff>=500){change=isWin?36:6;label=isWin?'상위 점수 상대 승리 보너스':'상위 점수 상대 패배 완화'}else if(diff>=200){change=isWin?30:10;label=isWin?'강한 상대 승리 보너스':'강한 상대 패배 완화'}else if(diff<=-500){change=isWin?12:24;label=isWin?'낮은 점수 상대 승리 조정':'낮은 점수 상대 패배 패널티'}else if(diff<=-200){change=isWin?18:20;label=isWin?'낮은 상대 승리 조정':'낮은 상대 패배 패널티'}else{change=isWin?24:16;label='비슷한 시즌 점수'}return {change,scoreDiff:diff,label}}
async function userCardScore(env,userId){const settings=await battleSettings(env);const rows=await env.DB.prepare("SELECT c.rarity,c.power_type,c.base_power,uc.breakthrough_level FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')").bind(userId).all();return rows.results.reduce((sum,c)=>sum+cardBattlePower(c,Number(c.breakthrough_level||0),settings),0)}
async function ensurePvpProfile(env,user,settings){let row=await env.DB.prepare('SELECT * FROM pvp_profiles WHERE user_id=?').bind(user.id).first();if(!row){await env.DB.prepare('INSERT OR IGNORE INTO pvp_profiles(user_id,season_score,highest_score,wins,losses,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)').bind(user.id,settings.initialScore,settings.initialScore,0,0).run();row=await env.DB.prepare('SELECT * FROM pvp_profiles WHERE user_id=?').bind(user.id).first()}return row}
async function pvpDeckCards(env,userId){const row=await env.DB.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').bind(userId).first();if(!row)return [];try{return JSON.parse(row.card_ids||'[]')}catch{return []}}
async function pveDeckCards(env,userId){const row=await env.DB.prepare('SELECT card_ids FROM pve_decks WHERE user_id=?').bind(userId).first();if(!row)return [];try{return JSON.parse(row.card_ids||'[]')}catch{return []}}

function defaultMineralExchangeSettings(){return {enabled:true,baseMineral:100000000,payoutCoin:1000,dailyLimitCoin:3000,coinUnit:1000}}
function cleanMineralExchangeSettings(raw={}){const b=defaultMineralExchangeSettings();return {enabled:raw.enabled!==false,baseMineral:Math.max(1,Math.floor(Number(raw.baseMineral||b.baseMineral))),payoutCoin:Math.max(1,Math.floor(Number(raw.payoutCoin||b.payoutCoin))),dailyLimitCoin:Math.max(1000,Math.floor(Number(raw.dailyLimitCoin||b.dailyLimitCoin)/1000)*1000),coinUnit:1000}}
async function mineralExchangeSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='mineral_exchange_settings_v1'").first();if(!row?.value)return defaultMineralExchangeSettings();try{return cleanMineralExchangeSettings(JSON.parse(row.value))}catch{return defaultMineralExchangeSettings()}}
function kstTodaySql(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function pvpDeckSnapshot(env,userId){const ids=await pvpDeckCards(env,userId);if(!ids.length)return [];const marks=ids.map(()=>'?').join(',');const rows=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,uc.breakthrough_level FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND c.id IN (${marks})`).bind(userId,...ids).all();const map=new Map(rows.results.map(x=>[String(x.id),x]));return ids.map(id=>map.get(String(id))).filter(Boolean)}

async function pvpEnergyState(env,user,settings){
  const cfg=settings.energy||defaultPvpSettings().energy;
  const maintenance=await maintenanceSettings(env);
  const unlimited=!cfg.enabled||(cfg.adminUnlimited&&isAdminRole(user))||(cfg.testUnlimited&&maintenance.testUsers.includes(user.nickname));
  if(unlimited)return {enabled:cfg.enabled,unlimited:true,energy:cfg.maxEnergy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt:null};
  const now=Date.now(),nowSql=sqlUtcNow();
  let row=await env.DB.prepare('SELECT * FROM user_pvp_energy WHERE user_id=?').bind(user.id).first();
  if(!row){await env.DB.prepare('INSERT OR IGNORE INTO user_pvp_energy(user_id,energy,last_recharged_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').bind(user.id,cfg.maxEnergy,nowSql).run();row=await env.DB.prepare('SELECT * FROM user_pvp_energy WHERE user_id=?').bind(user.id).first();}
  let energy=Math.max(0,Math.min(cfg.maxEnergy,Number(row.energy||0))),last=utcMs(row.last_recharged_at);
  if(energy<cfg.maxEnergy){const interval=cfg.rechargeMinutes*60000,gained=Math.floor((now-last)/interval);if(gained>0){energy=Math.min(cfg.maxEnergy,energy+gained);last=energy>=cfg.maxEnergy?now:last+gained*interval;}}
  await env.DB.prepare('UPDATE user_pvp_energy SET energy=?,last_recharged_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(energy,new Date(last).toISOString().replace('T',' ').slice(0,19),user.id).run();
  const nextRechargeAt=energy>=cfg.maxEnergy?null:new Date(last+cfg.rechargeMinutes*60000).toISOString();
  return {enabled:true,unlimited:false,energy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt};
}
async function consumePvpEnergy(env,user,settings){
  const state=await pvpEnergyState(env,user,settings);if(state.unlimited)return state;
  if(state.energy<state.costPerBattle){const e=new Error('PvP 전투 횟수가 부족합니다. 30분마다 1회 충전됩니다.');e.code='NO_PVP_ENERGY';e.energy=state;throw e;}
  const nowSql=sqlUtcNow();
  const result=await env.DB.prepare('UPDATE user_pvp_energy SET energy=energy-?,last_recharged_at=CASE WHEN energy>=? THEN ? ELSE last_recharged_at END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND energy>=?').bind(state.costPerBattle,state.maxEnergy,nowSql,user.id,state.costPerBattle).run();
  if(!result.meta.changes){const e=new Error('PvP 전투 횟수가 부족합니다.');e.code='NO_PVP_ENERGY';e.energy=await pvpEnergyState(env,user,settings);throw e;}
  return pvpEnergyState(env,user,settings);
}


function defaultRaidSettings(){return {enabled:false,ownerOnlyTest:false,userOpenEnabled:true,title:'월드 레이드',maxParticipants:30,minParticipants:5,lobbySeconds:60,battleSeconds:120,dailyEntries:1,autoStartOnFull:true,showNicknames:true,showRepresentativeCard:true,showDamageLog:true,showPersonalDamage:true,showLiveRanking:true,rankingSize:10,attackIntervalMs:800,damageMultiplier:1,criticalEnabled:true,criticalChance:10,criticalMultiplier:1.5,participationCoin:100,clearCoin:300,rewardShards:20,deckHpMultiplier:12,bossAttackPower:850,bossAttackIntervalMs:5000,bossAttackVariance:15,enrageEnabled:true,enrageHpPercent:30,enrageMultiplier:1.6,showBattleStage:true,showParticipantHp:true,scheduleMode:'ALWAYS',openDays:[0,1,2,3,4,5,6],openTime:'20:00',closeTime:'21:00',entryCloseMinutes:0,showOpenCountdown:true,ownerScheduleBypass:true};}
function cleanRaidSettings(raw={}){const b=defaultRaidSettings(),num=(v,d,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):d)),time=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):null;const days=[...new Set((Array.isArray(raw.openDays)?raw.openDays:b.openDays).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))];return {...b,enabled:raw.enabled===true,ownerOnlyTest:raw.ownerOnlyTest===true,userOpenEnabled:raw.userOpenEnabled!==false,title:String(raw.title||b.title).trim().slice(0,40),maxParticipants:Math.floor(num(raw.maxParticipants,b.maxParticipants,1,200)),minParticipants:Math.floor(num(raw.minParticipants,b.minParticipants,1,200)),lobbySeconds:Math.floor(num(raw.lobbySeconds,b.lobbySeconds,5,3600)),battleSeconds:Math.floor(num(raw.battleSeconds,b.battleSeconds,10,3600)),dailyEntries:Math.floor(num(raw.dailyEntries,b.dailyEntries,1,99)),autoStartOnFull:raw.autoStartOnFull!==false,showNicknames:raw.showNicknames!==false,showRepresentativeCard:raw.showRepresentativeCard!==false,showDamageLog:raw.showDamageLog!==false,showPersonalDamage:raw.showPersonalDamage!==false,showLiveRanking:raw.showLiveRanking!==false,rankingSize:Math.floor(num(raw.rankingSize,b.rankingSize,1,50)),attackIntervalMs:Math.floor(num(raw.attackIntervalMs,b.attackIntervalMs,200,5000)),damageMultiplier:num(raw.damageMultiplier,b.damageMultiplier,0.01,100),criticalEnabled:raw.criticalEnabled!==false,criticalChance:num(raw.criticalChance,b.criticalChance,0,100),criticalMultiplier:num(raw.criticalMultiplier,b.criticalMultiplier,1,10),participationCoin:Math.floor(num(raw.participationCoin,b.participationCoin,0,10000000)),clearCoin:Math.floor(num(raw.clearCoin,b.clearCoin,0,10000000)),rewardShards:Math.floor(num(raw.rewardShards,b.rewardShards,0,1000000)),deckHpMultiplier:num(raw.deckHpMultiplier,b.deckHpMultiplier,1,1000),bossAttackPower:Math.floor(num(raw.bossAttackPower,b.bossAttackPower,1,100000000)),bossAttackIntervalMs:Math.floor(num(raw.bossAttackIntervalMs,b.bossAttackIntervalMs,500,60000)),bossAttackVariance:num(raw.bossAttackVariance,b.bossAttackVariance,0,90),enrageEnabled:raw.enrageEnabled!==false,enrageHpPercent:num(raw.enrageHpPercent,b.enrageHpPercent,1,99),enrageMultiplier:num(raw.enrageMultiplier,b.enrageMultiplier,1,10),showBattleStage:raw.showBattleStage!==false,showParticipantHp:raw.showParticipantHp!==false,scheduleMode:String(raw.scheduleMode||b.scheduleMode).toUpperCase()==='SCHEDULED'?'SCHEDULED':'ALWAYS',openDays:days.length?days:b.openDays,openTime:time(raw.openTime)||b.openTime,closeTime:time(raw.closeTime)||b.closeTime,entryCloseMinutes:Math.floor(num(raw.entryCloseMinutes,b.entryCloseMinutes,0,1440)),showOpenCountdown:raw.showOpenCountdown!==false,ownerScheduleBypass:raw.ownerScheduleBypass!==false};}
function raidScheduleState(cfg,user,nowMs=Date.now()){
  const bypass=Boolean(user?.role==='OWNER'&&cfg.ownerScheduleBypass);
  if(cfg.scheduleMode!=='SCHEDULED'||bypass)return {isOpen:true,canEnter:true,bypassed:bypass,nextOpenAt:null,closesAt:null,reason:bypass?'OWNER_BYPASS':'ALWAYS'};
  const kst=new Date(nowMs+9*3600000),day=kst.getUTCDay(),ymd=[kst.getUTCFullYear(),String(kst.getUTCMonth()+1).padStart(2,'0'),String(kst.getUTCDate()).padStart(2,'0')].join('-');
  const toUtcMs=(date,time)=>Date.parse(`${date}T${time}:00+09:00`),open=toUtcMs(ymd,cfg.openTime),closeBase=toUtcMs(ymd,cfg.closeTime),close=closeBase<=open?closeBase+86400000:closeBase;
  const openDay=cfg.openDays.includes(day),isOpen=openDay&&nowMs>=open&&nowMs<close,entryCloseAt=close-Math.max(0,Number(cfg.entryCloseMinutes||0))*60000,canEnter=isOpen&&nowMs<entryCloseAt;
  let nextOpenAt=null;
  for(let add=0;add<8;add++){const d=new Date(kst.getTime()+add*86400000),wd=d.getUTCDay();if(!cfg.openDays.includes(wd))continue;const date=[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')].join('-'),candidate=toUtcMs(date,cfg.openTime);if(candidate>nowMs){nextOpenAt=new Date(candidate).toISOString();break}}
  return {isOpen,canEnter,bypassed:false,nextOpenAt,closesAt:isOpen?new Date(close).toISOString():null,entryClosesAt:isOpen?new Date(entryCloseAt).toISOString():null,reason:isOpen?(canEnter?'OPEN':'ENTRY_CLOSED'):'CLOSED'};
}

async function cancelRaidForInsufficientPlayers(env,instance,participants){
  const existing=await env.DB.prepare('SELECT status FROM raid_room_cancellations WHERE instance_id=?').bind(instance.id).first();
  if(existing?.status==='COMPLETED')return;
  if(!existing)await env.DB.prepare("INSERT OR IGNORE INTO raid_room_cancellations(instance_id,reason,status) VALUES(?,'MIN_PARTICIPANTS','PENDING')").bind(instance.id).run();
  const opener=await env.DB.prepare("SELECT user_id AS userId,cost FROM raid_open_requests WHERE instance_id=? AND status='COMPLETED' ORDER BY created_at LIMIT 1").bind(instance.id).first();
  const dateKey=kstDateKey(Date.parse(instance.created_at||Date.now()));
  const statements=[env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='LOBBY'").bind(instance.id)];
  for(const row of participants){
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO raid_daily_entry_restores(user_id,entry_date,instance_id,reason) VALUES(?,?,?,'MIN_PARTICIPANTS')").bind(row.user_id,dateKey,instance.id));
  }
  const refund=Math.max(0,Number(opener?.cost||0));
  if(opener?.userId&&refund>0){
    statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(refund,opener.userId));
    statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'RAID_OPEN_REFUND' FROM users WHERE id=?").bind(refund,opener.userId));
  }
  statements.push(env.DB.prepare("UPDATE raid_room_cancellations SET status='COMPLETED',refund_user_id=?,refund_coin=?,restored_entries=?,updated_at=CURRENT_TIMESTAMP WHERE instance_id=?").bind(opener?.userId||null,refund,participants.length,instance.id));
  await env.DB.batch(statements);
}

async function refreshRaidForOwner(env,instance,cfg){
  if(!instance)return null;
  const now=Date.now(),startMs=instance.starts_at?Date.parse(instance.starts_at):0,endMs=instance.ends_at?Date.parse(instance.ends_at):0;
  if(instance.status==='LOBBY'&&startMs&&now>=startMs){
    const participants=(await env.DB.prepare('SELECT id,user_id,total_power,total_damage FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1').bind(instance.id).all()).results;
    if(participants.length>=Number(cfg.minParticipants||1)){
      for(const row of participants){
        if(Number(row.total_damage||0)>0)continue;
        const attacks=Math.max(1,Math.floor(Number(cfg.battleSeconds||120)*1000/Math.max(200,Number(cfg.attackIntervalMs||800))));
        const critFactor=cfg.criticalEnabled?1+(Number(cfg.criticalChance||0)/100)*(Math.max(1,Number(cfg.criticalMultiplier||1))-1):1;
        const damage=Math.max(1,Math.floor(Number(row.total_power||0)*Number(cfg.damageMultiplier||1)*attacks*critFactor/10));
        await env.DB.prepare('UPDATE raid_participants SET total_damage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(damage,row.id).run();
      }
      const total=await env.DB.prepare('SELECT COALESCE(SUM(total_damage),0) total FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1').bind(instance.id).first();
      const remain=Math.max(0,Number(instance.max_hp||0)-Number(total?.total||0));
      await env.DB.prepare("UPDATE raid_instances SET status='BATTLE',current_hp=?,participant_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(remain,participants.length,instance.id).run();
      instance.status='BATTLE';instance.current_hp=remain;instance.participant_count=participants.length;
    }else{
      await cancelRaidForInsufficientPlayers(env,instance,participants);
      instance.status='ENDED';instance.ends_at=new Date().toISOString();
    }
  }
  if(instance.status==='BATTLE'&&endMs&&now>=endMs){
    await env.DB.prepare("UPDATE raid_instances SET status='ENDED',current_hp=MAX(0,current_hp),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(instance.id).run();
    instance.status='ENDED';
  }
  return instance;
}

async function raidSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_settings_v1'").first();if(!row?.value)return defaultRaidSettings();try{return cleanRaidSettings(JSON.parse(row.value))}catch{return defaultRaidSettings()}}
async function raidRewardSnapshot(env,instanceId,cfg,create=true){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_reward_snapshots (
    instance_id INTEGER PRIMARY KEY,
    participation_coin INTEGER NOT NULL DEFAULT 0,
    clear_coin INTEGER NOT NULL DEFAULT 0,
    reward_shards INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  if(create)await env.DB.prepare('INSERT OR IGNORE INTO raid_reward_snapshots(instance_id,participation_coin,clear_coin,reward_shards) VALUES(?,?,?,?)').bind(Number(instanceId),Math.max(0,Number(cfg.participationCoin||0)),Math.max(0,Number(cfg.clearCoin||0)),Math.max(0,Number(cfg.rewardShards||0))).run();
  const row=await env.DB.prepare('SELECT participation_coin AS participationCoin,clear_coin AS clearCoin,reward_shards AS rewardShards FROM raid_reward_snapshots WHERE instance_id=?').bind(Number(instanceId)).first();
  return row||{participationCoin:Math.max(0,Number(cfg.participationCoin||0)),clearCoin:Math.max(0,Number(cfg.clearCoin||0)),rewardShards:Math.max(0,Number(cfg.rewardShards||0))};
}
async function raidBossOpenPolicies(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_user_open_bosses_v1'").first();if(!row?.value)return {};try{const raw=JSON.parse(row.value),out={};for(const [id,v] of Object.entries(raw||{})){out[String(Number(id))]={enabled:v?.enabled===true,cost:Math.max(0,Math.min(100000000,Math.floor(Number(v?.cost)||0)))}}return out}catch{return {}}}
function kstDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
async function raidDailyEntryCount(env,userId,dateKey=kstDateKey()){
  const [legacy,uses,restores]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) count FROM raid_daily_entries WHERE user_id=? AND entry_date=?').bind(userId,dateKey).first(),
    env.DB.prepare('SELECT COUNT(*) count FROM raid_daily_entry_uses WHERE user_id=? AND entry_date=?').bind(userId,dateKey).first(),
    env.DB.prepare('SELECT COUNT(*) count FROM raid_daily_entry_restores WHERE user_id=? AND entry_date=?').bind(userId,dateKey).first()
  ]);
  return Math.max(0,Number(legacy?.count||0)+Number(uses?.count||0)-Number(restores?.count||0));
}
async function raidDeckPower(env,userId,cardIds){let ids=[...new Set((cardIds||await pveDeckCards(env,userId)).map(String))];if(ids.length!==5){const e=new Error('저장된 PvE 덱 5장이 필요합니다.');e.status=400;throw e}const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT c.id,c.rarity,c.power_type,c.base_power,uc.breakthrough_level FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND c.id IN (${marks})`).bind(userId,...ids).all();if(owned.results.length!==5){const e=new Error('보유하지 않은 카드가 포함되어 있습니다.');e.status=400;throw e}const battleCfg=await battleSettings(env),power=owned.results.reduce((n,c)=>n+cardBattlePower(c,c.breakthrough_level,battleCfg),0);return {ids,power}}

function defaultBattleSettings(){return {enabled:true,deckSize:5,powerByGrade:{...BATTLE_POWER_DEFAULT},breakthroughBonus:[...BATTLE_BREAKTHROUGH_DEFAULT],cardDrop:{enabled:true,defaultRate:3,gradeRates:{C:40,U:25,R:15,SR:10,HR:6,UR:3,SSR:1,MA:0,FUR:0}},energy:{enabled:true,maxEnergy:10,dailyRestore:10,rechargeMinutes:15,costPerBattle:1,adminUnlimited:true,testUnlimited:true},ultimateRules:[{enabled:true,name:'SSR AWAKENING',requiredGrade:'SSR',minBreakthrough:5,requiredCount:1,activationChance:100,mediaUrl:'/assets/effects/SKILL.gif',durationMs:3000,coefficientPercent:500}]};}
async function battleSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='battle_settings_v1'").first();const base=defaultBattleSettings();if(!row?.value)return base;try{const x=JSON.parse(row.value);return {enabled:x.enabled!==false,deckSize:5,powerByGrade:Object.fromEntries(Object.keys(base.powerByGrade).map(g=>[g,Math.max(0,Math.floor(Number(x.powerByGrade?.[g]??base.powerByGrade[g])))])),breakthroughBonus:base.breakthroughBonus.map((v,i)=>Math.max(0,Number(x.breakthroughBonus?.[i]??v))),cardDrop:{enabled:x.cardDrop?.enabled!==false,defaultRate:Math.max(0,Math.min(100,Number(x.cardDrop?.defaultRate??base.cardDrop.defaultRate))),gradeRates:Object.fromEntries(Object.keys(base.cardDrop.gradeRates).map(g=>[g,Math.max(0,Math.min(100,Number(x.cardDrop?.gradeRates?.[g]??base.cardDrop.gradeRates[g])))]))},energy:{enabled:x.energy?.enabled!==false,maxEnergy:Math.max(1,Math.min(999,Math.floor(Number(x.energy?.maxEnergy??base.energy.maxEnergy)))),dailyRestore:Math.max(0,Math.min(999,Math.floor(Number(x.energy?.dailyRestore??base.energy.dailyRestore)))),rechargeMinutes:Math.max(1,Math.min(1440,Math.floor(Number(x.energy?.rechargeMinutes??base.energy.rechargeMinutes)))),costPerBattle:Math.max(1,Math.min(99,Math.floor(Number(x.energy?.costPerBattle??base.energy.costPerBattle)))),adminUnlimited:x.energy?.adminUnlimited!==false,testUnlimited:x.energy?.testUnlimited!==false},ultimateRules:(Array.isArray(x.ultimateRules)?x.ultimateRules:[]).slice(0,50).map((u,i)=>({enabled:u?.enabled!==false,name:String(u?.name||`ULTIMATE ${i+1}`).slice(0,40),requiredGrade:String(u?.requiredGrade||'SSR').toUpperCase(),minBreakthrough:Math.max(0,Math.min(20,Math.floor(Number(u?.minBreakthrough||0)))),requiredCount:Math.max(1,Math.min(5,Math.floor(Number(u?.requiredCount||1)))),activationChance:Math.max(0,Math.min(100,Number(u?.activationChance??100))),mediaUrl:String(u?.mediaUrl||'/assets/effects/SKILL.gif').replace(/\\/g,'/').slice(0,500),durationMs:Math.max(800,Math.min(30000,Math.floor(Number(u?.durationMs||3000)))),coefficientPercent:Math.max(0,Math.min(100000,Number(u?.coefficientPercent??u?.damageValue??500)))}))};}catch{return base}}
const CARD_POWER_TYPES={SSR:{NORMAL:1300,HIGH:1375,TOP:1450},MA:{NORMAL:1850,HIGH:2050,TOP:2250},LIMITED:{NORMAL:2350,HIGH:2600,TOP:2850},FUR:{FIXED:3200}};
function cardPowerBase(card,settings){const saved=Number(card.base_power??card.basePower);const grade=card.rarity||card.grade;return Number.isFinite(saved)&&saved>0?saved:Number(settings.powerByGrade[grade]||0)}
function cardBattlePower(card,level,settings){const base=cardPowerBase(card,settings);const pct=Number(settings.breakthroughBonus[Math.max(0,Math.min(10,Number(level)||0))]||0);return Math.floor(base*(1+pct/100));}

function sqlUtcNow(){return new Date().toISOString().replace('T',' ').slice(0,19)}
function utcMs(value){if(!value)return Date.now();const t=Date.parse(String(value).replace(' ','T')+'Z');return Number.isFinite(t)?t:Date.now()}
async function battleEnergyState(env,user,settings){
  const cfg=settings.energy||defaultBattleSettings().energy;
  const maintenance=await maintenanceSettings(env);
  const unlimited=!cfg.enabled||(cfg.adminUnlimited&&isAdminRole(user))||(cfg.testUnlimited&&maintenance.testUsers.includes(user.nickname));
  if(unlimited)return {enabled:cfg.enabled,unlimited:true,energy:cfg.maxEnergy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt:null,dailyResetAt:`${kstDate()} 00:00 KST`};
  const now=Date.now(),nowSql=sqlUtcNow(),today=kstDate();
  let row=await env.DB.prepare('SELECT * FROM user_battle_energy WHERE user_id=?').bind(user.id).first();
  if(!row){await env.DB.prepare('INSERT OR IGNORE INTO user_battle_energy(user_id,energy,last_recharged_at,last_daily_reset_date,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').bind(user.id,Math.min(cfg.maxEnergy,cfg.dailyRestore),nowSql,today).run();row=await env.DB.prepare('SELECT * FROM user_battle_energy WHERE user_id=?').bind(user.id).first();}
  let energy=Math.max(0,Math.min(cfg.maxEnergy,Number(row.energy||0))),last=utcMs(row.last_recharged_at),resetDate=String(row.last_daily_reset_date||'');
  if(resetDate!==today){energy=Math.min(cfg.maxEnergy,cfg.dailyRestore);last=now;resetDate=today;}
  if(energy<cfg.maxEnergy){const interval=cfg.rechargeMinutes*60000,gained=Math.floor((now-last)/interval);if(gained>0){energy=Math.min(cfg.maxEnergy,energy+gained);last=energy>=cfg.maxEnergy?now:last+gained*interval;}}
  await env.DB.prepare('UPDATE user_battle_energy SET energy=?,last_recharged_at=?,last_daily_reset_date=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(energy,new Date(last).toISOString().replace('T',' ').slice(0,19),resetDate,user.id).run();
  const nextRechargeAt=energy>=cfg.maxEnergy?null:new Date(last+cfg.rechargeMinutes*60000).toISOString();
  return {enabled:true,unlimited:false,energy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt,dailyResetAt:`${today} 00:00 KST`};
}
async function consumeBattleEnergy(env,user,settings){
  const state=await battleEnergyState(env,user,settings);if(state.unlimited)return state;
  if(state.energy<state.costPerBattle){const e=new Error('전투 횟수가 부족합니다.');e.code='NO_BATTLE_ENERGY';e.energy=state;throw e;}
  const nowSql=sqlUtcNow();
  const result=await env.DB.prepare('UPDATE user_battle_energy SET energy=energy-?,last_recharged_at=CASE WHEN energy>=? THEN ? ELSE last_recharged_at END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND energy>=?').bind(state.costPerBattle,state.maxEnergy,nowSql,user.id,state.costPerBattle).run();
  if(!result.meta.changes){const e=new Error('전투 횟수가 부족합니다.');e.code='NO_BATTLE_ENERGY';e.energy=await battleEnergyState(env,user,settings);throw e;}
  return battleEnergyState(env,user,settings);
}

function defaultBreakthroughConfig(){return Object.fromEntries(BREAKTHROUGH_GRADES.map(g=>[g,BREAKTHROUGH_COST.map((cost,i)=>({cost,rate:BREAKTHROUGH_RATE[i]}))]));}
async function breakthroughConfig(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='breakthrough_config'").first();if(!row?.value)return defaultBreakthroughConfig();try{const parsed=JSON.parse(row.value),base=defaultBreakthroughConfig();for(const g of BREAKTHROUGH_GRADES)for(let i=0;i<10;i++){const x=parsed?.[g]?.[i]||{};base[g][i]={cost:Number.isInteger(Number(x.cost))&&Number(x.cost)>0?Number(x.cost):base[g][i].cost,rate:Number.isFinite(Number(x.rate))?Math.max(0,Math.min(100,Number(x.rate))):base[g][i].rate};}return base}catch{return defaultBreakthroughConfig()}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}});
const readBody=async request=>{try{return await request.json()}catch{return {}}};
const bytes=value=>new TextEncoder().encode(value);
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',bytes(value)));
const createToken=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const createPrivateKey=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const part=()=>Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');return `CN-${part()}-${part()}-${part()}`};
const kstDate=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
function defaultAttendanceSettings(){return {enabled:true,rewards:[1000,1200,1400,1600,1800,2000,3000]};}
function cleanAttendanceSettings(raw={}){const base=defaultAttendanceSettings();const rewards=Array.from({length:7},(_,i)=>Math.max(0,Math.min(10000000,Math.floor(Number(raw.rewards?.[i]??base.rewards[i])||0))));return {enabled:raw.enabled!==false,rewards};}
async function attendanceSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='attendance_settings_v1'").first();if(!row?.value)return defaultAttendanceSettings();try{return cleanAttendanceSettings(JSON.parse(row.value))}catch{return defaultAttendanceSettings()}}
function previousKstDate(date){const d=new Date(`${date}T00:00:00+09:00`);d.setDate(d.getDate()-1);return new Date(d.getTime()+9*3600000).toISOString().slice(0,10);}

const safeName=value=>(value||'').trim().slice(0,20);

async function tableExists(env,name){
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
  return Boolean(row);
}
async function columnExists(env,table,column){
  if(!await tableExists(env,table)) return false;
  const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return rows.results.some(row=>String(row.name)===String(column));
}
async function initialized(env){
  if(!await tableExists(env,'app_meta')) return false;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='initialized'").first();
  return row?.value==='1';
}
async function runSchema(env){for(const statement of SCHEMA) await env.DB.prepare(statement).run()}
let upgradePromise=null;
async function ensureUpgrades(env){
  if(upgradePromise) return upgradePromise;
  upgradePromise=(async()=>{
    // IMPORTANT: 운영 D1의 cards/user_cards 테이블은 절대 재생성·rename·drop 하지 않는다.
    // 한정판은 rarity가 아니라 limited_total 속성으로 처리한다.

    // 카드별 전투력 유형: 기존 카드에는 자동 배정하지 않고 NULL 상태를 유지한다.
    const cardPowerTypeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v985_card_power_type'").first();
    if(cardPowerTypeDone?.value!=='1'){
      for(const q of [
        `ALTER TABLE cards ADD COLUMN power_type TEXT`,
        `ALTER TABLE cards ADD COLUMN base_power INTEGER`
      ]){try{await env.DB.prepare(q).run()}catch{}}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v985_card_power_type','1',CURRENT_TIMESTAMP)").run();
    }


    const raidUserOpenDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v978_raid_user_open'").first();
    if(raidUserOpenDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_daily_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,entry_date TEXT NOT NULL,instance_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date))`,
        `CREATE INDEX IF NOT EXISTS idx_raid_daily_entries_date ON raid_daily_entries(entry_date,user_id)`,
        `CREATE TABLE IF NOT EXISTS raid_open_requests (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,boss_id INTEGER NOT NULL,instance_id INTEGER,cost INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_open_requests_user ON raid_open_requests(user_id,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v978_raid_user_open','1',CURRENT_TIMESTAMP)").run();
    }

    const raidMultiEntryDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1001_raid_multi_entry'").first();
    if(raidMultiEntryDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_daily_entry_uses (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,entry_date TEXT NOT NULL,instance_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date,instance_id))`,
        `CREATE INDEX IF NOT EXISTS idx_raid_daily_entry_uses_date ON raid_daily_entry_uses(entry_date,user_id)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1001_raid_multi_entry','1',CURRENT_TIMESTAMP)").run();
    }

    const raidRoomsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1004_raid_rooms'").first();
    if(raidRoomsDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_daily_entry_restores (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,entry_date TEXT NOT NULL,instance_id INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT 'MIN_PARTICIPANTS',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,entry_date,instance_id))`,
        `CREATE INDEX IF NOT EXISTS idx_raid_entry_restores_date ON raid_daily_entry_restores(entry_date,user_id)`,
        `CREATE TABLE IF NOT EXISTS raid_room_cancellations (instance_id INTEGER PRIMARY KEY,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',refund_user_id INTEGER,refund_coin INTEGER NOT NULL DEFAULT 0,restored_entries INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1004_raid_rooms','1',CURRENT_TIMESTAMP)").run();
    }

    const raidLeaveDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1005_raid_leave'").first();
    if(raidLeaveDone?.value!=='1'){
      try{await env.DB.prepare('ALTER TABLE raid_participants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1').run()}catch{}
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1005_raid_leave','1',CURRENT_TIMESTAMP)").run();
    }

    const pvpSettlementDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v968_pvp_settlement'").first();
    if(pvpSettlementDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS pvp_season_settlements (id INTEGER PRIMARY KEY AUTOINCREMENT,season_key TEXT NOT NULL UNIQUE,season_name TEXT NOT NULL,season_title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'PREPARING',initial_score INTEGER NOT NULL DEFAULT 1000,participant_count INTEGER NOT NULL DEFAULT 0,reward_user_count INTEGER NOT NULL DEFAULT 0,message_count INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,error_message TEXT)`,
        `CREATE TABLE IF NOT EXISTS pvp_season_settlement_ranks (id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,nickname TEXT NOT NULL,final_rank INTEGER NOT NULL,season_score INTEGER NOT NULL DEFAULT 0,highest_score INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,tier_id TEXT NOT NULL DEFAULT '',tier_name TEXT NOT NULL DEFAULT '',reward_coin INTEGER NOT NULL DEFAULT 0,reward_shards INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(settlement_id,user_id),UNIQUE(settlement_id,final_rank))`,
        `CREATE TABLE IF NOT EXISTS pvp_season_settlement_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_id INTEGER NOT NULL,user_id INTEGER NOT NULL,reward_type TEXT NOT NULL,reward_amount INTEGER NOT NULL DEFAULT 0,message_id INTEGER,status TEXT NOT NULL DEFAULT 'RESERVED',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(settlement_id,user_id,reward_type))`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_settlement_status ON pvp_season_settlements(status,started_at)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_settlement_ranks_sid ON pvp_season_settlement_ranks(settlement_id,final_rank)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_settlement_delivery_sid ON pvp_season_settlement_deliveries(settlement_id,status)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v968_pvp_settlement','1',CURRENT_TIMESTAMP)").run();
    }

    const battleDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v860'").first();
    if(battleDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS battle_monsters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', battle_power INTEGER NOT NULL DEFAULT 500, reward_coin INTEGER NOT NULL DEFAULT 100, is_boss INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS battle_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, monster_id INTEGER NOT NULL, deck_cards TEXT NOT NULL, player_power INTEGER NOT NULL, monster_power INTEGER NOT NULL, result TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_battle_monsters_active ON battle_monsters(is_active,sort_order)`,
        `CREATE INDEX IF NOT EXISTS idx_battle_logs_user ON battle_logs(user_id,created_at)`
      ]) await env.DB.prepare(q).run();
      const count=await env.DB.prepare('SELECT COUNT(*) count FROM battle_monsters').first();
      if(!Number(count?.count||0)){
        for(const m of [
          ['숲의 슬라임','',900,150,0,1],['고블린 전사','',1800,250,0,2],['광폭한 오우거','',4200,500,1,3]
        ]) await env.DB.prepare('INSERT INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,sort_order) VALUES(?,?,?,?,?,?)').bind(...m).run();
      }
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultBattleSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v860','1',CURRENT_TIMESTAMP)").run();
    }
    const energyDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v864'").first();
    if(energyDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS user_battle_energy (user_id INTEGER PRIMARY KEY, energy INTEGER NOT NULL DEFAULT 10, last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_daily_reset_date TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_user_battle_energy_updated ON user_battle_energy(updated_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v864','1',CURRENT_TIMESTAMP)").run();
    }
    const pityDropDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v910'").first();
    if(pityDropDone?.value!=='1'){
      for(const sql of [
        `CREATE TABLE IF NOT EXISTS user_pack_pity (user_id INTEGER NOT NULL, pack_id TEXT NOT NULL, miss_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,pack_id))`,
        `CREATE INDEX IF NOT EXISTS idx_user_pack_pity_user ON user_pack_pity(user_id)`,
      ]){try{await env.DB.prepare(sql).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}}
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pack_pity_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultPitySettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v910','1',CURRENT_TIMESTAMP)").run();
    }
    const pityCmsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v912'").first();
    if(pityCmsDone?.value!=='1'){
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pack_pity_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultPitySettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v912','1',CURRENT_TIMESTAMP)").run();
    }

    const raidDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v913'").first();
    if(raidDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS raid_bosses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', max_hp INTEGER NOT NULL DEFAULT 1000000, defense_rate REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS raid_instances (id INTEGER PRIMARY KEY AUTOINCREMENT, boss_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'LOBBY', starts_at TEXT, ends_at TEXT, current_hp INTEGER NOT NULL DEFAULT 0, participant_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS raid_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, instance_id INTEGER NOT NULL, user_id INTEGER NOT NULL, deck_cards TEXT NOT NULL DEFAULT '[]', total_power INTEGER NOT NULL DEFAULT 0, total_damage INTEGER NOT NULL DEFAULT 0, rank_no INTEGER, reward_claimed INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(instance_id,user_id))`,
        `CREATE TABLE IF NOT EXISTS raid_damage_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, instance_id INTEGER NOT NULL, user_id INTEGER NOT NULL, card_id INTEGER, damage INTEGER NOT NULL DEFAULT 0, is_critical INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_instances_status ON raid_instances(status,created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_participants_instance ON raid_participants(instance_id,total_damage)`,
        `CREATE INDEX IF NOT EXISTS idx_raid_damage_logs_instance ON raid_damage_logs(instance_id,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('raid_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultRaidSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v913','1',CURRENT_TIMESTAMP)").run();
    }

    const identityDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v929'").first();
    if(identityDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS account_ip_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_account_ip_hash_unique ON account_ip_registrations(ip_hash)`,
        `CREATE TABLE IF NOT EXISTS account_ip_exceptions (ip_hash TEXT PRIMARY KEY, note TEXT, created_by INTEGER, expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS wago_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, wago_nickname TEXT NOT NULL, wago_member_no TEXT NOT NULL, verification_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING', comment_url TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL, verified_at TEXT, reviewed_by INTEGER, review_note TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_wago_member_verified_unique ON wago_verifications(wago_member_no) WHERE status='VERIFIED'`,
        `CREATE INDEX IF NOT EXISTS idx_wago_status ON wago_verifications(status,issued_at)`,
        `CREATE TABLE IF NOT EXISTS user_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, sender_type TEXT NOT NULL DEFAULT 'SYSTEM', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', message_type TEXT NOT NULL DEFAULT 'NOTICE', coupon_code TEXT, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, read_at TEXT)`,
        `CREATE INDEX IF NOT EXISTS idx_user_messages_user ON user_messages(user_id,is_read,created_at)`,
        `CREATE TABLE IF NOT EXISTS verified_coupon_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, coupon_id INTEGER NOT NULL, message_id INTEGER, campaign_name TEXT NOT NULL DEFAULT '', delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,coupon_id))`,
        `CREATE INDEX IF NOT EXISTS idx_verified_coupon_deliveries_user ON verified_coupon_deliveries(user_id,delivered_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('wago_verification_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:true,postUrl:'',codeMinutes:20,checkCooldownSeconds:10})).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v929','1',CURRENT_TIMESTAMP)").run();
    }

    const verifiedMessageDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v934_verified_messages'").first();
    if(verifiedMessageDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS user_message_rewards (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL, reward_type TEXT NOT NULL DEFAULT 'COIN', reward_amount INTEGER NOT NULL DEFAULT 0, claimed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_user_message_rewards_user ON user_message_rewards(user_id,claimed_at,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v934_verified_messages','1',CURRENT_TIMESTAMP)").run();
    }
    const messageClaimDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v936_message_claim_hide'").first();
    if(messageClaimDone?.value!=='1'){
      try{await env.DB.prepare(`ALTER TABLE user_messages ADD COLUMN hidden_at TEXT`).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_messages_visible ON user_messages(user_id,hidden_at,is_read,created_at)`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v936_message_claim_hide','1',CURRENT_TIMESTAMP)").run();
    }


    const retirementDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v940_card_retirement_refund'").first();
    if(retirementDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS card_retirement_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL UNIQUE, card_title TEXT NOT NULL, member_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING', refund_rate INTEGER NOT NULL DEFAULT 50, created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finalized_at TEXT)`,
        `CREATE TABLE IF NOT EXISTS card_retirement_refunds (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, user_id INTEGER NOT NULL, breakthrough_level INTEGER NOT NULL DEFAULT 0, required_shards INTEGER NOT NULL DEFAULT 0, refund_shards INTEGER NOT NULL DEFAULT 0, message_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(batch_id,user_id))`,
        `CREATE INDEX IF NOT EXISTS idx_card_retirement_refunds_batch ON card_retirement_refunds(batch_id,user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_card_retirement_batches_status ON card_retirement_batches(status,created_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v940_card_retirement_refund','1',CURRENT_TIMESTAMP)").run();
    }

    const wagoDailyQuestDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v949_wago_daily_quest'").first();
    if(wagoDailyQuestDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS wago_daily_quest_progress (user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, post_count INTEGER NOT NULL DEFAULT 0, post_ids_json TEXT NOT NULL DEFAULT '[]', last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,quest_date))`,
        `CREATE TABLE IF NOT EXISTS wago_daily_quest_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 1200, post_count INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,quest_date))`,
        `CREATE INDEX IF NOT EXISTS idx_wago_daily_quest_claims_date ON wago_daily_quest_claims(quest_date,claimed_at)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('wago_daily_quest_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({enabled:true,boardUrl:'https://ygosu.com/board/soop',requiredPosts:15,rewardCoin:1200,maxPages:10,checkCooldownSeconds:20})).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v949_wago_daily_quest','1',CURRENT_TIMESTAMP)").run();
    }


    const wagoDailyQuestV2Done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v9410_wago_daily_quest_comments'").first();
    if(wagoDailyQuestV2Done?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS wago_daily_comment_progress (user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, comment_count INTEGER NOT NULL DEFAULT 0, comment_ids_json TEXT NOT NULL DEFAULT '[]', last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,quest_date))`,
        `CREATE TABLE IF NOT EXISTS wago_daily_comment_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, quest_date TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 1250, comment_count INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,quest_date))`,
        `CREATE INDEX IF NOT EXISTS idx_wago_daily_comment_claims_date ON wago_daily_comment_claims(quest_date,claimed_at)`
      ]) await env.DB.prepare(q).run();
      const oldRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='wago_daily_quest_settings_v1'").first();
      let oldSettings={};try{oldSettings=JSON.parse(oldRow?.value||'{}')}catch{}
      const nextSettings={enabled:true,boardUrl:'https://ygosu.com/board/soop',postEnabled:true,commentEnabled:true,requiredPosts:15,postRewardCoin:Number(oldSettings.rewardCoin||1200),rewardCoin:Number(oldSettings.rewardCoin||1200),requiredComments:20,commentRewardCoin:1250,maxPages:Number(oldSettings.maxPages||10),commentMaxPosts:100,checkCooldownSeconds:Number(oldSettings.checkCooldownSeconds||20),adminTestAllowed:true,...oldSettings};
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('wago_daily_quest_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(nextSettings)).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v9410_wago_daily_quest_comments','1',CURRENT_TIMESTAMP)").run();
    }

    const wagoAutoDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v931_wago_auto_urls'").first();
    if(wagoAutoDone?.value!=='1'){
      const columns=(await env.DB.prepare("PRAGMA table_info(wago_verifications)").all()).results||[];
      const names=new Set(columns.map(x=>String(x.name)));
      if(!names.has('profile_url')) await env.DB.prepare("ALTER TABLE wago_verifications ADD COLUMN profile_url TEXT").run();
      if(!names.has('last_checked_at')) await env.DB.prepare("ALTER TABLE wago_verifications ADD COLUMN last_checked_at TEXT").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v931_wago_auto_urls','1',CURRENT_TIMESTAMP)").run();
    }
    const wagoCommentMemberDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v932_wago_comment_member_auto'").first();
    if(!wagoCommentMemberDone){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v932_wago_comment_member_auto','1',CURRENT_TIMESTAMP)").run();
    }
    const wagoDropdownMemberDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v933_wago_dropdown_member_parse'").first();
    if(!wagoDropdownMemberDone){
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v933_wago_dropdown_member_parse','1',CURRENT_TIMESTAMP)").run();
    }

    const tierDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v868'").first();
    if(tierDone?.value!=='1'){
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('tier_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultTierSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v868','1',CURRENT_TIMESTAMP)").run();
    }
    const pvpDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v870'").first();
    if(pvpDone?.value!=='1'){
      for(const sql of [
        `CREATE TABLE IF NOT EXISTS pvp_profiles (user_id INTEGER PRIMARY KEY, season_score INTEGER NOT NULL DEFAULT 1000, highest_score INTEGER NOT NULL DEFAULT 1000, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pvp_decks (user_id INTEGER PRIMARY KEY, card_ids TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pvp_match_history (id INTEGER PRIMARY KEY AUTOINCREMENT, attacker_id INTEGER NOT NULL, defender_id INTEGER NOT NULL, attacker_name TEXT NOT NULL, defender_name TEXT NOT NULL, attacker_deck TEXT NOT NULL, defender_deck TEXT NOT NULL, attacker_card_score INTEGER NOT NULL DEFAULT 0, defender_card_score INTEGER NOT NULL DEFAULT 0, attacker_power INTEGER NOT NULL DEFAULT 0, defender_power INTEGER NOT NULL DEFAULT 0, winner_id INTEGER NOT NULL, attacker_score_before INTEGER NOT NULL, attacker_score_after INTEGER NOT NULL, defender_score_before INTEGER NOT NULL, defender_score_after INTEGER NOT NULL, score_change INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pvp_reward_claims (user_id INTEGER NOT NULL, season_name TEXT NOT NULL, tier_id TEXT NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,season_name,tier_id))`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_profiles_score ON pvp_profiles(season_score DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_history_attacker ON pvp_match_history(attacker_id,created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_history_defender ON pvp_match_history(defender_id,created_at DESC)`
      ]) await env.DB.prepare(sql).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pvp_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultPvpSettings())).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('attendance_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultAttendanceSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v870','1',CURRENT_TIMESTAMP)").run();
    }
    const pvpCmsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v874'").first();
    if(pvpCmsDone?.value!=='1'){
      for(const sql of [
        `ALTER TABLE attendance_logs ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 1`,
        `ALTER TABLE pvp_reward_claims ADD COLUMN reward_shards INTEGER NOT NULL DEFAULT 0`,
        `CREATE TABLE IF NOT EXISTS pvp_rank_reward_claims (user_id INTEGER NOT NULL, season_name TEXT NOT NULL, final_rank INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, reward_shards INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,season_name))`,
        `CREATE INDEX IF NOT EXISTS idx_pvp_rank_claims_season ON pvp_rank_reward_claims(season_name,final_rank)`
      ]){try{await env.DB.prepare(sql).run()}catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}}
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v874','1',CURRENT_TIMESTAMP)").run();
    }
    // v9.0.7 repair migration: 기존 버전에서 이미 사용된 v874 마커 때문에
    // 새 컬럼 추가가 건너뛰어진 운영 D1을 실제 스키마 기준으로 복구한다.
    const attendanceRepairDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v907_attendance_pvp_coin'").first();
    if(attendanceRepairDone?.value!=='1'){
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('attendance_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultAttendanceSettings())).run();
      if(!await columnExists(env,'attendance_logs','streak_day')){
        try{await env.DB.prepare(`ALTER TABLE attendance_logs ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 1`).run()}
        catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      }
      if(await tableExists(env,'pvp_reward_claims')&&!await columnExists(env,'pvp_reward_claims','reward_shards')){
        try{await env.DB.prepare(`ALTER TABLE pvp_reward_claims ADD COLUMN reward_shards INTEGER NOT NULL DEFAULT 0`).run()}
        catch(e){if(!String(e.message||e).toLowerCase().includes('duplicate column'))throw e}
      }
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pvp_rank_reward_claims (user_id INTEGER NOT NULL, season_name TEXT NOT NULL, final_rank INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, reward_shards INTEGER NOT NULL DEFAULT 0, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,season_name))`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pvp_rank_claims_season ON pvp_rank_reward_claims(season_name,final_rank)`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v907_attendance_pvp_coin','1',CURRENT_TIMESTAMP)").run();
    }

    // v9.0.8 PvE deck save: 기존 migration은 수정하지 않고 전용 테이블만 안전하게 추가한다.
    const pveDeckDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v908_pve_deck'").first();
    if(pveDeckDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pve_decks (user_id INTEGER PRIMARY KEY, card_ids TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pve_decks_updated ON pve_decks(updated_at)`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v908_pve_deck','1',CURRENT_TIMESTAMP)").run();
    }

    // v9.0.9 미네랄 교환: 기존 migration을 수정하지 않고 설정/신청 테이블만 추가한다.
    const mineralExchangeDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v909_mineral_exchange'").first();
    if(mineralExchangeDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mineral_exchange_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game_nickname TEXT NOT NULL, wago_nickname TEXT NOT NULL, mineral_amount INTEGER NOT NULL, coin_amount INTEGER NOT NULL, proof_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', requested_kst_date TEXT NOT NULL, reviewed_by INTEGER, reviewed_at TEXT, reject_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mineral_exchange_user_date ON mineral_exchange_requests(user_id,requested_kst_date,status)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mineral_exchange_status ON mineral_exchange_requests(status,created_at DESC)`).run();
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('mineral_exchange_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(defaultMineralExchangeSettings())).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v909_mineral_exchange','1',CURRENT_TIMESTAMP)").run();
    }

    const pvpEnergyDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v878'").first();
    if(pvpEnergyDone?.value!=='1'){
      for(const sql of [
        `CREATE TABLE IF NOT EXISTS user_pvp_energy (user_id INTEGER PRIMARY KEY, energy INTEGER NOT NULL DEFAULT 5, last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE INDEX IF NOT EXISTS idx_user_pvp_energy_updated ON user_pvp_energy(updated_at)`
      ]) await env.DB.prepare(sql).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v878','1',CURRENT_TIMESTAMP)").run();
    }
    const packMapDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v867'").first();
    if(packMapDone?.value!=='1'){
      for(const q of [
        `CREATE TABLE IF NOT EXISTS card_pack_cards (pack_id TEXT NOT NULL, card_id TEXT NOT NULL, PRIMARY KEY(pack_id,card_id))`,
        `CREATE INDEX IF NOT EXISTS idx_card_pack_cards_card ON card_pack_cards(card_id)`
      ]) await env.DB.prepare(q).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v867','1',CURRENT_TIMESTAMP)").run();
    }
    const packCardsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v865'").first();
    if(packCardsDone?.value!=='1'){
      for(const q of [
        `ALTER TABLE cards ADD COLUMN draw_weight REAL NOT NULL DEFAULT 1`,
        `ALTER TABLE cards ADD COLUMN limited_total INTEGER`,
        `ALTER TABLE cards ADD COLUMN issued_count INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE cards ADD COLUMN card_status TEXT NOT NULL DEFAULT 'PUBLIC'`,
        `ALTER TABLE cards ADD COLUMN batch_name TEXT`,
        `ALTER TABLE cards ADD COLUMN batch_date TEXT`
      ]){try{await env.DB.prepare(q).run()}catch{}}
      const newCards=CARDS.filter(card=>{const n=Number(String(card.id).replace('card-',''));return n>=435&&n<=445});
      for(const card of newCards){
        await env.DB.prepare(`INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,0,1,null,'PENDING','2026 여름 신규 카드','2026-07-11').run();
      }
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v865','1',CURRENT_TIMESTAMP)").run();
    }
    const packPreviewDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v866'").first();
    if(packPreviewDone?.value!=='1'){
      await env.DB.prepare("UPDATE card_packs SET is_active=0 WHERE id='summer-new'").run();
      try{await env.DB.prepare("DELETE FROM card_pack_cards WHERE pack_id='summer-new'").run()}catch{}
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('pack_preview_configs','{}',CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v866','1',CURRENT_TIMESTAMP)").run();
    }
    const drawReceiptsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v964_draw_receipts'").first();
    if(drawReceiptsDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_request_receipts (
        request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        cost INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_request_receipts_user ON draw_request_receipts(user_id,created_at)').run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v964_draw_receipts','1',CURRENT_TIMESTAMP)").run();
    }

    const raidRewardReceiptsDone=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v979_raid_reward_receipts'").first();
    if(raidRewardReceiptsDone?.value!=='1'){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_reward_receipts (
        instance_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        reward_coin INTEGER NOT NULL DEFAULT 0,
        reward_shards INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(instance_id,user_id)
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_raid_reward_receipts_status ON raid_reward_receipts(status,updated_at)').run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v979_raid_reward_receipts','1',CURRENT_TIMESTAMP)").run();
    }

    const completed=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v848'").first();
    if(completed?.value==='1') return;

    const statements=[
      `CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, reward_coin INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, max_uses INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS coupon_redemptions (coupon_id INTEGER NOT NULL, user_id INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(coupon_id,user_id))`,
      `CREATE INDEX IF NOT EXISTS idx_coupon_code ON coupons(code)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at)`,
      `CREATE TABLE IF NOT EXISTS shard_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, change_amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT NOT NULL, card_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE INDEX IF NOT EXISTS idx_shard_logs_user ON shard_logs(user_id,created_at)`
    ];
    for(const q of statements) await env.DB.prepare(q).run();

    // 컬럼 추가만 허용. 이미 있으면 D1 오류를 무시한다.
    for(const q of [
      `ALTER TABLE users ADD COLUMN banned_until TEXT`,
      `ALTER TABLE users ADD COLUMN ban_reason TEXT`,
      `ALTER TABLE cards ADD COLUMN draw_weight REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE cards ADD COLUMN limited_total INTEGER`,
      `ALTER TABLE cards ADD COLUMN issued_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN card_shards INTEGER NOT NULL DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS draw_request_receipts (
        request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        cost INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_draw_request_receipts_user ON draw_request_receipts(user_id,created_at)`,
      `ALTER TABLE user_cards ADD COLUMN breakthrough_level INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE cards ADD COLUMN card_status TEXT NOT NULL DEFAULT 'PUBLIC'`,
      `ALTER TABLE cards ADD COLUMN batch_name TEXT`,
      `ALTER TABLE cards ADD COLUMN batch_date TEXT`
    ]){try{await env.DB.prepare(q).run()}catch{}}

    // 카드팩 설정은 최초 한 번만 보정한다.
    const packs=await env.DB.prepare('SELECT id,allowed_rarities FROM card_packs').all();
    for(const pack of packs.results){
      let allowed=[]; try{allowed=JSON.parse(pack.allowed_rarities||'[]')}catch{}
      for(const rarity of ['MA','FUR']) if(!allowed.includes(rarity)) allowed.push(rarity);
      allowed=allowed.filter(rarity=>rarity!=='LIMITED');
      if(pack.id==='pickup') allowed.push('LIMITED');
      await env.DB.prepare('UPDATE card_packs SET allowed_rarities=? WHERE id=?').bind(JSON.stringify(allowed),pack.id).run();
      await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'MA').run();
      await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'FUR').run();
      await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'LIMITED').run();
    }
    const allowed=['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'];
    await env.DB.prepare(`UPDATE card_packs SET name='리미티드팩',subtitle='LIMITED PACK',description='별도 확률로 서버 한정판 카드가 등장하는 특별 카드팩',allowed_rarities=?,pickup_member_id=NULL,pickup_multiplier=1 WHERE id='pickup'`).bind(JSON.stringify(allowed)).run();
    await env.DB.prepare("UPDATE card_pack_rates SET rate=0 WHERE rarity='LIMITED' AND pack_id<>'pickup'").run();
    await env.DB.prepare("INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES('pickup','LIMITED',1)").run();

    // 신규 멤버/카드는 없을 때만 등록하며 기존 공개·수정 상태는 덮어쓰지 않는다.
    for(const member of MEMBERS.filter(x=>x.sortOrder+1>=38)){
      await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
        .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
    }
    const newCards=CARDS.filter(card=>{const n=Number(String(card.id).replace('card-',''));return n>=377&&n<=434});
    for(let i=0;i<newCards.length;i+=25){
      const chunk=newCards.slice(i,i+25).map(card=>{
        const n=Number(String(card.id).replace('card-',''));
        const batch=n===434?'철구 최고등급 카드 추가':n>=416?'한정판 카드 추가':'채연·연두·여을·효짱 추가';
        return env.DB.prepare(`INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,0,card.drawWeight??1,card.limitedTotal??null,'PENDING',batch,'2026-07-10');
      });
      await env.DB.batch(chunk);
    }

    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v848','1',CURRENT_TIMESTAMP)").run();
  })().catch(error=>{upgradePromise=null;throw error});
  return upgradePromise;
}
function requestIp(request){return String(request.headers.get('CF-Connecting-IP')||request.headers.get('x-forwarded-for')||'').split(',')[0].trim()||'unknown'}
async function requestIpHash(request,env){return hash(`${requestIp(request)}|${env.IP_HASH_SALT||'CNINE-IP-SALT-CHANGE-ME'}`)}
async function wagoVerificationSettings(env){const base={enabled:true,postUrl:'',codeMinutes:20,checkCooldownSeconds:10};const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='wago_verification_settings_v1'").first();try{return {...base,...JSON.parse(row?.value||'{}')}}catch{return base}}
function makeVerificationCode(){return `CNINE-${crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase()}`}
function htmlText(v){return String(v||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
function parseYgosuPostUrl(raw){
  let url;try{url=new URL(String(raw||'').trim())}catch{return {ok:false,error:'CMS에 설정된 와고 인증 게시글 주소가 올바르지 않습니다.'}}
  const host=url.hostname.toLowerCase();
  if(host!=='ygosu.com'&&host!=='www.ygosu.com')return {ok:false,error:'인증 게시글은 ygosu.com 주소만 사용할 수 있습니다.'};
  url.protocol='https:';
  return {ok:true,url:url.toString()};
}
async function fetchWagoHtml(url,label){
  let response;
  try{response=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'ko-KR,ko;q=0.9'}})}
  catch{return {ok:false,error:`${label} 페이지에 연결할 수 없습니다.`}}
  if(!response.ok)return {ok:false,error:`${label} 페이지 확인 실패 (${response.status}). 와고가 외부 조회를 차단한 경우 잠시 후 다시 시도하세요.`};
  return {ok:true,html:await response.text(),finalUrl:response.url||url};
}
async function inspectWagoComment(settings,verification){
  const post=parseYgosuPostUrl(settings.postUrl);if(!post.ok)return post;
  const page=await fetchWagoHtml(post.url,'인증 게시글');if(!page.ok)return page;

  const code=String(verification.verification_code||'').trim();
  if(!code)return {ok:false,error:'발급된 인증코드를 확인할 수 없습니다. 새 코드를 발급하세요.'};
  const upper=page.html.toUpperCase(),pos=upper.indexOf(code.toUpperCase());
  if(pos<0)return {ok:false,error:'인증 게시글 댓글에서 발급된 인증코드를 찾지 못했습니다. 댓글 작성 후 잠시 뒤 다시 확인하세요.'};

  // 와고 댓글은 작성자 회원번호를 minilog 링크가 아니라
  // YG_COMMON.show_nick_dropdown($(this), '현재로그인회원', '댓글작성자회원', ...)의
  // 두 번째 숫자 인자로 노출한다. 인증코드가 들어간 정확한 댓글 <li>만 잘라서 확인한다.
  const commentMarker=page.html.lastIndexOf("<div class='comment'",pos);
  const commentMarkerDouble=page.html.lastIndexOf('<div class="comment"',pos);
  const marker=Math.max(commentMarker,commentMarkerDouble);
  let replyBlock='';
  if(marker>=0){
    const liStart=page.html.lastIndexOf('<li',marker);
    const liEnd=page.html.indexOf('</li>',pos);
    if(liStart>=0&&liEnd>pos)replyBlock=page.html.slice(liStart,liEnd+5);
  }
  if(!replyBlock){
    const radius=7000;
    replyBlock=page.html.slice(Math.max(0,pos-radius),Math.min(page.html.length,pos+radius));
  }

  const dropdown=/show_nick_dropdown\(\$\(this\),\s*['"](\d+)['"]\s*,\s*['"](\d+)['"]/i.exec(replyBlock);
  let memberNo=dropdown?String(dropdown[2]||'').replace(/\D/g,''):'';
  if(!memberNo){
    const fallbacks=[
      /open_minilog\(\s*['"](\d+)['"]/i,
      /(?:https?:\/\/(?:www\.)?ygosu\.com)?\/minilog\/\?[^"'<>\s]*?member=(\d+)/i,
      /data-(?:member|member-no|member-id|uid)=["']?(\d+)/i
    ];
    for(const re of fallbacks){const m=re.exec(replyBlock);if(m){memberNo=String(m[1]||'').replace(/\D/g,'');if(memberNo)break;}}
  }
  if(!memberNo)return {ok:false,error:'인증코드는 확인했지만 해당 댓글 작성자의 회원번호를 찾지 못했습니다. 댓글을 새로 작성한 뒤 다시 확인하세요.'};

  const nickname=String(verification.wago_nickname||'').trim();
  if(nickname){
    const nickMatch=/<div class=['"]nick['"][^>]*>[\s\S]*?<a[^>]*show_nick_dropdown[\s\S]*?>([\s\S]*?)<\/a>/i.exec(replyBlock);
    const authorNickname=nickMatch?htmlText(nickMatch[1]).replace(/^\S+\s+/,'').trim():'';
    if(authorNickname&&authorNickname!==nickname)return {ok:false,error:`인증코드는 확인했지만 댓글 작성자 닉네임(${authorNickname})과 입력한 닉네임이 일치하지 않습니다.`};
    if(!authorNickname&&!htmlText(replyBlock).includes(nickname))return {ok:false,error:'인증코드는 확인했지만 입력한 와고 닉네임과 댓글 작성자가 일치하지 않습니다.'};
  }

  return {ok:true,memberConfirmed:true,commentUrl:post.url,memberNo,notice:`댓글 인증코드와 작성자 회원번호(${memberNo})를 자동 확인하여 인증되었습니다.`};
}


async function wagoDailyQuestSettings(env){
  const base={enabled:true,boardUrl:'https://ygosu.com/board/soop',postEnabled:true,commentEnabled:true,requiredPosts:15,postRewardCoin:1200,rewardCoin:1200,requiredComments:20,commentRewardCoin:1250,maxPages:10,commentMaxPosts:100,checkCooldownSeconds:20,adminTestAllowed:true};
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='wago_daily_quest_settings_v1'").first();
  try{const v={...base,...JSON.parse(row?.value||'{}')};v.postRewardCoin=Number(v.postRewardCoin??v.rewardCoin??1200);v.rewardCoin=v.postRewardCoin;return v}catch{return base}
}
function parseWagoTodaySearchPosts(html,wagoNickname){
  const wanted=String(wagoNickname||'').trim();if(!wanted)return [];
  const blocks=String(html||'').match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  const ids=[];
  for(const block of blocks){
    const text=htmlText(block);
    // 와이고수 목록에서 오늘 작성글은 날짜 대신 HH:MM으로 표시된다.
    if(!/\b\d{1,2}:\d{2}\b/.test(text))continue;
    if(/공지|notice|fixed/i.test(block))continue;
    const post=/href=['"](?:https?:\/\/(?:www\.)?ygosu\.com)?\/board\/soop\/(\d+)(?:[^'"]*)?['"]/i.exec(block);
    if(!post)continue;
    // 작성자 검색 결과가 부분 일치로 섞일 경우를 막기 위해 행 안 작성자 닉네임도 확인한다.
    const nickMatch=/<(?:a|span)\b[^>]*(?:class=['"][^'"]*(?:nick|nickname|writer)[^'"]*['"]|onclick=['"][^'"]*show_nick_dropdown[^'"]*['"])[^>]*>([\s\S]*?)<\/(?:a|span)>/i.exec(block);
    if(nickMatch){
      const rowNick=htmlText(nickMatch[1]).trim();
      if(rowNick&&rowNick!==wanted)continue;
    }
    ids.push(post[1]);
  }
  return [...new Set(ids)];
}
async function inspectWagoDailyPosts(settings,wagoNickname){
  const nickname=String(wagoNickname||'').trim();
  if(!nickname)return {ok:false,error:'인증된 와고 닉네임이 없습니다.'};
  const boardUrl=settings.boardUrl||'https://ygosu.com/board/soop';
  const base=parseYgosuPostUrl(boardUrl);if(!base.ok)return base;
  const all=new Set(),maxPages=Math.max(1,Math.min(20,Number(settings.maxPages)||10));
  for(let page=1;page<=maxPages;page++){
    const u=new URL(base.url);
    u.searchParams.set('best_article','N');
    u.searchParams.set('s_category','');
    u.searchParams.set('searcht','w');
    u.searchParams.set('add_search_log','Y');
    u.searchParams.set('search',nickname);
    if(page>1)u.searchParams.set('page',String(page));
    const result=await fetchWagoHtml(u.toString(),'SOOP 작성자 검색');if(!result.ok)return result;
    const ids=parseWagoTodaySearchPosts(result.html,nickname);ids.forEach(id=>all.add(id));
    if(all.size>=Number(settings.requiredPosts||15))break;
    // 검색 결과가 더 이상 없으면 불필요한 추가 요청을 중단한다.
    if(ids.length===0)break;
  }
  return {ok:true,postCount:all.size,postIds:[...all]};
}

function parseWagoTodayBoardPostIds(html){
  const blocks=String(html||'').match(/<tr\b[\s\S]*?<\/tr>/gi)||[],ids=[];
  for(const block of blocks){
    if(!/\b\d{1,2}:\d{2}\b/.test(htmlText(block)))continue;
    if(/공지|notice|fixed/i.test(block))continue;
    const post=/href=['"](?:https?:\/\/(?:www\.)?ygosu\.com)?\/board\/soop\/(\d+)(?:[^'"]*)?['"]/i.exec(block);
    if(post)ids.push(post[1]);
  }
  return [...new Set(ids)];
}
function parseWagoTodayComments(html,memberNo,postId){
  const wanted=String(memberNo||'').replace(/\D/g,'');if(!wanted)return [];
  const blocks=String(html||'').match(/<(?:div|li)\b[^>]*(?:id=['"]reply[_-]?\d+['"]|class=['"][^'"]*(?:reply|comment)[^'"]*['"])[^>]*>[\s\S]*?(?=<(?:div|li)\b[^>]*(?:id=['"]reply[_-]?\d+['"]|class=['"][^'"]*(?:reply|comment)[^'"]*['"])|$)/gi)||[];
  const ids=[];
  for(const block of blocks){
    const dropdown=/show_nick_dropdown\(\$\(this\),\s*['"]\d+['"]\s*,\s*['"](\d+)['"]/i.exec(block);
    if(!dropdown||String(dropdown[1]).replace(/\D/g,'')!==wanted)continue;
    const text=htmlText(block);
    if(!/\b\d{1,2}:\d{2}\b/.test(text)&&!/\b오늘\b/.test(text))continue;
    const rid=/(?:id=['"]reply[_-]?|data-(?:reply|comment)-id=['"])(\d+)/i.exec(block);
    ids.push(`${postId}:${rid?.[1]||crypto.randomUUID().slice(0,8)}`);
  }
  return [...new Set(ids)];
}
async function inspectWagoDailyComments(settings,memberNo){
  const base=parseYgosuPostUrl(settings.boardUrl||'https://ygosu.com/board/soop');if(!base.ok)return base;
  const required=Math.max(1,Number(settings.requiredComments)||20),maxPosts=Math.max(20,Math.min(200,Number(settings.commentMaxPosts)||100));
  const boardIds=[],pageLimit=Math.max(1,Math.min(10,Math.ceil(maxPosts/30)));
  for(let page=1;page<=pageLimit&&boardIds.length<maxPosts;page++){
    const u=new URL(base.url);if(page>1)u.searchParams.set('page',String(page));
    const result=await fetchWagoHtml(u.toString(),'SOOP 게시판');if(!result.ok)return result;
    parseWagoTodayBoardPostIds(result.html).forEach(id=>{if(!boardIds.includes(id)&&boardIds.length<maxPosts)boardIds.push(id)});
  }
  const found=new Set();
  for(const postId of boardIds){
    const result=await fetchWagoHtml(`https://ygosu.com/board/soop/${postId}`,'SOOP 게시글 댓글');if(!result.ok)continue;
    parseWagoTodayComments(result.html,memberNo,postId).forEach(id=>found.add(id));
    if(found.size>=required)break;
  }
  return {ok:true,commentCount:found.size,commentIds:[...found],scannedPosts:boardIds.length};
}
function dailyQuestAdminExcluded(user,settings){
  const role=String(user?.role||'USER').toUpperCase();
  return ['OWNER','ADMIN'].includes(role)&&settings.adminTestAllowed===false;
}

async function writeAdminLog(env,admin,action,targetType,targetId,before=null,after=null){
  await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
    .bind(admin.id,action,targetType,String(targetId??''),before?JSON.stringify(before):null,after?JSON.stringify(after):null).run();
}
async function seedDatabase(env){
  for(const member of MEMBERS){
    await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
      .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
  }
  for(let i=0;i<CARDS.length;i+=40){
    const chunk=CARDS.slice(i,i+40).map(card=>env.DB.prepare('INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,card.status==='PENDING'?0:1,card.drawWeight??1,card.limitedTotal??null,card.status||'PUBLIC',card.batchName||null,card.batchDate||null));
    await env.DB.batch(chunk);
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_pack_cards (pack_id TEXT NOT NULL, card_id TEXT NOT NULL, PRIMARY KEY(pack_id,card_id))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_card_pack_cards_card ON card_pack_cards(card_id)`).run();
  for(const pack of PACKS){
    await env.DB.prepare(`INSERT OR REPLACE INTO card_packs(id,name,subtitle,description,theme,price,allowed_rarities,guarantee_10,guarantee_20,pickup_member_id,pickup_multiplier,is_active,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(pack.id,pack.name,pack.subtitle,pack.description,pack.theme,pack.price,JSON.stringify(pack.allowed),pack.guarantee10,pack.guarantee20,pack.pickupMemberId,pack.pickupMultiplier,1,pack.sortOrder).run();
    for(const [rarity,rate] of Object.entries(RATES)){
      await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(pack.id,rarity,(pack.id==='pickup'&&rarity==='LIMITED')?1:rate).run();
    }
    if(Array.isArray(pack.cardIds)&&pack.cardIds.length){
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS card_pack_cards (pack_id TEXT NOT NULL, card_id TEXT NOT NULL, PRIMARY KEY(pack_id,card_id))`).run();
      for(const cardId of pack.cardIds) await env.DB.prepare('INSERT OR IGNORE INTO card_pack_cards(pack_id,card_id) VALUES(?,?)').bind(pack.id,cardId).run();
    }
  }
}
async function authenticate(request,env){
  const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!raw) return null;
  const tokenHash=await hash(raw);
  const user=await env.DB.prepare(`SELECT u.*,s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`).bind(tokenHash).first();
  if(!user)return null;
  const expiresMs=Date.parse(String(user.session_expires_at||'').replace(' ','T')+'Z');
  if(Number.isFinite(expiresMs)&&expiresMs-Date.now()<=7*24*60*60*1000){
    const extended=new Date(Date.now()+30*24*60*60*1000).toISOString();
    await env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind(extended,tokenHash).run();
    user.session_expires_at=extended;
  }
  return user;
}
async function makeSession(env,userId){
  const raw=createToken();
  const tokenHash=await hash(raw);
  const expiresAt=new Date(Date.now()+1000*60*60*24*30).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,userId,expiresAt).run();
  return raw;
}
async function profile(env,user){
  const owned=await env.DB.prepare("SELECT uc.card_id,uc.quantity,uc.first_obtained_at,uc.breakthrough_level FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')").bind(user.id).all();
  const attendance=await env.DB.prepare('SELECT attendance_date,COALESCE(streak_day,1) AS streak_day FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC LIMIT 1').bind(user.id).first();
  const totalAttendance=await env.DB.prepare('SELECT COUNT(*) count FROM attendance_logs WHERE user_id=?').bind(user.id).first();
  const recent=await env.DB.prepare(`SELECT d.card_id AS cardId,d.is_new,c.title,c.rarity,d.created_at AS at
    FROM draw_logs d JOIN cards c ON c.id=d.card_id WHERE d.user_id=? ORDER BY d.id DESC LIMIT 30`).bind(user.id).all();
  return {id:user.id,nickname:user.nickname,coin:user.coin,cardShards:Number(user.card_shards||0),role:user.role,
    owned:owned.results.map(row=>row.card_id),
    quantities:Object.fromEntries(owned.results.map(row=>[row.card_id,row.quantity])),
    breakthroughs:Object.fromEntries(owned.results.map(row=>[row.card_id,Number(row.breakthrough_level||0)])),
    history:recent.results.reverse().map(row=>({cardId:row.cardId,at:row.at,duplicate:!row.is_new,title:row.title,grade:row.rarity})),
    attendance:{lastClaimDate:attendance?.attendance_date||null,totalDays:totalAttendance?.count||0,streak:Number(attendance?.streak_day||0),settings:await attendanceSettings(env)},breakthroughConfig:await breakthroughConfig(env)};
}
function weightedPick(items,getWeight){
  const total=items.reduce((sum,item)=>sum+getWeight(item),0);
  let roll=Math.random()*total;
  for(const item of items){roll-=getWeight(item);if(roll<0)return item}
  return items.at(-1);
}
async function drawLimitedCard(env){
  const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
    FROM cards c JOIN members m ON m.id=c.member_id
    WHERE c.is_active=1 AND c.draw_weight>0 AND c.limited_total IS NOT NULL AND c.issued_count<c.limited_total`).all()).results;
  return weightedPick(pool,row=>Number(row.draw_weight)||0)||null;
}
async function drawOne(env,pack,minimum=null,allowLimited=true,criticalBonus=0){
  // 리미티드팩의 한정판 확률은 일반 등급 100% 합계와 별도로 먼저 판정한다.
  if(allowLimited&&pack.id==='pickup'&&!minimum){
    const limitedRateRow=await env.DB.prepare("SELECT rate FROM card_pack_rates WHERE pack_id=? AND rarity='LIMITED'").bind(pack.id).first();
    const limitedRate=Math.max(0,Math.min(100,Number(limitedRateRow?.rate)||0));
    if(limitedRate>0&&Math.random()*100<limitedRate){
      const limitedCard=await drawLimitedCard(env);
      if(limitedCard) return limitedCard;
    }
  }
  let allowed=JSON.parse(pack.allowed_rarities).filter(rarity=>RARITIES.includes(rarity)&&rarity!=='LIMITED');
  if(minimum) allowed=allowed.filter(rarity=>ORDER[rarity]>=ORDER[minimum]);
  if(!allowed.length) throw new Error('이 카드팩에 설정된 일반 등급이 없습니다.');
  const placeholders=allowed.map(()=>'?').join(',');
  let rates=(await env.DB.prepare(`SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rarity IN (${placeholders}) AND rate>0`).bind(pack.id,...allowed).all()).results;
  if(criticalBonus>0) rates=applyCriticalRateBonus(rates,criticalBonus);
  if(!rates.length) throw new Error('이 카드팩에 설정된 일반 카드 확률이 없습니다.');
  for(let attempt=0;attempt<20;attempt++){
    const selectedRarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
    const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
      FROM cards c JOIN members m ON m.id=c.member_id
      WHERE c.is_active=1 AND c.rarity=? AND c.draw_weight>0 AND c.limited_total IS NULL
        AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?)
          OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(selectedRarity,pack.id,pack.id).all()).results;
    if(!pool.length) continue;
    const card=weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1));
    if(card) return card;
  }
  throw new Error('현재 뽑을 수 있는 일반 카드가 없습니다. 카드 및 확률 설정을 확인하세요.');
}


async function loadDrawContext(env,pack){
  const allowed=JSON.parse(pack.allowed_rarities).filter(rarity=>RARITIES.includes(rarity)&&rarity!=='LIMITED');
  const rateRows=(await env.DB.prepare("SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rate>0").bind(pack.id).all()).results;
  const normalCards=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
    FROM cards c JOIN members m ON m.id=c.member_id
    WHERE c.is_active=1 AND c.draw_weight>0 AND c.limited_total IS NULL
      AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?)
        OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(pack.id,pack.id).all()).results;
  const limitedCards=pack.id==='pickup'?(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
    FROM cards c JOIN members m ON m.id=c.member_id
    WHERE c.is_active=1 AND c.draw_weight>0 AND c.limited_total IS NOT NULL AND c.issued_count<c.limited_total`).all()).results:[];
  const poolsByGrade=new Map();
  for(const card of normalCards){
    const grade=String(card.grade||'');
    if(!poolsByGrade.has(grade))poolsByGrade.set(grade,[]);
    poolsByGrade.get(grade).push(card);
  }
  return {
    allowed,
    rateRows,
    limitedRate:Math.max(0,Math.min(100,Number(rateRows.find(row=>row.rarity==='LIMITED')?.rate)||0)),
    limitedCards,
    poolsByGrade
  };
}
function drawNormalFromContext(ctx,pack,rarity){
  const pool=ctx.poolsByGrade.get(rarity)||[];
  return weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1))||null;
}
function drawOneFromContext(ctx,pack,minimum=null,allowLimited=true,criticalBonus=0){
  if(allowLimited&&pack.id==='pickup'&&!minimum&&ctx.limitedRate>0&&Math.random()*100<ctx.limitedRate){
    const limitedCard=weightedPick(ctx.limitedCards,row=>Number(row.draw_weight)||0);
    if(limitedCard)return limitedCard;
  }
  let allowed=ctx.allowed;
  if(minimum)allowed=allowed.filter(rarity=>ORDER[rarity]>=ORDER[minimum]);
  if(!allowed.length)throw new Error('이 카드팩에 설정된 일반 등급이 없습니다.');
  let rates=ctx.rateRows.filter(row=>allowed.includes(row.rarity)&&row.rarity!=='LIMITED'&&Number(row.rate)>0);
  if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
  if(!rates.length)throw new Error('이 카드팩에 설정된 일반 카드 확률이 없습니다.');
  for(let attempt=0;attempt<20;attempt++){
    const selectedRarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
    const card=selectedRarity&&drawNormalFromContext(ctx,pack,selectedRarity);
    if(card)return card;
  }
  throw new Error('현재 뽑을 수 있는 일반 카드가 없습니다. 카드 및 확률 설정을 확인하세요.');
}
function drawOneWithPityFromContext(ctx,pack,ssrRate,criticalBonus=0){
  if(pack.id==='pickup'&&ctx.limitedRate>0&&Math.random()*100<ctx.limitedRate){
    const limitedCard=weightedPick(ctx.limitedCards,row=>Number(row.draw_weight)||0);
    if(limitedCard)return limitedCard;
  }
  const allowed=ctx.allowed;
  if(ssrRate!==null&&allowed.includes('SSR')){
    if(Math.random()*100<ssrRate){
      const ssr=drawNormalFromContext(ctx,pack,'SSR');
      if(ssr)return ssr;
    }
    const others=allowed.filter(rarity=>rarity!=='SSR');
    let rates=ctx.rateRows.filter(row=>others.includes(row.rarity)&&row.rarity!=='LIMITED'&&Number(row.rate)>0);
    if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
    for(let attempt=0;attempt<20;attempt++){
      const rarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
      const card=rarity&&drawNormalFromContext(ctx,pack,rarity);
      if(card)return card;
    }
  }
  return drawOneFromContext(ctx,pack,null,false,criticalBonus);
}


const PITY_PACKS=new Set(['premium','pickup']);
const DEFAULT_PITY_RATES={61:10,62:15,63:20,64:25,65:30,66:35,67:40,68:45,69:50,70:100};
function defaultPitySettings(){return {premium:{enabled:true,start:61,hard:70,rates:{...DEFAULT_PITY_RATES}},pickup:{enabled:true,start:61,hard:70,rates:{...DEFAULT_PITY_RATES}}};}
function cleanPityPackConfig(raw,base){
  const start=Math.max(1,Math.min(999,Math.floor(Number(raw?.start??base.start))));
  const hard=Math.max(start,Math.min(999,Math.floor(Number(raw?.hard??base.hard))));
  const rates={};
  for(let n=start;n<=hard;n++) rates[n]=n===hard?100:Math.max(0,Math.min(100,Number(raw?.rates?.[n]??base.rates?.[n]??0)));
  return {enabled:raw?.enabled!==false,start,hard,rates};
}
function cleanPitySettings(raw){const base=defaultPitySettings();return {premium:cleanPityPackConfig(raw?.premium,base.premium),pickup:cleanPityPackConfig(raw?.pickup,base.pickup)};}
async function pitySettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pack_pity_settings_v1'").first();try{return cleanPitySettings(JSON.parse(row?.value||'{}'))}catch{return defaultPitySettings()}}
async function packPityCount(env,userId,packId){if(!PITY_PACKS.has(packId))return 0;const row=await env.DB.prepare('SELECT miss_count FROM user_pack_pity WHERE user_id=? AND pack_id=?').bind(userId,packId).first();return Math.max(0,Number(row?.miss_count||0));}
async function savePackPity(env,userId,packId,count){if(!PITY_PACKS.has(packId))return;await env.DB.prepare(`INSERT INTO user_pack_pity(user_id,pack_id,miss_count,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,pack_id) DO UPDATE SET miss_count=excluded.miss_count,updated_at=CURRENT_TIMESTAMP`).bind(userId,packId,Math.max(0,Math.floor(count))).run();}
function pityRateForDraw(settings,packId,missCount){const cfg=settings?.[packId];const drawNo=Number(missCount||0)+1;if(!cfg?.enabled)return {drawNo,rate:null};return {drawNo,rate:Number(cfg.rates?.[drawNo]??(drawNo>=cfg.hard?100:null))};}
async function drawNormalCardByRarity(env,pack,rarity){const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count FROM cards c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND c.rarity=? AND c.draw_weight>0 AND c.limited_total IS NULL AND (NOT EXISTS (SELECT 1 FROM card_pack_cards p0 WHERE p0.pack_id=?) OR EXISTS (SELECT 1 FROM card_pack_cards p1 WHERE p1.pack_id=? AND p1.card_id=c.id))`).bind(rarity,pack.id,pack.id).all()).results;return weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1))||null;}
async function drawOneWithPity(env,pack,ssrRate,criticalBonus=0){
  if(pack.id==='pickup'){
    const limitedRateRow=await env.DB.prepare("SELECT rate FROM card_pack_rates WHERE pack_id=? AND rarity='LIMITED'").bind(pack.id).first();
    const limitedRate=Math.max(0,Math.min(100,Number(limitedRateRow?.rate)||0));
    if(limitedRate>0&&Math.random()*100<limitedRate){const limitedCard=await drawLimitedCard(env);if(limitedCard)return limitedCard;}
  }
  const allowed=JSON.parse(pack.allowed_rarities).filter(r=>RARITIES.includes(r)&&r!=='LIMITED');
  if(ssrRate!==null&&allowed.includes('SSR')){
    if(Math.random()*100<ssrRate){const ssr=await drawNormalCardByRarity(env,pack,'SSR');if(ssr)return ssr;}
    const others=allowed.filter(r=>r!=='SSR'),marks=others.map(()=>'?').join(',');
    let rates=(await env.DB.prepare(`SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rarity IN (${marks}) AND rate>0`).bind(pack.id,...others).all()).results;
    if(criticalBonus>0)rates=applyCriticalRateBonus(rates,criticalBonus);
    for(let i=0;i<20;i++){const rarity=weightedPick(rates,r=>Number(r.rate)||0)?.rarity,card=rarity&&await drawNormalCardByRarity(env,pack,rarity);if(card)return card;}
  }
  return drawOne(env,pack,null,false,criticalBonus);
}
async function grantBattleCard(env,userId,settings){
  const configured=settings.cardDrop?.gradeRates||defaultBattleSettings().cardDrop.gradeRates;
  const available=(await env.DB.prepare(`SELECT c.rarity,COUNT(*) AS cnt FROM cards c WHERE c.is_active=1 AND c.card_status='PUBLIC' AND c.limited_total IS NULL AND c.rarity IN ('C','U','R','SR','HR','UR','SSR','MA','FUR') GROUP BY c.rarity`).all()).results;
  const availableSet=new Set(available.filter(x=>Number(x.cnt)>0).map(x=>x.rarity));
  const gradePool=Object.entries(configured).filter(([grade,rate])=>availableSet.has(grade)&&Number(rate)>0).map(([grade,rate])=>({grade,rate:Number(rate)}));
  const pickedGrade=weightedPick(gradePool,row=>row.rate)?.grade;if(!pickedGrade)return null;
  const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY FROM cards c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND c.card_status='PUBLIC' AND c.limited_total IS NULL AND c.rarity=?`).bind(pickedGrade).all()).results;
  if(!pool.length)return null;const card=pool[Math.floor(Math.random()*pool.length)];
  const previous=await env.DB.prepare('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?').bind(userId,card.id).first(),isNew=!previous;
  await env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(userId,card.id).run();
  let shardGained=0;if(!isNew){shardGained=SHARD_REWARD[card.grade]||0;if(shardGained>0){await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardGained,userId).run();const u=await env.DB.prepare('SELECT card_shards FROM users WHERE id=?').bind(userId).first();await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'PVE_DUPLICATE',?)").bind(userId,shardGained,u.card_shards,card.id).run();}}
  return {card,duplicate:!isNew,shardGained};
}

async function criticalSettings(env){
  const keys=['critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects'];
  const rows=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const v=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
  return {
    enabled:String(v.critical_enabled??'1')==='1',
    minTaps:Math.max(1,Math.min(30,Number(v.critical_min_taps||5)||5)),
    chance:Math.max(0,Math.min(100,Number(v.critical_chance||3)||3)),
    bonus:Math.max(0,Math.min(100,Number(v.critical_bonus||10)||10)),
    effects:String(v.critical_effects??'1')==='1'
  };
}
function applyCriticalRateBonus(rates,bonus){
  const boosted=new Set(['SR','HR','UR','SSR','MA','FUR']);
  return rates.map(row=>({...row,rate:Number(row.rate||0)*(boosted.has(row.rarity)?1+bonus/100:1)}));
}

async function maintenanceSettings(env){
  const keys=['maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users'];
  const rows=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const values=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
  return {
    active:String(values.maintenance_mode||'0')==='1',
    title:values.maintenance_title||'씨켓몬 서버 점검 중',
    message:values.maintenance_message||'안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.',
    startAt:values.maintenance_start_at||'',
    endAt:values.maintenance_end_at||'',
    testUsers:String(values.maintenance_test_users||'').split(',').map(x=>x.trim()).filter(Boolean)
  };
}
function isAdminRole(user){return Boolean(user&&['OWNER','ADMIN'].includes(user.role))}
function canMaintenanceBypass(user,maintenance){return Boolean(isAdminRole(user)||(user&&maintenance?.testUsers?.includes(user.nickname)))}

async function requirePermission(request,env,permission){
  const user=await authenticate(request,env);
  if(!user||!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(user.role)) return null;
  if(['OWNER','ADMIN'].includes(user.role)) return user;
  const row=await env.DB.prepare('SELECT is_allowed FROM admin_permissions WHERE admin_user_id=? AND permission_key=?').bind(user.id,permission).first();
  return row?.is_allowed?user:null;
}

export async function onRequest(context){
  const {request,env}=context;
  const url=new URL(request.url);
  const path=url.pathname.replace(/^\/api\/?/,'');
  try{
    if(!env.DB) return json({error:'현재 서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.'},503);
    const evolutionResponse=await handleEvolution({path,request,env,deps:{authenticate,readBody,json,isAdminRole,profile,shardReward:SHARD_REWARD}});if(evolutionResponse)return evolutionResponse;
    const captainResponse=await handleCaptain({path,request,env,deps:{authenticate,readBody,json,isAdminRole,pvpDeckSnapshot,battleSettings,cardBattlePower}});if(captainResponse)return captainResponse;

    if(path==='health') return json({ok:true,version:'2.8.2',database:true,initialized:await initialized(env)});
    if(path==='setup/status') return json({initialized:await initialized(env),tables:await tableExists(env,'users')});
    if(path==='setup/init'&&request.method==='POST'){
      if(await initialized(env)) return json({error:'이미 초기화가 완료된 데이터베이스입니다.'},409);
      const payload=await readBody(request);
      if(!env.SETUP_KEY) return json({error:'Cloudflare 환경 변수 SETUP_KEY를 먼저 설정하세요.'},503);
      if((payload.setupKey||'')!==env.SETUP_KEY) return json({error:'설치 암호가 올바르지 않습니다.'},403);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'최고 관리자 닉네임을 입력하세요.'},400);
      await runSchema(env);
      await ensureUpgrades(env);
      await seedDatabase(env);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      const result=await env.DB.prepare("INSERT INTO users(nickname,private_key_hash,coin,role,status) VALUES(?,?,100000,'OWNER','ACTIVE')").bind(nickname,privateKeyHash).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('initialized','1',CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('version','2.0.0',CURRENT_TIMESTAMP)").run();
      const token=await makeSession(env,result.meta.last_row_id);
      return json({ok:true,privateKey,token,nickname,cards:CARDS.length,members:MEMBERS.length,packs:PACKS.length},201);
    }

    if(!await initialized(env)) return json({error:'데이터베이스 초기화가 필요합니다. /setup/에서 설치를 완료하세요.'},503);

    // 관리자 로그인은 일반 유저 profile() 생성과 런타임 업그레이드에 의존하지 않는다.
    // OWNER 계정의 카드/로그 데이터가 많아도 인증 자체가 지연되지 않도록 최소 정보만 반환한다.
    if(path==='admin/auth/login'&&request.method==='POST'){
      const payload=await readBody(request);
      const normalizedKey=String(payload.privateKey||'').trim().toUpperCase();
      if(!normalizedKey)return json({error:'관리자 개인키를 입력하세요.'},400);
      const privateKeyHash=await hash(normalizedKey);
      const admin=await env.DB.prepare("SELECT id,nickname,role,status,banned_until,ban_reason,last_login_at FROM users WHERE private_key_hash=?").bind(privateKeyHash).first();
      if(!admin)return json({error:'개인키가 올바르지 않습니다.'},401);
      const role=String(admin.role||'').trim().toUpperCase();
      if(!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(role))return json({error:'관리자 권한이 없는 계정입니다.'},403);
      if(admin.status!=='ACTIVE'||(admin.banned_until&&new Date(String(admin.banned_until).replace(' ','T')+'Z')>new Date())){
        return json({error:`이용이 정지된 계정입니다.${admin.ban_reason?' 사유: '+admin.ban_reason:''}`},403);
      }
      await env.DB.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(admin.id).run();
      const token=await makeSession(env,admin.id);
      return json({token,user:{id:admin.id,nickname:admin.nickname,role},admin:{id:admin.id,nickname:admin.nickname,role,last_login_at:new Date().toISOString()}});
    }

    await ensureUpgrades(env);

    if(path==='service/status'){
      const maintenance=await maintenanceSettings(env);
      const user=await authenticate(request,env);
      return json({maintenance,bypass:canMaintenanceBypass(user,maintenance),role:user?.role||null,user:user?{id:user.id,nickname:user.nickname,role:user.role}:null});
    }

    const maintenance=await maintenanceSettings(env);
    const maintenanceExempt=path.startsWith('admin/')||path==='auth/login'||path==='auth/logout'||path==='me'||path==='service/status'||path==='health'||path.startsWith('setup/');
    if(maintenance.active&&!maintenanceExempt){
      const current=await authenticate(request,env);
      if(!canMaintenanceBypass(current,maintenance)) return json({error:'현재 서버 점검 중입니다.',code:'MAINTENANCE',maintenance},503);
    }

    if(path==='auth/register'&&request.method==='POST'){
      const payload=await readBody(request);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'닉네임을 입력하세요.'},400);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      const ipHash=await requestIpHash(request,env);
      const existingIp=await env.DB.prepare('SELECT user_id FROM account_ip_registrations WHERE ip_hash=?').bind(ipHash).first();
      const ipException=await env.DB.prepare("SELECT ip_hash FROM account_ip_exceptions WHERE ip_hash=? AND (expires_at IS NULL OR expires_at>datetime('now'))").bind(ipHash).first();
      if(existingIp&&!ipException)return json({error:'해당 네트워크에서는 이미 씨켓몬 계정이 생성되었습니다. 계정 복구가 필요한 경우 관리자에게 문의해 주세요.',code:'IP_ACCOUNT_LIMIT'},409);
      try{
        const coinSetting=await env.DB.prepare("SELECT value FROM app_meta WHERE key='new_user_coin'").first();
        const newUserCoin=Math.max(0,Number(coinSetting?.value||5000)||5000);
        const result=await env.DB.prepare('INSERT INTO users(nickname,private_key_hash,coin) VALUES(?,?,?)').bind(nickname,privateKeyHash,newUserCoin).run();
        await env.DB.prepare('INSERT INTO account_ip_registrations(user_id,ip_hash) VALUES(?,?)').bind(result.meta.last_row_id,ipHash).run();
        const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(result.meta.last_row_id).first();
        return json({token:await makeSession(env,user.id),privateKey,user:await profile(env,user)},201);
      }catch(error){return json({error:String(error?.message||'').includes('account_ip')?'해당 네트워크에서는 이미 계정이 생성되었습니다.':'이미 사용 중인 닉네임입니다.'},409)}
    }
    if(path==='auth/login'&&request.method==='POST'){
      const payload=await readBody(request);
      const privateKeyHash=await hash((payload.privateKey||'').trim().toUpperCase());
      const user=await env.DB.prepare("SELECT * FROM users WHERE private_key_hash=?").bind(privateKeyHash).first();
      if(!user) return json({error:'개인키가 올바르지 않습니다.'},401);
      if(user.status!=='ACTIVE'||(user.banned_until&&new Date(user.banned_until+'Z')>new Date())) return json({error:`이용이 정지된 계정입니다.${user.ban_reason?' 사유: '+user.ban_reason:''}`},403);
      const currentMaintenance=await maintenanceSettings(env);
      await env.DB.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
      return json({token:await makeSession(env,user.id),user:await profile(env,user),maintenance:currentMaintenance.active&&!canMaintenanceBypass(user,currentMaintenance)?currentMaintenance:null,bypass:canMaintenanceBypass(user,currentMaintenance)});
    }
    if(path==='auth/logout'&&request.method==='POST'){
      const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
      if(raw){
        const tokenHash=await hash(raw);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
      }
      return json({ok:true});
    }
    if(path==='me'){
      const user=await authenticate(request,env);
      return user?json({user:await profile(env,user)}):json({error:'로그인이 필요합니다.'},401);
    }
    if(path==='cards'){
      const rows=await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,c.card_status AS retirementStatus,c.power_type AS powerType,c.base_power AS basePower
        FROM cards c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 ORDER BY m.sort_order,c.id`).all();
      return json({cards:rows.results});
    }
    if(path==='packs'){
      const rows=await env.DB.prepare('SELECT * FROM card_packs WHERE is_active=1 ORDER BY sort_order,id').all();
      return json({packs:rows.results.map(row=>({...row,allowed:JSON.parse(row.allowed_rarities)}))});
    }
    if(path==='attendance/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const cfg=await attendanceSettings(env);if(!cfg.enabled)return json({error:'현재 출석체크가 중지되어 있습니다.'},503);
      const date=kstDate(),last=await env.DB.prepare('SELECT attendance_date,COALESCE(streak_day,1) AS streak_day FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC LIMIT 1').bind(user.id).first();
      const streak=last?.attendance_date===previousKstDate(date)?(Number(last.streak_day||1)%7)+1:1,reward=Number(cfg.rewards[streak-1]||0);
      try{await env.DB.prepare('INSERT INTO attendance_logs(user_id,attendance_date,reward_coin,streak_day) VALUES(?,?,?,?)').bind(user.id,date,reward,streak).run()}
      catch{return json({error:'오늘 접속 보상을 이미 받았습니다.'},409)}
      await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id).run();
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'ATTENDANCE')").bind(user.id,reward,updated.coin).run();
      return json({reward,streak,user:await profile(env,updated)});
    }
    if(path==='draw'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const requestId=String(payload.requestId||crypto.randomUUID()).trim().slice(0,100);
      const count=[1,10,20].includes(Number(payload.count))?Number(payload.count):1;
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draw_request_receipts (
        request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        cost INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_draw_request_receipts_user ON draw_request_receipts(user_id,created_at)').run();
      const prior=await env.DB.prepare('SELECT status,response_json FROM draw_request_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      if(prior?.status==='COMPLETED'&&prior.response_json){
        try{return json(JSON.parse(prior.response_json))}catch{}
      }
      if(prior?.status==='PENDING')return json({error:'같은 카드 개봉 요청을 처리 중입니다. 잠시만 기다려주세요.',requestId},409);
      if(prior?.status==='FAILED')await env.DB.prepare('DELETE FROM draw_request_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).run();
      const claimed=await env.DB.prepare("INSERT OR IGNORE INTO draw_request_receipts(request_id,user_id,status) VALUES(?,?,'PENDING')").bind(requestId,user.id).run();
      if(!claimed.meta.changes){
        const duplicate=await env.DB.prepare('SELECT status,response_json FROM draw_request_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
        if(duplicate?.status==='COMPLETED'&&duplicate.response_json){try{return json(JSON.parse(duplicate.response_json))}catch{}}
        return json({error:'같은 카드 개봉 요청을 처리 중입니다. 잠시만 기다려주세요.',requestId},409);
      }
      let charged=false,grantsCommitted=false,cost=0,reservedCardIds=[];
      try{
      const criticalConfig=await criticalSettings(env);
      const criticalEligible=criticalConfig.enabled===true;
      const critical=criticalEligible&&Math.random()*100<criticalConfig.chance;
      const criticalBonus=critical?criticalConfig.bonus:0;
      const pack=await env.DB.prepare('SELECT * FROM card_packs WHERE id=? AND is_active=1').bind(payload.packId).first();
      if(!pack) return json({error:'판매 중인 카드팩이 아닙니다.'},404);
      const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      cost=pack.price*count;
      await env.DB.prepare('UPDATE draw_request_receipts SET cost=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?').bind(cost,requestId).run();
      if(fresh.coin<cost) return json({error:'코인이 부족합니다.'},400);
      const [drawContext,pityCountStart,livePitySettings]=await Promise.all([
        loadDrawContext(env,pack),
        packPityCount(env,user.id,pack.id),
        pitySettings(env)
      ]);
      const cards=[];let pityCount=pityCountStart;
      for(let index=0;index<count;index++){
        const pity=pityRateForDraw(livePitySettings,pack.id,pityCount);
        const card=PITY_PACKS.has(pack.id)
          ?drawOneWithPityFromContext(drawContext,pack,pity.rate,criticalBonus)
          :drawOneFromContext(drawContext,pack,null,true,criticalBonus);
        cards.push(card);
        pityCount=ORDER[card.grade]>=ORDER.SSR?0:pityCount+1;
      }
      const guarantee=count===10?pack.guarantee_10:count===20?pack.guarantee_20:null;
      if(guarantee&&!cards.some(card=>ORDER[card.grade]>=ORDER[guarantee])){
        cards[cards.length-1]=drawOneFromContext(drawContext,pack,guarantee,true,criticalBonus);
        if(PITY_PACKS.has(pack.id)&&ORDER[cards[cards.length-1].grade]>=ORDER.SSR){pityCount=0;await savePackPity(env,user.id,pack.id,0);}
      }
      cards.sort((a,b)=>ORDER[b.grade]-ORDER[a.grade]);
      const debit=await env.DB.prepare('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?').bind(cost,user.id,cost).run();
      if(!debit.meta.changes){
        await env.DB.prepare("UPDATE draw_request_receipts SET status='FAILED',error_message='코인이 부족합니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(requestId).run();
        return json({error:'코인이 부족합니다.'},400);
      }
      charged=true;
      await savePackPity(env,user.id,pack.id,pityCount);
      const groupId=crypto.randomUUID();
      // 한정판 수량 예약은 동시성 보호를 위해 개별 처리하되,
      // 일반 보유카드/로그 저장은 아래에서 한 번의 D1 batch로 묶는다.
      for(let i=0;i<cards.length;i++){
        let card=cards[i];
        if(card.limited_total!==null&&card.limited_total!==undefined){
          const reserved=await env.DB.prepare('UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND issued_count<limited_total').bind(card.id).run();
          if(!reserved.meta.changes)card=drawOneFromContext(drawContext,pack,null,false,criticalBonus);
          else reservedCardIds.push(card.id);
          cards[i]=card;
        }
      }
      const uniqueIds=[...new Set(cards.map(card=>String(card.id)))];
      const ownedRows=uniqueIds.length?(await env.DB.prepare(`SELECT card_id,quantity FROM user_cards WHERE user_id=? AND card_id IN (${uniqueIds.map(()=>'?').join(',')})`).bind(user.id,...uniqueIds).all()).results:[];
      const ownedMap=new Map(ownedRows.map(row=>[String(row.card_id),Number(row.quantity||0)]));
      const statements=[];
      const results=[];
      let shardTotal=0;
      let runningShardBalance=Number(fresh.card_shards||0);
      for(let drawIndex=0;drawIndex<cards.length;drawIndex++){const card=cards[drawIndex];
        const cardId=String(card.id),previousQty=Number(ownedMap.get(cardId)||0),isNew=previousQty===0;
        ownedMap.set(cardId,previousQty+1);
        const shardGained=isNew?0:Number(SHARD_REWARD[card.grade]||0);
        shardTotal+=shardGained;
        statements.push(env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1)
          ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,card.id));
        if(shardGained>0){
          runningShardBalance+=shardGained;
          statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'DUPLICATE',?)").bind(user.id,shardGained,runningShardBalance,card.id));
        }
        statements.push(env.DB.prepare('INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,?,?,?,?,?)').bind(groupId,user.id,pack.id,card.id,card.grade,drawIndex===0?cost:0,isNew?1:0));
        results.push({card,duplicate:!isNew,shardGained});
      }
      if(shardTotal>0)statements.unshift(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardTotal,user.id));
      statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PACK_DRAW')").bind(user.id,-cost,Number(fresh.coin)-cost));
      if(statements.length)await env.DB.batch(statements);
      grantsCommitted=true;
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      const response={results,user:await profile(env,updated),pity:PITY_PACKS.has(pack.id)?{packId:pack.id,missCount:pityCount,nextDraw:pityCount+1}:null,critical:{eligible:criticalEligible,success:critical,bonus:criticalBonus,automatic:true,chance:criticalConfig.chance,effects:criticalConfig.effects},requestId};
      await env.DB.prepare("UPDATE draw_request_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(JSON.stringify(response),requestId,user.id).run();
      return json(response);
      }catch(error){
        const message=String(error?.message||'카드 개봉 처리 중 오류가 발생했습니다.').slice(0,300);
        if(!grantsCommitted){
          if(charged)await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(cost,user.id).run();
          for(const cardId of reservedCardIds){
            await env.DB.prepare('UPDATE cards SET issued_count=CASE WHEN issued_count>0 THEN issued_count-1 ELSE 0 END WHERE id=?').bind(cardId).run();
          }
          await env.DB.prepare("UPDATE draw_request_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(message,requestId,user.id).run();
        }else{
          await env.DB.prepare("UPDATE draw_request_receipts SET status='COMPLETED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?").bind(message,requestId,user.id).run();
        }
        throw error;
      }
    }

    if(path==='card/breakthrough'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const cardId=String(payload.cardId||'').trim();
      const owned=await env.DB.prepare(`SELECT uc.breakthrough_level,c.rarity,c.title FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=?`).bind(user.id,cardId).first();
      if(!owned) return json({error:'보유한 카드만 돌파할 수 있습니다.'},404);
      if((ORDER[owned.rarity]||0)<BREAKTHROUGH_MIN_ORDER) return json({error:'SR 등급 이상 카드만 돌파할 수 있습니다.'},400);
      const level=Number(owned.breakthrough_level||0);
      if(level>=10) return json({error:'이미 최대 돌파 단계입니다.'},409);
      const config=await breakthroughConfig(env),rule=config[owned.rarity]?.[level];
      if(!rule) return json({error:'돌파 설정을 찾을 수 없습니다.'},500);
      const cost=Number(rule.cost),rate=Number(rule.rate);
      const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      if(Number(fresh.card_shards||0)<cost) return json({error:`카드 조각이 부족합니다. (${cost}개 필요)`},400);
      const spent=await env.DB.prepare('UPDATE users SET card_shards=card_shards-? WHERE id=? AND card_shards>=?').bind(cost,user.id,cost).run();
      if(!spent.meta.changes) return json({error:'카드 조각이 부족합니다.'},400);
      const success=Math.random()*100<rate;
      if(success) await env.DB.prepare('UPDATE user_cards SET breakthrough_level=breakthrough_level+1 WHERE user_id=? AND card_id=?').bind(user.id,cardId).run();
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,?,?)").bind(user.id,-cost,updated.card_shards,success?'BREAKTHROUGH_SUCCESS':'BREAKTHROUGH_FAIL',cardId).run();
      return json({ok:true,success,cost,rate,level:success?level+1:level,user:await profile(env,updated)});
    }


    if(path==='raid/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env),schedule=raidScheduleState(cfg,user),todayEntryCount=await raidDailyEntryCount(env,user.id),dailyEntryLimit=Math.max(1,Number(cfg.dailyEntries||1)),dailyEntry={count:todayEntryCount,limit:dailyEntryLimit,remaining:Math.max(0,dailyEntryLimit-todayEntryCount)};
      if(cfg.ownerOnlyTest&&user.role!=='OWNER')return json({error:'현재 레이드를 이용할 수 없습니다.'},403);
      const activeBefore=(await env.DB.prepare("SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id").all()).results;
      for(const room of activeBefore)await refreshRaidForOwner(env,room,cfg);
      const roomRows=(await env.DB.prepare("SELECT ri.id,ri.status,ri.starts_at AS startsAt,ri.ends_at AS endsAt,ri.participant_count AS participantCount,rb.name AS bossName,rb.image_url AS bossImage,rb.max_hp AS maxHp FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id DESC LIMIT 10").all()).results;
      const rooms=roomRows.map((room,i)=>({...room,roomNumber:roomRows.length-i,joinable:room.status==='LOBBY'&&Date.parse(room.startsAt)>Date.now()&&Number(room.participantCount)<Number(cfg.maxParticipants||30)}));
      const requestedId=Math.max(0,Number(new URL(request.url).searchParams.get('instanceId')||0));
      let current=await env.DB.prepare("SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id JOIN raid_participants rp ON rp.instance_id=ri.id AND rp.user_id=? AND COALESCE(rp.is_active,1)=1 WHERE ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id DESC LIMIT 1").bind(user.id).first();
      if(!current){current=await env.DB.prepare("SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id JOIN raid_participants rp ON rp.instance_id=ri.id AND rp.user_id=? AND COALESCE(rp.is_active,1)=1 WHERE ri.status='ENDED' AND rp.reward_claimed=0 AND NOT EXISTS (SELECT 1 FROM raid_room_cancellations rc WHERE rc.instance_id=ri.id AND rc.status='COMPLETED') ORDER BY ri.id DESC LIMIT 1").bind(user.id).first();}
      if(!current&&requestedId)current=await env.DB.prepare("SELECT ri.*,rb.name AS boss_name,rb.image_url AS boss_image,rb.max_hp,rb.defense_rate FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.id=? AND ri.status='LOBBY' LIMIT 1").bind(requestedId).first();
      if(!current){const policies=await raidBossOpenPolicies(env),bossRows=await env.DB.prepare('SELECT id,name,image_url AS image,max_hp AS maxHp,defense_rate AS defenseRate,sort_order AS sortOrder FROM raid_bosses WHERE is_active=1 ORDER BY sort_order,id').all();const availableBosses=bossRows.results.filter(b=>policies[String(b.id)]?.enabled).map(b=>({...b,openCost:Number(policies[String(b.id)]?.cost||0)}));return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,availableBosses,dailyEntryUsed:todayEntryCount>=dailyEntryLimit,dailyEntry,serverNow:new Date().toISOString()});}
      // 전투가 status 조회 도중 종료된 경우에도, 이미 정산한 OWNER에게 결과 화면을 다시 노출하지 않는다.
      if(current.status==='ENDED'){
        const cancelled=await env.DB.prepare("SELECT reason,refund_coin AS refundCoin,restored_entries AS restoredEntries FROM raid_room_cancellations WHERE instance_id=? AND status='COMPLETED'").bind(current.id).first();
        if(cancelled)return json({settings:cfg,schedule,current:null,rooms,participants:[],me:null,dailyEntryUsed:false,dailyEntry:{...dailyEntry,count:Math.max(0,dailyEntry.count-1),remaining:Math.min(dailyEntry.limit,dailyEntry.remaining+1)},cancelledRaid:{id:current.id,reason:cancelled.reason,refundCoin:Number(cancelled.refundCoin||0),entryRestored:true},serverNow:new Date().toISOString()});
        const myRaidState=await env.DB.prepare('SELECT reward_claimed AS rewardClaimed FROM raid_participants WHERE instance_id=? AND user_id=? AND COALESCE(is_active,1)=1 LIMIT 1').bind(current.id,user.id).first();
        if(Number(myRaidState?.rewardClaimed||0)===1){
          return json({settings:cfg,schedule,current:null,participants:[],me:null,serverNow:new Date().toISOString(),lastRaid:{id:current.id,rewardClaimed:true}});
        }
      }
      const rows=await env.DB.prepare(`SELECT rp.user_id AS userId,u.nickname,rp.deck_cards AS deckCards,rp.total_power AS totalPower,rp.total_damage AS totalDamage,rp.reward_claimed AS rewardClaimed,rp.joined_at AS joinedAt FROM raid_participants rp JOIN users u ON u.id=rp.user_id WHERE rp.instance_id=? AND COALESCE(rp.is_active,1)=1 ORDER BY rp.total_damage DESC,rp.joined_at`).bind(current.id).all();
      const participants=rows.results.map((r,i)=>({...r,rank:i+1,deckCards:(()=>{try{return JSON.parse(r.deckCards||'[]')}catch{return []}})()}));
      const cardIds=[...new Set(participants.flatMap(x=>x.deckCards))];let cardMap={};if(cardIds.length){const marks=cardIds.map(()=>'?').join(',');const cs=await env.DB.prepare(`SELECT id,title,image_url AS image,rarity AS grade FROM cards WHERE id IN (${marks})`).bind(...cardIds).all();cardMap=Object.fromEntries(cs.results.map(c=>[String(c.id),c]));}
      const startMs=Date.parse(current.starts_at||0),endMs=Date.parse(current.ends_at||0),now=Date.now();
      const progress=current.status==='BATTLE'?Math.max(0,Math.min(1,(now-startMs)/Math.max(1,endMs-startMs))):current.status==='ENDED'?1:0;
      const totalFinal=participants.reduce((n,x)=>n+Number(x.totalDamage||0),0),shownTotal=Math.floor(totalFinal*progress);
      const hp=Math.max(0,Number(current.max_hp||0)-shownTotal),bossHpPct=Number(current.max_hp||0)>0?hp/Number(current.max_hp):1;
      const elapsedMs=Math.max(0,Math.min(Math.max(0,endMs-startMs),now-startMs));
      const attackTicks=current.status==='LOBBY'?0:Math.max(0,Math.floor(elapsedMs/Math.max(500,Number(cfg.bossAttackIntervalMs||5000))));
      const rage=cfg.enrageEnabled&&bossHpPct*100<=Number(cfg.enrageHpPercent||30)?Number(cfg.enrageMultiplier||1.6):1;
      const enriched=participants.map(x=>{const maxHp=Math.max(1,Math.floor(Number(x.totalPower||0)*Number(cfg.deckHpMultiplier||12)));const variance=1+(((Number(x.userId||0)%31)-15)/100)*(Number(cfg.bossAttackVariance||0)/15);const taken=Math.floor(attackTicks*Number(cfg.bossAttackPower||850)*variance*rage);const currentHp=Math.max(0,maxHp-taken);return {...x,shownDamage:Math.floor(Number(x.totalDamage||0)*progress),maxHp,currentHp,isDefeated:currentHp<=0,cards:x.deckCards.map(id=>cardMap[String(id)]).filter(Boolean)};});
      const allDefeated=enriched.length>0&&enriched.every(x=>x.isDefeated),cleared=hp<=0;
      // HP가 먼저 0이 되어도 설정된 전투 종료 시각까지 전투 화면을 유지한다.
      // 최종 CLEAR / FAILED / TIMEOUT 판정은 타이머 종료 후 한 번만 확정한다.
      if(current.status==='BATTLE'&&now>=endMs){await env.DB.prepare("UPDATE raid_instances SET status='ENDED',current_hp=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(hp,current.id).run();current.status='ENDED';}
      const result=cleared?'CLEAR':allDefeated?'FAILED':'TIMEOUT';
      const me=enriched.find(x=>Number(x.userId)===Number(user.id))||null;
      // 대기실 이후의 전투·결과 정보는 실제 참가자에게만 공개한다.
      if(current.status!=='LOBBY'&&!me){
        return json({settings:cfg,schedule,dailyEntryUsed:todayEntryCount>=dailyEntryLimit,dailyEntry,rooms,current:{id:current.id,status:current.status,startsAt:current.starts_at,endsAt:current.ends_at,participantCount:participants.length},participants:[],me:null,claimableReward:null,raidAccess:'NOT_PARTICIPANT',serverNow:new Date().toISOString()});
      }
      let claimableReward=null;
      if(current.status==='ENDED'&&me&&Number(me.rewardClaimed||0)!==1){
        const rewardCfg=await raidRewardSnapshot(env,current.id,cfg,true);
        const rewardCoin=Math.max(0,Number(rewardCfg.participationCoin||0)+(cleared?Number(rewardCfg.clearCoin||0):0));
        const rewardShards=cleared?Math.max(0,Number(rewardCfg.rewardShards||0)):0;
        claimableReward={instanceId:Number(current.id),coin:rewardCoin,shards:rewardShards,participationCoin:Number(rewardCfg.participationCoin||0),clearCoin:cleared?Number(rewardCfg.clearCoin||0):0,cleared,source:'SERVER_CONFIRMED',snapshot:true};
      }
      const visibleParticipants=current.status==='LOBBY'?enriched.map((x,i)=>({anonymous:true,slot:i+1,nickname:`익명 참가자 ${String(i+1).padStart(2,'0')}`,cards:[],totalPower:0,shownDamage:0,isDefeated:false})):enriched;
      return json({settings:cfg,schedule,dailyEntryUsed:todayEntryCount>=dailyEntryLimit,dailyEntry,rooms,current:{id:current.id,status:current.status,startsAt:current.starts_at,endsAt:current.ends_at,currentHp:hp,maxHp:Number(current.max_hp),participantCount:participants.length,bossName:current.boss_name,bossImage:current.boss_image,progress,result:current.status==='ENDED'?result:null,attackTicks,enraged:rage>1},participants:visibleParticipants,me,claimableReward,serverNow:new Date().toISOString()});
    }
    if(path==='raid/open'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env);if(!cfg.enabled)return json({error:'현재 레이드가 중지되어 있습니다.'},503);if(cfg.ownerOnlyTest&&user.role!=='OWNER')return json({error:'현재 레이드를 이용할 수 없습니다.'},403);if(!cfg.userOpenEnabled&&user.role!=='OWNER')return json({error:'유저 레이드 개방이 중지되어 있습니다.'},403);
      const schedule=raidScheduleState(cfg,user);if(!schedule.canEnter)return json({error:schedule.reason==='ENTRY_CLOSED'?'레이드 입장 마감 시간이 지났습니다.':'현재는 레이드 개방 시간이 아닙니다.',schedule},403);
      const body=await readBody(request),requestId=String(body.requestId||crypto.randomUUID()).trim().slice(0,100),bossId=Number(body.bossId||0),dateKey=kstDateKey();
      const prior=await env.DB.prepare('SELECT status,instance_id AS instanceId FROM raid_open_requests WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();if(prior?.status==='COMPLETED')return json({ok:true,instanceId:prior.instanceId,reused:true});if(prior)return json({error:'같은 레이드 개방 요청을 처리 중입니다.'},409);
      const [activeCount,activeMine,entryCount,policies,boss,fresh]=await Promise.all([env.DB.prepare("SELECT COUNT(*) count FROM raid_instances WHERE status IN ('LOBBY','BATTLE')").first(),env.DB.prepare("SELECT rp.instance_id FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.status IN ('LOBBY','BATTLE') LIMIT 1").bind(user.id).first(),raidDailyEntryCount(env,user.id,dateKey),raidBossOpenPolicies(env),env.DB.prepare('SELECT * FROM raid_bosses WHERE id=? AND is_active=1').bind(bossId).first(),env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()]);
      if(Number(activeCount?.count||0)>=10)return json({error:'동시에 개설 가능한 레이드 방 10개가 모두 사용 중입니다.'},409);if(activeMine)return json({error:'이미 참가 중인 레이드 방이 있습니다.'},409);if(entryCount>=Number(cfg.dailyEntries||1))return json({error:`오늘의 레이드 입장 횟수 ${Number(cfg.dailyEntries||1)}회를 모두 사용했습니다. 매일 00:00(KST)에 초기화됩니다.`},409);if(!boss)return json({error:'개방 가능한 레이드 보스를 찾을 수 없습니다.'},404);
      const policy=policies[String(bossId)]||{};if(!policy.enabled&&user.role!=='OWNER')return json({error:'현재 개방할 수 없는 보스입니다.'},403);const cost=Math.max(0,Number(policy.cost||0));if(Number(fresh?.coin||0)<cost)return json({error:'레이드 개방에 필요한 코인이 부족합니다.'},400);
      let deck;try{deck=await raidDeckPower(env,user.id,body.cardIds)}catch(e){return json({error:e.message},e.status||400)}
      await env.DB.prepare("INSERT INTO raid_open_requests(request_id,user_id,boss_id,cost,status) VALUES(?,?,?,?,'PENDING')").bind(requestId,user.id,bossId,cost).run();
      const startsAt=new Date(Date.now()+Number(cfg.lobbySeconds||60)*1000).toISOString(),endsAt=new Date(Date.now()+(Number(cfg.lobbySeconds||60)+Number(cfg.battleSeconds||120))*1000).toISOString();
      const created=await env.DB.prepare("INSERT INTO raid_instances(boss_id,status,starts_at,ends_at,current_hp,participant_count) SELECT ?,'LOBBY',?,?,?,0 WHERE (SELECT COUNT(*) FROM raid_instances WHERE status IN ('LOBBY','BATTLE'))<10").bind(bossId,startsAt,endsAt,boss.max_hp).run();
      if(!created.meta.changes){await env.DB.prepare("UPDATE raid_open_requests SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(requestId).run();return json({error:'동시에 개설 가능한 레이드 방 10개가 모두 사용 중입니다.'},409)}
      const instanceId=Number(created.meta.last_row_id);
      await raidRewardSnapshot(env,instanceId,cfg,true);
      try{
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?').bind(cost,user.id,cost),
          env.DB.prepare('INSERT INTO raid_daily_entry_uses(user_id,entry_date,instance_id) VALUES(?,?,?)').bind(user.id,dateKey,instanceId),
          env.DB.prepare('INSERT INTO raid_participants(instance_id,user_id,deck_cards,total_power,total_damage,updated_at) VALUES(?,?,?,?,0,CURRENT_TIMESTAMP)').bind(instanceId,user.id,JSON.stringify(deck.ids),deck.power),
          env.DB.prepare('UPDATE raid_instances SET participant_count=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(instanceId),
          env.DB.prepare("UPDATE raid_open_requests SET instance_id=?,status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(instanceId,requestId),
          env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'RAID_OPEN' FROM users WHERE id=?").bind(-cost,user.id)
        ]);
      }catch(e){await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(instanceId).run();await env.DB.prepare("UPDATE raid_open_requests SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?").bind(requestId).run();return json({error:'레이드 개방 처리에 실패했습니다. 다시 시도하지 말고 운영자에게 문의해주세요.'},500)}
      return json({ok:true,instanceId,cost,totalPower:deck.power,participantCount:1});
    }

    if(path==='raid/join'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env);if(!cfg.enabled)return json({error:'현재 레이드를 이용할 수 없습니다.'},503);if(cfg.ownerOnlyTest&&user.role!=='OWNER')return json({error:'현재 레이드를 이용할 수 없습니다.'},403);const schedule=raidScheduleState(cfg,user);if(!schedule.canEnter)return json({error:schedule.reason==='ENTRY_CLOSED'?'레이드 입장 마감 시간이 지났습니다.':'현재는 레이드 개방 시간이 아닙니다.',schedule},403);
      const body=await readBody(request),instanceId=Math.max(0,Number(body.instanceId||0));if(!instanceId)return json({error:'참가할 레이드 방을 선택해주세요.'},400);
      const current=await env.DB.prepare("SELECT ri.*,rb.max_hp FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.id=? AND ri.status='LOBBY' LIMIT 1").bind(instanceId).first();if(!current)return json({error:'선택한 레이드 방은 현재 참가할 수 없습니다.'},404);if(Date.parse(current.starts_at||0)<=Date.now())return json({error:'레이드 전투가 이미 시작되어 중간 참여할 수 없습니다.'},409);
      const already=await env.DB.prepare('SELECT id,is_active AS isActive FROM raid_participants WHERE instance_id=? AND user_id=?').bind(current.id,user.id).first();if(Number(already?.isActive||0)===1)return json({ok:true,alreadyJoined:true,participantCount:Number(current.participant_count||0)});if(already)return json({error:'퇴장한 동일 레이드 방에는 다시 참가할 수 없습니다.'},409);
      const activeMine=await env.DB.prepare("SELECT rp.instance_id FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.status IN ('LOBBY','BATTLE') LIMIT 1").bind(user.id).first();if(activeMine)return json({error:'이미 다른 레이드 방에 참가 중입니다.'},409);
      if(Number(current.participant_count||0)>=Number(cfg.maxParticipants||30))return json({error:'레이드 참가 인원이 가득 찼습니다.'},409);const dateKey=kstDateKey(),entryCount=await raidDailyEntryCount(env,user.id,dateKey);if(entryCount>=Number(cfg.dailyEntries||1))return json({error:`오늘의 레이드 입장 횟수 ${Number(cfg.dailyEntries||1)}회를 모두 사용했습니다. 성공·실패와 관계없이 입장 시 1회 차감됩니다.`},409);
      let deck;try{deck=await raidDeckPower(env,user.id,body.cardIds)}catch(e){return json({error:e.message},e.status||400)}
      try{await env.DB.batch([env.DB.prepare('INSERT INTO raid_daily_entry_uses(user_id,entry_date,instance_id) VALUES(?,?,?)').bind(user.id,dateKey,current.id),env.DB.prepare('INSERT INTO raid_participants(instance_id,user_id,deck_cards,total_power,total_damage,updated_at) VALUES(?,?,?,?,0,CURRENT_TIMESTAMP)').bind(current.id,user.id,JSON.stringify(deck.ids),deck.power)]);}catch{return json({error:'레이드 입장 기록 또는 참가 처리에 실패했습니다.'},409)}
      const count=await env.DB.prepare('SELECT COUNT(*) count FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1').bind(current.id).first();await env.DB.prepare('UPDATE raid_instances SET participant_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(Number(count.count||0),current.id).run();if(cfg.autoStartOnFull&&Number(count.count||0)>=Number(cfg.maxParticipants||30))await env.DB.prepare("UPDATE raid_instances SET starts_at=CURRENT_TIMESTAMP,ends_at=datetime('now', ?),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(`+${Number(cfg.battleSeconds||120)} seconds`,current.id).run();return json({ok:true,totalPower:deck.power,participantCount:Number(count.count||0)});
    }

    if(path==='raid/leave'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),instanceId=Math.max(0,Number(body.instanceId||0));if(!instanceId)return json({error:'퇴장할 레이드 방을 찾을 수 없습니다.'},400);
      const room=await env.DB.prepare("SELECT id,status,starts_at AS startsAt FROM raid_instances WHERE id=? LIMIT 1").bind(instanceId).first();
      if(!room)return json({error:'레이드 방을 찾을 수 없습니다.'},404);if(room.status!=='LOBBY'||Date.parse(room.startsAt||0)<=Date.now())return json({error:'전투가 시작된 후에는 레이드에서 퇴장할 수 없습니다.'},409);
      const participant=await env.DB.prepare('SELECT id FROM raid_participants WHERE instance_id=? AND user_id=? AND COALESCE(is_active,1)=1 LIMIT 1').bind(instanceId,user.id).first();if(!participant)return json({error:'현재 참가 중인 레이드 방이 아닙니다.'},404);
      const entry=await env.DB.prepare("SELECT entry_date AS entryDate FROM raid_daily_entry_uses WHERE user_id=? AND instance_id=? UNION ALL SELECT entry_date AS entryDate FROM raid_daily_entries WHERE user_id=? AND instance_id=? LIMIT 1").bind(user.id,instanceId,user.id,instanceId).first();
      const entryDate=entry?.entryDate||kstDateKey();
      const left=await env.DB.prepare("UPDATE raid_participants SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(is_active,1)=1 AND EXISTS (SELECT 1 FROM raid_instances WHERE id=? AND status='LOBBY' AND datetime(starts_at)>CURRENT_TIMESTAMP)").bind(participant.id,instanceId).run();
      if(!left.meta.changes)return json({error:'전투가 시작되어 퇴장할 수 없습니다.'},409);
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO raid_daily_entry_restores(user_id,entry_date,instance_id,reason) VALUES(?,?,?,'USER_LEAVE')").bind(user.id,entryDate,instanceId),
        env.DB.prepare("UPDATE raid_instances SET participant_count=(SELECT COUNT(*) FROM raid_participants WHERE instance_id=? AND COALESCE(is_active,1)=1),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(instanceId,instanceId)
      ]);
      const count=await env.DB.prepare('SELECT participant_count AS participantCount FROM raid_instances WHERE id=?').bind(instanceId).first();
      return json({ok:true,instanceId,entryRestored:true,participantCount:Number(count?.participantCount||0)});
    }

    if(path==='raid/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const cfg=await raidSettings(env);if(cfg.ownerOnlyTest&&user.role!=='OWNER')return json({error:'현재 레이드를 이용할 수 없습니다.'},403);
      const body=await readBody(request),instanceId=Number(body.instanceId||0);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS raid_reward_receipts (
        instance_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        reward_coin INTEGER NOT NULL DEFAULT 0,
        reward_shards INTEGER NOT NULL DEFAULT 0,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(instance_id,user_id)
      )`).run();

      const row=instanceId>0
        ?await env.DB.prepare("SELECT rp.id,rp.reward_claimed,ri.id AS instance_id,ri.status,ri.current_hp,rb.max_hp FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.id=? AND ri.status='ENDED' LIMIT 1").bind(user.id,instanceId).first()
        :await env.DB.prepare("SELECT rp.id,rp.reward_claimed,ri.id AS instance_id,ri.status,ri.current_hp,rb.max_hp FROM raid_participants rp JOIN raid_instances ri ON ri.id=rp.instance_id JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE rp.user_id=? AND COALESCE(rp.is_active,1)=1 AND ri.status='ENDED' ORDER BY ri.id DESC LIMIT 1").bind(user.id).first();
      if(!row)return json({error:'수령 가능한 레이드 보상이 없습니다.'},404);
      const cancelled=await env.DB.prepare("SELECT instance_id FROM raid_room_cancellations WHERE instance_id=? AND status='COMPLETED'").bind(row.instance_id).first();
      if(cancelled)return json({error:'최소 인원 미달로 취소된 레이드는 보상 대상이 아닙니다. 입장 횟수와 개설 비용은 복구되었습니다.'},409);

      const receipt=await env.DB.prepare('SELECT status,response_json FROM raid_reward_receipts WHERE instance_id=? AND user_id=?').bind(row.instance_id,user.id).first();
      if(receipt?.status==='COMPLETED'&&receipt.response_json){
        try{return json(JSON.parse(receipt.response_json))}catch{}
      }
      if(receipt?.status==='PENDING')return json({error:'레이드 보상을 정산 중입니다. 잠시 후 다시 확인해주세요.'},409);
      if(Number(row.reward_claimed||0)&&!receipt)return json({error:'이미 수령한 레이드 보상입니다.'},409);

      const cleared=Number(row.current_hp||0)<=0,rewardCfg=await raidRewardSnapshot(env,row.instance_id,cfg,true);
      const rewardCoin=Math.max(0,Number(rewardCfg.participationCoin||0)+(cleared?Number(rewardCfg.clearCoin||0):0));
      const rewardShards=cleared?Math.max(0,Number(rewardCfg.rewardShards||0)):0;
      const reserved=await env.DB.prepare("INSERT OR IGNORE INTO raid_reward_receipts(instance_id,user_id,status,reward_coin,reward_shards) VALUES(?,?,'PENDING',?,?)").bind(row.instance_id,user.id,rewardCoin,rewardShards).run();
      if(!reserved.meta.changes){
        const duplicate=await env.DB.prepare('SELECT status,response_json FROM raid_reward_receipts WHERE instance_id=? AND user_id=?').bind(row.instance_id,user.id).first();
        if(duplicate?.status==='COMPLETED'&&duplicate.response_json){try{return json(JSON.parse(duplicate.response_json))}catch{}}
        return json({error:'레이드 보상을 정산 중입니다. 잠시 후 다시 확인해주세요.'},409);
      }

      try{
        const before=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        if(!before)throw new Error('유저 정보를 찾을 수 없습니다.');
        const balanceAfter=Number(before.coin||0)+rewardCoin;
        const shardsAfter=Number(before.card_shards||0)+rewardShards;
        const response={ok:true,instanceId:Number(row.instance_id),rewardClaimed:true,rewardCoin,rewardShards,balanceAfter,shardsAfter,rewardSource:'SERVER_CONFIRMED'};

        await env.DB.batch([
          env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?').bind(rewardCoin,rewardShards,user.id),
          env.DB.prepare('UPDATE raid_participants SET reward_claimed=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND reward_claimed=0').bind(row.id),
          env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'RAID_REWARD')").bind(user.id,rewardCoin,balanceAfter),
          env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'RAID_REWARD')").bind(user.id,rewardShards,shardsAfter),
          env.DB.prepare("UPDATE raid_reward_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(JSON.stringify(response),row.instance_id,user.id)
        ]);

        const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
        if(Number(updated?.coin)!==balanceAfter||Number(updated?.card_shards)!==shardsAfter)throw new Error('레이드 보상 지급 후 잔액 검증에 실패했습니다.');
        response.user=await profile(env,updated);
        await env.DB.prepare("UPDATE raid_reward_receipts SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=?").bind(JSON.stringify(response),row.instance_id,user.id).run();
        return json(response);
      }catch(error){
        await env.DB.prepare('DELETE FROM raid_reward_receipts WHERE instance_id=? AND user_id=? AND status=?').bind(row.instance_id,user.id,'PENDING').run();
        throw error;
      }
    }

    if(path==='battle/config'){
      const user=await authenticate(request,env); if(!user) return json({error:'로그인이 필요합니다.'},401);
      const settings=await battleSettings(env);
      const monsters=await env.DB.prepare('SELECT id,name,image_url AS image,battle_power AS battlePower,reward_coin AS rewardCoin,is_boss AS isBoss FROM battle_monsters WHERE is_active=1 ORDER BY sort_order,id').all();
      return json({settings,deck:await pveDeckCards(env,user.id),energy:await battleEnergyState(env,user,settings),serverNow:new Date().toISOString(),monsters:monsters.results});
    }
    if(path==='battle/deck'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),ids=[...new Set((body.cardIds||[]).map(String))];
      if(ids.length!==5)return json({error:'PvE 덱은 보유 카드 5장으로 편성해야 합니다.'},400);
      const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT card_id FROM user_cards WHERE user_id=? AND card_id IN (${marks})`).bind(user.id,...ids).all();
      if(owned.results.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      await env.DB.prepare('INSERT INTO pve_decks(user_id,card_ids,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(user.id,JSON.stringify(ids)).run();
      return json({ok:true,deck:ids});
    }
    if(path==='battle/deck'&&request.method==='DELETE'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      await env.DB.prepare('DELETE FROM pve_decks WHERE user_id=?').bind(user.id).run();
      return json({ok:true,deck:[]});
    }
    if(path==='battle/fight'&&request.method==='POST'){
      const user=await authenticate(request,env); if(!user) return json({error:'로그인이 필요합니다.'},401);
      const settings=await battleSettings(env); if(!settings.enabled)return json({error:'현재 전투 콘텐츠가 중지되어 있습니다.'},503);
      const payload=await readBody(request),monsterId=Number(payload.monsterId),ids=[...new Set((payload.cardIds||[]).map(String))];
      if(ids.length!==5)return json({error:'보유 카드 5장을 편성해야 합니다.'},400);
      const monster=await env.DB.prepare('SELECT * FROM battle_monsters WHERE id=? AND is_active=1').bind(monsterId).first();
      if(!monster)return json({error:'전투할 몬스터를 찾을 수 없습니다.'},404);
      let energyAfter;try{energyAfter=await consumeBattleEnergy(env,user,settings)}catch(e){if(e.code==='NO_BATTLE_ENERGY')return json({error:e.message,code:e.code,energy:e.energy},429);throw e}
      const marks=ids.map(()=>'?').join(',');
      const owned=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,uc.breakthrough_level FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND c.id IN (${marks})`).bind(user.id,...ids).all();
      if(owned.results.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      const cards=owned.results.map(c=>({...c,power:cardBattlePower(c,c.breakthrough_level,settings)}));
      const basePlayerPower=cards.reduce((a,c)=>a+c.power,0),monsterPower=Number(monster.battle_power||0);
      const eligible=(settings.ultimateRules||[]).map(u=>{const matchedCards=cards.filter(c=>String(c.rarity||'').toUpperCase()===u.requiredGrade&&Number(c.breakthrough_level||0)>=Number(u.minBreakthrough||0)).sort((a,b)=>Number(b.power||0)-Number(a.power||0));return {rule:u,matchedCards};}).filter(x=>x.rule.enabled!==false&&x.matchedCards.length>=Number(x.rule.requiredCount||1)).sort((a,b)=>Number(ORDER[b.rule.requiredGrade]||0)-Number(ORDER[a.rule.requiredGrade]||0)||Number(b.rule.minBreakthrough||0)-Number(a.rule.minBreakthrough||0)||Number(b.rule.requiredCount||0)-Number(a.rule.requiredCount||0));
      const activatedEntry=eligible.find(x=>Math.random()*100<Math.max(0,Math.min(100,Number(x.rule.activationChance??100))))||null;
      const activatedUltimate=activatedEntry?.rule||null;
      const ultimateSourceCard=activatedEntry?.matchedCards?.[0]||null;
      const ultimateDamage=activatedUltimate&&ultimateSourceCard?Math.max(0,Math.floor(Number(ultimateSourceCard.power||0)*Number(activatedUltimate.coefficientPercent||0)/100)):0;
      const playerPower=basePlayerPower;
      const totalBattleDamage=basePlayerPower+ultimateDamage;
      const result=totalBattleDamage>=monsterPower?'WIN':'LOSE',reward=result==='WIN'?Number(monster.reward_coin||0):0;
      if(reward){await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id).run();await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(reward,`PVE 승리 보상: ${monster.name}`,user.id).run();}
      let cardReward=null;if(result==='WIN'&&settings.cardDrop?.enabled!==false){const cardRate=Math.max(0,Math.min(100,Number(settings.cardDrop?.defaultRate??0)));if(cardRate>0&&Math.random()*100<cardRate)cardReward=await grantBattleCard(env,user.id,settings);}
      await env.DB.prepare('INSERT INTO battle_logs(user_id,monster_id,deck_cards,player_power,monster_power,result,reward_coin) VALUES(?,?,?,?,?,?,?)').bind(user.id,monster.id,JSON.stringify(ids),playerPower,monsterPower,result,reward).run();
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      return json({result,reward,cardReward,playerPower,basePlayerPower,totalBattleDamage,ultimateDamage,bonusDamage:ultimateDamage,ultimateSourceCard:ultimateSourceCard?{id:ultimateSourceCard.id,title:ultimateSourceCard.title,rarity:ultimateSourceCard.rarity,power:ultimateSourceCard.power,breakthroughLevel:ultimateSourceCard.breakthrough_level}:null,activatedUltimate,monsterPower,monster:{id:monster.id,name:monster.name,image:monster.image_url,isBoss:Boolean(monster.is_boss)},cards,energy:energyAfter,serverNow:new Date().toISOString(),user:await profile(env,updated)});
    }


    if(path==='pvp/config'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await pvpSettings(env),profile=await ensurePvpProfile(env,user,settings),deck=await pvpDeckCards(env,user.id),score=await userCardScore(env,user.id);
      return json({settings,profile:{...profile,tier:resolveTier(Number(profile.season_score),settings.tiers)},deck,cardScore:score,energy:await pvpEnergyState(env,user,settings),bypass:isAdminRole(user),serverNow:new Date().toISOString()});
    }
    if(path==='pvp/deck'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await pvpSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 PvP 콘텐츠가 중지되어 있습니다.'},503);const body=await readBody(request),ids=[...new Set((body.cardIds||[]).map(String))];if(ids.length!==5)return json({error:'PvP 덱은 보유 카드 5장으로 편성해야 합니다.'},400);
      const marks=ids.map(()=>'?').join(','),owned=await env.DB.prepare(`SELECT card_id FROM user_cards WHERE user_id=? AND card_id IN (${marks})`).bind(user.id,...ids).all();if(owned.results.length!==5)return json({error:'보유하지 않은 카드가 포함되어 있습니다.'},400);
      await env.DB.prepare('INSERT INTO pvp_decks(user_id,card_ids,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(user.id,JSON.stringify(ids)).run();return json({ok:true,deck:ids});
    }
    if(path==='pvp/opponents'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const [settings,recent]=await Promise.all([
        pvpSettings(env),
        env.DB.prepare('SELECT defender_id FROM pvp_match_history WHERE attacker_id=? ORDER BY id DESC LIMIT 2').bind(user.id).all()
      ]);
      if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 PvP 콘텐츠가 중지되어 있습니다.'},503);
      const mine=await ensurePvpProfile(env,user,settings);
      const blockedOpponentId=recent.results.length===2&&Number(recent.results[0].defender_id)===Number(recent.results[1].defender_id)?Number(recent.results[0].defender_id):0;
      const ranges=[200,400,700,1200],out=[],seen=new Set();
      for(const seasonRange of ranges){
        const users=await env.DB.prepare(`SELECT u.id,u.nickname,p.season_score,p.wins,p.losses,p.highest_score
          FROM users u
          JOIN pvp_profiles p ON p.user_id=u.id
          JOIN pvp_decks d ON d.user_id=u.id
          WHERE u.id<>?
            AND u.status='ACTIVE'
            AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN')
            AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))
            AND ABS(p.season_score-?)<=?
          ORDER BY ABS(p.season_score-?) ASC,p.season_score DESC
          LIMIT 50`).bind(user.id,mine.season_score,seasonRange,mine.season_score).all();
        for(const x of users.results){
          const id=Number(x.id);
          if(seen.has(id)||id===blockedOpponentId)continue;
          seen.add(id);
          const scoreDiff=Number(x.season_score)-Number(mine.season_score);
          const winPreview=pvpSeasonScoreAdjustment(true,mine.season_score,x.season_score);
          const lossPreview=pvpSeasonScoreAdjustment(false,mine.season_score,x.season_score);
          out.push({...x,scoreDiff,expectedWin:winPreview.change,expectedLoss:lossPreview.change,tier:resolveTier(Number(x.season_score),settings.tiers)});
          if(out.length>=6)break;
        }
        if(out.length>=6)break;
      }
      out.sort((a,b)=>Math.abs(Number(a.scoreDiff))-Math.abs(Number(b.scoreDiff))||Number(b.season_score)-Number(a.season_score));
      return json({opponents:out.slice(0,6),blockedOpponentId:blockedOpponentId||null,matchRanges:ranges});
    }
    if(path==='pvp/fight'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),defenderId=Number(body.opponentId);if(!defenderId||defenderId===user.id)return json({error:'올바른 상대를 선택하세요.'},400);
      const settings=await pvpSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 PvP 시즌이 중지되어 있습니다.'},503);
      const recent=await env.DB.prepare('SELECT defender_id FROM pvp_match_history WHERE attacker_id=? ORDER BY id DESC LIMIT 2').bind(user.id).all();
      if(recent.results.length===2&&Number(recent.results[0].defender_id)===defenderId&&Number(recent.results[1].defender_id)===defenderId)return json({error:'같은 상대와는 연속 3회 이상 대전할 수 없습니다. 다른 상대와 1회 대전한 뒤 다시 도전하세요.',code:'PVP_REPEAT_OPPONENT_LIMIT'},409);
      const attacker=await ensurePvpProfile(env,user,settings),defUser=await env.DB.prepare("SELECT * FROM users WHERE id=? AND status='ACTIVE' AND (banned_until IS NULL OR banned_until<=datetime('now'))").bind(defenderId).first();if(!defUser)return json({error:'상대를 찾을 수 없습니다.'},404);const defender=await ensurePvpProfile(env,defUser,settings);
      const [aDeck,dDeck,battle]=await Promise.all([pvpDeckSnapshot(env,user.id),pvpDeckSnapshot(env,defenderId),battleSettings(env)]);if(aDeck.length!==5)return json({error:'먼저 PvP 덱 편성을 완료하세요.'},400);if(dDeck.length!==5)return json({error:'상대의 PvP 덱이 완성되지 않았습니다.'},409);const aPower=aDeck.reduce((s,c)=>s+cardBattlePower(c,c.breakthrough_level,battle),0),dPower=dDeck.reduce((s,c)=>s+cardBattlePower(c,c.breakthrough_level,battle),0),attackerWin=aPower>=dPower,winnerId=attackerWin?user.id:defenderId,aBefore=Number(attacker.season_score),dBefore=Number(defender.season_score),aAdj=pvpSeasonScoreAdjustment(attackerWin,aBefore,dBefore),dAdj=pvpSeasonScoreAdjustment(!attackerWin,dBefore,aBefore),change=aAdj.change,defenderChange=dAdj.change,aAfter=Math.max(0,aBefore+(attackerWin?change:-change)),dAfter=Math.max(0,dBefore+(attackerWin?-defenderChange:defenderChange)),aCard=0,dCard=0;
      const pvpEnergy=await consumePvpEnergy(env,user,settings);
      // PvP battle coin is an active-challenge reward. Only the authenticated attacker receives it.
      // The asynchronous defender never receives win/lose coins from being challenged.
      const attackerCoinReward=attackerWin?Number(settings.winCoin||0):Number(settings.loseCoin||0);
      await env.DB.batch([
        env.DB.prepare('UPDATE pvp_profiles SET season_score=?,highest_score=MAX(highest_score,?),wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(aAfter,aAfter,attackerWin?1:0,attackerWin?0:1,user.id),
        env.DB.prepare('UPDATE pvp_profiles SET season_score=?,highest_score=MAX(highest_score,?),wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(dAfter,dAfter,attackerWin?0:1,attackerWin?1:0,defenderId),
        env.DB.prepare('INSERT INTO pvp_match_history(attacker_id,defender_id,attacker_name,defender_name,attacker_deck,defender_deck,attacker_card_score,defender_card_score,attacker_power,defender_power,winner_id,attacker_score_before,attacker_score_after,defender_score_before,defender_score_after,score_change) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(user.id,defenderId,user.nickname,defUser.nickname,JSON.stringify(aDeck),JSON.stringify(dDeck),aCard,dCard,aPower,dPower,winnerId,aBefore,aAfter,dBefore,dAfter,change),
        env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(attackerCoinReward,user.id)
      ]);
      const coinUser=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
      if(attackerCoinReward>0)await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PVP_ATTACK_BATTLE')").bind(user.id,attackerCoinReward,coinUser.coin).run();
      return json({result:attackerWin?'WIN':'LOSE',scoreChange:attackerWin?change:-change,scoreAfter:aAfter,coinReward:attackerCoinReward,coinAfter:coinUser.coin,rewardRecipient:'ATTACKER',attackerPower:aPower,defenderPower:dPower,opponent:defUser.nickname,attackerDeck:aDeck,defenderDeck:dDeck,scoreAdjustment:aAdj,opponentScoreAdjustment:dAdj,energy:pvpEnergy,serverNow:new Date().toISOString()});
    }
    if(path==='pvp/history'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const settings=await pvpSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 PvP 콘텐츠가 중지되어 있습니다.'},503);const rows=await env.DB.prepare('SELECT * FROM pvp_match_history WHERE attacker_id=? OR defender_id=? ORDER BY id DESC LIMIT ?').bind(user.id,user.id,Number(settings.historyLimit||100)).all();return json({history:rows.results.map(r=>({...r,direction:Number(r.attacker_id)===Number(user.id)?'ATTACK':'DEFENSE',result:Number(r.winner_id)===Number(user.id)?'WIN':'LOSE',opponent:Number(r.attacker_id)===Number(user.id)?r.defender_name:r.attacker_name,myScoreAfter:Number(r.attacker_id)===Number(user.id)?r.attacker_score_after:r.defender_score_after,score_change:Math.abs(Number(r.attacker_id)===Number(user.id)?Number(r.attacker_score_after)-Number(r.attacker_score_before):Number(r.defender_score_after)-Number(r.defender_score_before))}))});
    }
    if(path==='pvp/ranking'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const settings=await pvpSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 PvP 콘텐츠가 중지되어 있습니다.'},503);const rows=await env.DB.prepare(`SELECT u.id,u.nickname,p.season_score,p.highest_score,p.wins,p.losses FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname LIMIT 100`).all();const ranking=rows.results.map((x,i)=>({...x,rank:i+1,tier:resolveTier(Number(x.season_score),settings.tiers)}));return json({settings,ranking,me:ranking.find(x=>Number(x.id)===Number(user.id))||null});
    }
    if(path==='pvp/reward/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const settings=await pvpSettings(env);const settled=await completedPvpSettlement(env,settings);if(settled)return json({error:'시즌 정산 보상은 메시지함에서 수령하세요.'},409);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 PvP 콘텐츠가 중지되어 있습니다.'},503);if(!settings.tierRewardsEnabled)return json({error:'티어 달성 보상이 중지되어 있습니다.'},503);if(settings.rewardClaimMode==='SEASON_END'&&settings.endsAt&&new Date(settings.endsAt).getTime()>Date.now()&&!isAdminRole(user))return json({error:'시즌 종료 후 보상을 받을 수 있습니다.'},409);const p=await ensurePvpProfile(env,user,settings),tier=resolveTier(Number(p.highest_score),settings.tiers),rewardCoin=Number(tier.rewardCoin||0),rewardShards=Number(tier.rewardShards||0),exists=await env.DB.prepare('SELECT 1 FROM pvp_reward_claims WHERE user_id=? AND season_name=? AND tier_id=?').bind(user.id,settings.seasonName,tier.id).first();if(exists)return json({error:'이미 수령한 시즌 티어 보상입니다.'},409);await env.DB.batch([env.DB.prepare('INSERT INTO pvp_reward_claims(user_id,season_name,tier_id,reward_coin,reward_shards) VALUES(?,?,?,?,?)').bind(user.id,settings.seasonName,tier.id,rewardCoin,rewardShards),env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?').bind(rewardCoin,rewardShards,user.id),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?").bind(rewardCoin,`PVP ${settings.seasonName} ${tier.name} 티어 보상`,user.id),env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT id,?,card_shards,? FROM users WHERE id=?").bind(rewardShards,`PVP ${settings.seasonName} ${tier.name} 티어 보상`,user.id)]);const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();return json({ok:true,tier,reward:rewardCoin,rewardCoin,rewardShards,user:await profile(env,updated)});
    }
    if(path==='pvp/rank-reward/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);if(isAdminRole(user))return json({error:'운영 계정은 시즌 랭킹 및 랭킹 보상 대상에서 제외됩니다.'},403);const settings=await pvpSettings(env);const settled=await completedPvpSettlement(env,settings);if(settled)return json({error:'시즌 정산 보상은 메시지함에서 수령하세요.'},409);if(!settings.rankRewardsEnabled)return json({error:'시즌 랭킹 보상이 중지되어 있습니다.'},503);const seasonEndMs=settings.endsAt?utcMs(settings.endsAt):0;if(!seasonEndMs||seasonEndMs>Date.now())return json({error:'최종 랭킹 보상은 시즌 종료 후에만 받을 수 있습니다.'},409);const rows=await env.DB.prepare(`SELECT u.id,u.nickname,p.season_score,p.wins FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname`).all(),rank=rows.results.findIndex(x=>Number(x.id)===Number(user.id))+1;if(!rank)return json({error:'시즌 랭킹 기록이 없습니다.'},404);const reward=(settings.rankRewards||[]).find(x=>rank>=Number(x.from)&&rank<=Number(x.to));if(!reward)return json({error:'현재 순위에 해당하는 랭킹 보상이 없습니다.'},404);const exists=await env.DB.prepare('SELECT 1 FROM pvp_rank_reward_claims WHERE user_id=? AND season_name=?').bind(user.id,settings.seasonName).first();if(exists)return json({error:'이미 수령한 시즌 랭킹 보상입니다.'},409);const rewardCoin=Number(reward.rewardCoin||0),rewardShards=Number(reward.rewardShards||0);await env.DB.batch([env.DB.prepare('INSERT INTO pvp_rank_reward_claims(user_id,season_name,final_rank,reward_coin,reward_shards) VALUES(?,?,?,?,?)').bind(user.id,settings.seasonName,rank,rewardCoin,rewardShards),env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?').bind(rewardCoin,rewardShards,user.id)]);const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();return json({ok:true,rank,rewardCoin,rewardShards,user:await profile(env,updated)});
    }

    if(path==='mineral-exchange/config'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await mineralExchangeSettings(env),today=kstTodaySql();
      const used=await env.DB.prepare("SELECT COALESCE(SUM(coin_amount),0) total FROM mineral_exchange_requests WHERE user_id=? AND requested_kst_date=? AND status IN ('PENDING','APPROVED')").bind(user.id,today).first();
      const mine=await env.DB.prepare("SELECT id,wago_nickname,mineral_amount,coin_amount,proof_text,status,reject_reason,created_at,reviewed_at FROM mineral_exchange_requests WHERE user_id=? ORDER BY id DESC LIMIT 10").bind(user.id).all();
      return json({settings,usedCoin:Number(used?.total||0),remainingCoin:Math.max(0,Number(settings.dailyLimitCoin)-Number(used?.total||0)),requests:mine.results});
    }
    if(path==='mineral-exchange/request'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await mineralExchangeSettings(env);if(!settings.enabled&&!isAdminRole(user))return json({error:'현재 미네랄 교환 신청이 중지되어 있습니다.'},503);
      const body=await readBody(request),wagoNickname=String(body.wagoNickname||'').trim().slice(0,40),proofText=String(body.proofText||'').trim().slice(0,500),mineralAmount=Math.floor(Number(body.mineralAmount||0));
      if(!wagoNickname)return json({error:'와이고수 닉네임을 입력하세요.'},400);if(wagoNickname.length<2)return json({error:'와이고수 닉네임을 정확히 입력하세요.'},400);
      if(!proofText)return json({error:'기부 완료 내용을 입력하세요.'},400);if(!Number.isSafeInteger(mineralAmount)||mineralAmount<=0)return json({error:'기부한 미네랄 수량을 정확히 입력하세요.'},400);
      const rawCoin=mineralAmount*Number(settings.payoutCoin)/Number(settings.baseMineral),coinAmount=Math.floor(rawCoin);
      if(!Number.isInteger(rawCoin)||coinAmount<=0||coinAmount%1000!==0)return json({error:'교환 신청은 1,000코인 단위로만 가능합니다.'},400);
      const today=kstTodaySql(),used=await env.DB.prepare("SELECT COALESCE(SUM(coin_amount),0) total FROM mineral_exchange_requests WHERE user_id=? AND requested_kst_date=? AND status IN ('PENDING','APPROVED')").bind(user.id,today).first();
      if(Number(used?.total||0)+coinAmount>Number(settings.dailyLimitCoin))return json({error:`하루 최대 교환 가능 개수는 ${Number(settings.dailyLimitCoin).toLocaleString()}코인입니다.`},409);
      const result=await env.DB.prepare("INSERT INTO mineral_exchange_requests(user_id,game_nickname,wago_nickname,mineral_amount,coin_amount,proof_text,status,requested_kst_date) VALUES(?,?,?,?,?,?,'PENDING',?)").bind(user.id,user.nickname,wagoNickname,mineralAmount,coinAmount,proofText,today).run();
      return json({ok:true,id:result.meta.last_row_id,coinAmount});
    }

    if(path==='wago-verification/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await wagoVerificationSettings(env),row=await env.DB.prepare('SELECT wago_nickname,wago_member_no,status,verification_code,comment_url,profile_url,issued_at,expires_at,verified_at,review_note,last_checked_at FROM wago_verifications WHERE user_id=?').bind(user.id).first();
      return json({settings:{enabled:settings.enabled,postUrl:settings.postUrl,codeMinutes:settings.codeMinutes},verification:row||null});
    }
    if(path==='wago-verification/request'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await wagoVerificationSettings(env);if(!settings.enabled)return json({error:'현재 와고 인증이 중지되어 있습니다.'},503);
      const body=await readBody(request),nickname=String(body.wagoNickname||'').trim().slice(0,40),memberNo='';
      if(nickname.length<2)return json({error:'와고 닉네임을 정확히 입력하세요.'},400);
      if(!settings.postUrl)return json({error:'현재 인증 게시글이 준비되지 않았습니다.'},503);
      const code=makeVerificationCode(),minutes=Math.max(5,Math.min(60,Number(settings.codeMinutes)||20));
      await env.DB.prepare(`INSERT INTO wago_verifications(user_id,wago_nickname,wago_member_no,verification_code,status,expires_at,issued_at,updated_at) VALUES(?,?,?,?, 'PENDING',datetime('now',?),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET wago_nickname=excluded.wago_nickname,wago_member_no=excluded.wago_member_no,verification_code=excluded.verification_code,status='PENDING',comment_url=NULL,profile_url=NULL,wago_member_no='',expires_at=excluded.expires_at,issued_at=CURRENT_TIMESTAMP,verified_at=NULL,review_note=NULL,updated_at=CURRENT_TIMESTAMP`).bind(user.id,nickname,memberNo,code,`+${minutes} minutes`).run();
      return json({ok:true,verificationCode:code,postUrl:settings.postUrl,expiresMinutes:minutes});
    }
    if(path==='wago-verification/check'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await wagoVerificationSettings(env),v=await env.DB.prepare('SELECT * FROM wago_verifications WHERE user_id=?').bind(user.id).first();if(!v)return json({error:'먼저 인증코드를 발급하세요.'},404);
      if(v.status==='VERIFIED')return json({ok:true,verified:true,verification:v});if(new Date(v.expires_at+'Z')<new Date())return json({error:'인증코드 유효시간이 만료되었습니다. 새 코드를 발급하세요.'},410);
      if(!settings.postUrl)return json({error:'현재 인증 게시글이 준비되지 않았습니다.'},503);
      const inspected=await inspectWagoComment(settings,v);
      await env.DB.prepare("UPDATE wago_verifications SET comment_url=?,profile_url=NULL,last_checked_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(settings.postUrl,inspected.ok?inspected.notice:inspected.error,user.id).run();
      if(!inspected.ok)return json({error:inspected.error},409);
      const duplicate=await env.DB.prepare("SELECT user_id FROM wago_verifications WHERE wago_member_no=? AND status='VERIFIED' AND user_id<>?").bind(inspected.memberNo,user.id).first();if(duplicate)return json({error:'이미 다른 씨켓몬 계정에 인증된 회원번호입니다.'},409);
      await env.DB.prepare("UPDATE wago_verifications SET status='VERIFIED',wago_member_no=?,comment_url=?,profile_url=NULL,verified_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(inspected.memberNo,inspected.commentUrl,inspected.notice,user.id).run();
      return json({ok:true,verified:true,message:`댓글 작성자 회원번호 ${inspected.memberNo}번을 확인하여 자동 인증되었습니다.`});
    }
    if(path==='wago-daily-quest/status'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const settings=await wagoDailyQuestSettings(env),today=kstDate();
      const verification=await env.DB.prepare("SELECT status,wago_nickname,wago_member_no FROM wago_verifications WHERE user_id=?").bind(user.id).first();
      const postProgress=await env.DB.prepare('SELECT post_count,last_checked_at FROM wago_daily_quest_progress WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      const postClaim=await env.DB.prepare('SELECT reward_coin,post_count,claimed_at FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      return json({settings:{enabled:settings.enabled,postEnabled:settings.postEnabled!==false,requiredPosts:Number(settings.requiredPosts||15),postRewardCoin:Number(settings.postRewardCoin||1200),rewardCoin:Number(settings.postRewardCoin||1200)},verified:verification?.status==='VERIFIED',wagoNickname:verification?.wago_nickname||'',postCount:Number(postProgress?.post_count||0),postLastCheckedAt:postProgress?.last_checked_at||null,postClaimed:Boolean(postClaim),postClaim:postClaim||null,excluded:dailyQuestAdminExcluded(user,settings)});
    }
    if(path==='wago-daily-quest/check'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),questType=String(body.questType||'POST').toUpperCase();
      const settings=await wagoDailyQuestSettings(env);if(settings.enabled===false)return json({error:'현재 일일퀘스트가 중지되어 있습니다.'},503);
      if(dailyQuestAdminExcluded(user,settings))return json({error:'운영 계정의 일일퀘스트 테스트가 중지되어 있습니다.'},403);
      const v=await env.DB.prepare("SELECT status,wago_nickname,wago_member_no FROM wago_verifications WHERE user_id=?").bind(user.id).first();
      if(v?.status!=='VERIFIED'||!v.wago_member_no)return json({error:'와고 2단계 인증 완료 후 이용할 수 있습니다.'},403);
      const today=kstDate(),cooldown=Math.max(5,Number(settings.checkCooldownSeconds)||20);
      if(questType!=='POST')return json({error:'지원하지 않는 일일퀘스트입니다.'},400);
      if(settings.postEnabled===false)return json({error:'게시글 일일퀘스트가 중지되어 있습니다.'},503);
      const old=await env.DB.prepare('SELECT post_count,last_checked_at FROM wago_daily_quest_progress WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      if(old?.last_checked_at&&Date.now()-Date.parse(String(old.last_checked_at).replace(' ','T')+'Z')<cooldown*1000)return json({ok:true,questType:'POST',postCount:Number(old.post_count||0),requiredPosts:Number(settings.requiredPosts||15),rewardCoin:Number(settings.postRewardCoin||1200),cooldown:true});
      const inspected=await inspectWagoDailyPosts(settings,v.wago_nickname);if(!inspected.ok)return json({error:inspected.error},502);
      // 같은 KST 날짜 안에서는 외부 검색 페이지 일시 누락 때문에 진행도가 감소하지 않도록 최고값을 유지한다.
      const stablePostCount=Math.max(Number(old?.post_count||0),Number(inspected.postCount||0));
      const stablePostIds=[...new Set([...(JSON.parse((await env.DB.prepare('SELECT post_ids_json FROM wago_daily_quest_progress WHERE user_id=? AND quest_date=?').bind(user.id,today).first())?.post_ids_json||'[]')),...inspected.postIds])];
      await env.DB.prepare(`INSERT INTO wago_daily_quest_progress(user_id,quest_date,post_count,post_ids_json,last_checked_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,quest_date) DO UPDATE SET post_count=excluded.post_count,post_ids_json=excluded.post_ids_json,last_checked_at=CURRENT_TIMESTAMP`).bind(user.id,today,stablePostCount,JSON.stringify(stablePostIds)).run();
      return json({ok:true,questType:'POST',postCount:stablePostCount,requiredPosts:Number(settings.requiredPosts||15),rewardCoin:Number(settings.postRewardCoin||1200)});
    }
    if(path==='wago-daily-quest/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),questType=String(body.questType||'POST').toUpperCase();
      const settings=await wagoDailyQuestSettings(env);if(settings.enabled===false)return json({error:'현재 일일퀘스트가 중지되어 있습니다.'},503);
      if(dailyQuestAdminExcluded(user,settings))return json({error:'운영 계정의 일일퀘스트 테스트가 중지되어 있습니다.'},403);
      const v=await env.DB.prepare("SELECT status,wago_nickname,wago_member_no FROM wago_verifications WHERE user_id=?").bind(user.id).first();
      if(v?.status!=='VERIFIED'||!v.wago_member_no)return json({error:'와고 2단계 인증 완료 후 이용할 수 있습니다.'},403);
      const today=kstDate();
      if(questType!=='POST')return json({error:'지원하지 않는 일일퀘스트입니다.'},400);
      if(settings.postEnabled===false)return json({error:'게시글 일일퀘스트가 중지되어 있습니다.'},503);
      const already=await env.DB.prepare('SELECT id FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?').bind(user.id,today).first();if(already)return json({error:'오늘 게시글 퀘스트 보상은 이미 수령했습니다.'},409);
      const oldPost=await env.DB.prepare('SELECT post_count,post_ids_json FROM wago_daily_quest_progress WHERE user_id=? AND quest_date=?').bind(user.id,today).first();
      const inspected=await inspectWagoDailyPosts(settings,v.wago_nickname);if(!inspected.ok)return json({error:inspected.error},502);
      // 같은 KST 날짜 안에서는 외부 검색 페이지 일시 누락 때문에 진행도가 감소하지 않도록 최고값을 유지한다.
      const stablePostCount=Math.max(Number(oldPost?.post_count||0),Number(inspected.postCount||0));
      const stablePostIds=[...new Set([...(JSON.parse(oldPost?.post_ids_json||'[]')),...inspected.postIds])];
      const required=Math.max(1,Number(settings.requiredPosts)||15),reward=Math.max(0,Number(settings.postRewardCoin)||1200);
      await env.DB.prepare(`INSERT INTO wago_daily_quest_progress(user_id,quest_date,post_count,post_ids_json,last_checked_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,quest_date) DO UPDATE SET post_count=excluded.post_count,post_ids_json=excluded.post_ids_json,last_checked_at=CURRENT_TIMESTAMP`).bind(user.id,today,stablePostCount,JSON.stringify(stablePostIds)).run();
      if(stablePostCount<required)return json({error:`오늘 SOOP 게시판 작성글이 ${stablePostCount}개입니다. ${required}개 작성 후 수령할 수 있습니다.`,postCount:stablePostCount,requiredPosts:required},409);
      const inserted=await env.DB.prepare('INSERT OR IGNORE INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count) VALUES(?,?,?,?)').bind(user.id,today,reward,stablePostCount).run();
      if(!inserted.meta.changes)return json({error:'오늘 게시글 퀘스트 보상은 이미 수령했습니다.'},409);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(reward,user.id),
        env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin+?,'WAGO_DAILY_QUEST' FROM users WHERE id=?").bind(reward,reward,user.id)
      ]);
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      return json({ok:true,questType:'POST',rewardCoin:reward,postCount:stablePostCount,user:await profile(env,updated)});
    }

    if(path==='messages'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      if(request.method==='GET'){const rows=await env.DB.prepare(`SELECT m.id,m.title,m.body,m.message_type,m.coupon_code,m.is_read,m.created_at,m.read_at,r.reward_type,r.reward_amount,r.claimed_at
        FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id AND r.user_id=m.user_id
        WHERE m.user_id=? AND m.hidden_at IS NULL ORDER BY m.id DESC LIMIT 100`).bind(user.id).all();return json({messages:rows.results,unread:rows.results.filter(x=>!x.is_read).length});}
      if(request.method==='PATCH'){const body=await readBody(request),id=Number(body.id);await env.DB.prepare('UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?').bind(id,user.id).run();return json({ok:true});}
    }
    if(path==='messages/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
      const body=await readBody(request),messageId=Number(body.messageId);if(!messageId)return json({error:'메시지 정보가 올바르지 않습니다.'},400);
      const reward=await env.DB.prepare(`SELECT r.id,r.reward_type,r.reward_amount,r.claimed_at,m.title FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE r.message_id=? AND r.user_id=?`).bind(messageId,user.id).first();
      if(!reward)return json({error:'수령할 보상이 없습니다.'},404);if(reward.claimed_at)return json({error:'이미 수령한 보상입니다.'},409);
      const rewardType=String(reward.reward_type||'').toUpperCase(),rewardAmount=Number(reward.reward_amount||0);
      if(!['COIN','SHARDS'].includes(rewardType)||rewardAmount<=0)return json({error:'지원하지 않는 메시지 보상입니다.'},400);
      const rewardUpdate=rewardType==='COIN'
        ? env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=? AND EXISTS (SELECT 1 FROM user_message_rewards WHERE id=? AND user_id=? AND claimed_at IS NULL)').bind(rewardAmount,user.id,reward.id,user.id)
        : env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=? AND EXISTS (SELECT 1 FROM user_message_rewards WHERE id=? AND user_id=? AND claimed_at IS NULL)').bind(rewardAmount,user.id,reward.id,user.id);
      const batch=await env.DB.batch([
        rewardUpdate,
        env.DB.prepare('UPDATE user_message_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND claimed_at IS NULL').bind(reward.id,user.id),
        env.DB.prepare('UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP),hidden_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(messageId,user.id)
      ]);
      if(!batch?.[1]?.meta?.changes)return json({error:'이미 수령한 보상입니다.'},409);
      const updated=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status FROM users WHERE id=?').bind(user.id).first();
      if(rewardType==='SHARDS')await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'CARD_RETIREMENT_REFUND')").bind(user.id,rewardAmount,Number(updated.card_shards||0)).run();
      return json({ok:true,rewardType,rewardAmount,messageDeleted:true,user:updated});
    }

    if(path==='admin/wago-verifications'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){const settings=await wagoVerificationSettings(env),rows=await env.DB.prepare(`SELECT w.*,u.nickname AS game_nickname FROM wago_verifications w JOIN users u ON u.id=w.user_id ORDER BY CASE w.status WHEN 'REVIEW' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,w.id DESC LIMIT 500`).all();return json({settings,verifications:rows.results});}
      if(request.method==='PATCH'){
        const body=await readBody(request);
        if(body.settings){if(admin.role!=='OWNER')return json({error:'인증 설정 변경은 OWNER만 가능합니다.'},403);const before=await wagoVerificationSettings(env),next={...before,enabled:body.settings.enabled!==false,postUrl:String(body.settings.postUrl||'').trim().slice(0,500),codeMinutes:Math.max(5,Math.min(60,Number(body.settings.codeMinutes)||20)),checkCooldownSeconds:Math.max(5,Math.min(60,Number(body.settings.checkCooldownSeconds)||10))};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('wago_verification_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(next)).run();await writeAdminLog(env,admin,'WAGO_SETTINGS','APP_META','wago_verification_settings_v1',before,next);return json({ok:true,settings:next});}
        const id=Number(body.id),action=String(body.action||'').toUpperCase();const before=await env.DB.prepare('SELECT * FROM wago_verifications WHERE id=?').bind(id).first();if(!before)return json({error:'인증 요청이 없습니다.'},404);
        if(action==='APPROVE'){const dup=await env.DB.prepare("SELECT id FROM wago_verifications WHERE wago_member_no=? AND status='VERIFIED' AND id<>?").bind(before.wago_member_no,id).first();if(dup)return json({error:'이미 인증된 회원번호입니다.'},409);await env.DB.prepare("UPDATE wago_verifications SET status='VERIFIED',verified_at=CURRENT_TIMESTAMP,reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(admin.id,String(body.note||'CMS 승인').slice(0,200),id).run();}
        else if(action==='REJECT')await env.DB.prepare("UPDATE wago_verifications SET status='REJECTED',reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(admin.id,String(body.note||'인증 정보 불일치').slice(0,200),id).run();
        else if(action==='RESET')await env.DB.prepare("UPDATE wago_verifications SET status='PENDING',verified_at=NULL,reviewed_by=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(admin.id,'재인증 요청',id).run();else return json({error:'올바르지 않은 처리입니다.'},400);
        await writeAdminLog(env,admin,`WAGO_${action}`,'WAGO_VERIFICATION',id,before,{action,note:body.note||''});return json({ok:true});
      }
    }
    if(path==='admin/verified-coin-message-send'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      const body=await readBody(request),title=String(body.title||'와고 2단계 인증 보상').trim().slice(0,100),messageBody=String(body.body||'와고 2단계 인증 완료 유저에게 지급되는 코인 보상입니다.').trim().slice(0,1000),rewardCoin=Math.max(1,Math.floor(Number(body.rewardCoin)||0)),includeOwner=body.includeOwner===true,includeAdmin=body.includeAdmin===true;
      if(!rewardCoin)return json({error:'지급 코인을 입력하세요.'},400);
      const users=await env.DB.prepare("SELECT w.user_id,u.nickname,UPPER(TRIM(COALESCE(u.role,'USER'))) AS role FROM wago_verifications w JOIN users u ON u.id=w.user_id WHERE UPPER(TRIM(COALESCE(w.status,'')))='VERIFIED' AND UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' AND (UPPER(TRIM(COALESCE(u.role,'USER'))) NOT IN ('OWNER','ADMIN') OR (?=1 AND UPPER(TRIM(COALESCE(u.role,'USER')))='OWNER') OR (?=1 AND UPPER(TRIM(COALESCE(u.role,'USER')))='ADMIN'))").bind(includeOwner?1:0,includeAdmin?1:0).all();let sent=0,sentUsers=0,sentOwners=0,sentAdmins=0;
      const recipients=users.results||[];
      for(let offset=0;offset<recipients.length;offset+=40){const chunk=recipients.slice(offset,offset+40),statements=[];for(const u of chunk){statements.push(env.DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type) VALUES(?,'ADMIN',?,?,'COIN_REWARD')").bind(u.user_id,title,messageBody));statements.push(env.DB.prepare("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(last_insert_rowid(),?,'COIN',?)").bind(u.user_id,rewardCoin));}if(statements.length)await env.DB.batch(statements);for(const u of chunk){sent++;if(u.role==='OWNER')sentOwners++;else if(u.role==='ADMIN')sentAdmins++;else sentUsers++;}}
      await writeAdminLog(env,admin,'VERIFIED_COIN_MESSAGE_SEND','USER_MESSAGE','VERIFIED_USERS',null,{sent,sentUsers,sentOwners,sentAdmins,rewardCoin,title,includeOwner,includeAdmin});return json({ok:true,sent,sentUsers,sentOwners,sentAdmins,rewardCoin});
    }

    if(path==='admin/verified-coupon-send'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'COUPON_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      const body=await readBody(request),campaign=String(body.campaignName||'와고 인증 쿠폰').trim().slice(0,80),rewardCoin=Math.max(0,Math.floor(Number(body.rewardCoin)||0)),title=String(body.title||'와고 인증 유저 쿠폰').trim().slice(0,100),messageBody=String(body.body||'와고 닉네임 2단계 인증 유저에게 지급된 쿠폰입니다.').trim().slice(0,1000),endsAt=body.endsAt?String(body.endsAt).slice(0,19):null,includeOwner=body.includeOwner===true,includeAdmin=body.includeAdmin===true;
      if(rewardCoin<=0)return json({error:'쿠폰 보상 코인을 입력하세요.'},400);
      const users=await env.DB.prepare("SELECT w.user_id,u.nickname,UPPER(TRIM(COALESCE(u.role,'USER'))) AS role FROM wago_verifications w JOIN users u ON u.id=w.user_id WHERE UPPER(TRIM(COALESCE(w.status,'')))='VERIFIED' AND UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' AND (UPPER(TRIM(COALESCE(u.role,'USER'))) NOT IN ('OWNER','ADMIN') OR (?=1 AND UPPER(TRIM(COALESCE(u.role,'USER')))='OWNER') OR (?=1 AND UPPER(TRIM(COALESCE(u.role,'USER')))='ADMIN'))").bind(includeOwner?1:0,includeAdmin?1:0).all();let sent=0,sentUsers=0,sentOwners=0,sentAdmins=0;
      const recipients=users.results||[];
      for(let offset=0;offset<recipients.length;offset+=25){const chunk=recipients.slice(offset,offset+25),statements=[];for(const u of chunk){const code=`WG-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;statements.push(env.DB.prepare('INSERT INTO coupons(code,reward_coin,ends_at,max_uses,is_active,created_by) VALUES(?,?,?,1,1,?)').bind(code,rewardCoin,endsAt,admin.id));statements.push(env.DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,coupon_code) VALUES(?,'ADMIN',?,?,'COUPON',?)").bind(u.user_id,title,messageBody,code));statements.push(env.DB.prepare('INSERT INTO verified_coupon_deliveries(user_id,coupon_id,message_id,campaign_name) SELECT ?,c.id,m.id,? FROM coupons c JOIN user_messages m ON m.coupon_code=c.code AND m.user_id=? WHERE c.code=? ORDER BY m.id DESC LIMIT 1').bind(u.user_id,campaign,u.user_id,code));}if(statements.length)await env.DB.batch(statements);for(const u of chunk){sent++;if(u.role==='OWNER')sentOwners++;else if(u.role==='ADMIN')sentAdmins++;else sentUsers++;}}
      await writeAdminLog(env,admin,'VERIFIED_COUPON_SEND','COUPON_CAMPAIGN',campaign,null,{sent,sentUsers,sentOwners,sentAdmins,rewardCoin,endsAt,includeOwner,includeAdmin});return json({ok:true,sent,sentUsers,sentOwners,sentAdmins,rewardCoin});
    }

    if(path==='recent-high-grade'){
      const rows=await env.DB.prepare(`SELECT u.nickname,c.title AS card_title,c.rarity,d.created_at
        FROM draw_logs d
        JOIN users u ON u.id=d.user_id
        JOIN cards c ON c.id=d.card_id
        WHERE d.rarity IN ('SSR','MA','FUR','LIMITED') AND u.status='ACTIVE'
        ORDER BY d.id DESC LIMIT 20`).all();
      return json({items:rows.results});
    }
    if(path==='ranking'){
      const settings=await battleSettings(env),tiers=(await tierSettings(env)).cardScoreTiers;
      const rows=await env.DB.prepare(`SELECT u.id,u.nickname,c.rarity,c.power_type,c.base_power,uc.breakthrough_level,COUNT(uc.card_id) OVER(PARTITION BY u.id) AS card_count
        FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id
        WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY u.id`).all();
      const map=new Map();for(const r of rows.results){if(!map.has(r.id))map.set(r.id,{nickname:r.nickname,score:0,card_count:0,max_breakthrough:0});const x=map.get(r.id);if(r.rarity){x.score+=cardBattlePower(r,Number(r.breakthrough_level||0),settings);x.card_count++;x.max_breakthrough=Math.max(x.max_breakthrough,Number(r.breakthrough_level||0));}}
      const ranking=[...map.values()].sort((a,b)=>b.score-a.score||b.card_count-a.card_count||a.nickname.localeCompare(b.nickname,'ko')).slice(0,100).map((x,i)=>({...x,rank:i+1,tier:resolveTier(x.score,tiers)}));
      return json({ranking,tiers});
    }


    if(path==='coupon/redeem'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const code=String(payload.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40);
      if(!code) return json({error:'쿠폰 코드를 입력하세요.'},400);
      const coupon=await env.DB.prepare(`SELECT * FROM coupons WHERE code=? AND is_active=1
        AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now'))`).bind(code).first();
      if(!coupon) return json({error:'존재하지 않거나 사용 기간이 끝난 쿠폰입니다.'},404);
      if(coupon.used_count>=coupon.max_uses) return json({error:'쿠폰 사용 한도가 모두 소진되었습니다.'},409);
      const used=await env.DB.prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_id=? AND user_id=?').bind(coupon.id,user.id).first();
      if(used) return json({error:'이미 사용한 쿠폰입니다.'},409);
      const nextCoin=user.coin+coupon.reward_coin;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO coupon_redemptions(coupon_id,user_id,reward_coin) VALUES(?,?,?)').bind(coupon.id,user.id,coupon.reward_coin),
        env.DB.prepare('UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND used_count<max_uses').bind(coupon.id),
        env.DB.prepare('UPDATE users SET coin=? WHERE id=?').bind(nextCoin,user.id),
        env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'COUPON')").bind(user.id,coupon.reward_coin,nextCoin)
      ]);
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      return json({ok:true,rewardCoin:coupon.reward_coin,user:await profile(env,updated)});
    }

    if(path==='admin/daily-quests'){
      const admin=await requirePermission(request,env,'USER_MANAGE');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const settings=await wagoDailyQuestSettings(env),today=kstDate();
        const statsRow=await env.DB.prepare(`SELECT
          (SELECT COUNT(DISTINCT user_id) FROM wago_daily_quest_progress WHERE quest_date=?) AS participants,
          (SELECT COUNT(*) FROM wago_daily_quest_progress WHERE quest_date=? AND post_count>=?) AS postCompleted,
          (SELECT COUNT(*) FROM wago_daily_quest_claims WHERE quest_date=?) AS postClaims,
          (SELECT COALESCE(SUM(reward_coin),0) FROM wago_daily_quest_claims WHERE quest_date=?) AS postCoins`).bind(today,today,Number(settings.requiredPosts||15),today,today).first();
        const users=await env.DB.prepare(`SELECT u.nickname,u.role,w.wago_nickname,COALESCE(p.post_count,0) AS post_count,p.last_checked_at,pc.claimed_at AS post_claimed_at
          FROM users u LEFT JOIN wago_verifications w ON w.user_id=u.id
          LEFT JOIN wago_daily_quest_progress p ON p.user_id=u.id AND p.quest_date=?
          LEFT JOIN wago_daily_quest_claims pc ON pc.user_id=u.id AND pc.quest_date=?
          WHERE p.user_id IS NOT NULL OR pc.user_id IS NOT NULL
          ORDER BY COALESCE(p.last_checked_at,pc.claimed_at) DESC LIMIT 300`).bind(today,today).all();
        const claims=await env.DB.prepare(`SELECT u.nickname,'POST' AS quest_type,c.reward_coin,c.claimed_at FROM wago_daily_quest_claims c JOIN users u ON u.id=c.user_id ORDER BY c.claimed_at DESC LIMIT 200`).all();
        return json({settings:{...settings,commentEnabled:false},stats:statsRow||{},users:users.results,claims:claims.results});
      }
      if(request.method==='PATCH'){
        if(admin.role!=='OWNER')return json({error:'일일퀘스트 설정 변경은 OWNER만 가능합니다.'},403);
        const body=await readBody(request),before=await wagoDailyQuestSettings(env),v=body.settings||{};
        const next={...before,enabled:v.enabled!==false,postEnabled:v.postEnabled!==false,commentEnabled:false,boardUrl:'https://ygosu.com/board/soop',requiredPosts:Math.max(1,Math.min(200,Number(v.requiredPosts)||15)),postRewardCoin:Math.max(0,Math.floor(Number(v.postRewardCoin??v.rewardCoin)||1200)),maxPages:Math.max(1,Math.min(20,Number(v.maxPages)||10)),checkCooldownSeconds:Math.max(5,Math.min(300,Number(v.checkCooldownSeconds)||20)),adminTestAllowed:v.adminTestAllowed!==false};
        next.rewardCoin=next.postRewardCoin;
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('wago_daily_quest_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(next)).run();
        await writeAdminLog(env,admin,'DAILY_QUEST_SETTINGS','APP_META','wago_daily_quest_settings_v1',before,next);
        return json({ok:true,settings:next});
      }
    }

    if(path==='admin/dashboard'){
      const admin=await requirePermission(request,env,'DASHBOARD');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const [users,usersToday,cards,draws,coins,banned,coupons,urOwned,ssrOwned]=await Promise.all([
        env.DB.prepare('SELECT COUNT(*) count FROM users').first(),
        env.DB.prepare("SELECT COUNT(*) count FROM users WHERE date(created_at)=date('now','localtime')").first(),
        env.DB.prepare('SELECT COUNT(*) count FROM cards WHERE is_active=1').first(),
        env.DB.prepare("SELECT COUNT(*) count FROM draw_logs WHERE created_at>=datetime('now','-1 day')").first(),
        env.DB.prepare('SELECT COALESCE(SUM(coin),0) total FROM users').first(),
        env.DB.prepare("SELECT COUNT(*) count FROM users WHERE status!='ACTIVE' OR (banned_until IS NOT NULL AND banned_until>datetime('now'))").first(),
        env.DB.prepare("SELECT COUNT(*) count FROM coupons WHERE is_active=1 AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now'))").first(),
        env.DB.prepare("SELECT COUNT(*) count FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE c.rarity='UR'").first(),
        env.DB.prepare("SELECT COUNT(*) count FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE c.rarity='SSR'").first()
      ]);
      return json({role:admin.role,admin:{id:admin.id,nickname:admin.nickname,role:admin.role,last_login_at:admin.last_login_at},stats:{users:users.count,usersToday:usersToday.count,cards:cards.count,draws24h:draws.count,totalCoin:coins.total,banned:banned.count,coupons:coupons.count,urOwned:urOwned.count,ssrOwned:ssrOwned.count}});
    }

    if(path==='admin/logs'){
      const admin=await requirePermission(request,env,'ADMIN_LOG'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      const rows=await env.DB.prepare(`SELECT l.*,u.nickname AS admin_nickname FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id ORDER BY l.id DESC LIMIT 300`).all();
      return json({logs:rows.results});
    }

    if(path==='admin/tiers'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'티어 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const settings=await tierSettings(env),battle=await battleSettings(env),livePvp=await pvpSettings(env);settings.pvp={...settings.pvp,...livePvp};
        const rows=await env.DB.prepare(`SELECT u.nickname,c.rarity,c.power_type,c.base_power,uc.breakthrough_level FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`).all();
        const map=new Map();for(const r of rows.results){if(!map.has(r.nickname))map.set(r.nickname,{nickname:r.nickname,score:0});if(r.rarity)map.get(r.nickname).score+=cardBattlePower(r,Number(r.breakthrough_level||0),battle)}
        const pvpRows=await env.DB.prepare(`SELECT u.nickname,p.season_score,p.highest_score,p.wins,p.losses FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname LIMIT 100`).all();
        const pvpStats=await env.DB.prepare(`SELECT COUNT(*) AS profiles,COALESCE(SUM(wins+losses),0)/2 AS matches,COALESCE(MAX(season_score),0) AS top_score FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`).first();
        const settlement=await env.DB.prepare('SELECT id,season_key,season_name,status,participant_count,reward_user_count,message_count,started_at,completed_at,error_message FROM pvp_season_settlements WHERE season_key=? ORDER BY id DESC LIMIT 1').bind(pvpSeasonKey(livePvp)).first();
        return json({settings,ranking:[...map.values()].sort((a,b)=>b.score-a.score).slice(0,100),pvpRanking:pvpRows.results.map((x,i)=>({...x,rank:i+1,tier:resolveTier(Number(x.season_score),livePvp.tiers)})),pvpStats,pvpSettlement:settlement||null});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request),before={tiers:await tierSettings(env),pvp:await pvpSettings(env)},base=defaultTierSettings();
        const tiers=(Array.isArray(payload.cardScoreTiers)?payload.cardScoreTiers:before.tiers.cardScoreTiers).map((t,i)=>({id:String(t.id||base.cardScoreTiers[i]?.id||('tier'+i)).replace(/[^a-z0-9_-]/gi,'').slice(0,30),name:String(t.name||'티어').slice(0,20),min:Math.max(0,Math.floor(Number(t.min)||0)),color:/^#[0-9a-f]{6}$/i.test(String(t.color||''))?String(t.color):'#7ceeff',aura:t.aura!==false})).sort((a,b)=>a.min-b.min);
        const livePvp=cleanPvpSettings({...before.pvp,...(payload.pvp||{})}),clean={cardScoreTiers:tiers,pvp:livePvp};
        if(livePvp.endsAt&&livePvp.startsAt&&new Date(livePvp.endsAt)<=new Date(livePvp.startsAt))return json({error:'시즌 종료일은 시작일보다 뒤여야 합니다.'},400);
        await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tier_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)),env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('pvp_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(livePvp))]);await writeAdminLog(env,admin,'PVP_SEASON_SETTINGS_UPDATE','SETTINGS','pvp',before,clean);return json({ok:true,settings:clean});
      }
    }


    if(path==='admin/pvp-settlement'){
      const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'PvP 정산 권한이 없습니다.'},403);
      const settings=await pvpSettings(env),seasonKey=pvpSeasonKey(settings);
      const rankedRows=await env.DB.prepare(`SELECT u.id AS user_id,u.nickname,p.season_score,p.highest_score,p.wins,p.losses FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN') AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')) ORDER BY p.season_score DESC,p.wins DESC,u.nickname`).all();
      const tierClaims=await env.DB.prepare('SELECT user_id FROM pvp_reward_claims WHERE season_name=?').bind(settings.seasonName).all(),rankClaims=await env.DB.prepare('SELECT user_id FROM pvp_rank_reward_claims WHERE season_name=?').bind(settings.seasonName).all(),tierClaimed=new Set(tierClaims.results.map(x=>Number(x.user_id))),rankClaimed=new Set(rankClaims.results.map(x=>Number(x.user_id)));
      const preview=rankedRows.results.map((x,i)=>{const row={...x,final_rank:i+1},r=pvpSettlementRewardFor(row,settings,tierClaimed.has(Number(x.user_id)),rankClaimed.has(Number(x.user_id)));return {...row,tier:r.tier,rewardCoin:r.tierCoin+r.rankCoin,rewardShards:r.tierShards+r.rankShards}});
      const existing=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE season_key=?').bind(seasonKey).first();
      if(request.method==='GET')return json({settings,existing:existing||null,preview:preview.slice(0,100),summary:{participants:preview.length,rewardUsers:preview.filter(x=>x.rewardCoin>0||x.rewardShards>0).length,rewardCoin:preview.reduce((a,x)=>a+x.rewardCoin,0),rewardShards:preview.reduce((a,x)=>a+x.rewardShards,0)}});
      if(request.method==='POST'){
        const body=await readBody(request),confirmName=String(body.confirmSeasonName||'').trim();
        if(settings.enabled!==false)return json({error:'안전을 위해 PvP 사용 여부를 OFF로 저장한 뒤 정산하세요.'},409);
        if(!settings.seasonName||confirmName!==settings.seasonName)return json({error:'확인용 시즌명이 현재 시즌명과 일치하지 않습니다.'},400);
        if(existing?.status==='COMPLETED')return json({error:'이미 정산이 완료된 시즌입니다.',settlement:existing},409);
        let settlement=existing;
        if(!settlement){await env.DB.prepare("INSERT INTO pvp_season_settlements(season_key,season_name,season_title,status,initial_score,participant_count,created_by) VALUES(?,?,?,'PREPARING',?,?,?)").bind(seasonKey,settings.seasonName,settings.seasonTitle||'',Number(settings.initialScore||1000),preview.length,admin.id).run();settlement=await env.DB.prepare('SELECT * FROM pvp_season_settlements WHERE season_key=?').bind(seasonKey).first()}
        const sid=Number(settlement.id);
        try {
          // 1) 최종 순위 스냅샷 저장
          for (let offset = 0; offset < preview.length; offset += 40) {
            const chunk = preview.slice(offset, offset + 40);
            const statements = chunk.map((row) =>
              env.DB.prepare(`INSERT OR IGNORE INTO pvp_season_settlement_ranks(
                settlement_id,user_id,nickname,final_rank,season_score,highest_score,
                wins,losses,tier_id,tier_name,reward_coin,reward_shards
              ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
                sid,
                row.user_id,
                row.nickname,
                row.final_rank,
                row.season_score,
                row.highest_score,
                row.wins,
                row.losses,
                row.tier?.id || '',
                row.tier?.name || '',
                row.rewardCoin,
                row.rewardShards
              )
            );
            if (statements.length) await env.DB.batch(statements);
          }

          const snapshotCount = await env.DB
            .prepare('SELECT COUNT(*) count FROM pvp_season_settlement_ranks WHERE settlement_id=?')
            .bind(sid)
            .first();
          if (Number(snapshotCount.count) !== preview.length) {
            throw new Error(`최종 순위 스냅샷 검증 실패 (${snapshotCount.count}/${preview.length})`);
          }

          await env.DB
            .prepare("UPDATE pvp_season_settlements SET status='SNAPSHOTTED',participant_count=?,error_message=NULL WHERE id=?")
            .bind(preview.length, sid)
            .run();

          // 2) 보상 메시지 생성 및 연결
          const rewardRows = await env.DB
            .prepare('SELECT * FROM pvp_season_settlement_ranks WHERE settlement_id=? AND (reward_coin>0 OR reward_shards>0) ORDER BY final_rank')
            .bind(sid)
            .all();

          let expectedMessages = 0;
          for (const row of rewardRows.results) {
            const rewards = [
              ['COIN', Number(row.reward_coin || 0)],
              ['SHARDS', Number(row.reward_shards || 0)]
            ];

            for (const [rewardType, amount] of rewards) {
              if (amount <= 0) continue;
              expectedMessages += 1;

              await env.DB
                .prepare("INSERT OR IGNORE INTO pvp_season_settlement_deliveries(settlement_id,user_id,reward_type,reward_amount,status) VALUES(?,?,?,?,'RESERVED')")
                .bind(sid, row.user_id, rewardType, amount)
                .run();

              const delivery = await env.DB
                .prepare('SELECT * FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND user_id=? AND reward_type=?')
                .bind(sid, row.user_id, rewardType)
                .first();

              if (!delivery) throw new Error(`보상 예약 생성 실패: ${row.nickname} ${rewardType}`);
              if (delivery.status === 'SENT') continue;

              const title = `${settings.seasonName} PvP 시즌 정산 보상`;
              const unit = rewardType === 'COIN' ? '코인' : '카드조각';
              const bodyText = `${settings.seasonName} 최종 ${row.final_rank}위 (${row.tier_name}) 정산 보상입니다.\n\n${unit} ${amount.toLocaleString()}개\n\n아래 보상 수령 버튼을 눌러주세요.`;

              const messageInsert = await env.DB
                .prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type) VALUES(?,'SYSTEM',?,?,'PVP_SEASON_REWARD')")
                .bind(row.user_id, title, bodyText)
                .run();

              const messageId = Number(messageInsert.meta?.last_row_id || 0);
              if (!messageId) throw new Error(`보상 메시지 생성 실패: ${row.nickname} ${rewardType}`);

              await env.DB.batch([
                env.DB
                  .prepare("UPDATE pvp_season_settlement_deliveries SET message_id=?,status='SENT',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RESERVED'")
                  .bind(messageId, delivery.id),
                env.DB
                  .prepare('INSERT OR IGNORE INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(?,?,?,?)')
                  .bind(messageId, row.user_id, rewardType, amount)
              ]);

              const linked = await env.DB
                .prepare("SELECT COUNT(*) count FROM pvp_season_settlement_deliveries WHERE id=? AND status='SENT' AND message_id=?")
                .bind(delivery.id, messageId)
                .first();
              if (Number(linked.count) !== 1) {
                throw new Error(`보상 메시지 연결 실패: ${row.nickname} ${rewardType}`);
              }
            }
          }

          const sent = await env.DB
            .prepare("SELECT COUNT(*) count FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND status='SENT'")
            .bind(sid)
            .first();
          if (Number(sent.count) !== expectedMessages) {
            throw new Error(`보상 메시지 검증 실패 (${sent.count}/${expectedMessages})`);
          }

          await env.DB
            .prepare("UPDATE pvp_season_settlements SET status='MESSAGES_READY',reward_user_count=?,message_count=?,error_message=NULL WHERE id=?")
            .bind(rewardRows.results.length, expectedMessages, sid)
            .run();

          // 3) 보상 메시지가 모두 준비된 뒤 PvP 시즌 기록만 초기화
          const initialScore = Number(settings.initialScore || 1000);
          const reset = await env.DB
            .prepare('UPDATE pvp_profiles SET season_score=?,highest_score=?,wins=0,losses=0,updated_at=CURRENT_TIMESTAMP')
            .bind(initialScore, initialScore)
            .run();

          const verify = await env.DB
            .prepare('SELECT COUNT(*) bad FROM pvp_profiles WHERE season_score<>? OR highest_score<>? OR wins<>0 OR losses<>0')
            .bind(initialScore, initialScore)
            .first();
          if (Number(verify.bad) !== 0) {
            throw new Error(`시즌 랭킹 초기화 검증 실패 (${verify.bad}건)`);
          }

          await env.DB
            .prepare("UPDATE pvp_season_settlements SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=?")
            .bind(sid)
            .run();

          await writeAdminLog(
            env,
            admin,
            'PVP_SEASON_SETTLEMENT',
            'PVP_SEASON',
            settings.seasonName,
            null,
            {
              settlementId: sid,
              participants: preview.length,
              rewardUsers: rewardRows.results.length,
              messages: expectedMessages,
              resetProfiles: Number(reset.meta?.changes || 0)
            }
          );

          return json({
            ok: true,
            settlementId: sid,
            participants: preview.length,
            rewardUsers: rewardRows.results.length,
            messages: expectedMessages,
            resetProfiles: Number(reset.meta?.changes || 0)
          });
        } catch (error) {
          await env.DB
            .prepare("UPDATE pvp_season_settlements SET status=CASE WHEN status='MESSAGES_READY' THEN status ELSE 'FAILED' END,error_message=? WHERE id=?")
            .bind(String(error?.message || error).slice(0, 500), sid)
            .run();
          return json({ error: `정산이 중단되었습니다: ${String(error?.message || error)}` }, 500);
        }
      }
    }

    if(path==='admin/breakthrough-settings'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET') return json({config:await breakthroughConfig(env),grades:BREAKTHROUGH_GRADES});
      if(request.method==='PATCH'){
        const payload=await readBody(request),incoming=payload.config;
        if(!incoming||typeof incoming!=='object')return json({error:'돌파 설정값이 없습니다.'},400);
        const clean=defaultBreakthroughConfig();
        for(const grade of BREAKTHROUGH_GRADES){
          if(!Array.isArray(incoming[grade])||incoming[grade].length!==10)return json({error:`${grade} 등급은 10단계 설정이 필요합니다.`},400);
          for(let i=0;i<10;i++){
            const cost=Number(incoming[grade][i]?.cost),rate=Number(incoming[grade][i]?.rate);
            if(!Number.isInteger(cost)||cost<1||cost>10000000)return json({error:`${grade} ★${i}→★${i+1} 조각 비용을 확인하세요.`},400);
            if(!Number.isFinite(rate)||rate<0||rate>100)return json({error:`${grade} ★${i}→★${i+1} 성공 확률은 0~100%입니다.`},400);
            clean[grade][i]={cost,rate:Math.round(rate*10000)/10000};
          }
        }
        const before=await breakthroughConfig(env);
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('breakthrough_config',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)).run();
        await writeAdminLog(env,admin,'BREAKTHROUGH_SETTINGS_UPDATE','SETTINGS','breakthrough',before,clean);
        return json({ok:true,config:clean});
      }
    }



    if(path==='admin/raid'){
      const admin=await requirePermission(request,env,'DASHBOARD');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);if(admin.role!=='OWNER')return json({error:'레이드 관리는 OWNER 전용입니다.'},403);
      const payload=request.method==='GET'?{}:await readBody(request);
      if(request.method==='GET'){
        const [bosses,current,policies]=await Promise.all([env.DB.prepare('SELECT id,name,image_url AS image,max_hp AS maxHp,defense_rate AS defenseRate,is_active AS isActive,sort_order AS sortOrder,created_at AS createdAt,updated_at AS updatedAt FROM raid_bosses ORDER BY sort_order,id').all(),env.DB.prepare("SELECT ri.id,ri.status,ri.starts_at AS startsAt,ri.ends_at AS endsAt,ri.current_hp AS currentHp,ri.participant_count AS participantCount,rb.name AS bossName,rb.max_hp AS maxHp FROM raid_instances ri JOIN raid_bosses rb ON rb.id=ri.boss_id WHERE ri.status IN ('LOBBY','BATTLE') ORDER BY ri.id DESC LIMIT 1").first(),raidBossOpenPolicies(env)]);
        return json({settings:await raidSettings(env),bosses:bosses.results.map(b=>({...b,userOpenEnabled:Boolean(policies[String(b.id)]?.enabled),openCost:Number(policies[String(b.id)]?.cost||0)})),current:current||null});
      }
      if(request.method==='PATCH'&&payload.settings){const before=await raidSettings(env),clean=cleanRaidSettings(payload.settings);if(clean.minParticipants>clean.maxParticipants)return json({error:'최소 시작 인원은 최대 참가 인원보다 클 수 없습니다.'},400);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)).run();const saved=await raidSettings(env);if(Number(saved.dailyEntries)!==Number(clean.dailyEntries))return json({error:'1일 레이드 참가 횟수 저장 검증에 실패했습니다.'},500);await writeAdminLog(env,admin,'RAID_SETTINGS_UPDATE','SETTINGS','raid',before,saved);return json({ok:true,settings:saved});}
      if(request.method==='POST'&&payload.action==='CREATE_BOSS'){const name=String(payload.name||'').trim().slice(0,40),image=String(payload.image||'').trim().slice(0,500),maxHp=Math.max(1,Math.floor(Number(payload.maxHp)||1)),defenseRate=Math.max(0,Math.min(99,Number(payload.defenseRate)||0)),sortOrder=Math.floor(Number(payload.sortOrder)||0);if(!name)return json({error:'레이드 보스 이름을 입력하세요.'},400);const r=await env.DB.prepare('INSERT INTO raid_bosses(name,image_url,max_hp,defense_rate,is_active,sort_order) VALUES(?,?,?,?,?,?)').bind(name,image,maxHp,defenseRate,payload.isActive===false?0:1,sortOrder).run();const policies=await raidBossOpenPolicies(env);policies[String(r.meta.last_row_id)]={enabled:payload.userOpenEnabled===true,cost:Math.max(0,Math.floor(Number(payload.openCost)||0))};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_user_open_bosses_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(policies)).run();await writeAdminLog(env,admin,'RAID_BOSS_CREATE','RAID_BOSS',String(r.meta.last_row_id),null,{name,maxHp});return json({ok:true,id:r.meta.last_row_id},201);}
      if(request.method==='PATCH'&&payload.boss){const b=payload.boss,id=Number(b.id);if(!id)return json({error:'보스 ID가 필요합니다.'},400);await env.DB.prepare('UPDATE raid_bosses SET name=?,image_url=?,max_hp=?,defense_rate=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(b.name||'').trim().slice(0,40),String(b.image||'').trim().slice(0,500),Math.max(1,Math.floor(Number(b.maxHp)||1)),Math.max(0,Math.min(99,Number(b.defenseRate)||0)),b.isActive===false?0:1,Math.floor(Number(b.sortOrder)||0),id).run();const policies=await raidBossOpenPolicies(env);policies[String(id)]={enabled:b.userOpenEnabled===true,cost:Math.max(0,Math.min(100000000,Math.floor(Number(b.openCost)||0)))};await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('raid_user_open_bosses_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(policies)).run();await writeAdminLog(env,admin,'RAID_BOSS_UPDATE','RAID_BOSS',String(id),null,b);return json({ok:true,boss:{...b,...policies[String(id)]}});}
      if(request.method==='POST'&&payload.action==='START'){const bossId=Number(payload.bossId),boss=await env.DB.prepare('SELECT * FROM raid_bosses WHERE id=? AND is_active=1').bind(bossId).first();if(!boss)return json({error:'활성 레이드 보스를 선택하세요.'},400);const active=await env.DB.prepare("SELECT COUNT(*) count FROM raid_instances WHERE status IN ('LOBBY','BATTLE')").first();if(Number(active?.count||0)>=10)return json({error:'동시에 개설 가능한 레이드 방 10개가 모두 사용 중입니다.'},409);const cfg=await raidSettings(env),schedule=raidScheduleState(cfg,admin);if(!schedule.isOpen)return json({error:'현재는 CMS에서 설정한 레이드 개방 시간이 아닙니다.',schedule},403);const startsAt=new Date(Date.now()+cfg.lobbySeconds*1000).toISOString(),endsAt=new Date(Date.now()+(cfg.lobbySeconds+cfg.battleSeconds)*1000).toISOString(),r=await env.DB.prepare("INSERT INTO raid_instances(boss_id,status,starts_at,ends_at,current_hp,participant_count) VALUES(?,'LOBBY',?,?,?,0)").bind(bossId,startsAt,endsAt,boss.max_hp).run();await raidRewardSnapshot(env,Number(r.meta.last_row_id),cfg,true);await writeAdminLog(env,admin,'RAID_START','RAID_INSTANCE',String(r.meta.last_row_id),null,{bossId});return json({ok:true,id:r.meta.last_row_id});}
      if(request.method==='POST'&&payload.action==='END'){const id=Number(payload.instanceId);if(!id)return json({error:'진행 중 레이드가 없습니다.'},400);await env.DB.prepare("UPDATE raid_instances SET status='ENDED',ends_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();await writeAdminLog(env,admin,'RAID_FORCE_END','RAID_INSTANCE',String(id),null,null);return json({ok:true});}
    }

    if(path==='admin/battle'){
      const admin=await requirePermission(request,env,'CARD_EDIT'); if(!admin)return json({error:'전투 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const monsters=await env.DB.prepare('SELECT id,name,image_url AS image,battle_power AS battlePower,reward_coin AS rewardCoin,is_boss AS isBoss,is_active AS isActive,sort_order AS sortOrder FROM battle_monsters ORDER BY sort_order,id').all();
        return json({settings:await battleSettings(env),monsters:monsters.results});
      }
      const payload=await readBody(request);
      if(request.method==='PATCH'&&Array.isArray(payload.ultimateRules)){
        const before=await battleSettings(env);
        const ultimateRules=payload.ultimateRules.slice(0,50).map((u,i)=>({enabled:u?.enabled!==false,name:String(u?.name||`ULTIMATE ${i+1}`).slice(0,40),requiredGrade:String(u?.requiredGrade||'SSR').toUpperCase(),minBreakthrough:Math.max(0,Math.min(20,Math.floor(Number(u?.minBreakthrough||0)))),requiredCount:Math.max(1,Math.min(5,Math.floor(Number(u?.requiredCount||1)))),activationChance:Math.max(0,Math.min(100,Number(u?.activationChance??100))),mediaUrl:String(u?.mediaUrl||'/assets/effects/SKILL.gif').replace(/\\/g,'/').slice(0,500),durationMs:Math.max(800,Math.min(30000,Math.floor(Number(u?.durationMs||3000)))),coefficientPercent:Math.max(0,Math.min(100000,Number(u?.coefficientPercent??u?.damageValue??500)))}));
        const clean={...before,ultimateRules};
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean)).run();
        const saved=await battleSettings(env);
        await writeAdminLog(env,admin,'ULTIMATE_SETTINGS_UPDATE','SETTINGS','battle_ultimate',before.ultimateRules,saved.ultimateRules);
        return json({ok:true,settings:saved,ultimateRules:saved.ultimateRules});
      }
      if(request.method==='PATCH'&&payload.settings){const before=await battleSettings(env),base=defaultBattleSettings(),x=payload.settings;const clean={enabled:x.enabled!==false,deckSize:5,powerByGrade:Object.fromEntries(Object.keys(base.powerByGrade).map(g=>[g,Math.max(0,Math.floor(Number(x.powerByGrade?.[g]??base.powerByGrade[g])))])),breakthroughBonus:base.breakthroughBonus.map((v,i)=>Math.max(0,Number(x.breakthroughBonus?.[i]??v))),cardDrop:{enabled:x.cardDrop?.enabled!==false,defaultRate:Math.max(0,Math.min(100,Number(x.cardDrop?.defaultRate??base.cardDrop.defaultRate))),gradeRates:Object.fromEntries(Object.keys(base.cardDrop.gradeRates).map(g=>[g,Math.max(0,Math.min(100,Number(x.cardDrop?.gradeRates?.[g]??base.cardDrop.gradeRates[g])))]))},energy:{enabled:x.energy?.enabled!==false,maxEnergy:Math.max(1,Math.min(999,Math.floor(Number(x.energy?.maxEnergy??base.energy.maxEnergy)))),dailyRestore:Math.max(0,Math.min(999,Math.floor(Number(x.energy?.dailyRestore??base.energy.dailyRestore)))),rechargeMinutes:Math.max(1,Math.min(1440,Math.floor(Number(x.energy?.rechargeMinutes??base.energy.rechargeMinutes)))),costPerBattle:Math.max(1,Math.min(99,Math.floor(Number(x.energy?.costPerBattle??base.energy.costPerBattle)))),adminUnlimited:x.energy?.adminUnlimited!==false,testUnlimited:x.energy?.testUnlimited!==false},ultimateRules:(Array.isArray(x.ultimateRules)?x.ultimateRules:[]).slice(0,50).map((u,i)=>({enabled:u?.enabled!==false,name:String(u?.name||`ULTIMATE ${i+1}`).slice(0,40),requiredGrade:String(u?.requiredGrade||'SSR').toUpperCase(),minBreakthrough:Math.max(0,Math.min(20,Math.floor(Number(u?.minBreakthrough||0)))),requiredCount:Math.max(1,Math.min(5,Math.floor(Number(u?.requiredCount||1)))),activationChance:Math.max(0,Math.min(100,Number(u?.activationChance??100))),mediaUrl:String(u?.mediaUrl||'/assets/effects/SKILL.gif').replace(/\\/g,'/').slice(0,500),durationMs:Math.max(800,Math.min(30000,Math.floor(Number(u?.durationMs||3000)))),coefficientPercent:Math.max(0,Math.min(100000,Number(u?.coefficientPercent??u?.damageValue??500)))}))};const gradeRateTotal=Object.values(clean.cardDrop.gradeRates).reduce((a,b)=>a+Number(b||0),0);if(Math.abs(gradeRateTotal-100)>0.001)return json({error:`카드 드롭 등급 확률 합계가 100%여야 합니다. 현재 ${gradeRateTotal.toFixed(2)}%입니다.`},400);await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('battle_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean)).run();await writeAdminLog(env,admin,'BATTLE_SETTINGS_UPDATE','SETTINGS','battle',before,clean);return json({ok:true,settings:clean});}
      if(request.method==='POST'){const name=String(payload.name||'').trim().slice(0,40),image=String(payload.image||'').trim().slice(0,500),power=Math.max(1,Math.floor(Number(payload.battlePower)||1)),reward=Math.max(0,Math.floor(Number(payload.rewardCoin)||0));if(!name)return json({error:'몬스터 이름을 입력하세요.'},400);const r=await env.DB.prepare('INSERT INTO battle_monsters(name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order) VALUES(?,?,?,?,?,?,?)').bind(name,image,power,reward,payload.isBoss?1:0,payload.isActive===false?0:1,Math.floor(Number(payload.sortOrder)||0)).run();return json({ok:true,id:r.meta.last_row_id},201);}
      if(request.method==='PATCH'){const id=Number(payload.id);if(!id)return json({error:'몬스터 ID가 필요합니다.'},400);await env.DB.prepare('UPDATE battle_monsters SET name=?,image_url=?,battle_power=?,reward_coin=?,is_boss=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(payload.name||'').trim().slice(0,40),String(payload.image||'').trim().slice(0,500),Math.max(1,Math.floor(Number(payload.battlePower)||1)),Math.max(0,Math.floor(Number(payload.rewardCoin)||0)),payload.isBoss?1:0,payload.isActive===false?0:1,Math.floor(Number(payload.sortOrder)||0),id).run();return json({ok:true});}
      if(request.method==='DELETE'){const id=Number(payload.id);await env.DB.prepare('UPDATE battle_monsters SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run();return json({ok:true});}
    }

    if(path==='admin/mineral-exchange'){
      const admin=await requirePermission(request,env,'DASHBOARD');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const settings=await mineralExchangeSettings(env),rows=await env.DB.prepare(`SELECT r.*,u.nickname AS current_game_nickname,a.nickname AS reviewer_name FROM mineral_exchange_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users a ON a.id=r.reviewed_by ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.id DESC LIMIT 300`).all();
        return json({settings,requests:rows.results});
      }
      if(request.method==='PATCH'){
        const body=await readBody(request);
        if(body.settings){const settings=cleanMineralExchangeSettings(body.settings);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('mineral_exchange_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(settings)).run();await writeAdminLog(env,admin,'MINERAL_EXCHANGE_SETTINGS','SETTINGS','mineral_exchange',null,settings);return json({ok:true,settings})}
        const id=Math.floor(Number(body.id||0)),action=String(body.action||'').toUpperCase();if(!id||!['APPROVE','REJECT'].includes(action))return json({error:'처리 정보가 올바르지 않습니다.'},400);
        const req=await env.DB.prepare('SELECT * FROM mineral_exchange_requests WHERE id=?').bind(id).first();if(!req)return json({error:'신청 내역을 찾을 수 없습니다.'},404);if(req.status!=='PENDING')return json({error:'이미 처리된 신청입니다.'},409);
        if(action==='REJECT'){const reason=String(body.reason||'관리자 거절').trim().slice(0,200);await env.DB.prepare("UPDATE mineral_exchange_requests SET status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,reject_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(admin.id,reason,id).run();await writeAdminLog(env,admin,'MINERAL_EXCHANGE_REJECT','MINERAL_EXCHANGE',id,req,{...req,status:'REJECTED',reason});return json({ok:true})}
        const todayLimit=await mineralExchangeSettings(env),approved=await env.DB.prepare("SELECT COALESCE(SUM(coin_amount),0) total FROM mineral_exchange_requests WHERE user_id=? AND requested_kst_date=? AND status='APPROVED'").bind(req.user_id,req.requested_kst_date).first();
        if(Number(approved?.total||0)+Number(req.coin_amount)>Number(todayLimit.dailyLimitCoin))return json({error:'해당 날짜의 하루 최대 교환 한도를 초과하여 승인할 수 없습니다.'},409);
        const target=await env.DB.prepare('SELECT coin,nickname FROM users WHERE id=?').bind(req.user_id).first();if(!target)return json({error:'신청 유저를 찾을 수 없습니다.'},404);const nextCoin=Number(target.coin||0)+Number(req.coin_amount);
        await env.DB.batch([env.DB.prepare("UPDATE mineral_exchange_requests SET status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(admin.id,id),env.DB.prepare('UPDATE users SET coin=? WHERE id=?').bind(nextCoin,req.user_id),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'MINERAL_EXCHANGE')").bind(req.user_id,req.coin_amount,nextCoin)]);
        await writeAdminLog(env,admin,'MINERAL_EXCHANGE_APPROVE','MINERAL_EXCHANGE',id,req,{...req,status:'APPROVED',coinGranted:req.coin_amount});return json({ok:true,coinAmount:req.coin_amount});
      }
    }

    if(path==='admin/settings'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const rows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('site_notice','maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users','new_user_coin','critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects')").all();
        return json({settings:Object.fromEntries(rows.results.map(x=>[x.key,x.value])),attendance:await attendanceSettings(env),role:admin.role});
      }
      if(request.method==='POST'){
        const payload=await readBody(request);
        const maintenanceKeys=['maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users'];
        const criticalKeys=['critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects'];
        const ownerKeys=['site_notice','new_user_coin'];
        if(payload.attendance){const beforeAttendance=await attendanceSettings(env),cleanAttendance=cleanAttendanceSettings(payload.attendance);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('attendance_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(cleanAttendance)).run();await writeAdminLog(env,admin,'ATTENDANCE_SETTINGS_UPDATE','SETTINGS','attendance',beforeAttendance,cleanAttendance);}
        if(admin.role!=='OWNER'&&ownerKeys.some(key=>key in payload)) return json({error:'신규 가입 코인과 서비스 공지는 OWNER만 변경할 수 있습니다.'},403);
        const beforeRows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('site_notice','maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','maintenance_test_users','new_user_coin','critical_enabled','critical_min_taps','critical_chance','critical_bonus','critical_effects')").all();
        const before=Object.fromEntries(beforeRows.results.map(x=>[x.key,x.value]));
        for(const key of [...maintenanceKeys,...criticalKeys,...ownerKeys]) if(key in payload) await env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(key,String(payload[key]??'')).run();
        const action=String(payload.maintenance_mode)==='1'&&before.maintenance_mode!=='1'?'MAINTENANCE_START':String(payload.maintenance_mode)==='0'&&before.maintenance_mode==='1'?'MAINTENANCE_END':'SETTINGS_UPDATE';
        await writeAdminLog(env,admin,action,'SETTINGS','global',before,payload); return json({ok:true,maintenance:await maintenanceSettings(env)});
      }
    }

    if(path==='admin/coupons'){
      const admin=await requirePermission(request,env,'COUPON_MANAGE'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM coupons ORDER BY id DESC').all();return json({coupons:rows.results});}
      if(request.method==='POST'){
        const p=await readBody(request),code=String(p.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40),reward=Number(p.rewardCoin),max=Number(p.maxUses);
        if(!/^[A-Z0-9_-]{4,40}$/.test(code))return json({error:'쿠폰 코드는 영문 대문자·숫자·_·- 조합 4~40자로 입력하세요.'},400);
        if(!Number.isInteger(reward)||reward<1||reward>10000000)return json({error:'보상 코인을 확인하세요.'},400);
        if(!Number.isInteger(max)||max<1||max>1000000)return json({error:'총 사용 한도를 확인하세요.'},400);
        try{const r=await env.DB.prepare('INSERT INTO coupons(code,reward_coin,starts_at,ends_at,max_uses,created_by) VALUES(?,?,?,?,?,?)').bind(code,reward,p.startsAt||null,p.endsAt||null,max,admin.id).run();await writeAdminLog(env,admin,'COUPON_CREATE','COUPON',r.meta.last_row_id,null,{code,reward,max});return json({ok:true},201)}catch{return json({error:'이미 존재하는 쿠폰 코드입니다.'},409)}
      }
      if(request.method==='PATCH'){
        const p=await readBody(request),before=await env.DB.prepare('SELECT * FROM coupons WHERE id=?').bind(Number(p.id)).first();if(!before)return json({error:'쿠폰이 없습니다.'},404);
        await env.DB.prepare('UPDATE coupons SET is_active=?,ends_at=COALESCE(?,ends_at),max_uses=COALESCE(?,max_uses),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.isActive===false?0:1,p.endsAt||null,p.maxUses?Number(p.maxUses):null,before.id).run();
        const after=await env.DB.prepare('SELECT * FROM coupons WHERE id=?').bind(before.id).first();await writeAdminLog(env,admin,'COUPON_UPDATE','COUPON',before.id,before,after);return json({ok:true,coupon:after});
      }
    }

    if(path==='admin/users/action'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE'); if(!admin)return json({error:'유저 관리 권한이 없습니다.'},403);
      const p=await readBody(request),userId=Number(p.userId),action=String(p.action||'');
      const before=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();
      if(!before)return json({error:'유저를 찾을 수 없습니다.'},404);
      if(before.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정은 수정할 수 없습니다.'},403);
      if(action==='COIN'){const amount=Number(p.amount);if(!Number.isInteger(amount)||amount===0)return json({error:'변경 코인을 입력하세요.'},400);if(before.coin+amount<0)return json({error:'보유 코인보다 많이 회수할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,userId).run();const afterCoin=before.coin+amount;await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(?,?,?,?,?)').bind(userId,amount,afterCoin,String(p.reason||'관리자 조정').slice(0,100),admin.id).run();}
      else if(action==='SHARDS'){const amount=Number(p.amount);if(!Number.isInteger(amount)||amount===0)return json({error:'변경할 카드 조각 수량을 입력하세요.'},400);const current=Number(before.card_shards||0);if(current+amount<0)return json({error:'보유 카드 조각보다 많이 회수할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(amount,userId).run();const balance=current+amount;await env.DB.prepare('INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,?)').bind(userId,amount,balance,String(p.reason||'관리자 조정').slice(0,100)).run();}
      else if(action==='CARDS_RESET')await env.DB.prepare('DELETE FROM user_cards WHERE user_id=?').bind(userId).run();
      else if(action==='ATTENDANCE_RESET')await env.DB.prepare('DELETE FROM attendance_logs WHERE user_id=?').bind(userId).run();
      else if(action==='ACCOUNT_RESET')await env.DB.batch([env.DB.prepare('DELETE FROM user_cards WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM attendance_logs WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM draw_logs WHERE user_id=?').bind(userId),env.DB.prepare('UPDATE users SET coin=5000,card_shards=0 WHERE id=?').bind(userId)]);
      else if(action==='BAN'){const days=String(p.days||'1'),until=days==='PERMANENT'?'9999-12-31 23:59:59':new Date(Date.now()+Number(days)*86400000).toISOString().replace('T',' ').slice(0,19);await env.DB.batch([env.DB.prepare("UPDATE users SET status='BANNED',banned_until=?,ban_reason=? WHERE id=?").bind(until,String(p.reason||'').slice(0,200),userId),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)]);}
      else if(action==='UNBAN')await env.DB.prepare("UPDATE users SET status='ACTIVE',banned_until=NULL,ban_reason=NULL WHERE id=?").bind(userId).run();
      else return json({error:'지원하지 않는 작업입니다.'},400);
      const after=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();await writeAdminLog(env,admin,action,'USER',userId,before,after);return json({ok:true,user:after});
    }

    if(path==='admin/users'){
      const admin=await requirePermission(request,env,'USER_MANAGE');
      if(!admin) return json({error:'유저 관리 권한이 없습니다.'},403);
      if(request.method!=='GET') return json({error:'지원하지 않는 요청입니다.'},405);
      const q=(url.searchParams.get('q')||'').trim().slice(0,30),verification=String(url.searchParams.get('verification')||'ALL').toUpperCase();
      const filters=[],binds=[];if(q){filters.push('u.nickname LIKE ?');binds.push(`%${q}%`);}if(verification==='VERIFIED')filters.push("w.status='VERIFIED'");else if(verification==='PENDING')filters.push("w.status IN ('PENDING','REVIEW')");else if(verification==='UNVERIFIED')filters.push("(w.id IS NULL OR w.status NOT IN ('VERIFIED','PENDING','REVIEW'))");
      const sql=`SELECT u.id,u.nickname,u.coin,u.card_shards,u.role,u.status,u.created_at,u.last_login_at,w.status AS verification_status,w.wago_nickname,w.wago_member_no,w.verified_at,COUNT(uc.card_id) AS card_count,COALESCE(SUM(CASE WHEN c.rarity='UR' THEN 1 ELSE 0 END),0) AS ur_count,COALESCE(SUM(CASE WHEN c.rarity='SSR' THEN 1 ELSE 0 END),0) AS ssr_count
        FROM users u LEFT JOIN wago_verifications w ON w.user_id=u.id LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id ${filters.length?'WHERE '+filters.join(' AND '):''}
        GROUP BY u.id ORDER BY ${q?'u.nickname ASC':'u.created_at DESC'} LIMIT 100`;
      const stmt=env.DB.prepare(sql);const rows=binds.length?await stmt.bind(...binds).all():await stmt.all();
      return json({users:rows.results,role:admin.role,verification});
    }

    if(path==='admin/users/private-key-reset'&&request.method==='POST'){
      const admin=await authenticate(request,env);
      if(!admin||!['OWNER','ADMIN'].includes(admin.role)) return json({error:'개인키 재발급 권한이 없습니다.'},403);
      const payload=await readBody(request);
      const userId=Number(payload.userId);
      if(!Number.isInteger(userId)||userId<1) return json({error:'재발급할 유저를 선택하세요.'},400);
      const before=await env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id=?').bind(userId).first();
      if(!before) return json({error:'유저를 찾을 수 없습니다.'},404);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET private_key_hash=? WHERE id=?').bind(privateKeyHash,userId),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)
      ]);
      await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
        .bind(admin.id,'PRIVATE_KEY_RESET','USER',String(userId),JSON.stringify(before),JSON.stringify({nickname:before.nickname,sessionsRevoked:true})).run();
      return json({ok:true,user:{id:before.id,nickname:before.nickname},privateKey});
    }
    if(path==='admin/coins'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'COIN_GRANT');
      if(!admin) return json({error:'코인 지급 권한이 없습니다.'},403);
      const payload=await readBody(request);
      const userId=Number(payload.userId);
      const amount=Number(payload.amount);
      const reason=String(payload.reason||'관리자 수동 지급').trim().slice(0,100);
      if(!Number.isInteger(userId)||userId<1) return json({error:'지급할 유저를 선택하세요.'},400);
      if(!Number.isInteger(amount)||amount<1||amount>1000000) return json({error:'지급 코인은 1~1,000,000 사이의 정수로 입력하세요.'},400);
      const before=await env.DB.prepare('SELECT id,nickname,coin,status FROM users WHERE id=?').bind(userId).first();
      if(!before) return json({error:'유저를 찾을 수 없습니다.'},404);
      const result=await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,userId).run();
      if(!result.meta.changes) return json({error:'코인 지급에 실패했습니다.'},500);
      const after=await env.DB.prepare('SELECT id,nickname,coin,status FROM users WHERE id=?').bind(userId).first();
      await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(?,?,?,?,?)')
        .bind(userId,amount,after.coin,reason||'관리자 수동 지급',admin.id).run();
      await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
        .bind(admin.id,'COIN_GRANT','USER',String(userId),JSON.stringify(before),JSON.stringify({...after,amount,reason})).run();
      return json({ok:true,user:after,amount,reason});
    }
    if(path==='admin/card-packs'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'카드팩 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const packs=await env.DB.prepare("SELECT * FROM card_packs WHERE id<>'summer-new' ORDER BY sort_order,id").all();
        const cfgRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pack_preview_configs'").first();
        let previews={}; try{previews=JSON.parse(cfgRow?.value||'{}')}catch{}
        const cards=await env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,c.card_status AS cardStatus,m.name FROM cards c JOIN members m ON m.id=c.member_id WHERE c.card_status IN ('PENDING','PUBLIC') ORDER BY c.created_at DESC,c.id DESC LIMIT 120`).all();
        return json({packs:packs.results.map(p=>({...p,allowed:JSON.parse(p.allowed_rarities||'[]')})),previews,cards:cards.results,pitySettings:await pitySettings(env)});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request); const id=String(payload.id||'');
        const before=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(id).first();
        if(!before||id==='summer-new') return json({error:'카드팩을 찾을 수 없습니다.'},404);
        const name=String(payload.name||before.name).trim().slice(0,60);
        const subtitle=String(payload.subtitle||before.subtitle).trim().slice(0,60);
        const description=String(payload.description||before.description).trim().slice(0,220);
        const theme=['basic','advanced','premium','pickup'].includes(String(payload.theme))?String(payload.theme):before.theme;
        const price=Math.max(0,Math.floor(Number(payload.price??before.price)||0));
        const g10=String(payload.guarantee10||before.guarantee_10).toUpperCase();
        const g20=String(payload.guarantee20||before.guarantee_20).toUpperCase();
        const active=payload.isActive?1:0; const sort=Math.floor(Number(payload.sortOrder??before.sort_order)||0);
        if(!name||!subtitle||!description) return json({error:'팩 이름, 영문명, 설명을 입력하세요.'},400);
        if(!RARITIES.includes(g10)||!RARITIES.includes(g20)) return json({error:'보장 등급을 확인하세요.'},400);
        await env.DB.prepare('UPDATE card_packs SET name=?,subtitle=?,description=?,theme=?,price=?,guarantee_10=?,guarantee_20=?,is_active=?,sort_order=? WHERE id=?')
          .bind(name,subtitle,description,theme,price,g10,g20,active,sort,id).run();
        const cfgRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='pack_preview_configs'").first();
        let configs={}; try{configs=JSON.parse(cfgRow?.value||'{}')}catch{}
        const pc=payload.preview||{};
        configs[id]={badge:String(pc.badge||'').slice(0,24),headline:String(pc.headline||'').slice(0,80),showNewCards:pc.showNewCards!==false,showNames:pc.showNames!==false,showGrades:pc.showGrades!==false,columns:Math.max(2,Math.min(6,Number(pc.columns)||5)),cardIds:Array.isArray(pc.cardIds)?pc.cardIds.map(String).slice(0,30):[]};
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('pack_preview_configs',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(configs)).run();
        if(payload.pitySettings&&PITY_PACKS.has(id)){const beforePity=await pitySettings(env),clean=cleanPitySettings({...beforePity,[id]:payload.pitySettings});await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('pack_pity_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)).run();}
        const after=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(id).first();
        await writeAdminLog(env,admin,'PACK_DETAIL_UPDATE','CARD_PACK',id,before,{...after,preview:configs[id]});
        return json({ok:true,pack:after,preview:configs[id]});
      }
    }

    if(path==='admin/card-rates'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'확률 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const packs=await env.DB.prepare('SELECT id,name,allowed_rarities FROM card_packs ORDER BY sort_order,id').all();
        const rates=await env.DB.prepare('SELECT pack_id,rarity,rate FROM card_pack_rates ORDER BY pack_id').all();
        return json({packs:packs.results.map(p=>({...p,allowed:JSON.parse(p.allowed_rarities)})),rates:rates.results,rarities:RARITIES});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request); const packId=String(payload.packId||'');
        const pack=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(packId).first();
        if(!pack) return json({error:'카드팩을 찾을 수 없습니다.'},404);
        const rates=payload.rates||{}; const normalRarities=RARITIES.filter(r=>r!=='LIMITED');
        const total=normalRarities.reduce((sum,r)=>sum+(Number(rates[r])||0),0);
        if(Math.abs(total-100)>0.0001) return json({error:`일반 등급 확률 합계는 100%여야 합니다. 현재 ${total.toFixed(4)}%입니다.`},400);
        for(const rarity of normalRarities){
          const rate=Number(rates[rarity])||0; if(rate<0||rate>100) return json({error:'확률은 0~100 사이여야 합니다.'},400);
          await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(packId,rarity,rate).run();
        }
        const limitedRate=packId==='pickup'?(Number(rates.LIMITED)||0):0;
        if(limitedRate<0||limitedRate>100) return json({error:'한정판 별도 확률은 0~100 사이여야 합니다.'},400);
        await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(packId,'LIMITED',limitedRate).run();
        const allowed=normalRarities.filter(r=>(Number(rates[r])||0)>0); if(packId==='pickup') allowed.push('LIMITED');
        await env.DB.prepare('UPDATE card_packs SET allowed_rarities=? WHERE id=?').bind(JSON.stringify(allowed),packId).run();
        await writeAdminLog(env,admin,'PACK_RATE_UPDATE','CARD_PACK',packId,null,{...rates,LIMITED:limitedRate});
        return json({ok:true,total,limitedRate});
      }
    }


    if(path==='admin/card-retirement'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'CARD_EDIT');if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(admin.role!=='OWNER')return json({error:'퇴사 카드 처리는 OWNER만 가능합니다.'},403);
      const body=await readBody(request),cardId=String(body.cardId||'').trim(),action=String(body.action||'PREVIEW').toUpperCase();
      if(!cardId)return json({error:'카드를 선택하세요.'},400);
      const card=await env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.card_status,m.name AS member_name FROM cards c JOIN members m ON m.id=c.member_id WHERE c.id=?`).bind(cardId).first();
      if(!card)return json({error:'카드가 없습니다.'},404);
      const cfg=await breakthroughConfig(env),rows=await env.DB.prepare('SELECT user_id,COALESCE(breakthrough_level,0) AS breakthrough_level FROM user_cards WHERE card_id=?').bind(cardId).all();
      const refunds=rows.results.map(r=>{const level=Math.max(0,Math.min(10,Number(r.breakthrough_level)||0));let required=0;for(let i=0;i<level;i++)required+=Number(cfg[card.rarity]?.[i]?.cost||0);return {userId:Number(r.user_id),level,requiredShards:required,refundShards:required}}).filter(r=>r.refundShards>0);
      const summary={cardId:card.id,title:card.title,memberName:card.member_name,grade:card.rarity,ownedUsers:rows.results.length,refundUsers:refunds.length,totalRequiredShards:refunds.reduce((n,r)=>n+r.requiredShards,0),totalRefundShards:refunds.reduce((n,r)=>n+r.refundShards,0),refundRate:100,status:card.card_status};
      if(action==='PREVIEW')return json({ok:true,summary});
      if(action==='QUEUE'){
        if(['RETIRE_PENDING','RETIRED'].includes(String(card.card_status||'')))return json({error:'이미 퇴사 처리 중이거나 완료된 카드입니다.'},409);
        const created=await env.DB.prepare("INSERT INTO card_retirement_batches(card_id,card_title,member_name,status,refund_rate,created_by) VALUES(?,?,?,'PENDING',100,?)").bind(card.id,card.title,card.member_name,admin.id).run();
        const batchId=created.meta.last_row_id;
        let sent=0;
        for(const r of refunds){
          const title=`${card.member_name} 퇴사 카드 조각 환급`;
          const messageBody=`퇴사로 삭제 예정인 [${card.title}] 카드의 현재 강화 단계(★${r.level})까지 필요한 누적 재료를 기준으로 100%를 환급합니다.\n\n누적 필요 재료: ${r.requiredShards.toLocaleString()}개\n환급 카드 조각: ${r.refundShards.toLocaleString()}개\n\n실패한 강화 시도 횟수는 계산에 포함되지 않습니다.`;
          const m=await env.DB.prepare("INSERT INTO user_messages(user_id,sender_type,title,body,message_type) VALUES(?,'ADMIN',?,?,'SHARD_REWARD')").bind(r.userId,title,messageBody).run();
          await env.DB.prepare("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(?,?,'SHARDS',?)").bind(m.meta.last_row_id,r.userId,r.refundShards).run();
          await env.DB.prepare('INSERT INTO card_retirement_refunds(batch_id,user_id,breakthrough_level,required_shards,refund_shards,message_id) VALUES(?,?,?,?,?,?)').bind(batchId,r.userId,r.level,r.requiredShards,r.refundShards,m.meta.last_row_id).run();sent++;
        }
        await env.DB.prepare("UPDATE cards SET is_active=0,card_status='RETIRE_PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(card.id).run();
        await writeAdminLog(env,admin,'CARD_RETIREMENT_QUEUE','CARD',card.id,card,{...summary,batchId,sent});
        return json({ok:true,batchId,sent,summary:{...summary,status:'RETIRE_PENDING'}});
      }
      if(action==='FINALIZE'){
        const batch=await env.DB.prepare('SELECT * FROM card_retirement_batches WHERE card_id=?').bind(card.id).first();if(!batch)return json({error:'먼저 삭제 대기 및 환급 처리를 진행하세요.'},409);
        await env.DB.batch([
          env.DB.prepare("UPDATE cards SET is_active=0,card_status='RETIRED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(card.id),
          env.DB.prepare("UPDATE card_retirement_batches SET status='FINALIZED',finalized_at=CURRENT_TIMESTAMP WHERE id=?").bind(batch.id)
        ]);
        await writeAdminLog(env,admin,'CARD_RETIREMENT_FINALIZE','CARD',card.id,card,{status:'RETIRED',batchId:batch.id});return json({ok:true,status:'RETIRED'});
      }
      return json({error:'올바르지 않은 처리입니다.'},400);
    }

    if(path==='admin/cards'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const cardView=`SELECT c.id,c.title,c.member_id AS memberId,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.is_active,c.card_status AS cardStatus,c.batch_name AS batchName,c.batch_date AS batchDate,c.draw_weight AS drawWeight,c.limited_total AS limitedTotal,c.issued_count AS issuedCount,c.power_type AS powerType,c.base_power AS basePower
        FROM cards c JOIN members m ON m.id=c.member_id`;
      const normalizeCard=async payload=>{
        const title=String(payload.title||'').trim().slice(0,80);
        const grade=String(payload.grade||'C').toUpperCase();
        const image=String(payload.image||'').trim().slice(0,500);
        const memberId=Number(payload.memberId);
        const focusX=Math.max(0,Math.min(100,Number(payload.focusX??50)));
        const focusY=Math.max(0,Math.min(100,Number(payload.focusY??50)));
        const requestedStatus=String(payload.cardStatus||'').toUpperCase();
        const cardStatus=['PENDING','PUBLIC','INACTIVE'].includes(requestedStatus)?requestedStatus:(payload.isActive===false?'INACTIVE':'PUBLIC');
        const isActive=cardStatus==='PUBLIC'?1:0;
        const batchName=String(payload.batchName||'').trim().slice(0,100)||null;
        const batchDate=String(payload.batchDate||'').trim().slice(0,10)||null;
        const drawWeight=Math.max(0,Math.min(100000,Number(payload.drawWeight??1)||0));
        const rawLimit=payload.limitedTotal;
        let limitedTotal=rawLimit===null||rawLimit===undefined||rawLimit===''?null:Math.max(0,Math.floor(Number(rawLimit)));
        const issuedCount=Math.max(0,Math.floor(Number(payload.issuedCount??0)||0));
        // LIMITED가 아닌 카드로 이동하면 기존 한정 수량 속성을 함께 해제한다.
        // 반대로 LIMITED는 반드시 유효한 한정 수량을 가져야 한다.
        if(grade!=='LIMITED') limitedTotal=null;
        if(grade==='LIMITED'&&(limitedTotal===null||limitedTotal<1)) throw new Error('LIMITED 등급은 1장 이상의 한정 수량이 필요합니다.');
        if(!title) throw new Error('카드명을 입력하세요.');
        if(!image) throw new Error('이미지 경로 또는 URL을 입력하세요.');
        if(!Number.isInteger(memberId)||memberId<1) throw new Error('멤버를 선택하세요.');
        if(!RARITIES.includes(grade)) throw new Error('올바르지 않은 카드 등급입니다.');
        const member=await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(memberId).first();
        if(!member) throw new Error('존재하지 않는 멤버입니다.');
        if(limitedTotal!==null&&limitedTotal<issuedCount) throw new Error('한정 수량은 이미 발급된 수량보다 작게 설정할 수 없습니다.');
        const supportsPowerType=['SSR','MA','LIMITED','FUR'].includes(grade);
        let powerType=payload.powerType===null||payload.powerType===undefined||payload.powerType===''?null:String(payload.powerType).toUpperCase();
        let basePower=payload.basePower===null||payload.basePower===undefined||payload.basePower===''?null:Math.max(0,Math.floor(Number(payload.basePower)||0));
        if(!supportsPowerType){powerType=null;basePower=null}
        else if(grade==='FUR'){powerType='FIXED';basePower=3200}
        else if(powerType!==null){
          if(!['NORMAL','HIGH','TOP'].includes(powerType)) throw new Error('올바르지 않은 전투력 유형입니다.');
          basePower=CARD_POWER_TYPES[grade][powerType];
        }else basePower=null;
        return {title,grade,image,memberId,focusX,focusY,isActive,cardStatus,batchName,batchDate,drawWeight,limitedTotal,issuedCount,powerType,basePower};
      };
      const nextCardId=()=>`CN-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
      if(request.method==='GET'){
        const rows=await env.DB.prepare(`${cardView} ORDER BY m.sort_order,c.id`).all();
        const members=await env.DB.prepare('SELECT id,name,slug FROM members WHERE is_active=1 ORDER BY sort_order,id').all();
        return json({cards:rows.results,members:members.results,role:admin.role});
      }
      if(request.method==='POST'){
        const payload=await readBody(request);
        if(Array.isArray(payload.cards)){
          if(payload.cards.length<1||payload.cards.length>100) return json({error:'일괄 등록은 한 번에 1~100장까지 가능합니다.'},400);
          const created=[];
          for(const raw of payload.cards){
            const card=await normalizeCard(raw);
            const id=nextCardId();
            await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,power_type,base_power,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
              .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,card.powerType,card.basePower,admin.id).run();
            const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
            created.push(after);
          }
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)')
            .bind(admin.id,'CARD_BULK_CREATE','CARD',String(created.length),JSON.stringify(created.map(x=>x.id))).run();
          return json({ok:true,cards:created},201);
        }
        if(payload.cloneFrom){
          const source=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(payload.cloneFrom).first();
          if(!source) return json({error:'복제할 카드가 없습니다.'},404);
          const card=await normalizeCard({
            title:payload.title||`${source.title} 복사본`,grade:payload.grade||source.rarity,image:payload.image||source.image_url,
            memberId:payload.memberId||source.member_id,focusX:payload.focusX??source.focus_x,focusY:payload.focusY??source.focus_y,isActive:payload.isActive??Boolean(source.is_active),cardStatus:payload.cardStatus||source.card_status,batchName:payload.batchName??source.batch_name,batchDate:payload.batchDate??source.batch_date,drawWeight:payload.drawWeight??source.draw_weight,limitedTotal:payload.limitedTotal??source.limited_total,issuedCount:0,powerType:payload.powerType===undefined?source.power_type:payload.powerType,basePower:payload.basePower===undefined?source.base_power:payload.basePower
          });
          const id=nextCardId();
          await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,power_type,base_power,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,card.powerType,card.basePower,admin.id).run();
          const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
            .bind(admin.id,'CARD_CLONE','CARD',id,JSON.stringify({source:payload.cloneFrom}),JSON.stringify(after)).run();
          return json({ok:true,card:after},201);
        }
        const card=await normalizeCard(payload);
        const id=nextCardId();
        await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,power_type,base_power,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,card.powerType,card.basePower,admin.id).run();
        const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)')
          .bind(admin.id,'CARD_CREATE','CARD',id,JSON.stringify(after)).run();
        return json({ok:true,card:after},201);
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request);
        if(Array.isArray(payload.ids)){
          const ids=[...new Set(payload.ids.map(x=>String(x||'').trim()).filter(Boolean))];
          const status=String(payload.status||'').toUpperCase();
          if(!ids.length) return json({error:'처리할 카드를 선택하세요.'},400);
          if(ids.length>200) return json({error:'한 번에 최대 200장까지 처리할 수 있습니다.'},400);
          if(!['PUBLIC','INACTIVE','PENDING','RETIRE_PENDING','RETIRED'].includes(status)) return json({error:'올바르지 않은 카드 상태입니다.'},400);
          const active=status==='PUBLIC'?1:0;
          const placeholders=ids.map(()=>'?').join(',');
          await env.DB.prepare(`UPDATE cards SET card_status=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).bind(status,active,...ids).run();
          await writeAdminLog(env,admin,'CARD_BULK_STATUS','CARD',ids.join(','),null,{status,count:ids.length});
          return json({ok:true,status,updatedIds:ids});
        }
        const before=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(payload.id).first();
        if(!before) return json({error:'카드가 없습니다.'},404);
        const card=await normalizeCard({
          title:payload.title??before.title,grade:payload.grade??before.rarity,image:payload.image??before.image_url,
          memberId:payload.memberId??before.member_id,focusX:payload.focusX??before.focus_x,focusY:payload.focusY??before.focus_y,isActive:payload.isActive??Boolean(before.is_active),cardStatus:payload.cardStatus||before.card_status,batchName:payload.batchName===undefined?before.batch_name:payload.batchName,batchDate:payload.batchDate===undefined?before.batch_date:payload.batchDate,drawWeight:payload.drawWeight??before.draw_weight,limitedTotal:payload.limitedTotal===undefined?before.limited_total:payload.limitedTotal,issuedCount:before.issued_count,powerType:payload.powerType===undefined?before.power_type:payload.powerType,basePower:payload.basePower===undefined?before.base_power:payload.basePower
        });
        await env.DB.prepare('UPDATE cards SET member_id=?,title=?,rarity=?,image_url=?,focus_x=?,focus_y=?,is_active=?,card_status=?,batch_name=?,batch_date=?,draw_weight=?,limited_total=?,power_type=?,base_power=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .bind(card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.cardStatus,card.batchName,card.batchDate,card.drawWeight,card.limitedTotal,card.powerType,card.basePower,payload.id).run();
        const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(payload.id).first();
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
          .bind(admin.id,card.isActive?'CARD_EDIT':'CARD_HIDE','CARD',payload.id,JSON.stringify(before),JSON.stringify(after)).run();
        return json({ok:true,card:after});
      }
      if(request.method==='DELETE'){
        if(admin.role!=='OWNER') return json({error:'완전 삭제는 OWNER만 가능합니다.'},403);
        const payload=await readBody(request);
        const ids=[...new Set((Array.isArray(payload.ids)?payload.ids:[payload.id]).map(x=>String(x||'').trim()).filter(Boolean))];
        if(ids.length<1) return json({error:'삭제할 카드를 선택하세요.'},400);
        if(ids.length>200) return json({error:'한 번에 최대 200장까지 삭제할 수 있습니다.'},400);
        const placeholders=ids.map(()=>'?').join(',');
        const found=await env.DB.prepare(`SELECT * FROM cards WHERE id IN (${placeholders})`).bind(...ids).all();
        const existingIds=found.results.map(x=>x.id);
        if(!existingIds.length) return json({error:'삭제할 카드가 없습니다.'},404);
        const statements=[];
        for(const id of existingIds){
          statements.push(env.DB.prepare('DELETE FROM user_cards WHERE card_id=?').bind(id));
          statements.push(env.DB.prepare('DELETE FROM draw_logs WHERE card_id=?').bind(id));
          statements.push(env.DB.prepare('DELETE FROM cards WHERE id=?').bind(id));
        }
        await env.DB.batch(statements);
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data) VALUES(?,?,?,?,?)')
          .bind(admin.id,existingIds.length>1?'CARD_BULK_DELETE':'CARD_DELETE','CARD',existingIds.join(','),JSON.stringify(found.results)).run();
        return json({ok:true,deletedIds:existingIds,deletedId:existingIds.length===1?existingIds[0]:null});
      }
    }
    return json({error:'요청한 기능을 찾을 수 없습니다.'},404);
  }catch(error){console.error(error);return json({error:error.message||'서버 오류가 발생했습니다.'},500)}
}
