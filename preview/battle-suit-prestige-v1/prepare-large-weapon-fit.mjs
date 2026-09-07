import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fits,transformExactWeapon} from './exact-weapon-fit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const {data,info}=await sharp(path.join(here,'assets/sources/helios-sks-body-proxy-v5.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for(let o=0;o<data.length;o+=4){const [r,g,b]=data.subarray(o,o+3);if(g>80&&g>r*1.3&&g>b*1.3)data.fill(0,o,o+4);}
const body=await sharp(data,{raw:info}).png().toBuffer();
for(const spec of Object.values(fits).filter(spec=>!process.argv[2]||spec.id===process.argv[2])){
  const exact=await transformExactWeapon(spec),green=await sharp(exact.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let o=0;o<green.data.length;o+=4)if(green.data[o+3]>0){green.data[o]=0;green.data[o+1]=255;green.data[o+2]=0;}
  const proxy=await sharp(green.data,{raw:green.info}).png().toBuffer();
  await sharp({create:{width:1280,height:1536,channels:4,background:'#ff00ff'}})
    .composite([{input:body,left:0,top:0},{input:proxy,left:exact.placement.left,top:exact.placement.top}])
    .png().toFile(path.join(here,'assets/prepared',`${spec.id}-large-fit-input-v6.png`));
  console.log(JSON.stringify({id:spec.id,placement:exact.placement,grip:exact.point(spec.grip),support:exact.point(spec.support),muzzle:exact.point(spec.muzzle)}));
}
