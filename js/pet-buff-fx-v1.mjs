import {petBuffVisual} from '../shared/pet-buff-visuals-v1.mjs?v=20261003';
const images=new Map();
function sheet(url){if(!images.has(url)){const image=new Image();image.src=url;const ready=image.decode().then(()=>image).catch(error=>{images.delete(url);throw error;});images.set(url,ready);}return images.get(url);}
export function petBuffIcon(type,className='pet-buff-icon'){const visual=petBuffVisual(type);return visual?`<img class="${className}" src="${visual.icon}" alt="" width="40" height="40">`:'';}
export function playPetBuffEffect(mount,type,{loop=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,onFrame=()=>{},onError=()=>{}}={}){
 const visual=petBuffVisual(type);if(!visual)throw Error('Unknown pet buff visual');
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;canvas.className='pet-buff-effect';canvas.setAttribute('aria-hidden','true');canvas.dataset.effect=type;canvas.dataset.state='loading';mount.append(canvas);
 let disposed=false,raf=0,elapsed=0,previous=0,image=null,lastFrame=-1;const ctx=canvas.getContext('2d');
 function draw(frame,opacity=1){ctx.clearRect(0,0,640,640);ctx.globalAlpha=opacity;const w=image.naturalWidth/visual.columns,h=image.naturalHeight/visual.rows;ctx.drawImage(image,frame%4*w,Math.floor(frame/4)*h,w,h,0,0,640,640);ctx.globalAlpha=1;canvas.dataset.frame=String(frame);if(frame!==lastFrame){lastFrame=frame;onFrame(frame,visual.frames);}}
 function stop(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);canvas.remove();}
 function tick(now){if(disposed)return;if(!canvas.isConnected){stop();return;}elapsed+=previous?Math.min(100,now-previous):0;previous=now;const cycle=visual.durationMs+650,t=loop?elapsed%cycle:elapsed;
  if(t>=visual.durationMs){ctx.clearRect(0,0,640,640);canvas.dataset.state='complete';if(!loop){document.removeEventListener('visibilitychange',visibility);onFrame(8,8);return;}}
  else{canvas.dataset.state='playing';const frame=Math.min(7,Math.floor(t/visual.durationMs*8));draw(frame,Math.min(1,(visual.durationMs-t)/160));}
  raf=requestAnimationFrame(tick);
 }
 function visibility(){cancelAnimationFrame(raf);previous=0;if(document.hidden)canvas.dataset.state='paused';else if(image&&!disposed&&!reduced){canvas.dataset.state='playing';raf=requestAnimationFrame(tick);}}
 void sheet(visual.atlas).then(value=>{if(disposed)return;image=value;if(!ctx)throw Error('Canvas unavailable');if(reduced){draw(visual.iconFrame);canvas.dataset.state='reduced';onFrame(8,8);return;}document.addEventListener('visibilitychange',visibility);visibility();}).catch(error=>{if(disposed)return;canvas.dataset.state='error';onError(error);});
 return {canvas,stop};
}
