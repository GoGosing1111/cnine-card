import {Application,Assets,Container,Graphics,Rectangle,Sprite} from 'pixi.js';
import {gsap} from 'gsap';
const ROOT='/assets/ui/events/golden-axe-v1/';
// This renderer only consumes a completed server receipt; it never draws prizes.
class GoldenAxeStage{
 constructor(host,{onPhase=()=>{},sound=false}={}){this.host=host;this.onPhase=onPhase;this.sound=sound;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.audio=[];this.ripples=[];this.drops=[];this.sparkles=[];this.timeline=null;this.disposed=false;}
 async init(){
  this.app=new Application();await this.app.init({width:1024,height:760,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl'});this.initialized=true;if(this.disposed){this.app.destroy(true);return;}
  this.host.append(this.app.canvas);this.app.canvas.setAttribute('aria-hidden','true');
  const [rider,axes]=await Promise.all([Assets.load(ROOT+'pink-rider.png'),Assets.load(ROOT+'axes.png')]);if(this.disposed)return;
  this.world=new Container();this.app.stage.addChild(this.world);this.water=new Graphics();this.world.addChild(this.water);
  this.rider=new Sprite(rider);this.rider.anchor.set(.5,1);this.rider.position.set(550,650);this.rider.width=410;this.rider.height=410;this.rider.alpha=0;this.world.addChild(this.rider);
  this.axes=[0,1,2].map(i=>{const sprite=new Sprite(new axes.constructor({source:axes.source,frame:new Rectangle(i*512,0,512,1024)}));sprite.anchor.set(.5);sprite.width=144;sprite.height=288;sprite.alpha=0;this.world.addChild(sprite);return sprite;});
  this.particles=new Graphics();this.world.addChild(this.particles);this.flare=new Graphics();this.world.addChild(this.flare);
  this.clock={time:0,glow:0,burst:0};this.loop=gsap.to(this.clock,{time:Math.PI*200,duration:Math.PI*200,ease:'none',repeat:-1,onUpdate:()=>this.paint()});
  this.visibility=()=>{if(document.hidden){this.finish();this.loop.pause();}else if(!this.reduced)this.loop.resume();};document.addEventListener('visibilitychange',this.visibility);
  if(this.reduced)this.loop.pause();this.paint();return this;
 }
 cue(src,volume=.25){if(!this.sound||this.reduced)return;const audio=new Audio(src);audio.volume=volume;this.audio.push(audio);audio.play().catch(()=>{});}
 ripple(delay=0,strength=1){const ring={progress:0,alpha:0,strength};this.ripples.push(ring);this.timeline.to(ring,{progress:1,alpha:.8,duration:.22,delay,ease:'power1.out'},'<').to(ring,{progress:4,alpha:0,duration:1.75,ease:'power2.out'},'>');}
 splash(time,win=false){
  for(let i=0;i<(this.reduced?4:46);i++){const angle=i*2.399,velocity=50+(i%9)*19,drop={x:512,y:605,alpha:0,size:2+(i%4),gold:win};this.drops.push(drop);this.timeline.set(drop,{alpha:.85},time).to(drop,{x:512+Math.cos(angle)*velocity*1.8,y:530-Math.abs(Math.sin(angle))*velocity,alpha:.95,duration:.35,ease:'power2.out'},time).to(drop,{y:680,alpha:0,duration:.7,ease:'power2.in'},time+.35);}
  for(let i=0;i<4;i++){const ring={progress:0,alpha:0,strength:1};this.ripples.push(ring);this.timeline.set(ring,{alpha:.7},time+i*.14).to(ring,{progress:4,alpha:0,duration:1.8,ease:'power2.out'},time+i*.14);}
 }
 paint(){
  if(this.disposed||!this.water)return;const t=this.clock.time;this.water.clear();
  if(!this.reduced)for(let i=0;i<3;i++){const p=(t*.3+i/3)%1;this.water.ellipse(512,608,30+p*210,8+p*45).stroke({width:1.5,color:0x90e6d5,alpha:(1-p)*.22});}
  for(const r of this.ripples)this.water.ellipse(512,607,30+r.progress*95,8+r.progress*24).stroke({width:2.5,color:0xc1fff0,alpha:r.alpha});
  this.particles.clear();if(!this.reduced)for(let i=0;i<34;i++){const x=100+(i*173)%850+Math.sin(t*.45+i)*18,y=100+(i*79)%580+Math.cos(t*.3+i)*12,a=(Math.sin(t*.9+i)+1)*.18;this.particles.circle(x,y,1.3+(i%3)*.4).fill({color:i%3?0xffd581:0x91eed7,alpha:a});}
  for(const d of this.drops)if(d.alpha>0){this.particles.ellipse(d.x,d.y,d.size*.65,d.size*1.5).fill({color:d.gold?0xffd879:0xb8fff0,alpha:d.alpha});}
  this.flare.clear();const glow=this.clock.glow;if(glow>0){for(let i=8;i>0;i--)this.flare.ellipse(512,605,30+i*25,8+i*6).fill({color:0xffd675,alpha:glow*.012});}
  if(this.clock.burst>0){const p=this.clock.burst;for(let i=0;i<32;i++){const a=i*Math.PI/16+Math.sin(i)*.12,r=110+(1-p)*280;this.flare.moveTo(475+Math.cos(a)*r,330+Math.sin(a)*r*.8).lineTo(475+Math.cos(a)*(r+35),330+Math.sin(a)*(r+35)*.8).stroke({width:i%3+1,color:0xffde94,alpha:p*.75});}}
 }
 play(result){
  this.finish();this.ripples=[];this.drops=[];this.axes.forEach(a=>{gsap.killTweensOf(a);a.alpha=0;a.rotation=0;});this.rider.alpha=0;this.rider.position.set(550,690);this.rider.rotation=0;this.axes.forEach(a=>{a.width=144;a.height=288;});this.clock.glow=0;this.clock.burst=0;
  const win=result.kind!=='MISS',old=this.axes[0],gold=this.axes[1],silver=this.axes[2];
  return new Promise(resolve=>{this.resolve=resolve;const end=()=>{this.onPhase('complete');this.timeline=null;this.resolve=null;resolve();};this.timeline=gsap.timeline({onUpdate:()=>this.paint(),onComplete:end});const tl=this.timeline;
   if(this.reduced){this.rider.alpha=1;this.rider.y=650;(win?gold:silver).position.set(390,350);(win?gold:silver).alpha=1;this.paint();tl.call(()=>this.onPhase(win?'gold':'miss')).to(this.clock,{glow:win?1:0,duration:.35});return;}
   this.onPhase('throw');old.position.set(765,720);old.rotation=-.8;old.alpha=1;
   tl.to(old,{x:570,y:280,rotation:.4,duration:.52,ease:'power2.out'},0).to(old,{x:512,y:610,rotation:1.2,width:72,height:144,duration:.43,ease:'power2.in'},.52).to(old,{alpha:0,duration:.13},.88);
   tl.call(()=>{this.onPhase('pond');this.cue('/assets/sfx/v3-role-impact-v2/heal.mp3',.22);},[],.92);this.splash(.94);
   tl.to(this.clock,{glow:.85,duration:1.3},1.05).to(this.rider,{alpha:1,y:650,duration:.95,ease:'back.out(1.15)'},1.7).call(()=>this.onPhase('spirit'),[],1.75);
   silver.position.set(380,435);silver.rotation=-.2;gold.position.set(675,445);gold.rotation=.2;
   tl.to(silver,{alpha:.9,y:360,duration:.7,ease:'power2.out'},2.5).to(gold,{alpha:1,y:370,duration:.7,ease:'power2.out'},2.7);
   tl.call(()=>this.onPhase('choose'),[],2.65);
   if(win){tl.to(silver,{alpha:0,y:460,duration:.45},3.7).to(this.rider,{x:680,alpha:.7,duration:.6},3.7).to(gold,{x:445,y:320,width:185,height:370,rotation:-.08,duration:.75,ease:'back.out(1.15)'},3.7).to(this.clock,{burst:1,duration:.12},4.4).to(this.clock,{burst:0,duration:1.25},4.52).call(()=>{this.onPhase('gold');this.cue('/assets/sfx/v3-role-impact-v2/heal.mp3',.26);},[],4.42);this.splash(4.4,true);}
   else{tl.to(gold,{alpha:0,y:560,duration:.65},3.7).to(silver,{alpha:.8,x:415,y:400,rotation:.12,duration:.65},3.7).to(this.rider,{x:620,rotation:-.04,duration:.55},3.7).to(this.clock,{glow:.1,duration:1},3.8).call(()=>this.onPhase('miss'),[],4.45);}
   tl.to({}, {duration:.1},6.2);
  });
 }
 finish(){if(this.timeline){this.timeline.progress(1);this.timeline?.kill();this.timeline=null;}if(this.resolve){this.resolve();this.resolve=null;}for(const a of this.audio){a.pause();}this.audio=[];}
 reset(){this.finish();if(!this.rider)return;this.rider.position.set(550,650);this.rider.rotation=0;this.rider.alpha=0;this.axes.forEach(a=>{a.alpha=0;a.width=144;a.height=288;});this.clock.glow=0;this.clock.burst=0;this.paint();}
 destroy(){if(this.disposed)return;this.finish();this.disposed=true;this.loop?.kill();document.removeEventListener('visibilitychange',this.visibility);if(this.initialized)this.app?.destroy(true,{children:true,texture:false,textureSource:false});}
}
globalThis.GoldenAxeStage=GoldenAxeStage;
