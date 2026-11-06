import {Container,Sprite,Assets} from 'pixi.js';
import propCatalog from './props.json' with {type:'json'};

const clamp=x=>Math.max(0,Math.min(1,x));
export class SummonedWeapons {
 static async load(base){
  await Assets.load(Object.entries(propCatalog).map(([id,p])=>({alias:'helios-prop-'+id,src:base+p.file})));
  return Object.fromEntries(Object.keys(propCatalog).map(id=>[id,Assets.get('helios-prop-'+id)]));
 }
 constructor(adapter,id,targets,textures){
  Object.assign(this,{adapter,id,targets,textures,disposed:false,samples:[]});
  this.container=new Container();this.container.label='HELIOS_SUMMONED_WEAPONS';
  adapter.engine.combatLayer.addChild(this.container);
  this.specs=this.plan();
  this.sprites=this.specs.map(p=>{const s=new Sprite(textures[p.kind]);s.anchor.set(...propCatalog[p.kind].anchor);this.container.addChild(s);return s;});
  this.ghosts=this.specs.map(p=>[1,2].map(()=>{const s=new Sprite(textures[p.kind]);s.anchor.set(...propCatalog[p.kind].anchor);s.tint=0x9bdcff;s.blendMode='add';this.container.addChildAt(s,0);return s;}));
 }
 plan(){
  const t=this.targets;
  if(this.id==='royal_swords')return [[-140,-360],[-220,-300],[-265,-240],[-245,-180],[-205,-120],[-135,-60]].map((from,i)=>({kind:i===5?'greatsword':'sword',from,spawn:.20+i*.025,launch:.48+i*.055,arrive:.655+i*.055,length:i===5?340:265,target:t[0],offset:(i%3-1)*14,finisher:i===5}));
  if(this.id==='sovereign_lance')return [{kind:'spear',from:[-270,-235],spawn:.27,launch:.76,arrive:1.04,length:570,target:t[0],offset:0,finisher:true}];
  if(this.id==='kings_arsenal')return Array.from({length:18},(_,i)=>({kind:['sword','spear','greatsword','glaive','halberd','estoc'][i%6],from:[-425+Math.floor(i/6)*125,-390+(i%6)*62],spawn:.20+i*.012,launch:.69+i*.026,arrive:.91+i*(.44/17),length:i%6===2?320:265,target:t[i%t.length],offset:(i%3-1)*20,finisher:i>=15}));
  return t.flatMap((target,j)=>[-1,0,1,0].map((column,k)=>{
   const finisher=k===3,u=(j*4+k)/Math.max(1,t.length*4-1);
   return {kind:finisher?'greatsword':['sword','estoc','sword'][k],from:null,spawn:.48+u*.13,launch:finisher?1.25:.98+u*.13,arrive:finisher?1.47:1.16+u*.17,length:finisher?450:270,target,offset:column*85,sky:true,finisher,ground:finisher};
  }));
 }
 point(local){return this.adapter.engine.combatLayer.toLocal(this.adapter.actor.view.toGlobal(local));}
 targetPoint(p){
  const a=p.target,s=Math.abs(a.root.scale.x),h=Number(a.art?.bodyHeight)||285;
  return {x:a.root.x+(p.offset||0)*s,y:a.root.y-(p.ground?0:h*s*.48)};
 }
 render(time){
  if(this.disposed)return;
  const a=this.adapter.actor,scale=Math.abs(a.root.scale.x),dir=a.view.scale.x<0?-1:1;
  this.container.visible=this.adapter.propsEnabled;this.container.zIndex=(a.root.zIndex||0)+1;this.samples=[];
  for(const[i,p]of this.specs.entries()){
   const s=this.sprites[i],q=this.targetPoint(p),len=p.length*scale;
   const from=p.sky?{x:q.x,y:q.y-len-170*scale}:this.point({x:p.from[0],y:p.from[1]});
   // A sprite's pivot is its pommel. The blade tip, not the center, reaches q.
   const angle=p.sky?Math.PI/2:Math.atan2(q.y-from.y,q.x-from.x),end={x:q.x-Math.cos(angle)*len,y:q.y-Math.sin(angle)*len};
   const flight=clamp((time-p.launch)/(p.arrive-p.launch)),u=flight*flight;
   const materialize=clamp((time-p.spawn)/.15),tail=1-clamp((time-p.arrive)/.12);
   s.visible=time>=p.spawn&&time<=p.arrive+.12;
   s.alpha=materialize*tail;s.rotation=angle;
   s.scale.set(len/s.texture.width);
   // Pull back a small distance while charging, then accelerate as commanded.
   const pull=!p.sky&&time<p.launch?Math.sin(clamp((time-p.spawn)/(p.launch-p.spawn))*Math.PI)*18*scale:0;
   s.position.set(from.x+(end.x-from.x)*u-dir*pull,from.y+(end.y-from.y)*u);
   this.ghosts[i].forEach((g,j)=>{const oldFlight=clamp((time-p.launch-(j+1)*.028)/(p.arrive-p.launch)),oldU=oldFlight*oldFlight;g.visible=this.adapter.fxEnabled&&s.visible&&time>=p.launch;g.scale.copyFrom(s.scale);g.rotation=angle;g.alpha=(.24-j*.08)*tail;g.position.set(from.x+(end.x-from.x)*oldU,from.y+(end.y-from.y)*oldU);});
   this.samples.push({kind:p.kind,visible:s.visible,alpha:s.alpha,x:s.x,y:s.y,angle,arrival:p.arrive,launch:p.launch,target:p.target.id,tip:{x:s.x+Math.cos(angle)*len,y:s.y+Math.sin(angle)*len},destination:q});
  }
 }
 destroy(){if(this.disposed)return;this.disposed=true;this.container.removeFromParent();this.container.destroy({children:true,texture:false,textureSource:false});}
}
