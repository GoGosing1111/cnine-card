import {Application,Assets,Container,Graphics,Rectangle,Sprite} from 'pixi.js';
import {gsap} from 'gsap';
const ROOT='/assets/ui/events/chuseok-v1/';
// Presentation only. Choice does not determine odds; reward reveal consumes a server receipt.
class ChuseokStage{
 constructor(host,{onPhase=()=>{}}={}){this.host=host;this.onPhase=onPhase;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.disposed=false;this.mode='songpyeon';this.flecks=[];this.textures=[];}
 async init(){
  this.app=new Application();await this.app.init({width:1000,height:700,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl'});this.initialized=true;
  if(this.disposed){this.app.destroy(true);return;}
  this.host.append(this.app.canvas);this.app.canvas.setAttribute('aria-hidden','true');
  const [song,envelope,knead]=await Promise.all(['songpyeon-atlas.png','envelopes-atlas.png','knead-atlas.png'].map(p=>Assets.load(ROOT+p)));if(this.disposed)return;
  const frame=(base,x,y,w,h)=>{const texture=new base.constructor({source:base.source,frame:new Rectangle(x,y,w,h)});this.textures.push(texture);return texture;};
  this.song=Array.from({length:6},(_,i)=>frame(song,(i%3)*512,Math.floor(i/3)*512,512,512));
  // The open flap starts at y=410, not at the atlas midpoint.
  this.envelopes=Array.from({length:6},(_,i)=>frame(envelope,(i%3)*512,i<3?78:410,512,i<3?332:536));
  this.knead=Array.from({length:8},(_,i)=>{const x=Math.round((i%4)*knead.width/4),y=Math.round(Math.floor(i/4)*knead.height/2);return frame(knead,x,y,Math.round(((i%4)+1)*knead.width/4)-x,Math.round((Math.floor(i/4)+1)*knead.height/2)-y);});
  this.glow=new Graphics();this.app.stage.addChild(this.glow);this.world=new Container();this.app.stage.addChild(this.world);
  this.props=Array.from({length:3},()=>{const s=new Sprite(this.song[0]);s.anchor.set(.5,1);this.world.addChild(s);return s;});
  this.hands=new Sprite(this.knead[0]);this.hands.anchor.set(.5,1);this.hands.position.set(500,630);this.hands.width=440;this.hands.height=440;this.hands.alpha=0;this.world.addChild(this.hands);
  this.sparkles=new Graphics();this.app.stage.addChild(this.sparkles);this.clock={t:0,glow:0,steam:0};
  this.loop=gsap.to(this.clock,{t:Math.PI*200,duration:Math.PI*200,ease:'none',repeat:-1,onUpdate:()=>this.paint()});
  this.visibility=()=>{if(document.hidden){this.finish();this.loop.pause();this.app.stop();}else{this.app.start();if(!this.reduced)this.loop.resume();}};
  document.addEventListener('visibilitychange',this.visibility);if(this.reduced)this.loop.pause();this.reset(this.mode);return this;
 }
 setTexture(sprite,texture,width){sprite.texture=texture;sprite.width=width;sprite.height=width*texture.height/texture.width;}
 reset(mode=this.mode){
  this.finish();this.mode=mode;if(!this.props)return;
  this.hands.alpha=0;this.clock.glow=0;this.clock.steam=mode==='songpyeon'?.45:0;this.flecks=[];
  this.props.forEach((s,i)=>{this.setTexture(s,(mode==='songpyeon'?this.song:this.envelopes)[i],mode==='songpyeon'?285:250);s.position.set(210+i*290,568);s.alpha=1;s.rotation=mode==='envelope'?(i-1)*.12:0;});
  this.paint();
 }
 paint(){
  if(this.disposed||!this.sparkles)return;
  const {t,glow,steam}=this.clock;this.glow.clear();this.sparkles.clear();
  for(let i=10;i>0;i--)if(glow>0)this.glow.ellipse(500,500,24*i,11*i).fill({color:0xffdf9d,alpha:glow*.014});
  if(!this.reduced){
   for(let i=0;i<24;i++){const x=50+(i*173)%900+Math.sin(t*.3+i)*14,y=110+(i*71)%450-Math.sin(t*.2+i)*12;this.sparkles.circle(x,y,1+i%2).fill({color:0xffdf9d,alpha:(Math.sin(t*.8+i)+1)*.17});}
   if(steam>0)for(let i=0;i<12;i++){const progress=(t*.25+i/12)%1,x=210+Math.floor(i/4)*290+Math.sin(progress*8+i)*14;this.sparkles.ellipse(x,478-progress*135,8+progress*14,5+progress*10).fill({color:0xfff4d9,alpha:(1-progress)*steam*.15});}
  }
  for(const p of this.flecks)if(p.alpha>0)this.sparkles.circle(p.x,p.y,p.size).fill({color:p.color,alpha:p.alpha});
 }
 sequence(build){
  this.finish();return new Promise(resolve=>{this.resolve=resolve;this.timeline=gsap.timeline({onUpdate:()=>this.paint(),onComplete:()=>{this.timeline=null;this.resolve=null;resolve();}});build(this.timeline);if(this.reduced)this.timeline.timeScale(12);});
 }
 async prepare(mode){
  this.reset(mode);return this.sequence(tl=>{
   this.props.forEach(s=>s.alpha=0);
   if(mode==='songpyeon'){
    this.hands.texture=this.knead[0];this.hands.alpha=0;this.hands.y=660;
    tl.to(this.hands,{alpha:1,y:620,duration:.45,ease:'power2.out'},0);
    const captions=['동글동글, 반죽을 준비해요.','손끝으로 꾹, 납작하게.','한가운데에 작은 자리를 만들고','고소한 깨소를 듬뿍.','반달 모양으로 접어서','가장자리를 꼭꼭 여미면','정성 가득, 예쁜 송편 완성.','자, 어떤 송편을 먹어볼까?'];
    for(let i=0;i<8;i++)tl.call(()=>{this.hands.texture=this.knead[i];this.onPhase(captions[i]);},[],i*.48+.2);
    tl.to(this.hands,{alpha:0,y:670,duration:.4},4.15);
    this.props.forEach((s,i)=>{s.y=590;tl.to(s,{alpha:1,y:568,duration:.6,ease:'back.out(1.2)'},4.45+i*.13);});
    tl.to(this.clock,{steam:1,duration:.6},4.5);
   }else{
    this.onPhase('숲켓몬 하느라 고생 많았어. 봉투 하나 골라봐.');
    this.props.forEach((s,i)=>{s.position.set(500,640);s.rotation=0;tl.to(s,{alpha:1,x:210+i*290,y:568,rotation:(i-1)*.12,duration:.8,ease:'back.out(1.25)'},.2+i*.15);});
   }
   tl.call(()=>this.onPhase(mode==='songpyeon'?'세 가지 빛깔, 어떤 송편이 끌리나요?':'마음이 가는 봉투 하나를 골라보세요.'),[],mode==='songpyeon'?5.4:1.45);
  });
 }
 select(index){
  if(!this.props)return;this.props.forEach((s,i)=>{s.alpha=i===index?1:.4;});this.paint();
 }
 async reveal(receipt){
  const index=receipt.choice,mode=receipt.event;this.reset(mode);return this.sequence(tl=>{
   const selected=this.props[index];
   this.props.forEach((s,i)=>{if(i!==index)tl.to(s,{alpha:0,y:620,duration:.4},0);});
   this.onPhase(mode==='songpyeon'?'한 입 베어 물면…':'봉투 속에 담긴 마음은…');
   tl.to(selected,{x:500,y:565,rotation:0,duration:.7,ease:'power3.inOut'},0).to(selected.scale,{x:mode==='songpyeon'?.78:.78,y:mode==='songpyeon'?.78:.78,duration:.7,ease:'power3.inOut'},0);
   tl.to(this.clock,{glow:1,steam:0,duration:.8},.55);
   // The envelope physically closes edge-on before its unfolded silhouette appears.
   if(mode==='envelope')tl.to(selected.scale,{y:.025,duration:.28,ease:'power2.in'},.8).call(()=>{this.setTexture(selected,this.envelopes[index+3],400);selected.scale.y=.025;},[],1.08).to(selected.scale,{y:400/512,duration:.65,ease:'back.out(1.05)'},1.09);
   else tl.to(selected,{rotation:-.035,duration:.12,repeat:3,yoyo:true},.8).call(()=>{this.setTexture(selected,this.song[index+3],400);},[],1.32);
   for(let i=0;i<32;i++){const a=i*2.399,p={x:500,y:395,alpha:0,size:1.5+i%3,color:i%3?0xffd593:0xc8ff6b};this.flecks.push(p);tl.set(p,{alpha:.9},1.5).to(p,{x:500+Math.cos(a)*(120+i*4),y:395+Math.sin(a)*(85+i*3),alpha:0,duration:1.4,ease:'power2.out'},1.5);}
   tl.call(()=>this.onPhase('결과를 확인합니다.'),[],2.6).to(this.clock,{glow:.35,duration:.4},2.6);
  });
 }
 finish(){const timeline=this.timeline;if(timeline){timeline.progress(1);timeline.kill();this.timeline=null;}if(this.resolve){const resolve=this.resolve;this.resolve=null;resolve();}}
 destroy(){if(this.disposed)return;this.finish();this.disposed=true;this.loop?.kill();document.removeEventListener('visibilitychange',this.visibility);if(this.initialized)this.app?.destroy(true,{children:true,texture:false,textureSource:false});for(const t of this.textures)t.destroy(false);}
}
globalThis.ChuseokStage=ChuseokStage;
