import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/burning-event-v1871.css', 'utf8');
const adapter = readFileSync('js/soopketmon-v21-exact-shell-adapter.js', 'utf8');

for (const contract of [
  '.burning-event-hud.is-hyper',
  'width:min(680px,calc(100vw - 24px))!important',
  'inset-block-start:calc(var(--pc-hud-h,68px) + 60px)!important',
  'inset-block-start:60px!important',
  'grid-template-columns:minmax(180px,1fr) 88px 240px 134px',
  'grid-template-columns:minmax(0,1fr) 70px 82px',
  '.burning-event-hud-stats { display:none; }',
  'inset-block-start:calc(126px + var(--safe-top,0px))!important',
  '.burning-command-notice.is-burning .burning-briefing-art',
  '.burning-command-notice.is-hyper .burning-briefing-art'
]) assert.ok(css.includes(contract), `missing burning status contract: ${contract}`);

assert.match(adapter, /const VERSION = '21\.10\.6'/);
assert.doesNotMatch(adapter,/normalizeBurningStrip|bindBurningStripNormalizer/);

console.log('v21 burning status responsive: OK');
