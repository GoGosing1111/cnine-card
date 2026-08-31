import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('narrow PVE uses the primary mode navigation without duplicate three-button bars', async () => {
  const [app,style]=await Promise.all([
    readFile(new URL('../js/app.js',import.meta.url),'utf8'),
    readFile(new URL('../css/style.css',import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(app,/class="mobile-pve-tabs"/);
  assert.doesNotMatch(app,/class="mobile-pve-quickbar"/);
  assert.match(style,/v1870:[\s\S]*?\.mobile-pve-tabs,[\s\S]*?\.mobile-pve-quickbar,[\s\S]*?display:none!important/);
  assert.match(style,/\.pve-mobile-pane\{display:block!important\}/);
});

test('ranked fatigue remains visible and live-labelled on mobile and short landscape screens', async () => {
  const [app,ranked,index]=await Promise.all([
    readFile(new URL('../js/app.js',import.meta.url),'utf8'),
    readFile(new URL('../css/ranked-v2-v1827.css',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8')
  ]);
  assert.match(app,/aria-label="랭크전 잔여 피로도"/);
  assert.match(app,/id="pvpEnergyCount" aria-live="polite"/);
  assert.match(ranked,/V1870:[\s\S]*?\.pvp-energy-card\{display:flex!important/);
  assert.match(ranked,/@media\(orientation:landscape\) and \(max-height:560px\)[\s\S]*?\.pvp-energy-card\{display:flex!important/);
  assert.match(index,/style\.css\?v=(?:1870-avatar-pve-energy|1879-player-ultimate-skip)/);
  assert.match(index,/ranked-v2-v1827\.css\?v=1908-joeun-gamst-visibility/);
  assert.match(index,/app\.js\?v=1941-superstar-pack-early-access/);
});
