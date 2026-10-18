// Technical packing of approved body drawings and ImageGen VFX; no repainting.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
let sharp;try{sharp=require('sharp');}catch{sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');}
const root=new URL('./',import.meta.url),dir='assets/white-crest-20261019/';
const read=p=>fs.readFile(new URL(p,root)),write=(p,b)=>fs.writeFile(new URL(p,root),b);
const hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await read('manifest.json'));
const originals={sourceArt:m.sourceArtSha256,weapon:m.weapon.sha256,battleSprite:m.battleSpriteSha256};
m.motionBody={};
for(const [name,bank]of Object.entries(m.motion)){
 const frames=[],images=[];
 for(const f of bank.frames){
  const raw=await read(f.bodyFile),scale=f.bodyScale*.5,meta=await sharp(raw).metadata();
  const foot={x:(f.sourceFoot[0]-f.region.left-f.alphaBounds.left)*scale,y:(f.sourceFoot[1]-f.region.top-f.alphaBounds.top)*scale};
  const body=await sharp(raw).resize(Math.round(meta.width*scale),Math.round(meta.height*scale)).png().toBuffer();
  const left=Math.round(320-foot.x),top=Math.round(540-foot.y),bm=await sharp(body).metadata();
  if(left<0||top<0||left+bm.width>640||top+bm.height>640)throw Error('Body packing clips '+f.id);
  const frame=await sharp({create:{width:640,height:640,channels:4,background:'#00000000'}}).composite([{input:body,left,top}]).png().toBuffer();
  images.push(frame);frames.push({id:f.id,index:f.index,pivot:{x:320,y:540},sourceSha256:hash(raw),sha256:hash(frame)});
 }
 const pages=[];
 for(let start=0;start<frames.length;start+=9){
  const group=images.slice(start,start+9),rows=Math.ceil(group.length/3),url=dir+'body-'+name+'-'+pages.length+'.webp';
  const data=await sharp({create:{width:1920,height:640*rows,channels:4,background:'#00000000'}}).composite(group.map((input,i)=>({input,left:i%3*640,top:Math.floor(i/3)*640}))).webp({lossless:true}).toBuffer();
  await write(url,data);for(let i=0;i<group.length;i++)Object.assign(frames[start+i],{page:pages.length,rect:{x:i%3*640,y:Math.floor(i/3)*640,width:640,height:640}});
  pages.push({url,sha256:hash(data),width:1920,height:640*rows});
 }
 m.motionBody[name]={pages,frames,referenceHeight:305,frameWidth:640,frameHeight:640,columns:3};
}
m.whiteCrest={version:'WHITE_CREST_CONTINUOUS_20261019',approvedConcept:'approved-20261019/concept-v3.png',approvedConceptSha256:hash(await read('approved-20261019/concept-v3.png')),sourceMode:'built-in ImageGen',sprites:{}};
for(const name of ['crest','ground','sword']){
 const source=dir+name+'-source.png',raw=await read(source),meta=await sharp(raw).metadata();
 if(!meta.hasAlpha)throw Error(name+' requires transparent alpha');
 const url=dir+name+'.webp',data=await sharp(raw).webp({lossless:true}).toBuffer();await write(url,data);
 const columns=name==='sword'?4:1,rows=name==='sword'?3:1;
 const frames=Array.from({length:columns*rows},(_,i)=>{const x=Math.round(i%columns*meta.width/columns),y=Math.round(Math.floor(i/columns)*meta.height/rows);return{index:i,rect:{x,y,width:Math.round((i%columns+1)*meta.width/columns)-x,height:Math.round((Math.floor(i/columns)+1)*meta.height/rows)-y}};});
 if(name==='sword')for(const f of frames){
  const pixels=await sharp(raw).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).ensureAlpha().raw().toBuffer();
  const counts=Array.from({length:f.rect.height},(_,y)=>{let n=0;for(let x=Math.round(f.rect.width*.16);x<f.rect.width*.86;x++){const k=(y*f.rect.width+x)*4;if(pixels[k+3]>160&&pixels[k]>235)n++;}return n;});
  const highest=Math.max(...counts),ys=counts.map((n,y)=>({n,y})).filter(p=>p.n>=highest*.9),center=ys.reduce((v,p)=>v+p.y*p.n,0)/ys.reduce((v,p)=>v+p.n,0);
  f.axis={start:{x:f.rect.width*.14,y:center},end:{x:f.rect.width*.88,y:center}};
 }
 m.whiteCrest.sprites[name]={url,source,sourceSha256:hash(raw),sha256:hash(data),width:meta.width,height:meta.height,columns,rows,frames};
}
m.whiteCrest.motionPolicy={bodyFrames:40,weapon:'ONE_APPROVED_RIGID_RASTER_INTERPOLATED',ambientPhase:'CONTINUOUS_ACROSS_ACTIONS',neon:'ALPHA_CONTOUR_EVERY_POSE',cutIn:'FIRST_ULTIMATE_PER_BATTLE'};
await write('manifest.json',JSON.stringify(m,null,2)+'\n');
await write('white-crest-approval-20261019.json',JSON.stringify({userApproval:'좋다 그대로 대기자세랑 스킬,공격 모션까지 안끊기게 만들어',scope:'V3 concept selected for existing Leonel combat motion; continuous white FX and first-ultimate cut-in policy',originals,concept:{file:m.whiteCrest.approvedConcept,sha256:m.whiteCrest.approvedConceptSha256},motion:'Original 40 ImageGen body drawings repacked; original weapon raster separately registered; original composed frames preserved',newAssets:m.whiteCrest.sprites,visualReview:'Runtime PC/mobile review recorded separately; not inferred from tests'},null,2)+'\n');
console.log('Packed 40 approved body poses, 1 fixed sword, 2 transparent heraldic sprites and 12 white aura frames. Originals preserved.');
