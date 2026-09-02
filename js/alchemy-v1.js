/* SOOPKETMON ALCHEMY LAB V1
 * Production renderer. Preview pages may inject a request adapter, but the
 * screen, selection rules and result presentation are shared with live.
 */
(() => {
  'use strict';

  const TYPE_LABELS = { CARD: '카드', EQUIPMENT: '장비', ITEM: '아이템', VEHICLE: '이동수단' };
  const TYPE_TABS = ['CARD', 'EQUIPMENT'];
  const SPECIAL_REWARD_IDS = new Set(['BLACK_MIRACLE_PACK', 'SCRAPYARD_ENTRY_TICKET', 'MASTER_STAR']);
  const RARITY_LABELS = {
    C: '일반', U: '고급', R: '희귀', SR: '영웅', HR: '전설', UR: '신화', SSR: '초월',
    MA: '마스터', LIMITED: '리미티드', PRESTIGE: '프레스티지', FUR: 'FUR', ZENITH: '제니스', SUPERSTAR: '슈퍼스타',
    NORMAL: '일반', MAGIC: '고급', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설', MYTHIC: '신화',
    PREMIUM: '프리미엄', HIGH: '고급', SPECIAL: '특수'
  };
  const RARITY_ORDER = ['NORMAL', 'MAGIC', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'SSR', 'MA', 'LIMITED', 'PRESTIGE', 'FUR', 'ZENITH', 'SUPERSTAR'];
  const RARITY_BUCKET = {
    C: 'NORMAL', NORMAL: 'NORMAL', U: 'MAGIC', MAGIC: 'MAGIC', HIGH: 'MAGIC',
    R: 'RARE', RARE: 'RARE', SR: 'EPIC', EPIC: 'EPIC', SPECIAL: 'EPIC',
    HR: 'LEGENDARY', LEGENDARY: 'LEGENDARY', PREMIUM: 'LEGENDARY', UR: 'MYTHIC', MYTHIC: 'MYTHIC'
  };
  const MAX_SLOTS = 5;
  const REEL_WINNER_INDEX = 7;
  const REEL_SETTLE_MS = 5200;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const formatNumber = (value) => Number(value || 0).toLocaleString('ko-KR');
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const cleanRarity = (value) => String(value || 'NORMAL').toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'NORMAL';
  const rarityLabel = (value) => RARITY_LABELS[cleanRarity(value)] || cleanRarity(value);
  const keyOf = (row) => `${row.type}:${row.id}`;
  const rarityBucket = (value) => RARITY_BUCKET[cleanRarity(value)] || cleanRarity(value);
  const rewardName = (row) => row?.type === 'ITEM' && Number(row.quantity || 1) > 1 ? `${row.name} ×${formatNumber(row.quantity)}` : String(row?.name || '');
  const createRequestId = () => globalThis.crypto?.randomUUID?.() || `alchemy-${Date.now()}-${Math.floor(performance.now() * 1000).toString(36)}`;

  function svgIcon(name) {
    const paths = {
      alchemy: '<path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 14h8M9.5 17h5"/>',
      card: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h5M8 15h8"/>',
      equipment: '<path d="m5 4 14 16M19 4 5 20M4 7l2-3 4 1M20 7l-2-3-4 1"/>',
      item: '<path d="m12 3 7 4v10l-7 4-7-4V7l7-4Zm-7 4 7 4 7-4M12 11v10"/>',
      vehicle: '<path d="M5 15h14l-1.5-5h-11L5 15Zm2-5 1.5-3h7L17 10M6 15v2M18 15v2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/>',
      filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      clear: '<path d="m7 7 10 10M17 7 7 17"/>',
      shield: '<path d="m12 3 7 3v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z"/>',
      history: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 7v5l3 2"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      chevron: '<path d="m9 5 7 7-7 7"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.alchemy}</svg>`;
  }

  function create(root, options = {}) {
    if (!root) throw new Error('연금 공방을 표시할 영역이 없습니다.');
    const state = {
      data: null,
      tab: TYPE_TABS.includes(options.initialTab) ? options.initialTab : 'CARD',
      rarity: 'ALL',
      search: '',
      selected: [],
      busy: false,
      phase: '',
      pendingReward: null,
      result: null,
      notice: null,
      noticeTimer: 0,
      pendingRequestId: '',
      destroyed: false
    };
    const profile = options.profile || (typeof window.loadUser === 'function' ? window.loadUser() : null) || { nickname: '플레이어' };
    const request = options.request || ((path, init = {}) => {
      if (typeof window.apiRequest !== 'function') return Promise.reject(new Error('연금술 API 연결을 찾을 수 없습니다.'));
      return window.apiRequest(path, init);
    });
    const assetBase = String(options.assetBase || '');
    const pendingStorageKey = String(options.pendingStorageKey || 'cnine_pending_alchemy_v1');
    const resolveAsset = (path) => {
      const value = String(path || '').replace(/\\/g, '/');
      if (!value || /^(?:https?:|data:|blob:|\/)/i.test(value)) return value;
      return `${assetBase}${value.replace(/^\.\//, '')}`;
    };

    const rows = () => Array.isArray(state.data?.assets) ? state.data.assets : [];
    const findRow = (entry) => rows().find((row) => String(row.type) === String(entry.type) && String(row.id) === String(entry.id));
    const selectedCount = (row) => state.selected.filter((entry) => keyOf(entry) === keyOf(row)).length;
    const availableCount = (row) => Math.max(0, Number(row.available ?? row.quantity ?? 0) - selectedCount(row));
    const totalValue = () => state.selected.reduce((sum, entry) => sum + Number(findRow(entry)?.value || 0), 0);
    const pendingLocked = () => Boolean(state.pendingRequestId);
    const requirements = () => ({ minSlots: Number(state.data?.requirements?.minSlots || 3) });
    const canStart = () => {
      const rule = requirements();
      return !state.busy && state.selected.length >= rule.minSlots;
    };
    const currentTier = () => {
      const value = totalValue();
      const tiers = Array.isArray(state.data?.tiers) ? state.data.tiers : [];
      return [...tiers].sort((a, b) => Number(a.minValue || 0) - Number(b.minValue || 0)).filter((tier) => value >= Number(tier.minValue || 0)).pop() || tiers[0] || { name: '미분석', code: 'DORMANT', color: '#667788' };
    };
    const matchingRewards = () => {
      const tier = currentTier(), selectedKeys = new Set(state.selected.map(keyOf));
      return (state.data?.rewardPool || []).filter((row) => row.active !== false && row.valid !== false && row.tierCode === tier.code && !selectedKeys.has(keyOf(row)) && Number(row.effectiveWeight ?? row.weight) > 0 && !(row.type === 'VEHICLE' && (state.data.ownedVehicleIds || []).map(String).includes(String(row.id))));
    };
    const forecast = () => {
      if (!totalValue()) return [{ label: '재료 대기', percent: 100, color: '#516878' }];
      const pool = matchingRewards();
      const total = pool.reduce((sum, row) => sum + Number(row.effectiveWeight ?? row.weight ?? 0), 0), groups = new Map();
      for (const row of pool) {
        const rarity = cleanRarity(row.rarity), specialItem = row.type === 'ITEM' && SPECIAL_REWARD_IDS.has(String(row.id || '').toUpperCase()), key = specialItem ? `ITEM:${row.id}` : rarityBucket(rarity), current = groups.get(key) || { label: specialItem ? rewardName(row) : rarityLabel(rarity), percent: 0, color: row.color || '#62ded1' };
        current.percent += total ? Number(row.effectiveWeight ?? row.weight ?? 0) / total * 100 : 0; groups.set(key, current);
      }
      return [...groups.values()].sort((a, b) => b.percent - a.percent).length ? [...groups.values()].sort((a, b) => b.percent - a.percent) : [{ label: '보상 풀 없음', percent: 0, color: '#a95f5f' }];
    };

    function cardVisual(row, compact = false) {
      const rarity = cleanRarity(row.rarity);
      return `<div class="alch-card-shell${compact ? ' is-compact' : ''}"><article class="card-frame grade-${rarity} small">
        <div class="card-holo"></div><div class="card-inner"><div class="card-header"><span>${escapeHtml(rarity)}</span><b>SOOP</b></div>
        <div class="card-art"><img src="${escapeHtml(resolveAsset(row.image))}" alt="${escapeHtml(row.name)}" loading="lazy" decoding="async"></div>
        <div class="card-footer"><div><small>${escapeHtml(row.member || TYPE_LABELS.CARD)}</small><div class="card-title">${escapeHtml(row.name)}</div></div></div></div>
      </article></div>`;
    }

    function itemVisual(row, compact = false) {
      if (!row) return `<span class="alch-empty-rune">${svgIcon('plus')}</span>`;
      if (row.type === 'CARD') return cardVisual(row, compact);
      const rarity = cleanRarity(row.rarity);
      const image = resolveAsset(row.image);
      return `<div class="alch-object-frame rarity-${rarity.toLowerCase()}${compact ? ' is-compact' : ''}"><span class="alch-object-corner"></span>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(row.name)}" loading="lazy" decoding="async">` : `<span class="alch-object-glyph" aria-hidden="true">✦</span>`}<em>${escapeHtml(row.enhancement ? `+${row.enhancement}` : rarityLabel(rarity))}</em></div>`;
    }

    function filteredRows() {
      const needle = state.search.trim().toLowerCase();
      return rows().filter((row) => row.type === state.tab)
        .filter((row) => state.rarity === 'ALL' || rarityBucket(row.rarity) === state.rarity)
        .filter((row) => !needle || `${row.name} ${row.member || ''} ${rarityLabel(row.rarity)}`.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.rank || 0) - Number(a.rank || 0) || Number(b.value || 0) - Number(a.value || 0));
    }

    function renderInventoryCard(row) {
      const remaining = availableCount(row);
      const disabled = remaining < 1 || state.busy || pendingLocked();
      const metric = row.type === 'EQUIPMENT' ? `전투력 ${formatNumber(row.totalPower)} · 연금 가치 ${formatNumber(row.value)}` : `${rarityLabel(row.rarity)} 등급 보너스 +${formatNumber(row.value)}`;
      return `<button type="button" class="alch-inventory-card rarity-${cleanRarity(row.rarity).toLowerCase()}${disabled ? ' is-disabled' : ''}" data-alchemy-add="${escapeHtml(keyOf(row))}" ${disabled ? 'disabled' : ''}>
        <span class="alch-inventory-visual">${itemVisual(row, true)}</span>
        <span class="alch-inventory-copy"><small>${escapeHtml(TYPE_LABELS[row.type])} · ${escapeHtml(rarityLabel(row.rarity))}</small><strong>${escapeHtml(row.name)}</strong><em>${escapeHtml(metric)}</em></span>
        <span class="alch-stock"><b>${formatNumber(remaining)}</b><small>사용 가능</small></span>
      </button>`;
    }

    function renderMaterialSlots() {
      return Array.from({ length: MAX_SLOTS }, (_, index) => {
        const entry = state.selected[index];
        const row = entry ? findRow(entry) : null;
        return `<button type="button" class="alch-material-slot alch-slot-${index}${row ? ' is-filled' : ''}" data-alchemy-remove="${index}" ${state.busy || pendingLocked() || !row ? 'disabled' : ''} aria-label="${row ? `${escapeHtml(row.name)} 제거` : `재료 슬롯 ${index + 1}`}" style="--slot-tone:${escapeHtml(row?.color || '#6feaff')}">
          <span class="alch-slot-index">0${index + 1}</span><span class="alch-slot-frame">${itemVisual(row, true)}</span>
          <span class="alch-slot-meta">${row ? `<b>${escapeHtml(row.name)}</b><em>+${formatNumber(row.value)}</em>` : '<b>재료 대기</b><em>선택하여 등록</em>'}</span>
        </button>`;
      }).join('');
    }

    function renderReels() {
      const candidates = matchingRewards();
      const pool = candidates.length ? candidates : (Array.isArray(state.data?.rewardPool) ? state.data.rewardPool : []);
      const winner = state.pendingReward || pool[0] || null;
      const makeTrack = (offset) => {
        const sequence = Array.from({ length: 9 }, (_, index) => index === REEL_WINNER_INDEX && winner ? winner : pool[(index + offset) % Math.max(1, pool.length)] || winner).filter(Boolean);
        return `<div class="alch-reel-column" style="--reel-delay:${offset * 120}ms"><div class="alch-reel-track">${sequence.map((row, index) => `<div class="alch-reel-cell${index === REEL_WINNER_INDEX ? ' is-stop' : ''}">${itemVisual(row, true)}<small>${escapeHtml(rewardName(row))}</small></div>`).join('')}</div></div>`;
      };
      return `<div class="alch-reel-overlay ${state.phase === 'SETTLING' ? 'is-settling' : ''}" aria-live="polite">
        <div class="alch-reel-heading"><small>TRANSMUTATION SEQUENCE</small><strong>${state.phase === 'SETTLING' ? '결과 파장 고정 중' : '연성식 해석 중'}</strong></div>
        <div class="alch-reel-machine">${makeTrack(0)}${makeTrack(2)}${makeTrack(4)}<i class="alch-win-line" aria-hidden="true"></i></div>
        <div class="alch-reel-status"><span></span> 중앙 당첨선에 결과를 고정합니다</div>
      </div>`;
    }

    function renderResult() {
      const row = state.result;
      if (!row) return '';
      return `<div class="alch-result-overlay" role="dialog" aria-modal="true" aria-labelledby="alchemyResultTitle">
        <div class="alch-result-aura"></div><section class="alch-result-panel rarity-${cleanRarity(row.rarity).toLowerCase()}">
          <small>ALCHEMY RESULT / JACKPOT LOCK</small><h2 id="alchemyResultTitle">연금술에 성공했습니다</h2>
          <div class="alch-result-prize">${itemVisual(row, false)}</div>
          <span>${escapeHtml(rarityLabel(row.rarity))} · ${escapeHtml(TYPE_LABELS[row.type] || '연금 보상')}</span><strong>${escapeHtml(rewardName(row))}</strong>
          <p>중앙 당첨선에 고정된 결과물이 보관함으로 지급됩니다.</p>
          <button type="button" data-alchemy-result-close>${svgIcon('check')}<b>결과 확인</b></button>
        </section>
      </div>`;
    }

    function renderNotice() {
      return state.notice ? `<div class="alch-notice ${state.notice.error ? 'is-error' : ''}">${escapeHtml(state.notice.message)}</div>` : '';
    }

    function render() {
      if (state.destroyed) return;
      if (!state.data) {
        root.innerHTML = `<div class="alchemy-loading"><i></i><strong>연금 공방 연결 중</strong><span>보유 자산과 연성식을 불러옵니다.</span></div>`;
        return;
      }
      const list = filteredRows();
      const tier = currentTier();
      const rule = requirements();
      const slotsReady = state.selected.length >= rule.minSlots;
      root.innerHTML = `<section class="alchemy-v1-shell${state.busy ? ' is-busy' : ''}" style="--alchemy-tone:${escapeHtml(tier.color || '#76eaff')}">
        <header class="alch-command-header">
          <div class="alch-brand"><span>${svgIcon('alchemy')}</span><div><small>SOOPKETMON / FORBIDDEN LAB</small><strong>연금 공방</strong></div></div>
          <div class="alch-account"><span><small>${state.data.access?.ownerTest ? 'OWNER TEST' : '연금 기록'}</small><b>${formatNumber(state.data.totalRuns || 0)}회</b></span><span><small>사용자</small><b>${escapeHtml(state.data.profile?.nickname || profile.nickname || '플레이어')}</b></span></div>
        </header>

        <div class="alch-workspace">
          <aside class="alch-vault-panel">
            <div class="alch-panel-title"><div><small>MATERIAL VAULT</small><h2>연금 재료</h2></div><span>${formatNumber(rows().filter((row) => row.type === state.tab && Number(row.available || 0) > 0).length)}종</span></div>
            <nav class="alch-type-tabs">${TYPE_TABS.map((type) => `<button type="button" class="${state.tab === type ? 'active' : ''}" data-alchemy-tab="${type}">${svgIcon(type === 'CARD' ? 'card' : 'equipment')}<b>${TYPE_LABELS[type]}</b></button>`).join('')}</nav>
            <div class="alch-vault-tools"><label>${svgIcon('search')}<input type="search" placeholder="재료 이름 검색" value="${escapeHtml(state.search)}" data-alchemy-search></label><select data-alchemy-rarity aria-label="등급 필터"><option value="ALL">전체 등급</option>${RARITY_ORDER.filter((rarity) => rows().some((row) => row.type === state.tab && rarityBucket(row.rarity) === rarity)).map((rarity) => `<option value="${rarity}" ${state.rarity === rarity ? 'selected' : ''}>${escapeHtml(rarityLabel(rarity))}</option>`).join('')}</select></div>
            <div class="alch-inventory-scroll">${list.length ? list.map(renderInventoryCard).join('') : '<div class="alch-empty-list"><span>NO MATERIAL</span><b>사용 가능한 재료가 없습니다.</b><small>장착·잠금·마지막 1장은 자동 제외됩니다.</small></div>'}</div>
            <div class="alch-vault-rule">${svgIcon('shield')}<span><b>장비·고등급 중복 카드 전용</b><small>일반 아이템·장착·잠금·마지막 1장 자동 제외</small></span></div>
          </aside>

          <main class="alch-reactor-stage">
            <div class="alch-chamber-backdrop"></div><div class="alch-grid-floor"></div>
            <div class="alch-stage-heading"><small>ARCANE REACTOR / STANDARD</small><h1>연금술</h1><p>실제 장비 전투력과 카드 등급 보너스로 보상 단계를 결정합니다.</p></div>
            <div class="alch-core-system"><div class="alch-core-rings"><i></i><i></i><i></i></div><div class="alch-core"><img src="${escapeHtml(resolveAsset('assets/ui/alchemy-v1/alchemy-truth-orb-v2.webp'))}" alt="진실의 구슬 연금 코어"><span></span><b>${formatNumber(totalValue())}</b><small>ALCHEMY VALUE</small></div>${renderMaterialSlots()}</div>
            <div class="alch-stage-console">
              <div class="alch-condition-list"><span class="${slotsReady ? 'ready' : ''}">${slotsReady ? svgIcon('check') : svgIcon('plus')}<b>재료 ${state.selected.length} / ${rule.minSlots}+</b></span><span class="${totalValue() ? 'ready' : ''}">${totalValue() ? svgIcon('check') : svgIcon('plus')}<b>${escapeHtml(tier.name)} 단계 · ${formatNumber(totalValue())}점</b></span><button type="button" data-alchemy-clear ${state.selected.length && !state.busy && !pendingLocked() ? '' : 'disabled'}>${svgIcon('clear')} 초기화</button></div>
              <button type="button" class="alch-start-button" data-alchemy-run ${canStart() ? '' : 'disabled'}><span><small>${pendingLocked() ? 'IDEMPOTENT RECEIPT / RETRY' : `TRANSMUTE / ${escapeHtml(tier.name || '미분석')}`}</small><b>${state.busy ? '연성 진행 중' : pendingLocked() ? '이전 요청 결과 확인' : '연금 시작'}</b></span>${svgIcon('chevron')}</button>
            </div>
            ${state.busy ? renderReels() : ''}
          </main>

          <aside class="alch-forecast-panel">
            <div class="alch-panel-title"><div><small>RESULT FORECAST</small><h2>연성 분석</h2></div><span class="alch-live-dot">LIVE</span></div>
            <section class="alch-tier-core"><small>CURRENT RESONANCE</small><div><i></i><span><b>${escapeHtml(tier.name || '미분석')}</b><em>${formatNumber(totalValue())} VALUE</em></span></div><p>강한 장비·이동수단과 고유효과가 높은 카드는 서버 역가중 후 실제 확률을 표시합니다.</p></section>
            <section class="alch-odds"><header><b>예상 결과 등급</b><small>현재 조합 기준</small></header>${forecast().map((entry) => `<div><span><i style="--odds-color:${escapeHtml(entry.color)}"></i>${escapeHtml(entry.label)}</span><b>${Number(entry.percent).toFixed(0)}%</b><em><i style="width:${Number(entry.percent)}%;--odds-color:${escapeHtml(entry.color)}"></i></em></div>`).join('')}</section>
            <section class="alch-output-pool"><header><b>대표 결과물</b><small>현재 연성식 후보</small></header><div>${(matchingRewards().length ? matchingRewards() : (state.data.rewardPool || [])).slice(0, 4).map((row) => `<article>${itemVisual(row, true)}<span><small>${escapeHtml(rarityLabel(row.rarity))}</small><b>${escapeHtml(rewardName(row))}</b></span></article>`).join('')}</div></section>
            <div class="alch-guarantee"><span>${svgIcon('history')}</span><div><small>STABILITY GUARANTEE</small><b>안정도 ${formatNumber(state.data.stability || 0)} / ${formatNumber(state.data.stabilityMax || 10)}</b><em><i style="width:${Math.min(100, Number(state.data.stability || 0) / Math.max(1, Number(state.data.stabilityMax || 10)) * 100)}%"></i></em><p>최대 도달 시 상위 등급 결과를 보장합니다.</p></div></div>
          </aside>
        </div>
        ${renderNotice()}${renderResult()}
      </section>`;
    }

    function showNotice(message, error = false) {
      window.clearTimeout(state.noticeTimer);
      state.notice = { message, error };
      render();
      state.noticeTimer = window.setTimeout(() => { state.notice = null; render(); }, error ? 2600 : 1500);
    }

    function addMaterial(row) {
      if (state.busy || !row) return;
      if (pendingLocked()) return showNotice('처리 결과가 불확실한 이전 요청을 먼저 확인해주세요.', true);
      if (state.selected.length >= MAX_SLOTS) return showNotice('재료 슬롯은 최대 5개입니다.', true);
      if (availableCount(row) < 1) return showNotice('사용 가능한 중복 수량이 없습니다.', true);
      state.selected.push({ type: row.type, id: row.id });
      render();
    }

    async function runAlchemy() {
      if (!canStart()) return showNotice('재료 조건을 먼저 충족해주세요.', true);
      const snapshot = state.selected.map((entry) => ({ type: entry.type, id: entry.id }));
      const highGrade = snapshot.map(findRow).filter((row) => row?.type === 'CARD' && row.confirmRequired);
      if (highGrade.length && !window.confirm(`${highGrade.map((row) => `${row.name} (${rarityLabel(row.rarity)})`).join(', ')}\n\n고등급 중복 카드가 영구 소모됩니다. 마지막 1장은 서버가 보호합니다. 계속하시겠습니까?`)) return;
      if (!state.pendingRequestId) {
        state.pendingRequestId = createRequestId();
        try { sessionStorage.setItem(pendingStorageKey, JSON.stringify({ requestId: state.pendingRequestId, createdAt: Date.now(), inputs: snapshot })); } catch (_) {}
      }
      state.busy = true;
      state.phase = 'CONNECTING';
      state.pendingReward = null;
      state.result = null;
      render();
      try {
        const response = await request('alchemy/transmute', {
          method: 'POST',
          body: JSON.stringify({ requestId: state.pendingRequestId, inputs: snapshot, confirmedHighGrade: highGrade.length > 0 })
        });
        if (!response?.reward) throw new Error('연금 결과를 확인할 수 없습니다.');
        state.pendingReward = response.reward;
        state.phase = 'SETTLING';
        render();
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        await delay(reducedMotion ? 650 : REEL_SETTLE_MS);
        if (state.destroyed) return;
        if (response.state) state.data = response.state;
        else {
          for (const entry of snapshot) { const row = findRow(entry); if (row) row.available = Math.max(0, Number(row.available || 0) - 1); }
          state.data.totalRuns = Number(state.data.totalRuns || 0) + 1;
          state.data.stability = Number(response.stability ?? Math.min(Number(state.data.stabilityMax || 10), Number(state.data.stability || 0) + 1));
        }
        state.pendingRequestId = ''; try { sessionStorage.removeItem(pendingStorageKey); } catch (_) {}
        state.selected = [];
        state.busy = false;
        state.phase = '';
        state.result = response.reward;
        render();
      } catch (error) {
        state.busy = false;
        state.phase = '';
        state.pendingReward = null;
        if (Number(error?.status) >= 400 && Number(error?.status) < 500 && error?.code !== 'ALCHEMY_PENDING') { state.pendingRequestId = ''; try { sessionStorage.removeItem(pendingStorageKey); } catch (_) {} }
        showNotice(error?.message || '연금술 처리에 실패했습니다.', true);
      }
    }

    root.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-alchemy-tab]');
      if (tab && !state.busy) { state.tab = tab.dataset.alchemyTab; state.rarity = 'ALL'; state.search = ''; render(); return; }
      const add = event.target.closest('[data-alchemy-add]');
      if (add) { const [type, ...id] = add.dataset.alchemyAdd.split(':'); addMaterial(rows().find((row) => row.type === type && String(row.id) === id.join(':'))); return; }
      const remove = event.target.closest('[data-alchemy-remove]');
      if (remove && !state.busy) { if (pendingLocked()) { showNotice('이전 요청 확인 전에는 재료를 변경할 수 없습니다.', true); return; } state.selected.splice(Number(remove.dataset.alchemyRemove), 1); render(); return; }
      if (event.target.closest('[data-alchemy-clear]') && !state.busy) { if (pendingLocked()) { showNotice('이전 요청 확인 전에는 재료를 변경할 수 없습니다.', true); return; } state.selected = []; render(); return; }
      if (event.target.closest('[data-alchemy-run]')) { void runAlchemy(); return; }
      if (event.target.closest('[data-alchemy-result-close]')) { state.result = null; render(); }
    });

    root.addEventListener('input', (event) => {
      if (!event.target.matches('[data-alchemy-search]')) return;
      state.search = event.target.value;
      const cursor = state.search.length;
      render();
      const input = root.querySelector('[data-alchemy-search]');
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(cursor, cursor);
    });

    root.addEventListener('change', (event) => {
      if (!event.target.matches('[data-alchemy-rarity]')) return;
      state.rarity = event.target.value;
      render();
    });

    async function load() {
      render();
      try {
        const data = options.data || await request('alchemy/state');
        if (state.destroyed) return;
        state.data = data;
        let pendingInputs = null;
        try { const pending = JSON.parse(sessionStorage.getItem(pendingStorageKey) || '{}'); if (pending.requestId && Date.now() - Number(pending.createdAt || 0) < 86400000) { state.pendingRequestId = pending.requestId; pendingInputs = Array.isArray(pending.inputs) ? pending.inputs : null; } else sessionStorage.removeItem(pendingStorageKey); } catch (_) {}
        const defaults = pendingInputs || (Array.isArray(data?.defaultSelection) ? data.defaultSelection : []);
        state.selected = defaults.slice(0, MAX_SLOTS).filter((entry) => rows().some((row) => row.type === entry.type && String(row.id) === String(entry.id)));
        render();
      } catch (error) {
        root.innerHTML = `<div class="alchemy-load-error"><span>${svgIcon('alchemy')}</span><strong>연금 공방 연결 실패</strong><p>${escapeHtml(error?.message || '데이터를 불러오지 못했습니다.')}</p><button type="button" data-alchemy-retry>다시 시도</button></div>`;
        root.querySelector('[data-alchemy-retry]')?.addEventListener('click', load, { once: true });
      }
    }

    load();
    return {
      reload: load,
      destroy() {
        state.destroyed = true;
        window.clearTimeout(state.noticeTimer);
        root.innerHTML = '';
      }
    };
  }

  window.SoopketmonAlchemyV1 = { create };
})();
