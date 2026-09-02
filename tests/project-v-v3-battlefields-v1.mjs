import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine=fs.readFileSync('preview/project-v-v3/source/battle/BattleEngine.js','utf8');
const source=fs.readFileSync('preview/project-v-v3/source/project-v-pixi-battle.src.js','utf8');
const client=fs.readFileSync('preview/project-v-v3/project-v-client.js','utf8');
const html=fs.readFileSync('preview/project-v-v3/index.html','utf8');

const backgrounds={
  HUNT:'assets/ui/project-v/battlefields/v3-nightmare-forest-battlefield-v1.png',
  TOWER:'assets/ui/project-v/battlefields/v3-infinite-tower-sanctum-v1.png',
  PVP:'assets/ui/coin-prediction/arena-v1.png',
  RAID:'assets/ui/project-v/battlefields/v3-world-raid-obsidian-citadel-v1.png',
  SIEGE:'assets/ui/project-v/battlefields/v3-siege-fortress-courtyard-v1.png'
};

for(const [mode,file] of Object.entries(backgrounds)){
  assert.ok(fs.existsSync(file),`${mode} battlefield missing`);
  assert.ok(fs.statSync(file).size>100_000,`${mode} battlefield is unexpectedly small`);
  assert.match(engine,new RegExp(`${mode}:'\\.\\.\\/\\.\\.\\/${file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  assert.match(html,new RegExp(`data-battlefield="${mode}"`));
}

assert.doesNotMatch(engine,/ASSETS=\{\s*battlefield:/,'all battlefields must not be eagerly bundled');
assert.match(engine,/async setBattlefield\(/);
assert.match(engine,/loading:'LAZY_ACTIVE_SCENE_ONLY'/);
assert.match(engine,/if\(payload\?\.floor\)return 'TOWER'/);
assert.match(source,/setBattlefield/);
assert.match(client,/battleQcState\.battlefield=button\.dataset\.battlefield/);
assert.match(client,/ensureBattleQcSession\(\{reset:true\}\)/);
assert.match(client,/battlefieldMode:battleQcState\.battlefield/);
assert.match(client,/project-v-pixi-battle\.bundle\.js\?v=90-ballistic-impact-v1/);
assert.match(html,/project-v-client\.js\?v=69-ballistic-impact-v1/);
assert.ok(fs.statSync('preview/project-v-v3/project-v-pixi-battle.bundle.js').size>700_000,'rebuilt public Pixi bundle missing');

console.log('project-v V3 multi-battlefield contract: OK');
