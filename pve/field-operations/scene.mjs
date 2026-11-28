import {imageFor,cutArm,roadTexture,smoothTexture} from './art.mjs';
import {laneNames} from '../../shared/field-operation-battle-plan.mjs';
const yardBg='/assets/ui/scrapyard/scrapyard-arena-v1676.png';
const roadBg='/assets/ui/escort/escort-fortress-route-bg-v1.webp';
const dronesUrl='/assets/ui/project-v/mercenaries/astra-20261115/drone.webp';
const GOLD=0xf2b56f,TEAL=0x80e3d4,RED=0xff937e;
const mix=(a,b,t)=>a+(b-a)*t, ease=t=>1-(1-t)**3;
export function waitMotion(ms,signal,draw=()=>{}){
 return new Promise((done,fail)=>{
  if(signal.aborted)return fail(signal.reason);
  let elapsed=0,last=performance.now(),frame;
  function cancel(){cancelAnimationFrame(frame);fail(signal.reason)}
  function next(now){
   elapsed+=Math.min(100,Math.max(0,now-last));last=now;
   const t=Math.min(1,elapsed/ms);
   try{draw(t)}catch(error){signal.removeEventListener('abort',cancel);fail(error);return}
   if(t>=1){signal.removeEventListener('abort',cancel);done()}else frame=requestAnimationFrame(next);
  }
  signal.addEventListener('abort',cancel,{once:true});next(last);
 });
}
async function loadEngine(){
 if(window.ProjectVPixiBattle)return window.ProjectVPixiBattle;
 await new Promise((ok,no)=>{const script=document.createElement('script');script.src='/preview/project-v-v3/project-v-pixi-battle.bundle.js';script.onload=ok;script.onerror=()=>no(Error('V3 전투 엔진 로드 실패'));document.head.append(script)});
 return window.ProjectVPixiBattle;
}
export async function mountScene(fixture,mode,host,labelHost,signal){
 const api=await loadEngine(),rt=api.fxRuntime,{Assets,Container,Sprite,Texture,Graphics,Rectangle}=rt;
 const {payload,bossId}=fixture,yard=mode==='yard',row=payload.continuousEncounter?.instances.find(a=>a.id===bossId);
 window.cnineCardCatalog=()=>payload.cards;
 const e=await api.mountForBattle(payload,host);
 await e.setVisible(true);await e.deployCards({instant:true,force:true});
 const [backdrop,extra,plates]=await Promise.all([Assets.load(yard?yardBg:roadBg),yard?imageFor(row.battleSprite):Assets.load(dronesUrl),yard?null:imageFor(payload.objective.image)]);
 signal.throwIfAborted();
 const allies=e.allies.slice(0,5),bg=new Sprite(backdrop),floor=new Graphics(),fx=new Graphics(),props=new Container(),above=new Container(),tags=new Map();
 bg.anchor.set(.5);bg.zIndex=-10;floor.zIndex=-6;props.zIndex=-4;fx.zIndex=4;above.zIndex=5;
 e.stage.addChild(bg,floor,props,fx,above);e.combatLayer.zIndex=0;e.effectLayer.zIndex=2;e.uiLayer.zIndex=3;
 e.backgroundLayer.visible=false;e.isoFloorLayer.renderable=false;
 for(const child of e.uiLayer.children)child.visible=false;
 if(e.objectiveHud)e.objectiveHud.renderable=false;
 const hideHud=()=>{for(const a of e.characters){a.hud.visible=false;if(a.stateHalo)a.stateHalo.visible=false}for(const c of e.cards)c.visible=false};
 hideHud();
 let pieces,rig,armItem,vehicle=e.objectiveSprite,obstruction,droneFrames=[],drones=[];
 let vals={slots:[0,0,1,2,2],arm:'none',stage:0},motion=null,showRoad=false,showDrones=false,showShield=false,arrived=false;
 let box,whole,cameraMove=0,compact=false,disposed=false,needsLayout=false,lastTime=performance.now(),time=0;
 const laneX=[.28,.48,.69],yardSpots=[[.164,.69],[.268,.64],[.321,.765],[.206,.845],[.392,.865]];
 if(yard)pieces=cutArm(extra,rt);
 else{
  if(!vehicle)throw Error('V3 수송차 불러오기 실패');
  smoothTexture(extra);
  for(let i=0;i<4;i++)droneFrames.push(new Texture({source:extra.source,frame:new Rectangle(2+i*360,2,356,221)}));
  drones=[0,1].map((_,i)=>{const a=new Sprite(droneFrames[1+i]);a.anchor.set(.5);props.addChild(a);return a});
  obstruction=new Sprite(roadTexture(plates,rt));obstruction.anchor.set(.5,.82);props.addChild(obstruction);
 }
 const point=(x,y)=>({x:box.x+box.w*x,y:box.y+box.h*y});
 const unit=()=>Math.min(box.h,box.w*.87);
 const combatHeight=a=>a.fullBodyRestPose.height*a.restScale;
 function positionActor(a,v){
   // A station is translated only. Native V3 owns root/sprite scale, perspective and camera.
   a.baseX=a.root.baseX=v.x;a.baseY=a.root.baseY=v.y;a.root.position.set(v.x,v.y);a.root.depthSortY=v.y;
 }
 function convoySpots(slots){
  return slots.map((slot,i)=>{
   const group=slots.map((v,j)=>v===slot?j:-1).filter(n=>n>=0),j=group.indexOf(i);
   const spread=group.length===1?[[0,.845]]:group.length===2?[[-.043,.73],[.058,.85]]:[[-.066,.72],[.015,.846],[.08,.767]];
   const [dx,dy]=spread[j];return [laneX[slot]+dx,dy];
  });
 }
 function placeItem(){
  if(!armItem||!rig)return;
  const pos=point(.469,.846),axis=armAxes(.21,.52);
  armItem.position.set(pos.x,pos.y);armItem.scale.set(axis.sx,axis.sy);armItem.rotation=-.43;
 }
 function layout(){
  if(disposed)return;
  const sw=e.app.screen.width,sh=e.app.screen.height,header=document.querySelector('header').getBoundingClientRect().height,dock=document.getElementById('dock').getBoundingClientRect().height;
  const bounds=(top,bottom)=>{const a=e.root.toLocal({x:0,y:top}),b=e.root.toLocal({x:sw,y:bottom});return {x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y}};
  box=bounds(header+6,Math.max(header+50,sh-dock-6));whole=bounds(0,sh);compact=sw<=580;
  bg.scale.set(Math.max(whole.w/backdrop.width,whole.h/backdrop.height)*(yard?1.014:1.036));bg.position.set(whole.x+whole.w*.5,whole.y+whole.h*.5);
  if(yard){
   yardSpots.forEach(([x,y],i)=>positionActor(allies[i],point(x,y)));
   positionActor(e.enemies[0],point(.714,.722));positionActor(e.enemies[1],point(.695,.764));
  }else{
   convoySpots(vals.slots).forEach(([x,y],i)=>positionActor(allies[i],point(x,y)));
   positionActor(e.boss,point(.803,.527));
   const v=point(arrived?.568:.504,.66);vehicle.position.set(v.x,v.y);vehicle.depthSortY=v.y-2;
  }
  hideHud();placeItem();e.sortCombatDepth();needsLayout=false;
 }
 function mark(key,label,pos,color,klass=''){
   let el=tags.get(key);
   if(!el){el=document.createElement('span');labelHost.append(el);tags.set(key,el)}
   if(el.textContent!==label)el.textContent=label;
   el.hidden=false;el.className='marker '+klass;el.style.setProperty('--tag',color);
   const q=e.stage.toGlobal(pos);el.style.left=(q.x/e.app.screen.width*100).toFixed(2)+'%';el.style.top=(q.y/e.app.screen.height*100).toFixed(2)+'%';
 }
 function line(g,pts,color,w,alpha=1){
  g.moveTo(pts[0].x,pts[0].y);for(const pt of pts.slice(1))g.lineTo(pt.x,pt.y);g.stroke({color,width:w,alpha});
 }
 function targetRing(pos,r,color){
  const width=Math.max(1,r*.07);
  fx.circle(pos.x,pos.y,r*1.12).stroke({color,width:width*.65,alpha:.5});
  for(let j=0;j<4;j++){const a=j*Math.PI/2+time*.33;fx.moveTo(pos.x+Math.cos(a+.1)*r,pos.y+Math.sin(a+.1)*r).arc(pos.x,pos.y,r,a+.1,a+1.04).stroke({color,width,alpha:.96})}
 }
 function burst(pos,t,color,n=21){
  const s=unit();for(let i=0;i<n;i++){const a=i*2.4,l=s*(.036+(i%6)*.013),x=pos.x+Math.cos(a)*l*ease(t),y=pos.y+Math.sin(a)*l*ease(t)+s*.039*t*t;
   line(fx,[{x,y},{x:x-Math.cos(a)*s*.012*(1-t),y:y-Math.sin(a)*s*.012*(1-t)}],color,Math.max(1,s*.0035),1-t)}
 }
 const anchor=a=>({x:a.root.x,y:a.root.y-combatHeight(a)*.52});
 function localUV(sprite,x,y){return e.stage.toLocal(sprite.toGlobal({x:(x-sprite.anchor.x)*pieces.w,y:(y-sprite.anchor.y)*pieces.h}))}
 function armAxes(x,y){
  const arm=rig.arm,v=localUV(arm,x,y),xx=localUV(arm,x+1/pieces.w,y),yy=localUV(arm,x,y+1/pieces.h);
  const ax=xx.x-v.x,ay=xx.y-v.y,bx=yy.x-v.x,by=yy.y-v.y;
  return {v,sx:Math.hypot(ax,ay),sy:Math.sign(ax*by-ay*bx)*Math.hypot(bx,by),rotation:Math.atan2(ay,ax)};
 }
 function attachRig(){
  const a=e.combatantById(bossId);if(!a||rig)return;
  const body=a.fullBodySprite;body.texture=pieces.body;a.fullBodyRestPose.texture=pieces.body;
  const arm=new Sprite(pieces.arm);arm.anchor.set(.349,.278);arm.zIndex=body.zIndex+1;
  const socket=new Graphics(),r=pieces.w*.061;socket.zIndex=body.zIndex-.5;
  socket.ellipse(0,0,r,.84*r).fill(0x414139).stroke({color:0xa99571,width:r*.12});
  socket.ellipse(0,0,r*.69,r*.54).fill(0x131a1c).stroke({color:0x7a725e,width:r*.09});
  for(let j=0;j<8;j++){const t=j*Math.PI/4;socket.circle(Math.cos(t)*r*.86,Math.sin(t)*r*.69,r*.071).fill(0xb9aa88)}
  body.parent.addChild(socket,arm);rig={a,body,arm,socket};syncArm();
 }
 function syncArm(){
  const {body:b,arm:a,socket:o}=rig,jx=(a.anchor.x-b.anchor.x)*pieces.w*b.scale.x,jy=(a.anchor.y-b.anchor.y)*pieces.h*b.scale.y;
  const cs=Math.cos(b.rotation),sn=Math.sin(b.rotation);a.position.set(b.x+jx*cs-jy*sn,b.y+jx*sn+jy*cs);a.scale.copyFrom(b.scale);
  a.rotation=b.rotation+(vals.arm==='bound'?.11:.045+.055*Math.sin(time*2));a.tint=b.tint;a.alpha=b.alpha;
  a.visible=vals.arm==='armed'||vals.arm==='bound';
  o.visible=!a.visible;o.position.copyFrom(a.position);o.scale.copyFrom(b.scale);o.rotation=b.rotation-.2;o.alpha=b.alpha;
 }
 function yardArt(){
  if(!rig)return;
  syncArm();const {a,arm,body}=rig,size=combatHeight(a),active=a.root.visible&&a.hp>0;
  if(active){
   const joint=localUV(arm,.349,.278),fist=localUV(arm,.19,.52),core=localUV(body,.54,.375);
   if(vals.arm==='armed'){
    targetRing(fist,size*.16,RED);mark('focus','오른팔 예고',{x:fist.x,y:fist.y-size*.24},'#ffb597');
    const defender=allies[Math.max(0,payload.battleV2.teams.A.cards.findIndex(card=>card.type==='DEFENSE'))];floor.ellipse(defender.baseX,defender.baseY,size*.38,size*.084).fill({color:RED,alpha:.12}).stroke({color:RED,width:size*.009,alpha:.68});
   }else if(vals.arm==='bound'){
    const a1=point(.48,.795),a2=point(.56,.85);
    for(const base of [a1,a2]){line(fx,[base,joint],0x163a38,size*.024,.83);line(fx,[base,joint],TEAL,size*.008,.95)}
    targetRing(joint,size*.11,TEAL);mark('focus','관절 고정',{x:joint.x-size*.04,y:joint.y-size*.17},'#a5efde');
   }else{
    targetRing(core,size*.115,GOLD);mark('focus','동력핵 노출',{x:core.x+size*.03,y:core.y-size*.21},'#ffd297');
   }
  }
  if(armItem&&!motion?.flight){
   const pt=point(.469,.846),radius=size*.24;
   floor.ellipse(pt.x,pt.y+size*.15,radius,radius*.25).stroke({color:TEAL,width:Math.max(1,radius*.042),alpha:.9});
   mark('part','유압 프레임',{x:pt.x,y:pt.y+size*.27},'#94ead4');
  }
  if(motion?.kind==='bind'||motion?.kind==='extract'){
   const t=motion.t,j=localUV(body,.35,.30);if(t<.7&&allies[motion.card])line(fx,[anchor(allies[motion.card]),j],TEAL,size*.009,Math.sin(Math.PI*t));
  }
 }
 function convoyArt(){
  const s=unit(),v={x:vehicle.x,y:vehicle.y-vehicle.height*.39},rearHatch={x:v.x-vehicle.width*.28,y:v.y-vehicle.height*.13};
  bg.x=whole.x+whole.w*.5+Math.sin(cameraMove*.35)*whole.w*.009;
  floor.ellipse(vehicle.x,vehicle.y+vehicle.height*.03,vehicle.width*.46,vehicle.height*.105).fill({color:0x0c1116,alpha:.30});
  for(let l=0;l<3;l++){const mid=point(laneX[l],.951),n=vals.slots.filter(x=>x===l).length;
   line(floor,[point(laneX[l]-.087,.944),point(laneX[l]+.087,.944)],0x91b4a6,s*.002,.58);
   mark('lane'+l,laneNames[l]+' '+n,mid,'#c8d9d2','lane');
  }
  const road=point(.725,.584),threat=point(.215,.447);
  obstruction.visible=showRoad;
  if(showRoad){
   const t=motion?.road?motion.t:0,f=ease(Math.min(1,t/.71)),w=vehicle.width*.53;
   obstruction.width=w;obstruction.scale.y=obstruction.scale.x;
   obstruction.position.set(mix(road.x,v.x+vehicle.width*.39,f),mix(road.y,v.y+vehicle.height*.10,f)-Math.sin(Math.PI*f)*vehicle.height*.16);
   obstruction.angle=-15*f;obstruction.alpha=Math.max(0,1-Math.max(0,t-.68)*4.5);
   floor.ellipse(road.x,road.y,w*.48,w*.09).stroke({color:RED,width:s*.003,alpha:.8});
   if(!t)mark('road','선두 · 낙하 잔해',{x:road.x,y:road.y-w*.5},'#ffb69b');
   if(t>.52)burst({x:obstruction.x,y:obstruction.y},(t-.52)/.48,GOLD);
  }
  drones.forEach((dr,i)=>{
   dr.visible=showDrones;if(!dr.visible)return;
   const t=motion?.kind==='raid'?motion.t:0,fly=Math.sin(Math.PI*t),base={x:threat.x+i*vehicle.width*.24,y:threat.y+i*vehicle.height*.20};
   dr.texture=droneFrames[t?2:1+i];dr.width=vehicle.width*.30;dr.scale.y=dr.scale.x;
   dr.position.set(mix(base.x,rearHatch.x-vehicle.width*.17,fly*.8),mix(base.y,rearHatch.y,fly*.75)+Math.sin(time*3+i)*s*.006);
   if(t>.3&&t<.75)line(fx,[anchor(allies[Math.max(0,payload.battleV2.teams.A.cards.findIndex(card=>card.type==='SPEED'))]),{x:dr.x,y:dr.y}],TEAL,s*.004,.82);
  });
  if(showDrones)mark('drone','후미 · 습격 드론',{x:threat.x,y:threat.y-vehicle.height*.33},'#ffb69b');
  if(showShield)fx.ellipse(v.x,v.y,vehicle.width*.54,vehicle.height*.55).fill({color:TEAL,alpha:.07}).stroke({color:TEAL,width:s*.004,alpha:.8});
  if(motion?.kind==='raid'&&motion.t>.4)burst({x:drones[0].x,y:drones[0].y},(motion.t-.4)/.6,TEAL);
  if(motion?.kind==='move'){
   const a=point(...motion.from),b=point(...motion.to);
   line(floor,[a,b],TEAL,s*.004,.85*(1-motion.t));targetRing(b,combatHeight(allies[motion.card])*.22,TEAL);
  }
 }
 function draw(){
  if(disposed||!box)return;
  const now=performance.now(),dt=Math.min(.07,(now-lastTime)/1000);lastTime=now;time+=dt;
  if(!yard&&!vals.done)cameraMove+=dt;
  for(const el of tags.values())el.hidden=true;
  floor.clear();fx.clear();if(yard)yardArt();else convoyArt();
 }
 const observer=new ResizeObserver(()=>{needsLayout=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!disposed&&!motion&&needsLayout)layout()}))});
 observer.observe(host);observer.observe(document.getElementById('dock'));layout();e.app.ticker.add(draw);
 function finish(){motion=null;if(needsLayout)layout();hideHud();draw()}
 async function play(step){
  signal.throwIfAborted();
  const {kind}=step;vals=step.state;
  motion={kind,t:0,card:step.card??-1};
  if(kind==='native'){
   const evt=step.event,road=evt.type==='ESCORT_OBJECTIVE_ATTACK'&&vals.strikes===1;
   motion.road=road;
   // The timeline has already advanced to this event. The live engine's chip
   // clock is relative to the beginning of its input batch.
   const chip=evt.type==='SKILL_CHIP_HIT'||evt.type==='SKILL_CHIP_CAST';
   const beat=evt.combatClock?{...evt,combatAtMs:0,combatGroupDurationMs:0}:evt;
   const animation=e.playEvents([beat],{sequential:true,timedInternal:!chip});
   if(road){await Promise.all([animation,waitMotion(830,signal,t=>{motion.t=t})]);showRoad=false}
   else await animation;
   e.settlePendingTails?.(e.characters);
   if(evt.type==='ENEMY_SPAWN'&&evt.targetId===bossId)attachRig();
   if(evt.type==='ESCORT_OBJECTIVE_ATTACK')showShield=false;
   if(evt.type==='RESULT')e.syncFinalState?.(payload.battleV2.result.final);
  }else if(kind==='move'){
   const before=convoySpots(step.previous),after=convoySpots(vals.slots);motion.from=before[step.card];motion.to=after[step.card];
   allies[step.card].setState('MOVE');
   await waitMotion(870,signal,t=>{motion.t=t;allies.forEach((a,i)=>{const v=point(mix(before[i][0],after[i][0],ease(t)),mix(before[i][1],after[i][1],ease(t)));a.root.position.set(v.x,v.y)})});
   allies[step.card].setState('IDLE');layout();
  }else if(kind==='extract'&&rig){
   const axis=armAxes(.21,.52);motion.flight=true;
   armItem=new Sprite(pieces.arm);armItem.anchor.set(.21,.52);above.addChild(armItem);
   armItem.scale.set(axis.sx,axis.sy);syncArm();
   const dest=point(.469,.846);await waitMotion(1160,signal,t=>{motion.t=t;const f=ease(t);armItem.position.set(mix(axis.v.x,dest.x,f),mix(axis.v.y,dest.y,f)-Math.sin(t*Math.PI)*unit()*.13);armItem.rotation=mix(axis.rotation,-.43,f)});
   placeItem();
  }else if(kind==='arrival'){
   const from=vehicle.x,to=point(.568,.66).x;arrived=true;await waitMotion(1000,signal,t=>{motion.t=t;vehicle.x=mix(from,to,ease(t))});
  }else{
   if(kind==='roadWarning')showRoad=true;if(kind==='raidWarning')showDrones=true;if(kind==='shield')showShield=true;
   await waitMotion(({intro:1000,armWarning:1050,bind:920,roadWarning:900,raidWarning:850,raid:1080,shield:600,settle:260})[kind]||370,signal,t=>{motion.t=t});
   if(kind==='raid')showDrones=false;
  }
  finish();
 }
 function dispose(){if(disposed)return;disposed=true;observer.disconnect();e.app.ticker.remove(draw);labelHost.replaceChildren();api.destroy();
  for(const tex of [pieces?.body,pieces?.arm,obstruction?.texture]){if(tex&&!tex.destroyed)tex.destroy(true)}}
 signal.addEventListener('abort',dispose,{once:true});
 return {engine:e,play,dispose,get arm(){return vals.arm},get motion(){return motion?.kind||''}};
}
