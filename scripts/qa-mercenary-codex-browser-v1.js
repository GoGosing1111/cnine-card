// Run only in the read-only codex through a browser evaluator; no account calls.
export async function runMercenaryCodexBrowserQa() {
  const publicMode = document.documentElement.dataset.codexMode === 'public';
  if (!location.pathname.startsWith('/preview/mercenary-codex-v1/') && !(publicMode && location.pathname === '/mercenary-codex/')) throw new Error('Read-only codex QA only');
  const $ = selector => document.querySelector(selector);
  const checks = [];
  const check = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); if (!ok) throw new Error(name); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const decode = async image => {
    let timer;
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Image decode timed out: ${image.getAttribute('src') || '<empty>'}`)), 12000);
      })]);
    } finally { clearTimeout(timer); }
  };
  const input = (id, value, type = 'input') => { const node = $(id); node.value = value; node.dispatchEvent(new Event(type, { bubbles: true })); };
  const storageKey = publicMode ? 'cnine.mercenaryCodex.public.v1' : 'cnine.mercenaryCodex.preview.v1';
  const savedBefore = localStorage.getItem(storageKey);
  try {
    // Start deterministically even when the user opened a newest-first deep link.
    $('#resetFilters').click();
    input('#sort', 'code', 'change');
    check('43 cards including approved Dongtan Diim', document.querySelectorAll('.codex-card').length === 43);
    check('all 43 SD resources counted', $('#sdCount').textContent === '43');
    check('no horizontal overflow', document.documentElement.scrollWidth <= innerWidth);
    const frame = $('.card-frame');
    await decode(frame);
    check('slim V3 frame loaded on every list card', frame.naturalWidth === 1024 && [...document.querySelectorAll('.codex-card .card-frame')].every(node => node.src.endsWith('/mercenary-contract-frame-slim-v3.png')));
    check('readable names outside the slim frame', document.querySelectorAll('.card-display-name').length === 43 && parseFloat(getComputedStyle($('.card-display-name')).fontSize) >= 16 && !$('.card-visual .card-name'));
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
    check('combined role + position', document.querySelectorAll('.codex-card').length === 4);
    const card = $('[data-open="V-004"]'); card.focus(); card.click();
    check('dialog focus and result position', $('#detailDialog').open && document.activeElement.id === 'detailName' && $('#detailIndex').textContent === '1 / 4');
    $('#nextCard').click();
    check('filtered next preserves legacy order', $('#detailCode').textContent === 'V-008' && !$('#nextCard').disabled);
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
    input('#sort', 'newest', 'change');
    check('newest sorting surfaces approved additions', $('.codex-card').dataset.card === 'V-043');
    input('#search', 'SKS');
    check('SKS search resolves the replaced weapon', document.querySelectorAll('.codex-card').length === 1 && $('.codex-card').dataset.card === 'V-024');
    $('[data-open="V-024"]').click();
    check('provisional name and weapon are explicit', $('#detailContent').textContent.includes('가칭') && $('#detailContent').textContent.includes('SKS'));
    $('#sdTab').click();
    await decode($('#mediaPanel [data-media="battleSprite"]'));
    check('new SKS SD has its own loaded image', $('#mediaPanel [data-media="battleSprite"]').src.includes('/v-024-sd-640.webp') && Boolean($('#mediaPanel [data-zoom]')) && !$('#mediaPanel .card-source'));
    $('#mediaPanel [data-zoom]').click();
    await decode($('#originalArt'));
    check('SKS SD zoom resolves the separate native sprite', $('#originalArt').src.includes('/mercenary-v024-velua-sd-v1.png') && $('#originalArt').naturalWidth >= 1024);
    $('#closeArt').click(); await pause();
    $('#artTab').click();
    $('#mediaPanel [data-zoom]').click();
    $('#closeArt').click();
    $('#mediaPanel [data-zoom]').click();
    await pause();
    check('rapid zoom reopen preserves the latest original', $('#artDialog').open && $('#originalArt').src.includes('mercenary-v024-nocturne-sks-source-art-v1.png'));
    await decode($('#originalArt'));
    check('final SKS source is connected and uncropped', $('#originalArt').src.includes('mercenary-v024-nocturne-sks-source-art-v1.png') && $('#originalArt').naturalWidth === 1024 && $('#originalArt').naturalHeight === 1536);
    $('#closeArt').click();
    $('#closeDetail').click(); await pause();
    $('#resetFilters').click();
    input('#sort', 'code', 'change');
    const rosterResponse = await fetch('/assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json?v=20260910-sd-complete', { cache: 'no-store', credentials: 'omit' });
    if (!rosterResponse.ok) throw new Error(`Roster HTTP ${rosterResponse.status}`);
    const roster = await rosterResponse.json();
    for (const entry of roster.cards.slice(21).filter(card => card.battleSprite)) {
      const sprite = new Image();
      sprite.src = `/assets/ui/project-v/mercenaries/codex-v1/${entry.code.toLowerCase()}-sd-640.webp`;
      await decode(sprite);
      const canvas = document.createElement('canvas');
      canvas.width = sprite.naturalWidth; canvas.height = sprite.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(sprite, 0, 0);
      const corner = context.getImageData(0, 0, 1, 1).data[3];
      check(`${entry.code} SD derivative loads with real alpha`, sprite.naturalWidth === 640 && sprite.naturalHeight === 960 && corner <= 1 && entry.sourceArt !== entry.battleSprite);
    }
    for (const entry of roster.cards.slice(37)) {
      input('#search', entry.outfit);
      check(`${entry.code} outfit search`, document.querySelectorAll('.codex-card').length === 1 && $('.codex-card').dataset.card === entry.code);
      $(`[data-open="${entry.code}"]`).click();
      await decode($('#mediaPanel .card-source'));
      check(`${entry.code} concept metadata`, $('#detailContent').textContent.includes(entry.outfit) && $('#detailContent').textContent.includes(entry.weapon) && $('#detailContent').textContent.includes(entry.nameStatus === 'USER_ASSIGNED_NAME' ? '사용자 지정' : '가칭'));
      $('#sdTab').click();
      await decode($('#mediaPanel [data-media="battleSprite"]'));
      check(`${entry.code} separate SD is connected`, $('#mediaPanel [data-media="battleSprite"]').src.endsWith(`${entry.code.toLowerCase()}-sd-640.webp`) && !$('#mediaPanel .card-source'));
      $('#mediaPanel [data-zoom]').click();
      await decode($('#originalArt'));
      check(`${entry.code} native transparent SD`, $('#originalArt').src.endsWith(entry.battleSprite) && $('#originalArt').naturalWidth === 1024 && $('#originalArt').naturalHeight === 1536);
      $('#closeArt').click(); await pause();
      $('#artTab').click();
      $('#mediaPanel [data-zoom]').click();
      await decode($('#originalArt'));
      check(`${entry.code} native approved original`, $('#originalArt').src.endsWith(entry.sourceArt) && $('#originalArt').naturalWidth === 1024 && $('#originalArt').naturalHeight === 1536);
      $('#closeArt').click(); await pause();
      $('#closeDetail').click(); await pause();
    }
    $('#resetFilters').click();
    input('#sort', 'newest', 'change');
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
