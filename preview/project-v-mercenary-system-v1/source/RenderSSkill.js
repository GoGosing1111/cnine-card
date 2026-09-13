// The primary material is always the skill's own authored sequence. Paths and
// particles are secondary layers sampled from the existing registered V3 clock.
import {drawProjectileTrail,projectilePixelScale,projectileTrailGeometry} from '../../project-v-v3/source/battle/ProjectileTrail.mjs';
export function renderSSkill({fx,time,mode,plan,target,hits,point,material,impact,trace,muzzle,aim,approach,light,debris,dust,flash,phase,atPhase,color}) {
  const arc=(id,at,index)=>{
    const from=muzzle(),to=point(id),age=time-at,travel=.42;
    if(age< -travel||age>=0)return;
    const q=Math.max(0,Math.min(1,(age+travel)/travel));
    drawProjectileTrail(fx.lines,projectileTrailGeometry(from,to,q,{arrow:true,arcHeight:45+index*17,scale:projectilePixelScale(fx.lines),width:3}),color);
    flash(from,age+travel,45);
  };
  switch(mode) {
    case 'HOLY_CLEAVE':
      approach(1,target,{reach:54,returnAt:1.2});
      hits.filter(e=>e.targets[0].startsWith('E')).forEach(e=>impact(e.targets[0],e.at,{size:385,lead:.38,life:1.45,grounded:true,particles:24,force:.9}));break;
    case 'SHIELD_LANCE':
      aim(point(target),1.35,31);
      hits.forEach(e=>{trace(muzzle(),point(e.targets[0]),e.at,{travel:.1,width:3,smoke:true});impact(e.targets[0],e.at,{size:510,lead:.34,life:1.35,particles:20});});break;
    case 'PETAL_VOLLEY':
      hits.forEach((e,i)=>{const id=e.targets[0],n=phase(e,i);aim(point(id),e.at,22);trace(muzzle(),point(id),e.at,{travel:.14,width:2.8});impact(id,e.at,{size:275,lead:.16,life:.95,particles:12,force:.65});light(point(id,true),time-e.at,190+n*20);});break;
    case 'MOON_DRAW':
      approach(1.1,target,{reach:44,returnAt:1.29,returnDuration:.52});
      hits.forEach(e=>impact(e.targets[0],e.at,{size:390,lead:.4,life:1.4,grounded:true,particles:25,force:1.1}));break;
    case 'IRON_FRONT':
      plan.targets.forEach(id=>{const foot=point(id,true),p={x:foot.x,y:foot.y-5};material(p,time-1,{size:225,lead:.48,life:1.7,alpha:plan.scenario==='counter'&&time>1.45?Math.max(0,1-(time-1.45)/.15):.85});light(point(id,true),time-1,280,.6);});break;
    case 'THORN_BLOOM': {
      const terminal=plan.events.some(e=>e.kind==='HIT'&&e.at===1.8&&e.targets.includes(target));
      const alive=terminal||fx.authoritative&&atPhase(0);
      const keys=[[-.4,0],[-.04,3],[0,4],[.7,7],[.95,8],[1.1,10],[1.5,12],[1.9,14],[2.1,15]];
      const visualTime=fx.authoritative&&atPhase(0)?Math.min(time,1.5):time;
      const stageAlpha=fx.authoritative&&atPhase(0)?Math.max(0,Math.min(1,(1.95-time)/.35)):1;
      material(point(target),visualTime-.85,{size:340,lead:.4,life:2.1,frameKeys:keys,alpha:stageAlpha*(alive?1:Math.max(0,1-(time-1.4)/.15))});
      for(const e of hits.filter(e=>e.targets[0].startsWith('E'))){const n=e.phaseIndex||0;if(!n)trace(muzzle(),point(target),e.at,{travel:.17,width:2});flash(point(target),time-e.at,n?120:75);debris(point(target),time-e.at,{count:n?20:8,strength:.6});light(point(target,true),time-e.at,280);}
      break;}
    case 'ABYSS_ECHO':
      aim(point(target),1.1,38);
      hits.forEach((e,i)=>{const n=phase(e,i);trace(muzzle(),point(e.targets[0]),e.at,{travel:.12,width:n?4:2.5,smoke:true});impact(e.targets[0],e.at,{size:n?360:290,lead:.26,life:1.22,particles:n?20:12,force:.7});});break;
    case 'PLATINUM_BARRAGE':
      hits.forEach((e,i)=>{const n=phase(e,i);trace(muzzle(),point(e.targets[0]),e.at,{travel:.095,width:2});impact(e.targets[0],e.at,{size:n===2?310:240,lead:.12,life:.86,grounded:true,particles:n===2?20:10,force:.65});});break;
    case 'CORAL_ARCS':
      hits.forEach((e,i)=>{const n=phase(e,i),id=e.targets[0];arc(id,e.at,n);impact(id,e.at,{size:plan.targets.length===1?320:260,lead:.22,life:1.1,particles:14,force:.6});dust(point(id,true),time-e.at,190,.3);});break;
  }
}
