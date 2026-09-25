import sharp from 'sharp';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const prompts=JSON.parse(await readFile(path.join(here,'normal-lightning-prompts.json')));
prompts.assets.surge=JSON.parse(await readFile(path.join(here,'dash-surge-prompt.json'))).asset;
const hash=data=>createHash('sha256').update(data).digest('hex');
const manifest={version:'Z_NORMAL_LIGHTNING_V3_20260926',status:'USER_REVIEW_PENDING',liveEnabled:false,
  generation:'built-in image_gen',packaging:'Sharp '+sharp.versions.sharp+'; cell extraction, uniform resize and transparent padding only. Original alpha preserved.',atlases:{}};
for(const key of ['wake','slash','impact','surge']){
  const sourceFile='assets/normal-lightning-'+key+'-source.png',file=path.join(here,sourceFile);
  try{await readFile(file);}catch{await copyFile(prompts.assets[key].source,file);}
  const source=await readFile(file),meta=await sharp(source).metadata();
  if(!meta.hasAlpha)throw Error('Missing generated alpha');
  const width=512,height=512,scale=464/Math.max(meta.width/4,meta.height/3),layers=[],frames=[];
  for(let i=0;i<12;i++){
    const x0=Math.round(i%4*meta.width/4),x1=Math.round((i%4+1)*meta.width/4);
    const y0=Math.round(Math.floor(i/4)*meta.height/3),y1=Math.round((Math.floor(i/4)+1)*meta.height/3);
    const w=x1-x0,h=y1-y0,sw=Math.round(w*scale),sh=Math.round(h*scale);
    const cell=await sharp(source).extract({left:x0,top:y0,width:w,height:h}).resize(sw,sh).png().toBuffer();
    const left=Math.round((width-sw)/2),top=Math.round((height-sh)/2);
    layers.push({input:cell,left:i%4*width+left,top:Math.floor(i/4)*height+top});
    frames.push({index:i,sourceRect:{x:x0,y:y0,width:w,height:h},placement:{left,top},uniformScale:scale,sha256:hash(cell)});
  }
  const data=await sharp({create:{width:2048,height:1536,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  await writeFile(path.join(here,'assets','normal-lightning-'+key+'-atlas.png'),data);
  // Fixed registration for the leading edge of the dash and the middle of each strike.
  const pivot=key==='wake'||key==='surge'?{x:435,y:270}:{x:256,y:256};
  manifest.atlases[key]={url:'/preview/z-body-thunder-v3/assets/normal-lightning-'+key+'-atlas.png',columns:4,rows:3,frameWidth:512,frameHeight:512,pivot,frames,
    sha256:hash(data),source:{file:sourceFile,sha256:hash(source),width:meta.width,height:meta.height}};
}
await writeFile(path.join(here,'normal-assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Packed 48 independent ordinary-attack RGBA frames.');
