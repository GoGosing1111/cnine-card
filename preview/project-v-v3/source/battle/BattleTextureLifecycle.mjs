import {loadTextures,TexturePool,CanvasPool} from 'pixi.js';
import {BATTLE_DEVICE} from './BattleDevicePolicy.mjs';
import {BATTLE_MOBILE_IMAGES} from './BattleMobileImages.mjs';

// Limit image decoding itself, including image loads nested inside atlas JSON.
// Queuing Assets.load would miss those and can deadlock nested atlas loads.
export function createImageLoadQueue(limit){
  const waiting=[];let active=0,peak=0;
  const pump=()=>{while(active<limit&&waiting.length){const {work,resolve,reject}=waiting.shift();active++;peak=Math.max(peak,active);Promise.resolve().then(work).then(resolve,reject).finally(()=>{active--;pump();});}};
  return {run(work){return new Promise((resolve,reject)=>{waiting.push({work,resolve,reject});pump();});},diagnostics:()=>({active,queued:waiting.length,peak,limit})};
}

export function ownDecodedBitmap(source,Bitmap=globalThis.ImageBitmap){
  const bitmap=source?.resource;
  if(!Bitmap||!(bitmap instanceof Bitmap)||source.__battleBitmapOwned)return false;
  source.__battleBitmapOwned=true;
  // Pixi 8.20 destroys GPU data but only nulls the ImageBitmap reference.
  // close() returns decoded backing memory immediately on Safari. Never close
  // on source.unload: idle GPU eviction must still be able to upload it again.
  source.once('destroy',()=>bitmap.close());
  return true;
}

const imageQueue=createImageLoadQueue(BATTLE_DEVICE.imageConcurrency);
const originalLoad=loadTextures.load;
const compactStats={images:0,originalBytes:0,residentBytes:0,failures:0};
const deliveryStats={images:0,fallbacks:0};

export function mobileBattleImage(value,{ios=BATTLE_DEVICE.ios,base=globalThis.location?.href||'https://battle.invalid/',images=BATTLE_MOBILE_IMAGES}={}){
  if(!ios||typeof value!=='string')return null;
  try{
    const url=new URL(value,base);
    if(url.origin!==new URL(base).origin)return null;
    const entry=images[url.pathname];
    // Pixi can decode in a blob worker, where document-relative fetch URLs fail.
    return entry?{url:new URL(entry[0],base).href,scale:entry[1],width:entry[2],height:entry[3]}:null;
  }catch{return null;}
}

// Fetch the smaller raster before decoding. Scaling a full decoded atlas only
// afterwards still incurs its original Safari memory peak. Keep logical image
// dimensions so authored atlas coordinates, UVs, anchors and poses stay exact.
export async function loadMobileBattleTexture(load,context,args,variant){
  if(variant){
    const [url,asset={},...rest]=args;
    try{
      const texture=await load.call(context,variant.url,{...asset,data:{...asset.data,resolution:(asset.data?.resolution||1)*variant.scale}},...rest);
      // An odd-sized atlas rounds its physical pixels. UVs must still use its
      // exact original coordinate space, including the last half-pixel edge.
      texture.source.width=variant.width/(asset.data?.resolution||1);
      texture.source.height=variant.height/(asset.data?.resolution||1);
      texture.update();
      texture.source.__battleCompacted=true;
      deliveryStats.images++;
      return texture;
    }catch{
      // A stale/offline delivery cache must retain the working original path.
      deliveryStats.fallbacks++;
    }
  }
  return load.apply(context,args);
}

// Keep the original atlas coordinate space, anchors and actor sizes. Only the
// decoded/GPU bitmap shrinks. Exact halving prevents frame edges from drifting.
export function compactBitmapPlan(width,height){
  let scale=1;
  while(Math.max(width*scale,height*scale)>1536||width*height*scale*scale>1536*1024){
    const next=scale/2;
    if(!Number.isInteger(width*next)||!Number.isInteger(height*next))break;
    scale=next;
  }
  return scale<1?{width:width*scale,height:height*scale,scale}:null;
}
export async function compactBattleTexture(texture,{createBitmap=globalThis.createImageBitmap,Bitmap=globalThis.ImageBitmap}={}){
  const source=texture?.source,original=source?.resource;
  if(!Bitmap||!(original instanceof Bitmap)||!createBitmap||source.__battleCompacted)return false;
  const plan=compactBitmapPlan(original.width,original.height);
  if(!plan)return false;
  let bitmap;
  try{
    bitmap=await createBitmap(original,{resizeWidth:plan.width,resizeHeight:plan.height,resizeQuality:'high'});
    // Some older WebKit versions accept but ignore resize options. Retain the
    // valid original in that case, and return the unused copy immediately.
    if(bitmap===original||bitmap.width!==plan.width||bitmap.height!==plan.height){
      if(bitmap!==original)bitmap.close();
      compactStats.failures++;return false;
    }
  }catch{compactStats.failures++;return false;}
  const width=source.width,height=source.height,resolution=source.resolution;
  source.resource=bitmap;
  source.resize(width,height,resolution*plan.scale);
  source.update();
  source.__battleCompacted=true;
  compactStats.images++;
  compactStats.originalBytes+=original.width*original.height*4;
  compactStats.residentBytes+=bitmap.width*bitmap.height*4;
  original.close();
  return true;
}
loadTextures.load=function(...args){return imageQueue.run(async()=>{
  const texture=await loadMobileBattleTexture(originalLoad,this,args,mobileBattleImage(args[0]));
  if(BATTLE_DEVICE.ios&&args[1]?.data?.battleLogicalPixels)await compactBattleTexture(texture);
  ownDecodedBitmap(texture.source);return texture;
});};

// Only returned (unused) canvases belong to this set. An active Pixi consumer
// can borrow one at any point without its backing buffer being cleared.
const idleCanvases=new Set(),getCanvas=CanvasPool.getOptimalCanvasAndContext,returnCanvas=CanvasPool.returnCanvasAndContext;
CanvasPool.getOptimalCanvasAndContext=function(...args){const item=getCanvas.apply(this,args);idleCanvases.delete(item);return item;};
CanvasPool.returnCanvasAndContext=function(item){returnCanvas.call(this,item);idleCanvases.add(item);};
export function releaseIdleBattleBuffers(){
  TexturePool.clear();
  CanvasPool.clear();
  for(const {canvas} of idleCanvases){canvas.width=0;canvas.height=0;}
  idleCanvases.clear();
}
export const battleTextureDiagnostics=()=>({...imageQueue.diagnostics(),idleTextCanvases:idleCanvases.size,compaction:{...compactStats},mobileDelivery:{...deliveryStats}});
