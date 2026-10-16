import fs from 'node:fs';
import {createRoom,joinRoom,startRoom,advanceRoom,commandRoom} from '../../../preview/coop-defense-v1/source/defense-model.mjs';
import {growthTier} from '../../../shared/monster-defense-growth-v2.mjs';
const rows=[];
for(const capacity of [2,3])for(const seed of [17,531,977])for(const strategy of ['focus','healer']){
 const room=createRoom({id:'TEAM',capacity,difficulty:'CATACLYSM',seed});
 for(let i=0;i<capacity;i++){const p=joinRoom(room,{id:'p'+i,name:'team'+i,loadout:{mercenaries:strategy==='healer'&&i===capacity-1?['V-003','V-004']:['V-003','V-002'],card:'FAKER'}});p.ready=true;}
 startRoom(room,'p0');
 const send=(u,c)=>{try{commandRoom(room,typeof u==='string'?u:u.ownerId,c);}catch{}};
 while(['PREP','WAVE'].includes(room.phase)&&room.time<1500000){
  if(room.phase==='PREP')for(const p of room.players){
   const g=p.growth,offer=g.offers.find(o=>!o.selected);if(offer){const priorities=strategy==='healer'?['MEDIC_CORE','EXECUTE','BULWARK','PIERCE','RECOVERY','QUICK','ALLIANCE','BARRICADE']:['EXECUTE','BULWARK','PIERCE','QUICK','RECOVERY','ALLIANCE','MEDIC_CORE','BARRICADE'];const traitId=priorities.find(id=>offer.choices.includes(id));send(p.id,{type:'TRAIT',wave:room.wave,offerId:offer.id,traitId});}
   const branch=['ATTACK','VITAL','TACTIC'].filter(id=>g.levels[id]<10).sort((a,b)=>(g.levels[a]+(a==='ATTACK'?0:a==='VITAL'?2:3))-(g.levels[b]+(b==='ATTACK'?0:b==='VITAL'?2:3)))[0],tier=branch&&growthTier(room.growthPolicy,g.levels[branch]+1);
   if(tier&&p.credits>=tier.cost)send(p.id,{type:'FORGE',wave:room.wave,branch,expectedAttempt:g.attemptSeq});else send(p.id,{type:'READY_WAVE',wave:room.wave,ready:true});
   for(const u of room.units.filter(u=>u.ownerId===p.id&&u.lane!==u.ownerLane))send(u,{type:'MOVE',unitId:u.id,lane:u.ownerLane});
  }
  if(room.phase==='WAVE'){
   const boss=room.enemies.find(e=>e.hp>0&&e.type==='BOSS');
   for(const u of room.units.filter(u=>u.hp>0&&!u.move).sort((a,b)=>(a.role==='GUARD'?-1:1)-(b.role==='GUARD'?-1:1))){
    const near=room.enemies.filter(e=>e.hp>0&&e.lane===u.lane),friends=room.units.filter(f=>f.hp>0&&!f.move&&f.lane===u.lane),warning=room.enemies.find(e=>e.cast?.lane===u.lane&&e.cast.endsAt-room.time<2200);
    const protectedLane=friends.every(f=>f.shieldUntil>room.time+2500);
    if(u.role==='GUARD'){if(!protectedLane&&(warning||near.some(e=>Math.hypot(e.x-u.x,e.y-u.y)<200)))send(u,{type:'SKILL',unitId:u.id});}
    else if(u.role==='CAPTAIN'){if(near.some(e=>e.x<2100)||friends.some(f=>f.hp<f.maxHp*.85))send(u,{type:'SKILL',unitId:u.id});}
    else send(u,{type:'SKILL',unitId:u.id});
    if(boss&&u.lane!==boss.lane&&u.slot>0&&near.length===0)send(u,{type:'MOVE',unitId:u.id,lane:boss.lane});
    if(warning&&u.shieldUntil<=warning.cast.endsAt&&u.moveReadyAt<=room.time)send(u,{type:'MOVE',unitId:u.id,lane:(u.lane+1)%capacity});
   }
  }
  advanceRoom(room,500);
 }
 rows.push({capacity,seed,strategy,result:room.phase,wave:room.wave,minutes:+(room.time/60000).toFixed(2),core:room.coreHp,wipes:room.players.reduce((n,p)=>n+p.wipeCount,0)});
}
fs.writeFileSync(new URL('./coordinated.json',import.meta.url),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
