// Only Zeus assets are exported; previous approved ICON art and FX are preserved.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {ICON_CARD_ROSTER} from '../shared/icon-card-roster-v1.mjs';
const root=new URL('../',import.meta.url),base=new URL('preview/icon-battle-assets-v1/',root);
const input=JSON.parse(await fs.readFile(new URL('generation-zeus-cheolgu-20261010.json',base),'utf8'));
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',base),'utf8'));
const card=ICON_CARD_ROSTER.find(c=>c.code==='ICON-ZEUS-CHEOLGU');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const save=async(path,bytes)=>{const url=new URL(path,base);await fs.mkdir(new URL('.',url),{recursive:true});await fs.writeFile(url,bytes);};
function inspect(data,width,height){
 let edgeMax=0,nonempty=0,partial=0,alphaTotal=0,minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=data[(y*width+x)*4+3];alphaTotal+=a;if(a>0)nonempty++;if(a>0&&a<255)partial++;
  if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(x===0||y===0||x===width-1||y===height-1)edgeMax=Math.max(edgeMax,a);
 }
 return {edgeMax,nonempty,partial,alphaTotal,transparentFraction:1-nonempty/(width*height),bounds:[minX,minY,maxX+1,maxY+1]};
}
async function measure(bytes){const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return inspect(data,info.width,info.height);}
for(const [path,sha] of [[card.sourceArt,card.sourceSha256],[card.originalArt,card.originalSha256]])if(hash(await fs.readFile(new URL(path,root)))!==sha)throw Error('Portrait source changed: '+path);
const bytes=await fs.readFile(new URL(input.sd.source,base)),meta=await sharp(bytes).metadata(),sourceAlpha=await measure(bytes);
if(!meta.hasAlpha||meta.width<1024||sourceAlpha.transparentFraction<.1||sourceAlpha.edgeMax>12)throw Error('Invalid transparent SD');
const rendered=await sharp(bytes).resize(672,672,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer();
const runtime='assets/sd/zeus-cheolgu-sd-v1-20261010.webp';await save(runtime,rendered);
const sd={id:'zeus-cheolgu',name:card.name,source:input.sd.source,sourceSha256:hash(bytes),sourceSize:[meta.width,meta.height],sourceAlpha,generation:'BUILT_IN_IMAGEGEN',visualApproval:'CREATED_FOR_USER_REQUEST_20261010',
 code:card.code,sourceArt:card.sourceArt,sourceArtSha256:card.sourceSha256,portraitApproval:card.portraitApproval,weapon:'황금 번개 지팡이',accent:'#f7d077',runtime,runtimeSha256:hash(rendered),runtimeBytes:rendered.length,size:[768,768],
 // Midpoint of the two sandal ground contacts in the full 1024x1536 source.
 footAnchor:{x:(160+470*672/1536)/768,y:(48+1497*672/1536)/768},runtimeAlpha:await measure(rendered),hitEffect:'zeus-cheolgu-hit',skillEffect:'zeus-cheolgu-skill',releaseEnabled:false};
const upsert=(rows,value)=>{const i=rows.findIndex(x=>x.id===value.id);if(i<0)rows.push(value);else rows[i]=value;};upsert(manifest.characters,sd);
for(const row of input.effects){
 const source=await fs.readFile(new URL(row.source,base)),m=await sharp(source).metadata(),sourceAlpha=await measure(source);
 if(!m.hasAlpha||m.width!==m.height||m.width<1024||sourceAlpha.transparentFraction<.1)throw Error('Invalid transparent effect: '+row.id);
 const frames=[],cellSize=384,atlasPixels=Buffer.alloc(1536*1536*4);
 for(let i=0;i<16;i++){
  const col=i%4,line=Math.floor(i/4),left=Math.round(col*m.width/4),top=Math.round(line*m.height/4),width=Math.round((col+1)*m.width/4)-left,height=Math.round((line+1)*m.height/4)-top;
  const extracted=await sharp(source).extract({left,top,width,height}).png().toBuffer(),pixels=await sharp(extracted).ensureAlpha().raw().toBuffer(),qa=inspect(pixels,width,height);
  if(qa.edgeMax>12||!qa.nonempty)throw Error(row.id+' frame '+i+' violates boundary/alpha: '+qa.edgeMax);
  const px=Math.floor((cellSize-width)/2),py=Math.floor((cellSize-height)/2);
  const frame=await sharp(extracted).extend({left:px,top:py,right:cellSize-width-px,bottom:cellSize-height-py,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer();
  const file='assets/fx/'+row.id+'/frames/'+String(i).padStart(2,'0')+'.webp';await save(file,frame);
  const decoded=await sharp(frame).ensureAlpha().raw().toBuffer();for(let y=0;y<cellSize;y++)decoded.copy(atlasPixels,((line*cellSize+y)*1536+col*cellSize)*4,y*cellSize*4,(y+1)*cellSize*4);
  frames.push({index:i,file,sha256:hash(frame),rawSha256:hash(pixels),sourceRect:{left,top,width,height},...qa});
 }
 if(new Set(frames.map(f=>f.rawSha256)).size!==16)throw Error('Repeated effect frame');
 const atlas=await sharp(atlasPixels,{raw:{width:1536,height:1536,channels:4}}).webp({lossless:true,effort:6}).toBuffer(),runtime='assets/fx/'+row.id+'/atlas-v1.webp';await save(runtime,atlas);
 upsert(manifest.effects,{id:row.id,name:row.name,source:row.source,sourceSha256:hash(source),sourceSize:[m.width,m.height],sourceAlpha,generation:'BUILT_IN_IMAGEGEN',visualApproval:'CREATED_FOR_USER_REQUEST_20261010',kind:row.id.endsWith('-hit')?'HIT':'SKILL',runtime,runtimeSha256:hash(atlas),runtimeBytes:atlas.length,columns:4,rows:4,cellSize,frameCount:16,duration:row.duration,collisionFrame:row.collisionFrame,contactAt:row.duration*row.collisionFrame/15,boundaryAlphaLimit:12,frames,releaseEnabled:false});
}
manifest.frameCount=manifest.effects.reduce((sum,e)=>sum+e.frameCount,0);
await save('manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({cardId:'CN-1C000008',portrait:[card.sourceWidth,card.sourceHeight],sd:sd.sourceSize,sdAlpha:sd.runtimeAlpha,frames:32}));

