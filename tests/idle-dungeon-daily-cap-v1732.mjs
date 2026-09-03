import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [server,client,index]=await Promise.all([
  read('functions/_idle_dungeon.js'),
  read('js/idle-dungeon-v1600.js'),
  read('index.html')
]);

assert.match(server,/const DAILY_ACCOUNT_COIN_CAP=200000000;/);
assert.match(server,/DAILY_ACCOUNT_COIN_CAP\.toLocaleString\('ko-KR'\)/);
assert.doesNotMatch(server,/const DAILY_ACCOUNT_COIN_CAP=(?:15000000|30000000);/);
assert.match(client,/accountCap=Number\(state\.settings\.dailyAccountCoinCap\|\|p\.dailyCap\|\|200000000\)/);
assert.match(client,/오늘 합산 · 최대 \$\{n\(accountCap\)\}/);
assert.match(client,/dailyCap:Number\(state\?\.settings\?\.dailyAccountCoinCap\|\|p\.dailyCap\|\|200000000\)/);
assert.doesNotMatch(client,/dailyCap:p\.dailyCap\|\|d\.dailyCap/);
assert.doesNotMatch(client,/최대 (?:150만|3,000만)/);
assert.match(index,/idle-dungeon-v1600\.js\?v=2002-daily-cap-200m/);

console.log('idle dungeon daily cap 200m checks passed');
