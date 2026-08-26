/* SOOPKETMON AVATAR ARCHIVE V1
 * Shared production renderer. The live screen and preview use the same DOM,
 * state transitions, request paths and responsive image contract.
 */
(() => {
  'use strict';

  const FILTERS = [
    ['ALL', '전체'],
    ['COIN', '코인 상점'],
    ['DROP', '콘텐츠 드랍'],
    ['OWNED', '보유 아바타']
  ];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const formatNumber = (value) => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
  const formatRemaining = (value) => { const totalMinutes = Math.max(0, Math.ceil((Number(value) || 0) / 60000)), hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60; return hours ? `${hours}시간${minutes ? ` ${minutes}분` : ''}` : `${minutes}분`; };
  const sourceType = (item) => String(item?.acquisitionType || 'DROP').toUpperCase() === 'COIN' ? 'COIN' : 'DROP';
  const uid = () => globalThis.crypto?.randomUUID?.() || `avatar-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function effectInfo(item) {
    const effect = item?.effect || item || {};
    const type = String(effect.type || 'NONE').toUpperCase();
    const amount = Math.max(0, Math.floor(Number(effect.value) || 0));
    if (type === 'SCRAPYARD_FREE_ENTRY') return {
      type, tone: 'scrapyard', icon: 'scrapyard', label: '폐차장 무료 입장', value: '입장권 소모 0', summary: '폐차장 무료 입장',
      detail: '장착 중에는 폐차장 출입 허가증을 소모하지 않습니다. 일일 입장 횟수 제한은 그대로 적용됩니다.'
    };
    if (type === 'RAID_EXTRA_ENTRY') {
      const value = Math.max(1, Math.min(99, amount || 1));
      return { type, tone: 'raid', icon: 'raid', label: '레이드 추가 횟수', value: `+${value}회`, summary: `레이드 입장 +${value}회`, detail: `장착 중에는 레이드 각 운영 슬롯의 입장 가능 횟수가 ${value}회 증가합니다.` };
    }
    if (type === 'COIN_GAIN_PERCENT') {
      const value = Math.max(1, Math.min(50, amount || 1));
      return { type, tone: 'coin', icon: 'coinGain', label: '코인 습득률', value: `+${value}%`, summary: `코인 습득률 +${value}%`, detail: `전투와 콘텐츠에서 직접 획득하는 코인이 ${value}% 증가합니다. 거래·환불·관리자 지급은 제외됩니다.` };
    }
    if (type === 'BATTLE_POWER_PERCENT') {
      const value = Math.max(1, Math.min(100, amount || 1));
      return { type, tone: 'power', icon: 'power', label: '전투력 상승', value: `+${value}%`, summary: `편성 전투력 +${value}%`, detail: `장착 중에는 모든 전투 콘텐츠의 최종 편성 전투력이 ${value}% 증가합니다.` };
    }
    return { type: 'NONE', tone: 'neutral', icon: 'wardrobe', label: '아바타 효과', value: '미설정', summary: '효과 정보 준비 중', detail: '서버에서 이 아바타의 장착 효과가 아직 설정되지 않았습니다.' };
  }

  function effectInfos(item) {
    const effects = Array.isArray(item?.effects) && item.effects.length ? item.effects : [item?.effect || {}];
    return effects.map(effectInfo).filter((effect) => effect.type !== 'NONE');
  }

  const icon = (name) => {
    const paths = {
      back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
      wardrobe: '<path d="M6 3h12v18H6zM12 3v18M9 7h1m4 0h1"/>',
      coin: '<path d="M5 5h14v14H5zM9 9h6v6H9z"/>',
      drop: '<path d="M4 5h16v4L12 20 4 9V5Zm0 4h16M9 5l3 4 3-4"/>',
      power: '<path d="m5 5 14 14M19 5 5 19M4 7l3-3 4 1M20 7l-3-3-4 1"/>',
      scrapyard: '<path d="M4 14h16l-1-5-3-2H8L5 9l-1 5Zm3 0v4m10-4v4M8 11h8M9 7l1-3h4l1 3"/>',
      raid: '<path d="M5 21V4m1 1h11l-2 4 2 4H6M9 17h7"/>',
      coinGain: '<path d="M5 5h10v10H5zM8 8h4v4H8zM14 19l5-5m0 0v4m0-4h-4"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.wardrobe}</svg>`;
  };

  function create(root, options = {}) {
    if (!root) throw new Error('아바타 상점을 표시할 영역이 없습니다.');

    const state = {
      data: null,
      selectedCode: '',
      filter: 'ALL',
      busy: false,
      confirmCode: '',
      notice: null,
      noticeTimer: 0,
      cooldownTimer: 0
    };

    const request = options.request || ((path, init = {}) => {
      if (typeof window.apiRequest !== 'function') return Promise.reject(new Error('API 연결을 찾을 수 없습니다.'));
      return window.apiRequest(path, init);
    });
    const assetBase = String(options.assetBase || '');
    const resolveAsset = (path) => {
      const value = String(path || '').replace(/\\/g, '/');
      if (!value || /^(?:https?:|data:|blob:|\/)/i.test(value)) return value;
      return `${assetBase}${value.replace(/^\.\//, '')}`;
    };
    const currentItem = () => state.data?.avatars?.find((item) => item.code === state.selectedCode) || state.data?.avatars?.[0] || null;
    const ownedCount = () => (state.data?.avatars || []).filter((item) => item.owned).length;
    const cooldownRemaining = () => {
      const cooldown = state.data?.equipCooldown || {};
      const next = Date.parse(String(cooldown.nextEquipAt || ''));
      if (Number.isFinite(next)) return Math.max(0, next - Date.now());
      return Math.max(0, Number(cooldown.remainingMs) || 0);
    };
    const cooldownLocked = () => cooldownRemaining() > 0;

    function showNotice(message, error = false) {
      window.clearTimeout(state.noticeTimer);
      state.notice = { message, error };
      renderNotice();
      state.noticeTimer = window.setTimeout(() => {
        state.notice = null;
        renderNotice();
      }, error ? 3000 : 1800);
    }

    function renderNotice() {
      const host = root.querySelector('[data-avatar-notice]');
      if (!host) return;
      host.textContent = state.notice?.message || '';
      host.className = `avs1-notice${state.notice ? ' is-visible' : ''}${state.notice?.error ? ' is-error' : ''}`;
    }

    function picture(item, className, eager = false) {
      if (!item?.lobbyImage) return '<div class="avs1-art-empty">ILLUSTRATION PENDING</div>';
      const desktop = escapeHtml(resolveAsset(item.lobbyImage));
      const mobile = escapeHtml(resolveAsset(item.lobbyMobileImage || item.lobbyImage));
      return `<picture class="${className}"><source media="(max-width:720px)" srcset="${mobile}"><img src="${desktop}" alt="${escapeHtml(item.name)} 아바타 일러스트" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></picture>`;
    }

    function sourceBadge(item) {
      if (sourceType(item) === 'COIN') return `<span class="avs1-source-badge is-coin">${icon('coin')} ${coinSaleOpen(item) ? '코인 판매' : '판매 준비 중'}</span>`;
      return `<span class="avs1-source-badge is-drop">${icon('drop')} 드랍 전용</span>`;
    }

    function coinSaleOpen(item) {
      return sourceType(item) === 'COIN' && item?.saleEnabled !== false && state.data?.access?.shopEnabled !== false && Number(item?.coinPrice || 0) > 0;
    }

    function effectBadge(item) {
      const effects = effectInfos(item), effect = effects[0] || effectInfo(item);
      return `<span class="avs1-effect-badge is-${effect.tone}">${icon(effect.icon)} ${escapeHtml(effect.summary)}${effects.length > 1 ? ` <b>외 ${effects.length - 1}</b>` : ''}</span>`;
    }

    function effectModule(item) {
      const effects = effectInfos(item), primary = effects[0] || effectInfo(item);
      return `<section class="avs1-effect-module is-${primary.tone}">
        <header><span>${icon(primary.icon)} AVATAR EFFECTS · ${Math.max(1, effects.length)}</span><b>${item?.equipped ? 'ACTIVE' : 'EQUIP TO ACTIVATE'}</b></header>
        <div class="avs1-effect-options">${(effects.length ? effects : [primary]).map((effect, index) => `<article class="is-${effect.tone}"><i>${String(index + 1).padStart(2, '0')}</i><span><small>${escapeHtml(effect.label)}</small><strong>${escapeHtml(effect.value)}</strong></span><p>${escapeHtml(effect.detail)}</p></article>`).join('')}</div>
        <footer>장착 아바타 1개 제한 · 등록된 옵션은 모두 함께 적용</footer>
      </section>`;
    }

    function filteredItems() {
      const rows = [...(state.data?.avatars || [])];
      if (state.filter === 'OWNED') return rows.filter((item) => item.owned);
      if (state.filter === 'COIN' || state.filter === 'DROP') return rows.filter((item) => sourceType(item) === state.filter);
      return rows;
    }

    function actionMarkup(item) {
      if (!item) return '';
      if (item.equipped) return `<button type="button" class="avs1-primary-action is-equipped" disabled>${icon('check')} 현재 적용 중</button>`;
      if (item.owned && cooldownLocked()) return `<button type="button" class="avs1-primary-action is-cooldown" disabled>${icon('lock')} 교체 대기 · ${escapeHtml(formatRemaining(cooldownRemaining()))}</button>`;
      if (item.owned) return `<button type="button" class="avs1-primary-action" data-avatar-equip="${escapeHtml(item.code)}">이 아바타 적용</button>`;
      if (sourceType(item) === 'COIN' && coinSaleOpen(item)) return `<button type="button" class="avs1-primary-action is-purchase" data-avatar-buy="${escapeHtml(item.code)}"><span>${icon('coin')} 코인 구매</span><b>${formatNumber(item.coinPrice)}</b></button>`;
      if (sourceType(item) === 'COIN') return `<button type="button" class="avs1-primary-action is-drop" disabled>${icon('lock')} 판매 준비 중</button>`;
      return `<button type="button" class="avs1-primary-action is-drop" disabled>${icon('lock')} 콘텐츠에서 획득</button>`;
    }

    function hero(item) {
      return `<section class="avs1-hero" style="--avatar-accent:${escapeHtml(item?.accent || '#82c7d7')}">
        ${picture(item, 'avs1-hero-picture', true)}
        <div class="avs1-hero-shade" aria-hidden="true"></div>
        <header class="avs1-hero-status"><span>SELECTED AVATAR</span><b>${item?.equipped ? 'ACTIVE' : item?.owned ? 'OWNED' : 'LOCKED'}</b></header>
        <div class="avs1-hero-copy">
          <small>${escapeHtml(item?.callSign || 'AVATAR ARCHIVE')}</small>
          <h1>${escapeHtml(item?.name || '아바타')}</h1>
          <p>${escapeHtml(item?.role || '외형 전용 아바타')}</p>
          <div>${sourceBadge(item)}${effectBadge(item)}</div>
        </div>
      </section>`;
    }

    function dossier(item) {
      const isCoin = sourceType(item) === 'COIN';
      return `<section class="avs1-dossier" style="--avatar-accent:${escapeHtml(item?.accent || '#82c7d7')}">
        <div class="avs1-dossier-index"><span>AVATAR DOSSIER</span><b>${escapeHtml(item?.serial || 'A-00')}</b></div>
        <div class="avs1-dossier-copy">
          <small>${escapeHtml(item?.callSign || '')}</small>
          <h2>${escapeHtml(item?.name || '')}</h2>
          <p>${escapeHtml(item?.description || '')}</p>
          ${effectModule(item)}
        </div>
        <dl class="avs1-acquisition-ledger">
          <div><dt>획득 방식</dt><dd>${isCoin ? '코인 상점' : '콘텐츠 드랍'}</dd></div>
          <div><dt>${isCoin ? '판매 가격' : '획득처'}</dt><dd>${isCoin ? `${formatNumber(item?.coinPrice)} COIN` : escapeHtml(item?.sourceLabel || '획득처 준비 중')}</dd></div>
          <div><dt>보유 상태</dt><dd>${item?.owned ? '보유 중' : '미획득'}</dd></div>
        </dl>
        ${!isCoin ? `<p class="avs1-source-detail">${escapeHtml(item?.sourceDetail || '지정 콘텐츠의 보상 또는 드랍으로만 획득할 수 있습니다.')}</p>` : ''}
        ${actionMarkup(item)}
      </section>`;
    }

    function card(item) {
      const selected = item.code === state.selectedCode;
      const type = sourceType(item).toLowerCase();
      const effects = effectInfos(item), effectSummary = effects[0]?.summary || effectInfo(item).summary;
      return `<button type="button" class="avs1-card is-${type}${selected ? ' is-selected' : ''}${item.owned ? ' is-owned' : ''}${item.equipped ? ' is-equipped' : ''}" data-avatar-select="${escapeHtml(item.code)}" style="--avatar-accent:${escapeHtml(item.accent || '#82c7d7')}">
        ${picture(item, 'avs1-card-picture')}
        <span class="avs1-card-seq">${escapeHtml(item.serial || 'A-00')}</span>
        <span class="avs1-card-state">${item.equipped ? 'ACTIVE' : item.owned ? 'OWNED' : sourceType(item) === 'COIN' ? `${formatNumber(item.coinPrice)} C` : 'DROP'}</span>
        <span class="avs1-card-copy"><small>${escapeHtml(item.callSign || '')}</small><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(effectSummary)}${effects.length > 1 ? ` · 외 ${effects.length - 1}` : ''}</em></span>
      </button>`;
    }

    function archive() {
      const items = filteredItems();
      return `<div class="avs1-archive-head">
          <div><small>WARDROBE INDEX</small><h2>아바타 컬렉션</h2><p>한 번에 아바타 1개를 장착하며, 해당 아바타에 등록된 모든 옵션이 함께 적용됩니다. 교체 후 24시간 동안 재교체할 수 없습니다.</p></div>
          <span><b>${ownedCount()}</b> / ${state.data?.avatars?.length || 0} OWNED</span>
        </div>
        <nav class="avs1-filters" aria-label="아바타 획득 방식 필터">${FILTERS.map(([value, label]) => `<button type="button" class="${state.filter === value ? 'is-active' : ''}" data-avatar-filter="${value}">${label}</button>`).join('')}</nav>
        <div class="avs1-card-grid">${items.length ? items.map(card).join('') : '<div class="avs1-empty"><b>표시할 아바타가 없습니다.</b><span>다른 분류를 선택해 주세요.</span></div>'}</div>`;
    }

    function confirm(item) {
      if (!item || state.confirmCode !== item.code) return '';
      const effects = effectInfos(item), effect = effects[0] || effectInfo(item);
      return `<div class="avs1-confirm-layer" role="presentation"><section class="avs1-confirm" role="dialog" aria-modal="true" aria-label="아바타 구매 확인">
        <header><small>COIN PURCHASE</small><button type="button" data-avatar-confirm-close aria-label="닫기">${icon('close')}</button></header>
        <div class="avs1-confirm-preview">${picture(item, 'avs1-confirm-picture', true)}</div>
        <h2>${escapeHtml(item.name)}</h2>
        <p>아바타는 계정에 영구 귀속됩니다. 장착 시 등록된 옵션이 모두 활성화되며, 다른 아바타로 교체한 뒤에는 24시간의 교체 대기 시간이 적용됩니다.</p>
        <dl><div><dt>장착 효과</dt><dd>${escapeHtml((effects.length ? effects : [effect]).map((row) => row.summary).join(' · '))}</dd></div><div><dt>구매 가격</dt><dd>${formatNumber(item.coinPrice)} COIN</dd></div><div><dt>구매 후 잔액</dt><dd>${formatNumber(Math.max(0, Number(state.data?.coin || 0) - Number(item.coinPrice || 0)))} COIN</dd></div></dl>
        <div class="avs1-confirm-actions"><button type="button" data-avatar-confirm-close>취소</button><button type="button" data-avatar-confirm-buy="${escapeHtml(item.code)}" ${Number(state.data?.coin || 0) < Number(item.coinPrice || 0) ? 'disabled' : ''}>구매 확정</button></div>
      </section></div>`;
    }

    function shell() {
      const item = currentItem();
      const profile = state.data?.profile || options.profile || {};
      return `<div class="avs1-shell">
        <header class="avs1-command-header">
          <button type="button" class="avs1-back" data-avatar-back aria-label="장비 화면으로 돌아가기">${icon('back')}</button>
          <div class="avs1-brand"><span>${icon('wardrobe')}</span><div><small>SOOPKETMON / APPEARANCE SYSTEM</small><strong>아바타 아카이브</strong></div></div>
          <div class="avs1-wallet"><small>${escapeHtml(profile.nickname || '플레이어')}</small><span>MY COIN</span><b>${formatNumber(state.data?.coin)} <em>COIN</em></b></div>
        </header>
        <main class="avs1-workspace">
          ${hero(item)}
          <section class="avs1-console">
            ${dossier(item)}
            <div class="avs1-archive">${archive()}</div>
          </section>
        </main>
        ${confirm(item)}
        <div class="avs1-notice" data-avatar-notice role="status" aria-live="polite"></div>
      </div>`;
    }

    function render() {
      root.innerHTML = shell();
      renderNotice();
    }

    async function mutate(path, item, success) {
      if (state.busy) return;
      state.busy = true;
      root.classList.add('is-busy');
      try {
        const response = await request(path, {
          method: 'POST',
          body: JSON.stringify({ avatarCode: item.code, requestId: uid() })
        });
        if (response?.coin !== undefined) state.data.coin = Number(response.coin || 0);
        if (path === 'avatar/purchase') item.owned = true;
        if (path === 'avatar/equip') {
          state.data.avatars.forEach((row) => { row.equipped = row.code === item.code; });
          state.data.equipCooldown = response?.equipCooldown || state.data.equipCooldown || {};
          window.dispatchEvent(new CustomEvent('cnine:avatar-equipped', { detail: { avatar: structuredClone(item), equipCooldown: structuredClone(state.data.equipCooldown) } }));
        }
        state.confirmCode = '';
        render();
        showNotice(success);
        options.onChange?.(structuredClone(state.data), response);
      } catch (error) {
        if (error?.code === 'AVATAR_EQUIP_COOLDOWN') state.data.equipCooldown = { durationMs: error.durationMs, remainingMs: error.remainingMs, nextEquipAt: error.nextEquipAt, locked: true };
        state.confirmCode = '';
        render();
        showNotice(error?.message || '요청을 처리하지 못했습니다.', true);
      } finally {
        state.busy = false;
        root.classList.remove('is-busy');
      }
    }

    function onClick(event) {
      const button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      if (button.hasAttribute('data-avatar-back')) options.onBack?.();
      else if (button.dataset.avatarSelect) { state.selectedCode = button.dataset.avatarSelect; state.confirmCode = ''; render(); }
      else if (button.dataset.avatarFilter) { state.filter = button.dataset.avatarFilter; render(); }
      else if (button.dataset.avatarBuy) { state.confirmCode = button.dataset.avatarBuy; render(); root.querySelector('[data-avatar-confirm-close]')?.focus(); }
      else if (button.dataset.avatarConfirmBuy) {
        const item = state.data.avatars.find((row) => row.code === button.dataset.avatarConfirmBuy);
        if (item) mutate('avatar/purchase', item, `${item.name} 구매 완료`);
      } else if (button.dataset.avatarEquip) {
        const item = state.data.avatars.find((row) => row.code === button.dataset.avatarEquip);
        if (item) mutate('avatar/equip', item, `${item.name} 적용 완료`);
      } else if (button.hasAttribute('data-avatar-confirm-close')) { state.confirmCode = ''; render(); }
    }

    async function load() {
      root.innerHTML = '<div class="avs1-loading"><span></span><strong>아바타 아카이브 연결 중</strong><small>판매 목록과 획득 경로를 불러옵니다.</small></div>';
      try {
        state.data = options.data ? structuredClone(options.data) : await request('avatar/catalog');
        state.data.avatars = Array.isArray(state.data?.avatars) ? state.data.avatars : [];
        state.data.equipCooldown = state.data?.equipCooldown || { durationMs: 86400000, remainingMs: 0, nextEquipAt: null, locked: false };
        state.selectedCode = state.data.avatars.find((item) => item.equipped)?.code || state.data.avatars.find((item) => item.owned)?.code || state.data.avatars[0]?.code || '';
        render();
        window.clearInterval(state.cooldownTimer);
        state.cooldownTimer = window.setInterval(() => {
          if (!root.isConnected) return;
          const buttons = [...root.querySelectorAll('.avs1-primary-action.is-cooldown')], remaining = cooldownRemaining();
          if (remaining > 0) buttons.forEach((button) => { button.innerHTML = `${icon('lock')} 교체 대기 · ${escapeHtml(formatRemaining(remaining))}`; });
          else if (state.data?.equipCooldown?.locked) {
            state.data.equipCooldown = { ...state.data.equipCooldown, locked: false, remainingMs: 0, nextEquipAt: null };
            if (buttons.length) render();
          }
        }, 30000);
      } catch (error) {
        root.innerHTML = `<div class="avs1-load-error"><b>아바타 상점을 불러오지 못했습니다.</b><span>${escapeHtml(error?.message || '잠시 후 다시 시도해 주세요.')}</span><button type="button" data-avatar-retry>다시 시도</button></div>`;
        root.querySelector('[data-avatar-retry]')?.addEventListener('click', load, { once: true });
      }
    }

    root.addEventListener('click', onClick);
    load();

    return {
      reload: load,
      getState: () => structuredClone(state.data),
      destroy() {
        window.clearTimeout(state.noticeTimer);
        window.clearInterval(state.cooldownTimer);
        root.removeEventListener('click', onClick);
        root.innerHTML = '';
      }
    };
  }

  window.SoopketmonAvatarShopV1 = { create };
})();
