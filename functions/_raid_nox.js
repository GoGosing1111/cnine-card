import {applyPetOpeningBuff} from '../shared/companion-opening-v1.mjs';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {companionBattleOptions} from '../shared/companion-battle-snapshot-v1.mjs';
import { buildPvePlayerTeam, buildMonsterFighter, simulateBattleV2Preview } from './_battle_v2_preview.js';
import { NOX_RHYTHM_RULES, noxPlaylist, noxTrack, judgeNoxNote } from '../shared/nox-raid-chart-v1.mjs';

export const NOX_RELEASE = Object.freeze({ enabled:false, rewardLocked:true, reviewOnly:true });
export const NOX_RULES = Object.freeze({ name:'종언의 주파수', bossName:'적관의 지휘자 녹스', sizes:[3,6], hp3:18000000, hp6:12000000, ...NOX_RHYTHM_RULES, receiptGraceMs:1500, inputLeadMs:210, enrageMs:210000, roles:['저음','중음','고음'] });
export const NOX_BOSS = Object.freeze({ id:'NOX_RED_CROWN', name:NOX_RULES.bossName, isBoss:true, is_boss:1, battle_power:320000, pve_hp_percent:200, pve_attack_percent:100, pve_defense_percent:100, pve_speed_percent:100, image:'/assets/ui/raid-nox-v1/boss-portrait.webp', battleSprite:'/assets/ui/raid-nox-v1/boss-idle.webp' });
const HELL_TRAVEL_MS=1000, HELL_NOTE_MULTIPLIER=1.5;
const NORMAL_MEMORY_STEPS=3, HELL_MEMORY_STEPS=5;
const copy=x=>structuredClone(x);
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
const live=room=>room.members.filter(m=>m.hp>0&&!m.left);
// Preserve the original non-music allowance. Longer selected songs extend the
// raid clock by exactly their added duration, not the floor/co-op/DPS windows.
export const noxEnrageMs=playlist=>NOX_RULES.enrageMs+(playlist||[]).reduce((sum,id)=>sum+Math.max(0,noxTrack(id).chartEndMs-30000),0);
function event(room,type,label,extra={}){room.events.push({...extra,type,label,at:room.clock,seq:++room.eventSeq});if(room.events.length>240)room.events.splice(0,room.events.length-240);}
function finish(room,status,code,reason){
  if(room.status!=='ACTIVE')return;
  room.status=status;
  room.finishedAt=room.clock;
  room.failure=status==='FAILED'?{code,reason}:null;
  if(status==='CLEAR')room.clearParticipantIds=room.members.filter(m=>!m.left&&!m.bot).map(m=>m.id);
  event(room,'RESULT',reason,{winner:status==='CLEAR'?'A':'B'});
}
function kill(room,m,reason,extra={}){if(m.hp<=0)return;m.hp=0;m.deathReason=reason;for(const f of m.fighters){f.hp=0;f.alive=false;}event(room,'NOX_DEATH',m.name+' · '+reason,{...extra,memberId:m.id,stage:room.stage});if(!live(room).length)finish(room,'FAILED','PARTY_DEAD','공대 전원 사망');}
function validateDeck(cards){if(!Array.isArray(cards)||cards.length!==5||new Set(cards.map(c=>c.id)).size!==5||cards.some(c=>!c.id||!Number.isFinite(c.power)||c.power<=0||!c.image))fail('PVE_DECK','저장된 PVE 덱에 서로 다른 카드 5장을 편성하세요.',400);}
export function createNoxRoom({id,hostId,size=6,difficulty='NORMAL',seed=1,now=0}={}){
  if(!id||!hostId||!NOX_RULES.sizes.includes(size)||!Number.isFinite(now))fail('INVALID_ROOM','3인 또는 6인 공대를 선택하세요.',400);
  if(difficulty!=='NORMAL'&&difficulty!=='HELL')fail('DIFFICULTY','노말 또는 헬 난이도를 선택하세요.',400);
  const maxHp=size===3?NOX_RULES.hp3:NOX_RULES.hp6;
  return {id,hostId,size,difficulty,seed:seed>>>0,playlist:noxPlaylist(seed),clock:now,createdAt:now,status:'LOBBY',members:[],boss:{...buildMonsterFighter(NOX_BOSS),hp:maxHp,maxHp},round:0,stage:'LOBBY',challenge:null,revision:0,eventSeq:0,events:[],startedAt:null,endsAt:null,finishedAt:null,failure:null,lastAttackAt:0};
}
export function addNoxMember(room,{id,name,cards,deckSnapshot=null,deckSource='PVE',bot=false},now=room.clock){
  if(room.status!=='LOBBY')fail('STARTED','전투가 시작된 공대입니다.');
  if(room.members.some(m=>m.id===id&&!m.left))return room;
  if(room.members.length>=room.size)fail('FULL','공대 정원이 찼습니다.');
  if(!id||deckSource!=='PVE')fail('PVE_ONLY','PVE 덱으로만 출전할 수 있습니다.',400);validateDeck(cards);
  // Build once through the same PVE entry point: type stacking, unique traits,
  // advancement and equipment must not drift into a second raid stat formula.
  const equipment=deckSnapshot?.characterBonus||{},suitPower=Math.max(0,Number(equipment.battleSuitPve||0));
  const battleSuit=suitPower>0&&equipment.equippedBattleSuit?{...equipment.equippedBattleSuit,pvePower:suitPower,weapon:equipment.equippedWeapon||null,accountNickname:String(name||'공대원')}:null;
  const team=buildPvePlayerTeam({cards,characterBonus:Math.max(0,Number(equipment.pve||0)-suitPower),battleSuit,pveEquipmentRuntime:equipment.pveEquipmentRuntime,...companionBattleOptions(deckSnapshot||{})});
  const fighters=[...team.teamA,...team.mercenaryFighters].map(f=>({...f,alive:true})),supports=team.battleSuitFighter?[{...team.battleSuitFighter,authoritative:true,damageAuthority:'SERVER_TIMELINE'}]:[];
  applyMercenaryCombatLink([fighters]);applyPetOpeningBuff(fighters,deckSnapshot?.pet,'A','PVE');
  const maxHp=fighters.reduce((n,c)=>n+c.maxHp,0);
  room.members.push({id,name:String(name||'공대원').slice(0,24),role:room.members.length%3,cards:copy(cards),pet:copy(deckSnapshot?.pet||null),fighters,supports,maxHp,hp:maxHp,ready:false,left:false,bot,score:0,miss:0,hits:[],memoryIndex:0,cooperated:false,receipts:{},lastSequence:0,lastInputAt:-1000});room.clock=Math.max(now,room.clock);room.revision++;return room;
}
export function readyNoxMember(room,id,ready=true){const m=room.members.find(m=>m.id===id&&!m.left);if(!m)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);if(room.status!=='LOBBY')fail('STARTED','이미 출전했습니다.');m.ready=Boolean(ready);room.revision++;return room;}
export function leaveNoxRoom(room,id,now=room.clock){const m=room.members.find(m=>m.id===id&&!m.left);if(!m)return room;room.clock=Math.max(now,room.clock);if(room.status==='LOBBY'){room.members=room.members.filter(x=>x.id!==id);room.members.forEach((x,i)=>{x.role=i%3;});if(room.hostId===id)room.hostId=room.members[0]?.id||'';}else{m.left=true;kill(room,m,'전장 이탈');}room.revision++;return room;}
function hellChart(notes){
  const beats=[...new Set(notes.map(note=>note.at))], times=[...beats];
  const target=Math.round(notes.length*HELL_NOTE_MULTIPLIER), lanes=[0,2,1,3];
  const spacing=NOX_RULES.goodMs*2+10;
  // Accents and subdivisions follow the original audio anchors. With lanes
  // rotating, five notes inside one judgment span would reuse the same lane.
  function addNotes(candidates){
    const remaining=target-times.length, visited=new Set();
    function place(at){
      if(times.length>=target||visited.has(at))return;
      visited.add(at);
      const nearby=times.filter(time=>Math.abs(time-at)<spacing);
      nearby.push(at);
      nearby.sort((a,b)=>a-b);
      if(!nearby.some((time,i)=>nearby[i+lanes.length]-time<spacing))times.push(at);
    }
    for(let i=0;i<remaining;i++)place(candidates[Math.floor((i+.5)*candidates.length/remaining)]);
    for(const at of candidates)place(at);
  }
  addNotes(beats);
  if(times.length<target) addNotes(beats.slice(1).map((at,i)=>Math.round((beats[i]+at)/2)));
  return times.sort((a,b)=>a-b).map((at,id)=>({id,at,lane:lanes[id%lanes.length]}));
}
function openStage(room,stage,at){
  room.stage=stage;const c=room.challenge={id:room.id+':'+room.round+':'+stage,stage,startsAt:at,deadline:at,round:room.round};
  const hell=room.difficulty==='HELL';
  if(stage==='RHYTHM'){
    const track=noxTrack(room.playlist?.[room.round-1]);c.trackId=track.id||null;
    const notes=hell?hellChart(track.notes):track.notes;
    c.travelMs=hell?HELL_TRAVEL_MS:NOX_RULES.travelMs;
    c.deadline=at+track.chartEndMs+NOX_RULES.receiptGraceMs;c.musicStartAt=at;c.chart=room.round%2===0?notes.map(n=>({...n,lane:3-n.lane})):copy(notes);
    for(const m of room.members){m.hits=[];m.score=0;m.miss=0;m.lastInputAt=-1000;}
  }else if(stage==='MEMORY'){
    let seed=(room.seed+room.round*7919)>>>0;const cells=Array.from({length:30},(_,id)=>id);for(let i=cells.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[cells[i],cells[j]]=[cells[j],cells[i]];}
    c.sequence=cells.slice(0,hell?HELL_MEMORY_STEPS:NORMAL_MEMORY_STEPS);c.tiles=Array.from({length:30},(_,id)=>({id,kind:c.sequence.includes(id)?'safe':'mine'}));c.cueMs=350;c.gapMs=100;c.revealEnd=at+c.sequence.length*(c.cueMs+c.gapMs);c.deadline=c.revealEnd+2200;for(const m of room.members){m.memoryIndex=0;m.memoryTiles=[];}
  }else if(stage==='COOP'){
    c.targetAt=at+6000;c.deadline=c.targetAt+700;c.strikes={};for(const m of room.members)m.cooperated=false;
    if([0,1,2].some(role=>!live(room).some(m=>m.role===role)))finish(room,'FAILED','MISSING_FREQUENCY','저음·중음·고음 중 생존한 담당자가 없습니다.');
  }else if(stage==='EXPOSED'){c.deadline=at+15000;room.lastAttackAt=at;}
  event(room,'NOX_STAGE',({RHYTHM:'종언의 악보',MEMORY:'잔향의 발판',COOP:'삼중 공명',EXPOSED:'왕관 붕괴 · 집중 공격'})[stage],{stage});
}
export function startNoxRoom(room,id,now=room.clock){
  if(id!==room.hostId)fail('HOST_ONLY','공대장만 출전할 수 있습니다.',403);
  if(room.status!=='LOBBY')return room;
  if(room.members.length!==room.size||room.members.some(m=>!m.ready))fail('NOT_READY','정원 전원이 음원과 전장 준비를 마쳐야 합니다.');
  for(const m of room.members){applyMercenaryCombatLink([m.fighters]);const opening=applyPetOpeningBuff(m.fighters,m.pet,'A','PVE');if(opening)event(room,'PET_OPENING_BUFF',opening.label,{...opening,memberId:m.id});m.maxHp=m.fighters.reduce((n,f)=>n+f.maxHp,0);m.hp=m.maxHp;}
  room.clock=Math.max(now,room.clock);room.status='ACTIVE';room.startedAt=room.clock+5000;room.endsAt=room.startedAt+noxEnrageMs(room.playlist);room.round=1;openStage(room,'RHYTHM',room.startedAt);room.revision++;return room;
}
function attacks(room,at){
  const floor=room.round===3?0:Math.ceil(room.boss.maxHp*(1-room.round/3));
  for(const m of live(room)){
    const attackers=[...m.fighters,...(m.supports||[])];
    const result=simulateBattleV2Preview({teamA:attackers.filter(f=>f.hp>0).map(f=>({...f,alive:true})),teamB:[{...room.boss,hp:room.boss.maxHp,alive:true,defense:Math.round(room.boss.defense*.2)}],seed:room.seed+room.eventSeq+Math.floor(at),maxActions:5,forcedMonsterEvery:99,healerPenalty:true});
    for(const e of result.timeline){const f=attackers.find(f=>f.id===e.actorId);if(!f||e.targetId!==room.boss.id||!['TURN','SKILL','COUNTER','ATTACK','SKILL_CHIP_HIT'].includes(e.type))continue;const damage=Math.min(room.boss.hp-floor,Math.max(0,Math.round(Number(e.damage)||0)),Math.round(f.attack*8));if(damage<=0)continue;room.boss.hp-=damage;event(room,e.type,e.label||'집중 공격',{...e,memberId:m.id,damage,targetHpAfter:room.boss.hp,targetMaxHp:room.boss.maxHp});}
  }
  if(room.boss.hp<=floor){if(room.round===3)finish(room,'CLEAR','CLEAR','적관의 지휘자를 침묵시켰습니다.');else{room.round++;openStage(room,'RHYTHM',at+3000);}}
}
export function tickNoxRoom(room,now){
  if(!Number.isFinite(now)||now<room.clock)fail('CLOCK','잘못된 서버 시간입니다.',400);room.clock=now;
  if(room.status!=='ACTIVE')return room;
  if(now>=room.endsAt){finish(room,'FAILED','ENRAGE',Math.ceil((room.endsAt-room.startedAt)/1000)+'초 광폭화 · 종언의 주파수');return room;}
  const c=room.challenge;
  if(room.stage==='EXPOSED'){
    for(let t=room.lastAttackAt+1000;t<=Math.min(now,c.deadline)&&room.status==='ACTIVE'&&room.stage==='EXPOSED';t+=1000){room.lastAttackAt=t;attacks(room,t);}
    if(room.stage!=='EXPOSED'||room.status!=='ACTIVE')return room;
  }
  if(now<c.deadline+(['MEMORY','COOP'].includes(c.stage)?NOX_RULES.receiptGraceMs:0))return room;
  if(c.stage==='RHYTHM'){
    for(const m of live(room)){m.miss=c.chart.length-m.hits.length;if(m.miss>NOX_RULES.maxMiss||m.score/c.chart.length<NOX_RULES.accuracy)kill(room,m,'리듬 정확도 부족');}
    if(room.status==='ACTIVE')openStage(room,'MEMORY',c.deadline+1200);
  }else if(c.stage==='MEMORY'){
    for(const m of live(room))if(m.memoryIndex!==c.sequence.length)kill(room,m,'안전 발판 미입력');
    if(room.status==='ACTIVE')openStage(room,'COOP',c.deadline+NOX_RULES.receiptGraceMs+300);
  }else if(c.stage==='COOP'){
    const values=live(room).map(m=>c.strikes[m.id]);
    if(values.some(v=>!Number.isFinite(v))||Math.max(...values)-Math.min(...values)>450)finish(room,'FAILED','COOP_FAILED','모든 생존 공대원이 같은 박자에 공명하지 못했습니다.');
    else openStage(room,'EXPOSED',c.deadline+NOX_RULES.receiptGraceMs+300);
  }else finish(room,'FAILED','DPS_CHECK','집중 공격 시간 안에 왕관을 파괴하지 못했습니다.');
  if(room.status==='ACTIVE'&&now>=room.challenge.deadline)return tickNoxRoom(room,now);
  room.revision++;return room;
}
export function actNoxRoom(room,id,input,now,{receiptNow=now}={}){
  const m=room.members.find(m=>m.id===id&&!m.left);if(!m)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  if(!input||!Number.isSafeInteger(input.seq)||input.seq<1||!Array.isArray(input.inputs)||input.inputs.length>24||input.stream!==undefined&&input.stream!==true||input.stream&&(input.inputs.length<1||input.seq<input.inputs.length))fail('INPUT','잘못된 입력 묶음입니다.',400);
  const signature=JSON.stringify(input.stream?[input.challengeId,input.inputs,true]:[input.challengeId,input.inputs]);
  if(m.receipts[input.seq]){if(m.receipts[input.seq]!==signature)fail('REPLAY_CONFLICT','재시도 입력 내용이 바뀌었습니다.');return room;}
  // Stream packets contain every unacknowledged input, ending at seq. A newer
  // packet may arrive first; its overlap is already authoritative, not a new
  // key press. Legacy packets keep their original strict replay checks.
  if(input.stream&&input.seq<=m.lastSequence)return room;
  if(input.seq<=m.lastSequence)fail('STALE_SEQUENCE','지난 입력 묶음입니다.');
  tickNoxRoom(room,now);if(room.status!=='ACTIVE'||m.hp<=0)fail('INACTIVE','현재 입력할 수 없는 상태입니다.');
  const c=room.challenge;if(input.challengeId!==c.id)fail('STALE_CHALLENGE','지난 기믹의 입력입니다.');
  const inputs=input.stream?input.inputs.slice(Math.max(0,m.lastSequence-(input.seq-input.inputs.length))):input.inputs;
  // Validate the whole packet before mutating. Never trust client damage, score,
  // note id, role, member id or outcome. Time is bounded to server receipt time.
  // A rhythm timestamp includes up to ±150 ms of user calibration. Keep the
  // original clock tolerance for the uncalibrated floor/cooperative actions.
  for(const p of inputs){if(!p||!Number.isInteger(p.lane)||p.lane<0||p.lane>(c.stage==='RHYTHM'?3:c.stage==='MEMORY'?c.tiles.length-1:2)||!Number.isFinite(p.at)||p.at>receiptNow+(c.stage==='RHYTHM'?NOX_RULES.inputLeadMs:60)||p.at<receiptNow-NOX_RULES.receiptGraceMs||p.at<c.startsAt)fail('INPUT_TIME','입력 시각이 허용 범위를 벗어났습니다.',400);}
  for(const p of inputs){
    if(m.hp<=0)break;
    if(c.stage==='RHYTHM'){
      const relative=p.at-c.musicStartAt;
      const judged=judgeNoxNote(c.chart,new Set(m.hits),p.lane,relative);
      if(judged){const {note,delta,grade}=judged;m.hits.push(note.id);m.score+=grade==='PERFECT'?1:NOX_RULES.goodScore;event(room,'NOX_JUDGE',grade,{memberId:id,noteId:note.id,lane:p.lane,delta});}
      else{m.score=Math.max(0,m.score-.5);event(room,'NOX_JUDGE','EMPTY',{memberId:id,lane:p.lane});}
    }else if(c.stage==='MEMORY'){
      if(p.at<c.revealEnd||p.at>=c.deadline)continue;
      if(m.memoryIndex>=c.sequence.length)continue;
      if(c.tiles[p.lane].kind==='mine')kill(room,m,'지뢰지대 폭발',{tile:p.lane});
      else if(c.sequence[m.memoryIndex]!==p.lane)kill(room,m,'안전 발판 순서 오류');
      else{m.memoryIndex++;m.memoryTiles.push(p.lane);event(room,'NOX_SAFE','안전지대 '+m.memoryIndex+'/'+c.sequence.length,{memberId:id,tile:p.lane,step:m.memoryIndex});}
    }else if(c.stage==='COOP'){
      if(m.cooperated)continue;
      if(p.lane!==m.role||Math.abs(p.at-c.targetAt)>225){kill(room,m,'공명 주파수 또는 박자 오류');continue;}
      m.cooperated=true;c.strikes[id]=p.at;event(room,'NOX_COOP',m.name+' · '+NOX_RULES.roles[m.role]+' 공명',{memberId:id});
    }
  }
  m.lastSequence=input.seq;m.receipts[input.seq]=signature;for(const key of Object.keys(m.receipts).slice(0,-64))delete m.receipts[key];room.revision++;return room;
}
export function noxView(room,id,since=0){
  const me=room.members.find(m=>m.id===id&&!m.left);if(!me)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  const c=room.challenge?copy(room.challenge):null;
  if(c?.stage==='MEMORY'){
    const elapsed=room.clock-c.startsAt,index=Math.floor(elapsed/(c.cueMs+c.gapMs));c.cue=elapsed>=0&&index<c.sequence.length&&elapsed%(c.cueMs+c.gapMs)<c.cueMs?c.sequence[index]:null;c.cueStep=c.cue===null?null:index+1;
    // Send a scheduled presentation so HTTP jitter cannot skip a 350ms cue.
    // The authority still validates the actual order, deadline and mine hits.
    c.cues=c.sequence.map((tile,i)=>({tile,step:i+1,from:c.startsAt+i*(c.cueMs+c.gapMs),to:c.startsAt+i*(c.cueMs+c.gapMs)+c.cueMs}));
    delete c.sequence;
  }
  return copy({id:room.id,size:room.size,difficulty:room.difficulty||'NORMAL',playlist:room.playlist||[],status:room.status,stage:room.stage,round:room.round,serverNow:room.clock,revision:room.revision,startedAt:room.startedAt,endsAt:room.endsAt,bossHp:room.boss.hp,bossMaxHp:room.boss.maxHp,challenge:c,me:{id:me.id,isHost:room.hostId===id,role:me.role,hp:me.hp,maxHp:me.maxHp,deathReason:me.deathReason||'',score:me.score,hits:me.hits,miss:me.miss,memoryIndex:me.memoryIndex,memoryTiles:me.memoryTiles||[],cooperated:me.cooperated,lastSequence:me.lastSequence,ready:me.ready},members:room.members.map(({id,name,role,hp,maxHp,ready,left,bot,cooperated})=>({id,name,role,hp,maxHp,ready,left,bot,cooperated})),fighters:me.fighters.map(({id,hp,maxHp,title})=>({id,hp,maxHp,title})),failure:room.failure,events:room.events.filter(e=>e.seq>since&&(!e.memberId||e.memberId===id||e.type.startsWith('NOX_'))),eventSeq:room.eventSeq,release:NOX_RELEASE});
}
export function noxBattlePayload(room,id){
  const me=room.members.find(m=>m.id===id&&!m.left);if(!me)fail('NOT_MEMBER','공대 참가자가 아닙니다.',403);
  const art={scope:'BATTLE_ENGINE_ONLY',kind:'NOX_RED_CROWN',primaryUrl:NOX_BOSS.battleSprite,pngFallbackUrl:NOX_BOSS.battleSprite,footAnchor:{x:.5,y:.97},objectFit:'contain',scaleMultiplier:1.12,technicalPass:true,reviewOnly:true};
  return {mode:'RAID',battlefieldMode:'RAID',cards:copy(me.cards),monster:{...NOX_BOSS,projectVMonsterArt:art},battleV2:{schemaVersion:2,teams:{A:{cards:copy(me.fighters.filter(f=>!f.isMercenary)),mercenaries:copy(me.fighters.filter(f=>f.isMercenary)),pet:copy(me.pet||null),supports:copy(me.supports||[])},B:{cards:[{...copy(room.boss),isBoss:true,projectVMonsterArt:art}]}},result:{timeline:[]}},playUltimateCinematics:false,reviewOnly:true};
}

// Integration seam: only the server reads the saved PVE deck and derives power.
// Client card ids / power / rewards are intentionally ignored.
export async function loadNoxPveDeck(env,userId,{pveDeckCards,raidDeckPower}){
  const saved=await pveDeckCards(env,userId);if(!Array.isArray(saved)||saved.length!==5)fail('PVE_DECK','저장된 PVE 덱에 카드 5장을 편성하세요.',400);
  const deck=await raidDeckPower(env,userId,saved,'RAID');validateDeck(deck.cards);return deck;
}
