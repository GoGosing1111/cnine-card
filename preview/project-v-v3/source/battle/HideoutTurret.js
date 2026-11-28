import {Assets,Sprite} from 'pixi.js';

const atlas='/assets/ui/personal-hideout-20261116/turret-turn-v3.json';
const rest=-3*Math.PI/4;
const arc=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

function face(rig,angle){
  const {head,sheet,aim}=rig;
  const index=(Math.round(angle*aim.count/(2*Math.PI))%aim.count+aim.count)%aim.count;
  const point=aim.muzzles[index];
  head.texture=sheet.textures['yaw-'+index];
  rig.heading=angle;
  rig.pose=index;
  rig.muzzle={x:point[0]-aim.axis[0],y:point[1]-aim.axis[1]};
}

export async function attachHideoutTurret(prop,stillActive){
  const sheet=await Assets.load(atlas);
  if(!stillActive())return;
  const aim=sheet.data.aim,base=new Sprite(sheet.textures.base),head=new Sprite(sheet.textures['yaw-0']);
  base.anchor.set(.5,1);
  head.anchor.set(aim.axis[0]/head.texture.width,aim.axis[1]/head.texture.height);
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
  let previous=rig.heading;
  const dwell=engine.reducedMotion ? .05 : .115;
  const turns=targets.map(target=>{
    const next=bearing(target);
    const duration=engine.reducedMotion?0:Math.max(.11,Math.min(.64,Math.abs(arc(previous,next))/4.2));
    previous=next;
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
  },()=>{},engine.reducedMotion?1:engine.actionPlaybackSpeed(),{owners:[rig]});
}
