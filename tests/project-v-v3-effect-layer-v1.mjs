import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fx=read('preview/project-v-v3/source/battle/SkillEffectFX.js');
const timeline=read('preview/project-v-v3/source/battle/SkillTimeline.js');
const engine=read('preview/project-v-v3/source/battle/BattleEngine.js');

for(const kind of ['ATTACK','DEFENSE','SPEED','HEAL']){
  assert.match(fx,new RegExp(`${kind}:'${kind}'`),`${kind} effect kind must exist`);
  assert.match(engine,new RegExp(`effectKind:'${kind}'`),`${kind} must be reachable from a battle card`);
}

assert.match(fx,/atlasPath:'assets\/fx\/slash_sheet\.json'/,'future slash atlas path must be explicit');
assert.match(fx,/Assets\.load\(spec\.atlasPath\)/,'atlas swap must use Pixi Assets');
assert.match(fx,/new AnimatedSprite\(/,'loaded frames must switch to AnimatedSprite');
assert.match(fx,/frameCount:12/,'frame-count contract must remain data driven');

assert.match(fx,/ellipse\(0,0,75,25\)/,'attack placeholder must be exactly 150x50');
assert.match(fx,/0xffef62/,'placeholder needs neon yellow');
assert.match(fx,/0x56e7ff/,'placeholder needs cyan blue');
assert.match(fx,/blendMode:'add'/,'additive blending must be configured');
assert.match(fx,/blendMode:'screen'/,'screen blending must be configured');
assert.match(fx,/at=\.35,duration=\.2/,'effect lifetime must default to 350ms impact and 200ms release');
assert.match(fx,/timeline\.call\(\(\)=>this\.release\(\),\[\],at\+duration\)/,'effect must release after playback');

assert.match(fx,/new ColorMatrixFilter\(\)/,'white flash must use a GPU color-matrix filter');
assert.match(fx,/durationMs=50/,'white flash must default to exactly 50ms');
assert.match(fx,/0,0,0,1,0/,'white flash must preserve source alpha');
assert.match(fx,/visual\.filters=\[\.\.\.previous,filter\]/,'white flash must preserve existing filters');
assert.match(fx,/filter\.destroy\?\.\(\)/,'white flash filter must be released');

assert.match(timeline,/triggerWhiteFlash\(target,\{durationMs:50\}\)/,'flash must fire at collision');
assert.match(fx,/display\.scale\.set\(\.3\)/,'FX must begin at 0.3 scale');
assert.match(fx,/x:1\.5,y:1\.5,duration:burstDuration,ease:'expo\.out'/,'FX must burst to 1.5 with expo.out');
assert.match(timeline,/applyWebGLBlendTree\(targetFx,'screen'\)/,'impact rings must use screen composition');
assert.match(timeline,/skillEffect\.play\(timeline,\{at:\.35,duration:\.2\}\)/,'FX must synchronize at 350ms');
assert.match(timeline,/whiteFlashHandle\?\.release\(\)/,'timeline cleanup must release flash');
assert.match(timeline,/skillEffect\.release\(\)/,'timeline cleanup must release FX');
assert.match(engine,/effectKind:card\.data\.effectKind/,'per-card FX kind must reach SkillTimeline');
assert.match(engine,/collisionAtMs:350/);
assert.match(engine,/whiteFlashMs:50/);
assert.match(engine,/releaseAfterMs:200/);

console.log('project-v V3 EffectLayer placeholder contract: OK');
