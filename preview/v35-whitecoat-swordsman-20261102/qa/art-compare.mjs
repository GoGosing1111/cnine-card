import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../',import.meta.url)),receipt=JSON.parse(await fs.readFile(dir+'qa/native.json','utf8')),input=JSON.parse(await fs.readFile(dir+'whitecoat.input.json','utf8')),out=JSON.parse(await fs.readFile(dir+receipt.runtimeDir+'/whitecoat.json','utf8'));
const atlas=await fs.readFile(dir+receipt.runtimeDir+'/'+receipt.atlas,'utf8'),lines=atlas.trim().split(/\r?\n/),regions={};let current;
for(const line of lines){if(!line.includes(':')&&!line.endsWith('.png')){current=line;regions[current]={};}else if(current&&line.includes(':')){const [k,v]=line.split(':');regions[current][k]=v.split(',').map(Number);}}
const reports=[];
for(const [id,a] of Object.entries(input.skins[0].attachments.body)){
 const b=out.skins[0].attachments.body[id],r=regions[id],w=r.bounds[2],h=r.bounds[3],offset=r.offsets||[0,0,a.width,a.height],crop={left:offset[0],top:a.height-offset[1]-h,width:w,height:h};
 const renderedMeta=await sharp(dir+'qa/native-'+id+'.png').metadata();if(Math.abs(w-renderedMeta.width)>1||Math.abs(h-renderedMeta.height)>1)throw Error(id+' unexpected native raster bounds');crop.width=renderedMeta.width;crop.height=renderedMeta.height;
 const [src,render]=await Promise.all([sharp(dir+'images/'+id+'.png').extract(crop).ensureAlpha().raw().toBuffer(),sharp(dir+'qa/native-'+id+'.png').ensureAlpha().raw().toBuffer()]);
 if(src.length!==render.length)throw Error(id+' native bounds mismatch');let rgb=0,alpha=0,max=0;for(let n=0;n<src.length;n+=4){alpha+=Math.abs(src[n+3]-render[n+3]);for(let c=0;c<3;c++){const d=Math.abs(src[n+c]*src[n+3]/255-render[n+c]*render[n+3]/255);rgb+=d;max=Math.max(max,d);}}
 const count=src.length/4,mean=rgb/count/3,meanAlpha=alpha/count,geometryMatch=['x','y','width','height'].every(k=>Math.abs((a[k]||0)-(b[k]||0))<.001)&&(!b.scaleX||b.scaleX===1)&&(!b.scaleY||b.scaleY===1);
 reports.push({id,crop,geometryMatch,meanPremultipliedChannelDifference:mean,meanAlphaDifference:meanAlpha,maxChannelDifference:max,passed:geometryMatch&&mean<2&&meanAlpha<2});
}
await fs.writeFile(dir+'qa/art-compare.json',JSON.stringify({method:'Native 4.3 export → official runtime render at 1x vs input PNG, aligned by actual atlas trimming. Premultiplied colour difference handles transparent pixels.',poses:reports,passed:reports.every(r=>r.passed)},null,2));console.log(reports.map(r=>({id:r.id,mean:r.meanPremultipliedChannelDifference,alpha:r.meanAlphaDifference,passed:r.passed})));if(reports.some(r=>!r.passed))process.exitCode=1;
