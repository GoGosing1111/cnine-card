import { stationUrl, profileImageUrl } from './streamer-lounge-model-v2036.js?v=2036';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
let data = null, fetchedAt = 0, pending = null, dialog = null, selectedId = '', query = '', opener = null, errorMessage = '';

function avatar(row, className = '') {
  const src = profileImageUrl(row.imageUrl);
  return `<span class="sl36-avatar ${className}"><span aria-hidden="true">${esc(Array.from(row.name || '?')[0])}</span>${src ? `<img src="${esc(src)}" alt="${esc(row.name)} 프로필" width="100" height="100" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
}
function bindImages(root) {
  root.querySelectorAll('.sl36-avatar img').forEach(img => {
    img.addEventListener('error', () => img.remove(), { once: true });
    if (img.complete && !img.naturalWidth) img.remove();
  });
}
function profiles() { return data?.enabled === true ? data.profiles || [] : []; }
function normalizePublic(payload) {
  const rows = Array.isArray(payload?.profiles) ? payload.profiles.slice(0, 40) : [];
  return { enabled: payload?.enabled === true, profiles: rows.filter(row => row && typeof row.name === 'string' && /^[a-zA-Z0-9_-]{2,60}$/.test(row.id) && stationUrl(row.stationUrl)).map(row => ({
    id: row.id, name: row.name.slice(0, 60), stationUrl: stationUrl(row.stationUrl),
    imageUrl: profileImageUrl(row.imageUrl), description: String(row.description || '').slice(0, 320)
  })) };
}
async function load(fresh = false) {
  if (pending) return pending;
  if (!fresh && data && Date.now() - fetchedAt < 45000) return data;
  pending = (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('/api/streamer-profiles', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('방송국 목록을 불러오지 못했습니다.');
      data = normalizePublic(await response.json()); fetchedAt = Date.now(); errorMessage = '';
      return data;
    } finally { clearTimeout(timer); }
  })();
  try { return await pending; }
  catch (error) { errorMessage = error.name === 'AbortError' ? '방송국 목록 확인이 지연되고 있습니다.' : error.message; throw error; }
  finally { pending = null; }
}
function paintEntrances() {
  const rows = profiles();
  document.querySelectorAll('[data-streamer-lounge-host]').forEach(host => {
    host.hidden = !rows.length;
    if (!rows.length) { host.innerHTML = ''; delete host.dataset.profileKey; return; }
    const key = JSON.stringify(rows.map(row => [row.id, row.name, row.imageUrl]));
    if (host.dataset.profileKey === key) return;
    host.dataset.profileKey = key;
    host.innerHTML = `<button class="sl36-entrance" type="button" aria-haspopup="dialog" aria-label="스트리머 라운지, ${rows.length}명 프로필과 방송국 보기" data-streamer-lounge-open>
      <span class="sl36-dock-spine" aria-hidden="true">LOUNGE</span><span class="sl36-entrance-content"><span class="sl36-entrance-heading"><small>SOOPKETMON COMMUNITY</small><span aria-hidden="true">${arrow}</span></span>
      <strong>스트리머 라운지</strong><span class="sl36-entrance-bottom"><span class="sl36-face-stack" aria-hidden="true">${rows.slice(0, 3).map(row => avatar(row)).join('')}</span><span>${rows.length}명의 스트리머</span><b>입장하기</b></span>
      </span>
    </button>`;
    host.querySelector('button').addEventListener('click', event => openLounge(event.currentTarget));
    bindImages(host);
  });
}
async function mount() {
  paintEntrances();
  if (!document.querySelector('[data-streamer-lounge-host]')) return;
  const before = JSON.stringify(data);
  try { await load(); paintEntrances(); if (dialog?.open && JSON.stringify(data) !== before) paintDialog(); } catch { /* A station outage must never hold the lobby loader. */ }
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = document.createElement('dialog'); dialog.className = 'sl36-dialog'; dialog.id = 'streamerLoungeV2036';
  dialog.setAttribute('aria-labelledby', 'sl36Title');
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLounge(); } }, true);
  dialog.addEventListener('click', event => { if (event.target === dialog) closeLounge(); });
  dialog.addEventListener('close', () => { selectedId = ''; query = ''; if (opener?.isConnected) opener.focus(); });
  document.body.append(dialog);
  return dialog;
}
function stationLink(row, label = '방송국 바로가기') {
  return `<a class="sl36-station-link" href="${esc(stationUrl(row.stationUrl))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(row.name)} ${label} (새 탭)"><span>${label}</span>${arrow}</a>`;
}
function card(row, index) {
  return `<article class="sl36-card sl36-tone-${index % 5}"><span class="sl36-card-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="sl36-card-signature" aria-hidden="true">${esc(row.name)}</span>
    <button type="button" class="sl36-card-profile" data-streamer-details="${esc(row.id)}" aria-label="${esc(row.name)} 프로필 보기">${avatar(row)}<span class="sl36-card-copy"><small>SOOP STREAMER</small><strong>${esc(row.name)}</strong><span>프로필 보기 <i aria-hidden="true">＋</i></span></span></button>
    ${stationLink(row)}
  </article>`;
}
function paintGrid() {
  const grid = dialog?.querySelector('[data-sl36-grid]'); if (!grid) return;
  const rows = profiles().filter(row => row.name.toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko')));
  grid.innerHTML = rows.length ? rows.map(row => card(row, profiles().indexOf(row))).join('') : `<div class="sl36-empty">${profiles().length ? '검색된 스트리머가 없습니다.' : '현재 공개된 스트리머가 없습니다.'}</div>`;
  grid.querySelectorAll('[data-streamer-details]').forEach(button => button.addEventListener('click', () => {
    selectedId = button.dataset.streamerDetails; paintDialog(); dialog.querySelector('[data-sl36-list]')?.focus();
  }));
  bindImages(grid);
}
function paintDialog() {
  if (!dialog) return;
  const rows = profiles(), selected = rows.find(row => row.id === selectedId);
  dialog.innerHTML = `<section class="sl36-space"><header class="sl36-topbar"><button type="button" class="sl36-back" data-sl36-close aria-label="라운지를 닫고 로비로 돌아가기">← <span>로비로</span></button><span>SOOPKETMON <i>/</i> COMMUNITY</span><b>STREAMER LOUNGE</b></header>
    <div class="sl36-content"><header class="sl36-hero"><div class="sl36-hero-copy"><p>OUR GAME. OUR PEOPLE.</p><h1 id="sl36Title">스트리머 라운지</h1><strong class="sl36-hero-statement" aria-hidden="true">PLAY TOGETHER.<br><em>STAY CONNECTED.</em></strong><span>같은 전장에서, 새로운 이야기로.<br>숲켓몬과 함께하는 스트리머를 만나보세요.</span></div><span class="sl36-hero-caption" aria-hidden="true">THE LOUNGE <i>01 / SOOPKETMON</i></span></header>
    ${errorMessage ? `<div class="sl36-notice" role="status">${esc(errorMessage)} <button type="button" data-sl36-retry>다시 확인</button></div>` : ''}
    ${selected ? `<div class="sl36-detail"><button type="button" class="sl36-back" data-sl36-list>← 전체 스트리머</button><div class="sl36-detail-inner">${avatar(selected)}<div><small>SOOP STREAMER</small><h2>${esc(selected.name)}</h2><p>${esc(selected.description || '숲켓몬과 함께하는 스트리머입니다. 방송국에서 더 많은 이야기를 만나보세요.')}</p>${stationLink(selected)}<span class="sl36-new-tab-note">새 탭으로 열립니다. 게임은 그대로 유지됩니다.</span></div></div></div>` : `<div class="sl36-list-head"><div><small>MEET OUR PEOPLE</small><h2>함께하는 스트리머 <span>${String(rows.length).padStart(2, '0')}</span></h2></div><label class="sl36-search"><span>이름 검색</span><input type="search" aria-label="스트리머 이름 검색" placeholder="이름 검색" maxlength="30" value="${esc(query)}"></label></div><div class="sl36-grid" data-sl36-grid>${!data && !errorMessage ? '<div class="sl36-empty" role="status">방송국을 연결하고 있습니다.</div>' : ''}</div>`}
    <footer class="sl36-footer"><span>PLAY TOGETHER. STAY CONNECTED.</span><span>방송국은 새 탭으로 열립니다 ${arrow}</span></footer></div></section>`;
  dialog.querySelector('[data-sl36-close]').addEventListener('click', closeLounge);
  dialog.querySelector('[data-sl36-retry]')?.addEventListener('click', () => { void refreshDialog(); });
  dialog.querySelector('[data-sl36-list]')?.addEventListener('click', () => { const id = selectedId; selectedId = ''; paintDialog(); dialog.querySelector(`[data-streamer-details="${id}"]`)?.focus(); });
  dialog.querySelector('input[type="search"]')?.addEventListener('input', event => { query = event.target.value; paintGrid(); });
  if (!selected && data) paintGrid();
  bindImages(dialog);
}
async function refreshDialog() {
  const before = JSON.stringify(data), previousError = errorMessage;
  try { await load(true); paintEntrances(); } catch { /* Show a retry without closing the game. */ }
  if (dialog?.open && (JSON.stringify(data) !== before || errorMessage !== previousError)) paintDialog();
}
function openLounge(source) {
  opener = source || document.activeElement; selectedId = ''; query = '';
  ensureDialog(); paintDialog();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-sl36-close]').focus();
  void refreshDialog();
}
function closeLounge() { if (dialog?.open) dialog.close(); }

window.StreamerLounge = Object.freeze({ mount, open: openLounge, close: closeLounge });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void mount(); }, { once: true });
else void mount();
// Read once per visible lobby minute; never poll during a battle or in a hidden tab.
setInterval(() => { if (!document.hidden && (document.querySelector('[data-streamer-lounge-host]') || dialog?.open)) { void mount(); } }, 60000);
