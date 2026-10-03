import {jointAccountRequest as request} from '/js/joint-account-transport.mjs';
export function mountLichRaid(root=document.body,{loadBattle=async()=>{}}={}){
const $=id=>root.querySelector('[data-lich-id="'+id+'"]')||root.querySelector('#'+id),roles={ASSAULT:'정벌대',WARDEN:'봉인대',RESCUE:'구출대',UNASSIGNED:'배정 대기'};
const roleKeys=['ASSAULT','WARDEN','RESCUE'];
const roleHints={ASSAULT:'개인 봉인 연결 후 담당 사슬을 파쇄하세요. 감옥은 8초 절대영도 흡수 후 6초 안에 파쇄합니다.',WARDEN:'자신의 봉인 문양을 입력하고 동료와 7초 안에 연결하세요. 이번 차단 담당도 확인하세요.',RESCUE:'매 작전 역병·영혼·저주 담당이 배정됩니다. 남은 시간을 보고 처리하며 공대 회복을 배분하세요.',UNASSIGNED:'공대장의 작전 배분을 기다려주세요. 역할이 정해지면 준비할 수 있습니다.'};
const symbols={ASSAULT:'<path d="m4 3 7 7-3 3-7-7 3-3Zm9 10 7 7M13 3l7 3-7 7m-3 3-6 6M15 18l3-3M3 15l3 3"/>',WARDEN:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="M12 7v9M8 11l4-4 4 4"/>',RESCUE:'<path d="M7 5h10l4 7-4 7H7l-4-7 4-7Z"/><path d="M12 8v8M8 12h8"/>',UNASSIGNED:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',CHECK:'<path d="m5 12 4 4L19 6"/>',EXIT:'<path d="M9 4H4v16h5m5-13 5 5-5 5M9 12h10"/>',ARROW:'<path d="M4 12h16m-6-6 6 6-6 6"/>',PEOPLE:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m2-17a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v3"/>'};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+symbols[name]+'</svg>';
const lifecycle=new AbortController();
const on=(target,type,listener)=>target.addEventListener(type,listener,{signal:lifecycle.signal});
let disposed=false;
let portal=null,bodyOverflow='';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(route,options)=>request('raid/lich/'+route,options);
let state=null,eventSeq=0,roomId=sessionStorage.getItem('lichLiveRoom')||'',mounted=false,mounting=false,polling=false,busy=false,ended=false,view='landing',timer,toastTimer,memberKey='',failures=0,generation=0;
let preparation=null;
let loadoutKey='';
function prewarm(){
  preparation||=loadBattle().then(()=>window.LichBattle?.preload?.()).catch(error=>{preparation=null;console.warn('[Lich resources]',error);});
}
let savedRequests=[];try{savedRequests=JSON.parse(sessionStorage.getItem('lichLiveRequests')||'[]');if(!Array.isArray(savedRequests))savedRequests=[];}catch{}
const pending=new Map(savedRequests);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function renderGuideContext(){
  const active=state?.status==='ACTIVE';
  $('guideRole').textContent=roleKeys.includes(state?.me.role)?'내 역할 · '+roles[state.me.role]:'3인 기준 · 역할별 행동 안내';
  $('guideNotice').textContent=active?'전투 중 · 공략을 열어도 기믹과 광폭화 시간은 계속 흐릅니다.':'출정 전에 읽고, 전투에서는 내 역할을 빠르게 확인하세요.';
  $('guideDialog').querySelector('.guide-context').classList.toggle('is-active',active);
}
function scrollGuideTo(name,{focus=true}={}){
  if(name==='roles'&&roleKeys.includes(state?.me.role))name=state.me.role;
  const target=$('guideDialog').querySelector('[data-guide-section="'+name+'"]'),scroll=$('guideScroll');
  if(!target)return;
  scroll.scrollTo({top:scroll.scrollTop+target.getBoundingClientRect().top-scroll.getBoundingClientRect().top-24,behavior:'instant'});
  if(focus)target.focus({preventScroll:true});
}
function openGuide(){
  renderGuideContext();
  if(!$('guideDialog').open)$('guideDialog').showModal();
  $('guideScroll').scrollTop=0;
  if(state?.status==='ACTIVE')scrollGuideTo('roles',{focus:false});
}
function releasePortal(){
  if(portal){portal.replaceWith(root);portal=null;document.body.style.overflow=bodyOverflow;}
}
function screen(name){
  view=name;
  if(name==='combat'&&root!==document.body&&!portal){
    portal=document.createComment('lich-lobby-position');bodyOverflow=document.body.style.overflow;
    root.before(portal);document.body.appendChild(root);document.body.style.overflow='hidden';
  }else if(name!=='combat')releasePortal();
  root.classList.toggle('in-combat',name==='combat');['landing','lobby','combat','gate'].forEach(id=>$(id).hidden=id!==name);
}
function schedule(){clearTimeout(timer);if(disposed||document.hidden||view==='gate')return;timer=setTimeout(()=>void sync(),Math.min(10000,(state?.status==='ACTIVE'?650:view==='lobby'?3000:15000)*2**Math.min(failures,3)));}
function setRoom(value){roomId=value||'';if(roomId)sessionStorage.setItem('lichLiveRoom',roomId);else sessionStorage.removeItem('lichLiveRoom');}
function reset(){
  setRoom('');state=null;eventSeq=0;ended=false;mounted=false;memberKey='';loadoutKey='';$('loadoutPanel').hidden=true;window.LichBattle?.teardown();$('journal').innerHTML='';
  for(const id of ['resultDialog','partyDialog'])if($(id).open)$(id).close();
}
function showGate(error){
  reset();clearTimeout(timer);screen('gate');$('gate').innerHTML='<p class="eyebrow">LICH KING / ACCESS</p><h1>입장 안내</h1><p>'+esc(error.message)+'</p>'+(root===document.body?'<a href="/">게임으로 돌아가기</a>':'');
}
function renderMembers(){
  if(!state)return;const key=JSON.stringify([state.members,state.me.isHost,state.status]);
  if(key===memberKey)return;memberKey=key;
  const html=state.members.map((m,i)=>'<li class="member-row" data-role="'+esc(m.role)+'" data-ready="'+Boolean(m.ready)+'"><span class="member-number">'+String(i+1).padStart(2,'0')+'</span><div class="member-identity"><b>'+esc(m.name)+(m.id===state.me.id?'<em>나</em>':'')+'</b><small>'+(m.id===state.hostId?'공대장':'공대원')+' <span>· '+esc(roles[m.role])+'</span></small></div><div class="member-controls">'+
    (state.me.isHost?'<div class="role-choices" role="group" aria-label="'+esc(m.name)+' 역할 배분">'+roleKeys.map(role=>'<button type="button" class="role-choice" data-role="'+role+'" data-assign-role="'+role+'" data-target="'+esc(m.id)+'" aria-label="'+esc(m.name)+' 역할 '+roles[role]+'" aria-pressed="'+(m.role===role)+'">'+icon(role)+roles[role]+'</button>').join('')+'</div>':'<span class="assigned-role" data-role="'+esc(m.role)+'">'+icon(m.role)+esc(roles[m.role])+'</span>')+'</div><span class="ready-status"><i></i>'+(state.status==='LOBBY'?(m.ready?'준비 완료':'대기 중'):'전투 중')+'</span>'+
    (state.me.isHost&&m.id!==state.me.id?'<button type="button" class="member-kick" data-kick="'+esc(m.id)+'" data-name="'+esc(m.name)+'" aria-label="'+esc(m.name)+' 강제퇴장" title="강제퇴장">'+icon('EXIT')+'</button>':'')+'</li>').join('');
  $('memberList').innerHTML=html;$('combatMembers').innerHTML=html;
}
function renderRooms(result){
  $('roomCount').textContent=result.rooms.length;
  $('roomList').innerHTML=result.rooms.map((room,i)=>'<article class="raid-room"><header><span class="room-number">'+String(i+1).padStart(2,'0')+'</span><div><strong>'+esc(room.hostName)+'의 공대</strong><small>공대원 모집 중</small></div><span class="room-availability">'+(room.joinable?'모집 중':'참가 불가')+'</span></header><div class="role-counts">'+room.roles.map(r=>'<span data-role="'+r.role+'" data-filled="'+(r.count>0)+'">'+icon(r.role)+'<b>'+roles[r.role]+'</b><small>'+r.count+'명</small></span>').join('')+'</div><footer><span class="room-seats">'+icon('PEOPLE')+'<b>'+room.members+'</b> / '+room.maxMembers+'명</span><button type="button" class="secondary-button" data-join="'+esc(room.id)+'" '+(!room.joinable||busy?'disabled':'')+'>'+(room.joinable?'공대 참가':'참가 불가')+icon('ARROW')+'</button></footer></article>').join('')||'<div class="live-empty">'+icon('PEOPLE')+'<h3>아직 모집 중인 공대가 없습니다.</h3><p>첫 공대를 만들고, 함께할 정벌자를 기다려보세요.</p></div>';
}
function renderLoadout(payload){
  if(!payload)return;
  const cards=payload.cards||[],mercenary=payload.battleV2?.teams?.A?.mercenaries?.[0],suit=payload.equippedBattleSuit;
  const key=JSON.stringify([cards,mercenary?.code,mercenary?.sourceArt,suit]);if(key===loadoutKey)return;loadoutKey=key;
  const art=value=>{const url=String(value||'');return url.startsWith('assets/')?'/'+url:/^(?:https?:\/\/|\/(?!\/))/.test(url)?url:'';};
  const unit=(card,label,support=false)=>{
    const image=art(card?.sourceArt||card?.originalCardArt||card?.image),title=card?.title||card?.name||'미편성';
    return '<figure class="loadout-unit'+(support?' is-support':'')+'"><div class="loadout-portrait">'+(image?'<img src="'+esc(image)+'" alt="'+esc(title)+'" loading="lazy">':'<span aria-hidden="true">—</span>')+'</div><figcaption><small>'+esc(label)+'</small><b title="'+esc(title)+'">'+esc(title)+'</b></figcaption></figure>';
  };
  $('loadoutList').innerHTML='<div class="loadout-cards">'+cards.map((card,i)=>unit(card,String(i+1).padStart(2,'0'))).join('')+'</div><div class="loadout-supports">'+unit(mercenary,'용병',true)+unit(suit,'배틀슈트',true)+'</div>';
  $('loadoutPanel').hidden=cards.length===0;
}
function renderAssembly(){
  const count=state.members.length,ready=state.members.filter(m=>m.ready).length;
  const coverage=roleKeys.map(role=>({role,count:state.members.filter(m=>m.role===role).length}));
  $('hostLabel').textContent='공대장 '+state.hostName;$('memberCount').textContent=count+' / 6';
  $('readyCount').textContent='준비 '+ready+' / '+count;$('openSeats').textContent=count<6?'함께할 공대원을 기다립니다 · 남은 자리 '+(6-count):'모든 자리가 찼습니다.';
  $('myRoleName').textContent=roles[state.me.role];$('myRoleIcon').innerHTML=icon(state.me.role);$('myRoleIcon').dataset.role=state.me.role;
  $('myRoleHint').textContent=roleHints[state.me.role];
  $('roleCoverage').innerHTML=coverage.map(({role,count})=>'<div data-role="'+role+'" data-filled="'+(count>0)+'">'+icon(role)+'<span>'+roles[role]+'</span><b>'+count+'<small>명</small></b></div>').join('');
  const conditions={members:count>=3,roles:coverage.every(r=>r.count>0),ready:ready===count};
  for(const [key,met]of Object.entries(conditions))$('assembly').querySelector('[data-condition="'+key+'"]').classList.toggle('is-met',met);
  $('memberCondition').textContent=count+' / 3';$('roleCondition').textContent=coverage.filter(r=>r.count>0).length+' / 3';$('readyCondition').textContent=ready+' / '+count;
  $('lobbyTime').textContent='모집 종료 '+new Date(state.lobbyEndsAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
  $('readyButton').textContent=state.me.ready?'준비 취소':'준비 완료';$('readyButton').classList.toggle('is-ready',state.me.ready);$('readyButton').disabled=busy||state.me.role==='UNASSIGNED';
  const canStart=Object.values(conditions).every(Boolean);
  $('startButton').hidden=!state.me.isHost;$('startButton').disabled=busy||!canStart;
  $('startHint').textContent=canStart?(state.me.isHost?'모든 작전 준비 완료':'공대장의 출정을 기다립니다'):!conditions.members?'최소 3명이 모여야 합니다':!conditions.roles?coverage.filter(r=>!r.count).map(r=>roles[r.role]).join(' · ')+' 배정이 필요합니다':(count-ready)+'명의 준비를 기다립니다';
  $('lobbyLeave').textContent=state.me.isHost?'공대 해산':'공대 나가기';
  root.querySelectorAll('[data-assign-role],[data-kick]').forEach(button=>{button.disabled=busy;});
}
function render(result){
  if(!result.state){
    state=null;setRoom('');$('browse').hidden=false;$('assembly').hidden=true;
    if($('guideDialog').open)renderGuideContext();
    $('ticketCount').textContent=Number(result.entry.quantity).toLocaleString();$('createButton').disabled=result.entry.quantity<1||busy;
    renderRooms(result);
    return;
  }
  const next=result.state;
  if(state?.id===next.id&&(next.serverNow<state.serverNow||next.serverNow===state.serverNow&&next.revision<state.revision))return;
  const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;setRoom(state.id);
  if($('guideDialog').open)renderGuideContext();
  renderMembers();
  if(state.status==='LOBBY'){
    prewarm();
    screen('lobby');$('browse').hidden=true;$('assembly').hidden=false;
    renderLoadout(result.payload);renderAssembly();
  }else{
    screen('combat');$('roleLabel').textContent=roles[state.me.role];if(mounted)window.LichBattle.enqueue(events,state);
    for(const e of events.filter(e=>e.type.startsWith('RAID_'))){const li=document.createElement('li');li.textContent=e.label;$('journal').prepend(li);if($('journal').children.length>40)$('journal').lastElementChild.remove();$('journalStatus').textContent=e.label;}
    if(['CLEAR','FAILED','CANCELLED'].includes(state.status)&&!ended){ended=true;showResult();}
  }
}
function showResult(){
  if($('partyDialog').open)$('partyDialog').close();
  const clear=state.status==='CLEAR';$('resultDialog').classList.toggle('is-clear',clear);$('resultCaption').textContent=clear?'CONQUEST COMPLETE':'EXPEDITION ENDED';
  $('resultTitle').textContent=clear?'리치왕 정벌 성공':state.status==='CANCELLED'?'공대 해산':'공대 전멸';
  const essence=state.petEssenceReward;
  $('resultReason').textContent=clear?(essence?.granted?'죽음의 왕좌가 무너졌습니다. 펫 정수 '+essence.quantity+'개가 인벤토리에 지급되었습니다.':state.release?.mode==='TEST'?'정벌 성공 · TEST에서는 실제 보상을 지급하지 않습니다.':'정벌 성공 · 이 공대에는 펫 정수 보상이 설정되지 않았습니다.'):state.failure?.reason||'공략에 실패했습니다.';
  $('resultStats').innerHTML='<span><b>'+state.round+'/7</b>도달 작전</span><span><b>'+state.statistics.mistakes+'</b>누적 실수</span><span><b>'+state.statistics.rescues+'</b>영혼 구출</span>';$('resultDialog').showModal();
}
async function mount(payload){
  if(disposed||mounted||mounting||!payload)return;mounting=true;
  try{screen('combat');await loadBattle();if(disposed)return;await window.LichBattle.mount(payload,$('battleMount'));if(disposed)return;mounted=true;window.LichBattle.restore(state);}
  catch(error){if(!disposed)toast('전장 준비 실패: '+error.message);}finally{mounting=false;}
}
async function sync(){
  if(disposed||polling||mounting||busy)return;polling=true;const revision=generation;
  try{
    const query=new URLSearchParams({since:String(eventSeq)});if(roomId)query.set('roomId',roomId);if(!mounted)query.set('payload','1');
    const result=await api('status?'+query,{signal:lifecycle.signal});if(disposed||revision!==generation)return;failures=0;render(result);
    if(result.state?.status==='ACTIVE'&&!mounted)await mount(result.payload);
  }catch(error){
    if(revision!==generation)return;failures++;
    if(error.status===401||['LICH_OFF','LICH_TEST_ONLY'].includes(error.code))showGate(error);
    else if(['LICH_KICKED','LICH_NOT_MEMBER','LICH_ROOM_MISSING'].includes(error.code)){reset();screen('lobby');toast(error.message);}
    else toast(error.message);
  }finally{polling=false;schedule();}
}
async function command(kind,body={}){
  if(disposed||busy)return;busy=true;generation++;clearTimeout(timer);$('lobbyNotice').hidden=true;$('lobby').setAttribute('aria-busy','true');
  if(state?.status==='LOBBY')renderAssembly();
  else root.querySelectorAll('[data-join]').forEach(button=>{button.disabled=true;});
  $('createButton').disabled=true;
  let applied=false;
  if(kind==='action')window.LichBattle?.setPending?.(true);
  const input={...(kind!=='open'?{roomId}:{}),...(['open','join','ready','start'].includes(kind)?{clientRulesVersion:2}:{}),...body},key=kind+':'+JSON.stringify(input);
  if(!pending.has(key))pending.set(key,crypto.randomUUID());sessionStorage.setItem('lichLiveRequests',JSON.stringify([...pending].slice(-20)));
  try{
    const result=await api(kind+(kind==='action'?'?since='+eventSeq:''),{method:'POST',body:{...input,requestId:pending.get(key)},timeoutMs:15000});
    pending.delete(key);
    if(disposed)return;
    if(kind==='leave'){reset();screen('lobby');}
    else {
      if(result.roomId)setRoom(result.roomId);
      if(result.state){render(result);applied=true;if(result.state.status==='ACTIVE'&&!mounted)await mount(result.payload);}
    }
  }catch(error){
    if(error.status>=400&&error.status<500&&error.status!==429&&!error.retryable)pending.delete(key);
    if(disposed)return;
    toast(error.message);$('lobbyNotice').textContent=error.message;$('lobbyNotice').hidden=false;
    if(['LICH_OFF','LICH_TEST_ONLY'].includes(error.code))showGate(error);
    if(['LICH_KICKED','LICH_NOT_MEMBER'].includes(error.code)){reset();screen('lobby');}
  }finally{
    sessionStorage.setItem('lichLiveRequests',JSON.stringify([...pending].slice(-20)));busy=false;
    if(!disposed){$('lobby').setAttribute('aria-busy','false');window.LichBattle?.setPending?.(false);}
    // A successful command already returned the authoritative snapshot.
    // Avoid making players wait for a second network round trip.
    if(!disposed){
      if(!applied||!state||kind==='leave'||kind==='open'||kind==='join')await sync();
      else {render({state});schedule();}
    }
  }
}
async function boot(){
  try{const feature=await api('feature',{signal:lifecycle.signal});if(disposed)return;$('modeLabel').textContent=feature.mode==='TEST'?'테스트 운영 · 지정 공대':feature.mode==='ON'?'공대 모집 중':'운영 중지';
    if(!feature.accessible)return showGate(new Error(feature.mode==='OFF'?'리치왕 정벌은 현재 운영 중지 상태입니다.':'CMS에서 지정된 테스트 참여자만 입장할 수 있습니다.'));
    screen('lobby');await sync();
  }catch(error){if(!disposed)showGate(error);}
}
$('enterButton').onclick=()=>{screen('lobby');prewarm();if(root===document.body)window.scrollTo(0,0);else root.scrollIntoView({block:'start'});void sync();};
$('backLanding').onclick=()=>screen('landing');
$('createButton').onclick=()=>{if(confirm('리치왕 정벌 입장권 1장을 사용해 공대를 창설합니다. 해산해도 입장권은 반환되지 않습니다.'))void command('open');};
$('refreshRooms').onclick=()=>void sync();$('readyButton').onclick=()=>void command('ready',{ready:!state.me.ready});$('startButton').onclick=()=>void command('start');
$('lobbyLeave').onclick=()=>{if(confirm(state.me.isHost?'공대를 해산할까요? 입장권은 반환되지 않습니다.':'공대에서 나갈까요?'))void command('leave');};
$('leaveButton').onclick=()=>{if(confirm(state.me.isHost?'전투를 종료하고 공대를 해산할까요?':'공대에서 나가면 이 전투에 다시 참가할 수 없습니다. 나갈까요?'))void command('leave');};
$('retryButton').onclick=()=>{reset();screen('lobby');void sync();};
$('partyButton').onclick=()=>$('partyDialog').showModal();$('closeParty').onclick=()=>$('partyDialog').close();
$('guideButton').onclick=$('resultGuide').onclick=$('combatGuide').onclick=openGuide;$('closeGuide').onclick=()=>$('guideDialog').close();
on($('guideDialog'),'click',event=>{const button=event.target.closest('[data-guide-to]');if(button)scrollGuideTo(button.dataset.guideTo);});
on(root,'click',event=>{
  const assignment=event.target.closest('[data-assign-role]');if(assignment){
    const member=state?.members.find(m=>m.id===assignment.dataset.target);if(member&&member.role!==assignment.dataset.assignRole)void command('assign',{targetId:member.id,role:assignment.dataset.assignRole});return;
  }
  const join=event.target.closest('[data-join]');if(join){void command('join',{roomId:join.dataset.join});return;}
  const kick=event.target.closest('[data-kick]');if(kick&&confirm(kick.dataset.name+'님을 강제퇴장시킬까요? 이 공대에는 다시 들어올 수 없습니다.'))void command('kick',{targetId:kick.dataset.kick});
});
on(window,'lich-raid-action',e=>{
  if(state?.status==='ACTIVE'&&e.detail.challengeId===state.challenge?.id)void command('action',e.detail);
});
function destroy(){
  if(disposed)return;
  disposed=true;generation++;lifecycle.abort();clearTimeout(timer);clearTimeout(toastTimer);
  if(mounted||mounting)window.LichBattle?.teardown();
  mounted=false;root.classList.remove('in-combat');
  releasePortal();
  root.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  if(window.LichRaidLive===controller)delete window.LichRaidLive;
}
on(document,'visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)void sync();});
on(window,'pagehide',destroy);
const controller={sync,destroy,diagnostics:()=>({state,mounted,eventSeq,view,disposed,battle:window.LichBattle?.diagnostics()})};
window.LichRaidLive=controller;
void boot();
return controller;
}
if(document.body.hasAttribute('data-lich-standalone'))mountLichRaid();
