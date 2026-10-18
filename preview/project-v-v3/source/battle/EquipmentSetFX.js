import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {equipmentSetVisualGroups,equipmentSetOwnsActor} from '../../../../shared/equipment-set-visual-v1.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const base='/assets/effects/equipment-sets-20261019/';
const sprite=(texture,parent)=>{const s=new Sprite(texture);s.anchor.set(.5);s.blendMode='add';parent.addChild(s);return s;};

class SetField {
  constructor(engine,group){this.engine=engine;this.group=group;this.hits=[];this.impactCount=0;this.disposed=false;this.t=0;}
  units(){return (this.group.side==='A'?this.engine.allies:this.engine.enemies).filter(a=>equipmentSetOwnsActor(this.group,a,this.group.side));}
  async mount(){
    const [crest,ground,sheet]=await Promise.all(['crest','ground','impact-sequence'].map(name=>Assets.load(base+this.group.set.toLowerCase()+'/'+name+'.webp')));
    if(this.disposed)return;
    this.textures={crest,ground};
    this.frames=Array.from({length:12},(_,i)=>new Texture({source:sheet.source,frame:new Rectangle(i%4*sheet.width/4,Math.floor(i/4)*sheet.height/3,sheet.width/4,sheet.height/3)}));
    this.floor=new Container({label:`${this.group.set}_SET_${this.group.side}_${this.group.ownerId}_FLOOR`,eventMode:'none'});this.floor.zIndex=-5000;
    this.rear=new Container({label:`${this.group.set}_SET_${this.group.side}_${this.group.ownerId}_CREST`,eventMode:'none'});this.rear.zIndex=-4990;
    this.front=new Container({label:`${this.group.set}_SET_HITS`,eventMode:'none'});this.front.zIndex=7;
    this.engine.combatLayer.addChild(this.floor,this.rear);this.engine.effectLayer.addChild(this.front);
    this.ring=sprite(ground,this.floor);this.inner=sprite(ground,this.floor);
    this.feet=this.units().map(unit=>({unit,ring:sprite(ground,this.floor)}));
    this.crest=sprite(crest,this.rear);this.crest.blendMode='normal';
    this.motes=Array.from({length:this.engine.reducedMotion?0:this.group.scope==='OWNER'?10:18},(_,i)=>({s:sprite(this.frames[1],this.rear),seed:i*2.399963,life:(i*.618)%1}));
    this.render(0);
  }
  bounds(){
    const units=this.units().filter(a=>a.root.visible&&a.root.renderable!==false&&a.root.alpha>.05&&a.hp>0);
    if(!units.length)return null;
    const xs=units.map(a=>a.baseX),ys=units.map(a=>a.baseY),scale=units.reduce((n,a)=>n+a.restScale,0)/units.length;
    return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,minY:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs)+300*scale,scale};
  }
  render(t){
    if(this.disposed||!this.floor)return;this.t=t;
    const b=this.bounds(),visible=!!b&&this.engine.visible;
    this.floor.visible=this.rear.visible=this.front.visible=visible;
    if(!visible)return;
    const reduced=this.engine.reducedMotion,phase=reduced?0:t,breath=1+Math.sin(phase*1.5)*.025;
    const mobile=this.engine.scene.height>this.engine.scene.width*1.15,individual=mobile||this.group.scope==='OWNER';
    const w=clamp(b.width*1.28,300,820),pulse=reduced?0:Math.max(0,1-(t-(this.lastHit??-10))/.7);
    this.floor.position.set(b.x,b.y);this.floor.scale.set(1,.58);
    this.ring.width=this.ring.height=w*breath;this.ring.rotation=phase*.045;this.ring.alpha=.42+pulse*.18;
    this.inner.width=this.inner.height=w*.77;this.inner.rotation=-phase*.065;this.inner.alpha=.16;
    this.ring.visible=this.inner.visible=!individual;
    if(individual){this.floor.position.set(0,0);this.floor.scale.set(1);}
    for(const {unit,ring} of this.feet){
      ring.visible=individual&&unit.battleActive!==false&&unit.root.visible&&unit.root.alpha>.05&&unit.hp>0;
      if(!ring.visible)continue;
      ring.position.set(unit.baseX,unit.baseY+10);ring.width=375*unit.restScale*breath;ring.height=ring.width*.39;ring.alpha=.48+pulse*.16;
    }
    this.crest.position.set(b.x,Math.max(90,b.minY-(mobile?285:210*b.scale))+Math.sin(phase*.8)*5);
    const cw=w*(individual?.26:.32);this.crest.width=cw;this.crest.height=cw*this.textures.crest.height/this.textures.crest.width;this.crest.alpha=.7+pulse*.16;
    for(const m of this.motes){const p=(phase*(.11+m.life*.035)+m.life)%1,a=m.seed+phase*.08;
      m.s.position.set(b.x+Math.cos(a)*w*(.26+m.life*.16),b.y+Math.sin(a)*w*.14-p*180*b.scale);
      m.s.width=m.s.height=9+(1-p)*13;m.s.rotation=a;m.s.alpha=Math.sin(p*Math.PI)*(.25+m.life*.2);
    }
    for(let i=this.hits.length-1;i>=0;i--){const h=this.hits[i],p=(t-h.at)/.7;
      if(p>=1){h.root.destroy({children:true});this.hits.splice(i,1);continue;}
      const frame=clamp(Math.floor(p*12),0,11);h.flash.texture=this.frames[frame];
      h.flash.anchor.set(.5,this.group.set==='EMPEROR'?(frame<4?.59:frame<8?.53:.5):.5);
      h.flash.width=h.flash.height=h.size;h.flash.alpha=.95;
    }
  }
  impact(target,{critical=false}={}){
    if(this.disposed||!this.front||!target?.root||this.engine.reducedMotion)return;
    this.lastHit=this.t;this.impactCount++;
    // Bound GPU objects even when an encounter resolves many hits together.
    if(this.hits.length>=12)this.hits.shift().root.destroy({children:true});
    const root=new Container({eventMode:'none'});this.front.addChild(root);
    root.position.copyFrom(this.engine.effectLayer.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*.43})));
    const flash=sprite(this.frames[0],root),size=critical?210:150;
    this.hits.push({root,flash,size,at:this.t});this.render(this.t);
  }
  clearHits(){for(const h of this.hits)h.root.destroy({children:true});this.hits=[];}
  destroy(){if(this.disposed)return;this.disposed=true;this.clearHits();for(const root of [this.floor,this.rear,this.front])root?.destroy({children:true});for(const texture of this.frames||[])texture.destroy(false);}
}

export class EquipmentSetFX {
  constructor(engine,payload){this.engine=engine;this.fields=equipmentSetVisualGroups(payload).map(group=>new SetField(engine,group));this.state={t:0};this.disposed=false;}
  async mount(){await Promise.all(this.fields.map(field=>field.mount()));if(!this.disposed)this.start();}
  start(){
    if(this.disposed||this.clock||!this.fields.length||!this.engine.visible)return;
    void this.engine.timeline(timeline=>{this.clock=timeline;timeline.to(this.state,{t:this.state.t+36000,duration:36000,ease:'none',onUpdate:()=>this.render()});},()=>{this.clock=null;for(const field of this.fields)field.clearHits();},1);
    this.render();
  }
  render(){for(const field of this.fields)field.render(this.state.t);}
  impact(actor,target,options){this.start();const side=this.engine.allies.includes(actor)?'A':this.engine.enemies.includes(actor)?'B':null;for(const field of this.fields)if(equipmentSetOwnsActor(field.group,actor,side))field.impact(target,options);}
  diagnostics(){return this.fields.map(field=>({...field.group,units:field.units().map(a=>a.id),impacts:field.impactCount,activeHits:field.hits.length,clock:this.state.t,accountAvatarAttached:false}));}
  destroy(){if(this.disposed)return;this.disposed=true;this.clock?.kill();this.clock=null;for(const field of this.fields)field.destroy();}
}

export async function prepareEquipmentSetFX(engine,payload){
  engine.equipmentSetFX?.destroy();
  const fx=new EquipmentSetFX(engine,payload);engine.equipmentSetFX=fx;
  try{await fx.mount();}catch(error){fx.destroy();if(engine.equipmentSetFX===fx)engine.equipmentSetFX=null;console.warn('[V3 equipment set] optional visuals unavailable',error);}
}
