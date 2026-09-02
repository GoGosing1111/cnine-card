import {Assets,Container,Rectangle,Sprite,Texture} from 'pixi.js';

const ASSET_VERSION='1970-ballistic-impact-v1';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

const ATLAS=Object.freeze({
  muzzle:Object.freeze({
    url:`/assets/ui/project-v/fx/ballistic-impact-v1/muzzle-flash-atlas-v1.png?v=${ASSET_VERSION}`,
    columns:4,rows:2,frames:8
  }),
  tracer:Object.freeze({
    url:`/assets/ui/project-v/fx/ballistic-impact-v1/tracer-atlas-v1.png?v=${ASSET_VERSION}`,
    columns:3,rows:2,frames:6
  }),
  impact:Object.freeze({
    url:`/assets/ui/project-v/fx/ballistic-impact-v1/monster-impact-atlas-v1.png?v=${ASSET_VERSION}`,
    columns:4,rows:2,frames:8
  })
});

const DEFAULT_PROFILE=Object.freeze({
  weaponClass:'AR',tracerFrames:[0,1],travelSpeed:3500,tracerSize:168,
  muzzleSize:148,muzzleDuration:.105,impactSize:178,impactDuration:.17,
  hitFlashMs:62,hitReactionMs:205,cameraShake:3.2,cameraShakeDuration:.12,cameraRotation:.0015
});

const WEAPON_PROFILES=Object.freeze({
  EQ_1785427638137:Object.freeze({
    weaponClass:'M4A1_AR',tracerFrames:[0,1],travelSpeed:3750,tracerSize:164,
    muzzleSize:148,muzzleDuration:.1,impactSize:176,impactDuration:.165,
    hitFlashMs:58,hitReactionMs:190,cameraShake:3.2,cameraShakeDuration:.12,cameraRotation:.0015
  }),
  EQ_1785961232958:Object.freeze({
    weaponClass:'AK_AR',tracerFrames:[1,3],travelSpeed:3350,tracerSize:184,
    muzzleSize:164,muzzleDuration:.11,impactSize:198,impactDuration:.18,
    hitFlashMs:64,hitReactionMs:220,cameraShake:4.6,cameraShakeDuration:.14,cameraRotation:.002
  }),
  EQ_1785961300455:Object.freeze({
    weaponClass:'M200_SNIPER',tracerFrames:[5],travelSpeed:4300,tracerSize:238,
    muzzleSize:214,muzzleDuration:.13,impactSize:282,impactDuration:.245,
    hitFlashMs:86,hitReactionMs:355,cameraShake:10.5,cameraShakeDuration:.21,cameraRotation:.004
  }),
  EQ_1786966923833:Object.freeze({
    weaponClass:'SKS_DMR',tracerFrames:[4],travelSpeed:3850,tracerSize:210,
    muzzleSize:182,muzzleDuration:.115,impactSize:228,impactDuration:.205,
    hitFlashMs:72,hitReactionMs:275,cameraShake:6.4,cameraShakeDuration:.17,cameraRotation:.0028
  })
});

let atlasPromise=null;
let atlasFrames=null;

function frameTexture(texture,spec,index){
  const sheetFrame=texture?.frame;
  const width=finite(sheetFrame?.width??texture?.width,0);
  const height=finite(sheetFrame?.height??texture?.height,0);
  const cellWidth=width/spec.columns,cellHeight=height/spec.rows;
  if(!texture?.source||!Number.isInteger(cellWidth)||!Number.isInteger(cellHeight)){
    throw new Error(`BALLISTIC_VFX_ATLAS_GRID_INVALID:${spec.url}`);
  }
  const column=index%spec.columns,row=Math.floor(index/spec.columns);
  const child=new Texture({
    source:texture.source,
    frame:new Rectangle(
      finite(sheetFrame?.x,0)+column*cellWidth,
      finite(sheetFrame?.y,0)+row*cellHeight,
      cellWidth,
      cellHeight
    )
  });
  child.label=`BallisticVFX:${spec.url}:${index}`;
  return child;
}

function sliceAtlas(texture,spec){
  return Object.freeze(Array.from({length:spec.frames},(_,index)=>frameTexture(texture,spec,index)));
}

export function ballisticProfile(weaponCode=''){
  return WEAPON_PROFILES[String(weaponCode||'').trim().toUpperCase()]||DEFAULT_PROFILE;
}

export async function preloadBallisticVFX(){
  if(atlasFrames)return atlasFrames;
  if(!atlasPromise){
    atlasPromise=Promise.all(Object.entries(ATLAS).map(async([key,spec])=>[
      key,sliceAtlas(await Assets.load(spec.url),spec)
    ])).then(entries=>{
      atlasFrames=Object.freeze(Object.fromEntries(entries));
      return atlasFrames;
    }).catch(error=>{
      atlasPromise=null;
      throw error;
    });
  }
  return atlasPromise;
}

function vfxSprite(texture,{label,zIndex,blendMode='normal',anchorX=.5,anchorY=.5}={}){
  const sprite=new Sprite(texture||Texture.EMPTY);
  sprite.label=label||'BallisticVFXSprite';
  sprite.zIndex=zIndex||0;
  sprite.blendMode=blendMode;
  sprite.anchor.set(anchorX,anchorY);
  sprite.eventMode='none';
  sprite.visible=false;
  sprite.alpha=0;
  return sprite;
}

function setSpriteSize(sprite,size,multiplier=1){
  const dimension=Math.max(1,finite(sprite.texture?.width,256));
  const scale=Math.max(.02,finite(size,128)/dimension)*multiplier;
  sprite.scale.set(scale);
  return scale;
}

/**
 * Raster-atlas-only ballistic presentation for the PVE account Battle Suit.
 * Every visible muzzle, tracer and impact pixel comes from an authored PNG;
 * this module intentionally creates no CSS animation or runtime vector shape.
 */
export class BallisticVFX{
  constructor({layer=null}={}){
    this.layer=layer;
    this.frames=null;
    this.readyPromise=null;
    this.lastWeaponCode='';
    this.shots=0;
    this.failures=0;
  }

  async prepare(){
    if(this.frames)return true;
    this.readyPromise||=preloadBallisticVFX().then(frames=>{
      this.frames=frames;
      return true;
    }).catch(error=>{
      this.failures+=1;
      this.readyPromise=null;
      console.warn('[Project V V3] ballistic raster atlas load failed',error);
      return false;
    });
    return this.readyPromise;
  }

  createShot({source,target,weaponCode='',sequence=0}={}){
    if(!this.frames||!this.layer)return null;
    const start={x:finite(source?.x,0),y:finite(source?.y,0)};
    const end={x:finite(target?.x,0),y:finite(target?.y,0)};
    const dx=end.x-start.x,dy=end.y-start.y;
    const distance=Math.max(12,Math.hypot(dx,dy));
    const angle=Math.atan2(dy,dx);
    const profile=ballisticProfile(weaponCode);
    const tracerIndexes=profile.tracerFrames.length?profile.tracerFrames:DEFAULT_PROFILE.tracerFrames;
    const tracerIndex=tracerIndexes[Math.abs(Math.trunc(sequence))%tracerIndexes.length];
    const effect=new Container({label:'PVEAccountBattleUnitCosmeticShot',sortableChildren:true});
    effect.zIndex=950;
    effect.eventMode='none';
    effect.visible=false;

    const muzzleGlow=vfxSprite(this.frames.muzzle[0],{label:'BallisticMuzzleGlow',zIndex:10,blendMode:'add',anchorX:.14});
    const muzzle=vfxSprite(this.frames.muzzle[0],{label:'BallisticMuzzleAtlas',zIndex:12,blendMode:'screen',anchorX:.14});
    const wake=vfxSprite(this.frames.tracer[tracerIndex],{label:'BallisticTracerWake',zIndex:20,blendMode:'add',anchorX:.84});
    const tracer=vfxSprite(this.frames.tracer[tracerIndex],{label:'BallisticTracerCore',zIndex:22,blendMode:'screen',anchorX:.84});
    const impactGlow=vfxSprite(this.frames.impact[0],{label:'BallisticImpactShockwave',zIndex:30,blendMode:'add'});
    const impact=vfxSprite(this.frames.impact[0],{label:'BallisticMonsterImpactAtlas',zIndex:32,blendMode:'screen'});

    for(const sprite of [muzzleGlow,muzzle]){
      sprite.position.set(start.x,start.y);
      sprite.rotation=angle;
    }
    for(const sprite of [wake,tracer]){
      sprite.position.set(start.x,start.y);
      sprite.rotation=angle;
    }
    for(const sprite of [impactGlow,impact])sprite.position.set(end.x,end.y);

    const muzzleScale=setSpriteSize(muzzle,profile.muzzleSize);
    setSpriteSize(muzzleGlow,profile.muzzleSize,1.2);
    const tracerScale=setSpriteSize(tracer,profile.tracerSize);
    setSpriteSize(wake,profile.tracerSize,1.16);
    const impactScale=setSpriteSize(impact,profile.impactSize,.24);
    const impactGlowScale=setSpriteSize(impactGlow,profile.impactSize,.32);
    effect.addChild(muzzleGlow,muzzle,wake,tracer,impactGlow,impact);
    effect.sortChildren();
    this.layer.addChild(effect);
    this.lastWeaponCode=String(weaponCode||'').trim().toUpperCase();
    this.shots+=1;
    return {
      effect,profile,start,end,distance,angle,tracerIndex,
      muzzle,muzzleGlow,tracer,wake,impact,impactGlow,
      muzzleScale,tracerScale,impactScale,impactGlowScale,
      muzzleState:{frame:0},impactState:{frame:0},released:false
    };
  }

  addToTimeline(timeline,shot,{at=0,onImpact=()=>{}}={}){
    if(!timeline||!shot)return Number(at)||0;
    const startAt=Math.max(0,finite(at,0));
    const travel=clamp(shot.distance/shot.profile.travelSpeed,.045,.105);
    const tracerAt=startAt+.008;
    const impactAt=tracerAt+travel;
    const impactEnd=impactAt+shot.profile.impactDuration;
    const updateMuzzle=()=>{
      const index=clamp(Math.round(shot.muzzleState.frame),0,this.frames.muzzle.length-1);
      shot.muzzle.texture=this.frames.muzzle[index];
      shot.muzzleGlow.texture=this.frames.muzzle[index];
    };
    const updateImpact=()=>{
      const index=clamp(Math.round(shot.impactState.frame),0,this.frames.impact.length-1);
      shot.impact.texture=this.frames.impact[index];
      shot.impactGlow.texture=this.frames.impact[index];
    };

    timeline.call(()=>{
      shot.effect.visible=true;
      shot.muzzle.visible=shot.muzzleGlow.visible=true;
      shot.muzzle.alpha=1;
      shot.muzzleGlow.alpha=.46;
      updateMuzzle();
    },[],startAt);
    timeline.to(shot.muzzleState,{
      frame:this.frames.muzzle.length-1,duration:shot.profile.muzzleDuration,ease:'none',onUpdate:updateMuzzle
    },startAt);
    timeline.to(shot.muzzle,{alpha:0,duration:.05,ease:'power2.in'},startAt+shot.profile.muzzleDuration-.045);
    timeline.to(shot.muzzleGlow,{alpha:0,duration:.075,ease:'power2.in'},startAt+shot.profile.muzzleDuration-.055);

    timeline.call(()=>{
      shot.wake.visible=shot.tracer.visible=true;
      shot.tracer.alpha=1;
      shot.wake.alpha=.42;
    },[],tracerAt);
    timeline.to(shot.tracer,{x:shot.end.x,y:shot.end.y,duration:travel,ease:'power2.in'},tracerAt);
    timeline.to(shot.wake,{x:shot.end.x,y:shot.end.y,duration:travel*1.08,ease:'power2.in'},tracerAt);
    timeline.to(shot.tracer.scale,{
      x:shot.tracerScale*1.08,y:shot.tracerScale*.92,duration:travel,ease:'power2.in'
    },tracerAt);
    timeline.to(shot.tracer,{alpha:0,duration:.022,ease:'power4.in'},Math.max(tracerAt,impactAt-.022));
    timeline.to(shot.wake,{alpha:0,duration:.055,ease:'power2.in'},Math.max(tracerAt,impactAt-.035));

    timeline.call(()=>{
      shot.tracer.visible=shot.wake.visible=false;
      shot.impact.visible=shot.impactGlow.visible=true;
      shot.impact.alpha=1;
      shot.impactGlow.alpha=.58;
      updateImpact();
      onImpact({profile:shot.profile,weaponCode:this.lastWeaponCode,at:impactAt});
    },[],impactAt);
    timeline.to(shot.impactState,{
      frame:this.frames.impact.length-1,duration:shot.profile.impactDuration,ease:'none',onUpdate:updateImpact
    },impactAt);
    timeline.to(shot.impact.scale,{
      x:shot.impactScale/.24,y:shot.impactScale/.24,duration:shot.profile.impactDuration*.38,ease:'back.out(1.5)'
    },impactAt);
    timeline.to(shot.impactGlow.scale,{
      x:shot.impactGlowScale/.32*1.38,y:shot.impactGlowScale/.32*1.38,
      duration:shot.profile.impactDuration*.72,ease:'power3.out'
    },impactAt);
    timeline.to(shot.impactGlow,{alpha:0,duration:shot.profile.impactDuration*.64,ease:'power2.out'},impactAt+shot.profile.impactDuration*.18);
    timeline.to(shot.impact,{alpha:0,duration:.07,ease:'power2.in'},Math.max(impactAt,impactEnd-.07));
    return impactEnd;
  }

  releaseShot(shot){
    if(!shot||shot.released)return;
    shot.released=true;
    shot.effect?.removeFromParent?.();
    shot.effect?.destroy?.({children:true});
  }

  diagnostics(){
    return {
      renderer:'PIXI_RASTER_ATLAS',
      cssEffects:false,
      ready:Boolean(this.frames),
      assetVersion:ASSET_VERSION,
      atlasUrls:Object.fromEntries(Object.entries(ATLAS).map(([key,value])=>[key,value.url])),
      lastWeaponCode:this.lastWeaponCode,
      shots:this.shots,
      failures:this.failures
    };
  }
}
