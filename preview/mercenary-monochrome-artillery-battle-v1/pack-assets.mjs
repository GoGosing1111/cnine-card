import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const cfg=JSON.parse(await fs.readFile(file('pose-registration-v2.json'))),locked=JSON.parse(await fs.readFile(file('assets/locked/rifle-provenance.json'))),weapon=await fs.readFile(file('assets/locked/approved-rifle.png'));
if(hash(weapon)!==locked.sha256)throw Error('Locked rifle changed');
for(const p of ['assets/frames','assets/atlases','assets/thumbs','qa'])await fs.mkdir(file(p),{recursive:true});
const manifest={version:2,date:'2026-10-15',name:null,rank:null,code:null,previewAdapterCode:'V-000',runtimeEnabled:false,status:'BATTLE_VISUAL_REVIEW_PENDING',sourceArt:'preview/monochrome-gunner-illustration-20261015-v1/monochrome-gunner-ballistic-aura-v3.png',sourceArtSha256:locked.sourceSha256,weapon:locked,motion:{},effects:{},displaySizing:{fullBodyHeight:300,physicalBodyHeight:300},runtime:{engine:'COMMON_V3',pixi:'8.20.0',gsap:'3.13.0',clock:'V3_REGISTERED_GSAP'},audio:{enabled:false,reason:'Silent visual review'},headHalo:{mandatory:true,separateLayer:true,anchor:'head',idleBody:'ready:0',noBodyWobble:true},rejectedSources:['body-aim.png','body-skill.png','body-command.png','body-move-rejected.png']};
function inside(x,y,p){let r=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;}
const canvas=cfg.canvas,clear=()=>sharp({create:{width:canvas,height:canvas,channels:4,background:'#00000000'}});
const thumbs=[];
for(const [key,d]of Object.entries(cfg.poses)){
 const input=await fs.readFile(file('assets/sources/'+d.source)),{data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const scale=cfg.physicalBodyHeight/cfg.bodyReferencePixels*1254/info.height,sx=info.width/1254,sy=info.height/1254;
 const raw=Buffer.from(data);for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(y/sy<d.clearAbove&&!inside(x/sx,y/sy,d.headOutline)&&!inside(x/sx,y/sy,d.bodyOutline)&&!(d.torsoFill&&inside(x/sx,y/sy,d.torsoFill)))raw[(y*info.width+x)*4+3]=0;
 const body=await sharp(raw,{raw:{width:info.width,height:info.height,channels:4}}).resize(Math.round(info.width*scale),Math.round(info.height*scale)).png().toBuffer();
 const foot={x:d.foot[0]*sx,y:d.foot[1]*sy},grip={x:d.grip[0]*sx,y:d.grip[1]*sy},head={x:d.head[0]*sx,y:d.head[1]*sy};
 const pivot=cfg.pivot,bodyLeft=Math.round(pivot.x-foot.x*scale),bodyTop=Math.round(pivot.y-foot.y*scale),gx=pivot.x+(grip.x-foot.x)*scale,gy=pivot.y+(grip.y-foot.y)*scale;
 const k=cfg.weaponUniformScale,rot=d.angle-locked.axisDegrees,rad=rot*Math.PI/180,sw=Math.round(locked.width*k),sh=Math.round(locked.height*k);
 const wp=await sharp(weapon).resize(sw,sh).rotate(rot,{background:'#00000000'}).png().toBuffer(),wm=await sharp(wp).metadata();
 const transform=p=>({x:wm.width/2+(p.x*k-sw/2)*Math.cos(rad)-(p.y*k-sh/2)*Math.sin(rad),y:wm.height/2+(p.x*k-sw/2)*Math.sin(rad)+(p.y*k-sh/2)*Math.cos(rad)});
 const g=transform(locked.grip),m=transform(locked.muzzle),wx=Math.round(gx-g.x),wy=Math.round(gy-g.y);
 if(Math.min(bodyLeft,bodyTop,wx,wy)<0||wx+wm.width>canvas||wy+wm.height>canvas)throw Error(key+' canvas clipping');
 const handRaw=Buffer.alloc(data.length);const hands=[d.grip,...(d.support?[d.support]:[])];for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(hands.some(h=>((x/sx-h[0])/47)**2+((y/sy-h[1])/37)**2<=1)){const i=(y*info.width+x)*4;raw.copy(handRaw,i,i,i+4);}
 const hand=await sharp(handRaw,{raw:{width:info.width,height:info.height,channels:4}}).resize(Math.round(info.width*scale),Math.round(info.height*scale)).png().toBuffer();
 const buf=await clear().composite([{input:body,left:bodyLeft,top:bodyTop},{input:wp,left:wx,top:wy},{input:hand,left:bodyLeft,top:bodyTop}]).png().toBuffer(),path='assets/frames/'+key+'-0.png';await fs.writeFile(file(path),buf);
 const frame={index:0,file:path,sha256:hash(buf),source:'assets/sources/'+d.source,sourceSha256:hash(input),bodyPixels:cfg.physicalBodyHeight,footAnchor:{x:pivot.x/canvas,y:pivot.y/canvas},grip:{x:gx,y:gy},head:{x:pivot.x+(head.x-foot.x)*scale,y:pivot.y+(head.y-foot.y)*scale},muzzle:{x:wx+m.x,y:wy+m.y},weaponAxisRadians:d.angle*Math.PI/180,weapon:{sha256:locked.sha256,uniformScale:k,rotationDegrees:rot,redrawnPixels:0},handOverlay:true};
 const atlas='assets/atlases/'+key+'.png';await fs.writeFile(file(atlas),buf);manifest.motion[key]={atlas,sha256:hash(buf),columns:1,rows:1,cellSize:canvas,frameCount:1,frames:[frame]};
 const thumb=await sharp(buf).resize(512,512).flatten({background:'#111b28'}).png().toBuffer();await fs.writeFile(file('assets/thumbs/'+key+'.png'),thumb);thumbs.push(thumb);
}
for(const [key,spec]of Object.entries(cfg.effects)){
 const bytes=await fs.readFile(file('assets/sources/'+key+'.png')),meta=await sharp(bytes).metadata(),cw=meta.width/4,ch=meta.height/3,frames=[],buffers=[],cell=416,pad=27;
 if(!Number.isInteger(cw)||cw!==ch)throw Error('Effect grid not square '+key);
 for(let i=0;i<12;i++){
  const sourceRect={left:i%4*cw,top:Math.floor(i/4)*ch,width:cw,height:ch},buf=await sharp(bytes).extract(sourceRect).extend({top:pad,bottom:pad,left:pad,right:pad,background:'#00000000'}).png().toBuffer(),path=`assets/frames/${key}-${i}.png`;await fs.writeFile(file(path),buf);buffers.push(buf);
  const toP=([x,y])=>({x:(pad+x*cw)/cell,y:(pad+y*ch)/cell});frames.push({index:i,file:path,sha256:hash(buf),sourceRect,anchor:toP(spec.anchors?.[i]||spec.anchor),muzzle:spec.muzzle?toP(spec.muzzle[i]):undefined,barrelAngleRadians:spec.barrelAngleDegrees?spec.barrelAngleDegrees*Math.PI/180:undefined});
 }
 const atlas=`assets/atlases/${key}.png`,buf=await sharp({create:{width:cell*4,height:cell*3,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%4*cell,top:Math.floor(i/4)*cell}))).png().toBuffer();await fs.writeFile(file(atlas),buf);manifest.effects[key]={atlas,sha256:hash(buf),columns:4,rows:3,cellSize:cell,frameCount:12,sourceSha256:hash(bytes),frames};
}
await fs.copyFile(file('assets/frames/ready-0.png'),file('assets/battle-sprite.png'));
manifest.battleSprite='preview/mercenary-monochrome-artillery-battle-v1/assets/battle-sprite.png';manifest.battleSpriteSha256=hash(await fs.readFile(file('assets/battle-sprite.png')));manifest.battleSpriteFootAnchor=manifest.motion.ready.frames[0].footAnchor;manifest.battleSpriteStatus='PREVIEW_PREPARED_AWAITING_APPROVAL';manifest.counts={motion:5,effects:60};
await sharp(file('assets/sources/approved-art-v3.png')).resize({width:512}).webp({quality:92}).toFile(file('assets/source-art-preview.webp'));
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await sharp({create:{width:1536,height:1024,channels:4,background:'#111b28'}}).composite(thumbs.map((input,i)=>({input,left:i%3*512,top:Math.floor(i/3)*512}))).png().toFile(file('qa/body-contact-sheet.png'));
console.log(manifest.counts);
