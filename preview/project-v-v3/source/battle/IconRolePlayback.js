import {Assets,Container,Graphics,Sprite,Texture,Rectangle} from 'pixi.js';
import {ICON_ROLE_VISUALS,iconMuzzle,iconEventReleaseSeconds} from '../../../../shared/icon-role-visuals-v1.mjs';
import {iconDefinition} from '../../../../shared/icon-roles-v1.mjs';
import {configureDamageText} from './ObjectPool.js';

const cache=new Map(),owners=new WeakMap(),popups=new WeakMap();
function owner(engine){let s=owners.get(engine);if(!s){s={active:true,loads:new Map()};owners.set(engine,s);}return s;}
function acquire(id){
 let item=cache.get(id);if(!item){
  const url=`/preview/icon-battle-assets-v1/assets/fx/${id}/atlas-v1.webp`;
  item={refs:0,url,promise:Assets.load(url).then(t=>Array.from({length:16},(_,i)=>new Texture({source:t.source,frame:new Rectangle(i%4*384,Math.floor(i/4)*384,384,384)})))};cache.set(id,item);
 }item.refs++;return item.promise;
}
function release(id){const item=cache.get(id);if(!item)return;if(--item.refs>0)return;item.promise.then(frames=>{if(item.refs>0)return;frames.forEach(t=>t.destroy(false));cache.delete(id);void Assets.unload(item.url);}).catch(()=>cache.delete(id));}
function load(engine,id){const s=owner(engine);if(!s.active||engine.disposed)return Promise.resolve(null);if(!s.loads.has(id))s.loads.set(id,acquire(id).catch(e=>{if(s.loads.delete(id))release(id);throw e;}));return s.loads.get(id);}
export function disposeIconPlayback(engine){const s=owners.get(engine);if(!s||!s.active)return;s.active=false;for(const id of s.loads.keys())release(id);s.loads.clear();}
export function preloadIconPlayback(engine){for(const actor of engine.characters||[]){const spec=ICON_ROLE_VISUALS[actor.cardId];if(spec)for(const kind of ['hit','skill'])void load(engine,`${spec.id}-${kind}`).catch(()=>{});}}
const point=(engine,actor)=>engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*.53}));
const foot=(engine,actor)=>engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:0}));
function showDamage(engine,target,row){
 popups.get(target)?.cancel();
 const healing=Number(row.amount||0)>0;
 const label=engine.pools.damage.acquire(),amount=healing?Math.round(row.amount):Number(row.popupDamage??(Number(row.damage||0)+Number(row.absorbed||0)));
 configureDamageText(label,{kind:healing?'HP':'ATTACK',damage:amount,critical:!!row.critical,compact:engine.mobile});
 label.numberLabel.tint=label.numberGlow.tint=healing?0x75ffbd:0xffffff;
 if(healing)label.numberLabel.text=label.numberGlow.text=`+${amount.toLocaleString()}`;
 label.roleTag.text=healing?'HEAL':row.dodge?'DODGE':row.hit>1?row.hit+' HIT':'';
 const p=engine.uiLayer.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*.82})),scale=.56;
 const margin=Math.max(74,label.getLocalBounds().width*scale*.55);
 label.position.set(Math.max(margin,Math.min(engine.scene.width-margin,p.x)),Math.max(90,p.y));label.scale.set(scale);label.visible=true;engine.uiLayer.addChild(label);
 let animation;const entry={cancel(){animation?.kill();}};popups.set(target,entry);
 void engine.timeline(t=>{animation=t;t.fromTo(label,{alpha:0},{alpha:1,duration:.07},0);t.to(label,{y:label.y-26,duration:.38,ease:'power1.out'},0);t.to(label,{alpha:0,duration:.14},.24);},()=>{if(popups.get(target)===entry)popups.delete(target);label.numberLabel.tint=label.numberGlow.tint=0xffffff;engine.pools.damage.release(label);});
}
function sync(engine,row){const target=engine.combatantById(row.targetId);if(!target)return;
 if(Number.isFinite(row.targetHpPercent))engine.syncTargetHp(target,row.targetHpPercent);
 else if(Number.isFinite(row.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,row.targetHpAfter,row.targetMaxHp));
 if(Number.isFinite(row.targetShieldAfter))engine.syncTargetShield(target,row.targetShieldAfter,row.targetMaxShield);
 if(row.damage||row.absorbed||row.amount>0)showDamage(engine,target,row);
 if(row.amount>0)engine.queueBanner(`+${Math.round(row.amount).toLocaleString()} 회복`,0xaebcff,target.name);
}
function rune(g,role,x,y,size,color,t){
 g.clear();const pulse=.75+Math.sin(t*8)*.15,w=Math.max(1,size*.022);
 if(role==='DEFENSE'){
  g.moveTo(x,y-size*.7).lineTo(x+size*.43,y-size*.45).lineTo(x+size*.35,y+size*.12).lineTo(x,y+size*.47).lineTo(x-size*.35,y+size*.12).lineTo(x-size*.43,y-size*.45).closePath().fill({color,alpha:.1}).stroke({color,width:w,alpha:pulse});
  g.moveTo(x-size*.2,y-size*.18).lineTo(x,y+size*.04).lineTo(x+size*.23,y-size*.3).stroke({color,width:w*1.6});
 }else if(role==='CURSE'){
  for(let i=0;i<6;i++){const a=i*Math.PI/3+t*.2;g.ellipse(x+Math.cos(a)*size*.19,y+Math.sin(a)*size*.19,size*.17,size*.08).stroke({color,width:w,alpha:.8});}
  g.circle(x,y,size*.32).stroke({color,width:w,alpha:.6});
 }else if(role==='ASSASSIN'){
  for(const n of [-1,1])g.moveTo(x+n*size*.35,y-size*.32).lineTo(x+n*size*.35,y-size*.1).moveTo(x+n*size*.35,y+size*.32).lineTo(x+n*size*.35,y+size*.1).stroke({color,width:w*1.5});
  g.moveTo(x-size*.18,y-size*.22).lineTo(x+size*.18,y+size*.22).moveTo(x+size*.18,y-size*.22).lineTo(x-size*.18,y+size*.22).stroke({color,width:w});
 }else{
  for(let i=0;i<3;i++){const r=size*(.25+i*.13);g.ellipse(x,y,r,r*.32).stroke({color,width:w,alpha:(.8-i*.18)*pulse});}
  if(role==='MAGIC')for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.25;g.moveTo(x+Math.cos(a)*size*.32,y+Math.sin(a)*size*.105).lineTo(x+Math.cos(a)*size*.42,y+Math.sin(a)*size*.14).stroke({color,width:w});}
 }
}

// Replay only server snapshots. No local damage, targeting, timers or RNG.
export async function playIconEvent(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId),def=iconDefinition(event.iconCode)||iconDefinition(actor?.cardId),type=event.type;
 if(type!=='ICON_SKILL'){
  sync(engine,event);if(!target||!engine.visible)return true;
  const role=event.status==='MARK'?'ASSASSIN':event.status==='CURSE'?'CURSE':event.status==='WARD'?'DEFENSE':def?.role||'SUPPORT';
  if(['EXPIRED','CLEANSED','WARD_END'].includes(event.status))return true;
  // Heat uses the compact announcement lane, never a full-screen cut-in.
  if(event.status==='HEAT'){engine.queueBanner(`집중 포화 ${event.stacks}`,0xffae60,actor?.name||'ICON');return true;}
  const layer=new Container({label:'ICON_ROLE_STATUS'}),g=new Graphics();layer.addChild(g);engine.effectLayer.addChild(layer);
  const time={t:0},p=role==='MAGIC'||role==='SUPPORT'?foot(engine,target):point(engine,target),size=target.fullBodyHeight*.48,color=parseInt((def?.color||'#c8edff').slice(1),16);
  if(type==='ICON_GUARD')engine.queueBanner('수호 맹약 · 피해 분담',color,actor?.name||'ICON');
  else if(event.status==='CHANNEL')engine.queueBanner('정령 집중',color,actor?.name||'ICON');
  else if(event.status==='SEAL_BLOCK')engine.queueBanner(event.label,color,actor?.name||'ICON');
  await engine.timeline(t=>{t.to(time,{t:.55,duration:.55,onUpdate(){if(layer.destroyed)return;rune(g,role,p.x,p.y,size,color,time.t);layer.alpha=Math.min(1,(.55-time.t)*5);},ease:'none'});},()=>layer.destroy({children:true}),null,{releaseAt:.14,owners:engine.formationCoop?[]:[target]});return true;
 }
 if(!actor||!def){for(const row of [...(event.hits||[]),...(event.targets||[])])sync(engine,row);return true;}
 const spec=ICON_ROLE_VISUALS[actor.cardId],epoch=engine.playbackEpoch;
 const valid=()=>engine.visible&&!engine.disposed&&!actor.root.destroyed&&epoch===engine.playbackEpoch;
 let frames=null;try{frames=await load(engine,`${spec.id}-${event.basic?'hit':'skill'}`);}catch(e){console.warn('[ICON FX] sequence unavailable',spec.id);}
 if(!valid())return false;
 const rows=[...(event.hits||[]),...(event.targets||[])],targets=[...new Set(rows.map(r=>engine.combatantById(r.targetId)).filter(Boolean))];
 engine.settlePendingTails?.([actor,...targets]);if(!event.basic)engine.queueBanner(def.skill,parseInt(def.color.slice(1),16),`${def.label} · ${actor.name}`);
 const layer=new Container({label:`ICON_${def.role}_SKILL`}),g=new Graphics(),tracer=new Graphics();layer.addChild(g,tracer);engine.effectLayer.addChild(layer);
 const color=parseInt(def.color.slice(1),16),time={t:0},duration=event.basic?Math.max(.65,spec.hitDuration):Math.min(1.5,spec.skillDuration),lastContact=.24+Math.max(0,rows.length-1)*.13;
 const impacts=rows.map((row,i)=>{const t=engine.combatantById(row.targetId),sprite=frames?new Sprite(frames[0]):null;if(sprite){sprite.anchor.set(.5);sprite.visible=false;layer.addChild(sprite);}return {row:{...row,popupDamage:rows.slice(0,i+1).filter(r=>r.targetId===row.targetId).reduce((n,r)=>n+Number(r.damage||0)+Number(r.absorbed||0),0)},target:t,sprite,at:.24+i*.13};});
 let applied=0;
 const render=()=>{
  if(layer.destroyed||!valid())return;
  const p=foot(engine,def.role==='SUPPORT'&&target?target:actor);
  if(!event.basic)rune(g,def.role,p.x,p.y,actor.fullBodyHeight*.50,color,time.t);g.alpha=Math.max(0,Math.min(.8,(duration-time.t)*3));
  tracer.clear();const muzzle=iconMuzzle(actor,engine.effectLayer);
  if(muzzle&&time.t<lastContact+.12){
   const bright=Math.max(0,Math.sin((time.t-.14)*Math.PI/.13));const m=muzzle.origin,d=muzzle.direction,length=actor.fullBodyHeight*.28;
   tracer.moveTo(m.x,m.y).lineTo(m.x+d.x*length,m.y+d.y*length).stroke({color:0xffd17b,width:3,alpha:bright});
   tracer.circle(m.x,m.y,5+bright*3).fill({color:0xffe8b4,alpha:bright*.8});
   engine.lastIconMuzzle={cardId:actor.cardId,origin:{...m},direction:{...d},team:actor.team};
  }
  for(const p of impacts){if(!p.sprite||!p.target)continue;const progress=(time.t-p.at+.12)/Math.max(.3,duration-.24);p.sprite.visible=progress>=0&&progress<1;if(!p.sprite.visible)continue;
   p.sprite.texture=frames[Math.min(15,Math.floor(progress*16))];const pos=point(engine,p.target),size=p.target.fullBodyHeight*(def.role==='MAGIC'?1.18:def.role==='SUPPORT'?.94:1.04);p.sprite.position.set(pos.x,pos.y);p.sprite.width=size;p.sprite.height=size;p.sprite.alpha=.88;
  }
 };
 const melee=['ASSASSIN','ASSAULT','DEFENSE'].includes(def.role)&&target;
 const distance=melee?Math.hypot(target.root.x-actor.baseX,target.root.y-actor.baseY):0,travel=Math.max(0,distance-100),ratio=travel/Math.max(1,distance);
 const strikePoint=melee?{x:actor.baseX+(target.root.x-actor.baseX)*ratio,y:actor.baseY+(target.root.y-actor.baseY)*ratio}:null;
 const finished=await engine.timeline(t=>{
  if(melee){actor.setState('MOVE');t.to(actor.root,{...strikePoint,duration:.21,ease:'power3.out'},0);t.call(()=>{if(valid())actor.setState('ATTACK');},[],.21);t.to(actor.root,{x:actor.baseX,y:actor.baseY,duration:.22,ease:'power2.inOut'},lastContact+.06);}
  else actor.setState('ATTACK');
  t.to(time,{t:duration,duration,ease:'none',onUpdate:render},0);
  impacts.forEach(p=>t.call(()=>{if(valid()){sync(engine,p.row);event.onImpact?.(p.target);applied++;}},[],p.at));
 },()=>{layer.destroy({children:true,texture:false,textureSource:false});if(!actor.root.destroyed){if(melee)actor.root.position.set(actor.baseX,actor.baseY);actor.setState(actor.hp<=0?'DEAD':'IDLE');}},null,{releaseAt:iconEventReleaseSeconds(event),owners:[actor,...targets]});
 engine.lastIconPlayback={code:def.code,role:def.role,eventType:type,serverRows:rows.length,appliedRows:applied,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY'};
 const metrics=engine.iconPlaybackMetrics||(engine.iconPlaybackMetrics={skills:0,basics:0,serverRows:0,appliedRows:0,roles:[]});
 if(finished){metrics[event.basic?'basics':'skills']++;metrics.serverRows+=rows.length;metrics.appliedRows+=applied;if(!event.basic&&!metrics.roles.includes(def.role))metrics.roles.push(def.role);}
 return finished&&valid();
}
export function playIconBasic(engine,actor,target,{damage,targetHp,targetShield,critical,onImpact}){
 const def=iconDefinition(actor.cardId);return playIconEvent(engine,{type:'ICON_SKILL',basic:true,actorId:actor.id,targetId:target.id,iconCode:def.code,iconRole:def.role,onImpact,hits:[{targetId:target.id,damage,critical,targetHpPercent:targetHp,targetShieldAfter:targetShield}]});
}
