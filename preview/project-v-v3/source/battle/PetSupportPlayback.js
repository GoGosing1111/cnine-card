import {Assets,Container,Graphics,Sprite,Text,Texture,Rectangle} from 'pixi.js';
import {petBuffVisual} from '../../../../shared/pet-buff-visuals-v1.mjs';

export function disposePetSupport(engine){
  if(engine.petSupportTick)engine.app?.ticker?.remove(engine.petSupportTick);
  for(const row of engine.petSupports?.values()||[]){row.root.destroy({children:true});for(const frames of row.frames.values())for(const frame of frames)frame.destroy(false);}
  engine.petSupports=new Map();engine.petSupportTick=null;
}
export async function preparePetSupport(engine,payload){
  disposePetSupport(engine);const rows=engine.petSupports,teams=payload?.battleV2?.teams;
  if(!engine.effectLayer||!teams)return;
  const entries=['A','B'].flatMap(side=>teams[side]?.pets?.map(snapshot=>({side,snapshot,ownerId:snapshot.ownerId,key:side+':'+snapshot.ownerId}))||[{side,snapshot:teams[side]?.pet,key:side}]);
  await Promise.all(entries.map(async ({side,snapshot,ownerId,key})=>{
    if(!snapshot?.definition)return;const pet=snapshot.definition;
    if(!/^\/?assets\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(pet.battleSprite)||pet.battleSprite.includes('..'))return;
    let texture;try{texture=await Assets.load('/'+pet.battleSprite.replace(/^\//,''));}catch(error){console.warn('[pet] portrait load failed',pet.code);return;}
    if(engine.disposed||engine.petSupports!==rows)return;
    const root=new Container({label:'PET_SUPPORT_'+side}),halo=new Graphics().ellipse(0,0,48,15).fill({color:0xc4f588,alpha:.16}).ellipse(0,0,41,11).stroke({color:0xc4f588,width:1.5,alpha:.65});
    const sprite=new Sprite(texture);sprite.anchor.set(.5,1);sprite.scale.set(126/Math.max(texture.width,texture.height));sprite.y=-3;
    const name=new Text({text:pet.name,style:{fontFamily:'Noto Sans KR, sans-serif',fontSize:15,fontWeight:'700',fill:0xf1ffe1,stroke:{color:0x081020,width:4}}});name.anchor.set(.5,0);name.y=9;
    root.addChild(halo,sprite,name);
    let badge=null;if(snapshot.magnet){badge=new Text({text:'자석',style:{fontFamily:'Noto Sans KR, sans-serif',fontSize:13,fontWeight:'700',fill:0xcbf687,stroke:{color:0x081020,width:4}}});badge.anchor.set(.5,0);badge.y=29;root.addChild(badge);}
    const row={root,sprite,halo,name,badge,snapshot,side,ownerId,frames:new Map(),applied:false};rows.set(key,row);engine.effectLayer.addChild(root);
    await Promise.all(pet.buffs.map(async buff=>{
      const visual=petBuffVisual(buff.type);if(!visual)return;
      try{const atlas=await Assets.load(visual.atlas);if(engine.petSupports!==rows||engine.disposed)return;
        const w=atlas.width/visual.columns,h=atlas.height/visual.rows;
        row.frames.set(buff.type,Array.from({length:visual.frames},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%visual.columns*w,Math.floor(i/visual.columns)*h,w,h)})));
      }catch{console.warn('[pet] buff effect load failed',buff.type);}
    }));
  }));
  if(engine.disposed||engine.petSupports!==rows)return;
  engine.petSupportTick=()=>{
    const matrix=engine.effectLayer.worldTransform,box=engine.app.canvas.getBoundingClientRect(),scale=Math.max(.1,Math.hypot(matrix.a,matrix.b)*box.width/engine.app.screen.width);
    for(const row of rows.values()){
      const {side,ownerId}=row,actors=(side==='A'?engine.allies:engine.enemies)||[],points=actors.filter(a=>a.root&&Number.isFinite(a.baseX)&&(!ownerId||Number(a.ownerId)===ownerId));if(!points.length)continue;
      const foot=side==='A'?points.reduce((a,b)=>a.baseX<b.baseX?a:b):points.reduce((a,b)=>a.baseX>b.baseX?a:b);
      const p=engine.effectLayer.toLocal(foot.root.parent.toGlobal({x:foot.baseX,y:Math.max(...points.map(a=>a.baseY))}));
      const width=engine.scene?.width||1280,height=engine.scene?.height||720;
      const margin=Math.max(70,38/scale),size=Math.max(126,56/scale);
      row.sprite.scale.set(size/Math.max(row.sprite.texture.width,row.sprite.texture.height));row.halo.scale.set(size/126);
      row.name.style.fontSize=Math.max(15,11/scale);
      if(row.badge){row.badge.style.fontSize=Math.max(13,10/scale);row.badge.y=9+row.name.style.fontSize*1.4;}
      const belowFormation=scale<.65?Math.max(68,size+12/scale):68;
      const x=scale<.65?width*(side==='A'?.36:.64):p.x+(side==='A'?-55:55);
      row.root.position.set(Math.max(margin,Math.min(width-margin,x)),Math.min(height-60/scale,p.y+belowFormation));
      row.root.visible=engine.visible!==false;
    }
  };
  engine.app.ticker.add(engine.petSupportTick,null,-25);engine.petSupportTick();
}
export function playPetOpening(engine,event){
  const single=engine.petSupports?.get(event.actorSide);
  const row=engine.petSupports?.get(event.ownerId?event.actorSide+':'+event.ownerId:event.actorSide)||(single?.snapshot.ownerId===event.ownerId?single:null);if(!row||row.applied)return;row.applied=true;
  const effects=[];
  for(const hit of event.hits||[]){
    const target=engine.combatantById(hit.targetId);if(!target)continue;
    // The server's opening snapshot already contains the stats. This only
    // reconciles the health/shield display and never computes a second buff.
    if(Number.isFinite(hit.after?.maxHp))target.serverMaxHp=hit.after.maxHp;
    if(Number.isFinite(hit.after?.shield))engine.syncTargetShield(target,hit.after.shield,Math.max(target.serverMaxShield||0,hit.after.shield));
    for(const buff of event.buffs||[]){const frames=row.frames.get(buff.type);if(!frames?.length)continue;
      const sprite=new Sprite(frames[0]);sprite.anchor.set(.5);sprite.width=sprite.height=135;
      sprite.position.copyFrom(engine.effectLayer.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*.4})));engine.effectLayer.addChild(sprite);effects.push({sprite,frames});
    }
  }
  const progress={frame:0};
  engine.queueBanner(`${event.name} · ${event.buffs.map(b=>`${petBuffVisual(b.type)?.label||'버프'} ${b.percent}%`).join(' · ')}`,0xc4f588,'펫 지원');
  void engine.timeline(t=>{
    t.fromTo(row.root,{alpha:0},{alpha:1,duration:.18},0);
    t.to(progress,{frame:7,duration:engine.reducedMotion ? .18 : 1.25,ease:'none',onUpdate:()=>{for(const effect of effects)if(!effect.sprite.destroyed)effect.sprite.texture=effect.frames[Math.min(7,Math.floor(progress.frame))];}},0);
  },()=>{for(const effect of effects)if(!effect.sprite.destroyed)effect.sprite.destroy();});
}
