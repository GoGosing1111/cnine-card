// REJECTED HISTORICAL METHOD. Retained as evidence, never used to produce active SX assets.
throw new Error('Detached head/weapon composition was rejected. Use pack-connected.mjs for the active SX preview.');
// Technical pixel composition/atlas packing, adapted from approved X-BODY pack-assets.mjs.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const defs=JSON.parse(await fs.readFile(file('pose-registration.json'))),cfg=JSON.parse(await fs.readFile(file('part-lock.json')));
const parts={};for(const key of ['blade','helmet']){const info=JSON.parse(await fs.readFile(file('assets/locked/'+key+'-provenance.json'))),bytes=await fs.readFile(file('assets/locked/'+key+'.png'));if(hash(bytes)!==info.sha256)throw Error('Locked '+key+' changed');parts[key]={info,bytes};}
const manifest={version:'SX_SUIT_BLUE_REAPER_V1_20261007',name:'SX슈트',title:'푸른 사신',status:'USER_REVIEW_PENDING',runtimeEnabled:false,sourceArt:'assets/sources/sx-standing-approved-20261007.png',sourceSha256:cfg.sha256,idle:{pivot:{x:485,y:1474},bodyPixels:1330},weapon:{...parts.blade.info,url:'assets/locked/blade.png'},helmet:{...parts.helmet.info,url:'assets/locked/helmet.png'},motion:{},effects:{},runtime:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',clock:'V3_REGISTERED_GSAP'},audio:{enabled:false}};
for(const dir of ['assets/atlases','assets/frames','assets/thumbs'])await fs.mkdir(file(dir),{recursive:true});
function components(data,w,h){
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<=24)continue;let a=0,b=1,x0=w,y0=h,x1=0,y1=0;q[0]=p;seen[p]=1;const ids=[];
  while(a<b){const i=q[a++],x=i%w,y=(i/w)|0;ids.push(i);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const n of[x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>24){seen[n]=1;q[b++]=n;}}
  if(ids.length>10000)out.push({ids,box:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}});
 }
 return out.sort((a,b)=>Math.floor((a.box.top+a.box.height/2)/(h/2))-Math.floor((b.box.top+b.box.height/2)/(h/2))||a.box.left-b.box.left);
}
const rows={},partScale=600/cfg.standingHelmetToSole,pack=.6;
async function rigid(part,degrees){
 const sw=Math.round(part.info.width*partScale);
 const scaled=await sharp(part.bytes).resize({width:sw,kernel:'lanczos3'}).png().toBuffer(),sm=await sharp(scaled).metadata();
 const png=await sharp(scaled).rotate(degrees,{background:'#00000000'}).png().toBuffer(),rm=await sharp(png).metadata();
 const theta=degrees*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
 const point=p=>{const x=p.x*partScale-sm.width/2,y=p.y*partScale-sm.height/2;return{x:rm.width/2+x*c-y*s,y:rm.height/2+x*s+y*c};};
 return{png,anchor:point(part.info.anchor),tip:part.info.tip?point(part.info.tip):null};
}
for(const [key,def] of Object.entries(defs)){
 const source=await fs.readFile(file('assets/sources/body-'+key+'.png')),{data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),cc=components(data,info.width,info.height);
 if(cc.length!==4)throw Error(key+': expected 4 bodies, got '+cc.length);
 for(let i=0;i<4;i++){
  const c=cc[i],b={left:Math.max(0,c.box.left-4),top:Math.max(0,c.box.top-4)};b.width=Math.min(info.width,c.box.left+c.box.width+4)-b.left;b.height=Math.min(info.height,c.box.top+c.box.height+4)-b.top;
  const mask=new Uint8Array(b.width*b.height),crop=Buffer.alloc(b.width*b.height*4);
  for(const p of c.ids){const x=p%info.width-b.left,y=((p/info.width)|0)-b.top;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<b.width&&yy>=0&&yy<b.height)mask[yy*b.width+xx]=1;}}
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(mask[y*b.width+x]){const o=(y*b.width+x)*4,j=((y+b.top)*info.width+x+b.left)*4;data.copy(crop,o,j,j+4);}
  const scale=(600*cfg.standingNeckToSole/cfg.standingHelmetToSole)/def.neckToSole;
  const body=await sharp(crop,{raw:{width:b.width,height:b.height,channels:4}}).resize(Math.round(b.width*scale),Math.round(b.height*scale)).png().toBuffer();
  const origin={x:1500,y:1700},relative=xy=>({x:(xy[0]-def.feet[i][0])*scale,y:(xy[1]-def.feet[i][1])*scale}),grip=relative(def.grips[i]),neck=relative(def.necks[i]);
  const bladeAngle=Math.atan2(parts.blade.info.tip.y-parts.blade.info.anchor.y,parts.blade.info.tip.x-parts.blade.info.anchor.x)*180/Math.PI;
  const bladeRotation=def.angles[i]-bladeAngle,blade=await rigid(parts.blade,bladeRotation),helmet=await rigid(parts.helmet,def.headAngles[i]);
  const bladeAt={left:Math.round(origin.x+grip.x-blade.anchor.x),top:Math.round(origin.y+grip.y-blade.anchor.y)},headAt={left:Math.round(origin.x+neck.x-helmet.anchor.x),top:Math.round(origin.y+neck.y-helmet.anchor.y)};
  const whole=await sharp({create:{width:3000,height:2400,channels:4,background:'#00000000'}}).composite([{input:body,left:Math.round(origin.x-(def.feet[i][0]-b.left)*scale),top:Math.round(origin.y-(def.feet[i][1]-b.top)*scale)},{input:blade.png,...bladeAt},{input:helmet.png,...headAt}]).png().toBuffer();
  const trimmed=await sharp(whole).trim({threshold:0}).png().toBuffer({resolveWithObject:true});
  const tw=Math.round(trimmed.info.width*pack),th=Math.round(trimmed.info.height*pack);if(tw>748||th>748)throw Error(key+i+' frame clips '+tw+'x'+th);
  const px=Math.round((768-tw)/2),py=Math.round((768-th)/2),trimLeft=-trimmed.info.trimOffsetLeft,trimTop=-trimmed.info.trimOffsetTop;
  const frame=await sharp({create:{width:768,height:768,channels:4,background:'#00000000'}}).composite([{input:await sharp(trimmed.data).resize(tw,th).png().toBuffer(),left:px,top:py}]).png().toBuffer();
  const toFrame=p=>({x:px+(p.x-trimLeft)*pack,y:py+(p.y-trimTop)*pack}),bank=key.split('-')[0];rows[bank]??=[];const index=rows[bank].length,id=bank+'-'+String(index+1).padStart(2,'0');
  const entry={id,index,pivot:toFrame(origin),grip:toFrame({x:origin.x+grip.x,y:origin.y+grip.y}),tip:toFrame({x:bladeAt.left+blade.tip.x,y:bladeAt.top+blade.tip.y}),neck:toFrame({x:origin.x+neck.x,y:origin.y+neck.y}),bodyPixels:360,source:'assets/sources/body-'+key+'.png',sourceSha256:hash(source),componentBox:b,sourceFoot:def.feet[i],sourceGrip:def.grips[i],sourceNeck:def.necks[i],weapon:{sourceSha256:parts.blade.info.sha256,rotationDegrees:bladeRotation,uniformScale:partScale*pack,redrawnPixels:0},helmet:{sourceSha256:parts.helmet.info.sha256,rotationDegrees:def.headAngles[i],uniformScale:partScale*pack,redrawnPixels:0},sha256:hash(frame),file:'assets/frames/'+id+'.png'};
  await fs.writeFile(file(entry.file),frame);await sharp(frame).trim({threshold:0}).resize({width:300,height:300,fit:'contain',background:'#00000000'}).png().toFile(file('assets/thumbs/'+id+'.png'));rows[bank].push({entry,frame});
 }
}
for(const [bank,frames]of Object.entries(rows)){
 const atlasRows=Math.ceil(frames.length/4),bytes=await sharp({create:{width:3072,height:768*atlasRows,channels:4,background:'#00000000'}}).composite(frames.map((f,i)=>({input:f.frame,left:i%4*768,top:Math.floor(i/4)*768}))).png().toBuffer(),url='assets/atlases/'+bank+'.png';await fs.writeFile(file(url),bytes);
 manifest.motion[bank]={url,columns:4,rows:atlasRows,frameWidth:768,frameHeight:768,bodyPixels:360,sha256:hash(bytes),frames:frames.map(f=>f.entry)};
}
for(const name of await fs.readdir(file('assets/sources'))){
 if(!name.startsWith('fx-')||!name.endsWith('.png'))continue;const key=name.slice(3,-4),url='assets/sources/'+name,bytes=await fs.readFile(file(url)),m=await sharp(bytes).metadata();
 manifest.effects[key]={url,columns:4,rows:3,width:m.width,height:m.height,sha256:hash(bytes),frames:Array.from({length:12},(_,i)=>{const x=Math.round(i%4*m.width/4),y=Math.round(Math.floor(i/4)*m.height/3);return{index:i,rect:{x,y,width:Math.round((i%4+1)*m.width/4)-x,height:Math.round((Math.floor(i/4)+1)*m.height/3)-y}};})};
}
manifest.summary={bodyFrames:Object.values(rows).reduce((n,s)=>n+s.length,0),effectFrames:Object.values(manifest.effects).reduce((n,s)=>n+s.frames.length,0),weaponSources:1,weaponRedraws:0,helmetSources:1,helmetRedraws:0};
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.summary));
