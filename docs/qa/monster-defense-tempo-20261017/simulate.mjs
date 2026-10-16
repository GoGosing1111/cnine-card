import fs from 'node:fs';
import {createRoom,joinRoom,startRoom,advanceRoom,commandRoom} from '../../../preview/coop-defense-v1/source/defense-model.mjs';
const rows=[];
for(const capacity of [2,3]) for(const difficulty of ['GUIDE','NORMAL','HARD','NIGHTMARE','CATACLYSM']) for(const seed of [17,531,977]) for(const strategy of ['previous','active','passive']){
 const room=createRoom({id:'SIM',capacity,difficulty,seed});
 if(strategy==='previous')delete room.tempoRevision;
 for(let i=0;i<capacity;i++){const p=joinRoom(room,{id:'p'+i,name:'test'+i,bot:strategy!=='passive'});p.ready=true;}
 startRoom(room,'p0');
 let lastSeq=0,casts=0,prep=0,combat=0;
 while(['PREP','WAVE'].includes(room.phase)&&room.time<2400000){
  if(room.phase==='PREP')prep+=1000;else combat+=1000;
  advanceRoom(room,1000);
  casts+=room.events.filter(e=>e.seq>lastSeq&&e.type==='BOSS_CAST').length;lastSeq=room.seq;
 }
 rows.push({capacity,difficulty,seed,strategy,result:room.phase,wave:room.wave,seconds:room.time/1000,prep:prep/1000,combat:combat/1000,core:room.coreHp,wipes:room.players.reduce((n,p)=>n+p.wipeCount,0),casts});
}
fs.writeFileSync(new URL('./simulation.json',import.meta.url),JSON.stringify(rows,null,2));
for(const strategy of ['previous','active','passive'])for(const difficulty of ['GUIDE','NORMAL','HARD','NIGHTMARE','CATACLYSM']){
 const group=rows.filter(r=>r.strategy===strategy&&r.difficulty===difficulty);
 console.log(JSON.stringify({strategy,difficulty,wins:group.filter(r=>r.result==='VICTORY').length,total:group.length,minutes:[Math.min(...group.map(r=>r.seconds))/60,Math.max(...group.map(r=>r.seconds))/60].map(n=>+n.toFixed(1)),core:group.map(r=>r.core),wipes:group.map(r=>r.wipes),casts:group.map(r=>r.casts)}));
}
