import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const pveCss = fs.readFileSync(new URL('../css/pve-command-v2.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../js/battle-v3-live.js', import.meta.url), 'utf8');
const pveUi = fs.readFileSync(new URL('../js/pve-command-v2-live.js', import.meta.url), 'utf8');

const playerStart = app.indexOf('async function playBattleUltimate');
const bossStart = app.indexOf('async function playBossBattleUltimate');
const exportStart = app.indexOf('window.playBattleUltimate=playBattleUltimate');
assert.ok(playerStart >= 0 && bossStart > playerStart && exportStart > bossStart, 'ultimate functions must remain ordered');

const playerUltimate = app.slice(playerStart, bossStart);
const bossUltimate = app.slice(bossStart, exportStart);

assert.match(playerUltimate, /data-ultimate-skip="player-cinematic"/, 'player ultimate must expose the skip control');
assert.match(playerUltimate, /aria-label="유저 궁극기 연출 건너뛰기"/, 'skip control must be accessible');
assert.match(playerUltimate, /playerUltimateCinematicSkipped\(\)/, 'saved player-only skip preference must bypass the cinematic');
assert.match(playerUltimate, /media\.pause\(\)/, 'skip must stop the player cinematic media');
assert.match(playerUltimate, /finish\(true\)/, 'skip must settle the cinematic immediately');
assert.doesNotMatch(bossUltimate, /battle-ultimate-skip|data-ultimate-skip/, 'boss ultimate must not expose the player skip control');
assert.doesNotMatch(bossUltimate, /cnine_skip_player_ultimate|playerUltimateCinematicSkipped/, 'player preference must never bypass the boss ultimate');
assert.match(pveUi, /id="battleSkipPlayerUltimate"/, 'PVE battle preparation must expose the player ultimate skip preference');
assert.match(pveUi, /보스 궁극기는 정상 재생합니다\./, 'the setting must state that boss ultimates are unaffected');
assert.match(pveUi, /cnine_skip_player_ultimate/, 'the setting must persist across battle preparation renders');

assert.match(bridge, /playBattleUltimate[\s\S]*safePlayEvents\(\[event\]/, 'server-authoritative ultimate event must continue after the cinematic promise settles');
assert.match(css, /\.battle-ultimate-skip\{[\s\S]*min-height:46px/, 'desktop skip control must have a usable hit target');
assert.match(css, /@media\(max-width:600px\)[\s\S]*\.battle-ultimate-skip[\s\S]*min-height:44px/, 'mobile skip control must preserve a 44px hit target');
assert.match(pveCss, /\.pvev2-battle-options\{[\s\S]*repeat\(2,minmax\(0,1fr\)\)/, 'desktop preparation toggles must share the available row');
assert.match(pveCss, /@media\(max-width:620px\)\{\.pvev2-battle-options\{grid-template-columns:minmax\(0,1fr\)\}\}/, 'mobile preparation toggles must stack without clipping');
assert.match(index, /css\/style\.css\?v=1879-player-ultimate-skip/, 'style cache key must be bumped');
assert.match(index, /js\/app\.js\?v=(?:1879-player-ultimate-skip|1880-navigation-deck-rules|1881-workshop-split-lineage|1882-menu-pve-scrapyard|1884-zenith-ojoeun-sd|1904-superstar-son-zeus-sd|1905-ranked-pvp-deck-renewal|1906-ranked-pvp-card-fit|1908-joeun-gamst-visibility|1920-zenith-reroll|1921-inventory-reroll-route)/, 'app cache key must preserve or supersede the ultimate-skip release');
assert.match(index, /js\/pve-command-v2-live\.js\?v=(?:1879-player-ultimate-skip|1880-navigation-deck-rules|1882-menu-pve-scrapyard|1908-joeun-gamst-visibility)/, 'PVE UI cache key must preserve or supersede the ultimate-skip release');
assert.match(index, /css\/pve-command-v2\.css\?v=(?:1879-player-ultimate-skip|1880-navigation-deck-rules|1882-menu-pve-scrapyard)/, 'PVE UI style cache key must preserve or supersede the ultimate-skip release');
assert.match(worker, /soop-card-shell-v(?:1879-player-ultimate-skip|1880-navigation-deck-rules|1881-workshop-split-lineage|1882-menu-pve-scrapyard|1884-zenith-ojoeun-sd|1885-static-high-grade-frame|1904-superstar-son-zeus-sd|1905-ranked-pvp-deck-renewal|1906-ranked-pvp-card-fit|1908-joeun-gamst-visibility|1920-zenith-reroll|1921-inventory-reroll-route)/, 'service worker shell cache must preserve or supersede the ultimate-skip release');

console.log('V3 player ultimate skip: user cinematic only, authoritative combat preserved');
