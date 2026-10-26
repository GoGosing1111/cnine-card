import { stationUrl, profileImageUrl } from './streamer-lounge-model-v2036.js?v=2036';
import { portraitSourceUrl, portraitSize } from './streamer-lounge-portraits-v1.js?v=20261013-original';
import { closeCnineRoster, mountCnineLobby } from './cnine-roster-v1.js?v=20261026-v6-heeya-first';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
const art = '/assets/ui/streamer-lounge/premium-v1/';
const sans = "Pretendard, Noto Sans KR, sans-serif";
let data = null, fetchedAt = 0, pending = null, dialog = null, query = '', opener = null, errorMessage = '';

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
    host.innerHTML = `<button class="sl36-entrance" type="button" aria-haspopup="dialog" aria-label="스트리머 라운지, ${rows.length}명 스트리머 방송국 바로가기" data-streamer-lounge-open>
      <span class="sl36-dock-spine" aria-hidden="true">LOUNGE</span><span class="sl36-entrance-content"><span class="sl36-entrance-heading"><small>REVERSE CALL · THE LOUNGE</small><span aria-hidden="true">${arrow}</span></span>
      <strong>스트리머 라운지</strong><span class="sl36-entrance-bottom"><span class="sl36-face-stack" aria-hidden="true">${rows.slice(0, 3).map(row => avatar(row)).join('')}</span><span>${rows.length}명의 스트리머</span><b>입장하기</b></span>
      </span>
    </button>`;
    host.querySelector('button').addEventListener('click', event => openLounge(event.currentTarget));
    bindImages(host);
  });
}
async function mount() {
  mountCnineLobby();
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
  dialog.addEventListener('close', () => { query = ''; if (opener?.isConnected) opener.focus(); });
  document.body.append(dialog);
  // Native SVG coordinates adapt to the existing modal. No CSS is generated.
  let measuredWidth = 0;
  new ResizeObserver(() => {
    const width = dialog.clientWidth;
    if (dialog.open && width > 0 && width !== measuredWidth) {
      measuredWidth = width; paintHero(); paintGrid();
    }
  }).observe(dialog);
  return dialog;
}
function paintHero() {
  const host = dialog?.querySelector('[data-sl40-hero]'); if (!host) return;
  const width = dialog.clientWidth || window.innerWidth;
  const mobile = width < 760, height = mobile ? 304 : 354, left = mobile ? 24 : 46;
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" display="block" aria-labelledby="sl36Title">
    <defs><linearGradient id="sl40HeroShade"><stop stop-color="#080808" stop-opacity=".68"/><stop offset=".66" stop-color="#080808" stop-opacity="0"/></linearGradient></defs>
    <image href="${art}lounge-interior.png" width="${width}" height="${height}" preserveAspectRatio="${mobile ? 'xMinYMid' : 'xMidYMid'} slice"/>
    <rect width="${width}" height="${height}" fill="url(#sl40HeroShade)"/>
    <text x="${left}" y="${mobile ? 42 : 55}" fill="#c3aa85" font-family="Arial, sans-serif" font-size="${mobile ? 8 : 10}" letter-spacing="3">REVERSE CALL COMMUNITY</text>
    <text x="${left-2}" y="${mobile ? 103 : 138}" fill="#f0e9dc" font-family="Georgia, Times New Roman, serif" font-size="${mobile ? 43 : 75}" letter-spacing="-1.5">The Lounge</text>
    <text id="sl36Title" role="heading" aria-level="1" x="${left}" y="${mobile ? 139 : 180}" fill="#eee5d6" font-family="${sans}" font-size="${mobile ? 20 : 26}" font-weight="500" letter-spacing="-1">스트리머 라운지</text>
    <text x="${left}" y="${mobile ? 179 : 221}" fill="#c1b6a4" font-family="${sans}" font-size="${mobile ? 11 : 13}">같은 게임에서 만난, 각자의 이야기.</text>
    <text x="${left}" y="${mobile ? 199 : 245}" fill="#c1b6a4" font-family="${sans}" font-size="${mobile ? 11 : 13}">리버스콜과 함께하는 스트리머를 만나보세요.</text>
    <line x1="${left}" x2="${left+31}" y1="${height-34}" y2="${height-34}" stroke="#b49c77"/>
    <text x="${left+44}" y="${height-31}" fill="#cbbba2" font-family="Arial, sans-serif" font-size="8" letter-spacing="2">OUR GAME. OUR PEOPLE.</text>
  </svg>`;
}
function card(row, index, width, mobile) {
  const pad = mobile ? 14 : 25, photo = Math.min(mobile ? 64 : 96, width * .60), top = mobile ? 26 : 36;
  const logoSize = mobile ? 28 : 38;
  const handleY = top + photo + 24, logoY = handleY + 8;
  const nameY = logoY + logoSize + (mobile ? 22 : 30);
  const lineY = nameY + 24, linkY = lineY + 33, height = linkY + 24;
  const x = (width-photo)/2, handle = stationUrl(row.stationUrl).split('/').pop();
  const nameSize = Math.min(mobile ? 20 : 29, (width-pad*2)/(Array.from(row.name).length*.93));
  const cnine = ['mew030709', 'zalalz', 'yjk011599', 'qpqpro'].includes(row.id);
  const id = `sl40Photo-${row.id}`, href = portraitSourceUrl(row.imageUrl), fallback = profileImageUrl(row.imageUrl);
  return { height, markup: `<g class="sl40-card" role="listitem" data-profile-id="${esc(row.id)}">
    <image href="${art}member-card.png" width="${width}" height="${height}" preserveAspectRatio="none" aria-hidden="true"/>
    <text x="${pad}" y="${mobile ? 16 : 21}" fill="#c1aa85" font-family="Arial,sans-serif" font-size="${mobile ? 6.5 : 8}" letter-spacing="1.6" aria-hidden="true">STREAMER / ${String(index+1).padStart(2,'0')}</text>
    <g class="sl40-identity">
      <defs><clipPath id="${id}"><rect data-sl40-photo-clip x="${x}" y="${top}" width="${photo}" height="${photo}" rx="2"/></clipPath></defs>
      <rect data-sl40-photo-frame x="${x-3}" y="${top-3}" width="${photo+6}" height="${photo+6}" rx="3" fill="#171715" stroke="#aa9574" stroke-opacity=".65" stroke-width=".7"/>
      <text data-sl40-photo-initial x="${width/2}" y="${top+photo/2+8}" text-anchor="middle" fill="#bda988" font-size="26" font-family="${sans}" aria-hidden="true">${esc(Array.from(row.name)[0])}</text>
      ${href ? `<image data-sl40-photo data-fallback="${esc(fallback)}" href="${esc(href)}" x="${x}" y="${top}" width="${photo}" height="${photo}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice" aria-label="${esc(row.name)} 프로필"/>` : ''}
      <text x="${width/2}" y="${handleY}" text-anchor="middle" fill="#b1a99b" font-family="Arial,sans-serif" font-size="${mobile ? 8 : 10}" letter-spacing=".5">@${esc(handle)}</text>
      ${cnine ? `<image data-sl40-cnine-logo href="/preview/mercenary-jokro-iaido-20261017-v1/references/user-c9.png" x="${(width-logoSize)/2}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="씨나인 로고"/>` : ''}
      <text role="heading" aria-level="3" x="${width/2}" y="${nameY}" text-anchor="middle" fill="#f1ebe0" font-family="${sans}" font-size="${nameSize}" font-weight="550" letter-spacing="-.6">${esc(row.name)}</text>
      ${row.description ? `<title>${esc(row.description)}</title>` : ''}
    </g>
    <line x1="${pad}" x2="${width-pad}" y1="${lineY}" y2="${lineY}" stroke="#a58c64" stroke-opacity=".34" stroke-width=".65"/>
    <a class="sl40-station-link" href="${esc(stationUrl(row.stationUrl))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(row.name)} 방송국 바로가기 (새 탭)">
      <rect x="2" y="${lineY+1}" width="${width-4}" height="${height-lineY-3}" rx="2" fill="#e4cda0" fill-opacity="0" data-sl40-link-highlight/>
      <text x="${pad}" y="${linkY}" fill="#dac8ac" font-family="${sans}" font-size="${mobile ? 10 : 12}" font-weight="450">방송국 바로가기</text>
      <path d="m${width-pad-12} ${linkY-1} 10-10m-10 0h10v10" fill="none" stroke="#d8bf94" stroke-width="1.1"/>
    </a>
  </g>` };
}
function bindPortraits(host) {
  host.querySelectorAll('[data-sl40-photo]').forEach(img => {
    const slot = Number(img.getAttribute('width')), left = Number(img.getAttribute('x')), top = Number(img.getAttribute('y'));
    const identity = img.closest('.sl40-identity');
    const fit = () => {
      const source = img.getAttribute('href'), probe = new Image();
      probe.onload = () => {
        if (!img.isConnected || img.getAttribute('href') !== source) return;
        const size = portraitSize(slot, probe.naturalWidth, probe.naturalHeight, window.devicePixelRatio || 1);
        const x = left + (slot-size)/2, y = top + (slot-size)/2;
        const set = (node, attrs) => Object.entries(attrs).forEach(([key,value]) => node.setAttribute(key,String(value)));
        set(img,{x,y,width:size,height:size,'data-fitted':'true'});
        set(identity.querySelector('[data-sl40-photo-clip]'),{x,y,width:size,height:size});
        set(identity.querySelector('[data-sl40-photo-frame]'),{x:x-3,y:y-3,width:size+6,height:size+6});
        identity.querySelector('[data-sl40-photo-initial]').setAttribute('visibility','hidden');
      };
      probe.src = source;
    };
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallback;
      if (fallback && img.getAttribute('href') !== fallback) { img.setAttribute('href',fallback); fit(); }
      else { identity.querySelector('[data-sl40-photo-initial]').removeAttribute('visibility'); img.remove(); }
    });
    fit();
  });
}
function paintGrid() {
  const host = dialog?.querySelector('[data-sl36-grid]'); if (!host) return;
  const needle = query.trim().toLocaleLowerCase('ko'), all = profiles();
  const rows = all.filter(row => row.name.toLocaleLowerCase('ko').includes(needle));
  const count = dialog.querySelector('[data-sl36-count]'); if (count) count.textContent = String(rows.length).padStart(2,'0');
  if (!rows.length) {
    host.innerHTML = `<div class="sl36-empty" role="status">${all.length ? '검색된 스트리머가 없습니다.' : '현재 공개된 스트리머가 없습니다.'}${all.length ? '<p><button class="sl36-back" type="button" data-sl36-clear>전체 스트리머 보기</button></p>' : ''}</div>`;
    host.querySelector('[data-sl36-clear]')?.addEventListener('click', () => { query = ''; const input = dialog.querySelector('input[type="search"]'); input.value = ''; paintGrid(); input.focus(); });
    return;
  }
  const width = host.clientWidth || Math.max(290, (dialog.clientWidth || window.innerWidth)-30);
  const mobile = width < 680, columns = width < 300 ? 1 : mobile ? 2 : 3, gap = mobile ? 12 : 20;
  const cardWidth = (width-gap*(columns-1))/columns;
  const cards = rows.map(row => card(row, all.indexOf(row), cardWidth, mobile)), cardHeight = cards[0].height;
  const height = Math.ceil(cards.length/columns)*(cardHeight+gap)-gap;
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" display="block" role="list" aria-label="스트리머 방송국 목록">${cards.map((item,i) => `<g transform="translate(${(i%columns)*(cardWidth+gap)},${Math.floor(i/columns)*(cardHeight+gap)})">${item.markup}</g>`).join('')}</svg>`;
  bindPortraits(host);
  host.querySelectorAll('.sl40-station-link').forEach(link => {
    const highlight = link.querySelector('[data-sl40-link-highlight]');
    const glow = () => highlight.setAttribute('fill-opacity','.10');
    const clear = () => { if (document.activeElement !== link) highlight.setAttribute('fill-opacity','0'); };
    link.addEventListener('pointerenter',glow); link.addEventListener('pointerleave',clear);
    link.addEventListener('focus',glow); link.addEventListener('blur',clear);
  });
}
function paintDialog() {
  if (!dialog) return;
  const focusedSearch = document.activeElement?.matches('.sl36-search input'), scrollTop = dialog.scrollTop;
  dialog.innerHTML = `<section class="sl36-space"><header class="sl36-topbar"><button type="button" class="sl36-back" data-sl36-close aria-label="라운지를 닫고 로비로 돌아가기">← <span>로비로</span></button><span>REVERSE CALL <i>/</i> THE LOUNGE</span><b>STREAMER LOUNGE</b></header>
    <div data-sl40-hero></div><div class="sl36-content">
    ${errorMessage ? `<div class="sl36-notice" role="status">${esc(errorMessage)} <button type="button" data-sl36-retry>다시 확인</button></div>` : ''}
    <div class="sl36-list-head"><div><small>THE PEOPLE BEHIND THE PLAY</small><h2>함께하는 스트리머 <span data-sl36-count aria-live="polite">${String(profiles().length).padStart(2,'0')}</span></h2></div><label class="sl36-search"><span>이름 검색</span><input type="search" aria-label="스트리머 이름 검색" placeholder="이름 검색" maxlength="30" value="${esc(query)}"></label></div><div data-sl36-grid></div>
    <footer class="sl36-footer"><span>REVERSE CALL · THE LOUNGE</span><span>방송국은 새 탭으로 열립니다 ${arrow}</span></footer></div></section>`;
  dialog.querySelector('[data-sl36-close]').addEventListener('click', closeLounge);
  dialog.querySelector('[data-sl36-retry]')?.addEventListener('click', () => { void refreshDialog(); });
  dialog.querySelector('input[type="search"]').addEventListener('input', event => { query = event.target.value; paintGrid(); });
  paintHero(); paintGrid();
  if (focusedSearch) dialog.querySelector('input[type="search"]').focus({ preventScroll:true });
  dialog.scrollTop = scrollTop;
}

async function refreshDialog() {
  const before = JSON.stringify(data), previousError = errorMessage;
  try { await load(true); paintEntrances(); } catch { /* Show a retry without closing the game. */ }
  if (dialog?.open && (JSON.stringify(data) !== before || errorMessage !== previousError)) paintDialog();
}
function openLounge(source) {
  opener = source || document.activeElement; query = '';
  ensureDialog(); paintDialog();
  if (!dialog.open) dialog.showModal();
  paintHero(); paintGrid(); dialog.scrollTop = 0;
  dialog.querySelector('[data-sl36-close]').focus();
  void refreshDialog();
}
function closeLounge() { closeCnineRoster(); if (dialog?.open) dialog.close(); }

window.StreamerLounge = Object.freeze({ mount, open: openLounge, close: closeLounge });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void mount(); }, { once: true });
else void mount();
// Read once per visible lobby minute; never poll during a battle or in a hidden tab.
setInterval(() => { if (!document.hidden && (document.querySelector('[data-streamer-lounge-host]') || dialog?.open)) { void mount(); } }, 60000);
