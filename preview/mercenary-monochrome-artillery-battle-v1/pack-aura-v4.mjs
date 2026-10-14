import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex'),m=JSON.parse(await fs.readFile(file('manifest.json')));
const source='assets/sources/ballistic-aura-v4.png',input=await fs.readFile(file(source)),cell=410,pad=24,crop=362,frames=[],buffers=[],groundY=[330,330,329,330,313,313,313,313,300,300,300,300];
for(let i=0;i<12;i++){
 const rect={left:i%4*crop,top:Math.floor(i/4)*crop,width:crop,height:crop},{data}=await sharp(input).extract(rect).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let maxBorderAlpha=0;for(let y=0;y<crop;y++)for(let x=0;x<crop;x++)if(x===0||y===0||x===crop-1||y===crop-1)maxBorderAlpha=Math.max(maxBorderAlpha,data[(y*crop+x)*4+3]);
 if(maxBorderAlpha>64)throw Error('Clipped aura source frame '+i);
 const png=await sharp(data,{raw:{width:crop,height:crop,channels:4}}).png().toBuffer();
 const bytes=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:png,left:pad,top:pad}]).png().toBuffer(),path='assets/frames/ballistic-aura-v4-'+i+'.png';
 await fs.writeFile(file(path),bytes);buffers.push(bytes);
 frames.push({index:i,file:path,sha256:hash(bytes),sourceRect:rect,groundSource:{x:185,y:groundY[i]},anchor:{x:(185+pad)/cell,y:(groundY[i]+pad)/cell},maxBorderAlpha});
}
const atlas='assets/atlases/ballistic-aura-v4.png',bytes=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%4*cell,top:Math.floor(i/4)*cell}))).png().toBuffer();
await fs.writeFile(file(atlas),bytes);m.effects['ballistic-aura']={atlas,sha256:hash(bytes),source,sourceSha256:hash(input),columns:4,rows:3,cellSize:cell,frameCount:12,frames};
m.revision='AR_AUTO_CENTRAL_BARRAGE_WITH_BALLISTIC_AURA_V4';
m.bodyAura={source:'ballistic-aura',layer:'BEHIND_BODY_AND_HEAD_HALO',anchor:'REGISTERED_GROUND_RIPPLE',cycleSeconds:12,phase:'COSINE_FORWARD_REVERSE',fixedPosition:true,fixedScale:true,shotsAndBodyUnchanged:true};
m.counts.effects=68;m.qa.bodyAura='qa/aura-v4/runtime-report.json';
await fs.mkdir(file('qa/aura-v4'),{recursive:true});await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');
await fs.writeFile(file('qa/aura-v4/source-registration.json'),JSON.stringify({status:'PASS',source,frames:frames.map(f=>({index:f.index,groundSource:f.groundSource,maxBorderAlpha:f.maxBorderAlpha})),policy:'Generated alpha preserved, ground landmarks registered, uniform scale only; no clipping, recoloring, blur, or body edits.'},null,2)+'\n');
console.log('12 white ballistic aura frames packed with registered ground anchors');
