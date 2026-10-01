import {retiredContentResponse} from './_retired_content.js';
import {rankCoin} from './_account_rank.js';
const SETTINGS_KEY='idle_dungeon_settings_v1';
const ACTIVE_LEASE_MS=40000;
const DAILY_ACCOUNT_COIN_CAP=200000000;
const DEFAULT_SETTINGS={configVersion:4,mode:'TEST',enabled:true,maxOfflineHours:6,floorSeconds:20,minFloorSeconds:4,maxSpeedMultiplier:5,speedExponent:.65,combat:{hpMode:'POWER_SCALED',effectMode:'STORYBOOK',fixedBaseHp:1000000},difficulties:[
  {id:'NORMAL',name:'일반',index:1,maxFloor:100,requiredPowerStart:20000,requiredPowerEnd:130000,dailyCap:500000,monsterHpMultiplier:10},
  {id:'ABYSS',name:'심연',index:2,maxFloor:120,requiredPowerStart:80000,requiredPowerEnd:195000,dailyCap:750000,monsterHpMultiplier:15},
  {id:'DOOM',name:'종말',index:3,maxFloor:150,requiredPowerStart:130000,requiredPowerEnd:235000,dailyCap:1000000,monsterHpMultiplier:24}
]};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const kstKey=(value=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function clean(raw={}){const source=Array.isArray(raw.difficulties)?raw.difficulties:DEFAULT_SETTINGS.difficulties,version=Number(raw.configVersion||0),legacyEconomy=version<2,legacyDifficulty=version<4,mode=['OFF','TEST','ON'].includes(String(raw.mode||'').toUpperCase())?String(raw.mode).toUpperCase():(raw.enabled===false?'OFF':'TEST'),hpMode=['POWER_SCALED','FIXED'].includes(String(raw.combat?.hpMode||'').toUpperCase())?String(raw.combat.hpMode).toUpperCase():'POWER_SCALED',effectMode=['STORYBOOK','CLASSIC','MINIMAL'].includes(String(raw.combat?.effectMode||'').toUpperCase())?String(raw.combat.effectMode).toUpperCase():'STORYBOOK',floorSeconds=clamp(raw.floorSeconds||20,5,300),minFloorSeconds=clamp(raw.minFloorSeconds??4,1,floorSeconds);return {configVersion:4,mode,enabled:mode!=='OFF',maxOfflineHours:clamp(raw.maxOfflineHours||6,1,24),floorSeconds,minFloorSeconds,maxSpeedMultiplier:clamp(raw.maxSpeedMultiplier??5,1,10),speedExponent:clamp(raw.speedExponent??.65,.1,2),combat:{hpMode,effectMode,fixedBaseHp:Math.floor(clamp(raw.combat?.fixedBaseHp||1000000,1000,1000000000))},difficulties:DEFAULT_SETTINGS.difficulties.map((base,i)=>{const x=source[i]||{},requiredPowerStart=legacyDifficulty?base.requiredPowerStart:(x.requiredPowerStart??base.requiredPowerStart),requiredPowerEnd=legacyDifficulty?base.requiredPowerEnd:(x.requiredPowerEnd??base.requiredPowerEnd);return {...base,name:String(x.name||base.name).slice(0,20),maxFloor:Math.floor(clamp(x.maxFloor||base.maxFloor,10,1000)),requiredPowerStart:Math.floor(clamp(requiredPowerStart,100,1000000000)),requiredPowerEnd:Math.floor(clamp(requiredPowerEnd,100,1000000000)),dailyCap:Math.floor(clamp(legacyEconomy?base.dailyCap:(x.dailyCap||base.dailyCap),1000,DAILY_ACCOUNT_COIN_CAP)),monsterHpMultiplier:clamp(legacyDifficulty?base.monsterHpMultiplier:(x.monsterHpMultiplier??base.monsterHpMultiplier),.1,1000)}})};}
let foundationPromise=null,settingsCache=null,poolCache=null,maxPowerCache=null;
function seeded(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0)/4294967295;}
function monsterAt(all,difficulty,floor,userId){const boss=floor%10===0,candidates=all.filter(x=>Boolean(x.isBoss)===boss),list=candidates.length?candidates:all;if(!list.length)return {id:0,name:boss?'심연의 군주':'성채의 망령',image:'assets/ui/idle-dungeon/moon-citadel-v1.png',basePower:1,isBoss:boss,source:'FALLBACK'};return list[Math.floor(seeded(`${userId}:${difficulty}:${floor}`)*list.length)%list.length];}
function coinPerClear(s,d){return Math.max(1,Math.round(Number(d.dailyCap||0)*Number(s.floorSeconds||20)/(Math.max(1,Number(s.maxOfflineHours||6))*3600)));}
function publicDifficulty(s,unlocked){return s.difficulties.map(x=>({...x,coinPerClear:coinPerClear(s,x),unlocked:x.index<=unlocked}));}
function encounterAt(cfg,d,floor,deckPower,maxObserved,all,userId){const monster=monsterAt(all,d.id,floor,userId),progress=(floor-1)/Math.max(1,d.maxFloor-1),curve=d.requiredPowerStart+(d.requiredPowerEnd-d.requiredPowerStart)*Math.pow(progress,1.38),isBoss=floor%10===0,final=floor===d.maxFloor,finalBarrier=final&&d.index===cfg.difficulties.length,baseRequired=Math.max(1,Math.floor(curve*(isBoss?1.08:1))),requiredPower=finalBarrier?Math.ceil(Math.max(baseRequired,maxObserved*1.18,deckPower*1.12)):baseRequired,powerRatio=deckPower/Math.max(1,requiredPower),canClear=powerRatio>=1,speedMultiplier=canClear?clamp(Math.pow(powerRatio,cfg.speedExponent),1,cfg.maxSpeedMultiplier):1,effectiveFloorSeconds=canClear?Math.max(cfg.minFloorSeconds,cfg.floorSeconds/speedMultiplier):cfg.floorSeconds;return {floor,monster,requiredPower,canClear,wipeOnFailure:!canClear,failureMode:canClear?null:'PARTY_WIPE',powerRatio:Number(powerRatio.toFixed(3)),speedMultiplier:Number(speedMultiplier.toFixed(3)),effectiveFloorSeconds:Number(effectiveFloorSeconds.toFixed(3)),isBoss,final,finalBarrier};}
function encounterSequence(cfg,d,startFloor,deckPower,maxObserved,all,userId,count=12){let floor=Math.max(1,Number(startFloor||1));const rows=[];for(let i=0;i<count;i++){const encounter=encounterAt(cfg,d,floor,deckPower,maxObserved,all,userId);rows.push(encounter);floor=!encounter.canClear||encounter.final?1:floor+1}return rows;}
function compute(state,cfg,deckPower,maxObserved,all,userId,now=Date.now()){
  const d=cfg.difficulties.find(x=>x.id===state.difficulty)||cfg.difficulties[0],today=kstKey(now);
  let daily=today===state.daily_key?Number(state.daily_coin||0):0,pending=Number(state.pending_coin||0),floor=Math.max(1,Number(state.current_floor||1)),highest=Number(state.highest_floor||0),unlocked=Number(state.unlocked_difficulty||1),resets=Number(state.total_resets||0),last=Date.parse(state.last_settled_at||state.run_started_at||new Date(now).toISOString());
  if(!Number.isFinite(last))last=now;
  const settlementStart=Math.max(last,now-cfg.maxOfflineHours*3600000),elapsed=Math.max(0,now-settlementStart),clearReward=rankCoin(coinPerClear(cfg,d),cfg.accountRankBenefits),capLeft=Math.max(0,DAILY_ACCOUNT_COIN_CAP-daily);
  let remaining=elapsed,consumed=0,rewardSeconds=0,steps=0,clearedFloors=0,earned=0,failed=false,completed=false;
  while(steps<10000){
    const encounter=encounterAt(cfg,d,floor,deckPower,maxObserved,all,userId),duration=Math.max(1000,Math.round(encounter.effectiveFloorSeconds*1000));
    if(remaining<duration)break;
    remaining-=duration;consumed+=duration;steps++;
    if(!encounter.canClear){floor=1;resets++;failed=true;continue}
    const granted=Math.min(Math.max(0,capLeft-earned),clearReward);
    clearedFloors++;earned+=granted;if(granted>0)rewardSeconds+=duration/1000;highest=Math.max(highest,floor);
    if(encounter.final){completed=true;unlocked=Math.min(cfg.difficulties.length,Math.max(unlocked,d.index+1));floor=1;resets++}
    else floor++;
  }
  const capReached=daily+earned>=DAILY_ACCOUNT_COIN_CAP,currentEncounter=encounterAt(cfg,d,floor,deckPower,maxObserved,all,userId);
  return {...state,difficulty:d.id,unlocked_difficulty:unlocked,current_floor:floor,highest_floor:highest,pending_coin:pending+earned,daily_coin:daily+earned,daily_key:today,total_resets:resets,last_settled_at:new Date(settlementStart+consumed).toISOString(),failed,completed,earned,steps,clearedFloors,coinPerClear:clearReward,rankSettlementCutoff:now-cfg.maxOfflineHours*3600000,consumedSeconds:consumed/1000,rewardSeconds,currentEncounter,monster:currentEncounter.monster,difficultyDailyCap:d.dailyCap,dailyCap:DAILY_ACCOUNT_COIN_CAP,capReached};
}
export async function handleIdleDungeon({path,deps}){
  return retiredContentResponse(path,deps.json);
}

export const __idleDungeonTest={DAILY_ACCOUNT_COIN_CAP,clean,coinPerClear,compute,resetCaches(){foundationPromise=null;settingsCache=null;poolCache=null;maxPowerCache=null;}};
