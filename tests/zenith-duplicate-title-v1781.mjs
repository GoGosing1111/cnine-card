import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('js/app.js');
const api = read('functions/api/[[path]].js');
const zenith = read('css/zenith-v1.css');
const garage = read('css/garage-v1341.css');
const titles = read('css/title-public-v1245.css');
const index = read('index.html');
const worker = read('service-worker.js');

assert.match(app, /dex-zenith-acquisition/);
assert.match(app, /제니스 획득 \$\{ownedQuantity/);
assert.match(app, /중복 \$\{Math\.max\(0,ownedQuantity-1\)/);
assert.match(app, /isZenith&&owned\?`\$\{ownedQuantity\.toLocaleString\('ko-KR'\)\}회 · 중복/);
assert.match(app, /incomingQuantities=Object\.fromEntries/);
assert.match(zenith, /\.dex-card-display\.grade-ZENITH \.dex-zenith-acquisition/);

assert.match(api, /TITLE_RANKED_GAMBLER[\s\S]{0,400}'CRIMSON'/);
assert.match(api, /CREATE TABLE IF NOT EXISTS pvp_battle_audits_v1781/);
assert.match(garage, /title-style-crimson[\s\S]*content:' ★★'/);
assert.match(garage, /frame-title-v1249\.title-style-crimson::after\{content:'★★'/);
assert.match(titles, /title-style-crimson::after\{content:'★★'/);
assert.doesNotMatch(`${garage}\n${titles}`, /content:' ?★★★★'/);

assert.match(index, /title-public-v1245\.css\?v=1781-crimson-two-stars/);
assert.match(index, /zenith-v1\.css\?v=1781-duplicate-ledger/);
assert.match(index, /app\.js\?v=1781-pvp-zenith-title/);
assert.match(worker, /soop-card-shell-v1781-pvp-zenith-title/);

console.log('ZENITH duplicate ledger and crimson two-star title contract: OK');
