import { mountLichRaid } from './live.mjs?v=20261001-party-sync';

const VERSION = '20261001-party-sync';
let styles, battle;
function loadAsset(tag, url) {
  return new Promise((resolve, reject) => {
    const node = document.createElement(tag);
    if (tag === 'link') { node.rel = 'stylesheet'; node.href = url; }
    else node.src = url;
    node.onload = resolve;
    node.onerror = () => { node.remove(); reject(new Error('리치왕 리소스를 불러오지 못했습니다.')); };
    document.head.appendChild(node);
  });
}
function loadBattle() {
  return battle ||= loadAsset('script', '/preview/lich-king-raid-v1/battle.bundle.js?v=' + VERSION)
    .catch(error => { battle = null; throw error; });
}

export async function mountInlineRaid(root, { current }) {
  styles ||= loadAsset('link', '/raid/lich-king/inline.css?v=' + VERSION)
    .catch(error => { styles = null; throw error; });
  const [response] = await Promise.all([fetch('/raid/lich-king/?v=' + VERSION), styles]);
  if (!response.ok) throw new Error('리치왕 입장 화면을 불러오지 못했습니다.');
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  if (!current()) return null;
  // Reuse the live entry markup without executing its standalone scripts or styles.
  // Namespace IDs so dialogs and the battle mount cannot collide with the game.
  page.body.querySelectorAll('[id]').forEach(node => {
    node.dataset.lichId = node.id;
    node.id = 'lich-' + node.id;
  });
  page.body.querySelector('.brand')?.remove();
  page.body.querySelectorAll('a[href="/"]').forEach(node => node.remove());
  root.replaceChildren(...page.body.children);
  return mountLichRaid(root, { loadBattle });
}
