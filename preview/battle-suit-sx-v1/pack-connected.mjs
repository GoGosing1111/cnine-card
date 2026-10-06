// Complete figure extraction only. Never detach/reassemble the head or weapon; never recolor the body.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const defs=JSON.parse(await fs.readFile(file('pose-registration-connected.json')));
const repairs=JSON.parse(await fs.readFile(file('connected-pose-repairs.json')));
const source=await fs.readFile(file('assets/sources/sx-standing-approved-20261007.png'));
if(hash(source)!=='0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b')throw Error('Approved source changed');
const manifest={version:'SX_SUIT_CONNECTED_V8_20261007',name:'SX슈트',title:'푸른 사신',status:'MOTION_REVIEW_PENDING',runtimeEnabled:false,sourceArt:'assets/sources/sx-standing-approved-20261007.png',sourceSha256:hash(source),idle:{pivot:{x:485,y:1474},bodyPixels:1330},method:'CONNECTED_FULL_FIGURE_DRAWINGS',colorPolicy:'ORIGINAL_COBALT_SILVER_GOLD_NO_BODY_TINT',proportionPolicy:'Preserve drawn adult limb lengths. One uniform scale per source sheet; never fit crouched bodies to standing height.',motion:{},effects:{},titleArt:'assets/connected/title-open-v2.png',titleTypography:{font:'Noto Serif KR 900',fontAsset:'assets/fonts/NotoSerifKR-blue-reaper-900.ttf',ornament:'OPEN_SWORD_WINGS',rectangularFrame:false},runtime:{engine:'preview/project-v-v3/source/battle/BattleEngine.js',clock:'V3_REGISTERED_GSAP'},audio:{enabled:false}};
for(const dir of ['assets/runtime/atlases','assets/runtime/frames','assets/runtime/thumbs','assets/runtime/effects','qa'])await fs.mkdir(file(dir),{recursive:true});
function components(data,w,h){
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<=24)continue;let a=0,b=1,x0=w,y0=h,x1=0,y1=0;q[0]=p;seen[p]=1;const ids=[];
  while(a<b){const i=q[a++],x=i%w,y=(i/w)|0;ids.push(i);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const n of[x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>24){seen[n]=1;q[b++]=n;}}
  if(ids.length>10000)out.push({ids,box:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}});
 }
 return out.sort((a,b)=>Math.floor((a.box.top+a.box.height/2)/(h/2))-Math.floor((b.box.top+b.box.height/2)/(h/2))||a.box.left-b.box.left);
}
const rows={};
for(const [key,def]of Object.entries(defs)){
 const inputSheet=await fs.readFile(file('assets/connected/'+key+'.png')),sheet=await sharp(inputSheet).ensureAlpha().raw().toBuffer({resolveWithObject:true}),cc=components(sheet.data,sheet.info.width,sheet.info.height);
 if(cc.length!==4)throw Error(key+': expected four isolated complete drawings; got '+cc.length);
 for(let i=0;i<4;i++){
  const repair=repairs[key+':'+i],sourceUrl=repair?.source||'assets/connected/'+key+'.png',input=repair?await fs.readFile(file(sourceUrl)):inputSheet;
  const {data,info}=repair?await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true}):sheet;
  const c=repair?components(data,info.width,info.height)[0]:cc[i],foot=repair?.foot||def.feet[i],grip=repair?.grip||def.grips[i],tip=repair?.tip||def.tips[i],head=repair?.head||def.heads[i];
  const b={left:Math.max(0,c.box.left-3),top:Math.max(0,c.box.top-3)};b.width=Math.min(info.width,c.box.left+c.box.width+3)-b.left;b.height=Math.min(info.height,c.box.top+c.box.height+3)-b.top;
  const mask=new Uint8Array(b.width*b.height),crop=Buffer.alloc(b.width*b.height*4);
  for(const p of c.ids){const x=p%info.width-b.left,y=((p/info.width)|0)-b.top;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<b.width&&yy>=0&&yy<b.height)mask[yy*b.width+xx]=1;}}
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(mask[y*b.width+x]){const o=(y*b.width+x)*4,j=((y+b.top)*info.width+x+b.left)*4;data.copy(crop,o,j,j+4);}
  // A uniform physical scale, fixed for all four poses including knees folded in flight.
  const scale=360/(repair?.standingHeight||def.standingHeight),w=Math.round(b.width*scale);
  const resized=await sharp(crop,{raw:{width:b.width,height:b.height,channels:4}}).resize({width:w,kernel:'lanczos3'}).png().toBuffer(),m=await sharp(resized).metadata();
  if(m.width>744||m.height>744)throw Error(key+' '+i+': canvas clips');
  const px=Math.round((768-m.width)/2),py=Math.round((768-m.height)/2),point=p=>({x:px+(p[0]-b.left)*scale,y:py+(p[1]-b.top)*scale});
  const frame=await sharp({create:{width:768,height:768,channels:4,background:'#00000000'}}).composite([{input:resized,left:px,top:py}]).png().toBuffer();
  const bank=key.split('-')[0];rows[bank]??=[];const index=rows[bank].length,id=bank+'-'+String(index+1).padStart(2,'0');
  const entry={id,index,pivot:point(foot),grip:point(grip),tip:point(tip),head:point(head),bodyPixels:360,source:sourceUrl,sourceSha256:hash(input),componentBox:b,sourceFoot:foot,sourceGrip:grip,sourceTip:tip,sourceHead:head,uniformScale:scale,partComposites:0,colorTransforms:0,repairReason:repair?.reason||null,sha256:hash(frame),file:'assets/runtime/frames/'+id+'.png'};
  await fs.writeFile(file(entry.file),frame);await sharp(frame).resize({width:300}).png().toFile(file('assets/runtime/thumbs/'+id+'.png'));rows[bank].push({entry,frame});
 }
}
for(const [bank,frames]of Object.entries(rows)){
 const bytes=await sharp({create:{width:3072,height:1536,channels:4,background:'#00000000'}}).composite(frames.map((f,i)=>({input:f.frame,left:i%4*768,top:Math.floor(i/4)*768}))).png().toBuffer(),url='assets/runtime/atlases/'+bank+'.png';await fs.writeFile(file(url),bytes);
 manifest.motion[bank]={url,columns:4,rows:2,frameWidth:768,frameHeight:768,bodyPixels:360,sha256:hash(bytes),frames:frames.map(f=>f.entry)};
}
for(const name of await fs.readdir(file('assets/sources'))){
 if(!name.startsWith('fx-')||!name.endsWith('.png'))continue;
 const key=name.slice(3,-4),sourceUrl='assets/sources/'+name,input=await fs.readFile(file(sourceUrl)),m=await sharp(input).metadata(),frames=[],composites=[];
 // Transparent gutters stop the sampler from borrowing pixels from the neighboring cell.
 for(let i=0;i<12;i++){
  const x=Math.round(i%4*m.width/4),y=Math.round(Math.floor(i/4)*m.height/3),w=Math.round((i%4+1)*m.width/4)-x,h=Math.round((Math.floor(i/4)+1)*m.height/3)-y;
  const cell=await sharp(input).extract({left:x,top:y,width:w,height:h}).resize({width:480,height:480,fit:'contain',background:'#00000000'}).extend({top:16,bottom:16,left:16,right:16,background:'#00000000'}).png().toBuffer();
  composites.push({input:cell,left:i%4*512,top:Math.floor(i/4)*512});frames.push({index:i,rect:{x:i%4*512,y:Math.floor(i/4)*512,width:512,height:512},sourceRect:{x,y,width:w,height:h},sha256:hash(cell)});
 }
 const bytes=await sharp({create:{width:2048,height:1536,channels:4,background:'#00000000'}}).composite(composites).png().toBuffer(),url='assets/runtime/effects/'+key+'.png';await fs.writeFile(file(url),bytes);
 manifest.effects[key]={url,sourceUrl,sourceSha256:hash(input),columns:4,rows:3,width:2048,height:1536,sha256:hash(bytes),frames};
}
manifest.summary={bodyFrames:32,effectFrames:Object.values(manifest.effects).reduce((n,s)=>n+s.frames.length,0),completeFigureSheets:8,detachedHeads:0,weaponComposites:0,bodyColorTransforms:0};
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.summary));
