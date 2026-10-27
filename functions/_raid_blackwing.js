import {buildPvePlayerTeam,buildMonsterFighter,simulateBattleV2Preview} from './_battle_v2_preview.js';

export const BLACKWING_RULES=2;
export const BLACKWING_RUNES=Object.freeze(['해','달','별']);
const feedback=r=>r.rulesVersion>=2;
const wardWindow=r=>feedback(r)?3500:2500;
const actionNames={RUNE:'맹약 문양',CHARGE:'용혈 축적',ISOLATE:'부채 격리',ANCHOR:'용혈 고정 / 검 반격',REFLECT:'부채 반전',ARM:'심장 준비',HEART:'심장 파괴',VOTE:'절단 선택',BRACE:'부위 고정',CUT:'절단',WARD:'성역 전개',STRIKE:'편성 공격',HEAL:'공대 회복'};
export const BLACKWING_ROLES=Object.freeze({BREAKER:'파쇄',GUARD:'수호',SEALER:'봉인'});
export const BLACKWING_PLANS=Object.freeze([
 {kind:'DEBT',name:'역린의 부채',floor:.75,seconds:32},
 {kind:'HEARTS',name:'쌍생 심장',floor:.50,seconds:30},
 {kind:'SEVER',name:'돌이킬 수 없는 절단',floor:.30,seconds:25},
 {kind:'SANCTUARY',name:'소모되는 성역',floor:.10,seconds:40},
 {kind:'FINAL',name:'흑익의 마지막 맹약',floor:0,seconds:55}
]);
const copy=x=>structuredClone(x),fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code:'BLACKWING_'+code,status});};
const member=(r,id)=>r.members.find(m=>m.id===String(id)&&!m.left);
const roleMembers=(r,role)=>r.members.filter(m=>m.role===role&&!m.left);
const alive=(r,id)=>r.fighters.filter(f=>f.hp>0&&(!id||f.ownerId===id));
const actorFor=(r,id)=>{const m=member(r,id);if(!m)fail('NOT_MEMBER','참가한 공대가 아닙니다.',403);return m;};
const slot=(r,m)=>roleMembers(r,m.role).findIndex(x=>x.id===m.id);
function event(r,type,label,data={}){const e={phase:r.phase+1,step:r.step,...r.actionContext,...data,seq:++r.eventSeq,at:r.clock,type,label};r.events.push(e);if(r.events.length>240)r.events.shift();if(type.startsWith('BLACKWING_')||type==='BOSS_ULTIMATE'){r.combatLog??=[];r.combatLog.push({...e,hits:undefined,presentation:undefined});if(r.combatLog.length>400)r.combatLog.shift();}r.revision++;return e;}
function cue(r,key,title,line,effect='oath'){const e=event(r,'BLACKWING_CUE',title,{cueKey:key});r.presentation={id:r.id+':'+e.seq,key,title,line,effect,at:r.clock};e.presentation=r.presentation;}
function finish(r,status,code,reason){if(r.status!=='ACTIVE')return;r.status=status;r.step='FINISHED';r.finishedAt=r.clock;r.failure=status==='FAILED'?{code,reason}:null;cue(r,status,reason,status==='CLEAR'?'맹약은… 여기서 끝나는가.':'너희의 맹약은 재가 되었다.',status==='CLEAR'?'oath':'fire');}
function wound(r,ratio,label,ownerId){const hits=alive(r,ownerId).map(f=>{const damage=Math.min(f.hp,Math.ceil(f.maxHp*ratio));f.hp-=damage;f.alive=f.hp>0;return {targetId:f.id,damage,targetHpAfter:f.hp,targetMaxHp:f.maxHp};});event(r,'BOSS_ULTIMATE',label,{actorId:r.boss.id,hits});if(!alive(r).length)finish(r,'FAILED','PARTY_DEAD','공대의 모든 편성이 쓰러졌습니다.');else if(feedback(r)){const fallen=r.members.find(m=>!m.left&&!alive(r,m.id).length);if(fallen)finish(r,'FAILED','MEMBER_DEAD',fallen.name+' 편성 전멸 · 역할 임무를 이어갈 수 없습니다.');}}
function mistake(r,label){r.strain++;r.statistics.mistakes++;cue(r,'MISTAKE',label+' · 침식 '+r.strain+'/3','맹약을 어긴 대가를 치러라.','slash');wound(r,.10,label);if(r.strain>=3)finish(r,'FAILED','STRAIN','침식 3중첩 · 맹약 붕괴');}
// The shared role board is seeded and persisted once, never rerolled by polling.
function resetOaths(r){
 if(!feedback(r))return;const q=r.challenge;q.oathCycle=(q.oathCycle||0)+1;q.oaths={};
 for(const [n,role]of ['BREAKER','SEALER'].entries()){
  let seed=(r.seed^Math.imul(r.phase+1,2654435761)^Math.imul(q.oathCycle,2246822519)^Math.imul(n+1,3266489917))>>>0;
  const rand=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
  const order=roleMembers(r,role).map(m=>m.id);if(rand(2))order.reverse();const first=rand(3),second=(first+1+rand(2))%3;
  q.oaths[role]={order,runes:[first,second],progress:0};
 }
}
function oathDone(r,role){const o=r.challenge?.oaths?.[role];return !feedback(r)||!o||o.progress===o.order.length;}
function oathAction(r,m,input){
 const o=r.challenge.oaths?.[m.role];if(r.step!=='MECHANIC'||!o)fail('NO_OATH','현재 담당 문양이 없습니다.');
 if(o.progress>=o.order.length)fail('OATH_DONE','이 회차의 문양을 모두 맞췄습니다.');
 if(o.order[o.progress]!==m.id)fail('OATH_TURN','같은 역할 동료의 문양 입력을 기다리세요.');
 if(!/^[0-2]$/.test(String(input.target)))fail('TARGET','해·달·별 중 하나를 선택하세요.',400);
 if(Number(input.target)!==o.runes[o.progress]){mistake(r,m.name+' · 맹약 문양 불일치 (정답 '+BLACKWING_RUNES[o.runes[o.progress]]+')');return;}
 o.progress++;event(r,'BLACKWING_RUNE',m.name+' · '+BLACKWING_ROLES[m.role]+' 문양 '+o.progress+'/2 일치');
}
export function createBlackwingRoom({id,hostId,monster,now=0,seed=1,settings={}}={}){
 if(!id||!hostId||!Number.isFinite(now)||!(monster?.battle_power>0))fail('ROOM','공대 설정을 확인하세요.',400);
 return {id,hostId:String(hostId),rulesVersion:BLACKWING_RULES,mode:'PARTY',settings:copy(settings),monster:copy(monster),boss:buildMonsterFighter(monster),clock:now,createdAt:now,seed:seed>>>0,status:'LOBBY',members:[],banned:[],fighters:[],loadouts:{},phase:0,step:'LOBBY',challenge:null,wards:[2,2,2],lastWard:null,broken:null,strain:0,revision:0,eventSeq:0,events:[],receipts:{},statistics:{damage:0,mistakes:0,packets:0,tasks:0},resources:{heal:4},failure:null};
}
export function addBlackwingMember(r,{id,name,role,deck},now=r.clock){
 id=String(id);if(r.status!=='LOBBY')fail('STARTED','출정한 공대에는 참가할 수 없습니다.');if(r.banned.includes(id))fail('KICKED','강퇴된 공대입니다.',403);
 if(!Object.hasOwn(BLACKWING_ROLES,role))fail('ROLE','역할을 선택하세요.',400);if(member(r,id))return;
 if(r.members.length>=6||roleMembers(r,role).length>=2)fail('ROLE_FULL','각 역할은 2명씩, 총 6명입니다.');
 if(deck?.cards?.length!==5||new Set(deck.cards.map(c=>String(c.id))).size!==5)fail('DECK','서로 다른 RAID 카드 5장을 편성하세요.',400);
 const bonus=deck.characterBonus||{},suitPower=Math.max(0,Number(bonus.battleSuitPve)||0),nickname=String(name||'참가자').slice(0,24);
 const battleSuit=bonus.equippedBattleSuit?{...bonus.equippedBattleSuit,pvePower:suitPower,weapon:bonus.equippedWeapon||null,accountNickname:nickname}:null;
 const team=buildPvePlayerTeam({cards:deck.cards,pveEquipmentRuntime:bonus.pveEquipmentRuntime,characterBonus:Math.max(0,(Number(bonus.pve)||0)-suitPower),battleSuit,mercenary:deck.mercenary||null});
 const own=f=>({...f,id:`A:BLACKWING:${id}:${f.id}`,ownerId:id,ownerName:nickname});
 r.members.push({id,name:nickname,role,ready:false,left:false});r.fighters.push(...team.teamA.map(own));if(team.mercenaryFighter)r.fighters.push(own(team.mercenaryFighter));
 r.loadouts[id]={cards:copy(deck.cards),characterBonus:copy(bonus),supports:team.battleSuitFighter?[own(team.battleSuitFighter)]:[]};r.clock=Math.max(r.clock,now);r.revision++;
}
export function readyBlackwingMember(r,id,ready=true){if(r.status!=='LOBBY')fail('STARTED','이미 출정했습니다.');actorFor(r,id).ready=Boolean(ready);r.revision++;}
export function leaveBlackwingRoom(r,id,now=r.clock){const m=actorFor(r,id);tickBlackwingRoom(r,now);if(r.status==='ACTIVE'){m.left=true;finish(r,'FAILED','MEMBER_LEFT',m.name+' 이탈 · 작전 종료');}else if(r.status==='LOBBY'){r.members=r.members.filter(x=>x.id!==m.id);r.fighters=r.fighters.filter(f=>f.ownerId!==m.id);delete r.loadouts[m.id];if(r.hostId===m.id)r.hostId=r.members[0]?.id||null;}else m.left=true;r.revision++;}
export function kickBlackwingMember(r,id,target,now=r.clock){if(String(id)!==r.hostId)fail('HOST','공대장만 강퇴할 수 있습니다.',403);if(r.status!=='LOBBY'||String(target)===r.hostId)fail('KICK','출정 전 다른 참가자만 강퇴할 수 있습니다.');leaveBlackwingRoom(r,String(target),now);r.banned.push(String(target));}
function debtReset(r){const q=r.challenge;q.debt={cycle:(q.debt?.cycle||0)+1,packets:0,damage:0,contributors:{},seals:[],anchor:false,reflected:false,opensAt:r.clock+6000,closesAt:r.clock+16000};}
function heartsReset(r){const q=r.challenge;q.hearts={cycle:(q.hearts?.cycle||0)+1,armed:[false,false],broken:[false,false],firstAt:null,done:false};}
function openPhase(r,index){const p=BLACKWING_PLANS[index];r.phase=index;r.step='MECHANIC';r.challenge={id:r.id+':'+index,kind:p.kind,startedAt:r.clock,deadline:r.clock+Math.round(p.seconds*1000*(r.settings.mechanicTimePercent||100)/100),damageBy:{},lastStrike:{},votes:{},cuts:[],braces:[],breaths:0,breathGoal:index===3?3:r.broken==='WING'?2:3,breathAt:[3,4].includes(index)?r.clock+9000:null,breathCycle:0,wardLocked:null};debtReset(r);heartsReset(r);resetOaths(r);r.challenge.pressureAt=feedback(r)?r.clock+5000:null;cue(r,p.kind,p.name,['네 칼끝으로 내 용혈을 채워라.','두 심장은 함께 멈추어야 한다.','날개인가, 검인가. 선택에는 대가가 있다.','성역조차 영원히 버티지는 못한다.','남겨 둔 모든 대가가 돌아온다.'][index],['oath','oath','slash','fire','fire'][index]);}
export function startBlackwingRoom(r,id,now=r.clock){if(String(id)!==r.hostId)fail('HOST','공대장만 출정할 수 있습니다.',403);if(r.status!=='LOBBY')fail('STARTED','이미 출정했습니다.');if(r.members.length!==6||Object.keys(BLACKWING_ROLES).some(role=>roleMembers(r,role).length!==2))fail('ROLES','파쇄·수호·봉인 각 2명, 총 6명이 필요합니다.');if(r.members.some(m=>!m.ready))fail('NOT_READY','전원이 준비해야 합니다.');r.clock=Math.max(r.clock,now);r.status='ACTIVE';r.startedAt=r.clock;r.endsAt=r.clock+(r.settings.enrageSeconds||300)*1000;r.initialMembers=r.members.map(m=>m.id);openPhase(r,0);}
function mechanicDone(r){const q=r.challenge;return q.kind==='DEBT'?q.debt.reflected:q.kind==='HEARTS'?q.hearts.done:q.kind==='SEVER'?Boolean(r.broken):q.kind==='SANCTUARY'?q.breaths===q.breathGoal:q.debt.reflected&&q.hearts.done&&q.breaths===q.breathGoal;}
function expose(r){if(r.status!=='ACTIVE'||r.step!=='MECHANIC'||!mechanicDone(r))return;r.step='DAMAGE';r.challenge.deadline=r.clock+24000;cue(r,'EXPOSE','역린 노출 · 전원 공격','이 상처를… 감당할 수 있겠느냐.','oath');}
function scheduled(r){const q=r.challenge,all=[r.endsAt,q.deadline];if(feedback(r)&&Number.isFinite(q.pressureAt))all.push(q.pressureAt);if(r.step==='MECHANIC'){if(['DEBT','FINAL'].includes(q.kind)&&!q.debt.reflected)all.push(q.debt.closesAt);if(['HEARTS','FINAL'].includes(q.kind)&&!q.hearts.done&&q.hearts.firstAt!==null)all.push(q.hearts.firstAt+3000);if(['SANCTUARY','FINAL'].includes(q.kind)&&q.breaths<q.breathGoal)all.push(q.breathAt);}return Math.min(...all.filter(Number.isFinite));}
export function tickBlackwingRoom(r,now){if(!Number.isFinite(now))fail('TIME','유효한 서버 시각이 필요합니다.',400);now=Math.max(r.clock,now);for(let i=0;r.status==='ACTIVE'&&i<100;i++){const at=scheduled(r);if(at>now)break;r.clock=at;const q=r.challenge;if(at>=r.endsAt){finish(r,'FAILED','ENRAGE','광폭화 · 전장이 붕괴했습니다.');break;}if(r.step==='TRANSITION'){openPhase(r,r.phase+1);continue;}if(at>=q.deadline){finish(r,'FAILED',r.step==='DAMAGE'?'DPS_TIMEOUT':'MECHANIC_TIMEOUT',r.step==='DAMAGE'?'역린 노출 시간 종료 · 공대 피해량이 부족합니다.':'기믹 제한 시간이 끝났습니다.');break;}
 if(feedback(r)&&q.pressureAt!==null&&at>=q.pressureAt){q.pressureAt=null;wound(r,.20,'용혈 폭발 · 전원 최대 체력 20% 피해');if(r.status!=='ACTIVE')break;}
 if(['DEBT','FINAL'].includes(q.kind)&&!q.debt.reflected&&at>=q.debt.closesAt){mistake(r,'용혈 부채 반전 실패 · '+(!q.debt.anchor?(r.broken==='WING'?roleMembers(r,'GUARD')[1].name+' 검 반격 미완료':roleMembers(r,'GUARD')[1].name+' 고정 미완료'):q.debt.seals.length<2?'격리 미완료: '+roleMembers(r,'SEALER').filter(m=>!q.debt.seals.includes(m.id)).map(m=>m.name).join(', '):roleMembers(r,'GUARD')[0].name+' 반전 미완료'));debtReset(r);}
 if(['HEARTS','FINAL'].includes(q.kind)&&!q.hearts.done&&q.hearts.firstAt!==null&&at>=q.hearts.firstAt+3000){mistake(r,'쌍심장 3초 동기화 실패 · 미완료: '+roleMembers(r,'BREAKER').filter((m,i)=>!q.hearts.broken[i]).map(m=>m.name).join(', '));heartsReset(r);}
 if(['SANCTUARY','FINAL'].includes(q.kind)&&q.breaths<q.breathGoal&&at>=q.breathAt){
  if(q.wardLocked!==null){const ward=q.wardLocked;r.wards[ward]--;r.lastWard=ward;q.breaths++;cue(r,'WARD',['재','뼈','피'][ward]+' 성역 방어 '+q.breaths+'/'+q.breathGoal,'그 보호막도 곧 사라지리라.','slash');if(feedback(r))wound(r,.06,'성역을 통과한 잔열 · 전원 최대 체력 6% 피해');}
  else mistake(r,'용염 방어 실패 · '+roleMembers(r,'GUARD')[q.breaths%2].name+' (수호 '+(q.breaths%2+1)+') 성역 미전개'+(!oathDone(r,'BREAKER')||!oathDone(r,'SEALER')?' / 파쇄·봉인 문양 미완료':''));q.wardLocked=null;q.breathCycle++;q.breathAt=at+6500;if(q.breaths<q.breathGoal)resetOaths(r);
  if(q.breaths<q.breathGoal&&!r.wards.some((v,j)=>v>0&&j!==r.lastWard))finish(r,'FAILED','WARD_EMPTY','사용 가능한 성역 내구도가 없습니다.');
 }expose(r);
 }r.clock=now;return r;}
function attacks(r,m){const source=[...alive(r,m.id),...r.loadouts[m.id].supports].map(copy);if(!source.length)fail('DEAD','편성이 쓰러졌습니다.');const enemy={...copy(r.boss),hp:r.boss.maxHp,alive:true,shield:0};const sim=simulateBattleV2Preview({teamA:source,teamB:[enemy],seed:r.seed+r.eventSeq,maxActions:6,forcedMonsterEvery:5,healerPenalty:true});return sim.timeline.filter(e=>source.some(f=>f.id===e.actorId)&&e.targetId===r.boss.id&&Number(e.damage)>0).map(e=>({...e,damage:Math.min(e.damage,Math.ceil(source.find(f=>f.id===e.actorId).attack*1.8))}));}
function cooldown(r,m){const q=r.challenge;if(r.clock-(q.lastStrike[m.id]??-Infinity)<1200)fail('COOLDOWN','공격 준비 중입니다.');q.lastStrike[m.id]=r.clock;}
function shareFor(r,id){const floor=Math.round(r.boss.maxHp*BLACKWING_PLANS[r.phase].floor),start=Math.round(r.boss.maxHp*(r.phase?BLACKWING_PLANS[r.phase-1].floor:1)),chunk=start-floor,index=r.initialMembers?.indexOf(id)??-1,n=r.initialMembers?.length||6;return {floor,share:index<0?0:Math.floor(chunk*(index+1)/n)-Math.floor(chunk*index/n)};}
function applyPackets(r,packets,budget){const total=packets.reduce((sum,e)=>sum+e.damage,0);let used=0,weight=0;for(const e of packets){weight+=e.damage;const next=total?Math.round(weight*budget/total):0,damage=next-used;used=next;if(damage){r.boss.hp-=damage;event(r,e.type,e.label||'흑익 공략',{...e,damage,absorbed:0,targetHpAfter:r.boss.hp,targetMaxHp:r.boss.maxHp,targetShieldAfter:0});}}r.statistics.damage+=used;return used;}
function strike(r,m){if(r.step!=='DAMAGE')fail('SHIELDED','기믹으로 역린을 먼저 노출하세요.');const q=r.challenge,{floor,share}=shareFor(r,m.id),left=share-(q.damageBy[m.id]||0);if(left<=0)fail('SHARE_COMPLETE','이번 구간의 공격 몫을 완료했습니다.');cooldown(r,m);const packets=attacks(r,m),total=packets.reduce((sum,e)=>sum+e.damage,0),budget=Math.min(left,r.boss.hp-floor,total,Math.ceil(share/3));q.damageBy[m.id]=(q.damageBy[m.id]||0)+applyPackets(r,packets,budget);if(r.boss.hp<=floor){if(r.phase===4){event(r,'KO','모르드레인 격파',{targetId:r.boss.id});finish(r,'CLEAR','VICTORY','흑익의 맹약 공략 성공');}else{r.step='TRANSITION';q.deadline=r.clock+2000;cue(r,'TRANSITION','다음 맹약','끝난 것이 아니다.','oath');}}else wound(r,.012+r.strain*.004,'모르드레인 반격',m.id);}
const requireRole=(m,role)=>{if(m.role!==role)fail('ROLE_REQUIRED',BLACKWING_ROLES[role]+' 담당자의 임무입니다.',403);};
function tokenFor(r,action,m){const q=r.challenge;if(action==='RUNE'){const o=q.oaths?.[m?.role];return q.id+':oath:'+q.oathCycle+':'+m?.role+':'+(o?.progress||0);}if(['CHARGE','ISOLATE','ANCHOR','REFLECT'].includes(action))return q.id+':debt:'+q.debt.cycle;if(['ARM','HEART'].includes(action))return q.id+':hearts:'+q.hearts.cycle;if(action==='WARD')return q.id+':ward:'+q.breathCycle;return q.id;}
function actBlackwingRoomCore(r,id,input={},now=r.clock){const m=actorFor(r,id);if(input.actorId!==undefined&&String(input.actorId)!==m.id)fail('ACTOR','본인의 역할만 조작할 수 있습니다.',403);if(!/^[\w-]{8,100}$/.test(input.requestId||''))fail('REQUEST_ID','요청 식별자가 필요합니다.',400);const signature=JSON.stringify([m.id,input.action,input.target??null,input.token]);const prior=r.receipts[input.requestId];tickBlackwingRoom(r,now);if(prior){if(prior.signature!==signature)fail('REQUEST_CONFLICT','요청 내용이 달라졌습니다.');return {...prior.result,replayed:true};}if(r.status!=='ACTIVE')fail('NOT_ACTIVE','진행 중인 전투가 아닙니다.');if(!alive(r,m.id).length)fail('DEAD','편성이 쓰러졌습니다.');if(Object.keys(r.receipts).length>=2400)fail('REQUEST_LIMIT','공대 입력 한도를 넘었습니다.');
 const q=r.challenge,a=input.action,i=slot(r,m);let result={ok:true};
 if(input.token!==tokenFor(r,a,m))result={ok:true,ignored:true,reason:'STALE_INPUT'};
 else if(a==='RUNE')oathAction(r,m,input);
 else if(a==='STRIKE')strike(r,m);
 else if(a==='HEAL'){requireRole(m,'GUARD');if(feedback(r)&&r.clock<(r.resources.healReadyAt||0))fail('HEAL_COOLDOWN','다른 수호의 회복 직후입니다. 4초 뒤 사용할 수 있습니다.');if(!r.resources.heal)fail('HEAL_EMPTY','공대 회복을 모두 사용했습니다.');if(!alive(r).some(f=>f.hp<f.maxHp))fail('NO_TARGET','회복할 피해가 없습니다.');r.resources.heal--;if(feedback(r))r.resources.healReadyAt=r.clock+4000;for(const f of alive(r))f.hp=Math.min(f.maxHp,f.hp+Math.ceil(f.maxHp*.30));event(r,'BLACKWING_HEAL',m.name+' · 공대 30% 회복');}
 else {
  if(r.step!=='MECHANIC')fail('NO_MECHANIC','현재는 공격 구간입니다.');
  if(!oathDone(r,m.role))fail('OATH_REQUIRED','공유 문양판에서 같은 역할 두 명이 순서대로 문양을 맞추세요.');
  if(['CHARGE','ISOLATE','ANCHOR','REFLECT'].includes(a)){
   if(!['DEBT','FINAL'].includes(q.kind)||q.debt.reflected)fail('NO_DEBT','현재 용혈 부채가 없습니다.');const d=q.debt;
   if(a==='CHARGE'){requireRole(m,'BREAKER');cooldown(r,m);if(d.packets>=3||d.seals.length)mistake(r,'격리한 용혈에 추가 공격');else {const packets=attacks(r,m),damage=packets.reduce((sum,e)=>sum+e.damage,0);if(!damage)fail('NO_DAMAGE','용혈을 채울 유효 피해가 부족합니다.');d.packets++;d.damage+=damage;d.contributors[m.id]=(d.contributors[m.id]||0)+1;r.statistics.packets++;event(r,'BLACKWING_CHARGE',m.name+' · 용혈 '+d.packets+'/3',{ownerId:m.id,storedDamage:damage});}}
   if(a==='ISOLATE'){requireRole(m,'SEALER');if(d.packets!==3||Object.keys(d.contributors).length!==2)fail('DEBT_NOT_READY','파쇄 두 명이 함께 용혈 3회를 채워야 합니다.');if(!d.seals.includes(m.id)){d.seals.push(m.id);event(r,'BLACKWING_SEAL',m.name+' · 용혈 격리');}}
   if(a==='ANCHOR'){requireRole(m,'GUARD');if(i!==1)fail('ASSIGNMENT','수호 2의 반격·고정 임무입니다.',403);if(r.clock<d.opensAt)mistake(r,'반전 창 이전 성급한 반격');else if(q.kind==='FINAL'&&r.broken==='WING'&&r.clock>=d.opensAt+2500)fail('PARRY_WINDOW','검 반격 대응 창이 끝났습니다. 다음 부채를 준비하세요.');else {d.anchor=true;event(r,'BLACKWING_ANCHOR',m.name+' · '+(r.broken==='WING'?'검 반격 저지':'용혈 고정'));}}
   if(a==='REFLECT'){requireRole(m,'GUARD');if(i!==0)fail('ASSIGNMENT','수호 1의 부채 반전 임무입니다.',403);if(d.seals.length!==2||!d.anchor||r.clock<d.opensAt)mistake(r,'격리·고정·반전 순서 위반');else{d.reflected=true;cue(r,'REFLECT','용혈 부채 반전','내 용혈을 되돌리다니.','oath');r.statistics.tasks++;}}
  }else if(['ARM','HEART'].includes(a)){
   if(!['HEARTS','FINAL'].includes(q.kind)||q.hearts.done)fail('NO_HEART','현재 쌍심장 기믹이 아닙니다.');const h=q.hearts;if(String(input.target)!==String(i))fail('ASSIGNMENT','자신에게 지정된 심장만 조작하세요.',403);
   if(a==='ARM'){requireRole(m,'SEALER');h.armed[i]=true;event(r,'BLACKWING_ARM',m.name+' · '+(i?'우':'좌')+'심장 준비');}
   else{requireRole(m,'BREAKER');if(!h.armed.every(Boolean))fail('HEART_NOT_READY','봉인 두 명의 준비를 기다리세요.');if(h.broken[i])fail('HEART_DONE','이미 파괴한 심장입니다.');cooldown(r,m);if(!attacks(r,m).length)fail('NO_DAMAGE','심장 파괴 피해가 부족합니다.');h.broken[i]=true;if(h.firstAt===null)h.firstAt=r.clock;if(h.broken.every(Boolean)){h.done=true;r.statistics.tasks++;cue(r,'HEARTS_CLEAR','쌍생 심장 동시 파괴','두 심장이… 함께 멈추었다.','oath');}else event(r,'BLACKWING_HEART',m.name+' · 첫 심장 파괴, 3초 내 동료 공격');}
  }else if(['VOTE','BRACE','CUT'].includes(a)){
   if(q.kind!=='SEVER'||r.broken)fail('NO_PART','이미 절단 부위가 확정되었습니다.');if(a==='VOTE'){requireRole(m,'SEALER');if(!['WING','BLADE'].includes(input.target))fail('TARGET','흑익 또는 대검을 선택하세요.',400);if(q.cuts.length)fail('VOTE_LOCKED','절단 시작 후 선택을 바꿀 수 없습니다.');q.votes[m.id]=input.target;}
   if(a==='BRACE'){requireRole(m,'GUARD');if(!q.braces.includes(m.id))q.braces.push(m.id);}
   if(a==='CUT'){requireRole(m,'BREAKER');const votes=Object.values(q.votes);if(votes.length!==2||votes[0]!==votes[1]||q.braces.length!==2)fail('PART_NOT_READY','봉인 2명의 부위 합의와 수호 2명의 고정이 필요합니다.');if(q.cuts.includes(m.id))fail('CUT_DONE','이미 절단에 참여했습니다.');cooldown(r,m);if(!attacks(r,m).length)fail('NO_DAMAGE','부위 절단 피해가 부족합니다.');q.cuts.push(m.id);if(q.cuts.length===2){r.broken=votes[0];cue(r,'SEVER_CLEAR',r.broken==='WING'?'흑익 절단 · 최종 용염 2회':'대검 절단 · 최종 용염 3회','그 선택을 끝까지 감당해라.','slash');r.statistics.tasks++;}}
   event(r,'BLACKWING_PART',m.name+' · 절단 협동');
  }else if(a==='WARD'){
   requireRole(m,'GUARD');if(!['SANCTUARY','FINAL'].includes(q.kind)||q.breaths>=q.breathGoal)fail('NO_BREATH','현재 용염 예고가 없습니다.');if(i!==q.breaths%2)fail('ASSIGNMENT','수호 '+(q.breaths%2+1)+'의 이번 성역 임무입니다.',403);if(!oathDone(r,'BREAKER')||!oathDone(r,'SEALER'))fail('OATH_REQUIRED','파쇄·봉인 두 쌍의 이번 용염 문양을 먼저 완성하세요.');const ward=Number(input.target);if(!Number.isInteger(ward)||ward<0||ward>2)fail('TARGET','성역을 선택하세요.',400);if(q.wardLocked!==null)fail('WARD_LOCKED','이번 성역이 이미 전개됐습니다.');if(r.wards[ward]<=0||r.lastWard===ward)mistake(r,'소진·연속 성역 사용');else if(r.clock<q.breathAt-wardWindow(r))mistake(r,'용염보다 너무 이른 성역 전개');else{q.wardLocked=ward;event(r,'BLACKWING_WARD_READY',m.name+' · 성역 전개');}
  }else fail('ACTION','지원하지 않는 행동입니다.',400);
  expose(r);
 }
 r.receipts[input.requestId]={signature,result};r.revision++;return result;
}
// Expected gameplay rejections are committed with the same room CAS/receipt as
// successful input, so teammates can review them and retry cannot add a penalty.
export function actBlackwingRoom(r,id,input={},now=r.clock){
 if(!feedback(r))return actBlackwingRoomCore(r,id,input,now);
 const m=actorFor(r,id),prior=r.receipts[input.requestId];
 // Resolve timed damage and missed team mechanics before attributing this input.
 tickBlackwingRoom(r,now);const before=r.strain;
 r.actionContext={ownerId:m.id,ownerName:m.name,role:m.role,slot:slot(r,m),action:input.action};
 let result;
 try{result=actBlackwingRoomCore(r,id,input,now);}
 catch(error){
  const recoverable=['COOLDOWN','NO_TARGET','HEAL_COOLDOWN','HEAL_EMPTY','OATH_TURN','OATH_DONE','OATH_REQUIRED','DEBT_NOT_READY','PARRY_WINDOW','HEART_NOT_READY','HEART_DONE','PART_NOT_READY','CUT_DONE','WARD_LOCKED','ASSIGNMENT','SHARE_COMPLETE','NO_DEBT','NO_HEART','NO_PART','NO_BREATH','NO_OATH','SHIELDED','NO_MECHANIC','NO_DAMAGE'];
  if(!recoverable.some(code=>error.code==='BLACKWING_'+code)){delete r.actionContext;throw error;}
  result={ok:false,code:error.code,message:error.message};
  r.receipts[input.requestId]={signature:JSON.stringify([m.id,input.action,input.target??null,input.token]),result};
 }finally{delete r.actionContext;}
 if(!prior){const outcome=result.ignored?'IGNORED':!result.ok?'REJECTED':r.strain>before?'FAILED':'SUCCESS';
  const target=input.action==='RUNE'?BLACKWING_RUNES[Number(input.target)]:input.action==='WARD'?['재의 성역','뼈의 성역','피의 성역'][Number(input.target)]:input.action==='VOTE'?{WING:'흑익',BLADE:'대검'}[input.target]:null;
  event(r,'BLACKWING_ACTION',m.name+' · '+(actionNames[input.action]||input.action)+(target?' / '+target:'')+' · '+({IGNORED:'지난 입력 무시',REJECTED:'입력 거절',FAILED:'실패',SUCCESS:'성공'}[outcome]),{ownerId:m.id,ownerName:m.name,role:m.role,slot:slot(r,m),action:input.action,target:input.target,outcome,reason:result.message||result.reason||'',branch:r.broken,strain:r.strain});
 }
 return result;
}
// Only already-snapshotted display art is exposed: no account query or deck stats.
export function blackwingCardArt(card){
 if(!card)return null;
 return {image:String(card.image_url||card.image||''),title:String(card.title||card.name||'편성 카드'),focusX:Math.max(0,Math.min(100,Number(card.focusX??card.focus_x??50))),focusY:Math.max(0,Math.min(100,Number(card.focusY??card.focus_y??25)))};
}
export function blackwingView(r,id,{since=0}={}){const m=actorFor(r,id),q=r.challenge,{floor,share}=shareFor(r,m.id);return copy({id:r.id,hostId:r.hostId,status:r.status,rulesVersion:r.rulesVersion,serverNow:r.clock,startedAt:r.startedAt,endsAt:r.endsAt,finishedAt:r.finishedAt,revision:r.revision,eventSeq:r.eventSeq,phase:r.phase+1,phaseName:BLACKWING_PLANS[r.phase].name,step:r.step,bossHp:r.boss.hp,bossMaxHp:r.boss.maxHp,roundFloor:floor,bossCombatPower:r.monster.battle_power,me:{...m,slot:slot(r,m),isHost:m.id===r.hostId},lineup:(r.loadouts[m.id]?.cards||[]).map(blackwingCardArt),members:r.members.map(x=>({...x,portrait:blackwingCardArt(r.loadouts[x.id]?.cards?.[0]),slot:slot(r,x),hp:alive(r,x.id).reduce((s,f)=>s+f.hp,0),maxHp:r.fighters.filter(f=>f.ownerId===x.id).reduce((s,f)=>s+f.maxHp,0)})),challenge:q?{...q,tokens:Object.fromEntries(['RUNE','CHARGE','ISOLATE','ANCHOR','REFLECT','ARM','HEART','VOTE','BRACE','CUT','WARD','STRIKE','HEAL'].map(a=>[a,tokenFor(r,a,m)]))}:null,wards:r.wards,lastWard:r.lastWard,broken:r.broken,strain:r.strain,resources:r.resources,attackShare:share,attackRemaining:Math.max(0,share-(q?.damageBy[m.id]||0)),nextStrikeAt:(q?.lastStrike[m.id]??-1200)+1200,fighters:r.fighters.filter(f=>f.ownerId===m.id).map(({id,hp,maxHp,isMercenary})=>({id,hp,maxHp,isMercenary})),events:r.events.filter(e=>e.seq>since),combatLog:(r.combatLog||[]).filter(e=>e.seq>since),logStartSeq:r.combatLog?.[0]?.seq||0,wardWindowMs:wardWindow(r),presentation:r.presentation||null,failure:r.failure,statistics:r.statistics});}
export function blackwingBattlePayload(r,id){const m=actorFor(r,id),l=r.loadouts[m.id],fighters=r.fighters.filter(f=>f.ownerId===m.id),art={scope:'BATTLE_ENGINE_ONLY',kind:'BLACKWING_BOSS',primaryUrl:r.monster.battleSprite,pngFallbackUrl:r.monster.battleSprite,footAnchor:{x:.5,y:.93},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:1.6,technicalPass:true};return {mode:'RAID',battlefieldMode:'RAID',reviewOnly:false,playUltimateCinematics:false,accountNickname:m.name,cards:copy(l.cards),characterBonus:copy(l.characterBonus),monster:{...copy(r.monster),hp:r.boss.hp,maxHp:r.boss.maxHp,projectVMonsterArt:art},battleV2:{schemaVersion:2,rules:{battleSuitDamageAuthority:l.supports.length?'SERVER_TIMELINE':'NONE',battleSuitActionClock:'INDEPENDENT_TIME_CADENCE'},teams:{A:{cards:copy(fighters.filter(f=>!f.isMercenary)),mercenaries:copy(fighters.filter(f=>f.isMercenary)),supports:copy(l.supports)},B:{cards:[{...copy(r.boss),isBoss:true,projectVMonsterArt:art}]}},result:{timeline:[],supports:{A:copy(l.supports),B:[]}}}};}
