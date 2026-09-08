import {build} from 'esbuild';
import sharp from 'sharp';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MODELS} from './source/models.mjs';
import {partFor} from './source/part-regions.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../..');
await mkdir(path.join(dir,'assets/parts'),{recursive:true});
// Lossless anatomical partition. Each original pixel belongs to exactly ONE
// part: reassembly is byte-identical to the approved H-BODY item, not new art.
const source=path.join(root,'assets/items/h-body-v2066.png');
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const names=['helmet','torso','hips','shoulderL','shoulderR','armL','armR','legL','legR','core'];
const buffers=Object.fromEntries(names.map(n=>[n,Buffer.alloc(data.length)]));
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const u=x/info.width,v=y/info.height;
  let name;
  if(v<.202 && u>.432 && u<.685)name='helmet';
  else if(v>.26&&v<.313&&u>.538&&u<.593)name='core';
  else if(v<.277&&u<.436)name='shoulderL';
  else if(v<.292&&u>.652)name='shoulderR';
  else if(v<.521&&u<(.35-(v-.32)*.13))name='armL';
  else if(v<.535&&u>(.673+(v-.3)*.18))name='armR';
  else if(v<.375)name='torso';
  else if(v<.485)name='hips';
  else name=u<(.535+(v-.485)*.08)?'legL':'legR';
  const i=(y*info.width+x)*4;data.copy(buffers[name],i,i,i+4);
}
let exact=true;
for(let i=0;i<data.length;i++){let sum=0;for(const b of Object.values(buffers))sum+=b[i];if(sum!==data[i]){exact=false;break;}}
if(!exact)throw new Error('H-BODY pixel-preserving reassembly failed');
for(const [name,b]of Object.entries(buffers))await sharp(b,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(path.join(dir,`assets/parts/${name}.png`));
// Crop each additional suit's anatomical part at original resolution. Only
// invisible RGB is discarded; every visible source RGBA byte is preserved.
const variants={};
const hashBuffer=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['e','f','g']){
  const model=MODELS[key],file=await readFile(path.join(root,model.source));
  if(hashBuffer(file)!==model.sha256)throw Error(`${key} CMS source changed; review masks before rebuilding`);
  const {data:raw,info:m}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const groups=new Map();
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
    const offset=(y*m.width+x)*4;if(!raw[offset+3])continue;
    const name=partFor(key,x,y);if(!groups.has(name))groups.set(name,{left:m.width,top:m.height,right:0,bottom:0,indices:[]});
    const g=groups.get(name);g.left=Math.min(g.left,x);g.top=Math.min(g.top,y);g.right=Math.max(g.right,x);g.bottom=Math.max(g.bottom,y);g.indices.push(offset);
  }
  const descriptors=[],reassembled=Buffer.alloc(raw.length);await mkdir(path.join(dir,`assets/parts/${key}`),{recursive:true});
  for(const [name,g]of groups){
    const w=g.right-g.left+1,h=g.bottom-g.top+1,piece=Buffer.alloc(w*h*4);
    for(const i of g.indices){const pixel=i/4,x=pixel%m.width,y=Math.floor(pixel/m.width);raw.copy(piece,((y-g.top)*w+x-g.left)*4,i,i+4);raw.copy(reassembled,i,i,i+4);}
    const output=`assets/parts/${key}/${name}.png`;await sharp(piece,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(dir,output));
    descriptors.push({name,path:output,x:g.left,y:g.top,width:w,height:h,pixels:g.indices.length});
  }
  for(let i=0;i<raw.length;i+=4)if(raw[i+3]&&!raw.subarray(i,i+4).equals(reassembled.subarray(i,i+4)))throw Error(`${key} visible pixel reconstruction failed`);
  variants[key]={source:model.source,sourceSha256:model.sha256,width:m.width,height:m.height,visibleRgbaExact:true,parts:descriptors};
}
await writeFile(path.join(dir,'parts-manifest.json'),JSON.stringify(variants,null,2)+'\n');
// Mechanical atlas separation only; generated actuator art is not repainted.
for(const [name,top,height]of[['upper',0,412],['lower',412,240],['grip',652,372]]){
  const row=await sharp(path.join(dir,'assets/robot-kit.png')).extract({left:0,top,width:1536,height}).png().toBuffer();
  await sharp(row).trim({threshold:8}).png().toFile(path.join(dir,`assets/parts/robot-${name}.png`));
}
const globals={name:'existing-shared-ui-runtime',setup(b){
  b.onResolve({filter:/^(pixi\.js|gsap)$/},args=>({path:args.path,namespace:'shared-ui'}));
  b.onLoad({filter:/.*/,namespace:'shared-ui'},args=>({contents:args.path==='pixi.js'?'export const {Application,Assets,BlurFilter,Container,Graphics,Rectangle,Sprite,Text}=globalThis.CNineUiFxVendor.pixi;':'export const gsap=globalThis.CNineUiFxVendor.gsap;',loader:'js'}));
}};
await build({entryPoints:[path.join(dir,'source/preview.js')],outfile:path.join(dir,'assembly.bundle.js'),bundle:true,minify:true,format:'iife',target:['es2020'],plugins:[globals],legalComments:'none'});
const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const visualAssets=[];
for(const p of ['assets/vehicle-bay.png','assets/suit-bay.png','assets/car-cutout.png','assets/ignis-x-cutout.png','assets/robot-kit.png',...Object.values(variants).flatMap(v=>v.parts.map(p=>p.path)),...names.map(n=>`assets/parts/${n}.png`),...['upper','lower','grip'].map(n=>`assets/parts/robot-${n}.png`)]){
  const absolute=path.join(dir,p),m=await sharp(absolute).metadata();
  visualAssets.push({path:p,sha256:await hash(absolute),width:m.width,height:m.height,channels:m.channels});
}
await writeFile(path.join(dir,'asset-manifest.json'),JSON.stringify({previewOnly:true,runtimeConnected:false,generatedImageTool:'built-in ImageGen',sourceArtPreserved:true,visualAssets},null,2)+'\n');
await writeFile(path.join(dir,'build-report.json'),JSON.stringify({previewOnly:true,runtimeConnected:false,renderer:'PixiJS',timeline:'GSAP',sharedVendor:'/js/ui-fx-vendor-v2045.bundle.js',versions:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version},hBodySource:'/assets/items/h-body-v2066.png',hBodySha256:await hash(source),hBodyPartitionPixelExact:exact,parts:names,additionalModels:['e','f','g','ignis'],suitSources:Object.entries(variants).map(([key,v])=>({key,source:v.source,sha256:v.sourceSha256,visibleRgbaExact:v.visibleRgbaExact,parts:v.parts.length})),bundleSha256:await hash(path.join(dir,'assembly.bundle.js'))},null,2)+'\n');
console.log('Workshop assembly preview built; approved source pixels preserved; live crafting untouched.');
