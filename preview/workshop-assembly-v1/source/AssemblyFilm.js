import {Application,Assets,Container,Graphics,Sprite,BlurFilter} from 'pixi.js';
import {gsap} from 'gsap';
import {DURATION,MODES,acceptResult,phaseAt} from './contract.mjs';
import {MODELS,DEFAULT_MODEL,modelFor,suitPlacement} from './models.mjs';
import variantParts from '../parts-manifest.json' with {type:'json'};

// esbuild IIFE resolves assets relative to this preview, not the source directory.
const base=new URL('assets/',location.href).href;
const root=location.origin;
const clamp=v=>Math.max(0,Math.min(1,v));
const parts=['helmet','torso','hips','shoulderL','shoulderR','armL','armR','legL','legR','core'];
const resources={suitBackground:base+'suit-bay.png',vehicleBackground:base+'vehicle-bay.png',car:base+'car-cutout.png',suit:root+'/assets/items/h-body-v2066.png',frame:root+'/assets/ui/workshop/vehicle-part-frame-v1668.png',engine:root+'/assets/ui/workshop/vehicle-part-engine-v1668.png',...Object.fromEntries(parts.map(n=>[n,base+`parts/${n}.png`])),...Object.fromEntries(['upper','lower','grip'].map(n=>['robot-'+n,base+`parts/robot-${n}.png`]))};
resources.ignis=new URL(MODELS.ignis.source,location.href).href;
for(const [key,v]of Object.entries(variantParts)){
  resources[key]=root+v.source;
  for(const p of v.parts)resources[`${key}:${p.name}`]=new URL(p.path,location.href).href;
}
export const RESOURCE_KEYS=Object.freeze(Object.keys(resources));

// Recorded Foley only; no oscillator/noise synthesis. Sound source positions
// follow the GSAP playhead so pause, seek and 2× never create orphan playback.
class MechanicalAudio {
  constructor(){this.enabled=false;this.voices=[];this.buffers={};this.context=null;this.anchor=null;this.error=null;this.lockPeak=0;this.destroyed=false;}
  async enable(){
    if(this.destroyed)return;this.context??=new AudioContext();await this.context.resume();
    try{await Promise.all(['lock','driver','ignition','failure'].map(async n=>{
      if(this.buffers[n])return;
      const r=await fetch(base+`audio/${n}.wav`);if(!r.ok)throw new Error(`Audio ${r.status}`);
      this.buffers[n]=await this.context.decodeAudioData(await r.arrayBuffer());
      if(n==='lock'){
        const b=this.buffers[n];let peak=0;
        for(let c=0;c<b.numberOfChannels;c++){const pcm=b.getChannelData(c);for(let i=0;i<pcm.length;i++)if(Math.abs(pcm[i])>peak){peak=Math.abs(pcm[i]);this.lockPeak=i/b.sampleRate;}}
      }
    }));this.enabled=!this.destroyed;}catch(e){this.error=e.message;this.enabled=false;}
  }
  stop(){for(const v of this.voices){try{v.stop();}catch{}v.disconnect();}this.voices=[];this.anchor=null;}
  schedule(t,rate,cues){
    this.stop();if(!this.enabled||!this.context)return;
    this.anchor={t,rate,clock:this.context.currentTime};
    for(const cue of cues){
      const b=this.buffers[cue.name];if(!b)continue;
      const preRoll=cue.name==='lock'?Math.min(.08,this.lockPeak):0;
      const mediaStart=cue.name==='lock'?this.lockPeak-preRoll:0,startAt=cue.at-preRoll;
      const offset=Math.max(0,t-startAt),length=Math.min(b.duration-mediaStart,cue.length||b.duration);
      if(offset>=length)continue;
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      source.buffer=b;source.playbackRate.value=rate;source.connect(gain);gain.connect(this.context.destination);
      const when=this.context.currentTime+Math.max(0,startAt-t)/rate;
      gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(cue.gain||.2,when+.008);
      gain.gain.setValueAtTime(cue.gain||.2,when+Math.max(.01,(length-offset)/rate-.07));gain.gain.linearRampToValueAtTime(0,when+(length-offset)/rate);
      source.start(when,mediaStart+offset,length-offset);source.onended=()=>{source.disconnect();gain.disconnect();};this.voices.push(source);
    }
  }
  sync(t,rate,cues){if(!this.anchor||Math.abs(this.anchor.t+(this.context.currentTime-this.anchor.clock)*this.anchor.rate-t)>.12||this.anchor.rate!==rate)this.schedule(t,rate,cues);}
  destroy(){this.destroyed=true;this.enabled=false;this.stop();this.context?.close();this.context=null;}
}

export class AssemblyFilm {
  constructor(host,onUpdate){
    this.host=host;this.onUpdate=onUpdate;this.mode='suit';this.disposed=false;this.timeline=null;this.audio=new MechanicalAudio();this.reducedMotion=false;this.rate=1;this.generation=0;this.buffers=[];
  }
  async init(){
    this.app=new Application();await this.app.init({backgroundAlpha:0,antialias:true,autoStart:false,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl',powerPreference:'low-power'});
    if(this.disposed){this.app.destroy(true);return;}
    this.host.append(this.app.canvas);
    await Promise.all(Object.entries(resources).map(async([key,url])=>{
      const texture=await Assets.load(url);
      // Preserve source artwork while filtering detailed new parts cleanly
      // at mobile scale. Configure before the first GPU texture upload.
      if(key==='ignis'||/^[efg](?::|$)/.test(key)){
        texture.source.autoGenerateMipmaps=true;texture.source.scaleMode='linear';
      }
      this.buffers[key]=texture;
    }));
    if(this.disposed)return;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.host);
    this.visibility=()=>{if(document.hidden)this.pause();};document.addEventListener('visibilitychange',this.visibility);
  }
  sprite(key,parent,options={}){const s=new Sprite(this.buffers[key]);Object.assign(s,options);parent.addChild(s);return s;}
  resetScene(){
    this.audio.stop();this.timeline?.kill();this.timeline=null;
    this.app.stage.removeChildren().forEach(c=>c.destroy({children:true,texture:false,textureSource:false}));
    this.background=this.sprite(`${this.mode}Background`,this.app.stage);
    this.world=new Container();this.app.stage.addChild(this.world);this.world.pivot.set(720,450);
    this.camera=new Container();this.camera.pivot.set(720,450);this.camera.position.set(720,450);this.world.addChild(this.camera);
    this.machine=new Graphics();this.camera.addChild(this.machine);
    this.armRigs={};
    for(const side of ['left','right']){
      const rig=new Container();this.camera.addChild(rig);
      this.armRigs[side]={rig,...Object.fromEntries(['upper','lower','grip'].map(n=>{const s=this.sprite('robot-'+n,rig);s.anchor.set(.075,.5);return[n,s];}))};
    }
    this.object=new Container();this.camera.addChild(this.object);
    this.fx=new Graphics();this.camera.addChild(this.fx);
    this.glow=new Graphics();this.glow.blendMode='add';this.glow.filters=[new BlurFilter({strength:10,quality:3})];this.camera.addChild(this.glow);
    this.foreground=new Graphics();this.camera.addChild(this.foreground);
    this.state={time:0,scan:0,light:0,weld:0,camera:1,gate:0};
    this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(),onComplete:()=>{this.audio.stop();this.onUpdate(this.diagnostics());}});
    this.timeline.to(this.state,{time:DURATION,duration:DURATION,ease:'none'},0);
  }
  prepare(mode,result,item=DEFAULT_MODEL[mode]){
    if(!MODES[mode]||this.disposed)throw new Error('Invalid assembly mode');
    this.model=modelFor(mode,item);this.modelKey=item;this.result=acceptResult(result);this.mode=mode;this.generation++;this.resetScene();
    this.suitBounds=null;this.corePoint=null;this.weldRange=[7.2,8.8];this.renderedParts=[];
    if(mode==='suit')this.buildSuit();else this.buildVehicle();
    this.scanStart=mode==='suit'?8.7:9.2;
    this.timeline.to(this.state,{scan:1,duration:mode==='suit'?1.1:.9,ease:'none'},this.scanStart);
    this.timeline.to(this.state,{light:this.result.success?1:.25,duration:.28,ease:'power2.out'},10.3);
    this.timeline.to(this.state,{camera:1.07,duration:2.2,ease:'power2.inOut'},10.4);
    this.timeline.to(this.state,{gate:1,duration:1.3,ease:'power2.inOut'},11.4);
    this.timeline.timeScale(this.rate);this.timeline.seek(0,true);this.resize();
  }
  buildSuit(){
    if(this.modelKey!=='h'){this.buildVariantSuit();return;}
    this.suitGroup=new Container();this.suitGroup.position.set(445,75);this.suitGroup.scale.set(.72);this.object.addChild(this.suitGroup);
    const ghost=this.sprite('suit',this.suitGroup,{alpha:.08,tint:0xb4c3cb});
    const specs={legL:[-160,175,.8,1.25,-.08],legR:[170,175,1.1,1.25,.08],hips:[0,180,1.8,1,0],torso:[0,-190,2.3,1.25,0],shoulderL:[-280,-55,3.7,1.2,-.17],shoulderR:[280,-55,4.1,1.2,.17],armL:[-310,30,4.6,1.25,-.13],armR:[310,30,5,1.25,.13],helmet:[0,-250,6,1.1,0],core:[0,-75,7.5,.7,0]};
    for(const name of parts){
      const [dx,dy,at,duration,rotation]=specs[name];const s=this.sprite(name,this.suitGroup,{x:dx,y:dy,alpha:0,rotation});
      this.timeline.to(s,{alpha:1,duration:.2},at).to(s,{x:0,y:0,rotation:0,duration,ease:'power3.inOut'},at);
    }
    this.timeline.to(ghost,{alpha:0,duration:.4},8.2);
    this.cues=[1.95,2.35,2.8,3.55,4.9,5.3,5.85,6.25,7.1,8.2].map(at=>({name:'lock',at,gain:.12,length:.55}));
    this.cues.push({name:'driver',at:8.5,gain:.12,length:.9},{name:this.result.success?'driver':'failure',at:10.3,gain:.1,length:1.2});
    this.impacts=[{at:1.95,x:650,y:700},{at:2.35,x:815,y:700},{at:3.55,x:754,y:341},{at:4.9,x:662,y:250},{at:5.3,x:812,y:250},{at:5.85,x:636,y:365},{at:6.25,x:844,y:373},{at:7.1,x:758,y:211},{at:8.2,x:758,y:287}];
    this.corePoint={x:758,y:287};
  }
  buildVariantSuit(){
    const model=this.model,v=variantParts[this.modelKey],placement=suitPlacement(model);
    this.suitGroup=new Container();this.suitGroup.position.set(placement.x,placement.y);this.suitGroup.scale.set(placement.scale);this.object.addChild(this.suitGroup);
    const point=([x,y])=>({x:placement.x+x*placement.scale,y:placement.y+y*placement.scale});
    this.corePoint=point(model.core);const lo=point(model.box.slice(0,2)),hi=point(model.box.slice(2));this.suitBounds={left:lo.x-32,right:hi.x+32,top:lo.y,bottom:hi.y};
    const ghost=this.sprite(this.modelKey,this.suitGroup,{alpha:.09,tint:0x628e9c});
    const specs={legL:[-175,160,.8,1.25,-.06],legR:[160,160,1.1,1.25,.06],hips:[0,150,1.8,1,0],torso:[0,-185,2.3,1.25,0],wing:[-265,-45,3.45,1.45,-.09],coat:[0,180,4.9,1.5,0],shoulderL:[-220,-40,3.7,1.2,-.12],shoulderR:[210,-50,4.1,1.2,.12],armL:[-220,20,4.6,1.25,-.07],armR:[220,20,5,1.25,.07],head:[0,0,6,.9,0],core:[0,-95,7.5,.7,0]};
    this.impacts=[];
    for(const p of v.parts){
      const [dx,dy,at,duration,rotation]=specs[p.name],cx=p.x+p.width/2,cy=p.y+p.height/2;
      const s=this.sprite(`${this.modelKey}:${p.name}`,this.suitGroup,{alpha:0,rotation});s.pivot.set(p.width/2,p.height/2);s.position.set(cx+dx,cy+dy);
      // A human face is never flown into place as a detached robot head. The
      // fixed head/hair layer resolves in place during interface calibration.
      this.timeline.to(s,{alpha:1,duration:p.name==='head'?.9:.22},at).to(s,{x:cx,y:cy,rotation:0,duration,ease:'power3.inOut'},at);
      this.renderedParts.push({name:p.name,sprite:s,target:{x:cx,y:cy}});
      if(p.name!=='head')this.impacts.push({at:at+duration,...point(model.joints[p.name])});
    }
    this.impacts.sort((a,b)=>a.at-b.at);this.timeline.to(ghost,{alpha:0,duration:.35},8.2);
    this.cues=this.impacts.map(p=>({name:'lock',at:p.at,gain:.12,length:.55}));
    this.cues.push({name:'driver',at:8.5,gain:.12,length:.9},{name:this.result.success?'driver':'failure',at:10.3,gain:.1,length:1.2});
  }
  buildVehicle(){
    if(this.modelKey==='ignis'){this.buildIgnis();return;}
    this.carGroup=new Container();this.object.addChild(this.carGroup);
    const chassis=this.sprite('frame',this.carGroup,{x:590,y:250,alpha:0});chassis.scale.set(.93);
    const engine=this.sprite('engine',this.carGroup,{x:716,y:-80,alpha:0});engine.scale.set(.29);
    this.timeline.to(chassis,{alpha:1,duration:.5},.6).to(chassis,{x:345,duration:1.3,ease:'power2.out'},.6);
    this.timeline.to(engine,{alpha:1,duration:.2},2).to(engine,{y:329,duration:1.35,ease:'power2.inOut'},2);
    this.carArt=new Container();this.carArt.position.set(163,205);this.carArt.scale.set(.67);this.carGroup.addChild(this.carArt);
    const wheels=[{cx:918,cy:600,rx:101,ry:153,dx:-330,dy:100,at:3.7},{cx:1530,cy:508,rx:74,ry:130,dx:285,dy:-55,at:4.25}];
    // Masks reveal the authored car body and wheel pixels. The final image is
    // the exact full alpha cutout, not these temporary animation mattes.
    const body=new Container();this.carArt.addChild(body);this.sprite('car',body);
    const bodyMask=new Graphics().rect(0,0,1672,941).fill(0xffffff);
    for(const w of wheels)bodyMask.ellipse(w.cx,w.cy,w.rx,w.ry).cut();
    body.addChild(bodyMask);body.mask=bodyMask;body.alpha=0;body.y=-430;
    this.timeline.to(body,{alpha:1,duration:.45},5.4).to(body,{y:0,duration:1.45,ease:'power3.inOut'},5.4);
    for(const w of wheels){
      const c=new Container();c.x=w.dx;c.y=w.dy;c.alpha=0;this.carArt.addChild(c);this.sprite('car',c);
      const mask=new Graphics().ellipse(w.cx,w.cy,w.rx+1,w.ry+1).fill(0xffffff);c.addChild(mask);c.mask=mask;
      this.timeline.to(c,{alpha:1,duration:.25},w.at).to(c,{x:0,y:0,duration:1.2,ease:'power3.inOut'},w.at);
    }
    this.timeline.to([chassis,engine],{alpha:0,duration:.5},6.3);
    const full=this.sprite('car',this.carArt,{alpha:0});this.timeline.to(full,{alpha:1,duration:.1},6.85);
    this.timeline.to(this.state,{weld:1,duration:1.6,ease:'none'},7.2);
    if(this.result.success){this.timeline.to(this.carGroup,{x:-44,y:20,duration:1.9,ease:'power2.inOut'},11.4);}
    this.cues=[{name:'lock',at:1.9,gain:.14,length:.65},{name:'lock',at:3.35,gain:.16,length:.65},{name:'driver',at:4.9,gain:.13,length:.85},{name:'driver',at:5.45,gain:.13,length:.85},{name:'lock',at:6.85,gain:.2,length:.8},{name:'driver',at:7.3,gain:.11,length:1.2},{name:this.result.success?'ignition':'failure',at:10.3,gain:.2,length:3}];
    this.impacts=[{at:1.9,x:533,y:690},{at:3.35,x:810,y:410},{at:4.9,x:777,y:607},{at:5.45,x:1190,y:545},{at:6.85,x:628,y:660}];
  }
  buildIgnis(){
    const m=this.model,a=m.art;this.carGroup=new Container();this.object.addChild(this.carGroup);
    const chassis=this.sprite('frame',this.carGroup,{x:590,y:250,alpha:0});chassis.scale.set(.93);
    const engine=this.sprite('engine',this.carGroup,{x:m.engine[0],y:-80,alpha:0});engine.scale.set(.29);
    this.timeline.to(chassis,{alpha:1,duration:.5},.6).to(chassis,{x:345,duration:1.3,ease:'power2.out'},.6);
    this.timeline.to(engine,{alpha:1,duration:.2},2).to(engine,{y:m.engine[1],duration:1.35,ease:'power2.inOut'},2);
    this.carArt=new Container();this.carArt.position.set(a.x,a.y);this.carArt.scale.set(a.scale);this.carGroup.addChild(this.carArt);
    const body=new Container();this.carArt.addChild(body);this.sprite('ignis',body);
    const bodyMask=new Graphics().rect(0,0,1679,937).fill(0xffffff);
    for(const w of m.wheels)bodyMask.ellipse(w.cx,w.cy,w.rx,w.ry).cut();
    bodyMask.rect(...m.turbine).cut();body.addChild(bodyMask);body.mask=bodyMask;body.alpha=0;body.y=-390;
    this.timeline.to(body,{alpha:1,duration:.45},5.4).to(body,{y:0,duration:1.45,ease:'power3.inOut'},5.4);
    for(const w of m.wheels){
      const c=new Container();this.carArt.addChild(c);this.sprite('ignis',c);c.position.set(w.dx,w.dy);c.alpha=0;
      const mask=new Graphics().ellipse(w.cx,w.cy,w.rx+1,w.ry+1).fill(0xffffff);c.addChild(mask);c.mask=mask;
      this.timeline.to(c,{alpha:1,duration:.25},w.at).to(c,{x:0,y:0,duration:1.2,ease:'power3.inOut'},w.at);
    }
    const turbine=new Container();this.carArt.addChild(turbine);this.sprite('ignis',turbine);turbine.y=-245;turbine.alpha=0;
    const mask=new Graphics().rect(...m.turbine).fill(0xffffff);turbine.addChild(mask);turbine.mask=mask;
    this.timeline.to(turbine,{alpha:1,duration:.2},7.2).to(turbine,{y:0,duration:1.3,ease:'power3.inOut'},7.2);
    this.timeline.to([chassis,engine],{alpha:0,duration:.5},6.3);
    const full=this.sprite('ignis',this.carArt,{alpha:0});this.timeline.to(full,{alpha:1,duration:.1},8.5);
    this.weldRange=[8.5,9.2];this.timeline.to(this.state,{weld:1,duration:.7,ease:'none'},8.5);
    if(this.result.success)this.timeline.to(this.carGroup,{x:-44,y:20,duration:1.9,ease:'power2.inOut'},11.4);
    const point=(x,y)=>({x:a.x+x*a.scale,y:a.y+y*a.scale});
    this.impacts=[{at:1.9,x:533,y:690},{at:3.35,x:m.engine[0]+85,y:m.engine[1]+66},...m.wheels.map(w=>({at:w.at+1.2,...point(w.cx,w.cy)})),{at:6.85,x:710,y:604},{at:8.5,...point(1060,263)}];
    this.cues=this.impacts.map(p=>({name:'lock',at:p.at,gain:.14,length:.6}));
    this.cues.push({name:'driver',at:8.5,gain:.12,length:.7},{name:this.result.success?'ignition':'failure',at:10.3,gain:.2,length:3});
  }
  resize(){
    if(!this.app?.renderer||this.disposed)return;const{width:w,height:h}=this.host.getBoundingClientRect();if(!w||!h)return;
    this.app.renderer.resize(w,h);if(!this.world)return;
    const b=this.background.texture;const cover=Math.max(w/b.width,h/b.height);this.background.scale.set(cover);this.background.position.set((w-b.width*cover)/2,(h-b.height*cover)/2);
    const narrow=w/h<1.2,virtualWidth=narrow?(this.mode==='suit'?780:1280):1440;
    this.world.scale.set(Math.min(w/virtualWidth,h/900));this.world.position.set(w/2,h/2);
    this.render();
  }
  // Machined robotic arms: segmented dark bodies, brass bearings and a lit
  // end-effector. The endpoint follows each actual assembly joint, not a timer.
  arm(g,side,tx,ty,amount){
    const rig=this.armRigs[side];rig.rig.alpha=clamp(amount*3)*.8;
    if(amount<=0)return;const bx=side==='left'?90:1350,by=605,elbowX=side==='left'?300:1140,ey=350;
    tx=bx+(tx-bx)*amount;ty=by+(ty-by)*amount;
    const fit=(s,x1,y1,x2,y2)=>{s.position.set(x1,y1);s.rotation=Math.atan2(y2-y1,x2-x1);s.scale.set(Math.hypot(x2-x1,y2-y1)/(s.texture.width*.84));};
    fit(rig.upper,bx,by,elbowX,ey);fit(rig.lower,elbowX,ey,tx,ty);
    rig.grip.position.set(tx,ty);rig.grip.scale.set(.1);rig.grip.rotation=side==='left'?.22:Math.PI-.22;
  }
  spark(g,x,y,age,seed=0,amount=1){
    if(age<0||age>.58||this.reducedMotion)return;
    for(let i=0;i<18;i++){
      const a=(i*2.399+seed)*1.03,speed=45+(i*31%100),d=age*speed*2.8;
      const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d+age*age*190;
      g.moveTo(px,py).lineTo(px-Math.cos(a)*(5+age*8),py-Math.sin(a)*6).stroke({width:i%4?1.3:2.2,color:i%3?0xf6b656:0xffe9b9,alpha:(1-age/.58)*amount});
    }
    if(age<.16)g.circle(x,y,3+9*(1-age/.16)).fill({color:0xffe8b5,alpha:(1-age/.16)*.8});
  }
  drawMachines(t){
    const g=this.machine;g.clear();const e=this.foreground;e.clear();
    const assembling=t>.2&&t<10.2;let extension=assembling?Math.min(clamp((t-.2)/.7),clamp((10.2-t)/.8)):0;
    if(this.reducedMotion)extension=0;
    const recent=this.impacts.findLast(p=>p.at<t+.9)||this.impacts[0];
    const tx=recent.x,ty=recent.y;
    this.arm(g,'left',Math.min(tx,740)-15,ty,extension);this.arm(g,'right',Math.max(tx,755)+18,ty-25,extension);
    if(this.mode==='vehicle'&&t>=2&&t<6.9){
      const alpha=Math.min(clamp((t-2)*3),clamp((6.9-t)*4));const yy=t<3.35?-80+409*clamp((t-2)/1.35):329;
      g.rect(650,95,360,14).fill({color:0x54514b,alpha});
      g.moveTo(810,109).lineTo(810,Math.min(yy+48,330)).stroke({width:2,color:0x998363,alpha});
      g.moveTo(885,109).lineTo(885,Math.min(yy+58,340)).stroke({width:2,color:0x998363,alpha});
    }
    if(this.mode==='suit'){
      const a=.35*(1-this.state.gate);
      const left=this.suitBounds?.left||562,right=this.suitBounds?.right||906;
      g.roundRect(left,145,23,612,4).fill({color:0x111a1c,alpha:a});g.roundRect(right,145,23,612,4).fill({color:0x111a1c,alpha:a});
      for(const y of[238,445,706]){g.rect(left-5-this.state.gate*100,y,70,10).fill({color:0x8b7d61,alpha:a});g.rect(right-40+this.state.gate*100,y,70,10).fill({color:0x8b7d61,alpha:a});}
    }
  }
  drawEffects(t){
    const g=this.fx;g.clear();this.glow.clear();
    for(const p of this.impacts)this.spark(g,p.x,p.y,t-p.at,p.at);
    if(this.mode==='vehicle'&&t>=this.weldRange[0]&&t<this.weldRange[1]){
      const u=(t-this.weldRange[0])/(this.weldRange[1]-this.weldRange[0]),[start,end]=this.model.weld||[[435,634],[1075,569]],x=start[0]+u*(end[0]-start[0]),y=start[1]+u*(end[1]-start[1]);
      g.moveTo(...start).lineTo(x,y).stroke({width:1,color:0xf8d69a,alpha:.6});
      this.spark(g,x,y,(t*7%1)*.35,3);this.glow.circle(x,y,21).fill({color:0xf7bb6e,alpha:.65});
    }
    if(t>=this.scanStart&&t<10.15){
      const u=this.state.scan,sy=140+u*625,left=this.mode==='suit'?(this.suitBounds?.left||575):(this.modelKey==='ignis'?220:290),right=this.mode==='suit'?(this.suitBounds?.right||907):(this.modelKey==='ignis'?1230:1200);
      g.rect(left,sy,right-left,1).fill({color:0xbbe0df,alpha:.7});g.rect(left,sy-16,right-left,16).fill({color:0xa5ced0,alpha:.05});
      for(const x of[left,right]){g.moveTo(x,sy-11).lineTo(x,sy+11).stroke({width:2,color:0xc9efea,alpha:.8});}
    }
    // Reactor ignition is a restrained local bloom, never full-screen strobing.
    if(t>=10.3){
      const q=clamp((t-10.3)/.65),success=this.result.success,c=success?this.model.color:0xda603f;
      const pulse=this.reducedMotion?0:Math.sin((t-10.3)*1.3)*.035;
      if(this.mode==='suit'){
        const {x,y}=this.corePoint,legacy=this.modelKey==='h';this.glow.circle(x,y,legacy?25+q*20:21+q*17).fill({color:legacy&&success?0xffa82e:c,alpha:(.18+q*.24+pulse)});
        g.circle(x,y,legacy?6:5).fill({color:success?(legacy?0xffe8ad:0xe2faff):c,alpha:q*.9});
        if(success&&this.modelKey==='h'){g.moveTo(716,196).lineTo(733,204).moveTo(778,200).lineTo(790,190).stroke({width:2,color:0xffc17a,alpha:q});}
      }else{
        const dx=this.carGroup.x,dy=this.carGroup.y,lights=this.model.lights||[[365,580],[584,594]];
        for(const [x,y]of lights)this.glow.ellipse(x+dx,y+dy,40,12).fill({color:c,alpha:q*.35});
        if(success&&this.modelKey==='ignis'){
          const [nx,ny]=this.model.nozzle,x=nx+dx,y=ny+dy,len=(105+Math.sin(t*9)*8)*q;
          this.glow.ellipse(x+len*.42,y,len*.65,19).fill({color:0xff592f,alpha:.22*q});
          g.moveTo(x,y-8).bezierCurveTo(x+len*.4,y-18,x+len*.7,y+7,x+len,y).bezierCurveTo(x+len*.65,y+14,x+len*.3,y+16,x,y+8).closePath().fill({color:0xff7944,alpha:.6*q});
          g.moveTo(x,y-4).lineTo(x+len*.65,y).lineTo(x,y+4).closePath().fill({color:0xffefd0,alpha:.78*q});
        }else if(success)g.poly([347+dx,565+dy,70+dx,650+dy,80+dx,718+dy,355+dx,593+dy]).fill({color:0xc5e6df,alpha:q*.065});
      }
    }
    if(!this.reducedMotion){
      // Bounded deterministic airborne motes; no secondary ticker or random roll.
      for(let i=0;i<28;i++){const x=150+(i*137%1150),y=110+(i*91+t*(6+i%5))%650;g.circle(x,y,i%4===0?1.2:.65).fill({color:0xd1ba91,alpha:.12+(i%3)*.035});}
    }
  }
  render(){
    if(this.disposed||!this.world||!this.timeline)return;
    const t=this.timeline.time();this.camera.scale.set(this.reducedMotion?1:this.state.camera);
    this.drawMachines(t);this.drawEffects(t);this.background.alpha=.76+this.state.light*.13;
    this.app.renderer.render(this.app.stage);
    if(!this.timeline.paused()&&t<DURATION&&this.audio.enabled)this.audio.sync(t,this.rate,this.cues);
    this.onUpdate?.(this.diagnostics());
  }
  play(){if(this.disposed)return;this.audio.stop();if(this.reducedMotion){this.seek(DURATION);return;}this.timeline.restart();this.timeline.timeScale(this.rate);this.audio.schedule(0,this.rate,this.cues);}
  pause(){this.timeline?.pause();this.audio.stop();this.render();}
  resume(){if(this.reducedMotion)return;this.timeline?.resume();this.audio.schedule(this.timeline.time(),this.rate,this.cues);this.render();}
  seek(t){this.timeline?.pause().seek(Math.max(0,Math.min(DURATION,Number(t)||0)),true);this.audio.stop();this.render();}
  skip(){this.seek(DURATION);}
  setRate(rate){this.rate=[.5,1,2].includes(Number(rate))?Number(rate):1;this.timeline?.timeScale(this.rate);this.audio.stop();this.render();}
  setReducedMotion(value){this.reducedMotion=Boolean(value);if(this.reducedMotion)this.skip();else this.render();}
  async setSound(value){if(value)await this.audio.enable();else{this.audio.enabled=false;this.audio.stop();}this.render();return this.audio.enabled;}
  diagnostics(){const t=this.timeline?.time()||0;return {mode:this.mode,model:this.modelKey,modelName:this.model?.name,modelCode:this.model?.code||null,authoredPartCount:this.renderedParts?.length||0,time:t,duration:DURATION,phase:phaseAt(this.mode,t,this.result?.success,this.modelKey),success:this.result?.success,playing:!!this.timeline&&!this.timeline.paused()&&t<DURATION,complete:t>=12,finished:t>=DURATION,progress:t/DURATION,rate:this.rate,reducedMotion:this.reducedMotion,activeTimelines:this.timeline?1:0,pixiTickerRunning:this.app?.ticker?.started||false,sceneChildren:this.camera?.children.length||0,generation:this.generation,audioEnabled:this.audio.enabled,audioError:this.audio.error,apiMutations:0,disposed:this.disposed};}
  destroy(){if(this.disposed)return;this.disposed=true;this.timeline?.kill();this.timeline=null;this.audio.destroy();this.observer?.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.app?.destroy(true,{children:true,texture:false,textureSource:false});}
}
