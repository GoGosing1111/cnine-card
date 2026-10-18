const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export class EmperorSetFX {
 constructor(engine,{enabled=true}={}){this.engine=engine;this.enabled=enabled;this.t=0;this.hits=[];this.impactCount=0;this.disposed=false;}
 async mount(){
  const {Assets,Container,Sprite,Texture,Rectangle}=window.ProjectVPixiBattle.fxRuntime;
  this.Sprite=Sprite;this.Container=Container;
  const [crest,ground,impact,impactSheet]=await Promise.all(['crest','ground','impact','impact-sequence'].map(name=>Assets.load(new URL('./assets/'+name+'.png',import.meta.url).href)));
  if(this.disposed)return;
  this.textures={crest,ground,impact};
  const cellW=impactSheet.width/4,cellH=impactSheet.height/3;
  this.impactFrames=Array.from({length:12},(_,i)=>new Texture({source:impactSheet.source,frame:new Rectangle(i%4*cellW,Math.floor(i/4)*cellH,cellW,cellH)}));
  this.floor=new Container({label:'EMPEROR_SET_OWNER_A_FLOOR',eventMode:'none'});this.floor.zIndex=-5000;
  this.rear=new Container({label:'EMPEROR_SET_OWNER_A_REAR',eventMode:'none'});this.rear.zIndex=-4990;
  this.front=new Container({label:'EMPEROR_SET_IMPACTS',eventMode:'none'});this.front.zIndex=7;
  this.engine.combatLayer.addChild(this.floor,this.rear);this.engine.effectLayer.addChild(this.front);
  this.ring=this.sprite(ground,this.floor);this.inner=this.sprite(ground,this.floor);
  this.footRings=this.engine.allies.map(()=>this.sprite(ground,this.floor));
  this.crest=this.sprite(crest,this.rear);this.crest.blendMode='normal';
  this.motes=Array.from({length:this.engine.reducedMotion?0:22},(_,i)=>{const s=this.sprite(impact,this.rear);return {s,seed:i*2.399963,life:(i*.618)%1};});
  this.state={t:0};
  void this.engine.timeline(timeline=>{
   this.timeline=timeline;
   timeline.to(this.state,{t:36000,duration:36000,ease:'none',onUpdate:()=>this.render(this.state.t)});
  },()=>{},1);
  this.setEnabled(this.enabled);this.render(0);return this;
 }
 sprite(texture,parent){const s=new this.Sprite(texture);s.anchor.set(.5);s.blendMode='add';parent.addChild(s);return s;}
 bounds(){
  const units=this.engine.allies.filter(a=>a.battleActive!==false&&!a.isMercenary&&a.root.visible);
  if(!units.length)return null;
  const xs=units.map(a=>a.baseX),ys=units.map(a=>a.baseY),scale=units.reduce((n,a)=>n+a.restScale,0)/units.length;
  return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,
   minY:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs)+300*scale,scale};
 }
 render(t){
  if(this.disposed)return;this.t=t;
  const b=this.bounds();if(!b)return;
  const reduced=this.engine.reducedMotion,phase=reduced?0:t,breath=1+Math.sin(phase*1.5)*.025;
  const mobile=this.engine.scene.height>this.engine.scene.width*1.15;
  const w=clamp(b.width*1.28,400,820),pulse=Math.max(0,1-(t-(this.lastHit??-10))/.7);
  this.floor.position.set(b.x,b.y);this.floor.scale.set(1,.58);
  this.ring.width=this.ring.height=w*breath;this.ring.rotation=reduced?0:phase*.045;this.ring.alpha=.42+pulse*.18;
  this.inner.width=this.inner.height=w*.77;this.inner.rotation=reduced?0:-phase*.065;this.inner.alpha=.16;
  this.ring.visible=this.inner.visible=!mobile;
  if(mobile){this.floor.position.set(0,0);this.floor.scale.set(1);}
  this.footRings.forEach((ring,i)=>{
   const unit=this.engine.allies[i];ring.visible=mobile&&unit.battleActive!==false;
   if(!ring.visible)return;
   ring.position.set(unit.baseX,unit.baseY+10);ring.width=375*unit.restScale*breath;ring.height=ring.width*.39;ring.alpha=.48+pulse*.16;
  });
  this.crest.position.set(b.x,mobile?Math.max(90,b.minY-285):Math.max(130,b.minY-210*b.scale)+Math.sin(phase*.8)*5);
  const crestWidth=w*(mobile?.26:.32);
  this.crest.width=crestWidth;this.crest.height=crestWidth*this.textures.crest.height/this.textures.crest.width;
  this.crest.alpha=.7+pulse*.16;
  for(const m of this.motes){
   const p=(phase*(.11+(m.life*.035))+m.life)%1,a=m.seed+phase*.08;
   m.s.position.set(b.x+Math.cos(a)*w*(.26+m.life*.16),b.y+Math.sin(a)*w*.14-p*180*b.scale);
   m.s.width= m.s.height=9+(1-p)*13; m.s.rotation=a;
   m.s.alpha=Math.sin(p*Math.PI)*(.25+m.life*.2);
  }
  for(let i=this.hits.length-1;i>=0;i--){
   const hit=this.hits[i],p=(t-hit.at)/.7;
   if(p>=1){hit.root.destroy({children:true});this.hits.splice(i,1);continue;}
   const frame=Math.min(11,Math.floor(p*12));hit.flash.texture=this.impactFrames[frame];
   hit.flash.anchor.set(.5,frame<4?.59:frame<8?.53:.5);
   hit.flash.alpha=.95;hit.flash.width=hit.flash.height=hit.size;
   for(const shard of hit.shards){
    const d=p*(50+shard.seed*75),a=shard.angle;
    shard.sprite.position.set(Math.cos(a)*d,Math.sin(a)*d*.7+p*p*30);
    shard.sprite.rotation=a+p*1.8;shard.sprite.alpha=Math.sin(Math.min(1,p*4)*Math.PI/2)*(1-p)*.85;
   }
  }
 }
 impact(target,{critical=false}={}){
  if(!this.enabled||this.disposed||!target?.root||this.engine.reducedMotion)return;
  this.lastHit=this.t;this.impactCount++;
  const root=new this.Container({label:'EMPEROR_CONFIRMED_HIT',eventMode:'none'});
  const point=this.engine.effectLayer.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*.43}));
  root.position.copyFrom(point);this.front.addChild(root);
  const flash=this.sprite(this.textures.impact,root),size=critical?210:150;
  const shards=Array.from({length:8},(_,i)=>{
   const sprite=this.sprite(this.textures.impact,root),seed=(i*.618)%1;
   sprite.width=11+seed*13;sprite.height=4+seed*3;
   return {sprite,seed,angle:i*2.399963};
  });
  this.hits.push({root,flash,shards,size,at:this.t});this.render(this.t);
 }
 setEnabled(value){this.enabled=Boolean(value);for(const layer of [this.floor,this.rear,this.front])if(layer)layer.visible=this.enabled;}
 diagnostics(){const b=this.bounds();return {enabled:this.enabled,clock:this.t,impacts:this.impactCount,activeHits:this.hits.length,ownerSide:'A',bounds:b,renderer:'SHARED_V3_PIXI',timeOwner:'BattleEngine.timeline / GSAP',accountAvatarAttached:false};}
 destroy(){if(this.disposed)return;this.disposed=true;this.timeline?.kill();for(const root of [this.floor,this.rear,this.front])if(root&&!root.destroyed)root.destroy({children:true});this.hits=[];}
}
