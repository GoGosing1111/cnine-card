import {jointAccountRequest as request} from '/js/joint-account-transport.mjs';
export function mountLichRaid(root=document.body,{loadBattle=async()=>{}}={}){
const $=id=>root.querySelector('[data-lich-id="'+id+'"]')||root.querySelector('#'+id),roles={ASSAULT:'정벌대',WARDEN:'봉인대',RESCUE:'구출대',UNASSIGNED:'배정 대기'};
const lifecycle=new AbortController();
const on=(target,type,listener)=>target.addEventListener(type,listener,{signal:lifecycle.signal});
let disposed=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(route,options)=>request('raid/lich/'+route,options);
let state=null,eventSeq=0,roomId=sessionStorage.getItem('lichLiveRoom')||'',mounted=false,mounting=false,polling=false,busy=false,ended=false,view='landing',timer,toastTimer,memberKey='',failures=0,generation=0;
let savedRequests=[];try{savedRequests=JSON.parse(sessionStorage.getItem('lichLiveRequests')||'[]');if(!Array.isArray(savedRequests))savedRequests=[];}catch{}
const pending=new Map(savedRequests);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function screen(name){view=name;root.classList.toggle('in-combat',name==='combat');['landing','lobby','combat','gate'].forEach(id=>$(id).hidden=id!==name);}
function schedule(){clearTimeout(timer);if(disposed||document.hidden||view==='gate')return;timer=setTimeout(()=>void sync(),Math.min(10000,(state?.status==='ACTIVE'?650:view==='lobby'?3000:15000)*2**Math.min(failures,3)));}
function setRoom(value){roomId=value||'';if(roomId)sessionStorage.setItem('lichLiveRoom',roomId);else sessionStorage.removeItem('lichLiveRoom');}
function reset(){
  setRoom('');state=null;eventSeq=0;ended=false;mounted=false;memberKey='';window.LichBattle?.teardown();$('journal').innerHTML='';
  for(const id of ['resultDialog','partyDialog'])if($(id).open)$(id).close();
}
function showGate(error){
  reset();clearTimeout(timer);screen('gate');$('gate').innerHTML='<p class="eyebrow">LICH KING / ACCESS</p><h1>입장 안내</h1><p>'+esc(error.message)+'</p>'+(root===document.body?'<a href="/">게임으로 돌아가기</a>':'');
}
function renderMembers(){
  if(!state)return;const key=JSON.stringify([state.members,state.me.isHost,state.status]);
  if(key===memberKey)return;memberKey=key;
  const html=state.members.map((m,i)=>'<li class="member-row" data-ready="'+Boolean(m.ready)+'"><span class="member-number">'+String(i+1).padStart(2,'0')+'</span><div class="member-identity"><b>'+esc(m.name)+(m.id===state.me.id?' · 나':'')+'</b><small>'+(m.id===state.hostId?'공대장 · ':'')+esc(roles[m.role])+'</small></div><div class="member-controls">'+
    (state.me.isHost?'<span class="ready-status">'+(state.status==='LOBBY'?(m.ready?'준비':'대기'):'')+'</span><select data-assign="'+esc(m.id)+'" aria-label="'+esc(m.name)+' 역할 배분"><option value="UNASSIGNED" disabled '+(m.role==='UNASSIGNED'?'selected':'')+'>배정 대기</option>'+Object.keys(roles).filter(k=>k!=='UNASSIGNED').map(role=>'<option value="'+role+'" '+(m.role===role?'selected':'')+'>'+roles[role]+'</option>').join('')+'</select>':'<span class="ready-status">'+(state.status==='LOBBY'?(m.ready?'준비 완료':'준비 중'):roles[m.role])+'</span>')+
    (state.me.isHost&&m.id!==state.me.id?'<button class="quiet-button" data-kick="'+esc(m.id)+'" data-name="'+esc(m.name)+'">강제퇴장</button>':'')+'</div></li>').join('');
  $('memberList').innerHTML=html;$('combatMembers').innerHTML=html;
}
function render(result){
  if(!result.state){
    state=null;setRoom('');$('browse').hidden=false;$('assembly').hidden=true;
    $('ticketCount').textContent=Number(result.entry.quantity).toLocaleString();$('createButton').disabled=result.entry.quantity<1||busy;
    $('roomList').innerHTML=result.rooms.map(room=>'<article class="raid-room"><header><strong>'+esc(room.hostName)+'의 공대</strong><b>'+room.members+' / '+room.maxMembers+'</b></header><p>정벌·봉인·구출 역할을 나눠 죽음의 왕좌에 도전합니다.</p><footer><div class="role-counts">'+room.roles.map(r=>'<span>'+roles[r.role]+' '+r.count+'</span>').join('')+'</div><button class="secondary-button" data-join="'+esc(room.id)+'" '+(!room.joinable?'disabled':'')+'>'+(room.joinable?'공대 참가':'참가 불가')+'</button></footer></article>').join('')||'<div class="live-empty">모집 중인 공대가 없습니다.<br>입장권으로 첫 공대를 창설해 보세요.</div>';
    return;
  }
  const next=result.state;
  if(state?.id===next.id&&(next.serverNow<state.serverNow||next.serverNow===state.serverNow&&next.revision<state.revision))return;
  const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;setRoom(state.id);
  renderMembers();
  if(state.status==='LOBBY'){
    screen('lobby');$('browse').hidden=true;$('assembly').hidden=false;
    $('hostLabel').textContent='공대장 · '+state.hostName;$('memberCount').textContent=state.members.length+' / 6명';
    $('lobbyTime').textContent='모집 종료 '+new Date(state.lobbyEndsAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    $('readyButton').textContent=state.me.ready?'준비 취소':'준비 완료';$('readyButton').disabled=busy||state.me.role==='UNASSIGNED';
    $('startButton').hidden=!state.me.isHost;$('startButton').disabled=busy||state.members.length<3||!state.members.every(m=>m.ready)||!['ASSAULT','WARDEN','RESCUE'].every(role=>state.members.some(m=>m.role===role));
    $('lobbyLeave').textContent=state.me.isHost?'공대 해산':'공대 나가기';
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
  $('resultReason').textContent=clear?'죽음의 왕좌가 무너졌습니다. 현재 클리어 보상은 지급되지 않습니다.':state.failure?.reason||'공략에 실패했습니다.';
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
  if(disposed||busy)return;busy=true;generation++;clearTimeout(timer);$('lobbyNotice').hidden=true;
  const input={...(kind!=='open'?{roomId}:{}),...body},key=kind+':'+JSON.stringify(input);
  if(!pending.has(key))pending.set(key,crypto.randomUUID());sessionStorage.setItem('lichLiveRequests',JSON.stringify([...pending].slice(-20)));
  try{
    const result=await api(kind,{method:'POST',body:{...input,requestId:pending.get(key)},timeoutMs:15000});
    pending.delete(key);
    if(disposed)return;
    if(kind==='leave'){reset();screen('lobby');}
    else if(result.roomId)setRoom(result.roomId);
  }catch(error){
    if(error.status>=400&&error.status<500&&error.status!==429&&!error.retryable)pending.delete(key);
    if(disposed)return;
    toast(error.message);$('lobbyNotice').textContent=error.message;$('lobbyNotice').hidden=false;
    if(['LICH_OFF','LICH_TEST_ONLY'].includes(error.code))showGate(error);
    if(['LICH_KICKED','LICH_NOT_MEMBER'].includes(error.code)){reset();screen('lobby');}
  }finally{
    sessionStorage.setItem('lichLiveRequests',JSON.stringify([...pending].slice(-20)));busy=false;await sync();
  }
}
async function boot(){
  try{const feature=await api('feature',{signal:lifecycle.signal});if(disposed)return;$('modeLabel').textContent=feature.mode==='TEST'?'TEST · 지정 공대 검수':feature.mode+' · 리치왕 정벌';
    if(!feature.accessible)return showGate(new Error(feature.mode==='OFF'?'리치왕 정벌은 현재 운영 중지 상태입니다.':'CMS에서 지정된 테스트 참여자만 입장할 수 있습니다.'));
    screen(roomId?'lobby':'landing');await sync();
  }catch(error){if(!disposed)showGate(error);}
}
$('enterButton').onclick=()=>{screen('lobby');if(root===document.body)window.scrollTo(0,0);else root.scrollIntoView({block:'start'});void sync();};
$('backLanding').onclick=()=>screen('landing');
$('createButton').onclick=()=>{if(confirm('리치왕 정벌 입장권 1장을 사용해 공대를 창설합니다. 해산해도 입장권은 반환되지 않습니다.'))void command('open');};
$('refreshRooms').onclick=()=>void sync();$('readyButton').onclick=()=>void command('ready',{ready:!state.me.ready});$('startButton').onclick=()=>void command('start');
$('lobbyLeave').onclick=()=>{if(confirm(state.me.isHost?'공대를 해산할까요? 입장권은 반환되지 않습니다.':'공대에서 나갈까요?'))void command('leave');};
$('leaveButton').onclick=()=>{if(confirm(state.me.isHost?'전투를 종료하고 공대를 해산할까요?':'공대에서 나가면 이 전투에 다시 참가할 수 없습니다. 나갈까요?'))void command('leave');};
$('retryButton').onclick=()=>{reset();screen('lobby');void sync();};
$('partyButton').onclick=()=>$('partyDialog').showModal();$('closeParty').onclick=()=>$('partyDialog').close();
$('guideButton').onclick=$('resultGuide').onclick=$('combatGuide').onclick=()=>$('guideDialog').showModal();$('closeGuide').onclick=()=>$('guideDialog').close();
on(root,'click',event=>{
  const join=event.target.closest('[data-join]');if(join){void command('join',{roomId:join.dataset.join});return;}
  const kick=event.target.closest('[data-kick]');if(kick&&confirm(kick.dataset.name+'님을 강제퇴장시킬까요? 이 공대에는 다시 들어올 수 없습니다.'))void command('kick',{targetId:kick.dataset.kick});
});
on(root,'change',event=>{if(event.target.matches('[data-assign]'))void command('assign',{targetId:event.target.dataset.assign,role:event.target.value});});
on(window,'lich-raid-action',e=>{
  if(state?.status==='ACTIVE'&&e.detail.challengeId===state.challenge?.id)void command('action',e.detail);
});
function destroy(){
  if(disposed)return;
  disposed=true;generation++;lifecycle.abort();clearTimeout(timer);clearTimeout(toastTimer);
  if(mounted||mounting)window.LichBattle?.teardown();
  mounted=false;root.classList.remove('in-combat');
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
