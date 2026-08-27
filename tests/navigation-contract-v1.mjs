import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [exactSource, routerSource] = await Promise.all([
  readFile(new URL('js/soopketmon-v21-exact-shell-adapter.js', root), 'utf8'),
  readFile(new URL('js/soopketmon-v21-runtime-router.js', root), 'utf8')
]);

const document = {
  currentScript: null,
  readyState: 'loading',
  documentElement: { dataset: {} },
  body: null,
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const context = {
  console,
  document,
  location: { search: '' },
  URLSearchParams,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(exactSource, context, { filename: 'soopketmon-v21-exact-shell-adapter.js' });
vm.runInContext(routerSource, context, { filename: 'soopketmon-v21-runtime-router.js' });

const navigation = context.SoopketmonV21NavigationContract;
const router = context.SoopketmonV21RuntimeRouter;
assert.ok(navigation, 'shared navigation contract must be exported');
assert.strictEqual(router.navigationContract, navigation, 'runtime router must consume the exact shell contract');

assert.deepEqual(Array.from(navigation.menuGroupOrder), [
  'store',
  'collection',
  'pve',
  'pvp',
  'equipment',
  'crafting',
  'rewards',
  'market'
]);
assert.deepEqual(
  Array.from(navigation.menuGroupOrder, id => navigation.groups[id].title),
  ['카드·상점', '도감·강화', 'PVE 전투', 'PVP·경쟁', '장비·칭호·차고', '제작·합성', '보상', '승부·경매']
);

assert.equal(navigation.routes.deck.title, 'PVE 덱 편성실');
assert.equal(navigation.routes.scrapyard.group, 'pve', 'scrapyard is presented as PVE');
assert.ok(Array.from(navigation.groups.pve.routes).includes('scrapyard'));
assert.ok(!Array.from(navigation.groups.crafting.routes).includes('scrapyard'));
assert.equal(navigation.routes.rank.group, 'pvp', 'season rank is presented inside PVP');
assert.ok(Array.from(navigation.groups.pvp.routes).includes('rank'));
assert.ok(!Array.from(navigation.groups.market.routes).includes('rank'));

assert.equal(router.routeContract.scrapyard.shell, 'workshop', 'scrapyard backend route must remain unchanged');
assert.equal(router.routeContract.rank.shell, 'rank', 'rank deep link must remain unchanged');
assert.equal(router.routeMeta('scrapyard'), navigation.routes.scrapyard);
assert.equal(router.routeMeta('rank'), navigation.routes.rank);
assert.strictEqual(
  router.subtabContract.battle['PVE 덱 편성실'],
  router.subtabContract.battle['덱 편성실'],
  'legacy deck editor label remains a compatible alias'
);

for (const functionName of ['pcCommand', 'mobileCommand']) {
  const start = exactSource.indexOf(`function ${functionName}(`);
  const end = exactSource.indexOf('\n  }', start);
  const body = exactSource.slice(start, end);
  assert.match(body, /commandDescriptor\(route, title, meta, group\)/, `${functionName} must resolve the shared label descriptor`);
}
assert.match(exactSource, /MENU_GROUP_ORDER\.map\(id => MENU_GROUPS\[id\]\)/, 'all-menu order must come from the shared contract');

console.log('navigation contract v1: PASS');
