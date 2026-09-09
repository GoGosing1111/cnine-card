import {Application,Assets,BlurFilter,Container,Graphics,Sprite,Text} from 'pixi.js';
import {gsap} from 'gsap';
const LAMP='/assets/ui/events/wish-lamp-v2077/lamp.png';
const text=(value,size,color=0xffe4be)=>new Text({text:value,style:{fontFamily:'Pretendard,Malgun Gothic,sans-serif',fontSize:size,fontWeight:'500',fill:color,align:'center',letterSpacing:2}});
function fit(sprite,w,h){sprite.anchor.set(.5);sprite.scale.set(Math.min(w/sprite.texture.width,h/sprite.texture.height));return sprite}
export class WishLampPresentation{
 constructor(host,onState){this.host=host;this.onState=onState;this.epoch=0;this.disposed=false;this.speed=1;this.pendingDestroy=new Map()}
 async init(){
  this.app=new Application();await this.app.init({resizeTo:this.host,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,1.75),autoDensity:true});
  this.initialized=true;if(this.disposed){this.app.destroy(true,{children:true});return}
  this.host.append(this.app.canvas);this.app.canvas.setAttribute('aria-hidden','true');this.root=new Container();this.app.stage.addChild(this.root);
  this.resize=()=>{const s=Math.min(this.host.clientWidth/900,this.host.clientHeight/680);this.root.scale.set(s);this.root.position.set(this.host.clientWidth/2,this.host.clientHeight/2)};
  this.observer=new ResizeObserver(this.resize);this.observer.observe(this.host);this.resize();await Assets.load(LAMP);if(!this.disposed)this.idle();
 }
 clear(){this.timeline?.kill();this.timeline=null;this.resolve?.();this.resolve=null;if(!this.root)return;const old=this.root.removeChildren(),destroy=()=>{for(const child of old)if(!child.destroyed)child.destroy({children:true})};if(this.disposed){destroy();return}const timer=setTimeout(()=>{destroy();this.pendingDestroy.delete(timer)},100);this.pendingDestroy.set(timer,destroy)}
 emit(phase){this.host.dataset.phase=phase;this.onState?.(phase)}
 base(tl,casting=false){
  const halo=new Graphics().ellipse(0,120,235,110).fill({color:0x872f61,alpha:.22});halo.filters=[new BlurFilter({strength:30,quality:2})];this.root.addChild(halo);
  for(let i=0;i<3;i++){const ring=new Graphics().ellipse(0,200,220+i*44,58+i*13).stroke({color:0xf4cb89,width:i?1:2,alpha:.2});this.root.addChild(ring);tl.to(ring,{alpha:.5,duration:2+i*.2,yoyo:true,repeat:1},0)}
  for(let i=0;i<70;i++){const p=new Graphics().circle(0,0,i%5?1:2.5).fill({color:i%3?0xfeb6d4:0xffd89e,alpha:.5});p.position.set(Math.sin(i*17.17)*390,Math.cos(i*31.19)*280);p.blendMode='add';this.root.addChild(p);tl.to(p,{y:p.y-45,alpha:.08,duration:3+i%3,yoyo:true,repeat:casting?0:1},0)}
  const lamp=fit(new Sprite(Assets.get(LAMP)),710,480);lamp.y=25;this.root.addChild(lamp);return lamp;
 }
 idle(){if(this.disposed||!this.root)return;this.clear();const tl=this.timeline=gsap.timeline({repeat:-1,yoyo:true});const lamp=this.base(tl);tl.to(lamp,{y:12,duration:3.4,ease:'sine.inOut'},0);this.emit('ready')}
 smoke(tl){
  const haze=new Graphics(),threads=new Graphics();haze.blendMode='add';threads.blendMode='add';haze.filters=[new BlurFilter({strength:13,quality:2})];this.root.addChild(haze,threads);
  const p={flow:0,opacity:0};tl.to(p,{flow:1,duration:2.55,ease:'power1.inOut'},.35).to(p,{opacity:.85,duration:.5},.4).to(p,{opacity:0,duration:.65},2.85);
  tl.eventCallback('onUpdate',()=>{haze.clear();threads.clear();for(let j=0;j<4;j++)for(let i=0;i<26;i++){
   const u=i/25,a=u*8.4-p.flow*11+j*.8,travel=Math.min(1,p.flow*1.5),x=-260*(1-u)+Math.sin(a)*(25+u*115)*travel,y=-85-u*180+Math.cos(a)*18;
   const alpha=p.opacity*Math.sin(u*Math.PI)*Math.min(1,travel*3-u);if(alpha<=0)continue;
   haze.circle(x,y,8+u*19).fill({color:j%2?0xf18ac7:0xffcf91,alpha:alpha*.12});
   threads.circle(x+Math.sin(a*2)*4,y,1.2+u*1.4).fill({color:j%2?0xffcadf:0xffecc5,alpha:alpha*.8});
  }});
 }
 burst(tl,color){
  const haze=new Graphics().circle(0,-75,70).fill({color,alpha:.6});haze.filters=[new BlurFilter({strength:22,quality:2})];haze.alpha=0;this.root.addChild(haze);
  tl.to(haze,{alpha:1,duration:.18},2.65).to(haze,{alpha:0,duration:1.1},2.9);tl.to(haze.scale,{x:4,y:4,duration:1.1,ease:'power3.out'},2.65);
  for(let k=0;k<3;k++){const ring=new Graphics().circle(0,0,65).stroke({color,width:3-k*.7,alpha:.75});ring.y=-75;ring.alpha=0;this.root.addChild(ring);tl.to(ring,{alpha:.9,duration:.12},2.7+k*.12).to(ring,{alpha:0,duration:.8},2.84+k*.12);tl.to(ring.scale,{x:5+k,y:5+k,duration:1,ease:'power3.out'},2.7+k*.12)}
  for(let i=0;i<110;i++){const a=i*2.39996,r=160+(i%19)*17,p=new Graphics().rect(-1,-3,2,i%7?6:17).fill(i%3?color:0xfff1d6);p.position.set(0,-75);p.alpha=0;p.rotation=-a;p.blendMode='add';this.root.addChild(p);tl.to(p,{alpha:1,duration:.08},2.7).to(p,{x:Math.sin(a)*r,y:-75+Math.cos(a)*r*.7,alpha:0,duration:.85+(i%8)*.12,ease:'power3.out'},2.78)}
 }
 async play(result){
  if(this.disposed)return;const epoch=++this.epoch;this.clear();this.result=result;this.emit('casting');let texture;
  if(result.reward?.image)try{texture=await Assets.load(result.reward.image)}catch{}
  if(this.disposed||epoch!==this.epoch)return;
  const tl=this.timeline=gsap.timeline({paused:true}),lamp=this.base(tl,true);this.smoke(tl);
  tl.to(lamp,{y:5,duration:1,ease:'sine.inOut'},0).to(lamp,{rotation:.012,duration:.075,repeat:11,yoyo:true},1.35).to(lamp,{rotation:0,alpha:.08,y:125,duration:.55},2.6);
  const win=result.kind!=='MISS',color=win?(result.kind==='VEHICLE'?0xffd28b:result.kind==='BATTLE_SUIT'?0xffa6d2:0xb9afff):0x9c839d;
  if(win)this.burst(tl,color);
  const group=new Container();group.y=-60;group.alpha=0;group.scale.set(.72);this.root.addChild(group);
  if(texture){const reward=fit(new Sprite(texture),result.kind==='VEHICLE'?510:320,315);group.addChild(reward)}
  else if(!win){const circle=new Graphics().circle(0,0,66).stroke({color,width:1,alpha:.6}),dash=text('—',70,color);dash.anchor.set(.5);group.addChild(circle,dash)}
  else{const badge=text('소원 성취',46,color);badge.anchor.set(.5);group.addChild(badge)}
  const label=text(win?result.reward.name:'이번 소원은 닿지 않았어요',32,color);label.anchor.set(.5);label.y=150;label.alpha=0;this.root.addChild(label);
  const hint=text(result.preview?'연출 미리보기 · 실제 지급 없음':win?'보관함에 지급되었습니다':'획득한 아이템이 없습니다',18,0xafa0ac);hint.anchor.set(.5);hint.y=191;hint.alpha=0;this.root.addChild(hint);
  tl.to(group,{alpha:1,duration:.6},3.0).to(group.scale,{x:1,y:1,duration:.9,ease:'back.out(1.15)'},3.0).to([label,hint],{alpha:1,duration:.5},3.45).call(()=>this.emit('revealed'),[],3.5);
  tl.to({hold:0},{hold:1,duration:1.0},4.0);
  await new Promise(resolve=>{this.resolve=resolve;tl.eventCallback('onComplete',()=>{this.resolve=null;this.emit('complete');resolve()});tl.timeScale(this.speed).play()});
 }
 skip(){if(this.timeline&&this.result){this.timeline.progress(1);this.emit('complete')}}
 pause(value=true){this.timeline?.paused(value)}
 destroy(){if(this.disposed)return;this.disposed=true;++this.epoch;this.observer?.disconnect();this.app?.ticker?.stop();this.clear();for(const [timer,destroy] of this.pendingDestroy){clearTimeout(timer);destroy()}this.pendingDestroy.clear();if(this.initialized)this.app.destroy(true,{children:true});}
}
globalThis.WishLampPresentation=WishLampPresentation;
