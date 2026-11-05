import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';

const dir=fileURLToPath(new URL('.',import.meta.url));
const packer=fileURLToPath(new URL('../../skills-v4/effects/pack.mjs',import.meta.url));
const result=spawnSync(process.execPath,[packer,dir],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status || 1);
const file=path.join(dir,'runtime/fx-manifest.json'), manifest=JSON.parse(await fs.readFile(file));
manifest.sourceDate='2026-11-05';
for(const [id,spec] of Object.entries(manifest.effects)) {
  if(spec.blend!=='normal')continue;
  // Derive a visible blade footprint once, excluding subpixel glimmer.
  // The runtime sizes the full sequence consistently against this extent.
  let left=512,top=512,right=0,bottom=0;
  for(const i of spec.frames.keys()) {
    const src=path.join(dir,'frames',id,'frame-'+String(spec.sourceStartFrame+i).padStart(4,'0')+'.png');
    const {data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let l=512,t=512,r=0,b=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      if(data[(y*info.width+x)*4+3]<125)continue;
      l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
    }
    left=Math.min(left,l);top=Math.min(top,t);right=Math.max(right,r);bottom=Math.max(bottom,b);
    if(id==='v5-rain' && i===0)spec.fallingBlade={x:(l+r)/2,y:b,height:b-t+1,width:r-l+1};
  }
  spec.inkBounds={left,top,right,bottom,width:right-left+1,height:bottom-top+1};
}
await fs.writeFile(file,JSON.stringify(manifest,null,2));
