import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const css=await readFile(new URL('../css/territory-war-v1824.css',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');

assert.match(client,/combatActive=String\(state\.round\?\.status\|\|''\)==='ACTIVE'&&String\(state\.front\?\.status\|\|''\)==='ACTIVE'/);
assert.match(client,/liveCombat=combatActive&&index===current/);
assert.match(client,/class="tw4-node \$\{sideClass\}[\s\S]*combat-active/);
assert.match(client,/tw4-live-combat/);
assert.match(client,/현재 전투 중/);
assert.match(css,/\.tw4-ranking-list article > i\.side-a \{ color: var\(--cyan\)/);
assert.match(css,/\.tw4-ranking-list article > i\.side-b \{ color: var\(--red\)/);
assert.doesNotMatch(css,/\.tw4-ranking-list article:nth-child\(even\) > i/);
assert.match(css,/\.tw4-node\.combat-active/);
assert.match(css,/\.tw4-combat-beacon/);
assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
assert.match(index,/territory-war-v1824\.css\?v=1994-commander-direct-live-status/);
assert.match(index,/territory-war-v1811\.js\?v=2053-player-calling-card-empty-fx/);

console.log('territory live front v1846: ok');
