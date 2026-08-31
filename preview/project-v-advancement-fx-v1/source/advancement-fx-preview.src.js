import {Application, Container, Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {ADVANCEMENT_EFFECTS, AdvancementEffectFX} from './AdvancementEffectFX.js';
import {AdvancementAudioScheduler} from './AdvancementAudioScheduler.js';

const DESIGN=Object.freeze({width:1280,height:720});
const EFFECT_CODES=Object.freeze(Object.keys(ADVANCEMENT_EFFECTS));

const host=document.getElementById('pixiStage');
const statusNode=document.getElementById('status');
const titleNode=document.getElementById('effectTitle');
const flashNode=document.getElementById('screenFlash');
const buttons=[...document.querySelectorAll('[data-class]')];
const app=new Application();
const audio=new AdvancementAudioScheduler();
const root=new Container({sortableChildren:true});
const world=new Container({sortableChildren:true});
const effectLayer=new Container({sortableChildren:true,label:'ADVANCEMENT_EFFECT_LAYER'});
const target=new Container({label:'ADVANCEMENT_IMPACT_TARGET'});
let activeTimeline=null;
let activeEffect=null;
let autoTimer=0;
let hitStopTimer=0;
let flashTimer=0;
let activeCode='';
let sequenceIndex=0;
let destroyed=false;
let assetReady={};

function drawTarget(){
  const shadow=new Graphics().ellipse(0,101,118,25).fill({color:0x000000,alpha:.58});
  const body=new Graphics()
    .roundRect(-72,-94,144,188,24)
    .fill({color:0x09151f,alpha:.98})
    .stroke({color:0x6bdcff,width:2,alpha:.58});
  const plate=new Graphics()
    .moveTo(-54,-50).lineTo(0,-80).lineTo(54,-50).lineTo(42,59).lineTo(0,81).lineTo(-42,59).closePath()
    .fill({color:0x102938,alpha:.97})
    .stroke({color:0x39738b,width:2,alpha:.76});
  const core=new Graphics()
    .circle(0,0,25).fill({color:0x050c12,alpha:1}).stroke({color:0x8beaff,width:3,alpha:.86})
    .circle(0,0,8).fill({color:0xe8fbff,alpha:1});
  target.addChild(shadow,body,plate,core);
}

function drawStage(){
  const floor=new Graphics();
  floor.ellipse(DESIGN.width/2,DESIGN.height/2+116,320,78).fill({color:0x05111a,alpha:.78});
  floor.ellipse(DESIGN.width/2,DESIGN.height/2+116,320,78).stroke({color:0x4acdf1,width:2,alpha:.13});
  floor.ellipse(DESIGN.width/2,DESIGN.height/2+116,224,53).stroke({color:0x4acdf1,width:1,alpha:.1});
  world.addChild(floor);
  target.position.set(DESIGN.width/2,DESIGN.height/2-8);
  target.zIndex=2;
  effectLayer.zIndex=10;
  world.addChild(target,effectLayer);
  root.addChild(world);
  app.stage.addChild(root);
}

function fit(){
  const width=Math.max(1,host.clientWidth);
  const height=Math.max(1,host.clientHeight);
  const scale=Math.min(width/DESIGN.width,height/DESIGN.height);
  root.scale.set(scale);
  root.position.set((width-DESIGN.width*scale)/2,(height-DESIGN.height*scale)/2);
}

function setActiveButton(code){
  for(const button of buttons){
    button.classList.toggle('is-active',button.dataset.class===code);
    button.classList.toggle('is-unavailable',assetReady[button.dataset.class]===false);
    button.disabled=assetReady[button.dataset.class]===false;
  }
}

function screenFlash(){
  globalThis.clearTimeout(flashTimer);
  flashNode.classList.remove('is-active');
  void flashNode.offsetWidth;
  flashNode.classList.add('is-active');
  flashTimer=globalThis.setTimeout(()=>flashNode.classList.remove('is-active'),50);
}

function cameraShake(amount){
  gsap.killTweensOf(world);
  gsap.timeline({onComplete:()=>world.position.set(0,0)})
    .to(world,{x:amount,y:-amount*.34,duration:.025,ease:'none'})
    .to(world,{x:-amount*.72,y:amount*.46,duration:.032,ease:'none'})
    .to(world,{x:amount*.38,y:-amount*.22,duration:.036,ease:'none'})
    .to(world,{x:0,y:0,duration:.06,ease:'power2.out'});
}

function stopActive(){
  globalThis.clearTimeout(hitStopTimer);
  hitStopTimer=0;
  if(activeTimeline){
    activeTimeline.kill();
    activeTimeline=null;
  }
  activeEffect?.release();
  activeEffect=null;
  for(const child of [...effectLayer.children])child.destroy({children:true});
  gsap.killTweensOf(world);
  gsap.killTweensOf(target.scale);
  world.position.set(0,0);
  target.scale.set(1);
}

function playClass(code,{manual=false}={}){
  const normalized=String(code||'').toUpperCase();
  const profile=ADVANCEMENT_EFFECTS[normalized];
  if(!profile||destroyed||assetReady[normalized]===false)return false;
  globalThis.clearTimeout(autoTimer);
  stopActive();
  activeCode=normalized;
  sequenceIndex=EFFECT_CODES.indexOf(normalized);
  titleNode.textContent=profile.title;
  statusNode.textContent=manual?'선택 연출 재생 · SFX 동기화':'자동 순차 재생 · 버튼 선택 시 SFX 활성';
  setActiveButton(normalized);

  activeEffect=AdvancementEffectFX.create(normalized,{x:DESIGN.width/2,y:DESIGN.height/2-8}).attach(effectLayer);
  const timeline=gsap.timeline({
    defaults:{ease:'power2.out'},
    onComplete:()=>{
      if(activeTimeline===timeline)activeTimeline=null;
      activeEffect?.release();
      activeEffect=null;
      autoTimer=globalThis.setTimeout(playNext,950);
    }
  });
  activeTimeline=timeline;
  activeEffect.play(timeline,{impactAt:profile.impactAt});
  timeline.call(()=>{
    screenFlash();
    cameraShake(profile.shake);
    timeline.pause();
    hitStopTimer=globalThis.setTimeout(()=>{
      hitStopTimer=0;
      if(activeTimeline===timeline)timeline.resume();
    },profile.hitStopMs);
  },[],profile.impactAt);
  timeline.to(target.scale,{x:1.04,y:.96,duration:.045},profile.impactAt);
  timeline.to(target.scale,{x:1,y:1,duration:.11,ease:'back.out(2)'},profile.impactAt+.045);
  audio.scheduleImpact(normalized,{impactAt:profile.impactAt});
  return true;
}

function playNext(){
  for(let offset=1;offset<=EFFECT_CODES.length;offset+=1){
    const index=(sequenceIndex+offset)%EFFECT_CODES.length;
    const code=EFFECT_CODES[index];
    if(assetReady[code]!==false){
      sequenceIndex=index;
      playClass(code);
      return;
    }
  }
}

async function mount(){
  await app.init({
    preference:'webgl',
    resizeTo:host,
    backgroundAlpha:0,
    antialias:true,
    autoDensity:true,
    resolution:Math.min(1.5,globalThis.devicePixelRatio||1)
  });
  host.appendChild(app.canvas);
  drawTarget();
  drawStage();
  fit();
  new ResizeObserver(fit).observe(host);
  statusNode.textContent='신규 전직 아틀라스 로딩 중';
  [assetReady]=await Promise.all([
    AdvancementEffectFX.preloadAll(),
    audio.prepare()
  ]);
  const readyCodes=EFFECT_CODES.filter(code=>assetReady[code]);
  setActiveButton('');
  if(!readyCodes.length){
    statusNode.textContent='신규 아틀라스 로드 실패';
    return;
  }
  sequenceIndex=EFFECT_CODES.indexOf(readyCodes[0]);
  statusNode.textContent=`신규 전직 연출 ${readyCodes.length}/4 준비 · 버튼 선택 시 SFX 활성`;
  playClass(readyCodes[0]);
}

for(const button of buttons){
  button.addEventListener('click',async()=>{
    statusNode.textContent='녹음 SFX 준비 중';
    await audio.unlock();
    playClass(button.dataset.class,{manual:true});
  });
}

globalThis.addEventListener('pagehide',()=>{
  destroyed=true;
  globalThis.clearTimeout(autoTimer);
  globalThis.clearTimeout(hitStopTimer);
  globalThis.clearTimeout(flashTimer);
  stopActive();
  audio.destroy();
  app.destroy(true,{children:true});
},{once:true});

globalThis.ProjectVAdvancementFxPreview=Object.freeze({
  play:playClass,
  classes:EFFECT_CODES,
  diagnostics:()=>({
    renderer:app.renderer?.type,
    activeCode,
    atlas:AdvancementEffectFX.diagnostics(),
    audio:audio.diagnostics(),
    whiteFlashMs:50,
    standalone:true,
    battleRuntimeConnected:false
  })
});

mount().catch(error=>{
  console.error('[Advancement FX preview] mount failed',error);
  statusNode.textContent=`프리뷰 오류: ${error.message}`;
});
