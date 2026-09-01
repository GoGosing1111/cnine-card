import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();

const [html,client,css,entry,bundle,audioSource,manifestText,liveIndex,liveApp,liveBattle]=await Promise.all([
  read('preview/project-v-v3/index.html'),
  read('preview/project-v-v3/project-v-client.js'),
  read('preview/project-v-v3/project-v-modules.css'),
  read('preview/project-v-v3/source/project-v-pixi-battle.src.js'),
  read('preview/project-v-v3/project-v-pixi-battle.bundle.js'),
  read('preview/project-v-v3/project-v-firearm-qc-audio.js'),
  read('preview/project-v-v3/assets/audio/firearm-qc-v1/manifest.json'),
  read('index.html'),read('js/app.js'),read('js/battle-v3-live.js')
]);
const manifest=JSON.parse(manifestText);

const expectedProfiles={
  EQ_1785427638137:{file:'m4a1-colt-socom-cc0-freesound-737569.mp3',sha:'1735B196B5DB6369D734EE5731834E35C9AD17A2A32353E9D809B6C6C2ECB6F2',kind:'AR',soundId:737569},
  EQ_1785961232958:{file:'ak47-shot-cc0-freesound-163457.mp3',sha:'26BBB8986AEA9958B1C5DA48C8EEC1B205AA153680EF74DCD2B344C5863E5B73',kind:'AR',soundId:163457},
  EQ_1785961300455:{file:'m200-tac50-suppressed-proxy-cc0-freesound-737570.mp3',sha:'F4E5F79C3D4BB47C9A8D396564CD02FDD099C26E9FDD37BB75DB563B9A2C4C8B',kind:'SNIPER',soundId:737570}
};

test('V3 preview mounts the real five-card PVE payload plus one non-damaging front-left account unit',()=>{
  assert.match(html,/id="pvBattleSuitQc"/);
  assert.match(html,/id="pvBattleSuitFire"/);
  assert.equal((html.match(/data-qc-suit="BATTLE_SUIT_0[123]"/g)||[]).length,3);
  for(const code of Object.keys(expectedProfiles))assert.match(html,new RegExp(`data-qc-weapon="${code}"`));
  assert.match(html,/project-v-firearm-qc-audio\.js\?v=2-gesture-prime-output-attenuation/);
  assert.match(html,/project-v-client\.js\?v=56-front-left-replay-audio-fix/);
  assert.match(client,/project-v-pixi-battle\.bundle\.js\?v=76-front-left-replay-fix/);
  assert.equal((client.match(/\['QC-(?:FAKER|TAEK|PPLI|AYOON|BONG)'/g)||[]).length,5,'preview fixture must remain exactly five canonical cards');
  assert.match(client,/v3RenderContext:\{accountBattleUnitPve:pveAllowed,previewContract:'BATTLE_SUIT_FIREARM_QC_V1'\}/);
  assert.match(client,/pveBattlefields=new Set\(\['HUNT','TOWER','RAID'\]\)/);
  assert.match(client,/battleSuitPve:35000/);
  assert.match(client,/canonicalAllyFormationCount/);
  assert.match(client,/unit\.affectsDamage===false/);
  assert.match(css,/\.pv-battle-suit-qc\{/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.pv-battle-suit-qc\{top:112px/);
});

test('preview-only public shot hook reports the exact authored fire frame and never adds damage',()=>{
  assert.match(entry,/async function playAccountPreviewShot/);
  assert.match(entry,/name==='fire'/);
  assert.match(entry,/fireAt=performance\.now\(\)/);
  assert.match(entry,/engine\.playAccountBattleUnitCosmeticShot\(\)/);
  assert.doesNotMatch(entry.slice(entry.indexOf('async function playAccountPreviewShot'),entry.indexOf('\nconst api=')),/damage|setHp|syncTargetHp/);
  assert.match(entry,/playAccountPreviewShot,cancelActiveAnimations/);
  assert.match(bundle,/playAccountPreviewShot/,'rebuilt browser bundle must expose the QC hook');
  assert.match(client,/plan\?\.markVisualFire\?\.\(at\)/);
});

test('three immutable CC0 real-recording profiles satisfy provenance, hash and waveform QC',async()=>{
  assert.equal(manifest.contract,'PROJECT_V_V3_FIREARM_AUDIO_QC_V1');
  assert.equal(manifest.scope,'PREVIEW_ONLY');
  assert.equal(manifest.liveRuntimeConnected,false);
  assert.equal(manifest.retrievedAt,'2026-09-01');
  assert.equal(manifest.previewOutput.gain,.5);
  assert.equal(manifest.previewOutput.attenuationDb,-6.02);
  assert.equal(manifest.previewOutput.appliesAfterProfileMasterGain,true);
  assert.equal(manifest.visualSync.strongestImpactToleranceMs,20);
  assert.deepEqual(manifest.layerContract,['ACTION_NOTICE','BALLISTIC_IMPACT','ACOUSTIC_TAIL']);
  assert.deepEqual(Object.keys(manifest.profiles).sort(),Object.keys(expectedProfiles).sort());
  assert.equal(Object.values(manifest.profiles).filter(profile=>profile.weaponClass==='AR').length,2);
  assert.equal(Object.values(manifest.profiles).filter(profile=>profile.weaponClass==='SNIPER').length,1);

  for(const [code,expected] of Object.entries(expectedProfiles)){
    const profile=manifest.profiles[code];
    assert.equal(profile.weaponClass,expected.kind,code);
    assert.equal(profile.source.soundId,expected.soundId,code);
    assert.equal(profile.source.license,'CC0 1.0',code);
    assert.equal(profile.source.licenseUrl,'https://creativecommons.org/publicdomain/zero/1.0/',code);
    assert.match(profile.source.page,new RegExp(`/sounds/${expected.soundId}/$`),code);
    assert.match(profile.source.author,/\S+/,code);
    assert.match(profile.source.recording,/real|recorded/i,code);
    assert.equal(profile.source.sourceSha256,expected.sha,code);
    assert.equal(profile.final.sha256,expected.sha,code);
    assert.equal(profile.final.sampleRateHz,44100,code);
    assert.equal(profile.final.channels,2,code);
    assert.ok(profile.final.durationMs>500,code);
    assert.ok(profile.final.peakMs>=0,code);
    assert.ok(profile.runtimeMix.masterGain>0&&profile.runtimeMix.masterGain<1,code);
    assert.deepEqual(Object.keys(profile.runtimeMix).filter(key=>key!=='masterGain').sort(),['action','impact','tail'],code);
    const bytes=await readFile(new URL(`preview/project-v-v3/assets/audio/firearm-qc-v1/${expected.file}`,root));
    assert.equal(sha256(bytes),expected.sha,code);
    assert.ok(bytes.length>15000,`${code} audio payload is unexpectedly empty`);
  }
  assert.match(manifest.profiles.EQ_1785961300455.proxyDisclosure,/exact database M200 sprite/);
  assert.match(manifest.profiles.EQ_1785961300455.acousticLabel,/Tac-50/);
  assert.equal(manifest.profiles.EQ_1785961232958.final.clippedFrames,12);
  assert.ok(manifest.profiles.EQ_1785961232958.runtimeMix.masterGain<=.58,'AK saturated source must keep conservative preview gain');
});

test('audio renderer uses only real buffer layers and remains disconnected from live runtime',()=>{
  assert.match(audioSource,/manifest\.json\?v=2-output-attenuation/);
  for(const layer of manifest.layerContract)assert.match(audioSource,new RegExp(`kind:'${layer}'`));
  assert.equal((audioSource.match(/sourceLayer\(audioContext,buffer,\{\s*\n\s*kind:/g)||[]).length,3);
  assert.match(audioSource,/createBufferSource\(\)/);
  assert.match(audioSource,/decodeAudioData/);
  assert.match(audioSource,/strongestImpactToleranceMs/);
  assert.match(audioSource,/const previewOutputGain=clamp\(finite\(manifest\.previewOutput\?\.gain,1\),0,1\)/);
  assert.match(audioSource,/const master=clamp\(finite\(mix\.masterGain,1\),0,1\)\*previewOutputGain/);
  assert.match(audioSource,/previewOutputAttenuationDb/);
  assert.match(audioSource,/addEventListener\('pointerdown',primeFromTrustedGesture,\{capture:true,passive:true\}\)/);
  assert.match(audioSource,/addEventListener\('click',primeFromTrustedGesture,\{capture:true,passive:true\}\)/);
  assert.match(audioSource,/event\?\.isTrusted/);
  assert.match(audioSource,/#pvBattleSuitFire,#pvBattleSoundToggle/);
  assert.match(audioSource,/gesturePrimeSucceeded/);
  assert.match(audioSource,/Math\.abs\(deltaMs\)<=manifest\.visualSync\.strongestImpactToleranceMs/);
  assert.doesNotMatch(audioSource,/createOscillator|OscillatorNode|createPeriodicWave|ScriptProcessor|AudioWorklet|Math\.random|white[ _-]?noise|pink[ _-]?noise/i);
  assert.doesNotMatch(audioSource,/sine|sawtooth|square wave|synth tone|ui beep/i);
  for(const source of [liveIndex,liveApp,liveBattle]){
    assert.doesNotMatch(source,/project-v-firearm-qc-audio|firearm-qc-v1|freesound-737569|freesound-163457|freesound-737570/i);
  }
});
