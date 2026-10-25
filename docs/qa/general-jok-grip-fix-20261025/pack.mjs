import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const evidence='C:/Users/User/.codex/visualizations/2026/10/25/01a170fb-166f-7250-a2e6-d351c185e8ee/general-jok-grip-fix-20261025';
const preview='preview/mercenary-general-jok-battle-20261022-v1';
const art='assets/ui/project-v/mercenaries/general-jok-grip-20261025';
const generated='C:/Users/User/.codex/generated_images/01a170fb-166f-7250-a2e6-d351c185e8ee';
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const poses={
 ready:{source:`${preview}/assets/frames/ready-v6.png`,hash:'0fa82890ac46d11459d72f80f8dff256c6e5b8d6fcf8efc1bc362b0f2dbf7609',generated:'exec-52e25bf1-0691-4ec3-8f93-ecdcf29c702d.png',crop:{left:520,top:145,width:240,height:155},old:'398,278 471,219 499,200 552,194 600,198 673,214 715,246 716,268 698,280 636,250 620,250 653,295 646,327 632,337 620,366 604,371 597,391 580,405 563,394 489,392 452,376 420,347 398,306',area:'397,277 442,235 494,197 547,189 615,192 674,211 710,223 725,246 724,276 707,296 693,308 687,331 676,349 672,375 658,395 640,422 615,426 585,402 528,403 493,392 449,376 420,348 397,307'},
 fire:{source:`${preview}/assets/frames/fire-v7.png`,hash:'3e19c306e018084a3dc67a73fd07e8128513c6249d92d81dc49b4f540fb450c9',generated:'exec-6fcf2776-2531-468a-af98-ca601e2a467a.png',crop:{left:405,top:315,width:210,height:145},old:'305,359 344,302 379,251 423,222 489,207 543,199 577,207 607,221 615,239 602,249 568,241 541,235 535,249 559,273 576,298 578,320 568,341 572,361 565,382 545,398 514,414 480,418 445,414 406,405 370,388 336,374',area:'307,355 342,301 379,249 425,217 493,198 540,196 579,209 605,223 623,245 619,273 600,290 596,327 592,351 586,377 571,402 544,417 505,420 460,418 411,409 370,390 336,377'}
};
const polygon=p=>p.split(' ').map(pair=>pair.split(',').map(Number));
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;}return yes;};
await fs.mkdir(`${art}/sources`,{recursive:true});
const records={};
for(const [name,p] of Object.entries(poses)){
 const input=await fs.readFile(p.source);assert.equal(sha(input),p.hash);
 const source=path.join(art,'sources',`${name}-grip-edit.png`);
 try{await fs.access(source);}catch{await fs.copyFile(path.join(generated,p.generated),source);}
 const {data:old,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const patch=await sharp(source).resize(p.crop.width,p.crop.height).ensureAlpha().raw().toBuffer();
 const result=Buffer.from(old),op=polygon(p.old),np=polygon(p.area);
 let changed=0,alphaChanged=0;const bounds={left:info.width,top:info.height,right:0,bottom:0};
 for(let y=0;y<p.crop.height;y++)for(let x=0;x<p.crop.width;x++){
  const ix=(y*p.crop.width+x)*4,xx=x*4+2,yy=y*4+2;
  const inOld=inside(xx,yy,op),inArea=inside(xx,yy,np);
  const rgb=[patch[ix],patch[ix+1],patch[ix+2]],white=Math.min(...rgb)>98&&Math.max(...rgb)-Math.min(...rgb)<65;
  if(!inOld&&!(inArea&&white))continue;
  const px=x+p.crop.left,py=y+p.crop.top,i=(py*info.width+px)*4;
  const cuff=name==='ready'?{left:609,right:638,top:211,bottom:243}:{left:476,right:511,top:396,bottom:420};
  let preserveCuff=false;
  if(px>=cuff.left&&px<=cuff.right&&py>=cuff.top&&py<=cuff.bottom)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const q=((py+dy)*info.width+px+dx)*4;
   if(old[q]>120&&old[q]-old[q+2]>45&&old[q+1]-old[q+2]>20)preserveCuff=true;
  }
  if(preserveCuff)continue;
  // Existing original metal outside the glove is never replaced by generated metal.
  for(let c=0;c<4;c++)result[i+c]=patch[ix+c];
  if(!result.subarray(i,i+4).equals(old.subarray(i,i+4))){changed++;alphaChanged+=Number(result[i+3]!==old[i+3]);bounds.left=Math.min(bounds.left,px);bounds.right=Math.max(bounds.right,px);bounds.top=Math.min(bounds.top,py);bounds.bottom=Math.max(bounds.bottom,py);}
 }
 assert(changed>1000&&changed<6000);
 // Verify exact original RGBA outside the registered hand crop independently.
 let outsideChanges=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(x<p.crop.left||x>=p.crop.left+p.crop.width||y<p.crop.top||y>=p.crop.top+p.crop.height){const i=(y*info.width+x)*4;if(!result.subarray(i,i+4).equals(old.subarray(i,i+4)))outsideChanges++;}
 assert.equal(outsideChanges,0);
 const target=`${preview}/assets/frames/${name}-grip-v16.png`;
 await sharp(result,{raw:info}).png().toFile(target);
 const final=await fs.readFile(target);
 await sharp(final).extract(p.crop).resize(p.crop.width*6,p.crop.height*6).png().toFile(`${evidence}/${name}-final-detail.png`);
 records[name]={source:p.source,sourceSha256:p.hash,generationSource:source,generationSha256:sha(await fs.readFile(source)),file:target,sha256:sha(final),width:info.width,height:info.height,crop:p.crop,oldSelection:p.old,newSelection:p.area,changedPixels:changed,changedBounds:bounds,alphaChangedPixels:alphaChanged,outsideCropChangedPixels:outsideChanges};
}
await fs.writeFile(`${art}/manifest.json`,JSON.stringify({version:1,dateKST:'2026-10-25',scope:'Only grip anatomy in ready and fire textures; thumb wraps grip; index on trigger; three fingers below.',status:'TECHNICAL_REPAIR_REVIEW',userVisualApproval:false,tool:'built-in image_gen',records},null,2)+'\n');
await fs.writeFile(`${evidence}/pixel-verification-final.json`,JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify(records,null,2));
