import sharp from 'sharp';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const prompts=JSON.parse(await readFile(path.join(here,'prompts.json')));
const hash=data=>createHash('sha256').update(data).digest('hex');
await mkdir(path.join(here,'assets'),{recursive:true});
const manifest={version:'Z_THUNDER_V3_20260926',status:'USER_APPROVED_PREVIEW',liveEnabled:false,
  generation:'built-in image_gen',packaging:'Sharp '+sharp.versions.sharp+'; authored cell extraction, uniform resizing, transparent padding. Original RGBA unchanged.',atlases:{}};
for(const key of ['blade','ground']){
  const master=path.join(here,'assets',key+'-source.png');
  try{await readFile(master);}catch{await copyFile(prompts.assets[key].source,master);}
  const source=await readFile(master),meta=await sharp(source).metadata();
  if(!meta.hasAlpha)throw Error('Generated source has no alpha');
  const width=key==='blade'?384:512,height=key==='blade'?640:384;
  const anchor={x:width/2,y:key==='blade'?550:270},layers=[],frames=[];
  // Fixed source-space floor, measured from the contact row. Anticipation
  // keeps the same registration; no per-frame bounding-box normalization.
  const floor=key==='blade'?.86:.73;
  const scale=Math.min((width-40)/(meta.width/4),(height-40)/(meta.height/3));
  for(let i=0;i<12;i++){
    const x0=Math.round(i%4*meta.width/4),x1=Math.round((i%4+1)*meta.width/4);
    const y0=Math.round(Math.floor(i/4)*meta.height/3),y1=Math.round((Math.floor(i/4)+1)*meta.height/3);
    const w=x1-x0,h=y1-y0,sw=Math.round(w*scale),sh=Math.round(h*scale);
    const cell=await sharp(source).extract({left:x0,top:y0,width:w,height:h}).resize(sw,sh).png().toBuffer();
    const left=Math.round(anchor.x-sw/2),top=Math.round(anchor.y-h*floor*scale);
    if(left<0||top<0||left+sw>width||top+sh>height)throw Error('Clipped packed frame '+key+' '+i);
    layers.push({input:cell,left:i%4*width+left,top:Math.floor(i/4)*height+top});
    frames.push({index:i,sourceRect:{x:x0,y:y0,width:w,height:h},placement:{left,top},uniformScale:scale,sha256:hash(cell)});
  }
  const data=await sharp({create:{width:width*4,height:height*3,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  await writeFile(path.join(here,'assets',key+'-atlas.png'),data);
  manifest.atlases[key]={url:'/preview/z-body-thunder-v3/assets/'+key+'-atlas.png',columns:4,rows:3,frameWidth:width,frameHeight:height,pivot:anchor,frames,
    sha256:hash(data),source:{file:'assets/'+key+'-source.png',sha256:hash(source),width:meta.width,height:meta.height}};
}
await writeFile(path.join(here,'assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Packed 24 individually authored RGBA frames.');
