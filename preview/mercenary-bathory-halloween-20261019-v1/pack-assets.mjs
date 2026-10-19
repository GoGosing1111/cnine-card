// Derived from the approved X-BODY exact-weapon compositor; no generative weapon redraw.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {components} from './components.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const definitions=JSON.parse(await fs.readFile(file('pose-registration.json'))),blade=await fs.readFile(file('assets/locked/approved-blade.png')),locked=JSON.parse(await fs.readFile(file('assets/locked/blade-provenance.json')));
if(hash(blade)!==locked.sha256)throw Error('Locked weapon changed');
const PREFIX='preview/mercenary-bathory-halloween-20261019-v1/';
const manifest={version:'BATHORY_HALLOWEEN_REVIEW_20261019_V1',name:'바토리',title:'핏빛 만찬',code:'V-977',rank:'SS',edition:'LIMITED',season:'HALLOWEEN',serverLimit:10,status:'USER_REVIEW_PENDING',runtimeEnabled:false,sourceArt:PREFIX+locked.source,sourceArtSha256:locked.sourceSha256,weapon:{...locked,url:'assets/locked/approved-blade.png',drawingPolicy:'ONE_IMMUTABLE_ORIGINAL_RASTER'},frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',motion:{},effects:{},referenceHeight:360,displaySizing:{physicalBodyHeight:333,fullBodyHeight:333},runtime:{pixi:'8.20.0',gsap:'3.13.0',engine:'preview/project-v-v3/source/battle/BattleEngine.js',clock:'V3_REGISTERED_GSAP'},audio:{enabled:false}};
for(const d of ['assets/atlases','assets/frames','assets/thumbs'])await fs.mkdir(file(d),{recursive:true});
const cache=new Map(),factor=600/locked.standingHelmetToSole,pack=.6;
async function loadBody(name){
 if(cache.has(name))return cache.get(name);
 const source=await fs.readFile(file('assets/body/'+name+'.png')),raw=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),cc=components(raw.data,raw.info.width,raw.info.height);
 if(cc.length!==4)throw Error(name+': expected four disconnected body drawings, got '+cc.length);
 const result={source,...raw,cc};cache.set(name,result);return result;
}
for(const [group,poses]of Object.entries(definitions)){
 const rows=[];
 for(const [index,def]of poses.entries()){
  const {source,data,info,cc}=await loadBody(def.source),c=cc[def.cell],pad=4,b={left:Math.max(0,c.box.left-pad),top:Math.max(0,c.box.top-pad)};
  b.width=Math.min(info.width,c.box.left+c.box.width+pad)-b.left;b.height=Math.min(info.height,c.box.top+c.box.height+pad)-b.top;
  const mask=new Uint8Array(b.width*b.height),crop=Buffer.alloc(b.width*b.height*4);
  for(const pixel of c.ids){const x=pixel%info.width-b.left,y=((pixel/info.width)|0)-b.top;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<b.width&&yy>=0&&yy<b.height)mask[yy*b.width+xx]=1;}}
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(mask[y*b.width+x]){const o=(y*b.width+x)*4,s=((y+b.top)*info.width+x+b.left)*4;data.copy(crop,o,s,s+4);}
  const bodyScale=600/def.upright,bw=Math.round(b.width*bodyScale),bh=Math.round(b.height*bodyScale),body=await sharp(crop,{raw:{width:b.width,height:b.height,channels:4}}).resize(bw,bh).png().toBuffer();
  const foot={x:(def.foot[0]-b.left)*bodyScale,y:(def.foot[1]-b.top)*bodyScale},grip={x:(def.grip[0]-def.foot[0])*bodyScale,y:(def.grip[1]-def.foot[1])*bodyScale};
  const sw=Math.round(locked.width*factor),scaled=await sharp(blade).resize({width:sw,kernel:'lanczos3'}).png().toBuffer(),sm=await sharp(scaled).metadata();
  const sourceAngle=Math.atan2(locked.tip.y-locked.grip.y,locked.tip.x-locked.grip.x)*180/Math.PI,rotation=def.angle-sourceAngle;
  const rotated=await sharp(scaled).rotate(rotation,{background:'#00000000'}).png().toBuffer(),rm=await sharp(rotated).metadata(),theta=rotation*Math.PI/180;
  const transform=p=>{const x=p.x*factor-sm.width/2,y=p.y*factor-sm.height/2;return{x:rm.width/2+x*Math.cos(theta)-y*Math.sin(theta),y:rm.height/2+x*Math.sin(theta)+y*Math.cos(theta)};};
  const rg=transform(locked.grip),tip=transform(locked.tip),start=transform(locked.bladeStart),origin={x:1200,y:1500},weaponLeft=Math.round(origin.x+grip.x-rg.x),weaponTop=Math.round(origin.y+grip.y-rg.y);
  const whole=await sharp({create:{width:2600,height:2200,channels:4,background:'#00000000'}}).composite([{input:body,left:Math.round(origin.x-foot.x),top:Math.round(origin.y-foot.y)},{input:rotated,left:weaponLeft,top:weaponTop}]).png().toBuffer();
  const trimmed=await sharp(whole).trim({threshold:0}).png().toBuffer({resolveWithObject:true}),tw=Math.round(trimmed.info.width*pack),th=Math.round(trimmed.info.height*pack);
  if(tw>748||th>748)throw Error(group+index+' would clip: '+tw+'x'+th);
  const px=Math.round((768-tw)/2),py=Math.round((768-th)/2),left=-trimmed.info.trimOffsetLeft,top=-trimmed.info.trimOffsetTop;
  const frame=await sharp({create:{width:768,height:768,channels:4,background:'#00000000'}}).composite([{input:await sharp(trimmed.data).resize(tw,th).png().toBuffer(),left:px,top:py}]).png().toBuffer();
  const point=(x,y)=>({x:px+(x-left)*pack,y:py+(y-top)*pack}),id=group+'-'+String(index+1).padStart(2,'0');
  const entry={id,index,pivot:point(origin.x,origin.y),grip:point(origin.x+grip.x,origin.y+grip.y),bladeStart:point(weaponLeft+start.x,weaponTop+start.y),tip:point(weaponLeft+tip.x,weaponTop+tip.y),bodyPixels:360,source:'assets/body/'+def.source+'.png',sourceSha256:hash(source),componentBox:b,sourceFoot:def.foot,sourceGrip:def.grip,sourceComponent:def.cell,weapon:{sourceSha256:locked.sha256,rotationDegrees:rotation,uniformScale:factor*pack,redrawnPixels:0},sha256:hash(frame),file:'assets/frames/'+id+'.png'};
  await fs.writeFile(file(entry.file),frame);
  await sharp(frame).trim({threshold:0}).resize({width:256,height:256,fit:'contain',background:'#00000000'}).png().toFile(file('assets/thumbs/'+id+'.png'));
  rows.push({entry,frame});
 }
 const columns=4,height=Math.ceil(rows.length/4)*768,atlas=await sharp({create:{width:3072,height,channels:4,background:'#00000000'}}).composite(rows.map((r,i)=>({input:r.frame,left:i%4*768,top:Math.floor(i/4)*768}))).png().toBuffer(),url='assets/atlases/'+group+'.png';
 await fs.writeFile(file(url),atlas);manifest.motion[group]={url,columns,rows:Math.ceil(rows.length/4),frameWidth:768,frameHeight:768,referenceHeight:360,sha256:hash(atlas),frames:rows.map(r=>r.entry)};
}
for(const [key,name]of Object.entries({drive:'drive-v1',cut:'cut-v2',rupture:'rupture-v2'})){
 const url='assets/effects/'+name+'.png',bytes=await fs.readFile(file(url)),m=await sharp(bytes).metadata();
 manifest.effects[key]={url,columns:4,rows:3,width:m.width,height:m.height,sha256:hash(bytes),frames:Array.from({length:12},(_,i)=>{const x=Math.round(i%4*m.width/4),y=Math.round(Math.floor(i/4)*m.height/3);return{index:i,rect:{x,y,width:Math.round((i%4+1)*m.width/4)-x,height:Math.round((Math.floor(i/4)+1)*m.height/3)-y},groundAnchor:key==='rupture'?{x:m.width/8,y:m.height/3*.86}:null};})};
}
manifest.displaySizing.fullBodyHeight=768*333/360;
const idle=manifest.motion.idle.frames[0];
manifest.battleSprite=PREFIX+idle.file;manifest.battleSpriteSha256=idle.sha256;manifest.battleSpriteFootAnchor={x:idle.pivot.x/768,y:idle.pivot.y/768};
manifest.summary={bodyFrames:Object.values(manifest.motion).reduce((n,b)=>n+b.frames.length,0),effectFrames:36,weaponSources:1,weaponRedraws:0};
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const publicDir=file('../../assets/ui/project-v/mercenaries/bathory-halloween-20261019/');
await fs.mkdir(publicDir,{recursive:true});
for(const [src,name]of [['assets/sources/bathory-source-v2.png','source-art.png'],['assets/frames/idle-01.png','sd.png'],['assets/art-320.webp','art-320.webp'],['assets/art-640.webp','art-640.webp']])await fs.copyFile(file(src),publicDir+name);
console.log(JSON.stringify(manifest.summary));
