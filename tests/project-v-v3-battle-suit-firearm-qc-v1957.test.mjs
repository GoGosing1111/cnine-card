import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();

const [html,client,baseCss,cardCss,css,responsiveCss,entry,engineSource,bundle,audioSource,manifestText,sourcesText,liveIndex,liveApp,liveBattle]=await Promise.all([
  read('preview/project-v-v3/index.html'),
  read('preview/project-v-v3/project-v-client.js'),
  read('preview/project-v-v3/project-v-client.css'),
  read('preview/project-v-v3/project-v-card-frames.css'),
  read('preview/project-v-v3/project-v-modules.css'),
  read('preview/project-v-v3/project-v-responsive-fixes.css'),
  read('preview/project-v-v3/source/project-v-pixi-battle.src.js'),
  read('preview/project-v-v3/source/battle/BattleEngine.js'),
  read('preview/project-v-v3/project-v-pixi-battle.bundle.js'),
  read('preview/project-v-v3/project-v-firearm-qc-audio.js'),
  read('preview/project-v-v3/assets/audio/firearm-qc-v1/manifest.json'),
  read('preview/project-v-v3/assets/audio/firearm-qc-v1/SOURCES.md'),
  read('index.html'),read('js/app.js'),read('js/battle-v3-live.js')
]);
const manifest=JSON.parse(manifestText);

const expectedProfiles={
  EQ_1785427638137:{file:'m4a1-colt-socom-cc0-freesound-737569.mp3',sha:'1735B196B5DB6369D734EE5731834E35C9AD17A2A32353E9D809B6C6C2ECB6F2',kind:'AR',soundId:737569},
  EQ_1785961232958:{file:'ak47-shot-cc0-freesound-163457.mp3',sha:'26BBB8986AEA9958B1C5DA48C8EEC1B205AA153680EF74DCD2B344C5863E5B73',kind:'AR',soundId:163457},
  EQ_1785961300455:{file:'m200-tac50-suppressed-proxy-cc0-freesound-737570.mp3',sha:'F4E5F79C3D4BB47C9A8D396564CD02FDD099C26E9FDD37BB75DB563B9A2C4C8B',kind:'SNIPER',soundId:737570},
  EQ_1786966923833:{file:'ak47-shot-cc0-freesound-163457.mp3',sha:'26BBB8986AEA9958B1C5DA48C8EEC1B205AA153680EF74DCD2B344C5863E5B73',kind:'DMR',soundId:163457}
};

test('V3 preview mounts the real five-card PVE payload plus one non-damaging front-left account unit',()=>{
  assert.match(html,/id="pvBattleSuitQc"/);
  assert.match(html,/id="pvBattleSuitFire"/);
  assert.equal((html.match(/data-qc-suit="BATTLE_SUIT_0[123]"/g)||[]).length,3);
  for(const code of Object.keys(expectedProfiles))assert.match(html,new RegExp(`data-qc-weapon="${code}"`));
  assert.match(html,/project-v-firearm-qc-audio\.js\?v=6-sks-dmr-proxy/);
  assert.match(html,/project-v-client\.js\?v=68-battle-suit03-helmet-power/);
  assert.match(html,/params\.has\('qc'\).*params\.has\('suit23'\).*params\.get\('view'\) !== 'battle'/s,
    'shared QC links must automatically open the visible battle module');
  assert.match(html,/querySelector\('\[data-open-module="battle"\]'\)\?\.click\(\)/,
    'shared QC links must reuse the real battle-module click path');
  assert.match(baseCss,/\.pv-client\{/);
  assert.match(baseCss,/\.pv-environment\{/);
  assert.match(baseCss,/\.pv-topbar\{/);
  assert.doesNotMatch(baseCss,/(?:^|})\.client\{|(?:^|})\.studio-bg\{|(?:^|})\.top-hud\{/,
    'V3 base stylesheet must match the pv-* HTML contract');
  const htmlClasses=new Set([...html.matchAll(/\bclass="([^"]+)"/g)].flatMap(match=>match[1].trim().split(/\s+/)).filter(Boolean));
  const styledClasses=new Set([...`${baseCss}\n${cardCss}\n${css}\n${responsiveCss}`.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match=>match[1]));
  assert.deepEqual([...htmlClasses].filter(name=>!styledClasses.has(name)).sort(),[],
    'every static V3 preview class must have a stylesheet contract');
  assert.match(client,/project-v-pixi-battle\.bundle\.js\?v=89-battle-suit03-helmet-power/);
  assert.equal((client.match(/\['QC-(?:FAKER|TAEK|PPLI|AYOON|BONG)'/g)||[]).length,5,'preview fixture must remain exactly five canonical cards');
  assert.match(client,/v3RenderContext:\{accountBattleUnitPve:pveAllowed,previewContract:'BATTLE_SUIT_FIREARM_QC_V1'\}/);
  assert.match(client,/pveBattlefields=new Set\(\['HUNT','TOWER','RAID'\]\)/);
  assert.match(client,/BATTLE_SUIT_01:\{[^}]*pvePower:100000/);
  assert.match(client,/BATTLE_SUIT_02:\{[^}]*pvePower:200000/);
  assert.match(client,/BATTLE_SUIT_03:\{[^}]*pvePower:300000/);
  assert.match(client,/battleSuitPve:suit\.pvePower/);
  assert.match(client,/canonicalAllyFormationCount/);
  assert.match(client,/unit\.affectsDamage===false/);
  assert.match(css,/\.pv-battle-suit-qc\{/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.pv-battle-suit-qc\{top:112px/);
});

test('preview-only public shot hook reports the exact authored fire frame and never adds damage',()=>{
  assert.match(entry,/async function playAccountPreviewShot/);
  assert.match(entry,/async function restoreDeployedFormation/);
  assert.match(entry,/engine\.deployCards\(\{force:true,instant:true\}\)/);
  assert.match(entry,/name==='fire'/);
  assert.match(entry,/fireAt=performance\.now\(\)/);
  assert.match(entry,/engine\.playAccountBattleUnitCosmeticShot\(\)/);
  assert.doesNotMatch(entry.slice(entry.indexOf('async function playAccountPreviewShot'),entry.indexOf('\nconst api=')),/damage|setHp|syncTargetHp/);
  assert.match(entry,/playAccountPreviewShot,setAccountPreviewFirearmHook,cancelActiveAnimations/);
  assert.match(entry,/setAccountPreviewFirearmHook/);
  assert.match(entry,/accountPreviewFirearmHook=typeof handler==='function'\?handler:null/);
  assert.match(entry,/engine\.setAccountBattleUnitPreviewFireHook\(accountPreviewFirearmHook\)/);
  assert.match(bundle,/playAccountPreviewShot/,'rebuilt browser bundle must expose the QC hook');
  assert.match(bundle,/restoreDeployedFormation/,'rebuilt browser bundle must expose gap-free profile restoration');
  assert.match(client,/plan\?\.markVisualFire\?\.\(at\)/);
  assert.match(client,/setAccountPreviewFirearmHook/);
  assert.match(client,/armSustainedShot/);
  assert.match(client,/event\?\.phase==='fire'/);
  assert.match(client,/plan\?\.markVisualFire\?\.\(event\.at\)/);
  assert.match(client,/isCancelled:event\.isCancelled/);
  const sessionFlow=client.slice(client.indexOf('const ensureBattleQcSession='),client.indexOf('const bindBattleAutoAudioHook='));
  assert.match(sessionFlow,/restoreDeployedFormation/);
  assert.ok(sessionFlow.indexOf('restoreDeployedFormation')<sessionFlow.indexOf('setVisible(true)'),'profile formation must be restored before Pixi resumes rendering');
  assert.match(sessionFlow,/if\(!restoredWithoutReplay\)await api\.playEvents\(\[\{type:'DEPLOY'\}\]\)/);
  assert.match(client,/const battleReplayPlaying=\(\)=>Boolean\(window\.ProjectVPixiBattle\?\.diagnostics\?\.\(\)\.playing\)/);
  const manualFireHandler=client.slice(client.indexOf("document.getElementById('pvBattleSuitFire')"),client.indexOf("document.querySelectorAll('[data-battlefield]')"));
  assert.ok(manualFireHandler.indexOf('battleReplayPlaying()')<manualFireHandler.indexOf('armShot'),'automatic replay guard must run before manual audio is armed');
  assert.match(engineSource,/const previewRun=this\.accountBattleUnitFireRun/);
  assert.match(engineSource,/const previewHook=previewRun\?\.active\?this\.accountBattleUnitPreviewFireHook:null/);
  assert.match(engineSource,/if\(!previewRun\.active\|\|this\.accountBattleUnitFireRun!==previewRun\)return false/);
  assert.match(engineSource,/if\(name==='fire'\)notifyPreviewFire\(\)/);
  assert.match(engineSource,/phase:'anticipation'/);
  assert.match(engineSource,/phase:'fire'/);
});

test('four preview profiles backed by three immutable CC0 real recordings satisfy provenance, hash and waveform QC',async()=>{
  assert.equal(manifest.contract,'PROJECT_V_V3_FIREARM_AUDIO_QC_V1');
  assert.equal(manifest.scope,'PREVIEW_ONLY');
  assert.equal(manifest.liveRuntimeConnected,false);
  assert.equal(manifest.retrievedAt,'2026-09-01');
  assert.equal(manifest.previewOutput.gain,.25);
  assert.equal(manifest.previewOutput.attenuationDb,-12.04);
  assert.equal(manifest.previewOutput.appliesAfterProfileMasterGain,true);
  assert.equal(manifest.previewOutput.automaticFire.shotGain,.55);
  assert.equal(manifest.previewOutput.automaticFire.maxConcurrentShots,2);
  assert.equal(manifest.visualSync.strongestImpactToleranceMs,20);
  assert.deepEqual(manifest.layerContract,['ACTION_NOTICE','BALLISTIC_IMPACT','ACOUSTIC_TAIL']);
  assert.deepEqual(Object.keys(manifest.profiles).sort(),Object.keys(expectedProfiles).sort());
  assert.equal(Object.values(manifest.profiles).filter(profile=>profile.weaponClass==='AR').length,2);
  assert.equal(Object.values(manifest.profiles).filter(profile=>profile.weaponClass==='SNIPER').length,1);
  assert.equal(Object.values(manifest.profiles).filter(profile=>profile.weaponClass==='DMR').length,1);

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
  assert.match(manifest.profiles.EQ_1786966923833.proxyDisclosure,/exact database SKS sprite/);
  assert.match(manifest.profiles.EQ_1786966923833.proxyDisclosure,/7\.62x39mm proxy/);
  assert.match(manifest.profiles.EQ_1786966923833.proxyDisclosure,/not presented as an exact SKS receiver recording/);
  assert.match(sourcesText,/Sovereign SKS visual/);
  assert.match(sourcesText,/source bytes are not copied, regenerated, or altered/);
  assert.equal(manifest.profiles.EQ_1785961232958.final.clippedFrames,12);
  assert.ok(manifest.profiles.EQ_1785961232958.runtimeMix.masterGain<=.58,'AK saturated source must keep conservative preview gain');
  assert.ok(manifest.profiles.EQ_1786966923833.runtimeMix.masterGain<=.46,'SKS proxy must keep a conservative DMR preview gain');
});

test('audio renderer uses only real buffer layers and remains disconnected from live runtime',()=>{
  assert.match(audioSource,/manifest\.json\?v=6-sks-dmr-proxy/);
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
  assert.match(audioSource,/#pvBattleSuitFire,#pvBattleSoundToggle,#pvBattleStart/);
  assert.match(audioSource,/gesturePrimeSucceeded/);
  assert.match(audioSource,/async function armSustainedShot/);
  assert.match(audioSource,/while\(sustainedShotGroups\.length>=maxConcurrentShots\)stopSourceGroup/);
  assert.match(audioSource,/Math\.abs\(deltaMs\)<=manifest\.visualSync\.strongestImpactToleranceMs/);
  assert.doesNotMatch(audioSource,/createOscillator|OscillatorNode|createPeriodicWave|ScriptProcessor|AudioWorklet|Math\.random|white[ _-]?noise|pink[ _-]?noise/i);
  assert.doesNotMatch(audioSource,/sine|sawtooth|square wave|synth tone|ui beep/i);
  for(const source of [liveIndex,liveApp,liveBattle]){
    assert.doesNotMatch(source,/project-v-firearm-qc-audio|firearm-qc-v1|freesound-737569|freesound-163457|freesound-737570/i);
  }
});

test('stop invalidates a first-use automatic shot that is still decoding',async()=>{
  let releaseDecode;
  let signalDecodeStarted;
  let createdSources=0;
  const decodeStarted=new Promise(resolve=>{signalDecodeStarted=resolve});
  const decodedBuffer=new Promise(resolve=>{releaseDecode=resolve});
  class FakeSource{
    connect(node){return node}
    start(){}
    stop(){}
    disconnect(){}
  }
  class FakeGain{
    constructor(){this.gain={setValueAtTime(){},linearRampToValueAtTime(){}}}
    connect(node){return node}
    disconnect(){}
  }
  class FakeAudioContext{
    constructor(){this.state='running';this.currentTime=1;this.destination={}}
    resume(){return Promise.resolve()}
    createBufferSource(){createdSources+=1;return new FakeSource()}
    createGain(){return new FakeGain()}
    decodeAudioData(){signalDecodeStarted();return decodedBuffer}
  }
  const sandbox={
    console,
    AudioContext:FakeAudioContext,
    performance:{now:()=>1000},
    fetch:async url=>String(url).includes('manifest.json')
      ?{ok:true,json:async()=>manifest}
      :{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}
  };
  runInNewContext(audioSource,sandbox,{filename:'project-v-firearm-qc-audio.js'});
  const audio=sandbox.ProjectVFirearmQcAudio;
  const pending=audio.armSustainedShot('EQ_1785427638137',{enabled:true,visualLeadMs:45});
  await decodeStarted;
  audio.stop();
  releaseDecode({duration:4});
  const plan=await pending;

  assert.equal(plan.scheduled,false);
  assert.equal(plan.reason,'CANCELLED_BY_STOP');
  assert.equal(createdSources,0,'a stopped decode must not create any late WebAudio layer');
  assert.equal(audio.diagnostics().activeLayers,0);
  assert.equal(audio.diagnostics().sustainedShotGroups,0);
  assert.equal(audio.diagnostics().audioEpoch,1);
});

test('a stopped sustained run cancels pending decode without globally stopping audio',async()=>{
  let releaseDecode;
  let signalDecodeStarted;
  let createdSources=0;
  let runCancelled=false;
  const decodeStarted=new Promise(resolve=>{signalDecodeStarted=resolve});
  const decodedBuffer=new Promise(resolve=>{releaseDecode=resolve});
  class FakeSource{
    connect(node){return node}
    start(){}
    stop(){}
    disconnect(){}
  }
  class FakeGain{
    constructor(){this.gain={setValueAtTime(){},linearRampToValueAtTime(){}}}
    connect(node){return node}
    disconnect(){}
  }
  class FakeAudioContext{
    constructor(){this.state='running';this.currentTime=1;this.destination={}}
    resume(){return Promise.resolve()}
    createBufferSource(){createdSources+=1;return new FakeSource()}
    createGain(){return new FakeGain()}
    decodeAudioData(){signalDecodeStarted();return decodedBuffer}
  }
  const sandbox={
    console,
    AudioContext:FakeAudioContext,
    performance:{now:()=>1000},
    fetch:async url=>String(url).includes('manifest.json')
      ?{ok:true,json:async()=>manifest}
      :{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}
  };
  runInNewContext(audioSource,sandbox,{filename:'project-v-firearm-qc-audio.js'});
  const audio=sandbox.ProjectVFirearmQcAudio;
  const pending=audio.armSustainedShot('EQ_1785427638137',{
    enabled:true,
    visualLeadMs:45,
    isCancelled:()=>runCancelled
  });
  await decodeStarted;
  runCancelled=true;
  releaseDecode({duration:4});
  const plan=await pending;

  assert.equal(plan.scheduled,false);
  assert.equal(plan.reason,'CANCELLED_BY_RUN');
  assert.equal(createdSources,0,'a stopped run must not create any late WebAudio layer');
  assert.equal(audio.diagnostics().activeLayers,0);
  assert.equal(audio.diagnostics().sustainedShotGroups,0);
  assert.equal(audio.diagnostics().audioEpoch,0,'run cancellation must not stop unrelated preview audio globally');
});
