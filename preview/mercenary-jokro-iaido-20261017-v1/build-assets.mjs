import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {components} from '../mercenary-golden-dragon-battle-v1/inspect-sources.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),project=path.resolve(root,'../..'),prefix='preview/mercenary-jokro-iaido-20261017-v1/';
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const write=(name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n');
const landmarks={
 idle:{source:'master-v4-facing-right',body:[1218],footX:[659],scale:.5},
 dash:{source:'dash-v2',body:[609,609,609,609],footX:[327,962,412,1002]},
 slash:{source:'slash-v2',body:[607,607,607,607],footX:[321,959,360,1009],exclude:[3],bladeTip:{sourceIndex:2,x:845,y:810}},
 cast:{source:'cast-v2',body:[610,610,610,610],footX:[320,958,362,1009]},
 ultimate:{source:'ultimate-v2',body:[607,607,607,607],footX:[326,955,352,993]},
 hit:{source:'hit-v2',body:[615,615,615,615],footX:[345,1047,355,984]},
 defeat:{source:'defeat-v2',body:[650,650,650,650],footX:[363,944,389,1070]}
};
const sourceArt=prefix+'assets/sources/jokro-source-art-approved-20261017.png';
const manifest={version:1,date:'2026-10-18',conceptId:'jokro-iaido',name:'족로',nameStatus:'USER_SPECIFIED',rank:'SSS',edition:'LIMITED',code:'V-992',codeStatus:'PREVIEW_LOCAL_ONLY',runtimeEnabled:false,status:'USER_REVIEW_PENDING',sourceArt,sourceArtSha256:hash(await fs.readFile(path.join(project,sourceArt))),sourceArtApproval:'USER_APPROVED',battleSpriteStatus:'PENDING_USER_VISUAL_REVIEW',motion:{},effects:{},displaySizing:{fullBodyHeight:440,physicalBodyHeight:285},libraries:{pixi:'8.20.0',gsap:'3.13.0'},damageAuthority:'NONE_VISUAL_PREVIEW',weaponPolicy:'One Japanese katana and one scabbard. Shallow continuous curve. No runtime bending or separate-part deformation. Ready pose uses the exact mirrored master.',masterSource:'assets/sources/master-v4-facing-right.png',masterSha256:'0C7B37275767E6FC428F3AE484C76B1D1BE7958CDF1E91E3F725A4C2A11DF48C'};
for(const dir of ['assets/frames','assets/atlases','assets/ui','qa'])await fs.mkdir(path.join(root,dir),{recursive:true});
for(const [key,lm]of Object.entries(landmarks)){
 const file=path.join(root,'assets/sources/'+lm.source+'.png'),sourceBytes=await fs.readFile(file),c=await components(file);
 if(key==='idle'&&hash(sourceBytes)!==manifest.masterSha256)throw Error('Locked master changed');
 const expected=key==='idle'?1:4,parts=c.parts.slice(0,expected).sort((a,b)=>Math.floor(a.cy/(c.info.height/2))-Math.floor(b.cy/(c.info.height/2))||a.cx-b.cx);
 if(parts.length!==expected)throw Error(key+' complete figure count');
 const ids=new Set(parts.map(p=>p.id)),frames=[],composites=[],cell=1024,columns=expected===1?1:2,rows=expected===1?1:2;
 for(let sourceIndex=0;sourceIndex<parts.length;sourceIndex++){
  if(lm.exclude?.includes(sourceIndex))continue;
  const part=parts[sourceIndex],left=Math.max(0,part.left-7),top=Math.max(0,part.top-7),right=Math.min(c.info.width-1,part.right+7),bottom=Math.min(c.info.height-1,part.bottom+7),width=right-left+1,height=bottom-top+1;
  const crop=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const p=(top+y)*c.info.width+left+x,id=c.labels[p],dest=(y*width+x)*4;
   if(ids.has(id)&&id!==part.id)continue;
   c.data.copy(crop,dest,p*4,p*4+4);
   if(!id){
    let foreign=false;
    for(let dy=-3;dy<=3&&!foreign;dy++)for(let dx=-3;dx<=3;dx++){const xx=left+x+dx,yy=top+y+dy;if(xx<0||yy<0||xx>=c.info.width||yy>=c.info.height)continue;const n=c.labels[yy*c.info.width+xx];if(ids.has(n)&&n!==part.id){foreign=true;break;}}
    if(foreign)crop[dest+3]=0;
   }
  }
  const scale=lm.scale||1,foot=[lm.footX[sourceIndex],part.bottom],outWidth=Math.round(width*scale),outHeight=Math.round(height*scale);
  const destLeft=Math.round(cell*.4-(foot[0]-left)*scale),destTop=Math.round(cell*.89-(foot[1]-top)*scale);
  if(destLeft<0||destTop<0||destLeft+outWidth>cell||destTop+outHeight>cell)throw Error(key+' frame does not fit '+sourceIndex);
  const sprite=await sharp(crop,{raw:{width,height,channels:4}}).resize(outWidth,outHeight,{fit:'fill'}).png().toBuffer();
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:sprite,left:destLeft,top:destTop}]).png().toBuffer();
  const index=frames.length,framePath='assets/frames/'+key+'-'+String(index).padStart(2,'0')+'.png';await fs.writeFile(path.join(root,framePath),png);
  frames.push({index,sourceIndex,file:framePath,sha256:hash(png),footAnchor:{x:.4,y:.89},bodyPixels:lm.body[sourceIndex]*scale,sourceRect:{left,top,width,height},sourceFoot:foot,uniformScale:scale,componentId:part.id});
  composites.push({input:png,left:index%columns*cell,top:Math.floor(index/columns)*cell});
 }
 const atlas='assets/atlases/'+key+'.png',packed=await sharp({create:{width:cell*columns,height:cell*rows,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();await fs.writeFile(path.join(root,atlas),packed);
 manifest.motion[key]={atlas,sha256:hash(packed),columns,rows,cellSize:cell,frameCount:frames.length,frames,source:{file:'assets/sources/'+lm.source+'.png',sha256:hash(sourceBytes),hasNativeAlpha:true},excludedSourceFrames:lm.exclude||[],...(lm.bladeTip?{bladeTip:lm.bladeTip}:{})};
 console.log('motion',key,frames.length);
}
const effectNames=['aura','dashfx','blade','dragon','charge','eruption','impact'];
for(const key of effectNames){
 const sourceFile=key==='eruption'?'eruption-v2.png':key+'.png';
 const file=path.join(root,'assets/sources/'+sourceFile),buffer=await fs.readFile(file),meta=await sharp(buffer).metadata();
 if(!meta.hasAlpha||meta.width%4||meta.height%3)throw Error('Invalid native-alpha grid: '+key);
 const sw=meta.width/4,sh=meta.height/3,cell=512,frames=[],composites=[],c=await components(file),owners=new Map(),visibleBounds={left:cell,top:cell,right:0,bottom:0};
 for(const part of c.parts)if(part.right-part.left<=sw*1.5&&part.bottom-part.top<=sh*1.5)owners.set(part.id,Math.min(2,Math.floor(part.cy/sh))*4+Math.min(3,Math.floor(part.cx/sw)));
 for(let i=0;i<12;i++){
  const pixels=Buffer.alloc(cell*cell*4),cx=(i%4+.5)*sw,cy=(Math.floor(i/4)+.5)*sh;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
   const sx=Math.floor(cx-cell/2+x),sy=Math.floor(cy-cell/2+y);if(sx<0||sy<0||sx>=meta.width||sy>=meta.height)continue;
   const p=sy*meta.width+sx,id=c.labels[p],fallback=Math.floor(sy/sh)*4+Math.floor(sx/sw),owner=owners.has(id)?owners.get(id):fallback;
   if(owner===i)c.data.copy(pixels,(y*cell+x)*4,p*4,p*4+4);
  }
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(pixels[(y*cell+x)*4+3]>=16){visibleBounds.left=Math.min(visibleBounds.left,x);visibleBounds.top=Math.min(visibleBounds.top,y);visibleBounds.right=Math.max(visibleBounds.right,x+1);visibleBounds.bottom=Math.max(visibleBounds.bottom,y+1);}
  const png=await sharp(pixels,{raw:{width:cell,height:cell,channels:4}}).png().toBuffer(),framePath='assets/frames/'+key+'-'+String(i).padStart(2,'0')+'.png';await fs.writeFile(path.join(root,framePath),png);
  frames.push({index:i,file:framePath,sha256:hash(png),anchor:{x:.5,y:['charge','eruption'].includes(key)?(.9*sh+(cell-sh)/2)/cell:.5}});
  composites.push({input:png,left:i%4*cell,top:Math.floor(i/4)*cell});
 }
 const atlas='assets/atlases/'+key+'.png',png=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer();await fs.writeFile(path.join(root,atlas),png);
 manifest.effects[key]={atlas,sha256:hash(png),cellSize:cell,columns:4,rows:3,frameCount:12,visibleBounds,frames,source:{file:'assets/sources/'+sourceFile,sha256:hash(buffer),hasNativeAlpha:true},sourceCell:{width:sw,height:sh}};
 console.log('effect',key,12);
}
manifest.battleSprite=prefix+manifest.motion.idle.frames[0].file;
manifest.battleSpriteSha256=manifest.motion.idle.frames[0].sha256;
manifest.battleSpriteFootAnchor=manifest.motion.idle.frames[0].footAnchor;
manifest.battleSpriteInfo={width:1024,height:1024,hasAlpha:true};
manifest.bodyPixels=manifest.motion.idle.frames[0].bodyPixels;
manifest.counts={motion:Object.values(manifest.motion).reduce((n,s)=>n+s.frameCount,0),effects:84};
manifest.exclusions=[{source:'assets/sources/idle-v1-weapon-shape-rejected.png',reason:'User rejected changing scabbard curvature. All six frames excluded; locked ready master used.'},{motion:'slash',sourceIndex:3,reason:'Scabbard direction and return grip inconsistent. Excluded; playback uses authored cut frames and restores locked ready pose.'}];
manifest.packaging='Native alpha preserved; complete figure components separated without rigid grid cropping. Only whole-image translation and uniform scale for fixed foot anchor. No weapon bending, warping, mesh deformation, or limb tweening. Standing physical height preserved across crouching frames. Idle is one locked master frame, not a claimed breathing animation. FX are seven authored twelve-frame sequences with transparent padding and recorded alpha envelopes.';
await sharp(path.join(project,sourceArt)).resize(640,960,{fit:'inside'}).webp({quality:90}).toFile(path.join(root,'assets/source-art-preview.webp'));
const ui=[];
for(const [source,out]of [['ui-frame.png','frame.webp'],['ui-button-v1.png','button.webp']]){
 const file=path.join(root,'assets/sources',source),bytes=await fs.readFile(file);let p=sharp(bytes);
 if(source.startsWith('ui-button'))p=p.trim();
 const result=await p.webp({lossless:true}).toBuffer();await fs.writeFile(path.join(root,'assets/ui',out),result);
 ui.push({source:'assets/sources/'+source,sourceSha256:hash(bytes),file:'assets/ui/'+out,sha256:hash(result),processing:source.startsWith('ui-button')?'Transparent outer padding trim and lossless encoding only':'Lossless encoding only'});
}
manifest.ui=ui;
manifest.rankStatus='SSS_LIMITED_QUALITY_TARGET_PREVIEW_ONLY';
manifest.prompts=(await fs.readdir(path.join(root,'prompts'))).filter(f=>f.endsWith('.json')).map(f=>'prompts/'+f);
manifest.exclusions.push({source:'assets/sources/eruption.png',reason:'Original VFX has cropped silhouettes; replaced with complete padded eruption-v2 source.'});
const thumbs=[];
for(const key of effectNames)thumbs.push({input:await sharp(path.join(root,manifest.effects[key].frames[5].file)).resize(256,256).png().toBuffer(),left:thumbs.length%4*256,top:Math.floor(thumbs.length/4)*256});
await sharp({create:{width:1024,height:512,channels:4,background:'#0c1715'}}).composite(thumbs).png().toFile(path.join(root,'qa/effect-peaks.png'));
const motionThumbs=[];
for(const spec of Object.values(manifest.motion))for(const f of spec.frames){const n=motionThumbs.length;motionThumbs.push({input:await sharp(path.join(root,f.file)).resize(256,256).png().toBuffer(),left:n%6*256,top:Math.floor(n/6)*256});}
await sharp({create:{width:1536,height:1024,channels:4,background:'#17211f'}}).composite(motionThumbs).png().toFile(path.join(root,'qa/motion-contact-sheet.png'));
await write('landmarks.json',landmarks);await write('manifest.json',manifest);console.log(JSON.stringify(manifest.counts));
