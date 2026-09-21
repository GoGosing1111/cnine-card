import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve('assets/ui/project-v/fx/weekly-raid-v1');
const ids=['nagato','obito','yoriichi','gilgamesh','ichigo'];
const manifest={format:'PROJECT_V_WEEKLY_RAID_ULTIMATE_FX_V1',renderer:'PixiJS 8.20.0 Sprite texture sequence',timeline:'GSAP 3.13.0',framesPerSkill:12,layout:{columns:4,rows:3},collisionFrame:7,skills:[]};

for(const id of ids){
  const sourceImage=`${id}-impact-sheet-v1.png`,image=`${id}-impact-sheet-v1.webp`,full=path.join(root,sourceImage),meta=await sharp(full).metadata();
  if(meta.width!==1448||meta.height!==1086||meta.hasAlpha!==true)throw new Error(`${id}: expected 1448x1086 RGBA sheet`);
  await sharp(full).webp({quality:88,alphaQuality:100,effort:3}).toFile(path.join(root,image));
  const frames={};
  for(let index=0;index<12;index++){
    const x=(index%4)*362,y=Math.floor(index/4)*362,key=`${id}_${String(index).padStart(2,'0')}.png`;
    frames[key]={frame:{x,y,w:362,h:362},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:362,h:362},sourceSize:{w:362,h:362},duration:index===7?92:58};
  }
  const atlas={frames,animations:{[id]:Object.keys(frames)},meta:{app:'cnine-card weekly raid v1',version:'1.0',image,format:'RGBA8888',size:{w:1448,h:1086},scale:'1'}};
  await fs.writeFile(path.join(root,`${id}-impact-atlas-v1.json`),JSON.stringify(atlas,null,2)+'\n');
  manifest.skills.push({id,image,atlas:`${id}-impact-atlas-v1.json`,framePrefix:`${id}_`,frameCount:12,collisionFrame:7});
}
const monsterRoot=path.resolve('assets/ui/project-v/monsters/weekly-raid-v1');
for(const [input,output] of [['nagato-sd-v2.png','nagato-sd-v2-768.webp'],['yoriichi-sd-v1.png','yoriichi-sd-v1-768.webp'],['ichigo-sd-v1.png','ichigo-sd-v1-768.webp']])await sharp(path.join(monsterRoot,input)).resize({width:768,withoutEnlargement:true}).webp({quality:88,alphaQuality:100,effort:3}).toFile(path.join(monsterRoot,output));
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`built ${ids.length} weekly raid ultimate atlases`);
