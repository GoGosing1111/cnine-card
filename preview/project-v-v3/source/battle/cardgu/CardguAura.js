import {createGoldenRim} from './LiveGoldenRim.js';
export class CardguAura{
 constructor(merc,assets,spec,runtime,renderer,stage){
  Object.assign(this,{merc,assets,spec,runtime});this.enabled=true;this.rimEnabled=true;this.time=0;this.frame=0;
  const z=merc.fullBodySprite.zIndex;this.rear=new runtime.Container({label:'CardguAuraBehind'});this.front=new runtime.Container({label:'CardguAuraInFront'});this.rear.zIndex=z-1;this.front.zIndex=z+1;merc.view.addChild(this.rear,this.front);merc.view.sortableChildren=true;merc.view.sortChildren();
  this.rearHelix=Array.from({length:2},()=>{const s=new runtime.Sprite();this.rear.addChild(s);return s});
  this.rearWire=new runtime.Graphics();this.frontWire=new runtime.Graphics();this.rear.addChild(this.rearWire);this.front.addChild(this.frontWire);
  this.cards=Array.from({length:24},(_,i)=>{const s=new runtime.Sprite();s.label='CardguOrbitCard'+i;this.rear.addChild(s);return s});
  this.originalFilters=merc.fullBodySprite.filters||[];this.neon=createGoldenRim(renderer,stage,runtime);merc.fullBodySprite.filters=[...this.originalFilters,this.neon];
 }
 drawWire(g,front,t,H,reduced){g.clear();const draw=(width,alpha)=>{let started=false;for(let i=0;i<=132;i++){const u=i/132,a=u*Math.PI*6+t*Math.PI*.5,r=H*(.31+.08*Math.sin(u*Math.PI)),p={x:Math.sin(a)*r,y:-H*(.06+.94*u)+Math.cos(a)*H*.045},isFront=Math.cos(a)>0;if(isFront===front){if(started)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);started=true}else started=false}g.stroke({color:width>2?0xffbd32:0xffe8a6,width,alpha:alpha*(reduced?.7:1)})};draw(5,.16);draw(1.05,.82)}
 render(t,{motionOnly=false,reduced=false,charge=0}={}){
  this.time=t;const show=this.enabled&&!motionOnly;this.rear.visible=show;this.front.visible=show;this.neon.enabled=this.rimEnabled&&!motionOnly;this.neon.strength=reduced?1.4:2.05+.22*Math.sin(t*Math.PI*.5)+charge*.5;
  const H=this.spec.bodyHeight,phase=(reduced?0:t*3)%12,index=Math.floor(phase),blend=phase-index;this.frame=index;
  this.rearHelix.forEach((s,i)=>{const n=(index+i)%12,f=this.spec.effects.aura.frames[n];s.texture=this.assets.effects.aura[n];s.anchor.set(f.anchor.x,f.visibleBounds.bottom/f.height);s.scale.set(H*1.16/320);s.position.set(0,8);s.alpha=(i?blend:1-blend)*(.72+charge*.15);s.visible=show&&s.alpha>.001});
  this.drawWire(this.rearWire,false,reduced?0:t,H,reduced);this.drawWire(this.frontWire,true,reduced?0:t,H,reduced);
  for(let i=0;i<this.cards.length;i++){
   const s=this.cards[i],u=(i+.5)/this.cards.length,a=(reduced?0:t*Math.PI*.5)+u*Math.PI*6,r=H*(.31+.08*Math.sin(u*Math.PI)),depth=Math.cos(a),parent=depth>0?this.front:this.rear;if(s.parent!==parent)parent.addChild(s);
   const n=Math.sin(a+.65)<-.3?4:i%4,f=this.spec.particles.frames[n];s.texture=this.assets.particles[n];s.anchor.set(f.anchor.x,f.anchor.y);s.position.set(Math.sin(a)*r,-H*(.06+.94*u)+depth*H*.045);const scale=H*.062/f.cardHeight*(1+depth*.12);s.scale.set(scale*(.48+.52*Math.abs(Math.cos(a+.4))),scale);s.rotation=Math.sin(a)*.42;s.alpha=depth>0?.98:.72;s.visible=show;
  }
 }
 diagnostics(){return {enabled:this.enabled,rimEnabled:this.rimEnabled,visible:this.rear.visible,time:this.time,frame:this.frame,neonStrength:this.neon.strength,neonFilters:this.merc.fullBodySprite.filters.filter(f=>f===this.neon).length,frontCards:this.cards.filter(s=>s.visible&&s.parent===this.front).length,rearCards:this.cards.filter(s=>s.visible&&s.parent===this.rear).length}}
 destroy(){this.merc.fullBodySprite.filters=this.originalFilters;this.neon.destroy();this.rear.destroy({children:true});this.front.destroy({children:true})}
}
