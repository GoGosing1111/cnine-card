import { ROSTER_URL, POSITIONS, assetUrl, mediaPath, positionOf, roleOf, filterCards, validateRoster, summarize, collectionEntries, readState, artStatus, sdStatus } from './model.js?v=20260911-omega-ranks';

const IS_PUBLIC = document.documentElement.dataset.codexMode === 'public';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const shapes = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  book: '<path d="M4 5.5c3-1 5.5-.2 8 2v13c-2.5-2.2-5-3-8-2ZM20 5.5c-3-1-5.5-.2-8 2v13c2.5-2.2 5-3 8-2Z"/>',
  mercenary: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="m7 7 5 10 5-10M8 18h8"/>',
  upgrade: '<path d="M5 20h14M7 16h10M9 12h6m-3-9 4 4h-2.5v5h-3V7H8Z"/>',
  cards: '<rect x="4" y="6" width="12" height="15" rx="1"/><path d="M8 3h12v15M7 11h6M7 15h6"/>',
  magic: '<path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2ZM19 18v4m-2-2h4"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shapes[name] || shapes.book}</svg>`;
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });

const storageKey = IS_PUBLIC ? 'cnine.mercenaryCodex.public.v1' : 'cnine.mercenaryCodex.preview.v1';
let roster;
let state = {};
let favorites = new Set();
let visibleCards = [];
let activeCode = null;
let mediaKind = 'art';
let returnFocus = null;
let detailHistoryOwned = false;
let restoreFocusPending = false;
let toastTimer;
let loadVersion = 0;
const detail = $('#detailDialog');
const artDialog = $('#artDialog');

function announce(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  // Popovers can be shown above native modal dialogs without moving focus.
  if (node.showPopover) { node.setAttribute('popover', 'manual'); try { node.showPopover(); } catch {} }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidePopover?.(); node.hidden = true; }, 2600);
}
function saveFavorites() {
  try { localStorage.setItem(storageKey, JSON.stringify([...favorites])); return true; }
  catch { announce('저장 공간을 사용할 수 없어 이번 화면에서만 유지합니다.'); return false; }
}
function refreshSavedButtons() {
  $('#savedCount').textContent = String(favorites.size);
  document.querySelectorAll('[data-save]').forEach(button => {
    const card = roster.cards.find(item => item.code === button.dataset.save);
    const saved = favorites.has(card.code);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', `${card.name} 즐겨찾기 ${saved ? '해제' : '추가'}`);
    button.title = `이 브라우저에서 즐겨찾기 ${saved ? '해제' : '추가'}`;
    const label = button.querySelector('span');
    if (label) label.textContent = saved ? '저장됨' : '즐겨찾기';
  });
}
function toggleFavorite(code) {
  if (!roster.cards.some(card => card.code === code)) return;
  const index = visibleCards.findIndex(card => card.code === code);
  if (favorites.has(code)) favorites.delete(code); else favorites.add(code);
  const persisted = saveFavorites();
  refreshSavedButtons();
  if (state.favoritesOnly) {
    renderGrid();
    if (!detail.open) {
      const next = visibleCards[Math.min(index, visibleCards.length - 1)];
      (next ? document.querySelector(`[data-save="${next.code}"]`) : $('#savedOnly'))?.focus({ preventScroll: true });
    }
  }
  updateDetailNavigation();
  if (persisted) announce(favorites.has(code) ? '이 브라우저의 즐겨찾기에 저장했습니다.' : '즐겨찾기에서 해제했습니다.');
}
function visual(card, { sizes = '(max-width: 520px) 45vw, (max-width: 800px) 30vw, (max-width: 1100px) 23vw, 245px', eager = false } = {}) {
  return `<span class="card-visual"><img class="card-source" data-media="sourceArt" src="${assetUrl(mediaPath(card.code))}" srcset="${assetUrl(mediaPath(card.code))} 320w, ${assetUrl(mediaPath(card.code, 'art', 640))} 640w" sizes="${sizes}" alt="" width="320" height="480" loading="${eager ? 'eager' : 'lazy'}" decoding="async"><span class="card-vignette"></span><img class="card-frame" src="${assetUrl(roster.cardComposition.frame)}" alt="" width="1024" height="1536" loading="lazy">${card.rank ? `<span class="mercenary-rank" data-rank="${esc(card.rank)}">${esc(card.rank)}</span>` : ''}</span>`;
}
function persistUrl() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ q: state.q, position: state.position, role: state.role, sort: state.sort === 'code' ? '' : state.sort, saved: state.favoritesOnly ? '1' : '' })) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history.replaceState(history.state, '', url);
}
function updateControls() {
  $('#search').value = state.q;
  $('#clearSearch').hidden = !state.q;
  $('#sort').value = state.sort;
  $('#role').value = state.role;
  $('#savedOnly').setAttribute('aria-pressed', String(state.favoritesOnly));
  $('#positions').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.position === state.position)));
  $('#resetFilters').hidden = !state.q && !state.position && !state.role && !state.favoritesOnly;
}
function changeFilter(change) {
  state = { ...state, ...change };
  persistUrl();
  updateControls();
  renderGrid();
}
function renderGrid() {
  visibleCards = filterCards(roster.cards, state, favorites);
  const grid = $('#cardGrid');
  grid.setAttribute('aria-busy', 'false');
  $('#resultCount').textContent = `${visibleCards.length} / ${roster.cards.length}종`;
  grid.innerHTML = visibleCards.length ? visibleCards.map((card, index) => `<li class="codex-card" data-card="${card.code}">
    <button type="button" class="card-open" data-open="${card.code}" aria-label="${esc(`${card.name} · ${card.title} · ${card.role} 상세 보기`)}">${visual(card, { eager: index < 5 })}<span class="card-caption"><strong class="card-display-name">${esc(card.name)}</strong><span class="caption-top"><span>${card.code}</span><span class="role-tag">${esc(card.role)}</span></span><span class="card-title">${esc(card.title)}</span></span></button>
    <button type="button" class="card-save" data-save="${card.code}" aria-pressed="false" aria-label="${esc(card.name)} 즐겨찾기 추가">${icon('bookmark')}</button></li>`).join('') : `<li class="load-state">${icon('search')}<strong>${state.favoritesOnly && !favorites.size ? '아직 저장한 용병이 없습니다' : '조건에 맞는 용병이 없습니다'}</strong><p>${state.favoritesOnly && !favorites.size ? '카드 오른쪽 위의 책갈피를 눌러 관심 있는 용병을 모아보세요.' : '검색어 또는 전투 위치·역할 필터를 바꿔보세요.'}</p><button class="primary-button" type="button" data-reset>전체 용병 보기</button></li>`;
  refreshSavedButtons();
}
function renderHero() {
  const cards = ['V-022', 'V-036', 'V-024'].map(code => roster.cards.find(card => card.code === code)).filter(Boolean);
  $('#heroArt').innerHTML = cards.map(card => `<button type="button" data-open="${card.code}" aria-label="${esc(card.name)} 상세 보기"><img src="${assetUrl(mediaPath(card.code, 'art', 640))}" alt="" width="640" height="960" decoding="async"><span><small>${esc(card.title)}</small>${esc(card.name)}</span></button>`).join('');
}
function renderSummary() {
  const info = summarize(roster.cards);
  $('#totalCount').textContent = info.total;
  $('#artCount').textContent = info.sourceReady;
  $('#sdCount').textContent = info.spriteReady;
  $('#positions').innerHTML = [{ label: '전체', value: '', count: info.total }, ...POSITIONS.map(position => ({ label: position, value: position, count: info.positions[position] }))].map(item => `<button type="button" data-position="${item.value}" aria-pressed="false">${item.label}<span>${item.count}</span></button>`).join('');
  const roles = [...new Set(roster.cards.map(roleOf))];
  $('#role').innerHTML = '<option value="">모든 역할</option>' + roles.map(role => `<option value="${esc(role)}">${esc(role)}</option>`).join('');
  const approved = roster.cards.filter(card => card.sourceArtStatus === 'APPROVED_SOURCE_ART').length;
  const legacy = roster.cards.filter(card => card.sourceArtStatus === 'LEGACY_ROSTER_ART').length;
  const supplied = roster.cards.filter(card => card.sourceArtStatus === 'USER_SUPPLIED_SOURCE_ART').length;
  const summary = IS_PUBLIC
    ? `<dl class="summary-grid"><div><dt>공개 용병</dt><dd>${info.total}종</dd></div><div><dt>전투 모습 준비</dt><dd>${info.spriteReady}종</dd></div><div><dt>등급 확정 대기</dt><dd>${info.rankPending}종</dd></div></dl><p>용병의 이름, 역할, 카드 원화와 전투 모습을 먼저 공개합니다.<br>등급은 C·B·A·S·SS·SSS입니다. 오메가-X는 SSS로 확정했으며 나머지는 검토 중입니다. 능력치·스킬·획득 경로는 확정 후 안내합니다. 현재는 정보 열람만 가능하며, 용병 획득·편성·전투 기능은 열리지 않았습니다.</p>`
    : `<dl class="summary-grid"><div><dt>신규 승인 원화</dt><dd>${approved}종</dd></div><div><dt>보존 / 사용자 지정 원화</dt><dd>${legacy}종 / ${supplied}종</dd></div><div><dt>등급 확정 대기</dt><dd>${info.rankPending}종</dd></div></dl><p>준비 로스터 기준일 ${esc(roster.updatedAt)} · 원화 ${info.sourceReady}종, 전투 SD ${info.spriteReady}종 준비.<br>전투 SD 기술검수와 사용자 시각검수는 별개입니다. 개별 상태는 용병 상세에서 확인할 수 있습니다.<br>등급·능력치·스킬·획득 경로가 확정되기 전에는 수치를 추정하지 않습니다. 운영에는 별도 승인된 읽기 전용 도감만 공개합니다.</p>`;
  $('#reviewSummary').innerHTML = summary + POSITIONS.map(position => `<p class="review-names"><b>${position} ${info.positions[position]}종</b> — ${roster.cards.filter(card => positionOf(card) === position).map(card => esc(card.name)).join(' · ')}</p>`).join('');
}
function renderMenu() {
  const entries = collectionEntries(window.SoopketmonV21NavigationContract);
  $('#collectionMenu').innerHTML = entries.map(entry => entry.id === 'mercenaryDex'
    ? `<a class="menu-tile menu-tile-new" href="?" data-catalog><i aria-hidden="true">${icon('mercenary')}</i><span><b>${entry.title}</b><small>도감·강화 · 용병 원화와 상세 정보</small></span><em>NEW →</em></a>`
    : IS_PUBLIC
      ? `<a class="menu-tile" href="/?screen=${encodeURIComponent(entry.id)}"><i aria-hidden="true">${icon(entry.icon)}</i><span><b>${esc(entry.title)}</b><small>도감·강화</small></span><em>열기 →</em></a>`
      : `<div class="menu-tile" aria-label="${esc(entry.title)} · 기존 메뉴"><i aria-hidden="true">${icon(entry.icon)}</i><span><b>${esc(entry.title)}</b><small>도감·강화</small></span></div>`).join('');
}
function setView(menu, { push = false, focus = false } = {}) {
  if (push) {
    const url = new URL(location.href);
    url.hash = '';
    if (menu) url.searchParams.set('view', 'menu'); else url.searchParams.delete('view');
    history.pushState({ mercenaryCodexView: true }, '', url);
  }
  $('#menuView').hidden = !menu;
  $('#catalogView').hidden = menu;
  $('#breadcrumbCurrent').textContent = menu ? (IS_PUBLIC ? '전체 메뉴' : '메뉴 미리보기') : '용병도감';
  if (focus) { window.scrollTo(0, 0); $(menu ? '#menuTitle' : '#catalogTitle').focus({ preventScroll: true }); }
}
function detailCard() { return roster?.cards.find(card => card.code === activeCode); }
function updateDetailNavigation() {
  const index = visibleCards.findIndex(card => card.code === activeCode);
  const valid = index >= 0;
  $('#detailIndex').textContent = valid ? `${index + 1} / ${visibleCards.length}` : '—';
  $('#previousCard').disabled = !valid || index === 0;
  $('#nextCard').disabled = !valid || index === visibleCards.length - 1;
  $('#previousCard').title = '현재 검색 결과의 이전 용병';
  $('#nextCard').title = '현재 검색 결과의 다음 용병';
}
function renderDetail() {
  const card = detailCard();
  if (!card) return;
  detail.style.setProperty('--accent', /^#[a-fA-F0-9]{6}$/.test(card.accent) ? card.accent : '#bfa97e');
  $('#detailCode').textContent = card.code;
  $('#detailBarName').textContent = card.name;
  const rules = roster.formationRule;
  $('#detailContent').innerHTML = `<div class="detail-media"><div class="media-tabs" role="tablist" aria-label="용병 모습"><button type="button" role="tab" id="artTab" data-media-tab="art" aria-controls="mediaPanel" aria-selected="true">카드 원화</button><button type="button" role="tab" id="sdTab" data-media-tab="sd" aria-controls="mediaPanel" aria-selected="false" tabindex="-1">전투 SD</button></div><div id="mediaPanel" role="tabpanel" aria-labelledby="artTab"></div><p id="mediaNote" class="media-note"></p></div>
    <div class="detail-copy"><p class="detail-title">${esc(card.title)}</p><div class="identity-row"><h2 id="detailName" tabindex="-1">${esc(card.name)}</h2><button type="button" class="detail-save" data-save="${card.code}" aria-pressed="false">${icon('bookmark')}<span>즐겨찾기</span></button></div><div class="identity-tags"><span>${esc(card.role)}</span><span>용병 전용 슬롯</span></div>
    ${card.nameStatus === 'PROVISIONAL_CONCEPT_NAME' ? '<p class="asset-note">이름·칭호는 가칭이며, 역할은 원화의 무기 콘셉트 기준입니다. 최종 전투 설정은 별도 확정됩니다.</p>' : card.nameStatus === 'USER_ASSIGNED_NAME' ? '<p class="asset-note">이름은 사용자 지정으로 확정되었습니다. 역할은 원화의 무기 콘셉트이며, 최종 전투 설정은 별도 확정됩니다.</p>' : ''}
    <dl class="info-ledger"><div><dt>신규 등급</dt><dd>${card.rank == null ? '확정 대기' : esc(card.rank)}</dd></div>${card.weapon ? `<div><dt>무기 콘셉트</dt><dd>${esc(card.weapon)}</dd></div>` : ''}${card.outfit ? `<div><dt>의상 콘셉트</dt><dd>${esc(card.outfit)}</dd></div>` : ''}<div><dt>전투 위치</dt><dd>${esc(positionOf(card))}</dd></div><div><dt>역할</dt><dd>${esc(roleOf(card))}</dd></div><div><dt>편성 한도</dt><dd>일반 덱과 별개 · 최대 ${Number(rules.mercenarySlots)}장</dd></div></dl>
    <section class="pending-info"><h3>전투 정보 · 확정 대기</h3><p>${IS_PUBLIC ? '등급은 확정된 카드에 표시합니다. 능력치, 고유 스킬과 획득 경로는 확정 후 안내합니다. 지금은 용병 정보를 먼저 살펴볼 수 있으며, 획득·편성·전투 기능은 준비 중입니다.' : '능력치, 고유 스킬, 획득 경로는 아직 준비 로스터에 등록되지 않았습니다. 확정 전 수치나 과거 임시 등급은 표시하지 않습니다.'}</p></section>
    <section class="formation-info"><h3>기존 덱은 그대로, 용병은 별도로</h3><div class="formation-line"><span class="five-cards" aria-hidden="true">${'<i></i>'.repeat(rules.regularCardSlots)}</span><span>일반 ${Number(rules.regularCardSlots)}장</span><span aria-hidden="true">+</span><b>용병 ${Number(rules.mercenarySlots)}장</b></div><p>최대 ${Number(rules.maxDeployedUnits)}장 편성. 용병 슬롯은 선택 사항이며,<br>비워 두면 기존 5장 덱으로 전투합니다.</p></section>
    <details class="asset-details"><summary>원화 · 전투 리소스 현황</summary><dl class="info-ledger"><div><dt>원화</dt><dd>${artStatus(card)}</dd></div><div><dt>전투 SD</dt><dd>${sdStatus(card)}</dd></div><div><dt>운영 상태</dt><dd>${IS_PUBLIC ? '도감 공개 중 · 편성 미연결' : '검수 프리뷰 · 정보 열람 전용'}</dd></div></dl>${card.sourceArtNote === 'USER_DIRECTED_AS_IS_736X1104_JPEG' ? '<p class="asset-note">사용자 지정 736 × 1104 JPEG 원본을 보존했습니다. 신규 승인 마스터 규격 충족으로 표시하지 않습니다.</p>' : ''}<p class="asset-note">카드 원화와 전투 SD는 별도 리소스입니다. 도감·덱·상세 화면의 원화를 SD로 대체하지 않습니다.</p></details></div>`;
  renderMedia();
  refreshSavedButtons();
  updateDetailNavigation();
}
function renderMedia() {
  const card = detailCard();
  const isArt = mediaKind === 'art';
  document.querySelectorAll('[data-media-tab]').forEach(tab => {
    tab.setAttribute('aria-selected', String(tab.dataset.mediaTab === mediaKind));
    tab.tabIndex = tab.dataset.mediaTab === mediaKind ? 0 : -1;
  });
  $('#mediaPanel').setAttribute('aria-labelledby', isArt ? 'artTab' : 'sdTab');
  $('#mediaPanel').innerHTML = isArt
    ? `<button class="media-view" type="button" data-zoom aria-label="${esc(card.name)} 원화 확대">${visual(card, { sizes: '(max-width: 800px) 280px, 400px', eager: true })}<span class="media-zoom-label">${icon('search')}원본 확대</span></button>`
    : card.battleSprite ? `<button class="media-view" type="button" data-zoom aria-label="${esc(card.name)} 전투 SD 확대"><span class="sd-stage"><img src="${assetUrl(mediaPath(card.code, 'sd', 640))}" data-media="battleSprite" alt="${esc(card.name)} 전투 SD" width="640" height="640"></span><span class="media-zoom-label">${icon('search')}원본 확대</span></button>` : '<div class="media-view load-state">전투 SD 제작 대기</div>';
  $('#mediaNote').textContent = isArt ? '카드 원화 · 클릭하면 자르지 않은 원본을 확대합니다.' : `전투 전용 SD · ${sdStatus(card)}`;
}
function openDetail(code, { push = true, focus = true } = {}) {
  if (!roster.cards.some(card => card.code === code)) return;
  if (!detail.open) returnFocus = document.activeElement;
  activeCode = code;
  mediaKind = 'art';
  renderDetail();
  if (push) {
    const url = new URL(location.href); url.hash = code;
    if (detail.open) history.replaceState(history.state, '', url);
    else { history.pushState({ mercenaryDetail: true }, '', url); detailHistoryOwned = true; }
  }
  if (!detail.open) { detail.showModal(); document.body.style.overflow = 'hidden'; }
  detail.scrollTop = 0;
  if (focus) $('#detailName').focus({ preventScroll: true });
}
function restoreReturnFocus() {
  // A popstate render may replace the original button; resolve its new peer.
  const code = returnFocus?.dataset?.open || returnFocus?.dataset?.save;
  const key = returnFocus?.dataset?.save ? 'save' : 'open';
  const scope = returnFocus?.classList.contains('card-open') || key === 'save' ? '#cardGrid ' : '#heroArt ';
  const peer = code ? document.querySelector(`${scope}[data-${key}="${code}"]`) : null;
  (returnFocus?.isConnected ? returnFocus : peer || $('#search')).focus({ preventScroll: true });
}
function closeDetail({ fromHistory = false } = {}) {
  if (artDialog.open) artDialog.close();
  if (detail.open) detail.close();
  document.body.style.overflow = '';
  if (!fromHistory) {
    if (detailHistoryOwned && location.hash) { restoreFocusPending = true; history.back(); }
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(history.state, '', url); }
  }
  detailHistoryOwned = false;
  activeCode = null;
  restoreReturnFocus();
}
function nextDetail(delta) {
  const index = visibleCards.findIndex(card => card.code === activeCode);
  if (index < 0 || !visibleCards[index + delta]) return;
  openDetail(visibleCards[index + delta].code);
}
function zoomArt() {
  const card = detailCard();
  const path = mediaKind === 'art' ? card.sourceArt : card.battleSprite;
  if (!path) return;
  $('#artTitle').textContent = `${card.name} · ${mediaKind === 'art' ? '카드 원화' : '전투 SD'} 원본`;
  $('#originalArt').alt = `${card.name} ${mediaKind === 'art' ? '카드 원화' : '전투 SD'} 원본`;
  $('#originalArt').src = assetUrl(path);
  $('#artViewport').classList.remove('is-natural');
  $('#toggleOriginal').textContent = '원본 크기';
  artDialog.showModal();
  $('#closeArt').focus();
}

document.addEventListener('click', event => {
  const target = event.target.closest('button,a');
  if (!target) return;
  if (target.hasAttribute('data-menu')) { event.preventDefault(); setView(true, { push: true, focus: true }); return; }
  if (target.hasAttribute('data-catalog')) { event.preventDefault(); setView(false, { push: true, focus: true }); return; }
  if (!roster) { if (target.hasAttribute('data-retry')) void load(); return; }
  if (target.dataset.open) openDetail(target.dataset.open);
  else if (target.dataset.save) toggleFavorite(target.dataset.save);
  else if (target.hasAttribute('data-position')) changeFilter({ position: target.dataset.position });
  else if (target.hasAttribute('data-reset') || target.id === 'resetFilters') { changeFilter({ q: '', role: '', position: '', favoritesOnly: false }); $('#search').focus({ preventScroll: true }); }
  else if (target.hasAttribute('data-zoom')) zoomArt();
  else if (target.dataset.mediaTab) { mediaKind = target.dataset.mediaTab; renderMedia(); }
});
$('#search').addEventListener('input', event => { if (roster) changeFilter({ q: event.target.value }); });
$('#clearSearch').addEventListener('click', () => { changeFilter({ q: '' }); $('#search').focus(); });
$('#sort').addEventListener('change', event => changeFilter({ sort: event.target.value }));
$('#role').addEventListener('change', event => changeFilter({ role: event.target.value }));
$('#savedOnly').addEventListener('click', () => changeFilter({ favoritesOnly: !state.favoritesOnly }));
$('#previousCard').addEventListener('click', () => nextDetail(-1));
$('#nextCard').addEventListener('click', () => nextDetail(1));
$('#closeDetail').addEventListener('click', () => closeDetail());
detail.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
detail.addEventListener('click', event => { if (event.target === detail) { const r = detail.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDetail(); } });
detail.addEventListener('keydown', event => {
  if (artDialog.open) return;
  if (event.target.hasAttribute('data-media-tab') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); mediaKind = event.key === 'Home' ? 'art' : event.key === 'End' ? 'sd' : mediaKind === 'art' ? 'sd' : 'art'; renderMedia(); $(`[data-media-tab="${mediaKind}"]`).focus(); return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nextDetail(event.key === 'ArrowLeft' ? -1 : 1); }
});
$('#closeArt').addEventListener('click', () => artDialog.close());
artDialog.addEventListener('close', () => {
  // Native close events are queued; an earlier close must not clear a reopened image.
  if (!artDialog.open) $('#originalArt').removeAttribute('src');
});
$('#toggleOriginal').addEventListener('click', () => { const natural = $('#artViewport').classList.toggle('is-natural'); $('#toggleOriginal').textContent = natural ? '화면에 맞춤' : '원본 크기'; });
window.addEventListener('popstate', () => {
  if (!roster) return;
  state = readState(location.href, roster.cards); updateControls(); renderGrid();
  const code = location.hash.slice(1);
  setView(new URL(location.href).searchParams.get('view') === 'menu');
  if (roster.cards.some(card => card.code === code)) openDetail(code, { push: false });
  else if (detail.open) closeDetail({ fromHistory: true });
  else if (restoreFocusPending) { restoreFocusPending = false; restoreReturnFocus(); }
});
window.addEventListener('storage', event => {
  if (!roster || event.key !== storageKey) return;
  try { const value = JSON.parse(event.newValue || '[]'); favorites = new Set(Array.isArray(value) ? value.filter(code => roster.cards.some(card => card.code === code)) : []); refreshSavedButtons(); if (state.favoritesOnly) renderGrid(); updateDetailNavigation(); } catch {}
});
document.addEventListener('error', event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  img.dataset.failed = 'true';
  img.alt = '이미지를 불러오지 못했습니다. 새로고침해 주세요.';
  if (img === $('#originalArt')) announce('원본을 불러오지 못했습니다. 연결 상태를 확인해 주세요.');
}, true);

async function load() {
  const version = ++loadVersion;
  $('#cardGrid').innerHTML = '<li class="load-state" role="status">용병 명단을 불러오는 중입니다.</li>';
  $('#cardGrid').setAttribute('aria-busy', 'true');
  $('#catalogControls').querySelectorAll('button,input,select').forEach(node => { node.disabled = true; });
  try {
    const response = await fetch(ROSTER_URL, { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`ROSTER_${response.status}`);
    const data = validateRoster(await response.json());
    if (version !== loadVersion) return;
    roster = data;
    state = readState(location.href, roster.cards);
    try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); favorites = new Set(Array.isArray(value) ? value.filter(code => roster.cards.some(card => card.code === code)) : []); } catch { favorites = new Set(); }
    renderHero(); renderSummary(); updateControls(); renderGrid();
    $('#catalogControls').querySelectorAll('button,input,select').forEach(node => { node.disabled = false; });
    const initial = location.hash.slice(1);
    if (roster.cards.some(card => card.code === initial)) openDetail(initial, { push: false });
  } catch (error) {
    if (version !== loadVersion) return;
    console.warn('[mercenary codex]', error.message);
    $('#cardGrid').setAttribute('aria-busy', 'false');
    $('#cardGrid').innerHTML = '<li class="load-state"><strong>용병 정보를 불러오지 못했습니다</strong><p>연결 상태를 확인하고 다시 시도해 주세요. 계정이나 보유 카드에는 영향이 없습니다.</p><button type="button" class="primary-button" data-retry>다시 불러오기</button></li>';
    $('#resultCount').textContent = '불러오기 실패';
  }
}
renderMenu();
setView(new URL(location.href).searchParams.get('view') === 'menu');
void load();
