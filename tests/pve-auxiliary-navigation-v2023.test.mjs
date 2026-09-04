import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [idle,tower,index]=await Promise.all([
  read('js/idle-dungeon-v1600.js'),
  read('js/tower-v1038.js'),
  read('index.html')
]);

for(const source of [idle,tower]){
  assert.match(source,/placementAnchor=document\.getElementById\('pveRaidHubView'\)\|\|raid/);
  assert.match(source,/placementAnchor\.insertAdjacentElement\('afterend',(?:view|box)\)/);
  assert.match(source,/pveRaidHubView/);
  assert.match(source,/pveEscortView/);
  assert.match(source,/raidHost=document\.getElementById\('pveRaidHubView'\)\|\|document\.getElementById\('pveRaidView'\)/);
}
assert.match(idle,/#pveHuntView,#pveRiftView,#pveEscortView,#pveTowerView,#pveSealBattleView,#pveIdleDungeonView/);
assert.match(tower,/\['pveHuntView','pveRiftView','pveEscortView','pveSealBattleView','pveIdleDungeonView'\]/);
assert.match(index,/tower-v1038\.js\?v=2023-pve-navigation-host/);
assert.match(index,/idle-dungeon-v1600\.js\?v=2026-continuous-expedition/);

console.log('PVE auxiliary navigation host v2023: OK');
