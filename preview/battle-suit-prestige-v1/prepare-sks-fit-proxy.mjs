import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const source=path.join(here,'assets/sprites/helios-sks-exact-full-v5.png');
const weapon=await sharp(path.join(root,'assets/ui/project-v/account-battle-suits/weapons/sovereign-sks-v1.png'))
  .flop().resize({width:666}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for(let o=0;o<weapon.data.length;o+=4)if(weapon.data[o+3]>0){weapon.data[o]=0;weapon.data[o+1]=255;weapon.data[o+2]=0;}
const matte=await sharp(weapon.data,{raw:weapon.info}).png().toBuffer();
await sharp(source).composite([{input:matte,left:293,top:250}]).flatten({background:'#ff00ff'})
  .png().toFile(path.join(here,'assets/prepared/sks-fixed-outline-body-repair.png'));
