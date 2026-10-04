import fs from 'node:fs/promises';import sharp from 'sharp';import{createHash}from'node:crypto';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),file=p=>new URL(p,root),hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await fs.readFile(file('manifest.json'))),reports=[];
for(const kind of ['wrap','rear']){
 const source='assets/sources/fx-aura-'+kind+'-v2.png',bytes=await fs.readFile(file(source)),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),frames=[];
 for(let i=0;i<12;i++){
  const left=Math.round(i%4*info.width/4),top=Math.round(Math.floor(i/4)*info.height/3),width=Math.round((i%4+1)*info.width/4)-left,height=Math.round((Math.floor(i/4)+1)*info.height/3)-top;
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[((top+y)*info.width+left+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  assert(x1>x0&&y1>y0,kind+' empty cell '+i);assert(x0>8&&y0>8&&x1<width-9&&y1<height-9,kind+' clipped source '+i);
  const pad=5,rect={left:left+x0-pad,top:top+y0-pad,width:x1-x0+1+pad*2,height:y1-y0+1+pad*2};
  frames.push({index:i,cell:{left,top,width,height},contentBounds:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},sourceRect:rect});
 }
 const scale=338/Math.max(...frames.map(f=>f.sourceRect.height)),parts=[];
 for(const f of frames){
  const w=Math.round(f.sourceRect.width*scale),h=Math.round(f.sourceRect.height*scale);assert(w<400&&h<=338);
  parts.push({input:await sharp(bytes).extract(f.sourceRect).resize(w,h).png().toBuffer(),left:f.index%4*512+Math.round((512-w)/2),top:Math.floor(f.index/4)*512+Math.round((512-h)/2)});
 }
 const atlas=await sharp({create:{width:2048,height:1536,channels:4,background:'#00000000'}}).composite(parts).png().toBuffer(),url='assets/atlases/aura-'+kind+'.png';
 await fs.writeFile(file(url),atlas);
 m.effects['aura-'+kind]={url,columns:4,rows:3,width:2048,height:1536,sha256:hash(atlas),frames:frames.map(f=>({index:f.index,rect:{x:f.index%4*512,y:Math.floor(f.index/4)*512,width:512,height:512}}))};
 reports.push({kind,source,sourceSha256:hash(bytes),packing:'Uniform scale for all twelve frames; alpha-bounds registration; transparent padding',uniformScale:scale,frames});
}
m.version='BATTLE_SUIT_CRIMSON_GOLD_20261005_SATIN_AURA_V2';m.material={mode:'SATIN_GOLD_DISPLAY_SHADER',sourceFilesUnchanged:true,defaultEnabled:true,shader:'source/SatinGoldFilter.js'};
m.aura={defaultPalette:'crimson',body:'18 pose-matched silhouette copies',rearFrames:12,wrapFrames:12,clock:'SHARED_V3_GSAP',source:'source/RoyalAura.js',reference:'Approved Valter V17 silhouette / rim / rear aura layering'};
m.summary={...m.summary,effectFrames:Object.values(m.effects).reduce((n,s)=>n+s.frames.length,0),skillEffectFrames:132,auraFrames:24};
await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');
await fs.writeFile(file('qa/aura-packing-v2.json'),JSON.stringify({passed:true,reports},null,2)+'\n');
console.log(JSON.stringify(m.summary));
