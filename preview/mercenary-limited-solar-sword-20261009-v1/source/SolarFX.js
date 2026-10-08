import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,sample,clamp,smooth,mix,STRIKE,bladeContact,areaHits} from '../motion.mjs';
const ROOT='/preview/mercenary-limited-solar-sword-20261009-v1/',HEIGHT=333.70859375;
export async function loadSolarAssets(m){
 const out={motion:{},effects:{},blade:await Assets.load(ROOT+m.weapon.url)};
 await Promise.all([...Object.entries(m.motion).filter(([k])=>m.activeMotion[k]).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}),...Object.entries(m.effects).filter(([k])=>m.activeEffects.includes(k)).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})]);
 return out;
}
export class SolarFX{
 constructor(engine,unit,targets,assets,manifest,onUpdate){
  Object.assign(this,{engine,unit,targets,target:targets[0],assets,manifest,onUpdate,mode:'aura',speed:1,disposed:false,effectsEnabled:true,clock:{time:0},cancelled:false,zoom:true});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.back=new Container({label:'SolarBackFX',eventMode:'none'});engine.backgroundLayer.addChild(this.back);
  this.front=new Container({label:'SolarFrontFX',eventMode:'none'});engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.groundLight=new Graphics();this.back.addChild(this.groundLight);
  this.ghosts=Array.from({length:6},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.pool=Array.from({length:86},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.swords=Array.from({length:7},()=>{const s=new Sprite(assets.blade);s.visible=false;this.front.addChild(s);return s;});
  this.groundMask=new Graphics();this.front.addChild(this.groundMask);this.swords[6].mask=this.groundMask;
  this.capture();this.makeTimeline();this.render(0);
 }
 capture(){
  this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};
  const canvas=this.engine.app.canvas,rect=canvas.getBoundingClientRect(),doc=canvas.ownerDocument,dock=doc.querySelector('.battle-v3-dock')?.getBoundingClientRect(),status=doc.querySelector('.battle-v3-status')?.getBoundingClientRect();
  const statusTop=(status?.top??rect.bottom)-rect.top,statusAtBottom=statusTop>rect.height*.45;
  this.safeFrame={left:14,right:rect.width-14,top:status&&!statusAtBottom?Math.max(14,status.bottom-rect.top+12):14,bottom:Math.min((dock?.top??rect.bottom)-rect.top,statusAtBottom?statusTop:rect.height)-18};
  if(this.safeFrame.bottom<=this.safeFrame.top+100)throw Error('Preview camera has no usable field');
 }
 get time(){return this.clock.time;}
 get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<MODES[this.mode].duration);}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);this.onComplete?.();}}).to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()};}
 play(){if(this.disposed)return;this.cancelled=false;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;this.cancelled=false;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.cancelled=false;this.makeTimeline();this.render(0);}
 setSpeed(v){this.speed=Math.max(.25,Math.min(2,Number(v)||1));this.timeline?.timeScale(this.speed);}
 setEffects(v){this.effectsEnabled=v;this.render(this.time);}
 pose(p){return this.manifest.motion[p.bank].frames[p.index];}
 targetPoint(target,ratio=0){return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y:-(target.fullBodyHeight||300)*ratio}));}
 layerPoint(p,layer=this.front){return layer.toLocal(this.unit.root.parent.toGlobal(p));}
 bounds(){const points=this.targets.map(u=>this.targetPoint(u)),size=HEIGHT*this.unit.root.scale.x,minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),floor=points.reduce((s,p)=>s+p.y,0)/points.length;return{points,size,minX,maxX,floor,center:{x:(minX+maxX)/2,y:floor}};}
 rootFor(state,b){
  const target=this.targetPoint(this.target),hit=this.manifest.motion.cut.frames[2],s=HEIGHT/330*this.unit.root.scale.x;
  const meleeX=target.x-((hit.grip.x-hit.pivot.x)+(hit.tip.x-hit.grip.x)*.56)*s;
  const dest=state.mode==='attack'?{x:meleeX,y:target.y}:state.mode==='dash'?{x:target.x-b.size*.78,y:target.y}:state.mode==='skill'?{x:target.x-b.size*1.90,y:target.y}:state.mode==='ultimate'?{x:b.minX-b.size*1.25,y:b.floor+b.size*.25}:this.home;
  return{x:mix(this.home.x,dest.x,state.entry),y:mix(this.home.y,dest.y,state.entry)};
 }
 applyPose(p){const f=this.pose(p),s=this.unit.bodySprite;s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/330);s.position.set(0,0);s.tint=0xffffff;s.alpha=1;this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(p.facing,1);}
 bladePoints(p,r){const f=this.pose(p),s=HEIGHT/330*this.unit.root.scale.x,point=a=>({x:r.x+(a.x-f.pivot.x)*s*p.facing,y:r.y+(a.y-f.pivot.y)*s});return{grip:point(f.grip),tip:point(f.tip),head:point(f.head)};}
 put(key,frame,p,width,alpha=1,{back=false,angle=0,anchor=[.5,.5],stretch=1,blend='normal'}={}){
  if(!this.effectsEnabled||alpha<=.001)return;const s=this.pool[this.slot++];if(!s)throw Error('Solar effect pool exhausted');const layer=back?this.back:this.front;if(s.parent!==layer)layer.addChild(s);
  s.texture=this.assets.effects[key][Math.max(0,Math.min(11,frame))];s.anchor.set(...anchor);s.scale.set(width/384,width/384*stretch);s.position.copyFrom(this.layerPoint(p,layer));s.rotation=angle;s.alpha=alpha;s.tint=0xffffff;s.blendMode=blend;s.visible=true;return s;
 }
 animate(key,q,p,width,alpha=1,options={}){if(q<0||q>=1)return;const n=q*11,i=Math.floor(n),f=n-i;this.put(key,i,p,width,alpha*(1-f),options);if(f>.001&&i<11)this.put(key,i+1,p,width,alpha*f,options);}
 ambient(t,p,r,b,bp){
  const size=b.size,q=(t%2.8)/2.8;
  this.animate('mantle',q,{x:r.x,y:r.y-size*.57},size*1.55,.70,{back:true});
  this.animate('aura',(t%4)/4,{x:bp.head.x,y:bp.head.y-size*.03},size*.78,.84,{back:true});
  const len=Math.hypot(bp.tip.x-bp.grip.x,bp.tip.y-bp.grip.y),angle=Math.atan2(bp.tip.y-bp.grip.y,bp.tip.x-bp.grip.x);
  this.animate('blade',(t%1.8)/1.8,{x:(bp.grip.x+bp.tip.x)/2,y:(bp.grip.y+bp.tip.y)/2},len*1.40,.32,{angle,blend:'add',back:true});
  const ground=this.layerPoint(r,this.back);for(let i=5;i>=1;i--)this.groundLight.ellipse(ground.x,ground.y,size*(.36+i*.06),size*(.055+i*.01)).fill({color:0xffb83e,alpha:.019*(1+.12*Math.sin(t*3))});
 }
 travel(state,b){
  if(!state.travel)return;[.025,.055,.09,.14,.19,.24].forEach((ago,i)=>{if(state.time<ago)return;const old=sample(state.mode,state.time-ago),r=this.rootFor(old,b),f=this.pose(old.pose),s=this.ghosts[i];s.texture=this.assets.motion[old.pose.bank][old.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/330*this.unit.root.scale.x*old.pose.facing,HEIGHT/330*this.unit.root.scale.y);s.position.copyFrom(this.layerPoint(r,this.back));s.tint=i%2?0xffd179:0xa56f19;s.alpha=[.35,.26,.18,.11,.075,.04][i];s.blendMode='add';s.visible=true;});
 }
 rigidSword(sprite,tip,angle,length,alpha,b){
  const m=this.manifest.weapon,originalAngle=Math.atan2(m.tip.y-m.grip.y,m.tip.x-m.grip.x),originalLength=Math.hypot(m.tip.x-m.grip.x,m.tip.y-m.grip.y);
  sprite.anchor.set(m.tip.x/m.width,m.tip.y/m.height);sprite.scale.set(length/originalLength);sprite.rotation=angle-originalAngle;sprite.position.copyFrom(this.layerPoint(tip));sprite.alpha=alpha;sprite.tint=0xffffff;sprite.blendMode='normal';sprite.visible=alpha>.001;
 }
 swordFormation(t,b){
  const c=this.targetPoint(this.target,.54),size=b.size,gateQ=(t-.35)/2.5;
  this.animate('formation',gateQ,{x:c.x,y:c.y-size*.15},size*3.1,.88,{back:true});
  this.swordContacts=[];
  for(let i=0;i<6;i++){
   const at=MODES.skill.contacts[i],q=clamp((t-(at-.21))/.29),theta=(-155+i*62)*Math.PI/180;
   const start={x:c.x+Math.cos(theta)*size*1.36,y:c.y+Math.sin(theta)*size*1.18};
   const len=size*.84,angle=Math.atan2(c.y-start.y,c.x-start.x),end={x:c.x+Math.cos(angle)*size*.60,y:c.y+Math.sin(angle)*size*.60};
   const m=smooth(q),tip={x:mix(start.x,end.x,m),y:mix(start.y,end.y,m)},alpha=smooth((t-(.54+i*.055))/.22)*(1-smooth((t-at-.16)/.24));
   if(t>.48&&t<at+.42){this.rigidSword(this.swords[i],tip,angle,len,alpha,b);this.animate('blade',clamp((t-.48)/2.6)*.999,{x:tip.x-Math.cos(angle)*len*.47,y:tip.y-Math.sin(angle)*len*.47},len*1.26,alpha*.40,{angle,blend:'add',back:true});}
   this.animate('basic',(t-at+.035)/.44,c,size*.92,.76,{angle:angle-.62});
   this.swordContacts.push({index:i,at,hit:t>=at,tip,contact:bladeContact({x:tip.x-Math.cos(angle)*len,y:tip.y-Math.sin(angle)*len},tip,c,size*.24),rigid:this.swords[i].scale.x===this.swords[i].scale.y});
  }
  this.animate('formation',(t-2.30)/.85,c,size*2.0,1);
  this.animate('ground',(t-2.62)/1.12,this.targetPoint(this.target),size*2.2,.91,{anchor:[.5,.80]});
 }
 ultimate(t,b){
  const size=b.size,c=b.center,gate={x:c.x,y:b.floor-size*3.4};
  this.animate('sun-gate',(t-.38)/3.12,gate,size*2.60,.96,{back:true});
  const drop=clamp((t-1.99)/(STRIKE-1.99)),height=t<STRIKE?1.20*(1-drop*drop*drop):-.08;
  const alpha=smooth((t-.73)/.54)*(1-smooth((t-3.43)/.88));
  if(t>.73&&t<4.31){const tip={x:c.x,y:b.floor-size*height};this.rigidSword(this.swords[6],tip,Math.PI/2,size*3.45,alpha,b);this.giantTip={tip,ground:c,buried:t>=STRIKE,rigid:this.swords[6].scale.x===this.swords[6].scale.y};
   this.animate('blade',(t%1.5)/1.5,{x:c.x,y:tip.y-size*1.70},size*4.7,alpha*.46,{angle:Math.PI/2,blend:'add',back:true});
  }
  const floor=this.layerPoint(c);this.groundMask.rect(floor.x-5000,floor.y-10000,10000,10000).fill(0xffffff);
  const width=Math.max(size*5.5,b.maxX-b.minX+size*2.2);
  this.animate('ground',(t-STRIKE+.035)/1.45,c,width,.98,{anchor:[.5,.82]});
  this.animate('fault',(t-STRIKE-.10)/2.1,c,width*1.13,1,{anchor:[.5,.80],back:true});
  this.animate('fault',(t-STRIKE-.50)/1.8,c,width*1.35,.62,{anchor:[.5,.80],back:true});
  for(const h of this.hits)this.animate('ground',(t-h.at)/.9,b.points[h.index],size*1.08,.68,{anchor:[.5,.80]});
 }
 restoreBackdrop(){for(const {layer}of this.engine.parallaxLayers||[]){if(!layer.destroyed){layer.scale.set(1);layer.pivot.set(0,0);}}}
 fitCamera(b,r,state){
  const e=this.engine,size=b.size,c=this.targetPoint(this.target),f=this.pose(state.pose),ps=HEIGHT/330*this.unit.root.scale.x;
  const actor={left:r.x-f.pivot.x*ps,right:r.x+(768-f.pivot.x)*ps,top:r.y-f.pivot.y*ps,bottom:r.y+(768-f.pivot.y)*ps};
  let box;
  if(state.mode==='ultimate')box={left:Math.min(this.home.x,b.minX-size*1.5)-size*.65,right:b.maxX+size*1.1,top:b.floor-size*4.80,bottom:Math.max(...b.points.map(p=>p.y),r.y)+size*.40};
  else if(state.mode==='skill'){const torso=this.targetPoint(this.target,.54);box={left:Math.min(r.x-size*.85,torso.x-size*2.55),right:torso.x+size*2.55,top:torso.y-size*2.55,bottom:torso.y+size*2.55};}
  else box={left:Math.min(r.x-size*.82,c.x-size*.5),right:Math.max(c.x+size*.70,r.x+size*1.1),top:Math.min(actor.top,r.y-size*1.5),bottom:Math.max(r.y,c.y)+size*.25};
  const safe=this.safeFrame,outer=e.stage.parent.worldTransform.a||1,base=e.stage.parent.toGlobal(e.camera.base),zoom=Math.min(2.30,(safe.right-safe.left)/(box.right-box.left)/outer,(safe.bottom-safe.top)/(box.bottom-box.top)/outer);
  const focus={x:(box.left+box.right)/2+(base.x-(safe.left+safe.right)/2)/(outer*zoom),y:(box.top+box.bottom)/2+(base.y-(safe.top+safe.bottom)/2)/(outer*zoom)};
  e.camera.focusAt(focus,zoom);const shake=this.effectsEnabled?state.impact*(state.mode==='ultimate'?7:2.3):0;e.stage.position.set(e.camera.base.x+Math.sin(state.time*101)*shake,e.camera.base.y+Math.cos(state.time*89)*shake*.55);
  for(const {layer}of e.parallaxLayers||[]){layer.scale.set(1/zoom);layer.pivot.set(e.camera.base.x-zoom*e.stage.pivot.x,e.camera.base.y-zoom*e.stage.pivot.y);}
 }
 render(t){
  if(this.disposed)return;const state=this.state=sample(this.mode,t),b=this.bounds(),r=this.rootFor(state,b),u=this.unit,e=this.engine,size=b.size;
  this.slot=0;this.pool.forEach(s=>s.visible=false);this.ghosts.forEach(s=>s.visible=false);this.swords.forEach(s=>s.visible=false);this.shade.clear();this.groundLight.clear();this.groundMask.clear();this.giantTip=null;this.swordContacts=[];
  this.applyPose(state.pose);u.root.position.set(r.x,r.y);u.root.depthSortY=r.y;e.sortCombatDepth();const bp=this.bladePoints(state.pose,r),torso=this.targetPoint(this.target,.54);
  this.collision=bladeContact(bp.grip,bp.tip,torso,(this.target.fullBodyHeight||300)*this.target.root.scale.y*.34);this.groundError=0;
  this.hits=state.mode==='ultimate'?areaHits(b.points,b.center,size):[];
  const motionActive=!this.cancelled&&(!state.done||this.mode==='aura'),active=this.effectsEnabled&&motionActive;
  if(active){
   this.ambient(t,state.pose,r,b,bp);this.travel(state,b);
   if(this.mode==='dash'){
    const q=(t-.24)/.66,q2=(t-1.12)/.64;this.animate('eclipse',q,{x:r.x,y:r.y-size*.57},size*1.62,.93,{back:true});this.animate('eclipse',q2,{x:r.x,y:r.y-size*.57},size*1.62,.82,{back:true,angle:Math.PI});
    if(state.travel){this.animate('dash',((t<1?t-.26:t-1.13)/.43),{x:r.x-size*.32*state.pose.facing,y:r.y-size*.50},size*1.50,.52,{angle:state.pose.facing<0?Math.PI:0,back:true});u.bodySprite.alpha=.64;}
   }
   if(this.mode==='attack')this.animate('basic',(t-.35)/.60,torso,size*1.9,.90);
   if(this.mode==='ultimate'&&t>.40&&t<4.65){const a=Math.min(smooth((t-.40)/.5),smooth((4.65-t)/.7))*.36;this.shade.rect(-5000,-5000,10000,10000).fill({color:0x010610,alpha:a});}
  }
  if(motionActive){if(this.mode==='skill')this.swordFormation(t,b);if(this.mode==='ultimate')this.ultimate(t,b);}
  this.targetContacts=this.targets.map((target,i)=>{const at=this.mode==='ultimate'?this.hits[i].at:(i===0?MODES[this.mode].contacts.findLast(x=>x<=t)??99:99),q=(t-at)/.26,k=q>=0&&q<1?1-q:0;target.view.x=active?Math.sin(q*18)*k*(this.mode==='ultimate'?8:4):0;target.view.y=active?-Math.sin(clamp(q)*Math.PI)*k*7:0;return{index:i,at,hit:t>=at&&at<99,visible:target.root.visible};});
  if(this.zoom&&!this.cancelled&&!state.done)this.fitCamera(b,r,state);else{e.camera.reset(true);this.restoreBackdrop();}
  this.onUpdate(this);
 }
 cancel(){if(this.disposed)return;this.removeTimeline();this.cancelled=true;this.clock.time=0;this.render(0);this.engine.camera.reset(true);this.restoreBackdrop();this.targets.forEach(t=>t.view.position.set(0,0));}
 diagnostics(){return{ready:!this.disposed,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,phase:this.state?.phase,pose:this.state?.pose,contactCount:this.state?.contactCount,bladeContact:this.collision,groundError:this.groundError,targets:this.targetContacts,targetCount:this.targets.length,visibleEffects:this.pool.filter(s=>s.visible).length,visibleWeapons:this.swords.filter(s=>s.visible).length,visibleGhosts:this.ghosts.filter(s=>s.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,giantTip:this.giantTip,giantSwordBounds:this.swords[6].visible?this.swords[6].getBounds():null,swordBounds:this.swords.filter(s=>s.visible&&s.alpha>.15).map(s=>s.getBounds()),swordContacts:this.swordContacts,safeFrame:this.safeFrame,bodyUniformScale:this.unit.bodySprite.scale.x===this.unit.bodySprite.scale.y,clock:'V3_REGISTERED_GSAP',liveEnabled:false,...this.manifest.summary};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.swords[6].mask=null;this.front.destroy({children:true});this.back.destroy({children:true});this.restoreBackdrop();for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const t of frames)t.destroy(false);}
}
