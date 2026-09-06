import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const shell = read('js/soopketmon-v21-exact-shell-adapter.js');

// Exercise the public shell enhancer: every home/native route rebuilds this HUD.
function loadHud(initialUser) {
  let user = initialUser;
  const header = { innerHTML: '' };
  const classList = { add() {}, remove() {} };
  const page = {
    classList, dataset: {}, setAttribute() {},
    querySelectorAll: () => [],
    querySelector: selector => selector === ':scope > .header' ? header : {},
  };
  const context = vm.createContext({
    document: {
      readyState: 'loading', currentScript: null,
      documentElement: { removeAttribute() {} }, body: { classList },
      addEventListener() {}, querySelector: () => page,
      createTreeWalker: () => ({ nextNode: () => false }),
    },
    NodeFilter: { SHOW_COMMENT: 128 },
    location: { search: '' }, URLSearchParams,
    loadUser: () => user,
  });
  context.window = context;
  vm.runInContext(shell, context);
  return {
    render(nextUser = user) {
      user = nextUser;
      context.SoopketmonV21ExactShell.enhance();
      return header.innerHTML;
    },
    version: context.SoopketmonV21ExactShell.version,
  };
}

test('main HUD shows Master Stars rather than magic crystals, preserving coin/shards', () => {
  const html = loadHud({ nickname: '테스트', coin: 15340051779, cardShards: 2000000, magicCrystals: 95295, masterStars: 12345 }).render();
  assert.equal((html.match(/class="resource-chip /g) || []).length, 3);
  assert.match(html, /aria-label="코인 15,340,051,779"/);
  assert.match(html, /aria-label="카드 조각 2,000,000"/);
  assert.match(html, /class="resource-chip master-star ui-press"/);
  assert.match(html, /aria-label="마스터의 별 12,345"/);
  assert.match(html, /title="마스터의 별 12,345"/);
  assert.match(html, /<i aria-hidden="true">★<\/i>/);
  assert.match(html, /class="resource-full">마스터의 별<\/span>/);
  assert.match(html, /class="resource-full">12,345<\/span>/);
  assert.match(html, /class="resource-short">12\.3K<\/span>/);
  assert.doesNotMatch(html, /마법|결정|95,295|resource-chip crystal/);
});

test('zero, missing and invalid Master Star balances never fall back to magic crystals', () => {
  for (const masterStars of [0, undefined, null, '', 'invalid', -1]) {
    const html = loadHud({ masterStars, magicCrystals: 95295 }).render();
    assert.match(html, /aria-label="마스터의 별 0"/);
    assert.doesNotMatch(html, /95,295|NaN/);
  }
  assert.match(loadHud(null).render(), /aria-label="마스터의 별 0"/);
});

test('HUD rereads updated balances after rewards/spending without changing stored currencies', () => {
  const user = Object.freeze({ coin: 100, cardShards: 200, masterStars: '15000', magicCrystals: 95295 });
  const hud = loadHud(user);
  assert.match(hud.render(), /aria-label="마스터의 별 15,000"/);
  assert.match(hud.render({ ...user, masterStars: 20000 }), /aria-label="마스터의 별 20,000"/);
  assert.match(hud.render({ ...user, masterStars: 0 }), /aria-label="마스터의 별 0"/);
  assert.equal(user.masterStars, '15000');
  assert.equal(user.magicCrystals, 95295);
});

test('header script and injected icon stylesheet are cache-busted together', () => {
  const version = loadHud(null).version;
  assert.equal(version, '21.25.0-player-card');
  assert.ok(read('index.html').includes(`js/soopketmon-v21-exact-shell-adapter.js?v=${version}`));
  assert.ok(shell.includes('link.href = `${cssHref(filename)}?v=${VERSION}`;'));
  const css = read('css/soopketmon-v21-exact-base.css');
  assert.match(css, /\.resource-chip\.master-star i\s*\{[^}]*color:#fff1ae/);
  assert.match(css, /\.resource-chip\.master-star small, \.resource-chip\.master-star b\s*\{\s*white-space:nowrap/);
  assert.match(css, /\.resource-chip \.resource-full\s*\{ display: none; \}/);
  assert.match(css, /\.resource-chip \.resource-full\s*\{ display: inline; \}/);
});

test('narrow mobile HUD fits long Star amounts without squeezing the icon or mail control', () => {
  const css = read('css/soopketmon-v21-exact-luxury.css');
  assert.match(css, /\.resource-chip\.master-star\s*\{\s*width:max-content; min-width:60px;/);
  assert.match(css, /\.top-hud:has\(\.resource-chip\.master-star\)\s*\{\s*grid-template-columns:minmax\(0,1fr\) auto 44px;/);
});
