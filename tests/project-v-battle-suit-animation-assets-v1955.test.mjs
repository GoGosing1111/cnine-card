import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import sharp from 'sharp';

const root=new URL('../',import.meta.url);
const manifestUrl=new URL('assets/ui/project-v/account-battle-suits/manifest-v2.json',root);
const diagnosticsUrl=new URL('assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v6.json',root);
const catalogModuleUrl=new URL('preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js',root);
const builderUrl=new URL('scripts/build-battle-suit-imagegen-atlases-v7.ps1',root);
const gildedBuilderUrl=new URL('scripts/build-battle-suit-gilded-dragon-atlases-v1.mjs',root);
const diagnosticsBuilderUrl=new URL('scripts/build-battle-suit-static-v7-diagnostics.mjs',root);

const SUIT_CODES=Object.freeze(['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03']);
const WEAPON_GROUPS=Object.freeze({
  m4a1M200:Object.freeze(['EQ_1785427638137','EQ_1785961300455']),
  akSks:Object.freeze(['EQ_1785961232958','EQ_1786966923833']),
  gildedDragon:Object.freeze(['EQ_1788486929132','EQ_1788486888336'])
});
const WEAPON_CODES=Object.freeze(Object.values(WEAPON_GROUPS).flat());
const FRAME_ORDER=Object.freeze(['ready','fire','recoil','recover']);
const DURATIONS_MS=Object.freeze({ready:45,fire:45,recoil:70,recover:125});
const STATIC_PAIRS=new Set([
  'BATTLE_SUIT_01:EQ_1785427638137',
  'BATTLE_SUIT_01:EQ_1785961300455',
  'BATTLE_SUIT_01:EQ_1785961232958',
  'BATTLE_SUIT_02:EQ_1785961300455',
  'BATTLE_SUIT_03:EQ_1785961300455',
  'BATTLE_SUIT_01:EQ_1788486929132',
  'BATTLE_SUIT_01:EQ_1788486888336',
  'BATTLE_SUIT_02:EQ_1788486929132',
  'BATTLE_SUIT_02:EQ_1788486888336',
  'BATTLE_SUIT_03:EQ_1788486929132',
  'BATTLE_SUIT_03:EQ_1788486888336'
]);
const GILDED_WEAPON_CODES=new Set(WEAPON_GROUPS.gildedDragon);
const PRESERVED_ROWS=Object.freeze([
  {
    key:'BATTLE_SUIT_01:EQ_1786966923833',
    actual:'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-ak-sks-horizontal-fire-atlas-v6.png',
    expected:'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-ak-sks-horizontal-fire-atlas-v5.png',
    row:1
  },
  {
    key:'BATTLE_SUIT_02:EQ_1785427638137',
    actual:'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-m4a1-m200-horizontal-fire-atlas-v6.png',
    expected:'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-m4a1-m200-horizontal-fire-atlas-v3.png',
    row:0
  },
  {
    key:'BATTLE_SUIT_03:EQ_1785427638137',
    actual:'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-m4a1-m200-horizontal-fire-atlas-v7.png',
    expected:'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-m4a1-m200-horizontal-fire-atlas-v3.png',
    row:0
  }
]);

let manifestPromise;
let diagnosticsPromise;
const decodedSheetCache=new Map();

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sorted=values=>[...values].sort((left,right)=>String(left).localeCompare(String(right)));
const readManifest=()=>manifestPromise??=readFile(manifestUrl,'utf8').then(JSON.parse);
const readDiagnostics=()=>diagnosticsPromise??=readFile(diagnosticsUrl,'utf8').then(JSON.parse);

function assetFileUrl(publicPath){
  const pathname=new URL(String(publicPath||''),'https://soopketmon.invalid').pathname.replace(/^\//,'');
  return new URL(pathname,root);
}

async function decodedSheet(publicPath){
  if(!decodedSheetCache.has(publicPath)){
    decodedSheetCache.set(publicPath,readFile(assetFileUrl(publicPath))
      .then(bytes=>sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  }
  return decodedSheetCache.get(publicPath);
}

function frameBytes(data,info,row,column){
  const frame=Buffer.alloc(384*512*4);
  for(let y=0;y<512;y+=1){
    const sourceStart=((row*512+y)*info.width+column*384)*4;
    data.copy(frame,y*384*4,sourceStart,sourceStart+384*4);
  }
  return frame;
}

function inspectFrame(frame,{alphaThreshold=16,bottomBandPx=9}={}){
  let minimumY=512;
  let maximumY=-1;
  let maximumX=-1;
  let edgeAlphaPixels=0;
  for(let y=0;y<512;y+=1){
    for(let x=0;x<384;x+=1){
      const alpha=frame[(y*384+x)*4+3];
      if(alpha>=alphaThreshold){
        minimumY=Math.min(minimumY,y);
        maximumY=Math.max(maximumY,y);
        maximumX=Math.max(maximumX,x);
      }
      if(alpha>0&&(x<=1||x>=382||y<=1||y>=510))edgeAlphaPixels+=1;
    }
  }
  assert.ok(maximumY>=0,'frame must contain visible authored art');
  let xTotal=0;
  let pixelCount=0;
  for(let y=Math.max(0,maximumY-bottomBandPx+1);y<=maximumY;y+=1){
    for(let x=0;x<384;x+=1){
      if(frame[(y*384+x)*4+3]<alphaThreshold)continue;
      xTotal+=x;
      pixelCount+=1;
    }
  }
  const muzzleYs=[];
  for(let y=0;y<300;y+=1){
    for(let x=Math.max(0,maximumX-3);x<=maximumX;x+=1){
      if(frame[(y*384+x)*4+3]>=alphaThreshold)muzzleYs.push(y);
    }
  }
  muzzleYs.sort((left,right)=>left-right);
  return {
    contentTop:minimumY,
    contentBottom:maximumY,
    pivotX:xTotal/pixelCount,
    pivotY:maximumY,
    muzzleX:maximumX,
    muzzleY:muzzleYs[Math.floor(muzzleYs.length/2)],
    edgeAlphaPixels
  };
}

function sheetEntries(manifest){
  return manifest.suits.flatMap(suit=>Object.entries(suit.animationSheets).map(([group,sheet])=>({suit,group,sheet})));
}

async function pairMap(){
  const manifest=await readManifest();
  const result=new Map();
  for(const {suit,group,sheet} of sheetEntries(manifest)){
    for(const row of sheet.weaponRows)result.set(`${suit.code}:${row.weaponCode}`,{group,sheet,row:row.row});
  }
  return result;
}

test('Battle Suit v8 manifest connects both CMS gilded-dragon rifles without weakening the PVE-only static-pose contract',async()=>{
  const manifest=await readManifest();
  assert.equal(manifest.version,'v8');
  assert.equal(manifest.contract,'PROJECT_V_ACCOUNT_BATTLE_SUIT_ANIMATED_V1');
  assert.equal(manifest.scope,'PVE_ONLY');
  assert.equal(manifest.generationProvenance,'/assets/ui/project-v/account-battle-suits/animation-generation-provenance-v5.json');
  assert.equal(manifest.renderContract.formation,'AUXILIARY_FRONT_LEFT_FORWARD_TILE');
  assert.equal(manifest.renderContract.canonicalAllyCardCount,5);
  assert.equal(manifest.renderContract.movement,false);
  assert.equal(manifest.renderContract.attack,'STATIC_STANCE_SERVER_TIMELINE_DAMAGE_RUNTIME_MUZZLE_AND_AUDIO');
  assert.equal(manifest.renderContract.addsIndependentDamage,true);
  assert.equal(manifest.renderContract.damageAuthority,'BATTLE_ENGINE_V2');
  assert.equal(manifest.renderContract.approvedWeaponBinding,'equippedWeapon.code');
  assert.deepEqual(manifest.powerContract.tiersBySuitCode,{BATTLE_SUIT_01:100000,BATTLE_SUIT_02:200000,BATTLE_SUIT_03:300000});
  assert.equal(manifest.renderContract.sksSourcePolicy,'USER_PROVIDED_SECOND_ROW_TRANSPARENT_NO_REDRAW');
  assert.equal(manifest.animationContract.poseAnimation,false);
  assert.equal(manifest.animationContract.staticPosePolicy,'USER_REWORKED_ROWS_REPEAT_READY_FRAME_IN_ALL_PHASES');
  assert.equal(manifest.animationContract.muzzleFlashSource,'RUNTIME_EFFECT_ONLY');
  assert.equal(manifest.animationContract.muzzleBinding,'FIRE_FRAME_RENDERED_WEAPON_TIP');
  assert.deepEqual(manifest.animationContract.grid,{columns:4,rows:2});
  assert.deepEqual(manifest.animationContract.frameOrder,FRAME_ORDER);
  assert.deepEqual(manifest.animationContract.durationsMs,DURATIONS_MS);
  assert.deepEqual(manifest.suits.map(item=>item.code),SUIT_CODES);
  assert.deepEqual(sorted(manifest.weapons.map(item=>item.equipmentCode)),sorted(WEAPON_CODES));

  const provenance=JSON.parse(await readFile(assetFileUrl(manifest.generationProvenance),'utf8'));
  assert.equal(provenance.version,'v5');
  assert.equal(provenance.tool,'OpenAI built-in image generation tool');
  assert.match(provenance.mode,/deterministic local alpha extraction/i);
  assert.equal(provenance.baseProvenance,'/assets/ui/project-v/account-battle-suits/animation-generation-provenance-v4.json');
  assert.equal(provenance.buildDiagnostics,'/assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v6.json');
  assert.equal(provenance.generatedSources.length,6);
  assert.equal(provenance.weaponCutouts.length,2);
  assert.deepEqual(sorted(provenance.cmsSnapshot.weapons.map(item=>item.equipmentCode)),sorted(WEAPON_GROUPS.gildedDragon));
  for(const prompt of Object.values(provenance.finalPromptSet)){
    assert.match(prompt,/horizontal at 0 degrees/i);
    assert.match(prompt,/no .*text, logo/i);
  }
  for(const source of provenance.generatedSources){
    const bytes=await readFile(assetFileUrl(source.path));
    const metadata=await sharp(bytes).metadata();
    assert.equal(sha256(bytes),source.sha256,source.path);
    assert.deepEqual({width:metadata.width,height:metadata.height},source.dimensions,source.path);
  }
  for(const cutout of provenance.weaponCutouts){
    const bytes=await readFile(assetFileUrl(cutout.path));
    const metadata=await sharp(bytes).metadata();
    assert.equal(sha256(bytes),cutout.sha256,cutout.path);
    assert.deepEqual({width:metadata.width,height:metadata.height},cutout.dimensions,cutout.path);
    assert.equal(metadata.hasAlpha,true,cutout.path);
  }
  const baseProvenance=JSON.parse(await readFile(assetFileUrl(provenance.baseProvenance),'utf8'));
  assert.equal(baseProvenance.correction.pair,'BATTLE_SUIT_03:EQ_1785961300455');
  assert.match(baseProvenance.correction.action,/restore.*helmeted.*byte-for-byte/i);
  const builder=await readFile(builderUrl,'utf8');
  assert.match(builder,/Buffer\.BlockCopy/i);
  assert.match(builder,/runtime phase reuses the same/i);
  const gildedBuilder=await readFile(gildedBuilderUrl,'utf8');
  assert.match(gildedBuilder,/markEdgeConnectedCheckerboard/);
  assert.match(gildedBuilder,/frame\.copy\(row/);
  const diagnosticsBuilder=await readFile(diagnosticsBuilderUrl,'utf8');
  assert.match(diagnosticsBuilder,/STATIC_STANDING_AIM/);
});

test('all nine selected atlases are immutable transparent 1536x1024 4x2 grids',async()=>{
  const manifest=await readManifest();
  const paths=[];
  for(const {suit,group,sheet} of sheetEntries(manifest)){
    assert.equal(new URL(sheet.image,'https://soopketmon.invalid').search,'',sheet.image);
    assert.match(sheet.image,/^\/assets\/ui\/project-v\/account-battle-suits\/animations\/[a-z0-9-]+-atlas-v\d+\.png$/);
    assert.match(sheet.sha256,/^[A-F0-9]{64}$/);
    const rows=sheet.weaponRows;
    assert.deepEqual(rows.map(item=>item.row).sort(),[0,1],`${suit.code}/${group}`);
    assert.deepEqual(sorted(rows.map(item=>item.weaponCode)),sorted(WEAPON_GROUPS[group]),`${suit.code}/${group}`);
    const bytes=await readFile(assetFileUrl(sheet.image));
    assert.equal(sha256(bytes),sheet.sha256,sheet.image);
    const [metadata,stats]=await Promise.all([sharp(bytes).metadata(),sharp(bytes).stats()]);
    assert.equal(metadata.width,1536,sheet.image);
    assert.equal(metadata.height,1024,sheet.image);
    assert.equal(metadata.channels,4,sheet.image);
    assert.equal(metadata.hasAlpha,true,sheet.image);
    assert.equal(stats.isOpaque,false,sheet.image);
    paths.push(sheet.image);
  }
  assert.equal(paths.length,9);
  assert.equal(new Set(paths).size,9);
});

test('eleven reworked rows repeat one crisp standing pose and approved rows remain pixel-identical',async()=>{
  const pairs=await pairMap();
  for(const key of STATIC_PAIRS){
    const pair=pairs.get(key);
    assert.ok(pair,key);
    const {data,info}=await decodedSheet(pair.sheet.image);
    const frames=FRAME_ORDER.map((_,column)=>frameBytes(data,info,pair.row,column));
    assert.equal(new Set(frames.map(sha256)).size,1,`${key} must remain visually static across runtime phases`);
    const measurement=inspectFrame(frames[0]);
    assert.equal(measurement.edgeAlphaPixels,0,`${key} must not clip at cell edges`);
    const minimumHeight=GILDED_WEAPON_CODES.has(key.split(':')[1])?290:375;
    assert.ok(measurement.contentBottom-measurement.contentTop+1>=minimumHeight,`${key} must retain a large readable full-body silhouette`);
  }

  for(const preserved of PRESERVED_ROWS){
    const [actual,expected]=await Promise.all([decodedSheet(preserved.actual),decodedSheet(preserved.expected)]);
    for(let column=0;column<4;column+=1){
      assert.equal(
        frameBytes(actual.data,actual.info,preserved.row,column).equals(frameBytes(expected.data,expected.info,preserved.row,column)),
        true,
        `${preserved.key}/${FRAME_ORDER[column]} must be raw RGBA pixel-identical to its approved source`
      );
    }
  }
});

test('v6 diagnostics are complete and bind to final image hashes and static-frame policy',async()=>{
  const [manifest,diagnostics]=await Promise.all([readManifest(),readDiagnostics()]);
  assert.equal(diagnostics.version,'v6');
  assert.equal(diagnostics.contract,'PROJECT_V_ACCOUNT_BATTLE_SUIT_STATIC_STANCE_ATLAS_DIAGNOSTICS_V6');
  assert.equal(diagnostics.staticFramePolicy,'IDENTICAL_RGBA_READY_FRAME_COPIED_TO_ALL_FOUR_RUNTIME_PHASES');
  assert.equal(diagnostics.entries.length,18);
  assert.equal(diagnostics.sheets.length,9);
  assert.equal(new Set(diagnostics.entries.map(entry=>`${entry.suitCode}:${entry.weaponCode}`)).size,18);
  for(const diagnosticSheet of diagnostics.sheets){
    const suit=manifest.suits.find(item=>item.code===diagnosticSheet.suitCode);
    const sheet=suit.animationSheets[diagnosticSheet.group];
    assert.equal(diagnosticSheet.image,sheet.image);
    assert.equal(diagnosticSheet.sha256,sheet.sha256);
  }
  for(const entry of diagnostics.entries){
    const key=`${entry.suitCode}:${entry.weaponCode}`;
    assert.equal(entry.frameMode,STATIC_PAIRS.has(key)?'STATIC_STANDING_AIM':'PRESERVED_APPROVED_ANIMATION',key);
    assert.equal(entry.exactPixelRepeat,STATIC_PAIRS.has(key),key);
    assert.equal(entry.uniqueFrameHashes,STATIC_PAIRS.has(key)?1:4,key);
    assert.equal(entry.frames.length,4,key);
    assert.ok(entry.frames.every(frame=>frame.edgeAlphaPixels===0),`${key} edge alpha`);
    if(STATIC_PAIRS.has(key)){
      assert.match(entry.generatedSource,/imagegen-authored-v[167]\.png$/);
      assert.match(entry.generatedSourceSha256,/^[A-F0-9]{64}$/);
    }
  }
});

test('catalog resolves all 18 suit/weapon pairs with measured sole, HUD and muzzle anchors',async()=>{
  const {
    ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG,
    resolveAccountBattleSuitAnimation
  }=await import(`${catalogModuleUrl.href}?v8-gilded-dragon-qc`);
  const pairs=await pairMap();
  assert.equal(Object.keys(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG).length,18);
  assert.deepEqual(sorted(Object.keys(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG)),sorted(pairs.keys()));
  for(const [key,pair] of pairs){
    const resolved=resolveAccountBattleSuitAnimation(...key.split(':'));
    assert.ok(resolved,key);
    assert.equal(resolved.sheetUrl,pair.sheet.image,key);
    assert.equal(resolved.row,pair.row,key);
    assert.deepEqual(resolved.frameOrder,FRAME_ORDER,key);
    assert.deepEqual(resolved.durationsMs,DURATIONS_MS,key);
    assert.deepEqual(resolved.pivotContract,{type:'SOLE_CENTER',unit:'NORMALIZED_FRAME',alphaThreshold:16,bottomBandPx:9},key);
    assert.ok(resolved.scaleMultiplier>=1.4&&resolved.scaleMultiplier<=1.55,key);
    const {data,info}=await decodedSheet(pair.sheet.image);
    let minimumY=512;
    let maximumY=-1;
    FRAME_ORDER.forEach((name,column)=>{
      const measurement=inspectFrame(frameBytes(data,info,pair.row,column),resolved.pivotContract);
      const pivot=resolved.pivots[name];
      assert.ok(Math.abs(pivot.x*384-measurement.pivotX)<=.002,`${key}/${name} pivot x`);
      assert.ok(Math.abs(pivot.y*512-measurement.pivotY)<=.002,`${key}/${name} pivot y`);
      minimumY=Math.min(minimumY,measurement.contentTop);
      maximumY=Math.max(maximumY,measurement.contentBottom);
      if(name==='fire'){
        assert.ok(Math.abs(resolved.muzzle.x*384-measurement.muzzleX)<=1,`${key} muzzle x`);
        assert.ok(Math.abs(resolved.muzzle.y*512-measurement.muzzleY)<=1,`${key} muzzle y`);
      }
    });
    assert.ok(Math.abs(resolved.nameHud.contentTop*512-minimumY)<=1,`${key} HUD top`);
    assert.ok(Math.abs(resolved.contentBottom*512-maximumY)<=1,`${key} content bottom`);
  }
  assert.equal(resolveAccountBattleSuitAnimation('BATTLE_SUIT_UNKNOWN',WEAPON_CODES[0]),null);
  assert.equal(resolveAccountBattleSuitAnimation(SUIT_CODES[0],'EQ_UNKNOWN'),null);
});
