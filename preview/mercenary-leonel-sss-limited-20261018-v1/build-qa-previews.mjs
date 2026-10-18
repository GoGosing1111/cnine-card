// Technical review artifacts only: crop, neutral-background composite and labels; no repaint or resize.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(file('manifest.json'),'utf8'));
const proofs=[];
for(const id of ['idle-01','attack-04','skill-02','ultimate-04']){
 const source='assets/frames/'+id+'.png',bytes=await fs.readFile(file(source));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,t=info.height,r=-1,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 const rect={left:Math.max(0,l-24),top:Math.max(0,t-24),width:Math.min(info.width,r+25)-Math.max(0,l-24),height:Math.min(info.height,b+25)-Math.max(0,t-24)};
 const target='qa/'+id+'-native-size.png';
 await sharp(bytes).extract(rect).flatten({background:'#17212b'}).png().toFile(file(target));
 proofs.push({id,source,sourceSha256:hash(bytes),target,rect,operation:'CROP_AND_QA_BACKGROUND_ONLY_NO_RESIZE',bodyReferenceHeight:manifest.motion[id.split('-')[0]].referenceHeight});
}
await fs.writeFile(file('qa/native-size-proof.json'),JSON.stringify(proofs,null,2)+'\n');
for(const [key,spec]of Object.entries(manifest.effects)){
 const bytes=await fs.readFile(file(spec.url)),w=spec.frameWidth,h=spec.frameHeight,images=[];
 for(let n=0;n<6;n++){
  const r=spec.frames[n+2].rect;
  images.push({input:await sharp(bytes).extract({left:r.x,top:r.y,width:r.width,height:r.height}).png().toBuffer(),left:n%2*w,top:Math.floor(n/2)*h});
 }
 const sheet=await sharp({create:{width:w*2,height:h*3,channels:4,background:'#17212b'}}).composite(images).png().toBuffer();
 const labels=Array.from({length:6},(_,n)=>`<text x="${n%2*w+10}" y="${Math.floor(n/2)*h+25}" fill="white" font-size="16">${key} frame ${n+3}</text>`).join('');
 await sharp(sheet).composite([{input:Buffer.from(`<svg width="${w*2}" height="${h*3}">${labels}</svg>`)}]).png().toFile(file('qa/fx-'+key+'-selected-stages3-8.png'));
}
console.log(JSON.stringify({nativeSizeProofs:proofs.length,selectedEffects:Object.keys(manifest.effects).length,resizedPixels:0}));
