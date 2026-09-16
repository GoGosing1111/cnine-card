import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {approvedSuits,weaponFits,atlasPairs,transformExactWeapon} from './resource-config.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),asset=path.join(here,'assets');
const CW=1280,CH=1536,W=384,H=512,baseline=479,phases=['ready','fire','recoil','recover'];
const filter=process.argv[2],partial=process.argv.includes('--partial');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const url=p=>'/'+path.relative(root,p).split(path.sep).join('/');
const png=data=>sharp(data,{raw:{width:CW,height:CH,channels:4}}).png().toBuffer();
const live=JSON.parse(await readFile(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8'));
const handBoxes={
 's-body':[
  [[432,348,550,444],[719,315,821,421]],
  [[446,325,573,414],[755,295,849,383]],
  [[422,328,540,418],[729,303,832,386]],
  [[415,369,548,458],[789,361,889,440]],
  [[408,361,554,450],[773,334,884,425]],
  [[429,377,566,472],[778,344,895,443]]
 ],
 'z-body':[
  [[415,373,553,468],[700,333,807,435]],
  [[412,379,550,473],[701,357,792,444]],
  [[413,385,561,483],[757,348,855,452]],
  [[390,330,560,480],[745,315,890,458]],
  [[390,330,560,480],[720,300,885,450]],
  [[390,330,565,485],[760,310,945,468]]
 ]
};
function inPolygon(x,y,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const[a,b]=pts[i],[c,d]=pts[j];if(((b>y)!==(d>y))&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;}
function bounds(data,width,height){let x0=width,y0=height,x1=-1,y1=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=16){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x1<0)throw Error('EMPTY_SPRITE');return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1,bottom:y1};}
function keyMatte(data){const green=new Uint8Array(CW*CH);let keyed=0;for(let p=0;p<green.length;p++){const o=p*4,r=data[o],g=data[o+1],b=data[o+2];if(Math.min(r,b)-g>35&&Math.max(r,b)>100){data.fill(0,o,o+4);keyed++;}else if(g>80&&g>r*1.3&&g>b*1.3)green[p]=1;}
 for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){let erase=false;for(let dy=-1;dy<=1&&!erase;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<CW&&y+dy>=0&&y+dy<CH&&green[(y+dy)*CW+x+dx]){erase=true;break;}if(erase)data.fill(0,(y*CW+x)*4,(y*CW+x)*4+4);}
 return {green,keyed};}
// AI may translate the matte despite a coordinate lock. Recover a WHOLE-GUN
// translation only. The approved H-BODY width, rotation and aspect never change.
async function registerProxy(exact,green){const {data,info}=await sharp(exact.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});const samples=[];for(let y=0;y<info.height;y+=6)for(let x=0;x<info.width;x+=6)if(data[(y*info.width+x)*4+3]>160)samples.push([x+exact.placement.left,y+exact.placement.top]);
 const score=(dx,dy)=>{let hit=0;for(const[x,y]of samples){const a=x+dx,b=y+dy;if(a>=0&&a<CW&&b>=0&&b<CH&&green[b*CW+a])hit++;}return hit/samples.length-(Math.abs(dx)+Math.abs(dy))*.00003;};
 let best={dx:0,dy:0,score:score(0,0)};for(let dy=-90;dy<=40;dy+=4)for(let dx=-32;dx<=80;dx+=4){const s=score(dx,dy);if(s>best.score)best={dx,dy,score:s};}
 const coarse={...best};for(let dy=coarse.dy-3;dy<=coarse.dy+3;dy++)for(let dx=coarse.dx-3;dx<=coarse.dx+3;dx++){const s=score(dx,dy);if(s>best.score)best={dx,dy,score:s};}
 return best;}
async function inspect(frame){const{data,info}=await sharp(frame).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=bounds(data,info.width,info.height);let transparent=0,sumX=0,count=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=data[(y*W+x)*4+3];if(a<16)transparent++;else if(y>b.bottom-9){sumX+=x;count++;}}
 return {bounds:b,pivot:{x:sumX/count/W,y:b.bottom/H},transparentPixels:transparent};}
async function fitSprite(full,muzzle){const{data,info}=await sharp(full).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=bounds(data,info.width,info.height),scale=Math.min(374/b.width,440/b.height),width=Math.round(b.width*scale),height=Math.round(b.height*scale),left=Math.floor((W-width)/2),top=baseline-height+1;
 const cut=await sharp(full).extract({left:b.left,top:b.top,width:b.width,height:b.height}).resize(width,height).png().toBuffer();
 const frame=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:cut,left,top}]).png().toBuffer();
 return {frame,sourceBounds:b,frameTransform:{left,top,width,height,sourceBounds:b},muzzle:muzzle?{x:(left+(muzzle.x-b.left)*width/b.width)/W,y:(top+(muzzle.y-b.top)*height/b.height)/H}:null};}
async function compose(suit,index){const spec=weaponFits[index],posePath=path.join(asset,'sources',`${suit.id}-${spec.id}-pose-v1.png`);await access(posePath);const pose=await readFile(posePath),meta=await sharp(pose).metadata();
 if(Math.abs(meta.width/meta.height-CW/CH)>.001)throw Error('POSE_ASPECT_RATIO_DRIFT');
 const {data}=await sharp(pose).resize({width:CW}).ensureAlpha().raw().toBuffer({resolveWithObject:true});const original=await sharp(path.join(asset,'prepared',`${suit.id}-canonical-alpha.png`)).ensureAlpha().raw().toBuffer();
 const {green,keyed}=keyMatte(data);if(keyed<CW*CH*.3)throw Error('MATTE_MISSING');
 const exact=await transformExactWeapon(spec),registration=await registerProxy(exact,green);
 const placement={...exact.placement,left:exact.placement.left+registration.dx,top:exact.placement.top+registration.dy};
 const hands=Buffer.alloc(data.length),boxes=handBoxes[suit.id][index];for(const[x0,y0,x1,y1]of boxes)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const o=(y*CW+x)*4;data.copy(hands,o,o,o+4);}
 let restored=0;
 const oldArms=[[[55,400],[225,400],[232,535],[215,645],[224,783],[55,788]],[[495,430],[610,430],[684,790],[551,790],[546,684],[522,620],[503,555]]];
 // Restore complete anatomical regions. Feather only the joins, never apply a
 // global color/contrast operation, and never bring the lowered hands back.
 for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
  const o=(y*CW+x)*4;
  const head=x>270&&x<495&&y<275?Math.min(1,(x-270)/8,(495-x)/8,(275-y)/18):0;
  const lower=y>535&&!oldArms.some(p=>inPolygon(x,y,p))?Math.min(1,(y-535)/34):0;
  const weight=Math.max(head,lower);
  if(weight>=1){original.copy(data,o,o,o+4);restored++;}
  else if(weight>0){for(let k=0;k<4;k++)data[o+k]=Math.round(data[o+k]*(1-weight)+original[o+k]*weight);}
  else if(!data[o+3]&&green[y*CW+x]&&!oldArms.some(p=>inPolygon(x,y,p)))original.copy(data,o,o,o+4);
 }
 const foreground=await png(hands),body=await png(data),full=await sharp(body).composite([{input:exact.buffer,left:placement.left,top:placement.top},{input:foreground,left:0,top:0}]).png().toBuffer();
 const fullFile=path.join(asset,'sprites',`${suit.id}-${spec.id}-full-v1.png`);await writeFile(fullFile,full);await writeFile(path.join(asset,'prepared',`${suit.id}-${spec.id}-hands-alpha.png`),foreground);
 const p=exact.point(spec.muzzle),bore=exact.point(spec.bore),muzzle={x:p.x+registration.dx,y:p.y+registration.dy},fitted=await fitSprite(full,muzzle),frameFile=path.join(asset,'sprites',`${suit.id}-${spec.id}-v1.png`);await writeFile(frameFile,fitted.frame);
 const weapon=live.weapons[index],bytes=await readFile(path.join(root,weapon.battleSprite.slice(1)));if(sha(bytes)!==weapon.sha256)throw Error('WEAPON_SOURCE_CHANGED');
 return {weaponCode:weapon.equipmentCode,weaponName:weapon.name,weaponIndex:index,id:spec.id,image:url(frameFile),sha256:sha(fitted.frame),highResolution:url(fullFile),highResolutionSha256:sha(full),diagnostics:await inspect(fitted.frame),authored:{source:weapon.battleSprite,sha256:weapon.sha256,bodySource:url(posePath),bodySha256:sha(pose),composition:'EXACT_WEAPON_RASTER_WITH_HAND_OCCLUSION',weaponRasterCopied:true,uniformScaleOnly:true,placement,proxyRegistration:registration,sourceMuzzle:muzzle,frameTransform:fitted.frameTransform,handBoxes:boxes,restoredOriginalPixels:restored,colorPolicy:'APPROVED_HEAD_LOWER_BODY_RGB_LOCK_NO_GLOBAL_RETOUCH',aimAxisDegrees:Math.atan2(p.y-bore.y,p.x-bore.x)*180/Math.PI,weaponLengthToFigureHeight:spec.width/fitted.sourceBounds.height},_frame:fitted.frame,_muzzle:fitted.muzzle};
}
for(const d of['prepared','sprites','atlases'])await mkdir(path.join(asset,d),{recursive:true});
const manifest={version:'S_Z_BODY_EXACT_WEAPONS_V1',status:'RESOURCE_QA_IN_PROGRESS',scope:'PREVIEW_ONLY',liveEnabled:false,approvedOrder:['H-BODY','S-BODY','Z-BODY'],artApproval:'USER_APPROVED_20260916',generationTool:'built-in image_gen',runtimeModule:'/preview/project-v-v3/source/battle/AccountBattleUnit.js',animationContract:{...live.animationContract,staticPosePolicy:'REPEAT_AUTHORED_READY_POSE_RUNTIME_BALLISTIC_FX',poseAnimation:false},weapons:live.weapons,suits:[]};
for(const suit of approvedSuits.filter(s=>!filter||filter.startsWith('--')||s.id===filter)){
 if(sha(await readFile(path.join(asset,'sources',suit.source)))!==suit.sha256)throw Error('APPROVED_SOURCE_CHANGED');
 const entries=[];for(let i=0;i<6;i++){try{entries.push(await compose(suit,i));}catch(e){if(partial&&e.code==='ENOENT')continue;throw e;}}
 for(const[pair,a,b]of atlasPairs){const rows=[entries.find(e=>e.weaponIndex===a),entries.find(e=>e.weaponIndex===b)];if(rows.some(e=>!e))continue;const atlasFile=path.join(asset,'atlases',`${suit.id}-${pair}-v1.png`),atlas=await sharp({create:{width:W*4,height:H*2,channels:4,background:'#00000000'}}).composite(rows.flatMap((e,row)=>phases.map((_,column)=>({input:e._frame,left:column*W,top:row*H})))).png().toBuffer();await writeFile(atlasFile,atlas);
 for(const[e,row]of rows.map((e,row)=>[e,row])){const frame=await sharp(atlas).extract({left:0,top:row*H,width:W,height:H}).png().toBuffer();await writeFile(path.join(root,e.image.slice(1)),frame);e.sha256=sha(frame);e.diagnostics=await inspect(frame);e.atlasSha256=sha(atlas);e.profile={suitCode:suit.code,weaponCode:e.weaponCode,sheetUrl:url(atlasFile),row,grid:{columns:4,rows:2},frameOrder:phases,frames:Object.fromEntries(phases.map((p,column)=>[p,{column,row}])),durationsMs:live.animationContract.durationsMs,pivots:Object.fromEntries(phases.map(p=>[p,e.diagnostics.pivot])),contentBottom:e.diagnostics.pivot.y,nameHud:{contentTop:e.diagnostics.bounds.top/H,gap:18},muzzle:{frame:'fire',...e._muzzle,unit:'NORMALIZED_FRAME'}};}}
 for(const e of entries){delete e._frame;delete e._muzzle;}
 const unarmed=await fitSprite(await readFile(path.join(asset,'prepared',`${suit.id}-canonical-alpha.png`)));const unarmedFile=path.join(asset,'sprites',`${suit.id}-unarmed-v1.png`);await writeFile(unarmedFile,unarmed.frame);
 manifest.suits.push({...suit,source:url(path.join(asset,'sources',suit.source)),unarmed:url(unarmedFile),entries});
}
await writeFile(path.join(here,filter&&!filter.startsWith('--')?`manifest-${filter}.json`:'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest.suits.map(s=>({id:s.id,entries:s.entries.map(e=>({id:e.id,registration:e.authored.proxyRegistration}))}))));
