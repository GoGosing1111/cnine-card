// Register existing pixels only; never repaint, rescale, or repack the approved FX.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let sharp;try{sharp=require('sharp');}catch{sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');}
const read=async name=>JSON.parse(await fs.readFile(new URL(name,import.meta.url),'utf8'));
const write=async(name,value)=>fs.writeFile(new URL(name,import.meta.url),JSON.stringify(value,null,2)+'\n');
const cfg=await read('asset-registration.json'),manifest=await read('manifest.json'),report={method:'DENSE_BASELINE_PER_FRAME',alphaThreshold:96,minRowCoverage:.1,minConsecutiveRows:3,layers:{}};
for(const key of ['aura','pressure']){
 const spec=manifest.effects[key],bytes=await fs.readFile(new URL(spec.url,import.meta.url));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==spec.sha256||spec.url!==cfg.effects[key].source)throw Error(key+': source registration mismatch');
 const anchors=[],measurements=[];
 for(const frame of spec.frames){
  const r=frame.rect,{data,info}=await sharp(bytes).extract({left:r.x,top:r.y,width:r.width,height:r.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const minPixels=Math.ceil(info.width*report.minRowCoverage),rows=[];let run=0,lastDense=-1;
  // The lower solid base excludes isolated particles and faint neighboring-cell bleed.
  for(let y=Math.floor(info.height*.5);y<info.height;y++){
   let count=0;for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=report.alphaThreshold)count++;
   run=count>=minPixels?run+1:0;
   if(run>=report.minConsecutiveRows)lastDense=y;
   rows.push({y,count});
  }
  if(lastDense<0)throw Error(key+' frame '+frame.index+': no stable base');
  const groundAnchor={x:spec.contentBounds.left+spec.contentBounds.width*.5,y:lastDense+.5};
  frame.groundAnchor=groundAnchor;anchors.push(groundAnchor);
  measurements.push({index:frame.index,groundAnchor,previousAnchorY:spec.contentBounds.top+spec.contentBounds.height*.98,baselineRows:rows.filter(row=>Math.abs(row.y-lastDense)<=3)});
 }
 const registration={sourceSha256:sha256,method:report.method,alphaThreshold:report.alphaThreshold,minRowCoverage:report.minRowCoverage,minConsecutiveRows:report.minConsecutiveRows,horizontalOrigin:'COMMON_CONTENT_CENTER',frames:anchors};
 cfg.effects[key].groundRegistration=registration;
 const {frames,...metadata}=registration;spec.groundRegistration=metadata;
 report.layers[key]={source:spec.url,sourceSha256:sha256,measurements};
}
await write('asset-registration.json',cfg);await write('manifest.json',manifest);await write('qa/ambient-ground-registration.json',report);
console.log('Registered 24 authored FX baselines. Existing image bytes and common scale are unchanged.');
