(function installSoopketmonV21RuntimeRouter(global) {
  'use strict';

  const SHELL_ROUTES = Object.freeze([
    'buy',
    'dex',
    'evolution',
    'battle',
    'pvp',
    'magic',
    'character',
    'avatar',
    'workshop',
    'attendance',
    'dailyquest',
    'messages',
    'rank',
    'prediction',
    'auction',
    'mineral',
    'inventory'
  ]);

  const SHELL_ROUTE_SET = new Set(SHELL_ROUTES);
  const V21_SHELL_SELECTOR = '[data-soopketmon-v21-shell]';
  const DEFAULT_TIMEOUT_MS = 15000;

  // Loaded immediately after the exact shell in production. Presentation
  // labels and menu grouping deliberately live in that one shared object;
  // this router only owns how an unchanged route id reaches native code.
  const navigationContract = () => global.SoopketmonV21NavigationContract || null;
  const routeMeta = route => navigationContract()?.routes?.[String(route || '')] || null;

  // The approved V21 client has more presentation routes than renderShell().
  // Every alias below resolves to an existing production route, injected PVE
  // entry, or overlay. No production view/binder is replaced by this adapter.
  const ROUTE_CONTRACT = Object.freeze({
    buy: { shell: 'buy' },
    dex: { shell: 'dex' },
    evolution: { shell: 'evolution' },
    battle: { shell: 'battle' },
    pvp: { shell: 'pvp' },
    magic: { shell: 'magic' },
    character: { shell: 'character' },
    avatar: { shell: 'avatar' },
    workshop: { shell: 'workshop' },
    attendance: { shell: 'attendance' },
    dailyquest: { shell: 'dailyquest' },
    messages: { shell: 'messages' },
    rank: { shell: 'rank' },
    prediction: { shell: 'prediction' },
    auction: { shell: 'auction' },
    mineral: { shell: 'mineral' },
    inventory: { shell: 'inventory' },

    profile: { global: 'showAccountPanel', fallbackSelector: '#playerAccountBtn' },
    territory: {
      global: 'openTerritoryWar',
      fallbackSelector: '[data-territory-war-entry], [data-mobile-territory-war]'
    },

    deck: {
      shell: 'battle',
      actions: [
        { selector: '[data-pve-mode="deck"]' },
        { selector: '[data-pve-tab="deck"]', optional: true }
      ]
    },
    hunt: {
      shell: 'battle',
      actions: [
        { selector: '[data-pve-mode="hunt"]' },
        { selector: '[data-pve-tab="monsters"]', optional: true }
      ]
    },
    raid: { shell: 'battle', actions: [{ selector: '[data-pve-mode="raid"]' }] },
    escort: { shell: 'battle', actions: [{ selector: '[data-pve-mode="escort"]' }] },
    siege: { global: 'openMonsterSiege', fallbackSelector: '[data-monster-siege-entry]' },
    seal: { shell: 'battle', actions: [{ selector: '[data-seal-battle-mode]' }] },
    idle: {
      shell: 'battle',
      global: 'openIdleDungeon',
      fallbackSelector: '[data-pve-mode="idle"]'
    },
    tower: { shell: 'battle', actions: [{ selector: '[data-pve-mode="tower"]' }] },

    equipment: { shell: 'character', actions: [{ selector: '[data-character-tab="equipment"]' }] },
    title: { shell: 'character', actions: [{ selector: '[data-character-tab="title"]' }] },
    garage: { shell: 'character', actions: [{ selector: '[data-character-tab="garage"]' }] },
    // v1676 exposes dedicated sections. The root v1668 baseline exposes
    // category tabs instead; it has no scrapyard screen, so that route lands
    // on its closest available VEHICLE workshop category without timing out.
    scrapyard: {
      shell: 'workshop',
      actions: [{ selector: '[data-ws-section="SCRAPYARD"], [data-workshop-category="VEHICLE"]' }]
    },
    vehicle: {
      shell: 'workshop',
      actions: [{ selector: '[data-ws-section="VEHICLE"], [data-workshop-category="VEHICLE"]' }]
    },
    fusion: {
      shell: 'workshop',
      actions: [{ selector: '[data-ws-section="SYNTHESIS"], [data-workshop-category="EQUIPMENT_SYNTHESIS"]' }]
    }
  });

  const PVE_DECK_EDITOR_CONTRACT = Object.freeze({
    shell: 'battle',
    actions: Object.freeze([
      Object.freeze({ selector: '[data-pve-mode="deck"]' }),
      Object.freeze({ selector: '[data-pve-tab="cards"]', optional: true })
    ])
  });

  const SUBTAB_CONTRACT = Object.freeze({
    buy: Object.freeze({
      '카드 상점': { shell: 'buy', scroll: '.game-hero' },
      '카드팩': { shell: 'buy', scroll: '.game-hero' },
      '장비 보급': { shell: 'buy', scroll: '#equipmentSupplyShop' },
      '이동수단': { shell: 'buy', scroll: '#vehicleDrawShop' },
      '프리미엄 큐브': { shell: 'buy', scroll: '.weekly-premium-cube-status' }
    }),
    dex: Object.freeze({
      '전체 카드': { shell: 'dex', scroll: '#dexSections' },
      '즐겨찾기': { shell: 'dex', actions: [{ selector: '#favoriteMemberOnly' }] },
      '고등급 재뽑기': { shell: 'dex', global: 'HighGradeReroll.open' }
    }),
    evolution: Object.freeze({
      'SSR → MA': { shell: 'evolution', actions: [{ selector: '[data-evolution-type="SSR_TO_MA"]' }] },
      'MA → PRESTIGE': { shell: 'evolution', actions: [{ selector: '[data-evolution-type="MA_TO_PRESTIGE"]' }] },
      'LIMITED → ZENITH': { shell: 'evolution', actions: [{ selector: '[data-evolution-type="LIMITED_TO_ZENITH"]' }] }
    }),
    magic: Object.freeze({
      'PVE 덱': { shell: 'magic', actions: [{ selector: '[data-magic-deck="PVE"]' }] },
      'PVP 덱': { shell: 'magic', actions: [{ selector: '[data-magic-deck="PVP"]' }] },
      '마법 개방': { shell: 'magic', scroll: '.magic-draw-panel' }
    }),
    battle: Object.freeze({
      '출전 덱': ROUTE_CONTRACT.deck,
      'PVE 덱 편성실': PVE_DECK_EDITOR_CONTRACT,
      // Compatibility alias for already-rendered legacy/mobile controls.
      '덱 편성실': PVE_DECK_EDITOR_CONTRACT,
      '몬스터 토벌': ROUTE_CONTRACT.hunt,
      '월드 레이드': ROUTE_CONTRACT.raid,
      '호송작전': ROUTE_CONTRACT.escort
    }),
    pvp: Object.freeze({
      '자동 매칭': { shell: 'pvp', actions: [{ selector: '[data-pvp="match"]' }] },
      '덱 편성': { shell: 'pvp', actions: [{ selector: '[data-pvp="deck"]' }] },
      '전투 기록': { shell: 'pvp', actions: [{ selector: '[data-pvp="history"]' }] },
      '시즌 랭킹': { shell: 'pvp', actions: [{ selector: '[data-pvp="ranking"]' }] },
      '시즌 보상': { shell: 'pvp', actions: [{ selector: '[data-pvp="reward"]' }] }
    }),
    character: Object.freeze({
      '장비': ROUTE_CONTRACT.equipment,
      '칭호': ROUTE_CONTRACT.title,
      '차고': ROUTE_CONTRACT.garage,
      '아바타': ROUTE_CONTRACT.avatar
    }),
    workshop: Object.freeze({
      '폐차장 원정': ROUTE_CONTRACT.scrapyard,
      '차량 제작': ROUTE_CONTRACT.vehicle,
      '장비 합성': ROUTE_CONTRACT.fusion
    }),
    attendance: Object.freeze({
      '연속 출석': { shell: 'attendance', scroll: '.attendance-panel' },
      '쿠폰 입력': { shell: 'attendance', scroll: '#couponForm', focus: '#couponCode' }
    }),
    rank: Object.freeze({
      '시즌 랭킹': { shell: 'rank' }
    }),
    inventory: Object.freeze({
      '전체': { shell: 'inventory', actions: [{ selector: '[data-inventory-filter="ALL"]' }] },
      '큐브': { shell: 'inventory', actions: [{ selector: '[data-inventory-filter="CUBE"]' }] },
      '보급상자': { shell: 'inventory', actions: [{ selector: '[data-inventory-filter="SUPPLY_BOX"]' }] },
      '입장권': { shell: 'inventory', actions: [{ selector: '[data-inventory-filter="ENTRY_TICKET"]' }] },
      '이동수단': { shell: 'inventory', actions: [{ selector: '[data-inventory-filter="VEHICLE_DRAW"]' }] },
      '재뽑기권': { shell: 'inventory', actions: [{ selector: '[data-inventory-filter="REROLL"]' }] }
    })
  });

  function resolvePath(host, path) {
    return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], host);
  }

  function waitFor(runtime, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const startedAt = runtime.now();
    return new Promise((resolve, reject) => {
      const inspect = () => {
        let result = null;
        try { result = predicate(); } catch (_) {}
        if (result) return resolve(result);
        if (runtime.now() - startedAt >= timeoutMs) return reject(new Error('연결할 운영 화면을 찾지 못했습니다.'));
        runtime.setTimeout(inspect, 40);
      };
      inspect();
    });
  }

  function defaultRuntime(overrides = {}) {
    return {
      global,
      document: global.document,
      now: () => Date.now(),
      setTimeout: (callback, delay) => global.setTimeout(callback, delay),
      renderShell: typeof global.renderShell === 'function' ? global.renderShell.bind(global) : null,
      ...overrides
    };
  }

  async function runAction(action, runtime, timeoutMs) {
    const node = await waitFor(runtime, () => runtime.document?.querySelector(action.selector), timeoutMs)
      .catch(error => {
        if (action.optional) return null;
        throw error;
      });
    if (!node) return false;
    if (action.method === 'scroll') node.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    else node.click?.();
    return true;
  }

  async function executeContract(contract, options = {}) {
    if (!contract) throw new Error('연결되지 않은 메뉴입니다.');
    const runtime = defaultRuntime(options.runtime);
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (contract.shell) {
      if (!SHELL_ROUTE_SET.has(contract.shell)) throw new Error(`허용되지 않은 운영 화면: ${contract.shell}`);
      const render = await waitFor(runtime, () => typeof runtime.renderShell === 'function' && runtime.renderShell, timeoutMs);
      render(contract.shell);
    }

    if (contract.global) {
      // Optional production modules do not always expose their global opener,
      // even after their native entry button has already been injected. Poll
      // both paths together so a ready entry is used immediately instead of
      // waiting the full global timeout before falling back.
      const activation = await waitFor(runtime, () => {
        const fn = resolvePath(runtime.global, contract.global);
        if (typeof fn === 'function') {
          const ownerPath = contract.global.split('.').slice(0, -1).join('.');
          return { type: 'global', fn, owner: resolvePath(runtime.global, ownerPath) || runtime.global };
        }
        const node = contract.fallbackSelector
          ? runtime.document?.querySelector(contract.fallbackSelector)
          : null;
        return node ? { type: 'fallback', node } : null;
      }, timeoutMs);

      if (activation.type === 'global') await activation.fn.call(activation.owner);
      else activation.node.click?.();
    }

    for (const action of contract.actions || []) await runAction(action, runtime, timeoutMs);

    if (contract.scroll) {
      const node = await waitFor(runtime, () => runtime.document?.querySelector(contract.scroll), timeoutMs);
      node.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
    if (contract.focus) {
      const node = await waitFor(runtime, () => runtime.document?.querySelector(contract.focus), timeoutMs);
      node.focus?.({ preventScroll: true });
    }
    return { ok: true, shell: contract.shell || '', global: contract.global || '' };
  }

  function navigate(route, options = {}) {
    return executeContract(ROUTE_CONTRACT[String(route || '')], options);
  }

  function openSubtab(route, label, options = {}) {
    return executeContract(SUBTAB_CONTRACT[String(route || '')]?.[String(label || '')], options);
  }

  function emit(target, name, detail) {
    const EventCtor = global.CustomEvent;
    if (typeof EventCtor !== 'function') return true;
    return target.dispatchEvent(new EventCtor(name, { bubbles: true, cancelable: true, detail }));
  }

  function handleMobileSheetControl(shell, control) {
    const layer = shell?.querySelector?.('[data-v21-sheet-layer]');
    if (!layer) return false;
    const name = control.dataset.v21SheetOpen || control.dataset.v21SheetSwitch || '';
    if (control.hasAttribute('data-v21-sheet-close')) {
      layer.classList.remove('open');
      global.document?.body?.classList.remove('mobile-menu-open');
      global.setTimeout(() => { if (!layer.classList.contains('open')) layer.hidden = true; }, 180);
      return true;
    }
    layer.querySelectorAll('[data-v21-sheet]').forEach(sheet => sheet.classList.toggle('active', sheet.dataset.v21Sheet === name));
    layer.hidden = false;
    global.document?.body?.classList.add('mobile-menu-open');
    global.requestAnimationFrame?.(() => layer.classList.add('open'));
    return true;
  }

  const boundRoots = new WeakSet();
  function bind(root = global.document) {
    if (!root || boundRoots.has(root)) return root;
    boundRoots.add(root);
    root.addEventListener('click', event => {
      const control = event.target.closest?.('[data-v21-sheet-open],[data-v21-sheet-switch],[data-v21-sheet-close],[data-mobile-territory-war],[data-mobile-account],[data-mobile-tab],button[data-route],[data-primary],[data-subtab],[data-resource]');
      const shell = control?.closest?.(V21_SHELL_SELECTOR);
      if (!control || !shell || !root.contains(control)) return;

      if (control.matches('[data-v21-sheet-open],[data-v21-sheet-switch],[data-v21-sheet-close]')) {
        if (!handleMobileSheetControl(shell, control)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      let route = control.dataset.route || control.dataset.primary || control.dataset.mobileTab || '';
      if (control.hasAttribute('data-mobile-territory-war')) route = 'territory';
      if (control.hasAttribute('data-mobile-account') || control.hasAttribute('data-resource')) route = 'profile';
      const subtab = control.dataset.subtab;
      const currentRoute = shell.dataset.route || shell.dataset.runtimeRoute || '';
      const contract = subtab ? SUBTAB_CONTRACT[currentRoute]?.[subtab] : ROUTE_CONTRACT[route];
      if (!contract) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const operation = subtab ? openSubtab(currentRoute, subtab) : navigate(route);
      operation.then(result => {
        shell.dataset.runtimeRoute = result.shell || route || currentRoute;
        emit(shell, 'soopketmon:v21-route-complete', { route, subtab: subtab || '', result });
      }).catch(error => {
        emit(shell, 'soopketmon:v21-route-error', { route, subtab: subtab || '', message: error.message });
        console.error('[V21 runtime router]', error);
      });
    }, true);
    return root;
  }

  const api = Object.freeze({
    version: '1.3.0',
    shellRoutes: SHELL_ROUTES,
    routeContract: ROUTE_CONTRACT,
    subtabContract: SUBTAB_CONTRACT,
    get navigationContract() { return navigationContract(); },
    routeMeta,
    navigate,
    openSubtab,
    bind
  });
  global.SoopketmonV21RuntimeRouter = api;

  if (global.document) {
    const boot = () => bind(global.document);
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(globalThis);
