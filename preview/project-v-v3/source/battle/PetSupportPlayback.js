import {Assets,Container,Graphics,Sprite,Text,Texture,Rectangle} from 'pixi.js';
import {petBuffVisual} from '../../../../shared/pet-buff-visuals-v1.mjs';
import {petSupportPosition} from './PetSupportLayout.mjs';
import {PetSupportHud} from './PetSupportHud.js';
import {petEffectRows,petSupportKey,petOpeningMatches,skippedPetOpenings} from './PetSupportPresentation.mjs';
import {playPetOpeningFX} from './PetOpeningFX.js';

export function disposePetSupport(engine){
  if(engine.petSupportTick)engine.app?.ticker?.remove(engine.petSupportTick);
  engine.petSupportHud?.destroy();engine.petSupportHud=null;
  for(const row of engine.petSupports?.values()||[]){row.fxCleanup?.();row.root.destroy({children:true});for(const frames of row.frames.values())for(const frame of frames)frame.destroy(false);}
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
    const color=petEffectRows(pet.buffs)[0]?.tint||0xc4f588;
    const root=new Container({label:'PET_SUPPORT_'+key}),halo=new Graphics().ellipse(0,0,48,15).fill({color,alpha:.16}).ellipse(0,0,41,11).stroke({color,width:1.5,alpha:.65});
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
  if(rows.size){
    engine.petSupportHud=new PetSupportHud(engine);
    for(const {key,side,ownerId} of entries){
      const row=rows.get(key);if(!row)continue;
      const owner=teams[side]?.members?.find(member=>Number(member.ownerId)===Number(ownerId));
      engine.petSupportHud.add(key,row,owner?.ownerName);
    }
    engine.petSupportHud.visible(engine.visible!==false);
  }
  engine.petSupportTick=()=>{
    const matrix=engine.effectLayer.worldTransform,box=engine.app.canvas.getBoundingClientRect(),scale=Math.max(.1,Math.hypot(matrix.a,matrix.b)*box.width/engine.app.screen.width);
    for(const row of rows.values()){
      const {side,ownerId}=row,actors=(side==='A'?engine.allies:engine.enemies)||[],points=actors.filter(a=>a.root&&a.battleActive!==false&&Number.isFinite(a.baseX)&&(!ownerId||Number(a.ownerId)===ownerId));if(!points.length)continue;
      const feet=points.map(a=>engine.effectLayer.toLocal(a.root.parent.toGlobal({x:a.baseX,y:a.baseY})));
      const width=engine.scene?.width||1280,height=engine.scene?.height||720;
      const size=Math.max(126,56/scale);
      row.name.style.fontSize=Math.max(15,11/scale);
      if(row.badge){row.badge.style.fontSize=Math.max(13,10/scale);row.badge.y=9+row.name.style.fontSize*1.4;}
      const pvp=String(payload.battleV2?.mode||payload.mode||engine.activeBattlefieldMode).toUpperCase()==='PVP',unit=engine.accountBattleUnit;
      let suit=null;
      if(!pvp&&side==='A'&&unit?.active&&unit.root.parent&&[...rows.values()].filter(r=>r.side==='A').length===1){
        const base={x:unit.root.baseX,y:unit.root.baseY},p=engine.effectLayer.toLocal(unit.root.parent.toGlobal(base));
        const edge=engine.effectLayer.toLocal(unit.root.parent.toGlobal({x:base.x+(unit.bodySprite.width||120)*(unit.root.restScale||1)/2,y:base.y}));
        suit={x:p.x,y:p.y,halfWidth:Math.abs(edge.x-p.x)};
      }
      const position=petSupportPosition({points:feet,side,pvp,suit,width,height,scale,size});
      row.sprite.scale.set(position.size/Math.max(row.sprite.texture.width,row.sprite.texture.height));row.halo.scale.set(position.size/126);
      const labelMargin=row.name.width/2+8/scale;
      row.root.position.set(Math.max(labelMargin,Math.min(width-labelMargin,position.x)),position.y);
      row.root.visible=engine.visible!==false;
    }
  };
  engine.app.ticker.add(engine.petSupportTick,null,-25);engine.petSupportTick();
}
export function playPetOpening(engine,event,{restored=false}={}){
  const single=engine.petSupports?.get(event.actorSide);
  const key=petSupportKey(event.actorSide,event.ownerId);
  const row=engine.petSupports?.get(key)||(Number(single?.snapshot.ownerId)===Number(event.ownerId)?single:null);
  if(!petOpeningMatches(row,event))return false;
  row.applied=true;row.restored=restored;
  engine.petSupportHud?.apply(row===single?event.actorSide:key,event,{restored});
  // A late cooperative entry already holds the latest server HP/shield. Only
  // restore its activation record; replaying opening values could refill it.
  if(restored)return true;
  for(const hit of event.hits||[]){
    const target=engine.combatantById(hit.targetId);if(!target)continue;
    // The server's opening snapshot already contains the stats. This only
    // reconciles the health/shield display and never computes a second buff.
    if(Number.isFinite(hit.after?.maxHp))target.serverMaxHp=hit.after.maxHp;
    if(Number.isFinite(hit.after?.shield))engine.syncTargetShield(target,hit.after.shield,Math.max(target.serverMaxShield||0,hit.after.shield));
  }
  playPetOpeningFX(engine,row,event);return true;
}
export function restorePetSupport(engine,beforeMs){
  const events=skippedPetOpenings(engine.battleData?.battleV2?.result?.timeline||[],beforeMs);
  return events.reduce((count,event)=>count+Number(playPetOpening(engine,event,{restored:true})),0);
}
