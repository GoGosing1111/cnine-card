import {build} from 'esbuild';
import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(dir,'assets/textures');await mkdir(out,{recursive:true});
const origins={},assets=[];
for(const key of ['flight','impact']){
  const input=path.join(dir,`assets/generated/${key}-atlas.png`),bytes=await readFile(input);
  const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  if(info.channels!==4||info.width!==1536||info.height!==1024)throw new Error(`${key}: expected 1536×1024 RGBA`);
  origins[key]=[];
  for(let i=0;i<24;i++){
    let edge=0,bottom=0,right=0,tipRows=[];
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const alpha=data[((Math.floor(i/6)*256+y)*info.width+i%6*256+x)*4+3];
      if(x<2||y<2||x>=254||y>=254)edge=Math.max(edge,alpha);
      if(alpha>32)bottom=Math.max(bottom,y);
      if(x>128&&alpha>180&&x>=right){if(x>right)tipRows=[];right=x;tipRows.push(y);}
    }
    if(edge>4)throw new Error(`${key} frame ${i} touches cell edge (alpha ${edge})`);
    origins[key].push({x:key==='flight'?(right+.5)/256:.5,
      y:key==='flight'?(tipRows.reduce((a,b)=>a+b,0)/tipRows.length+.5)/256:(bottom+1)/256,edgeAlphaMax:edge});
  }
  await sharp(bytes).webp({lossless:true,effort:6}).toFile(path.join(out,key+'-atlas.webp'));
  assets.push({path:`assets/generated/${key}-atlas.png`,sha256:createHash('sha256').update(bytes).digest('hex'),grid:[6,4],frames:24,
    runtime:`assets/textures/${key}-atlas.webp`,runtimeSha256:createHash('sha256').update(await readFile(path.join(out,key+'-atlas.webp'))).digest('hex')});
}
await writeFile(path.join(out,'frame-origins.json'),JSON.stringify(origins,null,2)+'\n');
const icon=await readFile(path.join(dir,'assets/generated/chip-source.png'));
await sharp(icon).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toFile(path.join(out,'chip.png'));
await sharp(icon).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toFile(path.join(out,'chip.webp'));
assets.push({path:'assets/generated/chip-source.png',sha256:createHash('sha256').update(icon).digest('hex'),runtime:'assets/textures/chip.webp'});
const result=await build({entryPoints:[path.join(dir,'source/lab.src.js')],bundle:true,minify:true,format:'iife',
  outfile:path.join(dir,'lab.bundle.js'),legalComments:'eof',metafile:true});
const bundlePath=path.join(dir,'lab.bundle.js');
const bundle=(await readFile(bundlePath,'utf8')).replace(/[ \t]+$/gm,'');await writeFile(bundlePath,bundle);
const inputs=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/'));
await writeFile(path.join(dir,'build-report.json'),JSON.stringify({engineSource:'preview/project-v-v3/source/project-v-pixi-battle.src.js',
  pixi:'8.20.0',gsap:'3.13.0',pixiCopies:inputs.filter(p=>p.endsWith('/pixi.js/lib/index.mjs')).length,
  inputs:inputs.filter(p=>!p.includes('node_modules')),assets,outputBytes:Buffer.byteLength(bundle)},null,2)+'\n');
console.log('8-way homing preview built. Live catalog, balance, bundle and APIs unchanged.');
