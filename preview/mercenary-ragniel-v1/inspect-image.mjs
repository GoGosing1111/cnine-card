import fs from 'node:fs/promises';
import sharp from 'sharp';
export async function inspect(file){
 const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let clear=0,solid=0,border=0,x0=info.width,y0=info.height,x1=-1,y1=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a<8)clear++;if(a>=240)solid++;
  if(a>=24){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);if(x<4||y<4||x>=info.width-4||y>=info.height-4)border++;}
 }
 return {width:meta.width,height:meta.height,hasAlpha:!!meta.hasAlpha,clear:clear/(info.width*info.height),solid:solid/(info.width*info.height),border,bounds:[x0,y0,x1,y1]};
}
if(process.argv[2])console.log(JSON.stringify(await inspect(process.argv[2])));
