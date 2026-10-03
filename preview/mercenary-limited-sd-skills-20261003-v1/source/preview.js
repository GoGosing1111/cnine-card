import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {approvedLimitedSpriteScale,LIMITED_AURA_WIDTH_MULTIPLIER} from '../display-policy.mjs';
import {KnightFX,loadKnightAssets} from '../../mercenary-crimson-silver-knight-battle-v1/source/KnightFX.js';
import {makePlan as valterPlan} from '../../mercenary-crimson-silver-knight-battle-v1/skill.mjs';
const ROOT='/preview/mercenary-limited-sd-skills-20261003-v1/',doc=parent.document,$=id=>doc.getElementById(id),DURATION=3.6;
const url=p=>p.startsWith('/')?p:ROOT+p,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let engine,merc,target,manifest,active,clock={time:0},timeline,registration,disposed=false,speed=1,effectsEnabled=true,auraEnabled=true,anchorsEnabled=false;
let body,aura,charge,release,impact,guides,actor,front,back,loaded={},auraTextures=[],diagnostic={};
let valterFx,valterManifest,valterAssets;
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
 const c=active,s=loaded[c.id],S=approvedLimitedSpriteScale(valterManifest,c.bodyHeight),textureHeight=c.originalSprite.height*S,bodyHeight=c.bodyHeight*S;
 body.texture=s.body;body.anchor.set(c.feet.x/c.spriteWidth,c.feet.y/c.spriteHeight);body.scale.set(S);body.visible=true;
 merc.fullBodyHeight=textureHeight;merc.rig.root.visible=false;merc.hud.y=-(bodyHeight+118);
 actor.visible=true;
 const point=p=>engine.effectLayer.toLocal(merc.view.toGlobal({x:(p.x-c.feet.x)*S,y:(p.y-c.feet.y)*S}));
 const foot=point(c.feet),head=point({x:c.feet.x,y:c.headTop}),H=foot.y-head.y,x=foot.x,y=foot.y;
 const emission=c.emission?point(c.emission):null,center=point(c.auraCenter);
 aura.position.set((c.auraCenter.x-c.feet.x)*S,(c.auraCenter.y-c.feet.y)*S);aura.tint=Number.parseInt(c.auraTint.slice(1),16);
 aura.scale.set(bodyHeight*c.auraScale*LIMITED_AURA_WIDTH_MULTIPLIER/auraTextures[0].width);
 // Portrait reflows enemies into rows; use the nearest occupied station on our row.
 target=engine.enemies.filter(a=>a.root.visible&&a.battleActive!==false).slice().sort((a,b)=>(Math.abs(a.baseY-actor.y)-Math.abs(b.baseY-actor.y))||(a.baseX-b.baseX))[0];
 const targetFoot=target?engine.effectLayer.toLocal(target.root.toGlobal({x:0,y:0})):null;
 const origin=emission?{x:emission.x+c.direction.x*H*.018,y:emission.y+c.direction.y*H*.018}:null;
 const length=origin&&targetFoot?Math.max(H,(targetFoot.x-origin.x)/c.direction.x):H;
 const hit=origin?{x:origin.x+c.direction.x*length,y:origin.y+c.direction.y*length}:null;
 engine.camera.reset(true);
 const zoom=1;
 // Existing V3 formation owns position and responsive scale, exactly as it does for the five cards.
 return{H,S,x,y,point,origin,emission,hit,center,zoom,bodyHeight,textureHeight};
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
 if(valterFx){
   const show=c.id==='valter';valterFx.layer.visible=show;valterFx.aura.visible=show&&auraEnabled;
   if(show){
     // Reuse the approved V17 renderer, including silhouette glow, rim, aura atlas,
     // ground ring and rising particles. It follows this preview's existing clock.
     valterFx.bodyHeight=p.bodyHeight;valterFx.start={x:merc.baseX,y:merc.baseY};valterFx.auraEnabled=auraEnabled;valterFx.clock.time=t;valterFx.render(t);
   }
 }
 charge.visible=release.visible=impact.visible=false;guides.clear();
 let phase=c.effects?'오라 · 대기':'기존 SSS · 붉은 오라',effectFrame=null;
 if(c.effects&&effectsEnabled){
   if(t>=.38&&t<1.08){const f=Math.min(3,Math.floor((t-.38)/.7*4));placeFx(charge,'charge',f,p.origin,p.H*(c.type==='cannon'?.33:.23));phase='충전';effectFrame=f;}
   if(t>=1.08&&t<1.7){
     const f=4+Math.min(3,Math.floor((t-1.08)/.62*4));
     // The texture's authored emission point is anchored just ahead of the muzzle/palm.
     // Uniform scale + rigid rotation preserves the muzzle axis; no axis bending or ray teleport.
     const q=clamp((t-1.08)/.62,0,1),position={x:p.origin.x+(p.hit.x-p.origin.x)*q,y:p.origin.y+(p.hit.y-p.origin.y)*q};
     placeFx(release,'release',f,position,p.H*(c.type==='cannon'?1.6:1.25),c.angle);phase='발사';effectFrame=f;
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
 const station=engine.station('mercenaries',0,'ALLY');
 diagnostic={character:c.name,code:c.code,rank:c.rank,time:t,body:'static image preview; motion not claimed',formation:{bodyHeight:p.bodyHeight,textureHeight:p.textureHeight,sizePolicy:'APPROVED_VALTER_V17_BODY_HEIGHT',referenceBodyHeight:valterManifest.displaySizing.bodyHeight,referenceTextureHeight:valterManifest.displaySizing.fullBodyHeight,station,foot:{x:actor.x,y:actor.y},scale:actor.scale.x,regularScale:engine.allies[0].root.scale.x,regularTextureHeight:engine.allies[0].fullBodyHeight,visibleAllies:engine.allies.filter(a=>a.root.visible).length},aura:{enabled:auraEnabled,frame:ai,behindCharacter:true,color:c.auraTint,widthToBody:c.auraScale*LIMITED_AURA_WIDTH_MULTIPLIER,approvedValterFx:c.id==='valter'&&valterFx?{source:'APPROVED_V17_KnightFX',silhouetteCopies:18,filters:valterFx.auraFilters.length,auraFrames:valterManifest.effects.aura.frameCount,risingParticles:valterFx.pool.filter(s=>s.visible).length,enabled:valterFx.aura.visible,independentClock:!!valterFx.timeline}:null},effectFrame,visibleSkillEffects:[charge,release,impact].filter(x=>x.visible).length,emission:p.emission,forwardOrigin:p.origin,axisLateralError:lateral,shotAngleDegrees:c.angle?c.angle*180/Math.PI:0,singleClock:true,registeredTimelines:registration&&engine.simpleTimelines.has(registration)?1:0,liveEnabled:false};
 $('phase').textContent=phase;update();
}
async function select(id){
 pause();active=manifest.characters.find(c=>c.id===id)||manifest.characters[0];
 if(valterFx){valterFx.layer.visible=false;valterFx.aura.visible=false;}
 if(!loaded[active.id]){
   const c=active,bodyTex=await Assets.load(url(c.sprite)),fxTex=c.effects?await Assets.load(url(c.effects.url)):null;
   loaded[c.id]={body:bodyTex,effects:fxTex?textureFrames(fxTex,c.effects.frames):[]};
 }
 merc.name=active.name;merc.nameLabel.text=active.name;merc.art={code:active.code};
 engine.setFormationMercenaries([merc]);engine.sortCombatDepth();
 if(active.id==='valter'&&!valterFx){
   valterAssets=await loadKnightAssets(valterManifest);
   configure();valterFx=new KnightFX(engine,merc,[target],valterAssets,valterManifest,valterPlan({mode:'aura'}));
   valterFx.removeTimeline(); // No second animation clock or automatic skill playback.
 }
 parent.selectGallery?.(active.id);clock.time=0;makeTimeline();render(0);
 $('play').disabled=false;$('restart').disabled=false;
}
async function boot(){
 const [m,catalogs,approvedValter]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>fetch('/assets/ui/project-v/characters/'+p).then(r=>r.json()))),fetch('/preview/mercenary-crimson-silver-knight-battle-v1/manifest.json').then(r=>r.json())]);manifest=m;valterManifest=approvedValter;
 const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
 const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
 const deck=ids.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
 const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};window.cnineCardCatalog=()=>deck;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'PVP',playerName:'리미티드 전투 배치',opponentName:'크기 비교'});await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'PVP',playerName:'리미티드'});}finally{api.mountForBattle=mount;}
 await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();engine.accountBattleUnitIsPaused=()=>true;
 target=engine.enemies[1];if(!target)throw Error('V3 target missing');
 engine.accountBattleUnit?.cancelFire();engine.accountBattleUnit?.stopIdle();
 if(engine.accountBattleUnit)engine.accountBattleUnit.root.visible=false;
 for(const a of [...engine.allies,...engine.enemies]){a.stopIdle?.();a.root.visible=true;}
 const auraTex=await Assets.load(url(m.aura.url));auraTextures=textureFrames(auraTex,m.aura.frames);
 merc=new BattleCharacter({id:'LIMITED_IMAGE_REVIEW',name:'리미티드',team:TEAM.ALLY,fullBodyHeight:260,accent:0xf16c78});merc.animationController.kill();
 actor=merc.root;engine.combatLayer.addChild(actor);body=merc.fullBodySprite;body.visible=true;merc.rig.root.visible=false;
 back=new Container({label:'LimitedRearAura',zIndex:5});merc.view.addChild(back);aura=new Sprite();back.addChild(aura);
 front=new Container({label:'LimitedSkillImageReview'});engine.effectLayer.addChild(front);charge=new Sprite();release=new Sprite();impact=new Sprite();guides=new Graphics();front.addChild(charge,release,impact,guides);
 for(const e of [back,actor,front])e.eventMode='none';
 const review={engine,manifest,select,play,pause,seek,cancel,setSpeed:n=>{speed=Number(n);timeline?.timeScale(speed);},setAura:v=>{auraEnabled=v;render(clock.time);},setEffects:v=>{effectsEnabled=v;render(clock.time);},setAnchors:v=>{anchorsEnabled=v;render(clock.time);},diagnostics:()=>diagnostic,dispose:()=>{cancel();disposed=true;valterFx?.destroy();merc.destroy();front.destroy({children:true});engine.destroy();}};
 window.LimitedReview=parent.LimitedReview=review;
 $('play').onclick=()=>timeline&&!timeline.paused()?pause():play();$('restart').onclick=()=>{seek(0);play();};$('cancel').onclick=cancel;$('seek').oninput=()=>seek(Number($('seek').value));$('speed').onchange=()=>review.setSpeed($('speed').value);$('aura').onchange=()=>review.setAura($('aura').checked);$('effects').onchange=()=>review.setEffects($('effects').checked);$('anchors').onchange=()=>review.setAnchors($('anchors').checked);
 for(const el of doc.querySelectorAll('.controls input,.controls select,.controls button,#seek'))el.disabled=false;
 await select(new URL(parent.location.href).searchParams.get('character')||'valter');if(active.preserveExisting)play();$('status').textContent='신규 SD 5종 · 스킬 이미지 60프레임 · 승인 발테르 SD 보존 · 후광 오라 8프레임';
 engine.app.renderer.on('resize',()=>{pause();render(clock.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(e=>{$('status').textContent='준비 실패: '+e.message;$('health').textContent=e.stack;console.error(e);});
