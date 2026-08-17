import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [server,client,index,worker]=await Promise.all([
  read('functions/_idle_dungeon.js'),
  read('js/idle-dungeon-v1600.js'),
  read('index.html'),
  read('service-worker.js')
]);

assert.match(server,/const DAILY_ACCOUNT_COIN_CAP=30000000;/);
assert.match(server,/원정 코인 한도 3,000만/);
assert.doesNotMatch(server,/원정 코인 한도 150만/);
assert.match(client,/오늘 합산 · 최대 3,000만/);
assert.match(client,/dailyCap:Number\(state\?\.settings\?\.dailyAccountCoinCap\|\|30000000\)/);
assert.doesNotMatch(client,/dailyCap:p\.dailyCap\|\|d\.dailyCap/);
assert.match(index,/idle-dungeon-v1600\.js\?v=1733-preview-daily-cap-30m/);
assert.match(worker,/soop-card-shell-v1733/);

console.log('idle dungeon daily cap 30m checks passed');
