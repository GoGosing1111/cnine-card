import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readCommittedAssetSync} from './helpers/committed-asset-read.mjs';

const read = file => readCommittedAssetSync(new URL('../' + file, import.meta.url)).toString();
function entrance() {
  const context = vm.createContext({
    battleView() {}, renderBattleBuilder() {}, switchPveMode() {},
    battleState: {energy: {energy: 3, maxEnergy: 30}}, summaryBar: () => '',
  });
  context.window = context;
  for (const file of ['js/tactical-icons-20261030.js', 'js/soopketmon-v21-runtime-router.js', 'js/pve-command-v2-live.js']) {
    vm.runInContext(read(file), context, {filename: file});
  }
  return {context, html: context.battleView({})};
}

test('the PVE battlefield menu links directly to the same defense lobby, before deck data loads', () => {
  const {context, html} = entrance();
  const route = context.SoopketmonV21RuntimeRouter.routeContract.defense.href;
  assert.equal(route, '/defense/');
  const links = Array.from(html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g), match => match[0]);
  assert.equal(links.length, 1);
  assert.ok(links[0].includes('href="' + route + '"'));
  assert.match(links[0], /data-tactical-icon="defense"[^>]*>[\s\S]*?몬스터 디펜스/);
  assert.doesNotMatch(links[0].split('>')[0], /data-pve-mode|\bhidden\b/);
  assert.match(read('defense/index.html'), /id="defense-app"/);
});

test('deck and hunt use lobby icons and each gated destination retains its access hook', () => {
  const {html} = entrance();
  assert.match(html, /data-pve-mode="deck" aria-selected="true"[^>]*><img[^>]*data-tactical-icon="deck"/);
  assert.match(html, /data-pve-mode="hunt" aria-selected="false"[^>]*><img[^>]*data-tactical-icon="hunt"/);
  for (const gate of ['data-pve-mode="coop" hidden', 'data-legion-hunt-entry hidden', 'data-legion-citadel hidden']) {
    assert.ok(html.includes(gate), gate);
  }
  assert.match(html, /data-v21-route="scrapyard"[\s\S]*?<b>폐차장 원정<\/b>/);
});

test('the deck prefetches combat assets and the hunt opens the existing battle engine', async () => {
  const source = read('js/app.js').split('function warmFeatureForTab(')[1].split('function featureRouteLoadingHtml')[0];
  const calls = [];
  const sandbox = {
    runtimeCommandContext:'battle', view:'deck', getPveViewMode() {return sandbox.view;},
    prefetchBattleBundleWhenIdle() {calls.push('prefetch');},
    featureKeyForTab: () => 'battleV2',
    async ensureFeatureResources(key) {calls.push(key);}, warmBattleArtAssets() {calls.push('art');}
  };
  vm.runInNewContext('function warmFeatureForTab(' + source + '\nwarmFeatureForTab("battle");', sandbox);
  assert.deepEqual(calls,['prefetch']);
  sandbox.view = 'hunt';
  sandbox.warmFeatureForTab('battle');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls,['prefetch','battleV2','art']);
});

test('the web and H5 entrances request identical revisions of the PVE visuals', () => {
  const pages = ['index.html','onestore/index.html'].map(read);
  for (const file of ['js/app.js','js/pve-command-v2-live.js','js/soopketmon-v21-exact-shell-adapter.js','js/soopketmon-v21-command-icons.js','css/combat-lobby-v2110.css']) {
    const urls = pages.map(page => (page.split('"' + file + '?')[1] || '').split('"')[0]);
    assert.match(urls[0], /pveLobby=20261109/);
    assert.equal(urls[1], urls[0]);
  }
});
