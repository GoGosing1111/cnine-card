import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const css=await readFile(new URL('../css/territory-war-v1824.css',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const serviceWorker=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');

assert.match(server,/ROW_NUMBER\(\) OVER \(ORDER BY/);
assert.match(server,/contribution_rank/);
assert.match(server,/COUNT\(\*\) OVER \(\) contribution_total/);
assert.match(server,/ranked WHERE ranked\.user_id=\?`\)\.bind\(round\.id,userId\)\.first\(\)/);
assert.match(client,/mine:next\.mine===null\?null:next\.mine\?\{\.\.\.\(state\?\.mine\|\|\{\}\),\.\.\.next\.mine\}:state\?\.mine/);
assert.match(client,/class="tw4-contribution-rank"/);
assert.match(client,/현재 기여도/);
assert.match(client,/contribution_rank/);
assert.match(client,/contribution_total/);
assert.match(css,/\.tw4-contribution-rank/);
assert.match(css,/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(index,/js\/app\.js\?v=2053-player-calling-card/);
assert.match(index,/territory-war-v1811\.js\?v=2053-player-calling-card/);
assert.match(index,/territory-war-v1824\.css\?v=1994-commander-direct-live-status/);
assert.match(serviceWorker,/soop-card-shell-v2053-player-calling-card/);

console.log('territory my rank v1847: ok');
