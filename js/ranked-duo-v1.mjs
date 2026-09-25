import {duoTiers} from '../shared/ranked-duo-season-v2.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('ko-KR');
const date=v=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'추후 안내';
const PHASE={DRAFT:'시즌 준비',RECRUITING:'참가 모집',PAIRING:'팀 편성 중',PUBLISHING:'팀 공개 준비',READY:'대전 준비',ACTIVE:'시즌 진행',SETTLING:'시즌 정산 중',CLOSED:'시즌 종료'};
const ICONS={
 duo:'<path d="m6 4 6 3 6-3v10l-6 6-6-6V4Z"/><path d="M10 9v6m4-6v6M3 8v7l5 5m13-12v7l-5 5"/>',
 sword:'<path d="m4 3 4 1 11 12-3 3L4 7 4 3Zm16 0-4 1-4 4m-3 4-4 4m-2-2 6 6m6-6 6 6m-5-1 4 3M8 19l-4 3"/>',
 trophy:'<path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm5 12v5m-4 1h8M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4"/>',
 history:'<path d="M4 6V2m0 4h4M4 6a9 9 0 1 1-1 9m9-9v6l4 2"/>',
 energy:'<path d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z"/>',
 refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 deck:'<rect x="7" y="5" width="12" height="16" rx="1"/><path d="M4 18H3V2h12v1m-4 9 2-3 2 3-2 3-2-3Z"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 link:'<path d="m10 7 2-2a5 5 0 0 1 7 7l-2 2m-3 3-2 2a5 5 0 0 1-7-7l2-2m1 6 8-8"/>'
};
const icon=name=>'<svg class="duo-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+ICONS[name]+'</svg>';
const insignia='<svg viewBox="0 0 120 130" aria-hidden="true" fill="none"><path class="duo-shield-fill" d="m60 4 43 18v54L60 121 17 76V22L60 4Z"/><path d="m60 12 35 15v46l-35 37-35-37V27l35-15Z"/><path class="duo-shield-wing" d="M10 35v43l33 35M4 51v30l22 24m84-70v43l-33 35m39-62v30l-22 24M38 26l22-9 22 9M46 93l14 15 14-15"/><path class="duo-shield-detail" d="M28 39h15m34 0h15M28 72h13m38 0h13"/></svg>';
function style(){
 if(document.querySelector('[data-duo-style]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/css/ranked-duo-v1.css?v=20260925-5';link.dataset.duoStyle='1';document.head.append(link);
}
const tierArt=(tier,size=64)=>tier?.art?'<img class="duo-tier-art" src="'+esc(tier.art)+'" alt="'+esc(tier.name)+' 듀오 문장" width="'+size+'" height="'+size+'" decoding="async">':'';
export async function mountRankedDuo({root,api,navigate,ensureBattle,userId,onWallet=()=>{}}){
 style();let state=null,busy=false,tab='home',opponent=null,renderer=null;
 const key='ranked-duo-pending:'+userId;
 const pending=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
 const save=value=>{try{value?sessionStorage.setItem(key,JSON.stringify(value)):sessionStorage.removeItem(key);}catch{}};
 const call=(path,options={})=>api('ranked-duo/'+path,options);
 const message=text=>{const node=root.querySelector('[data-duo-message]');if(node)node.textContent=text;};
 const setBusy=value=>{busy=value;root.setAttribute('aria-busy',String(value));root.querySelectorAll('button').forEach(b=>{if(value){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.wasDisabled){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});};
 const members=(team,side)=>[0,1].map(i=>{
  const member=team?.members?.[i],self=member&&String(member.userId)===String(userId),initial=Array.from(member?.nickname||'')[0]||'+';
  return '<article class="duo-banner '+side+(member?'':' is-vacant')+(self?' is-self':'')+'">'+
   '<div class="duo-banner-top"><span>PLAYER <b>0'+(i+1)+'</b></span><small>'+ (self?'나':member?(side==='ally'?'팀원':'상대'):'배정 대기')+'</small></div>'+
   '<div class="duo-insignia">'+insignia+'<span>'+esc(initial)+'</span></div>'+
   '<div class="duo-banner-identity"><h3>'+esc(member?.nickname||'팀원 배정 대기')+'</h3><p>'+ (member?'함께 출전하는 하나의 덱':'모집 후 자동으로 팀 편성')+'</p></div>'+
   '<div class="duo-deck-glyph" aria-hidden="true">'+[0,1,2,3,4].map(()=>'<i></i>').join('')+'<span>+</span><i class="mercenary"></i></div>'+
   '<small class="duo-banner-foot">일반 5장 · 용병 최대 1장</small></article>';
 }).join('');
 function schedule(s,recruiting){
  if(!s?.startsAt&&!s?.recruitUntil)return '<span>시즌 일정 공개 예정</span><b>곧 새로운 동료를 만납니다</b>';
  if(recruiting)return '<span>참가 신청 마감</span><b>'+esc(date(s.recruitUntil))+'</b>';
  return '<span>대전 기간</span><b>'+esc(date(s.startsAt))+'<i> — </i>'+esc(date(s.endsAt))+'</b>';
 }
 function draw(){
  if(!root.isConnected)return;
  const s=state?.season,e=state?.energy,policy=e||s?.energy,t=state?.team,phase=PHASE[s?.status]||'시즌 준비';
  const recruiting=s?.status==='RECRUITING'&&Date.parse(s.recruitUntil)>Date.parse(state.serverNow),active=s?.status==='ACTIVE'&&Date.parse(s.startsAt)<=Date.parse(state.serverNow)&&Date.parse(s.endsAt)>Date.parse(state.serverNow);
  const step=!s||['DRAFT','RECRUITING'].includes(s.status)?0:['PAIRING','PUBLISHING','READY'].includes(s.status)?1:2;
  root.innerHTML='<section class="duo-hub">'+
   '<header class="duo-masthead"><div class="duo-brand-mark">'+icon('duo')+'</div><div class="duo-heading"><p class="duo-kicker">DUO RANKED</p><h1>랭크 듀오</h1><p>'+esc(s?.name||'두 명의 플레이어, 하나의 팀')+'</p></div>'+
    '<div class="duo-season-status"><span class="duo-phase"><i></i>'+esc(phase)+'</span><span class="duo-participants">참가자 <b>'+fmt(state?.participants)+'</b>명</span></div>'+
    '<button data-duo="refresh" class="duo-icon-button" aria-label="듀오 시즌 새로고침">'+icon('refresh')+'</button></header>'+
   '<nav class="duo-nav" aria-label="듀오 메뉴">'+[['home','시즌 로비','duo'],['ranking','팀 랭킹','trophy'],['history','전투 기록','history'],['tiers','티어·트로피','trophy']].map(([id,label,glyph])=>'<button data-duo="'+id+'" aria-current="'+(tab===id?'page':'false')+'" '+(!s&&!['home','tiers'].includes(id)?'disabled':'')+'>'+icon(glyph)+label+'</button>').join('')+'<span class="duo-nav-format">2 <i>VS</i> 2</span></nav>'+
   '<p class="duo-message" data-duo-message role="status"></p><div data-duo-content></div></section>';
  if(tab!=='home'){
   root.querySelector('[data-duo-content]').innerHTML='<div class="duo-empty" role="status">'+icon(tab==='ranking'?'trophy':'history')+'<h2>기록을 불러오는 중</h2><p>잠시만 기다려 주세요.</p></div>';
   return;
  }
  const waiting=state?.waiting;
  const teamTitle=t?'함께, 더 높은 곳으로':waiting?'당신의 동료를 기다리는 중':'두 사람이 만드는 새로운 승부';
  const teamText=!s?'시즌 일정이 공개되면 참가 신청이 열립니다.':waiting?'참가 신청 완료! 모집 후 함께할 팀원이 정해집니다.':t?'팀원이 접속하지 않아도 두 덱이 함께 출전합니다.':'개별 참가 신청 후, 서로 다른 전력의 두 사람을 한 팀으로 편성합니다.';
  const waitTitle=s?.status==='SETTLING'?'최종 순위를 확정하고 있습니다':s?.status==='CLOSED'?'시즌이 종료되었습니다':waiting?'참가 신청 완료':t?'팀 편성 완료':'시즌 준비 중';
  const waitHint=state?.seed?.ineligible?'참가 계정과 공격·방어 덱을 확인해 주세요.':s?.status==='SETTLING'?'접수된 경기를 확정하고 최종 순위를 정산 중입니다.':s?.status==='CLOSED'?'팀 랭킹과 전투 기록을 확인하세요.':waiting?'팀 편성 결과를 기다려 주세요.':t?'대전 시작 후 출전할 수 있습니다.':recruiting?'참가 현황을 확인해 주세요.':'24시간 모집 후 7일 동안 전투합니다.';
  const action=pending()?'<button class="duo-primary" data-duo="recover">'+icon('history')+'진행 중인 경기 확인'+icon('arrow')+'</button>':
   recruiting&&!state.joined?'<button class="duo-primary" data-duo="join">'+icon('duo')+'시즌 참가 신청'+icon('arrow')+'</button>':
   active&&t?'<button class="duo-primary" data-duo="match" '+(Number(e?.current)<Number(e?.cost)?'disabled':'')+'>'+icon('sword')+'듀오 상대 찾기'+icon('arrow')+'</button>':
   '<div class="duo-wait">'+icon(waiting||t?'check':'duo')+'<div><b>'+waitTitle+'</b><span>'+waitHint+'</span></div></div>';
  const fraction=e?.maximum>0?Math.min(100,Math.max(0,Number(e.current)/Number(e.maximum)*100)):0;
  root.querySelector('[data-duo-content]').innerHTML=
   '<div class="duo-schedule"><ol aria-label="시즌 진행 단계">'+['참가 모집','팀 편성','시즌 대전'].map((label,i)=>'<li class="'+(i===step?'current':i<step?'complete':'')+'" '+(i===step?'aria-current="step"':'')+'><span>'+ (i<step?icon('check'):'0'+(i+1))+'</span>'+label+'</li>').join('')+'</ol><div class="duo-season-date">'+schedule(s,recruiting)+'</div></div>'+
   (s?.weekly?'<div class="duo-reward-strip"><div><small>시즌 운영</small><b>24시간 모집 <i>→</i> 7일 전투</b></div><div><small>공격 승리 보상</small><b>'+fmt(s.rewards.winCoin)+' 코인</b></div><button data-duo="tiers">시즌 티어 보상 보기 '+icon('arrow')+'</button></div>':'')+
   '<div class="duo-deployment"><section class="duo-arena">'+
    '<header class="duo-arena-heading"><div><p class="duo-kicker">OUR TEAM</p><h2>우리 팀</h2></div>'+ (t?.tier?'<div class="duo-team-tier">'+tierArt(t.tier,88)+'<div><span>TEAM TIER</span><b>'+esc(t.tier.name)+'</b><small>'+ (t.rank?'시즌 '+fmt(t.rank)+'위':'팀 점수 기준')+'</small></div></div>':'')+'<div class="duo-team-score"><span>팀 점수</span><strong>'+ (t?fmt(t.score):'—')+'</strong><small>PT</small></div></header>'+
    '<div class="duo-team-pair">'+members(t,'ally')+'</div>'+
    '<div class="duo-team-link"><span></span>'+icon(t?'link':'duo')+'<b>'+ (t?'두 덱, 하나의 팀':waiting?'참가 신청 완료':'함께할 동료를 찾아서')+'</b><span></span></div>'+
    '<div class="duo-arena-caption"><h3>'+teamTitle+'</h3><p>'+teamText+'</p></div>'+
    '<footer class="duo-arena-footer"><span>'+icon('duo')+'2인 팀 · 비동기 대전</span><b>'+ (t?'<em>'+fmt(t.wins)+'</em>승 <i>/</i> '+fmt(t.losses)+'패':'개별 신청 · 자동 편성')+'</b></footer></section>'+
   '<aside class="duo-control"><header><p class="duo-kicker">DEPLOYMENT</p><h2>출전 준비</h2><span>'+ (active&&t?'우리 팀 출전 가능':'다음 승부를 준비하세요')+'</span></header>'+
    '<div class="duo-energy-label">'+icon('energy')+'<h3>내 행동력</h3><small>개인별 사용</small></div>'+
    '<div class="duo-energy"><strong>'+ (e?fmt(e.current):'—')+'</strong><span>/ '+(policy?.maximum?fmt(policy.maximum):'—')+'</span><small>AP</small></div>'+
    '<div class="duo-energy-bar" aria-hidden="true"><span style="width:'+fraction+'%"></span></div>'+
    '<div class="duo-energy-meta"><span>공격 1회</span><b>'+ (policy?.cost?fmt(policy.cost)+' AP':'추후 안내')+'</b></div>'+
    (e?.nextResetAt?'<p class="duo-reset">다음 충전 <b>'+esc(date(e.nextResetAt))+'</b></p>':'')+
    (policy?.mode==='RANKED'?'<p class="duo-reset">'+fmt(policy.rechargeMinutes)+'분마다 1 AP 충전 · 랭크전과 별도</p>':'')+'<p class="duo-control-note">내가 시작한 경기만 내 행동력을 사용합니다.<br>팀원의 행동력은 그대로 유지됩니다.</p>'+
    '<div class="duo-actions">'+action+(active&&t&&Number(e?.current)<Number(e?.cost)&&!pending()?'<p class="duo-low-energy">행동력이 부족합니다. 다음 충전을 기다려 주세요.</p>':'')+
    '<button class="duo-secondary" data-duo="deck">'+icon('deck')+'공격·방어 덱 확인'+icon('arrow')+'</button>'+
    (recruiting&&waiting?'<button class="duo-text-button" data-duo="cancel">참가 신청 취소</button>':'')+'</div>'+
    '<div class="duo-combat-note">'+icon('sword')+'<p>네 사람의 모든 덱이<br><b>하나의 전장</b>에서 맞붙습니다.</p><strong>2<span>VS</span>2</strong></div></aside></div>'+
   '<details class="duo-guide"><summary>'+icon('duo')+'<span>듀오 시즌 가이드<small>모집 · 팀 편성 · 덱 최신화</small></span><b>+</b></summary>'+
    '<div class="duo-rules"><section><span>01</span><div><h3>다른 전력, 균형 있는 한 팀</h3><p>각 시즌은 24시간 참가 모집 뒤 7일 동안 전투합니다. 보유 카드·용병, SUPERSTAR와 FUR +13 기준, 장비의 PVP 전력을 함께 평가해 강한 전력과 성장 중인 전력을 조합합니다.</p></div></section>'+
    '<section><span>02</span><div><h3>전투마다 최신 덱으로</h3><p>선택한 랭크전 공격 프리셋과 방어 프리셋 1을 사용합니다. 카드 강화와 장비 변경이 반영되며, 각자 일반 카드 5장과 용병 최대 1장이 함께 출전합니다.</p></div></section>'+
    '<section><span>03</span><div><h3>혼자 접속해도, 함께 출전</h3><p>팀원과 동시에 접속할 필요가 없습니다. 공격한 사람의 행동력만 사용하고 경기 결과는 두 사람의 팀 점수에 반영됩니다.</p></div></section></div>'+
    '<p class="duo-footnote">7일 전투가 끝나면 자동 정산하고 다음 시즌의 24시간 모집을 시작합니다. 최종 상위 10팀은 두 사람 모두 전용 트로피를 받습니다. 추가모집은 대전 시작 전에만 가능하며 미편성자는 대기합니다.</p></details>';
 }
 async function load(){state=await call('status');if(state.wallet)onWallet(state.wallet);if(state.pendingMatchId)save({matchId:state.pendingMatchId});draw();if(tab!=='home')await loadTab();}
 const empty=(glyph,title,description)=>'<div class="duo-empty">'+icon(glyph)+'<h2>'+title+'</h2><p>'+description+'</p><button class="duo-secondary" data-duo="home">시즌 로비로</button></div>';
 async function loadTab(){
  if(tab==='tiers'){await renderTiers();return;}
  const data=await call(tab);if(!root.isConnected)return;const content=root.querySelector('[data-duo-content]');
  if(tab==='ranking'){
   const ranking=data.ranking||[];
   content.innerHTML='<section class="duo-records"><header class="duo-record-heading"><div><p class="duo-kicker">SEASON LEADERBOARD</p><h2>정상을 향한 두 사람</h2></div><span>상위 100팀 · 챌린저 10팀</span></header>'+
    (ranking.length?'<div class="duo-podium">'+ranking.slice(0,3).map(t=>'<article class="duo-podium-entry rank-'+Number(t.rank)+'">'+tierArt(t.tier,80)+'<span class="duo-podium-rank">'+fmt(t.rank)+'<small>위</small></span><h3>'+t.members.map(m=>'<span>'+esc(m.nickname)+'</span>').join('<i>×</i>')+'</h3><strong>'+fmt(t.score)+'<small>PT</small></strong><p>'+fmt(t.wins)+'승 · '+fmt(t.losses)+'패</p></article>').join('')+'</div>'+
     '<div class="duo-table"><div class="duo-table-label"><span>순위</span><span>팀 / 전적</span><span>팀 점수</span></div>'+ranking.map(t=>{
      const mine=t.members.some(m=>String(m.userId)===String(userId));
      return '<div class="duo-rank-row '+(mine?'is-mine':'')+'"><b>'+fmt(t.rank)+'</b><div><strong>'+t.members.map(m=>esc(m.nickname)).join(' <em>×</em> ')+'</strong><small>'+tierArt(t.tier,32)+'<span>'+esc(t.tier?.name)+'</span>'+(mine?'<mark>우리 팀</mark>':'')+fmt(t.wins)+'승 · '+fmt(t.losses)+'패</small></div><span>'+fmt(t.score)+'<small>PT</small></span></div>';
     }).join('')+'</div>':empty('trophy','새로운 시즌, 첫 번째 정상','팀 편성이 끝나면 시즌 랭킹이 공개됩니다.'))+'</section>';
  }else{
   content.innerHTML='<section class="duo-records"><header class="duo-record-heading"><div><p class="duo-kicker">BATTLE RECORDS</p><h2>함께 써 내려간 승부</h2></div><span>우리 팀 최근 30경기</span></header>'+
    (data.history?.length?'<div class="duo-history">'+data.history.map(h=>{
     const completed=h.status==='COMPLETED',win=completed&&h.winner===h.side;
     return '<article class="duo-history-row '+(completed?(win?'is-win':'is-loss'):'is-pending')+'"><div class="duo-outcome">'+icon(completed?(win?'trophy':'sword'):'history')+'<b>'+ (completed?(win?'승리':'패배'):h.status==='CANCELLED'?'취소':'처리 중')+'</b></div><div class="duo-history-info"><strong>'+ (h.side==='A'?'우리 팀의 도전':'상대 팀의 도전')+'</strong><small>'+esc(date(h.created_at))+'</small></div><button class="duo-secondary" data-duo="replay" data-match="'+esc(h.id)+'" '+(completed?'':'disabled')+'>'+icon('history')+'전투 보기</button></article>';
    }).join('')+'</div>':empty('history','첫 경기를 기다리는 중','두 사람이 함께한 승부를 이곳에서 다시 볼 수 있습니다.'))+'</section>';
  }
 }
 async function renderTiers(){
  const s=state?.season||duoTiers(),road=[...(s?.tiers||[]),...(s?.challenger?[s.challenger]:[])];
  root.querySelector('[data-duo-content]').innerHTML='<section class="duo-honors"><div class="duo-honors-hero"><div class="duo-trophy-stage"><div></div><img src="/assets/ui/ranked-duo/challenger-trophy-v2.webp" width="512" height="512" alt="듀오 챌린저 전용 트로피"><span>DUO CHALLENGER</span></div><div class="duo-honors-copy"><p class="duo-kicker">TWO PLAYERS. ONE LEGACY.</p><h2>함께 오른 정상,<br><em>두 사람의 영예.</em></h2><p>시즌의 마지막 순간까지<br>챌린저의 자리를 지켜낸 듀오에게.</p><div class="duo-trophy-rule"><strong>최종 1–10위 팀</strong><span>팀원 두 사람에게 각각 1개<br>시즌 종료 정산 후 명함에 영구 기록</span></div><small>랭크전과 같은 티어 명칭 · 듀오 전용 문장<br>트로피는 기념 수집품이며 전투 능력치를 올리지 않습니다.</small></div></div><div class="duo-tier-road-heading"><div><p class="duo-kicker">THE ASCENT</p><h3>우리 둘의 다음 티어</h3></div><span>팀 점수 기준 · 챌린저는 상위 10팀</span></div><ol class="duo-tier-road">'+road.map((tier,i)=>'<li class="'+(tier.id===state?.team?.tier?.id?'is-current':'')+'"><span class="duo-tier-number">0'+(i+1)+'</span>'+tierArt(tier,144)+'<h4>'+esc(tier.name)+'</h4><p>'+(tier.id==='challenger'?'시즌 상위 10팀':fmt(tier.min)+' PT 이상')+'</p>'+(s.rewards?'<div class="duo-tier-reward"><small>팀원 각각 · 시즌 정산</small><strong>'+ (s.rewards.tierEnabled?fmt(tier.rewardCoin)+' 코인':'보상 중지')+'</strong>'+(s.rewards.tierEnabled&&tier.rewardShards?'<span>카드조각 '+fmt(tier.rewardShards)+'개</span>':'')+'</div>':'')+(tier.id===state?.team?.tier?.id?'<b>우리 팀</b>':'')+'</li>').join('')+'</ol><div data-duo-reward-history></div></section>';
  if(s.weekly){const data=await call('rewards');if(tab!=='tiers'||!root.isConnected)return;const el=root.querySelector('[data-duo-reward-history]');if(el)el.innerHTML='<div class="duo-reward-history"><h3>내 시즌 보상 기록</h3>'+(data.rewards.length?data.rewards.map(r=>'<article><div><b>'+esc(r.seasonName)+' · '+esc(r.tierName)+'</b><small>최종 '+fmt(r.rank)+'위 · '+esc(date(r.creditedAt))+' 지급</small></div><strong>'+fmt(r.coin)+' 코인'+(r.shards?'<small>카드조각 '+fmt(r.shards)+'개</small>':'')+'</strong></article>').join(''):'<p>시즌 정산이 끝나면 지급 기록이 표시됩니다. 보상은 계정에 자동으로 들어옵니다.</p>')+'</div>';}
 }
 function renderMatch(d){
  const content=root.querySelector('[data-duo-content]');
  content.innerHTML='<section class="duo-match-preview"><header><p class="duo-kicker">OPPONENT FOUND</p><h2>두 팀의 승부가 시작됩니다</h2><p>네 사람의 모든 덱이 하나의 전장으로.</p></header>'+
   '<div class="duo-versus-stage"><div class="duo-match-team"><h3>우리 팀 <span>'+fmt(state.team?.score)+' PT</span></h3><div class="duo-team-pair">'+members(state.team,'ally')+'</div></div>'+
   '<div class="duo-versus-mark" aria-hidden="true"><img src="/assets/ui/ranked/ranked-match-scanner-v1826.webp" alt="" width="160" height="160"><b>VS</b></div>'+
   '<div class="duo-match-team enemy"><h3>상대 팀 <span>'+fmt(d.opponent?.score)+' PT</span></h3><div class="duo-team-pair">'+members(d.opponent,'enemy')+'</div></div></div>'+
   '<div class="duo-match-confirm"><p>'+icon('energy')+'내 행동력 <b>'+fmt(state.energy.cost)+' AP</b> 사용<span>전투 시작 시 최신 덱이 반영됩니다.</span></p><div><button class="duo-secondary" data-duo="home">로비로</button><button class="duo-primary" data-duo="fight">'+icon('sword')+'네 덱으로 전투 시작'+icon('arrow')+'</button></div></div></section>';
  if(content.getBoundingClientRect().top<0)content.scrollIntoView({block:'start',behavior:'instant'});
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
  let closed=false;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const close=()=>{if(closed)return;closed=true;renderer?.destroy();renderer=null;modal.__battleV2Renderer=null;modal.className='modal';modal.innerHTML='';document.body.style.overflow=previousOverflow;void load().catch(error=>message(error.message));};
  const live=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVP',playerName:data.attackerNames.join(' + '),opponentName:data.defenderNames.join(' + ')});
  live.stage.querySelector('.battle-v3-header strong').textContent='랭크 듀오 · 2 대 2';
  const exit=document.createElement('button');exit.className='duo-battle-exit';exit.textContent='기록 닫기';exit.onclick=close;live.stage.append(exit);
  try{
   const created=await window.ProjectVBattleV3Live.createRenderer({...live,modal,data,mode:'PVP'});if(closed){created.destroy();return;}renderer=created;modal.__battleV2Renderer=renderer;
   await renderer.play();if(closed||!renderer)return;renderer.showResult();
   const ownSide=data.battleV2.teams.B.members.some(m=>state?.team?.members.some(own=>own.userId===m.ownerId))?'B':'A',win=data.battleV2.result.winner===ownSide;
   live.msg.innerHTML='<div class="duo-result '+(win?'is-win':'is-loss')+'">'+icon(win?'trophy':'sword')+'<small>'+ (win?'VICTORY':'DEFEAT')+'</small><strong>'+ (win?'우리 팀 승리':'우리 팀 패배')+'</strong><div class="duo-result-score"><span>경기 종료 시 팀 점수</span><b>'+fmt(ownSide==='A'?data.scoreAfter:data.opponentScoreAfter)+'<small>PT</small></b></div>'+(data.rewardCoin>0&&Number(data.rewardUserId)===Number(userId)?'<p class="duo-victory-reward">공격 승리 보상 <b>'+fmt(data.rewardCoin)+' 코인</b> 지급 완료</p>':'')+'<button class="duo-primary" data-duo-close>전투 닫기'+icon('arrow')+'</button></div>';
   live.msg.querySelector('button').onclick=close;
  }catch(error){
   if(closed)return;renderer?.destroy();renderer=null;live.stage.classList.add('is-result-visible');modal.classList.remove('battle-v3-preparing');live.stage.querySelector('.battle-v3-loader')?.remove();
   live.msg.innerHTML='<div class="duo-result"><strong>전투 기록이 저장되었습니다</strong><p>'+esc(error.message)+'</p><button class="duo-primary">돌아가기</button></div>';live.msg.querySelector('button').onclick=close;
  }
 }
 root.onclick=async event=>{
  const button=event.target.closest('[data-duo]');if(!button||busy)return;event.preventDefault();const action=button.dataset.duo;setBusy(true);
  try{
   if(['home','ranking','history','tiers'].includes(action)){tab=action;draw();if(tab!=='home')await loadTab();}
   else if(action==='refresh')await load();
   else if(action==='join'||action==='cancel'){await call('join',{method:action==='join'?'POST':'DELETE',body:{}});await load();}
   else if(action==='deck')navigate('pvp');
   else if(action==='recover')await recoverFight();
   else if(action==='match'){
    const d=await call('match',{method:'POST',body:{}});if(d.pendingMatchId){save({matchId:d.pendingMatchId});await recoverFight();}
    else{opponent=d;renderMatch(d);}
   }else if(action==='fight'&&opponent)await acceptFight({requestId:crypto.randomUUID(),matchToken:opponent.token});
   else if(action==='replay'){const d=await call('replay?id='+encodeURIComponent(button.dataset.match));if(d.status==='COMPLETED')await playback(d);else message('아직 전투 처리가 완료되지 않았습니다.');}
  }catch(error){if(['DUO_CANCELLED','DUO_TICKET'].includes(error.code))save(null);message(error.message);}
  finally{setBusy(false);}
 };
 try{await load();}catch(error){root.innerHTML='<section class="duo-hub duo-load-error"><h1>랭크 듀오</h1><p data-duo-message role="alert">'+esc(error.message)+'</p><button class="duo-primary" data-duo="refresh">다시 불러오기</button></section>';}
}
