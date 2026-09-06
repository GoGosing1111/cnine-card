(function soopketmonV21ExactShellAdapter(global) {
  'use strict';

  const VERSION = '21.25.0-player-card';
  const WRAPPED = Symbol.for('soopketmon.v21.exactShell.renderShell');
  const script = document.currentScript;
  const enabled = script?.dataset?.enabled !== 'false';
  const defaultHome = script?.dataset?.defaultHome !== 'false';
  const navigationType = (() => {
    try {
      const entry = global.performance?.getEntriesByType?.('navigation')?.[0];
      if (entry?.type) return String(entry.type);
      return Number(global.performance?.navigation?.type) === 1 ? 'reload' : 'navigate';
    } catch { return 'navigate'; }
  })();
  const requestedParams = new URLSearchParams(location.search);
  const requestedScreen = navigationType === 'reload' ? '' : requestedParams.get('screen');
  if (navigationType === 'reload' && requestedParams.has('screen') && global.history?.replaceState) {
    requestedParams.delete('screen');
    const query = requestedParams.toString();
    global.history.replaceState(global.history.state, '', `${location.pathname || ''}${query ? `?${query}` : ''}${location.hash || ''}`);
  }
  let nativeRenderShell = null;
  let currentRoute = requestedScreen || 'home';
  let explicitNavigation = false;
  let bootHomePending = defaultHome && !requestedScreen;
  let bootRequestedPending = requestedScreen || '';
  // The native app intentionally renders `buy` as its bootstrap surface and
  // refreshes that surface again when burning/catalog/feature data arrives.
  // While the V21 lobby is active those background refreshes must not turn an
  // already-rendered lobby back into the store. The guard is released only by
  // an actual route intent from the user (or a non-buy native route).
  let homeRouteGuard = defaultHome && !requestedScreen;
  let pendingFrame = 0;

  function markRenewalUiReady() {
    document.documentElement.dataset.v21UiReady = '1';
    document.body?.classList.add('v21-ui-ready');
  }
  function revealStandaloneScreen() {
    if (document.querySelector('#app > .maintenance-screen, #app > .login-wrap, #app > .prison-lock-shell')) {
      markRenewalUiReady();
      return true;
    }
    return false;
  }
  let wrapTimer = 0;
  let appObserver = null;
  let chiefState = null;
  let chiefPromise = null;
  let showChiefConsole = false;

  const ICONS = Object.freeze({
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5M9 21v-6h6v6"/>',
    cards: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 7 3-2 3 2-1 3h-4Z"/><path d="M8 15h8M10 18h4"/>',
    swords: '<path d="m4 4 7 7M6 3 3 6l2 2-3 9 5 5 9-3 2 2 3-3-7-7"/><path d="m20 4-7 7"/>',
    forge: '<path d="M4 5h16l-2 5H6Z"/><path d="M8 10v4c0 3-2 5-4 6h16c-2-1-4-3-4-6v-4"/>',
    menu: '<path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    pack: '<path d="M6 3h12l3 5-3 13H6L3 8Z"/><path d="M3 8h18M9 3l3 5 3-5"/>',
    book: '<path d="M4 5c3-1 5 0 8 2v14c-3-2-5-3-8-2ZM20 5c-3-1-5 0-8 2v14c3-2 5-3 8-2Z"/>',
    magic: '<path d="M5 19 17 7M14 5l5 5M4 20l3-1-2-2Z"/><path d="M7 6h4M9 4v4M16 15h4M18 13v4"/>',
    alchemy: '<circle cx="12" cy="13" r="7"/><path d="M9 3h6M10 3v4l-4 6m8-6 4 6M8 14c2-2 6-2 8 0M12 10v7"/>',
    inventory: '<path d="M4 8h16v13H4zM7 8V4h10v4M4 12h16M10 12v3h4v-3"/>',
    gift: '<path d="M3 9h18v12H3zM2 5h20v4H2zM12 5v16"/><path d="M12 5c-4 0-5-4-2-4 2 0 2 2 2 4Zm0 0c4 0 5-4 2-4-2 0-2 2-2 4Z"/>',
    rank: '<path d="M7 4h10v5c0 4-2 7-5 8-3-1-5-4-5-8Z"/><path d="M7 6H3v2c0 3 2 5 5 5M17 6h4v2c0 3-2 5-5 5M9 21h6M12 17v4"/>',
    auction: '<path d="m5 8 7-5 7 5-7 5ZM3 18h18v3H3zM6 11v7M12 13v5M18 11v7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/>',
    clan: '<path d="M12 2 20 6v6c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6Z"/><path d="m8 13 2.5 2.5L16 9"/>',
    prison: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 3v18M12 3v18M16 3v18M4 8h16M4 17h16"/>',
    treasury: '<circle cx="12" cy="12" r="9"/><path d="M8 8.5h8M8 15.5h8M12 6v12M7 12h10"/>'
  });

  /*
   * One immutable navigation model owns every label shown by the desktop
   * lobby, mobile lobby, route header, group sheet, and runtime router. Route
   * ids intentionally remain unchanged because saved deep links and existing
   * renderShell binders depend on them.
   */
  const MENU_GROUPS = Object.freeze({
    store: Object.freeze({ title: '카드·상점', routes: Object.freeze(['buy', 'inventory']) }),
    collection: Object.freeze({ title: '도감·강화', routes: Object.freeze(['dex', 'upgrade', 'evolution', 'magic']) }),
    pve: Object.freeze({ title: 'PVE 전투', routes: Object.freeze(['battle', 'deck', 'hunt', 'raid', 'escort', 'siege', 'seal', 'idle', 'tower', 'scrapyard']) }),
    pvp: Object.freeze({ title: 'PVP·경쟁', routes: Object.freeze(['pvp', 'rank', 'clan', 'territory']) }),
    equipment: Object.freeze({ title: '장비·칭호·차고', routes: Object.freeze(['character', 'avatar']) }),
    crafting: Object.freeze({ title: '제작·합성', routes: Object.freeze(['vehicle', 'fusion', 'alchemy']) }),
    rewards: Object.freeze({ title: '보상', routes: Object.freeze(['attendance', 'dailyquest', 'messages', 'mineral']) }),
    market: Object.freeze({ title: '승부·경매', routes: Object.freeze(['prediction', 'auction']) }),
    administration: Object.freeze({ title: '행정부', routes: Object.freeze(['treasury', 'soopketland', 'prison']) })
  });
  const MENU_GROUP_ORDER = Object.freeze(['store', 'collection', 'pve', 'pvp', 'equipment', 'crafting', 'rewards', 'market', 'administration']);
  const HUB_GROUPS = Object.freeze({
    cards: Object.freeze({ title: '카드', routes: Object.freeze([...MENU_GROUPS.store.routes, ...MENU_GROUPS.collection.routes]) }),
    combat: Object.freeze({ title: '전투', routes: Object.freeze([...MENU_GROUPS.pve.routes, ...MENU_GROUPS.pvp.routes]) }),
    growth: Object.freeze({ title: '성장', routes: Object.freeze([...MENU_GROUPS.equipment.routes, ...MENU_GROUPS.crafting.routes]) })
  });
  const ROUTE_META = Object.freeze({
    buy: Object.freeze({ title: '카드 상점', group: 'store', icon: 'pack', home: Object.freeze({ title: '카드·상점', meta: '카드팩 · 장비 보급 · 이동수단' }) }),
    dex: Object.freeze({ title: '도감', group: 'collection', icon: 'book', home: Object.freeze({ title: '도감·강화', meta: '카드 수집 · 상세 · 진화' }) }),
    upgrade: Object.freeze({ title: '일괄 강화', group: 'collection', icon: 'upgrade' }),
    evolution: Object.freeze({ title: '카드 진화', group: 'collection', icon: 'cards' }),
    magic: Object.freeze({ title: '마법카드', group: 'collection', icon: 'magic' }),
    battle: Object.freeze({ title: 'PVE 전투', group: 'pve', icon: 'swords', home: Object.freeze({ title: 'PVE 전투', meta: '토벌 · 레이드 · 호송작전' }) }),
    deck: Object.freeze({ title: 'PVE 덱 편성실', group: 'pve', icon: 'cards' }),
    hunt: Object.freeze({ title: '몬스터 토벌', group: 'pve', icon: 'swords' }),
    raid: Object.freeze({ title: '월드 레이드', group: 'pve', icon: 'swords' }),
    escort: Object.freeze({ title: '호송작전', group: 'pve', icon: 'swords' }),
    siege: Object.freeze({ title: '몬스터 공성전', group: 'pve', icon: 'swords' }),
    seal: Object.freeze({ title: '봉인전', group: 'pve', icon: 'magic' }),
    idle: Object.freeze({ title: '방치형 원정', group: 'pve', icon: 'swords' }),
    tower: Object.freeze({ title: '무한의탑', group: 'pve', icon: 'rank' }),
    scrapyard: Object.freeze({ title: '폐차장 원정', group: 'pve', icon: 'forge' }),
    pvp: Object.freeze({ title: '랭크전', group: 'pvp', icon: 'swords' }),
    rank: Object.freeze({ title: '시즌 랭킹', group: 'pvp', icon: 'rank', home: Object.freeze({ title: 'PVP·경쟁', meta: '랭크전 · 시즌 랭킹', group: 'pvp' }) }),
    clan: Object.freeze({ title: '클랜', group: 'pvp', icon: 'clan' }),
    territory: Object.freeze({ title: '영토전', group: 'pvp', icon: 'swords' }),
    character: Object.freeze({ title: '장비·칭호·차고', group: 'equipment', icon: 'forge', home: Object.freeze({ title: '장비·칭호·차고', meta: '장비 · 칭호 · 차고 · 아바타', group: 'equipment' }) }),
    equipment: Object.freeze({ title: '장비', group: 'equipment', icon: 'forge' }),
    title: Object.freeze({ title: '칭호', group: 'equipment', icon: 'rank' }),
    garage: Object.freeze({ title: '차고', group: 'equipment', icon: 'inventory' }),
    avatar: Object.freeze({ title: '아바타', group: 'equipment', icon: 'user' }),
    workshop: Object.freeze({ title: '제작·합성', group: 'crafting', icon: 'forge' }),
    vehicle: Object.freeze({ title: '차량 제작', group: 'crafting', icon: 'forge' }),
    fusion: Object.freeze({ title: '장비 합성', group: 'crafting', icon: 'forge' }),
    alchemy: Object.freeze({ title: '연금술', group: 'crafting', icon: 'alchemy' }),
    attendance: Object.freeze({ title: '접속 보상', group: 'rewards', icon: 'gift', home: Object.freeze({ title: '보상', meta: '출석 · 퀘스트 · 메시지' }) }),
    dailyquest: Object.freeze({ title: '일일 퀘스트', group: 'rewards', icon: 'gift' }),
    messages: Object.freeze({ title: '메시지함', group: 'rewards', icon: 'mail' }),
    mineral: Object.freeze({ title: '교환소', group: 'rewards', icon: 'inventory' }),
    prediction: Object.freeze({ title: '승부예측', group: 'market', icon: 'auction', home: Object.freeze({ title: '승부·경매', meta: '승부예측 · 경매장' }) }),
    auction: Object.freeze({ title: '경매장', group: 'market', icon: 'auction' }),
    inventory: Object.freeze({ title: '인벤토리', group: 'store', icon: 'inventory' }),
    soopketland: Object.freeze({ title: '숲켓랜드', group: 'administration', icon: 'gift' }),
    treasury: Object.freeze({ title: '세금징수', group: 'administration', icon: 'treasury' }),
    prison: Object.freeze({ title: '감옥', group: 'administration', icon: 'prison' })
  });
  const NAVIGATION_CONTRACT = Object.freeze({
    version: '1.0.0',
    routes: ROUTE_META,
    groups: MENU_GROUPS,
    hubs: HUB_GROUPS,
    menuGroupOrder: MENU_GROUP_ORDER
  });
  global.SoopketmonV21NavigationContract = NAVIGATION_CONTRACT;

  // Array tuples are retained only as a private rendering compatibility view.
  // All values are derived from the shared route metadata above.
  const ROUTES = Object.freeze(Object.fromEntries(Object.entries(ROUTE_META).map(([id, item]) => [
    id,
    Object.freeze([item.title, MENU_GROUPS[item.group]?.title || 'SOOPKETMON', item.icon])
  ])));

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.menu}</svg>`;
  const compact = value => {
    const amount = Math.max(0, Number(value) || 0);
    if (amount >= 1e9) return `${(amount / 1e9).toFixed(amount >= 1e10 ? 1 : 2).replace(/\.0+$/, '')}B`;
    if (amount >= 1e6) return `${(amount / 1e6).toFixed(amount >= 1e8 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (amount >= 1e3) return `${(amount / 1e3).toFixed(amount >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
    return amount.toLocaleString();
  };

  function cssHref(filename) {
    if (script?.src) return new URL(`../css/${filename}`, script.src).href;
    return `css/${filename}`;
  }

  function ensureStyles() {
    [
      ['soopketmonV21ExactBase', 'soopketmon-v21-exact-base.css'],
      ['soopketmonV21ExactLuxury', 'soopketmon-v21-exact-luxury.css'],
      ['soopketmonV21ProductionIntegration', 'soopketmon-v21-production-integration.css'],
      ['liveOperationsV1868', 'live-operations-v1868.css']
    ].forEach(([id, filename]) => {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `${cssHref(filename)}?v=${VERSION}`;
      document.head.append(link);
    });
  }

  function bindMessageBadgeNormalizer(root) {
    root?.querySelectorAll?.('[data-v21-message-badge]').forEach(badge => {
      if (badge.dataset.v21BadgeBound === '1') return;
      badge.dataset.v21BadgeBound = '1';
      const normalize = () => {
        const raw = String(badge.textContent || '').trim();
        const match = raw.match(/\d+/);
        const count = match ? Number(match[0]) : 0;
        const next = count > 99 || (count === 99 && raw.includes('+')) ? '99+' : (count > 0 ? String(count) : '');
        if (raw !== next) badge.textContent = next;
        badge.hidden = count < 1;
        badge.setAttribute('aria-hidden', count < 1 ? 'true' : 'false');
      };
      new MutationObserver(normalize).observe(badge, { childList: true, characterData: true, subtree: true });
      normalize();
    });
  }

  function userModel() {
    let user = null;
    try { user = typeof global.loadUser === 'function' ? global.loadUser() : null; } catch (_) {}
    return user || { nickname: '플레이어', coin: 0, cardShards: 0, masterStars: 0 };
  }
  function clanFeatureVisible(){
    try{return typeof global.clanFeatureVisible==='function'?global.clanFeatureVisible():true}catch(_){return true}
  }

  function headerMarkup() {
    const user = userModel();
    const nickname = esc(user.nickname || '플레이어');
    const userLevel = Number(user.level || user.lv);
    const level = userLevel > 0 ? userLevel : null;
    const role = esc(user.role || (user.isOwner || user.owner ? 'OWNER' : 'PLAYER'));
    const coin = Math.max(0, Number(user.coin || 0));
    const shards = Math.max(0, Number(user.cardShards || 0));
    const masterStars = Math.max(0, Number(user.masterStars) || 0);
    return `<div class="profile-chip"><span class="profile-copy"><b>${global.PlayerCallingCard?.nameHtml(user.nickname,user.serverUserId||user.id)||nickname}</b><button class="pc-account-link" type="button" data-v21-profile aria-label="내 정보 열기"><small>내 계정${level ? ` · Lv. ${level}` : ''} · ${role}</small></button></span></div>
      <div class="resource-rail" aria-label="보유 재화">
        <button class="resource-chip coin ui-press" type="button" aria-label="코인 ${coin.toLocaleString()}"><i></i><span><small>코인</small><b><span class="resource-full">${coin.toLocaleString()}</span><span class="resource-short">${compact(coin)}</span></b></span></button>
        <button class="resource-chip shard ui-press" type="button" aria-label="카드 조각 ${shards.toLocaleString()}"><i></i><span><small>조각</small><b>${compact(shards)}</b></span></button>
        <button class="resource-chip master-star ui-press" type="button" aria-label="마스터의 별 ${masterStars.toLocaleString()}" title="마스터의 별 ${masterStars.toLocaleString()}"><i aria-hidden="true">★</i><span><small><span class="resource-full">마스터의 별</span><span class="resource-short">마별</span></small><b><span class="resource-full">${masterStars.toLocaleString()}</span><span class="resource-short">${compact(masterStars)}</span></b></span></button>
      </div>
      <button class="hud-mail ui-press" type="button" data-v21-route="messages" aria-label="메시지함"><span>${svg('mail')}</span><b class="notification-dot" data-message-new-badge data-v21-message-badge hidden></b></button>`;
  }

  function dockMarkup() {
    return `<button class="dock-item ui-press" type="button" data-v21-home><span>${svg('home')}</span><b>로비</b></button>
      <button class="dock-item ui-press" type="button" data-v21-group="cards"><span>${svg('cards')}</span><b>카드</b></button>
      <button class="dock-item dock-battle ui-press" type="button" data-v21-group="combat"><span class="battle-orb">${svg('swords')}</span><b>전투</b></button>
      <button class="dock-item ui-press" type="button" data-v21-group="growth"><span>${svg('forge')}</span><b>성장</b></button>
      <button class="dock-item ui-press" type="button" data-v21-all><span>${svg('menu')}</span><b>메뉴</b></button>`;
  }

  function chiefView() {
    const chief = chiefState?.chief;
    if (!chiefState) return { state: 'loading', ordinal: '—', title: '족장 정보 불러오는 중', nickname: '서버 연결 중', remaining: '잠시만 기다려 주세요' };
    if (chiefState.unavailable) return { state: 'unavailable', ordinal: '—', title: '족장 정보 확인 불가', nickname: '연결 상태 확인 필요', remaining: '자동으로 다시 시도합니다' };
    if (!chief?.active) return { state: 'vacant', ordinal: '—', title: '족장 선출 대기', nickname: '공석', remaining: '차기 족장 선출을 기다립니다' };
    const ordinal = Number.isInteger(Number(chief.ordinal)) && Number(chief.ordinal) > 0 ? Number(chief.ordinal) : '—';
    let remainingMs = Math.max(0, Number(chief.remainingMs || 0));
    if (chief.endsAt) remainingMs = Math.max(0, Date.parse(chief.endsAt) - Date.now());
    const days = Math.floor(remainingMs / 86400000);
    const hours = Math.floor((remainingMs % 86400000) / 3600000);
    const minutes = Math.floor((remainingMs % 3600000) / 60000);
    return {
      state: 'active', ordinal,
      title: ordinal === '—' ? '현임 족장' : `제${ordinal}대 족장`,
      nickname: chief.nickname || '족장',
      remaining: days ? `${days}일 ${hours}시간 남음` : `${hours}시간 ${minutes}분 남음`,
      avatar: chief.avatar || null,
      viewerAvatar: chief.viewerAvatar || null
    };
  }

  function chiefPictureMarkup(chief, eager = true, preferViewer = false) {
    const path = value => { const clean = String(value || '').replace(/\\/g, '/'); return clean && !clean.startsWith('/') ? `/${clean}` : clean; };
    const avatar = preferViewer && chief?.viewerAvatar ? chief.viewerAvatar : chief?.avatar;
    const desktop = path(avatar?.lobbyImage), mobile = path(avatar?.lobbyMobileImage || desktop);
    if (desktop) return `<picture><source media="(max-width:759px)" srcset="${esc(mobile)}"><img src="${esc(desktop)}" width="1024" height="1536" alt="${esc(avatar?.name || chief.nickname || '족장')} 아바타 일러스트" loading="${eager ? 'eager' : 'lazy'}" ${eager ? 'fetchpriority="high"' : ''} decoding="async"></picture>`;
    return `<picture><source type="image/avif" srcset="/assets/responsive/ui/chief-supreme-commander-lobby-v1-640.avif 640w, /assets/responsive/ui/chief-supreme-commander-lobby-v1-1024.avif 1024w" sizes="(max-width:759px) 100vw, 55vw"><source type="image/webp" srcset="/assets/responsive/ui/chief-supreme-commander-lobby-v1-640.webp 640w, /assets/responsive/ui/chief-supreme-commander-lobby-v1-1024.webp 1024w" sizes="(max-width:759px) 100vw, 55vw"><img src="/assets/ui/chief/chief-supreme-commander-lobby-v1.png" width="1024" height="1536" alt="족장 직위를 상징하는 미래형 최고지휘관 공용 초상" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
  }

  function commandDescriptor(route, fallbackTitle, fallbackMeta, fallbackGroup = '') {
    const item = ROUTE_META[route];
    const home = item?.home || {};
    return {
      title: home.title || fallbackTitle,
      meta: home.meta || fallbackMeta,
      icon: item?.icon || (route === 'character' ? 'forge' : 'menu'),
      group: home.group || fallbackGroup
    };
  }

  function pcCommand(route, title, meta, feature, group = '') {
    const command = commandDescriptor(route, title, meta, group);
    const target = command.group ? `data-v21-group="${command.group}"` : `data-v21-route="${route}"`;
    return `<button class="pc-nav-command${feature ? ' feature' : ''} ui-press" type="button" ${target}><span class="pc-nav-icon">${svg(command.icon)}</span><span class="pc-nav-copy"><b>${esc(command.title)}</b><small>${esc(command.meta)}</small></span><i aria-hidden="true"></i></button>`;
  }

  function mobileCommand(route, title, meta, feature, group = '') {
    const command = commandDescriptor(route, title, meta, group);
    const target = command.group ? `data-v21-group="${command.group}"` : `data-v21-route="${route}"`;
    return `<button class="mobile-command-button${feature ? ' feature' : ''} ui-press" type="button" ${target}><span>${svg(command.icon)}</span><b>${esc(command.title)}</b><small>${esc(command.meta)}</small><i aria-hidden="true"></i></button>`;
  }

  function homeMarkup() {
    const chief = chiefView();
    const chiefPicture = chiefPictureMarkup(chief, true, true);
    const pcOperations = typeof global.liveOperationsHtml === 'function' ? global.liveOperationsHtml('lobby-pc') : '';
    const mobileOperations = typeof global.liveOperationsHtml === 'function' ? global.liveOperationsHtml('lobby-mobile') : '';
    return `<section class="pc-lobby-scene" aria-label="숲켓몬 PC 메인 로비">
        <div class="pc-lobby-grid" aria-hidden="true"></div>
        <div class="pc-lobby-brand"><img src="/assets/ui/cninelogo.png" alt="숲켓몬"><span>CARD COLLECTION RPG</span><button class="v21-fullscreen-toggle" type="button" data-v21-fullscreen aria-label="전체화면 모드" aria-pressed="false"><i>⛶</i><em>전체화면</em></button></div>
        <div class="pc-main-character pc-chief-commander" aria-label="족장 직위 상징 이미지">${chiefPicture}</div>
        <section class="pc-chief-readout ${chief.state !== 'active' ? 'is-vacant' : ''}" data-chief-state="${chief.state}" aria-label="족장 임기 현황">
          <div class="pc-readout-index"><span>SOOPKETMON / CHIEF SYSTEM</span><b>${esc(chief.ordinal)}</b></div>
          <p>THE ELECTED CHIEF</p><h1><small>${esc(chief.title)}</small><strong>${esc(chief.nickname)}</strong></h1>
          <div class="pc-guide-line"><i></i><span></span></div><div class="pc-term-timer"><span>임기 종료까지</span><strong>${esc(chief.remaining)}</strong><small>족장 권한은 서버 정책으로 검증 · KST</small></div>
          <button class="pc-chief-action" type="button" data-v21-chief-info>족장 임기 현황 <i>LIVE</i></button>
        </section>
        <nav class="pc-main-navigation${clanFeatureVisible()?' has-clan-test':''}" aria-label="PC 주요 메뉴"><div class="pc-navigation-heading"><span>MAIN COMMAND</span><b>01 / LOBBY</b></div>
          ${pcCommand('buy', '카드 상점', '대량 구매 · 20/100/1000회')}${pcCommand('dex', '도감', '카드 수집 · 진화')}${pcCommand('battle', '전투', 'PVE · 특수전 · 레이드', true)}${clanFeatureVisible()?pcCommand('clan', '클랜', '블라인드 드래프트 · V3', true):''}
          ${pcCommand('character', '장비·제작', '장비 · 칭호 · 차고지 · 제작소', false, 'growth')}${pcCommand('attendance', '보상', '출석 · 퀘스트 · 메시지')}${pcCommand('rank', '랭킹', '시즌 순위 · 티어')}${pcCommand('prediction', '승부·경매', '승부예측 · 경매장')}
        </nav>
        <div class="pc-utility-rail" aria-label="빠른 메뉴"><button type="button" data-v21-route="magic">${svg('magic')}<span>마법</span></button><button type="button" data-v21-route="inventory">${svg('inventory')}<span>인벤</span></button><button type="button" data-v21-route="messages">${svg('mail')}<span>메시지</span><i data-message-new-badge data-v21-message-badge hidden></i></button><button type="button" data-v21-all>${svg('menu')}<span>전체</span></button></div>
        <div class="pc-status-cluster"><span><i></i> LIVE SERVER</span><b>CH. 01</b><small>ONLINE</small></div>
        <aside data-streamer-lounge-host hidden aria-label="스트리머 라운지 입구"></aside>
        ${pcOperations}
      </section>
      <section class="mobile-command-lobby" aria-label="숲켓몬 모바일 메인 로비"><div class="mobile-lobby-grid" aria-hidden="true"></div><div class="mobile-lobby-brand"><img src="/assets/ui/cninelogo.png" alt="숲켓몬"><span>CARD COLLECTION RPG</span></div>
        <div class="mobile-chief-visual" aria-label="족장 직위 상징 이미지">${chiefPicture}</div>
        <section class="mobile-chief-readout ${chief.state !== 'active' ? 'is-vacant' : ''}"><small>THE ELECTED CHIEF</small><h1><span>${esc(chief.title)}</span><strong>${esc(chief.nickname)}</strong></h1><div><i></i><b>${esc(chief.remaining)}</b></div><button class="mobile-chief-status" type="button" data-v21-chief-info>족장 임기 현황 <em>LIVE</em></button></section>
        <nav class="mobile-command-nav" aria-label="모바일 주요 메뉴"><header><span>MAIN COMMAND</span><b>01 / LOBBY</b><button class="v21-fullscreen-toggle" type="button" data-v21-fullscreen aria-label="전체화면 모드" aria-pressed="false"><i>⛶</i><em>전체화면</em></button></header>${mobileCommand('buy', '카드 상점', '20·100·1000회')}${mobileCommand('dex', '도감', '수집·진화')}${mobileCommand('battle', '전투', 'PVE·특수전', true)}${clanFeatureVisible()?mobileCommand('clan', '클랜', '블라인드 드래프트 · V3', true):''}${mobileCommand('character', '장비·제작', '장비·칭호·차고·공방', false, 'growth')}${mobileCommand('attendance', '보상', '출석·임무')}${mobileCommand('rank', '랭킹', '시즌·점수')}${mobileCommand('prediction', '승부·경매', '예측·거래')}</nav><div class="mobile-lobby-status"><span><i></i> LIVE SERVER</span><b>CH. 01</b></div>${mobileOperations}
        <aside data-streamer-lounge-host hidden aria-label="스트리머 라운지 입구"></aside>
      </section>`;
  }

  function findMarkers(page) {
    let start = null, end = null;
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) {
      if (walker.currentNode.data === 'cnine-route-start') start = walker.currentNode;
      if (walker.currentNode.data === 'cnine-route-end') end = walker.currentNode;
    }
    return { start, end };
  }

  function clearBetween(start, end) {
    let node = start.nextSibling;
    while (node && node !== end) { const next = node.nextSibling; node.remove(); node = next; }
  }

  function ensureFrame(page) {
    document.documentElement.removeAttribute('data-soop-ui-bridge');
    document.body.classList.remove('soop-ui-production-v21');
    document.body.classList.add('soopketmon-v21-live');
    page.classList.remove('soop-ui-shell-v21');
    page.classList.add('game-frame', 'v21-production-shell');
    page.dataset.v21Shell = VERSION;
    page.setAttribute('data-soopketmon-v21-shell', 'approved-v21');
    page.querySelectorAll('.ambient-lines,.light-pillars,.light-beams').forEach(node => node.remove());
    if (!page.querySelector(':scope > .world-backdrop')) page.insertAdjacentHTML('afterbegin', '<div class="world-backdrop" aria-hidden="true"></div><div class="world-vignette" aria-hidden="true"></div>');
    let header = page.querySelector(':scope > .header');
    if (!header) { header = document.createElement('header'); page.prepend(header); }
    header.className = 'header top-hud';
    header.innerHTML = headerMarkup();

    let { start, end } = findMarkers(page);
    if (!start || !end) return null;
    let viewport = page.querySelector(':scope > .screen-viewport');
    if (!viewport) {
      viewport = document.createElement('div'); viewport.className = 'screen-viewport';
      const screen = document.createElement('section'); screen.className = 'screen'; screen.setAttribute('aria-live', 'polite');
      start.parentNode.insertBefore(viewport, start); viewport.append(screen);
      let node = start;
      while (node) { const next = node.nextSibling; screen.append(node); if (node === end) break; node = next; }
    }
    let dock = page.querySelector(':scope > .bottom-dock');
    if (!dock) { dock = document.createElement('nav'); dock.className = 'bottom-dock'; dock.setAttribute('aria-label', '주요 메뉴'); page.append(dock); }
    dock.innerHTML = dockMarkup();
    bindMessageBadgeNormalizer(page);
    return { page, viewport, screen: viewport.querySelector('.screen'), ...findMarkers(page) };
  }

  function routeFamily(route) {
    const group = ROUTE_META[route]?.group;
    if (['store', 'collection'].includes(group)) return 'cards';
    if (['pve', 'pvp'].includes(group)) return 'battle';
    if (['equipment', 'crafting'].includes(group)) return 'growth';
    return 'all';
  }

  function inferNativeRoute(requested, screen) {
    const signatures = [
      ['clan', '#clanRoot, .clan-shell'], ['pvp', '#pvpContent, .pvp-cover'], ['battle', '#pveHuntView, #pveRaidView'],
      ['dex', '#dexSections, .dex-cover'], ['upgrade', '#bulkEnhancementRoot, .bulk-enhancement-root'], ['evolution', '#evolutionRoot, .evolution-system'],
      ['magic', '#magicSystemRoot, .magic-lab-hero'], ['character', '#characterSystemRoot, .character-system-root-v1249'], ['avatar', '#avatarShopV1, .avatar-shop-v1-root'], ['alchemy', '#alchemyLiveV1, .alchemy-v1-root'],
      ['scrapyard', '#scrapyardRootV1881, .ws81-scrapyard'], ['workshop', '#workshopRootV1881, .ws81-workshop, #workshopRootV1676, #workshopRootV1668, .workshop-v1668'], ['attendance', '#attendanceClaim, .attendance-board'],
      ['dailyquest', '#dailyQuestRoot, .daily-quest-grid'], ['messages', '#messageList, .message-center'],
      ['rank', '#rankHubRoot, #serverRanking'], ['prediction', '#coinPredictionRoot, .coin-prediction-v1'],
      ['auction', '#auctionHouseRoot, .auction-house-v1553'], ['mineral', '#mineralMyRequests, .mineral-exchange'],
      ['inventory', '#inventoryGrid, .inventory-vault'], ['buy', '.pack-selector, .game-hero']
    ];
    for (const [route, selector] of signatures) if (screen?.querySelector(selector)) return route;
    return requested;
  }

  function syncDock(page, route) {
    const family = route === 'home' ? 'home' : routeFamily(route);
    page.querySelectorAll('.bottom-dock .dock-item').forEach(button => {
      const key = button.hasAttribute('data-v21-home') ? 'home' : button.dataset.v21Group || (button.hasAttribute('data-v21-all') ? 'all' : '');
      button.classList.toggle('active', key === family);
    });
  }

  function renderHome(frame) {
    showChiefConsole = false;
    clearBetween(frame.start, frame.end);
    const template = document.createElement('template'); template.innerHTML = homeMarkup();
    frame.end.parentNode.insertBefore(template.content, frame.end);
    frame.screen.dataset.kind = 'home';
    frame.page.dataset.route = 'home';
    syncDock(frame.page, 'home');
    bindMessageBadgeNormalizer(frame.page);
    try { global.StreamerLounge?.mount(); } catch (_) {}
    try { if (typeof global.loadShellSummary === 'function') global.loadShellSummary(); } catch (_) {}
    try { if (typeof global.loadLiveOperations === 'function') global.loadLiveOperations(); } catch (_) {}
    void hydrateChief();
  }

  function skinRoute(frame, route) {
    route = inferNativeRoute(route, frame.screen);
    currentRoute = route;
    frame.page.dataset.route = route;
    frame.screen.dataset.kind = 'live-route';
    /* Keep production mobile sheets mounted and bound. The exact dock is the
       visible entry point; the original sheets remain available to route
       binders and future feature injection instead of being destroyed. */
    if (!frame.screen.querySelector('.v21-live-route')) {
      const wrapper = document.createElement('section'); wrapper.className = 'v21-live-route'; wrapper.dataset.liveRoute = route;
      const info = ROUTES[route] || ['게임 화면', 'SOOPKETMON', 'menu'];
      wrapper.innerHTML = `<header class="v21-route-command-head"><button type="button" data-v21-home aria-label="로비로 돌아가기">${svg('home')}</button><div><small>${esc(info[1])} / LIVE SERVICE</small><h1>${esc(info[0])}</h1></div><button type="button" data-v21-all>전체 메뉴</button></header><div class="v21-route-body"></div>`;
      const body = wrapper.querySelector('.v21-route-body');
      let node = frame.start.nextSibling;
      const nodes = [];
      while (node && node !== frame.end) { const next = node.nextSibling; nodes.push(node); node = next; }
      nodes.forEach(item => body.append(item));
      frame.end.parentNode.insertBefore(wrapper, frame.end);
    }
    frame.page.classList.toggle('v21-show-chief-system', route === 'buy' && showChiefConsole);
    syncDock(frame.page, route);
  }

  function enhance(route = currentRoute) {
    const page = document.querySelector('#app main.page[data-cnine-shell="1"], #app main.page');
    if (!page) return false;
    const frame = ensureFrame(page);
    if (!frame?.start || !frame?.end) return false;
    if (route === 'home') renderHome(frame); else skinRoute(frame, route);
    markRenewalUiReady();
    queueMicrotask(() => global.ensureBurningEventHudVisible?.());
    return true;
  }

  function scheduleEnhance(route = currentRoute) {
    currentRoute = route;
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; enhance(currentRoute); });
  }

  async function hydrateChief(force = false) {
    if (chiefPromise) return chiefPromise;
    if (chiefState && !force) return chiefState;
    chiefPromise = (async () => {
      if (typeof global.apiRequest === 'function') {
        try { chiefState = await global.apiRequest('chief/status', {}, { ttl: 0, timeoutMs: 7000 }); }
        catch (_) { chiefState = { unavailable: true }; }
      } else chiefState = { unavailable: true };
      if (currentRoute === 'home') scheduleEnhance('home');
      return chiefState;
    })().finally(() => { chiefPromise = null; });
    return chiefPromise;
  }

  function modalRoot() {
    return document.getElementById('modal');
  }

  function closeOverlay() {
    const modal = modalRoot(); if (!modal) return;
    modal.className = 'modal'; modal.innerHTML = ''; modal.onclick = null;
  }

  function routeButton(route) {
    if(route==='clan'&&!clanFeatureVisible())return '';
    if(route==='avatar'&&global.avatarFeatureVisible?.()!==true)return '';
    if(route==='alchemy'&&global.alchemyFeatureVisible?.()!==true)return '';
    const item = ROUTES[route]; if (!item) return '';
    return `<button type="button" data-v21-route="${route}"><span>${svg(item[2])}</span><b>${esc(item[0])}</b><small>${esc(item[1])}</small></button>`;
  }

  function openRouteOverlay(title, routes) {
    const modal = modalRoot(); if (!modal) return;
    modal.className = 'modal v21-command-overlay open';
    modal.innerHTML = `<section class="v21-command-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><small>SOOPKETMON / COMMAND</small><h2>${esc(title)}</h2></div><button type="button" data-v21-close aria-label="닫기">×</button></header><div class="v21-command-grid">${routes.map(routeButton).join('')}</div></section>`;
  }

  function openAllOverlay() {
    const modal = modalRoot(); if (!modal) return;
    modal.className = 'modal v21-command-overlay open';
    modal.innerHTML = `<section class="v21-command-dialog v21-command-dialog-all" role="dialog" aria-modal="true" aria-label="전체 메뉴"><header><div><small>SOOPKETMON / ALL CONTENTS</small><h2>전체 메뉴</h2></div><button type="button" data-v21-close aria-label="닫기">×</button></header><div class="v21-command-groups">${MENU_GROUP_ORDER.map(id => MENU_GROUPS[id]).map(group => `<section><h3>${esc(group.title)}</h3><div>${group.routes.map(routeButton).join('')}</div></section>`).join('')}</div></section>`;
  }

  function openChiefOverlay() {
    const chief = chiefView();
    const modal = modalRoot(); if (!modal) return;
    modal.className = 'modal v21-command-overlay open';
    modal.innerHTML = `<section class="v21-command-dialog v21-chief-dialog" role="dialog" aria-modal="true" aria-label="족장 임기 및 권한"><header><div><small>SOOPKETMON / CHIEF SYSTEM</small><h2>${esc(chief.title)} · ${esc(chief.nickname)}</h2></div><button type="button" data-v21-close aria-label="닫기">×</button></header><div class="v21-chief-dialog-body">${chiefPictureMarkup(chief, false)}<div><small>현재 상태</small><b>${chief.state === 'active' ? '재임 중' : chief.nickname}</b><small>남은 임기</small><b>${esc(chief.remaining)}</b><p>족장 권한과 사용 횟수는 운영 서버에서 검증됩니다. 아래 버튼은 기존 족장 권한 화면을 그대로 엽니다.</p><button type="button" data-v21-chief-system>운영 족장 시스템 열기</button></div></div></section>`;
  }

  function navigate(route) {
    if (route === 'home') {
      homeRouteGuard = true;
      explicitNavigation = true; try { global.renderShell('home'); } finally { explicitNavigation = false; }
      return Promise.resolve({ ok: true, shell: 'home' });
    }
    if (!ROUTES[route]) return Promise.reject(new Error('연결되지 않은 메뉴입니다.'));
    homeRouteGuard = false;
    showChiefConsole = false;
    closeOverlay();
    const router = global.SoopketmonV21RuntimeRouter;
    if (router?.routeContract?.[route] && typeof router.navigate === 'function') {
      return router.navigate(route).then(result => {
        // Global contracts (territory, siege, account panels) are overlays on
        // the current live screen. Only a real renderShell result may replace
        // the route label/body beneath that overlay.
        if (result.shell) scheduleEnhance(result.shell);
        return result;
      }).catch(error => {
        console.error('[Approved V21 shell]', error);
        throw error;
      });
    }
    explicitNavigation = true;
    try { global.renderShell(route); } finally { explicitNavigation = false; }
    return Promise.resolve({ ok: true, shell: route });
  }

  function syncFullscreenControls() {
    const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    document.querySelectorAll('[data-v21-fullscreen]').forEach(button => {
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? '전체화면 해제' : '전체화면 모드');
      const icon = button.querySelector('i'), label = button.querySelector('em');
      if (icon) icon.textContent = active ? '×' : '⛶';
      if (label) label.textContent = active ? '화면 해제' : '전체화면';
    });
  }

  async function toggleFullscreen() {
    try {
      const active = document.fullscreenElement || document.webkitFullscreenElement;
      if (active) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      else await (document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) || document.documentElement.webkitRequestFullscreen?.());
    } catch (_) {
      try { if (global.top && global.top !== global) global.top.location.href = 'https://cnine-card.pages.dev/'; } catch (_error) { global.open('https://cnine-card.pages.dev/', '_blank', 'noopener,noreferrer'); }
    }
    syncFullscreenControls();
  }

  function bindDelegation() {
    if (document.documentElement.dataset.v21ExactDelegation === '1') return;
    document.documentElement.dataset.v21ExactDelegation = '1';
    document.addEventListener('click', event => {
      const control = event.target.closest?.('[data-v21-route],[data-v21-home],[data-mobile-tab],button[data-route],[data-primary]');
      if (!control) return;
      const route = control.hasAttribute('data-v21-home')
        ? 'home'
        : String(control.dataset.v21Route || control.dataset.mobileTab || control.dataset.route || control.dataset.primary || '');
      if (route) homeRouteGuard = route === 'home';
    }, true);
    // Unique data-v21-* controls are owned here. The production runtime router
    // owns legacy button[data-route]/data-mobile-tab controls, so the two
    // capture paths never compete for the same element.
    document.addEventListener('click', event => {
      if (event.target.closest('[data-v21-fullscreen]')) { event.preventDefault(); void toggleFullscreen(); return; }
      const close = event.target.closest('[data-v21-close]'); if (close) { closeOverlay(); return; }
      const route = event.target.closest('[data-v21-route]'); if (route) { event.preventDefault(); void navigate(route.dataset.v21Route); return; }
      if (event.target.closest('[data-v21-home]')) { event.preventDefault(); void navigate('home'); return; }
      if (event.target.closest('[data-v21-all]')) { event.preventDefault(); openAllOverlay(); return; }
      if (event.target.closest('[data-v21-chief-info]')) { event.preventDefault(); openChiefOverlay(); return; }
      const group = event.target.closest('[data-v21-group]'); if (group) { event.preventDefault(); const item = MENU_GROUPS[group.dataset.v21Group] || HUB_GROUPS[group.dataset.v21Group]; if (item) openRouteOverlay(item.title, item.routes); return; }
      if (event.target.closest('[data-v21-profile]')) { event.preventDefault(); if (typeof global.showAccountPanel === 'function') global.showAccountPanel(); else openRouteOverlay('내 정보', ['inventory', 'messages']); return; }
      if (event.target.closest('[data-v21-chief-system]')) { event.preventDefault(); closeOverlay(); showChiefConsole = true; explicitNavigation = true; try { global.renderShell('buy'); } finally { explicitNavigation = false; } return; }
    });
    document.addEventListener('fullscreenchange', syncFullscreenControls);
    document.addEventListener('webkitfullscreenchange', syncFullscreenControls);
    global.addEventListener('cnine:avatar-equipped', () => { void hydrateChief(true); });
  }

  function wrapRenderShell() {
    const candidate = global.renderShell;
    if (typeof candidate !== 'function') return false;
    if (candidate[WRAPPED]) return true;
    nativeRenderShell = candidate;
    function exactRenderShell(route) {
      const requested = String(route || 'buy');
      if (requested !== 'buy' && requested !== 'home') homeRouteGuard = false;
      const bootRoute = requested === 'buy' && !explicitNavigation && bootRequestedPending && (bootRequestedPending === 'home' || ROUTES[bootRequestedPending])
        ? bootRequestedPending
        : '';
      bootRequestedPending = '';
      if (bootRoute && bootRoute !== 'buy') {
        bootHomePending = false;
        const result = nativeRenderShell.call(this, 'buy');
        currentRoute = 'buy';
        scheduleEnhance('buy');
        queueMicrotask(() => navigate(bootRoute).catch(error => console.error('[Approved V21 deep link]', error)));
        return result;
      }
      if (requested === 'home') {
        homeRouteGuard = true;
        bootHomePending = false;
        const result = nativeRenderShell.call(this, 'buy');
        currentRoute = 'home'; scheduleEnhance('home'); return result;
      }
      const guardedHomeRefresh = requested === 'buy' && homeRouteGuard && !explicitNavigation;
      if (guardedHomeRefresh && document.querySelector('#app main.page')) {
        bootHomePending = false;
        currentRoute = 'home';
        scheduleEnhance('home');
        return undefined;
      }
      const useBootHome = requested === 'buy' && (bootHomePending || guardedHomeRefresh);
      bootHomePending = false;
      const result = nativeRenderShell.apply(this, arguments);
      currentRoute = useBootHome ? 'home' : requested;
      scheduleEnhance(currentRoute);
      return result;
    }
    Object.defineProperty(exactRenderShell, WRAPPED, { value: true });
    Object.defineProperty(exactRenderShell, 'nativeRenderShell', { value: nativeRenderShell });
    global.renderShell = exactRenderShell;
    return true;
  }

  function start() {
    if (!enabled) return;
    ensureStyles(); bindDelegation(); wrapRenderShell();
    const app = document.getElementById('app');
    if (app) {
      appObserver = new MutationObserver(() => {
        if (revealStandaloneScreen()) return;
        if (!document.querySelector('#app main.page')) return;
        scheduleEnhance(currentRoute);
      });
      appObserver.observe(app, { childList: true, subtree: false });
    }
    revealStandaloneScreen();
    if (document.querySelector('#app main.page')) {
      currentRoute = requestedScreen && ROUTES[requestedScreen] ? requestedScreen : 'home';
      scheduleEnhance(currentRoute);
    }
    let attempts = 0;
    wrapTimer = setInterval(() => { attempts += 1; if (wrapRenderShell() || attempts > 40) { clearInterval(wrapTimer); wrapTimer = 0; } }, 100);
    setInterval(() => { if (!document.hidden && currentRoute === 'home') { void hydrateChief(true); } }, 60000);
  }

  global.SoopketmonV21ExactShell = Object.freeze({
    version: VERSION,
    navigationContract: NAVIGATION_CONTRACT,
    navigate,
    enhance,
    openAll: openAllOverlay,
    get currentRoute() { return currentRoute; }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(window);
