// Encounter v2 is snapshotted when a room is created. Existing fights keep v1.
// Personal step tokens make delayed/repeated clicks harmless across room CAS retries.
const RUNES=['달','가시','왕관'];
const list=(room,role)=>room.members.filter(m=>m.role===role);
const pick=(rows,n)=>rows[n%rows.length]?.id;
const runes=seed=>{
  let n=seed>>>0;const result=[...RUNES];
  for(let i=2;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
};
const name=(room,id)=>room.members.find(m=>m.id===id)?.name||'담당자 이탈';
export function openCoopRound(room,plan,index,{record,wipe}){
  const wardens=list(room,'WARDEN'),assault=list(room,'ASSAULT'),rescue=list(room,'RESCUE');
  if(!wardens.length||!assault.length||!rescue.length){wipe(room,'MISSING_ROLES','다음 작전에 정벌·봉인·구출 담당이 모두 필요합니다.');return;}
  const active=room.fighters.filter(f=>f.hp>0),target=active[(room.seed+index)%active.length];
  const complex=index>=4,prison=index>=2,variant=(room.seed+index)%2;
  const start=room.clock,plagueOwner=pick(rescue,index),soulOwners=rescue.length===1?rescue:rescue.filter(m=>m.id!==plagueOwner);
  room.round=index;room.phase=plan.phase;room.step='MECHANIC';
  room.challenge={id:room.id+':v2:'+index,kind:plan.kind,coop:true,startedAt:start,deadline:start+(complex?28000:25000),
    targetId:target.id,targetName:(target.ownerName?target.ownerName+' · ':'')+target.title,
    prison,hasPrison:prison,breathAt:start+8000,breathResolved:!prison,earlyBroken:false,prisonBroken:false,
    plague:true,plagueStacks:1,plagueAt:0,plagueOwner,plagueRune:RUNES[(room.seed+index)%3],transferred:false,
    seals:wardens.map((m,i)=>({id:'seal-'+i,ownerId:m.id,sequence:runes(room.seed+index*97+i*31),reverse:complex&&Boolean((index+i)%2),index:0,epoch:0,completedAt:0})),
    sealed:false,linkDeadline:0,
    chains:assault.map((m,i)=>({id:'chain-'+i,ownerId:m.id,rune:RUNES[(room.seed+index+i)%3],broken:false})),
    rescues:soulOwners.map((m,i)=>({id:'soul-'+i,ownerId:m.id,rune:RUNES[(room.seed+index+i+1)%3],at:0,done:false})),
    curseOwner:pick(rescue,index+1),curseRune:RUNES[(room.seed+index+2)%3],curseDone:false,
    curseAt:start+(prison?(complex&&variant?8500:11000):6500),curseDeadline:start+(prison?(complex&&variant?14000:17000):13000),
    castAt:start+(complex&&variant?16000:prison?12000:10000),castDeadline:start+(complex&&variant?21500:prison?17500:15500),
    interruptOwner:pick(wardens,index),interrupted:false,cast:'FROST_NOVA',lastStrikes:{},inputEpochs:{},pulseDone:false};
  record(room,'RAID_LICH_PHASE',['저주받은 왕좌','절대영도','서리한의 내부','왕의 최후'][plan.phase-1],{phase:plan.phase,round:index+1});
  record(room,'RAID_LICH_MECHANIC','개인 봉인 → 담당 사슬 → 역병·영혼 · 차단 '+name(room,room.challenge.interruptOwner));
  if(prison)record(room,'RAID_LICH_PRISON','절대영도까지 8초 엄폐 · 흡수 후 직접 파쇄',{targetId:target.id});
}

// On departure only, inherit the missing player's unfinished work. Reassignment
// affects the next round; it cannot erase a current obligation or reset a clock.
export function reconcileCoopDuties(room){
  const c=room.challenge;if(!c?.coop||room.step!=='MECHANIC')return;
  const exists=id=>room.members.some(m=>m.id===id);
  const replacement=(id,role)=>exists(id)?id:pick(list(room,role),room.round);
  for(const [key,role]of [['seals','WARDEN'],['chains','ASSAULT'],['rescues','RESCUE']])
    for(const task of c[key])task.ownerId=replacement(task.ownerId,role)||task.ownerId;
  for(const [key,role]of [['plagueOwner','RESCUE'],['curseOwner','RESCUE'],['interruptOwner','WARDEN']])c[key]=replacement(c[key],role)||c[key];
}

export function coopControls(room,memberId){
  const c=room.challenge;if(!c?.coop||room.status!=='ACTIVE')return [];
  const result=[],now=room.clock;
  const add=(key,action,label,options={})=>result.push({key,action,label,ownerId:memberId,
    token:c.id+':'+key+':'+(options.revision??c.inputEpochs[key]??0),...options});
  const mechanic=room.step==='MECHANIC';
  if(mechanic){
    for(const task of c.seals.filter(t=>t.ownerId===memberId&&!c.sealed))add(task.id,'SEAL','개인 봉인',{
      taskId:task.id,revision:task.epoch+':'+task.index,sequence:task.sequence,reverse:task.reverse,index:task.index,
      choices:RUNES,blocked:task.index===3,note:task.index===3?'내 봉인 완료 · 동료 연결 대기':name(room,memberId)+'의 문양 · '+(task.reverse?'오른쪽부터 역순으로 입력':'왼쪽부터 순서대로 입력'),deadline:c.linkDeadline||c.deadline});
    for(const task of c.chains.filter(t=>t.ownerId===memberId&&!t.broken))add(task.id,'SHATTER',c.hasPrison?'감옥 사슬 파쇄':'방벽 사슬 파쇄',{
      taskId:task.id,choices:RUNES,rune:task.rune,blocked:!c.sealed||Boolean(room.combatRevision===2&&!c.breathResolved),
      startsAt:room.combatRevision===2&&c.hasPrison?c.breathAt:0,
      note:!c.sealed?'봉인대의 결계 고정 대기':!c.breathResolved?'엄폐 유지 · 절대영도 흡수 후 파쇄 가능':'지금 '+task.rune+' 사슬 파쇄'+(c.hasPrison?' · 흡수 후 6초 안에 완료':''),deadline:c.hasPrison?c.breathAt+6000:c.deadline});
    if(c.plague&&c.plagueOwner===memberId)add('plague','TRANSFER','역병 전이',{choices:RUNES,rune:c.plagueRune,
      blocked:!c.plagueAt,startsAt:c.plagueAt?c.plagueAt+2000:0,deadline:c.plagueAt?c.plagueAt+8000:0,note:c.plagueAt?'2~4중첩에 같은 문양의 구울 선택':'모든 사슬 파쇄 대기'});
    for(const task of c.rescues.filter(t=>t.ownerId===memberId&&!t.done))add(task.id,'RESCUE','영혼 구출',{
      taskId:task.id,choices:RUNES,rune:task.rune,blocked:!c.plagueAt||Boolean(task.at),note:task.at?'영혼 구출 중 · 2초':'사슬 해방 후 같은 문양의 영혼 선택',deadline:task.at||c.deadline});
    if(!c.curseDone&&c.curseOwner===memberId)add('curse','CLEANSE','죽음의 저주 정화',{choices:RUNES,rune:c.curseRune,
      startsAt:c.curseAt,deadline:c.curseDeadline,note:'예고된 저주 문양을 정화 · 실패 시 광역 피해',count:room.resources.cleanse,blocked:!room.resources.cleanse});
    if(!c.interrupted&&c.interruptOwner===memberId)add('interrupt','INTERRUPT','영혼 말살 차단',{
      startsAt:c.castAt,deadline:c.castDeadline,note:'이번 차단 담당 · 시전 완료 시 전멸',count:room.resources.interrupt,blocked:!room.resources.interrupt});
  }
  if(room.step==='EXPOSED'){
    const startsAt=(c.lastStrikes[memberId]??-10000)+1400;
    add('strike-'+memberId,'STRIKE','내 편성 공격',{startsAt,deadline:c.deadline,note:room.combatRevision===2?'연속 공격으로 함께 방벽 돌파 · 1회 피해 한도 적용':'내 카드·용병·슈트로 공격'});
    add('burst-'+memberId,'BURST','결전',{startsAt,deadline:c.deadline,count:room.personalBurst[memberId]||0,blocked:!room.personalBurst[memberId],note:room.combatRevision===2?'피해·1회 한도 1.8배 · 개인 2회':'개인 결전 · 전투 전체 2회'});
  }
  // Rescue support is shared, but its resource version is part of the token.
  if(['MECHANIC','EXPOSED'].includes(room.step)&&list(room,'RESCUE').some(m=>m.id===memberId)){
    add('heal','HEAL','공대 회복',{count:room.resources.heal,revision:room.resources.heal,blocked:!room.resources.heal,note:'공용 4회 · 생존 편성 HP 34% 회복'});
    const dead=room.fighters.find(f=>f.hp<=0);
    if(dead)add('revive','REVIVE','쓰러진 카드 부활',{target:dead.id,count:room.resources.revive,revision:room.resources.revive,blocked:!room.resources.revive||room.souls<1,note:'공용 1회 · 영혼 1개 소모'});
  }
  return result;
}

function mistake(room,label,ratio,ctx,details={}){
  room.doom++;room.statistics.mistakes++;
  room.lastMistake={label,...details,at:room.clock};
  ctx.record(room,'RAID_LICH_MISTAKE',label+' · 죽음의 잔재 +1',details);
  if(ratio)ctx.wound(room,ratio,label);
}
function finishMechanic(room,ctx){
  const c=room.challenge;
  if(room.status!=='ACTIVE'||room.step!=='MECHANIC'||!c.sealed||!c.prisonBroken||c.plague||!c.interrupted||!c.curseDone||!c.rescues.every(t=>t.done))return;
  if(c.kind==='FINALE'&&room.souls<3)return;
  c.pulseDone=true;ctx.wound(room,c.kind==='FINALE'?.28:.20,'방벽 붕괴 충격');
  if(room.status!=='ACTIVE')return;
  room.step='EXPOSED';c.deadline=room.clock+(c.kind==='FINALE'?12000:11000);
  ctx.record(room,'RAID_LICH_EXPOSED','방벽 붕괴 충격 · 전원 개인 공격 / 결전');
}
export function tickCoopRoom(room,ctx){
  const c=room.challenge,now=room.clock;
  if(room.step==='MECHANIC'){
    if(c.linkDeadline&&!c.sealed&&now>=c.linkDeadline){
      c.linkDeadline=0;for(const t of c.seals){t.index=0;t.completedAt=0;t.epoch++;}
      mistake(room,'봉인 연결 시간 초과 · 개인 봉인 재시도',.12,ctx);
    }
    if(!c.breathResolved&&now>=c.breathAt){
      c.breathResolved=true;
      ctx.record(room,'RAID_LICH_BREATH',c.earlyBroken?'엄폐 소실 · 절대영도 직격':'절대영도 흡수 · 6초 안에 감옥 파쇄',{safe:!c.earlyBroken,targetId:c.targetId});
      if(c.earlyBroken)ctx.wound(room,.62,'절대영도 직격');
      if(c.chains.every(t=>t.broken)){c.prison=false;c.prisonBroken=true;c.plagueAt=c.breathAt;}
    }
    if(c.hasPrison&&c.breathResolved&&!c.prisonBroken&&now>=c.breathAt+6000){
      const pending=!c.sealed?c.seals.filter(t=>t.index<3).map(t=>name(room,t.ownerId)+' 봉인'):c.chains.filter(t=>!t.broken).map(t=>name(room,t.ownerId)+' '+t.rune+' 사슬');
      ctx.wipe(room,'PRISON_CRUSH','미완료: '+pending.join(', ')+'. 봉인을 먼저 연결하고 절대영도 흡수 후 6초 안에 사슬을 파쇄하세요.');return;
    }
    if(c.plagueAt&&c.plague){c.plagueStacks=Math.min(5,1+Math.floor((now-c.plagueAt)/2000));if(c.plagueStacks>=5){ctx.wipe(room,'PLAGUE_SPREAD','역병이 5중첩에 도달했습니다.');return;}}
    if(!c.interrupted&&now>=c.castAt&&c.cast!=='SOUL_ANNIHILATION'){c.cast='SOUL_ANNIHILATION';ctx.record(room,'RAID_LICH_CAST','영혼 말살 · '+name(room,c.interruptOwner)+' 차단');}
    if(!c.interrupted&&now>=c.castDeadline){ctx.wipe(room,'ANNIHILATION','담당자의 영혼 말살 차단이 늦었습니다.');return;}
    if(!c.curseDone&&now>=c.curseDeadline){c.curseDone=true;mistake(room,'죽음의 저주 폭발',.24,ctx);}
    for(const task of c.rescues)if(task.at&&now>=task.at&&!task.done){task.done=true;room.souls++;room.statistics.rescues++;ctx.record(room,'RAID_LICH_RESCUED',name(room,task.ownerId)+' · 영혼 구출 완료');}
    if(room.doom>=3){ctx.wipe(room,'DOOM','죽음의 잔재 3중첩 · 마지막 원인: '+(room.lastMistake?.label||'기믹 실패'));return;}
    finishMechanic(room,ctx);
  }
  if(room.status==='ACTIVE'&&['MECHANIC','EXPOSED'].includes(room.step)&&now>=c.deadline)
    ctx.wipe(room,room.step==='EXPOSED'?'DPS_CHECK':'MECHANIC_TIMEOUT',room.step==='EXPOSED'?'개인 공격을 모아 방벽 HP 목표를 돌파하지 못했습니다.':'담당 기믹을 제한 시간 안에 처리하지 못했습니다.');
}

export function actCoopRoom(room,memberId,input,ctx){
  const {fail,record,wound,resource}=ctx,c=room.challenge,now=room.clock;
  const batch=input.targets;
  if(batch!==undefined&&(input.action!=='SEAL'||input.target!==undefined||!Array.isArray(batch)||batch.length<1||batch.length>3||batch.some(r=>!RUNES.includes(r))))
    fail('SEAL_INPUT','봉인 문양을 순서대로 입력하세요.',400);
  if(typeof input.stepToken!=='string'||input.stepToken.length>220)fail('CLIENT_UPDATE','새 기믹 화면을 불러온 뒤 다시 입력하세요.',409);
  const controls=coopControls(room,memberId),control=controls.find(a=>a.token===input.stepToken&&a.action===input.action);
  if(!control){
    // An old step never becomes the next rune. Only previously issued tokens for
    // this member can be ignored; another member's live token is never accepted.
    if(room.consumedSteps?.[input.stepToken]===memberId)return;
    fail('STALE_STEP','담당 기믹이 갱신되었습니다. 현재 화면을 확인하세요.',409);
  }
  if(control.blocked)fail('MECHANIC_LOCKED',control.note);
  if(control.startsAt&&now<control.startsAt)fail('TOO_EARLY','아직 입력 시간이 아닙니다. 전장 예고를 확인하세요.');
  if(control.deadline&&now>=control.deadline)fail('TOO_LATE','입력 시간이 끝났습니다.');
  if(batch!==undefined){
    const seal=c.seals.find(t=>t.id===control.taskId),epoch=seal.epoch;
    if(batch.length>3-seal.index)fail('SEAL_INPUT','남은 봉인 문양 수를 확인하세요.',400);
    // Validate the player's selections in order under the existing room CAS.
    // A wrong rune ends this submission; queued keys cannot penalize a reset.
    const {targets,...single}=input;
    for(const target of batch){
      const next=coopControls(room,memberId).find(a=>a.key===control.key&&a.action==='SEAL');
      if(!next||next.blocked)break;
      actCoopRoom(room,memberId,{...single,stepToken:next.token,target},ctx);
      if(room.status!=='ACTIVE'||seal.epoch!==epoch)break;
    }
    return;
  }
  const action=input.action,task=control.taskId;
  const expected=action==='SEAL'?(()=>{const t=c.seals.find(t=>t.id===task);return (t.reverse?[...t.sequence].reverse():t.sequence)[t.index];})():control.rune;
  const wrong=control.choices&&input.target!==expected;
  if(wrong){
    if(action==='SEAL'){const t=c.seals.find(t=>t.id===task);t.index=0;t.epoch++;}
    mistake(room,name(room,memberId)+' · '+control.label+' 오답 ('+input.target+' → '+expected+')'+(action==='SEAL'?' · 내 순서 처음부터':''),.12,ctx,{memberId,action,expected,selected:input.target});
  }else if(action==='SEAL'){
    const t=c.seals.find(t=>t.id===task);t.index++;
    if(t.index===3){t.completedAt=now;c.linkDeadline||=now+7000;}
    c.sealed=c.seals.every(t=>t.index===3);
    record(room,'RAID_LICH_SEAL',name(room,memberId)+(c.sealed?' · 결계 고정 완료':' · 개인 봉인 '+t.index+'/3'));
  }else if(action==='SHATTER'){
    const t=c.chains.find(t=>t.id===task);t.broken=true;
    if(!c.breathResolved){c.earlyBroken=true;mistake(room,'감옥 조기 파쇄 · 엄폐 손상',0,ctx);}
    if(c.chains.every(t=>t.broken)&&c.breathResolved){c.prison=false;c.prisonBroken=true;c.plagueAt=now;}
    record(room,'RAID_LICH_SHATTER',name(room,memberId)+' · '+t.rune+' 사슬 파쇄',{targetId:c.targetId});
  }else if(action==='TRANSFER'){
    c.plague=false;c.transferred=true;room.statistics.transfers++;record(room,'RAID_LICH_TRANSFER','역병 전이 · 왕의 갑옷 약화');
  }else if(action==='RESCUE'){
    c.rescues.find(t=>t.id===task).at=now+2000;record(room,'RAID_LICH_RESCUE',name(room,memberId)+' · 영혼 구출 중');
  }else if(action==='CLEANSE'){
    resource(room,'cleanse');c.curseDone=true;record(room,'RAID_LICH_CLEANSE','죽음의 저주 정화 완료');
  }else if(action==='INTERRUPT'){
    resource(room,'interrupt');c.interrupted=true;room.statistics.interrupts++;record(room,'RAID_LICH_INTERRUPT',name(room,memberId)+' · 영혼 말살 차단');
  }else if(action==='HEAL'){
    resource(room,'heal');for(const f of room.fighters.filter(f=>f.hp>0))f.hp=Math.min(f.maxHp,f.hp+Math.round(f.maxHp*.34));
    record(room,'TEAM_HEAL','구출대 공대 회복',{targets:room.fighters.filter(f=>f.hp>0).map(f=>({targetId:f.id,hpAfter:f.hp}))});
  }else if(action==='REVIVE'){
    const f=room.fighters.find(f=>f.id===control.target&&f.hp<=0);if(!f||input.target!==f.id)fail('NO_DEAD_TARGET','현재 부활 대상을 확인하세요.');
    resource(room,'revive');room.souls--;f.hp=Math.round(f.maxHp*.5);f.alive=true;record(room,'RAID_LICH_REVIVE',f.title+' 복귀');
  }else if(action==='STRIKE'||action==='BURST'){
    if(!room.fighters.some(f=>f.hp>0&&(!room.loadouts||f.ownerId===memberId)))fail('NO_FIGHTER','공격할 생존 편성이 없습니다.');
    if(action==='BURST')room.personalBurst[memberId]--;
    c.lastStrikes[memberId]=now;
    // Both buttons represent the same personal attack opportunity.
    c.inputEpochs['strike-'+memberId]=(c.inputEpochs['strike-'+memberId]||0)+1;
    c.inputEpochs['burst-'+memberId]=(c.inputEpochs['burst-'+memberId]||0)+1;
    ctx.applyCombat(room,action==='BURST',memberId);
  }
  if(!wrong){room.consumedSteps||={};room.consumedSteps[input.stepToken]=memberId;}
  else c.inputEpochs[control.key]=(c.inputEpochs[control.key]||0)+1;
  if(room.doom>=3)ctx.wipe(room,'DOOM','죽음의 잔재 3중첩 · 마지막 원인: '+(room.lastMistake?.label||'기믹 실패'));
  finishMechanic(room,ctx);
}
