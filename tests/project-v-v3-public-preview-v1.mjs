import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const preview = path.join(root, 'preview', 'project-v-v3');
const read = file => fs.readFileSync(path.join(preview, file), 'utf8');

for (const file of [
  'index.html',
  'project-v-client.css',
  'project-v-card-frames.css',
  'project-v-modules.css',
  'project-v-responsive-fixes.css',
  'project-v-client.js',
  'project-v-firearm-qc-audio.js',
  'project-v-pixi-battle.bundle.js'
]) assert.ok(fs.statSync(path.join(preview, file)).size > 0, `${file} is missing or empty`);

const html = read('index.html');
const client = read('project-v-client.js');
const baseCss = read('project-v-client.css');
const bundle = read('project-v-pixi-battle.bundle.js');

assert.match(html, /project-v-command-studio-bg-v2\.png/);
assert.doesNotMatch(html, /project-v-lobby-studio-v1|battle-art-adapter|tier-battle-art-adapter|unassigned-battle-fallback|monster-battle-art-adapter/);
assert.match(client, /project-v-pixi-battle\.bundle\.js\?v=84-contact-locked-four-weapons/);
assert.match(baseCss, /\.pv-client\{/);
assert.match(baseCss, /\.pv-environment\{/);
assert.match(baseCss, /\.pv-topbar\{/);
assert.doesNotMatch(baseCss, /(?:^|})\.client\{|(?:^|})\.studio-bg\{|(?:^|})\.top-hud\{/,
  'V3 base stylesheet must not regress to the incompatible legacy DOM contract');
assert.match(html, /params\.has\('qc'\).*params\.has\('suit23'\).*params\.get\('view'\) !== 'battle'/s,
  'shared QC links must open the battle module instead of leaving the unstyled lobby background visible');
assert.match(html, /querySelector\('\[data-open-module="battle"\]'\)\?\.click\(\)/,
  'shared QC links must activate the real battle-module click path');

for (const [mode, asset] of Object.entries({
  HUNT: 'v3-nightmare-forest-battlefield-v1.png',
  TOWER: 'v3-infinite-tower-sanctum-v1.png',
  RAID: 'v3-world-raid-obsidian-citadel-v1.png',
  SIEGE: 'v3-siege-fortress-courtyard-v1.png'
})) {
  assert.match(html, new RegExp(`data-battlefield="${mode}"`));
  assert.match(bundle, new RegExp(asset.replaceAll('.', '\\.')));
  assert.ok(fs.statSync(path.join(root, 'assets', 'ui', 'project-v', 'battlefields', asset)).size > 0);
}

assert.match(html,/data-battlefield="PVP"/);
assert.match(bundle,/coin-prediction\/arena-v1\.png/);
assert.ok(fs.statSync(path.join(root,'assets','ui','coin-prediction','arena-v1.png')).size>0);
assert.match(html,/id="pvBattleRetarget"/);
assert.match(bundle,/role-impact-v2/,'public bundle must contain the approved authored role-impact atlases');

assert.ok(fs.statSync(path.join(preview, 'project-v-pixi-battle.bundle.js')).size > 700_000);
assert.doesNotMatch(html, /project-v-pixi-battle\.bundle\.js/,
  'Pixi bundle must remain lazy and must not be loaded directly by index.html');

console.log('Project V V3 public preview contract: PASS');
