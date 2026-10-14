import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
try{await fs.copyFile(file('manifest.json'),file('manifest-v2.json'),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
const m=JSON.parse(await fs.readFile(file('manifest-v2.json'))),cfg=JSON.parse(await fs.readFile(file('pose-registration-v2.json'))),d=cfg.poses.ready,weapon=await fs.readFile(file('assets/locked/approved-rifle.png')),locked=m.weapon;
const base=await sharp(file('assets/sources/body-ready-v2.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sheet=await fs.readFile(file('assets/sources/ar-micro-recoil-v3.png')),meta=await sharp(sheet).metadata(),cw=meta.width/2,ch=meta.height/2,source=[];
for(let i=0;i<4;i++)source.push(await sharp(sheet).extract({left:i%2*cw,top:Math.floor(i/2)*ch,width:cw,height:ch}).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
const inside=(x,y,p)=>{let r=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;};
// Keep face, hair, hips, legs and coat byte-identical. Only the newly authored arm/shoulder area changes.
const patch=[[427,306],[492,297],[535,332],[585,346],[653,340],[699,319],[747,342],[790,378],[834,386],[870,347],[945,342],[971,385],[947,427],[911,444],[858,514],[790,540],[742,505],[714,469],[674,484],[645,550],[515,550],[491,492],[427,471],[377,447],[364,387],[390,342]];
const rawBase=Buffer.from(base.data);for(let y=0;y<1254;y++)for(let x=0;x<1254;x++)if(y<d.clearAbove&&!inside(x,y,d.headOutline)&&!inside(x,y,d.bodyOutline)&&!inside(x,y,d.torsoFill))rawBase[(y*1254+x)*4+3]=0;
const gray=(a,x,y)=>{if(x<0||y<0||x>=cw||y>=ch)return 0;const i=(y*cw+x)*4;return(a[i]+a[i+1]+a[i+2])/3*a[i+3]/255;};
function align(a){let best={score:Infinity,dx:0,dy:0};for(let dy=-18;dy<=18;dy++)for(let dx=-26;dx<=26;dx++){let score=0;for(let y=105;y<165;y+=2)for(let x=326;x<391;x+=2)score+=Math.abs(gray(source[0].data,x,y)-gray(a,x+dx,y+dy));if(score<best.score)best={score,dx,dy};}return best;}
const scale=720/1065,canvas=1536,pivot={x:600,y:1300},bodyLeft=Math.round(pivot.x-d.foot[0]*scale),bodyTop=Math.round(pivot.y-d.foot[1]*scale),frames=[],buffers=[],regs=[];
for(let n=0;n<4;n++){
 const a=align(source[n].data),micro=[0,-5,-3,0][n],arm=Buffer.from(rawBase);
 for(let y=306;y<550;y++)for(let x=364;x<972;x++)if(inside(x,y,patch)&&!inside(x,y,d.headOutline)){
  const sx=Math.round((x+111-micro)/2+a.dx),sy=Math.round(y/2+a.dy),i=(y*1254+x)*4,j=(sy*cw+sx)*4;
  if(sx>=0&&sy>=0&&sx<cw&&sy<ch)source[n].data.copy(arm,i,j,j+4);
 }
 // Restore fixed torso below the arm articulation; feet/head/coat never come from the sheet.
 const body=await sharp(arm,{raw:{width:1254,height:1254,channels:4}}).resize(Math.round(1254*scale)).png().toBuffer();
 const sourceGrip={x:699+micro,y:400},gx=pivot.x+(sourceGrip.x-d.foot[0])*scale,gy=pivot.y+(sourceGrip.y-d.foot[1])*scale;
 const rot=-locked.axisDegrees,k=.68,rad=rot*Math.PI/180,sw=Math.round(locked.width*k),sh=Math.round(locked.height*k),wp=await sharp(weapon).resize(sw,sh).rotate(rot,{background:'#00000000'}).png().toBuffer(),wm=await sharp(wp).metadata();
 const transform=p=>({x:wm.width/2+(p.x*k-sw/2)*Math.cos(rad)-(p.y*k-sh/2)*Math.sin(rad),y:wm.height/2+(p.x*k-sw/2)*Math.sin(rad)+(p.y*k-sh/2)*Math.cos(rad)}),g=transform(locked.grip),z=transform(locked.muzzle),wx=Math.round(gx-g.x),wy=Math.round(gy-g.y);
 const handRaw=Buffer.alloc(arm.length);for(let y=340;y<475;y++)for(let x=600;x<1000;x++)if([[699+micro,400],[913+micro,398]].some(([hx,hy])=>((x-hx)/43)**2+((y-hy)/33)**2<1)){const i=(y*1254+x)*4;arm.copy(handRaw,i,i,i+4);}
 const hands=await sharp(handRaw,{raw:{width:1254,height:1254,channels:4}}).resize(Math.round(1254*scale)).png().toBuffer(),buf=await sharp({create:{width:canvas,height:canvas,channels:4,background:'#00000000'}}).composite([{input:body,left:bodyLeft,top:bodyTop},{input:wp,left:wx,top:wy},{input:hands,left:bodyLeft,top:bodyTop}]).png().toBuffer(),path=`assets/frames/ar-v3-${n}.png`;await fs.writeFile(file(path),buf);buffers.push(buf);
 frames.push({...m.motion.ready.frames[0],index:n,file:path,sha256:hash(buf),source:'assets/sources/ar-micro-recoil-v3.png',sourceSha256:hash(sheet),grip:{x:gx,y:gy},muzzle:{x:wx+z.x,y:wy+z.y},handOverlay:true,bodyPatchOnly:true});regs.push({frame:n,sourceCell:{x:n%2*cw,y:Math.floor(n/2)*ch,width:cw,height:ch},alignment:a,sourceGrip,microRecoilSourcePixels:micro,headAndLowerBodySource:'body-ready-v2.png'});
}
const atlas='assets/atlases/ar-v3.png',atlasBytes=await sharp({create:{width:3072,height:3072,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%2*1536,top:Math.floor(i/2)*1536}))).png().toBuffer();await fs.writeFile(file(atlas),atlasBytes);m.motion.ar={atlas,sha256:hash(atlasBytes),columns:2,rows:2,cellSize:1536,frameCount:4,frames};
for(const key of ['ready','brace','recoil','commandPoint','commandFire'])m.motion[key].previewEnabled=false;
m.version=3;m.revision='AR_AUTO_CENTRAL_BARRAGE_V3';m.headHalo.idleBody='ar:0';m.battleSprite='preview/mercenary-monochrome-artillery-battle-v1/assets/frames/ar-v3-0.png';m.battleSpriteSha256=frames[0].sha256;m.arRecoil={fixedHead:true,fixedFeet:true,fixedCoat:true,bodyPatchOnly:true,maxSourceGripDelta:5,shotsPerSecond:9};m.counts={motion:4,retainedMotion:5,effects:60};
await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');await fs.writeFile(file('pose-registration-ar-v3.json'),JSON.stringify({version:3,patch,frames:regs,weaponUniformScale:.68},null,2)+'\n');
await sharp({create:{width:1536,height:1536,channels:4,background:'#111821'}}).composite(await Promise.all(buffers.map(async(input,i)=>({input:await sharp(input).resize(768).png().toBuffer(),left:i%2*768,top:Math.floor(i/2)*768})))).png().toFile(file('qa/ar-v3/body-contact-sheet.png'));
console.log(regs.map(r=>({frame:r.frame,alignment:r.alignment,micro:r.microRecoilSourcePixels})));
