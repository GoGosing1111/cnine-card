import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NURSE_SKILL} from './skill.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const prefix='preview/mercenary-nurse-healers-ss-v1/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const concepts=[
 {id:'diim-nurse',code:'V-051',name:'디임간호사',accent:'#bacda4',description:'검은 긴 머리와 올리브색 장식의 백색 간호복. 붕대를 준비하며 동료의 회복을 돕습니다.'},
 {id:'heeya-nurse',code:'V-052',name:'희야 간호사',accent:'#c4b3e4',description:'라벤더색 간호복과 치료 가방. 손끝에 치유의 빛을 모아 동료에게 전합니다.'},
 {id:'joeun-nurse',code:'V-053',name:'조은 간호사',accent:'#91b6eb',description:'푸른 청진기와 휴대 치료 코어. 차분하게 상태를 살피고 회복을 지원합니다.'},
 {id:'bongsun-nurse',code:'V-054',name:'봉순 간호사',accent:'#e4a798',description:'붉은 장식의 간호복과 약병, 치료 가방. 따뜻한 치유의 빛으로 동료를 돌봅니다.'}
];
async function readImage(file){
 const bytes=await fs.readFile(root+file),meta=await sharp(bytes).metadata();
 return {bytes,meta,sha256:hash(bytes)};
}
async function inspectAlpha(bytes){
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let clear=0,solid=0,edgeMax=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];
  if(a===0)clear++;if(a>=240)solid++;
  if(a>=128){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(x<2||y<2||x>=info.width-2||y>=info.height-2)edgeMax=Math.max(edgeMax,a);
 }
 let footMin=info.width,footMax=-1;
 // Include both boots despite their drawn perspective; do not anchor on only the lowest boot.
 for(let y=Math.max(0,maxY-Math.round(info.height*.1));y<=maxY;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=128){footMin=Math.min(footMin,x);footMax=Math.max(footMax,x);}
 return {width:info.width,height:info.height,clear:clear/(info.width*info.height),solid:solid/(info.width*info.height),edgeMax,bounds:[minX,minY,maxX+1,maxY+1],
  footAnchor:{x:(footMin+footMax+1)/2/info.width,y:(maxY+1)/info.height}};
}
const cards=[];
for(const c of concepts){
 const artFile='assets/'+c.id+'-source-art-v1.png',sdFile='assets/'+c.id+'-sd-v1.png';
 const art=await readImage(artFile),sd=await readImage(sdFile),alpha=await inspectAlpha(sd.bytes);
 assert.equal(art.meta.width*3,art.meta.height*2,'Source art must be exact 2:3');assert.ok(art.meta.width>=1024&&art.meta.height>=1536);assert.equal(art.meta.channels,3,'Native RGB source art required');
 assert.ok(sd.meta.hasAlpha);assert.ok(alpha.clear>.4&&alpha.solid>.2,'SD must have clear background and opaque body');assert.ok(alpha.edgeMax<=5,'SD touches the canvas boundary');
 const preview='assets/'+c.id+'-preview.webp';await sharp(art.bytes).resize({width:720,withoutEnlargement:true}).webp({quality:90,effort:5}).toFile(root+preview);
 cards.push({...c,rank:'SS',rankStatus:'USER_ASSIGNED_RANK',nameStatus:'USER_ASSIGNED_NAME',role:'HEALER',roleLabel:'힐러',roleStatus:'USER_ASSIGNED_ROLE',
  codeStatus:'REGISTERED_LIVE',runtimeEnabled:true,skillIds:[NURSE_SKILL.id],
  sourceArt:prefix+artFile,sourceArtSha256:art.sha256,sourceArtSize:[art.meta.width,art.meta.height],sourceArtStatus:'USER_SUPPLIED_SOURCE_ART',previewArt:prefix+preview,
  battleSprite:prefix+sdFile,battleSpriteSha256:sd.sha256,battleSpriteStatus:'TECH_QA_COMPLETE_USER_REQUESTED_LIVE',battleSpriteFootAnchor:alpha.footAnchor,battleSpriteInfo:alpha});
}
const source='assets/white-oath-sequence-v1.png',sheet=await readImage(source);
assert.ok(sheet.meta.hasAlpha&&sheet.meta.width===sheet.meta.height&&sheet.meta.width>=1024);
const cell=Math.ceil(sheet.meta.width/4),frames=[],tiles=[];
await fs.mkdir(root+'assets/skill/frames',{recursive:true});
for(let i=0;i<16;i++){
 const col=i%4,row=Math.floor(i/4),left=Math.round(col*sheet.meta.width/4),top=Math.round(row*sheet.meta.height/4);
 const width=Math.round((col+1)*sheet.meta.width/4)-left,height=Math.round((row+1)*sheet.meta.height/4)-top;
 const tile=await sharp(sheet.bytes).extract({left,top,width,height}).extend({top:0,left:0,right:cell-width,bottom:cell-height,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 const alpha=await inspectAlpha(tile);assert.ok(alpha.edgeMax<=5,'Skill material crosses native cell '+i);
 const webp=await sharp(tile).webp({lossless:true,effort:6}).toBuffer(),file='assets/skill/frames/'+String(i+1).padStart(2,'0')+'.webp';
 const decoded=await sharp(webp).raw().toBuffer();
 await fs.writeFile(root+file,webp);tiles.push({data:decoded,left:col*cell,top:row*cell});
 frames.push({index:i,file:prefix+file,sha256:hash(webp),sourceRawSha256:hash(await sharp(tile).raw().toBuffer()),rawSha256:hash(decoded),edgeMax:alpha.edgeMax,bounds:alpha.bounds,rect:{x:col*cell,y:row*cell,width:cell,height:cell}});
}
assert.equal(new Set(frames.map(f=>f.rawSha256)).size,16,'Repeated still frame');
// Copy native grid rows directly: alpha compositing would round low-alpha colors.
const packed=Buffer.alloc(cell*4*cell*4*4);
for(const tile of tiles)for(let y=0;y<cell;y++)tile.data.copy(packed,((tile.top+y)*cell*4+tile.left)*4,y*cell*4,(y+1)*cell*4);
const atlas=await sharp(packed,{raw:{width:cell*4,height:cell*4,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
await fs.writeFile(root+'assets/skill/atlas-v1.webp',atlas);
const manifest={format:'PROJECT_V_NURSE_HEALERS_RESOURCE_PACK_V1',version:1,date:'2026-09-27',status:'TECH_QA_COMPLETE_USER_REQUESTED_LIVE',runtimeEnabled:true,
 authorization:'간호사 4명 · SS 용병 힐러 · 원화/SD · 네 명에 동일 스킬 1종 제작',cards,
 skill:{...NURSE_SKILL,source:prefix+source,sourceSha256:sheet.sha256,sourceSize:[sheet.meta.width,sheet.meta.height],atlas:prefix+'assets/skill/atlas-v1.webp',atlasSha256:hash(atlas),cellSize:cell,frameCount:16,columns:4,rows:4,frames,
  approval:'USER_APPROVED_LIVE',assignment:{authority:'USER_REQUEST',cards:cards.map(c=>c.code)},audio:'SILENT_VISUAL_RESOURCE_PREVIEW'},
 renderer:{pixi:'8.20.0',gsap:'3.13.0',sharedEngine:'preview/project-v-v3/source/project-v-pixi-battle.src.js',implementation:prefix+'source/NurseHealFX.js',clock:'V3_REGISTERED_GSAP',layers:['EXISTING_V3_EFFECT_LAYER','EXISTING_V3_COMBAT_GROUND_LAYER'],automaticSpritePlayback:false},
 processing:'User-supplied source art and native generated SD/sequence PNG bytes preserved. SD alpha preserved. Exact grid extraction with <=1px transparent padding and lossless WebP atlas encoding. No synthetic intermediate frames.',
 balance:{healCoefficient:3.2,cooldown:4,cost:25,acquisition:"HYPER_PACK_SS"},liveCatalogChanged:true};
await fs.writeFile(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({cards:cards.map(c=>({name:c.name,rank:c.rank,alpha:c.battleSpriteInfo.clear,anchor:c.battleSpriteFootAnchor})),skills:1,frames:16,cell},null,2));
