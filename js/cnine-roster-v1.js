// Members and department order follow the user's roster through 2026-10-29.
// This public directory does not infer broadcast status or change lounge CMS data.
export const CNINE_GROUPS = Object.freeze([
  Object.freeze({ id: 'female', name: '여캠부', label: 'FEMALE CAM', members: Object.freeze([
    Object.freeze({ id: 'jkmjkm1236', name: '하이희야♡' }),
    Object.freeze({ id: 'kaja0011', name: '여을' }),
    Object.freeze({ id: 'chocho12', name: '초초' }),
    Object.freeze({ id: 'yjk011599', name: '나무늘봉순' }),
    Object.freeze({ id: 'lcy011027', name: 'BJ채리' }),
    Object.freeze({ id: 'wkao85guo', name: '꾸까' }),
    Object.freeze({ id: 'luaa0803', name: '히나_♥' }),
    Object.freeze({ id: 'ddaggida3', name: '주성' })
  ]) }),
  Object.freeze({ id: 'star', name: '스타부', label: 'STARCRAFT', members: Object.freeze([
    Object.freeze({ id: 'mew030709', name: '남수댕' }),
    Object.freeze({ id: 'zalalz', name: '조은' }),
    Object.freeze({ id: 'qpqpro', name: '디임' }),
    Object.freeze({ id: 'bts150', name: '방태수' }),
    Object.freeze({ id: 'rlaxordyd', name: '김택용' }),
    Object.freeze({ id: 'rudals5467', name: '이경민' }),
    Object.freeze({ id: 'hiyoko040', name: '히요코' })
  ]) })
]);

const logo = '/preview/mercenary-jokro-iaido-20261017-v1/references/user-c9.png';
const profileUrl = (id, small = false) => `https://stimg.sooplive.com/LOGO/${id.slice(0, 2)}/${id}/${small ? 'm/' : ''}${id}.webp`;
let dialog, opener;

export function mountCnineLobby() {
  document.querySelectorAll('soop-adventure-lobby').forEach(lobby => {
    if (lobby.querySelector('[data-cnine-lobby-open]')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.slot = 'cnine-roster'; button.className = 'c9-lobby-entry';
    button.dataset.cnineLobbyOpen = '';
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-label', '씨나인 현황판 열기');
    button.innerHTML = `<img src="${logo}" alt="" width="30" height="30"><span>씨나인 현황판</span><b aria-hidden="true">↗</b>`;
    button.addEventListener('click', event => openCnineRoster(event.currentTarget));
    lobby.append(button);
  });
}

function memberMarkup(member, index) {
  return `<a class="c9-member" href="https://www.sooplive.com/station/${member.id}" target="_blank" rel="noopener noreferrer" aria-label="${member.name} SOOP 방송국 바로가기 (새 탭)" data-cnine-member="${member.id}">
    <span class="c9-member-number" aria-hidden="true">MEMBER ${String(index + 1).padStart(2, '0')}</span>
    <span class="c9-member-portrait"><span class="c9-member-initial" aria-hidden="true">${Array.from(member.name)[0]}</span><img src="${profileUrl(member.id)}" data-fallback="${profileUrl(member.id, true)}" alt="${member.name} 프로필" width="120" height="120" decoding="async" referrerpolicy="no-referrer"></span>
    <h3>${member.name}</h3><span class="c9-member-handle">@${member.id}</span>
    <span class="c9-member-link c9-roster-action" aria-hidden="true">방송국 <span class="c9-member-link-more">바로가기</span><span>↗</span></span>
  </a>`;
}

function bindPortraits(root) {
  root.querySelectorAll('.c9-member-portrait img').forEach(img => {
    const fit = () => {
      if (!img.naturalWidth) return;
      const density = Math.max(1, window.devicePixelRatio || 1);
      img.style.setProperty('--c9-native-size', `${Math.floor(Math.min(img.naturalWidth, img.naturalHeight) / density)}px`);
      img.parentElement.classList.add('is-loaded');
    };
    img.addEventListener('load', fit);
    img.addEventListener('error', () => {
      img.parentElement.classList.remove('is-loaded');
      if (img.getAttribute('src') !== img.dataset.fallback) img.src = img.dataset.fallback;
      else img.hidden = true;
    });
    if (img.complete) fit();
  });
}

function showDepartment(id, focus = true) {
  const view = CNINE_GROUPS.some(group => group.id === id) ? id : 'home';
  dialog.dataset.cnineView = view;
  dialog.querySelectorAll('[data-cnine-page]').forEach(page => { page.hidden = page.dataset.cninePage !== view; });
  dialog.querySelectorAll('.c9-roster-nav [data-cnine-view]').forEach(button => {
    if (button.dataset.cnineView === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  dialog.scrollTop = 0;
  if (focus) dialog.querySelector(`[data-cnine-page="${view}"] h2`)?.focus({ preventScroll: true });
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'c9-roster-dialog';
  dialog.id = 'cnineRosterV1';
  dialog.setAttribute('aria-labelledby', 'cnineRosterTitle');
  dialog.innerHTML = `<div class="c9-roster-scene">
    <header class="c9-roster-topbar"><button type="button" class="c9-roster-back" data-cnine-roster-close>← <span>로비로</span></button><span>CNINE · MEMBERS</span></header>
    <div class="c9-roster-heading"><img src="${logo}" alt="씨나인 로고" width="84" height="84" decoding="async"><div><p>OUR PEOPLE, OUR UNIVERSE</p><h1 id="cnineRosterTitle">씨나인 현황판</h1><span>함께 빛나는 씨나인의 멤버들</span></div></div>
    <nav class="c9-roster-nav" aria-label="현황판 부서 이동">
      <button type="button" data-cnine-view="home" aria-controls="cnine-page-home" aria-current="page">부서 선택</button>
      ${CNINE_GROUPS.map(group => `<button type="button" data-cnine-view="${group.id}" aria-controls="cnine-page-${group.id}">${group.name}<span>${group.members.length}</span></button>`).join('')}
    </nav>
    <section class="c9-roster-home" id="cnine-page-home" data-cnine-page="home" aria-labelledby="cnine-home-title">
      <h2 id="cnine-home-title" tabindex="-1">만나고 싶은 부서를 선택하세요</h2>
      <div class="c9-department-entrances">${CNINE_GROUPS.map(group => `<button type="button" class="c9-department-entry c9-department-${group.id}" data-cnine-view="${group.id}" aria-controls="cnine-page-${group.id}" aria-label="${group.name} ${group.members.length}명 · 페이지 입장">
        <span class="c9-entry-label">${group.label}</span><strong>${group.name}</strong>
        <span class="c9-entry-portraits" aria-hidden="true">${group.members.slice(0, 3).map(member => `<span class="c9-member-portrait"><span class="c9-member-initial">${Array.from(member.name)[0]}</span><img src="${profileUrl(member.id)}" data-fallback="${profileUrl(member.id, true)}" alt="" width="64" height="64" decoding="async" referrerpolicy="no-referrer"></span>`).join('')}</span>
        <span class="c9-entry-count">${group.members.length}명의 멤버</span><span class="c9-roster-action">${group.name} 입장 <span aria-hidden="true">↗</span></span>
      </button>`).join('')}</div>
    </section>
    <div class="c9-roster-groups">${CNINE_GROUPS.map(group => `<section class="c9-department c9-department-${group.id}" id="cnine-page-${group.id}" data-cnine-page="${group.id}" aria-labelledby="cnine-${group.id}-title" hidden>
      <header class="c9-department-heading"><span aria-hidden="true">${group.id === 'female' ? '01' : '02'}</span><h2 id="cnine-${group.id}-title" tabindex="-1">${group.name}</h2><small>${group.label}</small><b>${group.members.length} MEMBERS</b></header>
      <div class="c9-department-members">${group.members.map(memberMarkup).join('')}</div>
    </section>`).join('')}</div>
    <footer class="c9-roster-footer"><span>CNINE <i>✦</i> TOGETHER WE SHINE</span><p>멤버 카드를 누르면 SOOP 방송국이 새 탭으로 열립니다.</p></footer>
  </div>`;
  dialog.querySelector('[data-cnine-roster-close]').addEventListener('click', closeCnineRoster);
  dialog.querySelectorAll('[data-cnine-view]').forEach(button => button.addEventListener('click', () => showDepartment(button.dataset.cnineView)));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeCnineRoster(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeCnineRoster(); });
  dialog.addEventListener('close', () => {
    const target = document.querySelector('soop-adventure-lobby[data-view="home"] [data-cnine-lobby-open]') || (opener?.isConnected ? opener : null);
    target?.focus({ preventScroll: true });
  });
  document.body.append(dialog);
  bindPortraits(dialog);
  return dialog;
}

export async function openCnineRoster(source) {
  // The user's final destination is the lobby, including programmatic opening.
  window.StreamerLounge?.close();
  document.querySelectorAll('soop-adventure-lobby').forEach(lobby => {
    if (lobby.shadowRoot?.querySelector('#menu-dialog[open]')) lobby.shadowRoot.querySelector('#close-menu')?.click();
  });
  const lobby = document.querySelector('soop-adventure-lobby');
  if (lobby?.dataset.route && lobby.dataset.route !== 'home') await window.SoopketmonV21ExactShell?.navigate('home');
  opener = source || document.activeElement;
  ensureDialog();
  showDepartment('home', false);
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('[data-cnine-roster-close]').focus({ preventScroll: true });
}

export function closeCnineRoster() { if (dialog?.open) dialog.close(); }
