import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
const ROOT='/preview/mercenary-limited-sd-skills-20261003-v1/',doc=parent.document,$=id=>doc.getElementById(id),DURATION=3.6;
const url=p=>p.startsWith('/')?p:ROOT+p,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let engine,unit,target,manifest,active,clock={time:0},timeline,registration,disposed=false,speed=1,effectsEnabled=true,auraEnabled=true,anchorsEnabled=false;
let body,aura,charge,release,impact,guides,actor,front,back,loaded={},auraTextures=[],diagnostic={};
const duration=()=>active?.effects?DURATION:(manifest?.aura.loopSeconds||2.4);
const textureFrames=(t,frames)=>frames.map(f=>new Texture({source:t.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
function stopTimeline(){if(registration)engine.simpleTimelines.delete(registration);timeline?.kill();timeline=null;registration=null;}
function makeTimeline(){stopTimeline();timeline=gsap.timeline({paused:true,repeat:active?.effects?0:-1,onUpdate:()=>render(clock.time),onComplete:()=>{engine.simpleTimelines.delete(registration);update();}}).to(clock,{time:duration(),duration:duration(),ease:'none'}).timeScale(speed);registration={instance:timeline,settle:()=>cancel()};}
function play(){if(!timeline)makeTimeline();if(clock.time>=duration())seek(0);engine.simpleTimelines.add(registration);timeline.play();update();}
function pause(){timeline?.pause();update();}
function seek(t){if(!timeline)makeTimeline();timeline.pause().time(clamp(t,0,duration()),true);clock.time=clamp(t,0,duration());render(clock.time);}
function cancel(){stopTimeline();clock.time=0;render(0);update();}
function update(){const playing=Boolean(timeline&&!timeline.paused()&&clock.time<duration());$('play').textContent=playing?'일시정지':'재생';$('seek').max=duration();$('seek').value=clock.time;$('time').textContent=clock.time.toFixed(2)+' / '+duration().toFixed(2)+'s';$('health').textContent=JSON.stringify(diagnostic,null,2);}
function configure(){
 const c=active,s=loaded[c.id],sw=engine.scene.width,sh=engine.scene.height;
 const H=Math.min(sh*(engine.mobile?.30:.43),sw*(engine.mobile?.48:.30))*.70;
 const S=H/c.bodyHeight;
 const x=sw*(engine.mobile?.25:.31),y=sh*(engine.mobile?.61:.64);
 actor.position.set(x,y);body.texture=s.body;body.anchor.set(c.feet.x/c.spriteWidth,c.feet.y/c.spriteHeight);body.scale.set(S);
 actor.visible=true;
 const point=p=>({x:x+(p.x-c.feet.x)*S,y:y+(p.y-c.feet.y)*S});
 const emission=c.emission?point(c.emission):null,center=point(c.auraCenter);
 aura.position.set(center.x,center.y);aura.tint=Number.parseInt(c.auraTint.slice(1),16);
 aura.scale.set(H*c.auraScale*1.65/auraTextures[0].width);
 const length=H*(engine.mobile?.7:1.05),origin=emission?{x:emission.x+c.direction.x*H*.018,y:emission.y+c.direction.y*H*.018}:null;
 const hit=origin?{x:origin.x+c.direction.x*length,y:origin.y+c.direction.y*length}:null;
 if(target){target.root.visible=Boolean(hit);if(hit){target.root.alpha=1;target.view.alpha=1;target.view.visible=true;target.root.position.set(hit.x,y);const tb=target.view.getLocalBounds();const torsoHeight=-(tb.y+tb.height*.38);target.root.scale.set((y-hit.y)/Math.max(1,torsoHeight));target.view.x=0;}}
 engine.camera.reset(true);
 // Frame the full actor, aura and target using the existing V3 camera. No alternate renderer.
 const left=Math.min(x+(0-c.feet.x)*S,center.x-H*c.auraScale*.56),right=hit?hit.x+H*.42:x+(c.spriteWidth-c.feet.x)*S;
 const top=Math.min(y-H,center.y-H*c.auraScale*.5);
 const zoom=1;
 // Keep the V3 parallax camera at its native full-bleed viewport. Fit sprite height instead.
 return{H,S,x,y,point,origin,emission,hit,center,zoom};
}
function placeFx(sprite,key,index,p,width,angle=0){
 const c=active,frame=c.effects.frames[index],tex=loaded[c.id].effects[index];
 sprite.texture=tex;sprite.anchor.set(frame.origin.x/tex.width,frame.origin.y/tex.height);
 sprite.position.set(p.x,p.y);sprite.scale.set(width/tex.width);sprite.rotation=angle;sprite.alpha=1;sprite.visible=true;sprite.blendMode='add';
}
function render(t){
 if(disposed||!active||!body)return;
 const c=active,p=configure(),progress=t/DURATION;
 const ai=Math.floor((t%manifest.aura.loopSeconds)/manifest.aura.loopSeconds*auraTextures.length)%auraTextures.length;
 aura.texture=auraTextures[ai];aura.anchor.set(.5);aura.alpha=1;aura.blendMode='add';aura.visible=auraEnabled;
 charge.visible=release.visible=impact.visible=false;guides.clear();
 let phase=c.effects?'오라 · 대기':'기존 SSS · 붉은 오라',effectFrame=null;
 if(c.effects&&effectsEnabled){
   if(t>=.38&&t<1.08){const f=Math.min(3,Math.floor((t-.38)/.7*4));placeFx(charge,'charge',f,p.origin,p.H*(c.type==='cannon'?.33:.23));phase='충전';effectFrame=f;}
   if(t>=1.08&&t<1.7){
     const f=4+Math.min(3,Math.floor((t-1.08)/.62*4));
     // The texture's authored emission point is anchored just ahead of the muzzle/palm.
     // Uniform scale + rigid rotation preserves the muzzle axis; no axis bending or ray teleport.
     const gap=Math.hypot(p.hit.x-p.origin.x,p.hit.y-p.origin.y),originFrac=c.effects.frames[f].origin.x/c.effects.frames[f].rect.width;
     const width=gap/(.89-originFrac);
     placeFx(release,'release',f,p.origin,width,c.angle);phase='발사';effectFrame=f;
   }
   if(t>=1.68&&t<2.65){
     const f=8+Math.min(3,Math.floor((t-1.68)/.97*4));placeFx(impact,'impact',f,p.hit,p.H*(c.type==='cannon'?.84:.65));phase=f===11?'잔향':'적중';effectFrame=f;
   }
   if(t>=2.65)phase='효과 소멸 · 오라 유지';
 }
 if(anchorsEnabled&&p.emission){
   const axis=p.point(c.axisBack);guides.moveTo(axis.x,axis.y).lineTo(p.hit.x,p.hit.y).stroke({width:1.5,color:0x82fff1,alpha:.8});
   guides.circle(p.emission.x,p.emission.y,4).stroke({width:1.5,color:0xffffff});guides.circle(p.origin.x,p.origin.y,3).fill(0xffcb72);
 }
 const lateral=p.origin&&p.emission?Math.abs((p.origin.x-p.emission.x)*c.direction.y-(p.origin.y-p.emission.y)*c.direction.x):0;
 diagnostic={character:c.name,code:c.code,rank:c.rank,time:t,body:'static image preview; motion not claimed',aura:{enabled:auraEnabled,frame:ai,behindCharacter:true,color:c.auraTint},effectFrame,visibleSkillEffects:[charge,release,impact].filter(x=>x.visible).length,emission:p.emission,forwardOrigin:p.origin,axisLateralError:lateral,shotAngleDegrees:c.angle?c.angle*180/Math.PI:0,singleClock:true,registeredTimelines:registration&&engine.simpleTimelines.has(registration)?1:0,liveEnabled:false};
 $('phase').textContent=phase;update();
}
async function select(id){
 pause();active=manifest.characters.find(c=>c.id===id)||manifest.characters[0];
 if(!loaded[active.id]){
   const c=active,bodyTex=await Assets.load(url(c.sprite)),fxTex=c.effects?await Assets.load(url(c.effects.url)):null;
   loaded[c.id]={body:bodyTex,effects:fxTex?textureFrames(fxTex,c.effects.frames):[]};
 }
 parent.selectGallery?.(active.id);clock.time=0;makeTimeline();render(0);
 $('play').disabled=false;$('restart').disabled=false;
}
async function boot(){
 const [m,payload]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-live-v1/fixture.json').then(r=>r.json())]);manifest=m;window.cnineCardCatalog=()=>payload.cards;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'리미티드 리소스 검수',opponentName:payload.monster.name});await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'리미티드'});}finally{api.mountForBattle=mount;}
 await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();engine.accountBattleUnitIsPaused=()=>true;
 unit=engine.accountBattleUnit;target=engine.enemies[0];if(!unit||!target)throw Error('V3 support actor missing');
 unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.root.visible=false;
 for(const ally of engine.allies)ally.root.visible=false;
 for(const enemy of engine.enemies){enemy.stopIdle?.();enemy.root.visible=enemy===target;}
 const auraTex=await Assets.load(url(m.aura.url));auraTextures=textureFrames(auraTex,m.aura.frames);
 back=new Container({label:'LimitedRearAura'});engine.backgroundLayer.addChild(back);aura=new Sprite();back.addChild(aura);
 actor=new Container({label:'LimitedSDImageReview'});engine.combatLayer.addChild(actor);body=new Sprite();actor.addChild(body);
 front=new Container({label:'LimitedSkillImageReview'});engine.effectLayer.addChild(front);charge=new Sprite();release=new Sprite();impact=new Sprite();guides=new Graphics();front.addChild(charge,release,impact,guides);
 for(const e of [back,actor,front])e.eventMode='none';
 const review={engine,manifest,select,play,pause,seek,cancel,setSpeed:n=>{speed=Number(n);timeline?.timeScale(speed);},setAura:v=>{auraEnabled=v;render(clock.time);},setEffects:v=>{effectsEnabled=v;render(clock.time);},setAnchors:v=>{anchorsEnabled=v;render(clock.time);},diagnostics:()=>diagnostic,dispose:()=>{cancel();disposed=true;back.destroy({children:true});actor.destroy({children:true});front.destroy({children:true});engine.destroy();}};
 window.LimitedReview=parent.LimitedReview=review;
 $('play').onclick=()=>timeline&&!timeline.paused()?pause():play();$('restart').onclick=()=>{seek(0);play();};$('cancel').onclick=cancel;$('seek').oninput=()=>seek(Number($('seek').value));$('speed').onchange=()=>review.setSpeed($('speed').value);$('aura').onchange=()=>review.setAura($('aura').checked);$('effects').onchange=()=>review.setEffects($('effects').checked);$('anchors').onchange=()=>review.setAnchors($('anchors').checked);
 for(const el of doc.querySelectorAll('.controls input,.controls select,.controls button,#seek'))el.disabled=false;
 await select(new URL(parent.location.href).searchParams.get('character')||'bongsoon');if(active.preserveExisting)play();$('status').textContent='신규 SD 5종 · 스킬 이미지 60프레임 · 승인 베르칸 SD 보존 · 후광 오라 8프레임';
 engine.app.renderer.on('resize',()=>{pause();render(clock.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(e=>{$('status').textContent='준비 실패: '+e.message;$('health').textContent=e.stack;console.error(e);});
