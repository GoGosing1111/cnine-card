import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [idle,tower,index]=await Promise.all([
  read('js/idle-dungeon-v1600.js'),
  read('js/tower-v1038.js'),
  read('index.html')
]);

assert.match(idle,/placementAnchor=document\.getElementById\('pveRaidHubView'\)\|\|raid/);
assert.match(idle,/placementAnchor\.insertAdjacentElement\('afterend',view\)/);
assert.match(idle,/raidHost=document\.getElementById\('pveRaidHubView'\)\|\|document\.getElementById\('pveRaidView'\)/);
assert.match(tower,/anchor=document\.getElementById\('pveRaidHubView'\)\|\|document\.getElementById\('pveRaidView'\)/);
assert.match(tower,/anchor\.insertAdjacentElement\('afterend',box\)/);
assert.match(idle,/#pveHuntView,#pveRiftView,#pveEscortView,#pveTowerView,#pveSealBattleView,#pveIdleDungeonView/);
assert.match(tower,/\['pveRaidHubView','pveRaidView','pveHuntView','pveRiftView','pveEscortView','pveSealBattleView','pveIdleDungeonView'\]\.forEach/);
const towerScript = index.match(/src="(js\/tower-v1038\.js\?[^"]+)"/)?.[1];
assert.ok(towerScript, 'the tower entry script is loaded');
assert.equal(new URL(towerScript.replaceAll('&amp;', '&'), 'https://game.test').searchParams.get('v'), '2098-hyper-codex');
assert.doesNotMatch(index,/idle-dungeon-v1600\.js/,'retired idle expedition must not load in the live shell');

console.log('PVE auxiliary navigation host v2023: OK');
