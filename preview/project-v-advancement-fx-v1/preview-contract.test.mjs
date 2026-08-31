import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=path.dirname(fileURLToPath(import.meta.url));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sourceFiles=[
  'source/advancement-fx-preview.src.js',
  'source/AdvancementEffectFX.js',
  'source/AdvancementAudioScheduler.js'
];
const source=sourceFiles.map(read).join('\n');
const selectedAtlases={
  SHATTER:{id:'shatter',version:3,sourceId:'exec-1e4393c7-91b0-4f60-b845-146ab82fe33e',sourceSha256:'98EB875D163E03C2B26B557127602673C56D589D3111D47AB2CC047046805958'},
  RIPOSTE:{id:'riposte',version:1,sourceId:'exec-d1575f25-bf09-4eca-ab77-983365d360f8',sourceSha256:'F142262F84FD5CBF6A89A7D9767776A8A6684EDDFF5E9B90B7D234651C791B47'},
  AFTERIMAGE:{id:'afterimage',version:3,sourceId:'exec-11b4ddf1-f888-4125-b87c-195690c8c245',sourceSha256:'6BAA0F5207B93A35F37FDDC49512D519A5CC9478DC5138FF904FE513C7CF4198'},
  IMMORTAL:{id:'immortal',version:3,sourceId:'exec-ea504bc5-479c-4d19-8408-93984ba65182',sourceSha256:'58111C400582EDF9805D2F9A4AC5C59A3F767D2507B334F7F56E8481BDBDCB99'}
};
const forbidden=[
  'project-v-v3/source','SkillEffectFX','BattleAudioMixer','RoleAudioSpriteManifest',
  'role-impact-v2','rosterCardHtml','cardIds','battleV2','createOscillator'
];

test('standalone preview owns its atlas renderer and audio scheduler',()=>{
  for(const value of forbidden)assert.doesNotMatch(source,new RegExp(value,'i'));
  assert.match(source,/from 'pixi\.js'/);
  assert.match(source,/from 'gsap'/);
  assert.match(source,/preference:'webgl'/);
  assert.match(source,/new AnimatedSprite\(\{textures:frames,autoUpdate:false\}\)/);
  assert.match(source,/display\.blendMode=spec\.blendMode/);
  assert.match(source,/battleRuntimeConnected:false/);
});

test('three fresh awakening V3 atlases and preserved RIPOSTE V1 each drive one effect',()=>{
  for(const [code,{id,version}] of Object.entries(selectedAtlases)){
    assert.match(source,new RegExp(`${code}:Object\\.freeze`));
    assert.match(source,new RegExp(`atlas:'${id}'`));
    assert.match(source,new RegExp(`assetVersion:${version}`));
    const file=path.join(root,'assets','atlases',`${id}-advancement-atlas-v${version}.json`);
    assert.equal(fs.existsSync(file),true,file);
  }
  assert.doesNotMatch(read('source/AdvancementEffectFX.js'),/advancement-atlas-v2/);
  assert.match(source,/frameCount:FRAME_COUNT/);
  assert.match(source,/oneAtlasPerEffect:true/);
});

test('impact contract keeps frame, hit-stop, shake, flash and recorded SFX aligned',()=>{
  assert.match(source,/collision frame at the exact logical impact time/);
  for(const value of [82,104,32,76])assert.match(source,new RegExp(`hitStopMs:${value}`));
  for(const value of [22,18,8,10])assert.match(source,new RegExp(`shake:${value}`));
  assert.match(source,/setTimeout\(\(\)=>flashNode\.classList\.remove\('is-active'\),50\)/);
  assert.match(read('preview.css'),/\.screen-flash\{[^}]*transition:none/);
  assert.match(source,/syncPointMs/);
  assert.match(source,/logicalImpact-authoredSync/);
  assert.match(source,/authoredSync-logicalImpact/);
  assert.match(source,/toleranceMs:20/);
  const audioManifest=JSON.parse(read('assets/audio/manifest.json'));
  assert.deepEqual(Object.keys(audioManifest.assets),['SHATTER','RIPOSTE','AFTERIMAGE','IMMORTAL']);
  assert.equal(audioManifest.proceduralSynthesis,false);
  assert.equal(audioManifest.reusesFinalLiveAudio,false);
  const audioHashes={SHATTER:'B4C498A8AE554411456F1C2B5A3883275B3D1E4B2FB974AB7DF0B227C7B576C0',RIPOSTE:'E649A410E874BDFEF29F88981170A5FAAA683B4E34550AE459148E538831078F',AFTERIMAGE:'28B9A99971AD0564AA0DA74FC8A9627CC2758EBD835DB63DA722E291F242AEF6',IMMORTAL:'D86B5F69E20C5D7F0527683D4F7C5980438C9DC912F75EBD006768F78B785691'};
  for(const [code,asset] of Object.entries(audioManifest.assets)){
    assert.match(asset.src,/-advancement-v1\.mp3$/);
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,asset.src))).digest('hex').toUpperCase();
    assert.equal(digest,audioHashes[code],`${code} audio V1 changed`);
  }
});

test('asset manifest declares only preview-local original assets',()=>{
  const manifest=JSON.parse(read('asset-manifest.json'));
  assert.equal(manifest.runtimeConnected,false);
  assert.equal(manifest.reusesLiveRoleAssets,false);
  assert.equal(manifest.animatedSpriteAutoUpdate,false);
  assert.equal(manifest.whiteFlashMs,50);
  assert.equal(manifest.sfxPeakToleranceMs,20);
  assert.equal(manifest.visualAssets.length,4);
  assert.deepEqual(Object.keys(manifest.classes),['SHATTER','RIPOSTE','AFTERIMAGE','IMMORTAL']);
  assert.deepEqual(manifest.visualAssets,Object.values(selectedAtlases).map(({id,version})=>`assets/atlases/${id}-advancement-atlas-v${version}.json`));
  for(const asset of manifest.visualAssets){
    assert.match(asset,/^assets\/atlases\/.+-advancement-atlas-v(?:1|3)\.json$/);
    assert.equal(fs.existsSync(path.join(root,asset)),true,asset);
  }
  assert.equal(manifest.visualAtlasManifest,'assets/atlases/advancement-fx-atlas-manifest-v3.json');
  assert.equal(manifest.visualAtlasQa,'assets/atlases/advancement-fx-atlas-qa-v3.json');
  assert.equal(fs.existsSync(path.join(root,manifest.visualProvenance)),true);
  assert.equal(manifest.audioManifest,'assets/audio/manifest.json');
});

test('V3 manifest and QA pin source IDs and hashes while preserving RIPOSTE V1 bytes',()=>{
  const atlasManifest=JSON.parse(read('assets/atlases/advancement-fx-atlas-manifest-v3.json'));
  const atlasQa=JSON.parse(read('assets/atlases/advancement-fx-atlas-qa-v3.json'));
  assert.deepEqual(atlasManifest.releaseSelection,{shatter:'v3',riposte:'v1',afterimage:'v3',immortal:'v3'});
  assert.deepEqual(atlasQa.releaseSelection,atlasManifest.releaseSelection);
  assert.equal(atlasManifest.riposteV1Preserved,true);
  for(const [code,{id,version,sourceId,sourceSha256}] of Object.entries(selectedAtlases)){
    const manifestEntry=atlasManifest.effects[id];
    const qaEntry=atlasQa.effects[id];
    assert.equal(manifestEntry.assetVersion,version);
    assert.equal(manifestEntry.source.sourceId,sourceId);
    assert.equal(manifestEntry.source.sha256,sourceSha256);
    assert.equal(qaEntry.source.sourceId,sourceId);
    assert.equal(qaEntry.source.sha256,sourceSha256);
    assert.equal(manifestEntry.output.json,`assets/atlases/${id}-advancement-atlas-v${version}.json`);
    assert.equal(qaEntry.output.imageSha256,manifestEntry.output.imageSha256);
    assert.equal(qaEntry.output.jsonSha256,manifestEntry.output.jsonSha256);
    assert.ok(code);
  }
  assert.equal(atlasManifest.effects.riposte.output.preservedExisting,true);
  assert.equal(atlasManifest.effects.riposte.output.imageSha256,'3D70439BA3063509C71D276FBA0EDB59538532497F4F30FA22D45B5679B56E2C');
  assert.equal(atlasManifest.effects.riposte.output.jsonSha256,'093A5CD203C2424EEA75F6F59A8AB2A08B88385B105F8BC9E1043DA47831E333');
});

test('built bundle stays isolated from live V3 runtime and role assets',()=>{
  const bundle=read('advancement-fx-preview.bundle.js');
  for(const value of forbidden)assert.doesNotMatch(bundle,new RegExp(value,'i'));
  assert.match(bundle,/ProjectVAdvancementFxPreview/);
  assert.match(bundle,/3-role-awakening-fx/);
  assert.doesNotMatch(bundle,/advancement-atlas-v2/);
  assert.match(bundle,/assets\/audio\/manifest\.json/);
});
