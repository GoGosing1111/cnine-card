// Authoritative encounter shared by the isolated review and the live room adapter.
// All deadlines, HP, resources, role checks and outcomes belong to the authority.
import { buildFighter, buildMonsterFighter, buildPvePlayerTeam, simulateBattleV2Preview } from './_battle_v2_preview.js';
import {openCoopRound,tickCoopRoom,actCoopRoom,coopControls,reconcileCoopDuties} from './_raid_lich_coop.js';

export const LICH_RELEASE = Object.freeze({ mode:'OFF', rewardLocked:true, scope:'LOCAL_REVIEW_ONLY' });
export const ROLES = Object.freeze({ ASSAULT:'정벌대', WARDEN:'봉인대', RESCUE:'구출대' });
export const RUNES = Object.freeze(['달', '가시', '왕관']);
const PHASES = ['저주받은 왕좌', '절대영도', '서리한의 내부', '왕의 최후'];
const PLANS = [
  {phase:1,kind:'PLAGUE',duration:15000,floor:.85},
  {phase:1,kind:'PLAGUE',duration:14000,floor:.70},
  {phase:2,kind:'PRISON',duration:17000,floor:.525},
  {phase:2,kind:'PRISON',duration:16000,floor:.35},
  {phase:3,kind:'CONVERGENCE',duration:21000,floor:.225},
  {phase:3,kind:'CONVERGENCE',duration:20000,floor:.10},
  {phase:4,kind:'FINALE',duration:22000,floor:0}
];
const AUTH = {TRANSFER:'RESCUE',CLEANSE:'RESCUE',RESCUE:'RESCUE',HEAL:'RESCUE',REVIVE:'RESCUE',INTERRUPT:'WARDEN',GUARD:'WARDEN',SEAL:'WARDEN',SHATTER:'ASSAULT',STRIKE:'ASSAULT',BURST:'ASSAULT'};
const clone = value => structuredClone(value);
const alive = room => room.fighters.filter(x=>x.hp>0);
const fail = (code,message,status=409) => {throw Object.assign(new Error(message),{code,status});};
function record(room,type,label,extra={}) {
  const event={...extra,seq:++room.eventSeq,at:room.clock,type,label};
  room.events.push(event);
  if(room.events.length>400)room.events.splice(0,room.events.length-400);
  return event;
}
function wound(room,ratio,label,targetId=null,ownerId=null) {
  const targets=alive(room).filter(row=>(!targetId||row.id===targetId)&&(!ownerId||!room.loadouts||row.ownerId===ownerId));
  const hits=targets.map(row=>{const damage=Math.min(row.hp,Math.ceil(row.maxHp*ratio));row.hp-=damage;row.alive=row.hp>0;return {targetId:row.id,damage,targetHpAfter:row.hp};});
  record(room,'BOSS_ULTIMATE',label,{actorId:room.boss.id,hits});
  if(!alive(room).length)wipe(room,'PARTY_DEAD',room.combatRevision===2?label+' 피해로 전원 전투 불능 · 다음 방벽 붕괴 전에 공대 회복을 사용하세요.':'출전 카드가 모두 쓰러졌습니다.');
}
function wipe(room,code,reason) {
  if(room.status!=='ACTIVE')return;
  const hits=alive(room).map(card=>{const damage=card.hp;card.hp=0;card.alive=false;return {targetId:card.id,damage,targetHpAfter:0};});
  room.status='FAILED';room.failure={code,reason,round:room.round+1,phase:room.phase};
  room.finishedAt=room.clock;
  record(room,'RAID_LICH_WIPE',reason,{code});
  if(hits.length)record(room,'BOSS_ULTIMATE',reason,{actorId:room.boss.id,hits});
  record(room,'RESULT',reason,{winner:'B',reason:code});
}
function resource(room,key) {if(!(room.resources[key]>0))fail('RESOURCE_EMPTY','남은 '+key+' 자원이 없습니다.');room.resources[key]--;}
function shuffledRunes(seed) {const offset=(seed>>>0)%3;return Array.from({length:3},(_,i)=>RUNES[(i+offset)%3]);}
function openRound(room,index) {
  if(room.rulesVersion===2)return openCoopRound(room,PLANS[index],index,coopContext());
  const plan=PLANS[index];room.round=index;room.phase=plan.phase;room.step='MECHANIC';
  const active=alive(room);const target=active[(room.seed+index)%active.length];
  room.challenge={id:room.id+':'+index,kind:plan.kind,startedAt:room.clock,deadline:room.clock+plan.duration,
    targetId:target.id,targetName:(target.ownerName?target.ownerName+' · ':'')+target.title,plagueRune:RUNES[(room.seed+index)%3],
    plague:plan.kind!=='FINALE',plagueStacks:1,transferred:false,cleansed:false,
    prison:plan.kind==='PRISON'||plan.kind==='CONVERGENCE',prisonBroken:false,breathResolved:false,
    guarded:false,interrupted:false,decoyInterrupted:false,rescued:0,rescueAt:0,
    sequence:shuffledRunes(room.seed+index),sealIndex:0,sealed:false,cast:'FROST_NOVA',
    ghostRune:RUNES[(room.seed+index+1)%3],burstUsed:false,lastStrikeAt:-10000};
  if(plan.kind==='FINALE'){room.challenge.plague=false;room.challenge.cast='CROWN_OF_DEATH';}
  record(room,'RAID_LICH_PHASE',PHASES[plan.phase-1],{phase:plan.phase,round:index+1});
  record(room,'RAID_LICH_MECHANIC',plan.kind==='FINALE'?'해방한 영혼으로 왕관의 봉인을 해제하십시오.':target.title+'에게 죽음의 역병이 깃듭니다.',{kind:plan.kind,targetId:target.id});
  if(room.challenge.prison)record(room,'RAID_LICH_PRISON','서리 감옥 · 절대영도까지 유지',{targetId:target.id});
}
export function createLichRoom({id,hostId,mode='COMMAND',cards,monster,now=0,seed=1,powerScale=1,rulesVersion=1}={}) {
  if(!id||!hostId||!Array.isArray(cards)||cards.length!==5||new Set(cards.map(c=>c.id)).size!==5)fail('INVALID_PARTY','서로 다른 일반 카드 5장이 필요합니다.',400);
  if(!['COMMAND','PARTY'].includes(mode))fail('INVALID_MODE','지원하지 않는 검수 방식입니다.',400);
  if(!Number.isFinite(now)||!Number.isFinite(powerScale)||powerScale<=0)fail('INVALID_INPUT','잘못된 전투 설정입니다.',400);
  const fighters=cards.map((card,index)=>({...buildFighter({...card,power:Math.round(card.power*powerScale)},index,'A',null,'PVE'),image:card.image,battleSprite:card.battleSprite,cardId:card.id}));
  const boss={...buildMonsterFighter(monster),battleSprite:monster.battleSprite,image:monster.image,monsterId:monster.id};
  return {id,hostId,mode,rulesVersion,combatRevision:rulesVersion===2?2:1,status:'LOBBY',seed:seed>>>0,cards:clone(cards),fighters,boss,monster:clone(monster),members:[],
    clock:now,createdAt:now,startedAt:null,endsAt:null,finishedAt:null,round:0,phase:1,step:'LOBBY',
    resources:{interrupt:7,cleanse:2,guard:1,heal:3,revive:1,burst:3},souls:0,doom:0,
    challenge:null,revision:0,eventSeq:0,events:[],receipts:{},failure:null,statistics:{transfers:0,interrupts:0,rescues:0,damage:0,mistakes:0}};
}
export function addLichMember(room,{id,name,role},now=room.clock) {
  if(room.status!=='LOBBY')fail('ROOM_STARTED','시작한 공대에는 입장할 수 없습니다.');
  if(!id||!ROLES[role])fail('INVALID_ROLE','공대 역할을 선택하세요.',400);
  if(room.members.some(m=>m.id===id))return room;
  if(room.members.length>=6)fail('ROOM_FULL','공대 정원이 찼습니다.');
  room.clock=Math.max(room.clock,now);
  room.members.push({id,name:String(name||'정벌자').trim().slice(0,24),role});room.revision++;
  return room;
}
// Use the canonical PVE constructor. Owner-scoped IDs allow the same card in
// different accounts without merging their HP, mercenary or equipment.
export function setLichLoadout(room,memberId,deck,accountNickname) {
  if(room.status!=='LOBBY')fail('ROOM_STARTED','출정한 편성은 변경할 수 없습니다.');
  if(!room.members.some(m=>m.id===memberId))fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  if(deck?.cards?.length!==5||new Set(deck.cards.map(c=>String(c.id))).size!==5)fail('INVALID_PARTY','저장된 일반 덱 5장이 필요합니다.',400);
  const byId=new Map(deck.cards.map(card=>[String(card.id),card]));
  const cards=(deck.ids||deck.cards.map(c=>c.id)).map(key=>byId.get(String(key)));
  if(cards.length!==5||cards.some(c=>!c))fail('INVALID_PARTY','저장된 덱을 확인하세요.',400);
  const bonus=deck.characterBonus||{},suitPower=Math.max(0,Number(bonus.battleSuitPve)||0);
  const battleSuit=bonus.equippedBattleSuit?{...bonus.equippedBattleSuit,pvePower:suitPower,weapon:bonus.equippedWeapon||null,accountNickname}:null;
  const team=buildPvePlayerTeam({cards,characterBonus:Math.max(0,(Number(bonus.pve)||0)-suitPower),battleSuit,mercenary:deck.mercenary||null});
  const owned=actor=>({...actor,id:'A:OWNER:'+memberId+':'+actor.id,ownerId:memberId,ownerName:accountNickname});
  const fighters=team.teamA.map(actor=>({...owned(actor),battleSprite:byId.get(String(actor.cardId))?.battleSprite}));
  if(team.mercenaryFighter)fighters.push(owned(team.mercenaryFighter));
  const supports=team.battleSuitFighter?[{...owned(team.battleSuitFighter),authoritative:true,damageAuthority:'SERVER_TIMELINE'}]:[];
  room.loadouts||={};
  room.loadouts[memberId]=clone({cards,fighters,supports,characterBonus:bonus,accountNickname});
  room.fighters=room.members.flatMap(m=>room.loadouts[m.id]?.fighters||[]);
  room.revision++;return room;
}
export function removeLichLoadout(room,memberId) {
  if(!room.loadouts)return;
  delete room.loadouts[memberId];room.fighters=room.fighters.filter(f=>f.ownerId!==memberId);
  reconcileCoopDuties(room);
  if(room.status==='ACTIVE'&&!alive(room).length)wipe(room,'PARTY_DEAD','출전 카드가 모두 쓰러졌습니다.');
  if(room.challenge?.targetId&&!room.fighters.some(f=>f.id===room.challenge.targetId)&&alive(room).length){
    const target=alive(room)[0];room.challenge.targetId=target.id;room.challenge.targetName=target.ownerName+' · '+target.title;
  }
}
export function startLichRoom(room,memberId,now=room.clock) {
  if(memberId!==room.hostId)fail('HOST_ONLY','공대장만 출정할 수 있습니다.',403);
  if(room.status!=='LOBBY')return room;
  if(room.mode==='PARTY'&&!Object.keys(ROLES).every(role=>room.members.some(m=>m.role===role)))fail('MISSING_ROLES','정벌대·봉인대·구출대가 각각 한 명 이상 필요합니다.');
  room.clock=Math.max(room.clock,now);room.startedAt=room.clock+12000;room.endsAt=room.startedAt+(room.rulesVersion===2?300000:210000);room.status='ACTIVE';
  if(room.combatRevision===2)room.combatPartySize=room.members.length;
  if(room.rulesVersion===2){room.resources={interrupt:7,cleanse:7,guard:0,heal:4,revive:1,burst:0};room.personalBurst=Object.fromEntries(room.members.map(m=>[m.id,2]));}
  room.step='READY';room.challenge={id:room.id+':READY',startedAt:room.clock,deadline:room.startedAt};
  record(room,'RAID_LICH_READY','전장 집결 · 12초 뒤 전투가 시작됩니다.');room.revision++;return room;
}
function checkComplete(room) {
  if(room.status!=='ACTIVE'||room.step!=='MECHANIC')return;
  const c=room.challenge;
  const done=c.kind==='FINALE'?c.sealed&&room.souls>=3
    :(!c.plague)&&c.interrupted&&(!['PRISON','CONVERGENCE'].includes(c.kind)||c.breathResolved)&&
      (c.kind!=='CONVERGENCE'||(c.rescued>=1&&c.sealed));
  if(!done)return;
  room.step='EXPOSED';c.deadline=room.clock+(c.kind==='FINALE'?12000:10000);
  record(room,'RAID_LICH_EXPOSED',c.kind==='FINALE'?'서리한 파손 · 최후의 정벌':'왕의 방벽 붕괴 · 공격 기회',{kind:c.kind});
}
export function tickLichRoom(room,now) {
  if(!Number.isFinite(now)||now<room.clock)fail('INVALID_CLOCK','서버 시간은 되돌릴 수 없습니다.',400);
  room.clock=now;
  if(room.status!=='ACTIVE')return room;
  if(now>=room.endsAt){wipe(room,'ENRAGE','광폭화: 제한 시간 안에 리치왕을 정벌하지 못했습니다.');return room;}
  const c=room.challenge,age=now-c.startedAt;
  if(room.step==='READY'||room.step==='TRANSITION') {
    if(now>=c.deadline){const index=room.step==='READY'?0:room.round+1;room.clock=c.deadline;openRound(room,index);return tickLichRoom(room,now);}return room;
  }
  if(room.rulesVersion===2){tickCoopRoom(room,coopContext());return room;}
  if(room.step==='MECHANIC') {
    const breathAt=c.startedAt+6000;
    if(['PRISON','CONVERGENCE'].includes(c.kind)&&!c.breathResolved&&now>=breathAt){
      c.breathResolved=true;
      if(c.prison){c.prison=false;c.plagueStacks=2;record(room,'RAID_LICH_BREATH','서리 감옥이 절대영도를 흡수했습니다.',{safe:true,targetId:c.targetId});}
      else {room.doom+=2;room.statistics.mistakes++;record(room,'RAID_LICH_BREATH','엄폐 소실 · 절대영도 직격',{safe:false});wound(room,c.guarded?.28:.86,'절대영도');}
    }
    if(c.plague&&!c.prison){
      const start=['PRISON','CONVERGENCE'].includes(c.kind)?breathAt:c.startedAt;
      c.plagueStacks=Math.min(5,(c.kind==='PLAGUE'?1:2)+Math.floor(Math.max(0,now-start)/2000));
      if(c.plagueStacks>=5){wipe(room,'PLAGUE_SPREAD','역병이 5중첩에 도달해 공대 전체로 확산되었습니다.');return room;}
    }
    const criticalAt=c.kind==='PLAGUE'?7000:10000;
    if(c.kind!=='FINALE'&&!c.interrupted&&age>=criticalAt&&c.cast!=='SOUL_ANNIHILATION'){
      c.cast='SOUL_ANNIHILATION';record(room,'RAID_LICH_CAST','영혼 말살 · 지금 차단하십시오.');
    }
    if(c.kind!=='FINALE'&&!c.interrupted&&age>=criticalAt+5000){wipe(room,'ANNIHILATION','영혼 말살을 차단하지 못했습니다.');return room;}
    if(c.rescueAt&&now>=c.rescueAt){
      c.rescueAt=0;c.rescued++;room.souls++;room.statistics.rescues++;
      record(room,'RAID_LICH_RESCUED','영혼 구출 완료 · 해방된 영혼 +1');
    }
    if(room.doom>=3){wipe(room,'DOOM','죽음의 잔재가 3중첩되어 왕관이 공대를 잠식했습니다.');return room;}
    checkComplete(room);
  }
  if(room.status==='ACTIVE'&&room.step!=='TRANSITION'&&now>=c.deadline)wipe(room,room.step==='EXPOSED'?'DPS_CHECK':'MECHANIC_TIMEOUT',room.step==='EXPOSED'?'공격 기회 안에 왕의 방벽을 돌파하지 못했습니다.':'기믹 처리 시간이 끝났습니다.');
  return room;
}
function applyCombat(room,burst,memberId=null) {
  const c=room.challenge;
  const revised=room.rulesVersion===2&&room.combatRevision===2;
  const multiplier=(burst?1.8:1)*(c.transferred?1.25:1)*Math.max(.5,1-room.doom*.12);
  const enemy={...room.boss,hp:room.boss.maxHp,alive:true,defense:Math.round(room.boss.defense*.22)};
  const before=room.boss.hp;
  const floor=Math.round(room.boss.maxHp*PLANS[room.round].floor);
  const owners=room.loadouts?(memberId?[memberId]:room.members.map(m=>m.id)):[null];
  const packets=[];
  // A strike is an assault packet, not a restart of the persistent raid HP.
  // Use common-engine targeting/critical/hit resolution. The king's armor caps
  // its percent-based PVE minimum damage using the attacker's actual attack.
  // Common opening HP/shield/heal pools are not re-granted between packets.
  for(const ownerId of owners){
  const source=[...alive(room).filter(card=>ownerId===null||card.ownerId===ownerId),...(room.loadouts?.[ownerId]?.supports||[])]
    .map(card=>({...card,alive:true,attack:Math.round(card.attack*multiplier)}));
  if(!source.some(card=>!card.isBattleSuit))continue;
  const result=simulateBattleV2Preview({teamA:source,teamB:[enemy],seed:room.seed+room.eventSeq,maxActions:6,forcedMonsterEvery:5,healerPenalty:true});
  for(const ev of result.timeline){
    const actor=source.find(x=>x.id===ev.actorId);
    if(!actor||ev.targetId!==room.boss.id||!(Number(ev.damage)>0))continue;
    const attack=actor.isMercenary?result.openingMercenaries?.A?.find(f=>f.id===actor.id)?.attack||actor.attack:actor.attack;
    const damage=Math.min(Math.max(0,Number(ev.damage)||0),Math.round(attack*1.8));
    if(damage>0)packets.push({...ev,damage});
  }
  }
  // New encounters give every member time to attack. Normal strikes can remove
  // at most one third of a member's share of the stage; burst raises that cap.
  // Actual engine damage below the cap is unchanged. Never rescale on death/leave.
  const stageHp=Math.round(room.boss.maxHp*(room.round?PLANS[room.round-1].floor:1))-floor;
  const attackCap=revised
    ?Math.max(1,Math.ceil(stageHp/(Math.max(3,room.combatPartySize||room.members.length)*3)*(burst?1.8:1)))
    :Infinity;
  const total=packets.reduce((sum,event)=>sum+event.damage,0),budget=Math.min(before-floor,total,attackCap);
  let accumulated=0,applied=0;
  for(const ev of packets){
    accumulated+=ev.damage;
    const next=total?Math.round(accumulated*budget/total):0,damage=next-applied;applied=next;
    if(!damage)continue;
    room.boss.hp-=damage;
    const event={...ev,damage,absorbed:0,targetHpAfter:room.boss.hp,targetMaxHp:room.boss.maxHp,targetShieldAfter:0};
    record(room,event.type,event.label||'왕좌 공략',event);
  }
  room.statistics.damage+=Math.max(0,before-room.boss.hp);
  // The raid's explicit counter, debuffs and finite rescue actions own party HP.
  if(!(room.round===PLANS.length-1&&room.boss.hp===0))wound(room,revised?.015+room.doom*.005:(room.rulesVersion===2?.045:.055)+room.doom*.025,'서리한 반격',null,memberId);
  if(room.status!=='ACTIVE')return;
  if(room.boss.hp<=floor){
    if(room.round===PLANS.length-1){room.status='CLEAR';room.finishedAt=room.clock;record(room,'KO','리치왕 정벌',{targetId:room.boss.id});record(room,'RESULT','리치왕 정벌 성공',{winner:'A'});}
    else {room.step='TRANSITION';c.deadline=room.clock+3000;record(room,'RAID_LICH_ROUND_CLEAR','방벽 돌파 · 다음 작전 준비');}
  }
}
function coopContext(){return {record,wound,wipe,fail,resource,applyCombat};}
export function actLichRoom(room,memberId,input,now) {
  if(!input||typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))fail('REQUEST_ID','유효한 요청 식별자가 필요합니다.',400);
  const member=room.members.find(m=>m.id===memberId);if(!member)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  const signature=JSON.stringify([memberId,input.challengeId,input.action,input.target||'',...(room.rulesVersion===2?[input.stepToken||'']:[])]);
  if(room.receipts[input.requestId]){
    if(room.receipts[input.requestId]!==signature)fail('REQUEST_CONFLICT','같은 요청 식별자를 다른 행동에 사용할 수 없습니다.');
    tickLichRoom(room,now);return room;
  }
  tickLichRoom(room,now);
  if(room.status!=='ACTIVE')fail('TERMINAL','진행 중인 전투가 아닙니다.');
  const c=room.challenge,action=input.action;
  if(input.challengeId!==c.id)fail('STALE_CHALLENGE','지난 기믹의 입력입니다. 현재 전황을 다시 확인하세요.');
  if(room.rulesVersion===2){
    actCoopRoom(room,memberId,input,coopContext());room.receipts[input.requestId]=signature;room.revision++;return room;
  }
  if(!AUTH[action])fail('UNKNOWN_ACTION','지원하지 않는 행동입니다.',400);
  if(room.mode==='PARTY'&&member.role!==AUTH[action])fail('WRONG_ROLE',ROLES[AUTH[action]]+' 담당 행동입니다.',403);
  if(room.step==='TRANSITION'||room.step==='READY')fail('TRANSITION','다음 작전을 준비하고 있습니다.');
  if(['HEAL','REVIVE'].includes(action)){
    if(action==='HEAL'){
      resource(room,'heal');for(const card of alive(room))card.hp=Math.min(card.maxHp,card.hp+Math.round(card.maxHp*.34));
      record(room,'TEAM_HEAL','구출대 긴급 회복',{targets:alive(room).map(card=>({targetId:card.id,hpAfter:card.hp}))});
    }else{
      const card=room.fighters.find(x=>x.id===input.target&&x.hp<=0);if(!card)fail('NO_DEAD_TARGET','쓰러진 카드를 선택하세요.');
      if(room.souls<1)fail('SOULS_REQUIRED','부활에는 해방된 영혼 1개가 필요합니다.');
      resource(room,'revive');room.souls--;card.hp=Math.round(card.maxHp*.5);card.alive=true;record(room,'RAID_LICH_REVIVE',card.title+' 복귀');
    }
  }else if(action==='STRIKE'||action==='BURST'){
    if(room.step!=='EXPOSED')fail('BOSS_IMMUNE','왕의 방벽이 유지되고 있습니다. 기믹을 먼저 처리하세요.');
    if(now-c.lastStrikeAt<1200)fail('COOLDOWN','다음 공격을 준비하고 있습니다.',429);
    if(action==='BURST')resource(room,'burst');
    c.lastStrikeAt=now;applyCombat(room,action==='BURST');
  }else{
    if(room.step!=='MECHANIC')fail('NOT_MECHANIC','현재 기믹은 이미 처리되었습니다.');
    if(action==='TRANSFER'){
      if(!c.plague||c.prison)fail('PLAGUE_LOCKED',c.prison?'감옥이 역병 전이를 막고 있습니다.':'전이할 역병이 없습니다.');
      if(c.plagueStacks<2)fail('PLAGUE_IMMATURE','2중첩 이상에서 역병을 구울에게 전이할 수 있습니다.');
      if(input.target!==c.plagueRune){room.doom++;room.statistics.mistakes++;wound(room,.22,'잘못된 구울 · 역병 역류');record(room,'RAID_LICH_MISTAKE','같은 문양의 구울을 선택해야 합니다.');}
      else {c.plague=false;c.transferred=true;room.statistics.transfers++;record(room,'RAID_LICH_TRANSFER','역병 전이 · 왕의 갑옷 약화',{targetId:c.targetId});}
    }else if(action==='CLEANSE'){
      if(!c.plague||c.prison)fail('NO_PLAGUE','정화할 수 있는 역병이 없습니다.');resource(room,'cleanse');c.plague=false;c.cleansed=true;record(room,'RAID_LICH_CLEANSE','역병 정화 · 갑옷 약화 효과 없음');
    }else if(action==='SHATTER'){
      if(!c.prison)fail('NO_PRISON','파괴할 서리 감옥이 없습니다.');c.prison=false;c.prisonBroken=true;record(room,'RAID_LICH_SHATTER','감옥 조기 파괴 · 절대영도 엄폐 소실',{targetId:c.targetId});
    }else if(action==='GUARD'){
      if(c.guarded||c.breathResolved||!['PRISON','CONVERGENCE'].includes(c.kind))fail('NO_GUARD_WINDOW','지금은 방벽을 사용할 수 없습니다.');resource(room,'guard');c.guarded=true;record(room,'RAID_LICH_GUARD','비상 방벽 전개');
    }else if(action==='INTERRUPT'){
      if(c.kind==='FINALE'||c.interrupted||c.cast==='FROST_NOVA'&&c.decoyInterrupted)fail('NO_CAST','차단할 주문이 없습니다.');resource(room,'interrupt');
      if(c.cast==='SOUL_ANNIHILATION'){c.interrupted=true;room.statistics.interrupts++;record(room,'RAID_LICH_INTERRUPT','영혼 말살 차단');}
      else {c.decoyInterrupted=true;room.statistics.mistakes++;record(room,'RAID_LICH_MISTAKE','서리 폭발 차단 · 영혼 말살은 이어서 시전됩니다.');}
    }else if(action==='RESCUE'){
      if(!['CONVERGENCE','FINALE'].includes(c.kind)||c.rescueAt||c.rescued>=2)fail('NO_RESCUE','영혼 구출이 준비되지 않았습니다.');
      if(input.target!==c.ghostRune){room.doom++;room.statistics.mistakes++;wound(room,.18,'거짓 영혼 · 영혼 역류');}
      else {c.rescueAt=now+2500;record(room,'RAID_LICH_RESCUE','검 내부의 영혼 구출 중 · 2.5초');}
    }else if(action==='SEAL'){
      if(!['CONVERGENCE','FINALE'].includes(c.kind)||c.sealed)fail('NO_SEAL','해제할 봉인이 없습니다.');
      if(c.kind==='FINALE'&&room.souls<3)fail('SOULS_REQUIRED','왕관 해제에는 해방된 영혼 3개가 필요합니다.');
      if(input.target!==c.sequence[c.sealIndex]){c.sealIndex=0;room.doom++;room.statistics.mistakes++;record(room,'RAID_LICH_MISTAKE','봉인 순서 오류 · 죽음의 잔재 +1');}
      else {c.sealIndex++;if(c.sealIndex===3)c.sealed=true;record(room,'RAID_LICH_SEAL',c.sealed?'봉인 해제 완료':'봉인 '+c.sealIndex+'/3 해제');}
    }
  }
  room.receipts[input.requestId]=signature;
  if(room.doom>=3)wipe(room,'DOOM','죽음의 잔재가 3중첩되어 공대가 전멸했습니다.');
  checkComplete(room);room.revision++;return room;
}
export function lichBattlePayload(room,memberId=room.hostId) {
  const reviewOnly=!room.releaseMode;
  const monster={...room.monster,hp:room.boss.hp,maxHp:room.boss.maxHp};
  const art={scope:'BATTLE_ENGINE_ONLY',kind:reviewOnly?'LICH_KING_REVIEW_SD':'LICH_KING_SD',primaryUrl:monster.battleSprite,pngFallbackUrl:monster.battleSprite,footAnchor:{x:.5,y:.94},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:1.65,technicalPass:true,reviewOnly};
  const loadout=room.loadouts?.[memberId],fighters=loadout?room.fighters.filter(f=>f.ownerId===memberId):room.fighters;
  const supports=clone(loadout?.supports||[]),mercenaries=clone(fighters.filter(f=>f.isMercenary));
  const characterBonus=clone(loadout?.characterBonus||{});
  return {mode:'RAID',battlefieldMode:'RAID',cards:clone(loadout?.cards||room.cards),monster:{...monster,projectVMonsterArt:art},
    characterBonus,equippedBattleSuit:characterBonus.equippedBattleSuit,equippedWeapon:characterBonus.equippedWeapon,accountNickname:loadout?.accountNickname,
    battleV2:{schemaVersion:2,rules:{battleSuitDamageAuthority:supports.length?'SERVER_TIMELINE':'NONE',battleSuitActionClock:'INDEPENDENT_TIME_CADENCE'},
      teams:{A:{cards:clone(fighters.filter(f=>!f.isMercenary)),mercenaries,supports},B:{cards:[{...clone(room.boss),isBoss:true,projectVMonsterArt:art}]}},result:{timeline:[],supports:{A:supports,B:[]}}},
    playUltimateCinematics:false,reviewOnly};
}
export function lichView(room,memberId,since=0) {
  const member=room.members.find(m=>m.id===memberId);if(!member)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  return clone({id:room.id,mode:room.mode,rulesVersion:room.rulesVersion||1,combatRevision:room.combatRevision||1,controls:coopControls(room,memberId),status:room.status,revision:room.revision,serverNow:room.clock,endsAt:room.endsAt,
    phase:room.phase,phaseName:PHASES[room.phase-1],round:room.round+1,step:room.step,challenge:room.challenge,
    bossHp:room.boss.hp,bossMaxHp:room.boss.maxHp,roundFloor:Math.round(room.boss.maxHp*PLANS[room.round].floor),
    resources:room.resources,souls:room.souls,doom:room.doom,me:{...member,isHost:member.id===room.hostId},members:room.members,
    fighters:room.fighters.filter(f=>!room.loadouts||f.ownerId===memberId).map(({id,title,hp,maxHp,ownerId,isMercenary})=>({id,title,hp,maxHp,ownerId,isMercenary})),
    partyFighters:room.fighters.map(({id,title,hp,maxHp,ownerId,ownerName})=>({id,title,hp,maxHp,ownerId,ownerName})),failure:room.failure,statistics:room.statistics,
    events:room.events.filter(e=>e.seq>since),eventSeq:room.eventSeq,startedAt:room.startedAt,finishedAt:room.finishedAt,
    release:LICH_RELEASE});
}
