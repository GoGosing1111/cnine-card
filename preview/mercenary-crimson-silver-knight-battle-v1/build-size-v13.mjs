// Repack the approved poses from their untouched source pixels. No new poses,
// body warps, changed grip axes or whole-texture scaling of the fixed sword.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {root,weaponAt,cleanAlpha,sha} from './compose-weapon.mjs';
import {analyze,isKey} from './inspect-proxy-v3.mjs';
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);return {file,sha256:sha(bytes)};};
const json=(f,o)=>write(f,Buffer.from(JSON.stringify(o,null,2)+'\n'));
const before=await read('qa/v13/before-motion.json'),calibration=await read('qa/v13/scale-estimates.json'),cache=new Map(),m=await read('manifest.json');
for(const key of ['twohandGrip','twohandLift','twohandStrike','twohandReturn']){
 const poses=[];
 for(const [index,old] of before[key].frames.entries()){
  const audit=calibration.records.find(r=>r.key===key&&r.index===index),reference=audit.reference;
  if(sha(await fs.readFile(path.join(root,old.source)))!==audit.sourceHash)throw Error('Approved source changed '+old.source);
  if(!cache.has(old.source))cache.set(old.source,await analyze(old.source,4));
  const {image,components,owner}=cache.get(old.source),c=components[old.sourceIndex],sw=image.info.width;
  const bw=c.x1-c.x0+5,bh=c.y1-c.y0+5,raw=Buffer.alloc(bw*bh*4),hand=Buffer.alloc(raw.length),r=old.registration;
  const a=old.weapon.angle*Math.PI/180,d=[-Math.sin(a),Math.cos(a)],maskReference=old.sourceBodyPixels;
  const ranges=r.allOcclusions??[r.occlusion],handRange=[ranges[0][0]-2,ranges.at(-1)[1]+2];
  for(let y=c.y0-2;y<=c.y1+2;y++)for(let x=c.x0-2;x<=c.x1+2;x++){
   if(x<0||y<0||x>=sw||y>=image.info.height)continue;
   const p=y*sw+x;if(owner[p]!==old.sourceIndex+1)continue;
   const at=((y-c.y0+2)*bw+x-c.x0+2)*4,[red,g,b]=image.data.subarray(p*4,p*4+4);
   const t=(x-r.cyan[0])*d[0]+(y-r.cyan[1])*d[1],perp=Math.abs(-(x-r.cyan[0])*d[1]+(y-r.cyan[1])*d[0]);
   let proxy=isKey(red,g,b)||(g>red*1.08&&g>b*1.08&&g>65);
   if(!proxy&&perp<maskReference*.035&&t>-12&&t<Math.hypot(r.magenta[0]-r.cyan[0],r.magenta[1]-r.cyan[1])+12)proxy=g>red*1.08&&g>b*1.08&&g>75||g>red*1.12&&b>red*1.12&&g>90&&b>90||red>g*1.3&&b>g*1.3&&b>red*.65&&b>90;
   if(proxy)continue;
   image.data.copy(raw,at,p*4,p*4+4);
   if(t>=handRange[0]&&t<=handRange[1]&&perp<maskReference*(r.twoHand?.048:.041))image.data.copy(hand,at,p*4,p*4+4);
  }
  const body=await cleanAlpha(await sharp(raw,{raw:{width:bw,height:bh,channels:4}}).png().toBuffer()),glove=await cleanAlpha(await sharp(hand,{raw:{width:bw,height:bh,channels:4}}).png().toBuffer());
  // Keep the exact approved fist pivot, axis, supporting feet and occlusion mask.
  const grip=[old.sourceGrip[0]-c.x0+2,old.sourceGrip[1]-c.y0+2];
  const weapon=await weaponAt({scale:reference/1452,angle:old.weapon.angle,grip,fillGripOcclusion:!!r.twoHand});
  const bodyOrigin=[c.x0-2-old.sourceFeet[0],c.y0-2-old.sourceFeet[1]],weaponOrigin=[bodyOrigin[0]+weapon.left,bodyOrigin[1]+weapon.top];
  poses.push({old,audit,reference,body,glove,weapon,bodyOrigin,weaponOrigin,bounds:[Math.min(bodyOrigin[0],weaponOrigin[0])/reference,Math.min(bodyOrigin[1],weaponOrigin[1])/reference,Math.max(bodyOrigin[0]+bw,weaponOrigin[0]+weapon.width)/reference,Math.max(bodyOrigin[1]+bh,weaponOrigin[1]+weapon.height)/reference]});
 }
 const minX=Math.min(...poses.map(p=>p.bounds[0])),minY=Math.min(...poses.map(p=>p.bounds[1])),maxX=Math.max(...poses.map(p=>p.bounds[2])),maxY=Math.max(...poses.map(p=>p.bounds[3]));
 const bodyPixels=Math.min(400,242/Math.max(.01,-minX),424/Math.max(.01,-minY),242/Math.max(.01,maxX),56/Math.max(.01,maxY)),frames=[],tiles=[];
 for(const [index,p] of poses.entries()){
  const fit=bodyPixels/p.reference,layers=[];
  for(const [bytes,origin] of [[p.body,p.bodyOrigin],[p.weapon.input,p.weaponOrigin],[p.glove,p.bodyOrigin]]){
   const info=await sharp(bytes).metadata();layers.push({input:await sharp(bytes).resize(Math.round(info.width*fit),Math.round(info.height*fit)).png().toBuffer(),left:Math.round(256+origin[0]*fit),top:Math.round(440+origin[1]*fit)});
  }
  const png=await cleanAlpha(await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer());
  const angle=p.old.weapon.angle*Math.PI/180,scale=bodyPixels/1452,grip=[256+(p.old.sourceGrip[0]-p.old.sourceFeet[0])*fit,440+(p.old.sourceGrip[1]-p.old.sourceFeet[1])*fit];
  const tip=[grip[0]+scale*(11*Math.cos(angle)-1119*Math.sin(angle)),grip[1]+scale*(11*Math.sin(angle)+1119*Math.cos(angle))];
  frames.push({...p.old,...await write(`assets/motion-v13/frames/${key}/${String(index).padStart(2,'0')}.png`,png),bodyPixels,sourceBodyPixels:p.reference,grip,tip,weapon:{...p.weapon.record,packedUniformScale:fit},scaleAudit:{previousReference:p.old.sourceBodyPixels,sourcePoints:p.audit.points,uniformCorrection:p.audit.uniformCorrection,method:p.audit.method,sourceArtworkChanged:false}});
  tiles.push({input:png,left:index%4*512,top:Math.floor(index/4)*512});
 }
 const rows=Math.ceil(frames.length/4),png=await cleanAlpha(await sharp({create:{width:2048,height:rows*512,channels:4,background:'#00000000'}}).composite(tiles).png().toBuffer()),webp=await sharp(png).webp({lossless:true}).toBuffer();
 const atlas=`assets/motion-v13/${key}-atlas.webp`,pngAtlas=`assets/motion-v13/${key}-atlas.png`;await write(atlas,webp);await write(pngAtlas,png);
 m.motion[key]={...before[key],atlas,pngAtlas,atlasSha256:sha(webp),pngAtlasSha256:sha(png),bodyPixels,frames,contacts:before[key].contacts.map(c=>({...c,sourcePoint:frames[c.frame].tip}))};
 console.log(key,frames.map(f=>f.sourceBodyPixels).join(', '));
}
m.version=13;m.motionVersion='COMMON_TWO_HAND_OVERHEAD_V13_SIZE_CALIBRATED';
m.sizeCalibration={version:13,approvalScope:'MOTION_APPROVED_SIZE_RECHECK_REQUESTED',measurement:'size-landmarks-v13.json',report:'qa/v13/scale-estimates.json',originalFramesPreserved:'qa/v13/before-motion.json',activeFramesInspected:27,repackedFrames:17,newArtFrames:0,globalDisplaySizeChanged:false,weaponLengthChanged:false,approvedIdleChanged:false,liveActivationApproved:false};
await json('manifest.json',m);
await json('motion-manifest-v13.json',m.motion);
await json('motion-approval-20261001-v13.json',{date:'2026-10-01',status:'USER_APPROVED_MOTION',userRequest:'모션 승인,단 스프라이트 별로 캐릭터 크기가 일정하지 않던것을 확인함 다시 검수할것',approvedMotion:'TWO_HAND_OVERHEAD_V10',timingUnchanged:true,appliesTo:['attack','skill','overhead','execution','guard','ultimate'],priorAdoption:'motion-adoption-20261001.json',sizeCorrection:'manifest.json#sizeCalibration',liveActivationApproved:false,rankApproved:false});
