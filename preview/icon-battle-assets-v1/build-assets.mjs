import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {ICON_CARD_ROSTER} from '../../shared/icon-card-roster-v1.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const input=JSON.parse(await fs.readFile(path.join(root,'generation-inputs.json'),'utf8'));
const additions=JSON.parse(await fs.readFile(path.join(root,'generation-inputs-20260927.json'),'utf8'));
input.assets.push(...additions.assets);
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
const save=async(relative,bytes)=>{const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes)};
const anchors={diim:{x:.55,y:.963},'hi-heeya':{x:.445,y:.956},'namuneul-bongsoon':{x:.54,y:.968},'oh-joeun':{x:.518,y:.955}};
const weapons={diim:'청록 쌍검','hi-heeya':'중기관총','namuneul-bongsoon':'비취 장궁','oh-joeun':'음파 지팡이'};
const accents={diim:'#75e4e0','hi-heeya':'#ffae60','namuneul-bongsoon':'#d9e9b7','oh-joeun':'#aaa8ff'};
Object.assign(anchors,{orikkung:{x:.5,y:.976},kangguyeol:{x:.51,y:.952},ayoon:{x:.598,y:.965}});
Object.assign(weapons,{orikkung:'백화 부채',kangguyeol:'청동 충격 건틀릿',ayoon:'백금 군도'});
Object.assign(accents,{orikkung:'#f2c8bc',kangguyeol:'#e6a771',ayoon:'#a5deed'});
// A card-photo replacement must not regenerate or re-encode approved SD/FX.
if(process.argv.includes('--sync-portraits')){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  for(const character of manifest.characters){
    const card=ICON_CARD_ROSTER.find(c=>c.code===character.code);
    if(!card||hash(await fs.readFile(path.join(root,'../..',card.sourceArt)))!==card.sourceSha256)throw Error(`Invalid portrait: ${character.code}`);
    character.sourceArt=card.sourceArt;character.sourceArtSha256=card.sourceSha256;character.portraitApproval=card.portraitApproval;
  }
  await save('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  console.log('Portrait metadata synchronized. SD, FX and generation inputs untouched.');
  process.exit(0);
}
const previous=process.argv.includes('--new-only')?JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')):null;
const characters=previous?.characters||[],effects=previous?.effects||[];
// Native generated glow may retain <= 4.7% alpha at a handful of boundary
// pixels. Preserve those pixels; reject visible material or a background veil.
const boundaryAlphaLimit=12;
function inspect(data,width,height){
  let edgeMax=0,nonempty=0,partial=0,alphaTotal=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const a=data[(y*width+x)*4+3];alphaTotal+=a;
    if(a>0)nonempty++;if(a>0&&a<255)partial++;
    if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
    if(x===0||y===0||x===width-1||y===height-1)edgeMax=Math.max(edgeMax,a);
  }
  return {edgeMax,nonempty,partial,alphaTotal,transparentFraction:1-nonempty/(width*height),bounds:maxX<0?null:[minX,minY,maxX+1,maxY+1]};
}
for(const row of input.assets){
  if(previous&&[...characters,...effects].some(record=>record.id===row.id))continue;
  const source=await fs.readFile(path.join(root,row.source)),meta=await sharp(source).metadata();
  if(!meta.hasAlpha||meta.width!==meta.height||meta.width<1024)throw Error(`${row.id}: square true-alpha PNG required`);
  const raw=await sharp(source).ensureAlpha().raw().toBuffer();
  const info=inspect(raw,meta.width,meta.height);
  const record={id:row.id,name:row.name,source:row.source,sourceSha256:hash(source),sourceSize:[meta.width,meta.height],sourceAlpha:info,generation:'BUILT_IN_IMAGEGEN',visualApproval:'USER_REVIEW_PENDING'};
  if(row.kind==='SD'){
    if(info.transparentFraction<.1)throw Error(`${row.id}: background is not transparent`);
    // Uniform downsampling and transparent padding only. The original is never overwritten.
    const rendered=await sharp(source).resize(672,672,{fit:'contain'}).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer();
    const runtime=`assets/sd/${row.id}-sd-v1.webp`;await save(runtime,rendered);
    const foot=anchors[row.id],card=ICON_CARD_ROSTER.find(c=>c.name===row.name);
    const pixels=await sharp(rendered).raw().toBuffer();
    characters.push({...record,code:card.code,sourceArt:card.sourceArt,sourceArtSha256:card.sourceSha256,
      portraitApproval:card.portraitApproval,weapon:weapons[row.id],accent:accents[row.id],
      runtime,runtimeSha256:hash(rendered),runtimeBytes:rendered.length,size:[768,768],
      footAnchor:{x:(48+672*foot.x)/768,y:(48+672*foot.y)/768},runtimeAlpha:inspect(pixels,768,768),
      hitEffect:`${row.id}-hit`,skillEffect:`${row.id}-skill`,releaseEnabled:false});
    console.log(`${row.id}: SD alpha + original photo preserved (${rendered.length} bytes)`);
    continue;
  }
  const frames=[],cellSize=384,atlasPixels=Buffer.alloc(1536*1536*4);
  if(info.transparentFraction<.1)throw Error(`${row.id}: transparent background is incomplete`);
  for(let i=0;i<16;i++){
    const col=i%4,line=Math.floor(i/4),left=Math.round(col*meta.width/4),top=Math.round(line*meta.height/4);
    const width=Math.round((col+1)*meta.width/4)-left,height=Math.round((line+1)*meta.height/4)-top;
    if(width>cellSize||height>cellSize)throw Error(`${row.id}: cell exceeds native runtime size`);
    const extracted=await sharp(source).extract({left,top,width,height}).png().toBuffer();
    const extractedRaw=await sharp(extracted).raw().toBuffer(),qa=inspect(extractedRaw,width,height);
    if(qa.edgeMax>boundaryAlphaLimit)throw Error(`${row.id} frame ${i}: visible material crosses cell boundary (${qa.edgeMax})`);
    if(qa.nonempty===0&&i!==15)throw Error(`${row.id} frame ${i}: empty frame`);
    const px=Math.floor((cellSize-width)/2),py=Math.floor((cellSize-height)/2);
    const tile=await sharp(extracted).extend({left:px,top:py,right:cellSize-width-px,bottom:cellSize-height-py,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    const frame=await sharp(tile).webp({lossless:true,effort:6}).toBuffer(),file=`assets/fx/${row.id}/frames/${String(i).padStart(2,'0')}.webp`;
    await save(file,frame);
    // Raw copy avoids alpha premultiplication/rounding from compositing onto
    // an empty canvas. Atlas and standalone frame must decode identically.
    const decoded=await sharp(frame).ensureAlpha().raw().toBuffer();
    for(let y=0;y<cellSize;y++)decoded.copy(atlasPixels,((line*cellSize+y)*1536+col*cellSize)*4,y*cellSize*4,(y+1)*cellSize*4);
    frames.push({index:i,file,sha256:hash(frame),rawSha256:hash(extractedRaw),sourceRect:{left,top,width,height},...qa});
  }
  if(new Set(frames.map(f=>f.rawSha256)).size!==16)throw Error(`${row.id}: duplicate animation frame`);
  const atlas=await sharp(atlasPixels,{raw:{width:1536,height:1536,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
  const runtime=`assets/fx/${row.id}/atlas-v1.webp`;await save(runtime,atlas);
  effects.push({...record,kind:row.id.endsWith('-hit')?'HIT':row.id.endsWith('-skill')?'SKILL':'UNIQUE',
    runtime,runtimeSha256:hash(atlas),runtimeBytes:atlas.length,columns:4,rows:4,cellSize,frameCount:16,
    duration:row.duration,collisionFrame:row.collisionFrame,contactAt:row.duration*row.collisionFrame/15,
    boundaryAlphaLimit,frames,releaseEnabled:false});
  console.log(`${row.id}: 16 unique native frames / clean boundaries (${atlas.length} bytes)`);
}
const lock=JSON.parse(await fs.readFile(path.join(root,'../../package-lock.json'),'utf8'));
const manifest={id:'ICON_BATTLE_ASSETS_V1',date:'2026-09-27',status:'RESOURCE_BUILD_COMPLETE_USER_REVIEW_PENDING',
  releaseEnabled:false,acquisitionEnabled:false,damageCalculation:false,audio:'NONE',
  generation:input.mode,characters,effects,frameCount:effects.reduce((n,e)=>n+e.frameCount,0),
  renderer:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,
    engine:'preview/project-v-v3/source/battle/BattleEngine.js',layer:'EXISTING_V3_EFFECT_LAYER',
    playback:'preview/icon-battle-assets-v1/source/IconEffectPlayback.js',clock:'REGISTERED_GSAP_TIMELINE',autoAnimationTicker:false},
  processing:'Original PNG bytes retained. SD uniformly resized and padded. VFX native frames extracted and padded, lossless WebP only. No generated intermediate frames, tint reuse, alpha replacement or chroma key.'};
await save('manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`${characters.length} SD, ${effects.length} FX, ${manifest.frameCount} frames`);
