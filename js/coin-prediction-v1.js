(() => {
  // V1861: 승인된 broadcast-ledger V2 UI. 서버 정책값과 반드시 동일해야 한다.
  const MIN_BET = 100000;
  const USER_MAX_BET_PER_EVENT = 100000000;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, token => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[token]);
  const fmt = value => Number(value || 0).toLocaleString('ko-KR');
  const api = (path, options = {}, control = {}) => window.apiRequest(path, options, control);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  let state = null;
  let timer = 0;
  let pollTimer = 0;
  let busy = false;
  let termsAccepted = false;
  let listView = 'active';
  let listPage = 1;
  let selectedEventId = 0;
  const selectedOptions = new Map();

  const eventStatus = event => event.status === 'OPEN'
    ? '참여 중'
    : event.status === 'CLOSED'
      ? '결과 대기'
      : event.status === 'SETTLED'
        ? '정산 완료'
        : '무효·환불';

  function predicted(event, option) {
    const pool = Number(event.total_pool || 0);
    const amount = Number(option.total_bet || 0);
    if (!pool || !amount) return '집계 중';
    return `${(pool * 0.9 / amount).toFixed(2)}배`;
  }

  function formatTime(ms) {
    if (ms <= 0) return '마감';
    const seconds = Math.ceil(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const rest = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  function eventTime(event) {
    if (event.status !== 'OPEN') return eventStatus(event);
    const end = Date.parse(event.closes_at || '');
    return Number.isFinite(end) ? formatTime(Math.max(0, end - Date.now())) : '진행 중';
  }

  function orderedEvents(events, now = Date.now()) {
    return (Array.isArray(events) ? events : []).map((event, index) => {
      const closeAt = Date.parse(event?.closes_at || '');
      const active = event?.status === 'OPEN' && (!event?.closes_at || closeAt > now);
      return { event, index, active, closeAt: Number.isFinite(closeAt) ? closeAt : Number.MAX_SAFE_INTEGER };
    }).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.active && a.closeAt !== b.closeAt) return a.closeAt - b.closeAt;
      if (!a.active) {
        const idDiff = Number(b.event?.id || 0) - Number(a.event?.id || 0);
        if (idDiff) return idDiff;
      }
      return a.index - b.index;
    }).map(entry => entry.event);
  }

  function currentEvents() {
    const events = Array.isArray(state?.events) ? state.events : [];
    return listView === 'active' ? orderedEvents(events) : events;
  }

  function optionShare(event, option) {
    const pool = Number(event.total_pool || 0);
    return pool > 0 ? Math.max(0, Math.min(100, Number(option.total_bet || 0) / pool * 100)) : 0;
  }

  async function betRequest(payload) {
    let lastError = null;
    const body = JSON.stringify(payload);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await api('coin-prediction/bet', { method: 'POST', body }, { timeoutMs: 30000 });
      } catch (error) {
        lastError = error;
        const retry = !Number(error?.status) || Number(error?.status) >= 500 || /처리 중/.test(String(error?.message || ''));
        if (!retry || attempt === 2) throw error;
        await wait(350 * (attempt + 1));
      }
    }
    throw lastError;
  }

  function championInline(king) {
    if (!king) return '<span>DAILY HIT KING</span><em><b>♛</b> 오늘의 적중왕 정산 대기</em>';
    return `<span>DAILY HIT KING</span><em title="${esc(king.nickname)}"><b>♛</b> ${esc(king.nickname)} · +${fmt(king.netProfit)}</em>`;
  }

  function matchItem(event, index) {
    const active = Number(event.id) === Number(selectedEventId);
    const isHistory = listView === 'history';
    const end = esc(event.closes_at || '');
    return `<button type="button" class="cp2-match-item ${active ? 'is-active' : ''} ${isHistory ? 'is-history' : ''}" data-cp-event-select="${event.id}">
      <i class="cp2-match-index">${String(index + 1).padStart(2, '0')}</i>
      <span class="cp2-match-copy">
        <small><span>${eventStatus(event)} · </span><span ${event.status === 'OPEN' ? `data-cp-countdown data-cp-end="${end}"` : ''}>${esc(eventTime(event))}</span></small>
        <b>${esc(event.title)}</b>
        <span class="cp2-match-meta"><span>${fmt(event.participant_count)}명</span><span>${fmt(event.total_pool)} COIN</span></span>
      </span>
    </button>`;
  }

  function optionMarkup(event, option, index, selectedId) {
    const mine = event.myBet;
    const open = event.status === 'OPEN' && state?.settings?.enabled !== false;
    const optionId = Number(option.id);
    const selected = optionId === Number(selectedId || 0);
    const winner = optionId === Number(event.result_option_id || 0);
    const share = optionShare(event, option);
    const disabled = listView === 'history' || !open || (mine && !selected);
    return `<button type="button" class="cp2-choice ${selected ? 'is-selected' : ''} ${winner ? 'is-winner' : ''}" data-cp-option="${optionId}" aria-pressed="${selected ? 'true' : 'false'}" style="--cp2-share:${share.toFixed(2)}%" ${disabled ? 'disabled' : ''}>
      <i class="cp2-choice-index"><span>${String(index + 1).padStart(2, '0')}</span></i>
      <span class="cp2-choice-copy">
        <b>${esc(option.label)}${winner ? ' · 적중 결과' : ''}</b>
        <em class="cp2-choice-money"><span>${fmt(option.bet_count)}명 참여</span><strong>${fmt(option.total_bet)} COIN</strong></em>
      </span>
      <em class="cp2-choice-odds"><small>${winner ? 'FINAL RESULT' : '예상 배당'}</small><strong>${winner ? '적중' : predicted(event, option)}</strong></em>
    </button>`;
  }

  function ledgerBody(event, optionId) {
    const option = (event.options || []).find(item => Number(item.id) === Number(optionId)) || event.options?.[0];
    const bettors = Array.isArray(option?.bettors) ? option.bettors : [];
    const label = option?.label ? `${esc(option.label)} 참여자별 베팅 현황` : '항목을 선택하면 참여 내역을 확인할 수 있습니다.';
    const rows = bettors.length
      ? bettors.map((bettor, index) => `<div><i>${String(index + 1).padStart(2, '0')}</i><b title="${esc(bettor.nickname)}">${esc(bettor.nickname)}</b><em>${fmt(bettor.amount)} COIN</em></div>`).join('')
      : '<div><i>—</i><b>참여 내역</b><em>아직 참여자가 없습니다.</em></div>';
    return `<summary><span>${label}</span><b>${fmt(bettors.length)}명 보기</b></summary><div class="cp2-ledger-list">${rows}</div>`;
  }

  function historyResult(event) {
    const selected = Number(event.myBet?.option_id || 0);
    const result = Number(event.result_option_id || 0);
    const chosenLabel = (event.options || []).find(option => Number(option.id) === selected)?.label || '선택 없음';
    const resultLabel = event.status === 'REFUNDED'
      ? '무효 처리'
      : (event.options || []).find(option => Number(option.id) === result)?.label || '결과 대기';
    const payout = Number(event.myBet?.payout || 0);
    const settlement = event.myBet?.status === 'REFUNDED'
      ? `${fmt(payout)} COIN 환불`
      : event.myBet?.status === 'SETTLED'
        ? payout > 0 ? `+${fmt(payout)} COIN` : '미적중'
        : '정산 대기';
    return `<div class="cp2-history-result">
      <div><span>MY PREDICTION</span><strong>${esc(chosenLabel)}</strong></div>
      <div><span>FINAL RESULT</span><strong>${esc(resultLabel)}</strong></div>
      <div><span>SETTLEMENT</span><strong>${settlement}</strong></div>
    </div>`;
  }

  function boardMarkup(event) {
    const mine = event.myBet;
    const ownerUnlimited = state?.settings?.ownerUnlimited === true;
    const currentAmount = Number(mine?.amount || 0);
    const walletCoin = Math.max(0, Number(state?.walletCoin || 0));
    const policyMax = Number(event.max_bet || USER_MAX_BET_PER_EVENT);
    const max = ownerUnlimited ? currentAmount + walletCoin : policyMax;
    const remaining = ownerUnlimited ? walletCoin : Math.max(0, policyMax - currentAmount);
    const open = event.status === 'OPEN' && state?.settings?.enabled !== false;
    const canAdd = remaining >= MIN_BET;
    const selectedId = Number(mine?.option_id || selectedOptions.get(Number(event.id)) || 0);
    if (mine?.option_id) selectedOptions.set(Number(event.id), Number(mine.option_id));
    const selectedLabel = (event.options || []).find(option => Number(option.id) === selectedId)?.label || '예측 항목을 선택하세요';
    const eventCode = `MATCH ${event.id} / ${event.status === 'OPEN' ? 'LIVE' : event.status || 'ARCHIVE'}`;
    const countdown = event.status === 'OPEN'
      ? `<strong data-cp-countdown data-cp-end="${esc(event.closes_at || '')}">${esc(eventTime(event))}</strong>`
      : `<strong>${esc(eventStatus(event))}</strong>`;
    const options = (event.options || []).map((option, index) => optionMarkup(event, option, index, selectedId)).join('');
    const isHistory = listView === 'history';

    return `<article class="cp2-board ${isHistory ? 'cp2-history-mode' : ''}" data-cp-event="${event.id}" data-cp-current="${currentAmount}" data-cp-max-total="${max}" data-cp-unlimited="${ownerUnlimited ? '1' : '0'}" data-cp-selected="${selectedId}">
      <header class="cp2-board-head">
        <div class="cp2-board-title">
          <div class="cp2-statusline"><span class="cp2-live">${esc(eventStatus(event))}</span><span class="cp2-match-code">${esc(eventCode)}</span></div>
          <h3>${esc(event.title)}</h3>
          <p>${esc(event.description || '결과를 예측하고 게임 코인으로 참여하세요.')}</p>
        </div>
        <section class="cp2-match-stats" aria-label="경기 현황">
          <div class="cp2-stat is-timer"><span>${isHistory ? 'EVENT STATUS' : 'CLOSES IN'}</span>${countdown}<small>${isHistory ? '24시간 보존' : 'KST 기준'}</small></div>
          <div class="cp2-stat is-pool"><span>TOTAL COIN POOL</span><strong>${fmt(event.total_pool)}</strong><small>COIN · ${fmt(event.participant_count)} PLAYERS</small></div>
        </section>
      </header>

      <section class="cp2-options-area">
        <header class="cp2-options-head">
          <div><span class="cp2-section-label">${isHistory ? 'FINAL BOARD' : 'PREDICTION BOARD'}</span><h4>${isHistory ? '경기 결과 및 배당' : '예측 항목 선택'}</h4></div>
          <p>${isHistory ? '종료 시점의 참여 금액과 정산 결과입니다.' : '최초 선택 항목은 변경하거나 취소할 수 없습니다.'}</p>
        </header>
        <div class="cp2-option-grid">${options}</div>
        <details class="cp2-ledger" data-cp-ledger>${ledgerBody(event, selectedId)}</details>
      </section>

      ${isHistory ? `<section class="cp2-bet-console"><div class="cp2-bet-summary"><span>ARCHIVED PREDICTION</span><b>${esc(selectedLabel)}</b><em>참여 ${fmt(currentAmount)} COIN</em></div><div class="cp2-entry">${historyResult(event)}</div></section>` : ''}
      ${!isHistory && (mine || (open && canAdd)) ? `<section class="cp2-bet-console">
        <div class="cp2-bet-summary"><span>MY PREDICTION</span><b data-cp-selected-label>${esc(selectedLabel)}</b><em>${mine ? `누적 ${fmt(currentAmount)} · ${canAdd ? `추가 가능 ${fmt(remaining)} COIN` : ownerUnlimited ? '보유 코인 부족' : '최대 참여 완료'}` : '항목 선택 후 참여 금액을 입력하세요.'}</em></div>
        ${open && canAdd ? `<div class="cp2-entry">
          <div class="cp2-quick"><button type="button" data-cp-quick="100000">10만</button><button type="button" data-cp-quick="500000">50만</button><button type="button" data-cp-quick="1000000">100만</button><button type="button" data-cp-quick="${remaining}">${ownerUnlimited ? '보유 전액' : '잔여 전액'}</button></div>
          <input type="number" min="100000" max="${remaining}" step="100000" placeholder="${ownerUnlimited ? 'OWNER 자유 베팅' : mine ? '추가 참여' : '참여'} 코인 입력" aria-label="참여 코인">
          <button type="button" class="cp2-submit" data-cp-submit="${event.id}" disabled>${mine ? '추가 참여' : '예측 확정'}</button>
        </div>` : ''}
      </section>` : ''}
    </article>`;
  }

  function paginationMarkup() {
    const navigation = state?.navigation || {};
    const page = Math.max(1, Number(navigation.page || 1));
    const totalPages = Math.max(1, Number(navigation.totalPages || 1));
    if (totalPages <= 1) return '';
    const first = Math.max(1, Math.min(page - 2, totalPages - 4));
    const last = Math.min(totalPages, first + 4);
    const pages = [];
    for (let value = first; value <= last; value += 1) {
      pages.push(`<button type="button" data-cp-page="${value}" class="${value === page ? 'active' : ''}" aria-current="${value === page ? 'page' : 'false'}">${value}</button>`);
    }
    return `<button type="button" data-cp-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>이전</button>${pages.join('')}<button type="button" data-cp-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>다음</button>`;
  }

  function view() {
    return `<section class="cp2-shell">
      <header class="cp2-commandbar">
        <div class="cp2-brand"><i class="cp2-brand-mark" aria-hidden="true"></i><div class="cp2-brand-copy"><small class="cp2-eyebrow">SOOPKETMON / PREDICTION EXCHANGE</small><h1>코인 승부예측</h1><p>진행 중인 경기를 선택하고 결과를 예측하세요.</p></div></div>
        <nav class="cp2-view-tabs" aria-label="승부예측 경기 분류">
          <button type="button" class="is-active" data-cp-view="active" aria-pressed="true"><span>진행 중</span><small>LIVE MATCH</small><b id="cpActiveCount">0</b></button>
          <button type="button" data-cp-view="history" aria-pressed="false"><span>종료된 경기</span><small>24H ARCHIVE</small><b id="cpHistoryCount">0</b></button>
        </nav>
        <section class="cp2-account" aria-label="내 승부예측 현황"><div><span>MY COIN</span><strong id="cpWallet">—</strong></div><div id="cpDailyChampion">${championInline(null)}</div></section>
      </header>

      <div class="cp2-stage">
        <header class="cp2-stage-head"><div><small class="cp2-eyebrow">PREDICTION OPERATIONS</small><h2 id="cpStageTitle">오늘의 승부를 선택하십시오</h2><p id="cpStageCopy">경기 목록과 선택 경기 정보를 분리해 많은 경기도 빠르게 탐색할 수 있습니다. 항목 선택부터 금액 확정까지 한 화면에서 완료됩니다.</p></div><div class="cp2-ruleline" id="cpRuleLine"><span>10% FEE</span><span>100,000 MIN</span><span>100,000,000 MAX</span></div></header>
        <section class="cp2-workspace">
          <aside class="cp2-match-rail" aria-label="경기 목록"><header class="cp2-rail-head"><div><span id="cpRailEyebrow">LIVE QUEUE</span><b id="cpRailTitle">진행 중인 경기</b></div><button class="cp2-sync" data-cp-refresh type="button" aria-label="새로고침">↻</button></header><div class="cp2-match-list" id="cpMatchList"><div class="cp2-rail-loading">불러오는 중...</div></div><footer class="cp2-rail-foot"><b>자동 갱신 중</b><small>현재 페이지 데이터만 주기적으로 갱신합니다. 불필요한 추가 조회는 발생하지 않습니다.</small></footer></aside>
          <div id="cpBoardHost" class="cp2-board-host"><div class="cp2-loading">승부예측 현황을 불러오는 중...</div></div>
        </section>
        <nav id="cpPagination" class="cp2-pagination" aria-label="승부예측 페이지"></nav>
        <footer class="cp2-notice"><span>숲켓몬 코인은 현금·환전 가치가 없는 게임 내 가상 재화입니다.</span><button type="button" data-cp-terms>이용 규정</button></footer>
      </div>
    </section>`;
  }

  async function load(nextView = listView, nextPage = listPage) {
    const requestedView = nextView === 'history' ? 'history' : 'active';
    const requestedPage = Math.max(1, Number(nextPage || 1));
    try {
      state = await api(`coin-prediction/state?view=${requestedView}&page=${requestedPage}`, {}, { replaceInflight: true });
      listView = state?.navigation?.view || requestedView;
      listPage = Number(state?.navigation?.page || requestedPage);
      render();
    } catch (error) {
      const host = document.getElementById('cpBoardHost');
      if (host) host.innerHTML = `<div class="cp2-empty"><b>LOAD FAILED</b><span>${esc(error.message)}</span></div>`;
    }
  }

  function render() {
    if (!state) return;
    listView = state.navigation?.view === 'history' ? 'history' : 'active';
    listPage = Math.max(1, Number(state.navigation?.page || 1));
    const events = currentEvents();
    const counts = state.navigation?.counts || {};
    const paused = listView === 'active' && state.settings?.enabled === false;
    const ownerUnlimited = state.settings?.ownerUnlimited === true;
    const ledgerWasOpen = Boolean(document.querySelector('[data-cp-ledger][open]'));

    if (!events.some(event => Number(event.id) === Number(selectedEventId))) selectedEventId = Number(events[0]?.id || 0);

    const wallet = document.getElementById('cpWallet');
    if (wallet) wallet.textContent = `${fmt(state.walletCoin)} COIN`;
    const champion = document.getElementById('cpDailyChampion');
    if (champion) champion.innerHTML = championInline(state.settings?.todayChampion || null);
    const ruleLine = document.getElementById('cpRuleLine');
    if (ruleLine) ruleLine.innerHTML = `<span>10% FEE</span><span>100,000 MIN</span><span>${ownerUnlimited ? 'OWNER UNLIMITED' : '100,000,000 MAX'}</span>`;

    document.querySelectorAll('[data-cp-view]').forEach(button => {
      const active = button.dataset.cpView === listView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const activeCount = document.getElementById('cpActiveCount');
    const historyCount = document.getElementById('cpHistoryCount');
    if (activeCount) activeCount.textContent = fmt(counts.active);
    if (historyCount) historyCount.textContent = fmt(counts.history);

    const stageTitle = document.getElementById('cpStageTitle');
    const stageCopy = document.getElementById('cpStageCopy');
    const railEyebrow = document.getElementById('cpRailEyebrow');
    const railTitle = document.getElementById('cpRailTitle');
    if (stageTitle) stageTitle.textContent = listView === 'history' ? '최근 종료 경기를 확인하십시오' : '오늘의 승부를 선택하십시오';
    if (stageCopy) stageCopy.textContent = listView === 'history' ? '종료 후 24시간 동안 결과와 내 베팅·정산 내역을 확인할 수 있습니다.' : '경기 목록과 선택 경기 정보를 분리해 많은 경기도 빠르게 탐색할 수 있습니다. 항목 선택부터 금액 확정까지 한 화면에서 완료됩니다.';
    if (railEyebrow) railEyebrow.textContent = listView === 'history' ? '24H ARCHIVE' : 'LIVE QUEUE';
    if (railTitle) railTitle.textContent = listView === 'history' ? `종료된 경기 ${fmt(events.length)}` : `진행 중인 경기 ${fmt(events.length)}`;

    const list = document.getElementById('cpMatchList');
    const host = document.getElementById('cpBoardHost');
    const empty = listView === 'history'
      ? '<div class="cp2-empty"><b>24H ARCHIVE</b><span>최근 24시간 내 종료된 경기가 없습니다.</span></div>'
      : '<div class="cp2-empty"><b>NEXT PREDICTION</b><span>현재 진행 중인 승부예측이 없습니다.</span></div>';
    if (list) list.innerHTML = events.length ? events.map(matchItem).join('') : '<div class="cp2-rail-empty">표시할 경기가 없습니다.</div>';
    if (host) host.innerHTML = paused
      ? '<div class="cp2-empty"><b>OPERATION PAUSED</b><span>현재 승부예측 참여가 일시 중지되었습니다.</span></div>'
      : events.length ? boardMarkup(events.find(event => Number(event.id) === Number(selectedEventId)) || events[0]) : empty;

    const pagination = document.getElementById('cpPagination');
    if (pagination) pagination.innerHTML = paginationMarkup();
    if (ledgerWasOpen) document.querySelector('[data-cp-ledger]')?.setAttribute('open', '');
    bindRendered(events);
    updateClocks();
  }

  function bindRendered(events) {
    document.querySelectorAll('[data-cp-event-select]').forEach(button => {
      button.addEventListener('click', () => {
        selectedEventId = Number(button.dataset.cpEventSelect || 0);
        render();
      });
    });

    const refreshButton = document.querySelector('[data-cp-refresh]');
    if (refreshButton) refreshButton.onclick = event => {
      if (busy) return;
      event.currentTarget.classList.add('is-spinning');
      load(listView, listPage).finally(() => event.currentTarget?.classList.remove('is-spinning'));
    };

    document.querySelectorAll('[data-cp-page]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const page = Number(button.dataset.cpPage || 1);
        const host = document.getElementById('cpBoardHost');
        if (host) host.innerHTML = '<div class="cp2-loading">경기 기록을 불러오는 중...</div>';
        load(listView, page);
      });
    });

    const board = document.querySelector('.cp2-board[data-cp-event]');
    if (!board) return;
    const event = events.find(item => Number(item.id) === Number(board.dataset.cpEvent));
    if (!event) return;
    let option = Number(board.dataset.cpSelected || 0);
    const input = board.querySelector('input');
    const submit = board.querySelector('[data-cp-submit]');
    const current = Number(board.dataset.cpCurrent || 0);
    const max = Number(board.dataset.cpMaxTotal || USER_MAX_BET_PER_EVENT);
    const unlimited = board.dataset.cpUnlimited === '1';

    board.querySelectorAll('.cp2-choice:not(:disabled)').forEach(button => {
      button.addEventListener('click', () => {
        option = Number(button.dataset.cpOption || 0);
        selectedOptions.set(Number(event.id), option);
        board.dataset.cpSelected = String(option);
        board.querySelectorAll('.cp2-choice').forEach(choice => {
          const active = choice === button;
          choice.classList.toggle('is-selected', active);
          choice.setAttribute('aria-pressed', String(active));
        });
        const label = board.querySelector('[data-cp-selected-label]');
        if (label) label.textContent = event.options.find(item => Number(item.id) === option)?.label || '예측 항목을 선택하세요';
        const ledger = board.querySelector('[data-cp-ledger]');
        if (ledger) ledger.innerHTML = ledgerBody(event, option);
        if (submit) submit.disabled = !Number(input?.value);
      });
    });

    board.querySelectorAll('[data-cp-quick]').forEach(button => {
      button.addEventListener('click', () => {
        if (!input) return;
        input.value = String(Math.min(Number(button.dataset.cpQuick || 0), max - current));
        if (submit && option) submit.disabled = false;
      });
    });

    input?.addEventListener('input', () => {
      if (submit) submit.disabled = !option || !Number(input.value);
    });

    submit?.addEventListener('click', async clickEvent => {
      if (busy) return;
      const button = clickEvent.currentTarget;
      const eventId = Number(button.dataset.cpSubmit || 0);
      const amount = Number(input?.value || 0);
      if (!option) return alert('예측 항목을 선택하세요.');
      if (!Number.isSafeInteger(amount) || amount < MIN_BET || amount + current > max) {
        return alert(unlimited
          ? `최소 10만 코인이며 보유 코인 내에서 참여할 수 있습니다.\n현재 보유: ${fmt(state.walletCoin)}코인`
          : `최소 10만 코인이며 이벤트 누적 최대는 1억 코인입니다.\n현재 참여: ${fmt(current)}코인`);
      }
      if (!termsAccepted && !await showTerms(true)) return;
      if (!confirm(`${fmt(amount)}코인을 ${current ? '추가로 ' : ''}참여할까요?\n최초 선택 항목은 변경하거나 취소할 수 없습니다.`)) return;
      busy = true;
      button.disabled = true;
      try {
        const result = await betRequest({ eventId, optionId: option, amount, requestId: crypto.randomUUID() });
        if (result.state) {
          state = result.state;
          render();
        } else {
          await load();
        }
      } catch (error) {
        alert(error.message);
      } finally {
        busy = false;
        if (button.isConnected) button.disabled = false;
      }
    });
  }

  function updateClocks() {
    document.querySelectorAll('[data-cp-countdown][data-cp-end]').forEach(node => {
      const end = Date.parse(node.dataset.cpEnd || '');
      if (!Number.isFinite(end)) return;
      node.textContent = formatTime(Math.max(0, end - Date.now()));
    });
  }

  function showTerms(confirmMode = false) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal');
      if (!modal) return resolve(false);
      modal.className = 'modal show cp-terms-modal';
      modal.innerHTML = `<section><button class="cp-terms-x">×</button><small>SOOPKETMON POLICY</small><h2>${esc(state?.terms?.title || '코인 승부예측 이용 규정')}</h2><div>${(state?.terms?.items || []).map((item, index) => `<p><b>${String(index + 1).padStart(2, '0')}</b><span>${esc(item)}</span></p>`).join('')}</div><label><input type="checkbox"> 위 내용을 확인했으며 숲켓몬 코인에 현금·환전 가치가 없음을 이해했습니다.</label><button class="cp-terms-ok" ${confirmMode ? 'disabled' : ''}>${confirmMode ? '동의하고 계속' : '확인'}</button></section>`;
      const close = value => {
        modal.className = 'modal';
        modal.innerHTML = '';
        resolve(value);
      };
      modal.querySelector('.cp-terms-x').onclick = () => close(false);
      const check = modal.querySelector('input');
      const ok = modal.querySelector('.cp-terms-ok');
      check.onchange = () => { ok.disabled = confirmMode && !check.checked; };
      ok.onclick = () => {
        if (check.checked) termsAccepted = true;
        close(!confirmMode || check.checked);
      };
    });
  }

  function bind() {
    document.querySelector('[data-cp-terms]')?.addEventListener('click', () => showTerms(false));
    document.querySelectorAll('[data-cp-view]').forEach(button => {
      button.addEventListener('click', () => {
        const next = button.dataset.cpView === 'history' ? 'history' : 'active';
        if (next === listView) return;
        listView = next;
        listPage = 1;
        selectedEventId = 0;
        const host = document.getElementById('cpBoardHost');
        if (host) host.innerHTML = '<div class="cp2-loading">경기 목록을 전환하는 중...</div>';
        load(listView, 1);
      });
    });
    load();
    clearInterval(timer);
    clearInterval(pollTimer);
    updateClocks();
    timer = setInterval(updateClocks, 1000);
    pollTimer = setInterval(() => {
      if (!document.hidden && !busy && !document.querySelector('.cp2-shell input:focus') && !document.querySelector('.cp-terms-modal')) load(listView, listPage);
    }, Math.max(15, Number(state?.settings?.pollSeconds || 15)) * 1000);
  }

  window.coinPredictionView = view;
  window.bindCoinPredictionView = bind;
  window.stopCoinPredictionView = () => {
    clearInterval(timer);
    clearInterval(pollTimer);
  };
})();
