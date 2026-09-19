import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {inspect} from './inspect-image.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const read=async name=>{const bytes=await fs.readFile(path.join(root,name));const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {bytes,data,info,record:{...await inspect(path.join(root,name)),sha256:hash(bytes)}};};
const store=async(name,bytes)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);return {file:name,sha256:hash(bytes)};};
function partition(image,count,rows){
 const {width:w,height:h}=image.info,labels=new Int32Array(w*h),components=[];let label=0;
 for(let n=0;n<w*h;n++){
  if(labels[n]||image.data[n*4+3]<48)continue;
  const stack=[n];labels[n]=++label;let pixels=0,x0=w,y0=h,x1=-1,y1=-1;
  while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!labels[q]&&image.data[q*4+3]>=48){labels[q]=label;stack.push(q);}
  }
  if(pixels>4000)components.push({label,pixels,x0,y0,x1,y1});
 }
 components.sort((a,b)=>(Math.round(a.y1/(h/rows))-Math.round(b.y1/(h/rows)))||a.x0-b.x0);
 if(components.length!==count)throw Error(`Expected ${count} distinct poses, found ${components.length}`);
 const big=new Map(components.map((c,i)=>[c.label,i+1])),owner=new Uint8Array(w*h),queue=new Int32Array(w*h);let end=0;
 for(let p=0;p<w*h;p++){const id=big.get(labels[p]);if(id){owner[p]=id;queue[end++]=p;}}
 for(let next=0;next<end;next++){
  const p=queue[next],x=p%w,y=Math.floor(p/w);
  for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!owner[q]&&image.data[q*4+3]>0){owner[q]=owner[p];queue[end++]=q;}
 }
 for(let p=0;p<w*h;p++)if(!owner[p]&&image.data[p*4+3]>0){
  const x=p%w,y=Math.floor(p/w);let best=Infinity,id=0;
  components.forEach((c,i)=>{const dx=Math.max(c.x0-x,0,x-c.x1),dy=Math.max(c.y0-y,0,y-c.y1),d=dx*dx+dy*dy;if(d<best){best=d;id=i+1;}});owner[p]=id;
 }
 return {components,owner};
}
const motionSpecs={
 dash:{count:8,columns:4,rows:2,feet:[[233,433],[677,432],[1133,432],[1575,431],[273,853],[732,852],[1181,852],[1569,856]],heads:[180,191,192,197,598,605,608,557],standingFrame:7},
 slash:{count:12,columns:4,rows:3,feet:[[151,369],[549,374],[887,374],[1230,374],[183,712],[545,712],[887,711],[1243,705],[181,1045],[512,1048],[902,1056],[1254,1063]],heads:[140,131,88,145,480,471,501,522,867,825,825,791],standingFrame:11},
 cast:{count:6,columns:3,rows:2,feet:[[285,516],[788,517],[1292,523],[289,992],[782,973],[1326,973]],heads:[216,207,247,687,688,667],standingFrame:0}
};
async function buildMotion(key,spec){
 const source=`assets/source/${key}-v1.png`,image=await read(source),{components,owner}=partition(image,spec.count,spec.rows);
 if(!image.record.hasAlpha||image.record.clear<.4)throw Error(`${key}: native alpha required`);
 const cell=768,tiles=[],frames=[];
 for(let i=0;i<spec.count;i++){
  const [footX,footY]=spec.feet[i],dx=Math.round(cell*.5-footX),dy=Math.round(cell*.90-footY),raw=Buffer.alloc(cell*cell*4);
  for(let p=0;p<owner.length;p++)if(owner[p]===i+1){const x=p%image.info.width+dx,y=Math.floor(p/image.info.width)+dy,a=image.data[p*4+3];
   if(x<8||y<8||x>=cell-8||y>=cell-8){if(a>=16)throw Error(`${key} frame ${i}: insufficient packing space`);continue;}
   image.data.copy(raw,(y*cell+x)*4,p*4,p*4+4);
  }
  const png=await sharp(raw,{raw:{width:cell,height:cell,channels:4}}).png().toBuffer();
  const entry=await store(`assets/frames/${key}/${String(i).padStart(2,'0')}.png`,png);
  frames.push({...entry,index:i,footAnchor:{x:.5,y:.90},sourceFeet:[footX,footY],sourceBounds:[components[i].x0,components[i].y0,components[i].x1,components[i].y1],headTop:spec.heads[i],bodyPixels:footY-spec.heads[i],registration:'AUTHORED_SHEET_FOOT_AND_HAIRLINE'});
  tiles.push({input:png,left:i%spec.columns*cell,top:Math.floor(i/spec.columns)*cell});
 }
 const atlas=await sharp({create:{width:cell*spec.columns,height:cell*spec.rows,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toBuffer();
 await store(`assets/${key}-atlas.webp`,atlas);
 return {source,sourceInfo:image.record,atlas:`assets/${key}-atlas.webp`,atlasSha256:hash(atlas),cellSize:cell,columns:spec.columns,rows:spec.rows,frameCount:spec.count,bodyPixels:frames[spec.standingFrame].bodyPixels,frames};
}
async function buildEffect(key,file,columns,rows,anchorKind,collisionFrame){
 const source=`assets/source/${file}`,image=await read(source),cell=512,frames=[],tiles=[];
 if(!image.record.hasAlpha||image.record.clear<.4||image.record.border>0)throw Error(`${key}: alpha/margin inspection failed`);
 for(let i=0;i<columns*rows;i++){
  const col=i%columns,row=Math.floor(i/columns),x=Math.round(col*image.info.width/columns),y=Math.round(row*image.info.height/rows),w=Math.round((col+1)*image.info.width/columns)-x,h=Math.round((row+1)*image.info.height/rows)-y;
  let anchorY=Math.round(h*.5);
  if(anchorKind==='ground'){
   let score=-1;for(let yy=Math.floor(h*.82);yy<Math.floor(h*.96);yy++){let n=0;for(let xx=Math.floor(w*.24);xx<Math.floor(w*.76);xx++){const p=((y+yy)*image.info.width+x+xx)*4;n+=(image.data[p]+image.data[p+1]+image.data[p+2])*image.data[p+3]/255;}if(n>score){score=n;anchorY=yy;}}
  }
  const tile=await sharp(image.bytes).extract({left:x,top:y,width:w,height:h}).png().toBuffer(),left=Math.floor((cell-w)/2),top=Math.floor((cell-h)/2);
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:tile,left,top}]).png().toBuffer();
  const entry=await store(`assets/frames/${key}/${String(i).padStart(2,'0')}.png`,png);
  frames.push({...entry,index:i,anchor:{x:(left+w*.5)/cell,y:(top+anchorY)/cell},sourceRect:[x,y,w,h]});
  tiles.push({input:png,left:col*cell,top:row*cell});
 }
 const atlas=await sharp({create:{width:cell*columns,height:cell*rows,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toBuffer();await store(`assets/${key}-atlas.webp`,atlas);
 return {source,sourceInfo:image.record,atlas:`assets/${key}-atlas.webp`,atlasSha256:hash(atlas),cellSize:cell,columns,rows,frameCount:columns*rows,collisionFrame,frames};
}
const source=await read('assets/source-art.png'),sd=await read('assets/ragniel-sd-v1.png');
if(source.record.sha256!=='B6EC66166A3AF153A9A6BAB827C0FE998E94855B16F67E0683BBFF4B0CCD0F89')throw Error('Selected source art changed');
if(!sd.record.hasAlpha||sd.record.clear<.45||sd.record.border)throw Error('Invalid SD alpha/margins');
await store('assets/source-art-preview.webp',await sharp(source.bytes).resize({width:640}).webp({quality:94}).toBuffer());
const motion={};for(const [key,spec]of Object.entries(motionSpecs))motion[key]=await buildMotion(key,spec);
motion.slash.contactRegistration={frame:6,sourcePoint:[1054,690],sourceFoot:motionSpecs.slash.feet[6],targetHeightFraction:.46};
const effects={slash:await buildEffect('slash-trail','slash-trail-v1.png',4,3,'center',4),judgment:await buildEffect('judgment','judgment-v2.png',4,4,'ground',5)};
const lock=JSON.parse(await fs.readFile(path.join(project,'package-lock.json'),'utf8'));
const audioRoot='preview/project-v-v3-event-fx-v1/',audioManifest=JSON.parse(await fs.readFile(path.join(project,audioRoot,'assets/audio/manifest.json'),'utf8'));
const audio={optional:true,defaultEnabled:false,sourceManifest:audioRoot+'assets/audio/manifest.json',license:audioManifest.license,licenseUrl:audioManifest.licenseUrl,proceduralSynthesis:false,runtimeSynthesis:false,assets:Object.fromEntries([['dash','dodge'],['slash','critical'],['ultimate','ultimate']].map(([key,id])=>{const a=audioManifest.assets[id];return [key,{file:audioRoot+a.src,sha256:a.sha256,sourceIds:a.sourceIds,syncPointMs:a.syncPointMs,design:a.design}];}))};
const manifest={version:1,name:'라그니엘',rank:'SSS',code:'V-046',codeStatus:'PREVIEW_LOCAL_IDENTIFIER',nameStatus:'USER_ASSIGNED_NAME',rankStatus:'USER_ASSIGNED_RANK',sourceArtStatus:'USER_SELECTED_DESIGN',battleSpriteStatus:'TECH_QA_PENDING_USER_REVIEW_PENDING',runtimeEnabled:false,
 sourceArt:'preview/mercenary-ragniel-v1/assets/source-art.png',sourceArtInfo:source.record,battleSprite:'preview/mercenary-ragniel-v1/assets/ragniel-sd-v1.png',battleSpriteInfo:sd.record,battleSpriteSha256:sd.record.sha256,battleSpriteFootAnchor:{x:.49,y:1234/1254},bodyPixels:964,battleSpriteFacing:'RIGHT',motion,effects,
 renderer:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,engine:'preview/project-v-v3/source/battle/BattleEngine.js',clockOwner:'V3_REGISTERED_GSAP',implementation:'source/RagnielSkillFX.js'},audio,
 processing:'Unmodified generated RGBA masters. Disconnected authored character poses partitioned by native alpha and packed without redrawing, recoloring, alpha replacement or invented interpolation frames. VFX cells extracted at original resolution and transparently padded.',
 generation:{mode:'BUILT_IN_IMAGEGEN',prompts:['sd-v1','dash-v1','slash-v1','cast-v1','judgment-v1','judgment-v2','slash-trail-v1'].map(x=>`prompts/${x}.txt`)},
 rejected:[{file:'assets/source/judgment-v1.png',reason:'Original atlas margins too narrow; corrected by ImageGen V2'}]};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({name:manifest.name,rank:manifest.rank,sd:sd.record,motion:Object.fromEntries(Object.entries(motion).map(([k,v])=>[k,{frames:v.frameCount,bodyPixels:v.bodyPixels,heads:v.frames.map(f=>f.headTop)}])),effects:Object.fromEntries(Object.entries(effects).map(([k,v])=>[k,{frames:v.frameCount,anchors:v.frames.map(f=>f.anchor.y)}])),renderer:manifest.renderer},null,2));
