/* Shared, time-based item VFX. All visible icons reuse one rendered frame.
 * Authored flame flipbook with continuous interpolation, glints and living embers. */
(() => {
 'use strict';
 const TAU=Math.PI*2,PERIOD=4,SIZE=256,scenes=new Set(),sprites=new Map();
 const sin=Math.sin,cos=Math.cos,fract=x=>x-Math.floor(x),hash=x=>fract(sin(x*127.13+311.7)*43758.5453);
 const rgba=(rgb,a)=>`rgba(${rgb},${Math.max(0,Math.min(1,a))})`;
 const palette={flame:'238,24,14',deep:'142,5,17',hot:'255,130,35',gold:'255,195,68',white:'255,241,193'};
 let raf=0,last=-Infinity,clock=0,draws=0,frames=0,visible=0,media=null;
 const buffer=document.createElement('canvas');buffer.width=buffer.height=SIZE;const frame=buffer.getContext('2d',{alpha:true});
 function glow(kind){
  if(sprites.has(kind))return sprites.get(kind);
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gradient=g.createRadialGradient(32,32,0,32,32,32),color=palette[kind];
  gradient.addColorStop(0,rgba(palette.white,.95));gradient.addColorStop(.08,rgba(color,.85));gradient.addColorStop(.28,rgba(color,.25));gradient.addColorStop(1,rgba(color,0));g.fillStyle=gradient;g.fillRect(0,0,64,64);sprites.set(kind,c);return c;
 }
 const atlas=new Image();let atlasReady=false;
 atlas.decoding='async';atlas.onload=()=>{atlasReady=true;if(reduced())still();else schedule();};atlas.src='/assets/ui/character-runes/v3/crimson-gold-flipbook.webp';
 function paint(ctx,{time=0}={}){
  const canvas=ctx.canvas,t=fract(time/PERIOD),phase=t*16,index=Math.floor(phase),mix=phase-index;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/SIZE,canvas.height/SIZE);
  if(atlasReady){
   // Adjacent authored flame frames blend continuously, with no rigid rotating border.
   ctx.globalCompositeOperation='lighter';
   for(const [i,alpha] of [[index,1-mix],[(index+1)%16,mix]]){ctx.globalAlpha=alpha*.92;ctx.drawImage(atlas,(i%4)*256,Math.floor(i/4)*256,256,256,0,0,256,256);}
   ctx.globalAlpha=1;
   // Hollow center preserves the item and physical socket; feathered edges never clip.
   ctx.globalCompositeOperation='destination-out';const hollow=ctx.createRadialGradient(128,128,22,128,128,91);hollow.addColorStop(0,'#fff');hollow.addColorStop(.42,'rgba(255,255,255,.98)');hollow.addColorStop(.74,'rgba(255,255,255,.55)');hollow.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=hollow;ctx.fillRect(0,0,256,256);
   ctx.globalCompositeOperation='destination-in';for(const axis of [0,1]){const edge=ctx.createLinearGradient(0,0,axis?0:256,axis?256:0);edge.addColorStop(0,'rgba(255,255,255,0)');edge.addColorStop(.075,'#fff');edge.addColorStop(.925,'#fff');edge.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=edge;ctx.fillRect(0,0,256,256);}
  }
  ctx.globalCompositeOperation='lighter';ctx.translate(128,128);
  // Sparse gilded cinders rise in two different currents; each has its own life.
  for(let i=0;i<34;i++){
   const seed=hash(i+90),life=fract(t*(i%3===0?2:1)+seed),side=i%2?1:-1,fade=sin(Math.PI*life)**1.7,size=.7+hash(i+210)*1.5;
   const x=side*(58+18*sin(life*4+seed*6))+8*sin(life*9+seed),y=98-life*208;
   ctx.globalAlpha=fade*.6;ctx.drawImage(glow(i%6===0?'flame':'gold'),x-size*4,y-size*4,size*8,size*8);ctx.globalAlpha=1;
   ctx.fillStyle=rgba(palette.white,fade*.72);ctx.fillRect(x,y,.55,size*1.2);
  }
  // One travelling metallic gleam traces a short diagonal through the socket.
  const head=fract(t*2),strength=sin(Math.PI*head)**2;
  for(let j=0;j<12;j++){
   const u=head-j*.014;if(u<0)continue;const x=-72+u*144,y=65-u*130+7*sin(u*Math.PI),fade=(1-j/12)*strength;
   ctx.globalAlpha=fade*.28;ctx.drawImage(glow('gold'),x-9,y-9,18,18);
  }
  ctx.globalAlpha=.17+.07*sin(t*TAU*2);ctx.drawImage(glow('gold'),-34,-34,68,68);ctx.globalAlpha=1;
  ctx.restore();ctx.setTransform(1,0,0,1,0,0);
 }
 const entries=()=>[...scenes].flatMap(s=>[...s.entries.values()]);
 const reduced=()=>media?.matches===true;
 function cancel(){if(raf)cancelAnimationFrame(raf);raf=0;}
 function schedule(){if(!raf&&!document.hidden&&!reduced()&&entries().some(e=>e.visible&&e.canvas.isConnected))raf=requestAnimationFrame(tick);}
 function still(){paint(frame,{time:1.35});for(const e of entries())if(e.canvas.isConnected){e.ctx.clearRect(0,0,SIZE,SIZE);e.ctx.drawImage(buffer,0,0);}}
 function visibility(){cancel();if(reduced())still();else{last=-Infinity;schedule();}}
 function tick(now){
  raf=0;if(document.hidden||reduced())return;
  const active=entries().filter(e=>e.canvas.isConnected&&e.visible);visible=active.length;if(!active.length)return;
  if(now-last>=1000/30-1){last=now;clock=now/1000;paint(frame,{time:clock});draws++;for(const e of active){e.ctx.clearRect(0,0,SIZE,SIZE);e.ctx.drawImage(buffer,0,0);}frames++;}
  schedule();
 }
 function create(){
  const scene={entries:new Map()},observer=typeof IntersectionObserver==='function'?new IntersectionObserver(updates=>{for(const u of updates){const e=scene.entries.get(u.target);if(e)e.visible=u.isIntersecting;}schedule();},{rootMargin:'24px'}):null;
  let destroyed=false;
  if(!scenes.size){media=matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',visibility);document.addEventListener('visibilitychange',visibility);}scenes.add(scene);
  function mount(host){
   if(destroyed)return;
   for(const [canvas] of scene.entries)if(!canvas.isConnected){observer?.unobserve(canvas);scene.entries.delete(canvas);}
   for(const canvas of host.querySelectorAll('canvas[data-rune-animation="sovereign-fire-v3"]')){
    if(scene.entries.has(canvas))continue;canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)continue;
    const bounds=canvas.getBoundingClientRect();scene.entries.set(canvas,{canvas,ctx,visible:bounds.width>0&&bounds.bottom>0&&bounds.top<innerHeight&&bounds.right>0&&bounds.left<innerWidth});observer?.observe(canvas);
   }
   if(reduced())still();else schedule();
   if(!entries().some(e=>e.visible&&e.canvas.isConnected))cancel();
  }
  return {mount,destroy(){destroyed=true;observer?.disconnect();scene.entries.clear();scenes.delete(scene);if(!scenes.size){cancel();media?.removeEventListener('change',visibility);document.removeEventListener('visibilitychange',visibility);visible=0;}}};
 }
 window.ItemRuneVFX=Object.freeze({create,paint,supports:id=>id==='sovereign-fire-v3',inspect:()=>({scenes:scenes.size,canvases:entries().filter(e=>e.canvas.isConnected).length,visible,frames,draws,scheduled:Boolean(raf),reducedMotion:reduced(),resolution:SIZE,period:PERIOD,atlasReady})});
})();
