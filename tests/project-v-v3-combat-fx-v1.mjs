import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const engine=read('preview/project-v-v3/source/battle/BattleEngine.js');
const timeline=read('preview/project-v-v3/source/battle/SkillTimeline.js');
const client=read('preview/project-v-v3/project-v-client.js');
const index=read('preview/project-v-v3/index.html');

const profiles=['CRIMSON_RIFT','STORM_COMMAND','MOON_BLOOM','WIND_CHAIN','GUARD_PULSE'];
for(const profile of profiles){
  assert.match(engine,new RegExp(`effectProfile:'${profile}'`),`${profile} must be assigned to a card`);
  assert.match(timeline,new RegExp(`key==='${profile}'`),`${profile} needs its own renderer branch`);
}
assert.equal(new Set(profiles).size,5,'card profiles must be unique');
assert.match(engine,/effectProfile:card\.data\.effectProfile/);
assert.match(engine,/targetClass:victim\.isBoss\?'BOSS':'MONSTER'/);
assert.match(engine,/const isBossTarget=Boolean\(victim\.isBoss\)/);
assert.match(engine,/isBossTarget\?118:68/);
assert.match(engine,/intensity:isBossTarget\?\(critical\?26:20\):20/);
assert.match(timeline,/const bossTarget=String\(targetClass\)\.toUpperCase\(\)==='BOSS'/);
assert.match(timeline,/intensity:bossTarget\?28:20/);
assert.match(engine,/this\.uniquePreviewIndex=\(index\+1\)%this\.allies\.length/);

assert.match(engine,/cutInTexture:this\.textures\.fakerArt/,'demo cut-in must use original Faker card art');
assert.match(engine,/cutInTexture:this\.textures\.taekArt/,'demo cut-in must use original Kim card art');
assert.match(engine,/cutInTexture:this\.textures\.zenithArt/,'demo cut-in must use original ZENITH card art');
assert.match(engine,/const sourceArt=originalCardArtUrl\(card,art\)/);
assert.doesNotMatch(engine,/target\.cutInTexture=texture;\s*target\.useFullBodySprite\(texture,260/,'battle SD must never overwrite card cut-in texture');
assert.match(engine,/const sourceArt=originalCardArtUrl\(card,art\)/,'cut-ins must resolve original card art independently of battle SD sprites');
assert.match(engine,/const sourceArt=originalCardArtUrl\(card,art\);[\s\S]*target\.cutInTexture=await Assets\.load\(sourceArt\)/,'runtime cut-ins must keep using the source card art contract');

assert.doesNotMatch(index,/type="importmap"/,'preview must not depend on cross-origin runtime modules');
assert.match(index,/project-v-client\.js\?v=46-live-assets-first-frame/);
assert.match(client,/project-v-pixi-battle\.bundle\.js\?v=46-live-assets-first-frame/);
assert.ok(fs.statSync('preview/project-v-v3/project-v-pixi-battle.bundle.js').size>500_000,'public PixiJS bundle must exist');

console.log('project-v V3 combat FX contract: OK');
