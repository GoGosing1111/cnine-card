(() => {
  'use strict';

  const PLAYBACK_SPEED = 1.6;
  const FAKER_CHAMPIONSHIP_CARD_ID = 'CN-0B48C6FF8F9B4AC5';
  const MOBILE_LOW_FX = matchMedia('(max-width: 800px), (pointer: coarse)').matches;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
  const number = value => Math.max(0, Math.round(Number(value || 0))).toLocaleString();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(24, Math.round(Number(ms || 0) / PLAYBACK_SPEED))));
  const typeKey = type => ({ ATTACK:'attack', DEFENSE:'defense', HP:'hp', SPEED:'speed' })[String(type || '').toUpperCase()] || '';
  const typeIcon = type => ({ ATTACK:'⚔', DEFENSE:'⬡', HP:'♥', SPEED:'↯', NONE:'◇' })[String(type || '').toUpperCase()] || '◇';

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
    return `<span class="card-unique-badge unique-type-${type}" title="${esc(card.uniqueAbility.effectDescription || card.uniqueAbility.effectName || card.typeLabel)}"><i>${typeIcon(card.type)}</i><b>${esc(card.typeLabel)}</b><small>${esc(card.uniqueAbility.effectName || '')}</small></span>`;
  }

  function frameHtml(card) {
    const grade = String(card.grade || 'C').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const level = Math.max(0, Math.min(13, Number(card.breakthroughLevel || 0)));
    const breakthroughClass = level > 0 ? ` breakthrough-${level}` : '';
    const isFakerChampionship = String(card.cardId || card.id || '') === FAKER_CHAMPIONSHIP_CARD_ID;
    return `<div class="card-frame grade-${grade}${breakthroughClass}${isFakerChampionship ? ' faker-championship-card' : ''} battle-v2-card-frame">
      ${level > 0 ? `<div class="breakthrough-badge">★${level}</div>` : ''}
      ${uniqueBadgeHtml(card)}
      <div class="card-holo"></div><div class="breakthrough-effect"></div>
      <div class="card-inner">
        <div class="card-header"><span>${esc(grade)}</span><b>SOOP</b></div>
        <div class="card-art"><img src="${assetUrl(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX ?? 50)}% ${Number(card.focusY ?? 50)}%" onerror="window.battleV2ImageFallback(this)"></div>
        <div class="card-footer"><div><small>${esc(card.memberName || '')}</small><div class="card-title-row"><div class="card-title">${esc(card.title)}</div></div></div><img src="/assets/ui/cninelogo.png" class="card-mini-logo" alt="SOOP"></div>
      </div>
      ${isFakerChampionship ? '<img class="faker-championship-frame" src="/assets/ui/card-frames/faker-championship-frame-v1.png" alt="" aria-hidden="true">' : ''}
    </div>`;
  }

  function cardHtml(card, focus = false) {
    const hpPct = Math.max(0, Math.min(100, Number(card.hp || 0) / Math.max(1, Number(card.maxHp || 1)) * 100));
    const shieldPct = Number(card.maxShield || 0) > 0 ? Math.max(0, Math.min(100, Number(card.shield || 0) / Number(card.maxShield) * 100)) : 0;
    const fxType = typeKey(card.type);
    const idAttr = focus ? `data-focus-fighter-id="${esc(card.id)}"` : `data-fighter-id="${esc(card.id)}"`;
    return `<article class="battle-card-v2${focus ? ' focus-battle-card' : ''}${fxType ? ` unique-card-fx-host unique-fx-${fxType}` : ''}" ${idAttr} data-side="${esc(card.side)}" data-effect-type="${fxType}">
      ${fxType ? uniqueFxMarkup(fxType) : ''}
      <div class="battle-v2-frame-shell">${frameHtml(card)}</div>
      <div class="stat-pills"><span>HP ${number(card.maxHp)}</span><span>ATK ${number(card.attack)}</span><span>DEF ${number(card.defense)}</span><span>SPD ${number(card.speed)}</span></div>
      <div class="hp-stack"><div class="hp-caption"><b>${card.row === 'FRONT' ? '전열' : '후열'}</b><span class="hp-value">${number(card.hp)} / ${number(card.maxHp)}</span></div>
        ${Number(card.maxShield || 0) > 0 ? `<div class="shield-track"><i style="width:${shieldPct}%"></i></div>` : ''}<div class="hp-track"><i style="width:${hpPct}%"></i></div></div>
      <div class="gauge-ring" style="--gauge:${Math.max(0, Math.min(100, Number(card.gauge || 0)))}"></div>
    </article>`;
  }

  function miniCardHtml(card, activeId) {
    const hpPct = Math.max(0, Math.min(100, Number(card.hp || 0) / Math.max(1, Number(card.maxHp || 1)) * 100));
    const shieldPct = Number(card.maxShield || 0) > 0 ? Math.max(0, Math.min(100, Number(card.shield || 0) / Number(card.maxShield) * 100)) : 0;
    const gaugePct = Math.max(0, Math.min(100, Number(card.gauge || 0)));
    return `<div class="focus-mini-card side-${String(card.side).toLowerCase()}${String(card.id) === String(activeId || '') ? ' is-active' : ''}${Number(card.hp || 0) <= 0 ? ' is-ko' : ''}" data-mini-fighter-id="${esc(card.id)}">
      <div class="focus-mini-image"><img src="${assetUrl(card.image)}" alt="${esc(card.title)}" onerror="window.battleV2ImageFallback(this)"><b>${typeIcon(card.type)}</b></div>
      <div class="focus-mini-info"><strong>${esc(card.title)}</strong><small>${card.row === 'FRONT' ? '전열' : '후열'} · ${esc(card.typeLabel || '균형')}</small><div class="focus-mini-bars"><i class="mini-hp" style="--value:${hpPct}%"></i><i class="mini-shield" style="--value:${shieldPct}%"></i><i class="mini-gauge" style="--value:${gaugePct}%"></i></div></div>
    </div>`;
  }

  function teamSummaryHtml(team, label, nickname) {
    const summary = team.summary || {};
    return `<header><div><small>${esc(label)}</small><strong>${esc(nickname)}</strong></div><b>${number(summary.power)}</b></header><dl>
      <div><dt>총 HP</dt><dd>${number(summary.maxHp)}</dd></div><div><dt>총 공격</dt><dd>${number(summary.attack)}</dd></div><div><dt>총 방어</dt><dd>${number(summary.defense)}</dd></div><div><dt>평균 속도</dt><dd>${number(summary.averageSpeed)}</dd></div></dl>`;
  }

  function isEmbedded() { try { return window.self !== window.top; } catch { return true; } }
  function resolveLayout() {
    const viewport=window.visualViewport;
    const width = Number(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
    const height = Number(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    if (width <= 760) return width > height ? 'mobile-landscape' : 'mobile-portrait';
    if (width >= 1080) return 'desktop';
    if (isEmbedded()) return 'wago';
    return 'desktop';
  }
  function layoutCopy(mode) {
    if (mode === 'wago') return ['와고 집중 전투', '100% 폭·1750px iframe 기준 · 활성 카드 2장과 양 팀 미니 덱 표시'];
    if (mode === 'mobile-portrait') return ['모바일 세로', '상대 카드 상단 · 내 카드 하단 · 카드 프레임과 고유효과 유지'];
    if (mode === 'mobile-landscape') return ['모바일 가로', '활성 카드 좌우 대치 · 미니 덱과 행동 순서 표시'];
    return ['PC 전체 전장', '전체 카드 배치 · 프레임과 모든 이펙트 유지'];
  }

  window.prepareBattleV2LiveLoading = ({ modal, mode = 'PVE', playerName = 'MEMBER TEAM', opponentName = 'OPPONENT', autoText = '' } = {}) => {
    if (!modal) throw new Error('전투 모달을 준비하지 못했습니다.');
    const layout = resolveLayout();
    modal.className = `modal show battle-modal ${mode === 'PVP' ? 'pvp-battle-modal' : ''}`;
    modal.innerHTML = `<div class="modal-panel battle-stage battle-v2-shell battle-v2-live-shell battle-v2-live-loading layout-${layout}">
      <header class="battle-v2-live-header"><div><h1>${mode === 'PVE' ? '몬스터 토벌' : 'PVP 대전'}</h1></div></header>
      <section class="battle-v2-scoreboard"><article class="team-summary team-a"><header><div><small>${mode === 'PVE' ? 'MEMBER TEAM' : 'MY PVP TEAM'}</small><strong>${esc(playerName)}</strong></div><b>READY</b></header><div class="v2-loading-stat-grid"><i></i><i></i><i></i><i></i></div></article><div class="battle-v2-center-mark"><strong>VS</strong></div><article class="team-summary team-b"><header><div><small>${mode === 'PVE' ? 'MONSTER' : 'OPPONENT TEAM'}</small><strong>${esc(opponentName)}</strong></div><b>READY</b></header><div class="v2-loading-stat-grid"><i></i><i></i><i></i><i></i></div></article></section>
      <div class="battle-v2-layout-note battle-v2-phase-only"><em id="battlePhase" class="battle-v2-live-phase">전투 준비 중</em></div>
      <section class="battle-v2-arena v2-loading-arena"><div class="arena-glow"></div><div class="action-order"><small>실제 덱·장비·고유효과 확인 중</small></div><div class="v2-loading-card-line side-a">${Array.from({length:5},(_,i)=>`<i style="--delay:${i}"></i>`).join('')}</div><div class="battle-v2-message desktop-message"><small>TACTICAL BATTLE</small><strong>CALCULATING</strong><span>${esc(autoText || '전투 타임라인을 서버에서 계산하고 있습니다.')}</span></div><div class="v2-loading-card-line side-b">${Array.from({length:mode === 'PVE' ? 1 : 5},(_,i)=>`<i style="--delay:${i}"></i>`).join('')}</div></section>
      <section class="battle-v2-live-footer"><div id="battleMessage" class="battle-message battle-v2-live-result"></div></section>
    </div>`;
    const stage = modal.querySelector('.battle-stage');
    const phase = modal.querySelector('#battlePhase');
    const msg = modal.querySelector('#battleMessage');
    return { stage, phase, msg };
  };

  function createRenderer({ stage, phase, msg, modal, data, mode, monster, playUltimateCinematics = true }) {
    const v2 = data.battleV2;
    const state = {
      cards: new Map(), cursor: 0, activeAId: '', activeBId: '', layout: '', destroyed: false,
      playerName: String(loadUser?.()?.nickname || 'MEMBER TEAM'),
      opponentName: mode === 'PVE' ? String(monster?.name || v2.teams?.B?.cards?.[0]?.title || 'MONSTER') : String((typeof data.opponent === 'string' ? data.opponent : data.opponent?.nickname) || 'OPPONENT')
    };
    const cardsA = (v2.teams?.A?.cards || []).map(card => ({ ...card }));
    const cardsB = (v2.teams?.B?.cards || []).map(card => ({ ...card }));
    [...cardsA, ...cardsB].forEach(card => state.cards.set(String(card.id), card));

    const preservedPhase = phase;
    const preservedMsg = msg;
    stage.className = 'modal-panel battle-stage battle-v2-shell battle-v2-live-shell';
    stage.innerHTML = `<header class="battle-v2-live-header"><div><h1>${mode === 'PVE' ? '몬스터 토벌' : 'PVP 대전'}</h1></div></header>
      <section class="battle-v2-scoreboard"><article class="team-summary team-a" data-live-summary="A"></article><div class="battle-v2-center-mark"><strong>VS</strong></div><article class="team-summary team-b" data-live-summary="B"></article></section>
      <div class="battle-v2-layout-note battle-v2-phase-only"><em data-live-phase-slot></em></div>
      <section class="battle-v2-arena" data-live-arena aria-live="polite"><div class="arena-glow"></div><div class="action-order" data-live-order></div><div class="team-field team-field-a" data-live-field="A"></div><div class="battle-v2-message desktop-message" data-live-message><small>TACTICAL BATTLE</small><strong>READY</strong><span>전투 데이터를 배치하는 중</span></div><div class="team-field team-field-b" data-live-field="B"></div>
        <div class="focus-battle" data-live-focus aria-hidden="true"><div class="focus-roster focus-roster-b" data-live-roster="B"></div><div class="focus-duel"><div class="focus-slot focus-slot-a" data-live-focus-slot="A"></div><div class="battle-v2-message focus-message" data-live-focus-message><small>TACTICAL BATTLE</small><strong>READY</strong><span>현재 행동 카드를 집중 표시합니다.</span></div><div class="focus-slot focus-slot-b" data-live-focus-slot="B"></div></div><div class="focus-roster focus-roster-a" data-live-roster="A"></div></div><div class="battle-v2-fx" data-live-fx></div>
      </section>
      <section class="battle-v2-live-footer"><div data-live-result-slot></div></section>`;

    const root = stage;
    const arena = root.querySelector('[data-live-arena]');
    const fxRoot = root.querySelector('[data-live-fx]');
    const desktopMessage = root.querySelector('[data-live-message]');
    const focusMessage = root.querySelector('[data-live-focus-message]');
    const resultSlot = root.querySelector('[data-live-result-slot]');
    const phaseSlot = root.querySelector('[data-live-phase-slot]');
    if (preservedPhase) { preservedPhase.className = 'battle-v2-live-phase'; phaseSlot.appendChild(preservedPhase); }
    if (preservedMsg) {
      preservedMsg.className = 'battle-message battle-v2-live-result';
      preservedMsg.innerHTML = '';
      resultSlot.appendChild(preservedMsg);
      new MutationObserver(() => preservedMsg.classList.toggle('is-visible', Boolean(preservedMsg.textContent.trim()))).observe(preservedMsg, { childList:true, subtree:true, characterData:true });
    }

    root.querySelector('[data-live-summary="A"]').innerHTML = teamSummaryHtml(v2.teams.A, mode === 'PVE' ? 'MEMBER TEAM' : 'MY PVP TEAM', state.playerName);
    root.querySelector('[data-live-summary="B"]').innerHTML = teamSummaryHtml(v2.teams.B, mode === 'PVE' ? (monster?.isBoss ? 'BOSS MONSTER' : 'MONSTER') : 'OPPONENT TEAM', state.opponentName);
    root.querySelector('[data-live-field="A"]').innerHTML = cardsA.map(card => cardHtml(card)).join('');
    root.querySelector('[data-live-field="B"]').innerHTML = cardsB.map(card => cardHtml(card)).join('');

    const fighterState = id => state.cards.get(String(id)) || null;
    const fighterNodes = id => [...root.querySelectorAll('.battle-card-v2')].filter(node => node.dataset.fighterId === String(id) || node.dataset.focusFighterId === String(id));
    const isFocus = () => true;
    const fighterNode = id => {
      if (isFocus()) {
        const focus = [...root.querySelectorAll('[data-focus-fighter-id]')].find(node => node.dataset.focusFighterId === String(id) && node.offsetParent !== null);
        if (focus) return focus;
      }
      return [...root.querySelectorAll('[data-fighter-id]')].find(node => node.dataset.fighterId === String(id)) || null;
    };
    const firstLiving = side => [...state.cards.values()].find(card => card.side === side && Number(card.hp || 0) > 0) || [...state.cards.values()].find(card => card.side === side) || null;

    function updateNode(node, card) {
      if (!node || !card) return;
      const hp = Math.max(0, Number(card.hp || 0));
      const hpPct = hp / Math.max(1, Number(card.maxHp || 1)) * 100;
      const shield = Math.max(0, Number(card.shield || 0));
      const shieldPct = Number(card.maxShield || 0) > 0 ? shield / Number(card.maxShield) * 100 : 0;
      const hpFill = node.querySelector('.hp-track i'); if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, hpPct))}%`;
      const shieldFill = node.querySelector('.shield-track i'); if (shieldFill) shieldFill.style.width = `${Math.max(0, Math.min(100, shieldPct))}%`;
      const hpValue = node.querySelector('.hp-value'); if (hpValue) hpValue.textContent = `${number(hp)} / ${number(card.maxHp)}`;
      node.querySelector('.gauge-ring')?.style.setProperty('--gauge', Math.max(0, Math.min(100, Number(card.gauge || 0))));
      node.classList.toggle('is-ko', hp <= 0);
    }
    function updateCard(id, changes = {}) {
      const card = fighterState(id); if (!card) return null;
      Object.assign(card, changes); fighterNodes(id).forEach(node => updateNode(node, card)); syncRosters(card.side); return card;
    }
    function syncRosters(side) {
      const active = side === 'A' ? state.activeAId : state.activeBId;
      const roster = root.querySelector(`[data-live-roster="${side}"]`);
      if (roster) roster.innerHTML = [...state.cards.values()].filter(card => card.side === side).map(card => miniCardHtml(card, active)).join('');
    }
    function syncFocus(side) {
      const slot = root.querySelector(`[data-live-focus-slot="${side}"]`);
      if (!slot) return;
      let id = side === 'A' ? state.activeAId : state.activeBId;
      let card = fighterState(id) || firstLiving(side);
      if (!card) return;
      if (side === 'A') state.activeAId = String(card.id); else state.activeBId = String(card.id);
      slot.innerHTML = cardHtml(card, true);
    }
    function syncFocusStage() { syncFocus('A'); syncFocus('B'); syncRosters('A'); syncRosters('B'); }
    function setActive(actorId, targetId) {
      const actor = fighterState(actorId), target = fighterState(targetId);
      if (actor?.side === 'A') state.activeAId = String(actor.id); if (actor?.side === 'B') state.activeBId = String(actor.id);
      if (target?.side === 'A') state.activeAId = String(target.id); if (target?.side === 'B') state.activeBId = String(target.id);
      if (isFocus()) syncFocusStage();
    }
    function focusTarget(id) { const card = fighterState(id); if (!card) return; if (card.side === 'A') state.activeAId = String(card.id); else state.activeBId = String(card.id); if (isFocus()) syncFocusStage(); }
    function applyLayout(force = false) {
      const next = resolveLayout(); if (!force && next === state.layout) return;
      state.layout = next; root.classList.remove('layout-desktop','layout-wago','layout-mobile-portrait','layout-mobile-landscape'); root.classList.add(`layout-${next}`);
      const [label, detail] = layoutCopy(next); const badge=root.querySelector('[data-layout-badge]'); const detailNode=root.querySelector('[data-layout-detail]'); if(badge) badge.textContent=label; if(detailNode) detailNode.textContent=detail;
      root.querySelector('[data-live-focus]')?.setAttribute('aria-hidden', next === 'desktop' ? 'true' : 'false'); syncFocusStage();
    }
    function setMessage(kicker, title, detail) { const html = `<small>${esc(kicker)}</small><strong>${esc(title)}</strong><span>${esc(detail)}</span>`; desktopMessage.innerHTML = html; focusMessage.innerHTML = html; }
    function renderOrder(cursor) {
      const upcoming = (v2.result?.timeline || []).slice(cursor).filter(event => event.type === 'TURN' || event.type === 'COUNTER').slice(0, 11);
      if(MOBILE_LOW_FX && cursor % 2) return;
      root.querySelector('[data-live-order]').innerHTML = upcoming.map(event => { const card = fighterState(event.actorId); return card ? `<span class="order-chip ${String(card.side).toLowerCase()}" title="${esc(card.title)}"><img src="${assetUrl(card.image)}" alt="" onerror="window.battleV2ImageFallback(this)"></span>` : ''; }).join('') || '<small>행동 순서 계산 완료</small>';
    }
    function pointFor(node) { const ar = arena.getBoundingClientRect(), r = node?.getBoundingClientRect?.(); return r ? { x:r.left-ar.left+r.width/2, y:r.top-ar.top+r.height/2 } : { x:ar.width/2, y:ar.height/2 }; }
    function magicPointFor(node,host){const hr=host.getBoundingClientRect(),r=node?.getBoundingClientRect?.(),margin=Math.min(132,Math.max(76,Math.min(hr.width,hr.height)*.16)),rawX=r?r.left-hr.left+r.width/2:hr.width*.7,rawY=r?r.top-hr.top+r.height/2:hr.height*.46;return{x:Math.max(margin,Math.min(hr.width-margin,rawX)),y:Math.max(margin,Math.min(hr.height-margin,rawY))};}
    function damageNumber(node, value, className = '') { if (!node) return; const p=pointFor(node), el=document.createElement('b'); el.className=`damage-number ${className}`; el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.textContent=value;fxRoot.appendChild(el);setTimeout(()=>el.remove(),700); }
    function pulse(node, cls, duration=420) { if (!node) return; node.classList.remove(cls);void node.offsetWidth;node.classList.add(cls);setTimeout(()=>node.classList.remove(cls),Math.round(duration/PLAYBACK_SPEED)); }
    function triggerFx(node, type, event='attack') { if (!node || !type) return; node.classList.remove('unique-fx-active','unique-fx-attack-active','unique-fx-defense-active','unique-fx-low-hp-active');void node.offsetWidth;node.classList.add('unique-fx-active',`unique-fx-${event}-active`,'unique-fx-source-active');clearTimeout(node._v2Fx);node._v2Fx=setTimeout(()=>node.classList.remove('unique-fx-active',`unique-fx-${event}-active`,'unique-fx-source-active'),Math.round((type==='hp'?1450:1100)/PLAYBACK_SPEED)); }
    function impactFx(actorNode,targetNode,type='attack',label='') { if(!actorNode||!targetNode)return;if(MOBILE_LOW_FX){const t=pointFor(targetNode),beam=document.createElement('i');beam.className=`battle-v2-burst burst-${type}`;beam.style.left=`${t.x}px`;beam.style.top=`${t.y}px`;fxRoot.appendChild(beam);setTimeout(()=>beam.remove(),360);return;}const s=pointFor(actorNode),t=pointFor(targetNode),mx=(s.x+t.x)/2,my=(s.y+t.y)/2,d=Math.max(90,Math.hypot(t.x-s.x,t.y-s.y)),angle=Math.atan2(t.y-s.y,t.x-s.x)*180/Math.PI,host=document.createElement('div'),size=Math.min(190,Math.max(118,d*.32));host.className=`unique-stage-fx unique-card-fx-host unique-fx-${type} unique-fx-active unique-fx-attack-active${type==='attack'?' unique-fx-between-targets':''}`;host.style.left=`${mx-size/2}px`;host.style.top=`${my-size/2}px`;host.style.width=`${size}px`;host.style.height=`${size}px`;host.style.setProperty('--unique-fx-angle',`${angle}deg`);if(t.x<s.x)host.classList.add('unique-fx-reverse');host.innerHTML=uniqueFxMarkup(type);if(label)host.querySelector('b')?.replaceChildren(document.createTextNode(label));fxRoot.appendChild(host);const beam=document.createElement('i');beam.className=`battle-v2-impact impact-${type}`;beam.style.left=`${s.x}px`;beam.style.top=`${s.y}px`;beam.style.width=`${d}px`;beam.style.setProperty('--impact-angle',`${angle}deg`);fxRoot.appendChild(beam);setTimeout(()=>{host.remove();beam.remove()},Math.round(1100/PLAYBACK_SPEED)); }
    function burstFx(node,type='attack',critical=false){if(!node)return;if(MOBILE_LOW_FX&&fxRoot.childElementCount>5)return;const p=pointFor(node),b=document.createElement('i');b.className=`battle-v2-burst burst-${type}${critical?' is-critical':''}`;b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;fxRoot.appendChild(b);setTimeout(()=>b.remove(),Math.round(850/PLAYBACK_SPEED));}

    function startMagicWebGL(canvas,targetNode,kind,effectType){
      if(!canvas||MOBILE_LOW_FX)return()=>{};
      const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true});if(!gl)return()=>{};
      const palette={attack:[.72,.22,1],defense:[.2,.82,1],hp:[.22,1,.58],speed:[1,.82,.2]},modes={OPENING_ATTACK:0,GUARD_BARRIER:1,LIFE_AMPLIFY:2,CRISIS_HEAL:3,PUNISH_TRAP:4,ARCANE_COUNTER:5,FOLLOWUP_HASTE:6},color=palette[kind]||palette.attack,mode=modes[String(effectType||'').toUpperCase()]??0,started=performance.now();let frame=0,dead=false;
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'magic shader');return s;};
      const program=(vs,fs)=>{const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'magic program');return p;};
      let field,particles;
      try{
        field=program('attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}',`precision mediump float;uniform vec2 r,t;uniform float u,m;uniform vec3 c;void main(){vec2 q=(gl_FragCoord.xy-t)/min(r.x,r.y);float d=length(q),a=atan(q.y,q.x),open=smoothstep(.08,.34,u)*smoothstep(1.,.7,u);float sides=m<.5?3.:m<1.5?6.:m<2.5?5.:m<3.5?8.:m<4.5?4.:m<5.5?12.:10.;float glyph=cos(a*sides+m)*.016;float seal=exp(-95.*abs(d-.18-glyph))*open;float spiral=exp(-42.*abs(fract(d*(3.+mod(m,3.))-a*(.42+m*.09)-u*(1.4+m*.12))-.5))*(1.-smoothstep(.05,.43,d))*open;float spokes=pow(max(0.,cos(a*sides+u*3.)),18.)*exp(-8.*d)*open;float core=exp(-36.*d)*smoothstep(.48,.72,u)*smoothstep(1.,.82,u);float flash=exp(-18.*d)*smoothstep(.78,.83,u)*smoothstep(.96,.84,u);float alpha=(seal*.62+spiral*.2+spokes*.3+core*.55+flash)*smoothstep(.5,.3,d);gl_FragColor=vec4(mix(c,vec3(1.),flash+core*.28),alpha);}`);
        particles=program(`attribute vec3 s;uniform vec2 r,t;uniform float u,m;varying float a;void main(){float phase=s.x*6.2831+u*(2.+s.z*2.);float collapse=smoothstep(.5,.82,u),radius=mix(.42,.07,collapse)*(.55+s.y*.55);vec2 orbit=vec2(cos(phase),sin(phase))*radius;orbit.y*=.72;if(m<.5){orbit.y-=mix(.35,0.,collapse)*(s.y+.2);}else if(m<1.5){float k=floor(s.x*6.)/6.*6.2831;orbit=vec2(cos(k),sin(k))*radius;}else if(m<2.5){orbit.y+=sin(phase*2.)*.08*(1.-collapse);}else if(m<3.5){orbit*=.72+.28*sin(phase*3.);orbit.y-=.08*(1.-collapse);}else if(m<4.5){float k=floor(s.x*4.)/4.*6.2831;orbit=vec2(cos(k),sin(k))*radius;}else if(m<5.5){orbit.x=abs(orbit.x)*(s.x>.5?1.:-1.);orbit.y*=1.3;}else{radius=mix(.45,.09,collapse)*(.65+s.y*.35);orbit=vec2(cos(phase+s.y*3.),sin(phase+s.y*3.))*radius;}vec2 pos=t+orbit*min(r.x,r.y),clip=pos/r*2.-1.;gl_Position=vec4(clip,0.,1.);gl_PointSize=(2.5+s.z*5.)*(1.+smoothstep(.7,.84,u)*1.8);a=smoothstep(.34,.48,u)*smoothstep(1.,.84,u);}`,`precision mediump float;uniform vec3 c;varying float a;void main(){float d=length(gl_PointCoord-.5),glow=smoothstep(.5,0.,d);gl_FragColor=vec4(mix(c,vec3(1.),glow*.6),glow*glow*a);}`);
      }catch(error){console.warn('Magic WebGL fallback',error);return()=>{};}
      const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const seeds=new Float32Array(220*3);for(let i=0;i<seeds.length;i++)seeds[i]=Math.random();const cloud=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cloud);gl.bufferData(gl.ARRAY_BUFFER,seeds,gl.STATIC_DRAW);
      const resize=()=>{const d=Math.min(1.5,devicePixelRatio||1),w=Math.max(1,Math.round(canvas.clientWidth*d)),h=Math.max(1,Math.round(canvas.clientHeight*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return d;};
      const draw=now=>{if(dead)return;const dpr=resize(),rect=canvas.getBoundingClientRect(),tr=targetNode?.getBoundingClientRect?.(),margin=Math.min(canvas.width,canvas.height)*.16,rawX=((tr?tr.left+tr.width/2:rect.left+rect.width*.7)-rect.left)*dpr,rawY=(rect.bottom-(tr?tr.top+tr.height/2:rect.top+rect.height*.45))*dpr,x=Math.max(margin,Math.min(canvas.width-margin,rawX)),y=Math.max(margin,Math.min(canvas.height-margin,rawY)),u=Math.min(1,(now-started)/1050);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(field);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const fp=gl.getAttribLocation(field,'p');gl.enableVertexAttribArray(fp);gl.vertexAttribPointer(fp,2,gl.FLOAT,false,0,0);gl.uniform2f(gl.getUniformLocation(field,'r'),canvas.width,canvas.height);gl.uniform2f(gl.getUniformLocation(field,'t'),x,y);gl.uniform1f(gl.getUniformLocation(field,'u'),u);gl.uniform1f(gl.getUniformLocation(field,'m'),mode);gl.uniform3fv(gl.getUniformLocation(field,'c'),color);gl.drawArrays(gl.TRIANGLES,0,6);
        gl.useProgram(particles);gl.bindBuffer(gl.ARRAY_BUFFER,cloud);const ps=gl.getAttribLocation(particles,'s');gl.enableVertexAttribArray(ps);gl.vertexAttribPointer(ps,3,gl.FLOAT,false,0,0);gl.uniform2f(gl.getUniformLocation(particles,'r'),canvas.width,canvas.height);gl.uniform2f(gl.getUniformLocation(particles,'t'),x,y);gl.uniform1f(gl.getUniformLocation(particles,'u'),u);gl.uniform1f(gl.getUniformLocation(particles,'m'),mode);gl.uniform3fv(gl.getUniformLocation(particles,'c'),color);gl.drawArrays(gl.POINTS,0,220);if(u<1)frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
      return()=>{dead=true;cancelAnimationFrame(frame);};
    }

    async function playMagicCardSummon(event,kind){
      const effect=String(event.effectType||'').toLowerCase().replace(/_/g,'-'),rarity=String(event.magicRarity||'R').toUpperCase().replace(/[^A-Z]/g,''),overlay=document.createElement('div');
      overlay.className=`magic-card-cinematic magic-kind-${kind} magic-effect-${effect} magic-rarity-${rarity}`;
      overlay.innerHTML=`<div class="magic-cinematic-dim"></div><canvas class="magic-gl-layer" aria-hidden="true"></canvas><div class="magic-cinematic-runes"><i></i><i></i><i></i></div><div class="magic-unique-stage" aria-hidden="true">${'<i></i>'.repeat(12)}<b></b></div><div class="magic-target-seal"><i>ᚱ</i><i>ᛉ</i><i>ᚨ</i><i>ᛟ</i><b></b></div><div class="magic-cinematic-card"><div class="magic-cinematic-frame"><div class="magic-cinematic-art">${event.magicImageUrl?`<img src="${assetUrl(event.magicImageUrl)}" alt="${esc(event.magicName||'마법카드')}" onerror="this.remove()">`:'<b>✦</b>'}</div><small>${esc(rarity)} · MAGIC CARD</small><strong>${esc(event.magicName||event.magicCode||'마법카드')}</strong></div></div><div class="magic-cinematic-release"><i></i><i></i><i></i><b>${esc(event.magicName||'MAGIC')}</b></div>`;
      arena.appendChild(overlay);void overlay.offsetWidth;overlay.classList.add('is-playing');setMessage('MAGIC CARD',event.magicName||event.magicCode||'마법카드','마력이 전장에 전개됩니다.');
      await sleep(1120);const targetNode=fighterNode(event.targetId||event.actorId),targetPoint=magicPointFor(targetNode,overlay);overlay.style.setProperty('--magic-target-x',`${targetPoint.x}px`);overlay.style.setProperty('--magic-target-y',`${targetPoint.y}px`);overlay.classList.add('is-releasing');const stopGL=startMagicWebGL(overlay.querySelector('.magic-gl-layer'),targetNode,kind,event.effectType);await sleep(1900);stopGL();overlay.remove();
    }

    async function eventPlay(event) {
      renderOrder(state.cursor);
      // V1319: 판정·타임라인은 그대로 유지하고 후반부 재생 시간만 단계적으로 압축한다.
      const base = state.cursor >= 80 ? 260 : state.cursor >= 40 ? 330 : 420;
      if(event.type==='MAGIC_CARD'){
        const kind={OPENING_ATTACK:'attack',GUARD_BARRIER:'defense',LIFE_AMPLIFY:'hp',CRISIS_HEAL:'hp',PUNISH_TRAP:'attack',ARCANE_COUNTER:'defense',FOLLOWUP_HASTE:'speed'}[event.effectType]||'attack',targetId=event.targetId||event.actorId;
        focusTarget(targetId);await playMagicCardSummon(event,kind);
        const target=updateCard(targetId,{hp:event.hpAfter??event.targetHpAfter,shield:event.targetShieldAfter,gauge:event.gaugeAfter}),actorNode=fighterNode(event.actorId),targetNode=fighterNode(targetId);
        arena.classList.remove('magic-field-attack','magic-field-defense','magic-field-hp','magic-field-speed');void arena.offsetWidth;arena.classList.add(`magic-field-${kind}`);setTimeout(()=>arena.classList.remove(`magic-field-${kind}`),1100);
        triggerFx(actorNode,kind,kind==='defense'?'defense':kind==='hp'?'low-hp':'attack');pulse(actorNode,'is-acting',900);
        if(event.damage||event.absorbed){burstFx(targetNode,kind,true);damageNumber(targetNode,`-${number(Number(event.damage||0)+Number(event.absorbed||0))}`,'critical');}
        else if(event.amount){burstFx(targetNode,'hp');damageNumber(targetNode,`+${number(event.amount)}`,'heal');}
        else burstFx(targetNode||actorNode,kind,true);
        setMessage('MAGIC RELEASE',event.magicName||event.magicCode||'마법카드',`${target?.title||''} · 전장 효과 발동`);await sleep(base*1.35);return;
      }
      if (event.type === 'START_EFFECT') { focusTarget(event.targetId); const target=updateCard(event.targetId,{shield:event.shieldAfter});const node=fighterNode(event.targetId);triggerFx(node,'defense','defense');pulse(node,'is-shield',800);damageNumber(node,`SHIELD +${number(event.amount)}`,'shield');setMessage('UNIQUE DEFENSE','선봉 방벽',`${target?.title||''} · 피해 흡수 ${number(event.amount)}`);await sleep(base*.95);return; }
      if (event.type === 'MAGIC_CARD') { const kind={OPENING_ATTACK:'attack',GUARD_BARRIER:'defense',LIFE_AMPLIFY:'hp',CRISIS_HEAL:'hp',PUNISH_TRAP:'attack',ARCANE_COUNTER:'defense',FOLLOWUP_HASTE:'speed'}[event.effectType]||'attack';const targetId=event.targetId||event.actorId;focusTarget(targetId);const target=updateCard(targetId,{hp:event.hpAfter??event.targetHpAfter,shield:event.targetShieldAfter,gauge:event.gaugeAfter});const actorNode=fighterNode(event.actorId),targetNode=fighterNode(targetId);triggerFx(actorNode,kind,kind==='defense'?'defense':kind==='hp'?'low-hp':'attack');pulse(actorNode,'is-acting',900);if(event.damage||event.absorbed){impactFx(actorNode,targetNode,kind,'MAGIC');burstFx(targetNode,kind,true);damageNumber(targetNode,`-${number(Number(event.damage||0)+Number(event.absorbed||0))}`,'critical');}else if(event.amount){burstFx(targetNode,'hp');damageNumber(targetNode,`+${number(event.amount)}`,'heal');}else damageNumber(actorNode,`MAGIC +${number(event.value)}%`,kind==='defense'?'shield':'heal');setMessage('MAGIC CARD',event.magicName||event.magicCode||'마법카드',`${target?.title||''} · ${event.activation||1}/${event.maxActivations||1}회 발동`);await sleep(base*.95);return; }
      if (event.type === 'PVE_ULTIMATE') { const target=fighterState(event.targetId);focusTarget(event.targetId);if (playUltimateCinematics && data.activatedUltimate && mode==='PVE') { const ult={...data.activatedUltimate,playbackRate:PLAYBACK_SPEED,durationMs:Math.max(500,Math.round(Number(data.activatedUltimate.durationMs||3000)/PLAYBACK_SPEED))};try{await playBattleUltimate(root,ult,event.damage||data.ultimateDamage)}catch{}}const visualHp=(mode==='PVE'&&data.result!=='WIN'&&target?.side==='B')?Math.max(1,Number(event.targetHpAfter||0)):event.targetHpAfter;updateCard(event.targetId,{hp:visualHp,shield:event.targetShieldAfter});const node=fighterNode(event.targetId);impactFx(fighterNode(state.activeAId),node,'attack','ULTIMATE');burstFx(node,'attack',true);damageNumber(node,`-${number(Number(event.damage||0)+Number(event.absorbed||0))}`,'critical');setMessage('ULTIMATE','ULTIMATE HIT',target?.title||'MONSTER');await sleep(Math.max(420, base));return; }
      if (event.type === 'BOSS_ULTIMATE') { if(playUltimateCinematics&&data.bossUltimate&&mode==='PVE'){const ult={...data.bossUltimate,playbackRate:PLAYBACK_SPEED,durationMs:Math.max(500,Math.round(Number(data.bossUltimate.durationMs||2400)/PLAYBACK_SPEED))};try{await playBossBattleUltimate(root,preservedPhase,ult)}catch{}}for(const hit of event.hits||[])updateCard(hit.targetId,{hp:hit.targetHpAfter,shield:hit.targetShieldAfter});setMessage('BOSS ULTIMATE','광역 공격',`${(event.hits||[]).length}명 타격`);await sleep(Math.max(440, base));return; }
      if (event.type === 'SINGLE_HEALER_AURA') { for(const item of event.targets||[])updateCard(item.targetId,{hp:item.hpAfter,maxHp:item.maxHp});focusTarget(event.actorId);const node=fighterNode(event.actorId);triggerFx(node,'hp','low-hp');pulse(node,'is-heal',900);setMessage('LIFE LINK','단일 힐러 생명 연결',`아군 전체 최대 HP +${number(event.teamHpPercent)}%`);await sleep(base*.9);return; }
      if (event.type === 'TEAM_HEAL') { focusTarget(event.targetId);const target=updateCard(event.targetId,{hp:event.hpAfter,maxHp:event.maxHp});const actorNode=fighterNode(event.actorId),node=fighterNode(event.targetId);triggerFx(actorNode,'hp','low-hp');pulse(node,'is-heal',900);burstFx(node,'hp');damageNumber(node,`+${number(event.amount)}`,'heal');setMessage('LIFE LINK',event.crisis?'위기 집중 회복':'아군 회복',`${target?.title||''} · ${number(event.activation)}/${number(event.maxActivations)}회`);await sleep(base*.9);return; }
      if (event.type === 'REGEN' || event.type === 'EMERGENCY_HEAL' || event.type === 'SURVIVE') { focusTarget(event.targetId);const target=updateCard(event.targetId,{hp:event.hpAfter});const node=fighterNode(event.targetId);node?.classList.remove('is-ko');triggerFx(node,'hp','low-hp');pulse(node,'is-heal',820);burstFx(node,'hp');damageNumber(node,`+${number(event.amount||event.hpAfter)}`,'heal');setMessage('LIFE EFFECT',event.type==='REGEN'?'지속 회복':event.type==='SURVIVE'?'불굴의 생존':'긴급 회복',target?.title||'');await sleep(base*.9);return; }
      if (event.type === 'TURN' || event.type === 'COUNTER') { setActive(event.actorId,event.targetId);const actor=fighterState(event.actorId),target=fighterState(event.targetId),an=fighterNode(event.actorId),tn=fighterNode(event.targetId),actorType=typeKey(actor?.type)||'attack';pulse(an,'is-acting',720);triggerFx(an,actorType,event.type==='COUNTER'?'defense':'attack');arena.classList.remove('flash-a','flash-b');void arena.offsetWidth;arena.classList.add(actor?.side==='A'?'flash-a':'flash-b');if(event.dodge){triggerFx(tn,'speed','attack');pulse(tn,'is-dodge',720);impactFx(an,tn,'speed','DODGE');damageNumber(tn,'DODGE','shield');setMessage('SPEED EFFECT','DODGE',`${target?.title||''}이 공격을 회피했습니다.`);await sleep(base);return;}impactFx(an,tn,event.type==='COUNTER'?'defense':actorType,event.type==='COUNTER'?'COUNTER':actor?.typeLabel||'HIT');await sleep(180);pulse(tn,event.absorbed>0?'is-guard-hit':'is-hit',520);if(event.absorbed>0||target?.type==='DEFENSE')triggerFx(tn,'defense','defense');burstFx(tn,event.absorbed>0?'defense':actorType,event.critical);updateCard(event.actorId,{gauge:event.actorGaugeAfter??actor?.gauge??0});const visualHp=(mode==='PVE'&&data.result!=='WIN'&&target?.side==='B')?Math.max(1,Number(event.targetHpAfter||0)):event.targetHpAfter;updateCard(event.targetId,{hp:visualHp,shield:event.targetShieldAfter,gauge:event.targetGaugeAfter??target?.gauge??0});const total=Number(event.damage||0)+Number(event.absorbed||0);damageNumber(tn,`${event.critical?'CRITICAL ':''}-${number(total)}`,event.critical?'critical':event.absorbed>0?'shield':'');setMessage(event.type==='COUNTER'?'DEFENSE EFFECT':`${actor?.typeLabel||'BATTLE'} ACTION`,event.type==='COUNTER'?'COUNTER':event.critical?'CRITICAL':event.execute?'EXECUTE':'ATTACK',`${actor?.title||''} → ${target?.title||''}${event.penetration?` · 관통 ${event.penetration}%`:''}`);await sleep(base);return; }
      if (event.type === 'KO') { const current=fighterState(event.targetId);if(mode==='PVE'&&data.result!=='WIN'&&current?.side==='B'){focusTarget(event.targetId);updateCard(event.targetId,{hp:Math.max(1,Number(current.hp||1)),gauge:0});setMessage('BATTLE STATE','MONSTER SURVIVED',current?.title||'MONSTER');await sleep(base*.45);return;}focusTarget(event.targetId);const target=updateCard(event.targetId,{hp:0,gauge:0});const node=fighterNode(event.targetId);node?.classList.add('is-ko');pulse(node,'is-ko-burst',900);burstFx(node,'ko',true);setMessage('BATTLE STATE','K.O.',target?.title||'');await sleep(base*.72);return; }
      if (event.type === 'FRONTLINE_BREAK') { arena.classList.add(event.side==='A'?'front-break-a':'front-break-b');setMessage('FORMATION BREAK','전열 붕괴',event.label||'후열이 노출됩니다.');await sleep(base*1.05);arena.classList.remove('front-break-a','front-break-b');return; }
      if (event.type === 'RESULT') { const winner=event.winner==='A'?state.playerName:event.winner==='B'?state.opponentName:'무승부';const survived=event.reason==='MONSTER_SURVIVED';setMessage('BATTLE RESULT',event.winner==='DRAW'?'DRAW':event.winner==='A'?'VICTORY':'DEFEAT',survived?`${state.opponentName} 생존 · 제한 행동 내 처치 실패`:`${winner} · ${event.actions}회 행동 · 생존 HP ${event.teamAHpPercent}% : ${event.teamBHpPercent}%`);arena.classList.add(event.winner==='A'?'result-a':event.winner==='B'?'result-b':'result-draw');await sleep(base*1.25); }
    }

    state.activeAId=String(firstLiving('A')?.id||'');state.activeBId=String(firstLiving('B')?.id||'');
    const onResize=()=>applyLayout(); window.__battleV2LiveCleanup?.(); window.__battleV2LiveCleanup=()=>{window.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('resize',onResize)};window.addEventListener('resize',onResize,{passive:true});window.visualViewport?.addEventListener('resize',onResize,{passive:true});
    applyLayout(true);syncFocusStage();renderOrder(0);setMessage('TACTICAL BATTLE','READY','HP·공격·방어·속도와 고유효과 전투 준비 완료');

    return {
      async play() { const timeline=v2.result?.timeline||[];for(let i=0;i<timeline.length;i++){if(!document.documentElement.contains(root))break;state.cursor=i;await eventPlay(timeline[i]);} },
      showResult() { preservedMsg?.classList.add('is-visible'); },
      destroy() { window.__battleV2LiveCleanup?.(); }
    };
  }

  async function finishPve({ stage, phase, msg, modal, data, renderer }) {
    const win = data.result === 'WIN';
    const reason = String(data.battleV2?.result?.reason || '');
    const actions = Math.max(0, Number(data.battleV2?.result?.actions || 0));
    stage.classList.add(win ? 'battle-win-v863' : 'battle-lose-v863');
    phase.textContent = win ? 'MISSION CLEAR' : reason === 'MONSTER_SURVIVED' ? 'MISSION FAILED · MONSTER SURVIVED' : 'MISSION FAILED';
    battleSfx(win ? 'victory' : 'defeat');
    if (data.cubeReward && window.showCubeDropAcquisition) { try { await window.showCubeDropAcquisition(data.cubeReward); } catch (error) { console.warn(error); } }
    if (data.equipmentReward && window.showEquipmentDropReward) { try { await window.showEquipmentDropReward(data.equipmentReward); } catch (error) { console.warn(error); } }
    const playerPower = Number(data.battleV2?.teams?.A?.summary?.power || data.playerPower || 0);
    const monsterPower = Number(data.monsterPower || data.battleV2?.teams?.B?.summary?.power || 0);
    const coinReward = Math.max(0, Number(data.reward || 0));
    const magicReward = Math.max(0, Number(data.magicReward?.amount || 0));
    const actionMeta = actions > 0 ? `<span>${number(actions)} ACTIONS</span>` : '';
    const survivedMeta = reason === 'MONSTER_SURVIVED' ? '<span>MONSTER SURVIVED</span>' : '';
    const cardRewardHtml = data.cardReward ? `<div class="pvp-result-reward pve-card-result-reward"><small>CARD REWARD</small><b>${esc(data.cardReward.card.grade)} · ${esc(data.cardReward.card.title)}</b><span>${data.cardReward.duplicate ? `중복 카드 · 조각 +${number(data.cardReward.shardGained)}` : '신규 카드 획득'}</span></div>` : '';
    msg.innerHTML = `<div class="pvp-v2-result pve-v2-result ${win?'is-win':'is-loss'}">
      <div class="pvp-result-glow" aria-hidden="true"></div>
      <div class="pvp-result-kicker">SOOPKETMON · PVE RESULT</div>
      <strong class="pvp-result-title">${win?'VICTORY':'DEFEAT'}</strong>
      <div class="pvp-result-power"><b>${number(playerPower)}</b><i>VS</i><b>${number(monsterPower)}</b></div>
      <div class="pvp-result-meta"><span>ENGINE V2 · 1.6X</span>${actionMeta}${survivedMeta}</div>
      <div class="pvp-result-rewards">
        <div class="pvp-result-reward"><small>PVE COIN</small><b>${win?'+':''}${number(coinReward)}</b></div>
        ${magicReward>0?`<div class="pvp-result-reward"><small>MAGIC CRYSTAL</small><b>✦ +${number(magicReward)}</b></div>`:''}
        ${cardRewardHtml}
      </div>
      ${win?'':`<div class="pve-result-tip">${reason==='MONSTER_SURVIVED'?'제한 행동 안에 몬스터를 처치하지 못했습니다.':'장비·강화·전열 구성을 조정한 뒤 다시 도전하세요.'}</div>`}
      <button type="button" class="btn pvp-result-confirm" id="pveResultConfirm">PVE 화면으로 돌아가기</button>
      <em class="pvp-result-tap">화면을 눌러도 돌아갑니다</em>
    </div>`;
    renderer.showResult();

    battleState.energy = data.energy || battleState.energy;
    battleState.serverOffset = Date.parse(data.serverNow || new Date().toISOString()) - Date.now();
    saveUser(apiUserToLocal(data.user));
    if (battleState.autoRunning) {
      const summary = battleState.autoSummary || (battleState.autoSummary={battles:0,wins:0,losses:0,totalReward:0,magicCrystals:0,cardRewards:[],equipmentRewards:[]});
      summary.battles++;summary.totalReward+=Number(data.reward||0);summary.magicCrystals+=Number(data.magicReward?.amount||0);if(win)summary.wins++;else summary.losses++;if(data.cardReward)summary.cardRewards.push(data.cardReward);if(data.equipmentReward)summary.equipmentRewards.push(data.equipmentReward);
      battleState.autoRemaining=Math.max(0,Number(battleState.autoRemaining||0)-1);const available=Math.floor(Number(battleState.energy?.energy||0)/Math.max(1,Number(battleState.energy?.costPerBattle||1))),remaining=Math.min(Number(battleState.autoRemaining||0),available);
      if(remaining>0){msg.insertAdjacentHTML('beforeend',`<em class="auto-battle-next">자동전투 ${summary.battles}회 완료 · ${remaining}회 남음<br>잠시 후 다음 전투가 시작됩니다. 화면을 누르면 중단합니다.</em>`);modal.onclick=()=>{battleState.autoRunning=false;renderer.destroy();renderShell('battle')};setTimeout(()=>{if(battleState.autoRunning){modal.onclick=null;renderer.destroy();startBattle()}},Math.round(1600/PLAYBACK_SPEED));}
      else{battleState.autoRunning=false;const boxes=(summary.equipmentRewards||[]).reduce((sum,reward)=>sum+Math.max(1,Number(reward?.quantity||1)),0);msg.insertAdjacentHTML('beforeend',`<div class="battle-auto-total"><b>자동전투 ${summary.battles}회 완료</b><span>승리 ${summary.wins} · 패배 ${summary.losses} · 코인 ◈ ${number(summary.totalReward)}</span>${summary.magicCrystals>0?`<small>마법 결정 ✦ ${number(summary.magicCrystals)}개</small>`:''}${summary.cardRewards.length?`<small>카드 획득 ${summary.cardRewards.length}장</small>`:''}${boxes?`<small>보급상자 획득 ${boxes}개</small>`:''}</div>`);setTimeout(()=>{modal.onclick=()=>{renderer.destroy();renderShell('battle')}},450);}
    } else setTimeout(()=>{modal.onclick=()=>{renderer.destroy();renderShell('battle')}},450);
  }

  window.playPveBattleV2Live = async options => {
    const renderer=createRenderer({...options,mode:'PVE'});await renderer.play();await sleep(420);await finishPve({...options,renderer});
  };
  window.playPvpBattleV2Live = async options => {
    const renderer=createRenderer({...options,mode:'PVP'});options.modal.__battleV2Renderer=renderer;await renderer.play();await sleep(320);renderer.showResult();
  };
  window.playSiegeBattleV2Live = async options => {
    const renderer=createRenderer({...options,mode:'PVE'});options.modal.__battleV2Renderer=renderer;await renderer.play();await sleep(320);renderer.showResult();return renderer;
  };
})();
