(() => {
  'use strict';
  const MIN_BET = 100000;
  const USER_MAX_BET_PER_EVENT = 500000000;
  const model = window.CoinPredictionModel;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fmt = value => Number(value || 0).toLocaleString('ko-KR');
  const short = value => { const n=Number(value||0); return Math.abs(n)>=1e8?`${Number((n/1e8).toFixed(2))}억`:Math.abs(n)>=1e4?`${Number((n/1e4).toFixed(1))}만`:fmt(n); };
  const signed = value => `${Number(value)>0?'+':''}${fmt(value)}`;
  const api = (path, options = {}, control = {}) => window.apiRequest(path, options, control);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const dateMs = value => { const s=String(value||''); return Date.parse(s && !/[TZ+]/.test(s)?s.replace(' ','T')+'Z':s); };
  let state=null, root=null, timer=0, pollTimer=0, pollMs=0, busy=false, acceptedVersion='', sequence=0, serverOffset=0;
  let listView='active', listPage=1, selectedCategory='ALL', onlyMine=false, selectedEventId=0, dialogClose=null;
  let retryPayload=null,accountId=null;
  const selectedOptions=new Map(), drafts=new Map();
  const symbols={
    all:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    soccer:'<circle cx="12" cy="12" r="9"/><path d="m12 7 4.7 3.4-1.8 5.6H9.1l-1.8-5.6L12 7Zm0 0V3m4.7 7.4 3.8-1.2M15 16l2.3 3.3M9 16l-2.3 3.3M7.3 10.4 3.5 9.2"/>',
    baseball:'<circle cx="12" cy="12" r="9"/><path d="M6 5c7 2 7 12 0 14M18 5c-7 2-7 12 0 14M7 8l3-1m-1 4 3 1m-2 3-3-1m10-6-3-1m1 4-3 1m2 3 3-1"/>',
    basketball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.5 5.5c8 1 8 12 0 13m13-13c-8 1-8 12 0 13"/>',
    lol:'<path d="m5 3 7 3 7-3v10c0 4-7 8-7 8s-7-4-7-8V3Z"/><path d="M10 8v8h5m-3-8h3"/>',
    setka:'<path d="M5 4h14v14H5zM3 21h18M8 8h8m-8 4h8M9 18v3m6-3v3"/><circle cx="17" cy="4" r="2"/>',
    other:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.3 7a8 8 0 0 1 13.9-1M4.8 18A8 8 0 0 0 18.7 17"/>',
    ticket:'<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v3m0 3v2m0 3v3M7 9h4m-4 5h4"/>',
    crown:'<path d="m3 6 5 5 4-7 4 7 5-5-2 12H5L3 6Zm3 15h12"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]||symbols.other}</svg>`;
  const now = () => Date.now()+serverOffset;
  const open = event => event.status==='OPEN' && (!event.closes_at || dateMs(event.closes_at)>now()) && state?.settings?.enabled!==false;
  const status = event => event.status==='OPEN' ? (event.closes_at && dateMs(event.closes_at)<=now()?'결과 대기':'참여 중') : event.status==='CLOSED'?'결과 대기':event.status==='SETTLED'?'정산 완료':'무효·환불';
  function clock(event) {
    if(event.status!=='OPEN')return status(event);
    if(!event.closes_at)return '수동 마감';
    const seconds=Math.max(0,Math.ceil((dateMs(event.closes_at)-now())/1000));
    if(!Number.isFinite(seconds))return '시각 확인 중';
    if(!seconds)return '마감';
    const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function odds(event, option) {
    const value=model.estimate({...event,myBet:null},option.id)?.odds;
    return value===null||value===undefined?'—':`${value.toFixed(2)}배`;
  }
  function imageUrl(value) {
    if(!value)return '';
    try { const url=new URL(value,location.origin+'/'); return ['http:','https:'].includes(url.protocol)?url.href:''; } catch { return ''; }
  }
  function categoriesMarkup() {
    return [{code:'ALL',label:'전체 경기',icon:'all'},...model.categories].map(c=>`<button type="button" class="cp3-category ${selectedCategory===c.code?'is-active':''}" data-cp-category="${c.code}" aria-pressed="${selectedCategory===c.code}">${icon(c.icon)}<span>${c.label}</span><b data-cp-category-count="${c.code}">0</b></button>`).join('');
  }
  function view(user) {
    const nextAccount=Number(user?.id||0);
    if(accountId!==nextAccount){accountId=nextAccount;retryPayload=null;state=null;selectedOptions.clear();drafts.clear();acceptedVersion='';selectedEventId=0;}
    return `<section id="coinPredictionRoot" class="cp3-shell" aria-label="코인 승부예측">
      <header class="cp3-hero"><div class="cp3-wordmark"><span class="cp3-logo" aria-hidden="true">M<span>↗</span></span><div><p class="cp3-overline">SOOPKETMON / MATCHDAY</p><h1>승부예측<span>.</span></h1><p class="cp3-hero-copy">당신의 선택, 다음 승부의 주인공.</p></div></div>
        <div class="cp3-hero-side"><div class="cp3-wallet"><span>내 보유 코인</span><strong id="cpWallet">—</strong><small>GAME COIN</small></div><div class="cp3-champion" id="cpDailyChampion">${icon('crown')}<div><span>오늘의 적중왕</span><b>정산 대기</b></div></div></div>
      </header>
      <nav class="cp3-categories" aria-label="경기 카테고리">${categoriesMarkup()}</nav>
      <div class="cp3-controlbar"><nav class="cp3-views" aria-label="진행 상태"><button type="button" data-cp-view="active" class="is-active" aria-pressed="true">진행 중 <b id="cpActiveCount">0</b></button><button type="button" data-cp-view="history" aria-pressed="false">종료된 경기 <b id="cpHistoryCount">0</b></button></nav>
        <div class="cp3-tools"><button type="button" class="cp3-mine" data-cp-mine aria-pressed="false">${icon('ticket')}내 배팅만</button><button type="button" class="cp3-refresh" data-cp-refresh aria-label="승부예측 새로고침">${icon('refresh')}</button><span id="cpUpdated" class="cp3-updated">연결 중</span></div></div>
      <div id="cpNotice" class="cp3-notice" role="status" hidden></div>
      <div id="cpRecovery" class="cp3-recovery" hidden><span>응답이 끊긴 배팅은 같은 요청 번호로 확인합니다. 경기가 마감돼도 확인할 수 있습니다.</span><button type="button" data-cp-retry>이전 요청 다시 확인 ${icon('refresh')}</button></div>
      <div class="cp3-workspace"><aside class="cp3-rail" aria-label="경기 목록"><header><div><p class="cp3-overline">MATCH LIST</p><h2 id="cpRailTitle">전체 경기</h2></div><span id="cpRailCount">—</span></header><div id="cpMatchList" class="cp3-match-list">${loading('경기를 불러오는 중')}</div><nav id="cpPagination" class="cp3-pagination" aria-label="경기 목록 페이지"></nav></aside>
        <div id="cpBoardHost" class="cp3-board-host">${loading('승부예측을 준비합니다')}</div></div>
      <footer class="cp3-footer"><div><b>PLAY FAIR. PLAY FOR FUN.</b><p>숲켓몬 코인은 현금·환전 가치가 없는 게임 내 가상 재화입니다.</p></div><button type="button" data-cp-terms>이용 규정 ${icon('arrow')}</button></footer>
    </section>`;
  }
  function loading(text) { return `<div class="cp3-empty cp3-loading" role="status"><span class="cp3-loader"></span><b>${esc(text)}</b></div>`; }
  function empty() { return `<div class="cp3-empty">${icon(onlyMine?'ticket':'clock')}<p class="cp3-overline">${onlyMine?'MY TICKETS':'NEXT MATCH'}</p><h2>${onlyMine?'아직 참여한 경기가 없습니다':'표시할 경기가 없습니다'}</h2><p>${listView==='history'?'정산 대기와 최근 24시간의 완료 기록을 확인할 수 있습니다.':'다른 카테고리를 선택하거나 새 경기 등록을 기다려 주세요.'}</p><button type="button" data-cp-reset>전체 경기 보기 ${icon('arrow')}</button></div>`; }
  function myResultLine(event) {
    const result=model.outcome(event);if(!result)return '';
    const label=result.refunded?'환불 완료':result.final?'정산 수령액':'적중 시 예상';
    return `<span class="cp3-match-mine">${icon('ticket')}<span>${label}</span><b>${result.payout===null?'집계 중':`${short(result.payout)} 코인`}</b></span>`;
  }
  function matchCard(event) {
    const cat=model.category(event.category),active=Number(event.id)===selectedEventId;
    return `<button type="button" class="cp3-match ${active?'is-active':''}" data-cp-event-select="${event.id}" aria-pressed="${active}"><span class="cp3-match-top"><span>${icon(cat.icon)}${cat.label}</span><em class="cp3-status status-${esc(event.status.toLowerCase())}">${status(event)}</em></span><strong>${esc(event.title)}</strong><span class="cp3-match-meta"><span>${fmt(event.participant_count)}명 · ${short(event.total_pool)} 코인</span><time data-cp-countdown="${event.id}">${clock(event)}</time></span>${myResultLine(event)}</button>`;
  }
  function optionMarkup(event, option, index, selectedId) {
    const selected=Number(option.id)===selectedId,winner=Number(event.result_option_id)===Number(option.id),mine=Number(event.myBet?.option_id)===Number(option.id);
    const share=event.total_pool>0?Math.max(0,Math.min(100,Number(option.total_bet)/Number(event.total_pool)*100)):0;
    const disabled=!open(event)||Boolean(event.myBet&&!mine)||Boolean(retryPayload);
    return `<button type="button" class="cp3-option ${selected?'is-selected':''} ${winner?'is-winner':''}" data-cp-option="${option.id}" aria-pressed="${selected}" ${disabled?'disabled':''}><span class="cp3-option-number">${winner?icon('check'):String(index+1).padStart(2,'0')}</span><span class="cp3-option-name"><b>${esc(option.label)}</b><small>${mine?'내 선택 · ':''}${winner?'적중 결과 · ':''}${fmt(option.bet_count)}명 참여</small></span><span class="cp3-option-odds"><small>${event.status==='SETTLED'?'최종 배당':'현재 예상 배당'}</small><strong>${odds(event,option)}</strong></span><span class="cp3-share"><i style="width:${share.toFixed(2)}%"></i></span><span class="cp3-option-meta"><span>${fmt(option.total_bet)} 코인</span><b>${share.toFixed(1)}%</b></span></button>`;
  }
  function ledger(event, selectedId) {
    const option=event.options?.find(o=>Number(o.id)===selectedId)||event.options?.[0];
    const people=option?.bettors||[];
    return `<details class="cp3-ledger" data-cp-ledger><summary><span>참여자별 배팅 현황</span><b>펼쳐보기 <span>+</span></b></summary><div class="cp3-ledger-content"><nav aria-label="참여 내역 항목">${(event.options||[]).map(o=>`<button type="button" data-cp-ledger-option="${o.id}" class="${o===option?'is-active':''}">${esc(o.label)}</button>`).join('')}</nav><div class="cp3-ledger-rows" data-cp-ledger-rows>${ledgerRows(people)}</div></div></details>`;
  }
  function ledgerRows(people) { return people.length?people.map((b,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><b>${esc(b.nickname)}</b><strong>${fmt(b.amount)} <small>코인</small></strong></div>`).join(''):'<p class="cp3-muted">아직 참여자가 없습니다.</p>'; }
  function limits(event) {
    const current=Number(event.myBet?.amount||0),wallet=Math.max(0,Number(state.walletCoin||0)),unlimited=state.settings?.ownerUnlimited===true;
    return { current,wallet,unlimited,max:unlimited?wallet:Math.max(0,Math.min(wallet,Number(event.max_bet||USER_MAX_BET_PER_EVENT)-current)) };
  }
  function readDraft(event) { const raw=drafts.get(Number(event.id))||'';return {raw,amount:Number(raw),valid:raw!==''&&Number.isSafeInteger(Number(raw))&&Number(raw)>=MIN_BET&&Number(raw)<=limits(event).max}; }
  function ticket(event, selectedId) {
    const mine=event.myBet,result=model.outcome(event),selected=event.options?.find(o=>Number(o.id)===selectedId),{current,max,unlimited}=limits(event);
    const draft=readDraft(event),canBet=open(event)&&max>=MIN_BET&&!result?.final,hasRetry=Number(retryPayload?.eventId)===Number(event.id);
    return `<aside class="cp3-ticket" aria-label="내 배팅 티켓"><header><span>${icon('ticket')} MY TICKET</span><b>내 배팅</b></header><div class="cp3-ticket-body"><div class="cp3-ticket-pick"><small>${mine?'확정한 선택':'예측할 항목'}</small><strong data-cp-selected-label>${esc(selected?.label||'왼쪽에서 항목을 선택하세요')}</strong>${mine?'<span class="cp3-lock-note">최초 선택 유지 · 취소 및 변경 불가</span>':''}</div>
      ${result?.final?`<div class="cp3-settled-label ${result.refunded?'is-refund':result.won?'is-win':'is-loss'}">${icon(result.won?'check':'ticket')}${result.refunded?'무효 · 전액 환불':result.won?'적중 · 정산 완료':'미적중 · 정산 완료'}</div>`:''}
      <dl class="cp3-ticket-line"><dt>기존 배팅 금액</dt><dd>${fmt(current)} <small>코인</small></dd></dl>
      ${canBet?`<div class="cp3-amount-control"><label for="cpBetAmount">${mine?'추가 배팅 금액':'배팅 금액'} <span>최소 10만</span></label><div class="cp3-amount-field"><input id="cpBetAmount" type="text" inputmode="numeric" autocomplete="off" maxlength="16" pattern="[0-9]*" aria-describedby="cpAmountHint" value="${esc(draft.raw)}" placeholder="금액 입력" ${retryPayload?'disabled':''}><span>코인</span></div><div class="cp3-quick">${[[100000,'10만'],[1000000,'100만'],[10000000,'1,000만'],[max,'최대']].map(([n,label])=>`<button type="button" data-cp-quick="${n}" ${retryPayload?'disabled':''}>${label}</button>`).join('')}</div><p id="cpAmountHint" class="cp3-amount-hint">추가 가능 <b>${fmt(max)} 코인</b> · ${unlimited?'OWNER 보유액 내 제한 없음':'경기당 최대 5억'}</p></div>`:`<p class="cp3-muted">${result?.final?'수령액은 실제 정산된 금액입니다.':!open(event)?'신규 참여가 마감되었습니다. 결과를 기다려 주세요.':'보유 코인 또는 경기별 참여 한도에 도달했습니다.'}</p>`}
      <div id="cpEstimate" class="cp3-estimate" aria-live="polite">${estimateMarkup(event,selectedId)}</div>
      ${canBet||hasRetry?`<button type="button" class="cp3-submit" data-cp-submit="${event.id}" ${(hasRetry||selectedId&&draft.valid)&&!busy?'':'disabled'}>${hasRetry?'이전 요청 다시 확인':mine?'추가 배팅 확인':'배팅 확인'}${icon('arrow')}</button>`:''}
      <p class="cp3-ticket-disclaimer">${result?.final?'정산 코인은 자동 지급됩니다.':'예상 수령액은 적중을 가정한 값입니다. 마감 전 참여 금액과 지원금에 따라 달라집니다.'}</p></div><footer>SOOPKETMON · GAME COIN ONLY</footer></aside>`;
  }
  function estimateMarkup(event, selectedId) {
    const result=model.outcome(event),draft=readDraft(event),extra=open(event)&&draft.valid?draft.amount:0;
    const projected=result?.final?result:model.estimate(event,selectedId,extra);
    const total=projected?.stake||Number(event.myBet?.amount||0),payout=projected?.payout;
    const title=result?.refunded?'실제 환불액':result?.final?'실제 수령액':'적중 시 예상 수령액';
    return `<dl class="cp3-ticket-line"><dt>${extra?'추가 후 총 배팅':'총 배팅 금액'}</dt><dd>${fmt(total)} <small>코인</small></dd></dl><div class="cp3-estimate-main"><span>${title}<small>원금 포함</small></span><strong data-cp-estimated-payout>${payout===null||payout===undefined?'—':fmt(payout)}</strong><em>COIN${!result?.final&&projected?.odds!==null&&projected?.odds!==undefined?` · ${projected.odds.toFixed(2)}배`:''}</em></div><dl class="cp3-profit ${Number(projected?.profit)<0?'is-negative':''}"><dt>${result?.final?'실제 순손익':'적중 시 예상 순이익'}</dt><dd>${projected?.profit===null||projected?.profit===undefined?'—':`${signed(projected.profit)} 코인`}</dd></dl>${!result?.final?'<p>수수료 10% 차감·지원금 반영 후 예상입니다.</p>':''}`;
  }
  function board(event) {
    const selectedId=Number(event.myBet?.option_id||selectedOptions.get(Number(event.id))||0),cat=model.category(event.category),image=imageUrl(event.image_url);
    const closing=event.closes_at?new Date(dateMs(event.closes_at)).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'수동 마감';
    return `<article class="cp3-board" data-cp-event="${event.id}" data-cp-selected="${selectedId}"><header class="cp3-event-head"><div><div class="cp3-event-kicker"><span>${icon(cat.icon)}${cat.label}</span><span>MATCH ${event.id}</span><em class="cp3-status status-${esc(event.status.toLowerCase())}">${status(event)}</em></div><h2>${esc(event.title)}</h2><p>${esc(event.description||'경기 결과를 예측하고 게임 코인으로 참여하세요.')}</p></div>${image?`<img class="cp3-event-image" src="${esc(image)}" alt="" loading="lazy">`:''}<div class="cp3-event-numbers"><div><span>${icon('clock')}마감까지</span><b data-cp-countdown="${event.id}">${clock(event)}</b><small>${closing} · 한국시간</small></div><div><span>총 참여 코인</span><b>${fmt(event.total_pool)}</b><small>${fmt(event.participant_count)}명 참여</small></div></div></header>
      ${Number(event.treasury_subsidy)>0?`<div class="cp3-subsidy">${icon('crown')}<span>행정부 지원금 <b>+${fmt(event.treasury_subsidy)} 코인</b></span><small>적중자 분배 풀에 추가 반영</small></div>`:''}
      <div class="cp3-detail-grid"><div class="cp3-market"><header class="cp3-section-head"><div><p class="cp3-overline">PREDICTION BOARD</p><h3>${['SETTLED','VOID'].includes(event.status)?'최종 결과':'어떤 결과를 예상하나요?'}</h3></div><span>${event.options?.length||0}개 선택지</span></header><div class="cp3-options">${(event.options||[]).map((o,i)=>optionMarkup(event,o,i,selectedId)).join('')}</div><p class="cp3-market-note">${listView==='history'?'종료 후 24시간 동안 결과와 내 베팅·정산 내역을 확인할 수 있습니다.':'배당은 변동됩니다. 현재 배당이 최종 수령액을 보장하지 않습니다.'}</p>${ledger(event,selectedId)}</div>${ticket(event,selectedId)}</div></article>`;
  }
  function pagination() {
    const nav=state.navigation||{},page=Number(nav.page||1),total=Number(nav.totalPages||1);
    if(total<=1)return '';
    return `<button type="button" data-cp-page="${page-1}" ${page<=1?'disabled':''} aria-label="이전 페이지">←</button><span><b>${page}</b> / ${total}</span><button type="button" data-cp-page="${page+1}" ${page>=total?'disabled':''} aria-label="다음 페이지">→</button>`;
  }
  function notice(message='',error=false) { const n=root?.querySelector('#cpNotice');if(n){n.hidden=!message;n.textContent=message;n.classList.toggle('is-error',error);n.setAttribute('role',error?'alert':'status');} }
  function render() {
    if(!root?.isConnected||!state)return;
    const events=state.events||[],nav=state.navigation||{},counts=nav.counts||{};
    const priorBoard=root.querySelector('[data-cp-event]'),ledgerOpen=Boolean(priorBoard?.querySelector('[data-cp-ledger][open]'));
    if(!events.some(e=>Number(e.id)===selectedEventId))selectedEventId=Number(events[0]?.id||0);
    root.querySelector('#cpWallet').textContent=fmt(state.walletCoin);
    const king=state.settings?.todayChampion;
    root.querySelector('#cpDailyChampion').innerHTML=`${icon('crown')}<div><span>오늘의 적중왕 · KST 00시 기준</span><b>${esc(king?.nickname||'정산 대기')}</b>${king?`<small>순이익 +${fmt(king.netProfit)} 코인</small>`:''}</div>`;
    root.querySelectorAll('[data-cp-category]').forEach(b=>{const a=b.dataset.cpCategory===selectedCategory;b.classList.toggle('is-active',a);b.setAttribute('aria-pressed',String(a));b.querySelector('b').textContent=fmt(nav.categoryCounts?.[b.dataset.cpCategory]);});
    root.querySelectorAll('[data-cp-view]').forEach(b=>{const a=b.dataset.cpView===listView;b.classList.toggle('is-active',a);b.setAttribute('aria-pressed',String(a));});
    root.querySelector('[data-cp-mine]').classList.toggle('is-active',onlyMine);root.querySelector('[data-cp-mine]').setAttribute('aria-pressed',String(onlyMine));
    root.querySelector('#cpActiveCount').textContent=fmt(counts.active);root.querySelector('#cpHistoryCount').textContent=fmt(counts.history);
    root.querySelector('#cpRailTitle').textContent=`${selectedCategory==='ALL'?'전체 경기':model.category(selectedCategory).label}${onlyMine?' · 내 배팅':''}`;
    root.querySelector('#cpRailCount').textContent=`${fmt(nav.total||0)}경기`;
    root.querySelector('#cpMatchList').innerHTML=events.length?events.map(matchCard).join(''):'<p class="cp3-rail-empty">해당하는 경기가 없습니다.</p>';
    root.querySelector('#cpBoardHost').innerHTML=events.length?board(events.find(e=>Number(e.id)===selectedEventId)):empty();
    root.querySelector('#cpPagination').innerHTML=pagination();
    root.querySelector('#cpUpdated').textContent=`${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 갱신`;
    if(ledgerOpen&&Number(priorBoard?.dataset.cpEvent)===selectedEventId)root.querySelector('[data-cp-ledger]')?.setAttribute('open','');
    root.querySelectorAll('.cp3-event-image').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;},{once:true}));
    if(state.settings?.enabled===false)notice('현재 신규 참여가 일시 중지되었습니다. 기존 배팅과 정산 내역은 계속 확인할 수 있습니다.');
    if(retryPayload)notice(`경기 ${retryPayload.eventId}의 이전 요청 결과를 확인 중입니다. 같은 요청 번호로 다시 확인해 주세요.`,true);
    root.querySelector('#cpRecovery').hidden=!retryPayload;
    updateClocks();
  }
  async function load(nextView=listView,nextPage=listPage,{silent=false}={}) {
    const requestedView=nextView==='history'?'history':'active',requestedPage=Math.max(1,Number(nextPage||1)),requestedCategory=selectedCategory,requestedMine=onlyMine,requestSequence=++sequence;
    if(!silent&&root){root.setAttribute('aria-busy','true');root.querySelector('#cpMatchList').innerHTML=loading('경기를 불러오는 중');root.querySelector('#cpBoardHost').innerHTML=loading('경기를 불러오는 중');}
    try {
      const result=await api(`coin-prediction/state?view=${requestedView}&page=${requestedPage}&category=${requestedCategory}&mine=${requestedMine?1:0}`,{}, {replaceInflight:true});
      if(requestSequence!==sequence||!root?.isConnected)return;
      state=result;listView=result.navigation?.view||requestedView;listPage=Number(result.navigation?.page||requestedPage);
      const timestamp=dateMs(result.serverNow);serverOffset=Number.isFinite(timestamp)?timestamp-Date.now():0;
      notice();render();armPoll();
    } catch(error) {
      if(requestSequence!==sequence||!root?.isConnected)return;
      notice(`경기를 불러오지 못했습니다. ${error.message||'잠시 후 다시 확인해 주세요.'}`,true);
      if(!silent||!state){root.querySelector('#cpMatchList').innerHTML='<p class="cp3-rail-empty">연결을 확인해 주세요.</p>';root.querySelector('#cpBoardHost').innerHTML='<div class="cp3-empty"><h2>연결이 원활하지 않습니다</h2><p>배팅 내역은 서버에 보존됩니다.</p><button type="button" data-cp-refresh>다시 불러오기</button></div>';}
    } finally { if(requestSequence===sequence)root?.removeAttribute('aria-busy'); }
  }
  async function betRequest(payload) {
    const body=JSON.stringify(payload),requestAccount=accountId;
    for(let attempt=0;attempt<3;attempt++){
      if(requestAccount!==accountId)throw Object.assign(new Error('계정이 변경되어 이전 요청 재시도를 중단했습니다.'),{status:409});
      if(!root?.isConnected)throw new Error('승부예측 화면에서 이전 요청 결과를 다시 확인해 주세요.');
      try{return await api('coin-prediction/bet',{method:'POST',body},{timeoutMs:30000});}
      catch(error){const retry=!Number(error?.status)||Number(error.status)>=500||/처리 중/.test(String(error?.message||''));if(!retry||attempt===2)throw error;await wait(350*(attempt+1));}
    }
  }
  function dialog(title,content,{terms=false,confirmLabel='확인',checkRequired=false}={}) {
    return new Promise(resolve=>{
      if(dialogClose)dialogClose(false);
      const d=document.createElement('dialog');d.className='cp3-dialog';d.setAttribute('aria-labelledby','cpDialogTitle');
      d.innerHTML=`<form method="dialog"><header><div><p class="cp3-overline">MATCHDAY / ${terms?'POLICY':'CONFIRMATION'}</p><h2 id="cpDialogTitle">${esc(title)}</h2></div><button type="button" data-cp-dialog-close aria-label="닫기">${icon('close')}</button></header><div class="cp3-dialog-content">${content}</div>${checkRequired?'<label class="cp3-agreement"><input type="checkbox">이용 규정과 코인의 현금·환전 가치가 없음을 확인했습니다.</label>':''}<footer><button type="button" data-cp-dialog-close>닫기</button><button type="submit" class="cp3-primary" ${checkRequired?'disabled':''}>${esc(confirmLabel)}</button></footer></form>`;
      let finished=false;const close=value=>{if(finished)return;finished=true;d.close();d.remove();dialogClose=null;resolve(value);};dialogClose=close;
      d.querySelectorAll('[data-cp-dialog-close]').forEach(b=>b.onclick=()=>close(false));
      d.addEventListener('cancel',e=>{e.preventDefault();close(false);});
      d.querySelector('input')?.addEventListener('change',e=>{d.querySelector('[type=submit]').disabled=!e.target.checked;});
      d.querySelector('form').onsubmit=e=>{e.preventDefault();close(true);};
      document.body.appendChild(d);d.showModal();
    });
  }
  async function showTerms(confirmMode=false) {
    if(!state?.terms?.items?.length){notice('이용 규정을 불러온 뒤 다시 시도해 주세요.',true);return false;}
    const ok=await dialog(state.terms.title||'승부예측 이용 규정',(state.terms.items||[]).map((item,i)=>`<p class="cp3-term"><b>${String(i+1).padStart(2,'0')}</b><span>${esc(item)}</span></p>`).join(''),{terms:true,checkRequired:confirmMode,confirmLabel:confirmMode?'동의하고 계속':'확인'});
    if(ok&&confirmMode)acceptedVersion=state.terms.version;return ok;
  }
  async function submit(event) {
    if(busy||(!retryPayload&&!open(event)))return;
    const selectedId=Number(event.myBet?.option_id||selectedOptions.get(Number(event.id))||0),draft=readDraft(event);
    if(!retryPayload&&(!selectedId||!draft.valid))return notice('선택 항목과 금액을 확인하세요. 최소 10만, 이벤트 누적 최대는 5억 코인입니다. OWNER는 보유 코인 내에서 참여할 수 있습니다.',true);
    busy=true;
    try {
      if(!retryPayload){
        if(acceptedVersion!==state.terms?.version&&!await showTerms(true))return;
        const selected=event.options.find(o=>Number(o.id)===selectedId),projected=model.estimate(event,selectedId,draft.amount);
        const ok=await dialog('배팅을 확정할까요?',`<div class="cp3-confirm-pick"><span>${esc(event.title)}</span><h3>${esc(selected?.label)}</h3></div><dl class="cp3-confirm-amount"><dt>이번에 차감할 코인</dt><dd>${fmt(draft.amount)}</dd><dt>총 배팅 금액</dt><dd>${fmt(projected.stake)}</dd><dt>적중 시 예상 수령액 · 원금 포함</dt><dd>${fmt(projected.payout)}</dd></dl><p class="cp3-confirm-warning">최초 선택은 변경·취소할 수 없습니다. 예상 배당과 수령액은 마감 전까지 변동됩니다.</p>`,{confirmLabel:'코인 차감 · 배팅 확정'});
        if(!ok||!root?.isConnected)return;
        retryPayload={eventId:Number(event.id),optionId:selectedId,amount:draft.amount,requestId:crypto.randomUUID()};
      }
      if(Number(retryPayload.eventId)!==Number(event.id))return notice('이전에 요청한 경기의 처리 결과를 먼저 확인해 주세요.',true);
      root.querySelector('[data-cp-submit]')?.setAttribute('disabled','');
      const result=await betRequest(retryPayload);
      if(!result?.ok)throw new Error('배팅 처리 결과를 확인하지 못했습니다.');
      retryPayload=null;drafts.delete(Number(event.id));await load(listView,listPage);
      notice('배팅이 반영되었습니다. 현재 배당 기준 예상 수령액을 확인하세요.');
    } catch(error) {
      const uncertain=!Number(error?.status)||Number(error.status)>=500||/처리 중/.test(String(error?.message||''));
      if(!uncertain)retryPayload=null;
      render();notice(`${error.message||'요청에 실패했습니다.'}${uncertain?' 같은 요청 번호로 다시 확인합니다. 새 배팅은 보내지 않습니다.':''}`,true);
    } finally {busy=false;refreshTicket();}
  }
  function refreshTicket() {
    const recovery=root?.querySelector('[data-cp-retry]');if(recovery){recovery.disabled=busy;recovery.parentElement.hidden=!retryPayload;}
    const e=state?.events?.find(e=>Number(e.id)===selectedEventId);if(!e||!root?.isConnected)return;
    const selectedId=Number(e.myBet?.option_id||selectedOptions.get(selectedEventId)||0);
    const estimate=root.querySelector('#cpEstimate');if(estimate)estimate.innerHTML=estimateMarkup(e,selectedId);
    const button=root.querySelector('[data-cp-submit]');if(button)button.disabled=busy||(!retryPayload&&(!open(e)||!selectedId||!readDraft(e).valid));
  }
  function updateClocks() {
    root?.querySelectorAll('[data-cp-countdown]').forEach(n=>{const e=state?.events?.find(e=>Number(e.id)===Number(n.dataset.cpCountdown));if(e)n.textContent=clock(e);});
    const e=state?.events?.find(e=>Number(e.id)===selectedEventId);
    if(e&&!open(e))root?.querySelectorAll('[data-cp-option],[data-cp-quick],#cpBetAmount').forEach(n=>n.disabled=true);
    if(e&&!open(e)&&!retryPayload)root?.querySelector('[data-cp-submit]')?.setAttribute('disabled','');
  }
  function onClick(event) {
    const button=event.target.closest('button');if(!button||button.disabled||!root.contains(button))return;
    if(button.hasAttribute('data-cp-terms')){showTerms(false);return;}
    if(busy)return;
    if(button.hasAttribute('data-cp-retry')){if(retryPayload)submit(state?.events?.find(e=>Number(e.id)===Number(retryPayload.eventId))||{id:retryPayload.eventId});return;}
    if(button.hasAttribute('data-cp-refresh')){load();return;}
    const d=button.dataset;
    if(retryPayload&&(d.cpCategory||d.cpView||d.cpPage||d.cpEventSelect||button.hasAttribute('data-cp-mine')||button.hasAttribute('data-cp-reset'))){notice('이전 요청 다시 확인을 눌러 처리 결과부터 확인해 주세요. 새 배팅은 보내지 않습니다.',true);return;}
    if(d.cpCategory||d.cpView||button.hasAttribute('data-cp-mine')||button.hasAttribute('data-cp-reset')){
      if(d.cpCategory)selectedCategory=d.cpCategory;
      if(d.cpView)listView=d.cpView==='history'?'history':'active';
      if(button.hasAttribute('data-cp-mine'))onlyMine=!onlyMine;
      if(button.hasAttribute('data-cp-reset')){selectedCategory='ALL';onlyMine=false;}
      listPage=1;selectedEventId=0;root.querySelector('#cpBoardHost').innerHTML=loading('경기 목록을 전환합니다');load(listView,1);return;
    }
    if(d.cpPage){load(listView,Number(d.cpPage));return;}
    if(d.cpEventSelect){selectedEventId=Number(d.cpEventSelect);render();if(matchMedia('(max-width: 900px)').matches)root.querySelector('#cpBoardHost')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
    const e=state?.events?.find(e=>Number(e.id)===selectedEventId);if(!e)return;
    if(d.cpLedgerOption){const o=e.options.find(o=>Number(o.id)===Number(d.cpLedgerOption));root.querySelectorAll('[data-cp-ledger-option]').forEach(b=>b.classList.toggle('is-active',b===button));root.querySelector('[data-cp-ledger-rows]').innerHTML=ledgerRows(o?.bettors||[]);return;}
    if(d.cpOption){selectedOptions.set(selectedEventId,Number(d.cpOption));render();return;}
    if(d.cpQuick){const amount=Math.min(Number(d.cpQuick),limits(e).max);drafts.set(selectedEventId,String(amount));const input=root.querySelector('#cpBetAmount');if(input)input.value=String(amount);refreshTicket();return;}
    if(d.cpSubmit)submit(e);
  }
  function armPoll() {
    const interval=Math.max(15,Math.min(60,Number(state?.settings?.pollSeconds||15)))*1000;
    if(pollMs===interval)return;
    clearInterval(pollTimer);pollMs=interval;
    pollTimer=setInterval(()=>{if(root?.isConnected&&!document.hidden&&!busy&&!retryPayload&&!document.querySelector('.cp3-dialog')&&!root.querySelector('input:focus'))load(listView,listPage,{silent:true});},interval);
  }
  function stop() { clearInterval(timer);clearInterval(pollTimer);pollMs=0;sequence++;if(dialogClose)dialogClose(false);root=null; }
  function bind() {
    stop();root=document.querySelector('.cp3-shell');if(!root)return;
    root.onclick=onClick;
    root.oninput=e=>{if(e.target.id==='cpBetAmount'){drafts.set(selectedEventId,e.target.value);refreshTicket();}};
    load();timer=setInterval(updateClocks,1000);armPoll();
  }
  window.coinPredictionView=view;window.bindCoinPredictionView=bind;window.stopCoinPredictionView=stop;
})();
