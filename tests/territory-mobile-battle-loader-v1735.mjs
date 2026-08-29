import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const territory=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');

assert.match(territory,/async function prepareTerritoryBattle\(\)/);
assert.match(territory,/await globalThis\.ensureFeatureResources\('battleV2'\)/);
assert.match(territory,/view=await prepareTerritoryBattle\(\)/);
assert.match(territory,/PROJECT V V3 공성 전장 연결 중/);
assert.match(territory,/playSiegeBattleV2Live/);
assert.match(index,/territory-war-v1811\.js\?v=1916-territory-100-attack-reward/);

console.log('territory mobile battle loader v1735: ok');
