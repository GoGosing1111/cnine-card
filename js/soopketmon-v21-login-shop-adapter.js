(function installSoopketmonV21LoginShopAdapter(global) {
  'use strict';

  const VERSION = '21.3.3';
  const script = document.currentScript;
  const AUTH_MODE_KEY = 'soopketmon:v21:auth-mode';
  let scheduledFrame = 0;

  function markRenewalUiReady() {
    document.documentElement.dataset.v21UiReady = '1';
    document.body?.classList.add('v21-ui-ready');
  }
  let mobileInputGuardInstalled = false;
  let mobileViewportFrame = 0;

  function authScreen() {
    return document.querySelector('.v21-auth-screen');
  }

  function updateAuthViewport() {
    const screen = authScreen();
    if (!screen) return;
    const layoutHeight = Math.max(320, Math.round(global.innerHeight || document.documentElement.clientHeight || 0));
    const visualHeight = Math.max(320, Math.round(global.visualViewport?.height || layoutHeight));
    document.documentElement.style.setProperty('--v21-auth-viewport-height', `${visualHeight}px`);
    screen.dataset.v21KeyboardOpen = layoutHeight - visualHeight > Math.min(180, layoutHeight * .22) ? '1' : '0';
  }

  function bringAuthControlIntoView(control) {
    if (!control?.closest?.('.v21-auth-screen')) return;
    updateAuthViewport();
    requestAnimationFrame(() => {
      if (!control.isConnected || typeof control.scrollIntoView !== 'function') return;
      control.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    });
  }

  function scheduleAuthViewportRefresh() {
    if (mobileViewportFrame) return;
    mobileViewportFrame = requestAnimationFrame(() => {
      mobileViewportFrame = 0;
      updateAuthViewport();
      const active = document.activeElement;
      if (active?.matches?.('.v21-auth-screen input') && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    });
  }

  function installMobileInputGuard() {
    if (mobileInputGuardInstalled) return;
    mobileInputGuardInstalled = true;
    document.addEventListener('focusin', event => {
      if (event.target?.matches?.('.v21-auth-screen input')) bringAuthControlIntoView(event.target);
    }, true);
    document.addEventListener('focusout', () => global.setTimeout(scheduleAuthViewportRefresh, 120), true);
    global.addEventListener('resize', scheduleAuthViewportRefresh, { passive: true });
    global.visualViewport?.addEventListener('resize', scheduleAuthViewportRefresh, { passive: true });
    global.visualViewport?.addEventListener('scroll', scheduleAuthViewportRefresh, { passive: true });
  }

  function cssHref() {
    if (script?.src) return new URL('../css/soopketmon-v21-login-shop.css', script.src).href;
    return 'css/soopketmon-v21-login-shop.css';
  }

  function ensureStyle() {
    if (document.getElementById('soopketmonV21LoginShopStyle')) return;
    const link = document.createElement('link');
    link.id = 'soopketmonV21LoginShopStyle';
    link.rel = 'stylesheet';
    link.href = `${cssHref()}?v=${VERSION}`;
    document.head.append(link);
  }

  function storedAuthMode() {
    try { return sessionStorage.getItem(AUTH_MODE_KEY) === 'nickname' ? 'nickname' : 'playdk'; }
    catch (_) { return 'playdk'; }
  }

  function rememberAuthMode(mode) {
    try { sessionStorage.setItem(AUTH_MODE_KEY, mode); } catch (_) {}
  }

  function setAuthStatus(box, state, message) {
    const status = box?.querySelector('[data-v21-auth-status]');
    if (!status) return;
    status.dataset.state = state || 'idle';
    status.textContent = message || '';
    status.hidden = !message;
  }

  function setAuthMode(box, mode, focus = false) {
    const next = mode === 'nickname' ? 'nickname' : 'playdk';
    box.dataset.authMode = next;
    box.querySelectorAll('[data-v21-auth-mode]').forEach(button => {
      const active = button.dataset.v21AuthMode === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    box.querySelectorAll('[data-v21-auth-panel]').forEach(panel => {
      const active = panel.dataset.v21AuthPanel === next;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    rememberAuthMode(next);
    setAuthStatus(box, 'idle', '');
    if (focus) box.querySelector(next === 'nickname' ? '#nickname' : '#key')?.focus();
  }

  function wrapAuthAction(box, button, type) {
    if (!button || button.dataset.v21AuthWrapped === '1' || typeof button.onclick !== 'function') return;
    button.dataset.v21AuthWrapped = '1';
    const original = button.onclick;
    button.onclick = async function v21AuthAction(event) {
      if (button.dataset.pending === '1') return;
      const input = box.querySelector(type === 'register' ? '#nickname' : '#key');
      const value = String(input?.value || '').trim();
      if (!value) {
        setAuthStatus(box, 'error', type === 'register' ? '와이고수 닉네임을 입력해 주세요.' : 'PLAY DK 개인키를 입력해 주세요.');
        input?.focus();
        return;
      }
      button.dataset.pending = '1';
      button.disabled = true;
      box.dataset.authState = 'pending';
      const idleLabel = button.textContent;
      button.textContent = type === 'register' ? '계정 확인 중…' : '접속 확인 중…';
      setAuthStatus(box, 'pending', type === 'register' ? '와이고수 닉네임으로 새 계정을 생성하고 있습니다.' : 'PLAY DK 계정 키를 안전하게 확인하고 있습니다.');

      const nativeAlert = global.alert;
      let authError = '';
      const authAlert = message => {
        authError = String(message || '요청을 완료하지 못했습니다.');
        if (box.isConnected) setAuthStatus(box, 'error', authError);
      };
      global.alert = authAlert;
      try {
        await original.call(this, event);
        if (box.isConnected && !authError) setAuthStatus(box, 'success', type === 'register' ? '계정 생성이 완료되었습니다.' : '로그인 완료. 로비로 이동합니다.');
      } catch (error) {
        authError = String(error?.message || '요청을 완료하지 못했습니다.');
        if (box.isConnected) setAuthStatus(box, 'error', authError);
      } finally {
        if (global.alert === authAlert) global.alert = nativeAlert;
        if (button.isConnected) {
          button.dataset.pending = '0';
          button.disabled = false;
          button.textContent = idleLabel;
          box.dataset.authState = authError ? 'error' : 'idle';
        }
      }
    };
  }

  function enhanceLogin(box) {
    if (!box || box.dataset.v21AuthEnhanced === '1') return false;
    const keyField = box.querySelector('.key-login-field, .field:has(#key)');
    const nicknameField = box.querySelector('.field:has(#nickname)');
    const loginButton = box.querySelector('#login');
    const startButton = box.querySelector('#start');
    if (!keyField || !nicknameField || !loginButton || !startButton) return false;

    box.dataset.v21AuthEnhanced = '1';
    box.dataset.authState = 'idle';
    box.classList.add('v21-auth-console');
    const wrap = box.closest('.login-wrap');
    wrap?.classList.add('v21-auth-screen');

    const logo = box.querySelector('.login-logo');
    const eyebrow = box.querySelector(':scope > .eyebrow');
    const heading = box.querySelector(':scope > h1');
    if (eyebrow) eyebrow.textContent = 'SECURE PLAYER GATEWAY';
    if (heading) heading.textContent = '숲켓몬 접속';
    logo?.setAttribute('alt', 'SOOP 카드 컬렉션 RPG');

    const brand = document.createElement('header');
    brand.className = 'v21-auth-brand';
    if (logo) brand.append(logo);
    const brandCopy = document.createElement('div');
    if (eyebrow) brandCopy.append(eyebrow);
    if (heading) brandCopy.append(heading);
    brandCopy.insertAdjacentHTML('beforeend', '<p>기존 계정은 PLAY DK 개인키로, 처음 이용하는 플레이어는 와이고수 닉네임으로 시작합니다.</p>');
    brand.append(brandCopy);

    const modeTabs = document.createElement('div');
    modeTabs.className = 'v21-auth-mode-tabs';
    modeTabs.setAttribute('role', 'tablist');
    modeTabs.setAttribute('aria-label', '접속 방식 선택');
    modeTabs.innerHTML = '<button type="button" role="tab" data-v21-auth-mode="playdk"><span>PLAY DK</span><b>기존 계정 로그인</b></button><button type="button" role="tab" data-v21-auth-mode="nickname"><span>WAGOSU</span><b>와이고수 닉네임</b></button>';

    const panels = document.createElement('div');
    panels.className = 'v21-auth-panels';
    const playPanel = document.createElement('section');
    playPanel.className = 'v21-auth-panel';
    playPanel.dataset.v21AuthPanel = 'playdk';
    playPanel.setAttribute('role', 'tabpanel');
    const nicknamePanel = document.createElement('section');
    nicknamePanel.className = 'v21-auth-panel';
    nicknamePanel.dataset.v21AuthPanel = 'nickname';
    nicknamePanel.setAttribute('role', 'tabpanel');

    const notice = box.querySelector('.logged-out-notice');
    const help = box.querySelector('.login-help');
    const divider = box.querySelector('.login-divider');
    notice?.remove();
    divider?.remove();

    keyField.querySelector('label')?.replaceChildren(document.createTextNode('PLAY DK 개인키'));
    const keyInput = keyField.querySelector('#key');
    if (keyInput) {
      keyInput.placeholder = 'CN-XXXX-XXXX-XXXX';
      keyInput.setAttribute('aria-describedby', 'v21PlayDkHelp');
      keyInput.setAttribute('spellcheck', 'false');
      keyInput.setAttribute('autocomplete', 'off');
      keyInput.setAttribute('autocapitalize', 'characters');
      keyInput.setAttribute('autocorrect', 'off');
      keyInput.setAttribute('enterkeyhint', 'go');
      keyInput.setAttribute('inputmode', 'text');
    }
    loginButton.textContent = 'PLAY DK로 접속';
    loginButton.classList.add('v21-auth-submit');
    if (help) {
      help.id = 'v21PlayDkHelp';
      help.textContent = '개인키는 계정 복구용 보안 키입니다. 서버에는 운영 인증 계약 그대로 전송됩니다.';
    }
    playPanel.insertAdjacentHTML('afterbegin', '<div class="v21-auth-panel-head"><small>RETURNING PLAYER</small><h2>PLAY DK 계정 로그인</h2><p>발급받은 개인키로 보유 카드와 진행 상태를 불러옵니다.</p></div>');
    playPanel.append(keyField, loginButton);
    if (help) playPanel.append(help);

    nicknameField.querySelector('label')?.replaceChildren(document.createTextNode('와이고수 닉네임'));
    const nicknameInput = nicknameField.querySelector('#nickname');
    if (nicknameInput) {
      nicknameInput.placeholder = '사용 중인 와이고수 닉네임';
      nicknameInput.autocomplete = 'username';
      nicknameInput.setAttribute('autocapitalize', 'off');
      nicknameInput.setAttribute('autocorrect', 'off');
      nicknameInput.setAttribute('spellcheck', 'false');
      nicknameInput.setAttribute('enterkeyhint', 'go');
      nicknameInput.setAttribute('inputmode', 'text');
    }
    startButton.textContent = '닉네임으로 새 계정 만들기';
    startButton.classList.remove('secondary');
    startButton.classList.add('v21-auth-submit');
    nicknamePanel.insertAdjacentHTML('afterbegin', '<div class="v21-auth-panel-head"><small>NEW PLAYER REGISTRATION</small><h2>와이고수 닉네임 등록</h2><p>닉네임으로 새 계정을 만들고 PLAY DK 개인키를 발급받습니다.</p></div>');
    nicknamePanel.append(nicknameField, startButton);
    nicknamePanel.insertAdjacentHTML('beforeend', '<p class="v21-auth-contract-note">닉네임은 신규 계정 생성에 사용됩니다. 기존 계정 로그인은 PLAY DK 개인키를 선택해 주세요.</p>');

    panels.append(playPanel, nicknamePanel);
    const status = document.createElement('div');
    status.className = 'v21-auth-status';
    status.dataset.v21AuthStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    const footer = document.createElement('footer');
    footer.className = 'v21-auth-footer';
    footer.innerHTML = '<span><i></i> SECURE SESSION</span><small>SOOPKETMON PROJECT V</small>';

    box.replaceChildren(brand, modeTabs, panels, status, footer);
    modeTabs.querySelectorAll('[data-v21-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(box, button.dataset.v21AuthMode, true)));
    wrapAuthAction(box, loginButton, 'login');
    wrapAuthAction(box, startButton, 'register');
    setAuthMode(box, storedAuthMode());
    updateAuthViewport();
    markRenewalUiReady();
    return true;
  }

  function enhanceCreated(box) {
    if (!box || box.dataset.v21CreatedEnhanced === '1') return false;
    const copyButton = box.querySelector('#copy');
    const gameButton = box.querySelector('#go');
    const keyInput = box.querySelector('#copyKey');
    if (!copyButton || !gameButton || !keyInput) return false;
    box.dataset.v21CreatedEnhanced = '1';
    box.classList.add('v21-auth-console', 'v21-auth-created');
    box.closest('.login-wrap')?.classList.add('v21-auth-screen');
    const eyebrow = box.querySelector('.eyebrow');
    const heading = box.querySelector('h1');
    if (eyebrow) eyebrow.textContent = 'PLAYER IDENTITY ISSUED';
    if (heading) heading.textContent = '계정 생성 완료';
    keyInput.setAttribute('aria-label', 'PLAY DK 개인키');
    keyInput.closest('.field')?.querySelector('label')?.replaceChildren(document.createTextNode('PLAY DK 개인키'));
    copyButton.textContent = 'PLAY DK 개인키 복사';
    gameButton.textContent = '게임 로비 입장';
    box.insertAdjacentHTML('afterbegin', '<div class="v21-created-signal" aria-hidden="true"><i></i><span>IDENTITY VERIFIED</span></div>');
    box.insertAdjacentHTML('beforeend', '<p class="v21-created-warning"><b>중요</b> 개인키는 계정 복구에 필요합니다. 안전한 곳에 보관한 뒤 게임을 시작하세요.</p>');
    updateAuthViewport();
    markRenewalUiReady();
    return true;
  }

  function renameCardStore(root = document) {
    const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
    root.querySelectorAll('[data-v21-route="buy"], [data-tab="buy"], [data-mobile-tab="buy"]').forEach(button => {
      const label = button.querySelector(':scope > b, .pc-nav-copy > b');
      if (label && /카드팩|카드 팩/.test(label.textContent || '')) setText(label, '카드 상점');
    });
    root.querySelectorAll('.v21-live-route[data-live-route="buy"] .v21-route-command-head h1').forEach(node => setText(node, '카드 상점'));
    root.querySelectorAll('.pack-selector-head h2').forEach(node => setText(node, '카드 상점'));
    root.querySelectorAll('.pack-selector-head .eyebrow').forEach(node => setText(node, 'CARD STORE / ACTIVE PACKS'));
  }

  function configureDrawPurchaseOptions(root = document) {
    root.querySelectorAll('.v21-card-store .draw-options').forEach(options => {
      options.querySelector('.draw[data-count="1"]')?.remove();
      const twenty = options.querySelector('.draw[data-count="20"]');
      const hundred = options.querySelector('.draw[data-count="100"]');
      const auto = options.querySelector('.auto-draw-config');
      if (!twenty || !hundred || !auto) return;

      const unitCost = Math.max(0, Math.round(Number(twenty.dataset.cost || 0) / 20));
      const bulkCost = unitCost * 1000;
      let bulk = options.querySelector('.v21-bulk-draw[data-count="1000"]');
      if (!bulk) {
        bulk = document.createElement('button');
        bulk.type = 'button';
        bulk.className = 'btn v21-bulk-draw';
        bulk.dataset.count = '1000';
        bulk.dataset.batchCount = '100';
        bulk.dataset.batchRuns = '10';
      }
      bulk.dataset.packId = String(hundred.dataset.packId || twenty.dataset.packId || '');
      bulk.dataset.cost = String(bulkCost);
      bulk.setAttribute('aria-label', `카드 1000장 안전 일괄 구매 · ${bulkCost.toLocaleString('ko-KR')}코인`);
      const bulkMarkup = `<small>1000 CARDS · 100 × 10 SAFE QUEUE</small>${bulkCost.toLocaleString('ko-KR')}코인`;
      if (bulk.innerHTML !== bulkMarkup) bulk.innerHTML = bulkMarkup;
      bulk.onclick = () => {
        const startQueue = global.startOfficialAutoDraw;
        if (typeof startQueue !== 'function') {
          global.alert?.('안전 구매 큐를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
          return;
        }
        const approved = global.confirm?.(`카드 1000장을 구매할까요?\n100장씩 10회 순차 처리되며 총 ${bulkCost.toLocaleString('ko-KR')}코인이 필요합니다.\n각 회차는 서버 지급 영수증으로 중복 결제를 방지합니다.`);
        if (approved === false) return;
        startQueue(bulk.dataset.packId, {
          count: 100,
          runs: 10,
          delayMs: 0,
          simplified: true,
          stopGrade: 'NONE',
          source: 'V21_BULK_1000'
        });
      };

      if (options.dataset.v21DrawOrder !== '20-100-1000-auto') {
        [twenty, hundred, bulk, auto].forEach(control => options.appendChild(control));
        options.dataset.v21DrawOrder = '20-100-1000-auto';
      }
    });
  }

  function enhanceCardStore(root = document) {
    renameCardStore(root);
    const route = root.querySelector('.v21-live-route[data-live-route="buy"]');
    const selector = root.querySelector('.pack-selector');
    const hero = root.querySelector('.game-hero');
    if (!selector && !hero) return false;
    route?.classList.add('v21-card-store-route');
    route?.querySelector('.v21-route-body')?.classList.add('v21-card-store');
    selector?.classList.add('v21-store-pack-selector');
    hero?.classList.add('v21-store-featured');
    root.querySelector('#equipmentSupplyShop')?.classList.add('v21-store-secondary');
    root.querySelector('#vehicleDrawTicketShop')?.classList.add('v21-store-secondary');
    root.querySelector('.weekly-premium-cube-status')?.classList.add('v21-store-secondary');
    const assetSlots = [
      ['.mini-pack', 'pack-thumb', '(max-width:430px) 44px, (max-width:980px) 50px, 62px'],
      ['.hero-pack-zone', 'pack-hero', '(max-width:430px) 112px, (max-width:820px) 124px, (max-width:980px) 142px, 156px'],
      ['#equipmentSupplyShop .equipment-supply-art', 'supply', '156px'],
      ['#vehicleDrawTicketShop .equipment-supply-art, .vehicle-draw-visual', 'vehicle', '148px'],
      ['.weekly-premium-cube-visual', 'cube', '92px']
    ];
    assetSlots.forEach(([selector, kind, sizes]) => {
      root.querySelectorAll(selector).forEach(slot => {
        slot.classList.add('v21-store-asset-slot', `v21-store-asset-slot--${kind}`);
        slot.dataset.v21AssetKind = kind;
        slot.querySelectorAll('picture source').forEach(source => { source.sizes = sizes; });
      });
    });
    root.querySelectorAll('.pack-product-image, .mini-pack img, .equipment-supply-art img, .vehicle-draw-visual img, .weekly-premium-cube-visual img').forEach(image => {
      image.classList.add('v21-store-contain-asset');
      image.decoding = 'async';
    });
    configureDrawPurchaseOptions(root);
    return true;
  }

  function enhance() {
    ensureStyle();
    const login = document.querySelector('#app .player-login-box');
    if (login) enhanceLogin(login);
    document.querySelectorAll('#app .login-box').forEach(box => enhanceCreated(box));
    enhanceCardStore(document);
  }

  function scheduleEnhance() {
    if (scheduledFrame) return;
    scheduledFrame = requestAnimationFrame(() => { scheduledFrame = 0; enhance(); });
  }

  function start() {
    ensureStyle();
    installMobileInputGuard();
    scheduleEnhance();
    const app = document.getElementById('app');
    const modal = document.getElementById('modal');
    const observer = new MutationObserver(scheduleEnhance);
    if (app) observer.observe(app, { childList: true, subtree: true });
    if (modal) observer.observe(modal, { childList: true, subtree: true });
  }

  global.SoopketmonV21LoginShop = Object.freeze({
    version: VERSION,
    enhance,
    enhanceLogin,
    enhanceCardStore,
    setAuthMode
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window);
