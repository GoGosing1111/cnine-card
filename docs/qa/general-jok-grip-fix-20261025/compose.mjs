import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const root='C:/Users/User/.codex/visualizations/2026/10/25/01a170fb-166f-7250-a2e6-d351c185e8ee/general-jok-grip-fix-20261025';
const generated='C:/Users/User/.codex/generated_images/01a170fb-166f-7250-a2e6-d351c185e8ee/exec-5b168a7e-d9a1-41aa-a052-cfce9e144b61.png';
const originals='preview/mercenary-general-jok-battle-20261022-v1/assets/frames';
const configs={
 ready:{file:'ready-v6.png',crop:{left:520,top:145,width:240,height:155},points:'398,278 471,219 499,200 552,194 600,198 673,214 715,246 716,268 698,280 636,250 620,250 653,295 646,327 632,337 620,366 604,371 597,391 580,405 563,394 489,392 452,376 420,347 398,306'},
 fire:{file:'fire-v7.png',crop:{left:405,top:315,width:210,height:145},points:'305,359 344,302 379,251 423,222 489,207 543,199 577,207 607,221 615,239 602,249 568,241 541,235 535,249 559,273 576,298 578,320 568,341 572,361 565,382 545,398 514,414 480,418 445,414 406,405 370,388 336,374'}
};
const generatedCrop=await sharp(generated).extract({left:627,top:325,width:603,height:353}).resize(318,210).png().toBuffer();
// Reuse the corrected glove for both existing poses. The original weapon and
// every pixel outside the old white glove selection remain byte-identical RGBA.
const readyCanvas=await sharp({create:{width:960,height:620,channels:4,background:'#00000000'}}).composite([{input:generatedCrop,left:398,top:194}]).png().toBuffer();
const readyRaw=await sharp(readyCanvas).ensureAlpha().raw().toBuffer();
const reports={};
for(const [name,c] of Object.entries(configs)){
 const bytes=await fs.readFile(`${originals}/${c.file}`),{data:original,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const output=Buffer.from(original),cw=c.crop.width*4,ch=c.crop.height*4;
 const mask=await sharp(Buffer.from(`<svg width="${cw}" height="${ch}"><polygon points="${c.points}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
 const high=Buffer.alloc(cw*ch*4);
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
  let rx=x,ry=y;
  if(name==='fire'){
   // Glove registration is independent of bore angle: match wrist + fingertip.
   const angle=17*Math.PI/180,dx=x-370,dy=y-383;
   rx=432+dx*Math.cos(angle)-dy*Math.sin(angle);
   ry=330+dx*Math.sin(angle)+dy*Math.cos(angle);
  }
  const sx=Math.round(rx),sy=Math.round(ry),i=(y*cw+x)*4;
  if(sx>=0&&sx<960&&sy>=0&&sy<620)for(let k=0;k<4;k++)high[i+k]=readyRaw[(sy*960+sx)*4+k];
  high[i+3]=Math.round(high[i+3]*mask[i+3]/255);
 }
 const patch=await sharp(high,{raw:{width:cw,height:ch,channels:4}}).resize(c.crop.width,c.crop.height).raw().toBuffer();
 let changed=0;const changedBounds={left:info.width,top:info.height,right:0,bottom:0};
 for(let y=0;y<c.crop.height;y++)for(let x=0;x<c.crop.width;x++){
  const pi=(y*c.crop.width+x)*4,px=x+c.crop.left,py=y+c.crop.top,oi=(py*info.width+px)*4;
  // Preserve the original gold cuff. The polygon excludes the rigid weapon;
  // original interior finger lines must be replaced with the corrected anatomy.
  if((original[oi]-original[oi+2]>55&&original[oi+1]-original[oi+2]>35)||original[oi+3]<250)continue;
  const a=patch[pi+3]/255;
  if(a<.4)continue;
  for(let k=0;k<3;k++)output[oi+k]=Math.round(original[oi+k]*(1-a)+patch[pi+k]*a);
  if(output[oi]!==original[oi]||output[oi+1]!==original[oi+1]||output[oi+2]!==original[oi+2]){
   changed++;changedBounds.left=Math.min(changedBounds.left,px);changedBounds.right=Math.max(changedBounds.right,px);changedBounds.top=Math.min(changedBounds.top,py);changedBounds.bottom=Math.max(changedBounds.bottom,py);
  }
 }
 const target=`${root}/${name}-grip-corrected.png`;
 await sharp(output,{raw:info}).png().toFile(target);
 await sharp(target).extract(c.crop).resize(cw,ch).png().toFile(`${root}/${name}-after-detail.png`);
 reports[name]={source:`${originals}/${c.file}`,sourceSha256:createHash('sha256').update(bytes).digest('hex'),file:target,sha256:createHash('sha256').update(await fs.readFile(target)).digest('hex'),changedPixels:changed,changedBounds,alphaUnchanged:true};
}
await fs.writeFile(`${root}/pixel-verification.json`,JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
