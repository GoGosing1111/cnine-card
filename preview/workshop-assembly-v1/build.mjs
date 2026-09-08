import {build} from 'esbuild';
import sharp from 'sharp';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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
for(const p of ['assets/vehicle-bay.png','assets/suit-bay.png','assets/car-cutout.png','assets/robot-kit.png',...names.map(n=>`assets/parts/${n}.png`),...['upper','lower','grip'].map(n=>`assets/parts/robot-${n}.png`)]){
  const absolute=path.join(dir,p),m=await sharp(absolute).metadata();
  visualAssets.push({path:p,sha256:await hash(absolute),width:m.width,height:m.height,channels:m.channels});
}
await writeFile(path.join(dir,'asset-manifest.json'),JSON.stringify({previewOnly:true,runtimeConnected:false,generatedImageTool:'built-in ImageGen',sourceArtPreserved:true,visualAssets},null,2)+'\n');
await writeFile(path.join(dir,'build-report.json'),JSON.stringify({previewOnly:true,runtimeConnected:false,renderer:'PixiJS',timeline:'GSAP',sharedVendor:'/js/ui-fx-vendor-v2045.bundle.js',versions:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version},hBodySource:'/assets/items/h-body-v2066.png',hBodySha256:await hash(source),hBodyPartitionPixelExact:exact,parts:names,bundleSha256:await hash(path.join(dir,'assembly.bundle.js'))},null,2)+'\n');
console.log('Workshop assembly preview built; approved source pixels preserved; live crafting untouched.');
