import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');

assert.match(server,/completedBattleResponse[\s\S]*?coinAfter:Number\(balance\?\.coin\|\|0\)/);
assert.match(server,/return deps\.json\(\{ok:true,result,state,coinAfter:Number\(balance\?\.coin\|\|0\)\}\)/);
assert.match(server,/cardShardsAfter:Number\(balance\?\.card_shards\|\|0\)/);
assert.match(client,/function syncAccountBalances\(data\)/);
assert.match(client,/save\(user\);globalThis\.clearApiCache\?\.\('shell\/summary'\)/);
assert.match(client,/\.currency-row\.coin b/);
assert.equal((client.match(/syncAccountBalances\(data\)/g)||[]).length,4);
assert.match(index,/territory-war-v1811\.js\?v=2053-player-calling-card-empty-fx/);

console.log('territory coin sync v1995: ok');
