import {STAGES,MATERIALS,BURST_DURATION,perimeterPoint,perimeterLength,burstEnvelope} from './model.mjs';
import {createLegendaryFrame} from './legendary.mjs';

// A faceted metal/glass surface, shaded by broad studio lights. There are no
// orbiting points, electrical paths or perimeter-following animation cursors.
// Static sprite geometry batches to one shared texture; only its material tint
// changes. The existing Pixi renderer and GSAP clock remain the sole runtime.
export async function mountEnhancementFx(host,card,onState=()=>{}){
 const vendor=window.CNineUiFxVendor;
 if(!vendor?.pixi||!vendor?.gsap)throw new Error('공용 효과 엔진을 불러오지 못했습니다.');
 const {Application,Assets,Container,Graphics,Sprite}=vendor.pixi,gsap=vendor.gsap;
 const app=new Application();
 await app.init({width:1,height:1,backgroundAlpha:0,antialias:true,autoStart:false,autoDensity:true,resolution:Math.min(1.5,devicePixelRatio||1),preference:'webgl',powerPreference:'low-power'});
 host.appendChild(app.canvas);app.canvas.setAttribute('aria-hidden','true');
 const aura=new Container(),auraClip=new Graphics(),root=new Container(),underlay=new Graphics(),surface=new Container(),finish=new Graphics(),jewelry=new Graphics(),glints=new Container(),clip=new Graphics();
 app.stage.addChild(aura,auraClip,root,clip,glints);root.addChild(underlay,surface,finish,jewelry);root.mask=clip;aura.mask=auraClip;aura.blendMode='add';glints.blendMode='add';
 const sample=new Graphics().rect(0,0,2,2).fill(0xffffff),white=app.renderer.generateTexture({target:sample});sample.destroy();
 const radial=new Graphics();
 for(let r=40;r>=1;r--)radial.circle(41,41,r).fill({color:0xffffff,alpha:.010+(1-r/40)*.009});
 const glow=app.renderer.generateTexture({target:radial});radial.destroy();
 const relicTexture=await Assets.load(new URL('./assets/celestial-relic-frame-v1.png',import.meta.url).href);
 const relic=createLegendaryFrame(vendor.pixi,relicTexture,glow);app.stage.addChild(relic.container);
 const bloom=Array.from({length:12},()=>{const s=new Sprite(glow);s.anchor.set(.5);aura.addChild(s);return s});
 const flashes=Array.from({length:12},()=>{const s=new Sprite(glow);s.anchor.set(.5);glints.addChild(s);return s});
 const rays=Array.from({length:12},()=>{const s=new Sprite(glow);s.anchor.set(.5);aura.addChild(s);return s});
 let rect={x:16,y:16,w:900,h:580},stage=4,material='crystal',paused=matchMedia('(prefers-reduced-motion: reduce)').matches,enabled=true,destroyed=false,attached=false,speed=1,sequence=false,lastNotify=-1,renderedFrames=0,renderMs=0,lastPaint=-100,segments=[],thickness=14;
 const cursor={idle:0,burst:BURST_DURATION},motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
 const idle=gsap.to(cursor,{idle:3600,duration:3600,repeat:-1,ease:'none',paused:true});let burst=null;
 const state=()=>({stage,material,paused,enabled,speed,sequence,time:cursor.burst,burstActive:cursor.burst<BURST_DURATION,hidden:document.hidden,frames:renderedFrames,renderMs});
 function notify(){host.dataset.stage=String(stage);host.dataset.material=material;host.dataset.paused=String(paused);host.dataset.enabled=String(enabled);host.dataset.phase=cursor.burst<BURST_DURATION?'burst':'ambient';onState(state())}
 const normalize=(x,y,z)=>{const n=Math.hypot(x,y,z)||1;return[x/n,y/n,z/n]};
 const clamp=x=>Math.max(0,Math.min(1,x));
 const colors=MATERIALS;
 const facets=[
  {position:-.48,size:.06,angle:-68,shade:.32},
  {position:-.40,size:.10,angle:-42,shade:.68},
  {position:-.27,size:.16,angle:-21,shade:.94},
  {position:-.065,size:.25,angle:-3,shade:.72},
  {position:.165,size:.21,angle:24,shade:1},
  {position:.34,size:.14,angle:48,shade:.78},
  {position:.46,size:.10,angle:72,shade:.46}
 ];
 function band(graphic,offset,width,color,alpha){graphic.roundRect(rect.x-offset,rect.y-offset,rect.w+offset*2,rect.h+offset*2,14+offset).stroke({color,width,alpha})}
 function rebuild(){
  surface.removeChildren().forEach(p=>p.destroy());segments=[];
  thickness=[1.3,4.3,10.5,20,20][stage]*(rect.w<500?.75:1);
  const length=perimeterLength(rect),count=Math.ceil(length/7),step=length/count;
  for(let i=0;i<count;i++){
   const d=(i+.5)*step,p=perimeterPoint(d,rect),before=perimeterPoint(d-step*.5,rect),after=perimeterPoint(d+step*.5,rect),rotation=Math.atan2(after.y-before.y,after.x-before.x);
   const row={px:(p.x-rect.x)/rect.w-.5,py:(p.y-rect.y)/rect.h-.5,normalX:p.nx,normalY:p.ny,items:[]};
   for(let j=0;j<facets.length;j++){
    const facet=facets[j],angle=facet.angle*Math.PI/180,offset=facet.position*thickness,s=new Sprite(white);s.anchor.set(.5);s.position.set(p.x+p.nx*offset,p.y+p.ny*offset);s.rotation=rotation;
    // Outer facets cover longer arcs than inner ones. Match each arc's chord so
    // corners stay solid instead of showing fan-shaped gaps between samples.
    s.width=Math.hypot(after.x+after.nx*offset-before.x-before.nx*offset,after.y+after.ny*offset-before.y-before.ny*offset)+.8;
    s.height=Math.max(.25,thickness*facet.size*1.04);surface.addChild(s);
    row.items.push({sprite:s,nx:p.nx*Math.sin(angle),ny:p.ny*Math.sin(angle),nz:Math.cos(angle),shade:facet.shade,index:j});
   }
   segments.push(row);
  }
  underlay.clear();band(underlay,0,thickness+3,0x02060a,.96);
  const inset=stage>=3?12:8,outset=stage>=3?30:12;
  clip.clear().roundRect(rect.x-outset,rect.y-outset,rect.w+outset*2,rect.h+outset*2,14+outset).fill(0xffffff).roundRect(rect.x+inset,rect.y+inset,rect.w-inset*2,rect.h-inset*2,Math.max(2,14-inset)).cut();
  const auraExtent=stage===4?120:45;
  auraClip.clear().roundRect(rect.x-auraExtent,rect.y-auraExtent,rect.w+auraExtent*2,rect.h+auraExtent*2,52).fill(0xffffff).roundRect(rect.x+1,rect.y+1,rect.w-2,rect.h-2,13).cut();
  const {x,y,w,h}=rect,positions=[
   [x+w*.5,y,w*.95,72],[x+w*.5,y+h,w*.95,72],[x,y+h*.5,72,h*.94],[x+w,y+h*.5,72,h*.94],
   [x+8,y+8,110,90],[x+w-8,y+8,110,90],[x+8,y+h-8,110,90],[x+w-8,y+h-8,110,90],
   [x+w*.28,y,w*.36,56],[x+w*.76,y+h,w*.36,56],[x,y+h*.68,56,h*.4],[x+w,y+h*.3,56,h*.4]
  ];
  positions.forEach(([px,py,width,height],i)=>{bloom[i].position.set(px,py);bloom[i].width=width*(stage===4?1.7:1);bloom[i].height=height*(stage===4?1.7:1)});
  for(let i=0;i<4;i++){
   const px=i%2?x+w-4:x+4,py=i>1?y+h-4:y+4;
   flashes[i*2].position.set(px,py);flashes[i*2].width=stage===4?62:39;flashes[i*2].height=3;
   flashes[i*2+1].position.set(px,py);flashes[i*2+1].width=3;flashes[i*2+1].height=stage===4?46:31;
   for(let j=0;j<3;j++){
    const sx=i%2?1:-1,sy=i>1?1:-1,angle=Math.atan2(sy,sx)+(j-1)*.3,ray=rays[i*3+j];
    ray.position.set(px+Math.cos(angle)*18,py+Math.sin(angle)*18);ray.rotation=angle;ray.width=88-j*9;ray.height=3.5+j*1.5;
   }
  }
  for(let i=0;i<2;i++){const cy=i?y+h+12:y-16;flashes[8+i*2].position.set(x+w/2,cy);flashes[8+i*2].width=66;flashes[8+i*2].height=3;flashes[9+i*2].position.set(x+w/2,cy);flashes[9+i*2].width=3;flashes[9+i*2].height=35}
  relic.resize(rect);
 }
 function drawJewelry(t,level,impact){
  jewelry.clear();if(stage<2)return;
  const gold=material==='gold',chrome=material==='chrome',bright=gold?0xffecc9:chrome?0xd4e0ed:0xe4f3ff,mid=gold?0x9e793c:chrome?0x566475:0x7398b3,dark=gold?0x362916:0x19283a;
  const {x,y,w,h}=rect;
  for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
   const map=(u,v)=>[cx+sx*u,cy+sy*v],poly=points=>points.flatMap(([u,v])=>map(u,v)),length=stage>=3?68:34,outer=stage>=3?-11:-6;
   // Tapered shoulders integrate into the bezel; no wings or detached crown.
   jewelry.poly(poly([[18,outer],[length,outer],[length+9,outer+4],[24,outer+4],[12,5],[5,12],[outer+4,24],[outer+4,length+9],[outer,length],[outer,18]])).fill({color:mid,alpha:.96});
   jewelry.moveTo(...map(length,outer)).lineTo(...map(18,outer)).lineTo(...map(outer,18)).lineTo(...map(outer,length)).stroke({color:bright,width:1,alpha:.8});
   if(stage>=3){
    for(let k=0;k<3;k++){
     jewelry.moveTo(...map(29+k*8,outer+2)).lineTo(...map(35+k*8,outer+4)).stroke({color:bright,width:.65,alpha:.6});
     jewelry.moveTo(...map(outer+2,29+k*8)).lineTo(...map(outer+4,35+k*8)).stroke({color:bright,width:.65,alpha:.6});
    }
   }
   if(stage>=3){
    const center=3.5,r=stage>=3?10:4.8;
    jewelry.poly(poly([[center,center-r],[center+r,center],[center,center+r],[center-r,center]])).fill(dark).stroke({color:bright,width:.7,alpha:.7});
    jewelry.poly(poly([[center,center-r+1],[center+r-1,center],[center,center]])).fill({color:bright,alpha:.8});
    jewelry.poly(poly([[center+r-1,center],[center,center+r-1],[center,center]])).fill({color:mid,alpha:.95});
    jewelry.poly(poly([[center,center+r-1],[center-r+1,center],[center,center]])).fill({color:bright,alpha:.28});
    jewelry.poly(poly([[center-r+1,center],[center,center-r+1],[center,center]])).fill({color:mid,alpha:.8});
   }
  }
  if(stage>=3){
   for(const bottom of [false,true]){
    const cy=bottom?y+h:y,s=bottom?1:-1,cx=x+w/2,scale=(bottom?.75:1)*(rect.w<500?.8:1);
    const points=[[-80,0],[-42,0],[-28,6],[-17,6],[-8,17],[8,17],[17,6],[28,6],[42,0],[80,0]].map(([dx,dy])=>({x:cx+dx*scale,y:cy+s*(dy+5)}));
    jewelry.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))jewelry.lineTo(p.x,p.y);jewelry.stroke({color:mid,width:5,alpha:.95});
    jewelry.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))jewelry.lineTo(p.x,p.y);jewelry.stroke({color:bright,width:.6,alpha:.7});
    const gemY=cy+s*14*scale,gw=8*scale,gh=11*scale,gemColor=gold?0xe5af54:chrome?0x8db1d7:0x92c6f4;
    jewelry.poly([cx,gemY-gh,cx+gw,gemY-2*scale,cx+gw*.8,gemY+gh*.65,cx,gemY+gh,cx-gw*.8,gemY+gh*.65,cx-gw,gemY-2*scale]).fill(dark).stroke({color:bright,width:.9,alpha:.85});
    jewelry.poly([cx,gemY-gh+1,cx+gw-1,gemY-2*scale,cx,gemY]).fill({color:bright,alpha:.95});
    jewelry.poly([cx+gw-1,gemY-2*scale,cx+gw*.8,gemY+gh*.65,cx,gemY+gh-1,cx,gemY]).fill({color:gemColor,alpha:.9});
    jewelry.poly([cx,gemY+gh-1,cx-gw*.8,gemY+gh*.65,cx-gw+1,gemY-2*scale,cx,gemY]).fill({color:mid,alpha:.9});
    jewelry.poly([cx-gw+1,gemY-2*scale,cx,gemY-gh+1,cx,gemY]).fill({color:gemColor,alpha:.75});
    for(const side of [-1,1])for(let n=0;n<2;n++)jewelry.ellipse(cx+side*(21+n*12)*scale,cy+s*(7+n*1.5)*scale,2*scale,1.4*scale).fill({color:bright,alpha:.65});
   }
  }
 }
 function shadeAura(t,level,impact){
  aura.visible=enabled&&stage>0;glints.visible=enabled&&stage>=3;
  const tint=material==='gold'?0xe7b761:material==='chrome'?0x89aacb:0x7db8ec,secondary=material==='gold'?0xffd59a:material==='chrome'?0xc2cde0:0xb5a3ef;
  for(let i=0;i<bloom.length;i++){
   const breath=.68+Math.sin(t*.7+i*.58)*.12,corner=i>=4&&i<8;
   bloom[i].tint=i%3===0?secondary:tint;bloom[i].alpha=(.13+level*.3)*(stage===4?2.6:stage===3?1.85:1)*(corner?1.15:1)*breath+impact*.2;
  }
  for(let i=0;i<6;i++){
   const sparkle=(i>=4&&stage<4)?0:Math.pow(Math.max(0,Math.sin(t*.64+i*1.7)),7)*(.38+level*.42)+impact*.45;
   flashes[i*2].tint=0xfff7e7;flashes[i*2+1].tint=0xddecff;flashes[i*2].alpha=sparkle;flashes[i*2+1].alpha=sparkle*.85;
  }
  for(let i=0;i<rays.length;i++){rays[i].visible=stage>=3;rays[i].tint=i%2?tint:secondary;rays[i].alpha=.16+Math.pow(Math.max(0,Math.sin(t*.5+i*.72)),3)*.24+impact*.15}
 }
 function shade(t){
  const settings=colors[material],base=settings.base,level=Math.min(1,stage/3),e=burstEnvelope(cursor.burst),impact=cursor.burst<BURST_DURATION?e.flash*.75+e.charge*.12+e.release*.08:0;
  const lightX=-.45+Math.sin(t*.19)*.9,lightY=-.6+Math.sin(t*.13)*.38,light2X=.65+Math.cos(t*.11)*.32,light2Y=.42+Math.sin(t*.14)*.45;
  const sweep=Math.sin(t*.24)*1.05,gloss=settings.gloss,richness=.32+level*.68;
  for(const row of segments){
   const L=normalize(lightX-row.px,lightY-row.py,.72),L2=normalize(light2X-row.px,light2Y-row.py,.46),H=normalize(L[0],L[1],L[2]+1),H2=normalize(L2[0],L2[1],L2[2]+1);
   const spatial=row.px*.85+row.py*.54;
   for(const item of row.items){
    const {nx,ny,nz,shade:facet,index}=item;
    const diffuse=Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]),dot=Math.max(0,nx*H[0]+ny*H[1]+nz*H[2]),dot2=Math.max(0,nx*H2[0]+ny*H2[1]+nz*H2[2]);
    const spec=Math.pow(dot,gloss)*1.05+Math.pow(dot2,gloss*.6)*.52;
    // A rectangular softbox reflects across a broad part of the frame at once.
    const projected=spatial+(index-3)*.045,panel=Math.exp(-Math.pow((projected-sweep)/.23,2))*(.25+nz*.5)*level;
    let r,g,b;
    if(material==='crystal'){
     // Dispersion separates the reflections at adjacent refractive facets. It
     // never generates moving particles or lines traveling around the border.
     const prism=(index-3)*.032,redPanel=Math.exp(-Math.pow((projected-sweep-prism)/.22,2)),bluePanel=Math.exp(-Math.pow((projected-sweep+prism)/.22,2));
     const depth=.16+facet*.25+diffuse*.13,shine=spec*richness*.7;
     r=base[0]*depth+shine+panel*.42+redPanel*.21*level+impact*.72;
     g=base[1]*depth+shine+panel*.55+impact*.84;
     b=base[2]*depth+shine+panel*.48+bluePanel*.24*level+impact;
     if(index===0||index===6){r+=.1;g+=.13;b+=.16}
    }else{
     const ambient=material==='chrome'?.15:.3,diff=ambient+facet*.32+diffuse*.18,shine=(spec*.72+panel*.7)*richness;
     r=base[0]*diff+shine+impact*.8;g=base[1]*diff+shine*(material==='gold'?.92:1)+impact*.83;b=base[2]*diff+shine*(material==='gold'?.78:1.04)+impact*.88;
     if(material==='chrome'&&index%3===0){r*=.5;g*=.52;b*=.55}
    }
    const dim=stage===0?.5:1;
    item.sprite.tint=(Math.round(clamp(r*dim)*255)<<16)|(Math.round(clamp(g*dim)*255)<<8)|Math.round(clamp(b*dim)*255);
   }
  }
  finish.clear();
  const edgeColor=material==='gold'?0xffeac1:material==='chrome'?0xc9d9e6:0xd6eeff;
  band(finish,thickness*.5+.4,.65,edgeColor,.26+level*.18+impact*.18);
  band(finish,-thickness*.5-.2,.7,0x0a1019,.85);
  // At higher levels a recessed outer engraving adds physical detail, not a
  // second animated runner. Its reflected brightness changes as one surface.
  if(stage>=3){band(finish,thickness*.5+2.1,.6,edgeColor,.2+panelBrightness(t)*.12);band(finish,thickness*.5+3.3,.5,edgeColor,.08)}
  drawJewelry(t,level,impact);shadeAura(t,level,impact);
 }
 const panelBrightness=t=>Math.max(0,Math.sin(t*.24));
 function paint(force=false){
  if(destroyed)return;const now=performance.now();if(!force&&now-lastPaint<15)return;lastPaint=now;
  root.visible=enabled&&stage<4;aura.visible=enabled;glints.visible=enabled&&stage<4;
  if(enabled){if(stage<4)shade(cursor.idle);else{const e=burstEnvelope(cursor.burst);shadeAura(cursor.idle,1,cursor.burst<BURST_DURATION?e.flash*.85:0);glints.visible=false}}
  relic.paint(cursor.idle,cursor.burst,enabled&&stage===4);app.render();renderedFrames++;renderMs=renderMs*.95+(performance.now()-now)*.05;
  if(cursor.idle-lastNotify>.1||paused){lastNotify=cursor.idle;host.dataset.renderMs=renderMs.toFixed(2);onState(state())}
 }
 const tick=()=>paint();
 function sync(){
  const run=!destroyed&&!paused&&enabled&&!document.hidden;idle.paused(!run);if(burst&&cursor.burst<BURST_DURATION)burst.paused(!run);
  if(run&&!attached){gsap.ticker.add(tick);attached=true}if(!run&&attached){gsap.ticker.remove(tick);attached=false}notify();paint(true);
 }
 function resize(){
  if(destroyed)return;const box=host.getBoundingClientRect(),target=card.getBoundingClientRect();rect={x:target.left-box.left,y:target.top-box.top,w:target.width,h:target.height};
  app.renderer.resize(Math.max(1,Math.ceil(box.width)),Math.max(1,Math.ceil(box.height)));rebuild();paint(true);
 }
 const observer=new ResizeObserver(resize);observer.observe(host);observer.observe(card);
 const visibility=()=>sync(),preference=()=>{if(motionPreference.matches){paused=true;sync()}};
 document.addEventListener('visibilitychange',visibility);motionPreference.addEventListener('change',preference);resize();sync();
 return{
  setStage(index){stage=Math.max(0,Math.min(STAGES.length-1,index));burst?.kill();burst=null;cursor.burst=BURST_DURATION;rebuild();notify();paint(true)},
  setMaterial(value){if(!colors[value])return;material=value;notify();paint(true)},
  replay(){burst?.kill();enabled=true;paused=false;cursor.burst=0;burst=gsap.to(cursor,{burst:BURST_DURATION,duration:BURST_DURATION,ease:'none',paused:true,onComplete:notify});burst.timeScale(speed);sync()},
  setPaused(value){paused=Boolean(value);sync()},setEnabled(value){enabled=Boolean(value);sync()},
  setSpeed(value){speed=value;idle.timeScale(speed);burst?.timeScale(speed);notify()},
  seek(value){paused=true;cursor.burst=Math.max(0,Math.min(BURST_DURATION,value));burst?.kill();burst=gsap.to(cursor,{burst:BURST_DURATION,duration:BURST_DURATION-cursor.burst,ease:'none',paused:true,onComplete:notify});burst.timeScale(speed);sync()},
  setSequence(value){sequence=Boolean(value);notify()},getState:state,
  destroy(){if(destroyed)return;destroyed=true;idle.kill();burst?.kill();gsap.ticker.remove(tick);observer.disconnect();document.removeEventListener('visibilitychange',visibility);motionPreference.removeEventListener('change',preference);app.destroy(true,{children:true,texture:false,textureSource:false});relic.destroy();white.destroy(true);glow.destroy(true);host.dataset.destroyed='true'}
 };
}
