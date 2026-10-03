(() => {
  'use strict';
  const ROOT='/assets/ui/territory-war/artillery-fx-v1/';
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const artillery=new Set(['SHOT','CANNON_FIRED','WALL_BREAKER','SPG_BARRAGE','COUNTER_BATTERY','ASSAULT','INFILTRATION']);
  let assetsPromise;
  async function resources(runtime){
    if(!assetsPromise)assetsPromise=(async()=>{
      const response=await fetch(ROOT+'manifest.json?v=20261003-v1');if(!response.ok)throw Error('Artillery manifest unavailable');
      const manifest=await response.json(),textures={};
      await Promise.all(Object.entries(manifest.assets).map(async([key,spec])=>{
        const texture=await runtime.Assets.load(spec.url+'?v=20261003-v1');
        textures[key]=spec.frames?spec.frames.map(frame=>new runtime.Texture({source:texture.source,frame:new runtime.Rectangle(frame.x,frame.y,frame.w,frame.h)})):texture;
      }));return {manifest,textures};
    })().catch(error=>{assetsPromise=null;throw error;});
    return assetsPromise;
  }
  class ArtilleryFx {
    constructor(){
      this.target=null;this.scene=null;this.active=new Set();this.ready=null;this.enabled=true;this.paused=true;this.destroyed=false;
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.speed=1;this.failed='';this.loadEpoch=0;
    }
    attach(target){
      this.target=target;if(!target)return;
      if(this.scene&&!this.scene.disposed){this.scene.attachTo(target);this.layout();}
      if(!this.paused&&this.enabled)void this.ensure();
    }
    async ensure(){
      if(this.destroyed||this.paused||!this.enabled||!this.target?.isConnected||document.querySelector('.tw6-personal-battle'))return null;
      if(this.scene&&!this.scene.disposed)return this.scene;
      if(this.ready)return this.ready;
      const epoch=++this.loadEpoch;
      this.ready=(async()=>{
        if(!globalThis.ProjectVBattleV3Live)await globalThis.ensureFeatureResources?.('battleV2');
        await globalThis.ProjectVBattleV3Live?.ensureRuntime({effects:true});
        const api=globalThis.ProjectVPixiBattle;if(!api?.mountEffectScene)throw Error('Current V3 artillery renderer required');
        const loaded=await resources(api.fxRuntime);
        if(this.destroyed||this.paused||epoch!==this.loadEpoch||!this.target?.isConnected||document.querySelector('.tw6-personal-battle'))return null;
        const scene=await api.mountEffectScene(this.target);if(!scene)return null;
        if(this.destroyed||epoch!==this.loadEpoch){api.releaseEffectScene(scene);return null;}
        this.scene=scene;this.runtime=api.fxRuntime;this.assets=loaded;
        scene.app.canvas.classList.add('tw6-fx-canvas');scene.app.canvas.dataset.fxVersion=loaded.manifest.version;
        this.guns=['A','B'].map(side=>{const sprite=new this.runtime.Sprite(loaded.textures.turret);sprite.anchor.set(...loaded.manifest.assets.turret.ground);sprite.label='TERRITORY_SIEGE_GUN_'+side;scene.combatLayer.addChild(sprite);return sprite;});
        scene.onEffectResize=()=>this.layout();scene.onEffectSceneDestroy=()=>{this.active.clear();this.scene=null;this.guns=null;};
        this.layout();await scene.setVisible(!this.paused&&this.enabled);this.target.dataset.fxReady='true';return scene;
      })().catch(error=>{this.failed=error.message;if(this.target)this.target.dataset.fxReady='false';console.warn('Territory artillery unavailable:',error.message);return null;}).finally(()=>{this.ready=null;});
      return this.ready;
    }
    geometry(){
      const w=Math.max(1,this.scene?.app?.screen.width||this.target?.clientWidth||1),h=Math.max(1,this.scene?.app?.screen.height||this.target?.clientHeight||1);
      // Keep the ground plane above the existing objective/action dock.
      const width=Math.min(w*(w<650?.40:.28),h*.58),height=width*2/3,edge=Math.max(width*.43,w*.12),groundY=Math.min(h*.82,h-165);
      const a={x:edge,y:groundY},b={x:w-edge,y:groundY},muzzle=this.assets?.manifest.assets.turret.muzzle||[.953,.159],ground=this.assets?.manifest.assets.turret.ground||[.42,.925];
      const gun=(side)=>{const p=side==='B'?b:a,dir=side==='B'?-1:1;return {base:p,dir,muzzle:{x:p.x+dir*(muzzle[0]-ground[0])*width,y:p.y+(muzzle[1]-ground[1])*height}};};
      return {w,h,width,height,gun,target:side=>{const p=side==='B'?a:b;return {x:p.x,y:p.y-height*.10};}};
    }
    layout(){
      if(!this.scene||this.scene.disposed||!this.guns)return;
      const g=this.geometry();this.guns.forEach((sprite,i)=>{const side=i?'B':'A',p=g.gun(side);sprite.position.set(p.base.x,p.base.y);sprite.scale.set(p.dir*g.width/768,g.width/768);});
      for(const effect of this.active)this.sample(effect);
    }
    setEnabled(value){
      this.enabled=Boolean(value);if(!value)this.clear();
      if(this.scene)this.scene.setVisible(!this.paused&&this.enabled);
      if(value&&!this.paused)void this.ensure();
    }
    setPaused(value){
      const next=Boolean(value);if(this.paused===next){if(!next&&this.enabled&&!this.scene&&!this.ready)void this.ensure();return;}
      this.paused=next;
      if(this.scene&&!this.scene.disposed)this.scene.setVisible(!next&&this.enabled);
      if(!next&&this.enabled)void this.ensure();
    }
    sprite(key,parent){
      const spec=this.assets.manifest.assets[key],sprite=new this.runtime.Sprite(this.assets.textures[key][0]);
      sprite.anchor.set(...spec.anchor);sprite.visible=false;sprite.label='AUTHORED_ARTILLERY_'+key.toUpperCase();parent.addChild(sprite);return sprite;
    }
    async play(type,side='A',options={}){
      if(!this.enabled||this.paused||this.destroyed)return null;
      const requestedAt=performance.now(),scene=await this.ensure();
      if(!scene||scene.disposed||this.paused||!this.enabled||performance.now()-requestedAt>3000)return null;
      while(this.active.size>=6)this.remove(this.active.values().next().value);
      const root=new this.runtime.Container({label:'TerritoryArtillery:'+type});scene.effectLayer.addChild(root);
      const heavy=['CANNON_FIRED','WALL_BREAKER','SPG_BARRAGE','COUNTER_BATTERY'].includes(type),clock={time:0};
      const spec=heavy?this.assets.manifest.timing.cannon:this.assets.manifest.timing.shot;
      const effect={root,type,side:side==='B'?'B':'A',clock,heavy,spec,timeline:null,removed:false,duration:artillery.has(type)?spec.endAt:type==='CARPET_BOMBING'?3.8:2.2};
      if(artillery.has(type)||type==='SIEGE_CANNON'){
        effect.muzzle=this.sprite('muzzle',root);effect.projectile=this.sprite('projectile',root);effect.impact=this.sprite('impact',root);
      }else if(type==='CARPET_BOMBING')effect.impacts=Array.from({length:5},()=>this.sprite('impact',root));
      else {effect.graphics=new this.runtime.Graphics();root.addChild(effect.graphics);}
      this.active.add(effect);this.lastEffect=effect;
      void scene.timeline(timeline=>{
        effect.timeline=timeline;timeline.to(clock,{time:effect.duration,duration:effect.duration,ease:'none',onUpdate:()=>this.sample(effect)},0);
      },()=>this.remove(effect,false),this.speed);
      if(options.paused)effect.timeline.pause(0);this.sample(effect);return effect;
    }
    frame(sprite,key,progress,width,alpha=1){
      if(!sprite)return;sprite.visible=progress>=0&&progress<1&&alpha>0;
      if(!sprite.visible)return;
      const frames=this.assets.textures[key];sprite.texture=frames[Math.min(frames.length-1,Math.floor(clamp(progress)*frames.length))];
      sprite.scale.set(width/this.assets.manifest.assets[key].cell);sprite.alpha=clamp(alpha);
    }
    sample(effect){
      if(effect.removed||!this.scene||this.scene.disposed)return;
      const {time:t}=effect.clock,g=this.geometry(),gun=g.gun(effect.side),target=g.target(effect.side),origin=gun.muzzle,dir=gun.dir;
      if(artillery.has(effect.type)){
        const {fireAt,impactAt,endAt}=effect.spec,depart=fireAt+.07,travel=clamp((t-depart)/(impactAt-depart));
        const muzzleLife=effect.heavy?.78:.48,blast=(t-fireAt)/muzzleLife,impact=(t-impactAt)/(endAt-impactAt);
        this.frame(effect.muzzle,'muzzle',blast,g.width*(effect.heavy?.63:.36),this.reduced?.36:1);
        effect.muzzle.position.set(origin.x,origin.y);effect.muzzle.rotation=dir===1?-.324:Math.PI+.324;
        const recoil=t>=fireAt&&t<fireAt+.25?Math.sin((t-fireAt)/.25*Math.PI)*(effect.heavy?4:2):0;
        this.guns[dir===1?0:1].position.set(gun.base.x-dir*recoil,gun.base.y+recoil*.25);
        const control={x:(origin.x+target.x)/2,y:origin.y-Math.abs(target.x-origin.x)*.17};
        const q=1-travel,x=q*q*origin.x+2*q*travel*control.x+travel*travel*target.x,y=q*q*origin.y+2*q*travel*control.y+travel*travel*target.y;
        this.frame(effect.projectile,'projectile',((Math.max(0,t-depart)*18)%8)/8,Math.min(effect.heavy?140:82,g.w*(effect.heavy?.20:.13)),1);
        effect.projectile.visible=!this.reduced&&t>=depart&&t<impactAt;
        effect.projectile.position.set(x,y);effect.projectile.rotation=Math.atan2(2*q*(control.y-origin.y)+2*travel*(target.y-control.y),2*q*(control.x-origin.x)+2*travel*(target.x-control.x));
        // Dense dust/debris stays in normal alpha blending. It is not washed out
        // by screen/additive blending. Only the final authored smoke tail fades.
        this.frame(effect.impact,'impact',impact,Math.min(effect.heavy?360:174,g.w*(effect.heavy?.34:.21)),(this.reduced?.42:1)*(impact>.68?clamp((1-impact)/.32):1));
        effect.impact.position.set(target.x,target.y);
        effect.contact={projectile:{x,y},target:{...target},muzzle:{...origin},impactAt,phase:t<depart?'muzzle':t<impactAt?'flight':'impact'};
      }else if(effect.type==='SIEGE_CANNON'){
        const p=t/effect.duration;this.frame(effect.muzzle,'muzzle',.025,g.width*.20,(.25+.3*Math.sin(p*Math.PI))*(this.reduced?.5:1));
        effect.muzzle.position.set(origin.x,origin.y);effect.muzzle.rotation=dir===1?-.324:Math.PI+.324;
      }else if(effect.impacts){
        effect.impacts.forEach((sprite,i)=>{const p=(t-.2-i*.22)/2.5;this.frame(sprite,'impact',p,Math.min(230,g.w*.26),p>.65?clamp((1-p)/.35):1);sprite.position.set(g.w*(.28+i*.11),g.h*(.69+(i%2)*.04));});
      }else{
        // Preserve non-artillery command indicators in the shared effect layer.
        const p=t/effect.duration,c=effect.side==='B'?0xff6b86:0x79e6ff,x=effect.type==='RELAY_CAPTURED'?g.w*.5:effect.type==='ENGINEER'?gun.base.x:target.x,y=g.h*.48,r=22+p*g.w*.36;
        effect.graphics.clear();effect.graphics.ellipse(x,y,r,r*.4).stroke({width:effect.type==='EMP_PULSE'?4:2,color:c,alpha:(1-p)*.6});
      }
      if(this.scene.app&&!this.scene.visible)this.scene.app.render();
    }
    remove(effect,kill=true){
      if(!effect||effect.removed)return;effect.removed=true;this.active.delete(effect);
      if(kill)effect.timeline?.kill();effect.root?.removeFromParent();effect.root?.destroy({children:true,texture:false});
      if(this.scene&&!this.scene.disposed)this.layout();
    }
    clear(){for(const effect of [...this.active])this.remove(effect);this.lastEffect=null;}
    control(action,value){
      const effect=this.lastEffect;if(!effect||effect.removed)return false;
      if(action==='seek'){effect.timeline.pause();effect.timeline.time(clamp(Number(value),0,effect.duration-.001),false);this.sample(effect);}
      if(action==='pause')effect.timeline.pause();
      if(action==='resume')effect.timeline.resume();
      if(action==='speed'){this.speed=clamp(Number(value),.25,2);effect.timeline.timeScale(this.speed);}
      if(action==='stop')this.clear();return true;
    }
    diagnostics(){
      return {ready:Boolean(this.scene&&!this.scene.disposed),renderer:'shared-v3-pixi',clock:'registered-v3-gsap',active:this.active.size,paused:this.paused,enabled:this.enabled,reduced:this.reduced,failed:this.failed,
        frames:this.assets?{muzzle:this.assets.textures.muzzle.length,projectile:this.assets.textures.projectile.length,impact:this.assets.textures.impact.length}:null,
        timelines:this.scene?.simpleTimelines.size||0,geometry:this.scene?this.geometry():null,last:this.lastEffect&&!this.lastEffect.removed?{type:this.lastEffect.type,time:this.lastEffect.clock.time,duration:this.lastEffect.duration,contact:this.lastEffect.contact}:null};
    }
    destroy(){
      this.destroyed=true;this.loadEpoch++;this.clear();const scene=this.scene;this.scene=null;
      if(scene)globalThis.ProjectVPixiBattle?.releaseEffectScene(scene);this.target=null;
    }
  }
  globalThis.CNineTerritoryArtilleryFx=ArtilleryFx;
})();
