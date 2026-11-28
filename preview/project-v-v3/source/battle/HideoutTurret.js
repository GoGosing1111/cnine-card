import {Assets,Sprite} from 'pixi.js';

const atlas='/assets/ui/personal-hideout-20261116/turret-turn-v2.json';
const step=Math.PI/8,rest=-6*step;
const sectors=[
  ['east',1],['east-southeast',1],['southeast',1],['south-southeast',1],
  ['south',1],['south-southeast',-1],['southeast',-1],['east-southeast',-1],
  ['west',1],['east-northeast',-1],['northeast',-1],['north-northeast',-1],
  ['north',1],['north-northeast',1],['northeast',1],['east-northeast',1]
];
const arc=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

function face(rig,angle){
  const {head,sheet,aim}=rig;
  const sector=(Math.round(angle/step)%sectors.length+sectors.length)%sectors.length;
  const [name,mirror]=sectors[sector],point=aim.muzzles[name];
  head.texture=sheet.textures[name];
  head.scale.x=mirror;
  const dx=point[0]-aim.axis[0],dy=point[1]-aim.axis[1];
  const screenAngle=Math.atan2(aim.projection*Math.sin(angle),Math.cos(angle));
  // The turntable supplies the perspective. Limit the fine adjustment so a
  // frontal or rear view never tips the housing sideways on its socket.
  const trim=arc(Math.atan2(dy,mirror*dx),screenAngle);
  head.rotation=angle===rest?0:Math.max(-.32,Math.min(.32,trim));
  rig.heading=angle;
  rig.muzzle={x:dx,y:dy};
}

export async function attachHideoutTurret(prop,stillActive){
  const sheet=await Assets.load(atlas);
  if(!stillActive())return;
  const aim=sheet.data.aim,base=new Sprite(sheet.textures.base),head=new Sprite(sheet.textures.northeast);
  base.anchor.set(.5,1);
  head.anchor.set(aim.axis[0]/base.texture.width,aim.axis[1]/base.texture.height);
  head.position.set(0,aim.axis[1]-base.texture.height);
  prop.body.visible=false;
  prop.art.addChild(base,head);
  prop.turret={sheet,aim,base,head,heading:rest,muzzle:null};
  face(prop.turret,rest);
}

function addTurn(timeline,rig,destination,duration){
  const motion={fraction:0};
  let start=rig.heading;
  timeline.to(motion,{fraction:1,duration,ease:'sine.inOut',
    onStart:()=>{start=rig.heading;},
    onUpdate:()=>face(rig,start+arc(start,destination())*motion.fraction)});
}

export function playTurretVolley(engine,prop,targets,impact,shoot){
  const rig=prop.turret;
  engine.settlePendingTails([rig]);
  function bearing(target){
    const p=prop.art.toLocal(impact(target),engine.effectLayer);
    return Math.atan2((p.y-rig.head.y)/rig.aim.projection,p.x-rig.head.x);
  }
  let previous=rig.heading,releaseAt=0;
  const dwell=engine.reducedMotion ? .05 : .115;
  const turns=targets.map(target=>{
    const next=bearing(target);
    const duration=engine.reducedMotion?0:Math.max(.07,Math.min(.38,Math.abs(arc(previous,next))/5.4));
    previous=next;releaseAt+=duration+dwell;
    return {target,duration};
  });
  return engine.timeline(timeline=>{
    for(const {target,duration} of turns){
      const aim=()=>bearing(target);
      if(duration)addTurn(timeline,rig,aim,duration);
      timeline.call(()=>{
        face(rig,aim());
        const start=engine.effectLayer.toLocal(rig.muzzle,rig.head);
        const axis=engine.effectLayer.toLocal({x:0,y:0},rig.head);
        shoot(target,start,impact(target),axis);
      });
      timeline.to({},{duration:dwell});
    }
    timeline.to({},{duration:.28});
    if(!engine.reducedMotion)addTurn(timeline,rig,()=>rest,.32);
  },()=>{if(!rig.head.destroyed)face(rig,rest);},engine.reducedMotion?1:engine.actionPlaybackSpeed(),{releaseAt,owners:[rig]});
}
