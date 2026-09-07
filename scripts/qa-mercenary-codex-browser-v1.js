// Run only in the read-only codex through a browser evaluator; no account calls.
export async function runMercenaryCodexBrowserQa() {
  const publicMode = document.documentElement.dataset.codexMode === 'public';
  if (!location.pathname.startsWith('/preview/mercenary-codex-v1/') && !(publicMode && location.pathname === '/mercenary-codex/')) throw new Error('Read-only codex QA only');
  const $ = selector => document.querySelector(selector);
  const checks = [];
  const check = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); if (!ok) throw new Error(name); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const input = (id, value, type = 'input') => { const node = $(id); node.value = value; node.dispatchEvent(new Event(type, { bubbles: true })); };
  const storageKey = publicMode ? 'cnine.mercenaryCodex.public.v1' : 'cnine.mercenaryCodex.preview.v1';
  const savedBefore = localStorage.getItem(storageKey);
  try {
    check('21 cards', document.querySelectorAll('.codex-card').length === 21);
    check('no horizontal overflow', document.documentElement.scrollWidth <= innerWidth);
    const frame = $('.card-frame');
    await frame.decode();
    check('slim V3 frame loaded on every list card', frame.naturalWidth === 1024 && [...document.querySelectorAll('.codex-card .card-frame')].every(node => node.src.endsWith('/mercenary-contract-frame-slim-v3.png')));
    check('readable names outside the slim frame', document.querySelectorAll('.card-display-name').length === 21 && parseFloat(getComputedStyle($('.card-display-name')).fontSize) >= 16 && !$('.card-visual .card-name'));
    if (publicMode) {
      const back = $('#lobbyReturn');
      check('explicit same-tab lobby return', back && !back.hidden && back.textContent.includes('로비로 돌아가기') && back.getAttribute('href') === '/?screen=home' && !back.target);
      check('lobby return touch target', back.getBoundingClientRect().height >= 44);
      window.scrollTo(0, 500); await pause();
      const rect = back.getBoundingClientRect();
      check('lobby return stays visible while scrolling', rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth);
      window.scrollTo(0, 0);
    }
    input('#search', 'ㄹㅂㅇㄴ');
    check('initial consonant search', document.querySelectorAll('.codex-card').length === 1 && $('.codex-card').dataset.card === 'V-013');
    $('#clearSearch').click();
    $('[data-position="후열"]').click();
    input('#role', '저격', 'change');
    check('combined role + position', document.querySelectorAll('.codex-card').length === 2);
    const card = $('[data-open="V-004"]'); card.focus(); card.click();
    check('dialog focus and result position', $('#detailDialog').open && document.activeElement.id === 'detailName' && $('#detailIndex').textContent === '1 / 2');
    $('#nextCard').click();
    check('filtered next and boundary', $('#detailCode').textContent === 'V-008' && $('#nextCard').disabled);
    $('#sdTab').click();
    check('separate SD', Boolean($('#mediaPanel [data-media="battleSprite"]')) && !$('#mediaPanel .card-source'));
    $('#mediaPanel [data-zoom]').click();
    check('SD original separate', $('#artDialog').open && $('#originalArt').getAttribute('src').includes('/characters/mercenary/'));
    $('#toggleOriginal').click();
    check('native size toggle', $('#artViewport').classList.contains('is-natural'));
    $('#closeArt').click();
    $('#closeDetail').click(); await pause();
    check('close restores invoking card focus after popstate', !$('#detailDialog').open && document.activeElement.dataset.open === 'V-004');
    $('#resetFilters').click();
    input('#search', '__no_match__');
    check('empty state recovery', Boolean($('[data-reset]')) && document.querySelectorAll('.codex-card').length === 0);
    $('[data-reset]').click();
    const saved = $('[data-save="V-020"]');
    if (saved.getAttribute('aria-pressed') === 'true') saved.click();
    $('[data-save="V-020"]').click();
    $('#savedOnly').click();
    check('favorite filter', Boolean($('.codex-card[data-card="V-020"]')));
    $('[data-save="V-020"]').click();
    check('remove favorite refreshes list', !$('.codex-card[data-card="V-020"]'));
    $('#savedOnly').click();
    $('[data-menu]').click();
    check('menu contains five entries', document.querySelectorAll('.menu-tile').length === 5 && !$('#menuView').hidden);
    $('[data-catalog]').click();
    check('menu opens catalog', !$('#catalogView').hidden);
    const sourceOpener = $('#cardGrid [data-open="V-013"]'); sourceOpener.focus(); sourceOpener.click();
    $('#mediaPanel [data-zoom]').click();
    check('original source art never SD', $('#originalArt').src.includes('/mercenaries/short-bob-k2-amethyst-officer-mercenary-source-art-v1.png'));
    $('#closeArt').click();
    history.back(); await pause();
    check('browser back closes only detail', !$('#detailDialog').open && !$('#catalogView').hidden && document.body.style.overflow !== 'hidden');
    check('no account API', performance.getEntriesByType('resource').every(resource => !resource.name.includes('/api/')));
    check('no runtime error', !(window.__codexErrors || []).length);
    window.scrollTo(0, 0);
    return { viewport: `${innerWidth}x${innerHeight}`, checks, errors: window.__codexErrors || [] };
  } finally {
    // QA must not retain test bookmarks in the user's browser.
    if (savedBefore === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, savedBefore);
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: savedBefore }));
    window.__codexQa = checks;
  }
}
