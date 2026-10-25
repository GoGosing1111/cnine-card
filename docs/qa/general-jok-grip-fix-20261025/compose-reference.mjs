import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root='C:/Users/User/.codex/visualizations/2026/10/25/01a170fb-166f-7250-a2e6-d351c185e8ee/general-jok-grip-fix-20261025';
const generated='C:/Users/User/.codex/generated_images/01a170fb-166f-7250-a2e6-d351c185e8ee/exec-63d52080-e37f-48a6-8736-393d20f5d7cd.png';
const {data:gen,info:gi}=await sharp(generated).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const poses={
 ready:{file:'ready-v6.png',wrist:{x:620,y:222},angle:14,crop:{left:595,top:180,width:125,height:100},polygon:[[619.5,214.5],[637.75,199.75],[644.75,195],[658,193.5],[670,194.5],[688.25,198.5],[698.75,206.5],[699,212],[694.5,215],[679,207.5],[675,207.5],[683.25,218.75],[681.5,226.75],[678,229.25],[675,236.5],[671,237.75],[669.25,242.75],[665,246.25],[660.75,243.5],[642.25,243],[633,239],[625,231.75],[619.5,221.5]]},
 fire:{file:'fire-v7.png',wrist:{x:497,y:411},angle:-3,crop:{left:465,top:350,width:125,height:100},polygon:[[481.25,404.75],[491,390.5],[499.75,377.75],[510.75,370.5],[527.25,366.75],[540.75,364.75],[549.25,366.75],[556.75,370.25],[558.75,374.75],[555.5,377.25],[547,375.25],[540.25,373.75],[538.75,377.25],[544.75,383.25],[549,389.5],[549.5,395],[547,400.25],[548,405.25],[546.25,410.5],[541.25,414.5],[533.5,418.5],[525,419.5],[516.25,418.5],[506.5,416.25],[497.5,412],[489,408.5]]}
};
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;}return yes;};
const sample=(x,y)=>{const x0=Math.floor(x),y0=Math.floor(y),dx=x-x0,dy=y-y0;const result=[0,0,0,0];for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const sx=x0+xx,sy=y0+yy;if(sx<0||sx>=gi.width||sy<0||sy>=gi.height)continue;const w=(xx?dx:1-dx)*(yy?dy:1-dy),i=(sy*gi.width+sx)*4;for(let c=0;c<4;c++)result[c]+=gen[i+c]*w;}return result;};
const reports={};
for(const [name,p] of Object.entries(poses)){
 const originalFile=`preview/mercenary-general-jok-battle-20261022-v1/assets/frames/${p.file}`;
 const bytes=await fs.readFile(originalFile),{data:original,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),output=Buffer.from(original);
 const a=17*Math.PI/180;let changed=0;const bounds={left:info.width,top:info.height,right:0,bottom:0};
 // Three-point glove registration: wrist, index fingertip and little fingertip.
 const transform={a:.073739,b:-.023093,c:.0114478,d:.059504};
 const determinant=transform.a*transform.d-transform.b*transform.c;
 for(let y=p.crop.top;y<p.crop.top+p.crop.height;y++)for(let x=p.crop.left;x<p.crop.left+p.crop.width;x++){
  let rx=x,ry=y;
  if(name==='fire'){const dx=x-491,dy=y-407;rx=620+dx*Math.cos(a)-dy*Math.sin(a);ry=222+dx*Math.sin(a)+dy*Math.cos(a);}
  const dx=rx-620,dy=ry-222;
  const sx=177+(transform.d*dx-transform.b*dy)/determinant,sy=606+(-transform.c*dx+transform.a*dy)/determinant;
  const color=sample(sx,sy),i=(y*info.width+x)*4,inOld=inside(x+.5,y+.5,p.polygon);
  const isGlove=color[0]>100&&color[1]>95&&color[2]>95&&Math.max(...color.slice(0,3))-Math.min(...color.slice(0,3))<65;
  // Only the new white glove can extend beyond the old glove selection.
  // The generated handle is retained solely where the old wrong hand hid it.
  if(color[3]<200||(!inOld&&!isGlove)||rx<617+(ry-215)*.55||ry>256)continue;
  // Original foreground sleeve occludes the bottom of the wrist.
  if(ry>236+(rx-630)*.7&&rx<655)continue;
  const alpha=color[3]/255;
  for(let c=0;c<3;c++)output[i+c]=Math.round(color[c]*alpha+original[i+c]*(1-alpha));
  // Opaque hand is composited with source alpha; surrounding transparency stays.
  output[i+3]=Math.round(color[3]+original[i+3]*(1-alpha));
  if(output.subarray(i,i+4).compare(original.subarray(i,i+4))!==0){changed++;bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
 }
 const target=`${root}/${name}-grip-reference-corrected.png`;
 await sharp(output,{raw:info}).png().toFile(target);
 await sharp(target).extract(p.crop).resize(p.crop.width*6,p.crop.height*6).png().toFile(`${root}/${name}-grip-reference-detail.png`);
 reports[name]={source:originalFile,sourceSha256:createHash('sha256').update(bytes).digest('hex'),file:target,sha256:createHash('sha256').update(await fs.readFile(target)).digest('hex'),changedPixels:changed,changedBounds:bounds};
}
await fs.writeFile(`${root}/reference-pixel-verification.json`,JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
