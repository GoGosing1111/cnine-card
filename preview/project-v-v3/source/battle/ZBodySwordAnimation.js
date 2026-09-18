import {Assets,Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import {Z_SWORD,swordPose,swordEffectFrame,swordContactStop} from './ZBodySwordModel.mjs';
import {DASH_V2_SEQUENCE,fastDashBatch} from './ZBodyDashProfile.mjs';
import {ZBodyDashFX} from './ZBodyDashFX.mjs';

// Uses the live engine's layers and registered GSAP timelines. The approved
// atlases are sampled verbatim; no fake targets, renderer, timers or damage.
export class ZBodySwordAnimation{
  static async load(){
    const specs={attack:Z_SWORD.attack,cast:Z_SWORD.cast,...Object.fromEntries(Object.entries(Z_SWORD.effects).map(([key,e])=>[key,{...e.atlas,frames:e.frames}]))};
    const [sheets,dashTextures]=await Promise.all([Promise.all(Object.values(specs).map(spec=>Assets.load(spec.url))),ZBodyDashFX.load()]);
    const textures={};
    Object.entries(specs).forEach(([key,spec],n)=>{textures[key]=spec.frames.map((_,i)=>new Texture({source:sheets[n].source,frame:new Rectangle(i%spec.columns*spec.frameWidth,Math.floor(i/spec.columns)*spec.frameHeight,spec.frameWidth,spec.frameHeight)}));});
    return{...textures,...dashTextures};
  }
  constructor(engine,unit,textures){
    Object.assign(this,{engine,unit,textures,actionIndex:0,completed:0,mode:'ready',frame:'01',timeMs:0,dashProfile:'v2'});
    this.ground=new Container({label:'ZBodyApprovedGroundV3'});
    this.front=new Container({label:'ZBodyApprovedBladesV3'});
    engine.backgroundLayer.addChild(this.ground);engine.effectLayer.addChild(this.front);
    this.warning=new Graphics();this.ground.addChild(this.warning);
    const pair=(key,parent)=>[0,1].map(()=>{const s=new Sprite(textures[key][0]),e=Z_SWORD.effects[key];s.anchor.set(e.pivot.x/e.atlas.frameWidth,e.pivot.y/e.atlas.frameHeight);parent.addChild(s);return s;});
    this.fields=[pair('ground',this.ground),pair('ground',this.ground)];
    this.blades=Array.from({length:5},()=>pair('blade',this.front));
    this.spark=new Graphics();this.front.addChild(this.spark);
    this.dashFX=new ZBodyDashFX(engine,unit,textures);
    unit.swordAnimation=this;unit.bodySource=Z_SWORD.image;unit.weaponSprite.visible=false;unit.weaponSource='';
    this.ready();this.hideEffects();
  }
  pose(id){
    const key=id.startsWith('M')?'cast':'attack',spec=Z_SWORD[key],index=spec.frames.findIndex(f=>f.id===id),frame=spec.frames[index];
    if(!frame)return;
    const sprite=this.unit.bodySprite;sprite.texture=this.textures[key][index];
    sprite.anchor.set(frame.pivot.x/spec.frameWidth,frame.pivot.y/spec.frameHeight);
    // Explicitly restore UNIFORM scale after Pixi changes textures of different
    // canvas dimensions. Sword whitespace must never shrink the actor.
    sprite.scale.set(Z_SWORD.bodyScale);this.frame=id;
    this.unit.nameHud.position.set(145*Z_SWORD.bodyScale,-592*Z_SWORD.bodyScale-54);
  }
  ready(){if(!this.timeline)this.pose('01');}
  usesAsset(url){return Z_SWORD.assets.some(asset=>asset.url===url)||ZBodyDashFX.usesAsset(url);}
  hideEffects(){this.ground.visible=this.front.visible=false;this.dashFX?.hide();}
  paint(pair,key,ms,x,y,scale,opacity=1){
    const sample=swordEffectFrame(Z_SWORD.effects[key],ms);
    pair.forEach((sprite,i)=>{sprite.visible=Boolean(sample);if(!sample)return;sprite.texture=this.textures[key][i?sample.next:sample.index];sprite.scale.set(scale);sprite.position.set(x,y);sprite.alpha=opacity*sample.alpha*(i?sample.blend:1);});
  }
  area(ms,targets){
    const stations=targets.map(target=>({x:target.root.baseX??target.root.x,y:target.root.baseY??target.root.y}));
    const center={x:stations.reduce((n,p)=>n+p.x,0)/stations.length,y:stations.reduce((n,p)=>n+p.y,0)/stations.length+25};
    const spread=[{x:-135,y:-60},{x:135,y:-45},{x:0,y:0},{x:-105,y:100},{x:135,y:85}];
    const points=spread.map((offset,i)=>stations[i]?{...stations[i],size:[1.18,.94,1.04,1.07,1.22][i]}:{x:center.x+offset.x,y:center.y+offset.y,size:[1.18,.94,1.04,1.07,1.22][i]});
    this.ground.visible=this.front.visible=true;
    const smooth=n=>{const p=Math.max(0,Math.min(1,n));return p*p*(3-2*p);};
    const telegraph=smooth((ms-160)/300)*(1-smooth((ms-1080)/120));
    this.warning.clear();
    if(telegraph>0){
      this.warning.ellipse(center.x,center.y,490,195).fill({color:0x174a86,alpha:.1*telegraph}).stroke({color:0x4daffe,width:3,alpha:.8*telegraph});
      for(const p of points)this.warning.ellipse(p.x,p.y,66,25).stroke({color:0x8ddfff,width:2,alpha:telegraph}).ellipse(p.x,p.y,48,17).stroke({color:0xe4bd6b,width:1.5,alpha:.7*telegraph});
    }
    this.paint(this.fields[0],'ground',ms-1080,center.x,center.y,2.4,.96);
    this.paint(this.fields[1],'ground',ms-1390,center.x+55,center.y+38,2.65,.66);
    points.forEach((p,i)=>this.paint(this.blades[i],'blade',ms-(Z_SWORD.impactsMs[i]-300),p.x,p.y,1.18*p.size,.9));
    this.spark.clear();
    Z_SWORD.impactsMs.forEach((impact,i)=>{const age=ms-impact;if(age<0||age>360)return;const p=points[i];for(let n=0;n<9;n++){const a=n*2.399+i,travel=age/360,r=35+travel*(100+n*11),x=p.x+Math.cos(a)*r,y=p.y-45-Math.sin(a)*r*.38+travel*travel*65;this.spark.moveTo(x,y).lineTo(x-Math.cos(a)*12*(1-travel),y+8*(1-travel)).stroke({color:n%3?0xa3eaff:0xeac76f,width:2,alpha:(1-travel)*.8});}});
  }
  async play(batch,onImpact){
    this.cancel();const {unit,engine}=this,epoch=engine.playbackEpoch;
    const targets=[...new Set(batch.entries.map(e=>e.target).filter(t=>t?.root&&t.root.visible!==false))];
    if(!targets.length)return false;
    const ids=new Map(targets.map(t=>[t,t.id]));
    const validTarget=t=>engine.visible&&engine.playbackEpoch===epoch&&t.id===ids.get(t)&&t.root.visible!==false;
    // The legacy selector is used only by the approval comparison page.
    // All normal Z instances default to the approved V2 profile.
    const dashSequence=this.dashProfile==='legacy'?Z_SWORD.attack.sequences.dash:DASH_V2_SEQUENCE;
    const sequence=batch.mode==='area'?Z_SWORD.cast.sequence:dashSequence,clock={ms:0};
    const impacts=fastDashBatch(batch,dashSequence).impacts;
    this.mode=batch.mode;this.actionIndex++;unit.stopIdle();
    const origin=()=>({x:unit.root.baseX,y:unit.root.baseY});
    const sample=()=>{
      this.timeMs=clock.ms;const state=swordPose(sequence,clock.ms);this.pose(state.frame);
      const start=origin();
      if(batch.mode==='dash'){
        const victim=targets[0],feet={x:victim.root.baseX??victim.root.x,y:victim.root.baseY??victim.root.y};
        const stop=swordContactStop({x:feet.x,y:feet.y-100},Z_SWORD.bodyScale*unit.root.scale.x);
        unit.root.position.set(start.x+(stop.x-start.x)*state.travel,start.y+(stop.y-start.y)*state.travel+state.hop);
        unit.root.depthSortY=unit.root.y;
        if(this.dashProfile!=='legacy')this.dashFX.render(clock.ms,{start,stop,target:{x:feet.x,y:feet.y-100}});
      }else{unit.root.position.set(start.x,start.y);this.area(clock.ms,targets);}
    };
    const sync=()=>{
      const paused=Boolean(engine.skillChipPlayback?.holds||engine.skillChipPlayback?.userPaused||engine.accountBattleUnitIsPaused?.());
      this.timeline?.paused(paused);this.timeline?.timeScale(Math.max(.25,Number(engine.paceScale)||1));
    };
    const finish=()=>{
      engine.app?.ticker?.remove(sync);this.timeline=null;unit.fireTimeline=null;this.hideEffects();
      const p=origin();unit.root.position.set(p.x,p.y);unit.root.depthSortY=p.y;
      this.mode='ready';this.pose('01');this.timeMs=0;unit.view.position.set(0,0);unit.view.scale.set(1);
    };
    const result=await engine.timeline(timeline=>{
      this.timeline=unit.fireTimeline=timeline;
      timeline.to(clock,{ms:sequence.durationMs,duration:sequence.durationMs/1000,ease:'none',onUpdate:sample},0);
      const groups=[];
      for(const {entry,atMs} of impacts){
        let group=groups.find(g=>g.atMs===atMs&&g.target===entry.target);
        if(!group){group={atMs,target:entry.target,entries:[]};groups.push(group);}
        group.entries.push(entry);
      }
      for(const group of groups)timeline.call(()=>{if(validTarget(group.target))onImpact(group.entries);},[],group.atMs/1000);
      engine.app?.ticker?.add(sync,null,10);sample();
    },finish,engine.paceScale||1);
    if(result)this.completed++;
    return result;
  }
  cancel(){this.timeline?.kill();this.timeline=null;this.hideEffects();}
  diagnostics(){return{version:Z_SWORD.version,mode:this.mode,frame:this.frame,timeMs:Math.round(this.timeMs),completed:this.completed,bodyScale:Z_SWORD.bodyScale,effectsVisible:this.front.visible,damagePolicy:Z_SWORD.presentation,
    dashVersion:'Z_DASH_LIVE_20260918',dashProfile:this.dashProfile,contactMs:this.dashProfile==='legacy'?810:DASH_V2_SEQUENCE.contactAtMs,
    dashDurationMs:this.dashProfile==='legacy'?1695:DASH_V2_SEQUENCE.durationMs,dashEffectsVisible:this.dashFX.front.visible,dashEffectMs:Math.round(this.dashFX.lastMs||0)};}
  destroy(){this.cancel();this.dashFX.destroy();this.unit.bodySprite.texture=Texture.EMPTY;this.ground.destroy({children:true});this.front.destroy({children:true});for(const frames of Object.values(this.textures))for(const texture of frames)texture.destroy(false);}
}
