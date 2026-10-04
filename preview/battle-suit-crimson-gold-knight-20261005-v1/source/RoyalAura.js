import {Container,Sprite,Graphics,BlurFilter,ColorMatrixFilter} from 'pixi.js';
export const AURA_PALETTES={
 crimson:{label:'진홍 · 샴페인 골드',outer:[.40,.005,.055],inner:[.90,.025,.13],rim:[.91,.68,.34],rear:0xe0bd7d,wrap:0xda2446},
 violet:{label:'청보라 · 백금',outer:[.12,.025,.38],inner:[.48,.22,.94],rim:[.71,.81,.95],rear:0xb9cffe,wrap:0x9866ef},
 teal:{label:'청록 · 옅은 금빛',outer:[.005,.20,.22],inner:[.04,.71,.73],rim:[.91,.73,.38],rear:0xd9ba77,wrap:0x36c7c8}
};
function solid(rgb){const f=new ColorMatrixFilter();const[r,g,b]=rgb;f.matrix=[0,0,0,0,r,0,0,0,0,g,0,0,0,0,b,0,0,0,1,0];return f;}
export class RoyalAura{
 constructor(unit,assets){
  Object.assign(this,{unit,assets,enabled:true,palette:'crimson'});
  this.back=new Container({label:'KnightFullBodyAura',eventMode:'none',zIndex:-4});
  this.front=new Container({label:'KnightWrappingWisps',eventMode:'none',zIndex:30});
  unit.view.addChildAt(this.back,0);unit.view.addChild(this.front);unit.view.sortChildren();
  const pair=parent=>[0,1].map(()=>{const s=new Sprite();s.blendMode='add';parent.addChild(s);return s;});
  this.rear=pair(this.back);
  this.outer=new Sprite();this.inner=new Sprite();this.edge=new Container();this.rim=new Container();
  this.back.addChild(this.outer,this.edge,this.inner,this.rim);
  this.edgeCopies=Array.from({length:8},()=>{const s=new Sprite();this.edge.addChild(s);return s;});
  this.rimCopies=Array.from({length:8},()=>{const s=new Sprite();this.rim.addChild(s);return s;});
  this.wrap=pair(this.front);
  this.outerColor=solid([0,0,0]);this.innerColor=solid([0,0,0]);this.edgeColor=solid([0,0,0]);this.rimColor=solid([0,0,0]);
  this.outerBlur=new BlurFilter({strength:10,quality:2,resolution:.65,legacy:true});
  this.innerBlur=new BlurFilter({strength:3.8,quality:2,resolution:1,legacy:true});
  this.outer.filters=[this.outerColor,this.outerBlur];this.inner.filters=[this.innerColor,this.innerBlur];
  this.edge.filters=[this.edgeColor];this.rim.filters=[this.rimColor];
  this.inner.blendMode='add';this.edge.blendMode='add';this.rim.blendMode='add';
  this.filters=[this.outerColor,this.innerColor,this.edgeColor,this.rimColor,this.outerBlur,this.innerBlur];
  this.ground=new Graphics({label:'KnightAuraGround',zIndex:-8});unit.root.addChildAt(this.ground,0);
  this.setPalette('crimson');
 }
 setPalette(key){
  this.palette=AURA_PALETTES[key]?key:'crimson';const p=AURA_PALETTES[this.palette];
  const color=(f,rgb)=>{const[r,g,b]=rgb;f.matrix=[0,0,0,0,r,0,0,0,0,g,0,0,0,0,b,0,0,0,1,0];};
  color(this.outerColor,p.outer);color(this.innerColor,p.inner);color(this.edgeColor,p.inner);color(this.rimColor,p.rim);
  this.rear.forEach(s=>s.tint=p.rear);this.wrap.forEach(s=>s.tint=p.wrap);
 }
 render(t,height,impact=0){
  this.back.visible=this.front.visible=this.ground.visible=this.enabled;if(!this.enabled)return;
  const main=this.unit.bodySprite,pulse=.5+.5*Math.sin(t*Math.PI*2/2.4),p=AURA_PALETTES[this.palette];
  const copies=[this.outer,this.inner,...this.edgeCopies,...this.rimCopies];
  for(const s of copies){s.texture=main.texture;s.anchor.copyFrom(main.anchor);s.position.copyFrom(main.position);s.scale.copyFrom(main.scale);s.rotation=main.rotation;}
  this.outer.alpha=.78;this.inner.alpha=.22+.06*pulse;this.edge.alpha=.39;this.rim.alpha=.20+.04*pulse;
  this.edgeCopies.forEach((s,i)=>{const a=i*Math.PI/4;s.x+=Math.cos(a)*(3.0+pulse*.6);s.y+=Math.sin(a)*(3.0+pulse*.6);});
  this.rimCopies.forEach((s,i)=>{const a=i*Math.PI/4;s.x+=Math.cos(a)*1.25;s.y+=Math.sin(a)*1.25;});
  this.outerBlur.strength=10+pulse*1.8;this.innerBlur.strength=3.5+pulse*.5;
  const frame=(t%2.4)/2.4*12,index=Math.floor(frame),q=frame-index;
  for(const[key,pair,width,opacity]of [['aura-rear',this.rear,2.36,.46],['aura-wrap',this.wrap,1.98,.44]]){
   pair.forEach((s,n)=>{s.texture=this.assets.effects[key][(index+n)%12];s.anchor.set(.5);s.position.set(0,-height*.48);s.scale.set(height*width/s.texture.width);s.alpha=(n?q:1-q)*(opacity+pulse*.035+impact*.05);});
  }
  this.ground.clear().ellipse(0,1,height*.29,height*.061).stroke({color:p.wrap,width:2.2,alpha:.40})
   .ellipse(0,1,height*(.33+pulse*.016),height*(.068+pulse*.003)).stroke({color:p.rear,width:1,alpha:.19+.04*pulse});
 }
 diagnostics(){return{enabled:this.enabled,palette:this.palette,label:AURA_PALETTES[this.palette].label,fullBodySilhouette:true,silhouetteCopies:18,poseMatched:[this.outer,this.inner,...this.edgeCopies,...this.rimCopies].every(s=>s.texture===this.unit.bodySprite.texture),rearFrames:12,wrapFrames:12,independentClock:false};}
 destroy(){this.back.destroy({children:true});this.front.destroy({children:true});this.ground.destroy();this.filters.forEach(f=>f.destroy());}
}
