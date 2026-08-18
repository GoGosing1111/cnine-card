import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/soopketmon-v21-exact-luxury.css', 'utf8');
const adapter = readFileSync('js/soopketmon-v21-exact-shell-adapter.js', 'utf8');

for (const contract of [
  '@media (min-width:760px) and (hover:hover) and (pointer:fine)',
  'width:min(430px,calc(100% - 660px))!important',
  'max-height:38px!important',
  'transform:translateX(-50%)!important',
  'text-align:center!important',
  'max-height:44px!important',
  'justify-items:center!important',
  '.page > .burning-event-strip span { display:none!important; }',
  'inset-block-start:calc(128px + var(--safe-top))!important'
]) assert.ok(css.includes(contract), `missing burning status contract: ${contract}`);

assert.match(adapter, /const VERSION = '21\.7\.0'/);
for (const root of ['tmp/approved-shell-release', 'tmp/live-v21-deploy-20260819-002']) {
  assert.equal(readFileSync(`${root}/css/soopketmon-v21-exact-luxury.css`, 'utf8'), css, `${root}: luxury css drift`);
  assert.match(readFileSync(`${root}/js/soopketmon-v21-exact-shell-adapter.js`, 'utf8'), /const VERSION = '21\.7\.0'/);
}

console.log('v21 burning status responsive: OK');
