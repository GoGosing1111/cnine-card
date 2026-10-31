import {loadTextures,TexturePool,CanvasPool} from 'pixi.js';
import {BATTLE_DEVICE} from './BattleDevicePolicy.mjs';

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
loadTextures.load=function(...args){return imageQueue.run(async()=>{const texture=await originalLoad.apply(this,args);ownDecodedBitmap(texture.source);return texture;});};

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
export const battleTextureDiagnostics=()=>({...imageQueue.diagnostics(),idleTextCanvases:idleCanvases.size});
