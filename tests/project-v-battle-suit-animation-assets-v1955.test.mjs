import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import sharp from 'sharp';

const root=new URL('../',import.meta.url);
const manifestUrl=new URL('assets/ui/project-v/account-battle-suits/manifest-v2.json',root);
const diagnosticsUrl=new URL('assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v3.json',root);
const catalogModuleUrl=new URL('preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js',root);
const compositeScriptUrl=new URL('scripts/compose-exact-battle-suit-weapons.cjs',root);
const userReferenceScriptUrl=new URL('scripts/build-user-reference-battle-suit-atlases.cjs',root);
const canonicalSuit02M4SheetUrl=new URL('assets/ui/project-v/account-battle-suits/animations/battle-suit-02-m4a1-m200-horizontal-fire-atlas-v2.png',root);

const SUIT_CODES=Object.freeze(['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03']);
const WEAPON_GROUPS=Object.freeze({
  m4a1M200:Object.freeze(['EQ_1785427638137','EQ_1785961300455']),
  akSks:Object.freeze(['EQ_1785961232958','EQ_1786966923833'])
});
const WEAPON_CODES=Object.freeze(Object.values(WEAPON_GROUPS).flat());
const FRAME_ORDER=Object.freeze(['ready','fire','recoil','recover']);
const DURATIONS_MS=Object.freeze({ready:45,fire:45,recoil:70,recover:125});

let manifestPromise=null;
let diagnosticsPromise=null;
const decodedSheetCache=new Map();
function readManifest(){
  manifestPromise??=readFile(manifestUrl,'utf8').then(JSON.parse);
  return manifestPromise;
}

function readDiagnostics(){
  diagnosticsPromise??=readFile(diagnosticsUrl,'utf8').then(JSON.parse);
  return diagnosticsPromise;
}

async function decodedSheet(publicPath){
  if(!decodedSheetCache.has(publicPath)){
    decodedSheetCache.set(publicPath,readFile(assetFileUrl(publicPath)).then(bytes=>sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  }
  return decodedSheetCache.get(publicPath);
}

function assetFileUrl(publicPath){
  const pathname=new URL(String(publicPath||''),'https://soopketmon.invalid').pathname.replace(/^\//,'');
  return new URL(pathname,root);
}

function sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function sorted(values){
  return [...values].sort((left,right)=>String(left).localeCompare(String(right)));
}

function normalizeWeaponRows(value){
  if(Array.isArray(value)){
    return value.map((entry,index)=>{
      if(typeof entry==='string')return {row:index,weaponCode:entry};
      return {
        row:Number(entry?.row??entry?.rowIndex??index),
        weaponCode:String(entry?.weaponCode??entry?.equipmentCode??entry?.code??'')
      };
    });
  }
  if(!value||typeof value!=='object')return [];
  return Object.entries(value).map(([key,entry],index)=>{
    if(typeof entry==='string')return {row:Number.isInteger(Number(key))?Number(key):index,weaponCode:entry};
    if(Number.isFinite(Number(entry)))return {row:Number(entry),weaponCode:key};
    return {
      row:Number(entry?.row??entry?.rowIndex??(Number.isInteger(Number(key))?Number(key):index)),
      weaponCode:String(entry?.weaponCode??entry?.equipmentCode??entry?.code??(Number.isInteger(Number(key))?'':key))
    };
  });
}

function animationSheetEntries(suit){
  assert.ok(suit?.animationSheets&&typeof suit.animationSheets==='object'&&!Array.isArray(suit.animationSheets),`${suit?.code||'unknown'} animationSheets must be an object`);
  assert.deepEqual(sorted(Object.keys(suit.animationSheets)),sorted(Object.keys(WEAPON_GROUPS)),`${suit.code} must provide exactly the two approved weapon-pair sheets`);
  return Object.entries(suit.animationSheets);
}

function measuredSolePivot(data,info,row,column,{alphaThreshold=16,bottomBandPx=9}={}){
  let maximumY=-1;
  for(let y=0;y<512;y+=1){
    for(let x=0;x<384;x+=1){
      const alpha=data[((row*512+y)*info.width+column*384+x)*4+3];
      if(alpha>=alphaThreshold)maximumY=Math.max(maximumY,y);
    }
  }
  assert.ok(maximumY>=0,`row ${row} column ${column} must have a visible sole`);
  const minimumBandY=Math.max(0,maximumY-Math.max(0,bottomBandPx-1));
  let xTotal=0,pixelCount=0;
  for(let y=minimumBandY;y<=maximumY;y+=1){
    for(let x=0;x<384;x+=1){
      const alpha=data[((row*512+y)*info.width+column*384+x)*4+3];
      if(alpha<alphaThreshold)continue;
      xTotal+=x;
      pixelCount+=1;
    }
  }
  assert.ok(pixelCount>0,`row ${row} column ${column} sole band must contain visible pixels`);
  return {x:xTotal/pixelCount,y:maximumY,pixelCount};
}

async function manifestPairMap(){
  const manifest=await readManifest();
  const pairs=new Map();
  for(const suit of manifest.suits||[]){
    for(const [group,sheet] of animationSheetEntries(suit)){
      const rows=normalizeWeaponRows(sheet.weaponRows);
      for(const {row,weaponCode} of rows)pairs.set(`${suit.code}:${weaponCode}`,{group,row,image:sheet.image});
    }
  }
  return pairs;
}

test('animated Battle Suit v3 manifest preserves the PVE-only five-card/static-fallback contract',async()=>{
  const manifest=await readManifest();
  assert.equal(manifest.version,'v3');
  assert.equal(manifest.contract,'PROJECT_V_ACCOUNT_BATTLE_SUIT_ANIMATED_V1');
  assert.equal(manifest.scope,'PVE_ONLY');
  assert.equal(manifest.generationProvenance,'/assets/ui/project-v/account-battle-suits/animation-generation-provenance-v2.json');
  const provenance=JSON.parse(await readFile(assetFileUrl(manifest.generationProvenance),'utf8'));
  assert.equal(provenance.version,'v2');
  assert.equal(provenance.tool,'OpenAI built-in image generation tool');
  assert.equal(provenance.buildDiagnostics,'/assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v3.json');
  assert.match(provenance.finalPromptSet?.cleanBodyVariants||'',/no weapon/i);
  assert.match(provenance.finalPromptSet?.gripProxyVariants||'',/trigger hand on the pistol grip/i);
  assert.match(provenance.finalPromptSet?.dedicatedM200GripVariants||'',/butt pad contacting the rear shoulder plate/i);
  assert.deepEqual(provenance.semanticLayerOrder,['EXACT_DATABASE_WEAPON','BODY_ARMS_AND_HANDS_FOREGROUND']);
  assert.match(provenance.finalPromptSet?.exactWeaponComposite||'',/exact approved database battle-sprite raster/i);
  assert.match(provenance.finalPromptSet?.exactWeaponComposite||'',/rotation (?:at|to) (?:exactly )?0 degrees/i);
  assert.deepEqual(manifest.animationContract?.grid,{columns:4,rows:2});
  assert.deepEqual(manifest.animationContract?.frameOrder,FRAME_ORDER);
  assert.equal(manifest.animationContract?.format,'PNG_RGBA_GRID');
  assert.equal(manifest.animationContract?.approvedWeaponScalePolicy,'ROW_MEDIAN_CONSTANT_WIDTH');
  assert.equal(manifest.animationContract?.muzzleFlashSource,'RUNTIME_EFFECT_ONLY');
  assert.equal(manifest.animationContract?.placementTuning,'SUIT_WEAPON_PAIR_CONTENT_BOUNDS');
  assert.equal(manifest.animationContract?.muzzleBinding,'FIRE_FRAME_EXACT_WEAPON_TIP');

  assert.equal(manifest.renderContract?.canonicalAllyCardCount,5);
  assert.equal(manifest.renderContract?.movement,false);
  assert.equal(manifest.renderContract?.formation,'AUXILIARY_FRONT_LEFT_FORWARD_TILE');
  assert.equal(manifest.renderContract?.attack,'SUSTAINED_BURST_VISUAL');
  assert.equal(manifest.renderContract?.addsIndependentDamage,false);
  assert.equal(manifest.renderContract?.authoredCompositeForApprovedWeapons,true);
  assert.equal(manifest.renderContract?.fallbackBodyAndWeaponAreSeparate,true);
  assert.equal(manifest.renderContract?.approvedWeaponBinding,'equippedWeapon.code');
  assert.equal(manifest.renderContract?.loadPolicy,'EQUIPPED_SUIT_AND_WEAPON_PAIR_ONLY');
  assert.equal(manifest.renderContract?.fallback,'STATIC_BODY_PLUS_WEAPON');

  assert.deepEqual((manifest.suits||[]).map(item=>item.code),SUIT_CODES);
  assert.deepEqual(sorted((manifest.weapons||[]).map(item=>item.equipmentCode)),sorted(WEAPON_CODES));

  const femaleSuit=manifest.suits.find(item=>item.code==='BATTLE_SUIT_01');
  assert.match(femaleSuit?.image||'',/battle-suit-appearance-01-[^/]+-v3\.png$/);
  assert.match(femaleSuit?.animationSheets?.m4a1M200?.image||'',/horizontal-fire-atlas-v3\.png$/);
  assert.match(femaleSuit?.animationSheets?.akSks?.image||'',/horizontal-fire-atlas-v3\.png$/);
  const compositeScript=await readFile(compositeScriptUrl,'utf8');
  assert.match(compositeScript,/const forceHorizontal=optionArgs\.includes\('--force-horizontal'\)/);
  assert.match(compositeScript,/const rotationDegrees=forceHorizontal\?0:measurement\.angleDegrees/);
  const userReferenceScript=await readFile(userReferenceScriptUrl,'utf8');
  assert.match(userReferenceScript,/USER_PROVIDED_NO_GENERATIVE_REDRAW|removeConnectedBackground/);
  assert.match(provenance.cleanBodyAtlasScript||'',/^\/scripts\/[a-z0-9-]+\.cjs$/);
  assert.equal(provenance.generatedOriginals.length,3);
  for(const suitCode of SUIT_CODES){
    const source=provenance.generatedOriginals.find(item=>item.suitCode===suitCode);
    assert.equal(source?.sourcePolicy,'GENERATED_CLEAN_BODY_NO_WEAPON');
    assert.match(source?.cleanBodySource||'',/clean-body(?:-chroma)?-v3\.png$/);
    assert.match(source?.cleanBodySourceSha256||'',/^[A-F0-9]{64}$/);
    assert.equal(sha256(await readFile(assetFileUrl(source.cleanBodySource))),source.cleanBodySourceSha256);
    assert.match(source?.gripProxySource||'',/grip-proxy-v\d+\.png$/);
    assert.equal(sha256(await readFile(assetFileUrl(source.gripProxySource))),source.gripProxySourceSha256);
    assert.match(source?.transparentStaticSha256||'',/^[A-F0-9]{64}$/);
    assert.equal(sha256(await readFile(assetFileUrl(source.transparentStatic))),source.transparentStaticSha256);
    const manifestSuit=manifest.suits.find(item=>item.code===suitCode);
    assert.equal(source.transparentStatic,manifestSuit?.image,`${suitCode} provenance static path`);
    assert.equal(source.transparentStaticSha256,manifestSuit?.sha256,`${suitCode} provenance static hash`);
  }

  // The authored atlas supplements the deployed database preview/fallback art;
  // it must never replace image_url with a visible 4x2 grid.
  for(const suit of manifest.suits){
    assert.match(suit.image,/^\/assets\/ui\/project-v\/account-battle-suits\/suits\/battle-suit-appearance-\d{2}-[^/]+-v\d+\.png$/);
    const bytes=await readFile(assetFileUrl(suit.image));
    assert.match(suit.sha256,/^[A-F0-9]{64}$/);
    assert.equal(sha256(bytes),suit.sha256,`${suit.code} static fallback hash`);
  }
  for(const weapon of manifest.weapons){
    assert.match(weapon.battleSprite,/^\/assets\/ui\/project-v\/account-battle-suits\/weapons\/[a-z0-9-]+-v\d+\.png$/);
    const bytes=await readFile(assetFileUrl(weapon.battleSprite));
    assert.match(weapon.sha256,/^[A-F0-9]{64}$/);
    assert.equal(sha256(bytes),weapon.sha256,`${weapon.equipmentCode} static fallback hash`);
    assert.equal(weapon.authoredCompositeSource,'EXACT_BATTLE_SPRITE_RASTER',`${weapon.equipmentCode} must preserve the exact DB weapon cutout`);
  }
});

test('all six immutable v3 authored sheets are exact transparent 1536x1024 4x2 grids',async()=>{
  const manifest=await readManifest();
  const paths=[];
  for(const suit of manifest.suits){
    const seenWeapons=[];
    for(const [group,sheet] of animationSheetEntries(suit)){
      assert.equal(sheet.composition,'GRIP_PROXY_HAND_FOREGROUND_EXACT_DATABASE_WEAPON_V3',`${suit.code}/${group} must keep the weapon behind the retained hands and forearms`);
      assert.match(sheet.image,/^\/assets\/ui\/project-v\/account-battle-suits\/animations\/[a-z0-9-]+-atlas-v3\.png$/,`${suit.code}/${group} must use the immutable v3 atlas path`);
      assert.equal(new URL(sheet.image,'https://soopketmon.invalid').search,'',`${sheet.image} must version the filename, not a mutable query`);
      assert.match(sheet.sha256,/^[A-F0-9]{64}$/);
      paths.push(sheet.image);

      const rows=normalizeWeaponRows(sheet.weaponRows);
      assert.deepEqual(rows.map(item=>item.row).sort(),[0,1],`${suit.code}/${group} must map both physical rows`);
      assert.deepEqual(sorted(rows.map(item=>item.weaponCode)),sorted(WEAPON_GROUPS[group]),`${suit.code}/${group} weapon rows`);
      seenWeapons.push(...rows.map(item=>item.weaponCode));

      const bytes=await readFile(assetFileUrl(sheet.image));
      assert.equal(sha256(bytes),sheet.sha256,`${suit.code}/${group} sheet hash`);
      const pipeline=sharp(bytes,{failOn:'error'});
      const [metadata,stats]=await Promise.all([pipeline.metadata(),pipeline.clone().stats()]);
      assert.equal(metadata.format,'png',sheet.image);
      assert.equal(metadata.width,1536,sheet.image);
      assert.equal(metadata.height,1024,sheet.image);
      assert.equal(metadata.width%4,0,sheet.image);
      assert.equal(metadata.height%2,0,sheet.image);
      assert.equal(metadata.width/4,384,`${sheet.image} frame width`);
      assert.equal(metadata.height/2,512,`${sheet.image} frame height`);
      assert.equal(metadata.channels,4,`${sheet.image} must decode as RGBA`);
      assert.equal(metadata.hasAlpha,true,`${sheet.image} must retain alpha`);
      assert.equal(stats.isOpaque,false,`${sheet.image} must contain transparent pixels`);
      const alpha=stats.channels[3];
      assert.ok(alpha&&alpha.min<255&&alpha.max>0,`${sheet.image} alpha must contain both transparent and visible content`);

      const frameHashes=[[],[]];
      for(let row=0;row<2;row+=1){
        for(let column=0;column<4;column+=1){
          const frame=sharp(bytes,{failOn:'error'}).extract({left:column*384,top:row*512,width:384,height:512}).ensureAlpha();
          const [frameStats,raw]=await Promise.all([frame.clone().stats(),frame.raw().toBuffer()]);
          const frameAlpha=frameStats.channels[3];
          assert.equal(frameStats.isOpaque,false,`${sheet.image} row ${row} ${FRAME_ORDER[column]} needs transparent background`);
          assert.ok(frameAlpha&&frameAlpha.min<255&&frameAlpha.max>0,`${sheet.image} row ${row} ${FRAME_ORDER[column]} must contain visible authored art`);
          let edgeAlphaPixels=0;
          for(let y=0;y<512;y+=1){
            for(let x=0;x<384;x+=1){
              if(x>1&&x<382&&y>1&&y<510)continue;
              if(raw[(y*384+x)*4+3]>0)edgeAlphaPixels+=1;
            }
          }
          assert.equal(edgeAlphaPixels,0,`${sheet.image} row ${row} ${FRAME_ORDER[column]} must not clip or bleed across atlas cells`);
          frameHashes[row].push(sha256(raw));
        }
        assert.equal(new Set(frameHashes[row]).size,4,`${sheet.image} row ${row} must author distinct ready/fire/recoil/recover frames`);
      }
    }
    assert.deepEqual(sorted(seenWeapons),sorted(WEAPON_CODES),`${suit.code} must author all four approved DB weapons exactly once`);
  }
  assert.equal(paths.length,6);
  assert.equal(new Set(paths).size,6,'each suit/weapon-pair must have an immutable dedicated sheet');
});

test('Suit 02 M4A1 v3 row preserves the approved canonical v2 pixels exactly',async()=>{
  const manifest=await readManifest();
  const suit=manifest.suits.find(item=>item.code==='BATTLE_SUIT_02');
  const v3SheetBytes=await readFile(assetFileUrl(suit.animationSheets.m4a1M200.image));
  const canonicalBytes=await readFile(canonicalSuit02M4SheetUrl);
  for(let column=0;column<4;column+=1){
    const region={left:column*384,top:0,width:384,height:512};
    const [actual,canonical]=await Promise.all([
      sharp(v3SheetBytes,{failOn:'error'}).extract(region).ensureAlpha().raw().toBuffer(),
      sharp(canonicalBytes,{failOn:'error'}).extract(region).ensureAlpha().raw().toBuffer()
    ]);
    assert.equal(actual.equals(canonical),true,
      `Suit 02 M4A1 ${FRAME_ORDER[column]} raw RGBA must remain byte-identical to the approved v2 frame (${sha256(canonical)})`);
  }
});

test('v3 build diagnostics prove grip-layer scale consistency and exact-weapon-only composition',async()=>{
  const [manifest,diagnostics,provenance]=await Promise.all([
    readManifest(),
    readDiagnostics(),
    readFile(assetFileUrl((await readManifest()).generationProvenance),'utf8').then(JSON.parse)
  ]);
  assert.equal(diagnostics.version,'v3');
  assert.equal(diagnostics.contract,'PROJECT_V_ACCOUNT_BATTLE_SUIT_GRIP_LAYER_ATLAS_DIAGNOSTICS_V3');
  assert.equal(provenance.buildDiagnostics,'/assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v3.json');
  assert.match(diagnostics.sha256Algorithm||'',/^SHA-256$/i);
  assert.equal(diagnostics.entries.length,12);

  assert.equal(diagnostics.sheets.length,6,'diagnostics must contain one sheet for every suit/pair');
  const diagnosticSheetKeys=diagnostics.sheets.map(sheet=>`${sheet.suitCode}:${sheet.pair}`);
  assert.equal(new Set(diagnosticSheetKeys).size,6,'diagnostic sheet keys must be unique');
  for(const diagnosticSheet of diagnostics.sheets){
    const manifestSuit=manifest.suits.find(item=>item.code===diagnosticSheet.suitCode);
    const manifestSheet=diagnosticSheet.pair==='m4a1-m200'
      ?manifestSuit?.animationSheets?.m4a1M200
      :manifestSuit?.animationSheets?.akSks;
    assert.ok(manifestSheet,`${diagnosticSheet.suitCode}/${diagnosticSheet.pair} manifest sheet`);
    assert.equal(diagnosticSheet.image,manifestSheet.image,`${diagnosticSheet.suitCode}/${diagnosticSheet.pair} diagnostics path`);
    assert.equal(diagnosticSheet.sha256,manifestSheet.sha256,`${diagnosticSheet.suitCode}/${diagnosticSheet.pair} diagnostics hash`);
    assert.equal(sha256(await readFile(assetFileUrl(diagnosticSheet.image))),diagnosticSheet.sha256,`${diagnosticSheet.suitCode}/${diagnosticSheet.pair} actual sheet hash`);
  }

  const keys=diagnostics.entries.map(entry=>`${entry.suitCode}:${entry.weaponCode}`);
  assert.equal(new Set(keys).size,12,'diagnostics must contain one unique entry for every suit/weapon pair');
  assert.deepEqual(sorted(keys),sorted(SUIT_CODES.flatMap(suitCode=>WEAPON_CODES.map(weaponCode=>`${suitCode}:${weaponCode}`))));
  const weaponHashes=new Map(manifest.weapons.map(weapon=>[weapon.equipmentCode,weapon.sha256]));

  for(const entry of diagnostics.entries){
    assert.match(entry.bodySourceSha256,/^[A-F0-9]{64}$/,`${entry.suitCode}/${entry.weaponCode} body source hash`);
    assert.equal(entry.exactWeaponSourceSha256,weaponHashes.get(entry.weaponCode),`${entry.suitCode}/${entry.weaponCode} exact DB weapon source hash`);
    assert.equal(entry.legacyWeaponPixelsRemoved,0,`${entry.suitCode}/${entry.weaponCode} clean body must require no legacy rifle erasure`);
    assert.equal(entry.exactWeaponOnly,true,`${entry.suitCode}/${entry.weaponCode} must contain only the selected exact DB weapon raster`);
    assert.equal(entry.gripProxyRemoved,true,`${entry.suitCode}/${entry.weaponCode} green pose proxy must be removed`);
    assert.deepEqual(entry.semanticLayerOrder,['EXACT_DATABASE_WEAPON','BODY_ARMS_AND_HANDS_FOREGROUND'],`${entry.suitCode}/${entry.weaponCode} semantic layer order`);
    const {headY,soleY,height}=entry.bodyBounds||{};
    assert.ok(Number.isInteger(headY)&&Number.isInteger(soleY)&&Number.isInteger(height),`${entry.suitCode}/${entry.weaponCode} body bounds must be integral pixels`);
    assert.ok(headY>=0&&headY<soleY&&soleY<512,`${entry.suitCode}/${entry.weaponCode} body bounds must fit one frame`);
    assert.equal(height,soleY-headY+1,`${entry.suitCode}/${entry.weaponCode} body height must use inclusive head-to-sole bounds`);
    assert.ok(height>=280,`${entry.suitCode}/${entry.weaponCode} character must not be underscaled`);
  }

  const dedicatedM200Keys=new Set([
    'BATTLE_SUIT_02:EQ_1785961300455',
    'BATTLE_SUIT_03:EQ_1785961300455'
  ]);
  const provenanceBySuit=new Map(provenance.generatedOriginals.map(source=>[source.suitCode,source]));
  for(const entry of diagnostics.entries){
    const key=`${entry.suitCode}:${entry.weaponCode}`;
    const dedicated=dedicatedM200Keys.has(key);
    assert.equal(entry.usesDedicatedGripPose,dedicated,`${key} dedicated M200 pose contract`);
    assert.equal(entry.bodySourceSha256,entry.gripProxySourceSha256,`${key} body must come from its keyed grip pose`);
    if(dedicated){
      assert.match(entry.gripProxySource,/-m200-grip-proxy-v4\.png$/,`${key} dedicated M200 proxy path`);
      const suitProvenance=provenanceBySuit.get(entry.suitCode);
      const proxy=suitProvenance?.weaponSpecificGripProxies?.find(item=>item.weaponCode===entry.weaponCode);
      assert.equal(proxy?.source,entry.gripProxySource,`${key} provenance proxy path`);
      assert.equal(proxy?.sha256,entry.gripProxySourceSha256,`${key} provenance proxy hash`);
      assert.equal(proxy?.policy,'DEDICATED_WEAPON_GEOMETRY_AND_CONTACT_POINTS',`${key} proxy policy`);
      assert.notEqual(proxy?.sha256,suitProvenance?.gripProxySourceSha256,`${key} must not reuse the AR grip proxy`);
      assert.ok(Number(entry.weaponPlacementAdjustment?.y)>0,`${key} must record its contact-point vertical correction`);
    }
  }
  assert.equal(provenance.generatedOriginals.flatMap(source=>source.weaponSpecificGripProxies||[]).length,2,'only Suit 02/03 M200 need dedicated proxies');

  for(const suitCode of SUIT_CODES){
    const reference=diagnostics.entries.find(entry=>entry.suitCode===suitCode&&entry.weaponCode==='EQ_1785961232958').bodyBounds;
    const m200=diagnostics.entries.find(entry=>entry.suitCode===suitCode&&entry.weaponCode==='EQ_1785961300455');
    for(const [metric,label] of [['headY','head'],['soleY','sole'],['height','body scale']]){
      assert.ok(Math.abs(m200.bodyBounds[metric]-reference[metric])<=2,`${suitCode} M200 ${label} must stay within 2px of the AR pose`);
    }
  }
});

test('catalog resolver covers exactly three suits x four approved DB weapons with frame-exact metadata',async()=>{
  const {
    ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG,
    resolveAccountBattleSuitAnimation
  }=await import(catalogModuleUrl.href);
  const expectedPairs=await manifestPairMap();
  assert.equal(expectedPairs.size,12);
  assert.equal(Object.keys(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG).length,12);
  assert.ok(Object.isFrozen(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG),'catalog must be immutable');
  assert.deepEqual(sorted(Object.keys(ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG)),sorted(expectedPairs.keys()));

  for(const suitCode of SUIT_CODES){
    for(const weaponCode of WEAPON_CODES){
      const key=`${suitCode}:${weaponCode}`;
      const expected=expectedPairs.get(key);
      const resolved=resolveAccountBattleSuitAnimation(suitCode,weaponCode);
      assert.ok(resolved,key);
      assert.equal(resolved.suitCode,suitCode,key);
      assert.equal(resolved.weaponCode,weaponCode,key);
      assert.equal(new URL(resolved.sheetUrl,'https://soopketmon.invalid').pathname,expected.image,key);
      assert.equal(resolved.row,expected.row,key);
      assert.deepEqual(resolved.grid,{columns:4,rows:2},key);
      assert.deepEqual(resolved.frameOrder,FRAME_ORDER,key);
      assert.deepEqual(resolved.durationsMs,DURATIONS_MS,key);
      assert.ok(Object.isFrozen(resolved),`${key} resolver entry must be immutable`);
      assert.deepEqual(resolved.pivotContract,{type:'SOLE_CENTER',unit:'NORMALIZED_FRAME',alphaThreshold:16,bottomBandPx:9},`${key} sole-pivot contract`);
      assert.ok(Object.isFrozen(resolved.pivotContract),`${key} pivot contract must be immutable`);

      assert.deepEqual(Object.keys(resolved.frames),FRAME_ORDER,key);
      FRAME_ORDER.forEach((name,column)=>{
        assert.deepEqual(resolved.frames[name],{name,column,row:expected.row},`${key}/${name}`);
      });
      assert.deepEqual(Object.keys(resolved.pivots),FRAME_ORDER,key);
      assert.ok(Object.isFrozen(resolved.pivots),`${key} pivots must be immutable`);
      assert.equal(resolved.muzzle?.frame,'fire',key);
      assert.equal(resolved.muzzle?.unit,'NORMALIZED_FRAME',key);
      assert.ok(Number.isFinite(resolved.muzzle?.x)&&resolved.muzzle.x>=0&&resolved.muzzle.x<=1,`${key} normalized muzzle x`);
      assert.ok(Number.isFinite(resolved.muzzle?.y)&&resolved.muzzle.y>=0&&resolved.muzzle.y<=1,`${key} normalized muzzle y`);
      assert.ok(Number.isFinite(resolved.contentBottom)&&resolved.contentBottom>.7&&resolved.contentBottom<.95,`${key} sole pivot`);
      assert.ok(Number.isFinite(resolved.nameHud?.contentTop)&&resolved.nameHud.contentTop>=0&&resolved.nameHud.contentTop<resolved.contentBottom,`${key} visible content top`);
      assert.ok(Number.isFinite(resolved.scaleMultiplier)&&resolved.scaleMultiplier>=1.4&&resolved.scaleMultiplier<=1.51,`${key} authored scale correction`);

      const {data,info}=await decodedSheet(expected.image);
      FRAME_ORDER.forEach((name,column)=>{
        const measured=measuredSolePivot(data,info,expected.row,column,resolved.pivotContract);
        const pivot=resolved.pivots[name];
        assert.ok(Object.isFrozen(pivot),`${key}/${name} pivot must be immutable`);
        assert.equal(pivot.unit,'NORMALIZED_FRAME',`${key}/${name} pivot unit`);
        assert.ok(Math.abs(pivot.x*384-measured.x)<=.002,`${key}/${name} pivot x must match the measured sole centroid`);
        assert.ok(Math.abs(pivot.y*512-measured.y)<=.002,`${key}/${name} pivot y must match the lowest sole pixel`);
        assert.ok(Math.abs(measured.x-pivot.x*384)<=.002&&Math.abs(measured.y-pivot.y*512)<=.002,`${key}/${name} authored pivot must eliminate sole drift at the sprite origin`);
      });
      const muzzleColumn=1;
      let minimumY=512,maximumY=-1,fireMaximumX=-1;
      const fireTipY=[];
      for(let column=0;column<4;column+=1){
        for(let y=0;y<512;y+=1){
          for(let x=0;x<384;x+=1){
            const alpha=data[((expected.row*512+y)*info.width+column*384+x)*4+3];
            if(alpha<16)continue;
            minimumY=Math.min(minimumY,y);
            maximumY=Math.max(maximumY,y);
            if(column===muzzleColumn)fireMaximumX=Math.max(fireMaximumX,x);
          }
        }
      }
      for(let y=0;y<300;y+=1){
        for(let x=Math.max(0,fireMaximumX-3);x<=fireMaximumX;x+=1){
          const alpha=data[((expected.row*512+y)*info.width+muzzleColumn*384+x)*4+3];
          if(alpha>=16)fireTipY.push(y);
        }
      }
      fireTipY.sort((left,right)=>left-right);
      const measuredMuzzleY=fireTipY[Math.floor(fireTipY.length/2)];
      assert.ok(fireTipY.length>0,`${key} exact weapon tip must be measurable`);
      assert.ok(Math.abs(resolved.muzzle.x*384-fireMaximumX)<=1,`${key} muzzle x must bind the exact fire-frame weapon tip`);
      assert.ok(Math.abs(resolved.muzzle.y*512-measuredMuzzleY)<=1,`${key} muzzle y must bind the exact fire-frame weapon tip`);
      assert.ok(Math.abs(resolved.nameHud.contentTop*512-minimumY)<=1,`${key} nickname panel must clear visible content`);
      assert.ok(Math.abs(resolved.contentBottom*512-maximumY)<=1,`${key} sole pivot must bind the lowest visible pixel`);
    }
  }

  assert.equal(resolveAccountBattleSuitAnimation('BATTLE_SUIT_UNKNOWN',WEAPON_CODES[0]),null);
  assert.equal(resolveAccountBattleSuitAnimation(SUIT_CODES[0],'EQ_UNKNOWN'),null);
  assert.equal(resolveAccountBattleSuitAnimation('',WEAPON_CODES[0]),null);
});
