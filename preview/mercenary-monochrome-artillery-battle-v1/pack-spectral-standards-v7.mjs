import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await fs.readFile(file('manifest.json'),'utf8'));
const source='assets/sources/spectral-standards-v7.png',bytes=await fs.readFile(file(source)),meta=await sharp(bytes).metadata();
const crop=meta.width/2,pad=48,cell=crop+pad*2;
if(crop!==627||meta.height!==meta.width||!meta.hasAlpha)throw Error('Expected transparent 1254px 2x2 banner sheet');
const keys=['spectral-standards','spectral-standard-left','spectral-standard-right'],groups=Object.fromEntries(keys.map(k=>[k,[]])),registration=[];
const origin={x:-.10,y:-.28},bases=[{x:-.11,y:0},{x:.11,y:0}],vectors=[{x:-.15,y:-1.15},{x:.15,y:-1.15}];
const envelope={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
function landmark(data,{left,right,top,bottom},tip){
 let best=tip==='top'?Infinity:-Infinity,xs=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  if(data[(y*crop+x)*4+3]<160)continue;
  if(tip==='top'?y<best:y>best){best=y;xs=[x];}else if(y===best)xs.push(x);
 }
 if(!xs.length)throw Error('Missing rigid pole landmark');
 return{x:xs.reduce((a,b)=>a+b,0)/xs.length,y:best};
}
function boundsOf(data){const b={left:crop,top:crop,right:0,bottom:0};let maxBorderAlpha=0;
 for(let y=0;y<crop;y++)for(let x=0;x<crop;x++){
  const a=data[(y*crop+x)*4+3];if(!x||!y||x===crop-1||y===crop-1)maxBorderAlpha=Math.max(maxBorderAlpha,a);
  if(a>32){b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);}
 }return{bounds:b,maxBorderAlpha};
}
await fs.mkdir(file('qa/standards-v7'),{recursive:true});
for(let i=0;i<4;i++){
 const data=await sharp(bytes).extract({left:i%2*crop,top:Math.floor(i/2)*crop,width:crop,height:crop}).ensureAlpha().raw().toBuffer();
 const bounds=boundsOf(data);if(bounds.maxBorderAlpha>32)throw Error('Clipped frame '+i);
 const pair=[];
 for(const [side,key]of keys.entries()){
  const pixels=Buffer.from(data);let landmarks=null,anchor={x:.5,y:.5};
  if(side){
   const n=side-1,isLeft=n===0;
   for(let y=0;y<crop;y++)for(let x=0;x<crop;x++)if(isLeft?x>=314:x<314)pixels[(y*crop+x)*4+3]=0;
   const top=landmark(pixels,{left:isLeft?170:350,right:isLeft?260:465,top:20,bottom:110},'top');
   const base=landmark(pixels,{left:isLeft?250:325,right:isLeft?310:395,top:475,bottom:580},'bottom');
   landmarks={top,base};anchor={x:(base.x+pad)/cell,y:(base.y+pad)/cell};
   pair.push({side:isLeft?'left':'right',...landmarks});
  }
  const {bounds:b,maxBorderAlpha}=boundsOf(pixels);
  const png=await sharp(pixels,{raw:{width:crop,height:crop,channels:4}}).png().toBuffer();
  const packed=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:png,left:pad,top:pad}]).png().toBuffer();
  const path='assets/frames/'+key+'-v7-'+i+'.png';await fs.writeFile(file(path),packed);
  const frame={index:i,file:path,sha256:hash(packed),anchor,sourceRect:{left:i%2*crop,top:Math.floor(i/2)*crop,width:crop,height:crop},bounds:b,maxBorderAlpha};
  if(landmarks){
   const n=side-1,{top,base}=landmarks,v=vectors[n];
   const sourceLength=Math.hypot(top.x-base.x,top.y-base.y),scaleInBodyHeights=Math.hypot(v.x,v.y)/sourceLength;
   const rotation=Math.atan2(v.y,v.x)-Math.atan2(top.y-base.y,top.x-base.x);
   Object.assign(frame,{landmarks,scaleInBodyHeights,rotation});
   for(const x of [b.left,b.right])for(const y of [b.top,b.bottom]){
    const dx=(x-base.x)*scaleInBodyHeights,dy=(y-base.y)*scaleInBodyHeights;
    const px=origin.x+bases[n].x+dx*Math.cos(rotation)-dy*Math.sin(rotation),py=origin.y+bases[n].y+dx*Math.sin(rotation)+dy*Math.cos(rotation);
    envelope.left=Math.min(envelope.left,px);envelope.right=Math.max(envelope.right,px);envelope.top=Math.min(envelope.top,py);envelope.bottom=Math.max(envelope.bottom,py);
   }
  }
  groups[key].push({bytes:packed,frame});
 }
 registration.push({index:i,...bounds,poles:pair});
}
for(const key of keys){
 const g=groups[key],atlas='assets/atlases/'+key+'-v7.png';
 const packed=await sharp({create:{width:cell*2,height:cell*2,channels:4,background:'#00000000'}}).composite(g.map((v,i)=>({input:v.bytes,left:i%2*cell,top:Math.floor(i/2)*cell}))).png().toBuffer();
 await fs.writeFile(file(atlas),packed);
 m.effects[key]={atlas,sha256:hash(packed),source,sourceSha256:hash(bytes),columns:2,rows:2,cellSize:cell,frameCount:4,previewEnabled:key!==keys[0],derivedLayer:key===keys[0]?null:key.endsWith('left')?'LEFT':'RIGHT',frames:g.map(v=>v.frame)};
}
for(const [key,value]of Object.entries(m.effects))if(key.startsWith('white-tiger-')||key==='ballistic-aura')value.previewEnabled=false;
m.revision='SHIRANUI_SPECTRAL_STANDARDS_AMBIENT_V7';
m.bodyAura={kind:'SPECTRAL_STANDARDS',enabled:true,source:keys[0],left:keys[1],right:keys[2],origin,bases,poleVectors:vectors,envelope,cycleSeconds:12,phase:'FOUR_AUTHORED_CLOTH_PHASES_CYCLIC',layer:'REAR_ONLY',anchor:'TWO_FIXED_POLE_LANDMARKS',ambientOnly:true,attackEffectsAdded:false,fixedPosition:true,fixedPoleEndpoints:true,shotsAndBodyUnchanged:true,status:'VISUAL_REVIEW_PENDING',decision:'spectral-standards-selection-20261015.json'};
m.counts.effects=60;m.counts.retainedEffects=52;
m.qa={...m.qa,runtime:'qa/standards-v7/runtime-report.json',video:'qa/standards-v7/video-inspection.json',completeCharacter:'qa/standards-v7/desktop-aura-3.png',bodyAura:'qa/standards-v7/runtime-report.json',scope:'qa/standards-v7/scope-report.json'};
await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');
await fs.writeFile(file('qa/standards-v7/source-registration.json'),JSON.stringify({status:'PASS',source,sourceSha256:hash(bytes),cell,registration,envelope,authoredPairFrames:4,derivedLayers:2,policy:'Original RGBA retained. Complementary left/right split; uniform scale and rotation align each rigid pole top/base to two fixed endpoints. No mesh warping or invented attack.'},null,2)+'\n');
console.log(JSON.stringify({authoredPairFrames:4,registration,envelope},null,2));
