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
}
assert.equal(new Set(profiles).size,5,'card profiles must be unique');
assert.match(timeline,/const roleKind=normalizeSkillEffectKind\(effectKind\)/,'skills must normalize the server role kind');
assert.match(timeline,/const roleProfile=roleEffectProfile\(roleKind\)/,'skills must resolve the authored role-atlas profile');
assert.match(timeline,/const skillEffect=SkillEffectFX\.create\(\{/,'skills must use the shared authored role renderer');
assert.match(engine,/effectProfile:actor\.effectProfile\|\|card\.data\.effectProfile/);
assert.match(engine,/targetClass:victim\.isBoss\?'BOSS':'MONSTER'/);
assert.match(engine,/const isBossTarget=Boolean\(victim\.isBoss\)/);
assert.match(engine,/const stopByRole=\{ATTACK:isBossTarget\?138:92,DEFENSE:isBossTarget\?265:225,SPEED:isBossTarget\?118:74,HP:isBossTarget\?500:440\}/);
assert.match(engine,/intensity:\(isBossTarget\?1\.22:1\)\*\(advancementProfile\?\.shake\|\|roleProfile\.shake\)\*\(critical\?1\.12:1\)/);
assert.match(timeline,/const bossTarget=String\(targetClass\)\.toUpperCase\(\)==='BOSS'/);
assert.match(timeline,/intensity:bossTarget\?roleProfile\.shake\*1\.28:roleProfile\.shake/);
assert.match(engine,/this\.uniquePreviewIndex=\(index\+1\)%this\.allies\.length/);

assert.match(engine,/cutInTexture:this\.textures\.fakerArt/,'demo cut-in must use original Faker card art');
assert.match(engine,/cutInTexture:this\.textures\.taekArt/,'demo cut-in must use original Kim card art');
assert.match(engine,/cutInTexture:this\.textures\.zenithArt/,'demo cut-in must use original ZENITH card art');
assert.match(engine,/const sourceArt=originalCardArtUrl\(card,art\)/);
assert.doesNotMatch(engine,/target\.cutInTexture=texture;\s*target\.useFullBodySprite\(texture,260/,'battle SD must never overwrite card cut-in texture');
assert.match(engine,/const sourceArt=originalCardArtUrl\(card,art\)/,'cut-ins must resolve original card art independently of battle SD sprites');
assert.match(engine,/const sourceArt=originalCardArtUrl\(card,art\);[\s\S]*target\.cutInTexture=await Assets\.load\(sourceArt\)/,'runtime cut-ins must keep using the source card art contract');

assert.doesNotMatch(index,/type="importmap"/,'preview must not depend on cross-origin runtime modules');
assert.match(index,/project-v-client\.js\?v=72-battle-suit-continuous-fire/);
assert.match(client,/project-v-pixi-battle\.bundle\.js\?v=97-battle-suit-per-action-fire/);
assert.ok(fs.statSync('preview/project-v-v3/project-v-pixi-battle.bundle.js').size>500_000,'public PixiJS bundle must exist');

console.log('project-v V3 combat FX contract: OK');
