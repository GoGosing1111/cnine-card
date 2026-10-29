import {mountRewardRevealButton,mountRewardRevealInbox} from '/js/content-reward-reveal-v1.mjs?v=20261016-reveal1';
// Generated from reviewed presentation, battle, mechanics and client sources.
import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {createMadaraCombatScreen} from './combat-screen.mjs?v=20261013-fullscreen1';
export function createMadaraScope(root){
  const nativeWindow=globalThis.window,nativeDocument=nativeWindow.document,surface=root.querySelector('#madara-live-app')||root,globals={},events=[],timers=new Set(),frames=new Set(),controllers=new Set();let stopped=false,roomId='';
  globals.MadaraCombatScreen=createMadaraCombatScreen(surface);
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);events.push([target,type,fn,options]);};
  const document=new Proxy(nativeDocument,{get(target,key){
    if(key==='getElementById')return name=>surface.querySelector('[data-madara-id="'+CSS.escape(name)+'"]');
    if(key==='querySelector'||key==='querySelectorAll')return surface[key].bind(surface);
    if(key==='addEventListener')return (type,fn,options)=>listen(target,type,fn,options);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const window=new Proxy(nativeWindow,{get(target,key){if(key==='document')return document;if(key in globals)return globals[key];if(key==='addEventListener')return(type,fn,options)=>listen(target,type,fn,options);const value=Reflect.get(target,key,target);return ['scrollTo','scrollBy','matchMedia'].includes(key)?value.bind(target):value;},set(target,key,value){globals[key]=value;return true;}});
  const setTimeout=(fn,ms)=>{if(stopped)return 0;const timer=nativeWindow.setTimeout(()=>{timers.delete(timer);if(!stopped)fn();},ms);timers.add(timer);return timer;};
  const clearTimeout=timer=>{timers.delete(timer);nativeWindow.clearTimeout(timer);};
  const requestAnimationFrame=fn=>{if(stopped)return 0;const frame=nativeWindow.requestAnimationFrame(t=>{frames.delete(frame);if(!stopped)fn(t);});frames.add(frame);return frame;};
  async function fetch(input,options={}){
    if(stopped)throw new DOMException('레이드 화면이 닫혔습니다.','AbortError');
    const url=new URL(input,location.origin);
    if(!url.pathname.startsWith('/__madara/'))return nativeWindow.fetch(input,options);
    const route=url.pathname.split('/').at(-1),query=new URLSearchParams({since:url.searchParams.get('since')||'0'});
    if(url.searchParams.has('payload'))query.set('payload','1');
    const body=options.body?JSON.parse(options.body):null;let path=route,data;
    if(route==='session')path='lobby';
    else if(route==='state'){if(roomId)query.set('roomId',roomId);}
    else if(body){
      data={requestId:body.requestId||crypto.randomUUID()};
      if(route!=='create')data.roomId=route==='join'?String(body.code||'').trim().toUpperCase():roomId;
      if(['create','join'].includes(route))data.role=body.role;
      if(['create','join','ready','start'].includes(route))data.clientRulesVersion=2;
      if(route==='ready')data.ready=body.ready;
      if(route==='kick')data.targetId=body.targetId;
      if(route==='action')for(const key of ['actorId','action','taskId','token','target'])if(body[key]!==undefined)data[key]=body[key];
    }
    const controller=new AbortController();controllers.add(controller);
    try{
      const value=await jointAccountRequest('raid/madara/'+path+'?'+query,{method:data?'POST':'GET',body:data,signal:controller.signal,timeoutMs:20000});
      if(stopped)throw new DOMException('레이드 화면이 닫혔습니다.','AbortError');
      if(value.roomId)roomId=value.roomId;
      else if(value.account?.roomId)roomId=value.account.roomId;
      if(route==='leave')roomId='';
      if(route==='session')value.token='live-'+value.account.id;
      if(value.state?.status==='CANCELLED')value.state.status='FAILED';
      return Response.json(value);
    }catch(error){if(error.status){const code=error.code==='MADARA_KICKED'?'KICKED':error.code;return Response.json({error:error.message,code,retryable:error.retryable},{status:error.status});}throw error;}
    finally{controllers.delete(controller);}
  }
  return {window,document,fetch,setTimeout,clearTimeout,requestAnimationFrame,destroy(){stopped=true;for(const c of controllers)c.abort();for(const t of timers)nativeWindow.clearTimeout(t);for(const f of frames)nativeWindow.cancelAnimationFrame(f);for(const [target,type,fn,options]of events)target.removeEventListener(type,fn,options);globals.MadaraBattle?.teardown();surface.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());globals.MadaraCombatScreen.destroy();}};
}

export function mountMadara(root){
 const revealLifecycle=new AbortController();mountRewardRevealInbox(root,{signal:revealLifecycle.signal});
 const scope=createMadaraScope(root);const {window,document,fetch,setTimeout,clearTimeout,requestAnimationFrame}=scope;
/* Authored body frames and five independent VFX atlases, driven only by the installed V3 GSAP clock. */
(()=>{
  const ROOT='/preview/madara-raid-v1/',clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  let loading=null,assets=null;
  async function preload(){
    if(assets)return assets;if(loading)return loading;
    loading=(async()=>{
      const response=await fetch(ROOT+'assets/presentation-manifest.json');if(!response.ok)throw new Error('연출 매니페스트를 읽지 못했습니다.');
      const manifest=await response.json(),rt=window.ProjectVPixiBattle.fxRuntime,frames={};
      await Promise.all(Object.entries(manifest.atlases).map(async([key,spec])=>{
        if(key==='cast')return; // The live actor now owns the approved original-IP body.
        const atlas=await rt.Assets.load(ROOT+spec.url);
        frames[key]=spec.frames.map(f=>new rt.Texture({source:atlas.source,frame:new rt.Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
      }));return assets={manifest,frames};
    })();try{return await loading;}catch(error){loading=null;throw error;}
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
  window.MadaraPresentation={preload,dialogue,create:(engine,cue,options)=>new Scene(engine,cue,options),telegraph:engine=>new Telegraph(engine),diagnostics:()=>({loaded:Boolean(assets),bodyFrames:assets?.frames.cast.length||0,effectFrames:assets?Object.values(assets.frames).reduce((n,f)=>n+f.length,0)-4:0})};
})();

/* Uses the installed live V3 runtime. No copied renderer, formations or dock. */
(()=>{
  let engine=null,renderer=null,epoch=0,queue=Promise.resolve(),pending=0,snapshot=null,synced='',bossId='',visible=new Set(),scene=null,lastCue='',spirit=false,telegraph=null;
  async function preload(){
    await window.ProjectVBattleV3Live.ensureRuntime({effects:true});
    await window.MadaraPresentation.preload();
  }
  async function mount(payload){
    teardown();const version=epoch;await preload();if(version!==epoch)return;
    const modal=document.getElementById('battleMount'),api=window.ProjectVPixiBattle;
    bossId=payload.battleV2.teams.B.cards[0].id;
    spirit=String(payload.battleV2.teams.B.cards[0].projectVMonsterArt?.primaryUrl).includes('azure-spirit');
    visible=new Set([...payload.battleV2.teams.A.cards,...payload.battleV2.teams.A.mercenaries,...payload.battleV2.teams.A.supports,...payload.battleV2.teams.B.cards].map(f=>f.id));
    const original=api.mountForBattle,reset=api.resetSession;
    api.mountForBattle=async(data,host)=>{engine=await original(data,host);return engine;};
    api.resetSession=async(data,host)=>{engine=await reset(data,host);return engine;};
    try{
      const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:payload.accountNickname,opponentName:'바르센',autoText:'바르센 전장 준비 중'});
      const candidate=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'RAID',playUltimateCinematics:false});
      if(version!==epoch){candidate.destroy();return;}renderer=candidate;
      modal.querySelector('.battle-v3-header strong').textContent='바르센 레이드';
      modal.querySelector('.battle-v3-header small').textContent='공대의 판단이 전장을 바꾼다';
      await engine.deployCards({instant:true,force:true});
      telegraph=window.MadaraPresentation.telegraph(engine);
    }finally{api.mountForBattle=original;api.resetSession=reset;}
  }
  function sync(){
    if(!engine||!snapshot)return;const key=JSON.stringify([snapshot.bossHp,snapshot.fighters]);if(key===synced)return;
    engine.syncFinalState({A:snapshot.fighters.filter(f=>!f.isMercenary),mercenaries:{A:snapshot.fighters.filter(f=>f.isMercenary),B:[]},B:[{id:bossId,hp:snapshot.bossHp,maxHp:snapshot.bossMaxHp}]});
    engine.updateStatus(`${snapshot.phaseName} · ${snapshot.step==='DAMAGE'?'공격 기회':'협동 기믹'}`);synced=key;
  }
  function present(cue,options={}){
    window.MadaraPresentation.dialogue(cue);if(!engine||!cue)return Promise.resolve();
    scene?.dispose();scene=window.MadaraPresentation.create(engine,cue,{spirit,...options});return scene.playback;
  }
  function cueFor(state){
    const cue=state.presentation;window.MadaraPresentation.dialogue(cue);
    if(!cue||cue.id===lastCue||state.status!=='ACTIVE'||state.serverNow-cue.at>5000)return null;
    lastCue=cue.id;return cue;
  }
  function restore(state){epoch++;scene?.dispose();scene=null;engine?.cancelTimelines();pending=0;queue=Promise.resolve();snapshot=state;synced='';sync();const cue=cueFor(state);if(cue)queue=present(cue);}
  function update(state){
    snapshot=state;if(!engine)return;
    if(state.events.some(e=>['MADARA_PHASE','MADARA_RESULT'].includes(e.type))||pending>18){restore(state);return;}
    const cue=cueFor(state);
    const events=state.events.filter(e=>!e.type.startsWith('MADARA_')&&e.type!=='RESULT'&&(!e.actorId||visible.has(e.actorId)))
      .map(e=>({...e,...(e.hits?{hits:e.hits.filter(h=>visible.has(h.targetId))}:{})}));
    if(!events.length&&!cue){if(!pending)sync();return;}
    const version=epoch;pending+=events.length;
    queue=queue.then(async()=>{if(cue&&version===epoch)await present(cue);for(const e of events){if(version!==epoch||!engine)return;try{await engine.playEvents([e]);}finally{if(version===epoch)pending=Math.max(0,pending-1);}}if(version===epoch)sync();})
      .catch(error=>{console.warn('[Madara preview playback]',error);if(version===epoch){pending=0;sync();}});
  }
  function teardown(){epoch++;scene?.dispose();scene=null;telegraph?.dispose();telegraph=null;engine?.cancelTimelines();renderer?.destroy();renderer=null;engine=null;queue=Promise.resolve();pending=0;snapshot=null;synced='';}
  window.MadaraBattle={preload,mount,update,restore,teardown,telegraph:(state,now)=>telegraph?.draw(state,now),showcase:(cue,options)=>present(cue,{review:true,...options}),control:(action,value)=>scene?.control(action,value),diagnostics:()=>({ready:Boolean(engine),pending,canvasCount:document.querySelectorAll('canvas').length,engine:engine?.diagnostics(),presentation:scene?.diagnostics(),art:window.MadaraPresentation.diagnostics(),telegraphLayers:engine?.effectLayer.children.filter(c=>c.label==='MadaraMechanicTelegraph').length||0,madaraEffects:engine?.effectLayer.children.filter(c=>c.label==='MadaraAuthoredFX').length||0})};
  window.addEventListener('pagehide',teardown,{once:true});
})();

/* Role-specific telegraphs use real text, shapes and the authored Madara art. */
(()=>{
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ART={ILLUSION:'illusion',CLONES:'clones',FIRE:'fire',METEOR:'meteor',FINAL:'awakening'};
  const PURPOSE={ILLUSION:'각자의 실체 조건을 식별하고 폭주를 정화하세요.',CLONES:'반사 분신을 피하고 빠른 시전을 먼저 끊으세요.',FIRE:'첫 화염 후 과열을 처리하고 동료의 보호 타이밍을 맞추세요.',METEOR:'핵의 노출과 낙하 충격에 맞춰 공격·보호를 전개하세요.',FINAL:'환술과 운석을 동시에 처리하며 시선 대상자는 공격을 멈추세요.'};
  const eye=shape=>shape==='닫힌 눈'?'<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M6 13Q32 40 58 13M15 21l-5 7M49 21l5 7M32 28v7"/></svg>':shape==='갈라진 눈'?'<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M3 18Q32-8 61 18Q32 44 3 18M35 2l-9 15 12 4-9 14"/><circle cx="32" cy="18" r="6"/></svg>':'<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M3 18Q32-8 61 18Q32 44 3 18"/><circle cx="32" cy="18" r="11"/><circle cx="32" cy="18" r="6"/></svg>';
  function mount(task,{getState,send}){
    const node=document.createElement('article');node.className='mr-task mr-decision-task';node.dataset.taskId=task.id;
    node.innerHTML='<h3><span></span><small></small></h3><p class="task-clue"></p><p class="task-detail"></p><div class="mr-response-clock"><div><b class="response-state"></b><span class="response-time" role="timer"></span></div><div class="response-track"><i></i><em></em></div><small class="response-guide"></small></div><p class="task-status" role="status"></p><div class="mr-choice-row mr-target-grid"></div><div class="mr-task-feedback" role="status" hidden></div>';
    const row=node.querySelector('.mr-choice-row');
    // Reuse nodes across polls and changed patterns. A held pointer keeps the old token.
    for(let i=0;i<4;i++){
      const button=document.createElement('button');button.type='button';button.dataset.slot=i;
      const input=()=>{const state=getState(),current=state?.tasks.find(t=>t.id===task.id);return current?{action:'TASK',taskId:current.id,token:current.token,target:button.dataset.target,actorId:state.me.id}:null;};
      button.addEventListener('pointerdown',()=>button.press=input());
      button.addEventListener('pointercancel',()=>button.press=null);
      button.addEventListener('click',event=>{const value=event.detail&&button.press?button.press:input();button.press=null;if(value)send(value);});row.append(button);
    }
    return node;
  }
  function update(node,task){
    node.classList.toggle('done',task.done);node.dataset.type=task.decision.type;
    node.querySelector('h3 span').textContent=task.label;node.querySelector('h3 small').textContent=task.done?'✓ 완료':`${task.index+1} / ${task.total}`;
    node.querySelector('.task-clue').textContent=task.clue;node.querySelector('.task-detail').textContent=task.decision.detail;
    node.querySelector('.mr-choice-row').hidden=task.done;node.querySelector('.mr-response-clock').hidden=task.done;
    const buttons=node.querySelectorAll('.mr-choice-row button');
    for(let i=0;i<buttons.length;i++){
      const button=buttons[i],choice=task.choices[i];button.hidden=!choice;if(!choice)continue;
      button.dataset.target=choice.id;
      const key=JSON.stringify(choice);if(button.dataset.content===key)continue;button.dataset.content=key;
      button.className='mr-target'+(choice.reflected?' reflect':'')+(choice.preserved?' preserve':'')+(choice.shielded?' protected':'');
      const badge=choice.reflected?'⛔ 반사':choice.preserved?'◇ 보존':choice.shielded?'◇ 보호 중':task.decision.type==='INTERCEPT'?'◆ 타이밍 대응':`표적 ${i+1}`;
      const motif=choice.shape?eye(choice.shape):choice.rune?`<b>${esc(choice.rune)}</b>`:task.decision.type==='INTERCEPT'?'<b>◇</b>':'<b>＋</b>';
      button.innerHTML=`<small class="target-badge">${badge}</small><span class="target-motif">${motif}</span><strong>${esc(choice.label)}</strong><span class="target-detail">${esc(choice.detail)}</span>${choice.impactAt?'<span class="target-countdown"></span>':''}${choice.heat?`<span class="target-heat">열기 ${choice.heat}%<i style="width:${choice.heat}%"></i></span>`:''}`;
      button.setAttribute('aria-label',[choice.label,choice.detail,choice.threat?`위협 ${choice.threat}초`:'',choice.heat?`열기 ${choice.heat}%`:''].filter(Boolean).join(' · '));
    }
    const feedback=node.querySelector('.mr-task-feedback');feedback.hidden=!task.feedback;
    if(task.feedback){feedback.dataset.ok=String(task.feedback.ok);feedback.textContent=(task.feedback.ok?'✓ ':'! ')+task.feedback.reason;}
    node.querySelector('.task-status').textContent=task.done?'내 임무 완료 · 동료의 생존과 다음 기믹을 확인하세요.':task.blocked||'';
  }
  function clock(node,task,now,unavailable,phaseDeadline){
    const d=task.decision,remaining=at=>Math.max(0,(at-now)/1000),recover=now<d.recoveryAt,preview=now<d.readyAt,expired=now>=d.expiresAt;
    const stage=task.done?'done':recover?'recover':expired?'expired':preview?'preview':'respond';node.dataset.stage=stage;
    node.querySelector('.response-state').textContent=recover?'↻ 재정비':expired?'대응 종료 · 갱신 중':preview?(d.timed?'손 떼고 예고 확인':'예고 · 단서 확인'):d.type==='INTERCEPT'?'지금 보호 전개':d.type==='EXPOSURE'?'핵 노출 · 지금 타격':'판단 · 지금 대응';
    node.querySelector('.response-time').textContent=remaining(recover?d.recoveryAt:preview?d.readyAt:d.expiresAt).toFixed(1)+'초';
    const start=d.startedAt,end=d.expiresAt,width=(d.readyAt-start)/(end-start)*100;
    node.querySelector('.response-track i').style.width=width+'%';
    node.querySelector('.response-track em').style.left=Math.min(100,Math.max(0,(now-start)/(end-start)*100))+'%';
    node.querySelector('.response-guide').textContent=d.timed?'사선: 대기 / 밝은 구간: 대응 · 이른 입력도 실패로 판정':'예고가 끝나면 선택 · 완료할 때마다 새 단서 등장';
    for(let i=0;i<task.choices.length;i++){
      const button=node.querySelectorAll('.mr-choice-row button')[i],choice=task.choices[i];
      button.disabled=unavailable||task.done||recover||expired||now>=phaseDeadline||(!d.timed&&preview);
      if(choice.impactAt)button.querySelector('.target-countdown').textContent='충격 '+remaining(choice.impactAt).toFixed(1)+'초';
    }
  }
  function summary(state,now){
    const host=$('mechanicBrief');host.hidden=state.status!=='ACTIVE';if(host.hidden)return;
    const q=state.challenge,waiting=state.tasks.filter(t=>!t.done).sort((a,b)=>a.decision.expiresAt-b.decision.expiresAt),task=waiting[0];
    const art=`/preview/madara-raid-v1/assets/animation/${ART[q.kind]}-04.png`;if($('mechanicArt').getAttribute('src')!==art)$('mechanicArt').src=art;
    $('mechanicPurpose').textContent=PURPOSE[q.kind];
    const text=state.step==='DAMAGE'?'전원 공격 · 내 피해 몫을 채우세요':state.step==='TRANSITION'?'다음 기믹 준비':task?task.label:'내 임무 완료 · 동료 지원';
    $('mechanicFocus').textContent=text;
    const marked=q.gaze?.ownerId===state.me.id;
    const note=marked?'! 거신의 시선: 나 · 결계 유지 후 공격 중단':task?(now<task.decision.readyAt?'예고를 읽고 대응 구간을 기다리세요.':task.clue):'개인 임무는 대신 처리할 수 없습니다.';
    $('mechanicAction').textContent=note;host.dataset.danger=String(marked);
    $('mechanicProgress').textContent=`내 임무 ${state.tasks.filter(t=>t.done).length}/${state.tasks.length} · 공대 ${state.members.reduce((s,m)=>s+m.tasksDone,0)}/${state.members.reduce((s,m)=>s+m.tasksTotal,0)}`;
    $('mechanicFocusTime').textContent=task?Math.max(0,((now<task.decision.readyAt?task.decision.readyAt:task.decision.expiresAt)-now)/1000).toFixed(1)+'초':'';
    const dual=state.tasks.length>1&&state.step==='MECHANIC';$('jumpSecondTask').hidden=!dual;
    const countdown=t=>t.done?'완료':Math.max(0,(t.decision.expiresAt-now)/1000).toFixed(0)+'초';
    $('jumpTasks').textContent=dual?'환술 '+countdown(state.tasks[0]):'임무 조작 ↓';
    if(dual)$('jumpSecondTask').textContent='운석 '+countdown(state.tasks[1]);
  }
  window.MadaraMechanics={mount,update,clock,summary};
})();

(()=>{
  const $=id=>document.getElementById(id),roles={WARDEN:'봉인대',ASSAULT:'정벌대',RESCUE:'구출대'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token=localStorage.getItem('madara_live_identity')||sessionStorage.getItem('madara_live_token')||'',actor=sessionStorage.getItem('madara_live_actor')||'',state=null,lastReceive=0,lastNow=0,busy=false,mounting=false,mountedKey='',pollTimer=null,pollFailures=0,resultShown=false,leaving=false;
  let account=null,registryBusy=false,registryAt=0,pendingCreate=null,kickTarget='',showcase=false,scene='ILLUSION',sceneForm='',sceneCues=null,sceneVersion=0;
  const nodes=new Map(),journal=new Map();
  const serverNow=()=>lastNow+(performance.now()-lastReceive);
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
  function persist(){localStorage.setItem('madara_live_identity',token);sessionStorage.setItem('madara_live_token',token);sessionStorage.setItem('madara_live_actor',actor);}
  async function request(route,body=null,{payload=false,actorId=actor,retry=false,form=''}={}){
    if(body&&!body.requestId)body.requestId=crypto.randomUUID();
    const query=new URLSearchParams({since:String(state?.eventSeq||0)});if(actorId)query.set('actor',actorId);if(payload)query.set('payload','1');
    if(form)query.set('form',form);
    let lastError;
    for(let attempt=0;attempt<(retry?2:1);attempt++){
      try{
        const response=await fetch('/__madara/'+route+'?'+query,{method:body?'POST':'GET',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});
        const result=await response.json();
        if(!response.ok){const error=Object.assign(new Error(result.error||'요청을 확인하세요.'),{status:response.status,code:result.code,retryable:result.retryable});throw error;}
        return result;
      }catch(error){lastError=error;if(error.status&&!error.retryable)throw error;}
    }
    throw lastError;
  }
  async function accept(result){
    if(result.feature){document.querySelector('.mr-development').textContent=result.feature.mode+' · 바르센 레이드';}
    if(result.settings){const s=result.settings,w=result.weeklyReward;document.querySelector('[data-reward-policy]').textContent='광폭화 '+s.enrageSeconds+'초 · 기믹 제한 '+s.mechanicTimePercent+'% · '+(result.feature.mode==='TEST'?'TEST 보상 없음':s.rewardsEnabled?'클리어 '+Number(s.coinReward).toLocaleString()+' 코인 / 피그코인 '+Number(s.pigCoinReward||0)+' / 마별 '+s.masterStarReward+' / 펫 정수 '+s.petEssenceReward:'클리어 보상 지급 OFF')+(w?' · 주간 '+w.used+'/'+w.limit+'회':'');}
    if(result.token){token=result.token;persist();}
    if(result.account){account=result.account;updateWallet();}
    if(result.rooms)renderRooms(result.rooms);
    if(!result.state)return;
    const incoming=result.state;
    if(state&&state.id===incoming.id&&state.me.id===incoming.me.id&&(incoming.revision<state.revision||incoming.revision===state.revision&&incoming.serverNow<state.serverNow))return;
    state=incoming;actor=state.me.id;persist();lastReceive=performance.now();lastNow=state.serverNow;pollFailures=0;
    $('connectionState').textContent='서버 연결됨';
    render();
    if(['ACTIVE','CLEAR','FAILED'].includes(state.status)){
      const key=state.me.id+':'+(state.phase===5?'SPIRIT':'MADARA');
      if(key!==mountedKey&&!mounting){
        mounting=true;updateClock();
        try{
          const currentPayload=result.payload|| (await request('state',null,{payload:true})).payload;
          await window.MadaraBattle.mount(currentPayload);mountedKey=key;window.MadaraBattle.restore(state);
        }catch(error){toast('전장 로딩 실패: '+error.message);$('battleNote').textContent='전장 준비 재시도 중';}
        finally{mounting=false;updateClock();}
      }else if(!mounting)window.MadaraBattle.update(state);
    }
    if(['CLEAR','FAILED'].includes(state.status)&&!resultShown){
      resultShown=true;$('resultTitle').textContent=state.status==='CLEAR'?'바르센 격파':'공대 작전 실패';
      $('resultReason').textContent=state.failure?.reason||'세 역할의 협동으로 거신을 저지했습니다.';
      const seconds=Math.round((state.finishedAt-state.startedAt)/1000);
      $('resultStats').innerHTML=`<span><b>${seconds}</b>전투 시간, 초</span><span><b>${state.statistics.tasks}</b>완료 임무</span><span><b>${state.statistics.mistakes}</b>실수</span>`;
      const reward=state.clearReward;$('resultDialog').querySelector('.mr-muted').textContent=reward?.granted?('클리어 보상 · '+Number(reward.coin).toLocaleString()+' 코인 / 피그코인 '+Number(reward.pigCoins||0)+' / 마별 '+reward.masterStars+' / 펫 정수 '+reward.petEssence):reward?.status==='WEEKLY_LIMIT'?'이번 주 보상 수령 한도에 도달했습니다.':'TEST 또는 보상 미설정 공대 · 보상 지급 없음';$('resultDialog').showModal();
      mountRewardRevealButton($('resultDialog'),reward?.choiceOffer,{signal:revealLifecycle.signal,auto:true});
    }
  }
  function schedulePoll(){clearTimeout(pollTimer);if(token&&!leaving&&!showcase)pollTimer=setTimeout(poll,Math.min(8000,(state?(document.hidden?2500:900):5000)*2**Math.min(pollFailures,3)));}
  async function poll(){
    if(!token||busy||mounting){schedulePoll();return;}
    try{if(state){await accept(await request('state'));if(state?.status==='LOBBY'&&performance.now()-registryAt>=5000)await refreshLobby(false);}else await refreshLobby(false);}
    catch(error){pollFailures++;$('connectionState').textContent='재연결 중 · 시간은 계속 흐릅니다';if([401,404].includes(error.status)||error.code==='KICKED'){reset();toast(error.message);if(error.status===401){token='';persist();await bootstrap();}else await refreshLobby(false);}}
    schedulePoll();
  }
  function taskNode(task){
    if(nodes.has(task.id))return nodes.get(task.id);
    const element=window.MadaraMechanics.mount(task,{getState:()=>state,send:sendAction});
    nodes.set(task.id,element);$('taskList').append(element);return element;
  }
  function render(){
    const lobby=state.status==='LOBBY';$('staging').hidden=!lobby;$('combat').hidden=lobby;
    window.MadaraCombatScreen?.setActive(!lobby);
    $('createForm').hidden=true;$('joinRow').hidden=true;$('assembly').hidden=!lobby;
    if(lobby){
      $('roomCode').textContent=state.id;
      $('lobbyMembers').innerHTML=state.members.map((m,i)=>`<li><span class="mr-member-number">${String(i+1).padStart(2,'0')}</span><span class="mr-member-name">${escape(m.name)} ${m.id===state.hostId?'<em>공대장</em>':''}<small>${roles[m.role]}</small></span><b>${m.ready?'준비 완료':'대기'}</b>${state.me.isHost&&m.id!==state.hostId&&state.mode==='PARTY'?`<button class="mr-button quiet mr-kick" data-kick="${escape(m.id)}" aria-label="${escape(m.name)} 강퇴">강퇴</button>`:''}</li>`).join('');
      $('lobbyMembers').querySelectorAll('[data-kick]').forEach(button=>button.onclick=()=>{kickTarget=button.dataset.kick;const target=state.members.find(m=>m.id===kickTarget);$('kickSummary').textContent=`${target.name} · ${roles[target.role]}`;$('kickDialog').showModal();});
      $('roleReadiness').innerHTML=Object.entries(roles).map(([role,label])=>`<span class="${state.members.some(m=>m.role===role)?'filled':''}">${state.members.some(m=>m.role===role)?'✓':'○'} ${label}</span>`).join('');
      $('readyButton').textContent=state.me.ready?'준비 해제':'준비 완료';$('startButton').hidden=!state.me.isHost;
      $('startButton').disabled=busy||!state.members.every(m=>m.ready)||Object.keys(roles).some(r=>!state.members.some(m=>m.role===r));
      $('assemblyNote').textContent=state.mode==='COMMAND'?'단독 지휘: 전장에서 담당자를 바꿔 세 역할을 직접 조작합니다.':'3~6명 · 세 역할 · 전원 준비가 필요합니다. 각자의 계정으로 참가하세요. 출정 후 강퇴는 잠깁니다.';
      $('showcaseButton').hidden=true;
      return;
    }
    $('phaseCounter').textContent=String(state.phase).padStart(2,'0')+' / 05';$('phaseName').textContent=state.phaseName;
    const percent=(state.bossHp/state.bossMaxHp*100);$('bossPercent').textContent=percent.toFixed(1)+'%';$('bossFill').style.width=percent+'%';
    [...$('phaseRail').children].forEach((el,i)=>el.classList.toggle('active',i+1===state.phase));
    $('roleName').textContent=roles[state.me.role];$('actorSelect').hidden=state.mode!=='COMMAND';
    const options=state.members.map(m=>`<option value="${escape(m.id)}">${roles[m.role]} · ${escape(m.name)}</option>`).join('');
    if($('actorSelect').dataset.options!==options){$('actorSelect').innerHTML=options;$('actorSelect').dataset.options=options;}$('actorSelect').value=state.me.id;
    const activeIds=new Set(state.tasks.map(t=>t.id));for(const [id,node]of nodes)if(!activeIds.has(id)){node.remove();nodes.delete(id);}
    for(const task of state.tasks){
      window.MadaraMechanics.update(taskNode(task),task);
    }
    const q=state.challenge,who=id=>state.members.find(m=>m.id===id)?.name||'동료',signals=[];
    for(const [id,r]of Object.entries(q.signals))signals.push(`${who(id)}의 진실: ${r}`);
    for(const [id,r]of Object.entries(q.orders))signals.push(`${who(id)}의 낙인: ${r.join(' → ')}`);
    for(const [id,r]of Object.entries(q.bindings))signals.push(`${who(id)}의 운석 봉인: ${r.join(' → ')}`);
    if(q.preserve)signals.push(`보존할 결계: ${q.preserve}`);
    $('signalBoard').textContent=signals.join(' / ')||'각자 다른 개인 단서입니다. 동료의 정답을 그대로 따라 누르지 마세요.';
    $('fireNotice').hidden=q.kind!=='FIRE'||state.step!=='MECHANIC';
    $('gazeBanner').hidden=!q.gaze||state.status!=='ACTIVE';
    if(q.gaze){$('gazeOwner').textContent=`거신의 시선 · ${q.gaze.ownerName}`;$('guardButton').hidden=q.gaze.ownerId!==state.me.id;$('guardButton').textContent=q.gaze.guarded?'결계 유지 중':'결계 유지';}
    $('attackPanel').hidden=state.step!=='DAMAGE';$('taskList').hidden=state.step==='DAMAGE'||state.step==='TRANSITION';
    $('attackHint').textContent=state.attackRemaining>0?`내 남은 공략 피해 ${Math.ceil(state.attackRemaining).toLocaleString()} · 공격 기회가 끝나기 전에 전원 달성`:'내 공략 완료 · 동료의 공격과 생존을 지원하세요.';
    $('healCount').textContent=state.resources.heal;$('soulCount').textContent=state.souls;$('strainCount').textContent=state.strain+' / 4';
    $('supportPanel').hidden=state.me.role!=='RESCUE';
    const dead=state.members.filter(m=>m.downCount>0),reviveOptions=dead.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('');
    if($('reviveTarget').dataset.options!==reviveOptions){$('reviveTarget').innerHTML=reviveOptions||'<option value="">대상 없음</option>';$('reviveTarget').dataset.options=reviveOptions;}
    $('operationHint').textContent=state.step==='TRANSITION'?'다음 작전으로 이동합니다.':state.mode==='COMMAND'?'단독 지휘: 담당자 선택으로 다른 역할을 조작하세요.':'나의 임무를 완료한 뒤 동료의 공유 정보와 체력을 확인하세요.';
    $('battleNote').textContent=state.phase===5?'거신 강림 · 거신의 시선을 확인하세요':'내 편성 · 공용 V3 전장';
    $('partyStrip').innerHTML=state.members.map(m=>`<div class="mr-party-chip"><strong>${escape(m.name)}</strong>${roles[m.role]} · ${m.tasksDone}/${m.tasksTotal}<meter min="0" max="${m.maxHp}" value="${m.hp}" aria-label="${escape(m.name)} 체력"></meter></div>`).join('');
    for(const event of state.events)if(event.type.startsWith('MADARA_'))journal.set(event.seq,event);
    while(journal.size>80)journal.delete(journal.keys().next().value);
    const journalKey=[...journal.keys()].join(',');if($('journal').dataset.key!==journalKey){$('journal').dataset.key=journalKey;$('journal').innerHTML=[...journal.values()].reverse().map(e=>`<li><time>${Math.max(0,Math.floor((e.at-state.startedAt)/1000))}초</time>${escape(e.label)}</li>`).join('');$('journalCount').textContent=journal.size+'개';}
    updateClock();
  }
  function updateClock(){
    if(!state||state.status==='LOBBY')return;const now=serverNow(),q=state.challenge,active=state.status==='ACTIVE',connected=performance.now()-lastReceive<6000;
    const remaining=at=>Math.max(0,(at-now)/1000);
    $('phaseClock').textContent=active?remaining(q.deadline).toFixed(1)+'초':'종료';$('enrageClock').textContent=remaining(state.endsAt).toFixed(0)+'초';
    const unavailable=busy||mounting||!active||!connected;
    $('actorSelect').disabled=busy||mounting;
    for(const task of state.tasks){const node=nodes.get(task.id);if(node)window.MadaraMechanics.clock(node,task,now,unavailable,q.deadline);}
    window.MadaraMechanics.summary(state,now);
    window.MadaraBattle.telegraph?.(state,now);
    const gaze=q.gaze,marked=gaze?.ownerId===state.me.id&&now>=gaze.activeAt;
    if(gaze){$('gazeTime').textContent=now<gaze.activeAt?`반사까지 ${remaining(gaze.activeAt).toFixed(1)}초 · 대상자는 결계 유지`:`인계까지 ${remaining(gaze.endsAt).toFixed(1)}초 · 대상자는 공격 중단`;$('guardButton').disabled=unavailable||gaze.guarded;}
    const attackBlocked=unavailable||state.step!=='DAMAGE'||state.attackRemaining<=0||now<state.nextStrikeAt||marked||now>=q.deadline;
    $('strikeButton').disabled=attackBlocked;$('burstButton').disabled=attackBlocked||state.bursts<=0;
    $('strikeButton').textContent=marked?'시선 중 · 공격 중단':now<state.nextStrikeAt?`준비 ${remaining(state.nextStrikeAt).toFixed(1)}초`:'공격';$('burstButton').textContent=`결전 · ${state.bursts}회`;
    $('healButton').disabled=unavailable||!state.resources.heal||!state.members.some(m=>m.hp>0&&m.hp<m.maxHp);
    $('reviveButton').disabled=unavailable||!state.resources.revive||state.souls<1||!$('reviveTarget').value;
    if(q.kind==='FIRE')$('fireNotice').textContent=!q.firstDone?`첫 화염까지 ${remaining(q.firstAt).toFixed(1)}초 · 보존 결계 표시`:`두 번째 화염까지 ${remaining(q.secondAt).toFixed(1)}초 · ${q.preserve||'표시된'} 결계 보강`;
  }
  async function sendAction(input){
    if(busy||mounting)return;busy=true;updateClock();
    const command={requestId:crypto.randomUUID(),actorId:state.me.id,...input};
    try{await accept(await request('action',command,{retry:true}));}catch(error){toast(error.message);try{await accept(await request('state'));}catch{}}
    finally{busy=false;updateClock();schedulePoll();}
  }
  async function create(join=false){
    if(busy)return;busy=true;$('createButton').disabled=true;$('joinButton').disabled=true;
    $('confirmEntry').disabled=true;$('cancelEntry').disabled=true;
    try{const body=join?{name:$('playerName').value,role:$('playerRole').value,code:$('joinCode').value}:pendingCreate;
      await accept(await request(join?'join':'create',body,{actorId:'',retry:true}));pendingCreate=null;$('entryDialog').close();window.MadaraBattle.preload().catch(()=>{});await refreshLobby(false);schedulePoll();}
    catch(error){toast(error.message);if(error.status){pendingCreate=null;$('entryDialog').close();}}
    finally{busy=false;updateWallet();$('joinButton').disabled=false;$('confirmEntry').disabled=false;$('cancelEntry').disabled=false;}
  }
  async function lobbyAction(route){if(busy)return;busy=true;$('readyButton').disabled=true;$('startButton').disabled=true;try{await window.MadaraBattle.preload();await accept(await request(route,route==='ready'?{ready:!state.me.ready}:{},{payload:route==='start'}));}catch(error){toast(error.message);}finally{busy=false;$('readyButton').disabled=false;if(state)render();schedulePoll();}}
  function reset(){clearTimeout(pollTimer);sceneVersion++;window.MadaraBattle.teardown();actor='';state=null;mountedKey='';sceneForm='';showcase=false;resultShown=false;leaving=false;nodes.clear();journal.clear();$('taskList').replaceChildren();sessionStorage.removeItem('madara_live_actor');$('staging').hidden=false;$('combat').hidden=true;$('combat').classList.remove('showcase');$('showcaseControls').hidden=true;$('createForm').hidden=false;$('joinRow').hidden=false;$('assembly').hidden=true;$('showcaseButton').hidden=true;['kickDialog','leaveDialog','resultDialog'].forEach(id=>$(id).close());window.MadaraCombatScreen?.setActive(false);schedulePoll();}
  function updateWallet(){
    if(account){$('playerName').value=account.name;$('playerName').readOnly=true;document.querySelector('.mr-ticket div>span').textContent=account.cost?'공대 생성자만 '+account.cost+'장 사용':'현재 무료 입장 · 차감 없음';$('entryDialog').querySelector('h2').textContent=account.cost?'공대 생성에 입장권 '+account.cost+'장을 사용합니다':'입장권 차감 없이 공대를 생성합니다';$('confirmEntry').textContent=account.cost?account.cost+'장 사용 · 방 생성':'무료로 방 생성';document.querySelector('[data-entry-policy]').textContent=(account.cost?'공대 생성자만 '+account.cost+'장 소모 · 생성 후 반환 없음':'현재 무료 입장 · 입장권 차감 없음')+' · 참가자 무료';}
  
    $('ticketBalance').textContent='무료';$('createButton').disabled=busy||!account;
  }
  function renderRooms(rooms){
    $('roomCount').textContent=rooms.filter(r=>r.status==='LOBBY').length;
    $('registryStatus').textContent=`${new Date().toLocaleTimeString('ko-KR')} 갱신 · 5초마다 자동 갱신 · 참가자는 입장권 차감 없음`;
    const html=rooms.length?rooms.map(r=>`<article class="mr-room-row"><span class="mr-room-status ${r.status==='LOBBY'?'open':''}">${r.status==='LOBBY'?'모집 중':r.status==='ACTIVE'?'전투 중':'종료'}</span><div class="mr-room-title"><strong>${escape(r.hostName)}의 공대</strong><small>${escape(r.id)}</small></div><div class="mr-room-roles">${Object.entries(roles).map(([k,v])=>`<span class="${r.roles[k]?'filled':''}">${v} ${r.roles[k]?r.roles[k]+'명':'모집'}</span>`).join('')}</div><b class="mr-room-size">${r.members}<small> / 6</small></b><button class="mr-button ${r.canJoin?'primary':''}" data-join="${escape(r.id)}" ${r.canJoin?'':'disabled'}>${account?.roomId===r.id?'참가 중':r.canJoin?'참가':escape(r.blocked)}</button></article>`).join(''):'<div class="mr-empty"><span>募</span><h3>아직 모집 중인 공대가 없습니다</h3><p>첫 공대장이 되어 출정할 동료를 모아 보세요.</p></div>';
    if($('roomList').dataset.html!==html){$('roomList').innerHTML=html;$('roomList').dataset.html=html;$('roomList').querySelectorAll('[data-join]').forEach(button=>button.onclick=()=>{$('joinCode').value=button.dataset.join;create(true);});}
  }
  async function refreshLobby(manual=true){
    if(!token||registryBusy)return;registryBusy=true;$('refreshRooms').disabled=true;
    try{await accept(await request('lobby',null,{actorId:''}));registryAt=performance.now();if(manual)toast('공대 목록을 갱신했습니다.');}
    catch(error){$('registryStatus').textContent='목록을 불러오지 못했습니다. 목록 갱신으로 다시 시도하세요.';if(manual)toast(error.message);else throw error;}
    finally{registryBusy=false;$('refreshRooms').disabled=false;}
  }
  $('createForm').addEventListener('submit',event=>{event.preventDefault();if(!account)return;
    pendingCreate={requestId:crypto.randomUUID(),name:$('playerName').value,mode:$('playMode').value,role:$('playerRole').value};
    $('entrySummary').textContent=`${pendingCreate.name} · ${roles[pendingCreate.role]} · ${pendingCreate.mode==='PARTY'?'공대 플레이':'단독 지휘'}`;$('entryDialog').showModal();});
  $('confirmEntry').onclick=()=>{if(pendingCreate)create();};$('cancelEntry').onclick=()=>{$('entryDialog').close();pendingCreate=null;};
  $('joinButton').onclick=()=>create(true);$('refreshRooms').onclick=()=>refreshLobby();
  $('cancelKick').onclick=()=>$('kickDialog').close();$('confirmKick').onclick=async()=>{if(busy)return;busy=true;$('confirmKick').disabled=true;try{await accept(await request('kick',{targetId:kickTarget}));$('kickDialog').close();await refreshLobby(false);toast('공대원을 강퇴했습니다.');}catch(error){toast(error.message);}finally{busy=false;$('confirmKick').disabled=false;}};
  $('readyButton').onclick=()=>lobbyAction('ready');$('startButton').onclick=()=>lobbyAction('start');
  $('copyCode').onclick=()=>navigator.clipboard.writeText(state.id).then(()=>toast('공대 코드를 복사했습니다.')).catch(()=>toast('공대 코드를 직접 복사하세요.'));
  $('jumpTasks').onclick=()=>document.querySelector('.mr-operations').scrollIntoView({block:'start'});
  $('jumpSecondTask').onclick=()=>{const second=state?.tasks[1];if(second)nodes.get(second.id)?.scrollIntoView({block:'start'});};
  $('jumpBattle').onclick=()=>document.querySelector('.mr-battle-pane').scrollIntoView({block:'start'});
  $('actorSelect').onchange=async event=>{if(busy||mounting)return;busy=true;actor=event.target.value;try{await accept(await request('state',null,{payload:true}));}catch(error){toast(error.message);}finally{busy=false;updateClock();}};
  $('strikeButton').onclick=()=>sendAction({action:'STRIKE',token:state.challenge.id});$('burstButton').onclick=()=>sendAction({action:'BURST',token:state.challenge.id});
  $('guardButton').onclick=()=>sendAction({action:'GUARD',token:`${state.challenge.id}:gaze:${state.challenge.gaze.index}`});
  $('healButton').onclick=()=>sendAction({action:'HEAL',token:state.challenge.id});$('reviveButton').onclick=()=>sendAction({action:'REVIVE',token:state.challenge.id,target:$('reviveTarget').value});
  $('guideButton').onclick=()=>$('guideDialog').showModal();$('closeGuide').onclick=()=>$('guideDialog').close();
  $('leaveButton').onclick=()=>{if(showcase){reset();refreshLobby(false).catch(()=>{});}else $('leaveDialog').showModal();};$('lobbyLeave').onclick=()=>$('leaveDialog').showModal();$('cancelLeave').onclick=()=>$('leaveDialog').close();
  $('confirmLeave').onclick=async()=>{leaving=true;$('confirmLeave').disabled=true;try{await accept(await request('leave',{}));reset();await refreshLobby(false);}catch(error){leaving=false;toast(error.message);schedulePoll();}finally{$('confirmLeave').disabled=false;}};
  $('retryButton').onclick=async()=>{$('resultDialog').close();try{await accept(await request('leave',{}));}catch{}reset();refreshLobby(false).catch(()=>{});};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token)poll();});
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  function frame(){if(!document.hidden)updateClock();requestAnimationFrame(frame);}frame();
  async function playScene(key){
    scene=key;const version=++sceneVersion;mounting=true;$('sceneReplay').disabled=true;
    try{
      const form=key==='FINAL'?'spirit':'human';
      if(sceneForm!==form){const data=await request('showcase',null,{actorId:'',form});if(version!==sceneVersion)return;await window.MadaraBattle.mount(data.payload);if(version!==sceneVersion)return;sceneCues=data.cues;sceneForm=form;}
      const cue={...sceneCues[key],key,id:'review:'+crypto.randomUUID()};
      $('phaseName').textContent=cue.title;$('phaseCounter').textContent='CINEMATIC / LOCAL REVIEW';$('battleNote').textContent='연출 감상 · 실제 전투와 별도';$('connectionState').textContent='입장권 사용 없음';
      document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===key)));
      window.MadaraBattle.showcase(cue,{speed:Number($('sceneSpeed').value),effects:$('sceneEffects').checked,onFrame:(t,duration)=>{$('sceneSeek').max=duration;$('sceneSeek').value=t;$('sceneTime').textContent=t.toFixed(2)+'s';}});
      $('scenePause').textContent='일시정지';
    }catch(error){toast('연출 준비 실패: '+error.message);}finally{if(version===sceneVersion){mounting=false;$('sceneReplay').disabled=false;}}
  }
  $('showcaseButton').onclick=()=>{if(!token||state)return;showcase=true;clearTimeout(pollTimer);$('staging').hidden=true;$('combat').hidden=false;$('combat').classList.add('showcase');$('showcaseControls').hidden=false;window.scrollTo(0,0);playScene('ILLUSION');};
  document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{if(!mounting)playScene(b.dataset.scene);});
  $('sceneReplay').onclick=()=>playScene(scene);
  $('scenePause').onclick=()=>{$('scenePause').textContent=window.MadaraBattle.control('pause')?'계속 재생':'일시정지';};
  $('sceneSpeed').onchange=()=>window.MadaraBattle.control('speed',Number($('sceneSpeed').value));
  $('sceneSeek').oninput=()=>{window.MadaraBattle.control('seek',Number($('sceneSeek').value));$('scenePause').textContent='계속 재생';};
  $('sceneEffects').onchange=()=>window.MadaraBattle.control('effects',$('sceneEffects').checked);
  window.MadaraPreview={diagnostics:()=>({state:state?structuredClone(state):null,account,showcase,scene,busy,mounting,connectionAge:performance.now()-lastReceive,...window.MadaraBattle.diagnostics()})};
  async function bootstrap(){busy=true;try{
    let result;try{result=await request('session',{});}catch(error){if(error.status!==401)throw error;token='';persist();result=await request('session',{});}
    await accept(result);if(account.roomId)await accept(await request('state',null,{payload:true}));
  }catch(error){toast(error.message);}finally{busy=false;updateWallet();schedulePoll();}}
  bootstrap();
})();

 return {destroy(){revealLifecycle.abort();scope.destroy();}};
}
