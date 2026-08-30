import {Application, Assets, BlurFilter, Container, Graphics, Sprite, Text} from 'pixi.js';
import {gsap} from 'gsap';
import {EventEffectFX, EVENT_EFFECTS} from './EventEffectFX.js';
import {EventAudioMixer} from './EventAudioMixer.js';
import {EventTimeline} from './EventTimeline.js';

const VIEW={width:1600,height:900};
const ART={
  background:'/assets/ui/project-v/battlefields/v3-world-raid-obsidian-citadel-v1.png',
  ally:'/assets/ui/project-v/characters/prestige/prestige-ojoeun-sd-v1.png',
  enemy:'/assets/ui/project-v/characters/deck-faker-sd-v1.png'
};

function setCover(sprite,width,height){
  const scale=Math.max(width/sprite.texture.width,height/sprite.texture.height);
  sprite.anchor.set(.5);
  sprite.position.set(width/2,height/2);
  sprite.scale.set(scale);
}

function addActor({texture,x,y,scale,name,team,accent}){
  const root=new Container({label:`${team}Actor`});
  root.position.set(x,y);
  root.scale.set(scale);
  root.zIndex=y;
  const shadow=new Graphics().ellipse(0,8,180,42).fill({color:0x000000,alpha:.56});
  shadow.filters=[new BlurFilter({strength:9,quality:2})];
  const sprite=new Sprite(texture);
  sprite.anchor.set(.5,1);
  const targetHeight=520;
  sprite.scale.set(targetHeight/Math.max(1,sprite.texture.height));
  const nameplate=new Container({label:'ActorNameplate'});
  const plate=new Graphics().roundRect(-106,22,212,46,4).fill({color:0x050a0f,alpha:.88}).stroke({width:1,color:accent,alpha:.48});
  const label=new Text({text:name,style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:18,fill:0xffffff,fontWeight:'900',letterSpacing:.7}});
  label.anchor.set(.5);
  label.position.set(0,36);
  const hpBack=new Graphics().roundRect(-82,54,164,8,4).fill({color:0x17242e,alpha:.96});
  const hpFill=new Graphics().roundRect(-82,54,164,8,4).fill({color:accent,alpha:.98});
  hpFill.pivot.set(-82,0);
  hpFill.scale.x=1;
  nameplate.addChild(plate,label,hpBack,hpFill);
  root.addChild(shadow,sprite,nameplate);
  return {root,sprite,hpFill,base:{x,y,scale},name,team};
}

function createBattleUi(uiLayer){
  const topRail=new Graphics().rect(0,0,VIEW.width,82).fill({color:0x03070b,alpha:.72});
  const line=new Graphics().rect(0,81,VIEW.width,1).fill({color:0x61d8ff,alpha:.22});
  const mode=new Text({text:'V3 EFFECT VERIFICATION · BINDING UNASSIGNED',style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:15,fill:0x8da7b7,fontWeight:'800',letterSpacing:2.2}});
  mode.position.set(54,30);
  const gate=new Text({text:'PREVIEW / NO SERVER TIMELINE',style:{fontFamily:'Consolas, monospace',fontSize:13,fill:0xff6b81,fontWeight:'800',letterSpacing:1.4}});
  gate.anchor.set(1,0);
  gate.position.set(VIEW.width-54,31);
  uiLayer.addChild(topRail,line,mode,gate);
}

class EventFxLab{
  constructor(){
    this.host=document.getElementById('eventFxStage');
    this.app=null;
    this.selected='critical';
    this.playing=false;
    this.sequenceCancelled=false;
    this.sequenceToken=0;
    this.playToken=0;
    this.readyEffects=[];
    this.audio=new EventAudioMixer({volume:.72});
    this.timeline=null;
    this.bound=[];
  }

  async mount(){
    this.app=new Application();
    await this.app.init({
      width:VIEW.width,
      height:VIEW.height,
      backgroundAlpha:0,
      antialias:true,
      autoDensity:true,
      resolution:Math.min(devicePixelRatio||1,2),
      preference:'webgl',
      powerPreference:'high-performance'
    });
    this.app.canvas.className='v3-event-fx-canvas';
    this.app.canvas.setAttribute('aria-hidden','true');
    this.host.appendChild(this.app.canvas);

    const [backgroundTexture,allyTexture,enemyTexture,readyAtlases]=await Promise.all([
      Assets.load(ART.background),Assets.load(ART.ally),Assets.load(ART.enemy),EventEffectFX.preloadAll()
    ]);
    this.audio.prepare();

    const root=new Container({label:'EventFxLabRoot'});
    const stage=new Container({sortableChildren:true,label:'BattleStage'});
    const backgroundLayer=new Container({label:'BackgroundLayer'});
    const combatLayer=new Container({sortableChildren:true,label:'CombatBillboardLayer'});
    const effectLayer=new Container({sortableChildren:true,label:'EffectLayer'});
    const uiLayer=new Container({sortableChildren:true,label:'UiLayer'});
    stage.addChild(backgroundLayer,combatLayer,effectLayer,uiLayer);
    root.addChild(stage);
    this.app.stage.addChild(root);

    const background=new Sprite(backgroundTexture);
    setCover(background,VIEW.width,VIEW.height);
    background.tint=0xa7b5c1;
    const lowerShade=new Graphics().rect(0,0,VIEW.width,VIEW.height).fill({color:0x020508,alpha:.17});
    const floorGlow=new Graphics().ellipse(VIEW.width*.5,VIEW.height*.78,1120,260).fill({color:0x2a89a7,alpha:.08});
    floorGlow.filters=[new BlurFilter({strength:32,quality:2})];
    backgroundLayer.addChild(background,lowerShade,floorGlow);

    const ally=addActor({texture:allyTexture,x:420,y:720,scale:.82,name:'조은 · PRESTIGE',team:'ALLY',accent:0x63e8ff});
    const enemy=addActor({texture:enemyTexture,x:1175,y:678,scale:.83,name:'FAKER · FUR',team:'ENEMY',accent:0xff526b});
    combatLayer.addChild(ally.root,enemy.root);
    combatLayer.sortChildren();
    createBattleUi(uiLayer);

    this.timeline=new EventTimeline({
      ...VIEW,stage,backgroundLayer,combatLayer,effectLayer,uiLayer,ally,enemy,app:this.app,audio:this.audio,
      onReadout:value=>{document.getElementById('eventReadout').textContent=value},
      onFrame:frame=>{document.getElementById('eventReadout').dataset.frame=String(frame).padStart(2,'0')}
    });

    this.bindUi();
    this.readyEffects=EventEffectFX.diagnostics().ready;
    this.select('critical');
    document.getElementById('loadingState').classList.add('is-hidden');
    const state=document.querySelector('.engine-state');
    state.classList.add(readyAtlases===6?'ready':'error');
    document.getElementById('engineStatus').textContent=readyAtlases===6?'READY · 6/6':`ASSET WAIT · ${readyAtlases}/6`;
    document.getElementById('engineLight').title=readyAtlases===6?'6개 아틀라스 준비 완료':'일부 아틀라스 파일 대기 중';
    document.getElementById('playSelected').disabled=readyAtlases===0;
    document.getElementById('playAll').disabled=readyAtlases!==6;
    this.app.start();
    return this;
  }

  on(element,event,handler){
    element?.addEventListener(event,handler);
    if(element)this.bound.push(()=>element.removeEventListener(event,handler));
  }

  bindUi(){
    document.querySelectorAll('[data-effect]').forEach(button=>this.on(button,'click',()=>this.select(button.dataset.effect)));
    this.on(document.getElementById('playSelected'),'click',()=>this.play(this.selected));
    this.on(document.getElementById('playAll'),'click',()=>this.playAll());
    this.on(document.getElementById('soundEnabled'),'change',event=>this.audio.setEnabled(event.target.checked));
    this.on(document.getElementById('masterVolume'),'input',event=>{
      this.audio.setVolume(event.target.value);
      document.getElementById('volumeReadout').textContent=`${Math.round(event.target.value*100)}%`;
    });
    this.on(window,'beforeunload',()=>this.destroy());
  }

  select(id){
    const profile=EVENT_EFFECTS[id];
    if(!profile)return;
    this.selected=id;
    document.documentElement.style.setProperty('--accent',`#${profile.accent.toString(16).padStart(6,'0')}`);
    document.querySelectorAll('[data-effect]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.effect===id)));
    document.getElementById('playSelectedLabel').textContent=`${profile.label} · ${profile.labelKo}`;
    document.getElementById('detailIndex').textContent=`EVENT ${profile.index}`;
    document.getElementById('detailTitle').textContent=profile.title;
    document.getElementById('detailDescription').textContent=profile.description;
    document.getElementById('detailAtlas').textContent=`12 FRAME · SCREEN · ${profile.fps}FPS`;
    document.getElementById('detailCollision').textContent=`FRAME ${String(profile.collisionFrame).padStart(2,'0')} · ${Math.round(profile.impactAt*1000)}MS`;
    document.getElementById('detailAudio').textContent=`RECORDED · SYNC ${profile.audioSyncMs}MS`;
    document.getElementById('detailIntent').textContent=profile.intent;
    document.querySelector('.effect-detail').style.setProperty('--detail-accent',`#${profile.accent.toString(16).padStart(6,'0')}`);
    document.getElementById('playSelected').disabled=!this.readyEffects.includes(id);
  }

  async play(id,{fromSequence=false}={}){
    if(!this.readyEffects.includes(id))return false;
    if(!fromSequence)this.sequenceToken+=1;
    if(this.playing)this.timeline.cancel();
    const token=++this.playToken;
    this.playing=true;
    this.setTransportState(true);
    if(this.audio.enabled)await this.audio.unlock().catch(()=>false);
    try{return await this.timeline.play(id)}finally{
      if(token===this.playToken){
        this.playing=false;
        this.setTransportState(false);
      }
    }
  }

  async playAll(){
    const sequenceToken=++this.sequenceToken;
    for(const id of Object.keys(EVENT_EFFECTS)){
      if(sequenceToken!==this.sequenceToken)break;
      this.select(id);
      await this.play(id,{fromSequence:true});
      if(sequenceToken!==this.sequenceToken)break;
      await new Promise(resolve=>setTimeout(resolve,210));
    }
  }

  setTransportState(playing){
    const play=document.getElementById('playSelected');
    play.querySelector('b').textContent=playing?'연출 재생 중':'선택 연출 재생';
    play.disabled=playing||!this.readyEffects.includes(this.selected);
    document.getElementById('playAll').disabled=playing||this.readyEffects.length!==6;
  }

  diagnostics(){
    return {
      mounted:Boolean(this.app),
      renderer:'pixi-v8-webgl',
      timeline:'gsap-authoritative-collision',
      layers:['BackgroundLayer','CombatBillboardLayer','EffectLayer','UiLayer'],
      runtimeConnected:false,
      liveFilesModified:false,
      effects:EventEffectFX.diagnostics(),
      audio:this.audio.diagnostics()
    };
  }

  destroy(){
    this.sequenceCancelled=true;
    this.sequenceToken+=1;
    this.playToken+=1;
    this.bound.splice(0).forEach(dispose=>dispose());
    this.timeline?.destroy();
    this.audio.destroy();
    this.app?.destroy(true,{children:true,texture:false,textureSource:false});
    this.app=null;
  }
}

const lab=new EventFxLab();
globalThis.ProjectVEventFxLab={
  mount:()=>lab.mount(),
  play:id=>lab.play(id),
  select:id=>lab.select(id),
  diagnostics:()=>lab.diagnostics(),
  destroy:()=>lab.destroy()
};

lab.mount().catch(error=>{
  console.error('[PROJECT V EVENT FX LAB]',error);
  document.getElementById('loadingState').innerHTML='<strong>V3 EFFECT LAB LOAD FAILED</strong><span>콘솔에서 자산 경로를 확인하세요.</span>';
  document.querySelector('.engine-state')?.classList.add('error');
  const status=document.getElementById('engineStatus');
  if(status)status.textContent='LOAD FAILED';
});

export {EventFxLab};
