import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text
} from 'pixi.js';
import {gsap} from 'gsap';

const CONFIG_URL='./config/prime-drop-pools.v1.json';
const FONT='Pretendard, SUIT, Arial, sans-serif';
const COLORS=Object.freeze({
  void:0x03050b,
  panel:0x080d17,
  panel2:0x0c1420,
  line:0x26374c,
  white:0xf4f8ff,
  muted:0x7e91a8,
  cyan:0x57e4ff,
  blue:0x298cff,
  violet:0x9b6cff,
  magenta:0xf05cff,
  gold:0xf0c56a,
  red:0xff586f,
  green:0x64efba
});
const TIER_COLORS=Object.freeze({STANDARD:0x77879a,FEATURED:0x4eddf7,HERO:0xa87cff,CINEMATIC:0xffcf70});
const TIER_ORDER=Object.freeze({STANDARD:0,FEATURED:1,HERO:2,CINEMATIC:3});
const SFX=Object.freeze({
  swipe:'/assets/sfx/v3-role-impact-v2/speed.mp3',
  lock:'/assets/sfx/v3-role-impact-v2/defense.mp3',
  equipment:'/assets/sfx/v3-advancement-awakening-v1/shatter-advancement-v1.mp3',
  vehicle:'/assets/sfx/v3-advancement-awakening-v1/afterimage-advancement-v1.mp3',
  cinematic:'/assets/sfx/v3-advancement-awakening-v1/immortal-advancement-v1.mp3'
});

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const money=value=>Number(value||0).toLocaleString('ko-KR');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const RETIRE_DELAY_MS=96;

function label(text,size=16,color=COLORS.white,weight='700',align='left'){
  return new Text({text,style:{fontFamily:FONT,fontSize:size,fill:color,fontWeight:weight,align,letterSpacing:size>=18?.5:.15}});
}

function panel(width,height,{color=COLORS.panel,alpha=.92,radius=18,line=COLORS.line,lineAlpha=.7,lineWidth=1}={}){
  const graphic=new Graphics();
  graphic.roundRect(0,0,width,height,radius).fill({color,alpha}).stroke({color:line,width:lineWidth,alpha:lineAlpha});
  return graphic;
}

function fitSprite(sprite,width,height){
  const scale=Math.min(width/sprite.texture.width,height/sprite.texture.height);
  sprite.scale.set(scale);
  sprite.anchor.set(.5);
  return scale;
}

function killDisplayTweens(node){
  if(!node)return;
  for(const target of [node,node.position,node.scale,node.pivot,node.skew,node.transform])if(target)try{gsap.killTweensOf(target)}catch(_){}
  for(const child of [...(node.children||[])])killDisplayTweens(child);
}

function retireDisplayObject(node){
  if(!node)return;
  killDisplayTweens(node);
  try{node.eventMode='none';node.visible=false}catch(_){}
  setTimeout(()=>{try{killDisplayTweens(node);if(!node.destroyed)node.destroy({children:true,texture:false,textureSource:false})}catch(_){}},RETIRE_DELAY_MS);
}

function disposeChildren(container){
  for(const child of container.removeChildren())retireDisplayObject(child);
}

function timelineDone(timeline,timeoutMs=2200){
  return new Promise(resolve=>{
    let settled=false;
    const finish=completed=>{if(settled)return;settled=true;clearTimeout(timer);timeline.eventCallback('onComplete',null);timeline.eventCallback('onInterrupt',null);resolve(completed)};
    const timer=setTimeout(()=>{try{timeline.kill()}catch(_){}finish(false)},timeoutMs);
    timeline.eventCallback('onComplete',()=>finish(true));
    timeline.eventCallback('onInterrupt',()=>finish(false));
  });
}

class SoundBank{
  constructor(){
    this.enabled=true;
    this.master=.12;
    this.nodes=new Set();
    this.preloaded=new Map();
  }

  preload(){
    for(const [key,src] of Object.entries(SFX)){
      const audio=new Audio(src);
      audio.preload='auto';
      audio.volume=0;
      audio.load();
      this.preloaded.set(key,audio);
    }
  }

  play(key,gain=1){
    if(!this.enabled||!SFX[key])return null;
    const audio=new Audio(SFX[key]);
    audio.preload='auto';
    audio.volume=clamp(this.master*gain,0,1);
    this.nodes.add(audio);
    const cleanup=()=>this.nodes.delete(audio);
    audio.addEventListener('ended',cleanup,{once:true});
    audio.addEventListener('error',cleanup,{once:true});
    audio.play().catch(cleanup);
    return audio;
  }

  stop(){
    for(const audio of this.nodes){audio.pause();audio.currentTime=0}
    this.nodes.clear();
  }
}

class PrimeDrawOpeningPreview{
  constructor(host){
    this.host=host;
    this.app=null;
    this.config=null;
    this.pools=[];
    this.poolIndex=0;
    this.batchChoice=10;
    this.selectedEntryByPool=new Map();
    this.textures=new Map();
    this.sound=new SoundBank();
    this.design={width:1600,height:1000,mobile:false};
    this.root=null;
    this.backgroundLayer=null;
    this.cameraLayer=null;
    this.effectLayer=null;
    this.uiLayer=null;
    this.centerDynamic=null;
    this.flash=null;
    this.dragging=false;
    this.sliderProgress=0;
    this.busy=false;
    this.idleTweens=[];
    this.motes=[];
    this.specialQueue=[];
    this.specialIndex=0;
    this.results=[];
    this.pointerMove=this.pointerMove.bind(this);
    this.pointerUp=this.pointerUp.bind(this);
  }

  async mount(){
    this.applyDocumentShell();
    this.config=await fetch(CONFIG_URL,{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error(`드랍풀 설정을 불러오지 못했습니다. (${response.status})`);
      return response.json();
    });
    this.pools=this.config.pools||[];
    if(!this.pools.length)throw new Error('검수할 신규 드랍풀이 없습니다.');
    this.poolIndex=Math.max(0,this.pools.findIndex(pool=>pool.kind==='vehicle'));
    for(const pool of this.pools)this.selectedEntryByPool.set(pool.code,Math.max(0,pool.entries.length-1));

    this.design=innerWidth<=760||innerHeight>innerWidth*1.25
      ?{width:900,height:1500,mobile:true}
      :{width:1600,height:1000,mobile:false};
    this.app=new Application();
    await this.app.init({
      resizeTo:window,
      backgroundColor:COLORS.void,
      backgroundAlpha:1,
      antialias:true,
      autoDensity:true,
      resolution:Math.min(devicePixelRatio||1,2),
      preference:'webgl',
      powerPreference:'high-performance'
    });
    this.app.canvas.setAttribute('aria-label','프라임 상품 밀어서 잠금해제 WebGL 프리뷰');
    this.app.canvas.style.touchAction='none';
    this.host.appendChild(this.app.canvas);

    await this.loadAssets();
    this.createLayers();
    this.build();
    this.sound.preload();
    this.app.stage.eventMode='static';
    this.app.stage.on('pointermove',this.pointerMove);
    this.app.stage.on('pointerup',this.pointerUp);
    this.app.stage.on('pointerupoutside',this.pointerUp);
    this.app.ticker.add(ticker=>this.tick(ticker.deltaTime));
    addEventListener('resize',()=>this.resize());
    this.resize();
  }

  applyDocumentShell(){
    document.documentElement.style.cssText='margin:0;width:100%;height:100%;overflow:hidden;background:#03050b;color:#f4f8ff';
    document.body.style.cssText='margin:0;width:100%;height:100%;overflow:hidden;background:#03050b';
    this.host.style.cssText='position:fixed;inset:0;overflow:hidden;background:#03050b';
  }

  async loadAssets(){
    const urls=[...new Set(this.pools.flatMap(pool=>[pool.packAsset,...pool.entries.map(entry=>entry.image)]))];
    const loaded=await Promise.all(urls.map(async url=>[url,await Assets.load(url)]));
    this.textures=new Map(loaded);
  }

  createLayers(){
    this.root=new Container();
    this.backgroundLayer=new Container();
    this.cameraLayer=new Container();
    this.effectLayer=new Container();
    this.uiLayer=new Container();
    this.root.addChild(this.backgroundLayer,this.cameraLayer,this.effectLayer,this.uiLayer);
    this.app.stage.addChild(this.root);
  }

  build(){
    this.killIdleTweens();
    disposeChildren(this.backgroundLayer);
    disposeChildren(this.cameraLayer);
    disposeChildren(this.effectLayer);
    disposeChildren(this.uiLayer);
    this.motes=[];
    this.sliderProgress=0;
    this.dragging=false;
    this.busy=false;
    this.drawBackground();
    this.drawHeader();
    this.drawPackSelectors();
    this.drawCenterStage();
    this.drawItemSettings();
    this.createFlash();
  }

  drawBackground(){
    const {width,height}=this.design;
    this.backgroundLayer.addChild(new Graphics().rect(0,0,width,height).fill(COLORS.void));

    const leftGlow=new Graphics().circle(0,height*.62,height*.54).fill({color:COLORS.blue,alpha:.12});
    leftGlow.filters=[new BlurFilter({strength:90,quality:2})];
    this.backgroundLayer.addChild(leftGlow);
    const rightGlow=new Graphics().circle(width,height*.26,height*.46).fill({color:COLORS.violet,alpha:.115});
    rightGlow.filters=[new BlurFilter({strength:100,quality:2})];
    this.backgroundLayer.addChild(rightGlow);

    const grid=new Graphics();
    for(let x=0;x<=width;x+=80)grid.moveTo(x,0).lineTo(x,height);
    for(let y=0;y<=height;y+=80)grid.moveTo(0,y).lineTo(width,y);
    grid.stroke({color:0x1b2b40,width:1,alpha:.16});
    this.backgroundLayer.addChild(grid);

    const vignette=new Graphics();
    vignette.rect(0,0,width,26).fill({color:0x000000,alpha:.55});
    vignette.rect(0,height-34,width,34).fill({color:0x000000,alpha:.65});
    this.backgroundLayer.addChild(vignette);

    const moteCount=this.design.mobile?52:86;
    for(let i=0;i<moteCount;i++){
      const mote=new Graphics().circle(0,0,i%7===0?2.2:1.1).fill({color:i%5===0?COLORS.gold:COLORS.cyan,alpha:.18+(i%5)*.08});
      mote.position.set(Math.random()*width,Math.random()*height);
      mote._speed=.08+Math.random()*.28;
      mote._drift=(Math.random()-.5)*.12;
      mote.blendMode='add';
      this.backgroundLayer.addChild(mote);
      this.motes.push(mote);
    }
  }

  drawHeader(){
    const mobile=this.design.mobile;
    const x=mobile?32:42;
    const eyebrow=label('SOOPKETMON · PREMIUM ACQUISITION LAB',mobile?15:14,COLORS.cyan,'800');
    eyebrow.position.set(x,mobile?25:30);
    const title=label('프라임 봉인 해제',mobile?37:34,COLORS.white,'900');
    title.position.set(x,mobile?49:54);
    const sub=label('신규 드랍풀 · 개별 연출 규칙 · 일괄 개봉 검수',mobile?14:13,COLORS.muted,'600');
    sub.position.set(x,mobile?98:96);
    this.uiLayer.addChild(eyebrow,title,sub);

    const renderer=label('PIXIJS 8 · WEBGL / GSAP CLOCK',mobile?11:12,COLORS.gold,'800');
    renderer.anchor.set(1,0);
    renderer.position.set(this.design.width-(mobile?32:42),mobile?34:38);
    const state=label('PREVIEW ONLY · RUNTIME OFF',mobile?10:11,COLORS.red,'800');
    state.anchor.set(1,0);
    state.position.set(renderer.x,mobile?60:63);
    this.uiLayer.addChild(renderer,state);
  }

  layout(){
    if(this.design.mobile){
      return {
        selectors:{x:28,y:128,w:844,h:76,gap:14,horizontal:true},
        stage:{x:28,y:220,w:844,h:830},
        settings:{x:28,y:1070,w:844,h:394}
      };
    }
    return {
      selectors:{x:38,y:132,w:268,h:818,gap:18,horizontal:false},
      stage:{x:328,y:132,w:826,h:818},
      settings:{x:1176,y:132,w:386,h:818}
    };
  }

  drawPackSelectors(){
    const area=this.layout().selectors;
    const wrapper=new Container();
    wrapper.position.set(area.x,area.y);
    if(!area.horizontal)wrapper.addChild(panel(area.w,area.h,{alpha:.78,radius:20}));
    this.uiLayer.addChild(wrapper);

    if(!area.horizontal){
      const head=label('신규 상품 선택',18,COLORS.white,'850');head.position.set(22,20);
      const sub=label('기존 재고·드랍풀과 분리',11,COLORS.muted,'650');sub.position.set(22,48);
      wrapper.addChild(head,sub);
    }

    this.pools.forEach((pool,index)=>{
      const active=index===this.poolIndex;
      const w=area.horizontal?(area.w-area.gap)/2:area.w-28;
      const h=area.horizontal?area.h:238;
      const x=area.horizontal?index*(w+area.gap):14;
      const y=area.horizontal?0:82+index*(h+16);
      const card=new Container();
      card.position.set(x,y);
      card.eventMode='static';
      card.cursor='pointer';
      const bg=panel(w,h,{color:active?0x102033:COLORS.panel2,alpha:.96,radius:16,line:active?COLORS.cyan:COLORS.line,lineAlpha:active?.95:.55,lineWidth:active?2:1});
      card.addChild(bg);
      if(area.horizontal){
        const icon=new Sprite(this.textures.get(pool.packAsset));fitSprite(icon,58,58);icon.position.set(46,h/2);card.addChild(icon);
        const name=label(pool.label,15,active?COLORS.white:0xb8c5d4,'850');name.position.set(84,17);
        const code=label(pool.kind==='equipment'?'EQUIPMENT':'VEHICLE',10,active?COLORS.cyan:COLORS.muted,'800');code.position.set(84,44);
        card.addChild(name,code);
      }else{
        const icon=new Sprite(this.textures.get(pool.packAsset));fitSprite(icon,w-44,130);icon.position.set(w/2,82);card.addChild(icon);
        const name=label(pool.label,16,active?COLORS.white:0xb8c5d4,'850');name.anchor.set(.5,0);name.position.set(w/2,154);
        const price=label(`예정가  ${money(pool.draftUnitPrice)} 코인`,11,active?COLORS.gold:COLORS.muted,'700');price.anchor.set(.5,0);price.position.set(w/2,183);
        const state=label(active?'SELECTED':'SELECT',10,active?COLORS.cyan:0x64758a,'850');state.anchor.set(.5,0);state.position.set(w/2,210);
        card.addChild(name,price,state);
      }
      card.on('pointertap',()=>{if(this.busy||index===this.poolIndex)return;this.poolIndex=index;this.sliderProgress=0;this.build()});
      card.on('pointerover',()=>{if(!active)bg.tint=0xc9deff});
      card.on('pointerout',()=>{bg.tint=0xffffff});
      wrapper.addChild(card);
    });

    if(!area.horizontal){
      const divider=new Graphics().moveTo(22,594).lineTo(area.w-22,594).stroke({color:COLORS.line,width:1,alpha:.7});
      const legacy=label('LEGACY SAFETY',11,COLORS.gold,'850');legacy.position.set(22,620);
      const rule=label('기존 상품  판매 OFF\n기존 재고  개봉 ON\n신규 상품  별도 코드·영수증',13,0xb9c6d4,'650');rule.position.set(22,650);rule.style.lineHeight=27;
      const untouched=label('현재 운영 데이터 변경 없음',10,COLORS.green,'800');untouched.position.set(22,752);
      wrapper.addChild(divider,legacy,rule,untouched);
    }
  }

  drawCenterStage(){
    const area=this.layout().stage;
    const shell=new Container();
    shell.position.set(area.x,area.y);
    shell.addChild(panel(area.w,area.h,{color:0x050a12,alpha:.9,radius:22,line:0x35516d,lineAlpha:.62}));
    this.cameraLayer.addChild(shell);
    this.centerDynamic=new Container();
    shell.addChild(this.centerDynamic);
    this.drawSealedState(area);
  }

  drawSealedState(area){
    disposeChildren(this.centerDynamic);
    this.centerDynamic.alpha=1;
    const pool=this.pools[this.poolIndex];
    const mobile=this.design.mobile;
    const title=label(pool.eyebrow,mobile?13:12,COLORS.cyan,'850');title.anchor.set(.5,0);title.position.set(area.w/2,25);
    const name=label(pool.label,mobile?25:24,COLORS.white,'900');name.anchor.set(.5,0);name.position.set(area.w/2,49);
    const stock=label(`검수 재고 ${money(pool.previewStock)}개 · 운영 미연결`,mobile?12:11,COLORS.muted,'650');stock.anchor.set(.5,0);stock.position.set(area.w/2,83);
    this.centerDynamic.addChild(title,name,stock);

    const arenaY=mobile?350:340;
    const aura=new Container();aura.position.set(area.w/2,arenaY);this.centerDynamic.addChild(aura);
    const haze=new Graphics().circle(0,0,mobile?240:225).fill({color:pool.kind==='vehicle'?COLORS.blue:COLORS.violet,alpha:.13});
    haze.filters=[new BlurFilter({strength:55,quality:2})];haze.blendMode='add';aura.addChild(haze);
    for(let i=0;i<3;i++){
      const ring=new Graphics().ellipse(0,0,205+i*35,74+i*16).stroke({color:i===2?COLORS.gold:COLORS.cyan,width:i===0?2:1,alpha:.26-i*.04});
      ring.rotation=(i-1)*.18;ring.blendMode='add';aura.addChild(ring);
      this.idleTweens.push(gsap.to(ring,{rotation:ring.rotation+(i%2?-.5:.5),duration:8+i*2,repeat:-1,ease:'none'}));
    }
    const pedestal=new Graphics().ellipse(0,150,mobile?245:230,58).fill({color:0x0b1727,alpha:.75}).stroke({color:COLORS.cyan,width:2,alpha:.4});
    pedestal.blendMode='add';aura.addChild(pedestal);

    this.packGroup=new Container();this.packGroup.position.set(area.w/2,arenaY-20);this.centerDynamic.addChild(this.packGroup);
    const texture=this.textures.get(pool.packAsset);
    const glow=new Sprite(texture);fitSprite(glow,mobile?500:475,mobile?465:440);glow.tint=pool.kind==='vehicle'?COLORS.cyan:COLORS.violet;glow.alpha=.24;glow.filters=[new BlurFilter({strength:24,quality:2})];glow.blendMode='add';
    const pack=new Sprite(texture);fitSprite(pack,mobile?485:455,mobile?445:420);
    this.packGroup.addChild(glow,pack);
    this.packSprite=pack;
    this.packGlow=glow;
    this.idleTweens.push(gsap.to(this.packGroup,{y:this.packGroup.y-8,duration:2.8,repeat:-1,yoyo:true,ease:'sine.inOut'}));
    this.idleTweens.push(gsap.to(glow,{alpha:.38,duration:1.7,repeat:-1,yoyo:true,ease:'sine.inOut'}));

    const lockRadius=mobile?252:238;
    this.lockNodes=[];
    for(let i=0;i<4;i++){
      const angle=-Math.PI*.78+i*Math.PI*.52;
      const lock=new Container();lock.position.set(area.w/2+Math.cos(angle)*lockRadius,arenaY+Math.sin(angle)*lockRadius*.45);
      const halo=new Graphics().circle(0,0,17).fill({color:COLORS.gold,alpha:.12});halo.filters=[new BlurFilter({strength:12,quality:1})];
      const body=new Graphics().circle(0,0,11).fill({color:0x111b2b,alpha:1}).stroke({color:COLORS.gold,width:2,alpha:.9});
      const core=new Graphics().circle(0,0,3.5).fill({color:COLORS.gold,alpha:.9});
      lock.addChild(halo,body,core);lock.blendMode='add';this.centerDynamic.addChild(lock);this.lockNodes.push(lock);
      this.idleTweens.push(gsap.to(halo,{alpha:.28,duration:.8+i*.12,repeat:-1,yoyo:true,ease:'sine.inOut'}));
    }

    const batchY=mobile?605:592;
    const batchTitle=label('일괄 개봉',11,COLORS.muted,'800');batchTitle.anchor.set(.5,0);batchTitle.position.set(area.w/2,batchY-26);this.centerDynamic.addChild(batchTitle);
    const choices=[1,10,50,'MAX'];
    const buttonW=mobile?150:126,buttonGap=mobile?12:10,total=buttonW*4+buttonGap*3,start=(area.w-total)/2;
    choices.forEach((choice,index)=>{
      const actual=choice==='MAX'?'MAX':choice;
      const selected=this.batchChoice===actual;
      const button=this.makeButton(choice==='MAX'?'최대':`${choice}개`,buttonW,46,()=>{if(this.busy)return;this.batchChoice=actual;this.drawSealedState(area)},{selected,compact:true});
      button.position.set(start+index*(buttonW+buttonGap),batchY);this.centerDynamic.addChild(button);
    });

    const selectedCount=this.batchChoice==='MAX'?Math.min(pool.previewStock,this.config.batchOpen.maxPerRequest):this.batchChoice;
    const countCopy=label(`${money(selectedCount)}개 결과를 서버에서 한 번에 확정 · 밀기 1회`,11,COLORS.muted,'650');countCopy.anchor.set(.5,0);countCopy.position.set(area.w/2,batchY+57);this.centerDynamic.addChild(countCopy);
    this.drawSlider(area,mobile?692:680);
  }

  drawSlider(area,y){
    const mobile=this.design.mobile;
    const width=mobile?730:660,height=82,padding=8,handleSize=66;
    const slider=new Container();slider.position.set((area.w-width)/2,y);slider.eventMode='static';slider.cursor='grab';slider.hitArea=new Rectangle(0,0,width,height);
    const shadow=new Graphics().roundRect(0,0,width,height,41).fill({color:0x02050a,alpha:.92}).stroke({color:COLORS.gold,width:1,alpha:.36});
    const track=new Graphics().roundRect(padding,padding,width-padding*2,height-padding*2,34).fill({color:0x0a1420,alpha:1});
    const fill=new Graphics();
    const copy=label('밀어서  잠금 해제',mobile?18:17,0xbfcbd8,'850');copy.anchor.set(.5);copy.position.set(width/2,height/2);
    const handle=new Container();
    const handleGlow=new Graphics().circle(0,0,handleSize/2).fill({color:COLORS.cyan,alpha:.18});handleGlow.filters=[new BlurFilter({strength:13,quality:1})];handleGlow.blendMode='add';
    const handleBody=new Graphics().circle(0,0,handleSize/2-3).fill({color:0x142a3b,alpha:1}).stroke({color:COLORS.cyan,width:2,alpha:.95});
    const arrows=label('››',25,COLORS.white,'900');arrows.anchor.set(.5);arrows.position.set(1,-2);handle.addChild(handleGlow,handleBody,arrows);
    slider.addChild(shadow,track,fill,copy,handle);
    slider.on('pointerdown',event=>{
      if(this.busy)return;
      this.dragging=true;
      slider.cursor='grabbing';
      this.updateSliderFromEvent(event);
    });
    this.centerDynamic.addChild(slider);
    this.slider={container:slider,fill,copy,handle,handleGlow,width,height,padding,handleSize,maxX:width-padding*2-handleSize};
    this.renderSlider();
    this.idleTweens.push(gsap.to(handleGlow,{alpha:.38,duration:.8,repeat:-1,yoyo:true,ease:'sine.inOut'}));
  }

  renderSlider(){
    if(!this.slider)return;
    const {fill,handle,copy,padding,height,handleSize,maxX}=this.slider;
    const progress=this.sliderProgress;
    const fillWidth=handleSize+maxX*progress;
    fill.clear().roundRect(padding,padding,fillWidth,height-padding*2,(height-padding*2)/2).fill({color:progress>.78?COLORS.gold:COLORS.blue,alpha:.34+.32*progress});
    handle.position.set(padding+handleSize/2+maxX*progress,height/2);
    copy.alpha=.88-progress*.62;
    copy.text=progress>.82?'놓아서 개봉':'밀어서  잠금 해제';
  }

  updateSliderFromEvent(event){
    if(!this.dragging||!this.slider)return;
    const local=event.getLocalPosition(this.slider.container);
    const left=this.slider.padding+this.slider.handleSize/2;
    this.sliderProgress=clamp((local.x-left)/this.slider.maxX,0,1);
    this.renderSlider();
    this.updateLockPreview(this.sliderProgress);
  }

  pointerMove(event){this.updateSliderFromEvent(event)}

  pointerUp(){
    if(!this.dragging||!this.slider)return;
    this.dragging=false;
    this.slider.container.cursor='grab';
    if(this.sliderProgress>=.86)void this.unlock().catch(error=>this.recoverUnlock(error));
    else this.idleTweens.push(gsap.to(this,{sliderProgress:0,duration:.34,ease:'power3.out',onUpdate:()=>{this.renderSlider();this.updateLockPreview(this.sliderProgress)}}));
  }

  updateLockPreview(progress){
    this.packGlow.alpha=.24+progress*.34;
    this.lockNodes.forEach((node,index)=>{
      node.rotation=(index%2?1:-1)*progress*.7;
      node.scale.set(1+progress*.16);
    });
  }

  drawItemSettings(){
    const area=this.layout().settings,pool=this.pools[this.poolIndex],mobile=this.design.mobile;
    const wrapper=new Container();wrapper.position.set(area.x,area.y);wrapper.addChild(panel(area.w,area.h,{alpha:.84,radius:20}));this.uiLayer.addChild(wrapper);
    const head=label('아이템별 연출 지정',mobile?18:19,COLORS.white,'900');head.position.set(20,18);
    const sub=label('행 선택 = 강제 결과 · 우측 토글 = 연출 ON/OFF',mobile?10:10,COLORS.muted,'650');sub.position.set(20,46);
    wrapper.addChild(head,sub);

    const selectedIndex=this.selectedEntryByPool.get(pool.code)||0;
    const columns=mobile?2:1;
    const gap=mobile?10:9;
    const rowW=mobile?(area.w-40-gap)/2:area.w-32;
    const rowH=mobile?76:91;
    pool.entries.forEach((entry,index)=>{
      const col=index%columns,row=Math.floor(index/columns);
      const rowBox=this.makeEntryRow(entry,index===selectedIndex,rowW,rowH,()=>{
        if(this.busy)return;
        this.selectedEntryByPool.set(pool.code,index);
        this.build();
      },()=>{
        if(this.busy)return;
        entry.presentation.enabled=!entry.presentation.enabled;
        this.build();
      });
      rowBox.position.set(16+col*(rowW+gap),74+row*(rowH+gap));wrapper.addChild(rowBox);
    });

    const rows=Math.ceil(pool.entries.length/columns);
    const footerY=74+rows*(rowH+gap)+9;
    const split=new Graphics().moveTo(18,footerY).lineTo(area.w-18,footerY).stroke({color:COLORS.line,width:1,alpha:.65});wrapper.addChild(split);
    const contract=label('DROP POOL CONTRACT',10,COLORS.cyan,'850');contract.position.set(20,footerY+17);
    const detail=label(`신규 ${pool.code}\n기존 ${pool.legacyItemCode} 참조 없음\n일괄 요청 최대 ${this.config.batchOpen.maxPerRequest}개 · 원자 영수증`,mobile?11:12,0xb8c6d6,'650');detail.position.set(20,footerY+40);detail.style.lineHeight=mobile?20:23;
    wrapper.addChild(contract,detail);

    const soundButton=this.makeButton(this.sound.enabled?'SFX 12% · ON':'SFX · OFF',mobile?155:142,40,()=>{this.sound.enabled=!this.sound.enabled;if(!this.sound.enabled)this.sound.stop();this.build()},{selected:this.sound.enabled,compact:true});
    soundButton.position.set(area.w-(mobile?175:160),footerY+22);wrapper.addChild(soundButton);
    if(!mobile){
      const instruction=label('좋은 아이템은 연출 큐에서\n중복 수량을 묶어 반드시 노출',11,COLORS.gold,'700');instruction.position.set(20,area.h-76);instruction.style.lineHeight=20;wrapper.addChild(instruction);
    }
  }

  makeEntryRow(entry,selected,width,height,onSelect,onToggle){
    const container=new Container();container.eventMode='static';container.cursor='pointer';
    const color=TIER_COLORS[entry.presentation.tier]||COLORS.muted;
    const bg=panel(width,height,{color:selected?0x111d2c:0x090f18,alpha:.98,radius:12,line:selected?color:COLORS.line,lineAlpha:selected?.95:.55,lineWidth:selected?2:1});container.addChild(bg);
    const name=label(entry.name,this.design.mobile?12:13,selected?COLORS.white:0xc5cfdb,'800');name.position.set(13,12);name.style.wordWrap=true;name.style.wordWrapWidth=width-88;
    const meta=label(`${entry.presentation.tier} · ${entry.weight}%`,9,color,'850');meta.position.set(13,height-25);
    const toggle=new Container();toggle.position.set(width-60,height/2);toggle.eventMode='static';toggle.cursor='pointer';
    const toggleBg=new Graphics().roundRect(-24,-13,48,26,13).fill({color:entry.presentation.enabled?color:0x1a2430,alpha:1}).stroke({color:entry.presentation.enabled?color:0x536477,width:1,alpha:.9});
    const knob=new Graphics().circle(entry.presentation.enabled?12:-12,0,9).fill({color:entry.presentation.enabled?COLORS.white:0x8b98a8,alpha:1});
    toggle.addChild(toggleBg,knob);
    toggle.on('pointertap',event=>{event.stopPropagation();onToggle()});
    container.addChild(name,meta,toggle);
    container.on('pointertap',onSelect);
    container.on('pointerover',()=>bg.tint=0xcfeaff);
    container.on('pointerout',()=>bg.tint=0xffffff);
    return container;
  }

  makeButton(text,width,height,onTap,{selected=false,compact=false}={}){
    const container=new Container();container.eventMode='static';container.cursor='pointer';container.hitArea=new Rectangle(0,0,width,height);
    const bg=panel(width,height,{color:selected?0x153047:0x0b141f,alpha:1,radius:compact?10:14,line:selected?COLORS.cyan:COLORS.line,lineAlpha:selected?.95:.72,lineWidth:selected?2:1});
    const copy=label(text,compact?12:15,selected?COLORS.white:0xb9c8d8,'850');copy.anchor.set(.5);copy.position.set(width/2,height/2-1);
    container.addChild(bg,copy);
    container.on('pointertap',onTap);
    container.on('pointerover',()=>{bg.tint=0xc5edff;container.scale.set(1.015)});
    container.on('pointerout',()=>{bg.tint=0xffffff;container.scale.set(1)});
    return container;
  }

  createFlash(){
    this.flash=new Graphics().rect(0,0,this.design.width,this.design.height).fill({color:0xffffff,alpha:1});
    this.flash.alpha=0;this.flash.eventMode='none';this.effectLayer.addChild(this.flash);
  }

  weightedPick(pool){
    const total=pool.entries.reduce((sum,item)=>sum+Number(item.weight||0),0);
    let roll=Math.random()*total;
    for(const item of pool.entries){roll-=Number(item.weight||0);if(roll<=0)return item}
    return pool.entries[pool.entries.length-1];
  }

  buildResults(){
    const pool=this.pools[this.poolIndex];
    const selected=pool.entries[this.selectedEntryByPool.get(pool.code)||0]||pool.entries[0];
    const count=this.batchChoice==='MAX'?Math.min(pool.previewStock,this.config.batchOpen.maxPerRequest):Number(this.batchChoice||1);
    const results=[selected];
    for(let index=1;index<count;index++)results.push(this.weightedPick(pool));
    return results;
  }

  async unlock(){
    if(this.busy)return;
    this.busy=true;
    this.dragging=false;
    this.killIdleTweens();
    this.sound.play('swipe',.55);
    const pool=this.pools[this.poolIndex];
    this.slider.copy.text='ACCESS VERIFIED';
    this.slider.copy.style.fill=COLORS.gold;
    const timeline=gsap.timeline();
    timeline.to(this.slider.handle,{x:this.slider.padding+this.slider.handleSize/2+this.slider.maxX,duration:.14,ease:'power2.out'})
      .to(this.lockNodes,{rotation:Math.PI*.9,alpha:.15,duration:.42,stagger:.045,ease:'power3.in'},.08)
      .to(this.packGroup.scale,{x:.9,y:.9,duration:.22,ease:'power2.in'},.12)
      .to(this.packGlow,{alpha:.82,duration:.28,ease:'power2.in'},.18)
      .call(()=>{this.sound.play('lock',.62);this.cameraImpact(10);this.whiteFlash(.32)},[],.31)
      .to(this.packGroup.scale,{x:1.08,y:1.08,duration:.16,ease:'power4.out'},.32)
      .to(this.centerDynamic,{alpha:0,duration:.25,ease:'power2.in'},.48);
    await timelineDone(timeline,1600);
    this.results=this.buildResults();
    const grouped=new Map();
    for(const item of this.results){
      const prior=grouped.get(item.code)||{item,count:0};prior.count++;grouped.set(item.code,prior);
    }
    this.specialQueue=[...grouped.values()]
      .filter(row=>row.item.presentation?.enabled&&TIER_ORDER[row.item.presentation?.tier]>=TIER_ORDER.FEATURED)
      .sort((a,b)=>(TIER_ORDER[b.item.presentation.tier]||0)-(TIER_ORDER[a.item.presentation.tier]||0));
    this.specialIndex=0;
    await this.openGate(pool);
    if(this.specialQueue.length)this.showSpecialResultSafely();else this.showSummary();
  }

  async openGate(pool){
    const area=this.layout().stage;
    const gate=new Container();gate.position.set(area.x,area.y);this.effectLayer.addChild(gate);
    const half=area.w/2;
    const left=new Graphics().rect(0,0,half+2,area.h).fill({color:0x050912,alpha:.98}).stroke({color:COLORS.gold,width:2,alpha:.65});
    const right=new Graphics().rect(half-2,0,half+2,area.h).fill({color:0x050912,alpha:.98}).stroke({color:COLORS.cyan,width:2,alpha:.65});
    const seam=new Graphics().rect(half-3,0,6,area.h).fill({color:pool.kind==='vehicle'?COLORS.cyan:COLORS.violet,alpha:.75});seam.filters=[new BlurFilter({strength:12,quality:2})];seam.blendMode='add';
    gate.addChild(left,right,seam);
    const copy=label('SEAL RELEASED',this.design.mobile?22:20,COLORS.white,'900');copy.anchor.set(.5);copy.position.set(half,area.h/2);gate.addChild(copy);
    const timeline=gsap.timeline();
    timeline.fromTo(copy,{alpha:0,scale:.85},{alpha:1,scale:1,duration:.18,ease:'power3.out'})
      .to(copy,{alpha:0,duration:.12},.25)
      .to(seam,{alpha:0,duration:.18},.26)
      .to(left,{x:-half-40,duration:.72,ease:'power4.inOut'},.3)
      .to(right,{x:half+40,duration:.72,ease:'power4.inOut'},.3)
      .call(()=>this.whiteFlash(.18),[],.52)
      .to(gate,{alpha:0,duration:.12},.94);
    await timelineDone(timeline,1800);
    this.effectLayer.removeChild(gate);
    retireDisplayObject(gate);
  }

  recoverUnlock(error){
    console.error('prime draw preview recovery',error);
    this.killIdleTweens();
    if(!this.results.length)this.results=this.buildResults();
    this.specialQueue=[];this.specialIndex=0;this.busy=false;
    try{this.showSummary()}catch(summaryError){console.error('prime draw preview summary recovery',summaryError);this.build()}
  }

  showSpecialResultSafely(){
    try{return this.showSpecialResult()}
    catch(error){this.recoverUnlock(error);return false}
  }

  showSpecialResult(){
    this.killIdleTweens();
    const row=this.specialQueue[this.specialIndex];
    if(!row)return this.showSummary();
    const item=row.item,pool=this.pools[this.poolIndex],area=this.layout().stage,mobile=this.design.mobile;
    disposeChildren(this.centerDynamic);this.centerDynamic.alpha=1;

    const color=TIER_COLORS[item.presentation.tier]||COLORS.violet;
    const backdrop=new Graphics().roundRect(1,1,area.w-2,area.h-2,22).fill({color:0x02050c,alpha:.985});this.centerDynamic.addChild(backdrop);
    const bloom=new Graphics().circle(area.w/2,mobile?378:365,mobile?285:265).fill({color,alpha:.2});bloom.filters=[new BlurFilter({strength:58,quality:2})];bloom.blendMode='add';this.centerDynamic.addChild(bloom);

    const beams=new Container();beams.position.set(area.w/2,mobile?390:380);this.centerDynamic.addChild(beams);
    for(let index=0;index<18;index++){
      const angle=(Math.PI*2/18)*index;
      const length=220+(index%4)*42;
      const beam=new Graphics().poly([0,-2,length,-.6,length,.6,0,2]).fill({color:index%3===0?COLORS.gold:color,alpha:.12+(index%3)*.04});
      beam.rotation=angle;beam.blendMode='add';beams.addChild(beam);
    }
    this.idleTweens.push(gsap.fromTo(beams.scale,{x:.1,y:.1},{x:1,y:1,duration:.68,ease:'expo.out'}));
    this.idleTweens.push(gsap.to(beams,{rotation:Math.PI*.18,duration:8,repeat:-1,ease:'none'}));

    const rings=new Container();rings.position.copyFrom(beams.position);this.centerDynamic.addChild(rings);
    for(let i=0;i<3;i++){
      const ring=new Graphics().circle(0,0,160+i*45).stroke({color:i===1?COLORS.gold:color,width:i===0?3:1,alpha:.45-i*.08});ring.blendMode='add';rings.addChild(ring);
      this.idleTweens.push(gsap.fromTo(ring.scale,{x:.45,y:.45},{x:1.08,y:1.08,duration:.6+i*.18,ease:'power3.out'}));
      this.idleTweens.push(gsap.to(ring,{alpha:.14,duration:.7+i*.15,repeat:-1,yoyo:true,ease:'sine.inOut'}));
    }

    const hero=new Container();hero.position.set(area.w/2,mobile?380:370);this.centerDynamic.addChild(hero);
    const texture=this.textures.get(item.image);
    const heroGlow=new Sprite(texture);fitSprite(heroGlow,mobile?650:610,mobile?465:440);heroGlow.tint=color;heroGlow.alpha=.22;heroGlow.filters=[new BlurFilter({strength:28,quality:2})];heroGlow.blendMode='add';
    const image=new Sprite(texture);fitSprite(image,mobile?620:585,mobile?435:410);
    hero.addChild(heroGlow,image);
    this.idleTweens.push(gsap.fromTo(hero.scale,{x:.35,y:.35},{x:1,y:1,duration:.72,ease:'back.out(1.45)'}));
    this.idleTweens.push(gsap.fromTo(hero,{alpha:0,rotation:-.035},{alpha:1,rotation:0,duration:.54,ease:'power3.out'}));
    this.idleTweens.push(gsap.to(hero,{y:hero.y-7,duration:2.4,repeat:-1,yoyo:true,ease:'sine.inOut'}));

    const particles=new Container();particles.position.copyFrom(hero.position);this.centerDynamic.addChild(particles);
    for(let i=0;i<(mobile?64:90);i++){
      const shard=new Graphics();
      if(i%4===0)shard.poly([0,-4,2,0,0,4,-2,0]).fill({color:i%8===0?COLORS.gold:color,alpha:.9});
      else shard.circle(0,0,.8+Math.random()*1.8).fill({color:i%5===0?COLORS.white:color,alpha:.72});
      const angle=Math.random()*Math.PI*2,distance=120+Math.random()*250;
      shard.position.set(Math.cos(angle)*distance,Math.sin(angle)*distance*.62);
      shard.blendMode='add';particles.addChild(shard);
      this.idleTweens.push(gsap.fromTo(shard,{alpha:0,scale:0},{alpha:.95,scale:1,duration:.28,delay:Math.random()*.42,ease:'power2.out'}));
      this.idleTweens.push(gsap.to(shard,{rotation:(Math.random()-.5)*3,y:shard.y-18-Math.random()*22,duration:1.4+Math.random()*1.5,repeat:-1,yoyo:true,ease:'sine.inOut'}));
    }

    const eyebrow=label(item.presentation.tier,mobile?15:14,color,'900');eyebrow.anchor.set(.5,0);eyebrow.position.set(area.w/2,mobile?635:604);
    const name=label(item.name,mobile?30:29,COLORS.white,'900','center');name.anchor.set(.5,0);name.position.set(area.w/2,mobile?663:630);name.style.wordWrap=true;name.style.wordWrapWidth=area.w-90;
    const meta=label(`${item.rarity} · 전투력 ${money(item.power)}${row.count>1?` · ×${money(row.count)}`:''}`,mobile?14:13,COLORS.gold,'750');meta.anchor.set(.5,0);meta.position.set(area.w/2,mobile?710:679);
    const fx=label(`SPECIAL PRESENTATION · ${item.presentation.effectKey}`,10,COLORS.muted,'800');fx.anchor.set(.5,0);fx.position.set(area.w/2,mobile?741:710);
    const queue=label(`특별 연출 ${this.specialIndex+1} / ${this.specialQueue.length}`,10,COLORS.cyan,'750');queue.anchor.set(.5,0);queue.position.set(area.w/2,24);
    this.centerDynamic.addChild(queue,eyebrow,name,meta,fx);

    let advanced=false;
    const button=this.makeButton(this.specialIndex+1<this.specialQueue.length?'다음 특별 보상':'전체 결과 보기',mobile?310:280,54,()=>{
      if(advanced)return;advanced=true;
      if(this.specialIndex+1<this.specialQueue.length){this.specialIndex++;this.showSpecialResultSafely()}else this.showSummary();
    },{selected:true});button.position.set((area.w-(mobile?310:280))/2,mobile?774:748);this.centerDynamic.addChild(button);

    this.sound.play(item.presentation.tier==='CINEMATIC'?'cinematic':pool.kind==='vehicle'?'vehicle':'equipment',item.presentation.tier==='CINEMATIC'?.82:.68);
    this.cameraImpact(item.presentation.tier==='CINEMATIC'?18:10);
    this.whiteFlash(item.presentation.tier==='CINEMATIC'?.4:.25);
  }

  showSummary(){
    this.killIdleTweens();
    const pool=this.pools[this.poolIndex],area=this.layout().stage,mobile=this.design.mobile;
    disposeChildren(this.centerDynamic);this.centerDynamic.alpha=1;
    const grouped=new Map();
    for(const item of this.results){const row=grouped.get(item.code)||{item,count:0};row.count++;grouped.set(item.code,row)}
    const rows=[...grouped.values()].sort((a,b)=>(TIER_ORDER[b.item.presentation.tier]||0)-(TIER_ORDER[a.item.presentation.tier]||0));
    const complete=label('BATCH UNLOCK COMPLETE',12,COLORS.cyan,'900');complete.anchor.set(.5,0);complete.position.set(area.w/2,32);
    const title=label(`${money(this.results.length)}개 일괄 개봉 완료`,mobile?28:27,COLORS.white,'900');title.anchor.set(.5,0);title.position.set(area.w/2,58);
    const copy=label(`특별 연출 ${this.specialQueue.length}종 확인 · 일반 결과 자동 집계`,12,COLORS.muted,'650');copy.anchor.set(.5,0);copy.position.set(area.w/2,98);
    this.centerDynamic.addChild(complete,title,copy);

    const cols=mobile?2:2,rowW=mobile?370:350,rowH=mobile?140:126,gapX=mobile?18:18,gapY=14;
    const gridW=cols*rowW+(cols-1)*gapX,startX=(area.w-gridW)/2,startY=140;
    rows.slice(0,8).forEach((row,index)=>{
      const x=startX+(index%cols)*(rowW+gapX),y=startY+Math.floor(index/cols)*(rowH+gapY);
      const card=new Container();card.position.set(x,y);
      const color=TIER_COLORS[row.item.presentation.tier]||COLORS.muted;
      card.addChild(panel(rowW,rowH,{color:0x09111c,alpha:.98,radius:14,line:color,lineAlpha:.44}));
      const thumb=new Sprite(this.textures.get(row.item.image));fitSprite(thumb,112,rowH-20);thumb.position.set(65,rowH/2);card.addChild(thumb);
      const name=label(row.item.name,mobile?13:13,COLORS.white,'850');name.position.set(130,20);name.style.wordWrap=true;name.style.wordWrapWidth=rowW-150;
      const tier=label(`${row.item.presentation.tier} · ${row.item.rarity}`,9,color,'850');tier.position.set(130,rowH-48);
      const count=label(`×${money(row.count)}`,19,COLORS.gold,'900');count.position.set(rowW-18,rowH-20);count.anchor.set(1,1);
      const fx=label(row.item.presentation.enabled?'연출 ON':'연출 OFF',9,row.item.presentation.enabled?COLORS.green:COLORS.muted,'750');fx.position.set(130,rowH-26);
      card.addChild(name,tier,count,fx);this.centerDynamic.addChild(card);
    });
    const button=this.makeButton('같은 설정으로 다시 개봉',mobile?340:310,56,()=>{this.sliderProgress=0;this.results=[];this.specialQueue=[];this.specialIndex=0;this.build()},{selected:true});
    button.position.set((area.w-(mobile?340:310))/2,area.h-82);this.centerDynamic.addChild(button);
  }

  cameraImpact(strength=10){
    gsap.killTweensOf(this.cameraLayer);
    const baseX=this.cameraLayer.x,baseY=this.cameraLayer.y;
    const impact=gsap.timeline().to(this.cameraLayer,{x:baseX-strength,y:baseY+strength*.35,duration:.035,ease:'none'})
      .to(this.cameraLayer,{x:baseX+strength*.7,y:baseY-strength*.5,duration:.04,ease:'none'})
      .to(this.cameraLayer,{x:baseX-strength*.35,y:baseY+strength*.2,duration:.04,ease:'none'})
      .to(this.cameraLayer,{x:baseX,y:baseY,duration:.08,ease:'power2.out'});
    this.idleTweens.push(impact);
  }

  whiteFlash(alpha=.3){
    if(!this.flash)return;
    gsap.killTweensOf(this.flash);
    this.flash.alpha=alpha;
    this.idleTweens.push(gsap.to(this.flash,{alpha:0,duration:.05,ease:'power2.out'}));
  }

  tick(deltaTime){
    const {height}=this.design;
    for(const mote of this.motes){
      mote.y-=mote._speed*deltaTime;
      mote.x+=mote._drift*deltaTime;
      if(mote.y<-10){mote.y=height+10;mote.x=Math.random()*this.design.width}
    }
  }

  killIdleTweens(){
    for(const tween of this.idleTweens)try{tween?.kill?.()}catch(_){}
    this.idleTweens=[];
    if(this.centerDynamic)killDisplayTweens(this.centerDynamic);
    if(this.cameraLayer)killDisplayTweens(this.cameraLayer);
    if(this.effectLayer)killDisplayTweens(this.effectLayer);
  }

  resize(){
    if(!this.app||!this.root)return;
    const scale=Math.min(this.app.screen.width/this.design.width,this.app.screen.height/this.design.height);
    this.root.scale.set(scale);
    this.root.position.set((this.app.screen.width-this.design.width*scale)/2,(this.app.screen.height-this.design.height*scale)/2);
    this.app.stage.hitArea=new Rectangle(0,0,this.app.screen.width,this.app.screen.height);
  }
}

async function boot(){
  const host=document.getElementById('primeDrawPreview');
  if(!host)return;
  try{
    const preview=new PrimeDrawOpeningPreview(host);
    await preview.mount();
    window.PrimeDrawOpeningPreview=preview;
  }catch(error){
    console.error(error);
    document.body.style.cssText='margin:0;min-height:100vh;display:grid;place-items:center;background:#03050b;color:#f4f8ff;font-family:Arial,sans-serif';
    const message=document.createElement('div');
    message.textContent=`WebGL 프리뷰를 시작하지 못했습니다: ${error.message||error}`;
    document.body.appendChild(message);
  }
}

boot();
