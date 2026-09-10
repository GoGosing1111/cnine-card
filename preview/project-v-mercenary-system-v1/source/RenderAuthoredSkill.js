import {sampleRehearsal} from '../skill-rehearsal.mjs';
import {sampleSequence} from './MercenarySpriteSequence.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,p)=>a+(b-a)*p;
const smooth=v=>{const p=clamp(v);return p*p*(3-2*p)};

// All frame selection, particles and contact emphasis sample the one GSAP time.
// The primary material sequence is unique to this skill; support textures are
// the existing approved battle-suit dust, smoke, cinder and flash, unchanged.
export function renderAuthored(fx,time){
  if(fx.destroyed)return;
  const {engine,actors,plan,skill,sequence,auxiliary:aux}=fx;
  fx.restore();fx.sprites.forEach(s=>s.visible=false);fx.lines.clear();
  let frontUsed=0,groundUsed=0;fx.activeFrames=[];fx.poolOverflow=0;
  const color=parseInt(skill.visual.color.slice(1),16),mode=skill.visual.motion,target=plan.targets[0];
  const sample=sampleRehearsal(plan,time),states=new Map(sample.actors.map(a=>[a.id,a]));
  for(const [id,a]of actors){const s=states.get(id);a.root.visible=!!s;a.root.alpha=s?.hp>0?1:.22;
    if(s){a.hp=s.hp/s.maxHp*100;a.layoutHudBars();a.setShield(s.shield,Math.max(30,s.shield));}}
  const cancelled=plan.events.find(e=>e.kind==='CANCEL'&&time>=e.at);
  if(time<=0||time>=plan.duration||cancelled){fx.onUpdate(time,fx,sample);return;}
  const point=(id,foot=false)=>fx.point(id,foot);
  const draw=(texture,p,width,{height=width,alpha=1,angle=0,tint=0xffffff,ground=false,add=false,anchorY=.5}={})=>{
    if(alpha<=0||!texture)return;
    const pool=ground?fx.groundSprites:fx.foreground,index=ground?groundUsed++:frontUsed++;
    if(index>=pool.length){fx.poolOverflow++;return;}
    const s=pool[index],scale=engine.mobile?.88:1;s.texture=texture;s.visible=true;s.anchor.set(.5,anchorY);
    s.position.set(p.x,p.y);s.width=width*scale;s.height=height*scale;s.alpha=clamp(alpha);s.rotation=angle;s.tint=tint;s.blendMode=add?'add':'normal';
  };
  const material=(p,age,{size=340,lead=.24,life=1.05,angle=0,alpha=1,frameKeys=null}={})=>{
    if(alpha<=0)return;
    const f=sampleSequence(age,lead,life,frameKeys);if(!f)return;
    // Preserve the impact origin. Fit the whole authored silhouette, including
    // rotated arcs, inside a narrow mobile arena instead of clipping its edge.
    if(engine.mobile&&engine.scene?.width&&sequence.extent){
      const radius=sequence.extent.x*Math.abs(Math.cos(angle))+sequence.extent.y*Math.abs(Math.sin(angle));
      const room=Math.min(p.x-18,engine.scene.width-p.x-18);
      size=Math.min(size,Math.max(24,room/Math.max(radius*.88,.01)));
    }
    fx.activeFrames.push({index:f.index,next:f.next,blend:Number(f.blend.toFixed(3))});
    // Current-frame density stays beneath the incoming frame. Fading both
    // straight-alpha frames would create a transparency pulse at every step.
    draw(sequence.frames[f.index],p,size,{alpha:f.alpha*alpha,angle,anchorY:.55});
    draw(sequence.frames[f.next],p,size,{alpha:f.alpha*alpha*f.blend,angle,anchorY:.55});
  };
  const light=(p,age,size=270,life=.32)=>{if(age<0||age>=life)return;draw(aux.flash,p,size,{height:size*.33,alpha:Math.exp(-age*7)*.3,tint:color,ground:true,add:true});};
  const flash=(p,age,size=110)=>{if(age<0||age>.09)return;draw(aux.flash,p,size,{height:size*.72,alpha:(1-age/.09)*.8,tint:color,add:true});};
  const debris=(p,age,{count=18,strength=1,soft=false}={})=>{
    if(age<0||age>1.1)return;const n=engine.mobile?Math.ceil(count*.65):count;
    for(let i=0;i<n;i++){const a=age-(i%3)*.01,life=.35+(i%6)*.105;if(a<0||a>life)continue;
      const theta=i*2.3999632+.27,speed=(100+(i%7)*28)*strength;
      draw(soft?aux.smoke:aux.cinder,{x:p.x+Math.cos(theta)*speed*a,y:p.y-(90+Math.abs(Math.sin(theta))*speed)*a+210*a*a},soft?14+a*22:3+i%4,
        {height:soft?20+a*19:5+i%4,alpha:(1-a/life)*(soft?.35:.9),angle:theta+a*3,tint:color,add:!soft});}
  };
  const dust=(p,age,size=280,strength=1)=>{if(age<0||age>.85)return;const q=smooth(age/.85);draw(aux.dust,p,size*(.3+q*.7),{height:size*(.07+q*.17),alpha:(1-q)*.43*strength,ground:true});};
  const muzzle=(id='M')=>{const a=actors.get(id),p=point(id);return{x:p.x+(a?.fullBodyHeight||260)*(a?.root.scale.y||.5)*.23,y:p.y-3};};
  const trace=(from,to,at,{travel=.18,width=3,smoke=false}={})=>{
    const age=time-at;if(age< -travel||age>.04)return;const q=clamp((age+travel)/travel),tail=clamp(q-.25);
    for(const [w,c,a]of [[width*3,color,.2],[width,0xfff9ee,.95]])fx.lines.moveTo(mix(from.x,to.x,tail),mix(from.y,to.y,tail)).lineTo(mix(from.x,to.x,q),mix(from.y,to.y,q)).stroke({width:w,color:c,alpha:a});
    flash(from,age+travel,80);
    if(smoke)for(let i=0;i<5;i++){const born=i/5,a=age+travel-born*travel;if(a<0||a>.3)continue;draw(aux.smoke,{x:mix(from.x,to.x,born),y:mix(from.y,to.y,born)-a*18},13+a*34,{alpha:(1-a/.3)*.32});}
  };
  const aim=(p,end,r=46)=>{if(time<.1||time>=end)return;const q=smooth(time/end),radius=r+35*(1-q),alpha=Math.min(1,time*3)*.72;
    for(let i=0;i<4;i++){const a=i*Math.PI/2;fx.lines.moveTo(p.x+Math.cos(a)*radius,p.y+Math.sin(a)*radius).lineTo(p.x+Math.cos(a)*(radius+13),p.y+Math.sin(a)*(radius+13)).stroke({color,width:2,alpha});}
    if(q>.05)fx.lines.arc(p.x,p.y,radius,.2,Math.PI*2*q).stroke({color,width:1.5,alpha:alpha*.8});
  };
  const approach=(at,id,{reach=67,returnAt=at+.18,returnDuration=.44}={})=>{
    if(engine.reducedMotion)return;const a=actors.get('M'),p=point(id,true),o=fx.origins.get('M');
    const q=smooth((time-(at-.32))/.25)*(1-smooth((time-returnAt)/returnDuration));
    a.root.x=mix(o.x,p.x-reach,q);a.root.y=mix(o.y,p.y+9,q);a.root.rotation=-.055*Math.sin(q*Math.PI);
    if(q>.04&&q<.92)dust(point('M',true),.2,120,.3);
  };
  const impact=(id,at,opts={})=>{const age=time-at,p=point(id),foot=point(id,true);
    material(p,age,opts);flash(p,age,opts.flash||100);light(foot,age,opts.size||300);
    debris(p,age,{count:opts.particles??16,strength:opts.force||1});if(opts.grounded)dust(foot,age,opts.size||280);
  };
  const hits=plan.events.filter(e=>e.kind==='HIT'&&e.targets[0].startsWith('E')&&!e.sourceId);
  switch(mode){
    case 'EVENT_HORIZON': {
      // One continuous, newly painted sequence: contact 05 at 1.05s, then
      // contact 09 at 2.25s. A cleansed/dead mark has no terminal explosion.
      const keys=[[-.75,0],[0,4],[.9,7],[1.2,8],[1.38,9],[1.78,11],[2.3,13],[2.85,15]];
      const last=hits.filter(e=>e.stage==='DETONATE');
      if(time<1.6)approach(1.05,target,{reach:62,returnAt:1.2,returnDuration:.3});
      else if(last.length)approach(2.25,last[0].targets[0],{reach:62,returnAt:2.5,returnDuration:.45});
      for(const id of plan.targets){
        const terminal=last.some(e=>e.targets.includes(id));
        const loss=plan.events.find(e=>e.targets.includes(id)&&e.kind==='CLEANSE')?.at??1.05;
        const alpha=terminal?1:1-smooth((time-loss)/.18);
        material(point(id),time-1.05,{size:370,lead:.75,life:2.85,frameKeys:keys,alpha});
        light(point(id,true),time-.45,230,.65);
      }
      for(const e of hits){const id=e.targets[0],age=time-e.at,final=e.stage==='DETONATE';
        flash(point(id),age,final?175:70);light(point(id,true),age,final?390:200,final?.45:.22);
        debris(point(id),age,{count:final?25:8,strength:final?1.2:.45});
        if(final)dust(point(id,true),age,350);
      }
      break;
    }
    case 'INTERRUPT': {
      approach(.85,target,{reach:65,returnAt:1.04});const p=point(target),age=time-.85;
      material(p,age,{size:390,lead:.26,life:1.3});flash(p,age,165);light(point(target,true),age,390);
      debris(p,age,{count:28,strength:1.3});dust(point(target,true),age,340);
      if(time>.3&&time<.85)fx.lines.arc(p.x,p.y,25,0,Math.PI*2*(.85-time)/.55).stroke({color:0xb881f8,width:2,alpha:.7});break;
    }
    case 'INTERCEPT': {
      approach(.62,target,{reach:35,returnAt:1.37});const p=point(target),contact={x:p.x+24,y:p.y};
      material(contact,time-1.05,{size:345,lead:.65,life:plan.scenario==='counter'?.42:1.25,alpha:plan.scenario==='counter'?.45:1});
      if(plan.scenario!=='counter'){trace(point('E1'),contact,1.05);debris(contact,time-1.05,{count:26,strength:.8});light(point(target,true),time-1.05,350);}break;
    }
    case 'PRECISION':
      aim(point(target),1.6,37);hits.forEach(e=>{trace(muzzle(),point(e.targets[0]),e.at,{width:5,travel:.11,smoke:true});impact(e.targets[0],e.at,{size:360,lead:.08,life:1.2,particles:23});});break;
    case 'FRACTURE':
      approach(.95,target,{returnAt:1.48});hits.forEach((e,i)=>impact(e.targets[0],e.at,{size:i?325:390,lead:.27,life:i?.85:.68,angle:i?-.8:0,grounded:true,particles:22}));break;
    case 'CONVERGE':
      hits.forEach((e,i)=>{aim(point(e.targets[0]),e.at,27-i*5);trace(muzzle(),point(e.targets[0]),e.at,{travel:.13,width:i===2?3:2});impact(e.targets[0],e.at,{size:i===2?295:215,lead:.07,life:.72,particles:i===2?18:9});});break;
    case 'RELAY':
      plan.targets.forEach((id,i)=>{material(point(id),time-(.7+i*.035),{size:id==='M'?190:170,lead:.35,life:1.05});light(point(id,true),time-(.7+i*.035),190);});
      plan.events.filter(e=>e.kind==='HIT'&&e.sourceId).forEach(e=>{trace(muzzle(e.sourceId),point(e.targets[0]),e.at);flash(point(e.targets[0]),time-e.at,90);});break;
    case 'INFILTRATE':
      approach(.9,target,{reach:42,returnAt:1.03,returnDuration:.22});hits.forEach((e,i)=>impact(e.targets[0],e.at,{size:i?330:275,lead:i?.12:.3,life:i?.9:.6,angle:i?.25:0,particles:13}));break;
    case 'VEIL':
      plan.targets.forEach(id=>{material(point(id),time-1.05,{size:300,lead:.5,life:plan.scenario==='counter'?.55:1.3,alpha:.5});light(point(id,true),time-1.05,320,.7);});break;
    case 'STITCH':
      material(point(target),time-.8,{size:230,lead:.3,life:.65});material(point(target),time-1.65,{size:plan.scenario==='counter'?210:310,lead:.35,life:1.1});light(point(target,true),time-1.65,300,.75);debris(point(target),time-1.65,{count:16,strength:.4,soft:true});break;
    case 'RIPOSTE':
      if(plan.scenario==='counter'){flash(point('M'),time-1,65);debris(point('M'),time-1,{count:9,strength:.3});}
      else{material(point('M'),time-1,{size:225,lead:.4,life:.48,angle:-.55});approach(1.4,target,{returnAt:1.6});impact(target,1.4,{size:395,lead:.22,life:1.03,particles:22,grounded:true});}break;
    case 'STILLNESS':
      aim(point(target),2.05,50);if(time<1.92){light(point('M',true),time-.2,220,1.65);draw(aux.flash,muzzle(),18+time*13,{alpha:.18,add:true,tint:color});}
      hits.forEach(e=>{trace(muzzle(),point(e.targets[0]),e.at,{travel:.09,width:6,smoke:true});impact(e.targets[0],e.at,{size:plan.scenario==='counter'?290:415,lead:.04,life:1.2,particles:22});});break;
    case 'BARRAGE':
      hits.forEach((e,i)=>{trace(muzzle(),point(e.targets[0]),e.at,{travel:.11,width:2.2});impact(e.targets[0],e.at,{size:225+(i%2)*30,lead:.045,life:.73,particles:8,grounded:true});});break;
    case 'BLOOM':
      plan.targets.forEach(id=>{const p=point(id,true);material({x:p.x,y:p.y-14},time-1,{size:245,lead:.55,life:plan.scenario==='counter'?.45:1.6,alpha:.78});light(p,time-1,270,.9);});break;
    case 'FINISH':
      hits.forEach(e=>{trace(muzzle(),point(e.targets[0]),e.at,{travel:.14,width:4,smoke:true});impact(e.targets[0],e.at,{size:e.amount>=50?395:280,lead:.09,life:1.5,particles:25});});break;
    case 'RESTRAIN': {
      const p=point(target);aim(p,.93,28);trace(muzzle(),p,.95,{travel:.13,width:2.5});flash(p,time-.95,95);debris(p,time-.95,{count:11,strength:.55});
      if(plan.scenario!=='counter'){material(p,time-1.45,{size:310,lead:.5,life:1.1});light(point(target,true),time-1.45,300,.5);}break;
    }
    case 'DOUBLE_BEAT':
      hits.forEach((e,i)=>{trace(muzzle(),point(e.targets[0]),e.at,{travel:i?.14:.1,width:i?4:2.3,smoke:i===1});impact(e.targets[0],e.at,{size:i?340:225,lead:.07,life:i?1.07:.62,angle:i?.2:0,particles:i?21:11});});break;
  }
  let shake=0;
  for(const e of plan.events){const age=time-e.at;if(e.kind!=='HIT'||age<0||age>.22)continue;
    for(const id of e.targets){const a=actors.get(id);if(!a)continue;if(age<.055)a.fullBodySprite.tint=color;
      if(!engine.reducedMotion){a.root.x+=Math.sin(age/.22*Math.PI)*(id.startsWith('E')?7:-4);a.root.rotation+=Math.sin(age/.22*Math.PI)*.026;}}
    shake=Math.max(shake,Math.exp(-age*19)*(['FRACTURE','INTERRUPT','STILLNESS'].includes(mode)?3.5:1.6));
  }
  if(!engine.reducedMotion&&fx.playing&&shake&&engine.stage&&engine.camera){fx.lastShake={x:Math.sin(time*89)*shake,y:Math.cos(time*107)*shake*.55};engine.stage.x+=fx.lastShake.x;engine.stage.y+=fx.lastShake.y;}
  fx.onUpdate(time,fx,sample);
}
