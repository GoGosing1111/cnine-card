import sharp from 'sharp';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {file,root} from './inspect-assets.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const config=JSON.parse(await fs.readFile(file('weapon-lock.json')));
const inside=(x,y,p)=>{let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;};
await fs.mkdir(file('assets/locked'),{recursive:true});
for(const [id,c]of Object.entries(config)){
 const bytes=await fs.readFile(new URL('../../'+c.source,root));if(sha(bytes)!==c.sha256)throw Error(id+': source hash mismatch');
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const height=id==='ayoon'?640:800,width=info.width,out=Buffer.alloc(width*height*4);let copied=0,excludedBackgroundPixels=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(c.polygons.some(p=>inside(x+.5,y+.5,p))){const i=(y*width+x)*4;
  if(id==='heeya'&&data[i+2]>70&&data[i+2]-data[i]>20&&data[i+2]-data[i+1]>12){excludedBackgroundPixels++;continue;}
  data.copy(out,i,i,i+4);copied++;}
 const output=await sharp(out,{raw:{width,height,channels:4}}).png().toBuffer();
 await fs.writeFile(file('assets/locked/'+id+'-weapon.png'),output);
 // Pixel equality is checked independently against the final decoded RGBA.
 const actual=await sharp(output).raw().toBuffer();let mismatched=0;
 for(let i=0;i<actual.length;i+=4)if(actual[i+3]&&(!actual.subarray(i,i+4).equals(data.subarray(i,i+4))))mismatched++;
 if(mismatched)throw Error('WEAPON_PIXEL_CHANGED');
 await fs.writeFile(file('assets/locked/'+id+'-provenance.json'),JSON.stringify({...c,width,height,sha256:sha(output),sourceSha256:sha(bytes),copiedPixels:copied,excludedBackgroundPixels,mismatchedPixels:mismatched,redrawnPixels:0,operation:'ORIGINAL_VISIBLE_PIXEL_SELECTION_ONLY',transformsAllowed:['uniformScale','translation','rotation','mirror']},null,2)+'\n');
 console.log(id,{copied,mismatched});
}
