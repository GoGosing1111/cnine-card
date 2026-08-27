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
  'js/app.js?v=1880-navigation-deck-rules',
  'css/pve-command-v2.css?v=1880-navigation-deck-rules',
  'css/information-architecture-v1880.css?v=1880-navigation-deck-rules',
  'js/pve-command-v2-live.js?v=1880-navigation-deck-rules',
  'js/soopketmon-v21-exact-shell-adapter.js?v=21.11.0-navigation-contract',
  'js/soopketmon-v21-runtime-router.js?v=1.3.0-navigation-contract'
]) assert.ok(index.includes(asset), `missing cache-busted asset: ${asset}`);
assert.ok(serviceWorker.includes("soop-card-shell-v1880-navigation-deck-rules"));

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
assert.ok(pve.includes('HP형 불굴의 생존 효과 비활성'));
assert.ok(pve.includes("cnine_skip_player_ultimate"), 'working ultimate-skip contract must remain intact');
assert.ok(pveCss.includes('@media(max-width:760px)'));
assert.ok(pveCss.includes('(hover:none) and (pointer:coarse)'), 'touch tablet/WebView guard must match the shell breakpoint contract');
assert.ok(pveCss.includes('white-space:nowrap'));
assert.ok(pveCss.includes('white-space:normal'));

assert.ok(informationCss.includes('body[data-content-scope="pve"]'));
assert.ok(informationCss.includes('.deck-grade-rule-summary'));
assert.ok(exactShell.includes("VERSION = '21.11.0'"));
assert.ok(!exactShell.includes('시즌 · 카드점수'));
assert.ok(router.includes("version: '1.3.0'"));
assert.ok(!router.includes("'카드 점수'"));

console.log('navigation/deck/PVE UI v1880 contract: ok');
