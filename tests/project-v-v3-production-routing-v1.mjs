import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));

const app=read('js/app.js');
const v2=read('js/battle-v2-live.js');
const v3=read('js/battle-v3-live.js');
const tower=read('js/tower-v1038.js');
const engine=read('preview/project-v-v3/source/battle/BattleEngine.js');
const index=read('index.html');

for(const token of [
  'css/battle-v3-live.css?v=1930-mobile-context-recovery',
  'js/project-v-battle-art-adapter-v1.js?v=3.7.0-orikkung-heeya',
  'js/project-v-tier-battle-art-adapter-v1.js?v=3.5.0-superstar-haaland',
  'js/project-v-monster-battle-art-adapter-v1.js?v=5.3.0-apocalypse-edward-kenshin',
  'js/project-v-unassigned-battle-fallback-v1.js?v=3.1.0-manifest-cache',
  'preview/project-v-v3/project-v-firearm-qc-audio.js?v=7-live-pve-continuous-fire',
  'preview/project-v-v3/project-v-pixi-battle.bundle.js?v=97-battle-suit-per-action-fire',
  'js/battle-v3-live.js?v=3.30.0-battle-suit-per-action-fire'
])assert.ok(app.includes(token),`production feature manifest missing ${token}`);

assert.match(app,/ready:\(\)=>Boolean\(window\.ProjectVFirearmAudio\)&&Boolean\(window\.ProjectVBattleV3Live\?\.ready\?\.\(\)\)/);
assert.match(v2,/ProjectVBattleV3Live\?\.ready/);
assert.match(v2,/ProjectVBattleV3Live\.createRenderer/);
assert.match(v3,/PROJECT V · PIXIJS WEBGL/);
assert.match(tower,/playTowerBattleV3Live/);
assert.match(tower,/ensureFeatureResources\('battleV2'\)/);
assert.match(engine,/type==='ATTACK'\|\|type==='TURN'/);
assert.match(engine,/type==='BOSS_ULTIMATE'/);
assert.match(engine,/type==='MAGIC_CARD'/);
assert.match(engine,/type==='KO'/);
assert.match(engine,/character\.battleActive!==false/);
assert.match(engine,/\{id:'ENEMY-05'/);
assert.match(engine,/return key&&id\.endsWith\(`:\$\{key\}`\)/);
assert.ok(index.includes('js/app.js?v=2005-battle-suit-independent-fire'));
assert.ok(index.includes('js/responsive-battle-sprites-v1815.js?v=1958-zenith-apocalypse-sd'));
assert.ok(index.includes('js/responsive-superstar-battle-sprites-v1896.js?v=1922-superstar-haaland-sd'));
assert.ok(index.includes('js/tower-v1038.js?v=1761-project-v-v3-live'));

const bundle='preview/project-v-v3/project-v-pixi-battle.bundle.js';
assert.ok(exists(bundle),'V3 PixiJS bundle missing');
assert.ok(fs.statSync(path.join(root,bundle)).size>700_000,'V3 bundle is unexpectedly small');

const manifests=[
  'assets/ui/project-v/characters/zenith/manifest-v1.json',
  'assets/ui/project-v/characters/fur/manifest-v2.json',
  'assets/ui/project-v/characters/prestige/manifest-v1.json',
  'assets/ui/project-v/characters/superstar/manifest-v1.json',
  'assets/ui/project-v/monsters/hunt-tower/manifest-v1.json',
  'assets/ui/project-v/fallback/manifest-v1.json'
];
for(const file of manifests){
  assert.ok(exists(file),`${file} missing`);
  const value=JSON.parse(read(file));
  assert.equal(value.scope,'BATTLE_ENGINE_ONLY',`${file} scope`);
  const entries=value.characters||value.sprites||Object.values(value.fallbacks||{}).filter(item=>item?.battleSprite);
  for(const entry of entries){
    if(!entry.battleSprite)continue;
    assert.ok(exists(entry.battleSprite),`${entry.battleSprite} missing`);
  }
}

for(const file of [
  'css/battle-v3-live.css','js/battle-v3-live.js','js/project-v-battle-art-adapter-v1.js',
  'js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js',
  'js/project-v-unassigned-battle-fallback-v1.js'
])assert.ok(exists(file),`${file} missing`);

console.log('project-v-v3 production routing: OK');
