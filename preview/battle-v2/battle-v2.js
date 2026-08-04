(() => {
  'use strict';

  const TOKEN_KEY = 'cnine_card_api_token';
  const statusBox = document.getElementById('battleV2Status');
  const arena = document.getElementById('battleV2Arena');
  const fxRoot = document.getElementById('battleV2Fx');
  const message = document.getElementById('battleV2Message');
  const logList = document.getElementById('battleV2LogList');
  const progress = document.getElementById('battleV2Progress');
  const playButton = document.getElementById('battleV2Play');
  const replayButton = document.getElementById('battleV2Replay');
  const rerollButton = document.getElementById('battleV2Reroll');
  const speedSelect = document.getElementById('battleV2Speed');
  const shell = document.getElementById('battleV2App');
  const layoutSelect = document.getElementById('battleV2Layout');
  const layoutBadge = document.getElementById('battleV2LayoutBadge');
  const layoutDetail = document.getElementById('battleV2LayoutDetail');
  const fullscreenButton = document.getElementById('battleV2Fullscreen');
  const openWindowButton = document.getElementById('battleV2OpenWindow');
  const focusRoot = document.getElementById('battleV2Focus');
  const focusMessage = document.getElementById('battleV2FocusMessage');
  const focusSlotA = document.getElementById('focusSlotA');
  const focusSlotB = document.getElementById('focusSlotB');
  const focusRosterA = document.getElementById('focusRosterA');
  const focusRosterB = document.getElementById('focusRosterB');

  const state = {
    data: null,
    cards: new Map(),
    playing: false,
    playToken: 0,
    cursor: 0,
    requestedLayout: 'auto',
    effectiveLayout: 'desktop',
    activeAId: '',
    activeBId: '',
    resizeTimer: 0
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const number = value => Math.round(Number(value || 0)).toLocaleString();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const speed = () => 1.6;

  function encodePathPart(part) {
    if (!part) return '';
    try { return encodeURIComponent(decodeURIComponent(part)); }
    catch { return encodeURIComponent(part); }
  }

  function assetUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return '/assets/ui/cninelogo.png';
    if (/^(?:data:|blob:)/i.test(raw)) return raw;
    raw = raw.replace(/\\/g, '/').replace(/#/g, '%23');
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        url.pathname = url.pathname.split('/').map(encodePathPart).join('/');
        return url.href;
      } catch { return raw; }
    }
    const qIndex = raw.indexOf('?');
    const query = qIndex >= 0 ? raw.slice(qIndex) : '';
    let path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    path = path.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '').replace(/^\/+/, '');
    return `/${path.split('/').map(encodePathPart).join('/')}${query}`;
  }

  window.battleV2ImageFallback = image => {
    if (!image || image.dataset.fallbackApplied === '1') return;
    image.dataset.fallbackApplied = '1';
    image.classList.add('is-fallback');
    image.src = '/assets/ui/cninelogo.png';
  };

  function setStatus(text, error = false) {
    statusBox.textContent = text;
    statusBox.classList.toggle('error', error);
  }

  function isFocusLayout() {
    return state.effectiveLayout !== 'desktop';
  }

  function fighterNodes(id) {
    const key = String(id);
    return [...document.querySelectorAll('.battle-card-v2')].filter(node => node.dataset.fighterId === key || node.dataset.focusFighterId === key);
  }

  function fighterNode(id) {
    const key = String(id);
    if (isFocusLayout()) {
      const focusNode = [...document.querySelectorAll('.battle-card-v2[data-focus-fighter-id]')]
        .find(node => node.dataset.focusFighterId === key && node.offsetParent !== null);
      if (focusNode) return focusNode;
    }
    return [...document.querySelectorAll('.battle-card-v2[data-fighter-id]')]
      .find(node => node.dataset.fighterId === key) || null;
  }

  function fighterState(id) {
    return state.cards.get(String(id)) || null;
  }

  function typeKey(type) {
    return ({ ATTACK: 'attack', DEFENSE: 'defense', HP: 'hp', SPEED: 'speed' })[String(type || '').toUpperCase()] || '';
  }

  function typeIcon(type) {
    return ({ ATTACK: '⚔', DEFENSE: '⬡', HP: '♥', SPEED: '↯', NONE: '◇' })[String(type)] || '◇';
  }

  function uniqueFxMarkup(type) {
    if (type === 'attack') return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-core"></i><i class="unique-fx-arc a1"></i><i class="unique-fx-arc a2"></i><i class="unique-fx-velocity v1"></i><i class="unique-fx-velocity v2"></i><i class="unique-fx-velocity v3"></i><b>ATTACK CORE</b></div>';
    if (type === 'defense') return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-hex"></i><i class="unique-fx-shield"></i><i class="unique-fx-guard-ring"></i><b>BARRIER FIELD</b></div>';
    if (type === 'speed') return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-afterimage a1"></i><i class="unique-fx-afterimage a2"></i><i class="unique-fx-speed-line s1"></i><i class="unique-fx-speed-line s2"></i><i class="unique-fx-speed-line s3"></i><b>VELOCITY</b></div>';
    if (type === 'hp') return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-life-flash"></i><i class="unique-fx-heal-ring"></i><i class="unique-fx-plus p1">＋</i><i class="unique-fx-plus p2">＋</i><i class="unique-fx-plus p3">＋</i><b>LIFE PULSE</b></div>';
    return '';
  }

  function uniqueBadgeHtml(card) {
    const type = typeKey(card.type);
    if (!type || !card.uniqueAbility) return '';
    return `<span class="card-unique-badge unique-type-${type}" title="${escapeHtml(card.uniqueAbility.effectDescription || card.uniqueAbility.effectName || card.typeLabel)}"><i>${typeIcon(card.type)}</i><b>${escapeHtml(card.typeLabel)}</b><small>${escapeHtml(card.uniqueAbility.effectName || '')}</small></span>`;
  }

  function teamSummaryHtml(team, label, side) {
    const summary = team.summary || {};
    const nickname = side === 'A' ? state.data.player.nickname : state.data.opponent.nickname;
    return `<header><div><small>${label}</small><strong>${escapeHtml(nickname)}</strong></div><b>${number(summary.power)}</b></header>
      <dl>
        <div><dt>총 HP</dt><dd>${number(summary.maxHp)}</dd></div>
        <div><dt>총 공격</dt><dd>${number(summary.attack)}</dd></div>
        <div><dt>총 방어</dt><dd>${number(summary.defense)}</dd></div>
        <div><dt>평균 속도</dt><dd>${number(summary.averageSpeed)}</dd></div>
      </dl>`;
  }

  function frameHtml(card) {
    const grade = String(card.grade || 'C').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const level = Math.max(0, Math.min(13, Number(card.breakthroughLevel || 0)));
    const breakthroughClass = level > 0 ? ` breakthrough-${level}` : '';
    return `<div class="card-frame grade-${grade}${breakthroughClass} battle-v2-card-frame">
      ${level > 0 ? `<div class="breakthrough-badge">★${level}</div>` : ''}
      ${uniqueBadgeHtml(card)}
      <div class="card-holo"></div><div class="breakthrough-effect"></div>
      <div class="card-inner">
        <div class="card-header"><span>${escapeHtml(grade)}</span><b>SOOP</b></div>
        <div class="card-art"><img src="${assetUrl(card.image)}" alt="${escapeHtml(card.title)}" style="object-position:${card.focusX}% ${card.focusY}%" onerror="window.battleV2ImageFallback(this)"></div>
        <div class="card-footer"><div><small>${escapeHtml(card.memberName || '')}</small><div class="card-title-row"><div class="card-title">${escapeHtml(card.title)}</div></div></div><img src="/assets/ui/cninelogo.png" class="card-mini-logo" alt="SOOP"></div>
      </div>
    </div>`;
  }

  function cardHtml(card, options = {}) {
    const hpPercent = Math.max(0, Math.min(100, card.hp / Math.max(1, card.maxHp) * 100));
    const shieldPercent = card.maxShield > 0 ? Math.max(0, Math.min(100, card.shield / card.maxShield * 100)) : 0;
    const fxType = typeKey(card.type);
    const idAttribute = options.focus ? `data-focus-fighter-id="${escapeHtml(card.id)}"` : `data-fighter-id="${escapeHtml(card.id)}"`;
    const focusClass = options.focus ? ' focus-battle-card' : '';
    return `<article class="battle-card-v2${focusClass}${fxType ? ` unique-card-fx-host unique-fx-${fxType}` : ''}" ${idAttribute} data-side="${escapeHtml(card.side)}" data-effect-type="${fxType}">
      ${fxType ? uniqueFxMarkup(fxType) : ''}
      <div class="battle-v2-frame-shell">${frameHtml(card)}</div>
      <div class="stat-pills"><span>HP ${number(card.maxHp)}</span><span>ATK ${number(card.attack)}</span><span>DEF ${number(card.defense)}</span><span>SPD ${number(card.speed)}</span></div>
      <div class="hp-stack">
        <div class="hp-caption"><b>${card.row === 'FRONT' ? '전열' : '후열'}</b><span class="hp-value">${number(card.hp)} / ${number(card.maxHp)}</span></div>
        ${card.maxShield > 0 ? `<div class="shield-track"><i style="width:${shieldPercent}%"></i></div>` : ''}
        <div class="hp-track"><i style="width:${hpPercent}%"></i></div>
      </div>
      <div class="gauge-ring" style="--gauge:${Math.max(0, Math.min(100, card.gauge || 0))}"></div>
    </article>`;
  }

  function miniCardHtml(card, activeId) {
    const hpPercent = Math.max(0, Math.min(100, Number(card.hp || 0) / Math.max(1, Number(card.maxHp || 1)) * 100));
    const shieldPercent = Number(card.maxShield || 0) > 0 ? Math.max(0, Math.min(100, Number(card.shield || 0) / Number(card.maxShield) * 100)) : 0;
    const gaugePercent = Math.max(0, Math.min(100, Number(card.gauge || 0)));
    const type = typeKey(card.type);
    const classes = ['focus-mini-card', `side-${String(card.side).toLowerCase()}`];
    if (String(card.id) === String(activeId || '')) classes.push('is-active');
    if (Number(card.hp || 0) <= 0) classes.push('is-ko');
    return `<div class="${classes.join(' ')}" data-mini-fighter-id="${escapeHtml(card.id)}">
      <div class="focus-mini-image"><img src="${assetUrl(card.image)}" alt="${escapeHtml(card.title)}" onerror="window.battleV2ImageFallback(this)"><b>${typeIcon(card.type)}</b></div>
      <div class="focus-mini-info"><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.row === 'FRONT' ? '전열' : '후열')} · ${escapeHtml(card.typeLabel || '균형')}</small>
        <div class="focus-mini-bars"><i class="mini-hp" style="--value:${hpPercent}%"></i><i class="mini-shield" style="--value:${shieldPercent}%"></i><i class="mini-gauge" style="--value:${gaugePercent}%"></i></div>
      </div>
    </div>`;
  }

  function firstLiving(side, preferredRow = 'FRONT') {
    const cards = [...state.cards.values()].filter(card => card.side === side && Number(card.hp || 0) > 0);
    return cards.find(card => card.row === preferredRow) || cards[0] || [...state.cards.values()].find(card => card.side === side) || null;
  }

  function syncFocusRoster(side) {
    const root = side === 'A' ? focusRosterA : focusRosterB;
    if (!root) return;
    const activeId = side === 'A' ? state.activeAId : state.activeBId;
    const cards = [...state.cards.values()].filter(card => card.side === side);
    root.innerHTML = cards.map(card => miniCardHtml(card, activeId)).join('');
  }

  function syncFocusCard(side) {
    const root = side === 'A' ? focusSlotA : focusSlotB;
    if (!root) return;
    const activeId = side === 'A' ? state.activeAId : state.activeBId;
    const card = fighterState(activeId) || firstLiving(side);
    if (!card) {
      root.innerHTML = '<div class="focus-empty">전투 가능 카드 없음</div>';
      return;
    }
    if (side === 'A') state.activeAId = String(card.id);
    else state.activeBId = String(card.id);
    root.innerHTML = cardHtml(card, { focus: true });
  }

  function syncFocusStage() {
    if (!state.data || !focusRoot) return;
    if (!state.activeAId || !fighterState(state.activeAId)) state.activeAId = String(firstLiving('A')?.id || '');
    if (!state.activeBId || !fighterState(state.activeBId)) state.activeBId = String(firstLiving('B')?.id || '');
    syncFocusCard('A');
    syncFocusCard('B');
    syncFocusRoster('A');
    syncFocusRoster('B');
    focusRoot.setAttribute('aria-hidden', isFocusLayout() ? 'false' : 'true');
  }

  function setActiveDuel(actorId, targetId) {
    const actor = fighterState(actorId);
    const target = fighterState(targetId);
    if (actor?.side === 'A') state.activeAId = String(actor.id);
    if (actor?.side === 'B') state.activeBId = String(actor.id);
    if (target?.side === 'A') state.activeAId = String(target.id);
    if (target?.side === 'B') state.activeBId = String(target.id);
    if (isFocusLayout()) syncFocusStage();
  }

  function focusTarget(id) {
    const card = fighterState(id);
    if (!card) return;
    if (card.side === 'A') state.activeAId = String(card.id);
    else state.activeBId = String(card.id);
    if (!state.activeAId) state.activeAId = String(firstLiving('A')?.id || '');
    if (!state.activeBId) state.activeBId = String(firstLiving('B')?.id || '');
    if (isFocusLayout()) syncFocusStage();
  }

  function isEmbedded() {
    try { return window.self !== window.top; }
    catch { return true; }
  }

  function resolveLayout() {
    if (state.requestedLayout && state.requestedLayout !== 'auto') return state.requestedLayout;
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const height = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    if (width <= 760) return width > height ? 'mobile-landscape' : 'mobile-portrait';
    if (document.fullscreenElement && width >= 1100) return 'desktop';
    if (isEmbedded()) return 'wago';
    return 'desktop';
  }

  function layoutCopy(mode) {
    if (mode === 'wago') return ['와고 집중 전투', '100% 폭·1750px iframe 기준 · 활성 카드 2장과 양 팀 미니 덱을 동시에 표시'];
    if (mode === 'mobile-portrait') return ['모바일 세로', '상대 카드 상단 · 내 카드 하단 · 동일한 카드 프레임과 고유효과 유지'];
    if (mode === 'mobile-landscape') return ['모바일 가로', '활성 카드 좌우 대치 · 미니 덱과 행동 순서 동시 표시'];
    return ['PC 전체 전장', '10장 전체 배치 · 카드 프레임과 모든 이펙트 유지'];
  }

  function applyLayout(force = false) {
    const next = resolveLayout();
    if (!force && next === state.effectiveLayout) return;
    state.effectiveLayout = next;
    shell.classList.remove('layout-desktop', 'layout-wago', 'layout-mobile-portrait', 'layout-mobile-landscape');
    shell.classList.add(`layout-${next}`);
    document.body.dataset.battleLayout = next;
    const [label, detail] = layoutCopy(next);
    if (layoutBadge) layoutBadge.textContent = label;
    if (layoutDetail) layoutDetail.textContent = detail;
    if (focusRoot) focusRoot.setAttribute('aria-hidden', next === 'desktop' ? 'true' : 'false');
    if (state.data) syncFocusStage();
  }

  function cloneCard(card) {
    return JSON.parse(JSON.stringify(card));
  }

  function resetBattle() {
    if (!state.data) return;
    state.playToken += 1;
    state.playing = false;
    state.cursor = 0;
    state.cards.clear();
    const teamA = state.data.teams.A.cards.map(cloneCard);
    const teamB = state.data.teams.B.cards.map(cloneCard);
    [...teamA, ...teamB].forEach(card => state.cards.set(String(card.id), card));
    state.activeAId = String(firstLiving('A')?.id || '');
    state.activeBId = String(firstLiving('B')?.id || '');
    document.getElementById('teamFieldA').innerHTML = teamA.map(cardHtml).join('');
    document.getElementById('teamFieldB').innerHTML = teamB.map(cardHtml).join('');
    document.getElementById('teamSummaryA').innerHTML = teamSummaryHtml(state.data.teams.A, 'MY PVP TEAM', 'A');
    document.getElementById('teamSummaryB').innerHTML = teamSummaryHtml(state.data.teams.B, state.data.opponent.mirror ? 'MIRROR TRAINING' : 'OPPONENT TEAM', 'B');
    document.getElementById('battleSeed').textContent = `SEED ${state.data.seed}`;
    logList.innerHTML = '';
    progress.textContent = `0 / ${state.data.result.timeline.length}`;
    setMessage('TACTICAL BATTLE', 'READY', '카드 프레임·고유효과·기기별 전투 표현 준비 완료');
    arena.classList.remove('flash-a', 'flash-b');
    fxRoot.innerHTML = '';
    playButton.disabled = false;
    replayButton.disabled = false;
    rerollButton.disabled = false;
    playButton.textContent = '전투 시작';
    renderOrder(0);
    applyLayout(true);
    syncFocusStage();
  }

  function renderOrder(cursor) {
    const upcoming = state.data?.result?.timeline?.slice(cursor).filter(event => event.type === 'TURN' || event.type === 'COUNTER').slice(0, 11) || [];
    document.getElementById('battleV2Order').innerHTML = upcoming.map(event => {
      const card = fighterState(event.actorId);
      if (!card) return '';
      return `<span class="order-chip ${String(card.side).toLowerCase()}" title="${escapeHtml(card.title)}"><img src="${assetUrl(card.image)}" alt="" onerror="window.battleV2ImageFallback(this)"></span>`;
    }).join('') || '<small>행동 순서를 계산하는 중...</small>';
  }

  function updateCardNode(node, card) {
    if (!node) return;
    const hp = Math.max(0, Number(card.hp ?? card.maxHp));
    const hpPercent = hp / Math.max(1, card.maxHp) * 100;
    const shield = Math.max(0, Number(card.shield || 0));
    const shieldPercent = card.maxShield > 0 ? shield / card.maxShield * 100 : 0;
    const hpFill = node.querySelector('.hp-track i');
    const shieldFill = node.querySelector('.shield-track i');
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;
    if (shieldFill) shieldFill.style.width = `${Math.max(0, Math.min(100, shieldPercent))}%`;
    const hpValue = node.querySelector('.hp-value');
    if (hpValue) hpValue.textContent = `${number(hp)} / ${number(card.maxHp)}`;
    node.querySelector('.gauge-ring')?.style.setProperty('--gauge', Math.max(0, Math.min(100, Number(card.gauge || 0))));
    node.classList.toggle('is-ko', hp <= 0);
  }

  function updateCard(id, changes = {}) {
    const card = fighterState(id);
    if (!card) return null;
    Object.assign(card, changes);
    fighterNodes(id).forEach(node => updateCardNode(node, card));
    syncFocusRoster(card.side);
    return card;
  }

  function pointFor(node) {
    const arenaRect = arena.getBoundingClientRect();
    const rect = node?.getBoundingClientRect?.();
    return rect ? { x: rect.left - arenaRect.left + rect.width / 2, y: rect.top - arenaRect.top + rect.height / 2 } : { x: arenaRect.width / 2, y: arenaRect.height / 2 };
  }

  function damageNumber(node, value, className = '') {
    if (!node) return;
    const point = pointFor(node);
    const el = document.createElement('b');
    el.className = `damage-number ${className}`;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    el.textContent = value;
    fxRoot.appendChild(el);
    setTimeout(() => el.remove(), 1100 / speed());
  }

  function pulse(node, className, duration = 420) {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), duration / speed());
  }

  function triggerCardFx(node, type, event = 'attack') {
    if (!node || !type) return;
    node.classList.remove('unique-fx-active', 'unique-fx-attack-active', 'unique-fx-defense-active', 'unique-fx-low-hp-active');
    void node.offsetWidth;
    node.classList.add('unique-fx-active', `unique-fx-${event}-active`, 'unique-fx-source-active');
    clearTimeout(node._uniqueFxTimer);
    node._uniqueFxTimer = setTimeout(() => node.classList.remove('unique-fx-active', `unique-fx-${event}-active`, 'unique-fx-source-active'), (type === 'hp' ? 1450 : 1100) / speed());
  }

  function impactFx(actorNode, targetNode, type = 'attack', label = '') {
    if (!actorNode || !targetNode) return;
    const source = pointFor(actorNode);
    const target = pointFor(targetNode);
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const distance = Math.max(90, Math.hypot(target.x - source.x, target.y - source.y));
    const angle = Math.atan2(target.y - source.y, target.x - source.x) * 180 / Math.PI;
    const host = document.createElement('div');
    host.className = `unique-stage-fx unique-card-fx-host unique-fx-${type} unique-fx-active unique-fx-attack-active${type === 'attack' ? ' unique-fx-between-targets' : ''}`;
    const fxSize = Math.min(190, Math.max(118, distance * .32));
    host.style.left = `${midX - fxSize / 2}px`;
    host.style.top = `${midY - fxSize / 2}px`;
    host.style.width = `${fxSize}px`;
    host.style.height = `${fxSize}px`;
    host.style.setProperty('--unique-fx-angle', `${angle}deg`);
    if (target.x < source.x) host.classList.add('unique-fx-reverse');
    host.innerHTML = uniqueFxMarkup(type);
    if (label) host.querySelector('b')?.replaceChildren(document.createTextNode(label));
    fxRoot.appendChild(host);

    const beam = document.createElement('i');
    beam.className = `battle-v2-impact impact-${type}`;
    beam.style.left = `${source.x}px`;
    beam.style.top = `${source.y}px`;
    beam.style.width = `${distance}px`;
    beam.style.setProperty('--impact-angle', `${angle}deg`);
    fxRoot.appendChild(beam);
    setTimeout(() => { host.remove(); beam.remove(); }, (type === 'hp' ? 1500 : 1100) / speed());
  }

  function burstFx(targetNode, type = 'attack', critical = false) {
    if (!targetNode) return;
    const point = pointFor(targetNode);
    const burst = document.createElement('i');
    burst.className = `battle-v2-burst burst-${type}${critical ? ' is-critical' : ''}`;
    burst.style.left = `${point.x}px`;
    burst.style.top = `${point.y}px`;
    fxRoot.appendChild(burst);
    setTimeout(() => burst.remove(), 850 / speed());
  }

  function setMessage(kicker, title, detail) {
    const html = `<small>${escapeHtml(kicker)}</small><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
    if (message) message.innerHTML = html;
    if (focusMessage) focusMessage.innerHTML = html;
  }

  function addLog(event, text, value = '') {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span>#${String(event.seq).padStart(2, '0')}</span><b>${escapeHtml(text)}</b><em>${escapeHtml(value)}</em>`;
    logList.prepend(row);
    while (logList.children.length > 40) logList.lastElementChild?.remove();
  }

  async function applyEvent(event, token) {
    if (token !== state.playToken) return;
    renderOrder(state.cursor);
    const baseDelay = 650 / speed();

    if (event.type === 'START_EFFECT') {
      focusTarget(event.targetId);
      const target = fighterState(event.targetId);
      updateCard(event.targetId, { shield: event.shieldAfter });
      const node = fighterNode(event.targetId);
      triggerCardFx(node, 'defense', 'defense');
      pulse(node, 'is-shield', 800);
      damageNumber(node, `SHIELD +${number(event.amount)}`, 'shield');
      setMessage('UNIQUE DEFENSE', '선봉 방벽', `${target?.title || ''} · 피해 흡수 ${number(event.amount)}`);
      addLog(event, `${target?.title || ''} 선봉 방벽`, `+${number(event.amount)}`);
      await sleep(baseDelay * .95);
      return;
    }

    if (event.type === 'REGEN' || event.type === 'EMERGENCY_HEAL' || event.type === 'SURVIVE') {
      focusTarget(event.targetId);
      const target = fighterState(event.targetId);
      updateCard(event.targetId, { hp: event.hpAfter });
      const node = fighterNode(event.targetId);
      node?.classList.remove('is-ko');
      triggerCardFx(node, 'hp', 'low-hp');
      pulse(node, 'is-heal', 820);
      burstFx(node, 'hp');
      damageNumber(node, `+${number(event.amount || event.hpAfter)}`, 'heal');
      setMessage('LIFE EFFECT', event.type === 'REGEN' ? '지속 회복' : event.type === 'SURVIVE' ? '불굴의 생존' : '긴급 회복', target?.title || '');
      addLog(event, `${target?.title || ''} ${event.label || '회복'}`, event.amount ? `+${number(event.amount)}` : `HP ${number(event.hpAfter)}`);
      await sleep(baseDelay * .9);
      return;
    }

    if (event.type === 'TURN' || event.type === 'COUNTER') {
      setActiveDuel(event.actorId, event.targetId);
      const actor = fighterState(event.actorId);
      const target = fighterState(event.targetId);
      const actorNode = fighterNode(event.actorId);
      const targetNode = fighterNode(event.targetId);
      const actorType = typeKey(actor?.type) || 'attack';
      pulse(actorNode, 'is-acting', 720);
      triggerCardFx(actorNode, actorType, event.type === 'COUNTER' ? 'defense' : 'attack');
      arena.classList.remove('flash-a', 'flash-b');
      void arena.offsetWidth;
      arena.classList.add(actor?.side === 'A' ? 'flash-a' : 'flash-b');

      if (event.dodge) {
        triggerCardFx(targetNode, 'speed', 'attack');
        pulse(targetNode, 'is-dodge', 720);
        impactFx(actorNode, targetNode, 'speed', 'DODGE');
        setMessage('SPEED EFFECT', 'DODGE', `${target?.title || ''}이 공격을 회피했습니다.`);
        damageNumber(targetNode, 'DODGE', 'shield');
        addLog(event, `${target?.title || ''} 회피`, 'MISS');
        await sleep(baseDelay);
        return;
      }

      impactFx(actorNode, targetNode, event.type === 'COUNTER' ? 'defense' : actorType, event.type === 'COUNTER' ? 'COUNTER' : actor?.typeLabel || 'HIT');
      await sleep(180 / speed());
      pulse(targetNode, event.absorbed > 0 ? 'is-guard-hit' : 'is-hit', 520);
      if (event.absorbed > 0 || target?.type === 'DEFENSE') triggerCardFx(targetNode, 'defense', 'defense');
      burstFx(targetNode, event.absorbed > 0 ? 'defense' : actorType, event.critical);
      updateCard(event.actorId, { gauge: event.actorGaugeAfter ?? actor?.gauge ?? 0 });
      updateCard(event.targetId, {
        hp: event.targetHpAfter,
        shield: event.targetShieldAfter,
        gauge: event.targetGaugeAfter ?? target?.gauge ?? 0
      });
      const total = Number(event.damage || 0) + Number(event.absorbed || 0);
      const criticalClass = event.critical ? 'critical' : event.absorbed > 0 ? 'shield' : '';
      damageNumber(targetNode, `${event.critical ? 'CRITICAL ' : ''}-${number(total)}`, criticalClass);
      const title = event.type === 'COUNTER' ? 'COUNTER' : event.critical ? 'CRITICAL' : event.execute ? 'EXECUTE' : 'ATTACK';
      const detail = `${actor?.title || ''} → ${target?.title || ''}${event.penetration ? ` · 관통 ${event.penetration}%` : ''}${event.absorbed ? ` · 방벽 흡수 ${number(event.absorbed)}` : ''}`;
      setMessage(event.type === 'COUNTER' ? 'DEFENSE EFFECT' : `${actor?.typeLabel || 'BATTLE'} ACTION`, title, detail);
      addLog(event, `${actor?.title || ''} → ${target?.title || ''}`, `-${number(total)}`);
      await sleep(baseDelay);
      return;
    }

    if (event.type === 'KO') {
      focusTarget(event.targetId);
      const target = fighterState(event.targetId);
      updateCard(event.targetId, { hp: 0, gauge: 0 });
      const node = fighterNode(event.targetId);
      node?.classList.add('is-ko');
      pulse(node, 'is-ko-burst', 900);
      burstFx(node, 'ko', true);
      setMessage('BATTLE STATE', 'K.O.', target?.title || '');
      addLog(event, `${target?.title || ''} 전투 불능`, 'K.O.');
      await sleep(baseDelay * .72);
      return;
    }

    if (event.type === 'FRONTLINE_BREAK') {
      arena.classList.add(event.side === 'A' ? 'front-break-a' : 'front-break-b');
      setMessage('FORMATION BREAK', '전열 붕괴', event.label || '후열이 노출됩니다.');
      addLog(event, event.label || '전열 붕괴', 'BACKLINE OPEN');
      await sleep(baseDelay * 1.05);
      arena.classList.remove('front-break-a', 'front-break-b');
      return;
    }

    if (event.type === 'RESULT') {
      const winnerName = event.winner === 'A' ? state.data.player.nickname : event.winner === 'B' ? state.data.opponent.nickname : '무승부';
      setMessage('BATTLE RESULT', event.winner === 'DRAW' ? 'DRAW' : 'VICTORY', `${winnerName} · ${event.actions}회 행동 · 생존 HP ${event.teamAHpPercent}% : ${event.teamBHpPercent}%`);
      addLog(event, `최종 승리 ${winnerName}`, `${event.teamAHpPercent}% : ${event.teamBHpPercent}%`);
      arena.classList.add(event.winner === 'A' ? 'result-a' : event.winner === 'B' ? 'result-b' : 'result-draw');
      await sleep(baseDelay * 1.25);
    }
  }

  async function play() {
    if (!state.data || state.playing) return;
    state.playing = true;
    const token = ++state.playToken;
    playButton.disabled = true;
    replayButton.disabled = true;
    rerollButton.disabled = true;
    playButton.textContent = '전투 재생 중';
    const timeline = state.data.result.timeline;
    for (let i = state.cursor; i < timeline.length; i++) {
      if (token !== state.playToken) return;
      state.cursor = i;
      progress.textContent = `${i + 1} / ${timeline.length}`;
      await applyEvent(timeline[i], token);
    }
    if (token !== state.playToken) return;
    state.cursor = timeline.length;
    state.playing = false;
    playButton.disabled = false;
    replayButton.disabled = false;
    rerollButton.disabled = false;
    playButton.textContent = '전투 완료';
  }

  async function loadBattle() {
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
    if (!token) {
      setStatus('숲켓몬 메인 화면에서 먼저 로그인한 뒤 이 프리뷰를 다시 열어주세요.', true);
      playButton.disabled = true;
      replayButton.disabled = true;
      rerollButton.disabled = true;
      return;
    }
    state.playToken += 1;
    state.playing = false;
    setStatus('실제 PvP 덱·카드 프레임·고유효과를 불러와 V2 전투를 계산하고 있습니다.');
    playButton.disabled = true;
    replayButton.disabled = true;
    rerollButton.disabled = true;
    try {
      const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(`/api/battle-v2/preview?seed=${encodeURIComponent(seed)}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` }
      });
      const text = await response.text();
      let data = {};
      try { data = JSON.parse(text); } catch { throw new Error('서버 응답 형식이 올바르지 않습니다.'); }
      if (!response.ok) throw new Error(data.error || '전투 데이터를 불러오지 못했습니다.');
      state.data = data;
      setStatus(`${data.player.nickname} VS ${data.opponent.nickname} · 카드 프레임/고유 이펙트 통합 · DB 저장 없음`);
      resetBattle();
    } catch (error) {
      setStatus(error.message || '전투 프리뷰 오류', true);
      playButton.disabled = true;
      replayButton.disabled = true;
      rerollButton.disabled = false;
    }
  }

  async function enterFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const target = document.documentElement;
      if (!target.requestFullscreen) throw new Error('fullscreen unavailable');
      await target.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      const opened = window.open(location.href, '_blank', 'noopener');
      if (!opened) setStatus('현재 게시판 iframe에서는 전체화면이 제한됩니다. 독립 화면 버튼을 눌러주세요.', true);
    }
  }

  function openIndependent() {
    const url = new URL(location.href);
    url.searchParams.set('view', 'independent');
    const opened = window.open(url.href, '_blank', 'noopener');
    if (!opened) location.href = url.href;
  }

  playButton.addEventListener('click', () => {
    if (state.cursor >= (state.data?.result?.timeline?.length || 0)) resetBattle();
    void play();
  });
  replayButton.addEventListener('click', () => { resetBattle(); void play(); });
  rerollButton.addEventListener('click', loadBattle);
  if (speedSelect) { speedSelect.value = '1.6'; speedSelect.disabled = true; }
  layoutSelect.addEventListener('change', () => {
    state.requestedLayout = layoutSelect.value || 'auto';
    applyLayout(true);
    setStatus(`${layoutCopy(state.effectiveLayout)[0]} 표현으로 전환했습니다. 전투 계산과 현재 진행 상태는 그대로 유지됩니다.`);
  });
  fullscreenButton.addEventListener('click', () => { void enterFullscreen(); });
  openWindowButton.addEventListener('click', openIndependent);
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.textContent = document.fullscreenElement ? '전체화면 종료' : '전체화면';
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => applyLayout(true), 80);
  });
  window.addEventListener('resize', () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => applyLayout(), 120);
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => applyLayout(true), 180);
  }, { passive: true });

  const initialLayout = new URLSearchParams(location.search).get('layout');
  if (['auto', 'desktop', 'wago', 'mobile-portrait', 'mobile-landscape'].includes(initialLayout || '')) {
    state.requestedLayout = initialLayout;
    layoutSelect.value = initialLayout;
  }
  applyLayout(true);
  void loadBattle();
})();
