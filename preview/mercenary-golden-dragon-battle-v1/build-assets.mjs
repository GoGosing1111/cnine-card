import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {components} from './inspect-sources.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),project=path.resolve(root,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const write=async(name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n');
const sourceArt='preview/mercenary-limited-golden-dragon-swordsman-20261012-v1/assets/golden-dragon-swordsman-sss-limited-source-art-v2-natural-hair.png';
const motionNames=['idle','dash','slash','cast','ultimate','hit','defeat'];
const effectNames=['aura','dashfx','blade','dragon','charge','eruption','impact'];
const landmarks={
 idle:{body:[496,496,499,496,496,496],footX:[274,785,1294,277,790,1291]},
 dash:{body:[446,446,446,446,446,445],footX:[380,825,1360,325,819,1290],exclude:[3]},
 slash:{body:[395,400,400,395,395,383],footX:[267,778,1280,285,800,1273]},
 cast:{body:[502,502,498,498,490,486],footX:[267,770,1280,305,792,1272]},
 ultimate:{body:[405,390,385,405,400,406],footX:[270,781,1292,270,815,1284]},
 hit:{body:[504,500,500,502,498,504],footX:[263,770,1270,291,785,1288],exclude:[5]},
 defeat:{body:[501,500,500,500,500,500],footX:[270,779,1300,267,790,1300]}
};
const manifest={version:1,date:'2026-10-12',conceptId:'golden-dragon-swordsman',name:'황금 용 검사',nameStatus:'DESCRIPTIVE_PREVIEW_LABEL_ONLY',rank:'SSS',edition:'LIMITED',code:'V-993',codeStatus:'PREVIEW_LOCAL_ONLY',runtimeEnabled:false,status:'USER_REVIEW_PENDING',sourceArt,sourceArtSha256:hash(await fs.readFile(path.join(project,sourceArt))),battleSpriteStatus:'TECH_QA_PENDING_USER_REVIEW',motion:{},effects:{},displaySizing:{fullBodyHeight:440,physicalBodyHeight:285},libraries:{pixi:'8.20.0',gsap:'3.13.0'},damageAuthority:'NONE_VISUAL_PREVIEW',generatedFrameCount:126};
await fs.mkdir(path.join(root,'assets/frames'),{recursive:true});
for(const key of motionNames){
 const file=path.join(root,'assets/sources',key+'.png'),sourceBytes=await fs.readFile(file),c=await components(file);
 const parts=c.parts.slice(0,6).sort((a,b)=>Math.floor(a.cy/(c.info.height/2))-Math.floor(b.cy/(c.info.height/2))||a.cx-b.cx);
 if(parts.length!==6)throw Error(key+' needs six complete components');
 const ids=new Set(parts.map(p=>p.id)),frames=[],composites=[],cell=768;
 for(let sourceIndex=0;sourceIndex<parts.length;sourceIndex++){
  if(landmarks[key].exclude?.includes(sourceIndex))continue;
  const part=parts[sourceIndex],left=Math.max(0,part.left-7),top=Math.max(0,part.top-7),right=Math.min(c.info.width-1,part.right+7),bottom=Math.min(c.info.height-1,part.bottom+7),width=right-left+1,height=bottom-top+1;
  const crop=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const p=(top+y)*c.info.width+left+x,id=c.labels[p],dest=(y*width+x)*4;
   if(ids.has(id)&&id!==part.id)continue;
   c.data.copy(crop,dest,p*4,p*4+4);
   if(!id){ // Exclude anti-aliased fringes from another complete figure, never key/remove a background.
    let foreign=false;
    for(let dy=-3;dy<=3&&!foreign;dy++)for(let dx=-3;dx<=3;dx++){const xx=left+x+dx,yy=top+y+dy;if(xx<0||yy<0||xx>=c.info.width||yy>=c.info.height)continue;const n=c.labels[yy*c.info.width+xx];if(ids.has(n)&&n!==part.id){foreign=true;break;}}
    if(foreign)crop[dest+3]=0;
   }
  }
  const foot=[landmarks[key].footX[sourceIndex],part.bottom],destLeft=Math.round(cell*.5-(foot[0]-left)),destTop=Math.round(660-(foot[1]-top));
  if(destLeft<0||destTop<0||destLeft+width>cell||destTop+height>cell)throw Error(key+' frame does not fit '+sourceIndex);
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:crop,raw:{width,height,channels:4},left:destLeft,top:destTop}]).png().toBuffer();
  const index=frames.length,framePath='assets/frames/'+key+'-'+String(index).padStart(2,'0')+'.png';await fs.writeFile(path.join(root,framePath),png);
  frames.push({index,sourceIndex,file:framePath,sha256:hash(png),footAnchor:{x:.5,y:660/cell},bodyPixels:landmarks[key].body[sourceIndex],sourceRect:{left,top,width,height},sourceFoot:foot,componentId:part.id});
  composites.push({input:png,left:index%3*cell,top:Math.floor(index/3)*cell});
 }
 const atlas='assets/atlases/'+key+'.png',packed=await sharp({create:{width:cell*3,height:cell*2,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();await fs.writeFile(path.join(root,atlas),packed);
 manifest.motion[key]={atlas,sha256:hash(packed),columns:3,rows:2,cellSize:cell,frameCount:frames.length,frames,source:{file:'assets/sources/'+key+'.png',sha256:hash(sourceBytes),hasNativeAlpha:true},excludedSourceFrames:landmarks[key].exclude||[]};
 console.log('motion',key,frames.length);
}
for(const key of effectNames){
 const file=path.join(root,'assets/sources',key+'.png'),buffer=await fs.readFile(file),meta=await sharp(buffer).metadata();
 if(!meta.hasAlpha||meta.width%4||meta.height%3)throw Error('Invalid native-alpha grid: '+key);
 const sw=meta.width/4,sh=meta.height/3,cell=512,frames=[],composites=[],c=await components(file),owners=new Map(),shared=new Set(),visibleBounds={left:cell,top:cell,right:0,bottom:0};
 for(const part of c.parts){if(part.right-part.left>sw*1.5||part.bottom-part.top>sh*1.5)shared.add(part.id);else owners.set(part.id,Math.min(2,Math.floor(part.cy/sh))*4+Math.min(3,Math.floor(part.cx/sw)));}
 for(let i=0;i<12;i++){
  const pixels=Buffer.alloc(cell*cell*4),cx=(i%4+.5)*sw,cy=(Math.floor(i/4)+.5)*sh;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
   const sx=Math.floor(cx-cell/2+x),sy=Math.floor(cy-cell/2+y);if(sx<0||sy<0||sx>=meta.width||sy>=meta.height)continue;
   const p=sy*meta.width+sx,id=c.labels[p],fallback=Math.floor(sy/sh)*4+Math.floor(sx/sw),owner=owners.has(id)?owners.get(id):fallback;
   if(owner!==i)continue;c.data.copy(pixels,(y*cell+x)*4,p*4,p*4+4);
  }
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(pixels[(y*cell+x)*4+3]>=16){visibleBounds.left=Math.min(visibleBounds.left,x);visibleBounds.top=Math.min(visibleBounds.top,y);visibleBounds.right=Math.max(visibleBounds.right,x+1);visibleBounds.bottom=Math.max(visibleBounds.bottom,y+1);}
  const png=await sharp(pixels,{raw:{width:cell,height:cell,channels:4}}).png().toBuffer();
  const framePath='assets/frames/'+key+'-'+String(i).padStart(2,'0')+'.png';await fs.writeFile(path.join(root,framePath),png);
  frames.push({index:i,file:framePath,sha256:hash(png),anchor:{x:.5,y:['charge','eruption'].includes(key)?(.9*sh+(cell-sh)/2)/cell:.5}});
  composites.push({input:png,left:i%4*cell,top:Math.floor(i/4)*cell});
 }
 const atlas='assets/atlases/'+key+'.png',png=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();await fs.writeFile(path.join(root,atlas),png);
 manifest.effects[key]={atlas,sha256:hash(png),cellSize:cell,columns:4,rows:3,frameCount:12,visibleBounds,frames,source:{file:'assets/sources/'+key+'.png',sha256:hash(buffer),hasNativeAlpha:true},sourceCell:{width:sw,height:sh}};
 console.log('effect',key,12);
}
manifest.battleSprite='preview/mercenary-golden-dragon-battle-v1/'+manifest.motion.idle.frames[0].file;
manifest.battleSpriteSha256=manifest.motion.idle.frames[0].sha256;
manifest.battleSpriteFootAnchor=manifest.motion.idle.frames[0].footAnchor;
manifest.battleSpriteInfo={width:768,height:768,hasAlpha:true};
manifest.bodyPixels=manifest.motion.idle.frames[0].bodyPixels;
manifest.counts={motion:Object.values(manifest.motion).reduce((n,s)=>n+s.frameCount,0),effects:84};
manifest.exclusions=[{motion:'dash',sourceIndex:3,reason:'Sword tip touches original sheet left border; retained in source, excluded from playback.'},{motion:'hit',sourceIndex:5,reason:'Final boot touches original sheet bottom border; playback restores existing idle instead.'}];
manifest.packaging='Native-alpha artwork only. Complete connected figures separated by actual pixel components rather than rigid grid cuts; neighboring figure pixels excluded; whole figures translated to a common foot anchor. No artwork repainting, keying, warping or body-part deformation. Effect components assigned to their logical frame with transparent padding; neighboring components excluded without removing native glow. Visible alpha envelopes are recorded for viewport-safe effect placement. Frame-specific natural standing body scale recorded separately from crouch height.';
const thumbs=[];
for(const key of effectNames)thumbs.push({input:await sharp(path.join(root,manifest.effects[key].frames[5].file)).resize(256,256).png().toBuffer(),left:thumbs.length%4*256,top:Math.floor(thumbs.length/4)*256});
await sharp({create:{width:1024,height:512,channels:4,background:'#111720'}}).composite(thumbs).png().toFile(path.join(root,'qa/effect-peaks.png'));
await sharp(path.join(project,sourceArt)).resize(640,960).webp({quality:90}).toFile(path.join(root,'assets/source-art-preview.webp'));
await write('landmarks.json',landmarks);
await write('manifest.json',manifest);
console.log(JSON.stringify(manifest.counts));
