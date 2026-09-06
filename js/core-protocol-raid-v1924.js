(() => {
  'use strict';

  const VERSION = '3.2.0-yhwach-v2048';
  const TAB_KEY = 'cnine:raid-content-v1924';
  const OP_NAMES = { BREAK: '파쇄', BLOCK: '차단', STABILIZE: '안정화', FINAL: '최종 보스' };
  const esc = value => String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );
  const number = value => Math.max(0, Number(value) || 0);
  const percent = (value, max) => Math.max(0, Math.min(100, number(value) / Math.max(1, number(max)) * 100));
  const requestId = () => globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);
  const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const bridge = () => globalThis.CNineCoreRaidBridge || null;

  let data = null;
  let feature = null;
  let busy = false;
  let selectedOperation = 'BREAK';
  let viewedRoomId = '';
  let activeTab = sessionStorage.getItem(TAB_KEY) === 'core' ? 'core' : 'world';
  let pollTimer = null;
  let lastError = null;

  async function api(path, options = {}) {
    if (!bridge()?.apiRequest) throw new Error('붕괴 코어 레이드 연결 모듈을 불러오지 못했습니다.');
    return bridge().apiRequest(path, options, { ttl: 0, replaceInflight: true });
  }

  async function loadFeature() {
    feature = await api('raid/core/feature');
    const tab = document.getElementById('coreRaidTab');
    const visible = feature?.visible === true;
    if (tab) {
      tab.hidden = !visible;
      tab.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    return feature;
  }

  function stopPoll() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePoll() {
    stopPoll();
    if (activeTab !== 'core' || document.hidden) return;
    pollTimer = setTimeout(() => load().catch(error => console.warn('[CORE RAID] poll failed', error)), 5000);
  }

  function setBusy(next) {
    busy = Boolean(next);
    document.querySelectorAll('#pveCoreRaidView button').forEach(button => {
      button.disabled = busy || button.dataset.coreLocked === '1';
    });
  }

  function remainingText(value) {
    const ms = Math.max(0, Date.parse(value || 0) - Date.now());
    if (!ms) return '00:00';
    const total = Math.ceil(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function orbGauge(kind, label, value, max, selectable, balance = {}) {
    const operation = kind.toUpperCase();
    const current = number(value);
    const target = Math.max(1, number(max));
    const ratio = percent(current, target);
    const ready = current >= target;
    const selected = selectedOperation === operation;
    const recommended = (balance.recommendedOperations || []).includes(operation);
    const risk = (balance.riskOperations || []).includes(operation);
    const attributes = selectable && !ready
      ? ' role="button" tabindex="0" data-core-operation="' + esc(operation) + '"'
      : '';
    return '<article class="core-orb-card is-' + esc(kind) +
      (ready ? ' is-ready' : '') +
      (selected && selectable && !ready ? ' is-selected' : '') +
      (recommended && !ready ? ' is-recommended' : '') +
      (risk && !ready ? ' is-risk' : '') +
      '"' + attributes +
      ' aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="' + target +
      '" aria-valuenow="' + current + '">' +
      '<div class="core-orb-ring" style="--core-angle:' + (ratio * 3.6).toFixed(2) + 'deg">' +
      '<div class="core-orb-center"><strong>' + Math.round(ratio) + '<small>%</small></strong></div></div>' +
      '<footer><em>' + (ready ? 'CORE DOWN' : risk ? 'OVERLOAD RISK' : selected && selectable ? 'TARGET LOCK' : recommended ? 'BALANCE TARGET' : 'IN PROGRESS') +
      '</em><b>' + esc(label) + '</b><span>' + current.toLocaleString() + ' / ' + target.toLocaleString() +
      '</span></footer></article>';
  }

  function coreBalanceMarkup(current, settings = {}) {
    const scores = current.coreScores || {};
    const target = Math.max(1, number(current.coreTarget || settings.coreRequired));
    const values = ['BREAK', 'BLOCK', 'STABILIZE'].map(key => number(scores[key]));
    const fallbackSpread = Math.max(...values) - Math.min(...values);
    const fallbackTolerance = Math.max(1, Math.ceil(target * number(settings.coreBalanceTolerancePercent || 34) / 100));
    const balance = current.coreBalance || {
      spread: fallbackSpread,
      tolerance: fallbackTolerance,
      stabilityPercent: Math.max(0, Math.round((1 - fallbackSpread / fallbackTolerance) * 100)),
      status: fallbackSpread === 0 ? 'SYNCHRONIZED' : fallbackSpread <= fallbackTolerance ? 'STABLE' : 'UNSTABLE',
      recommendedOperations: ['BREAK', 'BLOCK', 'STABILIZE'].filter(key => number(scores[key]) === Math.min(...values))
    };
    const stability = Math.max(0, Math.min(100, number(balance.stabilityPercent)));
    const recommendations = (balance.recommendedOperations || []).map(key => OP_NAMES[key]).filter(Boolean);
    const label = balance.status === 'SYNCHRONIZED'
      ? '완전 동기화'
      : balance.status === 'UNSTABLE' ? '균형 복구 필요' : '공명 안정';
    return '<section class="core-balance-console is-' + esc(String(balance.status || 'STABLE').toLowerCase()) +
      '" style="--balance-angle:' + (stability * 3.6).toFixed(2) + 'deg">' +
      '<div class="core-balance-dial"><i><span><small>BALANCE</small><strong>' + Math.round(stability) +
      '<em>%</em></strong></span></i></div><div class="core-balance-readout"><small>TRIPLE CORE RESONANCE</small><b>' +
      label + '</b><span>현재 편차 ' + number(balance.spread).toLocaleString() + ' · 허용 편차 ' +
      number(balance.tolerance).toLocaleString() + '</span><em>다음 권장 코어 · ' +
      esc(recommendations.join(' / ') || '동기화 완료') + '</em></div></section>';
  }

  function partyHpMarkup(current) {
    const hp = number(current.partyHp);
    const max = Math.max(1, number(current.partyMaxHp));
    const ratio = percent(hp, max);
    return '<section class="core-party-integrity" style="--party-hp:' + ratio.toFixed(2) + '%">' +
      '<header><span><small>EXPEDITION INTEGRITY</small><b>공대 HP</b></span>' +
      '<strong>' + hp.toLocaleString() + ' / ' + max.toLocaleString() + '</strong></header>' +
      '<i><u></u></i><p>전투 또는 입력 기믹 실패 시 공대 HP가 감소합니다. 0이 되면 공략 실패입니다.</p></section>';
  }

  function roomListMarkup(state) {
    const rooms = Array.isArray(state.rooms) ? state.rooms : [];
    const ticket = state.entry || {};
    return '<section class="core-room-browser">' +
      '<article class="core-room-create">' +
      '<small>EXPEDITION HOST ACCESS</small><h3>붕괴 코어 공대 생성</h3>' +
      '<p>공대장만 입장권 1장을 사용합니다. 참가자는 입장권 없이 합류합니다.</p>' +
      '<div class="core-room-ticket"><img src="' + esc(ticket.ticketImage || '/assets/items/core-raid-entry-ticket-v1.png') +
      '" alt=""><span>' + esc(ticket.ticketName || '붕괴 코어 입장권') + '</span>' +
      '<strong>보유 ' + number(ticket.quantity).toLocaleString() + '장</strong></div>' +
      '<button type="button" data-core-action="open" ' +
      (number(ticket.quantity) < number(ticket.required || 1) ? 'data-core-locked="1" disabled' : '') +
      '>입장권 1장으로 공대 생성</button></article>' +
      '<article class="core-room-list"><header><span><small>OPEN EXPEDITIONS</small><b>참가 가능한 공대</b></span>' +
      '<button type="button" data-core-action="browse">새로고침</button></header>' +
      (rooms.length
        ? '<div>' + rooms.map(room =>
            '<button type="button" class="core-room-row" data-core-action="join" data-room-id="' + esc(room.id) + '">' +
            '<span><small>ROOM ' + esc(room.code) + '</small><b>붕괴 코어 공대</b></span>' +
            '<em>' + number(room.participantCount) + ' / ' + number(room.maxParticipants) + '명</em>' +
            '<strong>' + remainingText(room.lobbyEndsAt) + '</strong></button>'
          ).join('') + '</div>'
        : '<p class="core-room-empty">현재 대기 중인 공대가 없습니다. 새 공대를 생성할 수 있습니다.</p>') +
      '</article></section>';
  }

  function memberMarkup(state) {
    const rows = Array.isArray(state.participants) ? state.participants : [];
    return '<aside class="core-panel core-member-panel"><header><div><small>EXPEDITION MEMBERS</small>' +
      '<b>공대원 현황</b></div><span>' + rows.length + '명</span></header><div class="core-ranking">' +
      (rows.length
        ? rows.slice(0, 20).map((row, index) =>
            '<div class="core-rank-row"><i>' + (index + 1) + '</i><span><b>' +
            esc(row.nickname || 'MEMBER ' + (index + 1)) + (row.isMe ? ' · 나' : '') +
            '</b><small>도전 ' + number(row.attemptCount) + ' · 성공 ' + number(row.successCount) +
            ' · 실패 ' + number(row.failureCount) + '</small></span><strong>' +
            number(row.totalBossDamage).toLocaleString() + '</strong></div>'
          ).join('')
        : '<div class="core-rank-empty">공대원이 없습니다.</div>') +
      '</div></aside>';
  }

  function lobbyActionMarkup(state) {
    const current = state.current;
    const isHost = Number(current.hostUserId) === Number(state.me?.userId);
    const ready = number(current.participantCount) >= number(current.minParticipants);
    return '<section class="core-lobby-command"><div><small>ROOM ' + esc(current.code) + '</small>' +
      '<h3>공대 집결 중</h3><p>남은 모집 시간 ' + remainingText(current.lobbyEndsAt) +
      ' · ' + number(current.participantCount) + ' / ' + number(current.maxParticipants) + '명</p></div>' +
      (isHost
        ? '<button type="button" data-core-action="start" ' +
          (!ready ? 'data-core-locked="1" disabled' : '') + '>공대 작전 시작</button>'
        : '<button type="button" data-core-action="reload">공대장 시작 대기</button>') +
      '</section>';
  }

  function coreActionMarkup(state) {
    const current = state.current;
    const pending = state.pendingAttempt;
    const target = OP_NAMES[selectedOperation] || '파쇄';
    const balance = current.coreBalance || {};
    const risk = (balance.riskOperations || []).includes(selectedOperation);
    if (pending) {
      return '<section class="core-action"><div><small>PENDING ATTEMPT</small><b>' +
        esc(OP_NAMES[pending.operation] || '공략') + ' 전투 재개</b>' +
        '<span>서버에 보존된 미완료 전투를 이어서 진행합니다.</span></div>' +
        '<button type="button" data-core-action="battle">전투 재개</button></section>';
    }
    return '<section class="core-action' + (risk ? ' is-risk' : '') + '"><div><small>' +
      (risk ? 'RESONANCE OVERLOAD WARNING' : 'REPEATED CORE ASSAULT') + '</small><b>' +
      esc(target) + ' 코어 공략</b><span>제한 시간 ' + remainingText(current.endsAt) +
      (risk
        ? ' · 앞선 코어를 더 밀면 진척도가 무효화되고 공대 HP가 ' + number(state.settings?.coreImbalanceDamage) + ' 감소합니다.'
        : ' · 낮은 코어부터 맞춰 세 코어의 공명 편차를 유지하십시오.') + '</span></div>' +
      '<button type="button" data-core-action="battle">선택 코어 출전</button></section>';
  }

  function bossActionMarkup(state) {
    const current = state.current;
    const pending = state.pendingAttempt;
    return '<section class="core-action is-final"><div><small>FINAL BOSS ASSAULT</small><b>' +
      (pending ? '최종 보스 전투 재개' : esc(current.bossName || state.settings?.bossName || '유하바하') + ' 반복 공략') + '</b><span>남은 시간 ' +
      remainingText(current.endsAt) + ' · 전투와 두 입력 기믹을 모두 성공해야 피해가 누적됩니다.</span></div>' +
      '<button type="button" data-core-action="battle">' + (pending ? '전투 재개' : '최종 보스 출전') +
      '</button></section>';
  }

  function terminalMarkup(state) {
    const current = state.current;
    const clear = current.status === 'CLEAR';
    let reward = '';
    if (clear && state.me?.rewardStatus === 'COMPLETED') {
      reward = '<button type="button" data-core-action="browse">보상 수령 완료 · 방 목록</button>';
    } else if (clear && current.rewardLocked) {
      reward = '<button type="button" data-core-action="browse">테스트 보상 잠금 · 방 목록</button>';
    } else if (clear) {
      reward = '<button type="button" data-core-action="claim">공대 보상 수령</button>';
    } else {
      reward = '<button type="button" data-core-action="browse">새 공대 찾기</button>';
    }
    const reason = {
      PARTY_WIPE: '공대 HP가 모두 소진되었습니다.',
      TIME_LIMIT: '제한 시간이 종료되었습니다.',
      LOBBY_EXPIRED: '모집 시간이 종료되었습니다.'
    }[current.failureReason] || '작전이 종료되었습니다.';
    return '<section class="core-terminal ' + (clear ? 'is-clear' : 'is-failed') + '">' +
      '<small>' + (clear ? 'CORE PROTOCOL COMPLETE' : 'EXPEDITION FAILED') + '</small>' +
      '<h3>' + (clear ? '붕괴 코어 완전 제압' : '공대 작전 실패') + '</h3>' +
      '<p>' + esc(clear ? '세 코어와 최종 보스를 제한 시간 안에 제압했습니다.' : reason) + '</p>' +
      reward + '</section>';
  }

  function battleStageMarkup(state) {
    const current = state.current;
    if (current.status === 'LOBBY') {
      return '<section class="core-command-grid"><article class="core-panel">' +
        lobbyActionMarkup(state) + '</article>' + memberMarkup(state) + '</section>';
    }
    if (current.status === 'CLEAR' || current.status === 'FAILED') {
      return terminalMarkup(state) + memberMarkup(state);
    }
    const coreStage = current.status === 'CORE';
    if (coreStage && number(current.coreScores?.[selectedOperation]) >= number(current.coreTarget)) {
      selectedOperation = (current.coreBalance?.recommendedOperations || []).find(
        operation => number(current.coreScores?.[operation]) < number(current.coreTarget)
      ) || ['BREAK', 'BLOCK', 'STABILIZE'].find(
        operation => number(current.coreScores?.[operation]) < number(current.coreTarget)
      ) || selectedOperation;
    }
    const bossHp = number(current.bossHp);
    const bossMax = Math.max(1, number(current.bossMaxHp));
    return partyHpMarkup(current) +
      (coreStage
        ? '<section class="core-expedition-cores"><header><div><small>TRIPLE CORE NETWORK</small>' +
          '<b>세 코어의 공명 균형을 유지하십시오</b></div><span>남은 시간 ' + remainingText(current.endsAt) + '</span></header>' +
          coreBalanceMarkup(current, state.settings) +
          '<div class="core-triple-orbs">' +
          orbGauge('break', '파쇄 코어', current.coreScores?.BREAK, current.coreTarget, true, current.coreBalance) +
          orbGauge('block', '차단 코어', current.coreScores?.BLOCK, current.coreTarget, true, current.coreBalance) +
          orbGauge('stabilize', '안정화 코어', current.coreScores?.STABILIZE, current.coreTarget, true, current.coreBalance) +
          '</div>' + coreActionMarkup(state) + '</section>'
        : '<section class="core-final-boss" style="--boss-hp:' + percent(bossHp, bossMax).toFixed(2) + '%">' +
          '<header><div><small>FINAL TARGET / APOCALYPSE</small><b>' + esc(current.bossName) + '</b></div>' +
          '<strong>' + percent(bossHp, bossMax).toFixed(1) + '%</strong></header><i><u></u></i>' +
          '<p>' + bossHp.toLocaleString() + ' / ' + bossMax.toLocaleString() + '</p>' +
          bossActionMarkup(state) + '</section>') +
      '<section class="core-command-grid"><article class="core-panel core-rule-panel"><header><div>' +
      '<small>EXPEDITION RULE</small><b>반복 공략 규칙</b></div></header><ol>' +
      '<li>공대장은 입장권 1장으로 방을 생성합니다.</li>' +
      '<li>모든 공대원은 제한 시간 동안 횟수 제한 없이 코어와 보스를 반복 공략합니다.</li>' +
      '<li>전투 승리·방향 입력·연타 입력을 모두 성공해야 진척도가 반영됩니다.</li>' +
      '<li>세 코어의 편차가 허용 범위를 넘지 않게 낮은 코어부터 교대로 공략해야 합니다.</li>' +
      '<li>앞선 코어를 과충전하면 해당 진척도는 무효이며 공대 HP가 ' + number(state.settings?.coreImbalanceDamage) + ' 감소합니다.</li>' +
      '<li>실패할 때마다 공대 HP가 ' + number(state.settings?.mechanicFailureDamage) + ' 감소합니다.</li>' +
      '</ol></article>' + memberMarkup(state) + '</section>';
  }

  function render() {
    const root = document.getElementById('pveCoreRaidView');
    if (!root || root.hidden) return;
    if (lastError) {
      root.innerHTML = '<section class="core-raid core-raid-error"><small>CORE PROTOCOL LINK ERROR</small>' +
        '<h2>붕괴 코어 작전을 불러오지 못했습니다.</h2><p>' + esc(lastError.message || lastError) +
        '</p><button type="button" data-core-action="reload">다시 시도</button></section>';
      bindActions();
      return;
    }
    if (!data) {
      root.innerHTML = '<section class="core-raid core-raid-loading"><i></i><b>심연 관측소와 동기화 중입니다.</b></section>';
      return;
    }
    const settings = data.settings || {};
    const current = data.current;
    const status = current?.status || 'BROWSER';
    const statusLabel = current
      ? current.phaseLabel + ' · ' + (current.endsAt ? remainingText(current.endsAt) : remainingText(current.lobbyEndsAt))
      : '공대 탐색';
    root.innerHTML = '<main class="core-raid core-room-expedition" data-core-raid-version="' + VERSION + '">' +
      '<section class="core-raid-hero"><div class="core-raid-brief"><small>' +
      esc(settings.subtitle || 'ABYSS OBSERVATORY / CORE PROTOCOL') + '</small><h2>' +
      esc(settings.title || '심연 관측소: 붕괴 코어') + '</h2><p>' + esc(settings.description || '') +
      '</p><div class="core-raid-statusline"><span>' +
      (settings.mode === 'TEST' ? 'LIMITED USER TEST' : 'LIVE RAID') + '</span><span>' +
      esc(status + ' · ' + statusLabel) + '</span><span>' +
      (current ? number(current.participantCount) + ' / ' + number(current.maxParticipants) + ' MEMBERS' : 'ROOM EXPEDITION') +
      '</span><span>' + (settings.rewardLocked ? '보상 검수 잠금' : '보상 활성') +
      '</span></div></div><div class="core-raid-boss"><img src="' + esc(settings.bossImage) +
      '" alt="' + esc(settings.bossName) + '"><div class="core-raid-boss-label"><small>CORE ENTITY / RAID BOSS</small><b>' +
      esc(settings.bossName) + '</b></div></div></section>' +
      (current ? battleStageMarkup(data) : roomListMarkup(data)) + '</main>';
    bindActions();
    setBusy(busy);
    schedulePoll();
  }

  async function load(options = {}) {
    lastError = null;
    const browse = options.browse === true;
    const query = browse
      ? '?browse=1'
      : viewedRoomId
        ? '?roomId=' + encodeURIComponent(viewedRoomId)
        : '';
    try {
      data = await api('raid/core/status' + query);
      if (data.current?.id) viewedRoomId = data.current.id;
      if (browse) viewedRoomId = '';
      render();
      return data;
    } catch (error) {
      lastError = error;
      render();
      throw error;
    }
  }

  async function createRoom() {
    setBusy(true);
    try {
      data = await api('raid/core/open', {
        method: 'POST',
        body: JSON.stringify({ requestId: requestId() })
      });
      viewedRoomId = data.current?.id || '';
      render();
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(roomId) {
    setBusy(true);
    try {
      data = await api('raid/core/join', {
        method: 'POST',
        body: JSON.stringify({ roomId })
      });
      viewedRoomId = data.current?.id || roomId;
      render();
    } finally {
      setBusy(false);
    }
  }

  async function startRoom() {
    if (!data?.current?.id) throw new Error('시작할 공대를 찾지 못했습니다.');
    setBusy(true);
    try {
      data = await api('raid/core/start', {
        method: 'POST',
        body: JSON.stringify({ roomId: data.current.id })
      });
      render();
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    const roomId = data?.current?.id;
    if (!roomId) throw new Error('수령할 붕괴 코어 공대를 찾지 못했습니다.');
    setBusy(true);
    try {
      const result = await api('raid/core/claim', {
        method: 'POST',
        body: JSON.stringify({ roomId, requestId: requestId() })
      });
      if (result.user) bridge()?.saveUser?.(bridge()?.apiUserToLocal?.(result.user) || result.user);
      await load();
      return result;
    } finally {
      setBusy(false);
    }
  }

  function mountMechanicResult(stage, resolved) {
    stage.querySelector('.core-v3-mechanic-result')?.remove();
    const success = resolved.personalResult === 'SUCCESS';
    const overload = resolved.outcome?.failureReason === 'CORE_OVERLOAD';
    const verified = resolved.verified || {};
    const node = document.createElement('section');
    node.className = 'core-v3-mechanic-result ' + (success ? 'is-success' : 'is-failure');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.innerHTML = '<small>CORE PROTOCOL / VERIFIED RESULT</small><strong>' +
      (success ? '공략 진척도 전송 완료' : overload ? '코어 공명 과부하' : '멸절 프로토콜 피격') + '</strong><span>전투 ' +
      (resolved.outcome?.engineSuccess ? '승리' : '패배') + ' · 방향 해독 ' +
      (verified.sequence?.success ? '성공' : '실패') + ' · 구속 파쇄 ' +
      (verified.mash?.success ? '성공' : '실패') +
      (success
        ? resolved.outcome?.stage === 'BOSS'
          ? ' · 보스 피해 ' + number(resolved.outcome?.bossDamage).toLocaleString()
          : ' · 코어 진척 +' + number(resolved.outcome?.coreProgress).toLocaleString()
        : overload
          ? ' · 앞선 코어 진척 무효 · 공대 HP -' + number(resolved.outcome?.partyHpDamage).toLocaleString()
          : ' · 공대 HP -' + number(resolved.outcome?.partyHpDamage).toLocaleString()) +
      '</span><button type="button" class="btn core-v3-return">공대 전황으로 돌아가기</button>';
    stage.appendChild(node);
    return node;
  }

  function raidEventMeta(event = {}) {
    const type = String(event.type || '').toUpperCase();
    const operation = OP_NAMES[String(event.operation || '').toUpperCase()] || '코어';
    if (type === 'RAID_PHASE_CHANGE') {
      return { eyebrow: 'CORE PROTOCOL', title: event.label || '공략 단계 전환', detail: '공대 진척도를 서버와 동기화합니다.', tone: 'violet' };
    }
    if (type === 'RAID_WEAKNESS_REVEAL') {
      return {
        eyebrow: 'WEAKNESS ANALYSIS',
        title: event.label || '약점 속성 분석',
        detail: event.matched ? '공명 속성 일치 · 기믹 효율 상승' : '비공명 공격 · 기믹 효율 감소',
        tone: event.matched ? 'success' : ''
      };
    }
    if (type === 'RAID_CORE_BREAK') {
      return { eyebrow: 'CORE SUPPRESSION', title: event.label || operation + ' 코어 타격', detail: '공대 코어 게이지에 진척도를 전송합니다.', tone: 'violet' };
    }
    if (type === 'RAID_STAGGER') {
      return { eyebrow: 'FINAL SUPPRESSION', title: event.label || '멸절 프로토콜 차단', detail: (data?.settings?.bossName || '유하바하') + ' 장시간 그로기 진입', tone: 'success' };
    }
    if (type === 'RAID_PARTY_DAMAGE') {
      return { eyebrow: 'EXPEDITION DAMAGE', title: event.label || '공대 HP 감소', detail: '기믹 실패 피해가 공대 전체에 누적됩니다.', tone: 'danger' };
    }
    return null;
  }

  async function showRaidEvent(event, context = {}) {
    const stage = context.stage;
    const meta = raidEventMeta(event);
    if (!stage || !meta) return false;
    stage.querySelector('.core-v3-event-banner')?.remove();
    const node = document.createElement('aside');
    node.className = 'core-v3-event-banner ' + (meta.tone ? 'is-' + meta.tone : '');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = '<small>' + esc(meta.eyebrow) + '</small><strong>' + esc(meta.title) +
      '</strong><span>' + esc(meta.detail) + '</span>';
    stage.appendChild(node);
    await wait(850);
    node.remove();
    return true;
  }

  async function battle() {
    const roomId = data?.current?.id;
    if (!roomId) throw new Error('진행 중인 붕괴 코어 공대가 없습니다.');
    setBusy(true);
    let renderer = null;
    const modal = document.getElementById('modal');
    try {
      const response = await api('raid/core/battle', {
        method: 'POST',
        body: JSON.stringify({ roomId, operation: selectedOperation })
      });
      await bridge()?.ensureFeatureResources?.('battleV2');
      const live = globalThis.ProjectVBattleV3Live?.prepareLoading?.({
        modal,
        mode: 'RAID',
        playerName: bridge()?.loadUser?.()?.nickname || 'CORE MEMBER',
        opponentName: response.monster?.name || data.settings?.bossName || 'CORE ENTITY',
        autoText: '서버 공략 시드와 V3 입력 타임라인을 동기화합니다.'
      });
      if (!live) throw new Error('V3 붕괴 코어 전장을 준비하지 못했습니다.');
      renderer = await globalThis.playRaidBattleV3Live({
        ...live,
        modal,
        data: response,
        preserveServerTimeline: true,
        onRaidEvent: showRaidEvent,
        onInteractiveEvent: (event, context) => globalThis.ProjectVRaidQteV1924?.run?.(event, context)
      });
      const qte = renderer.getInteractiveResults?.() || {};
      const results = {
        sequence: {
          inputs: qte.SEQUENCE?.inputs || [],
          durationMs: qte.SEQUENCE?.durationMs || 0
        },
        mash: {
          presses: qte.MASH?.presses || [],
          durationMs: qte.MASH?.durationMs || 0
        }
      };
      const status = live.stage.querySelector('#pvBattleStatus');
      if (status) status.textContent = '입력 기록 검증 및 공대 전황 반영 중';
      const resolved = await api('raid/core/resolve', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          attemptId: response.attemptId,
          requestId: requestId(),
          results
        })
      });
      renderer.showResult();
      mountMechanicResult(live.stage, resolved);
      const close = () => {
        try { renderer?.destroy?.(); } catch {}
        modal.__battleV2Renderer = null;
        modal.onclick = null;
        modal.className = 'modal';
        modal.innerHTML = '';
        void load();
      };
      live.stage.querySelector('.core-v3-return')?.addEventListener('click', event => {
        event.stopPropagation();
        close();
      });
    } catch (error) {
      try { renderer?.destroy?.(); } catch {}
      if (modal) {
        modal.__battleV2Renderer = null;
        modal.className = 'modal';
        modal.innerHTML = '';
      }
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function bindActions() {
    document.querySelectorAll('#pveCoreRaidView [data-core-operation]').forEach(node => {
      const select = () => {
        if (busy) return;
        selectedOperation = node.dataset.coreOperation || 'BREAK';
        render();
      };
      node.addEventListener('click', select);
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
    });
    document.querySelectorAll('#pveCoreRaidView [data-core-action]').forEach(button => {
      button.addEventListener('click', async () => {
        if (busy) return;
        try {
          const action = button.dataset.coreAction;
          if (action === 'open') await createRoom();
          else if (action === 'join') await joinRoom(button.dataset.roomId);
          else if (action === 'start') await startRoom();
          else if (action === 'battle') await battle();
          else if (action === 'claim') await claim();
          else if (action === 'browse') {
            viewedRoomId = '';
            await load({ browse: true });
          } else if (action === 'reload') {
            setBusy(true);
            try { await load(); } finally { setBusy(false); }
          }
        } catch (error) {
          alert(error?.message || '붕괴 코어 요청을 처리하지 못했습니다.');
        }
      });
    });
  }

  async function activate(tab = 'world') {
    const previousTab = activeTab;
    activeTab = tab === 'core' && feature?.visible === true ? 'core' : 'world';
    sessionStorage.setItem(TAB_KEY, activeTab);
    const legacy = document.getElementById('pveRaidView');
    const core = document.getElementById('pveCoreRaidView');
    document.querySelectorAll('[data-raid-content]').forEach(button => {
      const selected = button.dataset.raidContent === activeTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (legacy) legacy.hidden = activeTab !== 'world';
    if (core) core.hidden = activeTab !== 'core';
    stopPoll();
    if (activeTab === 'world') {
      if (previousTab === 'core') bridge()?.activateLegacyRaid?.();
      return;
    }
    bridge()?.stopLegacyRaid?.();
    if (!data) render();
    try { await load(); } catch {}
  }

  function wire() {
    const hub = document.getElementById('pveRaidHubView');
    if (!hub) return false;
    hub.querySelectorAll('[data-raid-content]').forEach(button => {
      if (button.dataset.coreRaidBound === '1') return;
      button.dataset.coreRaidBound = '1';
      button.addEventListener('click', () => void activate(button.dataset.raidContent));
    });
    return true;
  }

  async function openActive() {
    if (!wire()) return false;
    try {
      await loadFeature();
    } catch (error) {
      console.warn('[CORE RAID] feature gate unavailable', error);
      feature = { visible: false, accessible: false };
    }
    await activate(activeTab);
    return true;
  }

  function deactivate() {
    stopPoll();
    globalThis.ProjectVRaidQteV1924?.cancel?.();
  }

  // Ignore text/clock/QTE mutations inside an existing raid. Rewire only when
  // navigation replaces the app or the raid mount is actually inserted.
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target.id === 'app' || [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches?.('[data-raid-content]') || node.querySelector?.('[data-raid-content]'))))) wire();
  });
  const appRoot = document.getElementById('app');
  if (appRoot) observer.observe(appRoot, { subtree: true, childList: true });
  addEventListener('load', wire);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPoll();
    else if (activeTab === 'core') void load().catch(() => {});
  });
  globalThis.CoreProtocolRaidV1924 = Object.freeze({
    version: VERSION,
    openActive,
    activate,
    deactivate,
    refresh: load
  });
})();
