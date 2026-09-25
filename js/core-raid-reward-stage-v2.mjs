const ROOT=new URL('../assets/ui/core-raid-rewards-v2/',import.meta.url);
const SFX='/assets/sfx/v3-advancement-awakening-v1/';
let vendorPromise;
export async function rewardRuntime(){
  if(globalThis.CNineUiFxVendor)return globalThis.CNineUiFxVendor;
  vendorPromise??=import('/js/ui-fx-vendor-v2045.bundle.js?v=2045').then(()=>globalThis.CNineUiFxVendor).catch(error=>{vendorPromise=null;throw error;});
  return vendorPromise;
}

// One UI canvas, shared Pixi 8.20/GSAP 3.13 vendor. Every moving layer samples
// the same GSAP time. The renderer never chooses or grants a reward.
export class ReliquaryStage{
  constructor(host,{onLayout=()=>{},onReveal=()=>{},onPhase=()=>{},speed=1}={}){
    Object.assign(this,{host,onLayout,onReveal,onPhase,speed});
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clock={time:0,light:0,burst:0,smoke:0,ring:0};
    this.items=[];this.crops=[];this.pending=new Set();this.sounds=[];
    this.selected=null;this.soundEnabled=true;this.disposed=false;
  }
  async init(){
    const runtime=await rewardRuntime();if(this.disposed)return;
    this.gsap=runtime.gsap;this.P=runtime.pixi;
    const [base,metadata]=await Promise.all([
      this.P.Assets.load(new URL('reliquary-opening-v2.png',ROOT).href),
      fetch(new URL('reliquary-frames.json',ROOT)).then(response=>{if(!response.ok)throw Error('보관함 원화를 불러오지 못했습니다.');return response.json();})
    ]);
    if(this.disposed)return;
    this.meta=metadata.frames;
    this.crops=this.meta.map(frame=>new base.constructor({source:base.source,frame:new this.P.Rectangle(frame.x,frame.y,frame.w,frame.h)}));
    this.app=new this.P.Application();
    await this.app.init({width:Math.max(1,this.host.clientWidth),height:Math.max(1,this.host.clientHeight),backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,1.5),autoDensity:true,autoStart:false,preference:'webgl'});
    if(this.disposed){this.app.destroy(true);return;}
    this.host.append(this.app.canvas);this.app.canvas.setAttribute('aria-hidden','true');
    this.floor=new this.P.Graphics();this.backFx=new this.P.Graphics();this.world=new this.P.Container();this.frontFx=new this.P.Graphics();
    this.app.stage.addChild(this.floor,this.backFx,this.world,this.frontFx);
    this.items=[0,1,2].map(index=>{
      const sprite=new this.P.Sprite(this.crops[0]);this.world.addChild(sprite);
      return {index,sprite,x:0,y:0,width:0,alpha:0,lift:0,hover:0,frame:0};
    });
    this.resize=()=>{if(this.disposed)return;this.app.renderer.resize(this.host.clientWidth,this.host.clientHeight);this.layout();this.paint();};
    this.observer=new ResizeObserver(this.resize);this.observer.observe(this.host);
    if(!this.reduced)this.loop=this.gsap.to(this.clock,{time:600,duration:600,ease:'none',repeat:-1});
    // One render per GSAP tick. A sequence does not draw a second canvas frame.
    this.renderTick=()=>{if(!document.hidden&&!this.reduced)this.paint();};this.gsap.ticker.add(this.renderTick);
    this.visibility=()=>{if(document.hidden){this.loop?.pause();this.timeline?.pause();this.stopAudio();}else{this.loop?.resume();this.timeline?.resume();this.paint();}};
    document.addEventListener('visibilitychange',this.visibility);
    this.layout();
    this.items.forEach((item,i)=>{item.lift=-30;this.gsap.to(item,{alpha:1,lift:0,duration:this.reduced?.01:.85,delay:this.reduced?0:.15+i*.14,ease:'power3.out',onUpdate:this.reduced?()=>this.paint():undefined});});
    this.paint();return this;
  }
  layout(){
    const w=this.host.clientWidth,h=this.host.clientHeight,mobile=w<650;
    this.w=w;this.h=h;this.mobile=mobile;
    const width=mobile?Math.min(w*.39,h<700?h*.2:225):Math.min(w*.255,h*.38,335);
    const centers=mobile?[[.20,.53],[.5,.72],[.80,.53]]:[[.235,.665],[.5,.69],[.765,.665]];
    this.positions=centers.map(([x,y],i)=>({x:w*x,y:h*y,width:width*(mobile&&i!==1?.91:1)}));
    if(this.selected===null)this.items.forEach((item,i)=>Object.assign(item,this.positions[i]));
    else{
      const item=this.items[this.selected];
      item.x=w*.5;item.y=h*(this.finished?.89:mobile?.7:.76);item.width=Math.min(w*(mobile?.68:.35),445);
    }
    this.onLayout(this.positions.map(position=>({...position,height:position.width*this.meta[0].h/this.meta[0].w})),mobile);
  }
  hover(index,active){
    if(this.selected!==null||this.disposed||this.reduced)return;
    const item=this.items[index];this.gsap.to(item,{hover:active?1:0,lift:active?12:0,duration:.28,ease:'power2.out',overwrite:'auto'});
  }
  sound(file,volume){
    if(!this.soundEnabled||this.reduced||this.disposed||this.speed!==1)return;
    const audio=new Audio(SFX+file);audio.volume=volume;this.sounds.push(audio);void audio.play().catch(()=>{});
    audio.onended=()=>{this.sounds=this.sounds.filter(item=>item!==audio);};
  }
  stopAudio(){this.sounds.forEach(audio=>{audio.pause();audio.removeAttribute('src');audio.load();});this.sounds=[];}
  mute(){this.soundEnabled=!this.soundEnabled;if(!this.soundEnabled)this.stopAudio();return this.soundEnabled;}
  sequence(build){
    if(this.disposed)return Promise.resolve();
    return new Promise(resolve=>{
      const done=()=>{this.pending.delete(done);this.timeline=null;resolve();};this.pending.add(done);
      const timeline=this.gsap.timeline({onUpdate:this.reduced?()=>this.paint():undefined,onComplete:done});this.timeline=timeline;
      build(timeline);timeline.timeScale(this.reduced?15:this.speed);
    });
  }
  select(index){
    this.selected=index;const item=this.items[index];
    this.world.setChildIndex(item.sprite,this.world.children.length-1);
    this.items.forEach(target=>this.gsap.killTweensOf(target));
    this.sound('afterimage-advancement-v1.mp3',.10);
    return this.sequence(timeline=>{
      this.items.forEach((target,i)=>{if(i!==index)timeline.to(target,{alpha:0,x:target.x+(i<index?-1:1)*this.w*.13,y:target.y+45,duration:.5,ease:'power2.in'},0);});
      timeline.to(item,{x:this.w*.5,y:this.h*(this.mobile?.7:.76),width:Math.min(this.w*(this.mobile?.68:.35),445),lift:0,hover:0,duration:.7,ease:'power3.inOut'},0);
      timeline.to(this.clock,{light:.15,duration:.65},0);
    });
  }
  reveal(){
    const item=this.items[this.selected];
    return this.sequence(timeline=>{
      this.onPhase('UNLOCK');
      timeline.call(()=>this.sound('riposte-advancement-v1.mp3',.22),[],0);
      const times=[0,.30,.48,.67,.89,1.12,1.33,1.47];
      times.forEach((time,frame)=>timeline.set(item,{frame},time));
      timeline.to(this.clock,{light:.7,smoke:.5,duration:.9,ease:'power2.in'},.35);
      timeline.call(()=>this.sound('immortal-advancement-v1.mp3',.26),[],.797);
      timeline.set(this.clock,{burst:0,ring:0},1.12).to(this.clock,{burst:1,ring:1,duration:1.65,ease:'none'},1.12);
      timeline.to(this.clock,{light:1.8,smoke:1,duration:.17,ease:'power2.out'},1.12);
      timeline.to(this.clock,{light:.35,smoke:.25,duration:1.8,ease:'power3.out'},1.31);
      timeline.call(()=>{this.onPhase('REVEAL');this.onReveal();},[],1.53);
      timeline.to(item,{y:this.h*.89,alpha:0,width:Math.min(this.w*(this.mobile?.52:.30),350),duration:1.1,ease:'power2.inOut'},1.60);
      timeline.to(this.clock,{light:0,smoke:0,duration:.8},2.25);
      timeline.call(()=>{this.finished=true;},[],3.12);
    });
  }
  showSettled(index=1){
    this.selected=index;this.finished=true;this.items.forEach(item=>{this.gsap.killTweensOf(item);item.frame=7;item.alpha=0;});
    this.clock.light=0;this.layout();this.paint();this.onReveal();
  }
  paint(){
    if(this.disposed||!this.app?.renderer||!this.meta)return;
    const {time,light,burst,smoke,ring}=this.clock,w=this.w,h=this.h;
    this.floor.clear();this.backFx.clear();this.frontFx.clear();
    for(const item of this.items){
      const i=Math.min(7,Math.max(0,Math.round(item.frame))),frame=this.meta[i];
      item.sprite.texture=this.crops[i];item.sprite.anchor.set(frame.anchorX,frame.anchorY);
      item.sprite.scale.set(item.width/this.meta[0].w*(1+item.hover*.035));
      item.sprite.position.set(item.x,item.y-item.lift);item.sprite.alpha=item.alpha;
      if(item.alpha<.001)continue;
      for(let j=5;j>=1;j--)this.floor.ellipse(item.x,item.y+4,item.width*(.45+j*.019),item.width*(.065+j*.012)).fill({color:0x000409,alpha:.15*item.alpha});
      this.floor.ellipse(item.x,item.y+5,item.width*.48,item.width*.13).stroke({color:0xd6ac65,width:.8+item.hover*.6,alpha:(.15+item.hover*.55)*item.alpha});
      for(let j=4;j>=1;j--)this.floor.ellipse(item.x,item.y+2,item.width*(.24+j*.03),item.width*(.04+j*.02)).fill({color:item.hover>0?0xffc774:0x62dbde,alpha:(.023+item.hover*.016)*item.alpha});
      if(this.selected===null&&!this.reduced){
        const pulse=(Math.sin(time*1.5+item.index)+1)*.5;
        this.frontFx.circle(item.x-item.width*.047,item.y-item.width*.28,2+pulse*2).fill({color:0xc0fffa,alpha:.08+pulse*.14});
      }
    }
    if(!this.reduced)for(let i=0;i<38;i++){
      const x=((i*139.37)%w)+Math.sin(time*.32+i)*15,y=h-((time*(5+i%3)+i*67.9)%(h*.84));
      this.frontFx.circle(x,y,i%6===0?1.3:.65).fill({color:i%3?0x83caca:0xfed490,alpha:(.08+Math.sin(time*.3+i)*.04)*(y/h)});
    }
    if(this.selected!==null&&light>0){
      const item=this.items[this.selected],cx=item.x,cy=item.y-item.width*.33;
      for(let i=10;i>0;i--)this.backFx.ellipse(cx,cy-i*3,item.width*(.15+i*.035),item.width*(.16+i*.033)).fill({color:i%3?0xa4e9db:0xffd894,alpha:.012*light});
      for(let i=0;i<9;i++){
        const angle=(i-4)*.10+Math.sin(time*.2+i)*.007,reach=Math.min(h*.6,480),top=cx+Math.sin(angle)*reach;
        this.backFx.poly([cx-8,cy,top-18-i%3*8,cy-reach,top+13+i%3*10,cy-reach,cx+8,cy]).fill({color:i%2?0xffe9bd:0xa7efed,alpha:light*.011});
      }
      if(ring>0&&ring<1)this.floor.ellipse(cx,item.y+5,item.width*(.45+ring*1.4),item.width*(.11+ring*.29)).stroke({color:0xffe6b4,width:2*(1-ring)+.5,alpha:(1-ring)*.6});
      if(smoke>0&&!this.reduced)for(let i=0;i<14;i++){
        const p=(time*.24+i/14)%1,x=cx+(i%2?-1:1)*p*item.width*.55+Math.sin(p*6+i)*12;
        this.frontFx.ellipse(x,cy-p*item.width*.5,9+p*27,6+p*11).fill({color:i%3?0x9caead:0xcce2d7,alpha:(1-p)*smoke*.027});
      }
      if(burst>0&&burst<1&&!this.reduced)for(let i=0;i<46;i++){
        const angle=i*2.39996,speed=30+(i%9)*24,p=burst,x=cx+Math.cos(angle)*speed*p*1.6,y=cy+Math.sin(angle)*speed*p*.85-110*p+170*p*p;
        const alpha=(1-p)*(i%3?.8:.5),size=i%5===0?2.1:.9;
        this.frontFx.moveTo(x,y).lineTo(x-Math.cos(angle)*(3+i%5)*(1-p),y-Math.sin(angle)*(3+i%5)*(1-p)).stroke({color:i%3?0xffd695:0xafffff,width:size,alpha});
      }
      if(light>.7)for(let i=7;i>0;i--)this.frontFx.ellipse(cx,cy,item.width*(.10+i*.012),2+i*1.9).fill({color:0xfff1cf,alpha:(light-.7)*.035});
    }
    this.app.render();
  }
  destroy(){
    if(this.disposed)return;this.disposed=true;this.timeline?.kill();this.loop?.kill();if(this.renderTick)this.gsap.ticker.remove(this.renderTick);
    this.items.forEach(item=>this.gsap?.killTweensOf(item));this.stopAudio();this.observer?.disconnect();
    document.removeEventListener('visibilitychange',this.visibility);
    for(const done of this.pending)done();this.pending.clear();
    if(this.app?.renderer)this.app.destroy(true,{children:true,texture:false,textureSource:false});
    for(const texture of this.crops)texture.destroy(false);
  }
}
