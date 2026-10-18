import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
if(process.argv.includes('--readability-v2')){await buildReadabilityV2(fs.promises);process.exit(0);}
const root=process.cwd(),dir=path.join(root,'assets/ui/project-v/mercenaries/shiranui-fx-20261018');fs.mkdirSync(dir,{recursive:true});
const generated='C:/Users/User/.codex/generated_images/01a149e5-cd8a-77d3-809d-c143949e3ec4/';
const inputs={ballistics:'exec-23cdf440-fa7c-4699-a02b-747e4ab7bd4a.png',rupture:'exec-ad084a7c-cf26-4038-92ef-87e0be0b3af7.png',dialogue:'exec-9981b0cc-2d71-45e6-9afa-394b12bf1eda.png'};
const hash=b=>createHash('sha256').update(b).digest('hex'),assets={},effects={};
for(const [name,input]of Object.entries(inputs)){
 const source=name+'-source.png',runtime=name+'.webp';if(!fs.existsSync(path.join(dir,source)))fs.copyFileSync(path.join(generated,input),path.join(dir,source));
 const meta=await sharp(path.join(dir,source)).metadata();
 assets[name]={source:{path:source,sha256:hash(fs.readFileSync(path.join(dir,source))),width:meta.width,height:meta.height},runtime:{path:runtime,alpha:meta.hasAlpha}};
 if(name==='dialogue'){await sharp(path.join(dir,source)).webp({lossless:true}).toFile(path.join(dir,runtime));}
 else{
  const cell=meta.width/4,pad=24,size=cell+pad*2,frames=[],composite=[];
  for(let i=0;i<12;i++){
   const sourceRect={left:i%4*cell,top:Math.floor(i/4)*cell,width:cell,height:cell};
   const input=await sharp(path.join(dir,source)).extract(sourceRect).png().toBuffer();
   composite.push({input,left:i%4*size+pad,top:Math.floor(i/4)*size+pad});
   const anchor=name==='rupture'?{x:.5,y:.5}:i<4?{x:([122,132,158,188][i]+pad)/size,y:(210+pad)/size}:i<8?{x:([346,344,340,338][i-4]+pad)/size,y:(186+pad)/size}:{x:.5,y:(190+pad)/size};
   frames.push({index:i,sourceRect,sha256:hash(input),anchor});
  }
  await sharp({create:{width:size*4,height:size*3,channels:4,background:'#00000000'}}).composite(composite).webp({lossless:true}).toFile(path.join(dir,runtime));
  effects[name==='ballistics'?'ar-ballistics':'silver-rupture']={atlas:'../../assets/ui/project-v/mercenaries/shiranui-fx-20261018/'+runtime,columns:4,cellSize:size,frameCount:12,frames};
 }
 assets[name].runtime.sha256=hash(fs.readFileSync(path.join(dir,runtime)));
}
const manifest={version:'SHIRANUI_SILVER_FX_20261018_V1',generator:'built-in image_gen',visualStatus:'IMPLEMENTED_TECHNICAL_QA_PENDING_USER_VISUAL_REVIEW',promptSet:'prompts.json',reference:{path:'assets/ui/project-v/mercenaries/shiranui-20261015/source-art.png',sha256:hash(fs.readFileSync(path.join(root,'assets/ui/project-v/mercenaries/shiranui-20261015/source-art.png')))},processing:'Source PNG bytes preserved. Atlas cells extracted unchanged and repacked with 24 transparent pixels to prevent sampling bleed. Lossless WebP. No repainting, palette replacement or silhouette edits.',assets,effects};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({assets,effects:Object.keys(effects)},null,2));

async function buildReadabilityV2(fs){
 const root=process.cwd(),dir=path.join(root,'assets/ui/project-v/mercenaries/shiranui-fx-20261018');
 const original=path.join(root,'preview/mercenary-monochrome-artillery-battle-v1');
 const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
 const m=await read(path.join(dir,'manifest.json')),base=await read(path.join(original,'manifest.json'));
 const source='silver-tracer-source.png',runtime='silver-tracer.webp';
 try{await fs.copyFile(process.env.SHIRANUI_TRACER_SOURCE||'C:/Users/User/.codex/generated_images/01a149e5-cd8a-77d3-809d-c143949e3ec4/exec-6df5174a-7648-42ca-84d5-7bf7b0609650.png',path.join(dir,source),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
 const png=await fs.readFile(path.join(dir,source)),meta=await sharp(png).metadata(),pad=24,cell=Math.ceil(meta.width/4)+2*pad,frames=[],layers=[];
 for(let i=0;i<8;i++){
  const x=i%4,y=Math.floor(i/4),left=Math.round(x*meta.width/4),top=Math.round(y*meta.height/2);
  const sourceRect={left,top,width:Math.round((x+1)*meta.width/4)-left,height:Math.round((y+1)*meta.height/2)-top};
  const input=await sharp(png).extract(sourceRect).png().toBuffer();layers.push({input,left:x*cell+pad,top:y*cell+pad});
  const tipX=[419,417,411,391,416,411,407,390][i],tipY=(i<4?278:663)-top;
  frames.push({index:i,sourceRect,sha256:hash(input),anchor:{x:(tipX+pad)/cell,y:(tipY+pad)/cell}});
 }
 const packed=await sharp({create:{width:cell*4,height:cell*2,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true}).toBuffer();
 await fs.writeFile(path.join(dir,runtime),packed);
 m.assets['silver-tracer']={source:{path:source,sha256:hash(png),width:meta.width,height:meta.height},runtime:{path:runtime,alpha:true,sha256:hash(packed)}};
 m.effects['silver-tracer']={atlas:'../../assets/ui/project-v/mercenaries/shiranui-fx-20261018/'+runtime,columns:4,cellSize:cell,frameCount:8,frames};
 // Re-register the existing authored arm patch and rigid approved rifle. No new character pixels.
 const cfg=await read(path.join(original,'pose-registration-v2.json')),registration=await read(path.join(original,'pose-registration-ar-v3.json'));
 const d=cfg.poses.ready,patch=registration.patch,weapon=await fs.readFile(path.join(original,'assets/locked/approved-rifle.png')),locked=base.weapon;
 const bodySource=await sharp(path.join(original,'assets/sources/body-ready-v2.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const sheet=await fs.readFile(path.join(original,'assets/sources/ar-micro-recoil-v3.png')),sm=await sharp(sheet).metadata(),cw=sm.width/2,ch=sm.height/2;
 const inside=(x,y,p)=>{let result=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 const rawBase=Buffer.from(bodySource.data);
 for(let y=0;y<1254;y++)for(let x=0;x<1254;x++)if(y<d.clearAbove&&!inside(x,y,d.headOutline)&&!inside(x,y,d.bodyOutline)&&!inside(x,y,d.torsoFill))rawBase[(y*1254+x)*4+3]=0;
 const scale=720/1065,size=1536,pivot={x:600,y:1300},bodyLeft=Math.round(pivot.x-d.foot[0]*scale),bodyTop=Math.round(pivot.y-d.foot[1]*scale),buffers=[],motionFrames=[];
 for(let n=0;n<4;n++){
  const micro=[0,-16,-8,0][n];
  if(n===0||n===3){buffers.push(await sharp(path.join(original,base.motion.ar.atlas)).extract({left:n%2*size,top:Math.floor(n/2)*size,width:size,height:size}).png().toBuffer());motionFrames.push({...base.motion.ar.frames[n]});continue;}
  const a=registration.frames[n].alignment,cellRaw=await sharp(sheet).extract({left:n%2*cw,top:Math.floor(n/2)*ch,width:cw,height:ch}).ensureAlpha().raw().toBuffer(),arm=Buffer.from(rawBase);
  for(let y=306;y<550;y++)for(let x=364;x<972;x++)if(inside(x,y,patch)&&!inside(x,y,d.headOutline)){
   const sx=Math.round((x+111-micro)/2+a.dx),sy=Math.round(y/2+a.dy),i=(y*1254+x)*4,j=(sy*cw+sx)*4;
   if(sx>=0&&sy>=0&&sx<cw&&sy<ch)cellRaw.copy(arm,i,j,j+4);
  }
  const body=await sharp(arm,{raw:{width:1254,height:1254,channels:4}}).resize(Math.round(1254*scale)).png().toBuffer();
  const gx=pivot.x+(699+micro-d.foot[0])*scale,gy=pivot.y+(400-d.foot[1])*scale;
  const rot=-locked.axisDegrees,k=.68,rad=rot*Math.PI/180,sw=Math.round(locked.width*k),sh=Math.round(locked.height*k);
  const wp=await sharp(weapon).resize(sw,sh).rotate(rot,{background:'#00000000'}).png().toBuffer(),wm=await sharp(wp).metadata();
  const transform=p=>({x:wm.width/2+(p.x*k-sw/2)*Math.cos(rad)-(p.y*k-sh/2)*Math.sin(rad),y:wm.height/2+(p.x*k-sw/2)*Math.sin(rad)+(p.y*k-sh/2)*Math.cos(rad)});
  const g=transform(locked.grip),z=transform(locked.muzzle),wx=Math.round(gx-g.x),wy=Math.round(gy-g.y),handRaw=Buffer.alloc(arm.length);
  for(let y=340;y<475;y++)for(let x=600;x<1000;x++)if([[699+micro,400],[913+micro,398]].some(([hx,hy])=>((x-hx)/43)**2+((y-hy)/33)**2<1)){const i=(y*1254+x)*4;arm.copy(handRaw,i,i,i+4);}
  const hands=await sharp(handRaw,{raw:{width:1254,height:1254,channels:4}}).resize(Math.round(1254*scale)).png().toBuffer();
  const buf=await sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite([{input:body,left:bodyLeft,top:bodyTop},{input:wp,left:wx,top:wy},{input:hands,left:bodyLeft,top:bodyTop}]).png().toBuffer();
  buffers.push(buf);motionFrames.push({...base.motion.ar.frames[n],file:undefined,sha256:hash(buf),grip:{x:gx,y:gy},muzzle:{x:wx+z.x,y:wy+z.y},microRecoilSourcePixels:micro});
 }
 const motionName='ar-recoil-v2.webp',atlasWidth=size*2;
 const oldPixels=await sharp(path.join(original,base.motion.ar.atlas)).ensureAlpha().raw().toBuffer();
 const packedPixels=await sharp({create:{width:atlasWidth,height:atlasWidth,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%2*size,top:Math.floor(i/2)*size}))).raw().toBuffer();
 // Preserve protected RGBA pixels exactly, including partly transparent fixed silhouette edges.
 for(let n=0;n<4;n++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  if(n!==0&&n!==3&&y>=660&&y<840&&!inside((x-bodyLeft)/scale,(y-bodyTop)/scale,d.headOutline))continue;
  const at=((Math.floor(n/2)*size+y)*atlasWidth+n%2*size+x)*4;oldPixels.copy(packedPixels,at,at,at+4);
 }
 const motionAtlas=await sharp(packedPixels,{raw:{width:atlasWidth,height:atlasWidth,channels:4}}).webp({lossless:true}).toBuffer();
 for(const n of [1,2]){buffers[n]=await sharp(packedPixels,{raw:{width:atlasWidth,height:atlasWidth,channels:4}}).extract({left:n%2*size,top:Math.floor(n/2)*size,width:size,height:size}).png().toBuffer();motionFrames[n].sha256=hash(buffers[n]);}
 await fs.writeFile(path.join(dir,motionName),motionAtlas);
 m.motion={ar:{atlas:'../../assets/ui/project-v/mercenaries/shiranui-fx-20261018/'+motionName,sha256:hash(motionAtlas),columns:2,rows:2,cellSize:size,frameCount:4,frames:motionFrames}};
 m.recoil={source:'preview/mercenary-monochrome-artillery-battle-v1/pose-registration-ar-v3.json',sourceOffsets:[0,-16,-8,0],previousOffsets:[0,-5,-3,0],fixedHead:true,fixedFeet:true,fixedCoat:true,weaponRigid:true,weaponSha256:hash(weapon),weaponRedrawnPixels:0,processing:'Reposition the existing arm/shoulder patch and translate the original rigid rifle. Idle/settled frames are copied byte-for-pixel from the existing atlas.'};
 m.version='SHIRANUI_SILVER_FX_20261018_V2';
 m.processing='Source PNG bytes preserved. Atlas cells extracted unchanged and repacked with 24 transparent pixels to prevent sampling bleed. Lossless WebP. V2 adds eight separately padded ImageGen bullet/wake cells, preserving the source alpha. Only the authored arm patch and rigid approved rifle translation change in the derived recoil atlas; V1 assets and original motion remain preserved.';
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m,null,2)+'\n');
 const qa=path.join(root,'docs/qa/shiranui-readability-20261018');await fs.mkdir(qa,{recursive:true});
 await sharp({create:{width:1536,height:768,channels:4,background:'#151c24'}}).composite(await Promise.all(buffers.slice(0,2).map(async(input,i)=>({input:await sharp(input).resize(768).png().toBuffer(),left:i*768,top:0})))).png().toFile(path.join(qa,'recoil-neutral-peak.png'));
 console.log(JSON.stringify({version:m.version,frames:frames.length,motionBytes:motionAtlas.length,projectileBytes:packed.length,recoil:m.recoil},null,2));
}

