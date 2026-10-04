import {PolishAudio} from './audio.mjs';
const {pixi={},gsap}=globalThis.CNineUiFxVendor||{};
const {Application,Assets,Container,Graphics,Sprite,Rectangle}=pixi;
const TAU=Math.PI*2,clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const random=n=>{const f=Math.sin(n*78.233+12.9898)*43758.5453;return f-Math.floor(f);};
export const TIMING=Object.freeze({sealed:1.4,impact:2.50,selected:4.35,reveal:4.55,end:6.1});
const asset=name=>new URL('../assets/'+name,import.meta.url).href;
export class PolishFX{
 constructor(host,callbacks={}){this.host=host;this.callbacks=callbacks;this.clock={time:0};this.ambient={time:0};this.audio=new PolishAudio();this.phase='idle';this.speed=1;this.reduced=false;this.charge=0;this.selected=0;this.paused=false;}
 async init(){
  if(!Application||!gsap)throw new Error('Shared renderer unavailable');
  this.app=new Application();await this.app.init({resizeTo:this.host,antialias:true,backgroundAlpha:1,background:0x08101a,resolution:Math.min(devicePixelRatio||1,1.5),autoDensity:true,preference:'webgl',powerPreference:'low-power'});
  this.app.ticker.maxFPS=60;this.host.appendChild(this.app.canvas);
  const [room,stone,seal,charge,burst,weapon]=await Promise.all([
   Assets.load(asset('polishing-chamber-v1.png')),Assets.load(asset('polishing-stone-v1.png')),Assets.load(asset('polishing-seal-v1.png')),Assets.load(asset('polishing-charge-atlas-v1.png')),Assets.load(asset('polishing-release-atlas-v1.png')),Assets.load('/assets/ui/project-v/account-battle-suits/weapons/avalon-m4a1-v1.png')]);
  if(this.destroyed)return this;
  this.room=new Sprite(room);this.room.anchor.set(.5);this.shade=new Graphics();this.root=new Container();this.back=new Graphics();this.front=new Graphics();this.glow=new Graphics();
  this.weapon=new Sprite(weapon);this.weapon.anchor.set(.5);this.stone=new Sprite(stone);this.stone.anchor.set(.5);
  const sw=seal.width/2;
  this.left=new Sprite(new seal.constructor({source:seal.source,frame:new Rectangle(0,0,sw,seal.height)}));this.left.anchor.set(1,.5);
  this.right=new Sprite(new seal.constructor({source:seal.source,frame:new Rectangle(sw,0,sw,seal.height)}));this.right.anchor.set(0,.5);
  this.chargeFrames=this.makeFrames(charge);this.burstFrames=this.makeFrames(burst);
  this.chargeSprites=[new Sprite(),new Sprite()];this.burstSprites=[new Sprite(),new Sprite()];
  for(const s of [...this.chargeSprites,...this.burstSprites]){s.anchor.set(.5);s.blendMode='add';}
  this.root.addChild(this.back,this.weapon,this.left,this.right,...this.chargeSprites,this.stone,...this.burstSprites,this.glow,this.front);
  this.app.stage.addChild(this.room,this.shade,this.root);
  this.renderTick=()=>this.render();this.app.ticker.add(this.renderTick);
  this.ambientTween=gsap.to(this.ambient,{time:60,duration:60,repeat:-1,ease:'none'});
  this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.host);this.layout();this.host.closest('.stage').classList.add('renderer-ready');return this;
 }
 makeFrames(sheet){const cw=sheet.width/4,ch=sheet.height/4;return Array.from({length:16},(_,i)=>new sheet.constructor({source:sheet.source,frame:new Rectangle(i%4*cw,Math.floor(i/4)*ch,cw,ch)}));}
 layout(){if(!this.room)return;const box=this.host.getBoundingClientRect();this.w=box.width;this.h=box.height;this.cx=this.w/2;this.cy=this.h*.48;this.size=Math.min(this.w*.51,this.h*.46,326);this.radius=this.size*.67;this.root.position.set(this.cx,this.cy);this.room.scale.set(Math.max(this.w/this.room.texture.width,this.h/this.room.texture.height));this.room.position.set(this.w/2,this.h/2);this.shade.clear();for(let i=0;i<128;i++){const y=(i+.5)/128;let alpha=y<.25?.76*(1-y/.3):y>.57?clamp((y-.57)/.32)*.94:0;const y0=Math.floor(i*this.h/128),y1=Math.floor((i+1)*this.h/128);this.shade.rect(0,y0,this.w,y1-y0).fill({color:0x06101b,alpha});}this.render();}
 idle(){this.timeline?.kill();this.audio.stop();this.phase='idle';this.clock.time=0;this.charge=0;this.paused=false;this.ambientTween?.resume();this.render();}
 begin(receipt){this.timeline?.kill();this.audio.stop();this.receipt=receipt;this.selected=receipt.selected;this.clock.time=0;this.phase='charging';this.charge=0;this.paused=false;this.ambientTween?.pause();if(this.reduced){this.skip();return;}this.playTo(TIMING.sealed,()=>{this.phase='sealed';this.audio.stop();this.callbacks.onSealed?.();this.render();});}
 playTo(end,complete){this.segmentEnd=end;this.segmentComplete=complete;this.timeline?.kill();this.timeline=gsap.to(this.clock,{time:end,duration:Math.max(.001,end-this.clock.time),ease:'none',onUpdate:()=>{this.render();this.callbacks.onTick?.(this.clock.time,this.phase);},onComplete:complete});this.timeline.timeScale(this.speed);this.audio.schedule(this.clock.time,end,this.speed);}
 setCharge(value){this.charge=clamp(value);this.render();}
 release(){if(this.phase!=='sealed')return;this.phase='opening';this.charge=1;this.paused=false;this.callbacks.onOpening?.();this.playTo(TIMING.end,()=>this.finish());}
 finish(){this.phase='result';this.clock.time=TIMING.end;this.audio.stop();this.render();this.callbacks.onResult?.(this.receipt);}
 skip(){if(!this.receipt)return;this.timeline?.kill();this.paused=false;this.finish();}
 pause(){if(!this.timeline?.isActive()&&!this.paused)return;this.paused=!this.paused;if(this.paused){this.timeline.pause();this.audio.stop();}else{this.timeline.resume();this.audio.schedule(this.clock.time,this.segmentEnd,this.speed);}return this.paused;}
 setSpeed(value){this.speed=value;this.timeline?.timeScale(value);if(!this.paused&&this.timeline?.isActive())this.audio.schedule(this.clock.time,this.segmentEnd,this.speed);}
 setReduced(value){this.reduced=!!value;if(value){this.ambientTween?.pause();if(this.receipt&&['charging','sealed','opening'].includes(this.phase))this.skip();}else if(this.phase==='idle')this.ambientTween?.resume();this.render();}
 setSound(value){return this.audio.enable(value);}
 atlas(sprites,frames,index,diameter,alpha){const base=Math.floor(index),mix=index-base;for(let i=0;i<2;i++){const s=sprites[i];s.visible=alpha>0;s.texture=frames[Math.min(15,Math.max(0,base+i))];s.width=diameter;s.height=diameter;s.alpha=alpha*(i?mix:1-mix);}}
 render(){
  if(!this.room||this.destroyed)return;
  const t=this.clock.time,idle=this.phase==='idle',sealed=this.phase==='sealed',result=this.phase==='result';
  const pulse=this.reduced?0:Math.sin((idle?this.ambient.time:t)*1.5);
  const charge=clamp(t/TIMING.sealed),opening=smooth((t-TIMING.sealed)/1.22),post=t-TIMING.impact,settle=smooth((t-4.1)/1.5);
  this.root.position.set(this.cx,this.cy);this.back.clear();this.front.clear();this.glow.clear();
  const s=this.size,r=this.radius,spin=idle?this.ambient.time*.11:t*.20;
  this.weapon.width=Math.min(this.w*.78,590);this.weapon.height=this.weapon.width*this.weapon.texture.height/this.weapon.texture.width;this.weapon.rotation=-.2+opening*.1;this.weapon.alpha=idle?.10:smooth((t-1.8)/.6);this.weapon.y=-8-opening*2;
  // Avalon receiver/barrel axis: (0.5, 0.30) in the unmodified source image.
  const receiverY=-this.weapon.height*.20;
  const impactX=this.weapon.x-receiverY*Math.sin(this.weapon.rotation),impactY=this.weapon.y+receiverY*Math.cos(this.weapon.rotation);
  for(let i=0;i<2;i++){const node=i?this.right:this.left;node.width=s/2*(1-opening*.42);node.height=s*(1-opening*.08);node.x=(i?1:-1)*opening*s*.73;node.y=idle?pulse*2:0;node.alpha=1-opening;}
  this.stone.width=s*.44;this.stone.height=s*.44;this.stone.rotation=-.08;this.stone.x=0;this.stone.y=idle?pulse*4: -charge*13;this.stone.alpha=idle?1:1-smooth((t-.2)/1.05);
  const chargeAlpha=idle?0:sealed?.38+this.charge*.35:t<1.4?charge*.62:(1-opening)*.7;
  this.atlas(this.chargeSprites,this.chargeFrames,Math.min(15,charge*15),s*1.12,chargeAlpha);
  const burstProgress=clamp((t-2.12)/2.25);const burstAlpha=t>=2.12&&t<4.6?(1-smooth((t-3.85)/.7))*.86:0;
  this.atlas(this.burstSprites,this.burstFrames,burstProgress*15,s*1.35,burstAlpha);
  for(const sprite of this.burstSprites){sprite.x=impactX;sprite.y=impactY;}
  let highlight=-1;
  if(t>=2.25&&t<TIMING.selected){const p=clamp((t-2.25)/(TIMING.selected-2.25));const steps=Math.floor((1-(1-p)**2.6)*25);highlight=(this.selected-25+steps+50)%5;}
  if(t>=TIMING.selected)highlight=this.selected;
  if(highlight!==this.lastHighlight){this.lastHighlight=highlight;this.callbacks.onHighlight?.(highlight,t>=TIMING.selected);}
  // Five orbital sockets remain spatially fixed so the destination is readable.
  for(let i=0;i<5;i++){
   const a=-Math.PI/2+i*TAU/5,x=Math.cos(a)*r,y=Math.sin(a)*r*.73;
   const active=i===highlight,bright=active?1:sealed?.48+this.charge*.4:.26;
   const color=active&&t>=TIMING.selected?0xf8d48f:0x8ed4ff;
   this.back.moveTo(0,0).lineTo(x,y).stroke({color,width:.65,alpha:idle?.08:bright*.16});
   this.front.circle(x,y,active?6:3.5).fill({color,alpha:bright});
   this.front.circle(x,y,active?12:8).stroke({color,width:1,alpha:bright*.6});
   if(active){for(let ring=3;ring>0;ring--)this.front.circle(x,y,8+ring*6).fill({color,alpha:.02*(4-ring)});}
  }
  for(let j=0;j<3;j++){const ra=r*(1.03+j*.075),start=spin*(j%2?-1:1)+j*2;this.back.ellipse(0,0,ra,ra*.73).stroke({color:j===1?0xe0bd79:0x8abadd,width:.65,alpha:.13+charge*.12});for(let k=0;k<5;k++){const a=start+k*TAU/5;this.back.moveTo(Math.cos(a)*ra,Math.sin(a)*ra*.73).lineTo(Math.cos(a+.04)*ra,Math.sin(a+.04)*ra*.73).stroke({color:0xe2c790,width:1.8,alpha:.4});}}
  if(sealed||t>1.1&&t<2.4){const a=sealed?.12+this.charge*.62:Math.max(0,1-opening)*.3;for(let j=4;j>0;j--)this.front.rect(-j, -s*.45,j*2,s*.9).fill({color:0xb9e8ff,alpha:a*.08});}
  if(post>=0&&post<.7&&!this.reduced){const f=1-post/.7;this.front.ellipse(impactX,impactY,s*(.28+post*1.6),s*(.06+post*.2)).stroke({color:0xd6edff,width:2*f,alpha:f*.42});}
  if(!this.reduced){const at=idle?this.ambient.time:t;for(let i=0;i<42;i++){const life=(random(i+17)+at*(.035+random(i)*.04))%1,angle=random(i+79)*TAU+life*.2;const rr=(.6+random(i+136))*(idle?r:r*(1-charge*.1));let x=Math.cos(angle)*rr,y=(.55-life)*s*1.7;if(post>0&&post<1.5){x=impactX+Math.cos(angle)*r*(.2+post);y=impactY+Math.sin(angle)*r*(.2+post)*.7;}this.front.circle(x,y,.4+random(i+7)*1.2).fill({color:i%4?0x93cefc:0xf0cc82,alpha:Math.sin(life*Math.PI)*.4});}}
  if(t>=TIMING.selected){const a=-Math.PI/2+this.selected*TAU/5,x=Math.cos(a)*r,y=Math.sin(a)*r*.73;const beam=1-smooth((t-TIMING.selected)/.7);this.front.moveTo(0,0).lineTo(x,y).stroke({color:0xffdea0,width:2,alpha:beam*.85});for(let k=3;k>0;k--)this.back.ellipse(0,0,r*(.68+k*.16),r*(.22+k*.08)).fill({color:0x97cfff,alpha:(result ? .018 : settle*.018)/k});}
  this.room.alpha=.80-(t>1.1&&t<2.5?.10*Math.sin((t-1.1)/1.4*Math.PI):0);
 }
 destroy(){this.destroyed=true;this.timeline?.kill();this.ambientTween?.kill();this.audio.destroy();this.observer?.disconnect();this.app?.ticker.remove(this.renderTick);this.app?.destroy(true,{children:true,texture:false,textureSource:false});}
}
