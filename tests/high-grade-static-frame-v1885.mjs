import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [cardCss, zenithCss, superstarCss, index, worker] = await Promise.all([
  readFile(new URL('css/card.css', root), 'utf8'),
  readFile(new URL('css/zenith-v1.css', root), 'utf8'),
  readFile(new URL('css/superstar-v1.css', root), 'utf8'),
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('service-worker.js', root), 'utf8')
]);

assert.doesNotMatch(cardCss, /ssrBorder|hue-rotate\(360deg\)/, 'SSR~LIMITED 카드에 무지개 색상 회전이 남아 있습니다.');
assert.doesNotMatch(cardCss, /prestigeAstralFrame|hue-rotate\(12deg\)/, 'PRESTIGE 카드에 색상 회전이 남아 있습니다.');
for (const grade of ['SSR', 'MA', 'FUR', 'LIMITED']) {
  const rule = cardCss.match(new RegExp(`\\.grade-${grade}\\{[^}]*\\}`))?.[0] || '';
  assert.ok(rule, `${grade} 프레임 규칙이 없습니다.`);
  assert.doesNotMatch(rule, /animation\s*:/, `${grade} 프레임에 회전 애니메이션이 남아 있습니다.`);
}
assert.match(cardCss, /animation:prestigeAstralBreathe 5\.2s ease-in-out infinite/, 'PRESTIGE 고정 팔레트의 밝기 호흡은 유지해야 합니다.');
assert.match(zenithCss, /animation:none!important/, 'ZENITH 프레임은 색상 회전이 없어야 합니다.');
assert.match(superstarCss, /animation:\s*none\s*!important/, 'SUPERSTAR 프레임은 색상 회전이 없어야 합니다.');
assert.match(index, /css\/card\.css\?v=1885-static-high-grade-frame/, '카드 CSS 캐시 키가 갱신되지 않았습니다.');
assert.match(worker, /soop-card-shell-v1940-superstar-advancement/, '서비스 워커 캐시 키가 갱신되지 않았습니다.');

console.log('SSR+ high-grade rainbow rotation removed; static grade palettes preserved');
