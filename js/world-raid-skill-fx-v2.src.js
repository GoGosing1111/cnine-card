import {gsap} from 'gsap';
// Native V3 EffectLayer only: no second renderer or alternative formation.
const STAGING={CELESTIAL_GRAVITY:{kind:'gravity',color:0xb38aff,warm:0xe6d9ff,charge:.58,release:.38,tail:.65},SUN_THIRTEENTH:{kind:'sun',color:0xff973f,warm:0xffe6ad,charge:.34,release:.28,tail:.58},MUGETSU:{kind:'crescent',color:0xe34c6a,warm:0xffcad8,charge:.46,release:.26,tail:.7}};
class WorldRaidNativeFxV2{
 constructor(){this.cache=new Map();this.damageStyles=new Map();this.generation=0;this.timeline=null;this.finish=null;this.metrics={casts:0};}
 damageLabel(engine,amount){
  const label=engine.pools.damage.acquire(),key=String(engine.mobile),Style=label.numberLabel.style.constructor;
  if(!this.damageStyles.has(key)){const base={fontFamily:label.numberLabel.style.fontFamily,fontSize:engine.mobile?76:68,letterSpacing:-2};this.damageStyles.set(key,{number:new Style({...base,fill:0xff4a4a,stroke:{color:0x07101e,width:6,join:'round'}}),glow:new Style({...base,fill:0x07101e,stroke:{color:0x07101e,width:9,join:'round'}})});}
  const style=this.damageStyles.get(key);label.numberLabel.style=style.number;label.numberGlow.style=style.glow;label.numberLabel.text=label.numberGlow.text=amount.toLocaleString('ko-KR');
  for(const field of ['roleTag','criticalLabel','healLabel','hitLabel'])label[field].text='';label.speedHitLabels?.forEach(n=>{n.text='';n.alpha=0;});label.underline.alpha=0;label.scale.set(.78);return label;
 }
 frames(profile){const key=profile.atlas;if(!this.cache.has(key))this.cache.set(key,globalThis.ProjectVPixiBattle.fxRuntime.Assets.load(key).then(r=>Object.entries(r.textures).filter(([n])=>n.startsWith(profile.framePrefix)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([,t])=>t)).catch(e=>{this.cache.delete(key);throw e;}));return this.cache.get(key);}
 async play(engine,profile,{castKey,onImpact,damage=0}={}){
  this.cancel();const generation=this.generation;if(document.hidden||!engine?.visible)return false;
  if(engine.reducedMotion){onImpact?.();this.metrics={casts:this.metrics.casts+1,castKey,reducedMotion:true,native:true,frames:0};return true;}
  const frames=await this.frames(profile);if(generation!==this.generation||!engine.visible)return false;if(frames.length!==12)throw Error('월드레이드 스킬 프레임이 없습니다.');
  const {Container,Graphics,Sprite}=globalThis.ProjectVPixiBattle.fxRuntime,s=STAGING[profile.code],impact=s.charge+s.release;
  const allies=engine.allies.filter(a=>a.hp>0),boss=engine.boss||engine.enemies.find(a=>a.battleActive);if(!allies.length||!boss){onImpact?.();return false;}engine.settlePendingTails([boss,...allies]);
  const target={x:allies.reduce((n,a)=>n+a.root.x,0)/allies.length,y:allies.reduce((n,a)=>n+a.root.y,0)/allies.length-(engine.mobile?120:145)},origin={x:boss.root.x,y:boss.root.y-130};
  const radius=engine.mobile?225:260,group=new Container({label:'WorldRaidUltimateV2'});group.zIndex=30;engine.effectLayer.addChild(group);
  const tell=new Graphics().ellipse(0,0,radius*1.08,radius*.36).fill({color:s.color,alpha:.07}).stroke({color:s.color,alpha:.65,width:3});tell.position.set(target.x,target.y+105);group.addChild(tell);
  const charge=new Graphics().circle(0,0,60).stroke({color:s.color,alpha:.65,width:3});charge.position.set(origin.x,origin.y);charge.alpha=0;group.addChild(charge);
  const sprite=new Sprite(frames[0]);sprite.anchor.set(.5);sprite.scale.set(radius*2.65/frames[0].width);sprite.position.copyFrom(s.kind==='gravity'?target:origin);sprite.alpha=0;group.addChild(sprite);
  const ring=new Graphics().ellipse(0,0,radius*.8,radius*.35).stroke({color:s.color,alpha:.7,width:3});ring.position.set(target.x,target.y+105);ring.alpha=0;group.addChild(ring);
  const particles=new Container();group.addChild(particles);
  const labels=allies.map((a,i)=>{const label=this.damageLabel(engine,Math.floor(damage/allies.length+(i<damage%allies.length?1:0)));label.position.set(a.root.x,a.root.y-(engine.mobile?185:220));label.alpha=0;label.visible=damage>0;engine.uiLayer.addChild(label);return{label,actor:a};});
  const cursor={frame:0};this.metrics={casts:this.metrics.casts+1,castKey,frames:1,collisionFrame:null,kind:s.kind,impactAt:impact,duration:impact+s.tail+.28,native:true,target,origin,layer:engine.effectLayer.label};
  return new Promise(resolve=>{
   const cleanup=()=>{group.removeFromParent();group.destroy({children:true,texture:false,textureSource:false});for(const {label,actor} of labels){label.underline.alpha=1;engine.pools.damage.release(label);actor.tint=0xffffff;actor.setState(actor.hp<=0?'DEAD':'IDLE');}boss.setState(boss.hp<=0?'DEAD':'IDLE');this.timeline=null;this.finish=null;resolve(generation===this.generation);};this.finish=cleanup;
   const t=gsap.timeline({onUpdate:()=>{const frame=Math.min(11,Math.floor(cursor.frame));sprite.texture=frames[frame];this.metrics.frames=Math.max(this.metrics.frames,frame+1);},onComplete:cleanup});this.timeline=t;
   t.call(()=>{boss.setState('ATTACK');engine.audio?.scheduleImpact?.('ATTACK',{impactAt:impact,playbackSpeed:1,boss:true});},[],0)
    .to(charge,{alpha:1,duration:.18},0).to(charge.scale,{x:1.8,y:1.8,duration:s.charge},0).to(charge,{alpha:0,duration:s.release},s.charge)
    .to(sprite,{alpha:1,duration:.16},.08).to(cursor,{frame:3,duration:s.charge,ease:'none'},0).to(cursor,{frame:7,duration:s.release,ease:'none'},s.charge)
    .to(sprite,{x:target.x,y:target.y,duration:s.release,ease:'power3.in'},s.charge)
    .call(()=>{this.metrics.collisionFrame=7;onImpact?.();for(const {actor} of labels){actor.setState(actor.hp<=0?'DEAD':'HIT');actor.tint=s.warm;}engine.host.dispatchEvent(new CustomEvent('world-raid-v3-impact',{detail:{castKey,frame:7,kind:s.kind}}));},[],impact)
    .to(cursor,{frame:11,duration:s.tail,ease:'none'},impact+.08).to(sprite,{alpha:0,duration:.2},impact+s.tail+.08)
    .to(tell,{alpha:0,duration:.3},impact).to(ring,{alpha:1,duration:.045},impact).to(ring.scale,{x:1.6,y:1.35,duration:.5,ease:'power3.out'},impact).to(ring,{alpha:0,duration:.4},impact+.12);
   for(const {label} of labels)t.to(label,{alpha:1,y:label.y-32,duration:.16},impact).to(label,{alpha:0,y:label.y-65,duration:.3},impact+.4);
   for(let i=0;i<24;i++){const angle=i*2.399963,reach=radius*(.6+i%5*.11),p=new Graphics();p.poly(s.kind==='crescent'?[0,-5,3,0,0,10,-2,0]:[0,-3,3,0,0,4,-2,0]).fill({color:i%3?s.color:s.warm,alpha:.8});p.alpha=0;particles.addChild(p);const x=target.x+Math.cos(angle)*reach,y=target.y+Math.sin(angle)*reach*.6;if(s.kind==='gravity'){p.position.set(x,y);t.to(p,{alpha:1,duration:.18},i*.008).to(p,{x:target.x,y:target.y,duration:impact-i*.008,ease:'power2.in'},i*.008).set(p,{alpha:0},impact);}else{p.position.copyFrom(target);t.to(p,{alpha:1,duration:.04},impact).to(p,{x,y:y+(s.kind==='sun'?-28:30),rotation:angle,duration:.58,ease:'power3.out'},impact).to(p,{alpha:0,duration:.3},impact+.24);}}
  });
 }
 cancel(){this.generation++;this.timeline?.kill();this.finish?.();this.timeline=null;this.finish=null;}
}
globalThis.WorldRaidNativeFxV2=new WorldRaidNativeFxV2();
