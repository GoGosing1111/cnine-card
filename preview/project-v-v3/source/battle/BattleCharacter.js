import {Assets, Container, Graphics, Sprite, Text, Texture} from 'pixi.js';
import {BattleAnimation} from './BattleAnimation.js';
import {
  HUMANOID_BONE_ORDER,
  HUMANOID_RIG_ID,
  HUMANOID_SKIN_SLOTS,
  HumanoidRig
} from './HumanoidRig.js';

export const TEAM=Object.freeze({ALLY:'ALLY',ENEMY:'ENEMY'});
export const CHARACTER_STATE=Object.freeze({
  IDLE:'IDLE',
  MOVE:'MOVE',
  ATTACK:'ATTACK',
  HIT:'HIT',
  DEAD:'DEAD'
});

export const CHARACTER_ASSET_SPEC=Object.freeze({
  width:256,
  height:384,
  anchorX:.5,
  anchorY:1,
  localOrigin:'SOLE_CENTER',
  rigId:HUMANOID_RIG_ID
});

// Compatibility export consumed by BattleEngine diagnostics. These are no
// longer full-canvas PNG layers; they are attachment slots on one shared rig.
export const AVATAR_LAYER_ORDER=HUMANOID_SKIN_SLOTS;
export {HUMANOID_BONE_ORDER,HUMANOID_RIG_ID,HUMANOID_SKIN_SLOTS};

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function uiText(text,size,color=0xffffff,weight='800'){
  return new Text({
    text,
    style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:size,fill:color,fontWeight:weight,align:'center'}
  });
}

async function resolveTexture(source){
  if(!source)return Texture.EMPTY;
  if(typeof source==='string')return Assets.load(source);
  return source;
}

/**
 * Battle actor with one canonical, articulated SD humanoid rig.
 *
 * The skeleton, pivots and animations are immutable across characters.
 * Character art is supplied only as a skin pack whose attachment names match
 * HUMANOID_SKIN_SLOTS. Full-body portrait PNGs are cut-in art only and are
 * never cropped or forced into limb joints.
 */
export class BattleCharacter{
  constructor({
    id,
    name,
    team=TEAM.ALLY,
    texture,
    fullBodyTexture=null,
    fullBodyHeight=360,
    avatarParts=null,
    cutInTexture=texture,
    x=0,
    y=0,
    scale=.48,
    accent=0x55d9ff,
    hp=100,
    shield=0,
    maxShield=0,
    animationAdapter=null
  }){
    this.id=id;
    this.name=name;
    this.team=team;
    this.accent=accent;
    this.state=CHARACTER_STATE.IDLE;
    this.hp=clamp(hp,0,100);
    this.shield=Math.max(0,Number(shield)||0);
    this.maxShield=Math.max(this.shield,Number(maxShield)||0);
    this.baseX=x;
    this.baseY=y;
    this.restScale=scale;
    this.designScale=scale;
    this.gridPosition={x:0,y:0};
    this.perspectiveDepth=0;
    this.perspectiveResolver=null;
    this.texture=texture;
    this.cutInTexture=cutInTexture;
    this.fullBodyHeight=Math.max(120,Number(fullBodyHeight)||360);
    this.avatarMode=true;
    this.rigged=true;
    this.rigId=HUMANOID_RIG_ID;
    this.avatarRevision=0;

    this.root=new Container({label:`${team}:${id}`,sortableChildren:true});
    this.root.position.set(x,y);
    this.root.scale.set(scale);
    this.root.baseX=x;
    this.root.baseY=y;
    this.root.restScale=scale;
    this.root.actor=this;

    this.view=new Container({label:`Avatar:${id}`,sortableChildren:true});
    this.view.zIndex=2;
    this.root.addChild(this.view);
    this.buildHumanoidRig();
    if(fullBodyTexture)this.useFullBodySprite(fullBodyTexture,this.fullBodyHeight);

    this.stateHalo=new Graphics()
      .ellipse(0,-7,105,25)
      .stroke({width:3,color:accent,alpha:.74});
    this.stateHalo.zIndex=1;
    this.root.addChildAt(this.stateHalo,0);

    // HUD stays outside the mirrored rig so enemy labels never flip.
    this.hud=new Container({label:`HUD:${id}`});
    this.hud.pivot.set(110,0);
    this.hud.position.set(0,-410);
    this.hud.zIndex=5;
    this.namePlate=new Graphics()
      .roundRect(0,0,220,40,6)
      .fill({color:0x05080d,alpha:.88})
      .stroke({width:1,color:accent,alpha:.55});
    this.nameLabel=uiText(name,20,0xffffff,'900');
    this.nameLabel.anchor.set(.5);
    this.nameLabel.position.set(110,20);
    this.shieldShell=new Graphics()
      .roundRect(10,47,200,14,7)
      .fill({color:0x03101a,alpha:.96})
      .stroke({width:1,color:0x69dcff,alpha:.82});
    this.shieldFill=new Graphics();
    this.shieldLabel=uiText('',10,0xf1fbff,'900');
    this.shieldLabel.anchor.set(.5);
    this.shieldLabel.position.set(110,54);
    this.hpShell=new Graphics().roundRect(10,47,200,14,7).fill({color:0x020407,alpha:.94});
    this.hpFill=new Graphics();
    this.hud.addChild(
      this.namePlate,
      this.nameLabel,
      this.shieldShell,
      this.shieldFill,
      this.shieldLabel,
      this.hpShell,
      this.hpFill
    );
    this.root.addChild(this.hud);
    this.layoutHudBars();
    this.renderShield();
    this.renderHp();

    this.animationController=new BattleAnimation(this);
    this.animationAdapter=animationAdapter||this.animationController;
    this.applyFacing();
    this.captureNeutralAvatarPose();
    this.animationAdapter?.setState?.(this.state);

    if(avatarParts)this.applySkin(avatarParts).catch(error=>console.error('[Project V rig skin]',error));

    Object.defineProperties(this,{
      x:{get:()=>this.root.x,set:value=>{this.root.x=value}},
      y:{get:()=>this.root.y,set:value=>{this.root.y=value}},
      zIndex:{get:()=>this.root.zIndex,set:value=>{this.root.zIndex=value}},
      position:{get:()=>this.root.position},
      scale:{get:()=>this.root.scale},
      tint:{get:()=>this._tint??0xffffff,set:value=>{this.setTint(value)}}
    });
  }

  buildHumanoidRig(){
    this.animationAdapter?.kill?.();
    this.view.removeChildren().forEach(child=>child.destroy?.({children:true}));

    this.shadow=new Graphics().ellipse(0,-5,96,20).fill({color:0x000000,alpha:.56});
    this.shadow.label='AvatarShadow';
    this.shadow.zIndex=0;

    this.rig=new HumanoidRig({accent:this.accent});
    this.rig.root.zIndex=10;
    this.fullBodySprite=new Sprite(Texture.EMPTY);
    this.fullBodySprite.label='FullBodyCombatSkin';
    this.fullBodySprite.anchor.set(.5,.98);
    this.fullBodySprite.position.set(0,0);
    this.fullBodySprite.zIndex=11;
    this.fullBodySprite.visible=false;
    this.mainSprite=this.fullBodySprite;
    this.view.addChild(this.shadow,this.rig.root,this.fullBodySprite);
    this.view.sortChildren();
    this.view.pivot.set(0,0);
    this.view.position.set(0,0);
    this.view.rotation=0;
    this.view.alpha=1;
    this.avatarMode=true;
    this.rigged=true;
    this.rigId=this.rig.id;
    this.avatarSprites={};
    this.setTint(this._tint||0xffffff);
  }

  useFullBodySprite(texture,height=this.fullBodyHeight){
    if(!texture||texture===Texture.EMPTY)return this;
    this.fullBodySprite.texture=texture;
    const ratio=Math.max(.2,Number(texture.width||1)/Math.max(1,Number(texture.height||1)));
    const targetHeight=Math.max(120,Number(height)||360);
    this.fullBodyHeight=targetHeight;
    this.fullBodySprite.height=targetHeight;
    this.fullBodySprite.width=targetHeight*ratio;
    this.fullBodySprite.visible=true;
    this.rig.root.visible=false;
    this.fullSpriteMode=true;
    if(this.neutralAvatarPose)this.captureNeutralAvatarPose();
    return this;
  }

  clearFullBodySprite(){
    this.fullBodySprite.visible=false;
    this.fullBodySprite.texture=Texture.EMPTY;
    this.rig.root.visible=true;
    this.fullSpriteMode=false;
    return this;
  }

  async applySkin(skin={}){
    const normalized=skin.slots||skin.rigId
      ?skin
      :{rigId:HUMANOID_RIG_ID,slots:skin};
    await this.rig.applySkin(normalized);
    this.setTint(this._tint||0xffffff);
    return this;
  }

  async changeAvatarParts(parts={}){
    return this.applySkin(parts);
  }

  clearSkin(slotName=null){
    this.rig.clearSkin(slotName);
    return this;
  }

  captureNeutralAvatarPose(){
    this.neutralAvatarPose={
      x:this.view.x,
      y:this.view.y,
      rotation:this.view.rotation,
      alpha:this.view.alpha,
      scaleX:this.view.scale.x,
      scaleY:this.view.scale.y,
      mainSprite:this.fullBodySprite?{
        x:this.fullBodySprite.x,
        y:this.fullBodySprite.y,
        rotation:this.fullBodySprite.rotation,
        alpha:this.fullBodySprite.alpha,
        scaleX:this.fullBodySprite.scale.x,
        scaleY:this.fullBodySprite.scale.y
      }:null
    };
    this.rig.captureBindPose();
    return this.neutralAvatarPose;
  }

  restoreNeutralAvatarPose(){
    const pose=this.neutralAvatarPose;
    if(!pose)return;
    this.view.position.set(pose.x,pose.y);
    this.view.rotation=pose.rotation;
    this.view.alpha=pose.alpha;
    this.view.scale.set(pose.scaleX,pose.scaleY);
    if(this.fullBodySprite&&pose.mainSprite){
      this.fullBodySprite.position.set(pose.mainSprite.x,pose.mainSprite.y);
      this.fullBodySprite.rotation=pose.mainSprite.rotation;
      this.fullBodySprite.alpha=pose.mainSprite.alpha;
      this.fullBodySprite.scale.set(pose.mainSprite.scaleX,pose.mainSprite.scaleY);
    }
  }

  setTint(value=0xffffff){
    this._tint=value;
    this.rig?.setTint(value);
    if(this.fullBodySprite)this.fullBodySprite.tint=value;
  }

  applyFacing(){
    const magnitude=Math.abs(this.view.scale.x||1);
    this.view.scale.x=this.team===TEAM.ENEMY?-magnitude:magnitude;
    if(this.neutralAvatarPose)this.neutralAvatarPose.scaleX=this.view.scale.x;
    this.animationAdapter?.setFacing?.(this.team===TEAM.ENEMY?-1:1);
  }

  setFormation(x,y,scale=this.restScale){
    this.baseX=x;
    this.baseY=y;
    this.restScale=scale;
    this.root.baseX=x;
    this.root.baseY=y;
    this.root.restScale=scale;
    this.root.position.set(x,y);
    this.root.scale.set(scale);
  }

  getPerspectiveScale(screenY=this.root.y){
    const resolved=this.perspectiveResolver?.(screenY);
    return Number.isFinite(resolved)?resolved:this.restScale;
  }

  updatePerspective(depth=0){
    this.perspectiveDepth=clamp(Number(depth)||0,0,1);
    this.root.perspectiveDepth=this.perspectiveDepth;
    const perspectiveScale=.9+this.perspectiveDepth*.1;
    const hudScale=perspectiveScale*(this.team===TEAM.ALLY?1.38:1);
    this.hud.position.set(0,-392-this.perspectiveDepth*20);
    this.hud.scale.set(hudScale);
    this.stateHalo.scale.set(.9+this.perspectiveDepth*.1);
    this.shadow.scale.set(.9+this.perspectiveDepth*.12);
  }

  setCompactHud(enabled=false){
    this.compactHud=Boolean(enabled);
    this.namePlate.visible=true;
    this.nameLabel.visible=true;
    this.layoutHudBars();
  }

  layoutHudBars(){
    const compactOffset=this.compactHud?3:0;
    const hasShield=this.maxShield>0;
    const shieldOffset=compactOffset;
    const hpOffset=(hasShield?18:0)+compactOffset;
    this.shieldShell.position.y=shieldOffset;
    this.shieldFill.position.y=shieldOffset;
    this.shieldLabel.position.y=54+shieldOffset;
    this.hpShell.position.y=hpOffset;
    this.hpFill.position.y=hpOffset;
    this.shieldShell.visible=hasShield;
    this.shieldFill.visible=hasShield;
    this.shieldLabel.visible=hasShield;
  }

  setState(next){
    if(!Object.values(CHARACTER_STATE).includes(next))throw new Error(`Unknown character state: ${next}`);
    if(this.state===CHARACTER_STATE.DEAD&&next!==CHARACTER_STATE.IDLE)return this.state;
    this.state=next;
    this.animationAdapter?.setState?.(next);
    this.stateHalo.alpha=next===CHARACTER_STATE.IDLE?.5:1;
    this.stateHalo.tint=next===CHARACTER_STATE.HIT?0xff596d:next===CHARACTER_STATE.ATTACK?0xffd43d:0xffffff;
    return this.state;
  }

  setHp(value){
    this.hp=clamp(Number(value)||0,0,100);
    this.renderHp();
    // V1800: setHp 가 단방향이라 한 번 DEAD 가 되면 HP 가 다시 올라도 DEAD 로 남았다.
    // 서버는 불굴(INDOMITABLE)·불굴의 생존(SURVIVE)·불사조 부활로 HP 0 직후 다시
    // 살려내는데, 클라이언트만 DEAD 로 굳어 버리니 isAlive() 가 false 가 되고
    // selectLiveTarget() 이 서버가 지정한 대상을 버리고 엉뚱한 캐릭터를 때린다.
    // 그러다 다음 이벤트로 HP 가 채워지면 "죽은 애가 되살아난 것"처럼 보였다.
    if(this.hp<=0)this.setState(CHARACTER_STATE.DEAD);
    else if(this.state===CHARACTER_STATE.DEAD)this.setState(CHARACTER_STATE.IDLE);
    return this.hp;
  }

  setShield(value,maxValue=this.maxShield){
    const next=Math.max(0,Number(value)||0);
    this.maxShield=Math.max(next,Number(maxValue)||0);
    this.shield=clamp(next,0,this.maxShield||next);
    this.layoutHudBars();
    this.renderShield();
    return this.shield;
  }

  renderShield(){
    this.shieldFill.clear();
    if(this.maxShield<=0){
      this.shieldLabel.text='';
      return;
    }
    const ratio=clamp(this.shield/this.maxShield,0,1);
    if(ratio>0){
      this.shieldFill
        .roundRect(12,50,196*ratio,8,5)
        .fill({color:ratio<.25?0x4f84a8:0x62ddff,alpha:.98});
    }
    this.shieldLabel.text=ratio>0?`SHIELD ${Math.round(ratio*100)}%`:'SHIELD BREAK';
    this.shieldLabel.style.fill=ratio>0?0xf1fbff:0xffa6af;
  }

  renderHp(){
    this.hpFill.clear();
    const color=this.hp<30?0xff586b:this.hp<60?0xffbd45:0x58dfa0;
    this.hpFill.roundRect(12,50,196*this.hp/100,8,5).fill(color);
  }

  setAnimationAdapter(adapter){
    const next=adapter||this.animationController;
    if(this.animationAdapter&&this.animationAdapter!==next)this.animationAdapter.destroy?.();
    this.animationAdapter=next;
    this.applyFacing();
    this.captureNeutralAvatarPose();
    this.animationAdapter?.setState?.(this.state);
  }

  async changeTexture(source,{cutInTexture=null}={}){
    const texture=await resolveTexture(source);
    if(!texture)throw new Error(`${this.name} texture could not be loaded`);
    this.texture=texture;
    this.cutInTexture=cutInTexture?await resolveTexture(cutInTexture):texture;
    this.animationAdapter?.changeTexture?.(texture);
    return this;
  }

  rigDiagnostics(){
    return this.rig?.diagnostics?.()||null;
  }

  destroy(){
    this.animationAdapter?.destroy?.();
    if(this.animationController&&this.animationAdapter!==this.animationController)this.animationController.destroy();
    this.root.destroy({children:true});
  }
}
