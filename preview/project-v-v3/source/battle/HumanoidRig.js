import {Assets, Container, Graphics, Sprite, Texture} from 'pixi.js';

export const HUMANOID_RIG_ID='project-v-sd-humanoid-v1';

export const HUMANOID_BONE_ORDER=Object.freeze([
  'armFarUpper','armFarLower','handFar',
  'legFarUpper','legFarLower','footFar',
  'torso','head',
  'legNearUpper','legNearLower','footNear',
  'armNearUpper','armNearLower','handNear','weapon'
]);

export const HUMANOID_SKIN_SLOTS=Object.freeze([
  'backAccessory',
  'armFarUpper','armFarLower','handFar',
  'legFarUpper','legFarLower','footFar',
  'torso','head','face','hairBack','hairFront',
  'legNearUpper','legNearLower','footNear',
  'armNearUpper','armNearLower','handNear','weapon',
  'frontAccessory'
]);

// Every production skin is authored against these fixed local canvases.
// A character may look completely different, but it may not move pivots or
// resize bones. Long hair, skirts and capes belong in accessory/mesh slots.
export const HUMANOID_SKIN_SLOT_SPEC=Object.freeze({
  backAccessory:{width:180,height:260,anchorX:.5,anchorY:.5,x:0,y:-165},
  torso:{width:126,height:126,anchorX:.5,anchorY:.9,x:0,y:-56},
  head:{width:144,height:144,anchorX:.5,anchorY:.84,x:0,y:-54},
  face:{width:144,height:144,anchorX:.5,anchorY:.84,x:0,y:-54},
  hairBack:{width:162,height:178,anchorX:.5,anchorY:.78,x:0,y:-57},
  hairFront:{width:162,height:178,anchorX:.5,anchorY:.78,x:0,y:-57},
  armFarUpper:{width:54,height:78,anchorX:.5,anchorY:.08,x:0,y:0},
  armFarLower:{width:50,height:72,anchorX:.5,anchorY:.08,x:0,y:0},
  handFar:{width:42,height:44,anchorX:.5,anchorY:.18,x:0,y:0},
  armNearUpper:{width:58,height:82,anchorX:.5,anchorY:.08,x:0,y:0},
  armNearLower:{width:52,height:74,anchorX:.5,anchorY:.08,x:0,y:0},
  handNear:{width:44,height:46,anchorX:.5,anchorY:.18,x:0,y:0},
  legFarUpper:{width:62,height:84,anchorX:.5,anchorY:.08,x:0,y:0},
  legFarLower:{width:56,height:84,anchorX:.5,anchorY:.08,x:0,y:0},
  footFar:{width:58,height:36,anchorX:.4,anchorY:.45,x:0,y:0},
  legNearUpper:{width:64,height:86,anchorX:.5,anchorY:.08,x:0,y:0},
  legNearLower:{width:58,height:86,anchorX:.5,anchorY:.08,x:0,y:0},
  footNear:{width:60,height:38,anchorX:.4,anchorY:.45,x:0,y:0},
  weapon:{width:210,height:210,anchorX:.18,anchorY:.78,x:0,y:0},
  frontAccessory:{width:190,height:270,anchorX:.5,anchorY:.5,x:0,y:-160}
});

const COLORS=Object.freeze({
  outline:0x536474,
  // The neutral dummy is one material. Depth comes from overlap/z-order,
  // never from colouring each limb as a different object.
  core:0xdce4ea,
  far:0xdce4ea,
  near:0xdce4ea,
  shadow:0x9aa9b5,
  facePlane:0xb7c5cf,
  eye:0x3f5261
});

async function resolveTexture(source){
  if(!source)return Texture.EMPTY;
  if(typeof source==='string')return Assets.load(source);
  return source;
}

function makeBone(name,x,y,zIndex,parent){
  const bone=new Container({label:`RigBone:${name}`,sortableChildren:true});
  bone.position.set(x,y);
  bone.zIndex=zIndex;
  bone.boneName=name;
  parent.addChild(bone);
  return bone;
}

function taperedSegment({length,topWidth,bottomWidth,fill}){
  const root=new Container({label:'ContinuousLimbArt'});
  const body=new Graphics()
    // The art overlaps both sockets.  The pivots remain at the joints, but
    // no transparent gap can open between upper/lower limbs while rotating.
    .moveTo(-topWidth*.46,-8)
    .quadraticCurveTo(-topWidth*.58,length*.22,-bottomWidth*.48,length+5)
    .quadraticCurveTo(0,length+10,bottomWidth*.48,length+5)
    .quadraticCurveTo(topWidth*.58,length*.22,topWidth*.46,-8)
    .quadraticCurveTo(0,-12,-topWidth*.46,-8)
    .closePath()
    .fill({color:fill,alpha:1});
  const softShade=new Graphics()
    .moveTo(-topWidth*.39,-5)
    .quadraticCurveTo(-topWidth*.46,length*.34,-bottomWidth*.36,length+2)
    .quadraticCurveTo(-bottomWidth*.12,length+5,-bottomWidth*.04,length+2)
    .quadraticCurveTo(-topWidth*.1,length*.32,-topWidth*.04,-6)
    .closePath()
    .fill({color:COLORS.shadow,alpha:.11});
  root.addChild(body,softShade);
  return root;
}

function jointCap(width,height,fill){
  return new Graphics().ellipse(0,0,width*.5,height*.5).fill({color:fill,alpha:1});
}

function torsoShape(){
  const root=new Container({label:'ContinuousTorsoArt'});
  const body=new Graphics()
    .moveTo(-22,7)
    .quadraticCurveTo(-28,-24,-34,-55)
    .quadraticCurveTo(-39,-79,-25,-94)
    .quadraticCurveTo(-5,-105,24,-92)
    .quadraticCurveTo(39,-78,33,-51)
    .quadraticCurveTo(28,-20,23,7)
    .quadraticCurveTo(1,16,-22,7)
    .closePath()
    .fill({color:COLORS.core,alpha:1});
  const shade=new Graphics()
    .moveTo(-25,-91)
    .quadraticCurveTo(-34,-65,-26,-15)
    .quadraticCurveTo(-19,3,-10,8)
    .lineTo(-2,9)
    .quadraticCurveTo(-12,-39,-8,-99)
    .closePath()
    .fill({color:COLORS.shadow,alpha:.1});
  root.addChild(body,shade);
  return root;
}

function headShape(){
  const head=new Graphics()
    .moveTo(-5,4)
    .bezierCurveTo(-27,1,-47,-21,-49,-52)
    .bezierCurveTo(-51,-85,-31,-111,0,-117)
    .bezierCurveTo(29,-122,47,-102,49,-76)
    .bezierCurveTo(50,-66,48,-60,51,-56)
    // Short, soft 3/4 nose. Avoid the long realistic profile that made the
    // neutral dummy uncanny when no character skin was applied.
    .quadraticCurveTo(57,-52,52,-48)
    .quadraticCurveTo(49,-45,47,-43)
    .bezierCurveTo(43,-28,34,-16,18,-8)
    .bezierCurveTo(10,-3,2,2,-5,4)
    .closePath()
    .fill({color:COLORS.near,alpha:1})
    .stroke({width:1.55,color:COLORS.outline,alpha:.66});
  const ear=new Graphics()
    .ellipse(-38,-56,7,10)
    .fill({color:COLORS.core,alpha:1})
    .stroke({width:1,color:COLORS.outline,alpha:.5})
    .arc(-37,-56,3.7,-1.2,1.3)
    .stroke({width:.85,color:COLORS.facePlane,alpha:.7});
  const plane=new Graphics()
    .moveTo(3,-101)
    .bezierCurveTo(26,-94,40,-79,42,-62)
    .stroke({width:.9,color:COLORS.facePlane,alpha:.42});
  const farBrow=new Graphics()
    .moveTo(-3,-73).quadraticCurveTo(4,-77,12,-73)
    .stroke({width:1.35,color:COLORS.eye,alpha:.52});
  const nearBrow=new Graphics()
    .moveTo(20,-74).quadraticCurveTo(29,-79,38,-73)
    .stroke({width:1.5,color:COLORS.eye,alpha:.64});
  const farEye=new Graphics()
    .ellipse(6,-63,4.4,5.7).fill({color:COLORS.eye,alpha:.72})
    .ellipse(7.2,-65,1.25,1.55).fill({color:0xffffff,alpha:.9});
  const nearEye=new Graphics()
    .ellipse(29,-62,5.8,7).fill({color:COLORS.eye,alpha:.84})
    .ellipse(30.6,-64.5,1.6,1.9).fill({color:0xffffff,alpha:.95});
  const noseMark=new Graphics()
    .moveTo(42,-52).quadraticCurveTo(45,-49,48,-50)
    .stroke({width:1,color:COLORS.facePlane,alpha:.62});
  const mouth=new Graphics()
    .moveTo(25,-31).quadraticCurveTo(31,-27,37,-31)
    .stroke({width:1.15,color:COLORS.eye,alpha:.5});
  const cheek=new Graphics().ellipse(36,-43,8,3.4).fill({color:0xbfcbd4,alpha:.18});
  const highlight=new Graphics().ellipse(-13,-89,20,27).fill({color:0xffffff,alpha:.18});
  const root=new Container({label:'MannequinHeadArt'});
  root.addChild(head,highlight,ear,plane,farBrow,nearBrow,farEye,nearEye,noseMark,cheek,mouth);
  return root;
}

function handShape(fill,near=false){
  const root=new Container();
  const palm=new Graphics()
    .ellipse(near?1:0,8,11.5,14)
    .fill({color:fill,alpha:1});
  const thumb=new Graphics()
    .ellipse(near?7:-6,9,4.5,7)
    .fill({color:fill,alpha:1});
  root.addChild(palm,thumb);
  return root;
}

function footShape(fill,near=false){
  const root=new Container();
  const foot=new Graphics()
    .roundRect(-14,-4,near?39:37,17,8)
    .fill({color:fill,alpha:1});
  const shine=new Graphics().roundRect(near?4:3,-1,13,3,2).fill({color:0xffffff,alpha:.16});
  root.addChild(foot,shine);
  return root;
}

function slotContainer(name,bone,zIndex=10){
  const slot=new Container({label:`RigSkinSlot:${name}`,sortableChildren:true});
  slot.zIndex=zIndex;
  bone.addChild(slot);
  return slot;
}

function snapshot(display){
  return {
    x:display.x,
    y:display.y,
    rotation:display.rotation,
    scaleX:display.scale.x,
    scaleY:display.scale.y,
    alpha:display.alpha
  };
}

function restore(display,pose){
  display.position.set(pose.x,pose.y);
  display.rotation=pose.rotation;
  display.scale.set(pose.scaleX,pose.scaleY);
  display.alpha=pose.alpha;
}

export class HumanoidRig{
  constructor({accent=0x55d9ff}={}){
    this.id=HUMANOID_RIG_ID;
    this.accent=accent;
    this.root=new Container({label:`HumanoidRig:${this.id}`,sortableChildren:true});
    this.bones={};
    this.skinSlots={};
    this.baseRenderables=[];
    this.skinRevision=0;
    this.build();
    this.captureBindPose();
  }

  addBase(bone,display,zIndex=1){
    display.zIndex=zIndex;
    bone.addChild(display);
    this.baseRenderables.push(display);
    return display;
  }

  addSlot(name,bone,zIndex=10){
    const slot=slotContainer(name,bone,zIndex);
    this.skinSlots[name]=slot;
    return slot;
  }

  build(){
    const root=this.root;
    const farArm=makeBone('armFarUpper',-39,-205,10,root);
    farArm.rotation=.12;
    this.bones.armFarUpper=farArm;
    this.addBase(farArm,jointCap(33,29,COLORS.far),0);
    this.addBase(farArm,taperedSegment({length:57,topWidth:32,bottomWidth:27,fill:COLORS.far}));
    this.addSlot('armFarUpper',farArm);
    const farForearm=makeBone('armFarLower',0,53,2,farArm);
    farForearm.rotation=-.08;
    this.bones.armFarLower=farForearm;
    this.addBase(farForearm,jointCap(28,25,COLORS.far),0);
    this.addBase(farForearm,taperedSegment({length:53,topWidth:28,bottomWidth:22,fill:COLORS.far}));
    this.addSlot('armFarLower',farForearm);
    const farHand=makeBone('handFar',0,51,3,farForearm);
    this.bones.handFar=farHand;
    this.addBase(farHand,handShape(COLORS.far,false));
    this.addSlot('handFar',farHand);

    const farLeg=makeBone('legFarUpper',-14,-126,20,root);
    farLeg.rotation=.055;
    this.bones.legFarUpper=farLeg;
    this.addBase(farLeg,jointCap(41,35,COLORS.far),0);
    this.addBase(farLeg,taperedSegment({length:63,topWidth:39,bottomWidth:34,fill:COLORS.far}));
    this.addSlot('legFarUpper',farLeg);
    const farShin=makeBone('legFarLower',0,59,2,farLeg);
    farShin.rotation=-.045;
    this.bones.legFarLower=farShin;
    this.addBase(farShin,jointCap(35,31,COLORS.far),0);
    this.addBase(farShin,taperedSegment({length:61,topWidth:34,bottomWidth:27,fill:COLORS.far}));
    this.addSlot('legFarLower',farShin);
    const farFoot=makeBone('footFar',0,58,3,farShin);
    this.bones.footFar=farFoot;
    this.addBase(farFoot,footShape(COLORS.far,false));
    this.addSlot('footFar',farFoot);

    const torso=makeBone('torso',2,-130,30,root);
    this.bones.torso=torso;
    this.addBase(torso,torsoShape());
    this.addSlot('torso',torso);

    const head=makeBone('head',1,-224,40,root);
    // Shared SD proportion: enlarge the complete head subtree (base, face,
    // hair and future headgear) without moving the neck joint.
    head.scale.set(1.2);
    this.bones.head=head;
    this.addBase(head,headShape());
    this.addSlot('hairBack',head,8);
    this.addSlot('head',head,10);
    this.addSlot('face',head,12);
    this.addSlot('hairFront',head,14);

    const nearLeg=makeBone('legNearUpper',18,-124,50,root);
    nearLeg.rotation=-.05;
    this.bones.legNearUpper=nearLeg;
    this.addBase(nearLeg,jointCap(43,37,COLORS.near),0);
    this.addBase(nearLeg,taperedSegment({length:65,topWidth:41,bottomWidth:35,fill:COLORS.near}));
    this.addSlot('legNearUpper',nearLeg);
    const nearShin=makeBone('legNearLower',0,61,2,nearLeg);
    nearShin.rotation=.04;
    this.bones.legNearLower=nearShin;
    this.addBase(nearShin,jointCap(36,32,COLORS.near),0);
    this.addBase(nearShin,taperedSegment({length:63,topWidth:35,bottomWidth:28,fill:COLORS.near}));
    this.addSlot('legNearLower',nearShin);
    const nearFoot=makeBone('footNear',0,60,3,nearShin);
    this.bones.footNear=nearFoot;
    this.addBase(nearFoot,footShape(COLORS.near,true));
    this.addSlot('footNear',nearFoot);

    const nearArm=makeBone('armNearUpper',43,-198,60,root);
    nearArm.rotation=-.105;
    this.bones.armNearUpper=nearArm;
    this.addBase(nearArm,jointCap(35,31,COLORS.near),0);
    this.addBase(nearArm,taperedSegment({length:59,topWidth:34,bottomWidth:29,fill:COLORS.near}));
    this.addSlot('armNearUpper',nearArm);
    const nearForearm=makeBone('armNearLower',0,55,2,nearArm);
    nearForearm.rotation=.08;
    this.bones.armNearLower=nearForearm;
    this.addBase(nearForearm,jointCap(30,27,COLORS.near),0);
    this.addBase(nearForearm,taperedSegment({length:55,topWidth:29,bottomWidth:23,fill:COLORS.near}));
    this.addSlot('armNearLower',nearForearm);
    const nearHand=makeBone('handNear',0,53,3,nearForearm);
    this.bones.handNear=nearHand;
    this.addBase(nearHand,handShape(COLORS.near,true));
    this.addSlot('handNear',nearHand);
    const weapon=makeBone('weapon',5,14,20,nearHand);
    this.bones.weapon=weapon;
    this.addSlot('weapon',weapon);

    const backAccessory=makeBone('backAccessory',0,0,5,root);
    const frontAccessory=makeBone('frontAccessory',0,0,70,root);
    this.bones.backAccessory=backAccessory;
    this.bones.frontAccessory=frontAccessory;
    this.addSlot('backAccessory',backAccessory);
    this.addSlot('frontAccessory',frontAccessory);

    root.sortChildren();
  }

  captureBindPose(){
    this.bindPose={root:snapshot(this.root),bones:{}};
    Object.entries(this.bones).forEach(([name,bone])=>{this.bindPose.bones[name]=snapshot(bone)});
    return this.bindPose;
  }

  restoreBindPose(){
    if(!this.bindPose)return;
    restore(this.root,this.bindPose.root);
    Object.entries(this.bindPose.bones).forEach(([name,pose])=>{
      const bone=this.bones[name];
      if(bone)restore(bone,pose);
    });
  }

  tweenTargets(){
    return [this.root,...Object.values(this.bones)];
  }

  async applySkin(skin={}){
    if(skin.rigId&&skin.rigId!==this.id)throw new Error(`RIG_SKIN_MISMATCH:${skin.rigId}`);
    const revision=++this.skinRevision;
    const requested=Object.entries(skin.slots||{}).filter(([name,source])=>this.skinSlots[name]&&source);
    const loaded=await Promise.all(requested.map(async([name,source])=>{
      const normalized=typeof source==='object'&&source.source?source.source:source;
      return [name,await resolveTexture(normalized)];
    }));
    if(revision!==this.skinRevision)return this;
    for(const [name,texture] of loaded){
      const slot=this.skinSlots[name];
      slot.removeChildren().forEach(child=>child.destroy?.());
      const spec=HUMANOID_SKIN_SLOT_SPEC[name];
      const sprite=new Sprite(texture||Texture.EMPTY);
      sprite.label=`RigSkin:${name}`;
      sprite.anchor.set(spec.anchorX,spec.anchorY);
      sprite.position.set(spec.x,spec.y);
      sprite.width=spec.width;
      sprite.height=spec.height;
      slot.addChild(sprite);
    }
    return this;
  }

  clearSkin(slotName=null){
    const slots=slotName?[this.skinSlots[slotName]].filter(Boolean):Object.values(this.skinSlots);
    slots.forEach(slot=>slot.removeChildren().forEach(child=>child.destroy?.()));
    this.skinRevision+=1;
  }

  setBaseVisible(visible=true){
    this.baseRenderables.forEach(display=>{display.visible=Boolean(visible)});
  }

  setTint(value=0xffffff){
    this.baseRenderables.forEach(display=>{display.tint=value});
    Object.values(this.skinSlots).forEach(slot=>{
      slot.children.forEach(child=>{if('tint' in child)child.tint=value});
    });
  }

  diagnostics(){
    return {
      rigId:this.id,
      bones:Object.keys(this.bones),
      slots:Object.keys(this.skinSlots),
      skinReady:Object.fromEntries(Object.entries(this.skinSlots).map(([name,slot])=>[name,slot.children.length>0]))
    };
  }

  destroy(){
    this.root.destroy({children:true});
  }
}
