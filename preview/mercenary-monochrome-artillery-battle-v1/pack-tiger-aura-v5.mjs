import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
// The user retired this concept. Keep the packer as production history only.
const rejection=await fs.readFile(file('aura-rejection-20261015.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(rejection?.rejectedRevision==='SHIRANUI_WHITE_TIGER_AMBIENT_AURA_V5')throw Error('백호 아우라는 사용자 폐기본입니다. 현재 manifest를 과거 제작본으로 덮어쓸 수 없습니다.');
const m=JSON.parse(await fs.readFile(file('manifest.json'),'utf8'));
const source='assets/sources/white-tiger-wrap-v5-padded.png',bytes=await fs.readFile(file(source));
const meta=await sharp(bytes).metadata(),crop=meta.width/2,pad=48,cell=crop+pad*2;
if(crop!==Math.floor(crop)||meta.width!==meta.height)throw Error('Expected square 2x2 sheet');
const raw=[];for(let i=0;i<4;i++)raw.push(await sharp(bytes).extract({left:i%2*crop,top:Math.floor(i/2)*crop,width:crop,height:crop}).ensureAlpha().raw().toBuffer());
// Register the same nose detail; only translation is permitted, never morph the face.
const origin={x:532,y:244},template={left:515,top:229,width:32,height:27};
function align(data,index){
 if(!index)return {...origin,dx:0,dy:0,score:0};let best={score:Infinity};
 for(let dy=-24;dy<=24;dy++)for(let dx=-24;dx<=24;dx++){
  let score=0;for(let y=template.top;y<template.top+template.height;y+=2)for(let x=template.left;x<template.left+template.width;x+=2){
   const a=(y*crop+x)*4,b=((y+dy)*crop+x+dx)*4;
   for(let c=0;c<4;c++)score+=(data[b+c]-raw[0][a+c])**2;
  }if(score<best.score)best={score,dx,dy,x:origin.x+dx,y:origin.y+dy};
 }return best;
}
const names=['white-tiger-aura','white-tiger-aura-rear','white-tiger-aura-front'],groups=Object.fromEntries(names.map(n=>[n,[]])),frames=[],registration=[];
await fs.mkdir(file('qa/aura-v5'),{recursive:true});
for(let i=0;i<4;i++){
 const data=raw[i],nose=align(data,i),bounds={left:crop,top:crop,right:0,bottom:0};let maxBorderAlpha=0;
 for(let y=0;y<crop;y++)for(let x=0;x<crop;x++){
  const a=data[(y*crop+x)*4+3];if(x===0||y===0||x===crop-1||y===crop-1)maxBorderAlpha=Math.max(maxBorderAlpha,a);
  if(a>32){bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
 }
 if(maxBorderAlpha>64)throw Error('Clipped tiger aura frame '+i);
 const anchor={x:(nose.x+pad)/cell,y:(nose.y+pad)/cell},all=Buffer.from(data),front=Buffer.from(data),rear=Buffer.from(data);
 // Complementary alpha split at the low foreground ribbon; all source RGB is preserved.
 for(let y=0;y<crop;y++)for(let x=0;x<crop;x++){
  const p=(y*crop+x)*4+3,q=Math.max(0,Math.min(1,(y-nose.y-250)/30)),a=Math.round(data[p]*q*q*(3-2*q));
  front[p]=a;rear[p]=data[p]-a;
 }
 for(const [key,input]of [[names[0],all],[names[1],rear],[names[2],front]]){
  const png=await sharp(input,{raw:{width:crop,height:crop,channels:4}}).png().toBuffer();
  const packed=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:png,left:pad,top:pad}]).png().toBuffer();
  const path='assets/frames/'+key+'-v5-'+i+'.png';await fs.writeFile(file(path),packed);
  groups[key].push({bytes:packed,frame:{index:i,file:path,sha256:hash(packed),anchor,sourceRect:{left:i%2*crop,top:Math.floor(i/2)*crop,width:crop,height:crop},noseSource:{x:nose.x,y:nose.y},maxBorderAlpha}});
 }
 registration.push({index:i,nose,sourceBounds:bounds,maxBorderAlpha});
 frames.push({left:(bounds.left-nose.x)/cell,right:(bounds.right-nose.x)/cell,top:(bounds.top-nose.y)/cell,bottom:(bounds.bottom-nose.y)/cell});
}
for(const key of names){
 const g=groups[key],atlas='assets/atlases/'+key+'-v5.png';
 const packed=await sharp({create:{width:cell*2,height:cell*2,channels:4,background:'#00000000'}}).composite(g.map((v,i)=>({input:v.bytes,left:i%2*cell,top:Math.floor(i/2)*cell}))).png().toBuffer();
 await fs.writeFile(file(atlas),packed);
 m.effects[key]={atlas,sha256:hash(packed),source,sourceSha256:hash(bytes),columns:2,rows:2,cellSize:cell,frameCount:4,previewEnabled:key!==names[0],derivedAlphaLayer:key===names[0]?null:key.endsWith('front')?'FRONT':'REAR',frames:g.map(v=>v.frame)};
}
m.effects['ballistic-aura'].previewEnabled=false;
m.revision='SHIRANUI_WHITE_TIGER_AMBIENT_AURA_V5';
m.bodyAura={source:'white-tiger-aura',rear:'white-tiger-aura-rear',front:'white-tiger-aura-front',reference:'preview/mercenary-golden-dragon-battle-v1/source/GoldenDragonFX.js',layer:'JINMU_STYLE_REAR_AND_LOW_FOREGROUND',anchor:'FIXED_TIGER_NOSE',cycleSeconds:12,phase:'COSINE_FORWARD_REVERSE',noseOffset:{x:.48,y:-.94},sizeInBodyHeights:2.15,envelope:{left:Math.min(...frames.map(f=>f.left)),right:Math.max(...frames.map(f=>f.right)),top:Math.min(...frames.map(f=>f.top)),bottom:Math.max(...frames.map(f=>f.bottom))},fixedPosition:true,fixedScale:true,shotsAndBodyUnchanged:true,ambientOnly:true,attackEffectsAdded:false};
m.counts.effects=60;m.counts.retainedEffects=48;
m.rejectedSources=[...new Set([...m.rejectedSources,'ballistic-aura-v4.png','white-tiger-idle-v5.png','white-tiger-idle-v5-padded.png','white-tiger-aim-v5.png','white-tiger-roar-v5.png','white-tiger-claw-v5.png','white-tiger-wrap-v5.png'])];
m.qa.bodyAura='qa/aura-v5/runtime-report.json';
await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');
await fs.writeFile(file('qa/aura-v5/source-registration.json'),JSON.stringify({status:'PASS',source,sha256:hash(bytes),cell,registration,policy:'Preserve generated RGB/alpha. Nose landmark anchors, uniform size, complementary rear/front alpha. No new attack effects.'},null,2)+'\n');
console.log('Packed 4 authored white tiger AMBIENT frames with nose registration and rear/front layers.');
