import sharp from 'sharp';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex');
const definitions=JSON.parse(await fs.readFile(file('pose-registration.json'))),blade=await fs.readFile(file('../battle-suit-x-v1/assets/locked/approved-blade.png')),locked=JSON.parse(await fs.readFile(file('../battle-suit-x-v1/assets/locked/blade-provenance.json')));
if(hash(blade)!==locked.sha256)throw Error('Locked blade changed');
const manifest={version:'BATTLE_SUIT_X_DRAGON_REVIEW_20260927_V1',status:'USER_REVIEW_PENDING',runtimeEnabled:false,sourceArt:'/preview/battle-suit-x-v1/assets/sources/x-body-sword-approved-v1.png',weapon:{...locked,source:'/preview/battle-suit-x-v1/assets/sources/x-body-sword-approved-v1.png',url:'/preview/battle-suit-x-v1/assets/locked/approved-blade.png',drawingPolicy:'ONE_IMMUTABLE_ORIGINAL_RASTER'},motion:{},effects:{},runtime:{pixi:'8.20.0',gsap:'3.13.0',engine:'preview/project-v-v3/source/battle/BattleEngine.js',clock:'V3_REGISTERED_GSAP'},audio:{enabled:false}};
await fs.mkdir(file('assets/atlases'),{recursive:true});await fs.mkdir(file('assets/frames'),{recursive:true});await fs.mkdir(file('assets/thumbs'),{recursive:true});
function components(data,w,h){
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<=24)continue;
  let a=0,b=1,x0=w,y0=h,x1=0,y1=0;q[0]=p;seen[p]=1;const ids=[];
  while(a<b){const i=q[a++],x=i%w,y=(i/w)|0;ids.push(i);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const n of[x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>24){seen[n]=1;q[b++]=n;}
  }
  if(ids.length>12000)out.push({ids,box:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}});
 }
 return out.sort((a,b)=>Math.floor((a.box.top+a.box.height/2)/(h/2))-Math.floor((b.box.top+b.box.height/2)/(h/2))||a.box.left-b.box.left);
}
const rows={dragon:[]};
for(const [key,def]of Object.entries(definitions)){
 const source=await fs.readFile(file('assets/sources/body-'+key+'.png'));
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cc=components(data,info.width,info.height);if(cc.length!==4)throw Error(key+': expected four bodies, got '+cc.length);
 for(let i=0;i<4;i++){
  const c=cc[i],pad=4,b={left:Math.max(0,c.box.left-pad),top:Math.max(0,c.box.top-pad),width:0,height:0};
  b.width=Math.min(info.width,c.box.left+c.box.width+pad)-b.left;b.height=Math.min(info.height,c.box.top+c.box.height+pad)-b.top;
  const mask=new Uint8Array(b.width*b.height);
  for(const p of c.ids){const x=p%info.width-b.left,y=((p/info.width)|0)-b.top;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<b.width&&yy>=0&&yy<b.height)mask[yy*b.width+xx]=1;}}
  const crop=Buffer.alloc(b.width*b.height*4);for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(mask[y*b.width+x]){const o=(y*b.width+x)*4,s=((y+b.top)*info.width+x+b.left)*4;data.copy(crop,o,s,s+4);}
  // Same body size for every frame. Crouching frames are not scaled to their visible height.
  const bodyScale=600/def.upright,bw=Math.round(b.width*bodyScale),bh=Math.round(b.height*bodyScale);
  const body=await sharp(crop,{raw:{width:b.width,height:b.height,channels:4}}).resize(bw,bh).png().toBuffer();
  const foot={x:(def.feet[i][0]-b.left)*bodyScale,y:(def.feet[i][1]-b.top)*bodyScale},grip={x:(def.grips[i][0]-def.feet[i][0])*bodyScale,y:(def.grips[i][1]-def.feet[i][1])*bodyScale};
  const factor=600/locked.standingHelmetToSole;
  const sw=Math.round(locked.width*factor),sh=Math.round(locked.height*factor);
  const bladeAngle=Math.atan2(locked.tip.y-locked.grip.y,locked.tip.x-locked.grip.x)*180/Math.PI,rotation=def.angles[i]-bladeAngle;
  const scaled=await sharp(blade).resize({width:sw,kernel:'lanczos3'}).png().toBuffer(),rotated=await sharp(scaled).rotate(rotation,{background:'#00000000'}).png().toBuffer(),rm=await sharp(rotated).metadata();
  const theta=rotation*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
  const transform=p=>{const x=p.x*factor-sw/2,y=p.y*factor-sh/2;return{x:rm.width/2+x*cos-y*sin,y:rm.height/2+x*sin+y*cos};};
  const rg=transform(locked.grip),tip=transform(locked.tip),origin={x:1000,y:1300};
  const weaponLeft=Math.round(origin.x+grip.x-rg.x),weaponTop=Math.round(origin.y+grip.y-rg.y);
  const whole=await sharp({create:{width:2200,height:1800,channels:4,background:'#00000000'}}).composite([{input:body,left:Math.round(origin.x-foot.x),top:Math.round(origin.y-foot.y)},{input:rotated,left:weaponLeft,top:weaponTop}]).png().toBuffer();
  const trimmed=await sharp(whole).trim({threshold:0}).png().toBuffer({resolveWithObject:true});
  const pack=.6,tw=Math.round(trimmed.info.width*pack),th=Math.round(trimmed.info.height*pack);
  if(tw>748||th>748)throw Error(key+i+' frame would clip '+tw+'x'+th);
  const px=Math.round((768-tw)/2),py=Math.round((768-th)/2),trimLeft=-trimmed.info.trimOffsetLeft,trimTop=-trimmed.info.trimOffsetTop;
  const frame=await sharp({create:{width:768,height:768,channels:4,background:'#00000000'}}).composite([{input:await sharp(trimmed.data).resize(tw,th).png().toBuffer(),left:px,top:py}]).png().toBuffer();
  const group=key.split('-')[0],index=rows[group].length,id=group+'-'+String(index+1).padStart(2,'0');
  const pivot={x:px+(origin.x-trimLeft)*pack,y:py+(origin.y-trimTop)*pack};
  const entry={id,index,pivot,grip:{x:px+(origin.x+grip.x-trimLeft)*pack,y:py+(origin.y+grip.y-trimTop)*pack},tip:{x:px+(weaponLeft+tip.x-trimLeft)*pack,y:py+(weaponTop+tip.y-trimTop)*pack},bodyPixels:360,source:'assets/sources/body-'+key+'.png',sourceSha256:hash(source),componentBox:b,sourceFoot:def.feet[i],sourceGrip:def.grips[i],weapon:{sourceSha256:locked.sha256,rotationDegrees:rotation,uniformScale:factor*pack,redrawnPixels:0},sha256:hash(frame),file:'assets/frames/'+id+'.png'};
  await fs.writeFile(file(entry.file),frame);await sharp(frame).trim({threshold:0}).resize({width:300,height:300,fit:'contain',background:'#00000000'}).png().toFile(file('assets/thumbs/'+id+'.png'));rows[group].push({entry,frame});
 }
}
for(const [key,frames]of Object.entries(rows)){
 const out=await sharp({create:{width:3072,height:1536,channels:4,background:'#00000000'}}).composite(frames.map((f,i)=>({input:f.frame,left:i%4*768,top:Math.floor(i/4)*768}))).png().toBuffer();
 const url='assets/atlases/'+key+'.png';await fs.writeFile(file(url),out);manifest.motion[key]={url,columns:4,rows:2,frameWidth:768,frameHeight:768,bodyPixels:360,sha256:hash(out),frames:frames.map(f=>f.entry)};
}
for(const [key,grid]of Object.entries({'dragon-coil':[4,3],'dragon-rush':[4,3],'dragon-impact':[4,3],'dragon-ring':[4,3]})){
 const url='assets/sources/fx-'+key+'.png',bytes=await fs.readFile(file(url)),m=await sharp(bytes).metadata();
 manifest.effects[key]={url,columns:grid[0],rows:grid[1],width:m.width,height:m.height,sha256:hash(bytes),frames:Array.from({length:grid[0]*grid[1]},(_,i)=>{const x=Math.round(i%grid[0]*m.width/grid[0]),y=Math.round(Math.floor(i/grid[0])*m.height/grid[1]);return{index:i,rect:{x,y,width:Math.round((i%grid[0]+1)*m.width/grid[0])-x,height:Math.round((Math.floor(i/grid[0])+1)*m.height/grid[1])-y}};})};
}
manifest.summary={bodyFrames:Object.values(rows).reduce((n,s)=>n+s.length,0),effectFrames:Object.values(manifest.effects).reduce((n,s)=>n+s.frames.length,0),weaponSources:1,weaponRedraws:0};
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({summary:manifest.summary,frames:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.map(f=>({id:f.entry.id,pivot:f.entry.pivot,tip:f.entry.tip}))]))},null,2));
