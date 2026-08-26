/* SOOPKETMON CHARACTER LOADOUT V2
 * Production candidate: consumes the live character/loadout contract and the
 * existing equip/unequip endpoints. Preview pages inject only a fixture request
 * adapter; the renderer and interaction code are shared with production.
 */
(() => {
  'use strict';

  const SLOT_ORDER = ['WEAPON', 'ACCESSORY', 'TOP', 'BOTTOM', 'SHOES'];
  const SLOT_LABELS = { WEAPON: '무기', ACCESSORY: '장신구', TOP: '상의', BOTTOM: '하의', SHOES: '신발' };
  const SLOT_CODES = { WEAPON: 'WP', ACCESSORY: 'AC', TOP: 'TP', BOTTOM: 'BT', SHOES: 'SH' };
  const RARITY_ORDER = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'MAGIC', 'NORMAL'];
  const RARITY_LABELS = { NORMAL: '일반', MAGIC: '고급', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설', MYTHIC: '신화' };
  const TAB_LABELS = { equipment: '장비', title: '칭호', garage: '이동수단' };
  const TITLE_STYLE_LABELS = { DEFAULT: '기본', FOREST: '숲', FLAME: '화염', FROST: '서리', STORM: '폭풍', SHADOW: '그림자', GOLD: '황금', RAINBOW: '무지개', VOID: '심연', CRIMSON: '진홍' };
  const UNLOCK_LABELS = { MANUAL: '운영 지급', COLLECTION_COUNT: '도감 달성', GRADE_COUNT: '등급 도감', MEMBER_COMPLETE: '멤버 도감', CARD_SET: '카드 세트', CONTENT_CLEAR: '콘텐츠 클리어' };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const formatNumber = (value) => Number(value || 0).toLocaleString('ko-KR');
  const normalizeRarity = (value) => RARITY_LABELS[String(value || '').toUpperCase()] ? String(value).toUpperCase() : 'NORMAL';
  const rarityClass = (value) => `is-${normalizeRarity(value).toLowerCase()}`;
  const titleStyleClass = (value) => `is-title-${String(value || 'DEFAULT').toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
  const titleFontClass = (value) => {
    const preset = String(value || 'DEFAULT').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `is-font-${preset} title-font-${preset}`;
  };

  const icon = (name) => {
    const paths = {
      equipment: '<path d="m5 4 14 16M19 4 5 20M4 7l2-3 4 1M20 7l-2-3-4 1"/>',
      title: '<path d="M7 4h10v4c0 3-2.2 5.5-5 6-2.8-.5-5-3-5-6V4Zm-3 1h3v3c0 2-1.2 3-3 3V5Zm16 0h-3v3c0 2 1.2 3 3 3V5ZM12 14v5m-4 1h8"/>',
      garage: '<path d="M4 15h16l-1-5-2-2H7l-2 2-1 5Zm2 0v3m12-3v3M8 12h8M7 8l1-3h8l1 3"/>',
      avatar: '<path d="M8.5 8.5c.7-2.8 2-4.3 3.5-4.3s2.8 1.5 3.5 4.3l-1.2 3.2-2.3 1.6-2.3-1.6-1.2-3.2Z"/><path d="M5 21c.6-4.8 2.9-7.5 7-7.5s6.4 2.7 7 7.5M8 15.2l4 3.4 4-3.4"/>',
      filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
      power: '<path d="M13 2 5 13h6l-1 9 8-12h-6l1-8Z"/>',
      shield: '<path d="m12 3 7 3v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      check: '<path d="m5 12 4 4L19 6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.equipment}</svg>`;
  };

  function create(root, options = {}) {
    if (!root) throw new Error('장비 시스템을 표시할 영역이 없습니다.');

    const state = {
      data: null,
      tab: options.initialTab || new URL(window.location.href).searchParams.get('tab') || 'equipment',
      slot: 'ALL',
      rarity: 'ALL',
      sort: 'POWER',
      search: '',
      busy: false,
      notice: null,
      noticeTimer: 0
    };
    if (!TAB_LABELS[state.tab]) state.tab = 'equipment';

    const profile = options.profile || (typeof window.loadUser === 'function' ? window.loadUser() : null) || { nickname: '플레이어' };
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

    const equippedInstance = (slot) => {
      const id = Number(state.data?.loadout?.[slot] || 0);
      return state.data?.instances?.find((row) => Number(row.instanceId) === id) || null;
    };
    const equippedTitle = () => {
      const id = Number(state.data?.equippedTitleId || 0);
      return state.data?.titles?.find((row) => Number(row.id) === id) || state.data?.bonuses?.title || null;
    };
    const equippedVehicle = () => {
      const id = Number(state.data?.equippedVehicleId || 0);
      return state.data?.vehicles?.find((row) => Number(row.id) === id) || state.data?.bonuses?.garage || null;
    };

    function recalculate() {
      if (!state.data) return;
      let equipmentPve = 0;
      let equipmentPvp = 0;
      state.data.instances = (state.data.instances || []).map((row) => {
        const equipped = Number(state.data.loadout?.[row.item?.slot] || 0) === Number(row.instanceId);
        if (equipped) {
          equipmentPve += Number(row.item?.pvePower || 0);
          equipmentPvp += Number(row.item?.pvpPower || 0);
        }
        return { ...row, equipped };
      });
      const title = equippedTitle();
      const vehicle = equippedVehicle();
      const titlePve = Number(title?.pvePower || 0);
      const garagePve = Number(vehicle?.pvePower || 0);
      const garagePvp = Number(vehicle?.pvpPower || 0);
      state.data.bonuses = {
        ...(state.data.bonuses || {}), equipmentPve, equipmentPvp, titlePve, titlePvp: titlePve,
        garagePve, garagePvp, pve: equipmentPve + titlePve + garagePve, pvp: equipmentPvp + titlePve + garagePvp
      };
    }

    function showNotice(message, error = false) {
      window.clearTimeout(state.noticeTimer);
      state.notice = { message, error };
      renderNotice();
      state.noticeTimer = window.setTimeout(() => {
        state.notice = null;
        renderNotice();
      }, error ? 2600 : 1400);
    }

    function renderNotice() {
      const host = root.querySelector('[data-loadout-notice]');
      if (!host) return;
      if (!state.notice) {
        host.className = 'clv2-notice';
        host.textContent = '';
        return;
      }
      host.className = `clv2-notice is-visible${state.notice.error ? ' is-error' : ''}`;
      host.textContent = state.notice.message;
    }

    const art = (item, eager = false) => item?.image
      ? `<img class="clv2-art-image" src="${escapeHtml(resolveAsset(item.image))}" alt="${escapeHtml(item.name || '')}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`
      : '<span class="clv2-art-empty" aria-hidden="true"></span>';

    function slotCard(slot) {
      const row = equippedInstance(slot);
      const item = row?.item;
      return `<article class="clv2-equip-slot slot-${slot.toLowerCase()} ${item ? `is-filled ${rarityClass(item.rarity)}` : 'is-empty'}" data-slot-card="${slot}">
        <span class="clv2-slot-index">${SLOT_CODES[slot]}</span>
        <span class="clv2-slot-label">${SLOT_LABELS[slot]}</span>
        <button class="clv2-slot-hit" type="button" data-slot-filter="${slot}" aria-label="${SLOT_LABELS[slot]} 장비 보기"></button>
        <div class="clv2-item-art clv2-slot-art">${item ? art(item, true) : `<span class="clv2-slot-ghost">${icon(slot === 'ACCESSORY' ? 'shield' : 'equipment')}</span>`}</div>
        <div class="clv2-slot-caption"><strong>${escapeHtml(item?.name || '미장착')}</strong><small>${item ? `${RARITY_LABELS[normalizeRarity(item.rarity)]} · PVE +${formatNumber(item.pvePower)}` : '슬롯을 선택해 장착'}</small></div>
        ${item ? `<button class="clv2-slot-remove" type="button" data-unequip="${slot}" aria-label="${SLOT_LABELS[slot]} 장착 해제">${icon('close')}</button>` : ''}
      </article>`;
    }

    function filteredEquipment() {
      let rows = [...(state.data?.instances || [])];
      if (state.slot !== 'ALL') rows = rows.filter((row) => row.item?.slot === state.slot);
      if (state.rarity !== 'ALL') rows = rows.filter((row) => normalizeRarity(row.item?.rarity) === state.rarity);
      if (state.search) {
        const query = state.search.toLocaleLowerCase('ko-KR');
        rows = rows.filter((row) => `${row.item?.name || ''} ${row.item?.description || ''}`.toLocaleLowerCase('ko-KR').includes(query));
      }
      const rarityIndex = (value) => RARITY_ORDER.indexOf(normalizeRarity(value));
      rows.sort((a, b) => {
        if (state.sort === 'RECENT') return String(b.acquiredAt || '').localeCompare(String(a.acquiredAt || ''));
        if (state.sort === 'RARITY') return rarityIndex(a.item?.rarity) - rarityIndex(b.item?.rarity) || Number(b.item?.totalPower || 0) - Number(a.item?.totalPower || 0);
        if (state.sort === 'NAME') return String(a.item?.name || '').localeCompare(String(b.item?.name || ''), 'ko-KR');
        return Number(b.item?.totalPower || 0) - Number(a.item?.totalPower || 0);
      });
      return rows;
    }

    function equipmentItem(row) {
      const item = row.item || {};
      return `<button type="button" class="clv2-inventory-item ${rarityClass(item.rarity)}${row.equipped ? ' is-equipped' : ''}" data-equip="${row.instanceId}" ${row.equipped ? 'disabled' : ''}>
        <span class="clv2-item-grade">${RARITY_LABELS[normalizeRarity(item.rarity)]}</span>
        <div class="clv2-item-art clv2-inventory-art">${art(item)}</div>
        <span class="clv2-equipped-mark">${icon('check')} 장착</span>
        <span class="clv2-item-copy"><strong>${escapeHtml(item.name || '이름 없음')}</strong><small>${SLOT_LABELS[item.slot] || item.slot || ''} · PVE +${formatNumber(item.pvePower)}</small></span>
      </button>`;
    }

    function profilePanel() {
      const bonuses = state.data?.bonuses || {};
      const title = equippedTitle();
      return `<aside class="clv2-profile-panel">
        <header class="clv2-panel-heading"><span>OPERATOR STATUS</span><i>01</i></header>
        <div class="clv2-profile-name"><small>현재 계정</small><strong>${escapeHtml(profile.nickname || '플레이어')}</strong><span class="${titleStyleClass(title?.stylePreset)} ${titleFontClass(title?.fontPreset)}">[${escapeHtml(title?.badgeText || title?.name || '칭호 없음')}]</span></div>
        <div class="clv2-power-core"><span>통합 전투 보너스</span><strong>${formatNumber(Number(bonuses.pve || 0) + Number(bonuses.pvp || 0))}</strong><small>장비 · 칭호 · 이동수단 반영</small></div>
        <dl class="clv2-stat-list">
          <div><dt>PVE 전투력</dt><dd>+${formatNumber(bonuses.pve)}</dd></div>
          <div><dt>PVP 전투력</dt><dd>+${formatNumber(bonuses.pvp)}</dd></div>
          <div><dt>장비 보너스</dt><dd>+${formatNumber(bonuses.equipmentPve)}</dd></div>
          <div><dt>칭호 보너스</dt><dd>+${formatNumber(bonuses.titlePve)}</dd></div>
          <div><dt>이동수단</dt><dd>+${formatNumber(bonuses.garagePve)}</dd></div>
        </dl>
        <div class="clv2-profile-foot"><i></i><span>LIVE LOADOUT</span><b>${SLOT_ORDER.filter((slot) => equippedInstance(slot)).length} / 5</b></div>
      </aside>`;
    }

    function inventoryPanel() {
      const rows = filteredEquipment();
      const all = state.data?.instances || [];
      return `<aside class="clv2-inventory-panel">
        <header class="clv2-panel-heading"><span>OWNED EQUIPMENT</span><i>${formatNumber(all.length)}</i></header>
        <div class="clv2-inventory-toolbar">
          <label class="clv2-search"><span>장비 검색</span><input type="search" value="${escapeHtml(state.search)}" placeholder="장비명 검색" data-equipment-search></label>
          <label><span>등급</span><select data-equipment-rarity><option value="ALL">전체 등급</option>${RARITY_ORDER.map((rarity) => `<option value="${rarity}"${state.rarity === rarity ? ' selected' : ''}>${RARITY_LABELS[rarity]}</option>`).join('')}</select></label>
          <label><span>정렬</span><select data-equipment-sort><option value="POWER"${state.sort === 'POWER' ? ' selected' : ''}>전투력 높은 순</option><option value="RARITY"${state.sort === 'RARITY' ? ' selected' : ''}>등급 높은 순</option><option value="RECENT"${state.sort === 'RECENT' ? ' selected' : ''}>최근 획득 순</option><option value="NAME"${state.sort === 'NAME' ? ' selected' : ''}>이름 순</option></select></label>
        </div>
        <div class="clv2-slot-filters" role="group" aria-label="장비 부위 필터">
          <button type="button" class="${state.slot === 'ALL' ? 'is-active' : ''}" data-slot-filter="ALL">전체</button>
          ${SLOT_ORDER.map((slot) => `<button type="button" class="${state.slot === slot ? 'is-active' : ''}" data-slot-filter="${slot}">${SLOT_LABELS[slot]}</button>`).join('')}
        </div>
        <div class="clv2-inventory-grid">${rows.length ? rows.map(equipmentItem).join('') : '<div class="clv2-empty-state"><b>조건에 맞는 장비가 없습니다.</b><span>필터를 변경해 주세요.</span></div>'}</div>
      </aside>`;
    }

    function equipmentView() {
      const avatar = state.data?.equippedAvatar || null;
      const operatorImage = avatar?.equipmentImage || 'assets/ui/character-loadout-v2/quartermaster-v1.webp';
      const operatorAlt = avatar?.name ? `${avatar.name} 장착 아바타` : '장비 관리 오퍼레이터';
      return `<section class="clv2-view clv2-equipment-view">
        ${profilePanel()}
        <article class="clv2-armory-stage">
          <header class="clv2-stage-status"><span><i></i> EQUIPMENT LINK ONLINE</span><b>LOADOUT 05</b></header>
          <div class="clv2-armory-backdrop" aria-hidden="true"></div>
          <div class="clv2-reactor" aria-hidden="true"><i></i><i></i><i></i></div>
          <img class="clv2-quartermaster${avatar?.equipmentImage ? ' is-equipped-avatar' : ''}" src="${escapeHtml(resolveAsset(operatorImage))}" alt="${escapeHtml(operatorAlt)}" loading="eager" decoding="async">
          ${SLOT_ORDER.map(slotCard).join('')}
          <div class="clv2-stage-readout"><small>ACTIVE CONFIGURATION</small><strong>${SLOT_ORDER.filter((slot) => equippedInstance(slot)).length} SLOT LINKED</strong><span>아이템은 원본 비율을 유지해 장착 칸 안에 표시됩니다.</span></div>
        </article>
        ${inventoryPanel()}
      </section>`;
    }

    function titleRequirement(row) {
      const cfg = row.unlockConfig || {};
      if (row.unlockType === 'COLLECTION_COUNT') return `도감 ${formatNumber(cfg.count || 1)}장`;
      if (row.unlockType === 'GRADE_COUNT') return `${escapeHtml(cfg.grade || '지정 등급')} ${formatNumber(cfg.count || 1)}장`;
      return UNLOCK_LABELS[row.unlockType] || '운영 지급';
    }

    function titleView() {
      const rows = state.data?.titles || [];
      const active = equippedTitle();
      const owned = rows.filter((row) => row.owned).length;
      return `<section class="clv2-view clv2-title-view">
        <article class="clv2-title-showcase ${titleStyleClass(active?.stylePreset)}">
          <div class="clv2-title-sigil" aria-hidden="true">${icon('title')}</div>
          <p>ACTIVE TITLE SIGNATURE</p>
          <h2 class="${titleFontClass(active?.fontPreset)}">[${escapeHtml(active?.badgeText || active?.name || '칭호 없음')}]</h2>
          <span>${active ? escapeHtml(active.description || '장착 중인 칭호가 계정과 전투 화면에 적용됩니다.') : '보유 칭호에서 하나를 선택해 장착하세요.'}</span>
          <strong>전체 전투 +${formatNumber(active?.pvePower || 0)}</strong>
          ${active ? '<button type="button" data-title-unequip>칭호 해제</button>' : ''}
        </article>
        <aside class="clv2-title-collection">
          <header class="clv2-panel-heading"><span>TITLE ARCHIVE</span><i>${owned} / ${rows.length}</i></header>
          <div class="clv2-title-grid">${rows.map((row) => `<article class="clv2-title-card ${row.owned ? 'is-owned' : 'is-locked'} ${row.equipped ? 'is-equipped' : ''} ${titleStyleClass(row.stylePreset)}">
            <span>${TITLE_STYLE_LABELS[String(row.stylePreset || 'DEFAULT').toUpperCase()] || '기본'}</span>
            <strong class="${titleFontClass(row.fontPreset)}">[${escapeHtml(row.badgeText || row.name)}]</strong>
            <small>${row.owned ? escapeHtml(row.description || '보유 칭호') : titleRequirement(row)}</small>
            <em>전체 전투 +${formatNumber(row.pvePower)}</em>
            ${row.owned ? (row.equipped ? '<button type="button" disabled>장착 중</button>' : `<button type="button" data-title-equip="${row.id}">장착</button>`) : '<button type="button" disabled>미획득</button>'}
          </article>`).join('') || '<div class="clv2-empty-state"><b>등록된 칭호가 없습니다.</b></div>'}</div>
        </aside>
      </section>`;
    }

    function vehicleCard(row) {
      return `<article class="clv2-vehicle-card ${row.owned ? 'is-owned' : 'is-locked'} ${row.equipped ? 'is-equipped' : ''} ${rarityClass(row.rarity)}">
        <div class="clv2-vehicle-thumb">${row.image ? art(row) : '<span class="clv2-art-empty"></span>'}</div>
        <div><span>${RARITY_LABELS[normalizeRarity(row.rarity)]}</span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.description || '이동수단')}</small></div>
        <dl><div><dt>PVE</dt><dd>+${formatNumber(row.pvePower)}</dd></div><div><dt>PVP</dt><dd>+${formatNumber(row.pvpPower)}</dd></div></dl>
        ${row.owned ? (row.equipped ? '<button type="button" data-garage-unequip>장착 해제</button>' : `<button type="button" data-garage-equip="${row.id}">장착</button>`) : '<button type="button" disabled>미획득</button>'}
      </article>`;
    }

    function garageView() {
      const active = equippedVehicle();
      const rows = state.data?.vehicles || [];
      return `<section class="clv2-view clv2-garage-view">
        <article class="clv2-garage-bay ${active ? 'has-vehicle' : 'is-empty'}">
          <div class="clv2-garage-grid" aria-hidden="true"></div>
          <header class="clv2-stage-status"><span><i></i> GARAGE LINK ONLINE</span><b>BAY 01</b></header>
          ${active?.image ? `<img class="clv2-garage-vehicle" src="${escapeHtml(resolveAsset(active.image))}" alt="${escapeHtml(active.name)}" loading="eager" decoding="async">` : '<div class="clv2-garage-empty"><b>이동수단 미장착</b><span>보유 이동수단에서 장착할 수 있습니다.</span></div>'}
          <div class="clv2-garage-active-copy"><small>${active ? RARITY_LABELS[normalizeRarity(active.rarity)] : 'NO VEHICLE'}</small><strong>${escapeHtml(active?.name || '장착된 이동수단 없음')}</strong><span>${escapeHtml(active?.description || '보유 이동수단에서 원하는 항목을 선택하세요.')}</span></div>
        </article>
        <aside class="clv2-vehicle-collection">
          <header class="clv2-panel-heading"><span>VEHICLE STORAGE</span><i>${rows.filter((row) => row.owned).length} / ${rows.length}</i></header>
          <div class="clv2-vehicle-list">${rows.map(vehicleCard).join('') || '<div class="clv2-empty-state"><b>등록된 이동수단이 없습니다.</b></div>'}</div>
        </aside>
      </section>`;
    }

    function shell() {
      const activeTitle = equippedTitle();
      const avatarEntry = state.data?.avatarFeature?.visible === true && typeof options.onOpenAvatarShop === 'function'
        ? `<button type="button" class="clv2-avatar-entry" data-open-avatar-shop aria-label="아바타 컬렉션과 상점 열기">${icon('avatar')}<span>아바타</span><em>SHOP</em></button>`
        : '';
      return `<div class="clv2-shell" data-active-tab="${state.tab}">
        <header class="clv2-command-header">
          <div class="clv2-brand-block"><span class="clv2-brand-mark">S</span><div><small>SOOPKETMON / GROWTH SYSTEM</small><strong>장비 시스템</strong></div></div>
          <nav class="clv2-tabs${avatarEntry ? ' has-avatar-entry' : ''}" aria-label="캐릭터 성장 메뉴">${Object.entries(TAB_LABELS).map(([tab, label]) => `<button type="button" class="${state.tab === tab ? 'is-active' : ''}" data-tab="${tab}" aria-selected="${state.tab === tab}">${icon(tab)}<span>${label}</span></button>`).join('')}${avatarEntry}</nav>
          <div class="clv2-live-status"><span><i></i> LIVE DATA</span><b>${escapeHtml(profile.nickname || '플레이어')}</b><small class="${titleStyleClass(activeTitle?.stylePreset)}">[${escapeHtml(activeTitle?.badgeText || activeTitle?.name || '칭호 없음')}]</small></div>
        </header>
        <main class="clv2-content">${state.tab === 'equipment' ? equipmentView() : state.tab === 'title' ? titleView() : garageView()}</main>
        <div class="clv2-notice" data-loadout-notice role="status" aria-live="polite"></div>
      </div>`;
    }

    function render() {
      root.innerHTML = shell();
      renderNotice();
    }

    async function mutate(action, optimistic, rollback, successMessage) {
      if (state.busy) return;
      state.busy = true;
      root.classList.add('is-busy');
      optimistic();
      render();
      try {
        const response = await action();
        if (response?.bonuses) state.data.bonuses = { ...(state.data.bonuses || {}), ...response.bonuses };
        recalculate();
        render();
        showNotice(successMessage);
        options.onChange?.(state.data, response);
      } catch (error) {
        rollback();
        recalculate();
        render();
        showNotice(error?.message || '요청을 처리하지 못했습니다.', true);
      } finally {
        state.busy = false;
        root.classList.remove('is-busy');
      }
    }

    function equip(instanceId) {
      const row = state.data.instances.find((entry) => Number(entry.instanceId) === Number(instanceId));
      if (!row || row.equipped) return;
      const slot = row.item.slot;
      const previous = state.data.loadout?.[slot] || null;
      mutate(
        () => request('character/equipment/equip', { method: 'POST', body: JSON.stringify({ instanceId: Number(instanceId) }) }),
        () => { state.data.loadout = { ...(state.data.loadout || {}), [slot]: Number(instanceId) }; recalculate(); },
        () => { state.data.loadout = { ...(state.data.loadout || {}) }; if (previous) state.data.loadout[slot] = previous; else delete state.data.loadout[slot]; },
        `${row.item.name} 장착 완료`
      );
    }

    function unequip(slot) {
      const previous = state.data.loadout?.[slot] || null;
      if (!previous) return;
      mutate(
        () => request('character/equipment/unequip', { method: 'POST', body: JSON.stringify({ slot }) }),
        () => { state.data.loadout = { ...(state.data.loadout || {}) }; delete state.data.loadout[slot]; recalculate(); },
        () => { state.data.loadout = { ...(state.data.loadout || {}), [slot]: previous }; },
        `${SLOT_LABELS[slot]} 장착 해제`
      );
    }

    function setTitle(titleId) {
      const previous = state.data.equippedTitleId || null;
      const row = state.data.titles.find((entry) => Number(entry.id) === Number(titleId) && entry.owned);
      if (!row) return;
      mutate(
        () => request('character/title/equip', { method: 'POST', body: JSON.stringify({ titleId: Number(titleId) }) }),
        () => { state.data.equippedTitleId = Number(titleId); state.data.titles.forEach((entry) => { entry.equipped = Number(entry.id) === Number(titleId); }); recalculate(); },
        () => { state.data.equippedTitleId = previous; state.data.titles.forEach((entry) => { entry.equipped = Number(entry.id) === Number(previous); }); },
        `${row.badgeText || row.name} 칭호 장착 완료`
      );
    }

    function clearTitle() {
      const previous = state.data.equippedTitleId || null;
      mutate(
        () => request('character/title/unequip', { method: 'POST', body: '{}' }),
        () => { state.data.equippedTitleId = null; state.data.titles.forEach((entry) => { entry.equipped = false; }); recalculate(); },
        () => { state.data.equippedTitleId = previous; state.data.titles.forEach((entry) => { entry.equipped = Number(entry.id) === Number(previous); }); },
        '칭호 장착 해제'
      );
    }

    function setVehicle(vehicleId) {
      const previous = state.data.equippedVehicleId || null;
      const row = state.data.vehicles.find((entry) => Number(entry.id) === Number(vehicleId) && entry.owned);
      if (!row) return;
      mutate(
        () => request('character/garage/equip', { method: 'POST', body: JSON.stringify({ vehicleId: Number(vehicleId) }) }),
        () => { state.data.equippedVehicleId = Number(vehicleId); state.data.vehicles.forEach((entry) => { entry.equipped = Number(entry.id) === Number(vehicleId); }); recalculate(); },
        () => { state.data.equippedVehicleId = previous; state.data.vehicles.forEach((entry) => { entry.equipped = Number(entry.id) === Number(previous); }); },
        `${row.name} 장착 완료`
      );
    }

    function clearVehicle() {
      const previous = state.data.equippedVehicleId || null;
      mutate(
        () => request('character/garage/unequip', { method: 'POST', body: '{}' }),
        () => { state.data.equippedVehicleId = null; state.data.vehicles.forEach((entry) => { entry.equipped = false; }); recalculate(); },
        () => { state.data.equippedVehicleId = previous; state.data.vehicles.forEach((entry) => { entry.equipped = Number(entry.id) === Number(previous); }); },
        '이동수단 장착 해제'
      );
    }

    function onClick(event) {
      const target = event.target.closest('button');
      if (!target || !root.contains(target)) return;
      if (target.hasAttribute('data-open-avatar-shop')) {
        options.onOpenAvatarShop?.();
      } else if (target.dataset.tab) {
        state.tab = target.dataset.tab;
        const url = new URL(window.location.href);
        url.searchParams.set('tab', state.tab);
        history.replaceState(null, '', url);
        render();
      } else if (target.dataset.slotFilter) {
        state.slot = target.dataset.slotFilter;
        render();
      } else if (target.dataset.equip) equip(Number(target.dataset.equip));
      else if (target.dataset.unequip) unequip(target.dataset.unequip);
      else if (target.dataset.titleEquip) setTitle(Number(target.dataset.titleEquip));
      else if (target.hasAttribute('data-title-unequip')) clearTitle();
      else if (target.dataset.garageEquip) setVehicle(Number(target.dataset.garageEquip));
      else if (target.hasAttribute('data-garage-unequip')) clearVehicle();
    }

    function onChange(event) {
      if (event.target.matches('[data-equipment-rarity]')) { state.rarity = event.target.value; render(); }
      else if (event.target.matches('[data-equipment-sort]')) { state.sort = event.target.value; render(); }
    }

    function onInput(event) {
      if (!event.target.matches('[data-equipment-search]')) return;
      state.search = event.target.value;
      const cursor = event.target.selectionStart;
      render();
      const next = root.querySelector('[data-equipment-search]');
      next?.focus({ preventScroll: true });
      next?.setSelectionRange(cursor, cursor);
    }

    async function load() {
      root.innerHTML = '<div class="clv2-loading"><i></i><strong>장비 연결 중</strong><span>보유 장비와 장착 정보를 불러옵니다.</span></div>';
      try {
        state.data = options.data ? structuredClone(options.data) : await request('character/loadout');
        state.data.loadout ||= {};
        state.data.instances ||= [];
        state.data.titles ||= [];
        state.data.vehicles ||= [];
        state.data.bonuses ||= {};
        recalculate();
        render();
      } catch (error) {
        root.innerHTML = `<div class="clv2-load-error"><b>장비 정보를 불러오지 못했습니다.</b><span>${escapeHtml(error?.message || '잠시 후 다시 시도해 주세요.')}</span><button type="button" data-retry>다시 시도</button></div>`;
        root.querySelector('[data-retry]')?.addEventListener('click', load, { once: true });
      }
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    load();

    return {
      reload: load,
      setTab(tab) { if (TAB_LABELS[tab]) { state.tab = tab; render(); } },
      getState() { return structuredClone(state.data); },
      destroy() {
        window.clearTimeout(state.noticeTimer);
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        root.removeEventListener('input', onInput);
        root.innerHTML = '';
      }
    };
  }

  window.SoopketmonCharacterLoadoutV2 = { create };
})();
