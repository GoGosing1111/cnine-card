const pieces = [
  { key: 'armor', name: '갑옷', en: 'ARMOR' },
  { key: 'pants', name: '바지', en: 'ARMORED PANTS' },
  { key: 'boots', name: '신발', en: 'ARMORED BOOTS' },
  { key: 'dual-disk', name: '듀얼디스크', en: 'DUAL DISK' }
];
const archive = document.body.dataset.mode === 'archive';
const oldPath = '../mythic-sf-equipment-v1/assets/';
const current = pieces.map(item => ({ ...item, path: 'assets/mythic-' + item.key + '-fantasy-v5.png', version: 'CONCEPT 05', detail: '황금 세공 · 청록빛 보석' }));
const groups = [
  { title: '백금 · 청색 코어', sub: 'CONCEPT 02 / 4 ORIGINALS', items: pieces.map(item => ({ ...item, detail: '백금 장갑 · 금색 프레임 · 청색 광원', path: oldPath + 'mythic-sf-' + item.key + '-v2.png', version: 'CONCEPT 02' })) },
  { title: '백금 · 연두색 섬광', sub: 'CONCEPT 03 / 4 ORIGINALS', items: pieces.map(item => ({ ...item, detail: '기존 형태를 유지한 연두색 변형', path: oldPath + 'mythic-sf-' + item.key + '-v3-green.png', version: 'CONCEPT 03' })) },
  { title: '청록 SF 갑옷', sub: 'CONCEPT 04 / 1 ORIGINAL', items: [{ ...pieces[0], detail: '세로형 코어 · 짙은 금속 장갑', path: oldPath + 'mythic-sf-armor-v4-emerald.png', version: 'CONCEPT 04' }] },
  { title: '최초 갑옷 초안', sub: 'CONCEPT 01 / 1 ORIGINAL', items: [{ ...pieces[0], detail: '프레임 적용 전의 초기 디자인', path: oldPath + 'rejected/armor-v1-too-plain.png', version: 'CONCEPT 01' }] }
];
const gallery = document.getElementById('gallery');
const dialog = document.getElementById('detail');
const items = archive ? groups.flatMap(group => group.items) : current;
let nextIndex = 0;
function card(item, index) {
  return `<article><div class="item-head"><span>${item.en}</span><span class="mythic">${archive ? 'ARCHIVE' : 'MYTHIC'}</span></div><button class="art" type="button" data-item="${index}" aria-label="${item.version} ${item.name} 확대"><img src="${item.path}" alt="${item.version} ${item.name}" ${archive ? 'loading="lazy"' : 'fetchpriority="high"'}><span class="expand" aria-hidden="true">↗</span></button><div class="item-copy"><h2>${item.name}</h2><p>${item.detail}</p><a href="${item.path}" download>PNG 다운로드 ↓</a></div></article>`;
}
gallery.innerHTML = archive
  ? groups.map(group => `<section class="archive-group"><div class="group-title"><h2>${group.title}</h2><span>${group.sub}</span></div><div class="gallery">${group.items.map(item => card(item, nextIndex++)).join('')}</div></section>`).join('')
  : current.map(card).join('');
gallery.addEventListener('click', event => {
  const button = event.target.closest('[data-item]');
  if (!button) return;
  const item = items[Number(button.dataset.item)];
  document.getElementById('detailTitle').textContent = item.name + ' · ' + item.version;
  const img = document.getElementById('detailImage');
  img.src = item.path;
  img.alt = item.version + ' ' + item.name;
  document.getElementById('original').href = img.src;
  dialog.showModal();
});
document.getElementById('close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
});
