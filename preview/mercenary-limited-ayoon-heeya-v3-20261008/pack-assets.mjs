// Authorized technical compositor: source RGBA selection, uniform scale/rotation,
// registered feet/grip/muzzles and atlas packing. No painted replacement pixels.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {components,file,root} from './inspect-assets.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const cfg=JSON.parse(await fs.readFile(file('pose-registration.json')));
const locks=JSON.parse(await fs.readFile(file('weapon-lock.json')));
const manifest={version:'20261008-limited-duo-v1',visualApproval:'TECHNICAL_REVIEW',damageAuthority:'SERVER_ONLY',characters:{}};
await fs.mkdir(file('assets/runtime'),{recursive:true});await fs.mkdir(file('assets/frames'),{recursive:true});
for(const id of ['ayoon','heeya']){
 const c=cfg[id],lock=locks[id],weapon=await fs.readFile(file('assets/locked/'+id+'-weapon.png')),wm=await sharp(weapon).metadata();
 const frames=[],composites=[];
 for(const sheet of c.sheets){
  const src=file('assets/sources/'+id+'-'+sheet.id+'.png'),{data,info,main,parts}=await components(src);
  if(main.length!==4)throw Error(id+sheet.id+': four separated bodies required');
  for(let n=0;n<4;n++){
   const p=sheet.poses[n],part=main[n],mask=new Set(part.pixels);
   // Preserve nearby alpha fringe and detached fine hair inside this body's vicinity.
   for(const extra of parts.filter(x=>x.count<=15000)){
    const cx=(extra.left+extra.right)/2,cy=(extra.top+extra.bottom)/2;
    const owner=main.map((b,i)=>({i,d:Math.hypot(cx-(b.left+b.right)/2,cy-(b.top+b.bottom)/2)})).sort((a,b)=>a.d-b.d)[0];
    if(owner.i===n)for(const pixel of extra.pixels)mask.add(pixel);
   }
   const scale=cfg.bodyScale*c.referenceHeight/sheet.referenceHeight;
   const bodyRaw=Buffer.alloc(info.width*info.height*4);
   for(const pix of mask)data.copy(bodyRaw,pix*4,pix*4,pix*4+4);
   const body=await sharp(bodyRaw,{raw:{width:info.width,height:info.height,channels:4}}).trim({threshold:0}).png().toBuffer(),bm=await sharp(body).metadata();
   // The generated top/left are retained for registration, never stretch a crouch.
   const selected=[...mask],left=Math.min(...main.filter((_,i)=>i===n).map(b=>b.left)),top=part.top;
   let minX=info.width,minY=info.height;
   for(const pix of selected){minX=Math.min(minX,pix%info.width);minY=Math.min(minY,Math.floor(pix/info.width));}
   const bodyW=Math.round(bm.width*scale),bodyH=Math.round(bm.height*scale);
   const bx=Math.round(cfg.foot[0]+(minX-p.feet[0])*scale),by=Math.round(cfg.foot[1]+(minY-p.feet[1])*scale);
   const bodyPng=await sharp(body).resize(bodyW,bodyH).png().toBuffer();
   const ws=sheet.referenceHeight/lock.bodyHeight*scale,rad=p.angle*Math.PI/180;
   const rotate=point=>({x:(point[0]-lock.anchor[0])*ws*Math.cos(rad)-(point[1]-lock.anchor[1])*ws*Math.sin(rad),y:(point[0]-lock.anchor[0])*ws*Math.sin(rad)+(point[1]-lock.anchor[1])*ws*Math.cos(rad)});
   const hand={x:cfg.foot[0]+(p.anchor[0]-p.feet[0])*scale,y:cfg.foot[1]+(p.anchor[1]-p.feet[1])*scale};
   const scaled=await sharp(weapon).resize(Math.round(wm.width*ws),Math.round(wm.height*ws)).rotate(p.angle,{background:'#00000000'}).png().toBuffer(),sm=await sharp(scaled).metadata();
   const origin=rotate([wm.width/2,wm.height/2]);
   const wx=Math.round(hand.x+origin.x-sm.width/2),wy=Math.round(hand.y+origin.y-sm.height/2);
   if(Math.min(bx,by,wx,wy)<0||Math.max(bx+bodyW,wx+sm.width)>cfg.cell||Math.max(by+bodyH,wy+sm.height)>cfg.cell)throw Error(id+sheet.id+n+': clipping '+[bx,by,wx,wy,bodyW,bodyH,sm.width,sm.height]);
   const output=await sharp({create:{width:cfg.cell,height:cfg.cell,channels:4,background:'#00000000'}}).composite([{input:scaled,left:wx,top:wy},{input:bodyPng,left:bx,top:by}]).png().toBuffer();
   const index=frames.length,coord=v=>{const q=rotate(v);return{x:hand.x+q.x,y:hand.y+q.y};};
   const name=id+'-'+String(index).padStart(2,'0')+'.png';await fs.writeFile(file('assets/frames/'+name),output);
   frames.push({index,group:sheet.id,pose:n,rect:{x:(index%4)*cfg.cell,y:Math.floor(index/4)*cfg.cell,width:cfg.cell,height:cfg.cell},feet:{x:cfg.foot[0],y:cfg.foot[1]},bodyScale:scale,weaponScale:ws,weaponAngle:p.angle,hand,contact:lock.contact?coord(lock.contact):null,tip:lock.tip?coord(lock.tip):null,muzzles:lock.muzzles?.map(coord),axisBack:lock.axisBack?.map(coord),sha256:sha(output),source:'assets/sources/'+id+'-'+sheet.id+'.png',weaponSha256:sha(weapon)});
   composites.push({input:output,left:(index%4)*cfg.cell,top:Math.floor(index/4)*cfg.cell});
  }
 }
 const atlas=await sharp({create:{width:cfg.cell*4,height:cfg.cell*3,channels:4,background:'#00000000'}}).composite(composites).png().toBuffer();
 await fs.writeFile(file('assets/runtime/'+id+'-motion.png'),atlas);
 const idle=await fs.readFile(file('assets/frames/'+id+'-00.png'));await fs.writeFile(file('assets/runtime/'+id+'-idle.png'),idle);
 const effectPath='assets/sources/'+id+'-fx.png',effectsMeta=await sharp(file(effectPath)).metadata();
 const effectFrames=Array.from({length:12},(_,i)=>{const x0=Math.round(i%4*effectsMeta.width/4),y0=Math.round(Math.floor(i/4)*effectsMeta.height/3);return{rect:{x:x0,y:y0,width:Math.round((i%4+1)*effectsMeta.width/4)-x0,height:Math.round((Math.floor(i/4)+1)*effectsMeta.height/3)-y0}};});
 const base='/preview/mercenary-limited-ayoon-heeya-v3-20261008/';
 manifest.characters[id]={code:id==='ayoon'?'V-997':'V-998',name:id==='ayoon'?'아윤':'하이희야',source:lock.source,sourceSha256:lock.sha256,sprite:base+'assets/runtime/'+id+'-idle.png',spriteSha256:sha(idle),atlas:base+'assets/runtime/'+id+'-motion.png',atlasSha256:sha(atlas),cell:cfg.cell,feet:{x:cfg.foot[0],y:cfg.foot[1]},bodyHeight:c.referenceHeight*cfg.bodyScale,frames,effects:{url:base+effectPath,width:effectsMeta.width,height:effectsMeta.height,frames:effectFrames}};
}
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const id of ['ayoon','heeya']){
 const thumbs=await Promise.all(Array.from({length:12},async(_,i)=>({input:await sharp(file('assets/frames/'+id+'-'+String(i).padStart(2,'0')+'.png')).resize(256,256).png().toBuffer(),left:i%4*256,top:Math.floor(i/4)*256})));
 await sharp({create:{width:1024,height:768,channels:4,background:'#18202f'}}).composite(thumbs).png().toFile(file(id+'-contact-sheet.png'));
}
console.log('Packed 24 registered full-body poses and 24 effect frames.');
