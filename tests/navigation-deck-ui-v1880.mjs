import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const index = read('index.html');
const serviceWorker = read('service-worker.js');
const app = read('js/app.js');
const pve = read('js/pve-command-v2-live.js');
const pveCss = read('css/pve-command-v2.css');
const informationCss = read('css/information-architecture-v1880.css');
const api = read('functions/api/[[path]].js');
const exactShell = read('js/soopketmon-v21-exact-shell-adapter.js');
const router = read('js/soopketmon-v21-runtime-router.js');

for (const asset of [
  'js/app.js?v=1884-zenith-ojoeun-sd',
  'css/pve-command-v2.css?v=1882-menu-pve-scrapyard',
  'css/information-architecture-v1880.css?v=1880-navigation-deck-rules',
  'js/pve-command-v2-live.js?v=1882-menu-pve-scrapyard',
  'js/soopketmon-v21-exact-shell-adapter.js?v=21.13.0-menu-cleanup',
  'js/soopketmon-v21-runtime-router.js?v=1.4.0-workshop-split'
]) assert.ok(index.includes(asset), `missing cache-busted asset: ${asset}`);
assert.ok(serviceWorker.includes("soop-card-shell-v1885-static-high-grade-frame"));

assert.ok(app.includes('deckGradeLimitViolation'));
assert.ok(app.includes('normalizeDeckRules'));
assert.ok(app.includes('CARD_SCORE_RANKING_RETIRED') || api.includes('CARD_SCORE_RANKING_RETIRED'));
assert.ok(!app.includes('data-rank-mode="card"'));
assert.ok(!app.includes('cardRankLink'));
assert.ok(!app.includes('카드점수 랭킹'));
assert.ok(!api.includes('async function userCardScore('));

assert.ok(pve.includes('PVE 덱 편성실'));
assert.ok(pve.includes('권장 전투력은 비교 지표이며 입장 제한이 아닙니다.'));
assert.ok(pve.includes('토벌 잔여 횟수'));
assert.ok(pve.includes("scrapyard: ['폐차장 원정', 'SALVAGE'"));
assert.ok(pve.includes("modeButton('scrapyard')"));
assert.ok(pve.includes('data-v21-route="scrapyard"'));
assert.match(app, /\.pve-mode-btn\[data-pve-mode\]/, 'native PVE switching must ignore the standalone scrapyard route button');
assert.ok(pve.includes('HP형 불굴의 생존 효과 비활성'));
assert.ok(pve.includes("cnine_skip_player_ultimate"), 'working ultimate-skip contract must remain intact');
assert.ok(pveCss.includes('@media(max-width:760px)'));
assert.match(pveCss, /grid-template-columns:repeat\(9,minmax\(145px,1fr\)\)/, 'desktop PVE rail must keep all nine entries on one row');
assert.match(pveCss, /grid-template-columns:repeat\(9,150px\)/, 'compact desktop PVE rail must keep all nine entries on one row');
assert.match(pveCss, /grid-auto-flow:column/, 'mobile PVE rail must remain a horizontal scroller');
assert.ok(pveCss.includes('(hover:none) and (pointer:coarse)'), 'touch tablet/WebView guard must match the shell breakpoint contract');
assert.ok(pveCss.includes('white-space:nowrap'));
assert.ok(pveCss.includes('white-space:normal'));

assert.ok(informationCss.includes('body[data-content-scope="pve"]'));
assert.ok(informationCss.includes('.deck-grade-rule-summary'));
assert.ok(exactShell.includes("VERSION = '21.13.0'"));
assert.ok(!exactShell.includes('시즌 · 카드점수'));
assert.ok(router.includes("version: '1.4.0'"));
assert.ok(!router.includes("'카드 점수'"));

console.log('navigation/deck/PVE UI v1880 contract: ok');
