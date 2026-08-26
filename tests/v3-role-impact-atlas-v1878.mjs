import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fx=read('preview/project-v-v3/source/battle/SkillEffectFX.js');
const audio=read('preview/project-v-v3/source/battle/BattleAudioMixer.js');
const audioManifest=read('preview/project-v-v3/source/battle/RoleAudioSpriteManifest.js');
const engine=read('preview/project-v-v3/source/battle/BattleEngine.js');
const timeline=read('preview/project-v-v3/source/battle/SkillTimeline.js');
const pools=read('preview/project-v-v3/source/battle/ObjectPool.js');
const bundle=read('preview/project-v-v3/project-v-pixi-battle.bundle.js');
const app=read('js/app.js');
const index=read('index.html');
const previewIndex=read('preview/project-v-v3/index.html');
const previewClient=read('preview/project-v-v3/project-v-client.js');

const roles={
  attack:{prefix:'attack_',fps:22,collisionFrame:6,audioBytes:23866},
  defense:{prefix:'defense_',fps:18,collisionFrame:7,audioBytes:32643},
  speed:{prefix:'speed_',fps:26,collisionFrame:8,audioBytes:30136},
  heal:{prefix:'heal_',fps:17,collisionFrame:8,audioBytes:42048}
};

for(const [role,contract] of Object.entries(roles)){
  const base=`assets/ui/project-v/fx/role-impact-v2/${role}-impact-atlas-v2`;
  const atlas=JSON.parse(read(`${base}.json`));
  assert.equal(Object.keys(atlas.frames).length,12,`${role} must have 12 authored frames`);
  assert.equal(atlas.meta.fps,contract.fps,`${role} fps`);
  assert.equal(atlas.meta.collisionFrame,contract.collisionFrame,`${role} collision frame`);
  assert.equal(atlas.animations.impact.length,12,`${role} impact animation`);
  assert.ok(fs.statSync(`${base}.png`).size>1_000_000,`${role} atlas image missing`);

  const clip=fs.readFileSync(`assets/sfx/v3-role-impact-v2/${role}.mp3`);
  assert.equal(clip.toString('ascii',0,3),'ID3',`${role} must be a real MP3 asset`);
  assert.equal(clip.byteLength,contract.audioBytes,`${role} audio payload`);
}

assert.match(fx,/await SkillEffectFX\.preloadAll|preloadAll\(\)/);
assert.match(engine,/await Promise\.all\(\[SkillEffectFX\.preloadAll\(\),this\.audio\.prepare\(\)\]\)/,'role atlases and first-hit audio must both be ready before combat');
assert.match(fx,/autoUpdate:false/,'GSAP must own atlas frame progression');
assert.match(fx,/value:this\.spec\.collisionFrame/,'authored collision frame must land on the logical hit');
assert.match(fx,/renderer:'atlas-only'/);
assert.match(fx,/proceduralFallback:false/);
assert.match(engine,/roleKind===SKILL_EFFECT_KIND\.HP\?\{x:actor\.baseX,y:actor\.baseY-176\}:impact/,'heal atlas belongs on the caster');
assert.match(timeline,/roleKind===SKILL_EFFECT_KIND\.HP\?\{x:origin\.x,y:origin\.y-178\}:targetPoint/,'skill heal atlas belongs on the caster');
assert.match(engine,/playSupportEffect\(targets/,'server heal events need the same authored atlas');

assert.match(audio,/scheduleImpact\(kind,\{impactAt=\.25,playbackSpeed=1\.3/);
assert.match(audio,/realImpact-authoredSync/,'audio lead-in must be scheduled onto the hit');
assert.match(audio,/authoredSync-realImpact/,'backlog speed must seek into the clip when needed');
assert.match(audio,/requestCount:4/);
assert.match(app,/window\.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT=battleAudioContext/,'live start gesture must expose its unlocked audio context to V3');
assert.match(audio,/if\(globalThis\.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT\)this\.ensure\(\)/,'V3 must adopt the live context before automatic playback');
assert.match(audio,/if\(this\.ownsContext\)this\.context\?\.close/,'V3 must never close the shared live audio context');
assert.match(audio,/proceduralFallback:false/);
assert.match(audio,/retiredAudioSprite:false/);
for(const role of ['attack','defense','speed','heal'])assert.match(audioManifest,new RegExp(`${role}\\.mp3`));
assert.match(app,/function v3RoleAudioOwnsBattle\(\)\{return Boolean\(document\.querySelector\('\.modal\.show \.battle-v3-live-shell'\)\)\}/,'visible V3 battles must own their audio bus');
assert.match(app,/function battleTone\([^)]*\)\{if\(!battleSoundEnabled\(\)\|\|v3RoleAudioOwnsBattle\(\)\)return/,'legacy tone must be blocked inside V3');
assert.match(app,/function battleSfx\([^)]*\)\{if\(!battleSoundEnabled\(\)\|\|v3RoleAudioOwnsBattle\(\)\)return/,'legacy impact SFX must be blocked inside V3');

const retired=[
  /role-combat-sprite-v2/,
  /createOscillator/,
  /proceduralSlash/,
  /slash-fx/,
  /makeSignatureFx/,
  /ROLE_FX_/,
  /assets\/fx\/role-/,
  /pools\.slash/,
  /\.playCast\(/,
  /\.playImpact\(/
];
for(const pattern of retired){
  for(const [name,value] of Object.entries({fx,audio,engine,timeline,pools,bundle})){
    assert.doesNotMatch(value,pattern,`${name} still contains retired V3 presentation code: ${pattern}`);
  }
}

assert.match(bundle,/role-impact-v2/);
assert.match(bundle,/v3-role-impact-v2/);
assert.ok(fs.statSync('preview/project-v-v3/project-v-pixi-battle.bundle.js').size>700_000);
assert.match(app,/project-v-pixi-battle\.bundle\.js\?v=67-role-impact-atlas/);
assert.match(index,/js\/app\.js\?v=1878-v3-role-impact-atlas/);
assert.match(previewIndex,/project-v-client\.js\?v=53-role-impact-atlas/);
assert.match(previewClient,/project-v-pixi-battle\.bundle\.js\?v=53-role-impact-atlas/);

console.log('Project V V3 role impact atlas/audio live contract: PASS');
