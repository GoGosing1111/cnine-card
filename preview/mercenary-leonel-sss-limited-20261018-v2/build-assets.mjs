// Reproducible technical registration/packing only. Artwork is produced by built-in ImageGen.
// Weapon pixels are selected from one source, never repainted or deformed per pose.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {createRequire} from 'node:module';
import {LEONEL_COMBAT,LEONEL_AREA_SKILL} from './combat-profile.mjs';
const require=createRequire(import.meta.url);
let sharp;try{sharp=require('sharp');}catch{sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');}

const root = fileURLToPath(new URL('.', import.meta.url));
const file = p => path.join(root, p);
const hash = b => createHash('sha256').update(b).digest('hex');
const json = async p => JSON.parse(await fs.readFile(file(p), 'utf8'));
const writeJSON = async (p, data) => fs.writeFile(file(p), JSON.stringify(data, null, 2) + '\n');
const cfg = await json('asset-registration.json');
const cell = cfg.cellSize;
const ref = cfg.referenceHeight;
const columns = cfg.atlasColumns || 4;
const onlyWeapon = process.argv.includes('--weapon-only');
const partial = process.argv.includes('--partial');
await Promise.all(['assets/locked', 'assets/frames', 'assets/atlases', 'assets/thumbs', 'assets/body-frames', 'qa'].map(p => fs.mkdir(file(p), {recursive:true})));

function inside(x, y, poly) {
  let yes = false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i], b=poly[j];
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
  }
  return yes;
}
function alphaBounds(data, width, height, threshold=0) {
  let l=width,t=height,r=-1,b=-1,count=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(data[(y*width+x)*4+3]>threshold) {
    l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);count++;
  }
  if(r<l) throw new Error('Empty alpha frame');
  return {left:l,top:t,width:r-l+1,height:b-t+1,pixels:count};
}
function asPoint(p) { return {x:p[0],y:p[1]}; }
const weapon = cfg.weapon;
if (!weapon.rect || !weapon.grip || !weapon.tip || !weapon.standingHeight || !weapon.polygons.length) throw new Error('Weapon registration is incomplete');
const source = await fs.readFile(file(weapon.source));
if(hash(source)!==weapon.sourceSha256) throw new Error('Weapon source hash mismatch');
const raw = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const wr = weapon.rect;
const selected = Buffer.alloc(wr.width*wr.height*4);
let copiedPixels=0;
for(let y=0;y<wr.height;y++)for(let x=0;x<wr.width;x++){
  const sx=x+wr.left,sy=y+wr.top;
  if(!weapon.polygons.some(p=>inside(sx+.5,sy+.5,p)))continue;
  if(weapon.excludePolygons?.some(p=>inside(sx+.5,sy+.5,p)))continue;
  const src=(sy*raw.info.width+sx)*4,dst=(y*wr.width+x)*4;
  raw.data.copy(selected,dst,src,src+4);if(selected[dst+3])copiedPixels++;
}
const blade = await sharp(selected,{raw:{width:wr.width,height:wr.height,channels:4}}).png().toBuffer();
await fs.writeFile(file('assets/locked/leonel-sword.png'),blade);
const localPoint=p=>({x:p[0]-wr.left,y:p[1]-wr.top});
const lock={source:weapon.source,sourceSha256:weapon.sourceSha256,rect:wr,polygons:weapon.polygons,excludePolygons:weapon.excludePolygons||[],width:wr.width,height:wr.height,grip:localPoint(weapon.grip),bladeStart:localPoint(weapon.bladeStart||weapon.grip),tip:localPoint(weapon.tip),standingHeight:weapon.standingHeight,sha256:hash(blade),copiedPixels,operation:'ORIGINAL_PIXEL_SELECTION_ONLY',redrawnPixels:0,transformsAllowed:['uniformScale','rotation','translation'],url:'assets/locked/leonel-sword.png'};
await writeJSON('assets/locked/weapon-provenance.json',lock);
if(onlyWeapon){console.log(JSON.stringify(lock));process.exit(0);}

const sourceArtBytes=await fs.readFile(file(cfg.sourceArt));
if(hash(sourceArtBytes)!==cfg.sourceArtSha256)throw new Error('Source art hash mismatch');
const manifest={version:'LEONEL_SSS_LIMITED_20261018_V1',name:'레오넬',title:'백은의 서약',rarity:'SSS',limited:true,status:'USER_REVIEW_PENDING',runtimeEnabled:false,runtimeRegistration:false,deployed:false,sourceArt:'/'+path.relative(path.resolve(root,'../..'),file(cfg.sourceArt)).replaceAll('\\','/'),sourceArtSha256:cfg.sourceArtSha256,sourceArtLocal:cfg.sourceArt,weapon:lock,motion:{},effects:{},displaySizing:{physicalBodyHeight:333,fullBodyHeight:333},runtime:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',clock:'V3_REGISTERED_GSAP',pixi:'8.20.0',gsap:'3.13.0'},audio:{enabled:false}};
const assetStats=[];
const factor=ref/weapon.standingHeight;
const sw=Math.max(1,Math.round(wr.width*factor)),sh=Math.max(1,Math.round(wr.height*factor));
const swordScaled=await sharp(blade).resize(sw,sh,{fit:'fill'}).png().toBuffer();
const originalAngle=Math.atan2(lock.tip.y-lock.grip.y,lock.tip.x-lock.grip.x)*180/Math.PI;
for(const[group,sheets]of Object.entries(cfg.motions)){
  if(!sheets.length){if(partial)continue;throw new Error(group+': no registered sheets');}
  const frames=[];
  for(const sheet of sheets){
    const bytes=await fs.readFile(file(sheet.source));
    if(sheet.sha256&&hash(bytes)!==sheet.sha256)throw new Error(sheet.source+': hash mismatch');
    const img=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if(sheet.poses.length!==4)throw new Error(sheet.source+': expected four pose records');
    const bodyScale=ref/sheet.standingHeight;
    for(let i=0;i<4;i++){
      const pose=sheet.poses[i],cx=i%2,cy=Math.floor(i/2);
      const region=pose.rect||{left:Math.round(cx*img.info.width/2),top:Math.round(cy*img.info.height/2),width:Math.round((cx+1)*img.info.width/2)-Math.round(cx*img.info.width/2),height:Math.round((cy+1)*img.info.height/2)-Math.round(cy*img.info.height/2)};
      const crop=await sharp(bytes).extract(region).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if(pose.excludePolygons)for(let y=0;y<crop.info.height;y++)for(let x=0;x<crop.info.width;x++)if(pose.excludePolygons.some(p=>inside(x+region.left+.5,y+region.top+.5,p)))crop.data[(y*crop.info.width+x)*4+3]=0;
      const bounds=alphaBounds(crop.data,crop.info.width,crop.info.height,0);
      const bodyRaw=await sharp(crop.data,{raw:crop.info}).extract({left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}).png().toBuffer();
      const bw=Math.max(1,Math.round(bounds.width*bodyScale)),bh=Math.max(1,Math.round(bounds.height*bodyScale));
      const body=await sharp(bodyRaw).resize(bw,bh,{fit:'fill'}).png().toBuffer();
      const boxLeft=region.left+bounds.left,boxTop=region.top+bounds.top;
      const foot={x:(pose.foot[0]-boxLeft)*bodyScale,y:(pose.foot[1]-boxTop)*bodyScale};
      const grip={x:(pose.grip[0]-pose.foot[0])*bodyScale,y:(pose.grip[1]-pose.foot[1])*bodyScale};
      const rotation=pose.angle-originalAngle,theta=rotation*Math.PI/180;
      const rotated=await sharp(swordScaled).rotate(rotation,{background:'#00000000'}).png().toBuffer();
      const rm=await sharp(rotated).metadata();
      const trans=p=>{const x=p.x*factor-sw/2,y=p.y*factor-sh/2;return{x:rm.width/2+x*Math.cos(theta)-y*Math.sin(theta),y:rm.height/2+x*Math.sin(theta)+y*Math.cos(theta)};};
      const rg=trans(lock.grip),rt=trans(lock.tip),rs=trans(lock.bladeStart),origin={x:1000,y:1200};
      const left=Math.round(origin.x+grip.x-rg.x),top=Math.round(origin.y+grip.y-rg.y);
      const bodyPlacement={input:body,left:Math.round(origin.x-foot.x),top:Math.round(origin.y-foot.y)};
      const swordPlacement={input:rotated,left,top};
      const full=await sharp({create:{width:2200,height:2200,channels:4,background:'#00000000'}}).composite(pose.weaponInFront?[bodyPlacement,swordPlacement]:[swordPlacement,bodyPlacement]).png().toBuffer();
      const packed=await sharp(full).trim({threshold:0}).png().toBuffer({resolveWithObject:true});
      if(packed.info.width>cell-24||packed.info.height>cell-24)throw new Error(group+' '+i+': combined silhouette clips fixed canvas '+packed.info.width+'x'+packed.info.height);
      const px=Math.floor((cell-packed.info.width)/2),py=Math.floor((cell-packed.info.height)/2);
      const trimLeft=-packed.info.trimOffsetLeft,trimTop=-packed.info.trimOffsetTop;
      const frame=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:packed.data,left:px,top:py}]).png().toBuffer();
      const point=p=>({x:px+p.x-trimLeft,y:py+p.y-trimTop});
      const index=frames.length,id=group+'-'+String(index+1).padStart(2,'0');
      const entry={id,index,pivot:point(origin),grip:point({x:origin.x+grip.x,y:origin.y+grip.y}),bladeStart:point({x:left+rs.x,y:top+rs.y}),tip:point({x:left+rt.x,y:top+rt.y}),referenceHeight:ref,bodyPixels:ref,file:'assets/frames/'+id+'.png',bodyFile:'assets/body-frames/'+id+'.png',source:sheet.source,sourceSha256:hash(bytes),region,alphaBounds:bounds,sourceFoot:pose.foot,sourceGrip:pose.grip,sourceStandingHeight:sheet.standingHeight,bodyScale,airborne:Boolean(pose.airborne),weapon:{sourceSha256:lock.sha256,rotationDegrees:rotation,angleDegrees:pose.angle,uniformScale:factor,redrawnPixels:0,inFront:Boolean(pose.weaponInFront)},sha256:hash(frame)};
      await fs.writeFile(file(entry.file),frame);await fs.writeFile(file(entry.bodyFile),bodyRaw);
      await sharp(frame).resize(240,240).png().toFile(file('assets/thumbs/'+id+'.png'));
      frames.push({entry,bytes:frame});assetStats.push({id,sourceAlphaPixels:bounds.pixels,sha256:entry.sha256});
    }
  }
  const rows=Math.ceil(frames.length/columns);
  const atlas=await sharp({create:{width:cell*columns,height:cell*rows,channels:4,background:'#00000000'}}).composite(frames.map((f,i)=>({input:f.bytes,left:i%columns*cell,top:Math.floor(i/columns)*cell}))).png().toBuffer();
  const pages=[];
  for(let start=0;start<frames.length;start+=9){
    const pageFrames=frames.slice(start,start+9),pageIndex=pages.length,pageRows=Math.ceil(pageFrames.length/columns);
    const data=await sharp({create:{width:cell*columns,height:cell*pageRows,channels:4,background:'#00000000'}}).composite(pageFrames.map((f,i)=>({input:f.bytes,left:i%columns*cell,top:Math.floor(i/columns)*cell}))).png().toBuffer();
    const url='assets/atlases/'+group+(pageIndex?'-page'+(pageIndex+1):'')+'.png';await fs.writeFile(file(url),data);
    for(let i=0;i<pageFrames.length;i++){pageFrames[i].entry.page=pageIndex;pageFrames[i].entry.rect={x:i%columns*cell,y:Math.floor(i/columns)*cell,width:cell,height:cell};}
    pages.push({url,sha256:hash(data),width:cell*columns,height:cell*pageRows,frames:pageFrames.length});
  }
  manifest.motion[group]={url:pages[0].url,columns,rows:Math.min(rows,3),frameWidth:cell,frameHeight:cell,referenceHeight:ref,bodyPixels:ref,sha256:pages[0].sha256,pages,frames:frames.map(f=>f.entry)};
  await sharp(atlas).resize(columns*400,rows*400).png().toFile(file('qa/contact-'+group+'.png'));
  // Registration overlay is a technical QA artifact, never a displayed game resource.
  const marks=frames.map(({entry:f},i)=>{const ox=i%columns*cell,oy=Math.floor(i/columns)*cell;return `<g transform="translate(${ox},${oy})"><text x="20" y="38" fill="white" font-size="28">${f.id}</text><line x1="${f.bladeStart.x}" y1="${f.bladeStart.y}" x2="${f.tip.x}" y2="${f.tip.y}" stroke="#20cfff" stroke-width="2"/><circle cx="${f.grip.x}" cy="${f.grip.y}" r="6" fill="#ff4050"/><circle cx="${f.pivot.x}" cy="${f.pivot.y}" r="6" fill="#55ff75"/><line x1="${f.pivot.x-35}" y1="${f.pivot.y}" x2="${f.pivot.x+35}" y2="${f.pivot.y}" stroke="#55ff75" stroke-width="2"/></g>`;}).join('');
  const overlay=Buffer.from(`<svg width="${cell*columns}" height="${cell*rows}">${marks}</svg>`);
  const annotated=await sharp(atlas).flatten({background:'#18212a'}).composite([{input:overlay}]).png().toBuffer();
  await fs.writeFile(file('qa/registration-'+group+'-native.png'),annotated);
  await sharp(atlas).flatten({background:'#18212a'}).png().toFile(file('qa/contact-'+group+'-native.png'));
  await sharp(annotated).resize(columns*400,rows*400).png().toFile(file('qa/registration-'+group+'.png'));
}
manifest.cinematics={};
for(const[kind,key,def]of [...Object.entries(cfg.effects).map(([k,d])=>['effects',k,d]),...Object.entries(cfg.cinematics||{}).map(([k,d])=>['cinematics',k,d])]){
  if(partial&&!await fs.access(file(def.source)).then(()=>true,()=>false))continue;
  const bytes=await fs.readFile(file(def.source)),meta=await sharp(bytes).metadata();
  if(!meta.hasAlpha)throw new Error(def.source+': transparency is required');
  const spec={url:def.source,columns:def.columns,rows:def.rows,width:meta.width,height:meta.height,frameWidth:meta.width/def.columns,frameHeight:meta.height/def.rows,sha256:hash(bytes),layer:def.layer,blendMode:def.blendMode,frames:[]};
  if(def.groundRegistration){
    const {frames,...registration}=def.groundRegistration;
    if(registration.sourceSha256!==spec.sha256||frames.length!==def.columns*def.rows)throw new Error(key+': stale ground registration');
    spec.groundRegistration=registration;
  }
  for(let i=0;i<def.columns*def.rows;i++){
    const col=i%def.columns,row=Math.floor(i/def.columns),x=Math.round(col*meta.width/def.columns),y=Math.round(row*meta.height/def.rows);
    const rect={x,y,width:Math.round((col+1)*meta.width/def.columns)-x,height:Math.round((row+1)*meta.height/def.rows)-y};
    const frame=await sharp(bytes).extract({left:x,top:y,width:rect.width,height:rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    spec.frames.push({index:i,rect,sha256:hash(frame.data),alphaBounds:alphaBounds(frame.data,frame.info.width,frame.info.height,0),visibleBounds:alphaBounds(frame.data,frame.info.width,frame.info.height,16),...(def.groundRegistration?{groundAnchor:def.groundRegistration.frames[i]}:{})});
  }
  const visible=spec.frames.map(f=>f.visibleBounds),left=Math.min(...visible.map(b=>b.left)),top=Math.min(...visible.map(b=>b.top));
  spec.contentBounds={left,top,width:Math.max(...visible.map(b=>b.left+b.width))-left,height:Math.max(...visible.map(b=>b.top+b.height))-top};
  spec.contentBoundsAlphaThreshold=16;
  manifest[kind][key]=spec;
  await sharp(bytes).resize({width:1200}).png().toFile(file('qa/contact-fx-'+key+'.png'));
}
const idle=manifest.motion.idle.frames[0];
manifest.battleSprite='/'+path.relative(path.resolve(root,'../..'),file(idle.file)).replaceAll('\\','/');
manifest.battleSpriteSha256=idle.sha256;
manifest.battleSpriteFootAnchor={x:idle.pivot.x/cell,y:idle.pivot.y/cell};
if(await fs.access(file('assets/ui/dialogue-frame.png')).then(()=>true,()=>false)){
  const registration=await json('assets/ui/dialogue-frame-registration.json');
  const uiSource=await fs.readFile(file(registration.source));
  if(hash(uiSource)!==registration.sourceSha256)throw new Error('Dialogue frame source hash mismatch');
  const cropped=await sharp(uiSource).extract(registration.rect).png().toBuffer();
  if(hash(cropped)!==registration.outputSha256)throw new Error('Dialogue frame crop changed');
  await fs.writeFile(file(registration.output),cropped);
  const ui=await fs.readFile(file('assets/ui/dialogue-frame.png'));
  manifest.ui={dialogueFrame:{url:'assets/ui/dialogue-frame.png',sha256:hash(ui),registration:'assets/ui/dialogue-frame-registration.json',textPolicy:'LIVE_DOM_TEXT_NOT_BAKED'}};
}
manifest.summary={bodyFrames:Object.values(manifest.motion).reduce((n,s)=>n+s.frames.length,0),effectFrames:Object.values(manifest.effects).reduce((n,s)=>n+s.frames.length,0),weaponSources:1,weaponRedraws:0};
manifest.version='LEONEL_SSS_LIMITED_20261018_V2';
manifest.summary.cinematicFrames=Object.values(manifest.cinematics).reduce((n,s)=>n+s.frames.length,0);
manifest.playbackRates={attackMotion:2,skillEffect:1,idleMotion:1,dashMotion:1};
manifest.combatProfile={...LEONEL_COMBAT,skill:LEONEL_AREA_SKILL};
await writeJSON('manifest.json',manifest);
await writeJSON('qa/asset-build-report.json',{createdAt:new Date().toISOString(),status:partial?'PARTIAL_BUILD_IN_PROGRESS':'TECHNICAL_BUILD_COMPLETE_VISUAL_REVIEW_PENDING',summary:manifest.summary,weaponSource:lock,referenceHeight:ref,cellSize:cell,frames:assetStats});
console.log(JSON.stringify(manifest.summary));
