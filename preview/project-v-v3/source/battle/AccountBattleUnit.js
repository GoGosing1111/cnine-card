import {Container, Graphics, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

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
 * five-card formation. The body (Battle Suit) and weapon are intentionally
 * separate database-driven attachments. This object has no HP, target or
 * damage API; its ranged shot is presentation-only.
 */
export class AccountBattleUnit{
  constructor({effectLayer=null}={}){
    this.effectLayer=effectLayer;
    this.active=false;
    this.bodySource='';
    this.weaponSource='';
    this.shotCount=0;
    this.idleTimeline=null;
    this.fireTimeline=null;
    this.fireResolve=null;
    this.fireEffect=null;
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
    const name=String(value||'').trim().slice(0,24);
    this.nameLabel.text=name;
    this.nameHud.visible=Boolean(name);
    if(!name)return this;
    const width=clamp(Math.ceil(this.nameLabel.width+24),88,188);
    this.namePanel.clear().roundRect(-width/2,0,width,29,6)
      .fill({color:0x030910,alpha:.88})
      .stroke({width:1,color:0x67dcff,alpha:.58});
    this.nameLabel.position.set(0,14.5);
    return this;
  }

  setBody(texture,{height=278,scaleMultiplier=1,source=''}={}){
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
    this.nameHud.position.set(0,-targetHeight-24);
    return true;
  }

  setWeapon(texture,options={}){
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
    this.bodySprite.texture=Texture.EMPTY;
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
    this.weaponSprite.rotation=this.attachment.rotation;
    this.weaponSprite.position.set(this.attachment.x,this.attachment.y);
  }

  muzzlePoint(){
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
      this.fireEffect.removeFromParent?.();
      this.fireEffect.destroy?.({children:true});
      this.fireEffect=null;
    }
    this.stopIdle();
    if(this.active)this.startIdle();
    resolve?.(false);
  }

  playRangedFire({targetX,targetY,accent=0x76e8ff}={}){
    if(!this.active||!this.weaponSprite.visible||!this.effectLayer||!Number.isFinite(Number(targetX))||!Number.isFinite(Number(targetY)))return Promise.resolve(false);
    this.cancelFire();
    this.stopIdle();
    const source=this.muzzlePoint();
    const dx=Number(targetX)-source.x,dy=Number(targetY)-source.y;
    const distance=Math.max(12,Math.hypot(dx,dy));
    const beam=new Graphics().roundRect(0,-2,distance,4,2).fill({color:accent,alpha:.92});
    beam.position.set(source.x,source.y);
    beam.rotation=Math.atan2(dy,dx);
    beam.scale.x=0;
    const flash=new Graphics()
      .circle(source.x,source.y,16).fill({color:0xffffff,alpha:.92})
      .circle(source.x,source.y,28).stroke({width:4,color:accent,alpha:.72});
    const effect=new Container({label:'PVEAccountBattleUnitCosmeticShot'});
    effect.zIndex=950;
    effect.eventMode='none';
    effect.addChild(beam,flash);
    this.effectLayer.addChild(effect);
    this.fireEffect=effect;
    this.shotCount+=1;
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        this.fireResolve=null;
        this.fireTimeline=null;
        if(this.fireEffect===effect)this.fireEffect=null;
        effect.removeFromParent();
        effect.destroy({children:true});
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
        .to(beam.scale,{x:1,duration:.07,ease:'power4.out'},0)
        .to(flash,{alpha:0,duration:.12,ease:'power2.out'},.035)
        .to(beam,{alpha:0,duration:.13,ease:'power2.in'},.08)
        .to(this.weaponSprite,{x:this.attachment.x,rotation:this.attachment.rotation,duration:.16,ease:'back.out(1.7)'},.07)
        .to(this.view,{x:0,duration:.16,ease:'back.out(1.7)'},.07);
    });
  }

  diagnostics(){
    return {
      active:this.active,
      id:'ACCOUNT_BATTLE_UNIT',
      role:'PVE_COSMETIC_RANGED_SUPPORT',
      fixedPosition:true,
      bodySource:this.bodySource,
      weaponSource:this.weaponSource,
      weaponFlipX:this.attachment.flipX,
      separateWeaponAttachment:true,
      shotCount:this.shotCount,
      affectsDeck:false,
      affectsDamage:false
    };
  }

  destroy(){
    this.cancelFire();
    this.stopIdle();
    this.root.destroy({children:true});
  }
}
