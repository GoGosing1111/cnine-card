import {COOP_RULES,coopDifficulty,validCoopClient} from '../shared/cooperative-battleground-v1.mjs';
import {createCooperativeBattle} from './_cooperative_battle.js';
import {advanceCoopPatterns,coopPatternInput} from './_cooperative_patterns.js';
import {defaultCoopCombat,validateCoopCombat,coopCombatSummary} from '../shared/cooperative-settings-v1.mjs';
const fail=(code,message,status=409)=>{throw Object.assign(Error(message),{code:'COOP_'+code,status});};
const fighting=s=>s==='LOADING'||s==='ACTIVE';
export const coopTerminal=state=>!state||!['LOBBY','LOADING','ACTIVE'].includes(state.status);
function member(room,user){const m=room.members.find(m=>m.id===Number(user.id));if(!m)fail('MEMBER','참가한 대기방만 볼 수 있습니다.',403);return m;}
function battle(room){
 const built=createCooperativeBattle({squads:room.members.map(m=>m.loadout),difficulty:room.difficulty,seed:room.seed,withdrawals:room.withdrawals,effects:room.effects||[],
  monsterSnapshot:room.encounterVersion===2?undefined:room.payload?.monster,combat:room.combat});
 room.payload=built.payload;room.states=built.states;room.battleRevision++;
 room.bossAtMs=room.payload.cooperativeEncounter?room.payload.battleV2.result.timeline.find(e=>e.type==='ENEMY_SPAWN'&&e.targetId.endsWith(':ARKE'))?.combatAtMs:null;
 room.durationMs=Math.min(room.combat?room.combat.maxBattleSeconds*1000:COOP_RULES.maxBattleMs,Math.max(1000,Number(room.payload.battleV2.result.timeline.at(-1).combatAtMs)));
}
function forfeit(room,m,now,reason){
 if(m.result==='DEFEAT')return;
 m.result='DEFEAT';m.reason=reason;m.ready=false;m.loaded=false;
 room.withdrawals.push({ownerId:m.id,atMs:room.status==='ACTIVE'?Math.max(0,now-room.startsAt):0});
 battle(room);
}
export function advanceCoopRoom(room,now){
 if(room.status==='LOBBY'&&now>=room.expiresAt){room.status='CANCELLED';room.reason='모집 시간이 끝났습니다.';}
 if(room.status==='LOBBY'){
  room.members=room.members.filter(m=>now-m.lastSeen<COOP_RULES.disconnectMs);
  if(!room.members.length){room.status='CANCELLED';room.finishedAt=now;room.reason='모든 참가자가 대기방을 떠났습니다.';}
  else if(!room.members.some(m=>m.id===room.hostId))room.hostId=room.members[0].id;
 }
 if(fighting(room.status)){
  // Resolve missed heartbeats at their actual deadline, before a later victory.
  const expired=room.members.filter(m=>!m.result&&m.lastSeen+COOP_RULES.disconnectMs<=now).sort((a,b)=>a.lastSeen-b.lastSeen);
  for(const m of expired){
   if(room.status==='ACTIVE'&&m.lastSeen+COOP_RULES.disconnectMs>=room.startsAt+room.durationMs)break;
   forfeit(room,m,m.lastSeen+COOP_RULES.disconnectMs,'연결 확인 시간 초과');
  }
  if(room.status==='LOADING'&&now>=room.loadingEndsAt)for(const m of room.members.filter(m=>!m.result&&!m.loaded))forfeit(room,m,now,'전장 로딩 시간 초과');
  const remaining=room.members.filter(m=>!m.result);
  if(!remaining.length){room.status='DEFEAT';room.finishedAt=now;room.reason='전원이 이탈했습니다.';}
  else if(room.status==='LOADING'&&remaining.every(m=>m.loaded)){room.status='ACTIVE';room.startsAt=now+COOP_RULES.countdownMs;}
  advanceCoopPatterns(room,now,battle);
  if(room.status==='ACTIVE'&&now>=room.startsAt+room.durationMs){
   room.status=room.payload.battleV2.result.winner==='A'?'VICTORY':'DEFEAT';room.finishedAt=room.startsAt+room.durationMs;
   for(const m of room.members)if(!m.result)m.result=room.status;
  }
 }
 return room;
}
export function createCoopRoom({id,user,clientId,difficulty,seed,now,combat=defaultCoopCombat(),settingsRevision=0}){
 if(!coopDifficulty(difficulty)||!validCoopClient(clientId))fail('INPUT','난이도와 접속 정보를 확인하세요.',400);
 const snapshot=validateCoopCombat(combat);
 return {id,hostId:Number(user.id),status:'LOBBY',difficulty,seed,combat:snapshot,settingsRevision,encounterVersion:2,patternIndex:0,pattern:null,patternHistory:[],effects:[],createdAt:now,expiresAt:now+snapshot.lobbySeconds*1000,members:[{id:Number(user.id),name:String(user.nickname).slice(0,80),clientId,ready:false,loaded:false,lastSeen:now}],withdrawals:[],battleRevision:0,version:1,receipts:[]};
}
export function coopCommand(room,user,kind,input,now){
 advanceCoopRoom(room,now);
 if(kind==='join'){
  if(room.status!=='LOBBY')fail('STARTED','이미 출전한 대기방입니다.');
  if(!validCoopClient(input.clientId))fail('CLIENT','접속 정보가 올바르지 않습니다.',400);
  const existing=room.members.find(m=>m.id===Number(user.id));
  if(existing){if(existing.clientId!==input.clientId){existing.clientId=input.clientId;existing.ready=false;}existing.lastSeen=now;return;}
  if(room.members.length>=3)fail('FULL','3명이 모두 입장했습니다.');
  room.members.push({id:Number(user.id),name:String(user.nickname).slice(0,80),clientId:input.clientId,ready:false,loaded:false,lastSeen:now});return;
 }
 const m=member(room,user);
 if(kind==='leave'&&(coopTerminal(room)||m.result))return;
 if(kind==='connect'){
  if(!validCoopClient(input.clientId))fail('CLIENT','접속 정보가 올바르지 않습니다.',400);
  if(m.clientId!==input.clientId){
   if(fighting(room.status)){forfeit(room,m,now,'새로고침 또는 다른 화면으로 재접속');m.clientId=input.clientId;advanceCoopRoom(room,now);return;}
   if(coopTerminal(room))m.clientId=input.clientId;
   if(room.status==='LOBBY'){m.clientId=input.clientId;m.ready=false;}
  }
  if(!m.result)m.lastSeen=now;return;
 }
 if(m.clientId!==input.clientId)fail('OLD_CLIENT','새 화면에서 다시 입장했습니다. 이전 화면은 사용할 수 없습니다.',409);
 if(kind==='leave'){
  if(room.status==='LOBBY'){room.members=room.members.filter(x=>x!==m);if(!room.members.length)room.status='CANCELLED';else if(m.id===room.hostId)room.hostId=room.members[0].id;}
  else if(fighting(room.status))forfeit(room,m,now,'전투 이탈');
  advanceCoopRoom(room,now);return;
 }
 if(m.result)fail('FINISHED',m.result==='DEFEAT'?'이미 패배 처리된 전투입니다.':'이미 종료된 전투입니다.');
 if(kind==='ping'){m.lastSeen=now;return;}
 if(kind==='loaded'){if(room.status!=='LOADING')return;m.loaded=true;m.lastSeen=now;advanceCoopRoom(room,now);return;}
 if(kind==='mechanic'){coopPatternInput(room,m,input,now);return;}
 if(room.status!=='LOBBY')fail('LOCKED','출전한 편성은 변경할 수 없습니다.');
 if(kind==='select'||kind==='ready'){
  if(!input.loadout||input.loadout.ownerId!==m.id)fail('LOADOUT','편성을 다시 확인하세요.',400);
  m.loadout=structuredClone(input.loadout);m.ready=kind==='ready';m.lastSeen=now;
  if(room.members.length===3&&room.members.every(x=>x.ready&&x.loadout&&now-x.lastSeen<COOP_RULES.disconnectMs)){
   room.status='LOADING';room.loadingEndsAt=now+COOP_RULES.loadingMs;battle(room);
  }return;
 }
 if(kind==='unready'){m.ready=false;return;}
 fail('COMMAND','지원하지 않는 명령입니다.',400);
}
export function coopView(room,user,now,revision=-1){
 const m=member(room,user),elapsed=room.startsAt?Math.max(0,now-room.startsAt):0;
 const frame=room.states?.findLast(s=>s.atMs<=elapsed)||null;
 const wave=frame?Math.max(1,...frame.B.map(f=>f.wave||1)):1;
 const stage=room.payload?.cooperativeEncounter?{wave,total:3,cleared:frame?.B.filter(f=>f.hp<=0).length||0,totalEnemies:5,bossAtMs:room.bossAtMs}:null;
 const fighters=frame?{A:frame.A.map(f=>room.withdrawals.some(w=>w.ownerId===f.ownerId)?{...f,hp:0,shield:0}:f),B:frame.B}:null;
 return {ok:true,serverNow:now,state:{id:room.id,hostId:room.hostId,status:room.status,difficulty:room.difficulty,expiresAt:room.expiresAt,loadingEndsAt:room.loadingEndsAt,startsAt:room.startsAt,durationMs:room.durationMs,finishedAt:room.finishedAt,reason:room.reason,
  stage,configuration:coopCombatSummary(room.combat,room.settingsRevision||0),version:room.version,battleRevision:room.battleRevision,rewardLocked:true,myResult:m.result||null,encounterVersion:room.encounterVersion||1,pattern:room.pattern||null,patternHistory:room.patternHistory||[],
  members:room.members.map(x=>({id:x.id,name:x.name,ready:x.ready,loaded:x.loaded,result:x.result||null,reason:x.reason||null,connected:now-x.lastSeen<COOP_RULES.disconnectMs,
   selection:x.loadout?{cards:x.loadout.cards.map(c=>({id:c.id,title:c.title,grade:c.grade||c.rarity,image:c.image,power:c.power,uniqueAbility:c.uniqueAbility})),mercenary:{code:x.loadout.mercenary.code,name:x.loadout.mercenary.name,rank:x.loadout.mercenary.rank,sourceArt:x.loadout.mercenary.sourceArt},power:x.loadout.power}:null})),fighters},
  ...(room.payload&&revision!==room.battleRevision?{payload:room.payload}:{}),you:Number(user.id)};
}
