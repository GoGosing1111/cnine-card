import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {MERCENARY_DIALOGUE_PROFILES,SHIRANUI_DIALOGUE_LINES} from '../preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js';
import {SHIRANUI_ART} from '../shared/mercenary-shiranui-v1.mjs';
const dir='assets/ui/project-v/mercenaries/shiranui-fx-20261018/';
const m=JSON.parse(fs.readFileSync(dir+'manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('Shiranui generated sources remain intact and GPU atlas cells have real transparent gutters',async()=>{
 for(const asset of Object.values(m.assets))for(const variant of [asset.source,asset.runtime]){
  const file=dir+variant.path;assert.equal(hash(fs.readFileSync(file)),variant.sha256);
  assert((await sharp(file).metadata()).hasAlpha);
 }
 for(const spec of Object.values(m.effects)){
  assert.equal(spec.frames.length,spec.frameCount);assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);
  const file=new URL(spec.atlas,new URL('../preview/mercenary-monochrome-artillery-battle-v1/',import.meta.url));
  const {data,info}=await sharp(fileURLToPath(file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,spec.cellSize*spec.columns);assert.equal(info.height,spec.cellSize*Math.ceil(spec.frameCount/spec.columns));
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const cx=x%spec.cellSize,cy=y%spec.cellSize;
   if(cx<24||cy<24||cx>=spec.cellSize-24||cy>=spec.cellSize-24)assert.equal(data[(y*info.width+x)*4+3],0,'texture filtering must not pick up the neighboring frame');
  }
 }
 for(const [path,expected]of [[SHIRANUI_ART.sourceArt,SHIRANUI_ART.sourceArtSha256],[SHIRANUI_ART.battleSprite,SHIRANUI_ART.battleSpriteSha256]])
  assert.equal(hash(fs.readFileSync(path)).toUpperCase(),expected);
});
test('the new bullet has an opaque metal core and recoil preserves the approved head, lower body and rigid rifle',async()=>{
 const spec=m.effects['silver-tracer'],png=await sharp(dir+m.assets['silver-tracer'].source.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const f of spec.frames.slice(0,4)){
  const tipX=Math.round(f.anchor.x*spec.cellSize-24)+f.sourceRect.left,tipY=Math.round(f.anchor.y*spec.cellSize-24);
  let sum=0,count=0;for(let y=tipY-5;y<tipY+5;y++)for(let x=tipX-85;x<tipX-35;x++){sum+=png.data[(y*png.info.width+x)*4+3];count++;}
  assert(sum/count>245,'metal core must stay opaque against the battlefield');
 }
 const base=JSON.parse(fs.readFileSync('preview/mercenary-monochrome-artillery-battle-v1/manifest.json'));
 const specAr=m.motion.ar,old=await sharp('preview/mercenary-monochrome-artillery-battle-v1/'+base.motion.ar.atlas).ensureAlpha().raw().toBuffer();
 const bytes=fs.readFileSync(dir+'ar-recoil-v2.webp');assert.equal(hash(bytes),specAr.sha256);
 const current=await sharp(bytes).ensureAlpha().raw().toBuffer();
 for(let n=0;n<4;n++){
  assert.equal(specAr.frames[n].weapon.sha256,base.weapon.sha256);assert.equal(specAr.frames[n].weaponAxisRadians,0);
  assert.deepEqual(specAr.frames[n].head,base.motion.ar.frames[n].head);assert.deepEqual(specAr.frames[n].footAnchor,base.motion.ar.frames[n].footAnchor);
  for(let y=0;y<1536;y++)for(let x=0;x<1536;x++){
   if(n!==0&&n!==3&&y>=660&&y<840)continue;
   const at=((Math.floor(n/2)*1536+y)*3072+n%2*1536+x)*4;
   assert.equal(current[at+3],old[at+3]);if(old[at+3])for(let c=0;c<3;c++)assert.equal(current[at+c],old[at+c]);
  }
 }
 assert(specAr.frames[0].muzzle.x-specAr.frames[1].muzzle.x>=10);
 assert(specAr.frames[0].muzzle.x-specAr.frames[1].muzzle.x<=12);
});
test('every actual consumer delivers the new FX, original portrait and five SSS lines under the current runtime version',()=>{
 const profile=MERCENARY_DIALOGUE_PROFILES['V-987'];
 assert.equal(profile.lines,SHIRANUI_DIALOGUE_LINES);assert.equal(new Set(profile.lines).size,5);
 assert.equal(profile.portrait,'/'+SHIRANUI_ART.sourceArt);
 const version=fs.readFileSync('js/battle-v3-live.js','utf8').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 for(const output of report.outputs){
  const bundle=fs.readFileSync(output.file,'utf8').replace(/\\u([0-9a-f]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
  assert(bundle.includes(version),output.file);assert(bundle.includes('/'+dir+'manifest.json'),output.file);assert(bundle.includes('/'+dir+'dialogue.webp'),output.file);
  assert(bundle.includes('silver-rupture'),output.file);for(const line of profile.lines)assert(bundle.includes(line),output.file);
 }
});

