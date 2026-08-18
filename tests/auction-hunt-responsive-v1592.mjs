import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const cssPath = 'css/soopketmon-v21-auction-hunt-responsive.css';
assert.ok(existsSync(cssPath), 'responsive override must exist');
const css = read(cssPath);

for (const contract of [
  '@media(max-width:900px)',
  '.auction-stage-v1553{display:flex',
  '.auction-lot-v1553{order:1',
  '.auction-action-v1553{order:2',
  '.auction-bidders-v1553{order:3',
  'font-size:clamp(30px,12cqi,58px)',
  'white-space:nowrap',
  'backdrop-filter:none',
  'min-height:48px',
  'bottom:calc(8px + env(safe-area-inset-bottom))',
  '.pve-target-copy>.pve-target-start{order:3',
  'min-height:60px',
  'bottom:calc(74px + env(safe-area-inset-bottom))'
]) assert.ok(css.includes(contract), `missing contract: ${contract}`);

const roots = [
  '.',
  'tmp/approved-shell-main',
  'tmp/approved-shell-release',
  'tmp/live-v21-deploy-20260819-002'
];
for (const root of roots) {
  const prefix = root === '.' ? '' : `${root}/`;
  const index = read(`${prefix}index.html`);
  assert.match(index, /soopketmon-v21-auction-hunt-responsive\.css\?v=21\.7\.0/,
    `${root}: responsive stylesheet not loaded`);
}

for (const root of roots.slice(1)) {
  const app = read(`${root}/js/app.js`);
  assert.match(app, /auction-house-v1553\.css\?v=1592-responsive-stage','css\/soopketmon-v21-auction-hunt-responsive\.css\?v=21\.7\.0/,
    `${root}: auction lazy-load order is wrong`);
}

const auctionJs = read('js/auction-house-v1553.js');
const lot = auctionJs.indexOf('<main class="auction-lot-v1553">');
const action = auctionJs.indexOf('<aside class="auction-action-v1553">');
assert.ok(lot >= 0 && action > lot, 'lot must precede bid action in source order');

console.log('auction/hunt responsive v1592: OK');
