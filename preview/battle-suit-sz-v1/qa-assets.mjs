import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {weaponFits,transformExactWeapon} from './resource-config.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),fromUrl=p=>path.join(root,p.slice(1)),sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const manifest=JSON.parse(await readFile(path.join(here,'manifest.json'),'utf8'));
assert.deepEqual(manifest.approvedOrder,['H-BODY','S-BODY','Z-BODY']);assert.equal(manifest.liveEnabled,false);assert.equal(manifest.suits.length,2);assert.equal(manifest.animationContract.poseAnimation,false);
const report={status:'PASS',checks:[],weapons:[],suits:[],counts:{fullBody:0,atlases:0},limitations:['Static aiming frames use the existing V3 ballistic animation; no new articulated frame sequence.']};
for(const w of manifest.weapons){assert.equal(sha(await readFile(fromUrl(w.battleSprite))),w.sha256);report.weapons.push({name:w.name,sha256:w.sha256,unchanged:true});}
const oldHashes={
 'helios-3.png':'92B9FB66C5C2160E05168C03617DBC31B8D377BCE726C6A1E00C8F7732278EAC',
 'helios-4.png':'463D446D2C9DF31F236DBC06718EFF6A28927E7DF238CA8174AA8051AB77B082',
 'helios-5.png':'B885B6ADB9D37F281A35A2BA1CDAC071EBDDEA271F179135601EA34D86795A6E',
 'helios-6.png':'B68271FBB54155A393F82378E57620F640C09AA2FDB2D700A083F7FCDEF6EEEA'};
for(const[file,hash]of Object.entries(oldHashes))assert.equal(sha(await readFile(path.join(root,'preview/battle-suit-prestige-v1/assets/sprites',file))),hash);
const fullSheets=[],upperSheets=[];
await mkdir(path.join(here,'qa'),{recursive:true});
for(const suit of manifest.suits){assert.equal(sha(await readFile(fromUrl(suit.source))),suit.sha256);assert.equal(suit.entries.length,6);const result={name:suit.name,sourceUnchanged:true,entries:[]},canonical=await sharp(path.join(here,'assets/prepared',`${suit.id}-canonical-alpha.png`)).ensureAlpha().raw().toBuffer();const seen=new Set();
 for(const e of suit.entries){const frameBytes=await readFile(fromUrl(e.image)),frame=await sharp(frameBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),full=await sharp(fromUrl(e.highResolution)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(sha(frameBytes),e.sha256);assert.deepEqual([frame.info.width,frame.info.height,frame.info.channels],[384,512,4]);assert.deepEqual([full.info.width,full.info.height],[1280,1536]);assert.equal(e.diagnostics.bounds.bottom,479);assert(e.diagnostics.transparentPixels>384*512*.45);assert(e.diagnostics.bounds.left>=4);assert(e.diagnostics.bounds.left+e.diagnostics.bounds.width<=380);assert(e.diagnostics.bounds.top>=35);assert(Math.abs(e.authored.aimAxisDegrees)<.1);assert(e.authored.weaponLengthToFigureHeight>=.48);assert.equal(e.authored.placement.width,weaponFits[e.weaponIndex].width);
  const atlas=await sharp(fromUrl(e.profile.sheetUrl)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([atlas.info.width,atlas.info.height],[1536,1024]);for(let col=0;col<4;col++){const cell=await sharp(fromUrl(e.profile.sheetUrl)).extract({left:col*384,top:e.profile.row*512,width:384,height:512}).ensureAlpha().raw().toBuffer();assert.equal(Buffer.compare(cell,frame.data),0);}
  seen.add(e.profile.sheetUrl);const muzzle=e.profile.muzzle;assert(muzzle.x>.55&&muzzle.x<1&&muzzle.y>.1&&muzzle.y<.45);const pivot=e.diagnostics.pivot;assert(pivot.x>0&&pivot.x<1);assert.equal(pivot.y,479/512);
  const exact=await transformExactWeapon(weaponFits[e.weaponIndex]),weapon=await sharp(exact.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true}),hands=await sharp(path.join(here,'assets/prepared',`${suit.id}-${e.id}-hands-alpha.png`)).ensureAlpha().raw().toBuffer(),p=e.authored.placement;let exactPixels=0,wrongPixels=0,totalOpaque=0;
  for(let y=0;y<weapon.info.height;y++)for(let x=0;x<weapon.info.width;x++){const o=(y*weapon.info.width+x)*4,dx=x+p.left,dy=y+p.top;if(weapon.data[o+3]<250||dx<0||dx>=1280||dy<0||dy>=1536)continue;totalOpaque++;const d=(dy*1280+dx)*4;if(hands[d+3]>0)continue;exactPixels++;const tolerance=256-weapon.data[o+3];if([0,1,2].some(k=>Math.abs(weapon.data[o+k]-full.data[d+k])>tolerance))wrongPixels++;}
  assert(totalOpaque>10000&&exactPixels>totalOpaque*.65,`${suit.id}/${e.id}: insufficient visible original gun ${exactPixels}/${totalOpaque}`);assert.equal(wrongPixels,0,`${suit.id}/${e.id}: original gun pixels altered`);
  let protectedPixels=0,helmetPixels=0;for(let y=800;y<1536;y++)for(let x=0;x<1280;x++){const o=(y*1280+x)*4;if(canonical[o+3]===255){assert.equal(full.data[o+3],255);for(let k=0;k<3;k++)assert.equal(full.data[o+k],canonical[o+k]);protectedPixels++;}}
  for(let y=60;y<230;y++)for(let x=300;x<450;x++){const o=(y*1280+x)*4;if(canonical[o+3]===255){for(let k=0;k<4;k++)assert.equal(full.data[o+k],canonical[o+k],`${suit.id}/${e.id}: approved helmet changed`);helmetPixels++;}}
  let residualProxy=0;for(let o=0;o<full.data.length;o+=4)if(full.data[o+3]>180&&full.data[o+1]>150&&full.data[o+1]>full.data[o]+65&&full.data[o+1]>full.data[o+2]+65)residualProxy++;assert(residualProxy<12,`${suit.id}/${e.id}: green remains`);
  result.entries.push({weapon:e.weaponName,dimensions:[384,512],visibleOriginalWeaponPixels:exactPixels,weaponAlphaMinimum:250,weaponColorTolerance:'256 - source alpha (alpha-composite rounding)',alteredWeaponPixels:wrongPixels,lockedHelmetPixels:helmetPixels,lockedLowerBodyPixels:protectedPixels,residualProxyPixels:residualProxy,aimAxisDegrees:e.authored.aimAxisDegrees,footBaseline:479,staticAtlasFramesEqual:true});report.counts.fullBody++;
  const ordinal=fullSheets.length,title=Buffer.from(`<svg width="430" height="44"><rect width="430" height="44" fill="#112338"/><text x="18" y="28" fill="${suit.accent}" font-size="18" font-family="Arial">${suit.name} / ${e.id}</text></svg>`);const fullCard=await sharp({create:{width:430,height:566,channels:4,background:'#111b29'}}).composite([{input:title,left:0,top:0},{input:frameBytes,left:23,top:44}]).png().toBuffer();fullSheets.push({input:fullCard,left:(ordinal%3)*430,top:Math.floor(ordinal/3)*566});
  const crop=await sharp(fromUrl(e.highResolution)).extract({left:80,top:205,width:1170,height:395}).resize({width:702}).png().toBuffer();const cropCard=await sharp({create:{width:702,height:281,channels:4,background:ordinal%2?'#b9c8d7':'#182538'}}).composite([{input:title,left:0,top:0},{input:crop,left:0,top:44}]).png().toBuffer();upperSheets.push({input:cropCard,left:(ordinal%2)*702,top:Math.floor(ordinal/2)*281});
 }
 assert.equal(seen.size,3);report.counts.atlases+=seen.size;report.suits.push(result);
}
assert.deepEqual(report.counts,{fullBody:12,atlases:6});
report.checks=['Approved S/Z sources unchanged','Original six weapon hashes unchanged','Four locked H-BODY sprites unchanged','12 real-alpha full-body frames','Six 4x2 atlases with identical authored aiming frames','Original visible weapon pixels preserved','Lower-body original RGB preserved','Horizontal bore axes','Valid sole pivots and muzzle anchors','No saturated green proxy residue'];
await sharp({create:{width:1290,height:2264,channels:4,background:'#111b29'}}).composite(fullSheets).png().toFile(path.join(here,'qa/all-loadouts.png'));
await sharp({create:{width:1404,height:1686,channels:4,background:'#111b29'}}).composite(upperSheets).png().toFile(path.join(here,'qa/hand-contact-review.png'));
await writeFile(path.join(here,'qa/asset-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,counts:report.counts}));
