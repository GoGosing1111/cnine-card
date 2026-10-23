import {Container,Sprite} from 'pixi.js';

// The banner shares the body's local recoil and the existing V3 clock. The
// generated veil supplies the shape, transparency and glow; no extra ticker.
export class C9AuraFlag {
 constructor(owner){
  this.owner=owner;this.spec=owner.manifest.flagAura;
  this.root=new Container({label:'GeneralJokC9Flag',zIndex:3});
  owner.merc.view.addChild(this.root);
  this.veil=new Sprite(owner.assets.effects.flag[0]);this.glow=new Sprite(owner.assets.effects.flag[0]);
  this.glow.blendMode='add';this.root.addChild(this.veil,this.glow);
 }
 render(t,state){
  const o=this.owner,c=this.spec;
  this.root.position.set(o.merc.fullBodySprite.x+c.attachment.x,o.merc.fullBodySprite.y+c.attachment.y);
  this.root.visible=o.flagEnabled&&!o.motionOnly&&!state.cancelled;
  const breath=o.reducedMotion?0:Math.sin(t*2.1),shotGlow=o.reducedMotion?0:state.recoil*.045;
  this.opacity=c.opacity+breath*.025;this.glowOpacity=c.glowOpacity+breath*.015+shotGlow;
  this.root.rotation=o.reducedMotion?0:Math.sin(t*1.4)*c.swayRadians;
  for(const [s,alpha]of [[this.veil,this.opacity],[this.glow,this.glowOpacity]]){
   const spec=o.manifest.effects.flag[0];s.anchor.set(spec.anchor.x,spec.anchor.y);s.scale.set(c.width/spec.width);s.alpha=alpha;
  }
 }
 diagnostics(){
  const o=this.owner,c=this.spec;
  return {flagType:c.type,flagVisible:this.root.visible,flagRotation:this.root.rotation,
   flagWidth:c.width,flagOpacity:this.opacity,flagGlowOpacity:this.glowOpacity,
   flagAttachment:{x:this.root.x,y:this.root.y},flagFollowsRecoilError:this.root.x-o.merc.fullBodySprite.x-c.attachment.x,
   flagBehindBody:this.root.zIndex<o.merc.fullBodySprite.zIndex,flagLayerCount:o.merc.view.children.filter(s=>s.label==='GeneralJokC9Flag').length};
 }
 destroy(){this.root.destroy({children:true});}
}
