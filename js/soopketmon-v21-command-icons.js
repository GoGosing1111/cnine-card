(function installSoopketmonV21CommandIcons(global) {
  'use strict';

  const VERSION = '1.3.0';
  const SHELL_SELECTOR = '[data-soopketmon-v21-shell="approved-v21"]';
  const script = document.currentScript;

  /*
   * Every route owns a distinct, code-native 24px symbol.  The approved V21
   * shell is intentionally independent from the retired preview icon set and
   * from emoji/font glyph rendering, so the same geometry is used on Windows,
   * Android and iOS.
   */
  const ICONS = Object.freeze({
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5M9.5 21v-6h5v6"/>',
    menu: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    collection: '<rect x="4" y="5" width="12" height="15" rx="1.5"/><path d="M8 2h12v15M7.5 9.5h5M7.5 13h5"/>',
    growth: '<path d="M14.5 5.5 18.5 2l3.5 3.5-3.5 4-2-2-7.8 7.8"/><path d="m5.5 12.5 6 6-3 3-6-6zM4 14l2-2"/>',

    buy: '<path d="M4 9h16l-1-4H5Z"/><path d="M5 9v11h14V9M8 20v-6h4v6"/><path d="M4 9c0 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 4 2 4 0"/>',
    dex: '<path d="M4 5.5c3.2-1 5.5-.2 8 2v13c-2.5-2.2-4.8-3-8-2Z"/><path d="M20 5.5c-3.2-1-5.5-.2-8 2v13c2.5-2.2 4.8-3 8-2Z"/><path d="M7 9.5h2.5M14.5 9.5H17"/>',
    upgrade: '<path d="M5 20h14M7 16h10M9 12h6"/><path d="m12 3 4 4h-2.5v5h-3V7H8Z"/><circle cx="12" cy="17.5" r="1.5"/>',
    evolution: '<path d="m5 16 4-4 3 3 6-7"/><path d="M13.5 8H18v4.5"/><path d="M5 20h14"/><circle cx="5" cy="16" r="1.5"/>',
    magic: '<path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8Z"/><path d="m18.5 15 .9 2.6L22 18.5l-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9ZM5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',

    battle: '<path d="M12 20.5 5.5 17V9L12 4l6.5 5v8Z"/><path d="m8 8 8 8M9.5 6.5 7 9l2 2-4.5 4.5M16 8l-8 8m6.5-9.5L17 9l-2 2 4.5 4.5"/>',
    pvp: '<path d="M5 7h8M10 4l3 3-3 3M19 17h-8M14 14l-3 3 3 3"/><path d="M5 4v16M19 4v16"/>',
    deck: '<rect x="4" y="6" width="12" height="15" rx="1.5"/><path d="M8 3h12v15M7.5 11h5M7.5 15h5"/>',
    hunt: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    raid: '<path d="m12 3 3 4 5-1-2 5 2 5-5-1-3 4-3-4-5 1 2-5-2-5 5 1Z"/><path d="M9 10h.01M15 10h.01M9.5 14c1.7 1 3.3 1 5 0"/>',
    siege: '<path d="M4 21V9h4V5h3v4h2V5h3v4h4v12"/><path d="M3 21h18M8 14h3v7M15 14h2v3h-2z"/>',
    seal: '<circle cx="12" cy="12" r="8"/><path d="m12 6 1.8 3.7L18 10.3l-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6Z"/>',
    idle: '<path d="M4 18 12 6l8 12ZM12 6v12M7 18l5-5 5 5"/><path d="M18 4a3 3 0 1 1-3-3 3.5 3.5 0 0 0 3 3Z"/>',
    tower: '<path d="M6 21V7h12v14M5 7l2-4 2 4 3-4 3 4 2-4 2 4"/><path d="M10 21v-5h4v5M9 11h2M13 11h2"/>',
    territory: '<path d="M5 22V3"/><path d="M6 4c4-2 7 2 12 0v9c-5 2-8-2-12 0Z"/><path d="M3 22h6"/>',

    character: '<circle cx="9" cy="8" r="4"/><path d="M2.5 21c.4-5 2.6-8 6.5-8 2.2 0 3.9.9 5 2.5"/><circle cx="17.5" cy="17.5" r="3.5"/><path d="M17.5 12.5v2M17.5 20.5v2M12.5 17.5h2M20.5 17.5h2M14 14l1.4 1.4M19.6 19.6 21 21M21 14l-1.4 1.4M15.4 19.6 14 21"/>',
    equipment: '<path d="M12 3 5 6v5c0 5 2.8 8.5 7 10 4.2-1.5 7-5 7-10V6Z"/><path d="M9 8h6v4a3 3 0 0 1-6 0ZM12 15v3"/>',
    title: '<circle cx="12" cy="9" r="5"/><path d="m9 14-2 8 5-3 5 3-2-8"/><path d="m12 6 .9 1.8 2 .3-1.5 1.4.4 2-1.8-.9-1.8.9.4-2-1.5-1.4 2-.3Z"/>',
    garage: '<path d="M4 15V9l3-4h10l3 4v6"/><path d="M3 11h18v7H3zM6 18v2M18 18v2"/><circle cx="7" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/>',
    workshop: '<path d="m4 18 7-7 2 2-7 7H4Z"/><path d="m12 5 3-3 5 5-3 3M13 4l7 7"/><path d="M13 13h8v7h-8z"/>',
    scrapyard: '<path d="m8 5 2-3 2 3M10 2v6"/><path d="m18 9 3 2-3 2M21 11h-6"/><path d="m8 19-2 3-2-3M6 22v-6"/><path d="M5 8a7 7 0 0 1 11-2M19 16A7 7 0 0 1 8 18"/>',
    vehicle: '<path d="m4 14 2-5h12l2 5v5H4Z"/><path d="M6 9 8 5h8l2 4M4 14h16"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    fusion: '<path d="m8 3 4 2v5l-4 2-4-2V5ZM16 12l4 2v5l-4 2-4-2v-5Z"/><path d="m10.5 10.5 3 3M13 7h5v5"/>',
    alchemy: '<circle cx="12" cy="13" r="7"/><path d="M9 3h6M10 3v4l-4 6m8-6 4 6M8 14c2-2 6-2 8 0M12 10v7"/>',

    attendance: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18m-14 5 3 3 6-6"/>',
    dailyquest: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5h6V6H9zM8 11l1.5 1.5L12 10M8 16l1.5 1.5L12 15M14 11h2M14 16h2"/>',
    messages: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6M4 18l5-6M20 18l-5-6"/>',
    mineral: '<path d="m12 2 7 6-3 12H8L5 8Z"/><path d="m5 8 7 4 7-4M12 12v8M9 4l3 8 3-8"/>',

    rank: '<path d="M7 4h10v5c0 4-2 7-5 8-3-1-5-4-5-8Z"/><path d="M7 6H3v2c0 3 2 5 5 5M17 6h4v2c0 3-2 5-5 5M9 21h6M12 17v4"/>',
    prediction: '<circle cx="7" cy="17" r="3"/><path d="M10 17h3l2-4 2 2 4-7M17 8h4v4"/><path d="M3 4h8v7H3zM6 7h2"/>',
    auction: '<path d="m5 9 5-5 4 4-5 5ZM11 12l5-5M13 14l5-5M3 20h12v2H3z"/><path d="m12 11 7 7"/>',
    inventory: '<path d="M4 8h16v13H4Z"/><path d="M7 8V4h10v4M4 12h16M10 12v3h4v-3"/>'
  });

  const COMBAT_ROUTES = new Set(['battle', 'pvp', 'deck', 'hunt', 'raid', 'siege', 'seal', 'idle', 'tower', 'territory']);
  const GROWTH_ROUTES = new Set(['character', 'equipment', 'title', 'garage', 'workshop', 'scrapyard', 'vehicle', 'fusion', 'alchemy']);
  const GROUP_ICONS = Object.freeze({ collection: 'collection', combat: 'battle', growth: 'growth' });
  const GROWTH_TAB_LABELS = Object.freeze({ equipment: '장비', title: '칭호', garage: '차고지' });

  const iconSvg = key => `<svg class="v21-command-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-v21-symbol="${key}">${ICONS[key] || ICONS.menu}</svg>`;

  function stylesheetUrl() {
    if (script?.src) return new URL('../css/soopketmon-v21-command-icons.css', script.src).href;
    return 'css/soopketmon-v21-command-icons.css';
  }

  function ensureStyle() {
    const styles = [
      ['soopketmonV21CommandIcons', stylesheetUrl()],
      ['soopketmonV21GrowthPremium', script?.src ? new URL('../css/soopketmon-v21-growth-premium.css', script.src).href : 'css/soopketmon-v21-growth-premium.css']
    ];
    styles.forEach(([id, href]) => {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `${href}?v=${VERSION}`;
      document.head.append(link);
    });
  }

  function iconKey(button) {
    if (button.hasAttribute('data-v21-home')) return 'home';
    if (button.hasAttribute('data-v21-all')) return 'menu';
    if (button.dataset.v21Route) return ICONS[button.dataset.v21Route] ? button.dataset.v21Route : 'menu';
    return GROUP_ICONS[button.dataset.v21Group] || 'menu';
  }

  function iconHost(button) {
    return button.querySelector(':scope > .pc-nav-icon, :scope > .battle-orb, :scope > svg, :scope > span');
  }

  function installSvg(host, key) {
    if (!host) return;
    const existing = host.matches?.('svg') ? host : host.querySelector?.(':scope > svg');
    if (existing?.dataset?.v21Symbol === key) return;
    if (host.matches?.('svg')) {
      const template = document.createElement('template');
      template.innerHTML = iconSvg(key);
      host.replaceWith(template.content.firstElementChild);
    } else {
      host.innerHTML = iconSvg(key);
    }
  }

  let combatObserver = null;
  function observeCombat(button) {
    if (!('IntersectionObserver' in global) || button.dataset.v21CombatObserved === '1') return;
    button.dataset.v21CombatObserved = '1';
    combatObserver ||= new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('v21-combat-offscreen', !entry.isIntersecting));
    }, { threshold: 0.01 });
    combatObserver.observe(button);
  }

  function decorate(button) {
    const key = iconKey(button);
    installSvg(iconHost(button), key);
    button.dataset.v21Icon = key;
    button.dataset.v21IconReady = '1';
    const route = button.dataset.v21Route || '';
    const isCombat = COMBAT_ROUTES.has(route) || button.dataset.v21Group === 'combat';
    const isCombatCore = route === 'battle';
    const isGrowth = GROWTH_ROUTES.has(route) || button.dataset.v21Group === 'growth';
    button.classList.toggle('v21-combat-command', isCombat);
    button.classList.toggle('v21-combat-core', isCombatCore);
    button.classList.toggle('v21-growth-command', isGrowth);
    const isPrimary = isCombatCore && button.matches('.pc-nav-command,.mobile-command-button');
    button.classList.toggle('v21-combat-primary', isPrimary);
    if (isPrimary) observeCombat(button);
  }

  function decorateGrowthTab(button) {
    const key = button.dataset.characterTab;
    const label = GROWTH_TAB_LABELS[key];
    if (!label || button.dataset.v21GrowthTabReady === '1') return;
    button.classList.add('v21-growth-tab');
    button.innerHTML = `${iconSvg(key)}<span>${label}</span>`;
    button.dataset.v21GrowthTabReady = '1';
  }

  function apply(root = document) {
    const shells = root.matches?.(SHELL_SELECTOR) ? [root] : [...root.querySelectorAll?.(SHELL_SELECTOR) || []];
    if (!shells.length && document.querySelector(SHELL_SELECTOR)) shells.push(document.querySelector(SHELL_SELECTOR));
    shells.forEach(shell => {
      shell.querySelectorAll('[data-v21-route],[data-v21-group],[data-v21-home],[data-v21-all]').forEach(decorate);
      shell.querySelectorAll('[data-character-tab]').forEach(decorateGrowthTab);
      shell.dataset.v21IconSystem = VERSION;
    });
    /* Command overlays are siblings of the shell in #modal. */
    document.querySelectorAll('.v21-command-overlay [data-v21-route]').forEach(decorate);
    return shells.length;
  }

  let scheduled = 0;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = global.requestAnimationFrame(() => { scheduled = 0; apply(document); });
  }

  function syncVisibility() {
    document.documentElement.classList.toggle('v21-page-hidden', document.hidden);
  }

  function start() {
    ensureStyle();
    apply(document);
    new MutationObserver(scheduleApply).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', syncVisibility, { passive: true });
    syncVisibility();
  }

  global.SoopketmonV21CommandIcons = Object.freeze({ version: VERSION, icons: ICONS, combatRoutes: [...COMBAT_ROUTES], iconSvg, apply });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
