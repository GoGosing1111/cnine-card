import {Application, Assets, BlurFilter, Container, Graphics, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {CameraController} from './CameraController.js';
import {SkillTimeline} from './SkillTimeline.js';
import {createBattlePools} from './ObjectPool.js';
import {AVATAR_LAYER_ORDER, BattleCharacter, CHARACTER_STATE, TEAM} from './BattleCharacter.js';
import {applyWebGLBlendTree, SkillEffectFX, triggerWhiteFlash} from './SkillEffectFX.js';

const DESKTOP={width:1600,height:820};
const MOBILE={width:1050,height:1500};
const CARD={width:168,height:252,scale:.88};
const BUNDLE='project-v-battle-v3';
const ISO_GRID={columns:7,rows:6};
const PLAYBACK_SPEED=1.3;
const DEFAULT_BATTLEFIELD_MODE='HUNT';
const BATTLEFIELD_ASSETS=Object.freeze({
  HUNT:'../../assets/ui/project-v/battlefields/v3-nightmare-forest-battlefield-v1.png',
  TOWER:'../../assets/ui/project-v/battlefields/v3-infinite-tower-sanctum-v1.png',
  PVP:'../../assets/ui/coin-prediction/arena-v1.png',
  RAID:'../../assets/ui/project-v/battlefields/v3-world-raid-obsidian-citadel-v1.png',
  SIEGE:'../../assets/ui/project-v/battlefields/v3-siege-fortress-courtyard-v1.png'
});
const LEGACY_BATTLEFIELD='../../assets/ui/idle-dungeon/enchanted-card-battlefield-v4.webp';
const ISO_FORMATIONS=Object.freeze({
  allies:[
    {gridX:0,gridY:1,baseScale:.52},
    {gridX:2,gridY:1,baseScale:.5},
    {gridX:0,gridY:3,baseScale:.51},
    {gridX:2,gridY:3,baseScale:.49},
    {gridX:0,gridY:5,baseScale:.5}
  ],
  enemies:[
    {gridX:6,gridY:0,baseScale:.58},
    {gridX:6,gridY:2,baseScale:.64},
    {gridX:4,gridY:2,baseScale:.58},
    {gridX:4,gridY:0,baseScale:.56},
    {gridX:4,gridY:4,baseScale:.57}
  ]
});

function validateFormationTiles(formations=ISO_FORMATIONS){
  const occupied=new Set();
  Object.entries(formations).forEach(([team,slots])=>{
    slots.forEach(({gridX,gridY},index)=>{
      if(!Number.isInteger(gridX)||!Number.isInteger(gridY)){
        throw new Error(`FORMATION_TILE_NOT_CENTERED:${team}:${index}`);
      }
      if(gridX<0||gridX>=ISO_GRID.columns||gridY<0||gridY>=ISO_GRID.rows){
        throw new Error(`FORMATION_TILE_OUT_OF_RANGE:${team}:${gridX}:${gridY}`);
      }
      const key=`${gridX}:${gridY}`;
      if(occupied.has(key))throw new Error(`FORMATION_TILE_OCCUPIED:${key}`);
      occupied.add(key);
    });
  });
}

validateFormationTiles();

const CARD_DATA=[
  {name:'FAKER',grade:'FUR',level:10,hp:88,art:'fakerArt',frame:'fakerFrame',logo:'t1Logo',wordmark:'fakerWordmark',color:0xff365c,effectProfile:'CRIMSON_RIFT',effectKind:'ATTACK',ability:'불사대마왕 · 공격력 증폭'},
  {name:'김택용',grade:'PRESTIGE',level:13,hp:71,art:'taekArt',frame:null,color:0x52e6ff,effectProfile:'STORM_COMMAND',effectKind:'SPEED',ability:'폭풍의 지휘 · 연속 공격'},
  {name:'쁠리',grade:'ZENITH',level:10,hp:93,art:'zenithArt',frame:'zenithFrame',color:0xa86cff,effectProfile:'MOON_BLOOM',effectKind:'HEAL',ability:'천상개화 · 궁극기 증폭'},
  {name:'비키니 아윤',grade:'LIMITED',level:13,hp:84,art:'ayoonArt',frame:null,color:0xff72c7,effectProfile:'WIND_CHAIN',effectKind:'ATTACK',ability:'질풍의 연계 · 추가 타격'},
  {name:'프로필찍는 봉준',grade:'FUR',level:10,hp:62,art:'bongArt',frame:null,color:0x65d9ff,effectProfile:'GUARD_PULSE',effectKind:'DEFENSE',ability:'강철의 의지 · 피해 감소'}
];

const ASSETS={
  boss:'../../assets/tower/BOSS7.jpg',
  fakerArt:'../../assets/cards/7777777.jpg',
  taekArt:'../../assets/pre/8.jpg',
  zenithArt:'../../assets/cards/ZENITH/V1.jpg',
  ayoonArt:'../../assets/cards/0725/3.jpg',
  bongArt:'../../assets/NEWCARD/8.jpg',
  fakerSprite:'../../assets/ui/project-v/characters/deck-faker-sd-v1.png?v=33-alpha-clean',
  taekSprite:'../../assets/ui/project-v/characters/deck-kimtaekyong-sd-v1.png?v=33-alpha-clean',
  ppliSprite:'../../assets/ui/project-v/characters/deck-ppli-sd-v1.png?v=33-alpha-clean',
  ayoonSprite:'../../assets/ui/project-v/characters/deck-bikini-ayoon-sd-v1.png?v=33-alpha-clean',
  bongSprite:'../../assets/ui/project-v/characters/deck-bongjun-sd-v1.png?v=33-alpha-clean',
  slimeSprite:'../../assets/ui/project-v/monsters/nightmare-slime-sd-v1.png?v=33-alpha-clean',
  fakerFrame:'../../assets/ui/card-frames/faker-t1-championship-frame-v2.png',
  zenithFrame:'../../assets/ui/card-frames/zenith-frame-concept-v2.png',
  t1Logo:'../../assets/ui/brands/t1-logo-red-official-cropped.png',
  fakerWordmark:'../../assets/ui/card-frames/faker-wordmark-clear-v2.svg',
  // Production FX atlas hook:
  // slashAtlas:'../../assets/effects/slash-yellow/slash-yellow.json'
};

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const hasFiniteNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

function normalizeBattlefieldMode(value){
  const mode=String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if(/TOWER|INFINITE/.test(mode))return 'TOWER';
  if(/PVP|RANK|RANKED|ARENA/.test(mode))return 'PVP';
  if(/RAID|WORLD_BOSS|BOSS_RAID/.test(mode))return 'RAID';
  if(/SIEGE|SEAL|TERRITORY|FORTRESS/.test(mode))return 'SIEGE';
  return DEFAULT_BATTLEFIELD_MODE;
}

function battlefieldModeFromPayload(payload){
  if(typeof payload==='string')return normalizeBattlefieldMode(payload);
  if(payload?.floor)return 'TOWER';
  const monster=payload?.monster||{};
  const battle=payload?.battleV2||{};
  return normalizeBattlefieldMode(
    payload?.battlefieldMode||payload?.battlefield||payload?.contentType||payload?.mode||
    battle?.battlefieldMode||battle?.contentType||battle?.mode||battle?.type||
    monster?.battlefieldMode||monster?.contentType||monster?.mode||monster?.type
  );
}

function rootAssetPath(value){
  const raw=String(value||'').trim().replace(/\\/g,'/');
  if(!raw)return '';
  if(/^(?:data:|blob:|https?:\/\/|\/)/i.test(raw))return raw;
  return `/${raw.replace(/^(?:\.\.\/)+/,'').replace(/^\.\//,'')}`;
}

function assetKey(value){
  try{return new URL(String(value||''),location.href).pathname}catch{return String(value||'').split('?')[0]}
}

function originalCardArtUrl(card,art){
  // The manifest source art is authoritative for a tactical cut-in. Runtime
  // adapters replace card.image with the SD battle sprite, so choosing image
  // fields first can accidentally put that sprite inside the card cut-in.
  const battleSpriteKey=assetKey(art?.primaryUrl);
  const candidates=[art?.sourceArtUrl,card?.sourceArt,card?.source_art,card?.originalCardArt,card?.imageOriginal,card?.cardImage,card?.image_url_original,card?.imageUrl,card?.image_url,card?.image];
  const source=candidates.find(value=>value&&assetKey(value)!==battleSpriteKey);
  return source?rootAssetPath(source):'';
}

async function loadBattleArtTexture(art){
  try{return await Assets.load(art.primaryUrl)}catch(error){
    if(!art?.pngFallbackUrl||art.pngFallbackUrl===art.primaryUrl)throw error;
    console.warn('[Project V V3] optimized sprite decode failed; PNG fallback is used.',error);
    return Assets.load(art.pngFallbackUrl);
  }
}

function textNode(text,size,color=0xffffff,weight='700',align='left'){
  return new Text({text,style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:size,fill:color,fontWeight:weight,align,letterSpacing:size>=14?.4:0}});
}

function rectangle(width,height,color,alpha=1,radius=0,stroke=null){
  const graphics=new Graphics();
  if(radius)graphics.roundRect(0,0,width,height,radius);else graphics.rect(0,0,width,height);
  graphics.fill({color,alpha});
  if(stroke)graphics.stroke(stroke);
  return graphics;
}

function setCover(sprite,width,height){
  const scale=Math.max(width/sprite.texture.width,height/sprite.texture.height);
  sprite.scale.set(scale);
  sprite.anchor.set(.5);
  sprite.position.set(width/2,height/2);
}

function cardAperture(data){
  if(data.logo)return {x:CARD.width*.171,y:CARD.height*.173,w:CARD.width*(1-.171*2),h:CARD.height*(1-.173-.176),radius:5};
  if(data.grade==='ZENITH')return {x:CARD.width*.098,y:CARD.height*.088,w:CARD.width*.804,h:CARD.height*.834,radius:11};
  return {x:CARD.width*.08,y:CARD.height*.06,w:CARD.width*.84,h:CARD.height*.86,radius:8};
}

function addGlow(parent,width,height,color,alpha=.26){
  const glow=rectangle(width,height,color,alpha,18);
  glow.filters=[new BlurFilter({strength:22,quality:2})];
  parent.addChild(glow);
  return glow;
}

export class BattleEngine{
  constructor({host=null,onStatus=()=>{},battleData=null}={}){
    this.host=host;
    this.onStatus=onStatus;
    this.app=null;
    this.root=null;
    this.stage=null;
    this.backgroundLayer=null;
    this.combatLayer=null;
    this.effectLayer=null;
    this.uiLayer=null;
    this.camera=null;
    this.skillTimeline=null;
    this.pools=null;
    this.textures=null;
    this.cards=[];
    this.characters=[];
    this.allies=[];
    this.enemies=[];
    this.boss=null;
    this.bossHp=72;
    this.currentEnemyTarget=null;
    this.currentAllyTarget=null;
    this.lastTargetSwitch=null;
    this.battleData=battleData;
    this.livePayload=Boolean(battleData?.battleV2);
    this.liveDeployed=false;
    this.activeMonsterArt=null;
    this.activeFallbackArt=[];
    this.uniquePreviewIndex=0;
    this.visible=false;
    this.requestedVisible=false;
    this.playing=false;
    this.mounted=false;
    this.autoMode=true;
    this.mobile=false;
    this.scene={...DESKTOP};
    this.backgroundSprite=null;
    this.activeBattlefieldMode=battlefieldModeFromPayload(battleData);
    this.activeBattlefieldTexture=null;
    this.activeBattlefieldAsset=BATTLEFIELD_ASSETS[this.activeBattlefieldMode];
    this.battlefieldRequest=0;
    this.parallaxLayers=[];
    this.parallaxTicker=null;
    this.isoFloorLayer=null;
    this.isoTiles=[];
    this.isoConfig=null;
    this.depthTicker=null;
    this.bottomShade=null;
    this.motes=[];
    this.moteTicker=null;
    this.simpleTimelines=new Set();
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onVisibility=()=>this.setVisible(this.requestedVisible);
  }

  async mount(target=this.host||document.getElementById('pvPixiBattle')){
    if(this.mounted)return this;
    if(!target)throw new Error('전투 렌더링 영역을 찾지 못했습니다.');
    this.host=target;
    this.app=new Application();
    await this.app.init({
      resizeTo:target,
      backgroundAlpha:0,
      antialias:true,
      autoDensity:true,
      resolution:Math.min(devicePixelRatio||1,2),
      preference:'webgl',
      powerPreference:'high-performance'
    });
    this.app.canvas.className='pv-pixi-canvas';
    this.app.canvas.setAttribute('aria-hidden','true');
    target.appendChild(this.app.canvas);

    const battlefieldTexturePromise=this.loadBattlefieldTexture(this.activeBattlefieldMode);
    if(this.livePayload){
      // Production battles must not download the 10MB preview roster before
      // the authoritative server cards and monster are known. Empty textures
      // keep the shared actor/card geometry intact until setBattlePayload()
      // installs the live art below.
      this.textures=Object.fromEntries(Object.keys(ASSETS).map(key=>[key,Texture.EMPTY]));
    }else{
      Assets.addBundle(BUNDLE,ASSETS);
      this.textures=await Assets.loadBundle(BUNDLE);
    }
    this.activeBattlefieldTexture=await battlefieldTexturePromise;

    this.root=new Container();
    this.stage=new Container({sortableChildren:true,label:'BattleStage'});
    this.backgroundLayer=new Container({label:'BackgroundLayer'});
    // The floor is projected by gridToScreen; actors must remain on this
    // unrotated, non-squashed billboard layer. Camera shake/zoom lives on the
    // parent stage and remains intentionally visible.
    this.combatLayer=new Container({sortableChildren:true,label:'CombatBillboardLayer'});
    this.combatLayer.rotation=0;
    this.combatLayer.scale.set(1,1);
    this.combatLayer.skew.set(0,0);
    this.combatLayer.isBillboardLayer=true;
    this.effectLayer=new Container({sortableChildren:true,label:'EffectLayer'});
    this.uiLayer=new Container({sortableChildren:true,label:'UiLayer'});
    this.stage.addChild(this.backgroundLayer,this.combatLayer,this.effectLayer,this.uiLayer);
    this.root.addChild(this.stage);
    this.app.stage.addChild(this.root);

    this.camera=new CameraController(this.stage,DESKTOP);
    this.pools=createBattlePools();
    this.skillTimeline=new SkillTimeline({
      ...DESKTOP,
      backgroundLayer:this.backgroundLayer,
      combatLayer:this.combatLayer,
      effectLayer:this.effectLayer,
      uiLayer:this.uiLayer,
      camera:this.camera,
      pools:this.pools,
      ticker:this.app.ticker,
      playbackSpeed:PLAYBACK_SPEED,
      reducedMotion:this.reducedMotion
    });

    this.createBackground();
    this.createIsometricFloor();
    this.cards=CARD_DATA.map((data,index)=>this.createCard(data,index));
    this.cards.forEach(card=>this.combatLayer.addChild(card));
    await this.createCharacters();
    this.boss=this.enemies[1];
    this.currentEnemyTarget=this.boss;
    this.currentAllyTarget=this.allies[0]||null;
    if(this.boss)this.boss.isBoss=true;
    this.createUi();
    this.app.renderer.on('resize',()=>this.resize());
    this.resize();
    this.bindControls();
    document.addEventListener('visibilitychange',this.onVisibility);
    this.host.querySelector('.pv-pixi-loading')?.remove();
    this.mounted=true;
    this.app.stop();
    return this;
  }

  createBackground(){
    const definitions=[
      {label:'Sky',coefficient:.2,start:0,end:.42},
      {label:'City',coefficient:.5,start:.38,end:.74},
      {label:'Ground',coefficient:1,start:.7,end:1}
    ];
    definitions.forEach(definition=>{
      const layer=new Container({label:definition.label});
      const sprite=new Sprite(this.activeBattlefieldTexture);
      sprite.alpha=.96;
      const mask=new Graphics();
      layer.addChild(sprite,mask);
      layer.mask=mask;
      layer.parallaxCoefficient=definition.coefficient;
      layer.bandStart=definition.start;
      layer.bandEnd=definition.end;
      this.parallaxLayers.push({layer,sprite,mask,...definition});
      this.backgroundLayer.addChild(layer);
    });
    this.backgroundSprite=this.parallaxLayers[0].sprite;
    this.layoutParallax(DESKTOP.width,DESKTOP.height);
    this.backgroundLayer.addChild(rectangle(DESKTOP.width,DESKTOP.height,0x03060b,.17));
    this.bottomShade=rectangle(DESKTOP.width,250,0x02040a,.62);
    this.bottomShade.y=DESKTOP.height-250;
    this.backgroundLayer.addChild(this.bottomShade);

    for(let index=0;index<32;index+=1){
      const mote=rectangle(2+(index%3),2+(index%3),index%4===0?0xffd46e:0x79e9ff,.2,4);
      mote.position.set((index*173)%DESKTOP.width,70+(index*251)%(DESKTOP.height-130));
      mote._phase=index*.41;
      this.motes.push(mote);
      this.backgroundLayer.addChild(mote);
    }
    this.moteTicker=ticker=>{
      if(!this.visible)return;
      const time=performance.now()/900;
      this.motes.forEach(mote=>{
        mote.y-=.08*ticker.deltaTime;
        mote.alpha=.13+Math.sin(time+mote._phase)*.07;
        if(mote.y<35)mote.y=this.scene.height-55;
      });
    };
    this.app.ticker.add(this.moteTicker);
    this.parallaxTicker=()=>{
      if(!this.visible||!this.stage)return;
      const cameraX=this.stage.x-this.camera.base.x;
      const cameraY=this.stage.y-this.camera.base.y;
      this.parallaxLayers.forEach(({layer,coefficient})=>{
        // The parent Stage already carries full camera motion. Moving each
        // band back by the unused portion yields exact 0.2 / 0.5 / 1.0 depth.
        layer.position.set(-cameraX*(1-coefficient),-cameraY*(1-coefficient));
      });
    };
    this.app.ticker.add(this.parallaxTicker);
  }

  async loadBattlefieldTexture(mode){
    const normalized=normalizeBattlefieldMode(mode);
    const primary=BATTLEFIELD_ASSETS[normalized]||BATTLEFIELD_ASSETS[DEFAULT_BATTLEFIELD_MODE];
    try{return await Assets.load(primary)}catch(error){
      console.warn(`[Project V V3] ${normalized} 전장 로드 실패; 호환 배경을 사용합니다.`,error);
      return Assets.load(LEGACY_BATTLEFIELD);
    }
  }

  async setBattlefield(mode,{immediate=false}={}){
    const normalized=normalizeBattlefieldMode(mode);
    this.activeBattlefieldMode=normalized;
    this.activeBattlefieldAsset=BATTLEFIELD_ASSETS[normalized];
    if(!this.mounted||!this.backgroundLayer)return normalized;
    if(this.activeBattlefieldTexture&&this.parallaxLayers.every(item=>item.sprite.texture===this.activeBattlefieldTexture)&&normalized===this.backgroundLayer.activeMode)return normalized;
    const request=++this.battlefieldRequest;
    const texture=await this.loadBattlefieldTexture(normalized);
    if(request!==this.battlefieldRequest)return this.activeBattlefieldMode;
    const apply=()=>{
      this.activeBattlefieldTexture=texture;
      this.backgroundLayer.activeMode=normalized;
      this.parallaxLayers.forEach(({sprite})=>{sprite.texture=texture});
      this.layoutParallax(this.scene.width,this.scene.height);
    };
    if(immediate||this.reducedMotion){apply();return normalized}
    await new Promise(resolve=>{
      gsap.to(this.backgroundLayer,{alpha:0,duration:.12,ease:'power1.out',onComplete:()=>{
        apply();
        gsap.to(this.backgroundLayer,{alpha:1,duration:.2,ease:'power1.out',onComplete:resolve});
      }});
    });
    this.updateStatus?.(`전장 변경 · ${normalized}`);
    return normalized;
  }

  layoutParallax(width,height){
    this.parallaxLayers.forEach(({sprite,mask,start,end})=>{
      setCover(sprite,width,height);
      mask.clear().rect(-48,height*start-4,width+96,height*(end-start)+8).fill(0xffffff);
    });
  }

  createIsometricFloor(){
    this.isoFloorLayer=new Container({label:'IsometricFloor'});
    this.isoFloorLayer.depthSortY=-100000;
    this.isoFloorLayer.eventMode='none';
    this.combatLayer.addChild(this.isoFloorLayer);
    this.configureIsometricScene();
    this.drawIsometricFloor();
    this.depthTicker=()=>this.sortCombatDepth();
    this.app.ticker.add(this.depthTicker);
  }

  configureIsometricScene(){
    this.isoConfig=this.mobile
      ?{originX:525,originY:414,tileWidth:132,tileHeight:68,farY:470,nearY:720,minScale:.84,maxScale:1.1}
      :{originX:800,originY:292,tileWidth:190,tileHeight:90,farY:405,nearY:650,minScale:.82,maxScale:1.08};
    return this.isoConfig;
  }

  gridToScreen(gridX,gridY){
    const config=this.isoConfig||this.configureIsometricScene();
    return {
      x:config.originX+(gridX-gridY)*config.tileWidth*.5,
      y:config.originY+(gridX+gridY)*config.tileHeight*.5
    };
  }

  screenToGrid(screenX,screenY){
    const config=this.isoConfig||this.configureIsometricScene();
    const dx=(screenX-config.originX)/(config.tileWidth*.5);
    const dy=(screenY-config.originY)/(config.tileHeight*.5);
    return {gridX:(dx+dy)*.5,gridY:(dy-dx)*.5};
  }

  drawIsometricFloor(){
    if(!this.isoFloorLayer||!this.isoConfig)return;
    this.isoFloorLayer.removeChildren().forEach(child=>child.destroy?.({children:true}));
    this.isoTiles=[];
    const {columns,rows}=ISO_GRID;
    const {tileWidth,tileHeight}=this.isoConfig;
    const teamTiles={
      ally:new Set(['0:1','2:1','0:3','2:3','0:5']),
      enemy:new Set(['6:0','6:2','4:2'])
    };
    for(let row=0;row<rows;row+=1){
      for(let column=0;column<columns;column+=1){
        const point=this.gridToScreen(column,row);
        const key=`${column}:${row}`;
        const ally=teamTiles.ally.has(key);
        const enemy=teamTiles.enemy.has(key);
        const accent=ally?0x40cfff:enemy?0xff536b:0x6e8aa0;
        const alpha=(ally||enemy)?0.2:0.095;
        const tile=new Container({label:`IsoTile:${key}`});
        tile.position.set(point.x,point.y);
        const lower=new Graphics()
          .poly([0,-tileHeight*.42,tileWidth*.49,0,0,tileHeight*.58,-tileWidth*.49,0])
          .fill({color:0x02060b,alpha:.74});
        lower.y=7;
        const face=new Graphics()
          .poly([0,-tileHeight*.5,tileWidth*.5,0,0,tileHeight*.5,-tileWidth*.5,0])
          .fill({color:ally?0x0a3346:enemy?0x3a111b:(column+row)%2?0x0e1922:0x101e29,alpha:(ally||enemy)?0.58:0.48})
          .stroke({width:ally||enemy?2:1,color:accent,alpha:(ally||enemy)?0.72:0.25});
        const inner=new Graphics()
          .poly([0,-tileHeight*.38,tileWidth*.38,0,0,tileHeight*.38,-tileWidth*.38,0])
          .stroke({width:1,color:accent,alpha});
        tile.addChild(lower,face,inner);
        tile.depthSortY=-100000;
        this.isoFloorLayer.addChild(tile);
        this.isoTiles.push(tile);
      }
    }
    const battlefieldOutline=new Graphics();
    const top=this.gridToScreen(0,0);
    const right=this.gridToScreen(columns-1,0);
    const bottom=this.gridToScreen(columns-1,rows-1);
    const left=this.gridToScreen(0,rows-1);
    battlefieldOutline
      .poly([top.x,top.y-tileHeight*.5,right.x+tileWidth*.5,right.y,bottom.x,bottom.y+tileHeight*.5,left.x-tileWidth*.5,left.y])
      .stroke({width:3,color:0x9bdfff,alpha:.2});
    battlefieldOutline.depthSortY=-99999;
    this.isoFloorLayer.addChild(battlefieldOutline);
  }

  depthForY(y){
    const config=this.isoConfig||this.configureIsometricScene();
    return clamp((y-config.farY)/(config.nearY-config.farY),0,1);
  }

  perspectiveScale(baseScale,y){
    const config=this.isoConfig||this.configureIsometricScene();
    const depth=this.depthForY(y);
    return baseScale*(config.minScale+(config.maxScale-config.minScale)*depth);
  }

  enforceBillboardLayer(){
    const layer=this.combatLayer;
    if(!layer)return;
    // Do not inherit an isometric floor projection here. The map obtains its
    // diamond shape from gridToScreen(), while character/card art stays
    // upright in screen space. Parent stage camera FX remain untouched.
    if(layer.rotation!==0)layer.rotation=0;
    if(layer.skew.x!==0||layer.skew.y!==0)layer.skew.set(0,0);
    if(layer.scale.x!==1||layer.scale.y!==1)layer.scale.set(1,1);
  }

  layoutCharacterGrid(){
    const apply=(character,formation)=>{
      const point=this.gridToScreen(formation.gridX,formation.gridY);
      const responsiveBase=formation.baseScale*(this.mobile ? .84 : 1);
      const scale=this.perspectiveScale(responsiveBase,point.y);
      character.gridPosition={x:formation.gridX,y:formation.gridY};
      character.designScale=responsiveBase;
      character.perspectiveResolver=y=>this.perspectiveScale(responsiveBase,y);
      character.setFormation(point.x,point.y,scale);
      character.setCompactHud?.(this.mobile);
      character.updatePerspective(this.depthForY(point.y));
      character.root.depthSortY=point.y;
    };
    this.allies.forEach((character,index)=>apply(character,ISO_FORMATIONS.allies[index]));
    this.enemies.forEach((character,index)=>apply(character,ISO_FORMATIONS.enemies[index]));
  }

  sortCombatDepth(){
    if(!this.combatLayer)return;
    this.enforceBillboardLayer();
    this.characters.forEach(character=>{
      const depth=this.depthForY(character.root.y);
      character.root.depthSortY=character.root.y;
      character.updatePerspective(depth);
      if(character.state===CHARACTER_STATE.IDLE&&!this.playing){
        const scale=character.getPerspectiveScale(character.root.y);
        character.restScale=scale;
        character.root.restScale=scale;
        character.root.scale.set(scale);
      }
    });
    this.combatLayer.children.sort((a,b)=>{
      const priority=node=>{
        if(node.depthSortY===-100000)return -100000;
        if(node.depthSortY===100000)return 100000;
        const raised=Number(node.zIndex)>=900?1000000:0;
        return raised+Number(node.depthSortY??node.y??0);
      };
      return priority(a)-priority(b);
    });
  }

  async createCharacters(){
    const definitions=[
      {id:'ALLY-01',name:'FAKER',team:TEAM.ALLY,texture:this.textures.fakerArt,fullBodyTexture:this.textures.fakerSprite,cutInTexture:this.textures.fakerArt,accent:0xff394f,hp:100},
      {id:'ALLY-02',name:'김택용',team:TEAM.ALLY,texture:this.textures.taekArt,fullBodyTexture:this.textures.taekSprite,cutInTexture:this.textures.taekArt,accent:0xffca58,hp:100},
      {id:'ALLY-03',name:'쁠리',team:TEAM.ALLY,texture:this.textures.zenithArt,fullBodyTexture:this.textures.ppliSprite,cutInTexture:this.textures.zenithArt,accent:0x78a9ff,hp:100},
      {id:'ALLY-04',name:'비키니 아윤',team:TEAM.ALLY,texture:this.textures.ayoonArt,fullBodyTexture:this.textures.ayoonSprite,cutInTexture:this.textures.ayoonArt,accent:0x5de9ff,hp:100},
      {id:'ALLY-05',name:'프로필찍는 봉준',team:TEAM.ALLY,texture:this.textures.bongArt,fullBodyTexture:this.textures.bongSprite,cutInTexture:this.textures.bongArt,accent:0x5bdcff,hp:100},
      {id:'ENEMY-01',name:'어둠 슬라임',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:250,cutInTexture:this.textures.slimeSprite,accent:0xb267ff,spriteTint:0xcab0ff,hp:100},
      {id:'ENEMY-02',name:'심연 슬라임',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:285,cutInTexture:this.textures.slimeSprite,accent:0xff496f,spriteTint:0xff83a2,hp:this.bossHp},
      {id:'ENEMY-03',name:'왕관 슬라임',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:245,cutInTexture:this.textures.slimeSprite,accent:0x53dfff,spriteTint:0x90eaff,hp:100},
      {id:'ENEMY-04',name:'결투 상대 4',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:250,cutInTexture:this.textures.slimeSprite,accent:0xffa052,hp:100},
      {id:'ENEMY-05',name:'결투 상대 5',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:250,cutInTexture:this.textures.slimeSprite,accent:0xd67cff,hp:100}
    ];
    this.characters=definitions.map(definition=>{
      const character=new BattleCharacter({...definition,x:0,y:0,scale:.55});
      if(definition.spriteTint)character.setTint(definition.spriteTint);
      return character;
    });
    this.allies=this.characters.filter(character=>character.team===TEAM.ALLY);
    this.enemies=this.characters.filter(character=>character.team===TEAM.ENEMY);
    this.characters.forEach(character=>{
      character.root.alpha=0;
      this.combatLayer.addChild(character.root);
    });
    this.combatLayer.sortChildren();
    if(this.battleData)await this.setBattlePayload(this.battleData);
  }

  monsterFromPayload(payload){
    if(payload?.monster)return payload.monster;
    if(payload?.floor)return {
      id:payload.floor.monsterId,
      monsterId:payload.floor.monsterId,
      name:payload.floor.monsterName,
      image:payload.floor.monsterImage,
      mode:'TOWER'
    };
    const cards=payload?.battleV2?.teams?.B?.cards;
    return Array.isArray(cards)
      ?cards.find(card=>/^MONSTER:/i.test(String(card?.cardId||''))||String(card?.grade||'').toUpperCase()==='MONSTER')||null
      :null;
  }

  async setBattlePayload(payload){
    this.battleData=payload;
    this.livePayload=Boolean(payload?.battleV2);
    this.liveDeployed=false;
    this.cards.forEach(card=>{
      card.visible=!this.livePayload;
      card.renderable=!this.livePayload;
      card.eventMode=this.livePayload?'none':'static';
      if(this.livePayload)card.alpha=0;
    });
    this.activeBattlefieldMode=battlefieldModeFromPayload(payload);
    this.activeBattlefieldAsset=BATTLEFIELD_ASSETS[this.activeBattlefieldMode];
    if(this.mounted)await this.setBattlefield(this.activeBattlefieldMode);
    const adapter=globalThis.ProjectVMonsterBattleArt;
    const zenithAdapter=globalThis.ProjectVBattleArt;
    const tierAdapter=globalThis.ProjectVTierBattleArt;
    const fallback=globalThis.ProjectVUnassignedBattleFallback;
    if(!this.mounted&&!this.enemies.length)return null;
    await Promise.allSettled([
      adapter?.ready?.(),
      zenithAdapter?.ready?.(),
      tierAdapter?.ready?.(),
      fallback?.ready?.()
    ].filter(Boolean));
    this.activeFallbackArt=[];

    const allyCards=Array.isArray(payload?.battleV2?.teams?.A?.cards)?payload.battleV2.teams.A.cards:[];
    const enemyCards=Array.isArray(payload?.battleV2?.teams?.B?.cards)
      ?payload.battleV2.teams.B.cards.filter(card=>!/^MONSTER:/i.test(String(card?.cardId||''))&&!['MONSTER','BOSS'].includes(String(card?.grade||'').toUpperCase()))
      :[];
    const resolveCardArt=(card,team)=>card?.projectVBattleArt
      ||zenithAdapter?.resolveForBattle?.(card,{consumer:'BATTLE_ENGINE'})
      ||tierAdapter?.resolveForV3?.(card)
      ||fallback?.resolveForV3({kind:'CARD',team});
    const allyArt=allyCards.map(card=>resolveCardArt(card,'ALLY'));
    const enemyArt=enemyCards.map(card=>resolveCardArt(card,'ENEMY'));
    const monster=this.monsterFromPayload(payload);
    const specificMonsterArt=adapter?.resolveForV3(monster,{mode:monster?.mode})||monster?.projectVMonsterArt||null;
    const monsterIsBoss=Boolean(monster?.isBoss||monster?.boss||specificMonsterArt?.isBoss);
    const monsterArt=monster?(specificMonsterArt||fallback?.resolveForV3({kind:'MONSTER',team:'ENEMY',isBoss:monsterIsBoss})):null;
    const preloadUrls=[];
    const queueCardAssets=(cards,artList)=>cards.forEach((card,index)=>{
      const art=artList[index];
      if(art?.primaryUrl)preloadUrls.push(art.primaryUrl);
      const sourceArt=originalCardArtUrl(card,art);
      if(sourceArt)preloadUrls.push(sourceArt);
    });
    queueCardAssets(allyCards,allyArt);
    queueCardAssets(enemyCards,enemyArt);
    if(monsterArt?.primaryUrl)preloadUrls.push(monsterArt.primaryUrl);
    // Pixi Assets de-duplicates identical URLs. Starting every live texture
    // request together removes the previous card-by-card network waterfall.
    await Promise.allSettled([...new Set(preloadUrls)].map(url=>Assets.load(url)));
    this.allies.forEach((character,index)=>{
      character.battleActive=allyCards.length?index<Math.min(allyCards.length,this.allies.length):true;
      character.root.visible=character.battleActive;
    });
    for(let index=0;index<Math.min(allyCards.length,this.allies.length);index+=1){
      const card=allyCards[index];
      const art=allyArt[index];
      if(!art?.primaryUrl)continue;
      const texture=await loadBattleArtTexture(art);
      const target=this.allies[index];
      target.id=card?.id||card?.cardId||target.id;
      target.cardId=card?.cardId||card?.id||target.id;
      target.serverMaxHp=Math.max(1,Number(card?.maxHp||card?.hp||100));
      target.texture=texture;
      target.useFullBodySprite(texture,260*(art.scaleMultiplier||1));
      target.setTint(0xffffff);
      const sourceArt=originalCardArtUrl(card,art);
      if(sourceArt)try{target.cutInTexture=await Assets.load(sourceArt)}catch(error){
        console.warn(`[Project V V3] ${card?.cardId||target.id} 원본 카드 컷인 로드 실패; 기존 원본을 유지합니다.`,error);
      }
      target.name=card?.name||card?.title||target.name;
      if(target.nameLabel)target.nameLabel.text=target.name;
      target.root.projectVBattleArt=art;
      if(String(art.kind||'').startsWith('UNASSIGNED_'))this.activeFallbackArt.push(art);
    }

    this.enemies.forEach(character=>{character.battleActive=false;character.root.visible=false});
    for(let index=0;index<Math.min(enemyCards.length,this.enemies.length);index+=1){
      const card=enemyCards[index];
      const art=enemyArt[index];
      if(!art?.primaryUrl)continue;
      const texture=await loadBattleArtTexture(art);
      const target=this.enemies[index];
      target.id=card?.id||card?.cardId||target.id;
      target.cardId=card?.cardId||card?.id||target.id;
      target.serverMaxHp=Math.max(1,Number(card?.maxHp||card?.hp||100));
      target.texture=texture;
      target.useFullBodySprite(texture,260*(art.scaleMultiplier||1));
      target.setTint(0xffffff);
      const sourceArt=originalCardArtUrl(card,art);
      if(sourceArt)try{target.cutInTexture=await Assets.load(sourceArt)}catch(error){
        console.warn(`[Project V V3] PVP ${target.id} 원본 카드 컷인 로드 실패; 기존 원본을 유지합니다.`,error);
      }
      target.name=card?.name||card?.title||target.name;
      if(target.nameLabel)target.nameLabel.text=target.name;
      target.root.projectVBattleArt=art;
      target.isBoss=false;
      target.battleActive=true;
      target.root.visible=true;
      if(String(art.kind||'').startsWith('UNASSIGNED_'))this.activeFallbackArt.push(art);
    }

    if(!monster&&enemyCards.length){
      this.currentEnemyTarget=this.enemies.find(character=>this.isAlive(character))||this.enemies[0]||null;
      this.boss=this.currentEnemyTarget;
      this.bossHp=this.boss?.hp??0;
      return this.currentEnemyTarget?.root?.projectVBattleArt||null;
    }
    const isBoss=monsterIsBoss;
    const art=monsterArt;
    if(!art)return null;
    const texture=await loadBattleArtTexture(art);
    const target=this.enemies[1]||this.enemies[0];
    if(!target)return null;
    target.battleActive=true;
    target.root.visible=true;
    const monsterCard=payload?.battleV2?.teams?.B?.cards?.find?.(card=>/^MONSTER:/i.test(String(card?.cardId||''))||String(card?.grade||'').toUpperCase()==='MONSTER'||String(card?.grade||'').toUpperCase()==='BOSS')||payload?.battleV2?.teams?.B?.cards?.[0];
    target.id=monsterCard?.id||monster?.cardId||monster?.id&&`MONSTER:${monster.id}`||monster?.monsterId&&`MONSTER:${monster.monsterId}`||target.id;
    target.cardId=monsterCard?.cardId||monster?.cardId||target.id;
    target.serverMaxHp=Math.max(1,Number(monsterCard?.maxHp||monsterCard?.hp||monster?.maxHp||monster?.hp||100));
    target.texture=texture;
    target.cutInTexture=texture;
    target.useFullBodySprite(texture,285*(art.scaleMultiplier||1));
    target.setTint(0xffffff);
    target.name=monster?.name||art.name;
    if(target.nameLabel)target.nameLabel.text=target.name;
    target.root.projectVMonsterArt=art;
    target.isBoss=isBoss;
    this.currentEnemyTarget=target;
    this.boss=target;
    this.bossHp=target.hp;
    if(String(art.kind||'').startsWith('UNASSIGNED_'))this.activeFallbackArt.push(art);
    this.activeMonsterArt=art;
    return art;
  }

  makeHpBar(parent,width,value,color=0x64e3a9){
    const shell=rectangle(width,12,0x03070b,.92,7,{width:1,color:0xffffff,alpha:.2});
    const fill=rectangle(Math.max(2,(width-4)*value/100),8,color,1,5);
    fill.position.set(2,2);
    parent.addChild(shell,fill);
    return {shell,fill,width:width-4,value};
  }

  setHp(bar,value,color){
    bar.value=clamp(value,0,100);
    bar.fill.width=Math.max(1,bar.width*bar.value/100);
    if(color)bar.fill.tint=color;
  }

  createCard(data,index){
    const card=new Container({label:`Card:${data.name}`});
    card.position.set(52+index*192,422+[16,6,-8,6,16][index]);
    card.baseX=card.x;
    card.baseY=card.y;
    card.restScale=CARD.scale;
    card.index=index;
    card.alpha=0;
    card.scale.set(CARD.scale);
    card.eventMode='static';
    card.cursor='pointer';
    card.data=data;
    card.depthSortY=100000;
    card.artTexture=this.textures[data.art];

    const aura=addGlow(card,CARD.width,CARD.height,data.color,.17);
    aura.alpha=.35;
    card.aura=aura;
    const shadow=rectangle(CARD.width+12,CARD.height+12,0x000000,.55,18);
    shadow.position.set(-6,8);
    card.addChild(shadow);
    card.addChild(rectangle(CARD.width,CARD.height,0x07101a,1,12));

    const aperture=cardAperture(data);
    const artHost=new Container();
    const art=new Sprite(card.artTexture);
    setCover(art,aperture.w,aperture.h);
    art.position.set(aperture.x+aperture.w/2,aperture.y+aperture.h/2);
    const mask=new Graphics().roundRect(aperture.x,aperture.y,aperture.w,aperture.h,aperture.radius).fill(0xffffff);
    artHost.addChild(art,mask);
    artHost.mask=mask;
    card.addChild(artHost);

    if(data.frame&&this.textures[data.frame]){
      const frame=new Sprite(this.textures[data.frame]);
      frame.width=CARD.width;
      frame.height=CARD.height;
      card.addChild(frame);
    }else{
      const frame=new Graphics()
        .roundRect(1,1,CARD.width-2,CARD.height-2,12)
        .stroke({width:3,color:data.color,alpha:.94});
      const inner=new Graphics()
        .roundRect(7,7,CARD.width-14,CARD.height-14,8)
        .stroke({width:1,color:0xffffff,alpha:.42});
      card.addChild(frame,inner);
    }

    if(data.logo){
      const logo=new Sprite(this.textures[data.logo]);
      logo.anchor.set(.5);
      logo.width=CARD.width*.22;
      logo.height=logo.texture.height/logo.texture.width*logo.width;
      logo.position.set(CARD.width*.5,CARD.height*.147);
      card.addChild(logo);
    }
    if(data.wordmark){
      const wordmark=new Sprite(this.textures[data.wordmark]);
      wordmark.anchor.set(.5);
      wordmark.width=CARD.width*.54;
      wordmark.height=wordmark.texture.height/wordmark.texture.width*wordmark.width;
      wordmark.position.set(CARD.width*.5,CARD.height*.884);
      card.addChild(wordmark);
    }

    const gradeWidth=data.grade==='PRESTIGE'?72:56;
    const gradePlate=rectangle(gradeWidth,22,0x04070c,.86,4,{width:1,color:data.color,alpha:.78});
    gradePlate.position.set(10,9);
    card.addChild(gradePlate);
    const grade=textNode(data.grade,data.grade==='PRESTIGE'?8:10,data.color,'900');
    grade.anchor.set(.5);
    grade.position.set(10+gradeWidth/2,20);
    card.addChild(grade);
    const level=textNode(`+${data.level}`,13,0xffffff,'900','right');
    level.anchor.set(1,0);
    level.position.set(CARD.width-10,11);
    card.addChild(level);

    if(!data.wordmark){
      const namePlate=rectangle(CARD.width-24,28,0x02050a,.84,4,{width:1,color:data.color,alpha:.36});
      namePlate.position.set(12,CARD.height-43);
      card.addChild(namePlate);
      const name=textNode(data.name,data.name.length>7?10:12,0xffffff,'800','center');
      name.anchor.set(.5);
      name.position.set(CARD.width/2,CARD.height-29);
      card.addChild(name);
    }

    const hpHost=new Container();
    hpHost.position.set(5,CARD.height+8);
    card.hp=this.makeHpBar(hpHost,CARD.width-10,data.hp);
    card.hpValue=data.hp;
    card.addChild(hpHost);
    card.on('pointertap',()=>{if(!this.playing&&this.visible)this.playSingleSkill(index)});
    return card;
  }

  createBoss(){
    const holder=new Container({label:'Enemy:Zoro'});
    holder.position.set(1215,185);
    holder.baseX=holder.x;
    holder.baseY=holder.y;
    const redGlow=addGlow(holder,270,396,0xff253f,.17);
    const panel=rectangle(270,396,0x08070b,.94,10,{width:2,color:0xff5c70,alpha:.7});
    holder.addChild(panel);
    const art=new Sprite(this.textures.boss);
    setCover(art,256,330);
    art.position.set(135,168);
    const mask=new Graphics().roundRect(7,7,256,330,7).fill(0xffffff);
    holder.addChild(art,mask);
    art.mask=mask;
    holder.art=art;
    const shade=rectangle(256,120,0x05050a,.75);
    shade.position.set(7,217);
    holder.addChild(shade);
    const threat=textNode('NIGHTMARE BOSS',9,0xff7d8a,'900','center');
    threat.anchor.set(.5);threat.position.set(135,23);holder.addChild(threat);
    const name=textNode('조로',22,0xffffff,'900','center');
    name.anchor.set(.5);name.position.set(135,286);holder.addChild(name);
    const hpHost=new Container();hpHost.position.set(25,316);holder.addChild(hpHost);
    holder.hp=this.makeHpBar(hpHost,220,this.bossHp,0xff5267);
    holder.percent=textNode(`${this.bossHp}%`,12,0xff9a8d,'900','center');
    holder.percent.anchor.set(.5);holder.percent.position.set(135,351);holder.addChild(holder.percent);
    const targetRing=new Graphics().circle(135,190,112).stroke({width:1,color:0xff5d6e,alpha:.28});
    holder.addChildAt(targetRing,0);
    holder._ticker=ticker=>{
      if(!this.visible||this.playing)return;
      targetRing.rotation+=.0018*ticker.deltaTime;
      redGlow.alpha=.3+Math.sin(performance.now()/600)*.08;
    };
    this.app.ticker.add(holder._ticker);
    return holder;
  }

  createUi(){
    const statusPanel=rectangle(600,42,0x040811,.8,7,{width:1,color:0xffd43d,alpha:.28});
    statusPanel.position.set(440,758);
    this.uiLayer.addChild(statusPanel);
    const status=textNode('PixiJS 전투 코어 · GSAP 스킬 타임라인 준비',12,0xe7eef5,'700','center');
    status.anchor.set(.5);status.position.set(740,779);this.uiLayer.addChild(status);
    this.uiLayer.status=status;
    this.uiLayer.statusPanel=statusPanel;

    const comboLabel=textNode('COMBO',9,0xffd84c,'900');
    comboLabel.position.set(1030,96);comboLabel.alpha=0;this.uiLayer.addChild(comboLabel);
    const combo=textNode('0',46,0xffffff,'900');
    combo.position.set(1030,105);combo.alpha=0;this.uiLayer.addChild(combo);
    this.uiLayer.comboLabel=comboLabel;
    this.uiLayer.combo=combo;

    const banner=new Container();
    banner.position.set(510,118);banner.alpha=0;
    const glow=addGlow(banner,580,88,0xffd43d,.22);
    banner.addChild(rectangle(580,88,0x05080c,.94,7,{width:1,color:0xffdb57,alpha:.7}));
    const type=textNode('전술 스킬 발동',10,0xffdf69,'900','center');type.anchor.set(.5);type.position.set(290,23);
    const name=textNode('',23,0xffffff,'900','center');name.anchor.set(.5);name.position.set(290,55);
    banner.addChild(type,name);
    banner.typeText=type;banner.nameText=name;banner.glow=glow;
    this.uiLayer.addChild(banner);
    this.uiLayer.banner=banner;
  }

  updateStatus(message){
    if(this.uiLayer?.status)this.uiLayer.status.text=message;
    const dom=document.getElementById('pvBattleStatus');
    if(dom)dom.textContent=message;
    this.onStatus(message);
  }

  isAlive(character){
    return Boolean(character&&character.battleActive!==false&&Number(character.hp)>0&&character.state!==CHARACTER_STATE.DEAD);
  }

  combatantById(value){
    const id=String(value?.id||value||'').trim();
    if(!id)return null;
    return this.characters.find(character=>String(character.id)===id||String(character.cardId||'')===id||id.endsWith(`:${character.cardId||character.id}`))||null;
  }

  selectLiveTarget(attacker,preferred=null){
    if(!attacker)return null;
    const candidates=attacker.team===TEAM.ENEMY?this.allies:this.enemies;
    const explicit=preferred&&typeof preferred==='object'?preferred:this.combatantById(preferred);
    if(explicit&&candidates.includes(explicit)&&this.isAlive(explicit))return explicit;
    const current=attacker.team===TEAM.ENEMY?this.currentAllyTarget:this.currentEnemyTarget;
    if(current&&candidates.includes(current)&&this.isAlive(current))return current;
    const next=candidates
      .filter(character=>this.isAlive(character))
      .sort((left,right)=>(left.root?.y||0)-(right.root?.y||0)||(left.root?.x||0)-(right.root?.x||0))[0]||null;
    if(attacker.team===TEAM.ENEMY)this.currentAllyTarget=next;
    else{
      const previous=this.currentEnemyTarget;
      this.currentEnemyTarget=next;
      this.boss=next;
      this.bossHp=next?.hp??0;
      if(previous&&next&&previous!==next){
        this.lastTargetSwitch={from:previous.id,to:next.id,at:performance.now()};
        this.updateStatus(`타깃 전환 · ${previous.name} 처치 → ${next.name} 자동 지정`);
      }
    }
    return next;
  }

  syncTargetHp(target,value){
    if(!target)return null;
    const hp=target.setHp(clamp(Number(value)||0,0,100));
    if(target.team===TEAM.ENEMY){
      if(target===this.currentEnemyTarget||target===this.boss){
        this.bossHp=hp;
        if(hp<=0){
          this.currentEnemyTarget=null;
          this.boss=null;
          this.selectLiveTarget(this.allies.find(character=>this.isAlive(character))||this.allies[0]);
        }
      }
    }else if(target===this.currentAllyTarget&&hp<=0){
      this.currentAllyTarget=null;
      this.selectLiveTarget(this.enemies.find(character=>this.isAlive(character))||this.enemies[0]);
    }
    return target;
  }

  eventHpPercent(target,value){
    if(!hasFiniteNumber(value))return null;
    const raw=Math.max(0,Number(value));
    const maxHp=Math.max(1,Number(target?.serverMaxHp||100));
    return clamp(maxHp>100||raw>100?raw/maxHp*100:raw,0,100);
  }

  syncBossHp(value){
    const attacker=this.allies.find(character=>this.isAlive(character))||this.allies[0];
    const target=this.selectLiveTarget(attacker,this.boss);
    if(!target){this.bossHp=0;return null}
    this.syncTargetHp(target,value);
    return target;
  }

  timeline(build,cleanup=()=>{}){
    return new Promise(resolve=>{
      let finished=false;
      const settle=value=>{
        if(finished)return;
        finished=true;
        this.simpleTimelines.delete(entry);
        cleanup();
        resolve(value);
      };
      const instance=gsap.timeline({paused:true,onComplete:()=>settle(true),onInterrupt:()=>settle(false)});
      const entry={instance,settle};
      this.simpleTimelines.add(entry);
      build(instance);
      instance.timeScale(this.reducedMotion?8:PLAYBACK_SPEED);
      instance.play(0);
    });
  }

  cancelTimelines(){
    this.skillTimeline?.cancelAll();
    [...this.simpleTimelines].forEach(entry=>{entry.instance.kill();entry.settle(false)});
    this.pools?.releaseAll();
    this.camera?.reset(true);
    this.playing=false;
  }

  showBanner(name,color=0xffd43d,label='전술 스킬 발동'){
    const banner=this.uiLayer.banner;
    banner.nameText.text=name;
    banner.nameText.style.fill=color;
    banner.typeText.text=label;
    banner.glow.tint=color;
    return this.timeline(timeline=>{
      timeline.set(banner,{alpha:0,y:128});
      timeline.set(banner.scale,{x:.84,y:.84});
      timeline.to(banner,{alpha:1,y:118,duration:.2,ease:'power3.out'});
      timeline.to(banner.scale,{x:1,y:1,duration:.2,ease:'back.out(1.8)'},0);
      timeline.to(banner,{alpha:0,y:104,duration:.2,ease:'power2.in'},.72);
    });
  }

  deployCards(){
    if(this.livePayload&&this.liveDeployed)return Promise.resolve(true);
    if(this.livePayload)this.liveDeployed=true;
    const activeAllies=this.allies.filter(character=>character.battleActive!==false).length;
    const activeEnemies=this.enemies.filter(character=>character.battleActive!==false).length;
    this.updateStatus(this.livePayload?'전투 배치 완료 · 자동 전투 시작':`PROJECT V V3 · ${activeAllies} 대 ${activeEnemies} SD 진형 전개`);
    return this.timeline(timeline=>{
      this.characters.filter(character=>character.battleActive!==false).forEach((character,index)=>{
        const root=character.root;
        if(this.livePayload){
          timeline.fromTo(root,
            {alpha:0,x:character.baseX,y:character.baseY+28},
            {alpha:1,x:character.baseX,y:character.baseY,duration:.28,ease:'power3.out'},
            index*.035
          );
          timeline.fromTo(root.scale,
            {x:character.restScale*.86,y:character.restScale*.86},
            {x:character.restScale,y:character.restScale,duration:.28,ease:'power3.out'},
            index*.035
          );
        }else{
          const direction=character.team===TEAM.ALLY?-1:1;
          timeline.fromTo(root,
            {alpha:0,x:character.baseX+direction*90,y:character.baseY},
            {alpha:1,x:character.baseX,y:character.baseY,duration:.34,ease:'back.out(1.4)'},
            index*.045
          );
        }
      });
      this.cards.filter(card=>card.visible&&card.renderable).forEach((card,index)=>{
        timeline.fromTo(card,{alpha:0,y:card.baseY+70,rotation:(index-2)*.025},{alpha:1,y:card.baseY,rotation:0,duration:.34,ease:'back.out(1.35)'},index*.065);
        timeline.fromTo(card.scale,{x:card.restScale*.78,y:card.restScale*.78},{x:card.restScale,y:card.restScale,duration:.34,ease:'power3.out'},index*.065);
      });
    });
  }

  normalAttack(index,{damage=128440,critical=false,attacker=null,target=null,targetHp=null,onImpact=()=>{}}={}){
    const requestedActor=attacker||this.allies[index%this.allies.length];
    const actor=this.isAlive(requestedActor)?requestedActor:(requestedActor?.team===TEAM.ENEMY?this.enemies:this.allies).find(character=>this.isAlive(character));
    const victim=this.selectLiveTarget(actor,target);
    if(!actor||!victim){
      this.updateStatus('공격 가능한 생존 대상이 없습니다.');
      return Promise.resolve(false);
    }
    const actorView=actor.root;
    const victimView=victim.root;
    const slash=this.pools.slash.acquire();
    const damageLabel=this.pools.damage.acquire();
    const impact={x:victimView.x,y:victimView.y-176};
    const isBossTarget=Boolean(victim.isBoss);
    const impactFx=new Container();
    impactFx.position.set(impact.x,impact.y+74);
    impactFx.alpha=0;
    impactFx.scale.set(.3);
    impactFx.addChild(new Graphics().circle(0,0,isBossTarget?118:68).stroke({width:isBossTarget?13:7,color:isBossTarget?0xffcf70:0xff735f,alpha:.9}));
    if(isBossTarget)impactFx.addChild(new Graphics().circle(0,0,166).stroke({width:6,color:0xffffff,alpha:.72}));
    applyWebGLBlendTree(impactFx,'screen');
    this.effectLayer.addChild(impactFx);
    slash.position.set(impact.x,impact.y);slash.visible=true;slash.scale.set(.3);applyWebGLBlendTree(slash,'add');this.effectLayer.addChild(slash);
    damageLabel.text=damage.toLocaleString('ko-KR');damageLabel.position.set(impact.x,victimView.y-280);damageLabel.visible=true;this.uiLayer.addChild(damageLabel);
    const skillEffect=SkillEffectFX.create({kind:'ATTACK',x:impact.x,y:impact.y,accent:isBossTarget?0xffcf70:0x56e7ff}).attach(this.effectLayer);
    let whiteFlashHandle=null;
    const cleanup=()=>{
      this.pools.slash.release(slash);
      this.pools.damage.release(damageLabel);
      actorView.position.set(actor.baseX,actor.baseY);
      actorView.scale.set(actor.restScale);
      actor.setState(CHARACTER_STATE.IDLE);
      victim.setState(victim.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      victim.tint=0xffffff;
      whiteFlashHandle?.release();
      skillEffect.release();
      impactFx.destroy({children:true});
    };
    this.updateStatus(`${actor.name} · ${critical?'치명타':'공격'}`);
    const vector={x:victimView.x-actor.baseX,y:victimView.y-actor.baseY};
    const distance=Math.max(1,Math.hypot(vector.x,vector.y));
    // Move all the way to the current target instead of nudging 86px from the
    // origin. The old distance made individual server TURN events look static.
    const stopDistance=isBossTarget?138:92;
    const attackPoint={
      x:victimView.x-vector.x/distance*stopDistance,
      y:victimView.y-vector.y/distance*stopDistance
    };
    const attackScale=actor.getPerspectiveScale?.(attackPoint.y)??actor.restScale;
    return this.timeline(timeline=>{
      timeline.call(()=>actor.setState(CHARACTER_STATE.MOVE),[],0);
      timeline.to(actorView,{x:attackPoint.x,y:attackPoint.y,duration:.22,ease:'power3.out'});
      timeline.to(actorView.scale,{x:attackScale*1.06,y:attackScale*1.06,duration:.22,ease:'power3.out'},0);
      timeline.set(slash,{alpha:1},.18);
      if(slash.blades)slash.blades.forEach((blade,bladeIndex)=>timeline.to(blade.scale,{x:1,duration:.1,ease:'power4.out'},.18+bladeIndex*.02));
      timeline.call(()=>{
        actor.setState(CHARACTER_STATE.ATTACK);
        victim.setState(CHARACTER_STATE.HIT);
        victim.tint=0xffd4a0;
        whiteFlashHandle?.release();
        whiteFlashHandle=triggerWhiteFlash(victim,{durationMs:Math.round(50/PLAYBACK_SPEED)});
        if(hasFiniteNumber(targetHp))this.syncTargetHp(victim,Number(targetHp));
        onImpact(victim);
      },[],.25);
      timeline.to(impactFx,{alpha:1,duration:.025,ease:'none'},.25);
      timeline.to(impactFx.scale,{x:1.5,y:1.5,duration:.1,ease:'expo.out'},.25);
      timeline.to(impactFx,{alpha:0,duration:.14,ease:'power2.in'},isBossTarget?.42:.35);
      timeline.to(slash.scale,{x:1.5,y:1.5,duration:.1,ease:'expo.out'},.25);
      skillEffect.play(timeline,{at:.25,duration:.2});
      this.camera.addShake(timeline,{intensity:isBossTarget?(critical?26:20):20,duration:isBossTarget?.31:.22,rotation:isBossTarget?.008:.004,at:.25});
      timeline.fromTo(damageLabel,{alpha:0,y:victimView.y-286},{alpha:1,y:victimView.y-316,duration:.18,ease:'back.out(2)'},.25);
      timeline.fromTo(damageLabel.scale,{x:.55,y:.55},{x:1,y:1,duration:.2,ease:'back.out(2)'},.25);
      timeline.to(damageLabel,{alpha:0,y:victimView.y-346,duration:.25,ease:'power2.in'},.48);
      timeline.to(slash,{alpha:0,duration:.2},.38);
      timeline.to(actorView,{x:actor.baseX,y:actor.baseY,duration:.3,ease:'power3.inOut'},.43);
      timeline.to(actorView.scale,{x:actor.restScale,y:actor.restScale,duration:.3,ease:'power3.inOut'},.43);
    },cleanup);
  }

  async playTacticalSkill(index,{damage=386720,critical=true,label='전술 스킬',target=null,targetHp=null,attacker=null}={}){
    const actor=attacker||this.allies[index%this.allies.length];
    const actorIndex=Math.max(0,this.allies.indexOf(actor));
    const card=this.cards[actorIndex%this.cards.length]||this.cards[0];
    const victim=this.selectLiveTarget(actor,target);
    if(!victim){this.updateStatus('스킬 대상이 없습니다.');return false}
    this.updateStatus(`${actor.name} · ${label}`);
    const result=await this.skillTimeline.play({
      attacker:actor,
      target:victim,
      enemies:this.enemies,
      damage,
      critical,
      title:actor.name,
      subtitle:this.livePayload?label:card.data.ability,
      accent:actor.accent||card.data.color||0x7edcff,
      effectProfile:card.data.effectProfile,
      effectKind:card.data.effectKind,
      targetClass:victim.isBoss?'BOSS':'MONSTER',
      onImpact:()=>this.syncTargetHp(victim,hasFiniteNumber(targetHp)?Number(targetHp):victim.hp-(critical?18:11))
    });
    return result;
  }

  /**
   * Portable renderer contract. The production API only needs to return this
   * ordered event list; combat results remain authoritative on the server.
   */
  async playEvents(events=[]){
    for(const event of events){
      if(!this.visible)break;
      const type=String(event?.type||'').toUpperCase();
      const explicitActor=this.combatantById(event.actorId)||null;
      const actor=explicitActor||clamp(Number(event.actorIndex||0),0,this.cards.length-1);
      const target=this.combatantById(event.targetId)||null;
      const targetHp=hasFiniteNumber(event.targetHp)?Number(event.targetHp):null;
      const rawTargetHp=hasFiniteNumber(event.targetHpAfter)?Number(event.targetHpAfter)
        :hasFiniteNumber(event.hpAfter)?Number(event.hpAfter)
        :targetHp!==null?targetHp
        :hasFiniteNumber(event.bossHp)?Number(event.bossHp):null;
      const resolvedTargetHp=this.eventHpPercent(target,rawTargetHp);
      const damage=Number(event.damage||0)+Number(event.absorbed||0);
      if(type==='DEPLOY')await this.deployCards();
      else if(type==='ATTACK'||type==='TURN'){
        if(event.dodge){await this.showBanner('회피 · 잔상 전개',0x62e9ff,'속도효과 발동');continue}
        await this.normalAttack(Number(event.actorIndex||0),{damage,critical:Boolean(event.critical),attacker:explicitActor,target,targetHp:resolvedTargetHp});
      }else if(type==='SKILL'){
        await this.playTacticalSkill(Number(event.actorIndex||0),{damage,critical:Boolean(event.critical),label:event.label||event.skillName||'전술 스킬',target,targetHp:resolvedTargetHp,attacker:explicitActor});
      }else if(type==='COUNTER'){
        if(explicitActor)await this.normalAttack(0,{damage,critical:Boolean(event.critical),attacker:explicitActor,target,targetHp:resolvedTargetHp});
        else await this.bossCounter(Number(event.actorIndex||0));
      }else if(type==='ULTIMATE'||type==='PVE_ULTIMATE'){
        const liveActor=explicitActor||(this.livePayload?this.allies.find(character=>this.isAlive(character)):null);
        if(liveActor)await this.playTacticalSkill(Number(event.actorIndex||0),{damage,critical:true,label:event.label||'궁극기',target,targetHp:resolvedTargetHp,attacker:liveActor});
        else await this.playUltimate({target,targetHp:resolvedTargetHp});
      }else if(type==='BOSS_ULTIMATE'){
        await this.showBanner(event.label||'보스 광역 공격',0xff5c6e,'BOSS ULTIMATE');
        for(const hit of event.hits||[]){
          const hitTarget=this.combatantById(hit.targetId);
          await this.normalAttack(0,{damage:Number(hit.damage||0)+Number(hit.absorbed||0),critical:Boolean(hit.critical),attacker:explicitActor||this.enemies.find(character=>this.isAlive(character)),target:hitTarget,targetHp:this.eventHpPercent(hitTarget,hit.targetHpAfter)});
        }
      }else if(type==='MAGIC_CARD'){
        const label=event.magicName||event.magicCode||'마법카드';
        if(damage>0)await this.playTacticalSkill(Number(event.actorIndex||0),{damage,critical:Boolean(event.critical),label,target,targetHp:resolvedTargetHp,attacker:explicitActor});
        else{
          await this.showBanner(label,event.amount?0x6affb7:0xb57cff,event.amount?'회복효과 발동':'마법효과 발동');
          if(target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp);
        }
      }else if(['TEAM_HEAL','REGEN','EMERGENCY_HEAL','SURVIVE','SINGLE_HEALER_AURA'].includes(type)){
        await this.showBanner(type==='TEAM_HEAL'?'아군 회복':type==='SURVIVE'?'불굴의 생존':'생명 회복',0x6affb7,'회복효과 발동');
        if(type==='SINGLE_HEALER_AURA')for(const item of event.targets||[]){const itemTarget=this.combatantById(item.targetId);if(itemTarget&&hasFiniteNumber(item.hpAfter))this.syncTargetHp(itemTarget,this.eventHpPercent(itemTarget,item.hpAfter))}
        else if(target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp);
      }else if(type==='KO'){
        if(target)this.syncTargetHp(target,0);
      }else if(type==='RESULT'){
        this.updateStatus(event.winner==='A'?'PROJECT V V3 · 승리':event.winner==='B'?'PROJECT V V3 · 패배':'PROJECT V V3 · 무승부');
      }
    }
  }

  async bossCounter(targetIndex=3){
    const attacker=this.selectLiveTarget({team:TEAM.ALLY},null)||this.enemies.find(character=>this.isAlive(character));
    const target=this.selectLiveTarget(attacker,this.allies[targetIndex%this.allies.length]);
    if(!attacker||!target)return false;
    this.updateStatus(`적 반격 · ${target.name} 방어 판정`);
    await this.normalAttack(0,{damage:74210,critical:false,attacker,target,targetHp:Math.max(1,target.hp-18)});
    await this.showBanner('강철의 수호 · 치명상 방지',0x69ddff,'방어효과 발동');
  }

  async playUltimate({target=null,targetHp=null}={}){
    const card=this.cards[2];
    const actor=this.allies[2];
    const victim=this.selectLiveTarget(actor,target);
    if(!victim){this.updateStatus('궁극기 대상이 없습니다.');return false}
    this.updateStatus('ZENITH 우선 발동 · 기존 궁극기 영상과 Pixi 타격 연계');
    await this.showBanner('천상개화 · 월하난무',0xc79aff,'궁극기 발동');
    const overlay=document.getElementById('pvUltimateLayer');
    const video=document.getElementById('pvUltimateVideo');
    if(overlay&&video&&!this.reducedMotion){
      overlay.classList.add('is-visible');
      video.currentTime=0;
      video.muted=true;
      const ended=new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(done)return;done=true;video.removeEventListener('ended',finish);resolve()};
        video.addEventListener('ended',finish,{once:true});
        setTimeout(finish,Math.round(2100/PLAYBACK_SPEED));
      });
      await video.play().catch(()=>{});
      await ended;
      overlay.classList.remove('is-visible');
      video.pause();
    }
    await this.skillTimeline.play({
      attacker:actor,
      target:victim,
      enemies:this.enemies,
      damage:964200,
      critical:true,
      title:'쁠리',
      subtitle:'천상개화 · 월하난무',
      accent:0xc08aff,
      effectProfile:'MOON_BLOOM',
      effectKind:'ATTACK',
      targetClass:victim.isBoss?'BOSS':'MONSTER',
      onImpact:()=>this.syncTargetHp(victim,hasFiniteNumber(targetHp)?Number(targetHp):victim.hp-38)
    });
  }

  async runSequence(){
    if(this.playing||!this.visible)return;
    this.playing=true;
    const button=document.getElementById('pvBattleStart');
    if(button){button.disabled=true;button.textContent='전투 연출 중'}
    this.cancelTimelines();
    this.playing=true;
    this.currentEnemyTarget=this.enemies[1]||this.enemies[0]||null;
    this.boss=this.currentEnemyTarget;
    this.currentAllyTarget=this.allies[0]||null;
    this.lastTargetSwitch=null;
    this.bossHp=72;
    this.cards.forEach((card,index)=>{
      card.alpha=0;
      card.position.set(card.baseX,card.baseY);
      card.scale.set(card.restScale);
      card.hpValue=CARD_DATA[index].hp;
      this.setHp(card.hp,card.hpValue,0x64e3a9);
    });
    this.characters.forEach(character=>{
      character.root.alpha=0;
      character.root.position.set(character.baseX,character.baseY);
      character.root.scale.set(character.restScale);
      character.setState(CHARACTER_STATE.IDLE);
      character.setHp(character.team===TEAM.ENEMY&&character===this.boss?72:100);
    });
    this.uiLayer.combo.alpha=0;
    this.uiLayer.comboLabel.alpha=0;
    try{
      this.uiLayer.combo.alpha=1;this.uiLayer.comboLabel.alpha=1;this.uiLayer.combo.text='1';
      await this.playEvents([
        {type:'DEPLOY'},
        {type:'ATTACK',actorIndex:1,damage:238150,critical:false,bossHp:62},
        {type:'SKILL',actorIndex:0,damage:386720,critical:true,bossHp:44,label:'전술 스킬'},
        {type:'COUNTER',actorIndex:3},
        {type:'ULTIMATE',actorIndex:2,damage:964200,targetHp:0},
        {type:'ATTACK',actorIndex:3,damage:194800,critical:false,targetHp:78}
      ]);
      this.updateStatus(`연출 완료 · 사망 대상 제외 후 ${this.currentEnemyTarget?.name||'다음 대상 없음'} 자동 전환 확인`);
    }finally{
      this.playing=false;
      if(button){button.disabled=false;button.textContent='다시 재생'}
    }
  }

  async playSingleSkill(index){
    if(this.playing||!this.visible)return;
    this.playing=true;
    try{await this.playTacticalSkill(index,{damage:128000+index*74120,critical:index===0||index===2})}finally{this.playing=false}
  }

  async verifyTargetSwitch(){
    if(this.playing||!this.visible)return false;
    this.playing=true;
    const button=document.getElementById('pvBattleRetarget');
    if(button){button.disabled=true;button.textContent='검증 중'}
    try{
      const first=this.enemies[1]||this.enemies[0];
      const next=this.enemies.find(character=>character!==first)||null;
      this.enemies.forEach(character=>{character.setState(CHARACTER_STATE.IDLE);character.setHp(character===first?1:100);character.root.alpha=1});
      this.currentEnemyTarget=first;
      this.boss=first;
      this.bossHp=first?.hp||0;
      this.lastTargetSwitch=null;
      await this.normalAttack(0,{damage:128000,critical:true,target:first,targetHp:0});
      const selected=this.selectLiveTarget(this.allies[1]||this.allies[0]);
      const passed=Boolean(selected&&selected!==first&&this.isAlive(selected));
      if(passed)await this.normalAttack(1,{damage:88400,critical:false,target:selected,targetHp:Math.max(1,selected.hp-12)});
      this.updateStatus(passed?`타깃 전환 PASS · ${first.name} → ${selected.name}`:'타깃 전환 FAIL · 생존 대상 재선택 필요');
      return {passed,from:first?.id||null,to:selected?.id||null,expected:next?.id||null};
    }finally{
      this.playing=false;
      if(button){button.disabled=false;button.textContent='타깃 전환 검증'}
    }
  }

  bindControls(){
    document.getElementById('pvBattleStart')?.addEventListener('click',()=>this.runSequence());
    document.getElementById('pvBattleRetarget')?.addEventListener('click',()=>this.verifyTargetSwitch());
    document.getElementById('pvBattleUnique')?.addEventListener('click',event=>{
      const index=this.uniquePreviewIndex%this.allies.length;
      this.uniquePreviewIndex=(index+1)%this.allies.length;
      event.currentTarget.textContent=`다음 고유효과 · ${this.cards[this.uniquePreviewIndex]?.data?.name||'FAKER'}`;
      void this.playSingleSkill(index);
    });
    document.getElementById('pvBattleAuto')?.addEventListener('click',event=>{
      this.autoMode=!this.autoMode;
      event.currentTarget.classList.toggle('is-active',this.autoMode);
      event.currentTarget.setAttribute('aria-pressed',String(this.autoMode));
    });
  }

  resize(){
    if(!this.app||!this.root)return;
    const viewportWidth=this.app.screen.width;
    const viewportHeight=this.app.screen.height;
    this.mobile=viewportWidth<=760;
    this.scene=this.mobile?{...MOBILE}:{...DESKTOP};
    this.camera.setViewport(this.scene.width,this.scene.height);
    this.skillTimeline.width=this.scene.width;
    this.skillTimeline.height=this.scene.height;
    this.layoutParallax(this.scene.width,this.scene.height);
    this.configureIsometricScene();
    this.drawIsometricFloor();
    if(this.bottomShade){this.bottomShade.width=this.scene.width;this.bottomShade.height=this.mobile?430:250;this.bottomShade.y=this.scene.height-this.bottomShade.height}
    if(this.mobile){
      this.cards.forEach((card,index)=>{card.baseX=47+index*195;card.baseY=1100+[12,5,-5,5,12][index];card.position.set(card.baseX,card.baseY);card.restScale=.78;card.scale.set(card.restScale)});
      this.uiLayer.statusPanel.position.set(225,1354);this.uiLayer.status.position.set(525,1375);
      this.uiLayer.banner.position.set(235,150);
      this.uiLayer.comboLabel.position.set(812,735);this.uiLayer.combo.position.set(812,752);
    }else{
      this.cards.forEach((card,index)=>{card.baseX=570+index*104;card.baseY=665+[8,3,-4,3,8][index];card.position.set(card.baseX,card.baseY);card.restScale=.5;card.scale.set(card.restScale)});
      this.uiLayer.statusPanel.position.set(440,758);this.uiLayer.status.position.set(740,779);
      this.uiLayer.banner.position.set(510,118);
      this.uiLayer.comboLabel.position.set(1030,96);this.uiLayer.combo.position.set(1030,105);
    }
    this.layoutCharacterGrid();
    this.sortCombatDepth();
    const scale=Math.min(viewportWidth/this.scene.width,viewportHeight/this.scene.height);
    this.root.scale.set(scale);
    this.root.position.set((viewportWidth-this.scene.width*scale)/2,(viewportHeight-this.scene.height*scale)/2);
  }

  async setVisible(next){
    this.requestedVisible=Boolean(next);
    if(!this.mounted&&this.requestedVisible)await this.mount();
    if(!this.app)return;
    this.visible=this.requestedVisible&&!document.hidden;
    if(this.visible){
      this.app.start();
      if(!this.livePayload&&this.cards.every(card=>card.alpha===0))await this.deployCards();
    }else{
      this.cancelTimelines();
      this.app.stop();
    }
  }

  diagnostics(){
    return {
      mounted:this.mounted,
      visible:this.visible,
      playing:this.playing,
      renderer:this.app?.renderer?.type||'unknown',
      resolution:this.app?.renderer?.resolution||1,
      pools:this.pools?.stats()||[],
      layerOrder:this.stage?.children.map(layer=>layer.label)||[],
      backgroundDepth:this.parallaxLayers.map(item=>({layer:item.label,coefficient:item.coefficient})),
      battlefield:{
        mode:this.activeBattlefieldMode,
        asset:this.activeBattlefieldAsset,
        loading:'LAZY_ACTIVE_SCENE_ONLY',
        available:Object.keys(BATTLEFIELD_ASSETS)
      },
      formation:{allies:this.allies.length,enemies:this.enemies.length},
      targetSelection:{
        currentEnemy:this.currentEnemyTarget?.id||null,
        currentAlly:this.currentAllyTarget?.id||null,
        aliveEnemies:this.enemies.filter(character=>this.isAlive(character)).map(character=>character.id),
        lastSwitch:this.lastTargetSwitch
      },
      projection:{type:'ISOMETRIC',grid:ISO_GRID,config:this.isoConfig},
      depthSorting:'REALTIME_SCREEN_Y',
      billboard:{
        layer:this.combatLayer?.label,
        rotation:this.combatLayer?.rotation??0,
        scale:[this.combatLayer?.scale.x??1,this.combatLayer?.scale.y??1],
        floorProjectionInherited:false
      },
      characterAssetContract:{
        width:256,
        height:384,
        anchor:[.5,1],
        localOrigin:'SOLE_CENTER',
        skinSlots:AVATAR_LAYER_ORDER,
        animation:'INTACT_SD_FULL_BODY_SPRITE'
      },
      effectSystem:{
        renderer:'SkillEffectFX',
        layer:'EffectLayer',
        mode:'PLACEHOLDER_WITH_ATLAS_SWAP',
        kinds:['ATTACK','DEFENSE','SPEED','HEAL'],
        blendModes:['add','screen'],
        collisionAtMs:350,
        whiteFlashMs:50,
        releaseAfterMs:200
      },
      characterStates:this.characters.map(character=>({
        id:character.id,
        state:character.state,
        team:character.team,
        anchor:[.5,1],
        gridPosition:character.gridPosition,
        perspectiveDepth:character.perspectiveDepth,
        facingX:Math.sign(character.view.scale.x),
        rig:character.rigDiagnostics?.()
      }))
    };
  }

  destroy(){
    this.cancelTimelines();
    document.removeEventListener('visibilitychange',this.onVisibility);
    if(this.moteTicker)this.app?.ticker.remove(this.moteTicker);
    if(this.parallaxTicker)this.app?.ticker.remove(this.parallaxTicker);
    if(this.depthTicker)this.app?.ticker.remove(this.depthTicker);
    this.skillTimeline?.destroy();
    this.camera?.destroy();
    this.pools?.destroy();
    this.app?.destroy(true,{children:true,texture:false});
    this.app=null;
    this.cards=[];
    this.boss=null;
    this.mounted=false;
  }
}
