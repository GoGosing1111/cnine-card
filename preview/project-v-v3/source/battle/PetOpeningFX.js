import {Container,Graphics,Sprite,Text} from 'pixi.js';
import {petEffectRows,PET_EFFECT_MS} from './PetSupportPresentation.mjs';

const clamp=n=>Math.max(0,Math.min(1,n));
const ring=(g,r,color,width=2,alpha=.8)=>g.circle(0,0,r).stroke({color,width,alpha});
function polygon(g,sides,r,color,rotation=-Math.PI/2){
 const points=Array.from({length:sides},(_,i)=>[Math.cos(rotation+i*Math.PI*2/sides)*r,Math.sin(rotation+i*Math.PI*2/sides)*r]).flat();
 g.poly(points).stroke({color,width:2,alpha:.85});
}
export function petGlyph(type,color){
 const g=new Graphics();g.label='PET_GLYPH_'+type;
 if(type==='ATTACK_PERCENT'){
  g.poly([-5,23,-5,-18,0,-32,5,-18,5,23]).fill({color,alpha:.8}).stroke({color:0xffedc7,width:1.5});
  g.moveTo(-15,13).lineTo(15,13).moveTo(-9,28).lineTo(9,28).stroke({color,width:4});
  g.moveTo(-31,15).lineTo(-16,-13).moveTo(30,5).lineTo(18,-19).stroke({color,width:2,alpha:.65});
 }else if(type==='MAX_HP_PERCENT'){
  g.moveTo(0,24).bezierCurveTo(-39,-1,-25,-36,0,-15).bezierCurveTo(25,-36,39,-1,0,24).fill({color,alpha:.24}).stroke({color,width:2.5});
  g.moveTo(-22,1).lineTo(-10,1).lineTo(-4,-7).lineTo(3,10).lineTo(9,-1).lineTo(22,-1).stroke({color:0xe8ffda,width:2});
 }else if(type==='SPEED_PERCENT'){
  for(const side of [-1,1])for(let i=0;i<3;i++)g.moveTo(side*6,17-i*9).lineTo(side*(25+i*5),-9-i*9).lineTo(side*12,1-i*9).stroke({color,width:3-i*.4,alpha:1-i*.18});
  g.poly([3,-28,-10,1,0,-2,-3,24,13,-7,3,-4]).fill({color:0xfff3c4,alpha:.95});
 }else{
  polygon(g,type==='START_SHIELD_PERCENT'?6:4,30,color);
  g.moveTo(-17,-16).lineTo(0,-22).lineTo(17,-16).lineTo(14,8).quadraticCurveTo(8,20,0,26).quadraticCurveTo(-8,20,-14,8).closePath().fill({color,alpha:.16}).stroke({color,width:2.5});
  g.moveTo(0,-12).lineTo(0,14).moveTo(-9,-2).lineTo(9,-2).stroke({color:0xe4f4ff,width:2});
 }
 return g;
}
function targetCrown(effect){
 const root=new Container(),runes=new Graphics();root.label='PET_TARGET_'+effect.slug;
 if(effect.motif==='sword'){
  for(let i=0;i<3;i++){const x=(i-1)*23;runes.moveTo(x-16,35).lineTo(x+14,-30).stroke({color:effect.tint,width:i===1?4:2,alpha:.7});}
 }else if(effect.motif==='armor'){
  for(let i=0;i<6;i++){const a=i*Math.PI/3;runes.poly([Math.cos(a)*48,Math.sin(a)*48,Math.cos(a+.3)*61,Math.sin(a+.3)*61,Math.cos(a+.6)*48,Math.sin(a+.6)*48]).fill({color:effect.tint,alpha:.2}).stroke({color:effect.tint,width:1.5});}
 }else if(effect.motif==='heart'){
  ring(runes,47,effect.tint,2,.8);ring(runes,57,effect.tint,1,.3);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;runes.moveTo(Math.cos(a)*38,Math.sin(a)*38).lineTo(Math.cos(a)*55,Math.sin(a)*55).stroke({color:effect.tint,width:2,alpha:.6});}
 }else if(effect.motif==='wing'){
  for(let i=0;i<5;i++)runes.moveTo(-58+i*7,28-i*13).lineTo(35+i*7,-8-i*13).stroke({color:effect.tint,width:2,alpha:.8-i*.1});
 }else{
  polygon(runes,6,53,effect.tint);polygon(runes,6,64,effect.tint,0);ring(runes,69,effect.tint,1,.3);
 }
 const glyph=petGlyph(effect.type,effect.tint);root.addChild(runes,glyph);return {root,runes,glyph};
}
export function playPetOpeningFX(engine,row,event){
 const effects=petEffectRows(event.buffs);if(!effects.length||!engine.effectLayer)return;
 const primary=effects[0],root=new Container({label:'PET_CAST_'+event.petCode,eventMode:'none'});root.zIndex=42;
 engine.effectLayer.addChild(root);
 const caster=new Container(),seal=new Graphics(),rays=new Graphics(),links=new Graphics(),particles=new Graphics();
 ring(seal,57,primary.tint,3,.85);ring(seal,67,primary.tint,1,.45);polygon(seal,6,50,primary.tint);
 for(let i=0;i<12;i++){const a=i*Math.PI/6;rays.moveTo(Math.cos(a)*73,Math.sin(a)*73).lineTo(Math.cos(a)*88,Math.sin(a)*88).stroke({color:primary.tint,width:i%2?1:3,alpha:.6});}
 caster.addChild(seal,rays);root.addChild(links,caster,particles);
 const sourceGlyph=petGlyph(primary.type,primary.tint);caster.addChild(sourceGlyph);
 const targets=(event.hits||[]).map(hit=>engine.combatantById(hit.targetId)).filter(target=>target?.root&&!target.root.destroyed).map((target,index)=>{
  const crown=targetCrown(primary);root.addChild(crown.root);
  for(const [i,effect] of effects.slice(1).entries()){
   const emblem=petGlyph(effect.type,effect.tint),angle=-Math.PI+(i+1)*Math.PI/effects.length;
   emblem.scale.set(.5);emblem.position.set(Math.cos(angle)*65,Math.sin(angle)*65);crown.root.addChild(emblem);
  }
  const atlasFrames=row.frames.get(primary.type);let atlas=null;
  if(atlasFrames?.length){atlas=new Sprite(atlasFrames[0]);atlas.anchor.set(.5);atlas.width=atlas.height=186;atlas.blendMode='add';crown.root.addChildAt(atlas,0);}
  const label=new Text({text:effects.map(e=>e.text).join(' · '),style:{fontFamily:'Noto Sans KR, sans-serif',fontSize:19,fontWeight:'800',fill:primary.tint,stroke:{color:0x08101e,width:5},dropShadow:{color:0x000000,alpha:.6,blur:5,distance:2}}});
  label.anchor.set(.5,1);root.addChild(label);return {...crown,target,index,atlas,atlasFrames,label};
 });
 const duration=engine.reducedMotion ? .8 : PET_EFFECT_MS/1000,progress={t:0};
 const update=()=>{
  if(root.destroyed||row.root.destroyed)return;
  const t=progress.t,p=t/duration,reduced=engine.reducedMotion;
  const source=engine.effectLayer.toLocal(row.sprite.toGlobal({x:0,y:-row.sprite.texture.height*.43}));
  caster.position.copyFrom(source);caster.alpha=clamp(p*8)*clamp((1-p)*4);caster.scale.set(reduced ? .8 : .65+Math.min(1,p*4)*.45);seal.rotation=reduced?0:p*.7;rays.rotation=reduced?0:-p;
  links.clear();particles.clear();
  for(const item of targets){
   if(item.target.root.destroyed){item.root.visible=item.label.visible=false;continue;}
   const target=engine.effectLayer.toLocal(item.target.root.toGlobal({x:0,y:-Math.max(85,item.target.fullBodyHeight||140)*.43}));
   const onset=reduced?0:.12+item.index*.035,q=clamp((p-onset)/(1-onset)),reveal=clamp(q*5),fade=clamp((1-q)*4);
   item.root.position.copyFrom(target);item.root.alpha=reveal*fade;item.root.scale.set(reduced ? .9 : .55+reveal*.6);item.runes.rotation=reduced||primary.motif==='wing'?0:(q-.3)*.4;
   item.label.position.set(target.x,target.y-62-(reduced?0:q*18));item.label.alpha=clamp((q-.13)*7)*fade;
   if(item.atlas)item.atlas.texture=item.atlasFrames[Math.min(item.atlasFrames.length-1,Math.floor(q*item.atlasFrames.length))];
   if(!reduced&&p<.68){
    const travel=clamp(p/.4),arc=Math.max(50,Math.abs(target.x-source.x)*.13),mid={x:(source.x+target.x)/2,y:Math.min(source.y,target.y)-arc};
    const point=f=>({x:(1-f)**2*source.x+2*(1-f)*f*mid.x+f*f*target.x,y:(1-f)**2*source.y+2*(1-f)*f*mid.y+f*f*target.y});
    const start=point(Math.max(0,travel-.65));links.moveTo(start.x,start.y);
    for(let i=1;i<=18;i++){const v=Math.max(0,travel-.65)+(travel-Math.max(0,travel-.65))*i/18,pt=point(v);links.lineTo(pt.x,pt.y);}
    links.stroke({color:primary.tint,width:3,alpha:clamp((.68-p)*5)*.75});
    const head=point(travel);particles.circle(head.x,head.y,5).fill({color:0xf6ffe4,alpha:fade}).circle(head.x,head.y,12).fill({color:primary.tint,alpha:.22*fade});
   }
   if(!reduced)for(let j=0;j<9;j++){
    const angle=j*2.399+item.index*.7,spread=20+q*65,x=target.x+Math.cos(angle)*spread,y=target.y+Math.sin(angle)*spread-q*18;
    particles.moveTo(x-3,y).lineTo(x+3,y).moveTo(x,y-3).lineTo(x,y+3).stroke({color:primary.tint,width:1.3,alpha:reveal*fade*(j%2?.6:1)});
   }
  }
 };
 const cleanup=()=>{if(!root.destroyed)root.destroy({children:true});};
 row.fxCleanup?.();row.fxCleanup=cleanup;
 void engine.timeline(t=>t.to(progress,{t:duration,duration,ease:'none',onUpdate:update}),()=>{cleanup();if(row.fxCleanup===cleanup)row.fxCleanup=null;},1);
 update();
}
