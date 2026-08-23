import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const manifest=JSON.parse(await readFile('assets/sfx/v3/role-combat-sprite-v2.json','utf8'));
const audio=await readFile('assets/sfx/v3/role-combat-sprite-v2.mp3');
const mixer=await readFile('preview/project-v-v3/source/battle/BattleAudioMixer.js','utf8');
const {V3_ROLE_AUDIO_SPRITE}=await import('../preview/project-v-v3/source/battle/RoleAudioSpriteManifest.js');

assert.equal(audio.toString('ascii',0,3),'ID3');
assert.ok(audio.byteLength<200_000,'compressed combat audio must stay below 200 KB');
assert.equal(manifest.bytes,audio.byteLength);
assert.equal(Object.keys(manifest.cues).length,24);

const totalSeconds=15.52;
for(const [name,cue] of Object.entries(manifest.cues)){
  assert.ok(cue.offset>=0&&cue.duration>=.02,`${name} cue must be playable`);
  assert.ok(cue.offset+cue.duration<=totalSeconds+.001,`${name} cue exceeds sprite duration`);
}
for(const group of ['attack','defense','speed','hp']){
  assert.ok(manifest.cues[`${group}_cast_1`]);
  assert.ok(manifest.cues[`${group}_hit_3`]);
}
assert.ok(manifest.cues.critical_2&&manifest.cues.boss_2);
assert.match(mixer,/compressor-v2-audio-sprite/);
assert.match(mixer,/playCue\(`\$\{group\}_hit`/);
assert.match(mixer,/proceduralFallback/);
assert.match(mixer,/requestCount:1/);
assert.match(mixer,/schedulePreload/);
const constructorBlock=mixer.slice(mixer.indexOf('constructor(){'),mixer.indexOf('enabled(){'));
assert.doesNotMatch(constructorBlock,/preloadSprite\(/,'audio must not load in the renderer constructor');
assert.doesNotMatch(mixer,/role-combat-sprite-v1\.json/,'cue map must not add a second network request');
assert.doesNotMatch(mixer,/new Audio\(/,'V3 must not allocate HTMLAudio per hit');
assert.deepEqual(V3_ROLE_AUDIO_SPRITE,manifest,'bundled cue table must match the generated audio sprite');

console.log(`V3 audio sprite OK: ${Object.keys(manifest.cues).length} cues, ${audio.byteLength.toLocaleString()} bytes`);
