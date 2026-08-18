import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const territory=await readFile(new URL('../js/territory-war-v1362.js',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');

assert.match(territory,/async function prepareTerritoryBattle\(\)/);
assert.match(territory,/await globalThis\.ensureFeatureResources\('battleV2'\)/);
assert.match(territory,/view=await prepareTerritoryBattle\(\)/);
assert.match(territory,/영토전 전투엔진을 준비하는 중/);
assert.match(index,/territory-war-v1362\.js\?v=1737-round-equipment-reward/);

console.log('territory mobile battle loader v1735: ok');
