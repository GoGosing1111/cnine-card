const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('ko-KR');
const date=v=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'추후 안내';
const PHASE={DRAFT:'시즌 준비',RECRUITING:'참가 모집',PAIRING:'팀 편성 중',PUBLISHING:'팀 공개 준비',READY:'대전 준비',ACTIVE:'시즌 진행',CLOSED:'시즌 종료'};
function style(){if(document.querySelector('[data-duo-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/ranked-duo-v1.css?v=20260925-1';link.dataset.duoStyle='1';document.head.append(link);}
export async function mountRankedDuo({root,api,navigate,ensureBattle,userId}){
 style();let state=null,busy=false,tab='home',opponent=null,renderer=null;
 const key='ranked-duo-pending:'+userId;
 const pending=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
 const save=value=>{try{value?sessionStorage.setItem(key,JSON.stringify(value)):sessionStorage.removeItem(key);}catch{}};
 const call=(path,options={})=>api('ranked-duo/'+path,options);
 const message=text=>{const node=root.querySelector('[data-duo-message]');if(node)node.textContent=text;};
 const setBusy=value=>{busy=value;root.setAttribute('aria-busy',String(value));root.querySelectorAll('button').forEach(b=>{if(value){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.wasDisabled){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});};
 const members=(team,side)=>[0,1].map(i=>{const member=team?.members?.[i];return '<div class="duo-member '+side+'"><span class="duo-owner-index">0'+(i+1)+'</span><div><small>'+ (side==='ally'?'OUR TEAM':'OPPONENT')+'</small><strong>'+esc(member?.nickname||(side==='ally'?'함께할 팀원':'매칭 대기'))+'</strong><p>'+ (member?'카드 5장 + 선택 용병 1장':'시즌 참가자를 기준으로 자동 편성')+'</p></div></div>';}).join('');
 function draw(){
  if(!root.isConnected)return;
  const s=state?.season,e=state?.energy,t=state?.team,phase=PHASE[s?.status]||'시즌 준비';
  const recruiting=s?.status==='RECRUITING'&&Date.parse(s.recruitUntil)>Date.parse(state.serverNow),active=s?.status==='ACTIVE'&&Date.parse(s.startsAt)<=Date.parse(state.serverNow)&&Date.parse(s.endsAt)>Date.parse(state.serverNow);
  root.innerHTML='<section class="duo-hub"><header class="duo-masthead"><a href="#duo-home" data-duo="home" class="duo-wordmark">DUO<span>RANKED SERIES</span></a><div class="duo-phase"><i></i>'+esc(phase)+'</div><button data-duo="refresh" class="duo-text-button">새로고침 ↻</button></header>'+
   '<div class="duo-hero"><div class="duo-hero-copy"><p class="duo-kicker">TWO PLAYERS. ONE TEAM.</p><h1>'+esc(s?.name||'랭크 듀오')+'</h1><p>다른 강점, 하나의 팀.<br>네 개의 덱이 한 전장에서 맞붙습니다.</p><div class="duo-season-date"><span>'+ (recruiting?'참가 마감':'대전 기간')+'</span><b>'+esc(recruiting?date(s.recruitUntil):date(s?.startsAt)+' — '+date(s?.endsAt))+'</b></div></div><div class="duo-hero-number" aria-hidden="true"><span>2</span><i>VS</i><span>2</span><small>FOUR DECKS · ONE BATTLEFIELD</small></div></div>'+
   '<nav class="duo-nav" aria-label="듀오 메뉴">'+[['home','시즌 로비'],['ranking','팀 랭킹'],['history','전투 기록']].map(([id,label])=>'<button data-duo="'+id+'" aria-current="'+(tab===id?'page':'false')+'" '+(!s&&id!=='home'?'disabled':'')+'>'+label+'</button>').join('')+'<span>'+fmt(state?.participants)+'명 참가</span></nav>'+
   '<p class="duo-message" data-duo-message role="status"></p><div data-duo-content></div></section>';
  if(tab!=='home')return;
  const waiting=state?.waiting,text=!s?'시즌 일정이 정해지면 참가 모집을 시작합니다.':waiting?'참가 신청 완료. 모집 종료 후 팀이 자동으로 편성됩니다.':t?'팀원의 접속 여부와 관계없이 함께 출전합니다.':'72시간 동안 참가자를 모집한 뒤, 강한 전력과 성장 중인 전력을 조합합니다.';
  const action=pending()?'<button class="duo-primary" data-duo="recover">진행 중인 경기 확인 →</button>':recruiting&&!state.joined?'<button class="duo-primary" data-duo="join">시즌 참가 신청 →</button>':active&&t?'<button class="duo-primary" data-duo="match" '+(Number(e?.current)<Number(e?.cost)?'disabled':'')+'>듀오 상대 찾기 →</button>':'<div class="duo-wait">'+esc(waiting?'팀 편성을 기다리고 있어요':t?'팀 편성 완료 · 대전 대기':s?.status==='CLOSED'?'이번 시즌이 종료되었습니다':'다음 시즌을 준비하고 있어요')+'</div>';
  root.querySelector('[data-duo-content]').innerHTML='<div class="duo-command"><section class="duo-lineup"><header><p class="duo-kicker">TEAM COMPOSITION</p><h2>'+ (t?'우리의 두 덱':'당신의 다음 팀')+'</h2><p>'+esc(text)+'</p></header><div class="duo-team-pair">'+members(t,'ally')+'</div><div class="duo-team-footer"><span>팀 점수 <strong>'+ (t?fmt(t.score):'—')+'</strong></span><span>'+ (t?fmt(t.wins)+'승 · '+fmt(t.losses)+'패':'개별 신청 · 자동 팀 편성')+'</span></div></section>'+
   '<aside class="duo-control"><p class="duo-kicker">PERSONAL ENERGY</p><div class="duo-energy"><strong>'+ (e?fmt(e.current):'—')+'</strong><span>/ '+(e?fmt(e.maximum):'—')+'</span></div><p>내가 시작한 경기만 내 행동력을 사용합니다.<br>팀원의 행동력은 차감되지 않습니다.</p><div class="duo-energy-meta"><span>공격 1회</span><b>'+ (e?.cost?fmt(e.cost)+' 행동력':'추후 안내')+'</b></div>'+action+(recruiting&&waiting?'<button class="duo-text-button" data-duo="cancel">참가 신청 취소</button>':'')+'<button class="duo-secondary" data-duo="deck">공격·방어 덱 확인</button></aside></div>'+
   '<div class="duo-rules"><div><b>01</b><h3>성장을 반영하는 전력</h3><p>보유 카드·용병과 장비의 PVP 전력을 함께 평가합니다. FUR +13을 비교 기준으로 사용합니다.</p></div><div><b>02</b><h3>전투마다 최신 편성</h3><p>선택한 랭크전 공격 프리셋과 방어 프리셋 1을 사용합니다. 카드 강화와 장비 변경도 반영됩니다.</p></div><div><b>03</b><h3>네 덱의 하나 된 전투</h3><p>각자 일반 카드 5장과 용병 최대 1장. 우리 팀 전체가 싸우며 결과는 팀 점수에 반영됩니다.</p></div></div>'+
   '<footer class="duo-footnote">추가모집은 경기 시작 전 별도 안내합니다. 홀수 인원 중 미편성자는 대기하며, 시즌 보상은 별도 공지합니다.</footer>';
 }
 async function load(){state=await call('status');draw();if(tab!=='home')await loadTab();}
 async function loadTab(){
  const data=await call(tab);if(!root.isConnected)return;const content=root.querySelector('[data-duo-content]');
  if(tab==='ranking')content.innerHTML='<section class="duo-table"><header><h2>시즌 팀 랭킹</h2><span>상위 100팀 · 팀 점수순</span></header>'+ (data.ranking?.map(t=>'<div class="duo-rank-row"><b>'+t.rank+'</b><div><strong>'+t.members.map(m=>esc(m.nickname)).join(' <em>+</em> ')+'</strong><small>'+fmt(t.wins)+'승 '+fmt(t.losses)+'패</small></div><strong>'+fmt(t.score)+'</strong></div>').join('')||'<p class="duo-empty">팀 편성이 끝나면 랭킹이 공개됩니다.</p>')+'</section>';
  else content.innerHTML='<section class="duo-table"><header><h2>우리 팀 전투 기록</h2><span>최근 30경기</span></header>'+ (data.history?.map(h=>'<div class="duo-history-row"><b class="'+(h.winner===h.side?'win':'')+'">'+(h.status==='COMPLETED'?(h.winner===h.side?'승리':'패배'):h.status==='CANCELLED'?'취소':'처리 중')+'</b><div><strong>'+ (h.side==='A'?'우리 팀의 도전':'상대 팀의 도전')+'</strong><small>'+esc(date(h.created_at))+'</small></div><button class="duo-secondary" data-duo="replay" data-match="'+esc(h.id)+'">전투 보기</button></div>').join('')||'<p class="duo-empty">아직 전투 기록이 없습니다.</p>')+'</section>';
 }
 async function acceptFight(body){
  save(body);const data=await call('fight',{method:'POST',body});
  if(data.status==='PENDING'){save({...body,matchId:data.matchId});draw();message('전투 결과를 저장 중입니다. 잠시 후 진행 중인 경기 확인을 눌러 주세요.');return;}
  if(data.status==='COMPLETED'){save(null);await playback(data);}
 }
 async function recoverFight(){
  const body=pending();if(!body)return;
  if(!body.matchId)return acceptFight(body);
  const data=await call('replay',{method:'POST',body:{matchId:body.matchId}});
  if(data.status==='COMPLETED'){save(null);await playback(data);}
  else if(data.status==='CANCELLED'){save(null);await load();message('취소된 경기의 행동력을 돌려드렸습니다. 다시 매칭하세요.');}
  else{draw();message('결과 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요.');}
 }
 async function playback(data){
  await ensureBattle();if(!root.isConnected)return;
  const modal=document.getElementById('modal');if(!modal)throw new Error('전투 화면을 열 수 없습니다.');
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const close=()=>{renderer?.destroy();renderer=null;modal.__battleV2Renderer=null;modal.className='modal';modal.innerHTML='';document.body.style.overflow=previousOverflow;void load();};
  const live=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVP',playerName:data.attackerNames.join(' + '),opponentName:data.defenderNames.join(' + ')});
  live.stage.querySelector('.battle-v3-header strong').textContent='랭크 듀오 · 2 대 2';
  const exit=document.createElement('button');exit.className='duo-battle-exit';exit.textContent='기록 닫기';exit.onclick=close;live.stage.append(exit);
  try{
   renderer=await window.ProjectVBattleV3Live.createRenderer({...live,modal,data,mode:'PVP'});modal.__battleV2Renderer=renderer;
   await renderer.play();if(!renderer)return;renderer.showResult();
   const ownSide=data.battleV2.teams.B.members.some(m=>state?.team?.members.some(own=>own.userId===m.ownerId))?'B':'A',win=data.battleV2.result.winner===ownSide;
   live.msg.innerHTML='<div class="duo-result"><small>DUO RANKED · RESULT</small><strong>'+ (win?'우리 팀 승리':'우리 팀 패배')+'</strong><p>경기 종료 시 팀 점수 '+fmt(ownSide==='A'?data.scoreAfter:data.opponentScoreAfter)+'</p><button class="duo-primary" data-duo-close>시즌 로비로 돌아가기 →</button></div>';
   live.msg.querySelector('button').onclick=close;
  }catch(error){
   renderer?.destroy();renderer=null;live.stage.classList.add('is-result-visible');modal.classList.remove('battle-v3-preparing');live.stage.querySelector('.battle-v3-loader')?.remove();
   live.msg.innerHTML='<div class="duo-result"><strong>전투 기록이 저장되었습니다</strong><p>'+esc(error.message)+'</p><button class="duo-primary">돌아가기</button></div>';live.msg.querySelector('button').onclick=close;
  }
 }
 root.onclick=async event=>{
  const button=event.target.closest('[data-duo]');if(!button||busy)return;event.preventDefault();const action=button.dataset.duo;setBusy(true);
  try{
   if(['home','ranking','history'].includes(action)){tab=action;draw();if(tab!=='home')await loadTab();}
   else if(action==='refresh')await load();
   else if(action==='join'||action==='cancel'){await call('join',{method:action==='join'?'POST':'DELETE',body:{}});await load();}
   else if(action==='deck')navigate('pvp');
   else if(action==='recover')await recoverFight();
   else if(action==='match'){
    const d=await call('match',{method:'POST',body:{}});if(d.pendingMatchId){save({matchId:d.pendingMatchId});await recoverFight();}
    else{opponent=d;root.querySelector('[data-duo-content]').innerHTML='<section class="duo-match-preview"><p class="duo-kicker">OPPONENT FOUND</p><h2>이번 상대가 정해졌습니다</h2><div class="duo-team-pair">'+members(d.opponent,'enemy')+'</div><p>공격 시작 시 최신 덱을 확정하고 내 행동력 '+fmt(state.energy.cost)+'을 사용합니다.</p><button class="duo-primary" data-duo="fight">네 덱으로 전투 시작 →</button><button class="duo-secondary" data-duo="home">로비로</button></section>';}
   }else if(action==='fight'&&opponent)await acceptFight({requestId:crypto.randomUUID(),matchToken:opponent.token});
   else if(action==='replay'){const d=await call('replay?id='+encodeURIComponent(button.dataset.match));if(d.status==='COMPLETED')await playback(d);else message('아직 전투 처리가 완료되지 않았습니다.');}
  }catch(error){if(['DUO_CANCELLED','DUO_TICKET'].includes(error.code))save(null);message(error.message);}
  finally{setBusy(false);}
 };
 try{await load();}catch(error){root.innerHTML='<section class="duo-hub"><h1>랭크 듀오</h1><p data-duo-message role="alert">'+esc(error.message)+'</p><button class="duo-primary" data-duo="refresh">다시 불러오기</button></section>';}
}
