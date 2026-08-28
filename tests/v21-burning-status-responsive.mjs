import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/burning-event-v1871.css', 'utf8');
const adapter = readFileSync('js/soopketmon-v21-exact-shell-adapter.js', 'utf8');

for (const contract of [
  '.burning-event-hud.is-hyper',
  'width:min(430px,calc(100vw - 24px))!important',
  '.top-hud > .burning-event-hud',
  'width:min(430px,100%)!important',
  'inset-block-start:0!important',
  'inset-block-start:var(--pc-hud-h,68px)!important',
  'grid-template-columns:minmax(140px,1fr) 74px 124px',
  'grid-template-columns:minmax(128px,180px) minmax(150px,1fr) auto 34px!important',
  'width:min(320px,100%)!important',
  'grid-template-columns:minmax(0,1fr) 70px 82px',
  '.burning-event-hud-stats { display:none; }',
  'inset-block-start:calc(126px + var(--safe-top,0px))!important',
  '.burning-command-notice.is-burning .burning-briefing-art',
  '.burning-command-notice.is-hyper .burning-briefing-art'
]) assert.ok(css.includes(contract), `missing burning status contract: ${contract}`);

assert.match(adapter, /const VERSION = '21\.14\.0'/);
assert.match(adapter, /global\.ensureBurningEventHudVisible\?\.\(\)/);
assert.doesNotMatch(adapter,/normalizeBurningStrip|bindBurningStripNormalizer/);

console.log('v21 burning status responsive: OK');
