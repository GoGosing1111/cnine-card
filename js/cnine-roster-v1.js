// The six members and departments are the user's 2026-10-26 roster.
// This public directory does not infer broadcast status or change lounge CMS data.
export const CNINE_GROUPS = Object.freeze([
  Object.freeze({ id: 'female', name: '여캠부', label: 'FEMALE CAM', members: Object.freeze([
    Object.freeze({ id: 'kaja0011', name: '여을' }),
    Object.freeze({ id: 'chocho12', name: '초초' }),
    Object.freeze({ id: 'yjk011599', name: '나무늘봉순' })
  ]) }),
  Object.freeze({ id: 'star', name: '스타부', label: 'STARCRAFT', members: Object.freeze([
    Object.freeze({ id: 'mew030709', name: '남수댕' }),
    Object.freeze({ id: 'zalalz', name: '조은' }),
    Object.freeze({ id: 'qpqpro', name: '디임' })
  ]) })
]);

const logo = '/preview/mercenary-jokro-iaido-20261017-v1/references/user-c9.png';
const profileUrl = (id, small = false) => `https://stimg.sooplive.com/LOGO/${id.slice(0, 2)}/${id}/${small ? 'm/' : ''}${id}.webp`;
let dialog, opener;

export function cnineEntranceMarkup() {
  return `<div class="c9-roster-entry">
    <img src="${logo}" alt="" width="64" height="64" decoding="async">
    <div class="c9-roster-entry-copy"><small>CNINE MEMBERS</small><strong>씨나인 현황판</strong><span>여캠부 · 스타부, 함께하는 6명</span></div>
    <button type="button" class="c9-roster-action" data-cnine-roster-open aria-haspopup="dialog">현황판 입장 <span aria-hidden="true">→</span></button>
  </div>`;
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

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'c9-roster-dialog';
  dialog.id = 'cnineRosterV1';
  dialog.setAttribute('aria-labelledby', 'cnineRosterTitle');
  dialog.innerHTML = `<div class="c9-roster-scene">
    <header class="c9-roster-topbar"><button type="button" class="c9-roster-back" data-cnine-roster-close>← <span>스트리머 라운지</span></button><span>CNINE · MEMBERS</span></header>
    <div class="c9-roster-heading"><img src="${logo}" alt="씨나인 로고" width="84" height="84" decoding="async"><div><p>OUR PEOPLE, OUR UNIVERSE</p><h1 id="cnineRosterTitle">씨나인 현황판</h1><span>함께 빛나는 씨나인의 멤버들</span></div></div>
    <div class="c9-roster-groups">${CNINE_GROUPS.map(group => `<section class="c9-department c9-department-${group.id}" aria-labelledby="cnine-${group.id}-title">
      <header class="c9-department-heading"><span aria-hidden="true">${group.id === 'female' ? '01' : '02'}</span><h2 id="cnine-${group.id}-title">${group.name}</h2><small>${group.label}</small><b>3 MEMBERS</b></header>
      <div class="c9-department-members">${group.members.map(memberMarkup).join('')}</div>
    </section>`).join('')}</div>
    <footer class="c9-roster-footer"><span>CNINE <i>✦</i> TOGETHER WE SHINE</span><p>멤버 카드를 누르면 SOOP 방송국이 새 탭으로 열립니다.</p></footer>
  </div>`;
  dialog.querySelector('[data-cnine-roster-close]').addEventListener('click', closeCnineRoster);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeCnineRoster(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeCnineRoster(); });
  dialog.addEventListener('close', () => {
    const target = opener?.isConnected ? opener : document.querySelector('.sl36-dialog[open] [data-cnine-roster-open]');
    target?.focus({ preventScroll: true });
  });
  document.body.append(dialog);
  bindPortraits(dialog);
  return dialog;
}

export function openCnineRoster(source) {
  opener = source || document.activeElement;
  ensureDialog();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('[data-cnine-roster-close]').focus({ preventScroll: true });
}

export function closeCnineRoster() { if (dialog?.open) dialog.close(); }
