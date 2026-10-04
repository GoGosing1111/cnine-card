import {Container,Sprite,Graphics,BlurFilter,ColorMatrixFilter} from 'pixi.js';
export const AURA_PALETTES={
 crimson:{label:'진홍 · 샴페인 골드',outer:[.40,.005,.055],inner:[.90,.025,.13],rim:[.91,.68,.34],rear:0xda2446,wrap:0xda2446,light:0xe0bd7d},
 violet:{label:'청보라 · 백금',outer:[.12,.025,.38],inner:[.48,.22,.94],rim:[.71,.81,.95],rear:0x9866ef,wrap:0x9866ef,light:0xb9cffe},
 teal:{label:'청록 · 옅은 금빛',outer:[.005,.20,.22],inner:[.04,.71,.73],rim:[.91,.73,.38],rear:0x36c7c8,wrap:0x36c7c8,light:0xd9ba77}
};
function matrix(f,[r,g,b]){f.matrix=[0,0,0,0,r,0,0,0,0,g,0,0,0,0,b,0,0,0,1,0];}
const solid=()=>{const f=new ColorMatrixFilter();matrix(f,[0,0,0]);return f;};
const rgb=n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
export class RoyalAura{
 constructor(unit,assets,manifest){
  Object.assign(this,{unit,assets,manifest,enabled:true,palette:'crimson'});
  this.back=new Container({label:'KnightValterAura',eventMode:'none',zIndex:9});
  this.front=new Container({label:'KnightRisingEmbers',eventMode:'none',zIndex:30});
  unit.view.addChild(this.back,this.front);unit.view.sortChildren();
  const pair=parent=>[0,1].map(()=>{const s=new Sprite();s.blendMode='add';parent.addChild(s);return s;});
  this.rear=pair(this.back);this.flameLayer=new Container();this.back.addChild(this.flameLayer);this.flames=pair(this.flameLayer);
  this.outer=new Sprite();this.inner=new Sprite();this.edge=new Container();this.rim=new Container();this.back.addChild(this.outer,this.edge,this.inner,this.rim);
  this.edgeCopies=Array.from({length:8},()=>this.edge.addChild(new Sprite()));this.rimCopies=Array.from({length:8},()=>this.rim.addChild(new Sprite()));
  this.outerColor=solid();this.innerColor=solid();this.edgeColor=solid();this.rimColor=solid();this.sheetTone=new ColorMatrixFilter();
  this.outerBlur=new BlurFilter({strength:14,quality:2,resolution:.65,legacy:true});this.innerBlur=new BlurFilter({strength:5,quality:2,resolution:1,legacy:true});
  this.outer.filters=[this.outerColor,this.outerBlur];this.inner.filters=[this.innerColor,this.innerBlur];this.edge.filters=[this.edgeColor];this.rim.filters=[this.rimColor];
  this.inner.blendMode='add';this.edge.blendMode='add';this.rim.blendMode='add';
  this.filters=[this.outerColor,this.innerColor,this.edgeColor,this.rimColor,this.sheetTone,this.outerBlur,this.innerBlur];
  this.particles=Array.from({length:12},()=>{const s=new Sprite(assets.auraFlash);s.anchor.set(.5);s.blendMode='add';this.front.addChild(s);return s;});
  this.ground=new Graphics({label:'KnightValterAuraGround',zIndex:-8});unit.root.addChildAt(this.ground,0);this.setPalette('crimson');
 }
 setPalette(key){
  this.palette=AURA_PALETTES[key]?key:'crimson';const p=AURA_PALETTES[this.palette];
  matrix(this.outerColor,p.outer);matrix(this.innerColor,p.inner);matrix(this.edgeColor,p.inner);matrix(this.rimColor,p.rim);
  this.rear.forEach(s=>s.tint=p.rear);this.particles.forEach((s,i)=>s.tint=i%3===0?p.light:p.wrap);
  // Crimson keeps the approved red/gold pixels. Alternatives map red to hue and gold to highlight.
  const a=rgb(p.wrap),b=rgb(p.light);this.sheetTone.matrix=[a[0],b[0]-a[0],0,0,0,a[1],b[1]-a[1],0,0,0,a[2],b[2]-a[2],0,0,0,0,0,0,1,0];
  this.flameLayer.filters=this.palette==='crimson'?null:[this.sheetTone];
 }
 render(t,height,impact=0,lift=0){
  this.back.visible=this.front.visible=this.ground.visible=this.enabled;if(!this.enabled)return;
  const main=this.unit.bodySprite,pulse=.5+.5*Math.sin(t*4.2),p=AURA_PALETTES[this.palette],sizing=height/312.3894230769231;
  for(const s of [this.outer,this.inner,...this.edgeCopies,...this.rimCopies]){s.texture=main.texture;s.anchor.copyFrom(main.anchor);s.position.copyFrom(main.position);s.scale.copyFrom(main.scale);s.rotation=main.rotation;}
  // The wider cape needs a thinner edge than Valter; keep the approved flame shape unobstructed.
  this.outer.alpha=.72;this.inner.alpha=.55+.08*pulse+impact*.1;this.edge.alpha=.42;this.rim.alpha=.24+.04*pulse;
  this.edgeCopies.forEach((s,i)=>{const a=i*Math.PI/4,r=(3.2+pulse*.5+impact*.8)*sizing;s.x+=Math.cos(a)*r;s.y+=Math.sin(a)*r;});
  this.rimCopies.forEach((s,i)=>{const a=i*Math.PI/4,r=(1.2+pulse*.2+impact*.3)*sizing;s.x+=Math.cos(a)*r;s.y+=Math.sin(a)*r;});
  this.outerBlur.strength=(12+pulse*3+impact*4)*sizing;this.innerBlur.strength=(4.7+pulse*.8+impact)*sizing;
  const frame=t*6,index=Math.floor(frame),q=frame-index,spec=this.manifest.effects['aura-valter'];
  this.flames.forEach((s,n)=>{const at=(index+n)%12,f=spec.frames[at];s.texture=this.assets.effects['aura-valter'][at];s.anchor.set(f.anchor.x,f.anchor.y);s.position.set(0,0);s.scale.set(height*1.85/s.texture.width);s.alpha=(n?q:1-q)*(.38+impact*.22);});
  const rearFrame=(t%2.4)/2.4*8,rearIndex=Math.floor(rearFrame),rearMix=rearFrame-rearIndex;
  this.rear.forEach((s,n)=>{s.texture=this.assets.effects['aura-valter-rear'][(rearIndex+n)%8];s.anchor.set(.5);s.position.set(0,-height*997/1452);s.scale.set(height*1.32/s.texture.width);s.alpha=n?rearMix:1-rearMix;});
  const radius=height*.43,localPixel=1/Math.max(.1,Math.abs(this.unit.root.scale.x));
  this.ground.y=height*lift;this.ground.clear().ellipse(0,2*localPixel,radius,radius*.24).stroke({color:p.light,width:1.5*localPixel,alpha:.28+impact*.25});
  this.particles.forEach((s,i)=>{const q=(t*.35+i/12)%1,a=i*2.399963;s.position.set(Math.cos(a+t*.12)*radius*(.5+q*.5),-height*q*1.13);s.width=(3+i%3)*localPixel;s.height=(5+i%4)*localPixel;s.rotation=a;s.alpha=Math.sin(q*Math.PI)*(.45+impact*.3);});
 }
 diagnostics(){return{enabled:this.enabled,palette:this.palette,label:AURA_PALETTES[this.palette].label,source:'VALTER_APPROVED_V17',fullBodySilhouette:true,silhouetteCopies:18,poseMatched:[this.outer,this.inner,...this.edgeCopies,...this.rimCopies].every(s=>s.texture===this.unit.bodySprite.texture),baseFlameFrames:12,rearFrames:8,frontFogSheets:0,risingParticles:12,footAnchored:true,independentClock:false};}
 destroy(){this.back.destroy({children:true});this.front.destroy({children:true});this.ground.destroy();this.filters.forEach(f=>f.destroy());}
}
