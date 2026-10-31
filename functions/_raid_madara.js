import {companionBattleOptions,companionReviewOptions} from '../shared/companion-battle-snapshot-v1.mjs';
// Pure encounter authority shared by the local review and persistent live adapter.
import {buildPvePlayerTeam, buildMonsterFighter, simulateBattleV2Preview} from './_battle_v2_preview.js';
import {initializeDecisions,renewDecision,decide,decisionView,nextDecisionTime} from './_raid_madara_decisions.js';

export const MADARA_RELEASE = Object.freeze({mode:'OFF', runtimeEnabled:false, rewardLocked:true, scope:'LOCAL_REVIEW_ONLY', rulesVersion:2});
export const MADARA_ROLES = Object.freeze({WARDEN:'봉인대', ASSAULT:'정벌대', RESCUE:'구출대'});
export const MADARA_RUNES = Object.freeze(['화', '월', '뇌', '풍']);
export const MADARA_LINES = Object.freeze({
  ILLUSION:{title:'눈앞의 진실을 의심하라',line:'네 눈에 보이는 것이, 과연 진실일까?',effect:'illusion'},
  CLONES:{title:'끝없이 갈라지는 그림자',line:'몇 명을 상대하는지조차 모르겠느냐.',effect:'clones'},
  FIRE:{title:'업화 · 타오르는 전장',line:'살아남을 곳은 단 하나. 찾아 보아라.',effect:'fire'},
  METEOR:{title:'하늘이 무너진다',line:'이 절망을, 너희의 힘으로 막아 보아라.',effect:'meteor'},
  FINAL:{title:'거신 강림 · 봉인 해방',line:'이제 보여 주마. 진정한 힘이라는 것을.',effect:'awakening'},
  EXPOSE:{title:'방벽 붕괴 · 전원 공격',line:'제법이군. 그 틈을 놓치지 마라.',effect:'expose'},
  GAZE:{title:'거신의 시선',line:'다음은… 너다.',effect:'gaze'},
  MISTAKE:{title:'환술의 역류',line:'판단이 흐려졌구나.',effect:'illusion'},
  CLEAR:{title:'전설을 넘어서다',line:'너희의 이름은… 기억해 두마.',effect:'clear'},
  FAILED:{title:'작전 실패',line:'그 정도의 각오로 나를 넘으려 했느냐.',effect:'failed'}
});
// These are review timings, not an approved live economy/difficulty policy.
export const MADARA_PLANS = Object.freeze([
  {kind:'ILLUSION', name:'환술 판별', floor:.78, duration:35000},
  {kind:'CLONES', name:'분신 대응', floor:.55, duration:40000},
  {kind:'FIRE', name:'업화 결계', floor:.32, duration:36000},
  {kind:'METEOR', name:'운석 저지', floor:.10, duration:35000},
  {kind:'FINAL', name:'거신 강림', floor:0, duration:55000}
]);
const copy = value => structuredClone(value);
const fail = (code,message,status=409) => {throw Object.assign(new Error(message),{code,status});};
const member = (room,id) => room.members.find(m=>m.id===id&&!m.left);
const byRole = (room,role) => room.members.filter(m=>m.role===role&&!m.left);
const living = (room,id) => room.fighters.filter(f=>f.hp>0&&(!id||f.ownerId===id));
const nextRune = rune => MADARA_RUNES[(MADARA_RUNES.indexOf(rune)+1)%4];
function random(room) {let x=room.rng||1;x^=x<<13;x^=x>>>17;x^=x<<5;room.rng=x>>>0;return room.rng/4294967296;}
function rune(room) {return MADARA_RUNES[Math.floor(random(room)*4)];}
function log(room,type,label,data={}) {
  const event={...data,seq:++room.eventSeq,at:room.clock,type,label};
  const cue=type==='MADARA_PHASE'?data.kind:type==='MADARA_FIRE'?'FIRE':type==='MADARA_EXPOSE'?'EXPOSE':type==='MADARA_GAZE'?'GAZE':type==='MADARA_MISTAKE'?'MISTAKE':type==='MADARA_RESULT'?room.status:null;
  if(MADARA_LINES[cue]){event.presentation={...MADARA_LINES[cue],key:cue,id:`${room.id}:${event.seq}`,at:room.clock};room.presentation=event.presentation;}
  room.events.push(event);if(room.events.length>320)room.events.shift();room.revision++;
  return event;
}
function finish(room,status,code,reason) {
  if(room.status!=='ACTIVE')return;
  room.status=status;room.finishedAt=room.clock;
  room.failure=status==='FAILED'?{code,reason,phase:room.phase+1}:null;
  log(room,'MADARA_RESULT',reason,{code,winner:status==='CLEAR'?'A':'B'});
}
function wound(room,ratio,label,ownerId=null) {
  const hits=living(room,ownerId).map(f=>{const damage=Math.min(f.hp,Math.ceil(f.maxHp*ratio));f.hp-=damage;f.alive=f.hp>0;return {targetId:f.id,damage,targetHpAfter:f.hp};});
  log(room,'BOSS_ULTIMATE',label,{actorId:room.boss.id,hits});
  if(!living(room).length)finish(room,'FAILED','PARTY_DEAD','출전 편성이 모두 쓰러졌습니다.');
}
function mistake(room,actor,label) {
  room.strain++;room.statistics.mistakes++;log(room,'MADARA_MISTAKE',`${actor.name} · ${label}`);
  wound(room,.12,'환술의 역류');
  if(room.strain>=4)finish(room,'FAILED','STRAIN','환술 침식 4중첩 · 공대의 정신이 붕괴했습니다.');
}
function actingMember(room,requesterId,actorId) {
  const requester=member(room,requesterId);if(!requester)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  if(actorId&&actorId!==requesterId&&!(room.mode==='COMMAND'&&requesterId===room.hostId))fail('NOT_OWNER','다른 참가자의 입력을 대신할 수 없습니다.',403);
  const actor=member(room,actorId||requesterId);if(!actor)fail('NOT_MEMBER','조작할 참가자를 확인하세요.',403);return actor;
}
export function createMadaraRoom({id,hostId,monster,now=0,seed=1,mode='PARTY',settings={}}={}) {
  if(!id||!hostId||!['PARTY','COMMAND'].includes(mode)||!Number.isFinite(now)||!monster||!(Number(monster.battle_power)>0))fail('INVALID_ROOM','공대 설정을 확인하세요.',400);
  const boss={...buildMonsterFighter(monster),image:monster.image,battleSprite:monster.battleSprite};
  return {id,hostId,mode,settings:copy(settings),rulesVersion:2,status:'LOBBY',createdAt:now,clock:now,rng:seed>>>0,seed:seed>>>0,
    members:[],banned:[],loadouts:{},fighters:[],boss,monster:copy(monster),phase:0,step:'LOBBY',challenge:null,
    startedAt:null,endsAt:null,finishedAt:null,revision:0,eventSeq:0,events:[],receipts:{},
    resources:{heal:4,revive:1},souls:0,strain:0,statistics:{damage:0,mistakes:0,tasks:0,decisions:{WARDEN:0,ASSAULT:0,RESCUE:0}},failure:null};
}
export function addMadaraMember(room,{id,name,role,deck},now=room.clock) {
  if(room.banned?.includes(id))fail('KICKED','강퇴된 공대에는 다시 참가할 수 없습니다.',403);
  if(room.status!=='LOBBY')fail('ROOM_STARTED','출정한 공대에는 참가할 수 없습니다.');
  if(!id||typeof role!=='string'||!Object.hasOwn(MADARA_ROLES,role))fail('INVALID_ROLE','역할을 선택하세요.',400);
  if(member(room,id))return room;
  if(room.members.length>=6)fail('ROOM_FULL','최대 6명까지 참가할 수 있습니다.');
  if(deck?.cards?.length!==5||new Set(deck.cards.map(c=>String(c.id))).size!==5)fail('INVALID_DECK','서로 다른 일반 카드 5장이 필요합니다.',400);
  const nickname=String(name||MADARA_ROLES[role]).trim().slice(0,24)||MADARA_ROLES[role];
  const bonus=deck.characterBonus||{},suitPower=Math.max(0,Number(bonus.battleSuitPve)||0);
  const battleSuit=bonus.equippedBattleSuit?{...bonus.equippedBattleSuit,pvePower:suitPower,weapon:bonus.equippedWeapon||null,accountNickname:nickname}:null;
  const team=buildPvePlayerTeam({cards:deck.cards,pveEquipmentRuntime:bonus.pveEquipmentRuntime,characterBonus:Math.max(0,(Number(bonus.pve)||0)-suitPower),battleSuit,...companionBattleOptions(deck)});
  const own=f=>({...f,id:`A:MADARA:${id}:${f.id}`,ownerId:id,ownerName:nickname});
  const fighters=team.teamA.map(f=>({...own(f),battleSprite:deck.cards.find(c=>String(c.id)===String(f.cardId))?.battleSprite}));
  fighters.push(...team.mercenaryFighters.map(own));
  room.members.push({id,name:nickname,role,ready:false,left:false});
  room.loadouts[id]={...companionReviewOptions(deck),cards:copy(deck.cards),characterBonus:copy(bonus),supports:team.battleSuitFighter?[own(team.battleSuitFighter)]:[]};
  room.fighters.push(...fighters);room.clock=Math.max(room.clock,now);room.revision++;return room;
}
export function readyMadaraMember(room,requesterId,ready=true) {
  if(room.status!=='LOBBY')fail('ROOM_STARTED','출정한 공대입니다.');
  const actor=actingMember(room,requesterId);actor.ready=Boolean(ready);
  if(room.mode==='COMMAND'&&requesterId===room.hostId)room.members.forEach(m=>{m.ready=Boolean(ready);});
  room.revision++;
}
export function leaveMadaraRoom(room,requesterId,now=room.clock) {
  tickMadaraRoom(room,now);const actor=actingMember(room,requesterId);
  actor.left=true;
  if(room.status==='ACTIVE')finish(room,'FAILED','MEMBER_LEFT',`${actor.name} 퇴장 · 공대 작전이 종료되었습니다.`);
  if(room.status==='LOBBY'){
    room.members=room.members.filter(m=>m.id!==actor.id);delete room.loadouts[actor.id];room.fighters=room.fighters.filter(f=>f.ownerId!==actor.id);
    if(room.hostId===actor.id)room.hostId=room.members[0]?.id||null;
  }
  room.revision++;
}
export function kickMadaraMember(room,requesterId,targetId,now=room.clock) {
  if(requesterId!==room.hostId)fail('HOST_ONLY','공대장만 강퇴할 수 있습니다.',403);
  if(room.status!=='LOBBY')fail('ROOM_STARTED','출정 후에는 강퇴할 수 없습니다.');
  if(targetId===requesterId)fail('KICK_SELF','공대장 자신을 강퇴할 수 없습니다.');
  const target=actingMember(room,targetId);
  leaveMadaraRoom(room,targetId,now);(room.banned||=[]).push(targetId);
  log(room,'MADARA_KICK',`${target.name} 강퇴`,{targetId});
}
export function startMadaraRoom(room,requesterId,now=room.clock) {
  if(requesterId!==room.hostId)fail('HOST_ONLY','공대장만 출정할 수 있습니다.',403);
  if(room.status!=='LOBBY')fail('ROOM_STARTED','이미 출정한 공대입니다.');
  if(room.members.length<3||Object.keys(MADARA_ROLES).some(role=>!byRole(room,role).length))fail('ROLES_REQUIRED','3~6명과 봉인대·정벌대·구출대가 각각 필요합니다.');
  if(room.members.some(m=>!m.ready))fail('NOT_READY','전원이 준비를 완료해야 합니다.');
  room.clock=Math.max(room.clock,now);room.startedAt=room.clock;room.endsAt=room.clock+(room.settings?.enrageSeconds||360)*1000;
  room.status='ACTIVE';room.initialMembers=room.members.map(m=>m.id);room.bursts=Object.fromEntries(room.initialMembers.map(id=>[id,2]));
  openPhase(room,0);
}
function addTask(room,owner,kind,answers,clue,extra={}) {
  const q=room.challenge,id=`${room.phase}:${owner.id}:${kind}`;
  q.tasks.push({id,ownerId:owner.id,kind,answers,clue,index:0,version:0,done:false,...extra});
}
function illusionTasks(room) {
  const wardens=byRole(room,'WARDEN');
  wardens.forEach(m=>{const anchor=rune(room);addTask(room,m,'SIGNAL',[nextRune(anchor)],`문양 순환: 화 → 월 → 뇌 → 풍 → 화. ${anchor}의 다음 문양이 진실입니다.`);});
  byRole(room,'ASSAULT').forEach((m,i)=>addTask(room,m,'DISPEL',[], '봉인대가 공유한 문양과 같은 환영을 파괴하세요.',{partnerId:wardens[i%wardens.length].id}));
  byRole(room,'RESCUE').forEach((m,i)=>addTask(room,m,'SOUL',[], '공유된 진실 문양의 다음 문양으로 잔류 환술을 정화하세요. 화 → 월 → 뇌 → 풍 → 화.',{partnerId:wardens[i%wardens.length].id}));
}
function meteorTasks(room) {
  byRole(room,'WARDEN').forEach(m=>{const a=rune(room);addTask(room,m,'BIND',[a,nextRune(a)],`운석 봉인 순서: ${a} → ${nextRune(a)}`);});
  byRole(room,'ASSAULT').forEach((m,i)=>{const wardens=byRole(room,'WARDEN');addTask(room,m,'CORE',[],'연결된 봉인대의 마지막 문양과 같은 운석 핵을 파괴하세요.',{partnerId:wardens[i%wardens.length].id});});
  byRole(room,'RESCUE').forEach((m,i)=>{const target=room.members[(room.phase+i+1)%room.members.length];addTask(room,m,'PROTECT',[target.id],`파편에 노출된 ${target.name}을 보호하세요. 보호를 시작하면 2초 동안 유지합니다.`);});
}
function openPhase(room,index) {
  const plan=MADARA_PLANS[index];room.phase=index;room.step='MECHANIC';
  room.challenge={id:`${room.id}:${index}`,kind:plan.kind,startedAt:room.clock,deadline:room.clock+Math.round(plan.duration*(room.settings?.mechanicTimePercent||100)/100),tasks:[],signals:{},orders:{},bindings:{},damageBy:{},lastStrike:{}};
  const q=room.challenge;
  if(plan.kind==='ILLUSION'||plan.kind==='FINAL')illusionTasks(room);
  if(plan.kind==='CLONES'){
    const rescues=byRole(room,'RESCUE');
    rescues.forEach(m=>{const a=rune(room),b=nextRune(nextRune(a));addTask(room,m,'SCOUT',[a,b],`분신의 진짜 낙인: ${a} → ${b}. 이 순서로 공유하세요.`);});
    byRole(room,'WARDEN').forEach((m,i)=>addTask(room,m,'SUPPRESS',[],'공유된 분신 순서의 첫 문양으로 증식을 봉인하세요.',{partnerId:rescues[i%rescues.length].id}));
    byRole(room,'ASSAULT').forEach((m,i)=>addTask(room,m,'CLONE',[],'공유된 낙인 순서대로 분신을 파괴하세요.',{partnerId:rescues[i%rescues.length].id}));
  }
  if(plan.kind==='FIRE'){
    q.preserve=rune(room);q.firstAt=room.clock+8000;q.secondAt=room.clock+26000;q.firstDone=false;
    byRole(room,'WARDEN').forEach(m=>addTask(room,m,'MARK',[q.preserve],`두 번 버티는 결계의 각인: ${q.preserve}. 동료들에게 보존할 결계를 표시하세요.`));
    byRole(room,'ASSAULT').forEach(m=>addTask(room,m,'BREAK',MADARA_RUNES.filter(r=>r!==q.preserve),'첫 화염을 흡수한 후 표시된 결계 하나를 남기고 나머지를 파쇄하세요.',{unordered:true}));
    byRole(room,'RESCUE').forEach(m=>addTask(room,m,'REINFORCE',[q.preserve],'불필요한 결계를 모두 파쇄하면 남은 결계를 보강하세요.'));
  }
  if(plan.kind==='METEOR'||plan.kind==='FINAL')meteorTasks(room);
  if(plan.kind==='FINAL'){
    q.gazeIndex=0;q.gaze={ownerId:room.initialMembers[0],activeAt:room.clock+5000,endsAt:room.clock+11000,guarded:false,index:0};
  }
  initializeDecisions(room);
  log(room,'MADARA_PHASE',plan.name,{phase:index+1,kind:plan.kind});
}
const allDone=(q,kind)=>q.tasks.filter(t=>t.kind===kind).every(t=>t.done);
function taskBlocked(room,t) {
  const q=room.challenge;
  if(t.done)return '임무 완료';
  if(t.decision)return room.clock<t.trial.recoveryAt?'실수 복구 · 새 단서를 확인하세요.':'';
  if(t.channelAt)return '동료 보호 중';
  if(t.kind==='DISPEL'&&!q.signals[t.partnerId])return '연결된 봉인대의 문양 공유 대기';
  if(t.kind==='SOUL'&&!allDone(q,'DISPEL'))return '모든 환영 파괴 대기';
  if(['SUPPRESS','CLONE'].includes(t.kind)&&!q.orders[t.partnerId])return '구출대의 낙인 공유 대기';
  if(t.kind==='CLONE'&&!allDone(q,'SUPPRESS'))return '분신 증식 봉인 대기';
  if(t.kind==='BREAK'&&(!q.firstDone||!allDone(q,'MARK')))return '첫 화염 흡수와 보존 표식 대기';
  if(t.kind==='REINFORCE'&&!allDone(q,'BREAK'))return '불필요한 결계 파쇄 대기';
  if(t.kind==='CORE'&&(!allDone(q,'BIND')||(q.kind==='FINAL'&&!allDone(q,'DISPEL'))))return '운석 봉인과 환영 파괴 대기';
  return '';
}
function answerFor(room,t) {
  const q=room.challenge;
  if(t.kind==='DISPEL')return [q.signals[t.partnerId]];
  if(t.kind==='SOUL')return [nextRune(q.signals[t.partnerId])];
  if(t.kind==='SUPPRESS')return [q.orders[t.partnerId]?.[0]];
  if(t.kind==='CLONE')return q.orders[t.partnerId]||[];
  if(t.kind==='CORE')return [q.bindings[t.partnerId]?.at(-1)];
  return t.answers;
}
function taskToken(room,t) {return `${room.challenge.id}:${t.id}:${t.version}`;}
function completeTask(room,t,actor) {
  t.done=true;t.version++;room.statistics.tasks++;
  if(t.kind==='SIGNAL')room.challenge.signals[t.ownerId]=t.sealHistory?.at(-1)||t.answers[0];
  if(t.kind==='SCOUT')room.challenge.orders[t.ownerId]=[...(t.sealHistory||t.answers)];
  if(t.kind==='BIND')room.challenge.bindings[t.ownerId]=[...(t.sealHistory||t.answers)];
  if(t.kind==='SOUL')room.souls++;
  log(room,'MADARA_TASK',`${actor.name} · ${TASK_LABELS[t.kind]} 완료`,{ownerId:actor.id,kind:t.kind});
}
function decisionFailure(room,t,actor,reason){
  t.version++;
  t.feedback={ok:false,reason,at:room.clock,version:t.version};
  mistake(room,actor,'개인 기믹 판단 실패');
  if(room.status==='ACTIVE')renewDecision(room,t,{recovery:true});
}
function maybeExpose(room) {
  const q=room.challenge;
  if(room.status!=='ACTIVE'||room.step!=='MECHANIC'||!q.tasks.every(t=>t.done)||q.kind==='FIRE'&&!q.secondDone)return;
  room.step='DAMAGE';q.deadline=room.clock+(q.kind==='FINAL'?30000:18000);
  wound(room,q.kind==='FINAL'?.15:.10,'결계 붕괴 충격');
  if(room.status==='ACTIVE')log(room,'MADARA_EXPOSE','방벽 해제 · 각자의 편성으로 공략하세요.');
}
function schedule(room) {
  const q=room.challenge,values=[room.endsAt,q.deadline];
  if(room.step==='MECHANIC'&&q.kind==='FIRE'){if(!q.firstDone)values.push(q.firstAt);if(!q.secondDone)values.push(q.secondAt);}
  for(const t of q.tasks){if(t.channelAt&&!t.done)values.push(t.channelAt);values.push(nextDecisionTime(t));}
  if(q.gaze&&room.step!=='TRANSITION')values.push(q.gaze.endsAt);
  return Math.min(...values.filter(v=>Number.isFinite(v)&&v>=room.clock));
}
export function tickMadaraRoom(room,now) {
  if(!Number.isFinite(now))fail('INVALID_TIME','서버 시각이 필요합니다.',400);
  now=Math.max(now,room.clock);
  for(let guard=0;room.status==='ACTIVE'&&guard<100;guard++){
    const at=schedule(room);if(at>now)break;room.clock=at;
    const q=room.challenge;
    if(at>=room.endsAt){finish(room,'FAILED','ENRAGE',`${room.settings?.enrageSeconds||360}초 경과 · 바르센이 전장을 붕괴시켰습니다.`);break;}
    if(room.step==='TRANSITION'){openPhase(room,room.phase+1);continue;}
    for(const t of q.tasks){
      if(room.status!=='ACTIVE')break;
      if(t.decision&&!t.done&&at>=t.trial.expiresAt)decisionFailure(room,t,member(room,t.ownerId),'대응 시간이 지났습니다. 새 표식과 우선순위를 확인하세요.');
    }
    if(room.status!=='ACTIVE')break;
    for(const t of q.tasks)if(t.channelAt&&!t.done&&at>=t.channelAt)completeTask(room,t,member(room,t.ownerId));
    if(q.kind==='FIRE'&&room.step==='MECHANIC'){
      if(!q.firstDone&&at>=q.firstAt){q.firstDone=true;log(room,'MADARA_FIRE','첫 번째 화염 · 보존할 결계 하나를 남기세요.',{wave:1});if(!allDone(q,'MARK'))wound(room,.22,'보존 표식 지연 · 첫 화염 직격');}
      if(!q.secondDone&&at>=q.secondAt){q.secondDone=true;if(!q.tasks.every(t=>t.done))finish(room,'FAILED','FIRE_BREACH','두 번째 화염까지 결계 보강을 마치지 못했습니다.');else log(room,'MADARA_FIRE','두 번째 화염 방어 성공',{wave:2,safe:true});}
    }
    if(q.gaze&&at>=q.gaze.endsAt){
      if(!q.gaze.guarded){room.strain++;room.statistics.mistakes++;wound(room,.18,'거신의 시선 · 결계 유지 실패');if(room.strain>=4)finish(room,'FAILED','STRAIN','환술 침식 4중첩');}
      q.gazeIndex++;q.gaze={ownerId:room.initialMembers[q.gazeIndex%room.initialMembers.length],activeAt:at+4000,endsAt:at+10000,guarded:false,index:q.gazeIndex};
      log(room,'MADARA_GAZE','거신의 시선이 다음 동료에게 향합니다.',{ownerId:q.gaze.ownerId});
    }
    maybeExpose(room);
    if(room.status==='ACTIVE'&&at>=q.deadline){
      const pending=q.tasks.filter(t=>!t.done).map(t=>`${member(room,t.ownerId)?.name} · ${TASK_LABELS[t.kind]}`).join(' / ');
      finish(room,'FAILED',room.step==='DAMAGE'?'DPS_TIMEOUT':'MECHANIC_TIMEOUT',room.step==='DAMAGE'?'공격 기회가 끝났습니다. 전원 공격과 결전을 확인하세요.':`기믹 제한 시간 종료 · 미완료: ${pending}`);
    }
  }
  room.clock=now;return room;
}
function strike(room,actor,burst) {
  const q=room.challenge;
  if(room.step!=='DAMAGE')fail('SHIELDED','먼저 기믹으로 방벽을 해제하세요.');
  if(room.clock-(q.lastStrike[actor.id]??-Infinity)<1200)fail('COOLDOWN','다음 공격을 준비 중입니다.');
  if(burst&&room.bursts[actor.id]<=0)fail('BURST_EMPTY','개인 결전을 모두 사용했습니다.');
  const floor=Math.round(room.boss.maxHp*MADARA_PLANS[room.phase].floor);
  const start=Math.round(room.boss.maxHp*(room.phase?MADARA_PLANS[room.phase-1].floor:1));
  const chunk=start-floor,index=room.initialMembers.indexOf(actor.id),size=room.initialMembers.length;
  // Fixed per-person budgets prevent one overgeared player or a leaver from
  // skipping the other participants' contribution. Integer shares sum exactly.
  const share=Math.floor(chunk*(index+1)/size)-Math.floor(chunk*index/size);
  const remaining=Math.max(0,share-(q.damageBy[actor.id]||0));
  if(!remaining)fail('SHARE_COMPLETE','이번 공격 기회에서 맡은 피해량을 달성했습니다.');
  q.lastStrike[actor.id]=room.clock;
  if(q.gaze?.ownerId===actor.id&&room.clock>=q.gaze.activeAt){mistake(room,actor,'거신의 시선 중 공격 · 반사');return;}
  if(burst)room.bursts[actor.id]--;
  const source=[...living(room,actor.id),...room.loadouts[actor.id].supports].map(f=>({...copy(f),attack:Math.round(f.attack*(burst?1.8:1)),alive:true}));
  const enemy={...copy(room.boss),hp:room.boss.maxHp,alive:true,shield:0};
  const combat=simulateBattleV2Preview({...companionReviewOptions(room.loadouts[actor.id]),teamA:source,teamB:[enemy],seed:room.seed+room.eventSeq,maxActions:6,forcedMonsterEvery:5,healerPenalty:true});
  const packets=madaraStrikePackets(source,combat.timeline,room.boss.id);
  const total=packets.reduce((sum,e)=>sum+e.damage,0);
  const budget=Math.min(remaining,room.boss.hp-floor,total,Math.ceil(share/3*(burst?1.8:1)));
  let used=0,weight=0;
  for(const e of packets){
    weight+=e.damage;const next=total?Math.round(weight*budget/total):0,damage=next-used;used=next;if(!damage)continue;
    let hits;
    if(e.hits){
      // Skill hits carry authoritative damage separately from their parent event.
      // Scale the visible contacts to the same personal budget as the saved HP.
      const hitTotal=e.hits.reduce((sum,h)=>sum+h.damage,0);let hitWeight=0,hitUsed=0;
      hits=e.hits.map(h=>{hitWeight+=h.damage;const nextHit=Math.round(hitWeight*damage/hitTotal),amount=nextHit-hitUsed;hitUsed=nextHit;room.boss.hp-=amount;return {...h,damage:amount,absorbed:0,targetHpAfter:room.boss.hp,targetMaxHp:room.boss.maxHp,targetShieldAfter:0,targetMaxShield:0};}).filter(h=>h.damage>0);
    }else room.boss.hp-=damage;
    const {damage:packetDamage,...detail}=e;
    log(room,e.type,e.label||'바르센 공략',{...detail,...(hits?{hits,targetIds:[room.boss.id]}:{damage}),absorbed:0,targetHpAfter:room.boss.hp,targetMaxHp:room.boss.maxHp,targetShieldAfter:0});
  }
  q.damageBy[actor.id]=(q.damageBy[actor.id]||0)+budget;room.statistics.damage+=budget;
  if(room.boss.hp<=floor){
    if(room.phase===MADARA_PLANS.length-1){log(room,'KO','바르센 격파',{targetId:room.boss.id});finish(room,'CLEAR','VICTORY','바르센 레이드 공략 성공');}
    else{room.step='TRANSITION';q.deadline=room.clock+2500;log(room,'MADARA_PHASE_CLEAR','다음 작전 준비');}
  }else wound(room,.015+room.strain*.005,'바르센 반격',actor.id);
}
export function madaraStrikePackets(source,timeline,bossId){
  const actors=new Map(source.map(f=>[f.id,f]));
  return timeline.flatMap(event=>{
    const actor=actors.get(event.actorId);if(!actor)return [];
    const hits=Array.isArray(event.hits)?event.hits.filter(h=>h.targetId===bossId&&Number.isFinite(h.damage)&&h.damage>0):null;
    const damage=hits?hits.reduce((sum,h)=>sum+h.damage,0):event.targetId===bossId?Number(event.damage):0;
    if(!Number.isFinite(damage)||damage<=0)return [];
    // A grouped event's hits take precedence over any parent summary: count once.
    return [{...event,...(hits?{hits}:{}),targetId:bossId,damage:Math.min(damage,Math.round(actor.attack*1.8))}];
  });
}
export function actMadaraRoom(room,requesterId,input={},now=room.clock) {
  const actor=actingMember(room,requesterId,input.actorId);
  if(typeof input.requestId!=='string'||!/^[\w-]{8,100}$/.test(input.requestId))fail('REQUEST_ID','유효한 요청 번호가 필요합니다.',400);
  const signature=JSON.stringify([actor.id,input.action,input.taskId||'',input.target||'',input.token||'']);
  const prior=room.receipts[input.requestId];
  tickMadaraRoom(room,now);
  if(prior){if(prior.signature!==signature)fail('REQUEST_CONFLICT','다른 입력에 같은 요청 번호를 사용할 수 없습니다.');return {...prior.result,replayed:true};}
  if(Object.keys(room.receipts).length>=2048)fail('REQUEST_LIMIT','공대 입력 한도에 도달했습니다.');
  if(room.status!=='ACTIVE')fail('NOT_ACTIVE','진행 중인 전투가 아닙니다.');
  if(!living(room,actor.id).length)fail('DEAD','편성이 쓰러졌습니다. 구출대의 부활을 기다리세요.');
  const q=room.challenge;
  let result={ok:true};
  if(input.action==='TASK'){
    const t=q.tasks.find(t=>t.id===input.taskId);
    if(t&&t.ownerId!==actor.id)fail('NOT_OWNER','본인의 임무만 수행할 수 있습니다.',403);
    if(!t||t.done||input.token!==taskToken(room,t))result={ok:true,ignored:true,reason:'STALE_INPUT'};
    else{
      if(room.step!=='MECHANIC')fail('NO_MECHANIC','현재 진행 중인 기믹이 아닙니다.');
      const blocked=taskBlocked(room,t);if(blocked)fail('NOT_READY',blocked);
      if(t.decision){
        const outcome=decide(room,t,input.target);
        if(outcome.invalid)fail('INVALID_TARGET','현재 표시된 표적을 선택하세요.',400);
        if(outcome.blocked)fail('NOT_READY',outcome.blocked);
        if(outcome.expired)fail('STALE_INPUT','새로운 예고를 확인하세요.');
        if(!outcome.ok)decisionFailure(room,t,actor,outcome.reason);
        else{
          t.version++;t.feedback={ok:true,reason:outcome.reason,at:room.clock,version:t.version};
          room.statistics.decisions[actor.role]++;
          log(room,'MADARA_DECISION',`${actor.name} · 개인 판단 ${t.index}/${t.rounds} 성공`,{ownerId:actor.id,kind:t.kind});
          if(outcome.complete)completeTask(room,t,actor);else renewDecision(room,t);
          maybeExpose(room);
        }
      }else{
      const choices=t.kind==='PROTECT'?room.members.map(m=>m.id):MADARA_RUNES;
      if(!choices.includes(input.target))fail('INVALID_TARGET','선택 문양을 확인하세요.',400);
      const answers=answerFor(room,t),expected=t.unordered?answers.filter(a=>!(t.selected||[]).includes(a)):answers[t.index];
      const correct=t.unordered?expected.includes(input.target):input.target===expected;
      t.version++;
      if(!correct){if(t.kind==='CLONE')t.echo=true;mistake(room,actor,t.kind==='CLONE'?'분신 순서 오답 · 분신 증식':'문양·보호 대상 오답');}
      else if(t.echo){t.echo=false;log(room,'MADARA_TASK',`${actor.name} · 증식한 분신 제거`);}
      else if(t.kind==='PROTECT'){t.channelAt=room.clock+2000;log(room,'MADARA_TASK',`${actor.name} · 동료 보호 시작`);}
      else {t.index++;if(t.unordered)(t.selected||=[]).push(input.target);if(t.index>=answers.length)completeTask(room,t,actor);else log(room,'MADARA_TASK',`${actor.name} · ${TASK_LABELS[t.kind]} ${t.index}/${answers.length}`);}
      maybeExpose(room);
      }
    }
  }else if(input.action==='STRIKE'||input.action==='BURST'){
    if(input.token!==q.id)result={ok:true,ignored:true,reason:'STALE_INPUT'};else strike(room,actor,input.action==='BURST');
  }else if(input.action==='GUARD'){
    if(!q.gaze||q.gaze.ownerId!==actor.id)fail('NOT_OWNER','시선 대상자만 결계를 유지할 수 있습니다.',403);
    if(input.token!==`${q.id}:gaze:${q.gaze.index}`)result={ok:true,ignored:true,reason:'STALE_INPUT'};
    else if(!q.gaze.guarded){q.gaze.guarded=true;log(room,'MADARA_GUARD',`${actor.name} · 다음 인계까지 결계 유지`);}
  }else if(input.action==='HEAL'||input.action==='REVIVE'){
    if(actor.role!=='RESCUE')fail('ROLE_REQUIRED','구출대만 사용할 수 있습니다.',403);
    if(input.token!==q.id)result={ok:true,ignored:true,reason:'STALE_INPUT'};
    else if(input.action==='HEAL'){
      if(room.resources.heal<=0)fail('RESOURCE_EMPTY','공대 회복을 모두 사용했습니다.');
      const hurt=living(room).filter(f=>f.hp<f.maxHp);if(!hurt.length)fail('NO_TARGET','회복이 필요한 편성이 없습니다.');
      room.resources.heal--;hurt.forEach(f=>{f.hp=Math.min(f.maxHp,f.hp+Math.ceil(f.maxHp*.34));});log(room,'MADARA_HEAL','공대 체력 34% 회복');
    }else{
      const target=member(room,input.target);if(!target||!room.fighters.some(f=>f.ownerId===target.id&&f.hp<=0))fail('NO_TARGET','부활할 편성이 없습니다.');
      if(room.resources.revive<=0||room.souls<1)fail('RESOURCE_EMPTY','부활 1회와 구출한 영혼 1개가 필요합니다.');
      room.resources.revive--;room.souls--;room.fighters.filter(f=>f.ownerId===target.id&&f.hp<=0).forEach(f=>{f.hp=Math.ceil(f.maxHp*.5);f.alive=true;});log(room,'MADARA_REVIVE',`${target.name} 편성 부활`);
    }
  }else fail('INVALID_ACTION','지원하지 않는 행동입니다.',400);
  room.receipts[input.requestId]={signature,result};
  return result;
}
const TASK_LABELS={SIGNAL:'진실 문양 공유',DISPEL:'환영 파괴',SOUL:'잔류 환술 정화',SCOUT:'낙인 순서 공유',SUPPRESS:'분신 증식 봉인',CLONE:'분신 순차 격파',MARK:'보존 결계 표시',BREAK:'불필요한 결계 파쇄',REINFORCE:'남은 결계 보강',BIND:'운석 낙하 봉인',CORE:'운석 핵 파괴',PROTECT:'동료 보호'};
export function madaraView(room,requesterId,{actorId,since=0}={}) {
  const actor=actingMember(room,requesterId,actorId),q=room.challenge;
  const tasks=q?q.tasks.filter(t=>t.ownerId===actor.id).map(t=>t.decision?{...decisionView(t),token:taskToken(room,t)}:({id:t.id,kind:t.kind,label:TASK_LABELS[t.kind],clue:t.clue,partnerName:member(room,t.partnerId)?.name||null,done:t.done,index:t.index,total:answerFor(room,t).length||1,token:taskToken(room,t),blocked:taskBlocked(room,t),channelAt:t.channelAt||null,echo:Boolean(t.echo),selected:t.selected||[],choices:t.kind==='PROTECT'?room.members.filter(m=>!m.left).map(m=>({id:m.id,label:m.name})):MADARA_RUNES.map(r=>({id:r,label:r}))})):[];
  const fighters=room.fighters.filter(f=>f.ownerId===actor.id).map(({id,title,hp,maxHp,isMercenary})=>({id,title,hp,maxHp,isMercenary}));
  const floor=Math.round(room.boss.maxHp*MADARA_PLANS[room.phase].floor);
  const chunk=Math.round(room.boss.maxHp*(room.phase?MADARA_PLANS[room.phase-1].floor:1))-floor;
  const index=(room.initialMembers||[]).indexOf(actor.id),size=room.initialMembers?.length||1;
  const share=index>=0?Math.floor(chunk*(index+1)/size)-Math.floor(chunk*index/size):0;
  return copy({release:MADARA_RELEASE,id:room.id,hostId:room.hostId,presentation:room.presentation||null,mode:room.mode,status:room.status,revision:room.revision,serverNow:room.clock,endsAt:room.endsAt,startedAt:room.startedAt,finishedAt:room.finishedAt,
    phase:room.phase+1,phaseName:MADARA_PLANS[room.phase].name,step:room.step,bossHp:room.boss.hp,bossMaxHp:room.boss.maxHp,roundFloor:floor,
    me:{...actor,isHost:requesterId===room.hostId},members:room.members.map(m=>({...m,hp:room.fighters.filter(f=>f.ownerId===m.id).reduce((n,f)=>n+f.hp,0),maxHp:room.fighters.filter(f=>f.ownerId===m.id).reduce((n,f)=>n+f.maxHp,0),downCount:room.fighters.filter(f=>f.ownerId===m.id&&f.hp<=0).length,tasksDone:q?.tasks.filter(t=>t.ownerId===m.id&&t.done).length||0,tasksTotal:q?.tasks.filter(t=>t.ownerId===m.id).length||0})),
    challenge:q?{id:q.id,kind:q.kind,deadline:q.deadline,startedAt:q.startedAt,signals:q.signals,orders:q.orders,bindings:q.bindings,firstAt:q.firstAt,secondAt:q.secondAt,firstDone:q.firstDone,secondDone:q.secondDone,preserve:allDone(q,'MARK')?q.preserve:null,gaze:q.gaze?{...q.gaze,ownerName:member(room,q.gaze.ownerId)?.name}:null,damageBy:q.damageBy}:null,
    tasks,resources:room.resources,souls:room.souls,strain:room.strain,bursts:room.bursts?.[actor.id]??2,nextStrikeAt:(q?.lastStrike[actor.id]??-1200)+1200,attackShare:share,attackRemaining:Math.max(0,share-(q?.damageBy[actor.id]||0)),fighters,
    failure:room.failure,statistics:room.statistics,eventSeq:room.eventSeq,events:room.events.filter(e=>e.seq>since)});
}
export function madaraBattlePayload(room,requesterId,actorId) {
  const actor=actingMember(room,requesterId,actorId),loadout=room.loadouts[actor.id],fighters=room.fighters.filter(f=>f.ownerId===actor.id);
  const sprite=room.phase===4?room.monster.spiritSprite:room.monster.battleSprite;
  const art={scope:'BATTLE_ENGINE_ONLY',kind:'MADARA_REVIEW_SD',primaryUrl:sprite,pngFallbackUrl:sprite,footAnchor:{x:.5,y:.96},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:room.phase===4?2.4:1.5,technicalPass:true,reviewOnly:true};
  return {mode:'RAID',battlefieldMode:'RAID',reviewOnly:true,playUltimateCinematics:false,accountNickname:actor.name,cards:copy(loadout.cards),characterBonus:copy(loadout.characterBonus),
    monster:{...copy(room.monster),hp:room.boss.hp,maxHp:room.boss.maxHp,projectVMonsterArt:art},
    battleV2:{schemaVersion:2,rules:{battleSuitDamageAuthority:loadout.supports.length?'SERVER_TIMELINE':'NONE',battleSuitActionClock:'INDEPENDENT_TIME_CADENCE'},teams:{A:{cards:copy(fighters.filter(f=>!f.isMercenary)),mercenaries:copy(fighters.filter(f=>f.isMercenary)),supports:copy(loadout.supports)},B:{cards:[{...copy(room.boss),isBoss:true,projectVMonsterArt:art}]}},result:{timeline:[],supports:{A:copy(loadout.supports),B:[]}}}};
}
