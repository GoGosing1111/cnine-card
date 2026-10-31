/* Authored body frames and five independent VFX atlases, driven only by the installed V3 GSAP clock. */
(()=>{
  const ROOT='/preview/madara-raid-v1/',clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  let loading=null,assets=null,releasing=null;
  async function preload(){
    if(releasing)await releasing;
    if(assets)return assets;if(loading)return loading;
    loading=(async()=>{
      const response=await fetch(ROOT+'assets/presentation-manifest.json');if(!response.ok)throw new Error('연출 매니페스트를 읽지 못했습니다.');
      const manifest=await response.json(),rt=window.ProjectVPixiBattle.fxRuntime,frames={};
      const results=await Promise.allSettled(Object.entries(manifest.atlases).map(async([key,spec])=>{
        if(key==='cast')return; // The live actor now owns the approved original-IP body.
        const atlas=await rt.Assets.load(ROOT+spec.url);
        frames[key]=spec.frames.map(f=>new rt.Texture({source:atlas.source,frame:new rt.Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
      }));
      const failed=results.find(r=>r.status==='rejected');if(failed){await disposeAssets({manifest,frames});throw failed.reason;}
      return assets={manifest,frames};
    })();try{return await loading;}catch(error){loading=null;throw error;}
  }
  async function disposeAssets(data){
    const loader=window.ProjectVPixiBattle.fxRuntime.Assets;
    for(const frames of Object.values(data.frames))for(const texture of frames)texture.destroy(false);
    const urls=Object.entries(data.manifest.atlases).filter(([key])=>key!=='cast').map(([,spec])=>ROOT+spec.url);
    await Promise.allSettled(urls.filter(url=>!loader.cache||loader.cache.has(url)).map(url=>loader.unload(url)));
  }
  function release(){
    if(releasing)return releasing;
    if(!loading&&!assets)return Promise.resolve();
    const retired=loading||Promise.resolve(assets);
    releasing=(async()=>{
      const data=await retired.catch(()=>null);
      if(data)await disposeAssets(data);
      assets=null;loading=null;
    })().finally(()=>{releasing=null;});
    return releasing;
  }
  function dialogue(cue){
    if(!cue)return;const box=document.getElementById('bossDialogue');box.dataset.key=cue.key;
    document.getElementById('bossCueTitle').textContent=cue.title;document.getElementById('bossLine').textContent='“'+cue.line+'”';
  }
  class Scene{
    constructor(engine,cue,{spirit=false,speed=1,effects=true,onFrame=()=>{},review=false}={}){
      Object.assign(this,{engine,cue,spirit,speed,effects,onFrame,review,duration:3.6,clock:{time:0},disposed:false,poseIndex:-1,fxIndex:-1,paused:false});
      this.actor=engine.boss||engine.currentEnemyTarget||engine.enemies.find(a=>a.battleActive!==false&&a.root.visible);
      this.target=engine.allies.filter(a=>a.hp>0&&a.battleActive!==false&&a.root.visible).sort((a,b)=>Math.hypot(a.root.x-this.actor.root.x,a.root.y-this.actor.root.y)-Math.hypot(b.root.x-this.actor.root.x,b.root.y-this.actor.root.y))[0]||engine.allies[0];
      const rt=window.ProjectVPixiBattle.fxRuntime;
      this.front=new rt.Container({label:'MadaraAuthoredFX'});this.front.eventMode='none';engine.effectLayer.addChild(this.front);
      this.back=new rt.Container({label:'MadaraShadowBodies'});this.back.eventMode='none';engine.combatLayer.addChild(this.back);this.back.zIndex=0;
      this.fx=new rt.Sprite();this.fx.anchor.set(.5);this.fx.visible=false;this.front.addChild(this.fx);
      this.ghosts=Array.from({length:2},()=>{const s=new rt.Sprite();s.visible=false;this.back.addChild(s);return s;});
      this.original=this.actor.fullBodySprite;
      this.body=new rt.Sprite();this.body.visible=false;this.actor.root.addChild(this.body);this.body.zIndex=11;
      this.banner=document.createElement('div');this.banner.className='mr-cue-banner';this.banner.textContent=cue.title;document.getElementById('battleMount').append(this.banner);
      this.originalVisible=this.original.visible;dialogue(cue);engine.updateStatus(cue.title);
      this.playback=engine.timeline(t=>{
        this.timeline=t;this.registration=[...engine.simpleTimelines].find(e=>e.instance===t);
        t.to(this.clock,{time:this.duration,duration:this.duration,ease:'none',onUpdate:()=>this.render(this.clock.time)},0);
        if(!engine.reducedMotion)engine.camera.addShake(t,{intensity:cue.effect==='meteor'?9:cue.effect==='awakening'?7:4,duration:.27,rotation:.0015,at:1.55});
      },()=>this.clear(),speed);
    }
    point(actor,height=0,layer=this.front){return layer.toLocal(actor.root.toGlobal({x:0,y:-(actor.fullBodyHeight||360)*height}));}
    render(t){
      if(this.disposed||!this.actor?.root||this.actor.root.destroyed)return;
      const {engine,actor,cue}=this,reduce=engine.reducedMotion,end=t>=this.duration||t<=0;
      this.clock.time=t;this.poseIndex=t<.38?0:t<.9?1:t<1.7?2:3;
      this.banner.style.opacity=String(end?0:reduce?.9:Math.min(1,t/.18)*clamp((1.65-t)/.35,0,1));
      if(t>2.1)this.banner.style.opacity='0';
      this.body.visible=!end&&!this.spirit;
      this.original.visible=this.body.visible?false:this.originalVisible;
      if(this.body.visible){
        this.body.texture=this.original.texture;this.body.anchor.copyFrom(this.original.anchor);this.body.scale.copyFrom(this.original.scale);
        this.body.position.copyFrom(this.original.position);
      }
      const bossFeet=this.point(actor),targetFeet=this.point(this.target),torso=this.point(this.target,.48),bossTorso=this.point(actor,.5);
      const hand=this.point(actor,.6);
      const key=assets.frames[cue.effect]?cue.effect:cue.effect==='gaze'?'illusion':cue.effect==='expose'?'awakening':null;
      const progress=clamp((t-.45)/2.7,0,.9999);this.fxIndex=Math.floor(progress*12);
      this.fx.visible=Boolean(key&&this.effects&&!end&&t>=.45&&t<3.3);
      const stageWidth=engine.scene.width;
      let position=torso,width=Math.min(620,stageWidth*.52),anchor={x:.5,y:.5};
      if(key==='fire'){
        // Frame emissions originate on the right. The impact crescent meets the living ally's torso.
        width=Math.min(stageWidth*.53,680);const travel=clamp(progress/.45,0,1);
        position={x:(hand.x-width*.36)*(1-travel)+(torso.x+width*.36)*travel,y:hand.y*(1-travel)+torso.y*travel};
      }else if(key==='meteor'){
        position={x:targetFeet.x,y:targetFeet.y+10};width=Math.min(stageWidth*.66,760);anchor={x:.5,y:.87};
      }else if(key==='awakening'){
        position=bossFeet;width=Math.min(stageWidth*.68,actor.fullBodyHeight*actor.root.scale.y*2.3);anchor={x:.5,y:.89};
      }else if(key==='clones'){
        position={x:bossFeet.x-100,y:bossFeet.y+12};width=Math.min(stageWidth*.64,660);anchor={x:.5,y:.88};
      }else if(key==='illusion'&&cue.effect==='gaze'){position=bossTorso;width=Math.min(500,stageWidth*.48);}
      // Keep the complete authored cell above the ground and inside the shared field, including mobile.
      width=Math.min(width,Math.max(120,(position.y-24)/Math.max(.1,anchor.y)));
      if(this.fx.visible){
        this.fx.texture=assets.frames[key][reduce?Math.min(10,this.fxIndex):this.fxIndex];this.fx.anchor.set(anchor.x,anchor.y);
        this.fx.scale.set(width/this.fx.texture.width);this.fx.position.set(clamp(position.x,width*.28,stageWidth-width*.28),position.y);
        this.fx.alpha=(reduce?.42:.87)*Math.min(1,(t-.45)/.15)*clamp((3.3-t)/.6,0,1);
      }
      this.ghosts.forEach((s,i)=>{
        s.visible=cue.effect==='clones'&&this.effects&&!reduce&&!end&&t>.4&&t<2.9;
        if(!s.visible)return;
        s.texture=this.original.texture;s.anchor.copyFrom(this.original.anchor);
        s.scale.set(this.original.scale.x*actor.root.scale.x*.85,this.original.scale.y*actor.root.scale.y*.85);
        const p=this.point(actor,0,this.back);s.position.set(p.x-(i+1)*110,p.y+(i+1)*28);s.tint=0x789bd5;s.alpha=.37*clamp((2.9-t)/.4,0,1);
      });
      const bodyFeet=this.front.toLocal(this.body.toGlobal({x:0,y:0}));
      this.contact={emission:hand,target:torso,groundError:Math.hypot(bodyFeet.x-bossFeet.x,bodyFeet.y-bossFeet.y),weapon:'UNARMED',impactAt:1.55,effectTop:position.y-width*anchor.y};
      this.onFrame(t,this.duration);
    }
    clear(){
      if(this.disposed)return;this.body.visible=false;this.fx.visible=false;this.ghosts.forEach(s=>s.visible=false);
      if(!this.original.destroyed)this.original.visible=this.originalVisible;
      this.banner.style.opacity='0';this.engine.camera.reset(true);
    }
    control(action,value){
      if(this.disposed)return false;
      if(action==='pause'){
        this.paused=!this.timeline.paused();this.timeline.paused(this.paused);
        if(!this.paused)this.engine.simpleTimelines.add(this.registration);return this.paused;
      }
      if(action==='speed'){this.speed=value;this.timeline.timeScale(value);}
      if(action==='seek'){
        this.timeline.pause().time(clamp(value,0,this.duration),true);this.paused=true;this.render(clamp(value,0,this.duration));
      }
      if(action==='effects'){this.effects=value;this.render(this.clock.time);}
      return true;
    }
    dispose(){
      if(this.disposed)return;this.timeline?.kill();this.registration?.settle(false);this.clear();this.disposed=true;
      this.body.destroy();this.front.destroy({children:true});this.back.destroy({children:true});this.banner.remove();
    }
    diagnostics(){return {cue:this.cue.key,time:this.clock.time,duration:this.duration,pose:this.poseIndex,frame:this.fxIndex,paused:this.timeline.paused(),effects:this.effects,contact:this.contact,actorActive:this.actor.battleActive!==false&&this.actor.root.visible,actorId:this.actor.id,bodyVisible:this.body.visible,originalVisible:this.original.visible,bodyBounds:this.body.getBounds().rectangle,fxVisible:this.fx.visible,disposed:this.disposed};}
  }
  class Telegraph{
    constructor(engine){
      this.engine=engine;this.key='';this.feedbackKey='';this.disposed=false;
      const rt=window.ProjectVPixiBattle.fxRuntime;
      this.layer=new rt.Container({label:'MadaraMechanicTelegraph'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
      this.ring=new rt.Graphics();this.layer.addChild(this.ring);
      this.impact=new rt.Sprite();this.impact.anchor.set(.5,.83);this.impact.visible=false;this.layer.addChild(this.impact);
    }
    draw(state,now){
      if(this.disposed)return;
      const task=state.tasks.filter(t=>!t.done).sort((a,b)=>a.decision.expiresAt-b.decision.expiresAt)[0];
      const shown=state.status==='ACTIVE'&&state.step==='MECHANIC'&&Boolean(task);this.layer.visible=shown;
      if(!shown){this.ring.clear();return;}
      const d=task.decision,actor=this.engine.boss||this.engine.currentEnemyTarget;
      const at=this.layer.toLocal(actor.root.toGlobal({x:0,y:0}));
      const ready=now>=d.readyAt&&now<d.expiresAt&&now>=d.recoveryAt;
      const key=[task.id,task.token,ready,Math.floor((d.expiresAt-now)/250),at.x,at.y].join(':');
      if(key!==this.key){
        this.key=key;this.ring.clear();
        const radius=Math.min(110,Math.max(44,actor.fullBodyHeight*actor.root.scale.y*.37));
        const color=ready?0xe2f7ff:0xe4b678;
        this.ring.position.set(at.x,at.y+5);
        // Dashed anticipation and solid response can be distinguished without colour.
        if(ready)this.ring.ellipse(0,0,radius,radius*.31).stroke({color,width:3,alpha:.92});
        else for(let i=0;i<12;i++){const a=i*Math.PI/6;this.ring.moveTo(Math.cos(a)*radius,Math.sin(a)*radius*.31).lineTo(Math.cos(a+.27)*radius,Math.sin(a+.27)*radius*.31).stroke({color,width:3,alpha:.8});}
        this.ring.ellipse(0,0,radius+8,(radius+8)*.31).stroke({color,width:1,alpha:.5});
        const percent=clamp((now-d.startedAt)/(d.expiresAt-d.startedAt),0,1);
        this.ring.rect(-radius,-radius*.31-12,radius*2,4).fill({color:0x101827,alpha:.85});
        this.ring.rect(-radius,-radius*.31-12,radius*2*(1-percent),4).fill({color,alpha:.95});
      }
      const feedback=state.tasks.filter(t=>t.feedback).sort((a,b)=>b.feedback.at-a.feedback.at)[0];
      if(feedback&&feedback.feedback.at>now-1800){
        const stamp=feedback.id+':'+feedback.feedback.version;
        if(stamp!==this.feedbackKey){this.feedbackKey=stamp;this.playFeedback(state,feedback.feedback,at);}
      }
    }
    playFeedback(state,feedback,point){
      this.animation?.kill();this.registration?.settle(false);
      const key=feedback.ok?({ILLUSION:'illusion',CLONES:'clones',FIRE:'fire',METEOR:'meteor',FINAL:'awakening'}[state.challenge.kind]):'illusion';
      const clock={time:0};this.impact.position.set(point.x,point.y+6);this.impact.visible=true;
      this.engine.timeline(t=>{
        this.animation=t;this.registration=[...this.engine.simpleTimelines].find(e=>e.instance===t);
        t.to(clock,{time:1,duration:.75,ease:'none',onUpdate:()=>{
          if(this.disposed)return;
          this.impact.texture=assets.frames[key][Math.min(11,4+Math.floor(clock.time*8))];
          this.impact.scale.set(Math.min(210,this.engine.scene.width*.26)/this.impact.texture.width);
          this.impact.alpha=(this.engine.reducedMotion?.25:.58)*(1-clock.time);
        }},0);
      },()=>{if(!this.disposed)this.impact.visible=false;},1);
    }
    dispose(){if(this.disposed)return;this.disposed=true;this.animation?.kill();this.registration?.settle(false);this.layer.destroy({children:true});}
  }
  window.MadaraPresentation={preload,release,dialogue,create:(engine,cue,options)=>new Scene(engine,cue,options),telegraph:engine=>new Telegraph(engine),diagnostics:()=>({loaded:Boolean(assets),bodyFrames:assets?.frames.cast?.length||0,effectFrames:assets?Object.values(assets.frames).reduce((n,f)=>n+f.length,0)-(assets.frames.cast?.length||0):0})};
})();
