import {Application,Assets,BlurFilter,Container,Graphics,Sprite,Text} from 'pixi.js';
import {gsap} from 'gsap';

const ART = {
  pack:'/assets/ui/packs/hyper-pack-v2076.png',
  energy:'/assets/items/starlight-armor-core-v1749.png',
  mercenary:'/assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png',
};
const TONES = {MISS:0x83909f,MASTER_STAR:0xffd17b,MYSTIC_ENERGY:0xaa7bff,MERCENARY:0xf2c9ff};
const LABELS = {MISS:'꽝',MASTER_STAR:'마스터의 별',MYSTIC_ENERGY:'미스틱 에너지',MERCENARY:'용병카드'};
const text = (value,size=20,color=0xf5eeff) => new Text({text:value,style:{fontFamily:'Pretendard, Arial, sans-serif',fontSize:size,fill:color,fontWeight:'600',letterSpacing:2}});
const fit = (sprite,w,h) => { sprite.anchor.set(.5); sprite.scale.set(Math.min(w/sprite.texture.width,h/sprite.texture.height)); return sprite; };
function star(radius,color) {
  const shape = new Graphics();
  for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?radius*.43:radius,x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}
  return shape.closePath().fill(color).stroke({color:0xfff3cb,width:2});
}

class HyperPackPresentation {
  constructor(host, onState) { this.host=host; this.onState=onState; this.generation=0; this.speed=1; this.running=false; this.retired=[]; }
  async init() {
    const generation=this.generation;
    this.app=new Application();
    await this.app.init({resizeTo:this.host,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true});
    if(generation!==this.generation){this.app.destroy(true,{children:true});return;}
    this.host.append(this.app.canvas); this.app.canvas.setAttribute('aria-hidden','true');
    this.width=this.host.clientWidth<600?520:1000; this.height=720;
    this.root=new Container(); this.app.stage.addChild(this.root);
    this.resize=()=>{const scale=Math.min(this.host.clientWidth/this.width,this.host.clientHeight/this.height);this.root.scale.set(scale);this.root.position.set(this.host.clientWidth/2,this.host.clientHeight/2);};
    this.observer=new ResizeObserver(this.resize); this.observer.observe(this.host); this.resize();
    await Promise.all(Object.values(ART).map(url=>Assets.load(url)));
    if(generation!==this.generation)return;
    this.idle(); this.emit('ready');
  }
  emit(state,details={}) { this.host.dataset.state=state; this.onState?.({state,...details}); }
  clear() {
    this.timeline?.kill(); this.timeline=null;
    for(const child of this.root.removeChildren()) { this.retired.push(child); }
    // Detach immediately, destroy after rendering has released the previous display list.
    const old=this.retired.splice(0);
    this.cleanupTimer=setTimeout(()=>old.forEach(child=>child.destroy({children:true})),100);
  }
  ambience(timeline) {
    const layer=new Container(); this.root.addChild(layer);
    const haze=new Graphics().circle(0,0,150).fill({color:0x722bbe,alpha:.22});
    haze.scale.set(1.4,.8); haze.filters=[new BlurFilter({strength:34,quality:3})];layer.addChild(haze);
    for(let i=0;i<3;i++){
      const ring=new Graphics().ellipse(0,0,180+i*48,72+i*25).stroke({color:i===1?0xe5b974:0xa474e4,width:i===0?2:1,alpha:.25});
      ring.y=205; ring.rotation=i*.13;layer.addChild(ring);
      timeline.to(ring,{alpha:.52,duration:1.1+i*.3,yoyo:true,repeat:1},0);
    }
    for(let i=0;i<55;i++){
      const dot=new Graphics().circle(0,0,1+(i%3)*.6).fill({color:i%3?0xb79be6:0xe8c886,alpha:.4});
      dot.position.set(Math.sin(i*83)*this.width*.44,Math.cos(i*31)*305);dot.blendMode='add'; layer.addChild(dot);
      timeline.to(dot,{y:dot.y-45,alpha:0,duration:1.7+(i%7)*.2},0);
    }
    return layer;
  }
  idle() {
    if(!this.root)return; this.clear();
    const timeline=gsap.timeline({repeat:-1,yoyo:true});this.timeline=timeline;
    this.ambience(timeline);
    const pack=fit(new Sprite(Assets.get(ART.pack)),270,450);pack.y=-24;this.root.addChild(pack);
    timeline.to(pack,{y:-33,duration:2.5,ease:'sine.inOut'},0);
    const heading=text('EXTREME / HYPER PACK',16,0xc5a5e2);heading.anchor.set(.5);heading.y=265;this.root.addChild(heading);
  }
  lightning(timeline,at,color) {
    for(let i=0;i<8;i++){
      const bolt=new Graphics(),angle=i*Math.PI/4;
      bolt.moveTo(Math.cos(angle)*60,Math.sin(angle)*60);
      for(let j=1;j<6;j++){const a=angle+Math.sin(i*13+j*71)*.18,r=55+j*43;bolt.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
      bolt.stroke({color,width:i%2?1:2,alpha:.8});bolt.blendMode='add';bolt.alpha=0;this.root.addChild(bolt);
      timeline.to(bolt,{alpha:1,duration:.09},at+(i%3)*.055).to(bolt,{alpha:0,duration:.28},at+.2);
    }
  }
  burst(timeline,at,color,heavy=false) {
    const glow=new Graphics().circle(0,0,85).fill({color,alpha:.42});glow.filters=[new BlurFilter({strength:22,quality:2})];glow.alpha=0;this.root.addChild(glow);
    timeline.to(glow,{alpha:1,duration:.12},at).to(glow,{alpha:0,duration:.75},at+.15);
    timeline.to(glow.scale,{x:heavy?4:3,y:heavy?4:3,duration:.8,ease:'power2.out'},at);
    for(let i=0;i<(heavy?64:32);i++){
      const angle=i*2.39996,particle=new Graphics().rect(-1,-5,2,i%4?8:20).fill(color);particle.rotation=angle;particle.alpha=0;particle.blendMode='add';this.root.addChild(particle);
      const r=120+(i%13)*18;
      timeline.to(particle,{alpha:.9,duration:.1},at).to(particle,{x:Math.sin(angle)*r,y:Math.cos(angle)*r,alpha:0,duration:.7+(i%5)*.1,ease:'power3.out'},at+.05);
    }
    const ring=new Graphics().circle(0,0,100).stroke({color,width:3,alpha:.8});ring.alpha=0;this.root.addChild(ring);
    timeline.to(ring,{alpha:1,duration:.08},at).to(ring,{alpha:0,duration:.7},at+.08);
    timeline.to(ring.scale,{x:3.6,y:3.6,duration:.85,ease:'power3.out'},at);
  }
  reward(kind) {
    const group=new Container();
    if(kind==='MASTER_STAR'){
      const halo=star(108,0xf4b249);halo.alpha=.18;halo.filters=[new BlurFilter({strength:18,quality:2})];group.addChild(halo,star(86,0xe8b756));
      const inner=star(54,0xffe9ab);inner.alpha=.4;group.addChild(inner);
    }else if(kind==='MISS'){
      group.addChild(new Graphics().circle(0,0,72).stroke({color:0x677086,width:1,alpha:.65}));
      const dash=text('—',74,0x8f96a4);dash.anchor.set(.5);group.addChild(dash);
    }else{
      const card=fit(new Sprite(Assets.get(kind==='MERCENARY'?ART.mercenary:ART.energy)),kind==='MERCENARY'?260:210,kind==='MERCENARY'?390:240);
      group.addChild(card);
      if(kind==='MERCENARY'){
        const frame=new Graphics().roundRect(-card.width/2-5,-card.height/2-5,card.width+10,card.height+10,5).stroke({color:0xf1d9a5,width:2});group.addChild(frame);
      }
    }
    return group;
  }
  segment(result,index) {
    this.clear();const color=TONES[result.kind],timeline=gsap.timeline({paused:true});this.timeline=timeline;
    this.ambience(timeline);
    const pack=fit(new Sprite(Assets.get(ART.pack)),245,400);pack.x=index?this.width*.7:0;this.root.addChild(pack);
    timeline.to(pack,{x:0,duration:.35,ease:'power3.out'},0);
    timeline.to(pack.scale,{x:pack.scale.x*1.04,y:pack.scale.y*1.04,duration:.7,ease:'power2.in'},.35);
    this.lightning(timeline,.8,0xc189ff);
    timeline.to(pack,{alpha:0,duration:.22},1.05);
    if(result.kind!=='MISS')this.burst(timeline,1.04,color,result.kind==='MERCENARY');
    const reward=this.reward(result.kind);reward.alpha=0;reward.y=-30;reward.scale.set(.8);this.root.addChild(reward);
    timeline.to(reward,{alpha:1,duration:.32},1.12).to(reward.scale,{x:1,y:1,duration:.65,ease:'back.out(1.3)'},1.12);
    const label=text(LABELS[result.kind],result.kind==='MERCENARY'?32:30,color);label.anchor.set(.5);label.y=230;label.alpha=0;this.root.addChild(label);
    const hint=text(result.kind==='MISS'?'획득 없음':result.kind==='MERCENARY'?'베스페라 · 원화 예시 / 등급 미정':'수량은 CMS에서 설정',13,0xb3a6c3);hint.anchor.set(.5);hint.y=270;hint.alpha=0;this.root.addChild(hint);
    timeline.to([label,hint],{alpha:1,duration:.3},1.35);
    timeline.call(()=>this.emit('revealed',{index,result}),[],1.4);
    const dwell=result.kind==='MERCENARY'?3.7:3.0;
    timeline.to([reward,label,hint],{x:-this.width*.75,alpha:0,duration:.4,ease:'power2.in'},dwell);
    return new Promise(resolve=>{
      this.resolveSegment=resolve;
      timeline.eventCallback('onComplete',()=>{this.resolveSegment=null;resolve();});
      timeline.timeScale(this.speed).play();
    });
  }
  async play(results) {
    if(this.running) return false;
    if(!Array.isArray(results)||results.length<1||results.length>10||results.some(row=>row.preview!==true||row.granted!==false||!TONES[row.kind]))throw new Error('검수용 결과만 재생할 수 있습니다.');
    this.running=true;this.results=results;this.paused=false;const generation=++this.generation;this.emit('playing',{count:results.length});
    for(let index=0;index<results.length;index++){
      await this.segment(results[index],index);
      if(generation!==this.generation)return false;
    }
    this.complete();return true;
  }
  complete() {
    this.running=false;this.paused=false;this.clear();
    if(this.results.length===1){
      const result=this.results[0],reward=this.reward(result.kind);reward.y=-40;this.root.addChild(reward);
      const label=text(LABELS[result.kind],30,TONES[result.kind]);label.anchor.set(.5);label.y=220;
      const hint=text('연출 미리보기 · 실제 지급 없음',14,0xb9a9cd);hint.anchor.set(.5);hint.y=260;this.root.addChild(label,hint);
      this.emit('complete',{results:this.results});return;
    }
    const group=fit(new Sprite(Assets.get(ART.pack)),290,450);group.alpha=.12;this.root.addChild(group);
    const heading=text('개봉 연출 완료',34);heading.anchor.set(.5);heading.y=-15;const sub=text('아래에서 전체 결과를 확인하세요',16,0xb9a9cd);sub.anchor.set(.5);sub.y=40;this.root.addChild(heading,sub);
    this.emit('complete',{results:this.results});
  }
  skip() { if(!this.running)return;this.generation++;this.timeline?.kill();this.resolveSegment?.();this.resolveSegment=null;this.complete(); }
  pause() { if(!this.running)return;this.paused=!this.paused;this.timeline.paused(this.paused);this.emit(this.paused?'paused':'playing'); }
  setSpeed(speed) { this.speed=speed===2?2:1;if(this.running)this.timeline?.timeScale(this.speed); }
  destroy() {
    this.generation++;this.timeline?.kill();this.resolveSegment?.();this.resolveSegment=null;this.observer?.disconnect();this.running=false;
    this.app?.destroy(true,{children:true,texture:false,textureSource:false});this.root=null;this.emit('destroyed');
  }
}
globalThis.HyperPackFX=Object.freeze({version:2076,create:(host,onState)=>new HyperPackPresentation(host,onState)});
