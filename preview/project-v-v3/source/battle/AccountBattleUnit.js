import {Container, Graphics, Rectangle, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BallisticVFX} from './BallisticVFX.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const AUTHORED_FRAME_NAMES=Object.freeze(['ready','fire','recoil','recover']);
const NAME_PANEL_HEIGHT=29;
const NAME_PANEL_MIN_WIDTH=88;
const NAME_PANEL_MAX_WIDTH=188;
const NAME_PANEL_HORIZONTAL_PADDING=24;
const NAME_LABEL_MAX_WIDTH=NAME_PANEL_MAX_WIDTH-NAME_PANEL_HORIZONTAL_PADDING;
const STATIC_NAME_HUD_GAP=24;

function labelText(value){
  return new Text({
    text:String(value||''),
    style:{
      fontFamily:'Pretendard, SUIT, Arial, sans-serif',
      fontSize:16,
      fill:0xf4fbff,
      fontWeight:'900',
      align:'center',
      letterSpacing:.35
    }
  });
}

/**
 * PVE-only account avatar rendered beside, but never inside, the canonical
 * five-card formation. Approved suit/weapon pairs use one authored composite
 * atlas; the database-driven body and weapon remain the static fallback. The
 * server owns its independent damage; this view renders those timeline shots.
 */
export class AccountBattleUnit{
  constructor({effectLayer=null}={}){
    this.effectLayer=effectLayer;
    this.active=false;
    this.bodySource='';
    this.weaponSource='';
    this.authoredSheetSource='';
    this.authoredProfile=null;
    this.authoredFrames=null;
    this.authoredSubtextures=[];
    this.authoredFrame='';
    this.shotCount=0;
    this.fullName='';
    this.displayName='';
    this.nameTruncated=false;
    this.namePanelWidth=0;
    this.idleTimeline=null;
    this.fireTimeline=null;
    this.fireResolve=null;
    this.fireEffect=null;
    this.ballisticVfx=new BallisticVFX({layer:effectLayer});
    this.attachment={x:34,y:-142,anchorX:.66,anchorY:.62,height:106,rotation:-.08,zIndex:14,flipX:true,muzzleX:null,muzzleY:-18};

    this.root=new Container({label:'PVEAccountBattleUnit',sortableChildren:true});
    this.root.visible=false;
    this.root.renderable=false;
    this.root.alpha=0;
    this.root.eventMode='none';
    this.root.isAccountBattleUnit=true;

    this.shadow=new Graphics().ellipse(0,-4,82,19).fill({color:0x000000,alpha:.52});
    this.shadow.zIndex=0;
    this.view=new Container({label:'PVEAccountBattleUnitAppearance',sortableChildren:true});
    this.view.zIndex=2;
    this.bodySprite=new Sprite(Texture.EMPTY);
    this.bodySprite.label='BattleSuitBody';
    this.bodySprite.anchor.set(.5,.98);
    this.bodySprite.zIndex=10;
    this.weaponSprite=new Sprite(Texture.EMPTY);
    this.weaponSprite.label='DatabaseWeaponAttachment';
    this.weaponSprite.visible=false;
    this.weaponSprite.zIndex=this.attachment.zIndex;
    this.view.addChild(this.bodySprite,this.weaponSprite);

    this.nameHud=new Container({label:'PVEAccountBattleUnitName'});
    this.nameHud.zIndex=20;
    this.nameHud.visible=false;
    this.namePanel=new Graphics();
    this.nameLabel=labelText('');
    this.nameLabel.anchor.set(.5);
    this.nameHud.addChild(this.namePanel,this.nameLabel);
    this.root.addChild(this.shadow,this.view,this.nameHud);
    this.root.sortChildren();
  }

  setFormation(x,y,scale=.5){
    this.root.position.set(Number(x)||0,Number(y)||0);
    this.root.scale.set(Math.max(.1,Number(scale)||.5));
    this.root.baseX=this.root.x;
    this.root.baseY=this.root.y;
    this.root.restScale=this.root.scale.x;
    this.root.depthSortY=this.root.y;
    return this;
  }

  setName(value=''){
    const name=Array.from(String(value||'').trim()).slice(0,20).join('');
    this.fullName=name;
    this.nameHud.visible=Boolean(name);
    if(!name){
      this.nameLabel.text='';
      this.displayName='';
      this.nameTruncated=false;
      this.namePanelWidth=0;
      return this;
    }
    const points=Array.from(name);
    this.nameLabel.text=name;
    if(this.nameLabel.width>NAME_LABEL_MAX_WIDTH){
      do{
        points.pop();
        this.nameLabel.text=`${points.join('')}…`;
      }while(points.length&&this.nameLabel.width>NAME_LABEL_MAX_WIDTH);
    }
    this.displayName=String(this.nameLabel.text||'');
    this.nameTruncated=this.displayName!==name;
    const width=clamp(Math.ceil(this.nameLabel.width+NAME_PANEL_HORIZONTAL_PADDING),NAME_PANEL_MIN_WIDTH,NAME_PANEL_MAX_WIDTH);
    this.namePanelWidth=width;
    this.namePanel.clear().roundRect(-width/2,0,width,NAME_PANEL_HEIGHT,6)
      .fill({color:0x030910,alpha:.88})
      .stroke({width:1,color:0x67dcff,alpha:.58});
    this.nameLabel.position.set(0,NAME_PANEL_HEIGHT/2);
    return this;
  }

  authoredPivot(name='ready'){
    const pivot=this.authoredProfile?.pivots?.[name]||this.authoredProfile?.pivots?.ready;
    return {
      x:clamp(finite(pivot?.x,.5),0,1),
      y:clamp(finite(pivot?.y,this.authoredProfile?.contentBottom??.98),0,1)
    };
  }

  hasAuthoredAnimation(){
    return Boolean(this.authoredProfile&&this.authoredFrames&&this.authoredFrames.ready);
  }

  releaseAuthoredAnimation(){
    const frames=this.authoredSubtextures;
    if(frames.includes(this.bodySprite.texture))this.bodySprite.texture=Texture.EMPTY;
    frames.forEach(texture=>{
      if(texture&&texture!==Texture.EMPTY&&!texture.destroyed)texture.destroy(false);
    });
    this.authoredSheetSource='';
    this.authoredProfile=null;
    this.authoredFrames=null;
    this.authoredSubtextures=[];
    this.authoredFrame='';
  }

  setAuthoredSheet(texture,profile,{height=278,scaleMultiplier=1,source=''}={}){
    const columns=Math.round(finite(profile?.grid?.columns,0));
    const rows=Math.round(finite(profile?.grid?.rows,0));
    const frameOrder=Array.isArray(profile?.frameOrder)?profile.frameOrder:[];
    const sheetFrame=texture?.frame;
    const sheetWidth=finite(sheetFrame?.width??texture?.width,0);
    const sheetHeight=finite(sheetFrame?.height??texture?.height,0);
    const sourceTexture=texture?.source;
    if(!texture||texture===Texture.EMPTY||!sourceTexture||columns!==4||rows!==2
      ||frameOrder.length!==4||!['ready','fire','recoil','recover'].every((name,index)=>frameOrder[index]===name)
      ||sheetWidth<columns||sheetHeight<rows){
      return false;
    }
    const cellWidth=sheetWidth/columns;
    const cellHeight=sheetHeight/rows;
    if(!Number.isInteger(cellWidth)||!Number.isInteger(cellHeight))return false;
    const originX=finite(sheetFrame?.x,0),originY=finite(sheetFrame?.y,0);
    const created=[];
    const frames={};
    try{
      frameOrder.forEach((name,index)=>{
        const frameSpec=profile.frames?.[name]||{column:index,row:profile.row};
        const column=Math.round(finite(frameSpec.column,index));
        const row=Math.round(finite(frameSpec.row,profile.row));
        if(column<0||column>=columns||row<0||row>=rows)throw new Error(`ACCOUNT_BATTLE_SUIT_FRAME_OUT_OF_RANGE:${name}:${column}:${row}`);
        const frameTexture=new Texture({
          source:sourceTexture,
          frame:new Rectangle(originX+column*cellWidth,originY+row*cellHeight,cellWidth,cellHeight)
        });
        frameTexture.label=`AccountBattleSuit:${profile.suitCode}:${profile.weaponCode}:${name}`;
        created.push(frameTexture);
        frames[name]=frameTexture;
      });
    }catch(error){
      created.forEach(frameTexture=>frameTexture.destroy(false));
      console.warn('[Project V V3] 배틀슈트 authored atlas 프레임 생성 실패',error);
      return false;
    }

    this.cancelFire();
    this.stopIdle();
    this.releaseAuthoredAnimation();
    this.bodySprite.texture=Texture.EMPTY;
    this.weaponSprite.texture=Texture.EMPTY;
    this.weaponSprite.visible=false;
    this.weaponSource='';
    this.authoredProfile=profile;
    this.authoredFrames=Object.freeze(frames);
    this.authoredSubtextures=created;
    this.authoredSheetSource=String(source||profile.sheetUrl||'');
    this.bodySource=this.authoredSheetSource;
    const targetHeight=clamp(finite(height,278)*clamp(finite(scaleMultiplier,1),.55,1.55),150,430);
    this.bodySprite.texture=frames.ready;
    const readyPivot=this.authoredPivot('ready');
    this.bodySprite.anchor.set(readyPivot.x,readyPivot.y);
    this.bodySprite.height=targetHeight;
    this.bodySprite.width=targetHeight*(cellWidth/cellHeight);
    this.authoredFrame='ready';
    const contentTop=clamp(finite(profile?.nameHud?.contentTop,0),0,.4);
    const hudGap=clamp(finite(profile?.nameHud?.gap,18),8,42);
    const highestContentOffset=Math.min(...AUTHORED_FRAME_NAMES.map(name=>contentTop-this.authoredPivot(name).y));
    this.nameHud.position.set(0,targetHeight*highestContentOffset-hudGap-NAME_PANEL_HEIGHT);
    return true;
  }

  applyAuthoredFrame(name='ready'){
    const texture=this.authoredFrames?.[name];
    if(!texture)return false;
    this.bodySprite.texture=texture;
    const pivot=this.authoredPivot(name);
    this.bodySprite.anchor.set(pivot.x,pivot.y);
    this.authoredFrame=name;
    this.weaponSprite.visible=false;
    return true;
  }

  usesBodyAsset(source=''){
    const target=String(source||'');
    return Boolean(target&&(target===this.bodySource||target===this.authoredSheetSource));
  }

  usesWeaponAsset(source=''){
    const target=String(source||'');
    return Boolean(target&&target===this.weaponSource);
  }

  setBody(texture,{height=278,scaleMultiplier=1,source=''}={}){
    this.cancelFire();
    this.stopIdle();
    this.releaseAuthoredAnimation();
    this.bodySprite.anchor.set(.5,.98);
    if(!texture||texture===Texture.EMPTY){
      this.bodySprite.texture=Texture.EMPTY;
      this.bodySource='';
      return false;
    }
    const targetHeight=clamp(finite(height,278)*clamp(finite(scaleMultiplier,1),.55,1.55),150,430);
    const ratio=Math.max(.08,finite(texture.width,1)/Math.max(1,finite(texture.height,1)));
    this.bodySprite.texture=texture;
    this.bodySprite.height=targetHeight;
    this.bodySprite.width=targetHeight*ratio;
    this.bodySource=String(source||'');
    this.nameHud.position.set(0,-targetHeight-STATIC_NAME_HUD_GAP-NAME_PANEL_HEIGHT);
    return true;
  }

  setWeapon(texture,options={}){
    if(this.hasAuthoredAnimation()){
      this.weaponSprite.texture=Texture.EMPTY;
      this.weaponSprite.visible=false;
      this.weaponSource='';
      return false;
    }
    const attachment=options.attachment&&typeof options.attachment==='object'?options.attachment:options;
    this.attachment={
      x:finite(attachment.x??attachment.offsetX,34),
      y:finite(attachment.y??attachment.offsetY,-142),
      anchorX:clamp(finite(attachment.anchorX,.66),0,1),
      anchorY:clamp(finite(attachment.anchorY,.62),0,1),
      height:clamp(finite(attachment.height??attachment.renderHeight,106),24,260),
      rotation:finite(attachment.rotation,-.08),
      zIndex:Math.round(finite(attachment.zIndex,14)),
      flipX:attachment.flipX!==false,
      muzzleX:Number.isFinite(Number(attachment.muzzleX))?Number(attachment.muzzleX):null,
      muzzleY:finite(attachment.muzzleY,-18)
    };
    const source=String(options.source||'');
    if(!texture||texture===Texture.EMPTY){
      this.weaponSprite.texture=Texture.EMPTY;
      this.weaponSprite.visible=false;
      this.weaponSource='';
      return false;
    }
    const ratio=Math.max(.08,finite(texture.width,1)/Math.max(1,finite(texture.height,1)));
    this.weaponSprite.texture=texture;
    this.weaponSprite.anchor.set(this.attachment.anchorX,this.attachment.anchorY);
    this.weaponSprite.position.set(this.attachment.x,this.attachment.y);
    this.weaponSprite.height=this.attachment.height;
    this.weaponSprite.width=this.attachment.height*ratio;
    this.weaponSprite.scale.x=Math.abs(this.weaponSprite.scale.x)*(this.attachment.flipX?-1:1);
    this.weaponSprite.rotation=this.attachment.rotation;
    this.weaponSprite.zIndex=this.attachment.zIndex;
    this.weaponSprite.visible=true;
    this.weaponSource=source;
    this.view.sortChildren();
    return true;
  }

  clearAppearance(){
    this.cancelFire();
    this.stopIdle();
    this.releaseAuthoredAnimation();
    this.bodySprite.texture=Texture.EMPTY;
    this.bodySprite.anchor.set(.5,.98);
    this.weaponSprite.texture=Texture.EMPTY;
    this.weaponSprite.visible=false;
    this.bodySource='';
    this.weaponSource='';
    this.setActive(false);
  }

  setActive(next,{deployed=false}={}){
    this.active=Boolean(next&&this.bodySprite.texture!==Texture.EMPTY);
    this.root.visible=this.active;
    this.root.renderable=this.active;
    this.root.alpha=this.active&&deployed?1:0;
    if(this.active)this.startIdle();else{this.cancelFire();this.stopIdle()}
    return this.active;
  }

  startIdle(){
    if(!this.active||this.idleTimeline)return;
    if(this.hasAuthoredAnimation()&&this.authoredFrame!=='ready')this.applyAuthoredFrame('ready');
    this.view.position.set(0,0);
    this.view.scale.set(1);
    this.idleTimeline=gsap.timeline({repeat:-1,yoyo:true,defaults:{ease:'sine.inOut'}})
      .to(this.view,{y:-2.4,duration:.82},0)
      .to(this.view.scale,{x:1.012,y:.985,duration:.82},0);
  }

  stopIdle(){
    this.idleTimeline?.kill();
    this.idleTimeline=null;
    gsap.killTweensOf([this.view,this.view.scale,this.weaponSprite]);
    this.view.position.set(0,0);
    this.view.scale.set(1);
    if(this.hasAuthoredAnimation()&&this.authoredFrame!=='ready')this.applyAuthoredFrame('ready');
    else{
      this.weaponSprite.rotation=this.attachment.rotation;
      this.weaponSprite.position.set(this.attachment.x,this.attachment.y);
    }
  }

  muzzlePoint(){
    if(this.hasAuthoredAnimation()){
      const muzzle=this.authoredProfile?.muzzle||{};
      const firePivot=this.authoredPivot(String(muzzle.frame||'fire'));
      const texture=this.bodySprite.texture;
      const width=Math.max(1,finite(texture?.orig?.width??texture?.width,1));
      const height=Math.max(1,finite(texture?.orig?.height??texture?.height,1));
      const local={
        x:(clamp(finite(muzzle.x,.9),0,1)-firePivot.x)*width,
        y:(clamp(finite(muzzle.y,.39),0,1)-firePivot.y)*height
      };
      const global=this.bodySprite.toGlobal(local);
      const point=this.effectLayer?.toLocal?this.effectLayer.toLocal(global):global;
      return {x:point.x,y:point.y};
    }
    const scale=this.root.scale.x||1;
    const derivedMuzzleX=Math.abs(this.weaponSprite.width)*(this.attachment.flipX?this.attachment.anchorX:1-this.attachment.anchorX);
    const localX=this.attachment.x+(this.attachment.muzzleX??derivedMuzzleX);
    const localY=this.attachment.y+this.attachment.muzzleY;
    return {x:this.root.x+localX*scale,y:this.root.y+localY*scale};
  }

  cancelFire(){
    const resolve=this.fireResolve;
    this.fireResolve=null;
    this.fireTimeline?.kill();
    this.fireTimeline=null;
    if(this.fireEffect){
      this.ballisticVfx.releaseShot(this.fireEffect);
      this.fireEffect=null;
    }
    this.stopIdle();
    if(this.active)this.startIdle();
    resolve?.(false);
  }

  async playRangedFire({targetX,targetY,weaponCode='',onImpact=()=>{},playbackRate=1}={}){
    const authored=this.hasAuthoredAnimation();
    if(!this.active||(!authored&&!this.weaponSprite.visible)||!this.effectLayer||!Number.isFinite(Number(targetX))||!Number.isFinite(Number(targetY)))return Promise.resolve(false);
    if(!await this.ballisticVfx.prepare())return false;
    const speed=clamp(finite(playbackRate,1),.5,3);
    return authored
      ?this.playAuthoredRangedFire({targetX:Number(targetX),targetY:Number(targetY),weaponCode,onImpact,playbackRate:speed})
      :this.playStaticRangedFire({targetX:Number(targetX),targetY:Number(targetY),weaponCode,onImpact,playbackRate:speed});
  }

  createCosmeticShot({targetX,targetY,weaponCode}){
    return this.ballisticVfx.createShot({
      source:this.muzzlePoint(),
      target:{x:Number(targetX),y:Number(targetY)},
      weaponCode:weaponCode||this.authoredProfile?.weaponCode||'',
      sequence:this.shotCount
    });
  }

  prepareRangedFireEffects(){
    return this.ballisticVfx?.prepare?.()||Promise.resolve(false);
  }

  playAuthoredRangedFire({targetX,targetY,weaponCode,onImpact=()=>{},playbackRate=1}){
    this.cancelFire();
    this.stopIdle();
    const shot=this.createCosmeticShot({targetX,targetY,weaponCode});
    if(!shot){if(this.active)this.startIdle();return Promise.resolve(false)}
    this.fireEffect=shot;
    this.shotCount+=1;
    const durations=this.authoredProfile.durationsMs;
    const fireAt=Math.max(0,finite(durations.ready,45))/1000;
    const recoilAt=fireAt+Math.max(1,finite(durations.fire,45))/1000;
    const recoverAt=recoilAt+Math.max(1,finite(durations.recoil,70))/1000;
    const readyAt=recoverAt+Math.max(1,finite(durations.recover,125))/1000;
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        this.fireResolve=null;
        this.fireTimeline=null;
        if(this.fireEffect===shot)this.fireEffect=null;
        this.ballisticVfx.releaseShot(shot);
        if(this.authoredFrame!=='ready')this.applyAuthoredFrame('ready');
        this.view.position.set(0,0);
        if(this.active)this.startIdle();
        resolve(value);
      };
      this.fireResolve=value=>finish(value);
      this.fireTimeline=gsap.timeline({onComplete:()=>finish(true),onInterrupt:()=>finish(false)})
        .call(()=>this.applyAuthoredFrame('ready'),[],0)
        .call(()=>this.applyAuthoredFrame('fire'),[],fireAt)
        .call(()=>this.applyAuthoredFrame('recoil'),[],recoilAt)
        .call(()=>this.applyAuthoredFrame('recover'),[],recoverAt)
        .call(()=>this.applyAuthoredFrame('ready'),[],readyAt);
      this.ballisticVfx.addToTimeline(this.fireTimeline,shot,{at:fireAt,onImpact});
      this.fireTimeline.timeScale(playbackRate);
    });
  }

  playStaticRangedFire({targetX,targetY,weaponCode,onImpact=()=>{},playbackRate=1}){
    this.cancelFire();
    this.stopIdle();
    const shot=this.createCosmeticShot({targetX,targetY,weaponCode});
    if(!shot){if(this.active)this.startIdle();return Promise.resolve(false)}
    this.fireEffect=shot;
    this.shotCount+=1;
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        this.fireResolve=null;
        this.fireTimeline=null;
        if(this.fireEffect===shot)this.fireEffect=null;
        this.ballisticVfx.releaseShot(shot);
        this.weaponSprite.rotation=this.attachment.rotation;
        this.weaponSprite.position.set(this.attachment.x,this.attachment.y);
        this.view.position.set(0,0);
        if(this.active)this.startIdle();
        resolve(value);
      };
      this.fireResolve=value=>finish(value);
      this.fireTimeline=gsap.timeline({onComplete:()=>finish(true),onInterrupt:()=>finish(false)})
        .to(this.weaponSprite,{x:this.attachment.x-9,rotation:this.attachment.rotation-.075,duration:.055,ease:'power4.out'},0)
        .to(this.view,{x:-3,duration:.055,ease:'power4.out'},0)
        .to(this.weaponSprite,{x:this.attachment.x,rotation:this.attachment.rotation,duration:.16,ease:'back.out(1.7)'},.07)
        .to(this.view,{x:0,duration:.16,ease:'back.out(1.7)'},.07);
      this.ballisticVfx.addToTimeline(this.fireTimeline,shot,{at:0,onImpact});
      this.fireTimeline.timeScale(playbackRate);
    });
  }

  diagnostics(){
    const authored=this.hasAuthoredAnimation();
    return {
      active:this.active,
      id:'ACCOUNT_BATTLE_UNIT',
      role:'PVE_AUTHORITATIVE_RANGED_SUPPORT',
      fixedPosition:true,
      bodySource:this.bodySource,
      weaponSource:this.weaponSource,
      weaponFlipX:this.attachment.flipX,
      separateWeaponAttachment:!authored,
      authoredComposite:authored,
      authoredSheetSource:this.authoredSheetSource,
      authoredFrame:this.authoredFrame,
      authoredWeaponCode:this.authoredProfile?.weaponCode||'',
      authoredContentTop:this.authoredProfile?.nameHud?.contentTop??null,
      authoredContentBottom:this.authoredProfile?.contentBottom??null,
      authoredPivot:this.hasAuthoredAnimation()?this.authoredPivot(this.authoredFrame||'ready'):null,
      authoredPivots:this.authoredProfile?.pivots||null,
      authoredMuzzle:this.authoredProfile?.muzzle||null,
      weaponSpriteVisible:this.weaponSprite.visible,
      shotCount:this.shotCount,
      ballisticVfx:this.ballisticVfx.diagnostics(),
      nickname:{
        fullText:this.fullName,
        displayText:this.displayName,
        truncated:this.nameTruncated,
        panelWidth:this.namePanelWidth,
        panelHeight:NAME_PANEL_HEIGHT,
        maxTextWidth:NAME_LABEL_MAX_WIDTH
      },
      affectsDeck:false,
      affectsDamage:true,
      damageAuthority:'SERVER_BATTLE_V2_TIMELINE'
    };
  }

  destroy(){
    this.cancelFire();
    this.stopIdle();
    this.releaseAuthoredAnimation();
    this.ballisticVfx=null;
    this.root.destroy({children:true});
  }
}
