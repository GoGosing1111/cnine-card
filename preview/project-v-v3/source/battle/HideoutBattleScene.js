import {Assets,Container,Graphics,Sprite} from 'pixi.js';
import {gsap} from 'gsap';
import {projectRaidPlacement} from '../../../../shared/hideout-defense-v1.mjs';
import {attachHideoutTurret,playTurretVolley} from './HideoutTurret.js';
import {BattleHud} from './BattleHud.js';
import {CHARACTER_STATE,TEAM} from './BattleCharacter.js';

const directory='/assets/ui/personal-hideout-20261116/';
export const isHideoutBattle=data=>data?.sceneAssetKey==='PERSONAL_HIDEOUT_RAID';

export function fitHideoutBackdrop(sprite,bounds){
  // Preserve the wall/floor junction on tall phones and wide desktop screens.
  const h=sprite.texture.height*Math.abs(sprite.scale.y);
  sprite.y=bounds.y+bounds.height*.25+h*(.5-.25);
}

export function clearHideoutScene(engine){
  if(!engine.hideoutScene)return;
  for(const prop of engine.hideoutScene.props.values()){
    if(prop.turret)engine.settlePendingTails([prop.turret]);
    prop.health?.hud.destroy({children:true});
    prop.root.destroy({children:true});
  }
  engine.hideoutScene=null;
  engine.lastHideoutShot=null;
}

function layoutProp(engine,prop){
  const {root,body,contact,item,geometry}=prop,screen=engine.app?.screen;
  if(!screen||!engine.root||!body.texture.width)return;
  const scale=engine.root.scale.x||1,viewWidth=screen.width/scale,viewHeight=screen.height/scale;
  const left=-engine.root.x/scale,top=-engine.root.y/scale;
  const size=geometry.width*viewWidth;
  const px=left+viewWidth*geometry.x,py=top+viewHeight*geometry.y;
  root.position.set(px,py);
  root.depthSortY=geometry.wall?-99990:py;
  const artWidth=prop.turret?.base.texture.width||body.texture.width;
  prop.art.scale.set((item.flipped?-1:1)*size/artWidth,size/artWidth);
  if(prop.health){
    const hud=prop.health.hud;
    const pixelWidth=Math.max(engine.mobile?88:80,Math.min(100,size*scale));
    const half=pixelWidth/2+2,center=screen.width*geometry.x;
    const offsetX=(Math.max(half,Math.min(screen.width-half,center))-center)/scale;
    hud.scale.set(pixelWidth/(300*scale));
    const point=engine.uiLayer.toLocal({x:offsetX,y:-size*.88-4/scale},root);
    hud.position.set(point.x,point.y);
  }
  if(!geometry.wall){
    contact.clear().ellipse(size*.035,1,size*.40,size*.066).fill({color:0x171420,alpha:.14})
      .ellipse(size*.017,0,size*.32,size*.036).fill({color:0x17131a,alpha:.20})
      .ellipse(0,-1,size*.21,size*.02).fill({color:0x100f17,alpha:.28});
  }
}
export function layoutHideoutScene(engine){
  if(engine.hideoutScene)for(const prop of engine.hideoutScene.props.values())layoutProp(engine,prop);
}

export async function setHideoutScene(engine,data){
  const layout=isHideoutBattle(data)?data.residenceLayout||data.hideoutFurniture:null;
  if(engine.hideoutScene?.layout===layout)return engine.hideoutScene?.ready;
  clearHideoutScene(engine);
  if(!layout||!engine.combatLayer)return;
  const legacy=Array.isArray(layout);
  const room=legacy?{code:'main',width:1}:layout.rooms.find(r=>r.code===layout.defenseRoom);
  if(!room)return;
  const scene={layout,room,props:new Map()};
  engine.hideoutScene=scene;
  const pieces=legacy?layout:layout.pieces.filter(p=>p.room===room.code);
  scene.ready=Promise.allSettled(pieces.map(async(item,index)=>{
    if(!/^[a-z0-9-]+\.webp$/.test(item.art))return;
    const texture=await Assets.load(directory+item.art);
    if(engine.hideoutScene!==scene||engine.disposed||!texture.width)return;
    const root=new Container({label:'ResidenceProp:'+item.art});
    const contact=new Graphics(),art=new Container(),body=new Sprite(texture);
    body.anchor.set(.5,1);root.eventMode='none';
    art.addChild(body);root.addChild(contact,art);engine.combatLayer.addChild(root);
    const geometry=legacy?{x:item.x,y:item.y,width:item.width,wall:false}:projectRaidPlacement(item,room.width);
    const prop={root,body,art,contact,item,geometry};
    const maxHp=data.battleV2?.result?.hideoutTurret?.maxHp;
    if(item.code==='turret'&&maxHp>0){
      const hud=new BattleHud({name:'포탑 100%',team:TEAM.ENEMY});
      hud.fontSizeOverride=26;
      hud.setCompact(true);hud.pivot.set(110,70);engine.uiLayer.addChild(hud);
      prop.health={hp:maxHp,maxHp,hud};scene.turret=prop;
    }
    scene.props.set(item.id||String(index),prop);layoutProp(engine,prop);
    if(item.code==='turret'){
      await attachHideoutTurret(prop,()=>engine.hideoutScene===scene&&!root.destroyed&&!engine.disposed);
      if(engine.hideoutScene===scene)layoutProp(engine,prop);
    }
    if(item.trophyCodes)await Promise.allSettled(item.trophyCodes.map(async(code,slot)=>{
      const url=layout.trophyArt?.[code];if(!url)return;
      const tex=await Assets.load(url);if(root.destroyed||!tex.width)return;
      const badge=new Sprite(tex);badge.anchor.set(.5,1);
      const w=texture.width,h=texture.height;badge.scale.set(Math.min(w*.27/tex.width,h*.24/tex.height));
      badge.position.set(w*(-.215+(slot%2)*.43),-h*(.65-Math.floor(slot/2)*.306));art.addChild(badge);
    }));
  }));
  await scene.ready;
  if(engine.hideoutScene===scene)engine.sortCombatDepth();
}

export function hideoutTurretStatus(scene){
  const p=scene?.turret;
  if(!p)return null;
  const {hp,maxHp,hud}=p.health,foot=p.root.getGlobalPosition(),axis=p.turret?.head.getGlobalPosition();
  return {hp,maxHp,hud:hud.nameLabel.text,headVisible:p.turret?.head.visible,heading:p.turret?.heading,
    roll:p.turret?.head.rotation,pose:p.turret?.pose,foot:{x:foot.x,y:foot.y},axis:axis&&{x:axis.x,y:axis.y}};
}

export function playHideoutTurretHit(engine,event){
  const prop=engine.hideoutScene?.turret;
  if(!prop?.health||prop.health.hp===0)return;
  const {health}=prop,actor=engine.combatantById(event.actorId);
  function applyHit(){
    const hp=Math.max(0,Math.min(health.maxHp,event.targetHpAfter));
    health.hp=hp;
    health.hud.setHp(100*hp/health.maxHp);
    health.hud.setName(hp?'포탑 '+Math.max(1,Math.round(100*hp/health.maxHp))+'%':'포탑 파괴');
    if(!hp){
      if(prop.turret){engine.settlePendingTails([prop.turret]);prop.turret.head.visible=false;}
      prop.art.tint=0x756e70;
    }
  }
  if(!actor?.root){applyHit();return;}
  engine.settlePendingTails([actor]);
  const start=engine.effectLayer.toLocal({x:0,y:-actor.fullBodyHeight*.48},actor.root);
  const at=engine.effectLayer.toLocal({x:0,y:-prop.art.height*.5},prop.root);
  const dx=at.x-start.x,dy=at.y-start.y,len=Math.max(1,Math.hypot(dx,dy));
  const shot=new Graphics().moveTo(-dx/len*20,-dy/len*20).lineTo(0,0).stroke({color:0x9ae6fc,width:4})
    .circle(0,0,3).fill(0xf0fdff);
  const impact=new Graphics().circle(0,0,event.destroyed?23:14).stroke({color:0xffca87,width:3});
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    impact.moveTo(Math.cos(a)*9,Math.sin(a)*9).lineTo(Math.cos(a)*26,Math.sin(a)*26).stroke({color:0xffe0aa,width:2});
  }
  shot.position.copyFrom(start);impact.position.copyFrom(at);impact.visible=false;
  engine.effectLayer.addChild(shot,impact);
  const travel=engine.reducedMotion?0:.18;
  return engine.timeline(tl=>{
    tl.call(()=>actor.setState(CHARACTER_STATE.ATTACK));
    tl.to(shot,{x:at.x,y:at.y,duration:travel,ease:'power1.in'});
    tl.call(()=>{
      applyHit();shot.visible=false;impact.visible=true;
      if(health.hp)prop.art.tint=0xffce9e;
      const point=engine.uiLayer.toLocal(at,engine.effectLayer);
      engine.showAccountBattleUnitDamage({root:prop.root,fullBodyHeight:prop.art.height},
        {damage:event.damage,compactArea:true,impactPoint:{x:point.x,y:point.y}});
      if(!health.hp)engine.queueBanner('포탑 파괴',0xffb36b,'은신처 방어시설');
    });
    tl.to(impact,{alpha:0,duration:engine.reducedMotion ? .07 : .24});
  },()=>{
    shot.destroy();impact.destroy();
    if(!prop.art.destroyed&&health.hp)prop.art.tint=0xffffff;
    if(!actor.root.destroyed&&actor.hp>0)actor.setState(CHARACTER_STATE.IDLE);
  },engine.actionPlaybackSpeed(),{owners:[actor]});
}

export function playHideoutDefense(engine,event){
  const scene=engine.hideoutScene;
  if(!scene)return;
  const prop=[...scene.props.values()].find(p=>p.item.code===event.facility);
  if(prop?.health?.hp===0)return;
  const color=event.facility==='autocannon'?0x66eee3:0xffb34f;
  engine.queueBanner(event.label,color,'은신처 방어시설');
  const targets=[];
  for(const hit of event.hits||[]){
    const actor=engine.combatantById(hit.targetId);if(!actor)continue;
    engine.syncTargetHp(actor,engine.eventHpPercent(actor,hit.targetHpAfter,hit.targetMaxHp));
    engine.syncTargetShield(actor,hit.targetShieldAfter);
    targets.push({actor,hit});
  }
  if(!targets.length)return;
  const impact=({actor})=>engine.effectLayer.toLocal({x:0,y:-actor.fullBodyHeight*.42},actor.root);
  let fired=0;
  function shoot({hit,actor},start,{x,y},axis){
    if(engine.hideoutScene!==scene||engine.effectLayer.destroyed||actor.root.destroyed)return;
    const flash=new Graphics();engine.effectLayer.addChild(flash);
    if(start){
      flash.circle(start.x,start.y,prop?.turret?5:12).fill({color,alpha:.88});
      // When the sprites overlap, show contact at the target without drawing
      // a bolt backwards through the housing.
      const forward=!axis||(start.x-axis.x)*(x-start.x)+(start.y-axis.y)*(y-start.y)>0;
      if(forward)flash.moveTo(start.x,start.y).lineTo(x,y).stroke({color,width:7,alpha:.32})
        .moveTo(start.x,start.y).lineTo(x,y).stroke({color:0xfff7df,width:2.5,alpha:.95});
    }
    flash.circle(x,y,15).stroke({color,width:3,alpha:.9});
    engine.showAccountBattleUnitDamage(actor,{damage:hit.damage+hit.absorbed,impactPoint:{x,y}});
    engine.lastHideoutShot={facility:event.facility,hits:targets.length,fired:++fired,targetId:hit.targetId,
      ...(prop?.turret?{heading:prop.turret.heading,flipped:prop.item.flipped,foot:{x:prop.root.x,y:prop.root.y},
        muzzle:{x:start.x,y:start.y},axis:{x:axis.x,y:axis.y},impact:{x,y}}:{})};
    gsap.to(flash,{alpha:0,duration:prop?.turret ? .16 : .42,onComplete:()=>{if(!flash.destroyed)flash.destroy();}});
  }
  if(prop?.turret)return playTurretVolley(engine,prop,targets,impact,shoot);
  const start=prop&&event.facility!=='turret'?{x:prop.root.x+(prop.item.flipped?1:-1)*prop.art.width*.27,y:prop.root.y-prop.art.height*.65}:null;
  for(const target of targets)shoot(target,start,impact(target));
}
