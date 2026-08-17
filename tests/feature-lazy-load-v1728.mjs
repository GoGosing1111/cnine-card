import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');
const index=read('index.html'),app=read('js/app.js'),worker=read('service-worker.js'),runtimeCss=read('css/runtime-performance-v1727.css');

for(const resource of [
  'css/battle-v2-live.css','js/battle-v2-live.js',
  'css/auction-house-v1553.css','js/auction-house-v1553.js',
  'css/coin-prediction-v1.css','css/coin-prediction-v1632.css','js/coin-prediction-v1.js'
])assert.doesNotMatch(index,new RegExp(resource.replaceAll('.','\\.')),`${resource} must not block the app shell`);

assert.match(app,/const FEATURE_RESOURCE_MANIFEST=/);
assert.match(app,/function ensureFeatureResources\(key\)/);
assert.match(app,/featureResourcePromises\.delete\(key\)/);
assert.match(app,/function warmFeatureForTab\(tab\)/);
assert.match(app,/pointerover',warmFromEvent/);
assert.match(app,/ensureFeatureResources\('battleV2'\)/);
assert.match(app,/preloadBattleEntryAssets\(deckCards,monster\)/);
assert.match(app,/preloadBattleEntryAssets\(mine,target\)/);
assert.match(app,/routeWaitsForFeature/);
assert.match(runtimeCss,/\.route-feature-loader/);
assert.match(worker,/soop-card-shell-v1728/);

const deferredBytes=[
  'css/battle-v2-live.css','js/battle-v2-live.js',
  'css/auction-house-v1553.css','js/auction-house-v1553.js',
  'css/coin-prediction-v1.css','css/coin-prediction-v1632.css','js/coin-prediction-v1.js'
].reduce((sum,file)=>sum+statSync(new URL(file,root)).size,0);
assert.ok(deferredBytes>=220_000,`expected at least 220KB deferred, got ${deferredBytes}`);

console.log(`feature lazy load v1728 checks passed (${deferredBytes.toLocaleString()} bytes deferred)`);
