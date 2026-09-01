import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import sharp from 'sharp';

const root=new URL('../',import.meta.url);
const manifestUrl=new URL('assets/ui/project-v/account-battle-suits/manifest-v2.json',root);
const catalogModuleUrl=new URL('preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js',root);

const SUIT_CODES=Object.freeze(['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03']);
const WEAPON_GROUPS=Object.freeze({
  m4a1M200:Object.freeze(['EQ_1785427638137','EQ_1785961300455']),
  akSks:Object.freeze(['EQ_1785961232958','EQ_1786966923833'])
});
const WEAPON_CODES=Object.freeze(Object.values(WEAPON_GROUPS).flat());
const FRAME_ORDER=Object.freeze(['ready','fire','recoil','recover']);
const DURATIONS_MS=Object.freeze({ready:45,fire:45,recoil:70,recover:125});

let manifestPromise=null;
const decodedSheetCache=new Map();
function readManifest(){
  manifestPromise??=readFile(manifestUrl,'utf8').then(JSON.parse);
  return manifestPromise;
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

test('animated Battle Suit v2 manifest preserves the PVE-only five-card/static-fallback contract',async()=>{
  const manifest=await readManifest();
  assert.equal(manifest.contract,'PROJECT_V_ACCOUNT_BATTLE_SUIT_ANIMATED_V1');
  assert.equal(manifest.scope,'PVE_ONLY');
  assert.equal(manifest.generationProvenance,'/assets/ui/project-v/account-battle-suits/animation-generation-provenance-v1.json');
  const provenance=JSON.parse(await readFile(assetFileUrl(manifest.generationProvenance),'utf8'));
  assert.equal(provenance.tool,'OpenAI built-in image generation tool');
  assert.match(provenance.finalPromptSet?.exactAllWeaponsComposite||'',/exact approved database battle-sprite raster/i);
  assert.deepEqual(manifest.animationContract?.grid,{columns:4,rows:2});
  assert.deepEqual(manifest.animationContract?.frameOrder,FRAME_ORDER);
  assert.equal(manifest.animationContract?.format,'PNG_RGBA_GRID');
  assert.equal(manifest.animationContract?.approvedWeaponScalePolicy,'ROW_MEDIAN_CONSTANT_WIDTH');
  assert.equal(manifest.animationContract?.muzzleFlashSource,'RUNTIME_EFFECT_ONLY');
  assert.equal(manifest.animationContract?.placementTuning,'SUIT_WEAPON_PAIR_CONTENT_BOUNDS');
  assert.equal(manifest.animationContract?.muzzleBinding,'FIRE_FRAME_EXACT_WEAPON_TIP');

  assert.equal(manifest.renderContract?.canonicalAllyCardCount,5);
  assert.equal(manifest.renderContract?.movement,false);
  assert.equal(manifest.renderContract?.addsIndependentDamage,false);
  assert.equal(manifest.renderContract?.authoredCompositeForApprovedWeapons,true);
  assert.equal(manifest.renderContract?.fallbackBodyAndWeaponAreSeparate,true);
  assert.equal(manifest.renderContract?.approvedWeaponBinding,'equippedWeapon.code');
  assert.equal(manifest.renderContract?.loadPolicy,'EQUIPPED_SUIT_AND_WEAPON_PAIR_ONLY');
  assert.equal(manifest.renderContract?.fallback,'STATIC_BODY_PLUS_WEAPON');

  assert.deepEqual((manifest.suits||[]).map(item=>item.code),SUIT_CODES);
  assert.deepEqual(sorted((manifest.weapons||[]).map(item=>item.equipmentCode)),sorted(WEAPON_CODES));

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

test('all six immutable authored sheets are exact transparent 1536x1024 4x2 grids',async()=>{
  const manifest=await readManifest();
  const paths=[];
  for(const suit of manifest.suits){
    const seenWeapons=[];
    for(const [group,sheet] of animationSheetEntries(suit)){
      assert.equal(sheet.composition,'EXACT_DATABASE_WEAPON_CUTOUT_WITH_AUTHORED_HAND_OCCLUSION',`${suit.code}/${group} must not redraw the DB weapon`);
      assert.match(sheet.image,/^\/assets\/ui\/project-v\/account-battle-suits\/animations\/[a-z0-9-]+-v\d+\.png$/,`${suit.code}/${group} must use an immutable versioned PNG path`);
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

      assert.deepEqual(Object.keys(resolved.frames),FRAME_ORDER,key);
      FRAME_ORDER.forEach((name,column)=>{
        assert.deepEqual(resolved.frames[name],{name,column,row:expected.row},`${key}/${name}`);
      });
      assert.equal(resolved.muzzle?.frame,'fire',key);
      assert.equal(resolved.muzzle?.unit,'NORMALIZED_FRAME',key);
      assert.ok(Number.isFinite(resolved.muzzle?.x)&&resolved.muzzle.x>=0&&resolved.muzzle.x<=1,`${key} normalized muzzle x`);
      assert.ok(Number.isFinite(resolved.muzzle?.y)&&resolved.muzzle.y>=0&&resolved.muzzle.y<=1,`${key} normalized muzzle y`);
      assert.ok(Number.isFinite(resolved.contentBottom)&&resolved.contentBottom>.7&&resolved.contentBottom<.95,`${key} sole pivot`);
      assert.ok(Number.isFinite(resolved.nameHud?.contentTop)&&resolved.nameHud.contentTop>=0&&resolved.nameHud.contentTop<resolved.contentBottom,`${key} visible content top`);
      assert.ok(Number.isFinite(resolved.scaleMultiplier)&&resolved.scaleMultiplier>=1.4&&resolved.scaleMultiplier<=1.51,`${key} authored scale correction`);

      const {data,info}=await decodedSheet(expected.image);
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
