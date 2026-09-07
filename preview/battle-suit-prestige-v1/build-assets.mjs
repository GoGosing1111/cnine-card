import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {fits,transformExactWeapon} from './exact-weapon-fit.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const asset=path.join(here,'assets');
const W=384,H=512,baseline=479;
const phases=['ready','fire','recoil','recover'];
const live=JSON.parse(await readFile(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const url=p=>'/'+path.relative(root,p).split(path.sep).join('/');
const suits=[
  {id:'helios',name:'백색 · 엠버 코어',accent:'#ffb14a',source:'helios-proxy-source.png',description:'백색 판금 · 주황 코어 · 트윈 크레스트'}
];
const pairs=[['m4a1-m200',0,2],['ak-sks',1,3],['gilded-dragon',4,5]];
const authored={
  2:{source:'helios-m200-authored-v2.png',matte:'CONNECTED_LIGHT',approval:'USER_APPROVED_20260908',muzzle:[1059,354],stock:[237,354]}
};
// Calibrated to the supporting fingertips, not the proxy's magazine centroid.
const gripYOffsets=[8,4,8,9,7,6];
for(const dir of ['sources','prepared','sprites','atlases'])await mkdir(path.join(asset,dir),{recursive:true});

// User-authorized technical matte extraction. Unlike a neutral-white key,
// this chroma matte preserves every white armor plate and enclosed limb gap.
function keyMagenta(data){
  let removed=0;
  for(let o=0;o<data.length;o+=4){
    const r=data[o],g=data[o+1],b=data[o+2];
    const difference=Math.min(r,b)-g;
    if(difference>35&&Math.max(r,b)>100){data.fill(0,o,o+4);removed++;}
    else if(difference>8){
      // Remove only keyed edge spill; neutral pearl-white and cyan stay intact.
      data[o]=Math.max(g,r-difference);data[o+2]=Math.max(g,b-difference);
    }
    if(data[o+3]===0)data.fill(0,o,o+4);
  }
  return removed;
}
function bounds(data,width,height){
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=16){
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  }
  if(x1<0)throw Error('EMPTY_SPRITE');
  return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1,bottom:y1};
}
async function prepareProxy(suit){
  const sourcePath=path.join(asset,'sources',suit.source);
  const bytes=await readFile(sourcePath);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const removed=keyMagenta(data);
  if(removed<info.width*info.height*.1)throw Error('SOURCE_CHROMA_MATTE_MISSING');
  const b=bounds(data,info.width,info.height);
  const scale=Math.min(374/b.width,440/b.height);
  const width=Math.round(b.width*scale),height=Math.round(b.height*scale);
  const crop=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
    .extract({left:b.left,top:b.top,width:b.width,height:b.height})
    .resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
  const raw=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}})
    .composite([{input:crop,left:Math.floor((W-width)/2),top:baseline-height+1}]).raw().toBuffer();
  // The legacy compositor measures every green RGB pixel, even transparent
  // Lanczos fringes. Restrict its proxy to the opaque, saturated gun region.
  let gx0=W,gy0=H,gx1=0,gy1=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const o=(y*W+x)*4;
    if(raw[o+3]>64&&raw[o+1]>130&&raw[o]<90&&raw[o+2]<90){
      gx0=Math.min(gx0,x);gy0=Math.min(gy0,y);gx1=Math.max(gx1,x);gy1=Math.max(gy1,y);
    }
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const o=(y*W+x)*4,r=raw[o],g=raw[o+1],blue=raw[o+2];
    if(raw[o+3]<16){raw.fill(0,o,o+4);continue;}
    const legacyGreen=g>=45&&g>=r*1.18&&g>=blue*1.12&&g-Math.max(r,blue)>=12;
    if(legacyGreen&&(x<gx0-1||x>gx1+1||y<gy0-1||y>gy1+1)){raw[o]=g;raw[o+2]=g;}
  }
  const frame=await sharp(raw,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
  const file=path.join(asset,'prepared',`${suit.id}-proxy-atlas.png`);
  await sharp({create:{width:W*4,height:H*2,channels:4,background:'#00000000'}})
    .composite(Array.from({length:8},(_,i)=>({input:frame,left:(i%4)*W,top:Math.floor(i/4)*H})))
    .png({compressionLevel:9}).toFile(file);
  return {file,sourceHash:sha(bytes),keyedPixels:removed,sourceDimensions:[info.width,info.height]};
}
async function inspectFrame(buffer){
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=bounds(data,info.width,info.height);
  let sumX=0,count=0,transparent=0,green=0,magenta=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const o=(y*W+x)*4,r=data[o],g=data[o+1],blue=data[o+2],a=data[o+3];
    if(a<16){transparent++;continue;}
    if(y>b.bottom-9){sumX+=x;count++;}
    if(g>r+35&&g>blue+35)green++;
    if(Math.min(r,blue)>g+45)magenta++;
  }
  return {bounds:b,pivot:{x:sumX/count/W,y:b.bottom/H},transparentPixels:transparent,greenPixels:green,magentaPixels:magenta};
}
async function prepareAuthored(index){
  const spec=authored[index],sourcePath=path.join(asset,'sources',spec.source),bytes=await readFile(sourcePath);
  let input=bytes;
  if(spec.matte==='CONNECTED_LIGHT'){
    const output=path.join(asset,'prepared',`helios-${index}-authored-alpha.png`);
    execFileSync(process.execPath,[path.join(root,'scripts/remove-connected-light-background.cjs'),sourcePath,output]);
    input=await readFile(output);
  }
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let o=0;o<data.length;o+=4)if(data[o+3]===0)data.fill(0,o,o+4);
  const b=bounds(data,info.width,info.height),scale=Math.min(374/b.width,440/b.height);
  const width=Math.round(b.width*scale),height=Math.round(b.height*scale),left=Math.floor((W-width)/2),top=baseline-height+1;
  const cutout=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
    .extract({left:b.left,top:b.top,width:b.width,height:b.height})
    .resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
  const frame=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}})
    .composite([{input:cutout,left,top}]).png().toBuffer();
  const point=([x,y])=>({x:(left+(x-b.left)*width/b.width)/W,y:(top+(y-b.top)*height/b.height)/H});
  return {frame,muzzle:point(spec.muzzle),provenance:{source:url(sourcePath),sha256:sha(bytes),approval:spec.approval,
    composition:'IMAGEGEN_AUTHORED_INTEGRATED_GRIP',matte:spec.matte,weaponRasterCopied:false,
    uniformScaleOnly:true,sourceBounds:b,weaponLengthToFigureHeight:(spec.muzzle[0]-spec.stock[0])/b.height}};
}
function inPolygon(x,y,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
async function prepareExactFit(index){
  const spec=fits[index],sourcePath=path.join(asset,'sources',spec.body);
  const {data,info}=await sharp(sourcePath).resize(1280,1536,{fit:'fill',kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  keyMagenta(data);
  const green=new Uint8Array(info.width*info.height);
  for(let p=0;p<green.length;p++){const o=p*4;green[p]=data[o+3]>0&&data[o+1]>80&&data[o+1]>data[o]*1.3&&data[o+1]>data[o+2]*1.3?1:0;}
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    let remove=false;
    for(let dy=-1;dy<=1&&!remove;dy++)for(let dx=-1;dx<=1;dx++){
      if(x+dx>=0&&x+dx<info.width&&y+dy>=0&&y+dy<info.height&&green[(y+dy)*info.width+x+dx])remove=true;
    }
    if(remove)data.fill(0,(y*info.width+x)*4,(y*info.width+x)*4+4);
  }
  const hands=Buffer.alloc(data.length);
  const polygons=[
    [[376,386],[395,371],[461,374],[505,374],[531,389],[534,410],[516,422],[509,448],[493,465],[434,468],[382,447]],
    index===4?[[711,343],[730,316],[790,315],[820,337],[820,382],[797,411],[742,423],[710,397]]:
    index===3?[[740,337],[764,335],[830,352],[839,390],[817,424],[760,438],[730,415]]:
      [[751,360],[779,338],[855,339],[882,385],[873,414],[830,459],[766,449],[741,412]]
  ];
  for(let y=330;y<480;y++)for(let x=370;x<890;x++)if(polygons.some(p=>inPolygon(x,y,p))){const o=(y*info.width+x)*4;data.copy(hands,o,o,o+4);}
  const weapon=live.weapons[index],weaponPath=path.join(root,weapon.battleSprite.slice(1));
  const original=await readFile(weaponPath);if(sha(original)!==weapon.sha256)throw Error('WEAPON_SOURCE_CHANGED');
  // One uniform transform only: NEVER redraw, stretch a barrel, or fit the gun
  // to the old proxy's bounding box. Original receiver/barrel proportions stay locked.
  const exact=await transformExactWeapon(spec),placement=exact.placement;
  const rawSpec={raw:{width:info.width,height:info.height,channels:4}};
  const body=await sharp(data,rawSpec).png().toBuffer(),foreground=await sharp(hands,rawSpec).png().toBuffer();
  const combined=await sharp(body).composite([{input:exact.buffer,left:placement.left,top:placement.top},{input:foreground,left:0,top:0}]).raw().toBuffer();
  const b=bounds(combined,info.width,info.height),scale=Math.min(374/b.width,440/b.height);
  const width=Math.round(b.width*scale),height=Math.round(b.height*scale),left=Math.floor((W-width)/2),top=baseline-height+1;
  const crop=await sharp(combined,rawSpec).extract({left:b.left,top:b.top,width:b.width,height:b.height}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
  const frame=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:crop,left,top}]).png().toBuffer();
  const highResolution=path.join(asset,'sprites',`helios-${spec.id}-exact-full-v${index===4?7:6}.png`);
  await sharp(combined,rawSpec).png().toFile(highResolution);
  const muzzle=exact.point(spec.muzzle),bore=exact.point(spec.bore),muzzleSource=[muzzle.x,muzzle.y];
  return {frame,muzzle:{x:(left+(muzzleSource[0]-b.left)*width/b.width)/W,y:(top+(muzzleSource[1]-b.top)*height/b.height)/H},
    provenance:{source:weapon.battleSprite,sha256:weapon.sha256,bodySource:url(sourcePath),bodySha256:sha(await readFile(sourcePath)),approval:'USER_APPROVED_20260908',composition:'EXACT_WEAPON_RASTER_WITH_HAND_OCCLUSION',
      weaponRasterCopied:true,uniformScaleOnly:true,sourceBounds:b,placement,highResolution:url(highResolution),
      aimAxisDegrees:Math.atan2(muzzle.y-bore.y,muzzle.x-bore.x)*180/Math.PI,weaponLengthToFigureHeight:placement.width/b.height}};
}
const weaponInputs=[];
for(let i=0;i<live.weapons.length;i++){
  const weapon=live.weapons[i],input=path.join(root,weapon.battleSprite.slice(1));
  if(sha(await readFile(input))!==weapon.sha256)throw Error(`WEAPON_SOURCE_CHANGED:${weapon.name}`);
  // The existing exact-weapon compositor flops left-facing DB cutouts. The
  // newer gold-dragon cutouts already face right, so pre-flop them once.
  if(i>=4){
    const prepared=path.join(asset,'prepared',`weapon-${i}-left.png`);
    await sharp(input).flop().png().toFile(prepared);weaponInputs.push(prepared);
  }else weaponInputs.push(input);
}
const manifest={version:'HELIOS_LONG_WEAPON_FIT_V7',status:'USER_APPROVED_20260908',scope:'PREVIEW_ONLY',liveEnabled:false,
  approvedLiveEquipmentCode:'BATTLE_SUIT_H_BODY',liveConnectionApprovedAt:'2026-09-08',
  generationTool:'built-in image_gen',processingConsent:'2026-09-08 user: 기존 스크립트로 투명화·아틀라스 제작',
  animationContract:{...live.animationContract,staticPosePolicy:'REPEAT_AUTHORED_READY_POSE_RUNTIME_BALLISTIC_FX',poseAnimation:false},
  runtimeModule:'/preview/project-v-v3/source/battle/AccountBattleUnit.js',
  compositor:'scripts/compose-exact-battle-suit-weapons.cjs',suits:[],weapons:live.weapons};
for(const suit of suits){
  const prepared=await prepareProxy(suit),entries=[];
  const integrated=new Map(await Promise.all(Object.keys(authored).map(async key=>[Number(key),await prepareAuthored(Number(key))])));
  for(const index of [3,4,5])integrated.set(index,await prepareExactFit(index));
  for(const [pair,a,b] of pairs){
    const atlas=path.join(asset,'atlases',`${suit.id}-${pair}-v1.png`);
    const report=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/compose-exact-battle-suit-weapons.cjs'),
      prepared.file,weaponInputs[a],weaponInputs[b],atlas,'--force-horizontal','--preserve-separated-parts',`--row-y-offsets=${gripYOffsets[a]},${gripYOffsets[b]}`],{encoding:'utf8'}).trim());
    let atlasBytes=await readFile(atlas);
    if(integrated.has(a)||integrated.has(b)){
      const replacements=[];
      for(const [row,index] of [[0,a],[1,b]])for(let column=0;column<4;column++){
        const input=integrated.get(index)?.frame??await sharp(atlasBytes).extract({left:column*W,top:row*H,width:W,height:H}).png().toBuffer();
        replacements.push({input,left:column*W,top:row*H});
      }
      atlasBytes=await sharp({create:{width:W*4,height:H*2,channels:4,background:'#00000000'}}).composite(replacements).png({compressionLevel:9}).toBuffer();
      await writeFile(atlas,atlasBytes);
    }
    for(const [row,index] of [[0,a],[1,b]]){
      const weapon=live.weapons[index];
      const spriteFile=path.join(asset,'sprites',`${suit.id}-${index+1}.png`);
      const sprite=await sharp(atlasBytes).extract({left:0,top:row*H,width:W,height:H}).png().toBuffer();
      await writeFile(spriteFile,sprite);
      const check=await inspectFrame(sprite);
      if(check.transparentPixels<W*H*.3||check.greenPixels>10)throw Error(`SPRITE_ALPHA_OR_PROXY_FAILED:${suit.id}:${index}`);
      const placement=report.frames.find(f=>f.row===row&&f.column===0);
      const weaponRaster=await sharp(weaponInputs[index]).flop().resize({width:placement.targetWidth}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      let muzzleX=-1,muzzleYs=[];
      for(let x=weaponRaster.info.width-1;x>=0;x--){
        for(let y=0;y<weaponRaster.info.height;y++)if(weaponRaster.data[(y*weaponRaster.info.width+x)*4+3]>160)muzzleYs.push(y);
        if(muzzleYs.length){muzzleX=x;break;}
      }
      const muzzleY=muzzleYs.reduce((x,y)=>x+y,0)/Math.max(1,muzzleYs.length);
      entries.push({weaponCode:weapon.equipmentCode,weaponName:weapon.name,weaponIndex:index,
        image:url(spriteFile),sha256:sha(sprite),atlasSha256:sha(atlasBytes),diagnostics:check,
        authored:integrated.get(index)?.provenance??null,
        profile:{suitCode:`PREVIEW_${suit.id.toUpperCase()}`,weaponCode:weapon.equipmentCode,sheetUrl:url(atlas),row,
          grid:{columns:4,rows:2},frameOrder:phases,frames:Object.fromEntries(phases.map((p,column)=>[p,{column,row}])),
          durationsMs:live.animationContract.durationsMs,pivots:Object.fromEntries(phases.map(p=>[p,check.pivot])),
          contentBottom:check.pivot.y,nameHud:{contentTop:check.bounds.top/H,gap:18},
          muzzle:{frame:'fire',...(integrated.get(index)?.muzzle??{x:(placement.left+muzzleX)/W,y:(placement.top+muzzleY)/H}),unit:'NORMALIZED_FRAME'}}});
    }
  }
  entries.sort((a,b)=>a.weaponIndex-b.weaponIndex);
  manifest.suits.push({...suit,source:url(path.join(asset,'sources',suit.source)),sourceSha256:prepared.sourceHash,
    sourceDimensions:prepared.sourceDimensions,keyedPixels:prepared.keyedPixels,entries});
}
await writeFile(path.join(here,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({suits:manifest.suits.length,combinations:manifest.suits.flatMap(s=>s.entries).length,manifest:url(path.join(here,'manifest.json'))}));
