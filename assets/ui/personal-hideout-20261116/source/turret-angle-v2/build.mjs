import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';

// All poses share the same socket and foot, including the still used by the editor.
const out=new URL('../../',import.meta.url),input=file=>new URL(file,import.meta.url);
const width=352,height=312,seat=[176,162],axis=[176,106];
const clear={create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}};
const heads=await readFile(input('turret-heads.png'));
const inbetweens=await readFile(input('turret-inbetweens.png'));
const base=await sharp(await readFile(input('turret-base.png')))
  .extract({left:86,top:147,width:1360,height:808}).resize(330,169,{fit:'fill'}).png().toBuffer();
const frame=async(image,left,top)=>sharp(clear).composite([{input:image,left,top}]).png().toBuffer();
const names=['base'],layers=[await frame(base,11,137)],muzzles={};
// Sheet-space socket and aperture coordinates were measured on the artist's turntable.
const poses=[
  ['east',[27,125,464,274],[228,382],[463,278]],
  ['northeast',[573,75,396,347],[757,345],[952,122]],
  ['north',[1164,46,249,391],[1286,305],[1285,53]],
  ['southeast',[50,585,419,346],[222,850],[405,847]],
  ['south',[652,557,232,386],[769,821],[769,856]],
  ['west',[1043,637,466,274],[1302,894],[1069,797]],
  ['east-northeast',[75,150,518,319],[305,451],[562,322],inbetweens],
  ['north-northeast',[791,63,312,443],[930,369],[1046,81],inbetweens],
  ['east-southeast',[72,697,504,351],[277,1003],[528,950],inbetweens],
  ['south-southeast',[809,645,281,443],[894,935],[984,989],inbetweens]
];
for(const [name,[x,y,w,h],pivot,muzzle,sheet=heads] of poses){
  const dw=Math.round(w*(sheet===heads ? .64 : .57)),dh=Math.round(h*(sheet===heads ? .55 : .49));
  const sx=dw/w,sy=dh/h;
  const left=Math.round(seat[0]-(pivot[0]-x)*sx),top=Math.round(seat[1]-(pivot[1]-y)*sy);
  const part=await sharp(sheet).extract({left:x,top:y,width:w,height:h}).resize(dw,dh,{fit:'fill'}).png().toBuffer();
  names.push(name);layers.push(await frame(part,left,top));
  muzzles[name]=[Math.round(left+(muzzle[0]-x)*sx),Math.round(top+(muzzle[1]-y)*sy)];
}
const atlasWidth=width*4,atlasHeight=height*Math.ceil(layers.length/4),frames={};
const inputs=layers.map((image,index)=>{
  const x=(index%4)*width,y=Math.floor(index/4)*height;
  frames[names[index]]={frame:{x,y,w:width,h:height},rotated:false,trimmed:false,
    spriteSourceSize:{x:0,y:0,w:width,h:height},sourceSize:{w:width,h:height}};
  return {input:image,left:x,top:y};
});
const atlas='turret-turn-v2.webp';
await writeFile(new URL(atlas,out),await sharp({create:{width:atlasWidth,height:atlasHeight,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite(inputs).webp({quality:94,alphaQuality:100}).toBuffer());
await writeFile(new URL('turret-turn-v2.json',out),JSON.stringify({
  frames,meta:{image:atlas,scale:'1',size:{w:atlasWidth,h:atlasHeight}},aim:{axis,projection:.53,muzzles}
},null,2)+'\n');
const resting=await sharp(layers[names.indexOf('northeast')]).flop().png().toBuffer();
await writeFile(new URL('defense-turret-v2.webp',out),await sharp(layers[0])
  .composite([{input:resting,left:0,top:0}]).webp({quality:94,alphaQuality:100}).toBuffer());
