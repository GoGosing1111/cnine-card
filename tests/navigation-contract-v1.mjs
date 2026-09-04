import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [exactSource, routerSource, appSource] = await Promise.all([
  readFile(new URL('js/soopketmon-v21-exact-shell-adapter.js', root), 'utf8'),
  readFile(new URL('js/soopketmon-v21-runtime-router.js', root), 'utf8'),
  readFile(new URL('js/app.js', root), 'utf8')
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
  'market',
  'administration'
]);
assert.deepEqual(
  Array.from(navigation.menuGroupOrder, id => navigation.groups[id].title),
  ['카드·상점', '도감·강화', 'PVE 전투', 'PVP·경쟁', '장비·칭호·차고', '제작·합성', '보상', '승부·경매', '행정부']
);

assert.equal(navigation.routes.deck.title, 'PVE 덱 편성실');
assert.deepEqual(Array.from(navigation.groups.store.routes), ['buy', 'inventory'], 'inventory must sit beside the card store in the first group');
assert.equal(navigation.routes.inventory.group, 'store');
assert.ok(!Array.from(navigation.groups.market.routes).includes('inventory'));
assert.deepEqual(Array.from(navigation.groups.equipment.routes), ['character', 'avatar'], 'combined loadout entry replaces equipment/title/garage duplicates');
assert.deepEqual(Array.from(navigation.groups.crafting.routes), ['vehicle', 'fusion', 'alchemy'], 'crafting group exposes its three direct actions');
assert.ok(!Array.from(navigation.groups.crafting.routes).includes('workshop'));
assert.equal(navigation.routes.scrapyard.group, 'pve', 'scrapyard is presented as PVE');
assert.ok(Array.from(navigation.groups.pve.routes).includes('scrapyard'));
assert.equal(Array.from(navigation.groups.pve.routes).filter(route => route === 'scrapyard').length, 1);
assert.ok(!Array.from(navigation.groups.crafting.routes).includes('scrapyard'));
assert.equal(navigation.routes.rank.group, 'pvp', 'season rank is presented inside PVP');
assert.ok(Array.from(navigation.groups.pvp.routes).includes('rank'));
assert.ok(!Array.from(navigation.groups.market.routes).includes('rank'));

assert.equal(router.routeContract.scrapyard.shell, 'scrapyard', 'scrapyard must own an independent PVE shell');
assert.ok(Array.from(router.shellRoutes).includes('scrapyard'), 'scrapyard native shell must be routable');
assert.equal(router.routeContract.vehicle.shell, 'workshop', 'vehicle crafting remains in workshop');
assert.equal(router.routeContract.fusion.shell, 'workshop', 'equipment synthesis remains in workshop');
assert.equal(router.routeContract.rank.shell, 'rank', 'rank deep link must remain unchanged');
assert.equal(router.routeMeta('scrapyard'), navigation.routes.scrapyard);
assert.equal(router.routeMeta('rank'), navigation.routes.rank);
assert.strictEqual(
  router.subtabContract.battle['PVE 덱 편성실'],
  router.subtabContract.battle['덱 편성실'],
  'legacy deck editor label remains a compatible alias'
);
assert.strictEqual(
  router.subtabContract.workshop['폐차장 원정'],
  router.routeContract.scrapyard,
  'legacy workshop subtab labels must redirect to the independent scrapyard shell'
);
const renderedShells = [];
await router.navigate('scrapyard', {
  runtime: {
    document,
    global: context,
    now: () => Date.now(),
    setTimeout,
    renderShell(route) { renderedShells.push(route); }
  }
});
assert.deepEqual(renderedShells, ['scrapyard'], 'scrapyard route must render the independent native shell without an intermediate workshop click');

assert.match(appSource, /scrapyard:\{[\s\S]*?css\/workshop-v1881\.css\?v=2009-material-label[\s\S]*?js\/workshop-v1881\.js\?v=2009-material-label/);
assert.match(appSource, /js\/scrapyard-battle-v1698\.js\?v=1881-workshop-split-lineage/);
assert.match(appSource, /typeof window\.scrapyardView==='function'&&typeof window\.bindScrapyardView==='function'/);
assert.match(appSource, /if\(itemCode==='SCRAPYARD_ENTRY_TICKET'\)return renderShell\('scrapyard'\)/, 'entry ticket must open the independent scrapyard shell');

for (const functionName of ['pcCommand', 'mobileCommand']) {
  const start = exactSource.indexOf(`function ${functionName}(`);
  const end = exactSource.indexOf('\n  }', start);
  const body = exactSource.slice(start, end);
  assert.match(body, /commandDescriptor\(route, title, meta, group\)/, `${functionName} must resolve the shared label descriptor`);
}
assert.match(exactSource, /MENU_GROUP_ORDER\.map\(id => MENU_GROUPS\[id\]\)/, 'all-menu order must come from the shared contract');
const allMenuRoutes = Array.from(navigation.menuGroupOrder).flatMap(id => Array.from(navigation.groups[id].routes));
assert.equal(new Set(allMenuRoutes).size, allMenuRoutes.length, 'the all-menu may not show duplicate route entries');
for (const hiddenDuplicate of ['equipment', 'title', 'garage', 'workshop']) assert.ok(!allMenuRoutes.includes(hiddenDuplicate));
assert.match(exactSource, /bootRequestedPending\s*=\s*requestedScreen\s*\|\|\s*''/);
assert.match(exactSource, /requested\s*===\s*'buy'[\s\S]*?ROUTES\[bootRequestedPending\][\s\S]*?queueMicrotask\(\(\)\s*=>\s*navigate\(bootRoute\)/, 'authenticated startup must replay valid ?screen= deep links after the buy shell boot');
assert.match(exactSource, /navigationType\s*===\s*'reload'\s*\?\s*''\s*:\s*requestedParams\.get\('screen'\)/, 'browser reload must ignore deep routes and return to the lobby');
assert.match(exactSource, /requestedParams\.delete\('screen'\)/, 'reload must remove the stale screen query from the address bar');

const replaced=[];
const reloadDocument={...document,currentScript:null,documentElement:{dataset:{}}};
const reloadContext={console,document:reloadDocument,location:{search:'?screen=clan&keep=1',pathname:'/',hash:''},performance:{getEntriesByType:()=>[{type:'reload'}]},history:{state:null,replaceState(_state,_title,url){replaced.push(url)}},URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval};
reloadContext.window=reloadContext;reloadContext.globalThis=reloadContext;
vm.createContext(reloadContext);
vm.runInContext(exactSource,reloadContext,{filename:'soopketmon-v21-exact-shell-adapter-reload.js'});
assert.equal(reloadContext.SoopketmonV21ExactShell.currentRoute,'home','reload must boot the main lobby even when a stale screen query exists');
assert.deepEqual(replaced,['/?keep=1'],'reload must preserve unrelated query values while removing screen');

const stableRendered=[];
let stablePageMounted=false;
let stableRafId=0;
const stableDocument={
  currentScript:null,
  readyState:'complete',
  documentElement:{dataset:{}},
  body:{classList:{add(){},remove(){},toggle(){}}},
  head:{append(){}},
  getElementById(){return null},
  createElement(){return {id:'',rel:'',href:''}},
  addEventListener(){},
  querySelector(selector){return selector==='#app main.page'&&stablePageMounted?{}:null},
  querySelectorAll(){return []}
};
const stableContext={
  console,
  document:stableDocument,
  location:{search:'',pathname:'/',hash:''},
  performance:{getEntriesByType:()=>[{type:'reload'}]},
  history:{state:null,replaceState(){}},
  URLSearchParams,
  MutationObserver:class{observe(){} disconnect(){}},
  renderShell(route){stableRendered.push(route);stablePageMounted=true;return route},
  requestAnimationFrame(){return ++stableRafId},
  cancelAnimationFrame(){},
  queueMicrotask,
  setTimeout,
  clearTimeout,
  setInterval(){return 1},
  clearInterval(){},
  addEventListener(){}
};
stableContext.window=stableContext;stableContext.globalThis=stableContext;
vm.createContext(stableContext);
vm.runInContext(exactSource,stableContext,{filename:'soopketmon-v21-exact-shell-adapter-sticky-home.js'});
stableContext.renderShell('buy');
stableContext.renderShell('buy');
assert.deepEqual(stableRendered,['buy'],'late automatic store refresh must not replace the mounted lobby');
assert.equal(stableContext.SoopketmonV21ExactShell.currentRoute,'home');
await stableContext.SoopketmonV21ExactShell.navigate('buy');
assert.deepEqual(stableRendered,['buy','buy'],'an explicit store navigation must release the lobby guard');
assert.equal(stableContext.SoopketmonV21ExactShell.currentRoute,'buy');
await stableContext.SoopketmonV21ExactShell.navigate('home');
stableContext.renderShell('buy');
assert.deepEqual(stableRendered,['buy','buy','buy'],'returning to the lobby must block later automatic store refreshes again');
assert.equal(stableContext.SoopketmonV21ExactShell.currentRoute,'home');

console.log('navigation contract v1: PASS');
