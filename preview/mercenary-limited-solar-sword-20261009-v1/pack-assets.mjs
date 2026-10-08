// Derived from the approved X-BODY packer: exact weapon + alpha-aware body registration.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {components} from './inspect-assets.mjs';
import {MODES} from './motion.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const defs=JSON.parse(await fs.readFile(file('pose-registration.json'))),lock=JSON.parse(await fs.readFile(file('assets/locked/v2/weapon-provenance.json'))),blade=await fs.readFile(file('assets/locked/v2/complete-sword.png'));
Object.assign(defs,JSON.parse(await fs.readFile(file('pose-registration-sx-revision.json'))));
const gripCorrections={idle:[35,33,35,38],dash:[33,29,34,34],'ultimate-a':[38,-112,-90,-100],'ultimate-b':[32,48,-12,43],cut:[-137,-55,22,70],command:[41,45,43,45]};
for(const [key,angles]of Object.entries(gripCorrections))defs[key].angles=angles;
if(hash(blade)!==lock.sha256)throw Error('Weapon hash changed');
const manifest={version:'SOLAR_SWORD_SSS_LIMITED_REVIEW_20261009_V2_WEAPON',status:'USER_REVIEW_PENDING',sourceArt:'/assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png',sourceArtSha256:lock.sourceSha256,approval:'approval-20261009.json',grade:'SSS',edition:'LIMITED',workingTitle:'태양검 군주',runtimeEnabled:false,weapon:{...lock,url:'assets/locked/v2/complete-sword.png',drawingPolicy:'ONE_FIXED_SWORD_VISIBLE_ORIGINAL_PIXELS_ONLY_HIDDEN_GRIP_COMPLETED'},motion:{},effects:{},rejectedFrames:[],runtime:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',clock:'V3_REGISTERED_GSAP',source:'source/SolarFX.js'},audio:{enabled:false,reason:'Silent visual review; no new synthesized audio'}};
for(const dir of ['assets/atlases','assets/frames','assets/thumbs','qa'])await fs.mkdir(file(dir),{recursive:true});
const rows={idle:[],dash:[],attack:[],skill:[],ultimate:[],cut:[],command:[]},BODY=330,CELL=768,bodyReference=600,pack=BODY/bodyReference;
for(const [key,def]of Object.entries(defs)){
 const sourcePath='assets/sources/body-'+key+'.png',source=await fs.readFile(file(sourcePath));
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),cc=components(data,info.width,info.height);
 if(cc.length!==4)throw Error(key+': expected 4 separate body drawings, got '+cc.length);
 manifest.rejectedFrames.push(...(def.rejected||[]).map(r=>({source:sourcePath,...r})));
 for(const i of def.select??[0,1,2,3]){
  const c=cc[i];if(c.touchesBorder)throw Error(key+i+': clipped body');
  const pad=4,b={left:Math.max(0,c.box.left-pad),top:Math.max(0,c.box.top-pad)};
  b.width=Math.min(info.width,c.box.left+c.box.width+pad)-b.left;b.height=Math.min(info.height,c.box.top+c.box.height+pad)-b.top;
  const mask=new Uint8Array(b.width*b.height);
  for(const p of c.ids){const x=p%info.width-b.left,y=((p/info.width)|0)-b.top;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<b.width&&yy>=0&&yy<b.height)mask[yy*b.width+xx]=1;}}
  const crop=Buffer.alloc(b.width*b.height*4);for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(mask[y*b.width+x]){const o=(y*b.width+x)*4,s=((y+b.top)*info.width+x+b.left)*4;data.copy(crop,o,s,s+4);}
  const hand=Buffer.alloc(crop.length),axis=def.angles[i]*Math.PI/180;
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
   const dx=x+b.left-def.grips[i][0],dy=y+b.top-def.grips[i][1],along=dx*Math.cos(axis)+dy*Math.sin(axis),across=-dx*Math.sin(axis)+dy*Math.cos(axis),o=(y*b.width+x)*4;
   // Remove only the registered short weapon proxy outside the gripping fist.
   // Keep the source hand as a foreground occluder over the one true hilt.
   if(along*along/(18*18)+across*across/(19*19)<=1)crop.copy(hand,o,o,o+4);
   if(Math.abs(along)>18&&Math.abs(along)<48&&Math.abs(across)<11)crop[o+3]=0;
  }
  const bodyScale=bodyReference/def.upright,bw=Math.round(b.width*bodyScale),bh=Math.round(b.height*bodyScale),body=await sharp(crop,{raw:{width:b.width,height:b.height,channels:4}}).resize(bw,bh).png().toBuffer(),handLayer=await sharp(hand,{raw:{width:b.width,height:b.height,channels:4}}).resize(bw,bh).png().toBuffer();
  const foot={x:(def.feet[i][0]-b.left)*bodyScale,y:(def.feet[i][1]-b.top)*bodyScale};
  const relative=p=>({x:(p[0]-def.feet[i][0])*bodyScale,y:(p[1]-def.feet[i][1])*bodyScale});
  const grip=relative(def.grips[i]),head=relative(def.heads[i]),factor=bodyReference/lock.standingHelmetToSole;
  const sw=Math.round(lock.width*factor),scaled=await sharp(blade).resize({width:sw}).png().toBuffer(),sm=await sharp(scaled).metadata();
  const bladeAngle=Math.atan2(lock.tip.y-lock.grip.y,lock.tip.x-lock.grip.x)*180/Math.PI,rotation=def.angles[i]-bladeAngle;
  const rotated=await sharp(scaled).rotate(rotation,{background:'#00000000'}).png().toBuffer(),rm=await sharp(rotated).metadata(),theta=rotation*Math.PI/180;
  const transform=p=>{const x=p.x*factor-sm.width/2,y=p.y*factor-sm.height/2;return{x:rm.width/2+x*Math.cos(theta)-y*Math.sin(theta),y:rm.height/2+x*Math.sin(theta)+y*Math.cos(theta)};};
  const rg=transform(lock.grip),tip=transform(lock.tip),origin={x:1050,y:1400},wl=Math.round(origin.x+grip.x-rg.x),wt=Math.round(origin.y+grip.y-rg.y);
  const whole=await sharp({create:{width:2300,height:2200,channels:4,background:'#00000000'}}).composite([{input:body,left:Math.round(origin.x-foot.x),top:Math.round(origin.y-foot.y)},{input:rotated,left:wl,top:wt},{input:handLayer,left:Math.round(origin.x-foot.x),top:Math.round(origin.y-foot.y)}]).png().toBuffer();
  const trimmed=await sharp(whole).trim({threshold:0}).png().toBuffer({resolveWithObject:true}),tw=Math.round(trimmed.info.width*pack),th=Math.round(trimmed.info.height*pack);
  if(tw>CELL-24||th>CELL-24)throw Error(key+i+' would clip final silhouette '+tw+'x'+th);
  const px=Math.round((CELL-tw)/2),py=Math.round((CELL-th)/2),tl=-trimmed.info.trimOffsetLeft,tt=-trimmed.info.trimOffsetTop;
  const frame=await sharp({create:{width:CELL,height:CELL,channels:4,background:'#00000000'}}).composite([{input:await sharp(trimmed.data).resize(tw,th).png().toBuffer(),left:px,top:py}]).png().toBuffer();
  const map=p=>({x:px+(p.x-tl)*pack,y:py+(p.y-tt)*pack}),bank=key.split('-')[0],index=rows[bank].length,id=bank+'-'+String(index).padStart(2,'0');
  const entry={id,index,pivot:map(origin),grip:map({x:origin.x+grip.x,y:origin.y+grip.y}),head:map({x:origin.x+head.x,y:origin.y+head.y}),tip:map({x:wl+tip.x,y:wt+tip.y}),bodyPixels:BODY,source:sourcePath,sourceIndex:i,sourceSha256:hash(source),componentBox:b,sourceFoot:def.feet[i],sourceGrip:def.grips[i],weapon:{sourceSha256:lock.sha256,rotationDegrees:rotation,uniformScale:factor*pack,redrawnPixels:0,gripOcclusion:'BODY_THEN_SINGLE_SWORD_THEN_REGISTERED_SOURCE_HAND',proxyRemoval:{halfWidth:11,from:18,to:48,axisDegrees:def.angles[i]}},sha256:hash(frame),file:'assets/frames/'+id+'.png',margin:{left:px,top:py,right:CELL-px-tw,bottom:CELL-py-th}};
  await fs.writeFile(file(entry.file),frame);await sharp(frame).resize(320,320).png().toFile(file('assets/thumbs/'+id+'.png'));rows[bank].push({entry,frame});
 }
}
for(const [key,frames]of Object.entries(rows)){
 const columns=4,nrows=Math.ceil(frames.length/columns),out=await sharp({create:{width:CELL*columns,height:CELL*nrows,channels:4,background:'#00000000'}}).composite(frames.map((f,i)=>({input:f.frame,left:i%columns*CELL,top:Math.floor(i/columns)*CELL}))).png().toBuffer(),url='assets/atlases/'+key+'.png';
 await fs.writeFile(file(url),out);manifest.motion[key]={url,columns,rows:nrows,frameWidth:CELL,frameHeight:CELL,bodyPixels:BODY,sha256:hash(out),frames:frames.map(f=>f.entry)};
}
for(const key of ['aura','dash','basic','skill','ultimate','ground','eclipse','formation','sun-gate','fault','mantle','blade']){
 const source='assets/sources/fx-'+key+'.png',bytes=await fs.readFile(file(source)),m=await sharp(bytes).metadata(),frames=[],composites=[],cell=384;
 if(!m.hasAlpha||m.width%4||m.height%3)throw Error('Invalid effect grid '+key);
 for(let i=0;i<12;i++){
  const rect={left:i%4*(m.width/4),top:Math.floor(i/4)*(m.height/3),width:m.width/4,height:m.height/3};
  const frame=await sharp(bytes).extract(rect).resize(360,360,{fit:'contain',background:'#00000000'}).extend({top:12,bottom:12,left:12,right:12,background:'#00000000'}).png().toBuffer(),url='assets/frames/fx-'+key+'-'+String(i).padStart(2,'0')+'.png';
  await fs.writeFile(file(url),frame);frames.push({index:i,file:url,sha256:hash(frame),sourceRect:rect,rect:{x:i%4*cell,y:Math.floor(i/4)*cell,width:cell,height:cell}});composites.push({input:frame,left:i%4*cell,top:Math.floor(i/4)*cell});
 }
 const atlas=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:'#00000000'}}).composite(composites).png().toBuffer(),url='assets/atlases/fx-'+key+'.png';await fs.writeFile(file(url),atlas);
 manifest.effects[key]={url,source,sourceSha256:hash(bytes),columns:4,rows:3,width:cell*4,height:cell*3,sha256:hash(atlas),frames};
}
manifest.activeEffects=['aura','dash','basic','ground','eclipse','formation','sun-gate','fault','mantle','blade'];
manifest.activeMotion=Object.fromEntries(Object.entries(rows).map(([bank])=>[bank,[...new Set(Object.values(MODES).flatMap(m=>m.poses.filter(p=>p.bank===bank).map(p=>p.index)))] ]).filter(([,v])=>v.length));
manifest.summary={bodyFrames:Object.values(rows).reduce((s,v)=>s+v.length,0),activeBodyFrames:Object.values(manifest.activeMotion).reduce((s,v)=>s+v.length,0),effectFrames:144,activeEffectFrames:120,weaponSources:1,visibleWeaponRedraws:0,hiddenGripCompletionPixels:lock.completionPixels};
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const panels=[];for(const [i,key]of ['idle','dash','attack','skill','ultimate'].entries()){
 const idx={idle:0,dash:2,attack:3,skill:3,ultimate:2}[key];panels.push({input:await sharp(rows[key][idx].frame).resize(260,260).flatten({background:'#0d1525'}).png().toBuffer(),left:i*260,top:0});
}
await sharp({create:{width:1300,height:260,channels:3,background:'#0d1525'}}).composite(panels).png().toFile(file('qa/registered-motion-strip.png'));
console.log(JSON.stringify(manifest.summary));
