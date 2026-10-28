import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {ICON_EXPANSION_ART} from '../../../../shared/icon-expansion-art-v1.mjs';
import {liveExpansionIcon} from '../../../../shared/icon-expansion-v1.mjs';

// Reuse the four authored sixteen-frame atlases, without changing combat events.
const cache=new Map(),owners=new WeakMap();
function state(engine){let s=owners.get(engine);if(!s){s={active:true,loads:new Map()};owners.set(engine,s);}return s;}
async function load(engine,id){
 const art=ICON_EXPANSION_ART[id];if(!art)return null;
 const owner=state(engine);if(!owner.active||engine.disposed)return null;
 if(!owner.loads.has(id)){
  let item=cache.get(id);
  if(!item){item={refs:0,promise:Promise.all([Assets.load(art.effect),art.weapon?Assets.load(art.weapon.url):null]).then(([atlas,weapon])=>({weapon,frames:Array.from({length:16},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%4*art.cellSize,Math.floor(i/4)*art.cellSize,art.cellSize,art.cellSize)}))}))};cache.set(id,item);}
  item.refs++;owner.loads.set(id,item.promise);
 }
 return owner.loads.get(id);
}
export async function preloadIconExpansionPlayback(engine){
 await Promise.all((engine.characters||[]).filter(c=>ICON_EXPANSION_ART[c.cardId]).map(c=>load(engine,c.cardId)));
}
export function configureIconExpansionSprite(actor,art){
 const spec=ICON_EXPANSION_ART[actor.cardId];if(!spec)return;
 actor.fullBodySprite.anchor.set(spec.footAnchor.x,spec.footAnchor.y);
 actor.captureNeutralAvatarPose();
}
export function disposeIconExpansionPlayback(engine){
 const owner=owners.get(engine);if(!owner||!owner.active)return;owner.active=false;
 for(const id of owner.loads.keys()){
  const item=cache.get(id);if(!item||--item.refs>0)continue;
  item.promise.then(({frames})=>{if(item.refs>0)return;frames.forEach(f=>f.destroy(false));cache.delete(id);const art=ICON_EXPANSION_ART[id];void Assets.unload(art.effect);if(art.weapon)void Assets.unload(art.weapon.url);}).catch(()=>cache.delete(id));
 }
 owner.loads.clear();
}
const center=(engine,actor)=>engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*.5}));
export async function playIconExpansionRaster(engine,event){
 const actor=engine.combatantById(event.actorId);
 const source=actor?.iconWeapon?engine.combatantById(actor.iconWeaponOwner):actor;
 const spec=liveExpansionIcon(source?.cardId);if(!spec)return false;
 const summon=event.type==='ICON_SUMMON',shot=actor?.iconWeapon&&['TURN','ATTACK'].includes(event.type);
 if(!summon&&!shot&&!(event.type==='ICON_TECHNIQUE'&&['CAST','REVIVE'].includes(event.phase)&&spec.techniqueCode!=='AUTONOMOUS_WEAPON'))return false;
 const epoch=engine.playbackEpoch,data=await load(engine,source.cardId);
 if(!data||engine.disposed||!state(engine).active||epoch!==engine.playbackEpoch)return false;
 const target=engine.combatantById(event.targetId)||source;
 const layer=new Container({label:'ICON_EXPANSION_RASTER:'+spec.code}),sprite=new Sprite(data.frames[0]);sprite.anchor.set(.5);layer.addChild(sprite);engine.effectLayer.addChild(layer);
 const cursor={t:0},duration=shot?.42:summon?.72:.9,p=center(engine,shot?actor:source),q=center(engine,target);
 engine.iconExpansionMetrics??={casts:0,shots:0,summons:0,frames:0};engine.iconExpansionMetrics[shot?'shots':summon?'summons':'casts']++;
 const framesSeen=new Set();
 await engine.timeline(t=>t.to(cursor,{t:1,duration,ease:'none',onUpdate(){
  if(layer.destroyed)return;
  const first=shot?8:0,count=shot||summon?8:16,index=first+Math.min(count-1,Math.floor(cursor.t*count));
  sprite.texture=data.frames[index];framesSeen.add(index);sprite.visible=cursor.t<1;
  if(spec.techniqueCode==='CROWN_USURP'){sprite.position.set(q.x+(p.x-q.x)*cursor.t,q.y+(p.y-q.y)*cursor.t-Math.sin(cursor.t*Math.PI)*60);}
  else if(shot){const progress=Math.min(1,cursor.t/.4);sprite.position.set(p.x+(q.x-p.x)*progress,p.y+(q.y-p.y)*progress);}
  else sprite.position.set(q.x,q.y);
  sprite.width=sprite.height=shot?210:300;
 }}),()=>{engine.iconExpansionMetrics.frames+=framesSeen.size;layer.destroy({children:true,texture:false,textureSource:false});},null,{releaseAt:duration,owners:[source,target]});
 return true;
}
