import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL(file,root),'utf8');
const [index,app,runtime,worker,pwa,battle,css]=[
  'index.html','js/app.js','js/runtime-performance-v1727.js','service-worker.js','js/pwa-install.js','js/battle-v2-live.js','css/runtime-performance-v1727.css'
].map(read);

assert.match(worker,/const SHELL_CACHE='soop-card-shell-v1731'/);
assert.match(worker,/const CONTENT_CACHE='soop-card-content-v1'/);
assert.match(worker,/request\.headers\.has\('range'\)/);
assert.match(worker,/CONTENT_CACHE_LIMIT=320/);
assert.doesNotMatch(worker,/client\.navigate\(/);
assert.doesNotMatch(pwa,/location\.reload\(/);

assert.match(app,/cnine-route-start/);
assert.match(app,/range\.deleteContents\(\)/);
assert.match(app,/data-cnine-shell="1"/);
assert.match(app,/function materializeDexSection\(/);
assert.match(app,/data-dex-materialized=/);
assert.match(app,/cnine-route-render/);

assert.match(runtime,/IntersectionObserver/);
assert.match(runtime,/PerformanceObserver/);
assert.match(runtime,/visibilitychange/);
assert.match(runtime,/cnine:canvas-suspend/);
assert.match(css,/content-visibility:auto/);
assert.match(css,/animation-play-state:paused!important/);

assert.match(battle,/CNineRuntime\?\.registerCleanup/);
assert.match(battle,/deleteProgram\(field\)/);
assert.match(index,/runtime-performance-v1727\.css\?v=1729-virtual-card-lists/);
assert.match(index,/runtime-performance-v1727\.js\?v=1727-offscreen-lifecycle/);
assert.match(index,/responsive-card-images-v1729\.js\?v=1729-responsive-card-images/);
assert.match(index,/app\.js\?v=1729-virtual-card-lists/);
assert.doesNotMatch(index,/battle-v2-live\.js/);

console.log('pwa performance v1727 checks passed');
