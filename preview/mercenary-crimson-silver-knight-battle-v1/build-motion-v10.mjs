import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {root,weaponAt,cleanAlpha,sha} from './compose-weapon.mjs';
import {analyze,isKey} from './inspect-proxy-v3.mjs';

const write=async(file,bytes)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);return {file,sha256:sha(bytes)};};
const specs=JSON.parse(await fs.readFile(path.join(root,'asset-specs-v10.json'),'utf8'));
const previous=JSON.parse(await fs.readFile(path.join(root,'motion-manifest-v9.json'),'utf8'));
const motions=Object.fromEntries(specs.keepFromV9.map(key=>[key,previous[key]]));
for(const [key,parts] of Object.entries(specs.motion)){
 const poses=[],sources=[];
 for(const part of parts){
  const file=part.file??`assets/motion-v10/${part.source}-source.png`;
  try{await fs.access(path.join(root,file));}catch{if(process.argv.includes('--partial'))continue;throw Error('Missing '+file);}
  const {image,components,owner,frames}=await analyze(file,4),sw=image.info.width;
  sources.push({file,sha256:sha(await fs.readFile(path.join(root,file))),nativeAlpha:true,registration:'CYAN_POMMEL_MAGENTA_BLADE_GREEN_STRAIGHT_HILT'});
  for(let i=0;i<4;i++){
   if(part.indices&&!part.indices.includes(i))continue;
   const f=frames[i],c=components[i],reference=Array.isArray(part.bodyPixels)?part.bodyPixels[i]:part.bodyPixels;
   const bw=c.x1-c.x0+5,bh=c.y1-c.y0+5,raw=Buffer.alloc(bw*bh*4),hand=Buffer.alloc(raw.length),d=[-Math.sin(f.angle*Math.PI/180),Math.cos(f.angle*Math.PI/180)];
   const feet=part.feet?.[i]??supportFeet(image,owner,i+1,f,reference);
   const twoHand=part.gripMode==='twohand',occlusions=twoHand?f.occlusions:[f.gap];
   const lead=occlusions.at(-1),fistHalf=reference*.025;
   const primary=twoHand&&lead[1]-lead[0]>reference*.075?lead[1]-fistHalf:(lead[0]+lead[1])/2;
   const pivotT=primary+5*reference/1452,handRange=[occlusions[0][0]-2,lead[1]+2];
   const gx=f.cyan[0]+d[0]*pivotT,gy=f.cyan[1]+d[1]*pivotT;
   let glovePixels=0,removedKey=0;
   for(let y=c.y0-2;y<=c.y1+2;y++)for(let x=c.x0-2;x<=c.x1+2;x++){
    if(x<0||y<0||x>=sw||y>=image.info.height)continue;
    const p=y*sw+x;if(owner[p]!==i+1)continue;
    const at=((y-c.y0+2)*bw+x-c.x0+2)*4,[r,g,b,a]=image.data.subarray(p*4,p*4+4);
    const t=(x-f.cyan[0])*d[0]+(y-f.cyan[1])*d[1],perp=Math.abs(-(x-f.cyan[0])*d[1]+(y-f.cyan[1])*d[0]);
    // Remove only the explicit proxy hues and their thin antialias fringe.
    let keyPixel=isKey(r,g,b)||(g>r*1.08&&g>b*1.08&&g>65); // Remove practice-blade green spill; armor/cape contain no green.
    if(!keyPixel&&perp<reference*.035&&t>-12&&t<Math.hypot(f.magenta[0]-f.cyan[0],f.magenta[1]-f.cyan[1])+12){
     keyPixel=g>r*1.08&&g>b*1.08&&g>75 || g>r*1.12&&b>r*1.12&&g>90&&b>90 || r>g*1.3&&b>g*1.3&&b>r*.65&&b>90;
    }
    if(keyPixel){removedKey++;continue;}
    image.data.copy(raw,at,p*4,p*4+4);
    if(t>=handRange[0]&&t<=handRange[1]&&perp<reference*(twoHand?.048:.041)){image.data.copy(hand,at,p*4,p*4+4);if(a>180)glovePixels++;}
   }
   if(glovePixels<40)throw Error(`${key}/${i}: no solid closed fist over hilt`);
   const body=await cleanAlpha(await sharp(raw,{raw:{width:bw,height:bh,channels:4}}).png().toBuffer()),glove=await cleanAlpha(await sharp(hand,{raw:{width:bw,height:bh,channels:4}}).png().toBuffer());
   const grip=[gx-c.x0+2,gy-c.y0+2],weapon=await weaponAt({scale:reference/1452,angle:f.angle,grip,fillGripOcclusion:twoHand});
   const bodyOrigin=[c.x0-2-feet[0],c.y0-2-feet[1]],weaponOrigin=[bodyOrigin[0]+weapon.left,bodyOrigin[1]+weapon.top];
   poses.push({body,glove,weapon:weapon.input,reference,bodyOrigin,weaponOrigin,bounds:[Math.min(bodyOrigin[0],weaponOrigin[0])/reference,Math.min(bodyOrigin[1],weaponOrigin[1])/reference,Math.max(bodyOrigin[0]+bw,weaponOrigin[0]+weapon.width)/reference,Math.max(bodyOrigin[1]+bh,weaponOrigin[1]+weapon.height)/reference],source:file,sourceIndex:i,sourceFeet:feet,sourceBounds:f.bounds,sourceGrip:[gx,gy],registration:{cyan:f.cyan,magenta:f.magenta,occlusion:f.gap,allOcclusions:occlusions,primaryGripT:pivotT,twoHand,glovePixels,removedKey},weaponRecord:weapon.record});
  }
 }
 if(!poses.length)continue;
 const minX=Math.min(...poses.map(p=>p.bounds[0])),minY=Math.min(...poses.map(p=>p.bounds[1])),maxX=Math.max(...poses.map(p=>p.bounds[2])),maxY=Math.max(...poses.map(p=>p.bounds[3]));
 const bodyPixels=Math.min(400,242/Math.max(.01,-minX),242/Math.max(.01,maxX),424/Math.max(.01,-minY),56/Math.max(.01,maxY));
 const frames=[],tiles=[],cell=512;
 for(const [index,p] of poses.entries()){
  const fit=bodyPixels/p.reference,layers=[];
  for(const [bytes,origin] of [[p.body,p.bodyOrigin],[p.weapon,p.weaponOrigin],[p.glove,p.bodyOrigin]]){
   const m=await sharp(bytes).metadata(),input=await sharp(bytes).resize(Math.max(1,Math.round(m.width*fit)),Math.max(1,Math.round(m.height*fit))).png().toBuffer();
   layers.push({input,left:Math.round(256+origin[0]*fit),top:Math.round(440+origin[1]*fit)});
  }
  const png=await cleanAlpha(await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer());
  const angle=p.weaponRecord.angle*Math.PI/180,scale=bodyPixels/1452,grip=[256+(p.sourceGrip[0]-p.sourceFeet[0])*fit,440+(p.sourceGrip[1]-p.sourceFeet[1])*fit];
  const tip=[grip[0]+scale*(11*Math.cos(angle)-1119*Math.sin(angle)),grip[1]+scale*(11*Math.sin(angle)+1119*Math.cos(angle))];
  frames.push({...await write(`assets/motion-v10/frames/${key}/${String(index).padStart(2,'0')}.png`,png),index,footAnchor:{x:.5,y:440/512},bodyPixels,source:p.source,sourceIndex:p.sourceIndex,sourceBounds:p.sourceBounds,sourceFeet:p.sourceFeet,sourceBodyPixels:p.reference,sourceGrip:p.sourceGrip,grip,tip,weapon:{...p.weaponRecord,packedUniformScale:fit},registration:p.registration,foreground:'EXACT_NATIVE_CLOSED_GLOVE_PIXELS'});
  tiles.push({input:png,left:index%4*cell,top:Math.floor(index/4)*cell});
 }
 const rows=Math.ceil(frames.length/4),png=await cleanAlpha(await sharp({create:{width:2048,height:512*rows,channels:4,background:'#00000000'}}).composite(tiles).png().toBuffer()),webp=await sharp(png).webp({lossless:true}).toBuffer();
 const pngAtlas=`assets/motion-v10/${key}-atlas.png`,atlas=`assets/motion-v10/${key}-atlas.webp`;
 await write(pngAtlas,png);await write(atlas,webp);
 motions[key]={sources,atlas,atlasSha256:sha(webp),pngAtlas,pngAtlasSha256:sha(png),cellSize:512,columns:4,rows,frameCount:frames.length,bodyPixels,frames,contacts:(specs.contacts[key]??[]).map(c=>({...c,sourcePoint:frames[c.frame].tip,sourceFoot:[256,440]}))};
 console.log(`${key}: ${frames.length} new closed-grip poses; body ${bodyPixels.toFixed(1)} px; locked sword ${scaleText(bodyPixels)}`);
}
// Keep the approved idle atlas byte-for-byte.
for(const [key,from] of Object.entries(specs.reuse))motions[key]={...motions[from],reuses:from};
await write('motion-counts-v10.mjs',Buffer.from('export const COUNTS='+JSON.stringify(Object.fromEntries(Object.entries(motions).map(([k,s])=>[k,s.frameCount])))+';\n'));
await write('motion-manifest-v10.json',Buffer.from(JSON.stringify(motions,null,2)+'\n'));
if(!process.argv.includes('--partial')){
 const m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 m.version=10;m.motion=motions;m.counts.motion=Object.values(motions).reduce((n,s)=>n+s.frameCount,0);
 m.battleSprite='preview/mercenary-crimson-silver-knight-battle-v1/assets/knight-sd-v14-original-blade-approved-grip.png';
 const b=await fs.readFile(path.join(root,'assets/knight-sd-v14-original-blade-approved-grip.png')),metadata=await sharp(b).metadata();
 m.battleSpriteSha256=sha(b);m.battleSpriteInfo={...m.battleSpriteInfo,width:metadata.width,height:metadata.height,sha256:sha(b),hasAlpha:true};m.battleSpriteFootAnchor={x:729/1408,y:1507/1664};
 m.motionStatus='USER_REVIEW_PENDING';m.battleSpriteStatus='USER_REQUESTED_V3_PREVIEW_INTEGRATION';m.motionVersion='APPROVED_RETURN_COMBO_PLUS_TWO_HAND_OVERHEAD_V10';
 m.processing='New native-alpha articulated body poses. Cyan/magenta markers determine actual rigid hilt axis and occluded-fist pivot. Markers removed; immutable original sword is uniformly scaled to anatomical body scale, rigidly rotated and translated; original closed glove pixels composited in foreground. Ground foot anchors remain fixed during strikes. No weapon redraw, warp, still transforms counted as new poses, or root-y contact cheating.';
 m.counts.uniqueMotion=1+new Set(Object.values(motions).flatMap(s=>s.frames.filter(f=>f.sourceIndex!==undefined).map(f=>f.source+'#'+f.sourceIndex))).size;
 m.counts.reusedMotion=m.counts.motion-m.counts.uniqueMotion;
 m.renderer.aura='SATURATED_CRIMSON_POSE_SILHOUETTE_NORMAL_OUTER_PLUS_THIN_GOLD_RIM';m.generation.promptDirectory='prompts/motion-v10-*.txt';m.returnPose={reference:'assets/motion-v5/ready-a-source.png#0',endpoint:{key:'idle',frame:0,sha256:motions.idle.frames[0].sha256},camera:'APPROVED_FIXED_FRONT_THREE_QUARTER',anatomy:'APPROVED_NATURAL_ADULT_PROPORTIONS',approximateGeneratedIdleRejected:true};
 await write('manifest.json',Buffer.from(JSON.stringify(m,null,2)+'\n'));
}
function scaleText(n){return (n/1452).toFixed(5);}

function supportFeet(image,owner,id,f,reference){
 const [x0,y0,x1,y1]=f.bounds,w=image.info.width,bottom=f.feet[1];let minX=x1,maxX=x0;
 for(let y=Math.max(y0,Math.floor(bottom-reference*.24));y<=bottom;y++)for(let x=x0;x<=x1;x++){
  const p=y*w+x,[r,g,b,a]=image.data.subarray(p*4,p*4+4);
  if(owner[p]===id&&a>=180&&g>35&&!isKey(r,g,b)&&!(r>g*1.6&&r>b*1.6)){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
 }
 return [(minX+maxX)/2,bottom];
}
