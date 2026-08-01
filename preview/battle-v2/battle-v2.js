(() => {
  'use strict';

  const TOKEN_KEY = 'cnine_card_api_token';
  const app = document.getElementById('battleV2App');
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

  const state = {
    data: null,
    cards: new Map(),
    playing: false,
    playToken: 0,
    cursor: 0
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const number = value => Math.round(Number(value || 0)).toLocaleString();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const speed = () => Math.max(.5, Number(speedSelect.value || 1));

  function setStatus(text, error = false) {
    statusBox.textContent = text;
    statusBox.classList.toggle('error', error);
  }

  function fighterNode(id) {
    return [...document.querySelectorAll('.battle-card-v2')].find(node => node.dataset.fighterId === String(id)) || null;
  }

  function fighterState(id) {
    return state.cards.get(String(id)) || null;
  }

  function typeIcon(type) {
    return ({ ATTACK: '⚔', DEFENSE: '⬡', HP: '✚', SPEED: '✦', NONE: '◇' })[String(type)] || '◇';
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

  function cardHtml(card) {
    const hpPercent = Math.max(0, Math.min(100, card.hp / Math.max(1, card.maxHp) * 100));
    const shieldPercent = card.maxShield > 0 ? Math.max(0, Math.min(100, card.shield / card.maxShield * 100)) : 0;
    return `<article class="battle-card-v2" data-fighter-id="${escapeHtml(card.id)}" data-side="${escapeHtml(card.side)}">
      <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.title)}" style="object-position:${card.focusX}% ${card.focusY}%" onerror="this.style.opacity='.12'">
      <div class="card-head"><b>${escapeHtml(card.grade)}</b><em>${typeIcon(card.type)} ${escapeHtml(card.typeLabel)}</em></div>
      <div class="stat-pills"><span>HP ${number(card.maxHp)}</span><span>ATK ${number(card.attack)}</span><span>DEF ${number(card.defense)}</span><span>SPD ${number(card.speed)}</span></div>
      <div class="hp-stack">
        ${card.maxShield > 0 ? `<div class="shield-track"><i style="width:${shieldPercent}%"></i></div>` : ''}
        <div class="hp-track"><i style="width:${hpPercent}%"></i></div>
      </div>
      <div class="card-info"><strong>${escapeHtml(card.title)}</strong><small>${card.row === 'FRONT' ? '전열' : '후열'} · 전투력 ${number(card.power)}${card.equipmentShare ? ` · 장비 +${number(card.equipmentShare)}` : ''}</small></div>
      <div class="gauge-ring" style="--gauge:${Math.max(0, Math.min(100, card.gauge || 0))}"></div>
    </article>`;
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
    document.getElementById('teamFieldA').innerHTML = teamA.map(cardHtml).join('');
    document.getElementById('teamFieldB').innerHTML = teamB.map(cardHtml).join('');
    document.getElementById('teamSummaryA').innerHTML = teamSummaryHtml(state.data.teams.A, 'MY PVP TEAM', 'A');
    document.getElementById('teamSummaryB').innerHTML = teamSummaryHtml(state.data.teams.B, state.data.opponent.mirror ? 'MIRROR TRAINING' : 'OPPONENT TEAM', 'B');
    document.getElementById('battleSeed').textContent = `SEED ${state.data.seed}`;
    logList.innerHTML = '';
    progress.textContent = `0 / ${state.data.result.timeline.length}`;
    message.innerHTML = '<small>TACTICAL BATTLE</small><strong>READY</strong><span>HP·공격·방어·속도 분배 완료</span>';
    arena.classList.remove('flash-a', 'flash-b');
    fxRoot.innerHTML = '';
    playButton.disabled = false;
    replayButton.disabled = false;
    rerollButton.disabled = false;
    playButton.textContent = '전투 시작';
    renderOrder(0);
  }

  function renderOrder(cursor) {
    const upcoming = state.data?.result?.timeline?.slice(cursor).filter(event => event.type === 'TURN' || event.type === 'COUNTER').slice(0, 11) || [];
    document.getElementById('battleV2Order').innerHTML = upcoming.map(event => {
      const card = fighterState(event.actorId);
      if (!card) return '';
      return `<span class="order-chip ${String(card.side).toLowerCase()}" title="${escapeHtml(card.title)}"><img src="${escapeHtml(card.image)}" alt=""></span>`;
    }).join('') || '<small>행동 순서를 계산하는 중...</small>';
  }

  function updateCard(id, changes = {}) {
    const card = fighterState(id);
    if (!card) return null;
    Object.assign(card, changes);
    const node = fighterNode(id);
    if (!node) return card;
    const hp = Math.max(0, Number(card.hp ?? card.maxHp));
    const hpPercent = hp / Math.max(1, card.maxHp) * 100;
    const shield = Math.max(0, Number(card.shield || 0));
    const shieldPercent = card.maxShield > 0 ? shield / card.maxShield * 100 : 0;
    const hpFill = node.querySelector('.hp-track i');
    const shieldFill = node.querySelector('.shield-track i');
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;
    if (shieldFill) shieldFill.style.width = `${Math.max(0, Math.min(100, shieldPercent))}%`;
    node.querySelector('.gauge-ring')?.style.setProperty('--gauge', Math.max(0, Math.min(100, Number(card.gauge || 0))));
    if (hp <= 0) node.classList.add('is-ko');
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
    setTimeout(() => el.remove(), 1000 / speed());
  }

  function pulse(node, className, duration = 420) {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), duration / speed());
  }

  function setMessage(kicker, title, detail) {
    message.innerHTML = `<small>${escapeHtml(kicker)}</small><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
  }

  function cardName(id) {
    return fighterState(id)?.title || 'CARD';
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
    const baseDelay = 580 / speed();

    if (event.type === 'START_EFFECT') {
      const target = fighterState(event.targetId);
      updateCard(event.targetId, { shield: event.shieldAfter });
      const node = fighterNode(event.targetId);
      pulse(node, 'is-shield', 700);
      damageNumber(node, `SHIELD +${number(event.amount)}`, 'shield');
      setMessage('UNIQUE DEFENSE', '선봉 방벽', `${target?.title || ''} · 피해 흡수 ${number(event.amount)}`);
      addLog(event, `${target?.title || ''} 선봉 방벽`, `+${number(event.amount)}`);
      await sleep(baseDelay * .82);
      return;
    }

    if (event.type === 'REGEN' || event.type === 'EMERGENCY_HEAL' || event.type === 'SURVIVE') {
      const target = fighterState(event.targetId);
      updateCard(event.targetId, { hp: event.hpAfter });
      const node = fighterNode(event.targetId);
      node?.classList.remove('is-ko');
      pulse(node, 'is-heal', 700);
      damageNumber(node, `+${number(event.amount || event.hpAfter)}`, 'heal');
      setMessage('LIFE EFFECT', event.type === 'REGEN' ? '지속 회복' : event.type === 'SURVIVE' ? '불굴의 생존' : '긴급 회복', target?.title || '');
      addLog(event, `${target?.title || ''} ${event.label || '회복'}`, event.amount ? `+${number(event.amount)}` : `HP ${number(event.hpAfter)}`);
      await sleep(baseDelay * .78);
      return;
    }

    if (event.type === 'TURN' || event.type === 'COUNTER') {
      const actor = fighterState(event.actorId);
      const target = fighterState(event.targetId);
      const actorNode = fighterNode(event.actorId);
      const targetNode = fighterNode(event.targetId);
      pulse(actorNode, 'is-acting', 620);
      arena.classList.remove('flash-a', 'flash-b');
      void arena.offsetWidth;
      arena.classList.add(actor?.side === 'A' ? 'flash-a' : 'flash-b');

      if (event.dodge) {
        setMessage('SPEED EFFECT', 'DODGE', `${target?.title || ''}이 공격을 회피했습니다.`);
        damageNumber(targetNode, 'DODGE', 'shield');
        addLog(event, `${target?.title || ''} 회피`, 'MISS');
        await sleep(baseDelay);
        return;
      }

      await sleep(150 / speed());
      pulse(targetNode, 'is-hit', 420);
      updateCard(event.actorId, { gauge: event.actorGaugeAfter ?? actor?.gauge ?? 0 });
      updateCard(event.targetId, {
        hp: event.targetHpAfter,
        shield: event.targetShieldAfter,
        gauge: event.targetGaugeAfter ?? target?.gauge ?? 0
      });
      const total = Number(event.damage || 0) + Number(event.absorbed || 0);
      const criticalClass = event.critical ? 'critical' : '';
      damageNumber(targetNode, `${event.critical ? 'CRITICAL ' : ''}-${number(total)}`, criticalClass);
      const title = event.type === 'COUNTER' ? 'COUNTER' : event.critical ? 'CRITICAL' : event.execute ? 'EXECUTE' : 'ATTACK';
      const detail = `${actor?.title || ''} → ${target?.title || ''}${event.penetration ? ` · 관통 ${event.penetration}%` : ''}`;
      setMessage(event.type === 'COUNTER' ? 'DEFENSE EFFECT' : `${actor?.typeLabel || 'BATTLE'} ACTION`, title, detail);
      addLog(event, `${actor?.title || ''} → ${target?.title || ''}`, `-${number(total)}`);
      await sleep(baseDelay);
      return;
    }

    if (event.type === 'KO') {
      const target = fighterState(event.targetId);
      updateCard(event.targetId, { hp: 0, gauge: 0 });
      fighterNode(event.targetId)?.classList.add('is-ko');
      setMessage('BATTLE STATE', 'K.O.', target?.title || '');
      addLog(event, `${target?.title || ''} 전투 불능`, 'K.O.');
      await sleep(baseDelay * .65);
      return;
    }

    if (event.type === 'FRONTLINE_BREAK') {
      setMessage('FORMATION BREAK', '전열 붕괴', event.label || '후열이 노출됩니다.');
      addLog(event, event.label || '전열 붕괴', 'BACKLINE OPEN');
      await sleep(baseDelay * .9);
      return;
    }

    if (event.type === 'RESULT') {
      const winnerName = event.winner === 'A' ? state.data.player.nickname : event.winner === 'B' ? state.data.opponent.nickname : '무승부';
      setMessage('BATTLE RESULT', event.winner === 'DRAW' ? 'DRAW' : 'VICTORY', `${winnerName} · ${event.actions}회 행동 · 생존 HP ${event.teamAHpPercent}% : ${event.teamBHpPercent}%`);
      addLog(event, `최종 승리 ${winnerName}`, `${event.teamAHpPercent}% : ${event.teamBHpPercent}%`);
      await sleep(baseDelay * 1.15);
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
    setStatus('실제 PvP 덱과 고유효과를 불러와 V2 전투를 계산하고 있습니다.');
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
      setStatus(`${data.player.nickname} VS ${data.opponent.nickname} · 서버 계산 완료 · DB 저장 없음`);
      resetBattle();
    } catch (error) {
      setStatus(error.message || '전투 프리뷰 오류', true);
      playButton.disabled = true;
      replayButton.disabled = true;
      rerollButton.disabled = false;
    }
  }

  playButton.addEventListener('click', () => {
    if (state.cursor >= (state.data?.result?.timeline?.length || 0)) resetBattle();
    void play();
  });
  replayButton.addEventListener('click', () => { resetBattle(); void play(); });
  rerollButton.addEventListener('click', loadBattle);
  speedSelect.addEventListener('change', () => setStatus(`재생 속도 ${speedSelect.options[speedSelect.selectedIndex].text} · 전투 결과는 변경되지 않습니다.`));

  void loadBattle();
})();
