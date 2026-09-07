import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {fits,transformExactWeapon} from './exact-weapon-fit.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const manifest=JSON.parse(await readFile(path.join(here,'manifest.json'),'utf8'));
const file=url=>path.join(root,url.replace(/^\//,''));
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();

test('only the selected white/orange suit, all six weapons, no live item activation',async()=>{
  assert.equal(manifest.suits.length,1);assert.equal(manifest.weapons.length,6);
  assert.equal(manifest.liveEnabled,false);assert.equal(manifest.scope,'PREVIEW_ONLY');
  const catalog=await readFile(path.join(root,'preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js'),'utf8');
  const live=await readFile(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8');
  for(const suit of manifest.suits){
    assert.equal(suit.entries.length,6);
    assert.equal(new Set(suit.entries.map(e=>e.weaponCode)).size,6);
    assert.ok(!live.includes(suit.source));assert.ok(!catalog.includes(`PREVIEW_${suit.id.toUpperCase()}`));
  }
});
test('original source and six exact weapon rasters retain their recorded hashes',async()=>{
  for(const suit of manifest.suits)assert.equal(sha(await readFile(file(suit.source))),suit.sourceSha256);
  for(const weapon of manifest.weapons)assert.equal(sha(await readFile(file(weapon.battleSprite))),weapon.sha256);
});
test('six sprites have true alpha, safe padding and no chroma-green placeholder',async()=>{
  for(const suit of manifest.suits)for(const entry of suit.entries){
    const bytes=await readFile(file(entry.image)),meta=await sharp(bytes).metadata();
    assert.equal(sha(bytes),entry.sha256);assert.equal(meta.width,384);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);
    const {data}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
    let transparent=0,opaque=0,green=0;
    for(let p=0;p<data.length;p+=4){
      const [r,g,b,a]=data.subarray(p,p+4);
      if(a===0)transparent++;if(a>200)opaque++;
      if(a>32&&g>r+35&&g>b+35)green++;
    }
    assert.ok(transparent>384*512*.55);assert.ok(opaque>20000);assert.ok(green<=10);
    for(let x=0;x<384;x++){assert.equal(data[x*4+3],0);assert.equal(data[((511*384)+x)*4+3],0);}
    for(let y=0;y<512;y++){assert.equal(data[(y*384)*4+3],0);assert.equal(data[(y*384+383)*4+3],0);}
    assert.ok(entry.diagnostics.bounds.height>=420&&entry.diagnostics.bounds.height<=440);
  }
});
test('three atlas files match the existing 4 by 2 V3 contract; all phases are honest static repeats',async()=>{
  const seen=new Set();
  for(const suit of manifest.suits)for(const entry of suit.entries){
    const p=entry.profile,bytes=await readFile(file(p.sheetUrl));
    seen.add(p.sheetUrl);assert.equal(sha(bytes),entry.atlasSha256);
    const meta=await sharp(bytes).metadata();assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[1536,1024,true]);
    const original=await sharp(bytes).extract({left:0,top:p.row*512,width:384,height:512}).raw().toBuffer();
    for(let column=1;column<4;column++){
      const frame=await sharp(bytes).extract({left:column*384,top:p.row*512,width:384,height:512}).raw().toBuffer();
      assert.deepEqual(frame,original);
    }
    assert.ok(p.muzzle.x>.4&&p.muzzle.x<.99);assert.ok(p.muzzle.y>.08&&p.muzzle.y<.6);
    assert.equal(p.pivots.ready.y,479/512);
  }
  assert.equal(seen.size,3);assert.equal(manifest.animationContract.poseAnimation,false);
});
test('approved M200 stays integrated and long; SKS must use exact raster, not an AI redraw',async()=>{
  const [m200,sks]=[2,3].map(index=>manifest.suits[0].entries[index]);
  assert.equal(m200.authored.approval,'USER_APPROVED_20260908');
  assert.equal(m200.authored.uniformScaleOnly,true);
  assert.ok(m200.authored.weaponLengthToFigureHeight>.65);
  assert.equal(sha(await readFile(file(m200.authored.source))),m200.authored.sha256);
  assert.equal(m200.authored.sha256,'DF2775D3A0D4E2BC4DB47A10D0C0CA92196A628FD084D7BFDD45DB1359B4D732');
  assert.equal(sks.authored.composition,'EXACT_WEAPON_RASTER_WITH_HAND_OCCLUSION');
  assert.equal(sks.authored.weaponRasterCopied,true);
  assert.equal(sks.authored.uniformScaleOnly,true);
  assert.equal(sks.authored.sha256,'9FE876729D85DE6B45D27CEAA65F49A91915AB340E5B520146B2E8FA81713462');
  assert.equal(sks.authored.source,manifest.weapons[3].battleSprite);
  assert.ok(!JSON.stringify(manifest).includes('sks-authored-v'));
  assert.equal(sha(await readFile(file(sks.authored.bodySource))),sks.authored.bodySha256);
  assert.ok(sks.authored.weaponLengthToFigureHeight>.59);
  assert.ok(Math.abs(sks.authored.aimAxisDegrees)<.5);
  const heavy=manifest.suits[0].entries[5];
  assert.equal(heavy.authored.weaponRasterCopied,true);
  assert.equal(heavy.authored.sha256,manifest.weapons[5].sha256);
  assert.ok(heavy.authored.weaponLengthToFigureHeight>.69);
  assert.ok(Math.abs(heavy.authored.aimAxisDegrees)<.5);
});
test('SKS and both gold rifles retain the original rasters and corrected whole-gun angle',async()=>{
  for(const index of [3,4,5]){
  const entry=manifest.suits[0].entries[index],p=entry.authored.placement;
  const transformed=await transformExactWeapon(fits[index]);
  const gun=await sharp(transformed.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const composite=await sharp(file(entry.authored.highResolution)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let compared=0,visible=0;
  // Region beyond x930 is entirely clear of hands, so barrel/sight geometry
  // and color pixels can be checked against the real PNG. The alpha-over
  // compositor may round unpremultiplied RGB by one channel value.
  for(let y=0;y<gun.info.height;y++)for(let x=930-p.left;x<gun.info.width;x++){
    const o=(y*gun.info.width+x)*4,target=((y+p.top)*composite.info.width+x+p.left)*4;
    assert.equal(composite.data[target+3],gun.data[o+3]);
    if(gun.data[o+3]>0)visible++;
    if(gun.data[o+3]>16){for(let k=0;k<3;k++)assert.ok(Math.abs(composite.data[target+k]-gun.data[o+k])<=1);compared++;}
  }
  assert.ok(compared>1000);assert.ok(visible>1000);
  }
});
test('preview imports the real V3 unit and never calls a live battle or reward API',async()=>{
  const src=await readFile(path.join(here,'source/preview.js'),'utf8');
  assert.match(src,/import.*AccountBattleUnit.*project-v-v3\/source\/battle\/AccountBattleUnit\.js/);
  assert.match(src,/setAuthoredSheet/);assert.match(src,/playRangedFire/);
  assert.match(src,/resolveAccountBattleSuitAnimation\(manifest\.approvedLiveEquipmentCode/);
  assert.match(src,/Assets\.load\(profile\.sheetUrl\)/);
  assert.doesNotMatch(src,/\/api\/|localStorage|sessionStorage|fetch\([^)]*,\s*\{/);
  const builder=await readFile(path.join(here,'build-assets.mjs'),'utf8');
  assert.match(builder,/compose-exact-battle-suit-weapons\.cjs/);
  assert.match(builder,/--preserve-separated-parts/);
});
