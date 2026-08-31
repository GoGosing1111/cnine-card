import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url));
const text=path=>read(path).toString('utf8');
const sha256=path=>createHash('sha256').update(read(path)).digest('hex').toUpperCase();

const visualRoot='assets/ui/project-v/fx/advancement-awakening-v1';
const audioRoot='assets/sfx/v3-advancement-awakening-v1';
const selected=Object.freeze({
  SHATTER:{atlas:'shatter-advancement-atlas-v3',prefix:'shatter_',png:'4A8D0EAFFACAE0DAC4D747E6BFA7030E15D1F4385A743C0120F8FE031E882D56',json:'9C795A5C28B05AEA95330656C6F4FAE6E69CDEF36F55C274CB06A899401DC9E8',mp3:'shatter-advancement-v1.mp3',bytes:36908,audio:'B4C498A8AE554411456F1C2B5A3883275B3D1E4B2FB974AB7DF0B227C7B576C0'},
  RIPOSTE:{atlas:'riposte-advancement-atlas-v1',prefix:'riposte_',png:'3D70439BA3063509C71D276FBA0EDB59538532497F4F30FA22D45B5679B56E2C',json:'093A5CD203C2424EEA75F6F59A8AB2A08B88385B105F8BC9E1043DA47831E333',mp3:'riposte-advancement-v1.mp3',bytes:42284,audio:'E649A410E874BDFEF29F88981170A5FAAA683B4E34550AE459148E538831078F'},
  AFTERIMAGE:{atlas:'afterimage-advancement-atlas-v3',prefix:'afterimage_',png:'DE9A6D015D9BD05C744E416D18F1A195BB5682E34F882F59D24802171D4D4092',json:'482D42427A8BD39BCE6DAE2334F46B5BAFBB07917F204D5F777481492626660F',mp3:'afterimage-advancement-v1.mp3',bytes:30764,audio:'28B9A99971AD0564AA0DA74FC8A9627CC2758EBD835DB63DA722E291F242AEF6'},
  IMMORTAL:{atlas:'immortal-advancement-atlas-v3',prefix:'immortal_',png:'407554DC1CB9D88A298E5CC015AA1E9D29FB50E8861B21ABBC19771EFE485EFE',json:'B10E06999C5424359AC11D0750600FD7A1649249E2B7D78304081510D9B52D77',mp3:'immortal-advancement-v1.mp3',bytes:72236,audio:'D86B5F69E20C5D7F0527683D4F7C5980438C9DC912F75EBD006768F78B785691'}
});

test('운영 경로에는 승인된 4종 아틀라스 선택본만 있고 해시·12프레임 계약이 고정된다',()=>{
  for(const [code,spec] of Object.entries(selected)){
    const pngPath=`${visualRoot}/${spec.atlas}.png`;
    const jsonPath=`${visualRoot}/${spec.atlas}.json`;
    assert.equal(sha256(pngPath),spec.png,`${code} PNG hash`);
    assert.equal(sha256(jsonPath),spec.json,`${code} JSON hash`);
    const png=read(pngPath);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),2048);
    assert.equal(png.readUInt32BE(20),1365);
    const atlas=JSON.parse(text(jsonPath));
    const names=Object.keys(atlas.frames).filter(name=>name.startsWith(spec.prefix));
    assert.equal(names.length,12,`${code} must expose exactly twelve frames`);
    assert.equal(atlas.meta.format,'RGBA8888');
  }
  const manifest=JSON.parse(text(`${visualRoot}/manifest.json`));
  assert.equal(manifest.runtimeConnected,true);
  assert.match(manifest.conditionalPreload,/timeline/i);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.effects).map(([code,value])=>[code,value.impactAtMs])),{
    SHATTER:420,RIPOSTE:460,AFTERIMAGE:320,IMMORTAL:500
  });
});

test('전직 SFX는 검수된 녹음 파일·바이트·해시만 사용한다',()=>{
  for(const [code,spec] of Object.entries(selected)){
    const path=`${audioRoot}/${spec.mp3}`;
    assert.equal(statSync(new URL(`../${path}`,import.meta.url)).size,spec.bytes,`${code} byte size`);
    assert.equal(sha256(path),spec.audio,`${code} audio hash`);
    const signature=read(path).subarray(0,3).toString('ascii');
    assert.ok(signature==='ID3'||signature.startsWith('\xFF'),`${code} must be an MP3 asset`);
  }
  const manifest=JSON.parse(text(`${audioRoot}/manifest.json`));
  assert.equal(manifest.runtimeConnected,true);
  assert.equal(manifest.proceduralSynthesis,false);
  assert.equal(manifest.runtimeSynthesis,false);
  const provenance=text(`${audioRoot}/PROVENANCE.md`);
  assert.match(provenance,/Mixkit Sound Effects Free License/);
  assert.match(provenance,/오실레이터/);
});

test('V3는 서버 타임라인 코드만 조건부 선로딩하고 일반 역할 렌더러를 보존한다',()=>{
  const engine=text('preview/project-v-v3/source/battle/BattleEngine.js');
  const advancement=text('preview/project-v-v3/source/battle/AdvancementEffectFX.js');
  const role=text('preview/project-v-v3/source/battle/SkillEffectFX.js');
  assert.match(engine,/battleV2\?\.result\?\.timeline/);
  assert.match(engine,/type==='TURN'&&event\?\.dodge===true&&activation==='AFTERIMAGE'/);
  assert.match(engine,/type==='TURN'&&event\?\.dodge!==true&&activation==='SHATTER'/);
  assert.match(engine,/type==='COUNTER'&&activation==='RIPOSTE'/);
  assert.match(engine,/type==='ADVANCEMENT'\|\|type==='ADVANCEMENT_SEALED'/);
  assert.match(engine,/const warmCodes=LOW_MEMORY_DEVICE\?\[\]:codes/);
  assert.match(engine,/AdvancementEffectFX\.preloadMany\(warmCodes\)/);
  assert.match(engine,/AdvancementEffectFX\.retain\(LOW_MEMORY_DEVICE\?\[code\]:\[\.\.\.this\.advancementCodes\]\)/);
  assert.match(engine,/void AdvancementEffectFX\.retain\(\[\]\)/);
  assert.doesNotMatch(engine,/AdvancementEffectFX\.preloadAll/);
  const mountBarrier=engine.slice(engine.indexOf('async mount('),engine.indexOf('this.skillTimeline=new SkillTimeline'));
  assert.doesNotMatch(mountBarrier,/AdvancementEffectFX\.preloadMany|prepareAdvancements/);
  assert.match(advancement,/AnimatedSprite\(\{textures:frames,autoUpdate:false\}\)/);
  assert.match(advancement,/timeline\.to\(frameState/);
  assert.match(advancement,/blendMode:'screen'/);
  assert.match(advancement,/Assets\.unload\(spec\.atlasPath\)/);
  assert.match(role,/role-impact-v2\/attack-impact-atlas-v2/);
  assert.match(engine,/advancementProfile\s*\?AdvancementEffectFX\.create[\s\S]*:SkillEffectFX\.create/);
});

test('모바일 지연 로드는 유한 대기·재생 세대 취소를 지키고 명시적 종료에서 선택 자산을 해제한다',()=>{
  const engine=text('preview/project-v-v3/source/battle/BattleEngine.js');
  const audio=text('preview/project-v-v3/source/battle/BattleAudioMixer.js');
  assert.match(engine,/const ADVANCEMENT_LOAD_DEADLINE_MS=900/);
  assert.match(engine,/Promise\.race\([\s\S]*ADVANCEMENT_LOAD_DEADLINE_MS/);
  assert.match(engine,/cancelTimelines\(\)\{[\s\S]*this\.playbackEpoch\+=1/);
  assert.match(engine,/const playbackEpoch=this\.playbackEpoch;[\s\S]*await this\.ensureAdvancementReady\(advancementCode\);[\s\S]*playbackEpoch!==this\.playbackEpoch\|\|!this\.visible/);
  assert.match(engine,/await this\.ensureAdvancementReady\(code\);[\s\S]*playbackEpoch!==this\.playbackEpoch\|\|!this\.visible/);
  assert.match(engine,/if\(!this\.requestedVisible\)await this\.releaseOptionalAdvancementAssets\(\)/);
  assert.match(engine,/releaseOptionalAdvancementAssets\(\)[\s\S]*releaseAdvancements[\s\S]*AdvancementEffectFX\.retain\(\[\]\)/);
  assert.match(audio,/advancementGeneration/);
  assert.match(audio,/releaseAdvancements\(\)[\s\S]*advancementBuffers\.clear\(\)/);
});

test('네 전직은 정확한 성공 이벤트에만 연결되고 보스 필살기는 제외된다',()=>{
  const engine=text('preview/project-v-v3/source/battle/BattleEngine.js');
  assert.match(engine,/event\.dodge[\s\S]*type==='TURN'&&normalizeAdvancementEffectCode\(event\.advancementClass\)==='AFTERIMAGE'[\s\S]*playAdvancementMoment\('AFTERIMAGE'/);
  assert.match(engine,/type==='TURN'&&normalizeAdvancementEffectCode\(event\.advancementClass\)==='SHATTER'\?'SHATTER':''/);
  assert.match(engine,/event\.advancementClass\)==='RIPOSTE'\?'RIPOSTE':''/);
  assert.match(engine,/type==='ADVANCEMENT'\|\|type==='ADVANCEMENT_SEALED'[\s\S]*playAdvancementMoment\('IMMORTAL'/);
  const blocked=engine.slice(engine.indexOf("type==='ADVANCEMENT_BLOCKED'"),engine.indexOf("['TEAM_HEAL'"));
  assert.doesNotMatch(blocked,/playAdvancementMoment/);
  const boss=engine.slice(engine.indexOf("type==='BOSS_ULTIMATE'"),engine.indexOf("type==='MAGIC_CARD'"));
  assert.doesNotMatch(boss,/advancementClass/);
});

test('각성 발동은 GSAP 충돌·히트스톱·카메라 셰이크·정확한 50ms 플래시·녹음 SFX를 한 타임라인에 묶는다',()=>{
  const engine=text('preview/project-v-v3/source/battle/BattleEngine.js');
  const advancement=text('preview/project-v-v3/source/battle/AdvancementEffectFX.js');
  const audio=text('preview/project-v-v3/source/battle/BattleAudioMixer.js');
  for(const value of ['.42','.46','.32','.5'])assert.ok(advancement.includes(`impactAt:${value}`),`impactAt ${value}`);
  assert.match(engine,/scheduleAdvancementImpact\(advancementCode,\{impactAt,playbackSpeed\}\)/);
  assert.match(engine,/triggerAdvancementScreenFlash\(\{durationMs:50,alpha:\.26\}\)/);
  assert.match(engine,/rect\(0,0,this\.scene\.width,this\.scene\.height\)/);
  assert.match(engine,/V3_ADVANCEMENT_FULL_STAGE_WHITE_FLASH/);
  assert.match(engine,/const playbackSpeed=advancementProfile[\s\S]*PLAYBACK_SPEED/);
  assert.match(engine,/timeline\.pause\(\)[\s\S]*profile\.hitStopMs\/playbackSpeed/);
  assert.match(engine,/camera\.addShake/);
  assert.match(audio,/prepareAdvancements\(values=\[\]\)/);
  assert.match(audio,/scheduleAdvancementImpact/);
  assert.match(audio,/no fallback is used/);
});

test('운영 번들은 프리뷰 자산이 아닌 승격 자산과 전직 이벤트 분기를 포함한다',()=>{
  const bundle=text('preview/project-v-v3/project-v-pixi-battle.bundle.js');
  assert.ok(bundle.includes('/assets/ui/project-v/fx/advancement-awakening-v1/'),'운영 아틀라스 루트가 번들에 있어야 한다');
  assert.ok(bundle.includes('-advancement-atlas-v'),'아틀라스 파일명이 동적으로 결합돼야 한다');
  assert.ok(bundle.includes('/assets/sfx/v3-advancement-awakening-v1/shatter-advancement-v1.mp3'),'SHATTER 운영 SFX가 번들에 있어야 한다');
  assert.ok(bundle.includes('/assets/sfx/v3-advancement-awakening-v1/immortal-advancement-v1.mp3'),'IMMORTAL 운영 SFX가 번들에 있어야 한다');
  assert.ok(bundle.includes('ADVANCEMENT_BLOCKED'),'차단 이벤트 분기가 번들에 있어야 한다');
  assert.ok(bundle.includes('bossUltimateAdvancementFx:!1'),'보스 필살기 제외 진단값이 번들에 있어야 한다');
  assert.ok(!bundle.includes('preview/project-v-advancement-fx-v1'),'프리뷰 자산 경로가 번들에 들어가면 안 된다');
});
