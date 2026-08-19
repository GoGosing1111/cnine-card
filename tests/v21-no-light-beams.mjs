import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('js/app.js', 'utf8');
const adapter = readFileSync('js/soopketmon-v21-exact-shell-adapter.js', 'utf8');
const css = readFileSync('css/soopketmon-v21-exact-luxury.css', 'utf8');
const index = readFileSync('index.html', 'utf8');

assert.doesNotMatch(app, /<div class="ambient-lines"><\/div>/, 'app shell must not create the retired light columns');
assert.match(adapter, /querySelectorAll\('\.ambient-lines,\.light-pillars,\.light-beams'\).*remove\(\)/, 'adapter must remove stale light-column markup');
assert.match(css, /\.ambient-lines,[\s\S]*\.dex-renewal-shell::before[\s\S]*display:none!important;[\s\S]*content:none!important;/, 'all renewed routes must hard-disable beam decorations');
assert.match(index, /21\.7\.2-no-light-beams/, 'adapter cache key must change with the beam removal');

console.log('V21 no-light-beams contract: OK');
